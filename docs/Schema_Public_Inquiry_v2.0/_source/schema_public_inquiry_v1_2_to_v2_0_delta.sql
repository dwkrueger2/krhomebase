-- file: docs/Database Design/Schema_Public_Inquiry_v2.0/schema_public_inquiry_v1_2_to_v2_0_delta.sql
-- Schema Public Inquiry v2.0 migration.
-- Baseline: apply after Schema_Public_Inquiry_v1.2.
-- Purpose: preserve external lead-management-like source/channel fields, normalized intake-party
-- records for conflict triage, stage history, and optional external-system maps.

PRAGMA foreign_keys = ON;

ALTER TABLE public_inquiry ADD COLUMN lead_source TEXT;
ALTER TABLE public_inquiry ADD COLUMN lead_channel TEXT;
ALTER TABLE public_inquiry ADD COLUMN referring_url TEXT;
ALTER TABLE public_inquiry ADD COLUMN source_system TEXT;
ALTER TABLE public_inquiry ADD COLUMN source_record_id TEXT;
ALTER TABLE public_inquiry ADD COLUMN contact_permission_scope TEXT;
ALTER TABLE public_inquiry ADD COLUMN marketing_consent_status TEXT;

CREATE TABLE IF NOT EXISTS public_inquiry_intake_party (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  party_name TEXT NOT NULL,
  party_role TEXT NOT NULL DEFAULT 'unknown',
  party_type TEXT NOT NULL DEFAULT 'unknown' CHECK (party_type IN ('person','organization','unknown')),
  contact_hint TEXT,
  conflict_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_intake_party_inquiry ON public_inquiry_intake_party(inquiry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_intake_party_name ON public_inquiry_intake_party(party_name);

CREATE TABLE IF NOT EXISTS public_inquiry_stage_history (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  event_note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_stage_history_inquiry ON public_inquiry_stage_history(inquiry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_stage_history_next ON public_inquiry_stage_history(next_status, created_at);

CREATE TABLE IF NOT EXISTS public_inquiry_external_map (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  external_system TEXT NOT NULL,
  external_record_type TEXT NOT NULL,
  external_record_id TEXT NOT NULL,
  external_url TEXT,
  sync_status TEXT NOT NULL DEFAULT 'mapped' CHECK (sync_status IN ('mapped','pending','synced','error','ignored')),
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE,
  UNIQUE (external_system, external_record_type, external_record_id)
);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_external_map_inquiry ON public_inquiry_external_map(inquiry_id, external_system);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_source ON public_inquiry(source_system, source_record_id);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_lead_source ON public_inquiry(lead_source, lead_channel, submitted_at);
