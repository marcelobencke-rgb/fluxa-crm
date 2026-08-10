// ============================================================
// /api/account/webhook-sources/[id]
//
//   PATCH  — update name, pipeline_id, stage_id, is_active.
//   DELETE — remove a webhook source.
//
// Dashboard endpoints (cookie auth via requireRole('admin')).
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  WEBHOOK_SOURCE_COLUMNS,
  serializeWebhookSource,
} from '@/lib/webhooks/sources';

const MAX_NAME_LEN = 80;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      pipeline_id?: unknown;
      stage_id?: unknown;
      is_active?: unknown;
    } | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `name is required (max ${MAX_NAME_LEN} chars)` },
          { status: 400 }
        );
      }
      updates.name = name;
    }

    if (body.pipeline_id !== undefined) {
      updates.pipeline_id =
        typeof body.pipeline_id === 'string' && body.pipeline_id.trim()
          ? body.pipeline_id.trim()
          : null;
    }

    if (body.stage_id !== undefined) {
      updates.stage_id =
        typeof body.stage_id === 'string' && body.stage_id.trim()
          ? body.stage_id.trim()
          : null;
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    const { data: updated, error } = await ctx.supabase
      .from('webhook_sources')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(WEBHOOK_SOURCE_COLUMNS)
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: 'Webhook source not found or update failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      source: serializeWebhookSource(updated as Record<string, unknown>),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;

    const { error } = await ctx.supabase
      .from('webhook_sources')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete webhook source' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
