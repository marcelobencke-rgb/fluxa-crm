-- ============================================================
-- Migration 047: Needs Attention Flag on Conversations
--
-- Adds `needs_attention` boolean flag to `conversations` table
-- to indicate when an AI handoff occurred and human attention
-- is required.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversations_needs_attention
  ON conversations(needs_attention) WHERE needs_attention = true;
