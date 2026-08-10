// ============================================================
// /api/account/webhook-sources
//
//   GET  — list this account's inbound webhook sources.
//   POST — create a new webhook source (generates a unique token).
//
// Dashboard endpoints (cookie auth via getCurrentAccount).
// ============================================================

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  generateWebhookToken,
  WEBHOOK_SOURCE_COLUMNS,
  serializeWebhookSource,
} from '@/lib/webhooks/sources';

const MAX_NAME_LEN = 80;

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from('webhook_sources')
      .select(WEBHOOK_SOURCE_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/account/webhook-sources] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load webhook sources' },
        { status: 500 }
      );
    }

    const sources = (data ?? []).map((r) =>
      serializeWebhookSource(r as Record<string, unknown>)
    );

    return NextResponse.json({ sources });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      pipeline_id?: unknown;
      stage_id?: unknown;
    } | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    const name =
      typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `name is required (max ${MAX_NAME_LEN} chars)` },
        { status: 400 }
      );
    }

    const pipelineId =
      typeof body.pipeline_id === 'string' && body.pipeline_id.trim()
        ? body.pipeline_id.trim()
        : null;
    const stageId =
      typeof body.stage_id === 'string' && body.stage_id.trim()
        ? body.stage_id.trim()
        : null;

    const token = generateWebhookToken();

    const { data: created, error } = await ctx.supabase
      .from('webhook_sources')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        name,
        token,
        pipeline_id: pipelineId,
        stage_id: stageId,
        is_active: true,
      })
      .select(WEBHOOK_SOURCE_COLUMNS)
      .single();

    if (error || !created) {
      console.error('[POST /api/account/webhook-sources] insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create webhook source' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { source: serializeWebhookSource(created as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
