-- whatsapp_config: Add multi-provider support (Meta vs Evolution)

ALTER TABLE whatsapp_config
  ALTER COLUMN phone_number_id DROP NOT NULL,
  ALTER COLUMN access_token DROP NOT NULL,
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta', 'evolution')),
  ADD COLUMN evolution_instance_id TEXT,
  ADD COLUMN evolution_api_url TEXT,
  ADD COLUMN evolution_api_key TEXT;
