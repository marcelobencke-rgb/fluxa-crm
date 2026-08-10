-- ============================================================
-- Migration 046: Internal Notes on Messages
--
-- Adds `is_internal` column to `messages` table to support
-- internal staff notes and automated AI handoff notes.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

-- Create index for querying non-internal / internal messages efficiently
CREATE INDEX IF NOT EXISTS idx_messages_conversation_internal 
  ON messages(conversation_id, is_internal);
