import { NextResponse } from 'next/server'
import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

/**
 * DELETE /api/ai/agents/[id]
 *
 * Deletes a specific AI agent version.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID do agente é obrigatório' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_configs')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) {
      console.error('[ai/agents/[id] DELETE] error:', error)
      return NextResponse.json(
        { error: 'Falha ao excluir a versão do agente' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
