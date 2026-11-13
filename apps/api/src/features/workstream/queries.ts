// file: apps/api/src/features/workstream/queries.ts
/**
 * The only file of the WorkStream area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables
 * (Schema 8.0):
 *
 * - `workstream_activity`: the entries. Exactly one of `client_id` and `lead_id`; `wsid` UNIQUE (seven letters and
 *   digits); `subgroup` one of the seven activity types; `visibility` always `internal`.
 * - `client`, `lead`, `matter`, `matter_party`: the owner checks and the labels on each entry. A matter belongs to a
 *   client through its primary-client `matter_party` row; the `.0` matter is the client's General Matters.
 * - `user`, `individual`, `employee`: the assignee list and the "recorded by" name.
 * - `individual_contact_method`, `entity_contact_method`, `client_member`, `individual`, `entity`: email recipients.
 *
 * Lists are newest first: `activity_at DESC, created_at DESC, id DESC` (the schema's ledger indexes), paged with a
 * cursor made of those three values, one row more than asked so the caller knows whether another page exists (D10;
 * the old route had no order and stopped at 100).
 *
 * Writes are one batch with the `audit_log` row. The audit row carries the owner and the subject, never the note
 * text (the old crud Worker copied every note into the audit log), and leaves `matter_id` empty so it never blocks a
 * matter delete. A new `wsid` that clashes answers false and the caller tries another.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class WorkstreamUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`WORKSTREAM_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'WorkstreamUnavailableError'
  }
}

/** One entry with its labels. */
export interface ActivityRow {
  id: string
  wsid: string
  subgroup: string
  client_id: string | null
  client_number: string | null
  client_display_name: string | null
  lead_id: string | null
  lcid: string | null
  matter_id: string | null
  matter_number: string | null
  matter_title: string | null
  activity_at: string
  subject: string
  note_body: string | null
  note_format: string
  next_steps_json: string | null
  document_record_id: string | null
  document_url: string | null
  document_label: string | null
  task_id: string | null
  assignee_user_id: string | null
  assignee_contact_id: string | null
  assignee_label: string | null
  performed_by_user_id: string | null
  performer_preferred_name: string | null
  performer_first_name: string | null
  performer_last_name: string | null
  performer_email: string | null
  created_at: string
  updated_at: string | null
}

export interface ClientRow {
  id: string
  client_number: string | null
  client_type: string
  display_name: string | null
  individual_id: string | null
  entity_id: string | null
}

export interface MatterRow {
  id: string
  matter_number: string
}

export interface PersonRow {
  id: string
  email: string
  role: string | null
  preferred_name: string | null
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  staff_code: string | null
}

export interface EmailMethodRow {
  owner_kind: 'individual' | 'entity'
  owner_id: string
  value: string
  is_primary: number
  preferred_name: string | null
  first_name: string | null
  last_name: string | null
  legal_name: string | null
}

/** Where a list looks: one owner (and maybe one matter), or every entry (the feed). */
export interface ActivityFilter {
  clientId?: string
  leadId?: string
  matterId?: string
  /** Also take the owner's entries that have no matter (a `.0` matter filter, D12). */
  includeNoMatter?: boolean
  subgroup?: string
  /** Several activity types (any of them). */
  subgroups?: readonly string[]
  assigneeUserId?: string
}

/** The position after which a page starts. */
export interface ActivityCursor {
  activityAt: string
  createdAt: string
  id: string
}

export interface ActivityInsert {
  id: string
  wsid: string
  clientId: string | null
  leadId: string | null
  matterId: string | null
  subgroup: string
  activityAt: string
  subject: string
  noteBody: string | null
  noteFormat: 'plain' | 'html'
  nextStepsJson: string
  documentRecordId: string | null
  documentUrl: string | null
  documentLabel: string | null
  assigneeUserId: string | null
  assigneeContactId: string | null
  assigneeLabel: string | null
  performedByUserId: string
  now: string
}

/** The columns a change sets (every one is written; `rules.ts` fills unchanged ones from the current row). */
export interface ActivityUpdate {
  id: string
  clientId: string | null
  leadId: string | null
  matterId: string | null
  subgroup: string
  activityAt: string
  subject: string
  noteBody: string | null
  noteFormat: 'plain' | 'html'
  nextStepsJson: string
  assigneeUserId: string | null
  assigneeContactId: string | null
  assigneeLabel: string | null
  now: string
}

export interface WorkstreamQueries {
  client(clientId: string): Promise<ClientRow | null>
  leadExists(leadId: string): Promise<boolean>
  /** The matter, when it is one of the client's primary-client matters. */
  clientMatter(clientId: string, matterId: string): Promise<MatterRow | null>
  /** The client's `.0` matter (Client General Matters). */
  generalMatter(clientId: string): Promise<MatterRow | null>
  /** Up to `limit + 1` entries after the cursor, newest first. */
  list(filter: ActivityFilter, cursor: ActivityCursor | null, limit: number): Promise<ActivityRow[]>
  byWsid(wsid: string): Promise<ActivityRow | null>
  /** Saves a new entry; false when its `wsid` was already taken. */
  insert(row: ActivityInsert, audit: AuditEntry): Promise<boolean>
  update(row: ActivityUpdate, audit: AuditEntry): Promise<void>
  remove(id: string, audit: AuditEntry): Promise<void>
  /** Active staff users (no `client` or `external_cpa` accounts), with names and staff codes. */
  staffUsers(): Promise<PersonRow[]>
  /** One user's name pieces (for the "recorded by" label of a new entry). */
  person(userId: string): Promise<PersonRow | null>
  /** Current email addresses of the client's own individual or entity, or of each active member of a group. */
  clientEmailMethods(client: ClientRow): Promise<EmailMethodRow[]>
}

const ACTIVITY_SELECT = `SELECT w.id, w.wsid, w.subgroup, w.client_id, c.client_number, c.display_name AS client_display_name,
       w.lead_id, l.lcid, w.matter_id, m.matter_number, m.title AS matter_title, w.activity_at, w.subject, w.note_body,
       w.note_format, w.next_steps_json, w.document_record_id, w.document_url, w.document_label, w.task_id,
       w.assignee_user_id, w.assignee_contact_id, w.assignee_label, w.performed_by_user_id,
       pi.preferred_name AS performer_preferred_name, pi.first_name AS performer_first_name, pi.last_name AS performer_last_name,
       pu.email AS performer_email, w.created_at, w.updated_at
  FROM workstream_activity w
  LEFT JOIN client c ON c.id = w.client_id
  LEFT JOIN lead l ON l.id = w.lead_id
  LEFT JOIN matter m ON m.id = w.matter_id
  LEFT JOIN user pu ON pu.id = w.performed_by_user_id
  LEFT JOIN individual pi ON pi.id = pu.individual_id`

export function createWorkstreamQueries(db: D1Database): WorkstreamQueries {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      throw new WorkstreamUnavailableError(error)
    }
  }

  function personSelect(where: string) {
    return `SELECT u.id, u.email, u.role, i.preferred_name, i.first_name, i.middle_name, i.last_name,
                   (SELECT e.staff_code FROM employee e WHERE e.user_id = u.id LIMIT 1) AS staff_code
              FROM user u LEFT JOIN individual i ON i.id = u.individual_id
             WHERE ${where}`
  }

  return {
    client: (clientId) =>
      run(() => db.prepare('SELECT id, client_number, client_type, display_name, individual_id, entity_id FROM client WHERE id = ?1 LIMIT 1').bind(clientId).first<ClientRow>()),

    leadExists: (leadId) => run(async () => Boolean(await db.prepare('SELECT 1 AS found FROM lead WHERE id = ?1 LIMIT 1').bind(leadId).first())),

    clientMatter: (clientId, matterId) =>
      run(() =>
        db
          .prepare(
            `SELECT m.id, m.matter_number FROM matter m
              WHERE m.id = ?2 AND EXISTS (SELECT 1 FROM matter_party mp WHERE mp.matter_id = m.id AND mp.client_id = ?1 AND mp.is_primary_client = 1)
              LIMIT 1`,
          )
          .bind(clientId, matterId)
          .first<MatterRow>(),
      ),

    generalMatter: (clientId) =>
      run(() =>
        db
          .prepare(
            `SELECT m.id, m.matter_number FROM matter m
              WHERE m.matter_number LIKE '%.0' AND EXISTS (SELECT 1 FROM matter_party mp WHERE mp.matter_id = m.id AND mp.client_id = ?1)
              ORDER BY m.created_at LIMIT 1`,
          )
          .bind(clientId)
          .first<MatterRow>(),
      ),

    list: (filter, cursor, limit) =>
      run(async () => {
        const where: string[] = []
        const values: Array<string | number> = []
        const bind = (value: string | number) => {
          values.push(value)
          return `?${values.length}`
        }
        if (filter.clientId) where.push(`w.client_id = ${bind(filter.clientId)}`)
        if (filter.leadId) where.push(`w.lead_id = ${bind(filter.leadId)}`)
        if (filter.matterId) {
          const matter = bind(filter.matterId)
          where.push(filter.includeNoMatter ? `(w.matter_id = ${matter} OR w.matter_id IS NULL)` : `w.matter_id = ${matter}`)
        }
        if (filter.subgroup) where.push(`w.subgroup = ${bind(filter.subgroup)}`)
        if (filter.subgroups?.length) where.push(`w.subgroup IN (SELECT value FROM json_each(${bind(JSON.stringify(filter.subgroups))}))`)
        if (filter.assigneeUserId) where.push(`w.assignee_user_id = ${bind(filter.assigneeUserId)}`)
        if (cursor) {
          const at = bind(cursor.activityAt)
          const created = bind(cursor.createdAt)
          const rowId = bind(cursor.id)
          where.push(`(w.activity_at < ${at} OR (w.activity_at = ${at} AND (w.created_at < ${created} OR (w.created_at = ${created} AND w.id < ${rowId}))))`)
        }
        const sql = `${ACTIVITY_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
          ORDER BY w.activity_at DESC, w.created_at DESC, w.id DESC LIMIT ${bind(limit + 1)}`
        const result = await db.prepare(sql).bind(...values).all<ActivityRow>()
        return result.results ?? []
      }),

    byWsid: (wsid) => run(() => db.prepare(`${ACTIVITY_SELECT} WHERE w.wsid = ?1 LIMIT 1`).bind(wsid).first<ActivityRow>()),

    async insert(row, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO workstream_activity (id, wsid, client_id, lead_id, matter_id, subgroup, activity_at, subject, note_body, note_format,
                 next_steps_json, document_record_id, document_url, document_label, task_id, assignee_user_id, assignee_contact_id,
                 assignee_label, visibility, performed_by_user_id, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL, ?15, ?16, ?17, 'internal', ?18, ?19, ?19)`,
            )
            .bind(
              row.id,
              row.wsid,
              row.clientId,
              row.leadId,
              row.matterId,
              row.subgroup,
              row.activityAt,
              row.subject,
              row.noteBody,
              row.noteFormat,
              row.nextStepsJson,
              row.documentRecordId,
              row.documentUrl,
              row.documentLabel,
              row.assigneeUserId,
              row.assigneeContactId,
              row.assigneeLabel,
              row.performedByUserId,
              row.now,
            ),
          auditStatement(db, audit),
        ])
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/UNIQUE constraint failed: workstream_activity\.wsid/i.test(message)) return false
        throw new WorkstreamUnavailableError(error)
      }
    },

    async update(row, audit) {
      await run(() =>
        db.batch([
          db
            .prepare(
              `UPDATE workstream_activity SET client_id = ?2, lead_id = ?3, matter_id = ?4, subgroup = ?5, activity_at = ?6, subject = ?7,
                 note_body = ?8, note_format = ?9, next_steps_json = ?10, assignee_user_id = ?11, assignee_contact_id = ?12,
                 assignee_label = ?13, updated_at = ?14
               WHERE id = ?1`,
            )
            .bind(
              row.id,
              row.clientId,
              row.leadId,
              row.matterId,
              row.subgroup,
              row.activityAt,
              row.subject,
              row.noteBody,
              row.noteFormat,
              row.nextStepsJson,
              row.assigneeUserId,
              row.assigneeContactId,
              row.assigneeLabel,
              row.now,
            ),
          auditStatement(db, audit),
        ]),
      )
    },

    async remove(id, audit) {
      // Comments go with the entry (ON DELETE CASCADE).
      await run(() => db.batch([db.prepare('DELETE FROM workstream_activity WHERE id = ?1').bind(id), auditStatement(db, audit)]))
    },

    staffUsers: () =>
      run(async () => {
        const result = await db
          .prepare(`${personSelect("u.is_active = 1 AND COALESCE(u.role, '') NOT IN ('client', 'external_cpa')")} LIMIT 500`)
          .all<PersonRow>()
        return result.results ?? []
      }),

    person: (userId) => run(() => db.prepare(`${personSelect('u.id = ?1')} LIMIT 1`).bind(userId).first<PersonRow>()),

    clientEmailMethods: (client) =>
      run(async () => {
        // A client's own individual or entity; a group client's active members (old krEmailRecipients.ts).
        const result = await db
          .prepare(
            `WITH owners(kind, owner_id) AS (
               SELECT 'individual', ?2 WHERE ?2 IS NOT NULL
               UNION SELECT 'entity', ?3 WHERE ?3 IS NOT NULL
               UNION SELECT 'individual', cm.individual_id FROM client_member cm WHERE cm.client_id = ?1 AND cm.individual_id IS NOT NULL AND cm.end_date IS NULL AND ?2 IS NULL AND ?3 IS NULL
               UNION SELECT 'entity', cm.entity_id FROM client_member cm WHERE cm.client_id = ?1 AND cm.entity_id IS NOT NULL AND cm.end_date IS NULL AND ?2 IS NULL AND ?3 IS NULL
             )
             SELECT 'individual' AS owner_kind, icm.individual_id AS owner_id, icm.value, icm.is_primary,
                    i.preferred_name, i.first_name, i.last_name, NULL AS legal_name
               FROM individual_contact_method icm JOIN owners o ON o.kind = 'individual' AND o.owner_id = icm.individual_id
               LEFT JOIN individual i ON i.id = icm.individual_id
              WHERE icm.contact_type = 'email' AND icm.valid_to IS NULL
             UNION ALL
             SELECT 'entity', ecm.entity_id, ecm.value, ecm.is_primary, NULL, NULL, NULL, en.legal_name
               FROM entity_contact_method ecm JOIN owners o ON o.kind = 'entity' AND o.owner_id = ecm.entity_id
               LEFT JOIN entity en ON en.id = ecm.entity_id
              WHERE ecm.contact_type = 'email' AND ecm.valid_to IS NULL
             LIMIT 200`,
          )
          .bind(client.id, client.individual_id, client.entity_id)
          .all<EmailMethodRow>()
        return result.results ?? []
      }),
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function workstreamQueriesFor(env: { krhomebase?: D1Database } | undefined): WorkstreamQueries | null {
  return env?.krhomebase ? createWorkstreamQueries(env.krhomebase) : null
}
