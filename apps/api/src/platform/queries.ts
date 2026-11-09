// file: apps/api/src/platform/queries.ts
/**
 * The only platform file that talks to D1. It holds the two pieces the old crud Worker gave every write and
 * that the API now gives them itself (docs/06_Contacts_Billing_Port_Plan.md, section 7):
 *
 *  - `readMaintenanceGate`: reads `kr_maintenance_gate`. While it is locked, writes are refused
 *    (`writeGate.ts`). A missing table counts as unlocked, as in the old crud Worker.
 *  - `auditStatement`: builds the `audit_log` insert for a write. A feature's `queries.ts` puts it in the SAME
 *    `db.batch([...])` as the write, so the row and its audit entry are saved together or not at all. (The old
 *    crud Worker wrote the audit row in a separate step after the write.)
 */

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
