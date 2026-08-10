// ============================================================
// /api/account/webhook-endpoints
//
//   GET  — list outbound webhook endpoints.
//   POST — register an outbound webhook endpoint (shows secret once).
//
// Dashboard endpoints (cookie auth via getCurrentAccount / requireRole).
// ============================================================

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';
import { normalizeEvents } from '@/lib/webhooks/events';
import {
  WEBHOOK_PUBLIC_COLUMNS,
  serializeWebhookEndpoint,
  generateWebhookSecret,
  normalizeWebhookUrl,
} from '@/lib/webhooks/endpoints';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from('webhook_endpoints')
      .select(WEBHOOK_PUBLIC_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/account/webhook-endpoints] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load webhook endpoints' },
        { status: 500 }
      );
    }

    const endpoints = (data ?? []).map((r) =>
      serializeWebhookEndpoint(r as Record<string, unknown>)
    );

    return NextResponse.json({ endpoints });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    const url = normalizeWebhookUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: "'url' must be a valid https:// URL" },
        { status: 400 }
      );
    }

    const events = normalizeEvents(body.events);
    if (!events) {
      return NextResponse.json(
        { error: "'events' must be a non-empty array of known event names" },
        { status: 400 }
      );
    }

    const secret = generateWebhookSecret();

    const { data: created, error } = await ctx.supabase
      .from('webhook_endpoints')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        url,
        secret: encrypt(secret),
        events,
      })
      .select(WEBHOOK_PUBLIC_COLUMNS)
      .single();

    if (error || !created) {
      console.error('[POST /api/account/webhook-endpoints] create error:', error);
      return NextResponse.json(
        { error: 'Failed to create webhook endpoint' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        endpoint: {
          ...serializeWebhookEndpoint(created as Record<string, unknown>),
          secret,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
