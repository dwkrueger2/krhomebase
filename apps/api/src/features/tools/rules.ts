// file: apps/api/src/features/tools/rules.ts
/**
 * Outside-tool business rules. Pure functions: no network, no database.
 *
 *  - Where a tool may be hosted (`parseToolEntryUrl`): https only, except http://localhost and
 *    http://127.0.0.1 for a developer's own computer, and never the app's own origin. A frame from the app's
 *    own origin would escape the sandbox, because the frame is given `allow-scripts allow-same-origin`.
 *  - Who may use a tool (`toolRefusal`, `toolUsableBy`): the tool is active; a sandbox-only tool never (migration 080:
 *    it reaches the tool sandbox's made-up data only, so KR Homebase treats it as not there); a local-only tool only on a
 *    development server (`pnpm dev`); the person's role is on its list (any one of them; `super_admin` is always on
 *    it, `withSuperAdmin`); a developers-only tool only for a person who holds `developer_tools` read (migration 058);
 *    and the exact login email is on the registration's permitted-user list (migration 073). The email check also
 *    applies to super admins. The same answer decides the menu, health check and every frame call. A server call has no person.
 *  - What a call may do (`scopeAllows`): the route's `toolAccess` is `'any'`, or it names a permission the
 *    tool (or token) was granted. A route without `toolAccess` is closed to every tool.
 *  - Secrets and tokens: made from 32 random bytes, stored only as SHA-256 hashes, compared in constant time.
 *    SHA-256 (not a slow password hash) is right here because the values are random, not chosen by a person.
 *
 * Error reasons (used as `details.reason` with `TOOL_FORBIDDEN` or `TOOL_TOKEN_INVALID`): `tool_unknown`,
 * `tool_disabled`, `tool_sandbox_only`, `tool_local_only`, `developers_only`, `route_not_open_to_tools`, `scope_not_granted`,
 * `role_not_allowed`, `user_not_allowed`, `token_missing`, `token_invalid`, `token_expired`, `server_access_disabled`, `ip_not_allowed`,
 * `secret_invalid`.
 *
 * Permitted users (repository patch 80, Nov 23, 2026): plain emails, each an active KR Homebase account
 * (`unknownPermittedUsers`; the accounts come from `queries.ts`), so no address is written in code.
 */

import type { SessionUser, ToolScope } from '@krhomebase/contracts'
import { randomBase64Url, sha256Hex, timingSafeEqualText } from '../../platform/crypto.ts'

/** Seconds an access token lasts. */
export const TOOL_TOKEN_TTL_SECONDS = 15 * 60

/** What a route says about outside tools: open to every tool (`'any'`), or only to tools granted one permission. */
export type ToolAccess = 'any' | ToolScope

/** A stored registration, already parsed from its row (see queries.ts). */
export interface ToolRecord {
  id: string
  clientId: string
  label: string
  description: string
  icon: string
  menuOrder: number
  origin: string
  entryUrl: string
  allowedRoles: string[]
  /** Exact login emails allowed to see and use the tool (migration 073), lowercase. */
  permittedUsers: string[]
  /** Shown and usable only on a development server (migration 058; a missing column reads as false). */
  localOnly: boolean
  /** Shown and usable only by people who hold `developer_tools` read (migration 058). */
  developersOnly: boolean
  /** Reaches the tool sandbox only; KR Homebase treats it as not there (migration 080; a missing column reads as false). */
  sandboxOnly: boolean
  scopes: ToolScope[]
  status: 'active' | 'disabled'
  serverAccessEnabled: boolean
  serverIpAllowlist: string[]
  secretHash: string | null
  secretCreatedAt: string | null
  previousSecretHash: string | null
  previousSecretValidUntil: string | null
  createdAt: string
  updatedAt: string
}

/** The tool making the current call. Set by the sign-in middleware; null when no tool is calling. */
export interface ToolCaller {
  toolId: string
  clientId: string
  label: string
  channel: 'frame' | 'server'
  /** Permissions this call may use: the tool's grant (frame) or the token's (server). */
  scopes: ToolScope[]
}

/** Result of checking where a tool is hosted. */
export type EntryUrlCheck = { ok: true; origin: string; entryUrl: string } | { ok: false; reason: string }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Checks the address of a tool screen and returns its origin.
 *
 * @param entryUrl - Address the super admin entered.
 * @param appBaseUrl - The app's own address (`KR_APP_BASE_URL`), or null when it is not set.
 * @returns The origin and the cleaned address, or the reason it is refused: `entry_url_invalid`,
 *   `entry_url_not_https`, `entry_url_has_credentials`, `entry_url_is_app_origin`.
 */
export function parseToolEntryUrl(entryUrl: string, appBaseUrl: string | null): EntryUrlCheck {
  let url: URL
  try {
    url = new URL(entryUrl)
  } catch {
    return { ok: false, reason: 'entry_url_invalid' }
  }
  if (url.username || url.password) return { ok: false, reason: 'entry_url_has_credentials' }
  const local = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return { ok: false, reason: 'entry_url_not_https' }
  if (appBaseUrl) {
    try {
      if (new URL(appBaseUrl).origin === url.origin) return { ok: false, reason: 'entry_url_is_app_origin' }
    } catch {
      // An unreadable KR_APP_BASE_URL is reported by the sign-in settings check; it does not block this rule.
    }
  }
  url.hash = ''
  return { ok: true, origin: url.origin, entryUrl: url.toString() }
}

/**
 * The role every tool's list always holds (the requester, Nov 14, 2026): a super admin always sees every active tool.
 * `withSuperAdmin` adds it to every saved list; `toolUsableBy` also honours it for rows saved before that rule.
 */
export const ALWAYS_ALLOWED_ROLE = 'super_admin'

/** A role list with `super_admin` first and no repeats, as it is stored. */
export function withSuperAdmin<T extends string>(roles: readonly T[]): (T | typeof ALWAYS_ALLOWED_ROLE)[] {
  return [...new Set([ALWAYS_ALLOWED_ROLE, ...roles])] as (T | typeof ALWAYS_ALLOWED_ROLE)[]
}

/** The permission a developers-only tool asks for (the built-in role set "Internal Developer" grants it). */
export const TOOL_DEVELOPER_PERMISSION = { resource: 'developer_tools', action: 'read' } as const

/** Who is asking and where, for `toolRefusal`. Built by `toolViewerFor` in `platform/authGuard.ts`. */
export interface ToolViewer {
  email: string
  role: SessionUser['role']
  /** The API runs under `pnpm dev` (`isDevelopmentServer`, `platform/runtime.ts`). */
  developmentServer: boolean
  /** The person holds `developer_tools` read. Read only when a developers-only tool is in question; false otherwise. */
  isDeveloper: boolean
}

/** Why a person may not use a tool (`details.reason`). */
export type ToolRefusal = 'tool_disabled' | 'tool_sandbox_only' | 'tool_local_only' | 'role_not_allowed' | 'developers_only' | 'user_not_allowed'

/**
 * Why this person may not see or use the tool here, or null when they may. The checks run in this order, so the
 * reason names the first one that fails.
 *
 * @param tool - The registration.
 * @param viewer - The person's role, whether this is a development server, and whether they are a developer.
 */
export function toolRefusal(tool: Pick<ToolRecord, 'status' | 'allowedRoles' | 'localOnly' | 'developersOnly' | 'sandboxOnly' | 'permittedUsers'>, viewer: ToolViewer): ToolRefusal | null {
  if (tool.status !== 'active') return 'tool_disabled'
  // Sandbox only: no person, role or server here may use it, super admins included (the requester, Nov 23, 2026).
  if (tool.sandboxOnly) return 'tool_sandbox_only'
  if (tool.localOnly && !viewer.developmentServer) return 'tool_local_only'
  if (viewer.role !== ALWAYS_ALLOWED_ROLE && !tool.allowedRoles.includes(viewer.role)) return 'role_not_allowed'
  if (tool.developersOnly && !viewer.isDeveloper) return 'developers_only'
  if (!tool.permittedUsers.some((email) => email.trim().toLowerCase() === viewer.email.trim().toLowerCase())) return 'user_not_allowed'
  return null
}

/** True when the person may see and use the tool here (`toolRefusal` finds nothing). */
export function toolUsableBy(tool: Pick<ToolRecord, 'status' | 'allowedRoles' | 'localOnly' | 'developersOnly' | 'sandboxOnly' | 'permittedUsers'>, viewer: ToolViewer): boolean {
  return toolRefusal(tool, viewer) === null
}

/**
 * The emails in a permitted-user list that are not active KR Homebase accounts (compared in lowercase).
 *
 * @param emails - The list the super admin sent.
 * @param accounts - The sign-in emails of the active accounts (`listPermittedUserChoices` in queries.ts).
 * @returns The unknown emails, in the order sent; empty when every one is known.
 */
export function unknownPermittedUsers(emails: readonly string[], accounts: readonly string[]): string[] {
  const known = new Set(accounts.map((email) => email.trim().toLowerCase()))
  return emails.filter((email) => !known.has(email.trim().toLowerCase()))
}

/**
 * Whether a call may reach a route.
 *
 * @param toolAccess - What the route declared, or undefined when the route is closed to tools.
 * @param granted - Permissions of the tool (frame) or token (server).
 * @returns `ok` or the refusal reason `route_not_open_to_tools` / `scope_not_granted`.
 */
export function scopeAllows(toolAccess: ToolAccess | undefined, granted: readonly ToolScope[]): { ok: true } | { ok: false; reason: string } {
  if (!toolAccess) return { ok: false, reason: 'route_not_open_to_tools' }
  if (toolAccess === 'any' || granted.includes(toolAccess)) return { ok: true }
  return { ok: false, reason: 'scope_not_granted' }
}

/**
 * The permissions a new token carries: what was asked for, limited to what was granted. Asking for nothing
 * gives every granted permission.
 *
 * @returns The scopes, or `scope_not_granted` when a requested permission was never granted.
 */
export function tokenScopes(granted: readonly ToolScope[], requested: readonly ToolScope[] | undefined): { ok: true; scopes: ToolScope[] } | { ok: false; reason: string } {
  if (!requested) return { ok: true, scopes: [...granted] }
  const missing = requested.filter((scope) => !granted.includes(scope))
  if (missing.length) return { ok: false, reason: 'scope_not_granted' }
  return { ok: true, scopes: [...new Set(requested)] }
}

/** True when the list is empty (any address) or names the caller's address. */
export function ipAllowed(allowlist: readonly string[], ip: string | null): boolean {
  if (!allowlist.length) return true
  if (!ip) return false
  const normal = ip.trim().toLowerCase()
  return allowlist.some((entry) => entry.trim().toLowerCase() === normal)
}

/** A new public client id: `krt_` and 24 random letters, digits, `-` or `_`. */
export function newClientId(): string {
  return `krt_${randomBase64Url(18)}`
}

/** A new client secret: `krts_` and 43 random characters (32 bytes). Shown once, stored only as a hash. */
export function newClientSecret(): string {
  return `krts_${randomBase64Url(32)}`
}

/** A new access token: `krtt_` and 43 random characters (32 bytes). Stored only as a hash. */
export function newAccessToken(): string {
  return `krtt_${randomBase64Url(32)}`
}

/** The stored form of a secret or token. */
export function hashToolSecret(value: string): Promise<string> {
  return sha256Hex(value)
}

/**
 * Checks a client secret against the current secret and, while its overlap lasts, the one replaced last.
 *
 * @param candidate - Secret sent by the tool server.
 * @param tool - The registration (only the hash fields are read).
 * @param now - Current time in milliseconds (for tests).
 */
export async function secretMatches(
  candidate: string,
  tool: Pick<ToolRecord, 'secretHash' | 'previousSecretHash' | 'previousSecretValidUntil'>,
  now = Date.now(),
): Promise<boolean> {
  const hash = await hashToolSecret(candidate)
  // Both comparisons always run, so the time taken does not tell which secret matched.
  const current = tool.secretHash ? timingSafeEqualText(hash, tool.secretHash) : false
  const previousLive = tool.previousSecretHash && tool.previousSecretValidUntil && new Date(tool.previousSecretValidUntil).getTime() > now
  const previous = tool.previousSecretHash ? timingSafeEqualText(hash, tool.previousSecretHash) : false
  return current || (Boolean(previousLive) && previous)
}

/** The ISO time `hours` from now, or null when `hours` is 0 (the old secret ends at once). */
export function overlapUntil(hours: number, now = Date.now()): string | null {
  return hours > 0 ? new Date(now + hours * 60 * 60 * 1000).toISOString() : null
}

/** The bearer token from an `Authorization` header, or null. */
export function bearerToken(header: string | undefined | null): string | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header?.trim() ?? '')
  return match?.[1] ?? null
}
