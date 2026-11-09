-- file: docs/patch-notes/repository/Migration_Patch016_11_09_workspace_tools.sql
--
-- Outside tools (repository patch 16, Nov 9, 2026). Adds three new tables to the `krhomebase` D1 database.
-- The requester applies this file; agents never run it (AGENTS_06). It lives under docs/patch-notes because
-- packages/db/migrations does not exist yet (open decision 10 in docs/01_Architecture_Proposal.md).
--
-- Expected starting schema: the Schema_8.0 baseline. None of the three tables exists yet.
-- Rows preserved: no existing table is changed or read. Nothing is dropped.
-- Foreign-key order: workspace_tool first; workspace_tool_token refers to it (ON DELETE CASCADE, so deleting a
-- tool ends its tokens). workspace_tool_audit has no foreign key on purpose: audit rows outlive a deleted tool.
-- The user ids (created_by_user_id, updated_by_user_id, user_id) are checked by the API, not by a foreign key,
-- so this file does not depend on the shape of the `user` table.
--
-- Secrets: only SHA-256 hashes of client secrets and access tokens are stored, never the values.
--
-- Read-only verification after applying (PowerShell, from D:\Repos\krhomebase):
--   $Db = "krhomebase"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --command "PRAGMA table_info(workspace_tool);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --command "PRAGMA foreign_key_list(workspace_tool_token);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --command "PRAGMA foreign_key_check;"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --command "SELECT name FROM sqlite_schema WHERE name LIKE 'workspace_tool%' ORDER BY name;"

-- One row per registered outside tool.
CREATE TABLE workspace_tool (
  id TEXT PRIMARY KEY,
  -- Public id given to the developer (krt_...). Unique.
  client_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- One of the menu icon names (ToolIconNames in packages/contracts/src/tools.ts).
  icon TEXT NOT NULL DEFAULT 'documents',
  menu_order INTEGER NOT NULL DEFAULT 100,
  -- Origin of entry_url (scheme, host, port). The frame may load only from here.
  origin TEXT NOT NULL,
  entry_url TEXT NOT NULL,
  -- JSON array of role names, for example ["staff","super_admin"].
  allowed_roles TEXT NOT NULL DEFAULT '[]',
  -- JSON array of granted permissions, for example ["contacts:read"].
  scopes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  -- 1 when the tool server may get access tokens (path B).
  server_access_enabled INTEGER NOT NULL DEFAULT 0 CHECK (server_access_enabled IN (0, 1)),
  -- JSON array of IP addresses. Empty array allows any address.
  server_ip_allowlist TEXT NOT NULL DEFAULT '[]',
  -- SHA-256 (hex) of the current client secret, or NULL when none was made.
  secret_hash TEXT,
  secret_created_at TEXT,
  -- The secret replaced last, kept working until previous_secret_valid_until.
  previous_secret_hash TEXT,
  previous_secret_valid_until TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);

CREATE INDEX idx_workspace_tool_status_order ON workspace_tool (status, menu_order);

-- Short-lived access tokens for the server path. One row per issued token.
CREATE TABLE workspace_tool_token (
  -- SHA-256 (hex) of the token. The token itself is never stored.
  token_hash TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES workspace_tool (id) ON DELETE CASCADE,
  -- JSON array of the permissions this token carries (a subset of the tool's scopes when it was issued).
  scopes TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_workspace_tool_token_tool ON workspace_tool_token (tool_id);
CREATE INDEX idx_workspace_tool_token_expires ON workspace_tool_token (expires_at);

-- Every call an outside tool made, and every change a super admin made to a registration.
-- Holds no request or reply bodies.
CREATE TABLE workspace_tool_audit (
  id TEXT PRIMARY KEY,
  -- Kept as text with no foreign key, so the rows stay after the tool is deleted.
  tool_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('frame', 'server', 'admin')),
  user_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_workspace_tool_audit_tool_time ON workspace_tool_audit (tool_id, created_at);
