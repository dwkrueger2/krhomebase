-- file: docs/Schema_8.0/migrations/Migration_Patch080_11_23_tool_sandbox_only.sql
--
-- Migration 080 (repository patch 80, Nov 23, 2026): a third Shown option for outside tools (the requester).
--   sandbox_only: 1 = the tool may use the tool sandbox (krhomebase-sandbox-api, made-up data) only. KR Homebase treats
--                 it as not there for everyone, super admins included: no menu entry, no access token, and every frame
--                 or server call refused with TOOL_FORBIDDEN, reason tool_sandbox_only. Its sandbox secret still works.
--                 For a tool such as Hello KRH that asks for permissions only for its sandbox tests: KR Homebase, not the
--                 tool's own code, keeps it off firm data.
-- Defaults to 0, so every existing tool keeps exactly what it reaches today.
--
-- Expected starting schema: Schema 8.0 plus migrations 016 (workspace_tool), 044 (kr_schema_migration), 058
-- (local_only, developers_only) and 073 (permitted_users); workspace_tool has no sandbox_only column. Check first
-- (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('044', '058', '073', '080') ORDER BY id;"
--     must list 044, 058 and 073, and not 080.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM pragma_table_info('workspace_tool') WHERE name = 'sandbox_only';"
--     must return no rows.
--
-- Rows preserved: every row; ADD COLUMN changes no data and rebuilds nothing. No foreign keys are added or touched
-- (workspace_tool_token refers to workspace_tool(id), which is unchanged). No circular references.
-- Responsibilities kept apart: the API decides who may use a tool (features/tools/rules.ts `toolRefusal`, the token
-- route and the server gate in platform/authGuard.ts); this CHECK rule only keeps the value to 0 and 1.
-- Apply this file BEFORE deploying API patch 59: the new API writes the column when a tool is registered or changed. (It
-- reads a missing column as 0, so the menu still works if the order is wrong, but saving a registration would fail.)
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch080_11_23_tool_sandbox_only.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT label, local_only, developers_only, sandbox_only FROM workspace_tool ORDER BY menu_order, label;"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, applied_at FROM kr_schema_migration WHERE id = '080';"

ALTER TABLE workspace_tool ADD COLUMN sandbox_only INTEGER NOT NULL DEFAULT 0 CHECK (sandbox_only IN (0, 1));

-- Last statement: this migration's own row (written only if everything above succeeded).
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('080', 'Migration_Patch080_11_23_tool_sandbox_only.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Outside tools: workspace_tool.sandbox_only (default 0).');
