-- file: docs/Schema_8.0/migrations/Migration_Patch073_11_21_tool_permitted_users.sql
--
-- Migration 073 (repository patch 73, Nov 21, 2026): exact permitted sign-in emails for each outside tool.
-- Adds workspace_tool.permitted_users as JSON text. Existing registrations default to all three approved accounts;
-- the registration form may narrow that list. The API checks it for menu visibility, health checks and every frame
-- call, including calls by super admins. The server-only GET /v1/tools/permitted-users returns the caller's own list
-- when its token has the new tool-registration:read scope.
--
-- Expected starting schema: migrations 016 (workspace_tool), 044 (kr_schema_migration), and 058 (tool visibility).
-- This adds one column only; it changes no rows, indexes, foreign keys or other tables.
-- Owner verification (Nov 21, 2026): migration row 073 and workspace_tool.permitted_users both exist in krhomebase.
-- Do not apply or rerun this migration.
--
-- Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('016', '044', '058', '073') ORDER BY id;"
--     must list 016, 044 and 058 (016 may be missing because it predates the migration log), and not 073.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM pragma_table_info('workspace_tool') WHERE name = 'permitted_users';"
--     must return no rows.
--
-- Apply (the requester; PowerShell, from apps\api):
--   Set-Location "D:\Repos\krhomebase\apps\api"
--   $SetLocation = (Get-Location).Path
--   $Repo = Split-Path $SetLocation -Parent
--   $Db = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch073_11_21_tool_permitted_users.sql"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT label, permitted_users FROM workspace_tool ORDER BY menu_order, label;"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, file_name, applied_at FROM kr_schema_migration WHERE id = '073';"

ALTER TABLE workspace_tool ADD COLUMN permitted_users TEXT NOT NULL DEFAULT '["dankrueger@legaldrive.net","marcusrichard@legaldrive.net","davismcclellan@legaldrive.net"]';

-- Last statement: this migration's own row (written only if everything above succeeded).
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('073', 'Migration_Patch073_11_21_tool_permitted_users.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Outside tools: exact permitted login emails and tool-registration:read server scope.');
