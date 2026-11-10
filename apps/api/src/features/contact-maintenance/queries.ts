// file: apps/api/src/features/contact-maintenance/queries.ts
/**
 * The only file in the contact-maintenance area that talks to D1 (plan stage 1d-4). It replaces:
 *  - the old `kr-api-v1/contact-maintenance` route's crud Worker calls (merge and copy-and-inactivate), and
 *  - the crud Worker's own `CONTACT_MAINTENANCE` action (`workers/d1-workers/crud-worker/contact-maintenance.ts`:
 *    removal preflight, delete, inactivate), whose SQL is copied here with its guards unchanged.
 *
 * Table and column names in the SQL come only from the fixed catalogs below, never from a request. Values are
 * always bound.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export type ContactKind = 'individual' | 'entity'

export type IdentityRow = Record<string, unknown> & { id: string; updated_at: string | null }
export type ClientRow = {
  id: string
  client_number: string
  individual_id: string | null
  entity_id: string | null
  display_name: string
  status: 'active' | 'inactive'
  updated_at: string | null
} & Record<string, unknown>
export type ResolutionRow = { id: string; source_kind: ContactKind; source_contact_id: string }

/** Identity fields a merge copies into the record that stays, when that record's field is empty (unchanged lists). */
export const SOURCE_FIELDS_BY_KIND: Record<ContactKind, readonly string[]> = {
  individual: ['title_prefix', 'first_name', 'middle_name', 'last_name', 'suffix', 'preferred_name', 'dob', 'ssn', 'ssn_last4', 'notes'],
  entity: [
    'legal_name',
    'entity_subtype',
    'partnership_type',
    'management_structure',
    'ein',
    'ein_last4',
    'state_of_formation',
    'formation_date',
    'entity_status',
    'sos_file_number',
    'state_taxpayer_number',
    'xt_number',
    'registered_agent_name',
    'boi_status',
    'boi_confirmation_number',
    'notes',
  ],
}

/** Client fields a merge copies when empty on the client that stays (unchanged list). */
export const SAFE_CLIENT_FIELDS = [
  'short_name',
  'prospect_status',
  'intake_date',
  'marketing_consent_status',
  'marketing_consent_at',
  'tax_identifier_last4',
  'tax_identifier',
  'source_system',
  'source_client_number',
  'source_card_name',
  'source_short_name',
] as const

/** Records that stop a merge: the duplicate's client already has billing, documents or WorkStream (unchanged). */
const CLIENT_BLOCKER_PROBES = [
  { table: 'invoice', column: 'billed_to_client_id', label: 'Invoices', category: 'billing' },
  { table: 'ledger_entry', column: 'client_id', label: 'Ledger entries', category: 'billing' },
  { table: 'document_record', column: 'client_id', label: 'Client documents', category: 'documents' },
  { table: 'requested_document', column: 'client_id', label: 'Requested documents', category: 'documents' },
  { table: 'workstream_activity', column: 'client_id', label: 'WorkStream activities', category: 'workstream' },
  { table: 'task', column: 'client_id', label: 'Client tasks', category: 'workstream' },
] as const
/** Records that are kept and only mentioned (unchanged). */
const CLIENT_ADVISORY_PROBES = [
  { table: 'matter_party', column: 'client_id', code: 'matter_party', label: 'Matter relationships are retained' },
  { table: 'communication_log', column: 'client_id', code: 'communication_log', label: 'Communications are retained' },
] as const

type KnownRelationship = { sourceTable: string; sourceColumn: string }

// Direct contact relationships (the crud Worker's catalog, unchanged). Owned phone, email and address rows can be
// removed with an otherwise unreferenced contact; any other reference means the contact is inactivated instead.
const INDIVIDUAL_RELATIONSHIPS: readonly KnownRelationship[] = [
  ['lead', 'individual_id'], ['individual_address', 'individual_id'], ['individual_contact_method', 'individual_id'],
  ['individual_relationship', 'individual_a_id'], ['individual_relationship', 'individual_b_id'], ['entity_contact', 'individual_id'],
  ['client_lead_profile', 'individual_id'],
  ['client', 'individual_id'], ['client_member', 'individual_id'], ['user', 'individual_id'], ['matter_party', 'individual_id'],
  ['event', 'related_individual_id'], ['conflict_check', 'checked_against_individual_id'], ['document_record', 'individual_id'],
  ['asset_ownership', 'co_owner_individual_id'], ['asset_ownership', 'owner_individual_id'],
  ['beneficiary_designation', 'beneficiary_individual_id'], ['communication_log', 'individual_id'],
  ['communication_participant', 'individual_id'], ['event_participant', 'individual_id'], ['conflict_check_party', 'individual_id'],
].map(([sourceTable, sourceColumn]) => ({ sourceTable: sourceTable!, sourceColumn: sourceColumn! }))

const ENTITY_RELATIONSHIPS: readonly KnownRelationship[] = [
  ['entity_address', 'entity_id'], ['entity_contact_method', 'entity_id'], ['entity_contact', 'entity_id'],
  ['client', 'entity_id'], ['client_member', 'entity_id'], ['matter_party', 'entity_id'], ['event', 'related_entity_id'],
  ['conflict_check', 'checked_against_entity_id'], ['document_record', 'entity_id'], ['asset_ownership', 'co_owner_entity_id'],
  ['asset_ownership', 'owner_entity_id'], ['beneficiary_designation', 'beneficiary_entity_id'], ['asset_detail_entity', 'entity_id'],
  ['entity_dba', 'entity_id'], ['entity_registration', 'entity_id'], ['compliance_filing', 'entity_id'], ['entity_event', 'entity_id'],
  ['communication_log', 'entity_id'], ['communication_participant', 'entity_id'], ['event_participant', 'entity_id'],
  ['conflict_check_party', 'entity_id'],
].map(([sourceTable, sourceColumn]) => ({ sourceTable: sourceTable!, sourceColumn: sourceColumn! }))

/** Quotes a name from the catalogs above (never from a request). */
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export type Blocker = { code: string; label: string; count?: number; category?: string }

export interface ContactMaintenanceQueries {
  audit(entry: AuditEntry): D1PreparedStatement
  identity(kind: ContactKind, id: string): Promise<IdentityRow | null>
  client(kind: ContactKind, contactId: string, clientId: string | null): Promise<ClientRow | null>
  resolutionOf(kind: ContactKind, contactId: string): Promise<ResolutionRow | null>
  dependencies(clientId: string | null, kind: ContactKind, contactId: string): Promise<{ blockers: Blocker[]; advisories: Blocker[] }>
  /** Merge or copy-and-inactivate, in one batch with its audit row. */
  applyResolution(input: {
    operation: 'merge' | 'copy_and_inactivate'
    kind: ContactKind
    source: { id: string; identity: IdentityRow; client: ClientRow | null }
    target: { id: string; client: ClientRow | null }
    reason: string | null
    idempotencyKey: string
    audit: AuditEntry
  }): Promise<void>
  /** Delete or inactivate one contact on its own (the crud Worker's guarded batch). */
  removal(input: {
    operation: 'removal_preflight' | 'delete' | 'inactivate'
    kind: ContactKind
    id: string
    confirmationPhrase: string | null
    reason: string | null
    actor: { userId: string; email: string; requestId: string }
  }): Promise<{ deleteAllowed: boolean; inactivateAllowed: boolean; blockers: Blocker[] } | { operation: 'delete' | 'inactivate'; resolved: true; sourceContactId: string }>
}

/** Thrown with an error code the routes answer with. */
export class MaintenanceRefusal extends Error {}

export function createContactMaintenanceQueries(db: D1Database): ContactMaintenanceQueries {
  /** Which of the catalog tables exist in this database (some are newer than others). */
  async function existingTables(names: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(names)]
    const rows = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(unique)).all<{ name: string }>()
    return new Set((rows.results ?? []).map((row) => row.name))
  }

  async function exists(table: string, column: string, value: string): Promise<boolean> {
    return Boolean(await db.prepare(`SELECT 1 FROM ${quote(table)} WHERE ${quote(column)} = ?1 LIMIT 1`).bind(value).first())
  }

  return {
    audit(entry) {
      return auditStatement(db, entry)
    },

    async identity(kind, id) {
      const sql = kind === 'individual' ? 'SELECT * FROM individual WHERE id = ?1' : 'SELECT * FROM entity WHERE id = ?1'
      return (await db.prepare(sql).bind(id).first<IdentityRow>()) ?? null
    },

    async client(kind, contactId, clientId) {
      const column = kind === 'individual' ? 'individual_id' : 'entity_id'
      if (clientId) return (await db.prepare(`SELECT * FROM client WHERE id = ?1 AND ${column} = ?2`).bind(clientId, contactId).first<ClientRow>()) ?? null
      return (await db.prepare(`SELECT * FROM client WHERE ${column} = ?1 ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 1`).bind(contactId).first<ClientRow>()) ?? null
    },

    async resolutionOf(kind, contactId) {
      return (await db.prepare('SELECT id, source_kind, source_contact_id FROM contact_resolution WHERE source_kind = ?1 AND source_contact_id = ?2').bind(kind, contactId).first<ResolutionRow>()) ?? null
    },

    async dependencies(clientId, kind, contactId) {
      const present = await existingTables([...CLIENT_BLOCKER_PROBES, ...CLIENT_ADVISORY_PROBES].map((probe) => probe.table).concat('document_record'))
      const blockers: Blocker[] = []
      const advisories: Blocker[] = []
      if (clientId) {
        for (const probe of CLIENT_BLOCKER_PROBES) {
          if (present.has(probe.table) && (await exists(probe.table, probe.column, clientId))) {
            blockers.push({ category: probe.category, code: `${probe.category}_${probe.table}`, label: probe.label, count: 1 })
          }
        }
        for (const probe of CLIENT_ADVISORY_PROBES) {
          if (present.has(probe.table) && (await exists(probe.table, probe.column, clientId))) advisories.push({ code: probe.code, label: probe.label, count: 1 })
        }
      }
      const documentColumn = kind === 'individual' ? 'individual_id' : 'entity_id'
      if (present.has('document_record') && (await exists('document_record', documentColumn, contactId))) {
        blockers.push({ category: 'documents', code: 'documents_document_record', label: kind === 'individual' ? 'Individual documents' : 'Entity documents', count: 1 })
      }
      return { blockers, advisories }
    },

    async applyResolution({ operation, kind, source, target, reason, idempotencyKey, audit }) {
      const now = new Date().toISOString()
      const statements: D1PreparedStatement[] = []
      // Fill the target's empty identity fields from the duplicate (one fixed statement: COALESCE keeps a filled field).
      const fields = SOURCE_FIELDS_BY_KIND[kind]
      const assignments = fields.map((field, index) => `${quote(field)} = COALESCE(NULLIF(TRIM(${quote(field)}), ''), ?${index + 2})`)
      const values = fields.map((field) => {
        const value = source.identity[field]
        return typeof value === 'string' && value.trim() ? value : null
      })
      const attorney = kind === 'individual' ? `, is_attorney = MAX(is_attorney, ?${fields.length + 2})` : ''
      statements.push(
        db
          .prepare(`UPDATE ${kind === 'individual' ? 'individual' : 'entity'} SET ${assignments.join(', ')}${attorney}, updated_at = ?${fields.length + (kind === 'individual' ? 3 : 2)} WHERE id = ?1`)
          .bind(target.id, ...values, ...(kind === 'individual' ? [source.identity.is_attorney === 1 ? 1 : 0] : []), now),
      )
      if (source.client && target.client) {
        const clientAssignments = SAFE_CLIENT_FIELDS.map((field, index) => `${quote(field)} = COALESCE(NULLIF(TRIM(${quote(field)}), ''), ?${index + 2})`)
        const clientValues = SAFE_CLIENT_FIELDS.map((field) => {
          const value = source.client![field]
          return typeof value === 'string' && value.trim() ? value : null
        })
        statements.push(
          db.prepare(`UPDATE client SET ${clientAssignments.join(', ')}, updated_at = ?${SAFE_CLIENT_FIELDS.length + 2} WHERE id = ?1`).bind(target.client.id, ...clientValues, now),
          db.prepare("UPDATE client SET status = 'inactive', updated_at = ?2 WHERE id = ?1").bind(source.client.id, now),
        )
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO contact_resolution (id, source_kind, source_contact_id, source_client_id, target_kind, target_contact_id, target_client_id, operation, reason, actor_user_id, actor_email, request_id, idempotency_key, created_at)
             VALUES (?1, ?2, ?3, ?4, ?2, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
          )
          .bind(`cres_${crypto.randomUUID()}`, kind, source.id, source.client?.id ?? null, target.id, target.client?.id ?? null, operation, reason, audit.actorUserId, audit.actorEmail, audit.requestId, idempotencyKey, now),
        auditStatement(db, audit),
      )
      await db.batch(statements)
    },

    async removal({ operation, kind, id, confirmationPhrase, reason, actor }) {
      const identity = await db.prepare(`SELECT id FROM ${quote(kind)} WHERE id = ?1`).bind(id).first()
      if (!identity) throw new MaintenanceRefusal('CONTACT_MAINTENANCE_SOURCE_NOT_FOUND')
      const resolved = await db.prepare('SELECT id FROM contact_resolution WHERE source_kind = ?1 AND source_contact_id = ?2').bind(kind, id).first()
      if (resolved) throw new MaintenanceRefusal('CONTACT_MAINTENANCE_SOURCE_ALREADY_RESOLVED')
      const targetResolution = await db.prepare('SELECT id FROM contact_resolution WHERE target_kind = ?1 AND target_contact_id = ?2').bind(kind, id).first()

      const catalog = kind === 'individual' ? INDIVIDUAL_RELATIONSHIPS : ENTITY_RELATIONSHIPS
      const present = await existingTables(catalog.map((relationship) => relationship.sourceTable))
      const available = catalog.filter((relationship) => present.has(relationship.sourceTable))
      const counts = available.length
        ? await db
            .prepare(`SELECT ${available.map((relationship, index) => `(SELECT COUNT(*) FROM ${quote(relationship.sourceTable)} WHERE ${quote(relationship.sourceColumn)} = ?1) AS r${index}`).join(', ')}`)
            .bind(id)
            .first<Record<string, number>>()
        : null
      const owned = new Set([`${kind}_contact_method`, `${kind}_address`])
      const blocking = available.filter((relationship) => !owned.has(relationship.sourceTable))
      const blockers: Blocker[] = [
        ...new Set(blocking.filter((relationship) => Number(counts?.[`r${available.indexOf(relationship)}`] ?? 0) > 0).map((relationship) => relationship.sourceTable)),
      ].map((table) => ({ code: table, label: table.replace(/_/g, ' ') }))
      if (targetResolution) blockers.push({ code: 'contact_resolution', label: 'contact resolution' })
      const deleteAllowed = blockers.length === 0
      if (operation === 'removal_preflight') return { deleteAllowed, inactivateAllowed: !deleteAllowed, blockers }
      if (operation === 'delete' && !deleteAllowed) throw new MaintenanceRefusal('CONTACT_MAINTENANCE_DELETE_BLOCKED')
      if (operation === 'inactivate' && deleteAllowed) throw new MaintenanceRefusal('CONTACT_MAINTENANCE_ELIGIBILITY_CHANGED')
      if (confirmationPhrase !== `${operation === 'delete' ? 'DELETE' : 'INACTIVATE'} ${id}`) throw new MaintenanceRefusal('VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH')

      // The audit row is inserted only when the contact is still eligible; every later statement runs only if that
      // row exists. A change in between therefore saves nothing, and D1 rolls the whole batch back on any failure.
      const auditId = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      const anyReference = blocking.map((relationship) => `EXISTS(SELECT 1 FROM ${quote(relationship.sourceTable)} WHERE ${quote(relationship.sourceColumn)} = ?)`).join(' OR ') || '0'
      const eligibility = operation === 'delete' ? `NOT (${anyReference})` : `(${anyReference})`
      const sourceGuard = `EXISTS(SELECT 1 FROM ${quote(kind)} WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM contact_resolution WHERE (source_kind = ? AND source_contact_id = ?) OR (target_kind = ? AND target_contact_id = ?))`
      const gate = 'EXISTS(SELECT 1 FROM audit_log WHERE id = ?)'
      const statements = [
        db
          .prepare(
            `INSERT INTO audit_log (id, action, target_table, target_id, actor_user_id, actor_email, actor_role, source, resource, request_id, new_json, success, created_at)
             SELECT ?, ?, ?, ?, ?, ?, 'super_admin', 'krhomebase-api', 'contact-maintenance', ?, ?, 1, ? WHERE ${sourceGuard} AND ${eligibility}`,
          )
          .bind(
            auditId,
            `contact_${operation}`,
            kind,
            id,
            actor.userId,
            actor.email,
            actor.requestId,
            JSON.stringify({ operation, reason }),
            timestamp,
            id,
            kind,
            id,
            kind,
            id,
            ...blocking.map(() => id),
          ),
      ]
      if (operation === 'delete') {
        for (const table of [`${kind}_contact_method`, `${kind}_address`, 'client']) {
          statements.push(db.prepare(`DELETE FROM ${quote(table)} WHERE ${quote(`${kind}_id`)} = ? AND ${gate}`).bind(id, auditId))
        }
        statements.push(db.prepare(`DELETE FROM ${quote(kind)} WHERE id = ? AND ${gate}`).bind(id, auditId))
      } else {
        statements.push(db.prepare(`UPDATE client SET status = 'inactive', updated_at = ? WHERE ${quote(`${kind}_id`)} = ? AND ${gate}`).bind(timestamp, id, auditId))
        statements.push(
          db
            .prepare(
              `INSERT INTO contact_resolution (id, source_kind, source_contact_id, operation, reason, actor_user_id, actor_email, request_id, idempotency_key, created_at)
               SELECT ?, ?, ?, 'inactivate', ?, ?, ?, ?, ?, ? WHERE ${gate}`,
            )
            .bind(`cres_${crypto.randomUUID()}`, kind, id, reason, actor.userId, actor.email, actor.requestId, `contact-inactivate:${kind}:${id}`, timestamp, auditId),
        )
      }
      const results = await db.batch(statements)
      if (Number(results[0]?.meta.changes) !== 1) throw new MaintenanceRefusal('CONTACT_MAINTENANCE_ELIGIBILITY_CHANGED')
      return { operation, resolved: true, sourceContactId: id }
    },
  }
}

export function contactMaintenanceQueriesFor(env: { krhomebase?: D1Database } | undefined): ContactMaintenanceQueries | null {
  return env?.krhomebase ? createContactMaintenanceQueries(env.krhomebase) : null
}
