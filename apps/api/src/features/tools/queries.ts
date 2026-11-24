// file: apps/api/src/features/tools/queries.ts
/**
 * The only file in the tools area that talks to D1. It reads and writes the three outside-tool tables
 * directly through the API's `krhomebase` D1 binding (not through the CRUD Worker, which knows only the
 * baseline tables):
 *
 *  - `workspace_tool`        one row per registered tool
 *  - `workspace_tool_token`  short-lived server-path access tokens (hashes only)
 *  - `workspace_tool_audit`  every tool call and every super-admin change (no bodies)
 *
 * The tables are created by `docs/Schema_8.0/migrations/Migration_Patch016_11_09_workspace_tools.sql`,
 * which the requester applies. Columns are snake_case; this file maps them to the camelCase records the
 * rules and routes use. JSON columns that do not parse are read as empty lists, so a bad row hides a tool
 * rather than crashing the menu.
 *
 * It also reads the active KR Homebase accounts (`user`, with `individual` for the name) for the permitted-user
 * check and the registration form's choices (`listPermittedUserChoices`, repository patch 80): read only, no write.
 */

import type { ToolAuditEntry, ToolPermittedUserChoice, ToolScope } from '@krhomebase/contracts'
import { ToolScopes } from '@krhomebase/contracts'
import type { ToolRecord } from './rules.ts'

/** A row of `workspace_tool`, as D1 returns it. */
interface ToolRow {
  id: string
  client_id: string
  label: string
  description: string
  icon: string
  menu_order: number
  origin: string
  entry_url: string
  allowed_roles: string
  permitted_users?: string | null
  /** Migration 058; missing (undefined) on a database before it, read as 0. */
  local_only?: number | null
  /** Migration 058; missing on a database before it, read as 0. */
  developers_only?: number | null
  /** Migration 080; missing on a database before it, read as 0. */
  sandbox_only?: number | null
  scopes: string
  status: string
  server_access_enabled: number
  server_ip_allowlist: string
  secret_hash: string | null
  secret_created_at: string | null
  previous_secret_hash: string | null
  previous_secret_valid_until: string | null
  created_at: string
  updated_at: string
}

/** Fields a registration change may set. */
export interface ToolChanges {
  label?: string
  description?: string
  icon?: string
  menuOrder?: number
  origin?: string
  entryUrl?: string
  allowedRoles?: string[]
  permittedUsers?: string[]
  localOnly?: boolean
  developersOnly?: boolean
  sandboxOnly?: boolean
  scopes?: ToolScope[]
  status?: 'active' | 'disabled'
  serverAccessEnabled?: boolean
  serverIpAllowlist?: string[]
}

/** A stored token, found by its hash. */
export interface TokenRecord {
  toolId: string
  scopes: ToolScope[]
  expiresAt: string
}

/** Everything the tools area reads or writes. Tests supply the same interface over an in-memory database. */
export interface ToolQueries {
  listTools(): Promise<ToolRecord[]>
  findToolById(id: string): Promise<ToolRecord | null>
  findToolByClientId(clientId: string): Promise<ToolRecord | null>
  insertTool(tool: ToolRecord, userId: string): Promise<void>
  updateTool(id: string, changes: ToolChanges, userId: string, now: string): Promise<void>
  deleteTool(id: string): Promise<void>
  setSecret(id: string, secret: { hash: string; createdAt: string; previousHash: string | null; previousValidUntil: string | null }, userId: string): Promise<void>
  deleteTokensForTool(toolId: string): Promise<void>
  insertToken(token: { hash: string; toolId: string; scopes: ToolScope[]; expiresAt: string; createdAt: string }): Promise<void>
  findToken(hash: string): Promise<TokenRecord | null>
  deleteExpiredTokens(now: string): Promise<void>
  insertAudit(entry: ToolAuditEntry & { toolId: string }): Promise<void>
  listAudit(toolId: string, limit: number): Promise<ToolAuditEntry[]>
  /** The active KR Homebase accounts (`user.is_active = 1`, `account_status = 'active'`), by name. */
  listPermittedUserChoices(): Promise<ToolPermittedUserChoice[]>
}

/**
 * Thrown when the tools tables do not exist yet (the migration has not been applied). `app.ts` answers it with
 * 503 `TOOLS_UNAVAILABLE` instead of a general server error.
 */
export class ToolsUnavailableError extends Error {
  constructor() {
    super('TOOLS_UNAVAILABLE: the workspace_tool tables are missing')
    this.name = 'ToolsUnavailableError'
  }
}

/** Runs a query and turns D1's "no such table" error into `ToolsUnavailableError`. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) throw new ToolsUnavailableError()
    throw error
  }
}

/** Parses a JSON list column; anything that is not a list of strings becomes an empty list. */
function stringList(text: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(text ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** Like `stringList`, keeping only known permission names. */
function scopeList(text: string | null | undefined): ToolScope[] {
  return stringList(text).filter((item): item is ToolScope => (ToolScopes as readonly string[]).includes(item))
}

/**
 * Reads the permitted emails, lowercase and without repeats. A missing or malformed value denies everyone (migration 073
 * filled every row, so a missing value is not expected); the API checked each email against the accounts when it was saved.
 */
function permittedUserList(text: string | null | undefined): string[] {
  const emails = stringList(text).map((email) => email.trim().toLowerCase()).filter((email) => email.includes('@'))
  return [...new Set(emails)]
}

/**
 * 1 when the account holds, now, a role set that grants `developer_tools` read (the built-in Internal Developer) or the
 * built-in Super Admin, else 0. The same rule as the Homebase Feedback list's `DEVELOPER_SENDER`; overrides are not
 * counted: it only chooses the default permitted users and marks the choices.
 */
const ACCOUNT_IS_DEVELOPER = `CASE WHEN u.role = 'super_admin' OR EXISTS (
         SELECT 1 FROM user_role_set urs
          WHERE urs.user_id = u.id AND urs.is_active = 1
            AND (urs.role_set_id = 'role_super_admin' OR EXISTS (
                  SELECT 1 FROM role_set_permission rsp
                   WHERE rsp.role_set_id = urs.role_set_id AND rsp.permission_key = 'developer_tools' AND rsp.can_read = 1))) THEN 1 ELSE 0 END`

/** A row of the permitted-user choices query. */
interface AccountRow {
  email: string
  preferred_name: string | null
  first_name: string | null
  last_name: string | null
  is_developer: number
}

/** The account's display name: preferred or first name and last name, else its email. */
function accountName(row: AccountRow): string {
  const name = [row.preferred_name?.trim() || row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(' ')
  return name || row.email
}

/** Maps a `workspace_tool` row to the record the rules use. */
function toRecord(row: ToolRow): ToolRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    label: row.label,
    description: row.description,
    icon: row.icon,
    menuOrder: Number(row.menu_order),
    origin: row.origin,
    entryUrl: row.entry_url,
    allowedRoles: stringList(row.allowed_roles),
    permittedUsers: permittedUserList(row.permitted_users),
    // Before migration 058 the columns are missing: every tool reads as shown everywhere, as it was.
    localOnly: Number(row.local_only ?? 0) === 1,
    developersOnly: Number(row.developers_only ?? 0) === 1,
    // Before migration 080 the column is missing: every tool reads as reaching KR Homebase, as it was.
    sandboxOnly: Number(row.sandbox_only ?? 0) === 1,
    scopes: scopeList(row.scopes),
    status: row.status === 'active' ? 'active' : 'disabled',
    serverAccessEnabled: Number(row.server_access_enabled) === 1,
    serverIpAllowlist: stringList(row.server_ip_allowlist),
    secretHash: row.secret_hash,
    secretCreatedAt: row.secret_created_at,
    previousSecretHash: row.previous_secret_hash,
    previousSecretValidUntil: row.previous_secret_valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Column for each changeable field, and how its value is stored. */
const CHANGE_COLUMNS: { [K in keyof ToolChanges]-?: [column: string, store: (value: NonNullable<ToolChanges[K]>) => string | number] } = {
  label: ['label', (v) => v],
  description: ['description', (v) => v],
  icon: ['icon', (v) => v],
  menuOrder: ['menu_order', (v) => v],
  origin: ['origin', (v) => v],
  entryUrl: ['entry_url', (v) => v],
  allowedRoles: ['allowed_roles', (v) => JSON.stringify(v)],
  permittedUsers: ['permitted_users', (v) => JSON.stringify(v)],
  localOnly: ['local_only', (v) => (v ? 1 : 0)],
  developersOnly: ['developers_only', (v) => (v ? 1 : 0)],
  sandboxOnly: ['sandbox_only', (v) => (v ? 1 : 0)],
  scopes: ['scopes', (v) => JSON.stringify(v)],
  status: ['status', (v) => v],
  serverAccessEnabled: ['server_access_enabled', (v) => (v ? 1 : 0)],
  serverIpAllowlist: ['server_ip_allowlist', (v) => JSON.stringify(v)],
}

/**
 * Builds the tools queries over a D1 database.
 *
 * @param db - The `krhomebase` D1 binding.
 * @returns The `ToolQueries` used by the routes and the sign-in middleware.
 */
export function createToolQueries(db: D1Database): ToolQueries {
  const queries: ToolQueries = {
    async listTools() {
      const { results } = await db.prepare('SELECT * FROM workspace_tool ORDER BY menu_order, label').all<ToolRow>()
      return results.map(toRecord)
    },

    async findToolById(id) {
      const row = await db.prepare('SELECT * FROM workspace_tool WHERE id = ?').bind(id).first<ToolRow>()
      return row ? toRecord(row) : null
    },

    async findToolByClientId(clientId) {
      const row = await db.prepare('SELECT * FROM workspace_tool WHERE client_id = ?').bind(clientId).first<ToolRow>()
      return row ? toRecord(row) : null
    },

    async insertTool(tool, userId) {
      await db
        .prepare(
          `INSERT INTO workspace_tool (id, client_id, label, description, icon, menu_order, origin, entry_url, allowed_roles, permitted_users, local_only,
             developers_only, sandbox_only, scopes, status, server_access_enabled, server_ip_allowlist, secret_hash, secret_created_at, previous_secret_hash,
             previous_secret_valid_until, created_at, created_by_user_id, updated_at, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          tool.id,
          tool.clientId,
          tool.label,
          tool.description,
          tool.icon,
          tool.menuOrder,
          tool.origin,
          tool.entryUrl,
          JSON.stringify(tool.allowedRoles),
          JSON.stringify(tool.permittedUsers),
          tool.localOnly ? 1 : 0,
          tool.developersOnly ? 1 : 0,
          tool.sandboxOnly ? 1 : 0,
          JSON.stringify(tool.scopes),
          tool.status,
          tool.serverAccessEnabled ? 1 : 0,
          JSON.stringify(tool.serverIpAllowlist),
          tool.secretHash,
          tool.secretCreatedAt,
          tool.previousSecretHash,
          tool.previousSecretValidUntil,
          tool.createdAt,
          userId,
          tool.updatedAt,
          userId,
        )
        .run()
    },

    async updateTool(id, changes, userId, now) {
      const sets: string[] = []
      const values: (string | number)[] = []
      for (const [key, [column, store]] of Object.entries(CHANGE_COLUMNS) as [keyof ToolChanges, [string, (v: never) => string | number]][]) {
        const value = changes[key]
        if (value === undefined) continue
        sets.push(`${column} = ?`)
        values.push(store(value as never))
      }
      sets.push('updated_at = ?', 'updated_by_user_id = ?')
      values.push(now, userId)
      await db
        .prepare(`UPDATE workspace_tool SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values, id)
        .run()
    },

    async deleteTool(id) {
      // Tokens go first: the foreign key cascades, but this does not rely on it.
      await db.batch([
        db.prepare('DELETE FROM workspace_tool_token WHERE tool_id = ?').bind(id),
        db.prepare('DELETE FROM workspace_tool WHERE id = ?').bind(id),
      ])
    },

    async setSecret(id, secret, userId) {
      await db
        .prepare(
          'UPDATE workspace_tool SET secret_hash = ?, secret_created_at = ?, previous_secret_hash = ?, previous_secret_valid_until = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?',
        )
        .bind(secret.hash, secret.createdAt, secret.previousHash, secret.previousValidUntil, secret.createdAt, userId, id)
        .run()
    },

    async deleteTokensForTool(toolId) {
      await db.prepare('DELETE FROM workspace_tool_token WHERE tool_id = ?').bind(toolId).run()
    },

    async insertToken(token) {
      await db
        .prepare('INSERT INTO workspace_tool_token (token_hash, tool_id, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(token.hash, token.toolId, JSON.stringify(token.scopes), token.expiresAt, token.createdAt)
        .run()
    },

    async findToken(hash) {
      const row = await db
        .prepare('SELECT tool_id, scopes, expires_at FROM workspace_tool_token WHERE token_hash = ?')
        .bind(hash)
        .first<{ tool_id: string; scopes: string; expires_at: string }>()
      return row ? { toolId: row.tool_id, scopes: scopeList(row.scopes), expiresAt: row.expires_at } : null
    },

    async deleteExpiredTokens(now) {
      await db.prepare('DELETE FROM workspace_tool_token WHERE expires_at <= ?').bind(now).run()
    },

    async insertAudit(entry) {
      await db
        .prepare('INSERT INTO workspace_tool_audit (id, tool_id, channel, user_id, method, path, status, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(entry.id, entry.toolId, entry.channel, entry.userId, entry.method, entry.path, entry.status, entry.requestId, entry.createdAt)
        .run()
    },

    async listAudit(toolId, limit) {
      const { results } = await db
        .prepare('SELECT id, channel, user_id, method, path, status, request_id, created_at FROM workspace_tool_audit WHERE tool_id = ? ORDER BY created_at DESC LIMIT ?')
        .bind(toolId, limit)
        .all<{ id: string; channel: ToolAuditEntry['channel']; user_id: string | null; method: string; path: string; status: number; request_id: string; created_at: string }>()
      return results.map((row) => ({
        id: row.id,
        channel: row.channel,
        userId: row.user_id,
        method: row.method,
        path: row.path,
        status: Number(row.status),
        requestId: row.request_id,
        createdAt: row.created_at,
      }))
    },

    async listPermittedUserChoices() {
      const { results } = await db
        .prepare(
          `SELECT LOWER(TRIM(u.email)) AS email, i.preferred_name, i.first_name, i.last_name, ${ACCOUNT_IS_DEVELOPER} AS is_developer
             FROM user u
             LEFT JOIN individual i ON i.id = u.individual_id
            WHERE u.is_active = 1 AND u.account_status = 'active'`,
        )
        .all<AccountRow>()
      return results
        .map((row) => ({ email: row.email, name: accountName(row), isDeveloper: Number(row.is_developer) === 1 }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
    },
  }
  // Every method goes through `guarded`, so a missing table is reported the same way everywhere.
  return Object.fromEntries(
    Object.entries(queries).map(([name, method]) => [name, (...args: unknown[]) => guarded(() => (method as (...a: unknown[]) => Promise<unknown>)(...args))]),
  ) as unknown as ToolQueries
}

/**
 * The queries for this request, or null when the database binding is missing (for example in a test that
 * gives no bindings). Callers answer 503 `TOOLS_UNAVAILABLE` on null.
 */
export function toolQueriesFor(env: { krhomebase?: D1Database } | undefined): ToolQueries | null {
  return env?.krhomebase ? createToolQueries(env.krhomebase) : null
}
