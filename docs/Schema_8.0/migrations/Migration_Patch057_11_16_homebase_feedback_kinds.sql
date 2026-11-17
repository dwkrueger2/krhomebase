-- file: docs/Schema_8.0/migrations/Migration_Patch057_11_16_homebase_feedback_kinds.sql
--
-- Migration 057 (repository patch 57, Nov 16, 2026): new Homebase Feedback kinds and statuses.
--   kind:   adds 'usability' (FB-0006: classification Bug, Usability, Feature request). The stored values 'issue' and
--           'feature' keep their names; the screens show them as "Bug" and "Feature request".
--   status: adds 'reopened' and 'needs_info' (the requester, Nov 16, 2026, after reviewing Davis's feedback hub).
-- Priority is unchanged ('low', 'normal', 'high', 'urgent'); the screens show it as P4 to P1.
--
-- Why a rebuild: SQLite cannot change a CHECK rule in place (D1 refuses writable_schema), so homebase_feedback is
-- created again with the wider rules and its rows copied across.
--
-- Why the child tables are rebuilt too (AGENTS_06, "inspect incoming foreign keys"): homebase_feedback_marker,
-- homebase_feedback_image and homebase_feedback_note refer to homebase_feedback(id) ON DELETE CASCADE. With foreign
-- keys on (D1 always has them on), DROP TABLE homebase_feedback first deletes its rows, and that delete CASCADES into
-- the three child tables: every marker, screenshot record and note would be lost. `defer_foreign_keys` defers the
-- checks but not the cascade. So the child rows are copied to keep tables first, the child tables are dropped (no
-- cascade starts from a child), then the parent, and all four are created again and filled from the copies.
--
-- Expected starting schema: Schema 8.0 plus migrations 016 to 044, with migration 033's four homebase_feedback tables
-- exactly as created there (no columns added since). Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('033', '044', '057') ORDER BY id;"
--     must list 033 and 044, and not 057.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT (SELECT COUNT(*) FROM homebase_feedback) AS requests, (SELECT COUNT(*) FROM homebase_feedback_marker) AS markers, (SELECT COUNT(*) FROM homebase_feedback_image) AS images, (SELECT COUNT(*) FROM homebase_feedback_note) AS notes;"
--     write the four counts down; the same query afterwards must give the same four numbers.
--
-- Rows preserved: every row of all four tables, with every column, ids unchanged. Nothing is discarded. The R2
-- screenshots are not touched (the image rows keep their r2_key).
-- Foreign-key order: keep copies first; drop children (marker, image, note) before the parent; create the parent
-- before the children; fill the parent before the children. `defer_foreign_keys` is on so the checks run once, at the
-- end of the file's implicit transaction. No circular references.
-- Responsibilities kept apart: the API checks a kind or status against the contracts (packages/contracts/src/
-- homebaseFeedback.ts) before writing; the database CHECK rules below are the last line. Both lists change together in
-- repository patch 57 / API patch 45. Apply this file BEFORE deploying that API: the old API never sends the new
-- values, so it works with the new table too, but the new API's values would fail the old CHECK rules.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch057_11_16_homebase_feedback_kinds.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only, same folder):
--   the counts query above (same four numbers), and
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT sql FROM sqlite_master WHERE name = 'homebase_feedback';"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_check;"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, file_name, applied_at FROM kr_schema_migration WHERE id = '057';"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE name LIKE 'homebase_feedback%' ORDER BY name;"
--     lists the four tables and their indexes, and no *_keep table.

PRAGMA defer_foreign_keys = on;

-- 1. Keep copies of the child rows (plain tables: D1 runs the file as one transaction, so a failure leaves nothing).
CREATE TABLE homebase_feedback_marker_keep AS SELECT * FROM homebase_feedback_marker;
CREATE TABLE homebase_feedback_image_keep AS SELECT * FROM homebase_feedback_image;
CREATE TABLE homebase_feedback_note_keep AS SELECT * FROM homebase_feedback_note;

-- 2. The parent's new table, with the wider CHECK rules (every other column as in migration 033).
CREATE TABLE homebase_feedback_new (
  id                    TEXT PRIMARY KEY,                       -- hfb_<uuid>
  number                INTEGER NOT NULL UNIQUE CHECK (number > 0), -- 12 is FB-0012
  kind                  TEXT NOT NULL CHECK (kind IN ('issue', 'usability', 'feature', 'question')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'reopened', 'triaged', 'needs_info', 'planned', 'in_progress', 'done', 'will_not_do')),
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

INSERT INTO homebase_feedback_new (id, number, kind, title, body, status, priority, submitted_by_user_id, submitter_role,
  page_address, section_id, open_item, page_title, web_version, deployment_id, deployment_time, window_width,
  window_height, theme, created_at, updated_at)
SELECT id, number, kind, title, body, status, priority, submitted_by_user_id, submitter_role,
  page_address, section_id, open_item, page_title, web_version, deployment_id, deployment_time, window_width,
  window_height, theme, created_at, updated_at
  FROM homebase_feedback;

-- 3. Drop the children first (no cascade starts from a child), then the old parent.
DROP TABLE homebase_feedback_marker;
DROP TABLE homebase_feedback_image;
DROP TABLE homebase_feedback_note;
DROP TABLE homebase_feedback;

-- 4. The new parent takes the old name; its indexes again.
ALTER TABLE homebase_feedback_new RENAME TO homebase_feedback;
CREATE INDEX IF NOT EXISTS idx_homebase_feedback_status ON homebase_feedback (status, number);
CREATE INDEX IF NOT EXISTS idx_homebase_feedback_submitter ON homebase_feedback (submitted_by_user_id, number);

-- 5. The three child tables again, exactly as migration 033 created them, filled from the copies.
CREATE TABLE homebase_feedback_marker (
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
INSERT INTO homebase_feedback_marker (id, feedback_id, attribute, value, found_at_capture, box_json, sort_order, created_at)
SELECT id, feedback_id, attribute, value, found_at_capture, box_json, sort_order, created_at FROM homebase_feedback_marker_keep;

CREATE TABLE homebase_feedback_image (
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
INSERT INTO homebase_feedback_image (id, feedback_id, r2_key, content_type, byte_size, width, height, shapes_json, marker_map_json, created_by_user_id, created_at)
SELECT id, feedback_id, r2_key, content_type, byte_size, width, height, shapes_json, marker_map_json, created_by_user_id, created_at FROM homebase_feedback_image_keep;

CREATE TABLE homebase_feedback_note (
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
-- rowid order is kept, so notes written in the same second still read oldest first (the API orders by created_at, rowid).
INSERT INTO homebase_feedback_note (id, feedback_id, note_type, body, from_value, to_value, author_user_id, created_at)
SELECT id, feedback_id, note_type, body, from_value, to_value, author_user_id, created_at FROM homebase_feedback_note_keep ORDER BY rowid;

-- 6. The copies are no longer needed.
DROP TABLE homebase_feedback_marker_keep;
DROP TABLE homebase_feedback_image_keep;
DROP TABLE homebase_feedback_note_keep;

-- Last statement: this migration's own row (written only if everything above succeeded).
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('057', 'Migration_Patch057_11_16_homebase_feedback_kinds.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Homebase Feedback: kind usability; statuses reopened and needs_info (four tables rebuilt, rows kept).');
