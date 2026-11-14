// file: apps/api/src/platform/deployLock.ts
/**
 * The deploy lock (repository patch 34, Nov 14, 2026; process in `docs/11_Deployment_PromptStart.md`).
 *
 * `pnpm deploy:warn` (`scripts/Deploy-Krhomebase.ps1`) writes a deploy window on the maintenance gate row (migration
 * 034). `deployMaintenanceStatus` (contracts `health.ts`) turns it into a phase: green, warning or maintenance.
 *
 *  - `currentServerStatus(env)`: the phase now, for `GET /v1/health` (the banner and the login page poll it).
 *  - `deployLock` (middleware, after `requestId` and before `signInGuard`): while the phase is maintenance, every
 *    request to a declared route is refused with 503 `MAINTENANCE_IN_PROGRESS`, except the three a closed server
 *    still needs: `GET /v1/health` (the status), `GET /v1/auth/config` (the login page draws) and
 *    `DELETE /v1/auth/session` (the banner signs the person out). Signing in (Turnstile, Google start and callback)
 *    is refused, so nobody signs in while the new version goes live. No session is checked first: the lock costs one
 *    cached read, not a Session Worker call.
 *
 * The window is cached in the isolate for `DEPLOY_WINDOW_CACHE_MS` (10 seconds), so the lock adds no database read to
 * most requests. The phase itself is worked out from the cached times on every request, so the lock starts at the
 * sign-out time exactly; only a change to the window (a new deploy, a cancel, the finish) waits for the cache.
 *
 * When the window cannot be read (no binding, a database error) the server counts as green and it is logged: a
 * broken read must not close the firm out.
 */

import { deployMaintenanceStatus, SERVER_GREEN, type DeployWindow, type ServerMaintenance } from '@krhomebase/contracts'
import type { MiddlewareHandler } from 'hono'
import { declaredRoute, matchedPathsOf } from './authGuard.ts'
import { failure } from './envelope.ts'
import { logLine } from './log.ts'
import { readDeployWindow } from './queries.ts'
import type { AppEnv } from './types.ts'

/** How long one read of the deploy window is reused in this isolate. */
export const DEPLOY_WINDOW_CACHE_MS = 10_000

/** Routes that answer while the server is closed: `<method> <path>` as declared. */
export const OPEN_DURING_MAINTENANCE: ReadonlySet<string> = new Set(['get /v1/health', 'get /v1/auth/config', 'delete /v1/auth/session'])

let cached: { window: DeployWindow | null; readAt: number } | null = null

/** Forgets the cached window (tests; the next read goes to the database). */
export function clearDeployWindowCache(): void {
  cached = null
}

/**
 * Reads the deploy window, reusing a read younger than `DEPLOY_WINDOW_CACHE_MS`.
 *
 * @param db - The `krhomebase` binding.
 * @param nowMs - The time now.
 * @returns The window, or null for none. Database errors are thrown.
 */
async function cachedDeployWindow(db: D1Database, nowMs: number): Promise<DeployWindow | null> {
  if (cached && nowMs - cached.readAt < DEPLOY_WINDOW_CACHE_MS) return cached.window
  const window = await readDeployWindow(db)
  cached = { window, readAt: nowMs }
  return window
}

/**
 * The server phase now.
 *
 * @param env - The Worker's bindings (only `krhomebase` is read).
 * @param requestId - For the log line when the window cannot be read.
 * @returns The phase; green when there is no binding or the read fails.
 */
export async function currentServerStatus(env: { krhomebase?: D1Database } | undefined, requestId: string): Promise<ServerMaintenance> {
  const db = env?.krhomebase
  if (!db) return SERVER_GREEN
  const nowMs = Date.now()
  try {
    return deployMaintenanceStatus(await cachedDeployWindow(db, nowMs), nowMs)
  } catch (error) {
    logLine('DEPLOY_LOCK:72 read_failed', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
    return SERVER_GREEN
  }
}

export const deployLock: MiddlewareHandler<AppEnv> = async (c, next) => {
  const route = declaredRoute(c.req.method, matchedPathsOf(c))
  if (!route) return next()
  const method = c.req.method.toLowerCase() === 'head' ? 'get' : c.req.method.toLowerCase()
  const declaredPath = matchedPathsOf(c).find((path) => OPEN_DURING_MAINTENANCE.has(`${method} ${path}`))
  if (declaredPath) return next()

  const requestId = c.get('requestId')
  const status = await currentServerStatus(c.env, requestId)
  if (status.status !== 'maintenance') return next()
  logLine('DEPLOY_LOCK:86 refused', requestId, { feature: route.feature })
  return failure(c, 503, 'MAINTENANCE_IN_PROGRESS', 'KR Homebase is being updated. Please sign in again shortly.', {
    logoutAt: status.logoutAt,
    expectedBackBy: status.expectedBackBy,
  })
}
