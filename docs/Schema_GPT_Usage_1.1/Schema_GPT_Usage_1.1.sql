-- file: docs/Database Design/Schema_GPT_Usage_1.1/Schema_GPT_Usage_1.1.sql
-- KR Homebase GPT Gateway usage schema 1.1
-- Target database: krhomebase_gpt_usage_dev (development)
-- Binding: GPT_USAGE_DB

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gpt_approved_application (
  application_id TEXT PRIMARY KEY,
  approved_api_key TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'unconfigured' CHECK (state IN ('unconfigured','configured')),
  updated_by_user_id TEXT,
  updated_by_email TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS gpt_model_connection (
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

CREATE INDEX IF NOT EXISTS idx_gpt_model_connection_application
  ON gpt_model_connection(application_id, provider, llm_model);
CREATE INDEX IF NOT EXISTS idx_gpt_model_connection_kr_id
  ON gpt_model_connection(application_id, kr_gpt_connection_id);

CREATE TABLE IF NOT EXISTS gpt_llm_credential (
  provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  credential TEXT NOT NULL,
  "key" TEXT NOT NULL,
  is_key_encrypted INTEGER NOT NULL DEFAULT 1 CHECK (is_key_encrypted IN (0,1)),
  config1 TEXT,
  config2 TEXT,
  config3 TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (provider, llm_model, credential),
  CHECK (length(trim(provider)) > 0),
  CHECK (length(trim(llm_model)) > 0),
  CHECK (length(trim(credential)) > 0),
  CHECK (length(trim("key")) > 0)
);

CREATE INDEX IF NOT EXISTS idx_gpt_llm_credential_model
  ON gpt_llm_credential(provider, llm_model);

CREATE TABLE IF NOT EXISTS gpt_usage (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL DEFAULT 'krhomebase',
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  kr_gpt_connection_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_rate_per_million REAL NOT NULL DEFAULT 0,
  cached_rate_per_million REAL NOT NULL DEFAULT 0,
  output_rate_per_million REAL NOT NULL DEFAULT 0,
  input_cost REAL NOT NULL DEFAULT 0,
  cached_cost REAL NOT NULL DEFAULT 0,
  output_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  module_name TEXT NOT NULL,
  requested_by_user_id TEXT,
  requested_by_email TEXT,
  request_kind TEXT NOT NULL DEFAULT 'readiness',
  response_status TEXT NOT NULL DEFAULT 'success',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (input_tokens >= 0), CHECK (cached_tokens >= 0), CHECK (output_tokens >= 0), CHECK (total_tokens >= 0),
  CHECK (input_rate_per_million >= 0), CHECK (cached_rate_per_million >= 0), CHECK (output_rate_per_million >= 0),
  CHECK (input_cost >= 0), CHECK (cached_cost >= 0), CHECK (output_cost >= 0), CHECK (total_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_gpt_usage_requested_at ON gpt_usage(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpt_usage_model ON gpt_usage(model_provider, model_name, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpt_usage_connection ON gpt_usage(kr_gpt_connection_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpt_usage_requester ON gpt_usage(requested_by_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpt_usage_module ON gpt_usage(module_name, requested_at DESC);
