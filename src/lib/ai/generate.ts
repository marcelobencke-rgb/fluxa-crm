import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types'
import { HANDOFF_SENTINEL, aiRequestTimeoutMs } from './defaults'
import { generateOpenAi } from './providers/openai'
import { generateAnthropic } from './providers/anthropic'

export interface GenerateArgs {
  config: AiConfig
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[]
  /** Available tools schemas. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[]
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const { config, systemPrompt, messages, tools } = args
  const timeoutMs = aiRequestTimeoutMs()
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
    tools,
    temperature: config.config?.temperature ?? 0.3,
    maxTokens: config.config?.max_tokens ?? 1024,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: { text: string; usage: AiUsage | null; tool_calls?: any[] }
  switch (config.provider) {
    case 'openai':
      result = await generateOpenAi(providerArgs)
      break
    case 'anthropic':
      // Anthropic tools not implemented yet; fallback to no tools.
      result = await generateAnthropic(providerArgs)
      break
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      })
  }

  return parseGeneration(result)
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: { text: string; usage: AiUsage | null; tool_calls?: any[] },
): GenerateResult {
  const HANDOFF_SENTINEL_PATTERN = /\[\[?\s*(HANDOFF|TRANSFER|TRANSFERÊNCIA|HANDOFF_QUEUE)\s*\]\]?/i
  const NATURAL_HANDOFF_PATTERN = /(vou\s+(chamar|transferir|encaminhar|passar)|chamar\s+um\s+(especialista|atendente|humano)|transferir\s+para|encaminhar\s+para|nossa\s+equipe\s+(vai|irá)\s+(atender|falar|entrar)|um\s+(especialista|atendente|humano)\s+(vai|irá|está))/i
  const hasSentinel =
    result.text.includes(HANDOFF_SENTINEL) ||
    HANDOFF_SENTINEL_PATTERN.test(result.text) ||
    NATURAL_HANDOFF_PATTERN.test(result.text)
  const handoff = hasSentinel

  const outText = result.text.replace(/\[\[?\s*(HANDOFF|TRANSFER|TRANSFERÊNCIA|HANDOFF_QUEUE)\s*\]\]?/gi, '')
  return {
    text: outText.trim(),
    handoff,
    usage: result.usage,
    tool_calls: result.tool_calls,
  }
}
