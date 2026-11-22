-- Source-only migration. The database owner must apply this after selecting a D1 database.
CREATE TABLE IF NOT EXISTS chat_schema_migration (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sync_state (
  id TEXT PRIMARY KEY,
  cursor_create_time TEXT,
  backfill_start_time TEXT NOT NULL,
  backfill_end_time TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_resource_name TEXT PRIMARY KEY,
  space_resource_name TEXT NOT NULL,
  create_time TEXT NOT NULL,
  sender_display_name TEXT,
  message_text TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  gemini_state TEXT NOT NULL DEFAULT 'not_started'
    CHECK (gemini_state IN ('not_started', 'synthetic_only', 'ready', 'failed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS activity_proposals (
  id TEXT PRIMARY KEY,
  message_resource_name TEXT NOT NULL REFERENCES chat_messages(message_resource_name),
  segment_index INTEGER NOT NULL,
  classification TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending', 'approved', 'rejected', 'needs_revision')),
  reviewer_id TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (message_resource_name, segment_index)
);

CREATE INDEX IF NOT EXISTS activity_proposals_review_idx
  ON activity_proposals(review_state, created_at);

CREATE TABLE IF NOT EXISTS activity_export_receipts (
  proposal_id TEXT PRIMARY KEY REFERENCES activity_proposals(id),
  message_resource_name TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  homebase_activity_id TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  UNIQUE (message_resource_name, segment_index)
);

INSERT OR IGNORE INTO chat_schema_migration (id, file_name, applied_at, summary) VALUES
  ('0001', '0001_initial_sql_d1_start.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Initial isolated Google Chat intake and review queue.');
