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
 * The tables are created by `docs/patch-notes/repository/Migration_Patch016_11_09_workspace_tools.sql`,
 * which the requester applies. Columns are snake_case; this file maps them to the camelCase records the
 * rules and routes use. JSON columns that do not parse are read as empty lists, so a bad row hides a tool
 * rather than crashing the menu.
 */

import type { ToolAuditEntry, ToolScope } from '@krhomebase/contracts'
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
          `INSERT INTO workspace_tool (id, client_id, label, description, icon, menu_order, origin, entry_url, allowed_roles, scopes, status,
             server_access_enabled, server_ip_allowlist, secret_hash, secret_created_at, previous_secret_hash, previous_secret_valid_until,
             created_at, created_by_user_id, updated_at, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
