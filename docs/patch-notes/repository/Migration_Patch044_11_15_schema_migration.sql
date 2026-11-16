-- file: docs/patch-notes/repository/Migration_Patch044_11_15_schema_migration.sql
-- Migration 044 (repository patch 44, Nov 15, 2026): the migration log, kr_schema_migration.
--
-- Purpose (the requester, Nov 15, 2026): "when migrations are successful ... the final command applies some sort of
-- status to the database so we know what migrations have been applied." From now on every migration file ends with
-- one INSERT into this table (AGENTS_06, "The migration log"). D1 runs an uploaded file inside one implicit
-- transaction, so that row is written only when every statement before it succeeded; a failed migration leaves no
-- row and changes nothing.
--
-- This migration creates the table and records the five migrations already applied. Each was checked read-only on
-- Nov 15, 2026 against the live database before this file was written:
--   016 workspace_tool, workspace_tool_token, workspace_tool_audit exist (3 of 3)
--   026 user_preference exists
--   031 content_asset has its six license_* columns
--   033 homebase_feedback, _marker, _image, _note exist (4 of 4)
--   034 kr_maintenance_gate has its five deploy_* columns
-- Their applied_at is unknown (NULL); recorded_at says when this log learned of them.
--
-- Expected starting schema: Schema 8.0 plus migrations 016 to 034. One new table, no foreign keys, nothing existing
-- changes. Safe to run twice: CREATE TABLE IF NOT EXISTS and INSERT OR IGNORE.
--
-- Check first (read-only): must list nothing.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE name = 'kr_schema_migration';"
--
-- Apply (the requester; from apps\api):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch044_11_15_schema_migration.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only): six rows, 016 to 044.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, file_name, applied_at, recorded_at FROM kr_schema_migration ORDER BY id;"

-- One row per migration applied to this database.
CREATE TABLE IF NOT EXISTS kr_schema_migration (
  -- The migration number: the repository patch number, three digits ('034').
  id TEXT PRIMARY KEY CHECK (length(id) = 3),
  -- The file in docs/patch-notes/repository (or packages/db/migrations once it exists).
  file_name TEXT NOT NULL,
  -- When the file ran, as written by its own last statement (ISO time, UTC); NULL for migrations applied before this log.
  applied_at TEXT,
  -- When this row was written (ISO time, UTC).
  recorded_at TEXT NOT NULL,
  -- How it was applied, for example 'wrangler d1 execute --file (the requester)'.
  applied_by TEXT NOT NULL,
  -- One line on what the migration did.
  summary TEXT NOT NULL
);

-- The migrations applied before this log existed (checked read-only, see above).
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('016', 'Migration_Patch016_11_09_workspace_tools.sql', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'before the log (recorded by migration 044)', 'Outside tools: workspace_tool, workspace_tool_token, workspace_tool_audit.'),
  ('026', 'Migration_Patch026_11_11_user_preference.sql', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'before the log (recorded by migration 044)', 'user_preference.'),
  ('031', 'Migration_Patch031_11_13_content_asset_license.sql', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'before the log (recorded by migration 044)', 'content_asset license columns.'),
  ('033', 'Migration_Patch033_11_13_homebase_feedback.sql', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'before the log (recorded by migration 044)', 'Homebase Feedback tables and the Internal Developer role set.'),
  ('034', 'Migration_Patch034_11_14_deploy_window.sql', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'before the log (recorded by migration 044)', 'Deploy window columns on kr_maintenance_gate.');

-- Last statement of every migration: its own row (written only if everything above succeeded).
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('044', 'Migration_Patch044_11_15_schema_migration.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'The migration log, kr_schema_migration.');
