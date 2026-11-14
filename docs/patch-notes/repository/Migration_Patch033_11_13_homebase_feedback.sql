-- file: docs/patch-notes/repository/Migration_Patch033_11_13_homebase_feedback.sql
--
-- Homebase Feedback, stage F1 (repository patch 33, Nov 13, 2026; plan docs/12_Homebase_Feedback_Plan.md, section 4.1
-- and the requester's answers in section 7.1). Creates the four feedback tables in the `krhomebase` D1 database and the
-- built-in role set "Internal Developer" (decision 2: a permission resource and a role set, not a new user.role value).
-- The requester applies this file; agents never run it (AGENTS_06). It lives under docs/patch-notes because
-- packages/db/migrations does not exist yet (open decision 10 in docs/01_Architecture_Proposal.md).
--
-- Expected starting schema: Schema_8.0 (docs/Schema_8.0/schema_d1_v8_0.sql) plus the earlier repository migrations.
-- Check first (read-only): SELECT name FROM sqlite_master WHERE name LIKE 'homebase_feedback%'; must list nothing, and
-- SELECT id FROM role_set WHERE id = 'role_internal_developer'; must list nothing.
-- Rows preserved: nothing existing is changed, dropped, renamed or rebuilt. The new tables start empty. The role set
-- rows use INSERT OR IGNORE, so a second run adds nothing (the CREATE TABLE statements use IF NOT EXISTS for the same
-- reason).
-- Foreign-key order: `user` and `role_set` already exist. homebase_feedback is created first; the marker, image and
-- note tables refer to it (ON DELETE CASCADE: there is no delete route, but a request removed by hand takes its parts
-- with it). The role set row is inserted before its permission row. No circular references.
--
-- Responsibilities kept apart (AGENTS_06): the API (apps/api/src/features/homebase-feedback/rules.ts) works out the
-- next number (the highest plus one) and tries again when the UNIQUE rule on `number` refuses it; the database only
-- refuses a repeated number. `FB-0012` is the number written with at least four digits; only the integer is stored.
--
--   homebase_feedback          one row per request: number, kind, title, text, status, priority, the sender and the
--                              captured page (address, section, open item, version tags, window size, theme)
--   homebase_feedback_marker   each data-kr-* marker the text names, found or not on the page when it was sent, its box
--   homebase_feedback_image    annotated screenshots (stage F3 writes them; created now so F3 needs no migration)
--   homebase_feedback_note     developer notes and the record of status and priority changes
--
-- Until this file is applied the Homebase Feedback routes answer 503 HOMEBASE_FEEDBACK_MIGRATION_REQUIRED and the
-- Feedback pop-out says so.
--
-- Apply (PowerShell, from D:\Repos\krhomebase):
--   $Repo = "D:\Repos\krhomebase"
--   $Db   = "krhomebase"
--   $Sql  = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch033_11_13_homebase_feedback.sql"
--   Set-Location (Join-Path $Repo "apps\api")
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $Sql
--
-- Read-only verification after applying (same folder):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE name LIKE 'homebase_feedback%' ORDER BY name;"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_list(homebase_feedback_marker);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_check(homebase_feedback_marker);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT rs.id, rs.label, p.permission_key, p.can_read, p.can_update FROM role_set rs JOIN role_set_permission p ON p.role_set_id = rs.id WHERE rs.id = 'role_internal_developer';"

-- One request about KR Homebase itself.
CREATE TABLE IF NOT EXISTS homebase_feedback (
  id                    TEXT PRIMARY KEY,                       -- hfb_<uuid>
  number                INTEGER NOT NULL UNIQUE CHECK (number > 0), -- 12 is FB-0012
  kind                  TEXT NOT NULL CHECK (kind IN ('feature', 'issue', 'question')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'triaged', 'planned', 'in_progress', 'done', 'will_not_do')),
  priority              TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  submitted_by_user_id  TEXT NOT NULL REFERENCES user(id),
  submitter_role        TEXT,                                   -- user.role when it was sent
  page_address          TEXT,                                   -- the source window's full address
  section_id            TEXT,                                   -- ?section= of that address
  open_item             TEXT,                                   -- the open item (contact:<id>), with its label
  page_title            TEXT,                                   -- the top bar's title and breadcrumb
  web_version           TEXT,                                   -- <meta name="kr-web-version">
  deployment_id         TEXT,                                   -- <meta name="kr-deployment-id">
  deployment_time       TEXT,                                   -- <meta name="kr-deployment-time">
  window_width          INTEGER,
  window_height         INTEGER,
  theme                 TEXT,                                   -- light or dark
  created_at            TEXT NOT NULL,
  updated_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_homebase_feedback_status ON homebase_feedback (status, number);
CREATE INDEX IF NOT EXISTS idx_homebase_feedback_submitter ON homebase_feedback (submitted_by_user_id, number);

-- Each data-kr-* marker the request's text names, in the order written.
CREATE TABLE IF NOT EXISTS homebase_feedback_marker (
  id                TEXT PRIMARY KEY,                           -- hfm_<uuid>
  feedback_id       TEXT NOT NULL REFERENCES homebase_feedback(id) ON DELETE CASCADE,
  attribute         TEXT NOT NULL CHECK (attribute IN ('data-kr-id', 'data-kr-element')),
  value             TEXT NOT NULL,
  found_at_capture  INTEGER NOT NULL DEFAULT 0 CHECK (found_at_capture IN (0, 1)),
  box_json          TEXT,                                       -- {"x","y","width","height"} in CSS pixels, when found
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  UNIQUE (feedback_id, attribute, value)
);

CREATE INDEX IF NOT EXISTS idx_homebase_feedback_marker_value ON homebase_feedback_marker (attribute, value);

-- Annotated screenshots (stage F3). The PNG lives in the private R2 bucket kr-homebase-feedback.
CREATE TABLE IF NOT EXISTS homebase_feedback_image (
  id                  TEXT PRIMARY KEY,                         -- hfi_<uuid>
  feedback_id         TEXT NOT NULL REFERENCES homebase_feedback(id) ON DELETE CASCADE,
  r2_key              TEXT NOT NULL UNIQUE,                     -- feedback/FB-0012/<image id>.png
  content_type        TEXT NOT NULL DEFAULT 'image/png',
  byte_size           INTEGER NOT NULL CHECK (byte_size >= 0),
  width               INTEGER,
  height              INTEGER,
  shapes_json         TEXT,                                     -- rectangles, arrows, text, redactions; coordinates 0 to 1
  marker_map_json     TEXT,                                     -- every data-kr-* element visible in the shot, with its box
  created_by_user_id  TEXT NOT NULL REFERENCES user(id),
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homebase_feedback_image_feedback ON homebase_feedback_image (feedback_id, created_at);

-- Developer notes and the record of status and priority changes, oldest first.
CREATE TABLE IF NOT EXISTS homebase_feedback_note (
  id              TEXT PRIMARY KEY,                             -- hfn_<uuid>
  feedback_id     TEXT NOT NULL REFERENCES homebase_feedback(id) ON DELETE CASCADE,
  note_type       TEXT NOT NULL DEFAULT 'note' CHECK (note_type IN ('note', 'status_change', 'priority_change')),
  body            TEXT,
  from_value      TEXT,
  to_value        TEXT,
  author_user_id  TEXT NOT NULL REFERENCES user(id),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homebase_feedback_note_feedback ON homebase_feedback_note (feedback_id, created_at);

-- The built-in role set "Internal Developer" (decision 2). Built in (is_system = 1), so the Role Sets screen shows it
-- read-only; it is given to people on top of their main role set (Firm Settings -> Users -> Roles), never as the
-- only one.
INSERT OR IGNORE INTO role_set (id, role_key, label, description, role_family, is_system, is_assignable, sort_order, is_active, created_at)
VALUES ('role_internal_developer', 'internal_developer', 'Internal Developer',
        'Developers of KR Homebase: every Homebase Feedback request, its triage and notes, and (stage F4) Dev View in the deployed app. Give it beside the person''s main role set.',
        'operations', 1, 1, 90, 1, datetime('now'));

INSERT OR IGNORE INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_create, can_read, can_update, can_delete, created_at)
VALUES ('rsp_internal_developer_developer_tools', 'role_internal_developer', 'developer_tools', 'Developer Tools', 'application', 0, 1, 1, 0, datetime('now'));
