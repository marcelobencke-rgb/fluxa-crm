-- ============================================================
-- 038_webhook_sources.sql — Inbound Webhook Sources & Activity Logs
--
-- Adds support for:
-- 1) `webhook_sources`: Inbound webhook URLs that receive leads/contacts
--    from landing pages, WordPress, Elementor, Facebook Ads, etc.
-- 2) `webhook_logs`: Activity table logging all inbound and outbound
--    webhook deliveries for UI inspection and troubleshooting.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- WEBHOOK_SOURCES (Inbound Webhooks)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name             text NOT NULL,
  token            text NOT NULL UNIQUE,
  pipeline_id      uuid REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id         text,
  is_active        boolean NOT NULL DEFAULT true,
  last_received_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_sources_account_id_idx
  ON webhook_sources (account_id);
CREATE INDEX IF NOT EXISTS webhook_sources_token_idx
  ON webhook_sources (token);

ALTER TABLE webhook_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_sources_select ON webhook_sources;
CREATE POLICY webhook_sources_select ON webhook_sources FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS webhook_sources_insert ON webhook_sources;
CREATE POLICY webhook_sources_insert ON webhook_sources FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS webhook_sources_update ON webhook_sources;
CREATE POLICY webhook_sources_update ON webhook_sources FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS webhook_sources_delete ON webhook_sources;
CREATE POLICY webhook_sources_delete ON webhook_sources FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- WEBHOOK_LOGS (Activity / Delivery Audit Logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  direction   text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status_code integer NOT NULL,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_logs_account_id_created_at_idx
  ON webhook_logs (account_id, created_at DESC);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_logs_select ON webhook_logs;
CREATE POLICY webhook_logs_select ON webhook_logs FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS webhook_logs_insert ON webhook_logs;
CREATE POLICY webhook_logs_insert ON webhook_logs FOR INSERT
  WITH CHECK (is_account_member(account_id));

DROP POLICY IF EXISTS webhook_logs_delete ON webhook_logs;
CREATE POLICY webhook_logs_delete ON webhook_logs FOR DELETE
  USING (is_account_member(account_id, 'admin'));
