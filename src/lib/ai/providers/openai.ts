import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiResponse {
  choices?: { 
    message?: { 
      content?: string
      tool_calls?: {
        id: string
        function?: { name?: string; arguments?: string }
      }[]
    } 
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateOpenAi(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  let res: Response
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages).map(m => {
            // Strip undefined fields to keep OpenAI happy
            const msg: any = { role: m.role, content: m.content || "" }
            if (m.tool_calls) msg.tool_calls = m.tool_calls.map((tc: any) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments }
            }))
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            if (m.name) msg.name = m.name
            return msg
          }),
        ],
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        ...(args.tools?.length ? { tools: args.tools } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('OpenAI', res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiResponse | null
  const message = data?.choices?.[0]?.message
  const text = message?.content ?? ''
  
  // Format tool calls back to our agnostic format
  const tool_calls = message?.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function?.name ?? '',
    arguments: tc.function?.arguments ?? '{}',
  }))

  if (!text.trim() && (!tool_calls || tool_calls.length === 0)) {
    throw new AiError('OpenAI returned an empty response.', {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })
  return { text, usage, tool_calls }
}
