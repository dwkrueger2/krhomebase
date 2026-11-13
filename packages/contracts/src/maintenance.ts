// file: packages/contracts/src/maintenance.ts
/**
 * The maintenance gate (Settings plan `docs/08_Settings_Dashboard_Plan.md`, stage 8, Firm Settings → Data Import;
 * super admin only). Ported from the old `GET`/`POST /krhomebase/api/kr-api-v1/maintenance-gate` (reference
 * `docs/API/Settings_AsIs_Reference.md` section 3.4).
 *
 *   GET /v1/maintenance-gate   whether application writes are locked, why, and who set it when
 *   PUT /v1/maintenance-gate   lock or unlock application writes
 *
 * The gate is the one row `id = 'krhomebase'` of table `kr_maintenance_gate` (columns `locked`, `reason`, `set_by`,
 * `set_at`, `updated_at`). While it is locked the API refuses every write with 423 `MAINTENANCE_LOCKED`
 * (`apps/api/src/platform/writeGate.ts`); reads keep working.
 *
 * Changed from the old route:
 *  - The body is `{ locked: true | false }` instead of `{ operation: 'lock' | 'unlock' }`, and the method is PUT.
 *  - The reply is camelCase (`setBy`, `setAt`, `updatedAt`) instead of the raw database row, and says whether the
 *    gate row exists (`installed`). A missing table or row reads as unlocked, as the write gate treats it.
 */

import { z } from 'zod'

/** The reason saved when Data Import locks writes (the old route's fixed text). */
export const MAINTENANCE_LOCK_REASON = 'Contact import review'

export const MaintenanceGateData = z.object({
  locked: z.boolean().describe('True while application writes are paused. Reads and searches keep working.'),
  reason: z.string().nullable().describe('Why writes are paused, as saved when the gate was locked; null when unlocked or not given.'),
  setBy: z.string().nullable().describe('Who last locked or unlocked the gate (email, or user id when there is no email); null when never set.'),
  setAt: z.string().nullable().describe('When the gate was last locked or unlocked (ISO time, or the old database time format); null when never set.'),
  updatedAt: z.string().nullable().describe('When the gate row last changed; null when the row does not exist.'),
  installed: z.boolean().describe('False when the gate table or its one row does not exist yet; the gate then reads as unlocked.'),
})
export type MaintenanceGateData = z.infer<typeof MaintenanceGateData>

export const MaintenanceGateBody = z
  .object({
    locked: z.boolean().describe(`True locks application writes (reason "${MAINTENANCE_LOCK_REASON}"); false unlocks them.`),
  })
  .strict()
export type MaintenanceGateBody = z.infer<typeof MaintenanceGateBody>
