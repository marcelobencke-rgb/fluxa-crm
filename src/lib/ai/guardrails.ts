import type { GuardrailItem } from './types'

export interface GuardrailCheckResult {
  allowed: boolean
  handoff?: boolean
  reason?: string
}

/**
 * Evaluates pre-generation guardrails (input regex, operating hours window, and RAG minimum hits).
 */
export function evaluatePreGenerationGuardrails(
  guardrails: GuardrailItem[] | undefined,
  inputMessage: string,
  knowledgeHitsCount: number,
): GuardrailCheckResult {
  if (!guardrails || guardrails.length === 0) {
    return { allowed: true }
  }

  for (const g of guardrails) {
    // 1. Check input regex block
    if (g.kind === 'regex_input_block' && g.pattern) {
      try {
        const regex = new RegExp(g.pattern, g.flags || 'i')
        if (regex.test(inputMessage)) {
          return {
            allowed: false,
            reason: g.reason || 'Mensagem de entrada bloqueada por regra de segurança.',
          }
        }
      } catch (err) {
        // Invalid regex, ignore or log
      }
    }

    // 2. Check operating hours window
    if (g.kind === 'window_check' && g.start_hour !== undefined && g.end_hour !== undefined) {
      try {
        const now = new Date()
        const tz = g.timezone || 'America/Sao_Paulo'
        const hourStr = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          hour12: false,
        }).format(now)
        const currentHour = parseInt(hourStr, 10)
        if (currentHour < g.start_hour || currentHour >= g.end_hour) {
          return {
            allowed: false,
            reason: g.reason || `Fora de janela horária permitida (${g.start_hour}h - ${g.end_hour}h).`,
          }
        }
      } catch (err) {
        // Timezone error, default to allowed
      }
    }

    // 3. Check RAG must hit
    if (g.kind === 'rag_must_hit') {
      const minNeeded = g.min_citations ?? 1
      if (knowledgeHitsCount < minNeeded) {
        return {
          allowed: false,
          handoff: true,
          reason: g.reason || `Base de Conhecimento não retornou citações suficientes (necessário >= ${minNeeded}).`,
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * Evaluates post-generation guardrails (output regex block).
 */
export function evaluatePostGenerationGuardrails(
  guardrails: GuardrailItem[] | undefined,
  outputText: string,
): GuardrailCheckResult {
  if (!guardrails || guardrails.length === 0) {
    return { allowed: true }
  }

  for (const g of guardrails) {
    if (g.kind === 'regex_output_block' && g.pattern) {
      try {
        const regex = new RegExp(g.pattern, g.flags || 'i')
        if (regex.test(outputText)) {
          return {
            allowed: false,
            handoff: true,
            reason: g.reason || 'Resposta gerada continha termo bloqueado por regra de saída.',
          }
        }
      } catch (err) {
        // Invalid regex, ignore
      }
    }
  }

  return { allowed: true }
}
