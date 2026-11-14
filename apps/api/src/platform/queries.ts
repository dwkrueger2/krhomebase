// file: apps/api/src/platform/queries.ts
/**
 * The only platform file that talks to D1. It holds the two pieces the old crud Worker gave every write and
 * that the API now gives them itself (docs/06_Contacts_Billing_Port_Plan.md, section 7):
 *
 *  - `readMaintenanceGate`: reads `kr_maintenance_gate`. While it is locked, writes are refused
 *    (`writeGate.ts`). A missing table counts as unlocked, as in the old crud Worker.
 *  - `readDeployWindow`: reads the deploy window on the same row (migration 034), for the deploy lock
 *    (`deployLock.ts`) and the server status in `GET /v1/health`. Missing columns count as no window.
 *  - `auditStatement`: builds the `audit_log` insert for a write. A feature's `queries.ts` puts it in the SAME
 *    `db.batch([...])` as the write, so the row and its audit entry are saved together or not at all. (The old
 *    crud Worker wrote the audit row in a separate step after the write.)
 */

import type { DeployWindow } from '@krhomebase/contracts'

export interface MaintenanceGateState {
  locked: boolean
  reason: string | null
}

export async function readMaintenanceGate(db: D1Database): Promise<MaintenanceGateState> {
  try {
    const row = await db
      .prepare("SELECT locked, reason FROM kr_maintenance_gate WHERE id = 'krhomebase' LIMIT 1")
      .first<{ locked?: number | string | null; reason?: string | null }>()
    return {
      locked: row?.locked === 1 || row?.locked === '1',
      reason: typeof row?.reason === 'string' && row.reason.trim() ? row.reason.trim() : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/no such table|does not exist/i.test(message)) return { locked: false, reason: null }
    throw error
  }
}

/**
 * Reads the deploy window on the maintenance gate row (migration 034; written by `scripts/Deploy-Krhomebase.ps1`).
 * `deployLock.ts` caches it and turns it into the server phase with `deployMaintenanceStatus` (contracts).
 *
 * @returns The window, or null when there is no row, or no table or columns yet (before migration 034): no window.
 * @throws Any other database error.
 */
export async function readDeployWindow(db: D1Database): Promise<DeployWindow | null> {
  try {
    const row = await db
      .prepare("SELECT deploy_notice_at, deploy_logout_at, deploy_expires_at, deploy_estimate_minutes FROM kr_maintenance_gate WHERE id = 'krhomebase' LIMIT 1")
      .first<{ deploy_notice_at?: string | null; deploy_logout_at?: string | null; deploy_expires_at?: string | null; deploy_estimate_minutes?: number | string | null }>()
    if (!row || !row.deploy_logout_at) return null
    const estimate = row.deploy_estimate_minutes === null || row.deploy_estimate_minutes === undefined ? null : Number(row.deploy_estimate_minutes)
    return {
      noticeAt: row.deploy_notice_at ?? null,
      logoutAt: row.deploy_logout_at,
      expiresAt: row.deploy_expires_at ?? null,
      estimateMinutes: estimate !== null && Number.isFinite(estimate) ? estimate : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/no such table|no such column|does not exist/i.test(message)) return null
    throw error
  }
}

/** One write, described for `audit_log`. The person comes from the checked session, never from the request body. */
export interface AuditEntry {
  requestId: string
  actorUserId: string | null
  actorEmail: string | null
  actorRole: string | null
  /** The route's feature, for example `contacts`. */
  resource: string
  /** `CREATE`, `UPDATE`, `DELETE` or a named action, as the old crud Worker recorded it. */
  action: string
  targetTable: string
  targetId: string
  clientId?: string | null
  matterId?: string | null
  newJson?: unknown
  idempotencyKey?: string | null
}

/** The `audit_log` insert for one write. Run it in the same `db.batch` as the write. */
export function auditStatement(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (id, request_id, actor_user_id, actor_email, actor_role, source, resource, action, target_table, target_id,
         matter_id, client_id, previous_json, new_json, idempotency_key, success, error_message, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'krhomebase-api', ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?13, 1, NULL, ?14)`,
    )
    .bind(
      crypto.randomUUID(),
      entry.requestId,
      entry.actorUserId,
      entry.actorEmail,
      entry.actorRole,
      entry.resource,
      entry.action,
      entry.targetTable,
      entry.targetId,
      entry.matterId ?? null,
      entry.clientId ?? null,
      entry.newJson === undefined ? null : JSON.stringify(entry.newJson),
      entry.idempotencyKey ?? null,
      new Date().toISOString(),
    )
}
