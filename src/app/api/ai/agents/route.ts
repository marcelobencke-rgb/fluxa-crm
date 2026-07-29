import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * GET /api/ai/agents
 *
 * List all AI agent versions for the account (V1, V2, backups).
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()

    const { data: rows, error } = await supabase
      .from('ai_configs')
      .select(
        'id, name, description, provider, model, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id, api_key, embeddings_api_key, config, updated_at',
      )
      .eq('account_id', accountId)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[ai/agents GET] error:', error)
      return NextResponse.json(
        { error: 'Falha ao carregar versões do Agente de IA' },
        { status: 500 },
      )
    }

    const agents = (rows || []).map((r) => {
      const { api_key, embeddings_api_key, ...safe } = r
      return {
        ...safe,
        name: r.name ?? 'Agente Principal (V1)',
        has_key: !!api_key,
        has_embeddings_key: !!embeddings_api_key,
      }
    })

    return NextResponse.json({ agents })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/ai/agents
 *
 * Duplicates an existing agent (backup/versioning) or creates a new empty draft version.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-agents:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const action = body.action || 'duplicate'
    const sourceId = body.source_id

    if (action === 'duplicate') {
      if (!sourceId || typeof sourceId !== 'string') {
        return bad('source_id is required to duplicate an agent')
      }

      const { data: source, error: srcErr } = await supabase
        .from('ai_configs')
        .select('*')
        .eq('id', sourceId)
        .eq('account_id', accountId)
        .maybeSingle()

      if (srcErr || !source) {
        return bad('Agente de origem não encontrado')
      }

      const newName =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : `${source.name ?? 'Agente V1'} (Cópia V2)`
      const newDesc =
        typeof body.description === 'string'
          ? body.description.trim()
          : source.description || 'Versão duplicada para testes ou backup'

      const { data: created, error: insErr } = await supabase
        .from('ai_configs')
        .insert({
          account_id: accountId,
          created_by: userId,
          name: newName,
          description: newDesc,
          provider: source.provider,
          model: source.model,
          api_key: source.api_key,
          embeddings_api_key: source.embeddings_api_key,
          system_prompt: source.system_prompt,
          is_active: false, // Clone always starts as draft / backup
          auto_reply_enabled: source.auto_reply_enabled,
          auto_reply_max_per_conversation: source.auto_reply_max_per_conversation,
          handoff_agent_id: source.handoff_agent_id,
          config: source.config,
        })
        .select(
          'id, name, description, provider, model, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id, updated_at',
        )
        .single()

      if (insErr || !created) {
        console.error('[ai/agents POST] insert error:', insErr)
        return NextResponse.json(
          { error: 'Falha ao criar nova versão do agente' },
          { status: 500 },
        )
      }

      return NextResponse.json({ success: true, agent: created })
    }

    return bad('Ação não suportada')
  } catch (err) {
    return toErrorResponse(err)
  }
}
