import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * POST /api/ai/agents/[id]/publish
 *
 * Publishes the specified agent version (sets is_active = true) and
 * automatically unpublishes any other active agent on this account.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-agents-publish:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID da versão é obrigatório' }, { status: 400 })
    }

    // Verify ownership
    const { data: target, error: checkErr } = await supabase
      .from('ai_configs')
      .select('id, name')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (checkErr || !target) {
      return NextResponse.json({ error: 'Versão do agente não encontrada' }, { status: 404 })
    }

    // Unpublish all other agents for this account
    await supabase
      .from('ai_configs')
      .update({ is_active: false })
      .eq('account_id', accountId)

    // Publish the target agent
    const { error: upErr } = await supabase
      .from('ai_configs')
      .update({ is_active: true })
      .eq('id', id)
      .eq('account_id', accountId)

    if (upErr) {
      console.error('[ai/agents/publish POST] error:', upErr)
      return NextResponse.json(
        { error: 'Falha ao publicar a versão selecionada' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, published_id: id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
