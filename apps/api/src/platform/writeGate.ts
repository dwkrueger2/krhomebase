// file: apps/api/src/platform/writeGate.ts
/**
 * The maintenance gate for writes, moved here from the old crud Worker.
 *
 * Runs after the sign-in middleware. For every request that can change data (any method but GET, HEAD and
 * OPTIONS, on a route whose `sideEffects` is not `['None']`), it reads `kr_maintenance_gate`. While the gate is
 * locked the reply is 423 `MAINTENANCE_LOCKED`, with the reason a super admin gave. Reads always pass.
 *
 * Exempt areas, and why:
 *  - `auth`:   signing in and out must keep working during maintenance, so a super admin can unlock it.
 *  - `health`: no data.
 *  - `tools`:  outside-tool registrations are super-admin settings, not firm records.
 *  - `maintenance`: the gate's own lock and unlock route (Data Import, Settings plan stage 8) must work while
 *              locked, or a super admin could never unlock.
 *
 * When the gate cannot be read (database binding missing or a database error), writes are refused with 503
 * `MAINTENANCE_GATE_UNAVAILABLE`, as the old crud Worker did. A missing table counts as unlocked.
 */

import type { MiddlewareHandler } from 'hono'
import { declaredRoute, matchedPathsOf } from './authGuard.ts'
import { failure } from './envelope.ts'
import { logLine } from './log.ts'
import { readMaintenanceGate } from './queries.ts'
import type { AppEnv } from './types.ts'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const GATE_EXEMPT_FEATURES: ReadonlySet<string> = new Set(['auth', 'health', 'tools', 'maintenance'])

export const writeGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (READ_METHODS.has(c.req.method.toUpperCase())) return next()
  const route = declaredRoute(c.req.method, matchedPathsOf(c))
  if (!route || GATE_EXEMPT_FEATURES.has(route.feature)) return next()
  if (route.sideEffects.length === 1 && route.sideEffects[0] === 'None') return next()

  const requestId = c.get('requestId')
  const db = c.env?.krhomebase
  if (!db) {
    logLine('WRITE_GATE:no_database', requestId, { feature: route.feature })
    return failure(c, 503, 'MAINTENANCE_GATE_UNAVAILABLE', 'Saving is not available right now.')
  }
  try {
    const gate = await readMaintenanceGate(db)
    if (gate.locked) {
      logLine('WRITE_GATE:locked', requestId, { feature: route.feature })
      return failure(c, 423, 'MAINTENANCE_LOCKED', 'KR Homebase is in maintenance. Saving is paused.', gate.reason ? { reason: gate.reason.replace(/[\r\n]+/g, ' ').slice(0, 160) } : undefined)
    }
  } catch (error) {
    logLine('WRITE_GATE:check_failed', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
    return failure(c, 503, 'MAINTENANCE_GATE_UNAVAILABLE', 'Saving is not available right now.')
  }
  return next()
}
