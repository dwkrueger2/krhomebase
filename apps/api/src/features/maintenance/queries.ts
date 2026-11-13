// file: apps/api/src/features/maintenance/queries.ts
/**
 * The only file of the maintenance area that talks to D1: the maintenance gate, the one row `id = 'krhomebase'` of
 * table `kr_maintenance_gate` (Schema 8.0: `locked` 0 or 1, `reason`, `set_by`, `set_at`, `updated_at`).
 *
 * Kept from the old crud Worker's `MAINTENANCE_GATE` action (`workers/d1-workers/crud-worker/crud-worker.ts`,
 * `executeMaintenanceGate`): the columns written (`locked`, `reason` only while locked, `set_by`, `set_at`,
 * `updated_at`), the reason cut to 240 characters, and `set_by` taken from the checked session (email first, then the
 * user id). The write gate's rule that a missing table counts as unlocked applies to the read here too.
 *
 * Changed from the old Worker action:
 *  - The change and its `audit_log` row are one `db.batch`, so both are saved or neither (the old Worker wrote the
 *    audit row afterwards, "best effort").
 *  - The write is an upsert: a missing gate row is created instead of answering 404
 *    `KRHOMEBASE_MAINTENANCE_GATE_NOT_FOUND`. The table's CHECK allows only the id `krhomebase`.
 *  - Times are ISO strings from the caller (`now`), not SQLite's `datetime('now')`.
 */

import type { MaintenanceGateData } from '@krhomebase/contracts'
import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** The gate cannot be read or written (database error, or no table on a write). */
export class MaintenanceUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`MAINTENANCE_GATE_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'MaintenanceUnavailableError'
  }
}

interface GateRow {
  locked: number | string | null
  reason: string | null
  set_by: string | null
  set_at: string | null
  updated_at: string | null
}

const SELECT_GATE = "SELECT locked, reason, set_by, set_at, updated_at FROM kr_maintenance_gate WHERE id = 'krhomebase' LIMIT 1"

const textOrNull = (value: string | null | undefined): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Maps the database row (or its absence) to the reply shape. */
function gateFromRow(row: GateRow | null): MaintenanceGateData {
  if (!row) return { locked: false, reason: null, setBy: null, setAt: null, updatedAt: null, installed: false }
  return {
    locked: row.locked === 1 || row.locked === '1',
    reason: textOrNull(row.reason),
    setBy: textOrNull(row.set_by),
    setAt: textOrNull(row.set_at),
    updatedAt: textOrNull(row.updated_at),
    installed: true,
  }
}

const isMissingTable = (error: unknown) => /no such table|does not exist/i.test(error instanceof Error ? error.message : String(error))

export interface MaintenanceQueries {
  /** Reads the gate. A missing table or row reads as unlocked with `installed: false`. */
  readGate(): Promise<MaintenanceGateData>
  /**
   * Locks or unlocks the gate and records the change in `audit_log`, in one batch, then reads the gate back.
   *
   * @param change - The new state, the reason saved while locked, who set it, and the time.
   * @param audit - The audit entry (person from the checked session).
   */
  writeGate(change: { locked: boolean; reason: string | null; setBy: string; now: string }, audit: AuditEntry): Promise<MaintenanceGateData>
}

export function createMaintenanceQueries(db: D1Database): MaintenanceQueries {
  return {
    async readGate() {
      try {
        return gateFromRow(await db.prepare(SELECT_GATE).first<GateRow>())
      } catch (error) {
        if (isMissingTable(error)) return gateFromRow(null)
        throw new MaintenanceUnavailableError(error)
      }
    },

    async writeGate(change, audit) {
      const reason = change.locked ? (change.reason ?? '').trim().slice(0, 240) || null : null
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO kr_maintenance_gate (id, locked, reason, set_by, set_at, updated_at)
               VALUES ('krhomebase', ?1, ?2, ?3, ?4, ?4)
               ON CONFLICT (id) DO UPDATE SET locked = excluded.locked, reason = excluded.reason, set_by = excluded.set_by,
                 set_at = excluded.set_at, updated_at = excluded.updated_at`,
            )
            .bind(change.locked ? 1 : 0, reason, change.setBy.slice(0, 254), change.now),
          auditStatement(db, audit),
        ])
        return gateFromRow(await db.prepare(SELECT_GATE).first<GateRow>())
      } catch (error) {
        throw new MaintenanceUnavailableError(error)
      }
    },
  }
}

export function maintenanceQueriesFor(env: { krhomebase?: D1Database } | undefined): MaintenanceQueries | null {
  return env?.krhomebase ? createMaintenanceQueries(env.krhomebase) : null
}
