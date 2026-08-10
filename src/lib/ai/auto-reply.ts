import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { AI_TOOLS_SCHEMA, executeAiTool } from './ai-tools'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { engineSendText } from '@/lib/flows/meta-send'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import {
  evaluatePreGenerationGuardrails,
  evaluatePostGenerationGuardrails,
} from './guardrails'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
}

async function applyHandoffUpdate(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
  update: Record<string, unknown>,
) {
  const fullUpdate = { ...update, needs_attention: true }
  const { error } = await db
    .from('conversations')
    .update(fullUpdate)
    .eq('id', conversationId)
  if (error && error.code === '42703') {
    await db.from('conversations').update(update).eq('id', conversationId)
  }
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config) {
      console.log('[ai auto-reply] early exit: no config loaded')
      return
    }
    if (!config.autoReplyEnabled) {
      console.log('[ai auto-reply] early exit: autoReplyEnabled is false')
      return
    }

    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1)
    if (autoResponders && autoResponders.length > 0) {
      console.log('[ai auto-reply] early exit: active automation responder exists')
      return
    }

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) {
      console.log('[ai auto-reply] early exit: conversation fetch error or missing', convErr)
      return
    }
    if (conv.assigned_agent_id) {
      console.log('[ai auto-reply] early exit: conversation has assigned_agent_id:', conv.assigned_agent_id)
      return
    }
    if (conv.ai_autoreply_disabled) {
      console.log('[ai auto-reply] early exit: ai_autoreply_disabled is true')
      return
    }
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) {
      console.log('[ai auto-reply] max replies reached:', conv.ai_reply_count, '>=', config.autoReplyMaxPerConversation)
      const summary = `🤖 Limite máximo de respostas automáticas de IA (${config.autoReplyMaxPerConversation}) atingido. Atendimento transferido para um humano.`
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await applyHandoffUpdate(db, conversationId, update)
      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'bot',
        content_type: 'text',
        content_text: summary,
        status: 'sent',
        is_internal: true,
        ai_generated: true,
      })
      return
    }

    const messages = await buildConversationContext(
      db,
      conversationId,
      config.config?.context_message_window,
    )
    if (messages.length === 0) {
      console.log('[ai auto-reply] early exit: buildConversationContext returned 0 text messages')
      return
    }

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages),
      config.config?.rag_top_k,
    )

    // Evaluate Pre-Generation Guardrails (operating hours, input regex, RAG minimum hits)
    const preCheck = evaluatePreGenerationGuardrails(
      config.config?.guardrails,
      latestUserMessage(messages),
      knowledge.length,
    )
    if (!preCheck.allowed) {
      console.log('[ai auto-reply] pre-generation guardrail blocked:', preCheck.reason)
      if (preCheck.handoff) {
        const summary = `Guardrail bloqueou o atendimento: ${preCheck.reason}`
        const update: Record<string, unknown> = {
          ai_autoreply_disabled: true,
          ai_handoff_summary: summary,
        }
        if (config.handoffAgentId && !conv.assigned_agent_id) {
          update.assigned_agent_id = config.handoffAgentId
        }
        await applyHandoffUpdate(db, conversationId, update)
        await db.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'bot',
          content_type: 'text',
          content_text: summary,
          status: 'sent',
          is_internal: true,
          ai_generated: true,
        })
      }
      return
    }

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    let replyText = ''
    let isHandoff = false
    let finalUsage = null
    let iterations = 0

    // ReAct loop: allow up to 3 tool call turns before forcing an exit.
    while (iterations < 3) {
      iterations++
      const { text, handoff, usage, tool_calls } = await generateReply({
        config,
        systemPrompt,
        messages,
        tools: AI_TOOLS_SCHEMA,
      })

      if (text) replyText = text
      if (handoff) isHandoff = true
      finalUsage = usage

      if (tool_calls && tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: text || '',
          tool_calls,
        })
        
        for (const tc of tool_calls) {
          let argsObj = {}
          try { argsObj = JSON.parse(tc.arguments) } catch (e) {}
          
          const resultStr = await executeAiTool(accountId, contactId, tc.name, argsObj)
          messages.push({
            role: 'tool',
            content: resultStr,
            tool_call_id: tc.id,
            name: tc.name,
          })
        }
      } else {
        break
      }
    }

    const postCheck = evaluatePostGenerationGuardrails(
      config.config?.guardrails,
      replyText,
    )
    if (!postCheck.allowed) {
      console.log('[ai auto-reply] post-generation guardrail blocked:', postCheck.reason)
      isHandoff = true
      replyText = ''
    }

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage: finalUsage,
    })

    if (isHandoff || !replyText) {
      if (replyText) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: replyText,
          aiGenerated: true,
        })
      }
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await applyHandoffUpdate(db, conversationId, update)

      // Create an internal note in the conversation explaining the handoff reason
      let { error: noteErr } = await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'bot',
        content_type: 'text',
        content_text: summary,
        status: 'sent',
        is_internal: true,
        ai_generated: true,
      })
      if (noteErr && noteErr.code === '42703') {
        const { error: fallbackErr } = await db.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'bot',
          content_type: 'text',
          content_text: summary,
          status: 'sent',
          ai_generated: true,
        })
        noteErr = fallbackErr
      }
      if (noteErr) {
        console.error('[ai auto-reply] error inserting handoff internal note:', noteErr)
      }
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return // lost the per-conversation cap race

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: replyText,
      aiGenerated: true,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}
