-- ============================================================================
-- 044: AI Config Advanced Parameters & 100 Auto Replies Limit
-- ============================================================================

-- 1. Increase max auto replies limit check from 20 to 100
ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_auto_reply_max_per_conversation_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_auto_reply_max_per_conversation_check
  CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 100);

-- 2. Add jsonb config column for advanced LLM, RAG, and Guardrails knobs
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT jsonb_build_object(
    'temperature', 0.3,
    'max_tokens', 1024,
    'context_message_window', 20,
    'rag_top_k', 5,
    'rag_similarity_threshold', 0.72,
    'confidence_threshold', 0.55,
    'guardrails', '["regex_output", "rag_must_hit"]'::jsonb
  );
