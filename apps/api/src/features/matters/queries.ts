// file: apps/api/src/features/matters/queries.ts
/**
 * The only file of the matters area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables (Schema 8.0):
 *
 * - `matter`: the matter row. It has no client column; `matter_number` is UNIQUE and NOT NULL.
 * - `matter_party`: the client-to-matter link. A matter belongs to the client named by its `client_id` party (exactly
 *   one of `client_id`, `individual_id`, `entity_id` per row); a new matter gets one primary-client row.
 * - `matter_activity_log`: the "Matter Initial Notes" (`activity_type 'note'`).
 * - `client`: the client number the matter number starts with.
 * - `lookup`: the `matter_status` and `practice_area` choice lists.
 *   See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
 * - `matter_access`, `matter_staff_assignment`: removed with the matter on delete.
 *
 * The delete check counts the matter's records in the fixed catalog `MATTER_RECORD_TABLES` (the old route's 28
 * tables, every one with a `matter_id` column). Table names come only from that catalog, never from a request.
 *
 * Writes: a create is one batch (matter, primary-client party, optional note, audit row); a change is one batch
 * (matter, optional note, audit row). A delete follows the contact-maintenance pattern: the audit row is inserted
 * only while the matter still exists and nothing blocks it, and every delete runs only if that audit row exists, so a
 * record added in between saves nothing. The matter's own audit rows leave `audit_log.matter_id` empty: `audit_log` is
 * one of the blocking tables, and a row pointing at the matter would make it undeletable.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class MattersUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`MATTERS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'MattersUnavailableError'
  }
}

/** The tables whose rows keep a matter from being deleted, with plain labels (old route, unchanged order). */
export const MATTER_RECORD_TABLES = [
  ['event', 'Events'],
  ['task', 'Tasks'],
  ['matter_activity_log', 'Matter activity and notes'],
  ['matter_billing_profile', 'Billing profiles'],
  ['matter_fee_component', 'Matter fee components'],
  ['time_entry', 'Time entries'],
  ['invoice', 'Invoices'],
  ['invoice_line_item', 'Invoice line items'],
  ['payment', 'Payments'],
  ['payment_application', 'Payment applications'],
  ['ledger_entry', 'Ledger entries'],
  ['ledger_audit_log', 'Ledger audit records'],
  ['bank_deposit_item', 'Bank deposit items'],
  ['matter_balance_snapshot', 'Matter balance snapshots'],
  ['conflict_check', 'Conflict checks'],
  ['conflict_check_party', 'Conflict check parties'],
  ['document_record', 'Documents'],
  ['requested_document', 'Requested documents'],
  ['asset', 'Assets'],
  ['funding_action', 'Funding actions'],
  ['entity_event', 'Entity events'],
  ['audit_log', 'Audit records'],
  ['communication_log', 'Communications'],
  ['timer_session', 'Timer sessions'],
  ['expense_entry', 'Expenses'],
  ['trust_request', 'Trust requests'],
  ['matter_stage_history', 'Matter stage history'],
  ['workstream_activity', 'WorkStream activity'],
] as const

/** The rows removed with a matter that has no records (old route). */
const MATTER_LINK_TABLES = ['matter_party', 'matter_access', 'matter_staff_assignment'] as const

/** One matter, with its choice labels. */
export interface MatterRow {
  id: string
  matter_number: string
  title: string
  description: string | null
  practice_area_lookup_id: string
  practice_area_label: string | null
  status_lookup_id: string
  status_label: string | null
  opened_date: string | null
  closed_date: string | null
  primary_attorney_user_id: string | null
  created_at: string
  updated_at: string | null
}

export interface ClientRow {
  id: string
  client_number: string | null
}

export interface ChoiceRow {
  id: string
  category: string
  label: string
}

/** A new matter, worked out by `rules.ts`. */
export interface MatterInsert {
  id: string
  partyId: string
  clientId: string
  matterNumber: string
  title: string
  description: string | null
  practiceAreaLookupId: string
  statusLookupId: string
  openedDate: string
  primaryAttorneyUserId: string
  createdByUserId: string
  now: string
}

/** A change to a matter, worked out by `rules.ts`. */
export interface MatterUpdate {
  id: string
  title: string
  description: string | null
  statusLookupId: string
  openedDate: string | null
  now: string
}

/** The Initial Notes row. */
export interface MatterNote {
  id: string
  matterId: string
  activityDate: string
  description: string
  performedByUserId: string
  now: string
}

export interface MatterQueries {
  client(clientId: string): Promise<ClientRow | null>
  /** The client's matters (through any `client_id` party), in no particular order. */
  clientMatters(clientId: string): Promise<MatterRow[]>
  matter(matterId: string): Promise<MatterRow | null>
  /** Every matter number that starts with `<clientNumber>.`. */
  matterNumbersFor(clientNumber: string): Promise<string[]>
  /** The active `matter_status` and `practice_area` rows, in list order. */
  choices(): Promise<ChoiceRow[]>
  /** How many rows each record table holds for the matter (only tables with at least one). */
  recordCounts(matterId: string): Promise<Array<{ table: string; count: number }>>
  /** Saves a new matter; returns false when the number was taken in between (UNIQUE clash). */
  insertMatter(row: MatterInsert, note: MatterNote | null, audit: AuditEntry): Promise<boolean>
  updateMatter(row: MatterUpdate, note: MatterNote | null, audit: AuditEntry): Promise<void>
  /** Deletes the matter and its links; returns false when it no longer qualified (nothing saved). */
  deleteMatter(matterId: string, audit: AuditEntry): Promise<boolean>
}

const MATTER_COLUMNS = `m.id, m.matter_number, m.title, m.description, m.practice_area_lookup_id, pa.label AS practice_area_label,
       m.status_lookup_id, st.label AS status_label, m.opened_date, m.closed_date, m.primary_attorney_user_id, m.created_at, m.updated_at`
const MATTER_JOINS = `LEFT JOIN lookup pa ON pa.id = m.practice_area_lookup_id
  LEFT JOIN lookup st ON st.id = m.status_lookup_id`

/** `EXISTS(...)` for one record table; the names come from the fixed catalog only. */
const recordExists = (table: string) => `EXISTS(SELECT 1 FROM "${table}" WHERE matter_id = ?1)`
const ANY_RECORD = MATTER_RECORD_TABLES.map(([table]) => recordExists(table)).join(' OR ')

export function createMatterQueries(db: D1Database): MatterQueries {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      throw new MattersUnavailableError(error)
    }
  }

  function noteStatement(note: MatterNote): D1PreparedStatement {
    return db
      .prepare(
        `INSERT INTO matter_activity_log (id, matter_id, activity_date, activity_type, subject, description, performed_by_user_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'note', 'Matter Initial Notes', ?4, ?5, ?6, ?6)`,
      )
      .bind(note.id, note.matterId, note.activityDate, note.description, note.performedByUserId, note.now)
  }

  return {
    client: (clientId) => run(() => db.prepare('SELECT id, client_number FROM client WHERE id = ?1 LIMIT 1').bind(clientId).first<ClientRow>()),

    clientMatters: (clientId) =>
      run(async () => {
        const result = await db
          .prepare(
            `SELECT ${MATTER_COLUMNS} FROM matter m ${MATTER_JOINS}
              WHERE m.id IN (SELECT matter_id FROM matter_party WHERE client_id = ?1) LIMIT 1000`,
          )
          .bind(clientId)
          .all<MatterRow>()
        return result.results ?? []
      }),

    matter: (matterId) => run(() => db.prepare(`SELECT ${MATTER_COLUMNS} FROM matter m ${MATTER_JOINS} WHERE m.id = ?1 LIMIT 1`).bind(matterId).first<MatterRow>()),

    matterNumbersFor: (clientNumber) =>
      run(async () => {
        const result = await db.prepare('SELECT matter_number FROM matter WHERE matter_number LIKE ?1').bind(`${clientNumber}.%`).all<{ matter_number: string }>()
        return (result.results ?? []).map((row) => row.matter_number)
      }),

    choices: () =>
      run(async () => {
        const result = await db
          .prepare(
            `SELECT id, category, label FROM lookup
              WHERE category IN ('matter_status', 'practice_area') AND COALESCE(is_active, 1) = 1
              ORDER BY category, sort_order, label`,
          )
          .all<ChoiceRow>()
        return result.results ?? []
      }),

    recordCounts: (matterId) =>
      run(async () => {
        const columns = MATTER_RECORD_TABLES.map(([table]) => `(SELECT COUNT(*) FROM "${table}" WHERE matter_id = ?1) AS "${table}"`).join(',\n')
        const row = await db.prepare(`SELECT ${columns}`).bind(matterId).first<Record<string, number>>()
        return MATTER_RECORD_TABLES.map(([table]) => ({ table, count: Number(row?.[table] ?? 0) })).filter((item) => item.count > 0)
      }),

    async insertMatter(row, note, audit) {
      const statements = [
        db
          .prepare(
            `INSERT INTO matter (id, matter_number, title, description, practice_area_lookup_id, status_lookup_id, opened_date,
               primary_attorney_user_id, created_by_user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
          )
          .bind(row.id, row.matterNumber, row.title, row.description, row.practiceAreaLookupId, row.statusLookupId, row.openedDate, row.primaryAttorneyUserId, row.createdByUserId, row.now),
        db
          .prepare(
            `INSERT INTO matter_party (id, matter_id, client_id, individual_id, entity_id, party_role_lookup_id, is_primary_client,
               is_responsible_party, receives_bill, signs_engagement, added_date, notes)
             VALUES (?1, ?2, ?3, NULL, NULL, 'lk_party_role_primary_client', 1, 1, 1, 1, ?4, NULL)`,
          )
          .bind(row.partyId, row.id, row.clientId, row.openedDate),
      ]
      if (note) statements.push(noteStatement(note))
      statements.push(auditStatement(db, audit))
      try {
        await db.batch(statements)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/UNIQUE constraint failed: matter\.matter_number/i.test(message)) return false
        throw new MattersUnavailableError(error)
      }
    },

    async updateMatter(row, note, audit) {
      const statements = [
        db
          .prepare('UPDATE matter SET title = ?2, description = ?3, status_lookup_id = ?4, opened_date = ?5, updated_at = ?6 WHERE id = ?1')
          .bind(row.id, row.title, row.description, row.statusLookupId, row.openedDate, row.now),
      ]
      if (note) statements.push(noteStatement(note))
      statements.push(auditStatement(db, audit))
      await run(() => db.batch(statements))
    },

    async deleteMatter(matterId, audit) {
      const auditId = crypto.randomUUID()
      const gate = 'EXISTS(SELECT 1 FROM audit_log WHERE id = ?2)'
      const statements = [
        db
          .prepare(
            `INSERT INTO audit_log (id, request_id, actor_user_id, actor_email, actor_role, source, resource, action, target_table, target_id,
               matter_id, client_id, previous_json, new_json, idempotency_key, success, error_message, created_at)
             SELECT ?2, ?3, ?4, ?5, ?6, 'krhomebase-api', ?7, ?8, 'matter', ?1, NULL, ?9, NULL, ?10, NULL, 1, NULL, ?11
              WHERE EXISTS(SELECT 1 FROM matter WHERE id = ?1) AND NOT (${ANY_RECORD})`,
          )
          .bind(
            matterId,
            auditId,
            audit.requestId,
            audit.actorUserId,
            audit.actorEmail,
            audit.actorRole,
            audit.resource,
            audit.action,
            audit.clientId ?? null,
            audit.newJson === undefined ? null : JSON.stringify(audit.newJson),
            new Date().toISOString(),
          ),
        ...MATTER_LINK_TABLES.map((table) => db.prepare(`DELETE FROM "${table}" WHERE matter_id = ?1 AND ${gate}`).bind(matterId, auditId)),
        db.prepare(`DELETE FROM matter WHERE id = ?1 AND ${gate}`).bind(matterId, auditId),
      ]
      const results = await run(() => db.batch(statements))
      return Number(results[0]?.meta.changes) === 1
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function matterQueriesFor(env: { krhomebase?: D1Database } | undefined): MatterQueries | null {
  return env?.krhomebase ? createMatterQueries(env.krhomebase) : null
}
