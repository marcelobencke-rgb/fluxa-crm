// ============================================================
// Webhook sources and logs helpers — token generation and
// serialization for inbound webhooks and activity logs.
// ============================================================

import { randomBytes } from 'node:crypto';

export const WEBHOOK_SOURCE_PREFIX = 'whsrc_';

export const WEBHOOK_SOURCE_COLUMNS =
  'id, name, token, pipeline_id, stage_id, is_active, last_received_at, created_at, updated_at';

export const WEBHOOK_LOG_COLUMNS =
  'id, direction, status_code, event_type, payload, created_at';

export interface ApiWebhookSource {
  id: string;
  name: string;
  token: string;
  pipeline_id: string | null;
  stage_id: string | null;
  is_active: boolean;
  last_received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiWebhookLog {
  id: string;
  direction: 'inbound' | 'outbound';
  status_code: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Generate a fresh inbound webhook token. */
export function generateWebhookToken(): string {
  return `${WEBHOOK_SOURCE_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function serializeWebhookSource(
  row: Record<string, unknown>
): ApiWebhookSource {
  return {
    id: row.id as string,
    name: row.name as string,
    token: row.token as string,
    pipeline_id: (row.pipeline_id as string | null) ?? null,
    stage_id: (row.stage_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    last_received_at: (row.last_received_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) ?? (row.created_at as string),
  };
}

export function serializeWebhookLog(
  row: Record<string, unknown>
): ApiWebhookLog {
  return {
    id: row.id as string,
    direction: row.direction as 'inbound' | 'outbound',
    status_code: (row.status_code as number | null) ?? 200,
    event_type: row.event_type as string,
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    created_at: row.created_at as string,
  };
}
