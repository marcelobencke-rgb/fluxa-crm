-- ============================================================
-- Migration 045: Multi-Agent AI Configs (Versioning & Publishing)
--
-- Allows multiple AI Agent configurations per account (V1, V2, Backup)
-- while guaranteeing via a partial unique index that at most ONE agent
-- is published/active (is_active = true) per account at any time.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Add name and description columns to ai_configs
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Agente Principal (V1)',
  ADD COLUMN IF NOT EXISTS description text;

-- 2. Drop the single-row-per-account UNIQUE constraint
ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_account_id_key;

-- 3. Create a partial unique index ensuring only ONE active/published agent per account
CREATE UNIQUE INDEX IF NOT EXISTS ai_configs_one_active_per_account
  ON ai_configs(account_id)
  WHERE is_active = true;
