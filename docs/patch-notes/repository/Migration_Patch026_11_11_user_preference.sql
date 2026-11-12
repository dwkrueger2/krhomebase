-- file: docs/patch-notes/repository/Migration_Patch026_11_11_user_preference.sql
--
-- User preferences (repository patch 26, Nov 11, 2026). Adds one table to the `krhomebase` D1 database.
-- Decision 1 of docs/08_Settings_Dashboard_Plan.md: preferences follow the person between computers, so they are
-- stored per user in the database (the old app kept them only in the browser's localStorage).
-- The requester applies this file; agents never run it (AGENTS_06). It lives under docs/patch-notes because
-- packages/db/migrations does not exist yet (open decision 10 in docs/01_Architecture_Proposal.md).
--
-- Expected starting schema: Schema_8.0 plus Migration_Patch016_11_09_workspace_tools.sql (checked read-only on
-- Nov 11, 2026: workspace_tool, workspace_tool_token and workspace_tool_audit exist; user_preference does not).
-- Rows preserved: no existing table is changed or read. Nothing is dropped.
-- Foreign-key order: "user" already exists; user_preference refers to it. ON DELETE CASCADE removes a person's
-- preferences with their user row.
--
-- One row per user and preference key. The API owns the list of keys and the shape of each value (zod, in
-- packages/contracts); the database only checks that the value is valid JSON. Planned keys (stage 2 and 3):
--   appearance   {"theme":"light"|"dark"}
--   session      {"autoLogoutMinutes":15|30|60|120|480}
--   navigation   {"startingSection":"dashboard"|...}
--   dashboard    {"widgets":{"employee-clock-in":{"enabled":true,"order":5}, ...}}
-- No secrets and no personal information belong in this table.
--
-- Apply (PowerShell, from D:\Repos\krhomebase):
--   $Repo = "D:\Repos\krhomebase"
--   $Db   = "krhomebase"
--   $Sql  = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch026_11_11_user_preference.sql"
--   Set-Location (Join-Path $Repo "apps\api")
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $Sql
--
-- Read-only verification after applying (same folder):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA table_info(user_preference);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_list(user_preference);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_check(user_preference);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM sqlite_schema WHERE tbl_name = 'user_preference' ORDER BY name;"

-- One saved preference value for one user.
CREATE TABLE user_preference (
  user_id TEXT NOT NULL,
  -- Preference name, for example 'appearance'. Lowercase letters, digits and hyphens; checked by the API.
  preference_key TEXT NOT NULL,
  -- The value as a JSON document. Its shape is defined per key in packages/contracts.
  value_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, preference_key),
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);
