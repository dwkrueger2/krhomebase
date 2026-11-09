// file: apps/api/src/features/tools/rules.ts
/**
 * Outside-tool business rules. Pure functions: no network, no database.
 *
 *  - Where a tool may be hosted (`parseToolEntryUrl`): https only, except http://localhost and
 *    http://127.0.0.1 for a developer's own computer, and never the app's own origin. A frame from the app's
 *    own origin would escape the sandbox, because the frame is given `allow-scripts allow-same-origin`.
 *  - Who may use a tool (`toolUsableBy`): the tool is active and the person's role is on its list.
 *  - What a call may do (`scopeAllows`): the route's `toolAccess` is `'any'`, or it names a permission the
 *    tool (or token) was granted. A route without `toolAccess` is closed to every tool.
 *  - Secrets and tokens: made from 32 random bytes, stored only as SHA-256 hashes, compared in constant time.
 *    SHA-256 (not a slow password hash) is right here because the values are random, not chosen by a person.
 *
 * Error reasons (used as `details.reason` with `TOOL_FORBIDDEN` or `TOOL_TOKEN_INVALID`): `tool_unknown`,
 * `tool_disabled`, `route_not_open_to_tools`, `scope_not_granted`, `role_not_allowed`, `token_missing`,
 * `token_invalid`, `token_expired`, `server_access_disabled`, `ip_not_allowed`, `secret_invalid`.
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

/** True when the tool is active and the person's role is on the tool's list. No implicit super admin. */
export function toolUsableBy(tool: Pick<ToolRecord, 'status' | 'allowedRoles'>, session: Pick<SessionUser, 'role'>): boolean {
  return tool.status === 'active' && tool.allowedRoles.includes(session.role)
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
