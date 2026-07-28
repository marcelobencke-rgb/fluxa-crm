// ============================================================
// /api/account/webhook-endpoints/[id]
//
//   DELETE — remove an outbound webhook endpoint.
//
// Dashboard endpoint (cookie auth via requireRole('admin')).
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;

    const { error } = await ctx.supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete webhook endpoint' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
