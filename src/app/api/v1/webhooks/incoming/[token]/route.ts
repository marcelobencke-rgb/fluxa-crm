// ============================================================
// POST /api/v1/webhooks/incoming/[token]
//
// Public endpoint for receiving inbound webhooks from external sources
// (landing pages, WordPress, Elementor, Facebook Leads, RD Station).
//
// Validates `token`, identifies `account_id`, finds or creates a
// contact by phone/email, optionally creates a deal in the target
// pipeline/stage, and logs the activity in `webhook_logs`.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';

interface SourceRow {
  id: string;
  account_id: string;
  created_by: string | null;
  name: string;
  token: string;
  pipeline_id: string | null;
  stage_id: string | null;
  is_active: boolean;
  last_received_at: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const db = supabaseAdmin();
  let accountId: string | null = null;
  let sourceName = 'inbound.webhook';

  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json(
        { error: 'Missing webhook token' },
        { status: 400 }
      );
    }

    // 1. Look up source using literal select string
    const { data: rawSource, error: sourceErr } = await db
      .from('webhook_sources')
      .select(
        'id, account_id, created_by, name, token, pipeline_id, stage_id, is_active, last_received_at'
      )
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle();

    const source = (rawSource as unknown) as SourceRow | null;

    if (sourceErr || !source) {
      return NextResponse.json(
        { error: 'Webhook source not found or inactive' },
        { status: 404 }
      );
    }

    accountId = source.account_id;
    sourceName = source.name || 'inbound.webhook';

    // 2. Parse body
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      try {
        await db.from('webhook_logs').insert({
          account_id: accountId,
          direction: 'inbound',
          status_code: 400,
          event_type: `inbound.${sourceName}`,
          payload: { error: 'Invalid JSON body' },
        });
      } catch {}
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    // Extract fields
    const rawPhone =
      body.phone ??
      body.whatsapp ??
      body.celular ??
      body.telefone ??
      body.mobile ??
      '';
    const phone =
      typeof rawPhone === 'string'
        ? rawPhone.replace(/[^\d+]/g, '')
        : String(rawPhone).replace(/[^\d+]/g, '');

    if (!phone) {
      try {
        await db.from('webhook_logs').insert({
          account_id: accountId,
          direction: 'inbound',
          status_code: 400,
          event_type: `inbound.${sourceName}`,
          payload: { ...body, error: 'Missing phone/whatsapp number' },
        });
      } catch {}
      return NextResponse.json(
        { error: 'Payload must contain a phone or whatsapp number field' },
        { status: 400 }
      );
    }

    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : typeof body.nome === 'string'
          ? body.nome.trim()
          : 'Contato Webhook';
    const email =
      typeof body.email === 'string'
        ? body.email.trim()
        : typeof body.mail === 'string'
          ? body.mail.trim()
          : null;

    // Resolve audit user ID safely (created_by string, or fallback to account owner)
    const auditUserId =
      (typeof source.created_by === 'string' && source.created_by) ||
      (await resolveAuditUserId(db, accountId));

    // 3. Find or Create contact
    const { id: contactId, created: contactCreated } = await findOrCreateContact(
      db,
      accountId,
      auditUserId,
      { phone, name, email }
    );

    // 4. Optionally insert deal into pipeline
    let dealId: string | null = null;
    if (source.pipeline_id) {
      let stageId: string | null = source.stage_id;

      if (!stageId) {
        const { data: firstStage } = await db
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', source.pipeline_id)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();

        const stageRow = (firstStage as unknown) as { id: string } | null;
        if (stageRow?.id) {
          stageId = stageRow.id;
        }
      }

      if (stageId) {
        const { data: deal } = await db
          .from('deals')
          .insert({
            account_id: accountId,
            user_id: source.created_by || null,
            pipeline_id: source.pipeline_id,
            stage_id: stageId,
            contact_id: contactId,
            title: name || `Lead via ${sourceName}`,
            value: 0,
            status: 'active',
          })
          .select('id')
          .single();

        const dealRow = (deal as unknown) as { id: string } | null;
        if (dealRow?.id) {
          dealId = dealRow.id;
        }
      }
    }

    // 5. Update last_received_at on source
    await db
      .from('webhook_sources')
      .update({ last_received_at: new Date().toISOString() })
      .eq('id', source.id);

    // 6. Log success in activity
    try {
      await db.from('webhook_logs').insert({
        account_id: accountId,
        direction: 'inbound',
        status_code: 200,
        event_type: `inbound.${sourceName}`,
        payload: body,
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        contact_id: contactId,
        contact_created: contactCreated,
        deal_id: dealId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[POST /api/v1/webhooks/incoming] error:', err);
    if (accountId) {
      try {
        await db.from('webhook_logs').insert({
          account_id: accountId,
          direction: 'inbound',
          status_code: 500,
          event_type: `inbound.${sourceName}`,
          payload: { error: err instanceof Error ? err.message : String(err) },
        });
      } catch {}
    }
    return NextResponse.json(
      { error: 'Internal webhook processing error' },
      { status: 500 }
    );
  }
}
