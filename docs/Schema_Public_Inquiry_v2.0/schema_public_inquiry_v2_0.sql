-- file: docs/Database Design/Schema_Public_Inquiry_v2.0/schema_public_inquiry_v2_0.sql
-- Unified Public Inquiry v2.0 build script for a new quarantined D1 database.
-- Creates v1.1, applies v1.2 lead-review fields, then applies v2.0 source/stage tables.

-- file: docs/Database Design/Schema_Public_Inquiry_v1.1/schema_public_inquiry_v1_0.sql
-- Schema Public Inquiry v1.1
-- Cloudflare D1 database: kr_public_inquiry_06_2026
-- D1 database id: 8517c8e6-f557-4286-824f-30f01148c325
-- Recommended binding: PUBLIC_INQUIRY_DB
-- Purpose: quarantine untrusted public consultation requests away from KR Homebase operational data.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS public_inquiry (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_contact_method TEXT NOT NULL CHECK (preferred_contact_method IN ('phone', 'email', 'text')),
  matter_type TEXT NOT NULL,
  state_of_residence TEXT NOT NULL,
  county_or_city TEXT,
  related_or_opposing_parties TEXT,
  preferred_day TEXT,
  preferred_time TEXT,
  urgency TEXT NOT NULL,
  deadline_or_hearing_note TEXT,
  summary TEXT NOT NULL,
  acknowledgement_no_attorney_client_relationship INTEGER NOT NULL DEFAULT 0 CHECK (acknowledgement_no_attorney_client_relationship IN (0, 1)),
  acknowledgement_no_confidential_info INTEGER NOT NULL DEFAULT 0 CHECK (acknowledgement_no_confidential_info IN (0, 1)),
  privacy_consent INTEGER NOT NULL DEFAULT 0 CHECK (privacy_consent IN (0, 1)),
  review_status TEXT NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'reviewing', 'rejected', 'promoted', 'spam')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  promoted_to_contact_id TEXT,
  promoted_to_matter_id TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS public_inquiry_metadata (
  inquiry_id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  request_url TEXT,
  referrer_url TEXT,
  landing_page_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  msclkid TEXT,
  ip_hash TEXT,
  ip_prefix TEXT,
  rate_limit_key_hash TEXT,
  user_agent TEXT,
  accept_language TEXT,
  submission_status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public_inquiry_bot_signal (
  inquiry_id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  turnstile_success INTEGER NOT NULL DEFAULT 0 CHECK (turnstile_success IN (0, 1)),
  turnstile_action TEXT,
  turnstile_hostname TEXT,
  turnstile_error_codes TEXT,
  honeypot_triggered INTEGER NOT NULL DEFAULT 0 CHECK (honeypot_triggered IN (0, 1)),
  bot_decision TEXT NOT NULL,
  form_started_at TEXT,
  form_submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS site_feedback (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  app_context TEXT NOT NULL CHECK (app_context IN ('public', 'homebase')),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('general', 'bug', 'content', 'design', 'accessibility', 'workflow')),
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high')),
  message TEXT NOT NULL,
  visitor_email TEXT,
  route_path TEXT,
  page_url TEXT,
  referrer_url TEXT,
  component_kr_id TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  user_agent TEXT,
  accept_language TEXT,
  ip_hash TEXT,
  ip_prefix TEXT,
  rate_limit_key_hash TEXT,
  turnstile_success INTEGER CHECK (turnstile_success IN (0, 1)),
  turnstile_action TEXT,
  turnstile_hostname TEXT,
  turnstile_error_codes TEXT,
  honeypot_triggered INTEGER NOT NULL DEFAULT 0 CHECK (honeypot_triggered IN (0, 1)),
  bot_decision TEXT NOT NULL,
  form_started_at TEXT,
  form_submitted_at TEXT,
  created_by_user_id TEXT,
  created_by_email TEXT,
  review_status TEXT NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'reviewing', 'reviewed', 'closed', 'spam')),
  reviewed_at TEXT,
  reviewed_by_user_id TEXT,
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS public_inquiry_event (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public_inquiry_review_note (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public_inquiry_promotion_log (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  promoted_to_contact_id TEXT,
  promoted_to_matter_id TEXT,
  promoted_by TEXT NOT NULL,
  promoted_at TEXT NOT NULL,
  promotion_note TEXT,
  FOREIGN KEY (inquiry_id) REFERENCES public_inquiry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_public_inquiry_submitted_at ON public_inquiry(submitted_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_review_status ON public_inquiry(review_status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_email ON public_inquiry(email);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_metadata_rate_limit ON public_inquiry_metadata(rate_limit_key_hash, submitted_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_metadata_ip_hash ON public_inquiry_metadata(ip_hash, submitted_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_event_inquiry ON public_inquiry_event(inquiry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_review_note_inquiry ON public_inquiry_review_note(inquiry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_public_inquiry_promotion_inquiry ON public_inquiry_promotion_log(inquiry_id, promoted_at);

CREATE INDEX IF NOT EXISTS idx_site_feedback_submitted_at ON site_feedback(submitted_at);
CREATE INDEX IF NOT EXISTS idx_site_feedback_context_status ON site_feedback(app_context, review_status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_site_feedback_type ON site_feedback(feedback_type, submitted_at);
CREATE INDEX IF NOT EXISTS idx_site_feedback_rate_limit ON site_feedback(rate_limit_key_hash, submitted_at);
CREATE INDEX IF NOT EXISTS idx_site_feedback_route ON site_feedback(route_path, submitted_at);
CREATE INDEX IF NOT EXISTS idx_site_feedback_created_by ON site_feedback(created_by_user_id, submitted_at);

-- ---- Public Inquiry v1.2 lead review layer ----

-- file: docs/Database Design/Schema_Public_Inquiry_v1.2/schema_public_inquiry_v1_2_lead_review_fields.sql
-- Schema Public Inquiry v1.2 lead-review fields
-- Purpose: allow KR Homebase Leads to assign public inquiries and notify users
-- when assigned inquiries remain in review_status = 'new'.

ALTER TABLE public_inquiry ADD COLUMN assigned_to TEXT;
ALTER TABLE public_inquiry ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_public_inquiry_review_assignee
ON public_inquiry(review_status, assigned_to, submitted_at);

-- ---- Public Inquiry v2.0 source/stage layer ----

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
