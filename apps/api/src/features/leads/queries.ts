// file: apps/api/src/features/leads/queries.ts
/**
 * The only file of the leads area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables (Schema 8.0):
 *
 * - `lead`: one row per lead; `individual_id` NOT NULL (a lead is always a person); `lcid` UNIQUE; `source`, `status`
 *   and `urgency` CHECK lists; `converted_client_id` once converted.
 * - `individual`, `individual_contact_method`: the person's name and current email and phone (current rows only,
 *   primary first, then the newest; the old route's rule).
 * - `user`, `individual`: the assignee's name. `client`: the converted client's number.
 * - `workstream_activity`, `matter`, `matter_party`: on conversion, the lead's entries move to the client's `.0`.
 *
 * Lists are newest first by `received_at` (index `idx_lead_status_received`), paged with a cursor of `received_at`
 * and `id`. Writes are one batch with the `audit_log` row (resource `leads`). A new LCID is the crud Worker's rule:
 * `L` and the highest number plus one, at least three digits; a clash answers false so the caller tries again.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class LeadsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`LEADS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'LeadsUnavailableError'
  }
}

export interface LeadRow {
  id: string
  lcid: string | null
  individual_id: string
  public_inquiry_id: string | null
  source: string
  status: string
  urgency: string
  summary: string | null
  practice_area: string | null
  assigned_to_user_id: string | null
  received_at: string
  last_action_at: string | null
  converted_client_id: string | null
  created_at: string
  updated_at: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  icid: string | null
  email: string | null
  phone: string | null
  assignee_preferred_name: string | null
  assignee_first_name: string | null
  assignee_last_name: string | null
  assignee_email: string | null
  converted_client_number: string | null
}

export interface LeadInsert {
  id: string
  lcid: string
  individualId: string
  publicInquiryId: string | null
  source: string
  status: string
  urgency: string
  summary: string | null
  practiceArea: string | null
  now: string
}

export interface LeadUpdate {
  id: string
  status: string
  urgency: string
  summary: string | null
  practiceArea: string | null
  assignedToUserId: string | null
  now: string
}

export interface LeadQueries {
  /** Up to `limit + 1` leads after the cursor, newest first. */
  list(filter: { status?: string; includeConverted: boolean }, cursor: { receivedAt: string; id: string } | null, limit: number): Promise<LeadRow[]>
  /** One lead by id or LCID. */
  lead(idOrLcid: string): Promise<LeadRow | null>
  leadForIndividual(individualId: string): Promise<LeadRow | null>
  leadForPublicInquiry(publicInquiryId: string): Promise<LeadRow | null>
  individualExists(individualId: string): Promise<boolean>
  activeStaffUser(userId: string): Promise<boolean>
  /** The highest number among `L<digits>` codes, or 0. */
  highestLcidNumber(): Promise<number>
  /** Saves a new lead; false when its LCID was taken in between. */
  insert(row: LeadInsert, audit: AuditEntry): Promise<boolean>
  update(row: LeadUpdate, audit: AuditEntry): Promise<void>
  /** The client's `.0` matter id. */
  generalMatterId(clientId: string): Promise<string | null>
  /** Marks the lead converted (status won) and moves its Workstream entries to the client's `.0`; returns how many moved. */
  convert(leadId: string, clientId: string, generalMatterId: string, now: string, audit: AuditEntry): Promise<number>
}

const LEAD_SELECT = `SELECT l.id, l.lcid, l.individual_id, l.public_inquiry_id, l.source, l.status, l.urgency, l.summary, l.practice_area,
       l.assigned_to_user_id, l.received_at, l.last_action_at, l.converted_client_id, l.created_at, l.updated_at,
       i.first_name, i.last_name, i.preferred_name, i.icid,
       (SELECT m.value FROM individual_contact_method m WHERE m.individual_id = l.individual_id AND m.contact_type = 'email' AND m.valid_to IS NULL
         ORDER BY m.is_primary DESC, COALESCE(m.updated_at, m.created_at) DESC LIMIT 1) AS email,
       (SELECT m.value FROM individual_contact_method m WHERE m.individual_id = l.individual_id AND m.contact_type = 'phone' AND m.valid_to IS NULL
         ORDER BY m.is_primary DESC, COALESCE(m.updated_at, m.created_at) DESC LIMIT 1) AS phone,
       ai.preferred_name AS assignee_preferred_name, ai.first_name AS assignee_first_name, ai.last_name AS assignee_last_name,
       au.email AS assignee_email, c.client_number AS converted_client_number
  FROM lead l
  LEFT JOIN individual i ON i.id = l.individual_id
  LEFT JOIN user au ON au.id = l.assigned_to_user_id
  LEFT JOIN individual ai ON ai.id = au.individual_id
  LEFT JOIN client c ON c.id = l.converted_client_id`

export function createLeadQueries(db: D1Database): LeadQueries {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      throw new LeadsUnavailableError(error)
    }
  }

  return {
    list: (filter, cursor, limit) =>
      run(async () => {
        const where: string[] = []
        const values: Array<string | number> = []
        const bind = (value: string | number) => {
          values.push(value)
          return `?${values.length}`
        }
        if (filter.status) where.push(`l.status = ${bind(filter.status)}`)
        if (!filter.includeConverted) where.push('l.converted_client_id IS NULL')
        if (cursor) {
          const at = bind(cursor.receivedAt)
          where.push(`(l.received_at < ${at} OR (l.received_at = ${at} AND l.id < ${bind(cursor.id)}))`)
        }
        const sql = `${LEAD_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY l.received_at DESC, l.id DESC LIMIT ${bind(limit + 1)}`
        return (await db.prepare(sql).bind(...values).all<LeadRow>()).results ?? []
      }),

    lead: (idOrLcid) => run(() => db.prepare(`${LEAD_SELECT} WHERE l.id = ?1 OR l.lcid = ?1 LIMIT 1`).bind(idOrLcid).first<LeadRow>()),

    leadForIndividual: (individualId) => run(() => db.prepare(`${LEAD_SELECT} WHERE l.individual_id = ?1 ORDER BY l.received_at DESC LIMIT 1`).bind(individualId).first<LeadRow>()),

    leadForPublicInquiry: (publicInquiryId) => run(() => db.prepare(`${LEAD_SELECT} WHERE l.public_inquiry_id = ?1 LIMIT 1`).bind(publicInquiryId).first<LeadRow>()),

    individualExists: (individualId) => run(async () => Boolean(await db.prepare('SELECT 1 AS found FROM individual WHERE id = ?1 LIMIT 1').bind(individualId).first())),

    activeStaffUser: (userId) =>
      run(async () => Boolean(await db.prepare("SELECT 1 AS found FROM user WHERE id = ?1 AND is_active = 1 AND COALESCE(role, '') NOT IN ('client', 'external_cpa') LIMIT 1").bind(userId).first())),

    highestLcidNumber: () =>
      run(async () => Number((await db.prepare("SELECT MAX(CAST(SUBSTR(lcid, 2) AS INTEGER)) AS max_number FROM lead WHERE lcid GLOB 'L[0-9]*'").first<{ max_number: number | null }>())?.max_number ?? 0)),

    async insert(row, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO lead (id, lcid, individual_id, public_inquiry_id, source, status, urgency, summary, practice_area, assigned_to_user_id,
                 received_at, last_action_at, converted_client_id, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?10, NULL, ?10, ?10)`,
            )
            .bind(row.id, row.lcid, row.individualId, row.publicInquiryId, row.source, row.status, row.urgency, row.summary, row.practiceArea, row.now),
          auditStatement(db, audit),
        ])
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/UNIQUE constraint failed: lead\.lcid/i.test(message)) return false
        throw new LeadsUnavailableError(error)
      }
    },

    async update(row, audit) {
      await run(() =>
        db.batch([
          db
            .prepare('UPDATE lead SET status = ?2, urgency = ?3, summary = ?4, practice_area = ?5, assigned_to_user_id = ?6, last_action_at = ?7, updated_at = ?7 WHERE id = ?1')
            .bind(row.id, row.status, row.urgency, row.summary, row.practiceArea, row.assignedToUserId, row.now),
          auditStatement(db, audit),
        ]),
      )
    },

    generalMatterId: (clientId) =>
      run(async () => {
        const row = await db
          .prepare("SELECT m.id FROM matter m WHERE m.matter_number LIKE '%.0' AND EXISTS (SELECT 1 FROM matter_party mp WHERE mp.matter_id = m.id AND mp.client_id = ?1) ORDER BY m.created_at LIMIT 1")
          .bind(clientId)
          .first<{ id: string }>()
        return row?.id ?? null
      }),

    async convert(leadId, clientId, generalMatterId, now, audit) {
      const results = await run(() =>
        db.batch([
          db
            .prepare("UPDATE workstream_activity SET client_id = ?2, lead_id = NULL, matter_id = ?3, updated_at = ?4 WHERE lead_id = ?1")
            .bind(leadId, clientId, generalMatterId, now),
          db.prepare("UPDATE lead SET converted_client_id = ?2, status = 'won', last_action_at = ?3, updated_at = ?3 WHERE id = ?1").bind(leadId, clientId, now),
          auditStatement(db, audit),
        ]),
      )
      return Number(results[0]?.meta.changes ?? 0)
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function leadQueriesFor(env: { krhomebase?: D1Database } | undefined): LeadQueries | null {
  return env?.krhomebase ? createLeadQueries(env.krhomebase) : null
}
