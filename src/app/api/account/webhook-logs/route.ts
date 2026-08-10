// ============================================================
// /api/account/webhook-logs
//
//   GET — list recent webhook activity logs (inbound & outbound)
//
// Dashboard endpoint (cookie auth via getCurrentAccount).
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  WEBHOOK_LOG_COLUMNS,
  serializeWebhookLog,
} from '@/lib/webhooks/sources';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 100);

    const { data, error } = await ctx.supabase
      .from('webhook_logs')
      .select(WEBHOOK_LOG_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[GET /api/account/webhook-logs] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load webhook activity logs' },
        { status: 500 }
      );
    }

    const logs = (data ?? []).map((r) =>
      serializeWebhookLog(r as Record<string, unknown>)
    );

    return NextResponse.json({ logs });
  } catch (err) {
    return toErrorResponse(err);
  }
}
