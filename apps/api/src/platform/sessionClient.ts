// file: apps/api/src/platform/sessionClient.ts
/**
 * Client for the Session Worker (`krhomebase-session-worker`), reached through the service binding
 * `SESSION_WORKER`. The browser holds a random token in an HttpOnly cookie. This file hashes the token
 * (SHA-256), sends the hash with the shared secret as a bearer token, and gets back the session or the
 * reason it is not valid. The raw token is never sent on and never logged.
 *
 * A successful check is remembered inside this Worker instance for 60 seconds (never past the
 * session's own end), so one page load does not ask the database for every request. A session that was
 * closed stays usable for at most that long.
 */

import type { SessionUser } from '@krhomebase/contracts'
import { sha256Hex } from './crypto.ts'

export const SESSION_CACHE_MS = 60_000
const DEFAULT_FIRM_NAME = 'Krueger & Richard'

export type SessionCheck =
  | { valid: true; session: SessionUser }
  | { valid: false; reason: string; /** True when the check itself failed (worker down or misconfigured) rather than the session being bad. */ unavailable: boolean }

const cache = new Map<string, { until: number; session: SessionUser }>()

/** Forgets cached checks for a token hash (used by log-out). */
export function forgetCachedSession(tokenHash: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${tokenHash}:`)) cache.delete(key)
}

/** Empties the cache. For tests. */
export function clearSessionCache(): void {
  cache.clear()
}

/** Turns an email's local part into a readable name, for accounts with no name on file. */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'KR User'
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ') || 'KR User'
  )
}

/** Two to four capital letters from a name or email. */
export function initialsFrom(displayName: string, email: string): string {
  const pieces = (displayName || email)
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (!pieces.length) return 'KR'
  return pieces
    .slice(0, 3)
    .map((piece) => piece[0]?.toUpperCase())
    .join('')
}

export interface ValidateSessionOptions {
  fetcher: Fetcher
  secret: string
  /** The raw token from the cookie. */
  token: string
  requestId: string
  userAgent: string | null
  ip: string | null
}

/**
 * Asks the Session Worker whether the cookie token is a live session.
 *
 * Failure reasons passed through from the worker: `session_not_found`, `user_inactive`,
 * `session_revoked` (or the stored reason), `session_expired`. Reasons made here:
 * `SESSION_WORKER_FETCH_FAILED`, `SESSION_WORKER_NON_JSON_RESPONSE_<status>`, `SESSION_WORKER_HTTP_<status>`
 * and `session_worker_empty_data`; those set `unavailable`.
 */
export async function validateSession(options: ValidateSessionOptions): Promise<SessionCheck> {
  const tokenHash = await sha256Hex(options.token)
  const userAgentHash = options.userAgent ? await sha256Hex(options.userAgent) : null
  const ipHash = options.ip ? await sha256Hex(options.ip) : null
  const cacheKey = `${tokenHash}:${userAgentHash ?? ''}:${ipHash ?? ''}`

  const cached = cache.get(cacheKey)
  if (cached && cached.until > Date.now()) return { valid: true, session: cached.session }
  if (cached) cache.delete(cacheKey)

  let response: Response
  try {
    response = await options.fetcher.fetch('https://session-worker.internal/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: options.requestId, sessionTokenHash: tokenHash, userAgentHash, ipHash, touch: true }),
    })
  } catch {
    return { valid: false, reason: 'SESSION_WORKER_FETCH_FAILED', unavailable: true }
  }

  const body = (await response.json().catch(() => null)) as {
    ok?: boolean
    error?: string
    data?: { valid?: boolean; reason?: string; session?: SessionUser }
  } | null
  if (!body) return { valid: false, reason: `SESSION_WORKER_NON_JSON_RESPONSE_${response.status}`, unavailable: true }
  if (!response.ok || !body.ok) return { valid: false, reason: body.error ?? `SESSION_WORKER_HTTP_${response.status}`, unavailable: true }
  if (!body.data) return { valid: false, reason: 'session_worker_empty_data', unavailable: true }
  if (!body.data.valid || !body.data.session) return { valid: false, reason: body.data.reason ?? 'session_invalid', unavailable: false }

  const worker = body.data.session
  const displayName = worker.displayName?.trim() || displayNameFromEmail(worker.email)
  const session: SessionUser = {
    ...worker,
    displayName,
    firmName: worker.firmName || DEFAULT_FIRM_NAME,
    avatarInitials: worker.avatarInitials || initialsFrom(displayName, worker.email),
    mfaVerified: Boolean(worker.mfaVerified),
  }

  const endsAt = Date.parse(session.expiresAt)
  const until = Math.min(Date.now() + SESSION_CACHE_MS, Number.isFinite(endsAt) ? endsAt : Number.POSITIVE_INFINITY)
  if (until > Date.now()) {
    if (cache.size > 500) cache.clear()
    cache.set(cacheKey, { until, session })
  }
  return { valid: true, session }
}
