-- file: docs/Schema_8.0/migrations/Migration_Patch058_11_17_tool_visibility.sql
--
-- Migration 058 (repository patch 58, Nov 17, 2026): two visibility options for outside tools (the requester).
--   local_only:      1 = the tool is shown and usable only while KR Homebase runs under `pnpm dev` (the API's
--                    KR_APP_BASE_URL is a localhost address). The deployed API treats it as if it did not exist.
--                    For a tool registered at a local address, such as the Feedback Viewer on http://localhost:5174.
--   developers_only: 1 = the tool is shown and usable only by people who hold the permission developer_tools read
--                    (the built-in role set "Internal Developer"; the built-in Super Admin holds every permission).
-- Both default to 0, so every existing tool keeps exactly what it shows today.
--
-- Why not a role: allowed_roles holds user.role values (super_admin, staff, ...). "Internal Developer" is a role set
-- held beside a person's main role set, not a user.role value, so a role list cannot name it.
--
-- Expected starting schema: Schema 8.0 plus migrations 016 (workspace_tool) and 044 (kr_schema_migration), with
-- workspace_tool as migration 016 created it (21 columns, no local_only or developers_only). Check first (read-only,
-- from apps\api; checked by Claude on Nov 17, 2026: 057 is the newest row and the two columns do not exist):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('016', '044', '058') ORDER BY id;"
--     must list 016 and 044 (016 may be missing: migrations before 044 were recorded only from 033 on), and not 058.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM pragma_table_info('workspace_tool') WHERE name IN ('local_only', 'developers_only');"
--     must return no rows.
--
-- Rows preserved: every row; ADD COLUMN changes no data and rebuilds nothing. No foreign keys are added or touched
-- (workspace_tool_token refers to workspace_tool(id), which is unchanged). No circular references.
-- Responsibilities kept apart: the API decides who sees a tool (features/tools/rules.ts `toolRefusal`); these CHECK
-- rules only keep the values to 0 and 1. Apply this file BEFORE deploying API patch 46: the new API writes both
-- columns when a tool is registered or changed. (It reads a missing column as 0, so the menu still works if the order
-- is wrong, but saving a registration would fail.)
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch058_11_17_tool_visibility.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT label, local_only, developers_only FROM workspace_tool ORDER BY menu_order, label;"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, applied_at FROM kr_schema_migration WHERE id = '058';"

ALTER TABLE workspace_tool ADD COLUMN local_only INTEGER NOT NULL DEFAULT 0 CHECK (local_only IN (0, 1));
ALTER TABLE workspace_tool ADD COLUMN developers_only INTEGER NOT NULL DEFAULT 0 CHECK (developers_only IN (0, 1));

-- Last statement: this migration's own row (written only if everything above succeeded).
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('058', 'Migration_Patch058_11_17_tool_visibility.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Outside tools: workspace_tool.local_only and developers_only (default 0).');
