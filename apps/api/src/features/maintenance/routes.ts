// file: apps/api/src/features/maintenance/routes.ts
/**
 * The maintenance gate (Settings plan `docs/08_Settings_Dashboard_Plan.md`, stage 8: Firm Settings → Data Import;
 * super admin only). Replaces the old `GET`/`POST /krhomebase/api/kr-api-v1/maintenance-gate`, which sent the
 * crud Worker's `MAINTENANCE_GATE` action (reference `docs/API/Settings_AsIs_Reference.md` section 3.4).
 *
 *   GET /v1/maintenance-gate   whether application writes are locked, the reason, who set it and when
 *   PUT /v1/maintenance-gate   `{ locked: true }` locks writes (reason "Contact import review"); `{ locked: false }` unlocks
 *
 * Kept: super admin only; the lock reason "Contact import review"; `set_by` from the checked session.
 * Changed from the old route: PUT with `{ locked }` instead of POST with `{ operation }`; camelCase reply with
 * `installed`; a missing table reads as unlocked instead of failing; the write and its `audit_log` row are one batch
 * (resource `maintenance`); a missing gate row is created on the first lock or unlock (old: 404).
 *
 * The PUT must work while the gate is locked (it is how a super admin unlocks it), so the write gate
 * (`src/platform/writeGate.ts`) lists the feature `maintenance` in `GATE_EXEMPT_FEATURES`. Outside tools: closed.
 */

import { ErrorEnvelope, MAINTENANCE_LOCK_REASON, MaintenanceGateBody, MaintenanceGateData, successEnvelope } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { MaintenanceUnavailableError, maintenanceQueriesFor } from './queries.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const unavailable503 = { description: 'The gate cannot be read or changed right now (MAINTENANCE_GATE_UNAVAILABLE).', content: json(ErrorEnvelope) }
const UNAVAILABLE_TEXT = 'The maintenance gate is not available right now.'

export const maintenanceGateRoute = defineRoute({
  method: 'get',
  path: '/v1/maintenance-gate',
  feature: 'maintenance',
  summary: 'Whether application writes are locked, the reason, and who set the gate when. A missing gate reads as unlocked.',
  access: SUPER_ADMIN,
  errors: ['MAINTENANCE_GATE_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The gate.', content: json(successEnvelope(MaintenanceGateData)) }, 503: unavailable503 },
})

export const saveMaintenanceGateRoute = defineRoute({
  method: 'put',
  path: '/v1/maintenance-gate',
  feature: 'maintenance',
  summary: 'Locks or unlocks application writes. Works while the gate is locked (the write gate exempts this area).',
  access: SUPER_ADMIN,
  errors: ['MAINTENANCE_GATE_UNAVAILABLE'],
  sideEffects: ['Writes kr_maintenance_gate (row krhomebase)', 'Writes audit_log'],
  request: { body: { content: json(MaintenanceGateBody), required: true } },
  responses: { 200: { description: 'The gate as saved.', content: json(successEnvelope(MaintenanceGateData)) }, 503: unavailable503 },
})

/**
 * Registers the two maintenance gate routes on the API.
 *
 * GET reads `kr_maintenance_gate` and writes nothing. PUT upserts the one gate row and an `audit_log` row (resource
 * `maintenance`, action `LOCK` or `UNLOCK`) in one batch; the person comes from the session. Either answers 503
 * `MAINTENANCE_GATE_UNAVAILABLE` when the database binding is missing or the database fails (and PUT when the table
 * does not exist).
 */
export function registerMaintenance(app: OpenAPIHono<AppEnv>) {
  app.openapi(maintenanceGateRoute, async (c) => {
    const queries = maintenanceQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'MAINTENANCE_GATE_UNAVAILABLE', UNAVAILABLE_TEXT)
    try {
      const gate = await queries.readGate()
      return c.json({ ok: true as const, data: gate, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof MaintenanceUnavailableError) {
        logLine('MAINTENANCE:66 read_failed', c.get('requestId'), { reason: error.message.slice(0, 80) })
        return failure(c, 503, 'MAINTENANCE_GATE_UNAVAILABLE', UNAVAILABLE_TEXT)
      }
      throw error
    }
  })

  app.openapi(saveMaintenanceGateRoute, async (c) => {
    const queries = maintenanceQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'MAINTENANCE_GATE_UNAVAILABLE', UNAVAILABLE_TEXT)
    const requestId = c.get('requestId')
    const { locked } = c.req.valid('json')
    const reason = locked ? MAINTENANCE_LOCK_REASON : null
    try {
      const gate = await queries.writeGate(
        { locked, reason, setBy: session.email || session.userId, now: new Date().toISOString() },
        {
          requestId,
          actorUserId: session.userId,
          actorEmail: session.email ?? null,
          actorRole: session.role ?? null,
          resource: 'maintenance',
          action: locked ? 'LOCK' : 'UNLOCK',
          targetTable: 'kr_maintenance_gate',
          targetId: 'krhomebase',
          newJson: { locked, reason },
        },
      )
      logLine('MAINTENANCE:94 gate_saved', requestId, { locked })
      return c.json({ ok: true as const, data: gate, requestId }, 200)
    } catch (error) {
      if (error instanceof MaintenanceUnavailableError) {
        logLine('MAINTENANCE:98 write_failed', requestId, { locked, reason: error.message.slice(0, 80) })
        return failure(c, 503, 'MAINTENANCE_GATE_UNAVAILABLE', UNAVAILABLE_TEXT)
      }
      throw error
    }
  })
}
