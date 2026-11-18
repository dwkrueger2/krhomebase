-- file: docs/Schema_8.0/migrations/Migration_Patch003_11_18_task_notes.sql
--
-- Migration 003 (repository 1.2.0 patch 3, Nov 18, 2026): follow-up notes on a task (the requester: "Tasks should be
-- able to have notes"; API 1.2.0 patch 2, web patch 571). A new table only; no existing table changes.
--
-- What it does: creates `task_note`, one row per note: `id` (`tno_<uuid>`), `task_id`, `body`, `author_user_id` (the
-- person who wrote it, from the session) and `created_at`. Notes are added and never changed; a note goes with its task
-- (ON DELETE CASCADE; tasks have no delete route today). The index serves "this task's notes, newest first".
--
-- Expected starting schema: Schema 8.0 plus migration 044 (kr_schema_migration) and migration 002 (Nov 18, 2026).
-- Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('002', '003') ORDER BY id; SELECT name FROM sqlite_schema WHERE name = 'task_note';"
--     must list 002 and not 003, and no table.
--
-- Rows preserved: every row (nothing is changed or removed). Foreign keys: `task(id)` and `user(id)` exist before this
-- table is created. Order: apply BEFORE deploying API 1.2.0 patch 2; until then that API's note routes answer 503
-- TASKS_UNAVAILABLE (the rest of Tasks works). The API before it ignores the table.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch003_11_18_task_notes.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA table_info(task_note); PRAGMA foreign_key_list(task_note); SELECT id, applied_at FROM kr_schema_migration WHERE id = '003';"
--   Expect five columns, two foreign keys (task, user) and the log row 003.

CREATE TABLE task_note (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL,
    body           TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (task_id)        REFERENCES task(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES user(id)
);

CREATE INDEX idx_task_note_task_created ON task_note(task_id, created_at);

-- Last statement: the migration log row (AGENTS_06), written only when every statement above succeeded.
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('003', 'Migration_Patch003_11_18_task_notes.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Table task_note: follow-up notes on a task (newest first by task_id, created_at).');
