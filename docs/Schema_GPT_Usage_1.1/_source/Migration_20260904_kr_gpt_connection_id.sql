-- Adds short business-facing GPT connection IDs and non-secret connection
-- metadata to the GPT usage database. Run after Schema_GPT_Usage_1.1 and
-- before deploying Worker code that reads kr_gpt_connection_id.

PRAGMA foreign_keys = OFF;

ALTER TABLE gpt_model_connection RENAME TO gpt_model_connection_old;

CREATE TABLE gpt_model_connection (
  id TEXT PRIMARY KEY,
  kr_gpt_connection_id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('cloudflare-ai-gateway','gemini','openai','anthropic-claude','other')),
  provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  credential_name TEXT NOT NULL DEFAULT 'api-key',
  config1 TEXT,
  config2 TEXT,
  config3 TEXT,
  state TEXT NOT NULL DEFAULT 'unconfigured' CHECK (state IN ('unconfigured','configured')),
  created_by_user_id TEXT,
  created_by_email TEXT,
  updated_by_user_id TEXT,
  updated_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (length(trim(kr_gpt_connection_id)) > 0),
  CHECK (length(trim(application_id)) > 0),
  CHECK (length(trim(provider)) > 0),
  CHECK (length(trim(llm_model)) > 0),
  CHECK (length(trim(credential_name)) > 0)
);

INSERT INTO gpt_model_connection (
  id,
  kr_gpt_connection_id,
  application_id,
  connection_type,
  provider,
  llm_model,
  credential_name,
  state,
  created_by_user_id,
  created_by_email,
  updated_by_user_id,
  updated_by_email,
  created_at,
  updated_at
)
SELECT
  id,
  'kr-gpt-' || lower(replace(replace(connection_type, '_', '-'), '.', '-')) || '-' || lower(replace(replace(llm_model, '_', '-'), '.', '-')) || '-' || lower(hex(randomblob(3))),
  application_id,
  connection_type,
  provider,
  llm_model,
  'api-key',
  state,
  created_by_user_id,
  created_by_email,
  updated_by_user_id,
  updated_by_email,
  created_at,
  updated_at
FROM gpt_model_connection_old;

DROP TABLE gpt_model_connection_old;

CREATE INDEX idx_gpt_model_connection_application
  ON gpt_model_connection(application_id, provider, llm_model);
CREATE INDEX idx_gpt_model_connection_kr_id
  ON gpt_model_connection(application_id, kr_gpt_connection_id);

ALTER TABLE gpt_usage ADD COLUMN kr_gpt_connection_id TEXT;

UPDATE gpt_usage
SET kr_gpt_connection_id = (
  SELECT gpt_model_connection.kr_gpt_connection_id
  FROM gpt_model_connection
  WHERE gpt_model_connection.application_id = gpt_usage.application_id
    AND gpt_model_connection.connection_type = gpt_usage.model_provider
    AND gpt_model_connection.llm_model = gpt_usage.model_name
  ORDER BY gpt_model_connection.updated_at DESC
  LIMIT 1
)
WHERE kr_gpt_connection_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_gpt_usage_connection
  ON gpt_usage(kr_gpt_connection_id, requested_at DESC);

PRAGMA foreign_keys = ON;
