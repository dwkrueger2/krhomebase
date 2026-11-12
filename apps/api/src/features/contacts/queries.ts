// file: apps/api/src/features/contacts/queries.ts
/**
 * The only file in the contacts area that talks to D1. Read only. Ported from the old contacts GET, which
 * read the same thirteen tables through the CRUD Worker in 1,000-row pages; here each load is one or two
 * `db.batch` calls straight to the `krhomebase` binding.
 *
 *  - `loadAllContactTables`: the whole list (one batch of 13 statements).
 *  - `loadContactSlice`: only the rows that make up the given contacts (two batches), for one contact or a delta.
 *  - `loadChangedContactIds`: which contacts changed since a time, plus every current id (two batches).
 *
 * Full SSN and date of birth: the list and delta statements never select `individual.ssn` or `individual.dob`
 * (they read `NULL AS ssn, NULL AS dob`). Only `loadContactSlice(..., { withSensitive: true })`, used for one
 * contact, reads them. Why: packages/contracts/src/contacts.ts.
 *
 * Id lists are passed as one JSON value and expanded with `json_each`, because D1 allows at most 100 bound
 * values per statement and a delta can name hundreds of contacts.
 */

import type {
  AddressRow,
  ContactAddressLinkRow,
  ContactClientMemberRow,
  ContactClientRow,
  ContactMethodRow,
  ContactResolutionRow,
  EntityContactRow,
  EntityRow,
  IndividualRelationshipRow,
  IndividualRow,
  LinkedContactUser,
} from './rules.ts'

/** Rows of every contact table, as `serializeContacts` needs them (unchanged from the old route). */
export type ContactTables = {
  individuals: IndividualRow[]
  entities: EntityRow[]
  individualMethods: ContactMethodRow[]
  entityMethods: ContactMethodRow[]
  clients: ContactClientRow[]
  clientMembers: ContactClientMemberRow[]
  individualAddressLinks: ContactAddressLinkRow[]
  entityAddressLinks: ContactAddressLinkRow[]
  addresses: AddressRow[]
  entityContactLinks: EntityContactRow[]
  individualRelationships: IndividualRelationshipRow[]
  resolutions: ContactResolutionRow[]
  linkedUsers: LinkedContactUser[]
}

/** What a load cost: statements run and rows per table (returned as `timing`, no contact data). */
export type ContactLoadStats = { statements: number; tables: Array<{ table: string; rows: number }> }

export const EMPTY_CONTACT_TABLES: ContactTables = {
  individuals: [], entities: [], individualMethods: [], entityMethods: [], clients: [], clientMembers: [], individualAddressLinks: [],
  entityAddressLinks: [], addresses: [], entityContactLinks: [], individualRelationships: [], resolutions: [], linkedUsers: [],
}

// ── column lists ───────────────────────────────────────────────────────────────────────────────────────────

/** Individual columns for the list: the full SSN and date of birth are never read. */
const INDIVIDUAL_LIST_COLUMNS =
  'id, icid, title_prefix, first_name, middle_name, last_name, suffix, preferred_name, NULL AS dob, NULL AS ssn, ssn_last4, is_minor, is_attorney, notes, created_at, updated_at'
/** Individual columns for one contact (Edit Details): includes the full SSN and date of birth. */
const INDIVIDUAL_DETAIL_COLUMNS =
  'id, icid, title_prefix, first_name, middle_name, last_name, suffix, preferred_name, dob, ssn, ssn_last4, is_minor, is_attorney, notes, created_at, updated_at'
const ENTITY_COLUMNS =
  'id, ecid, legal_name, entity_subtype, partnership_type, management_structure, ein, ein_last4, state_of_formation, formation_date, entity_status, sos_file_number, state_taxpayer_number, xt_number, registered_agent_name, boi_status, boi_confirmation_number, notes, created_at, updated_at'
const METHOD_COLUMNS = 'id, contact_type, value, label, is_primary, valid_to, created_at, updated_at'
const CLIENT_COLUMNS = 'id, client_number, client_type, individual_id, entity_id, display_name, status, updated_at'
const MEMBER_COLUMNS = 'client_id, individual_id, entity_id, end_date, updated_at'
const ADDRESS_COLUMNS = 'id, street1, street2, city, state, postal_code, created_at, updated_at'
const ADDRESS_LINK_COLUMNS = 'id, address_id, is_primary, valid_to'
const ENTITY_CONTACT_COLUMNS = 'id, entity_id, individual_id, role_lookup_id, is_primary, end_date, created_at, updated_at'
const RELATIONSHIP_COLUMNS =
  'id, individual_a_id, individual_b_id, a_to_b_relationship_lookup_id, b_to_a_relationship_lookup_id, relationship_status, valid_to, is_primary, updated_at, created_at'
const RESOLUTION_COLUMNS = 'source_kind, source_contact_id, operation'
const LINKED_USER_COLUMNS = 'id, individual_id, email, updated_at'

/** `column IN (the JSON list bound as ?1)`. */
const inList = (column: string, parameter = 1) => `${column} IN (SELECT value FROM json_each(?${parameter}))`

const uniqueIds = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))]

function uniqueById<TRow extends { id?: string }>(rows: TRow[]): TRow[] {
  const seen = new Set<string>()
  const rVal = rows.filter((row) => {
    const id = String(row.id ?? '')
    if (!id || seen.has(id)) return !id
    seen.add(id)
    return true
  })
  return rVal
}

type Named = Record<string, D1PreparedStatement>

/** Runs named statements in one batch and returns their rows by name, counting the cost. */
async function runNamed(db: D1Database, statements: Named, stats: ContactLoadStats): Promise<Record<string, unknown[]>> {
  const names = Object.keys(statements)
  const results = await db.batch(names.map((name) => statements[name]!))
  stats.statements += names.length
  const rVal: Record<string, unknown[]> = {}
  names.forEach((name, index) => {
    const rows = (results[index]?.results ?? []) as unknown[]
    rVal[name] = rows
    const existing = stats.tables.find((item) => item.table === name)
    if (existing) existing.rows += rows.length
    else stats.tables.push({ table: name, rows: rows.length })
  })
  return rVal
}

export interface ContactQueries {
  loadAllContactTables(stats: ContactLoadStats): Promise<ContactTables>
  loadContactSlice(contactIds: string[], stats: ContactLoadStats, options?: { includeRelatedContacts?: boolean; withSensitive?: boolean }): Promise<ContactTables>
  loadChangedContactIds(floor: string, stats: ContactLoadStats): Promise<{ changedIds: string[]; allIds: string[] }>
  /** Login accounts linked to one individual (for the "your own contact" exception). */
  linkedUserIdsFor(contactId: string): Promise<string[]>
}

export function createContactQueries(db: D1Database): ContactQueries {
  return {
    async linkedUserIdsFor(contactId) {
      const result = await db.prepare('SELECT id FROM user WHERE individual_id = ?1').bind(contactId).all<{ id: string }>()
      return (result.results ?? []).map((row) => row.id)
    },

    /** Full collection: every contact table in one batch (old: about 2 CRUD Worker calls of 1,000-row pages). */
    async loadAllContactTables(stats) {
      const r = await runNamed(
        db,
        {
          individuals: db.prepare(`SELECT ${INDIVIDUAL_LIST_COLUMNS} FROM individual`),
          entities: db.prepare(`SELECT ${ENTITY_COLUMNS} FROM entity`),
          individualMethods: db.prepare(`SELECT individual_id, ${METHOD_COLUMNS} FROM individual_contact_method`),
          entityMethods: db.prepare(`SELECT entity_id, ${METHOD_COLUMNS} FROM entity_contact_method`),
          clients: db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client`),
          clientMembers: db.prepare(`SELECT ${MEMBER_COLUMNS} FROM client_member`),
          individualAddressLinks: db.prepare(`SELECT individual_id, ${ADDRESS_LINK_COLUMNS} FROM individual_address`),
          entityAddressLinks: db.prepare(`SELECT entity_id, ${ADDRESS_LINK_COLUMNS} FROM entity_address`),
          addresses: db.prepare(`SELECT ${ADDRESS_COLUMNS} FROM address`),
          entityContactLinks: db.prepare(`SELECT ${ENTITY_CONTACT_COLUMNS} FROM entity_contact`),
          individualRelationships: db.prepare(`SELECT ${RELATIONSHIP_COLUMNS} FROM individual_relationship`),
          resolutions: db.prepare(`SELECT ${RESOLUTION_COLUMNS} FROM contact_resolution`),
          linkedUsers: db.prepare(`SELECT ${LINKED_USER_COLUMNS} FROM user WHERE individual_id IS NOT NULL`),
        },
        stats,
      )
      return r as unknown as ContactTables
    },

    /**
     * Only the rows that make up the given contacts, in two batches: the contacts and every row that points
     * at them, then the rows those point at (addresses, group-client accounts, related people's names).
     */
    async loadContactSlice(contactIds, stats, options = {}) {
      const ids = JSON.stringify(uniqueIds(contactIds))
      const includeRelatedContacts = options.includeRelatedContacts !== false
      const individualColumns = options.withSensitive ? INDIVIDUAL_DETAIL_COLUMNS : INDIVIDUAL_LIST_COLUMNS
      const firstStatements: Named = {
        individuals: db.prepare(`SELECT ${individualColumns} FROM individual WHERE ${inList('id')}`).bind(ids),
        entities: db.prepare(`SELECT ${ENTITY_COLUMNS} FROM entity WHERE ${inList('id')}`).bind(ids),
        individualMethods: db.prepare(`SELECT individual_id, ${METHOD_COLUMNS} FROM individual_contact_method WHERE ${inList('individual_id')}`).bind(ids),
        entityMethods: db.prepare(`SELECT entity_id, ${METHOD_COLUMNS} FROM entity_contact_method WHERE ${inList('entity_id')}`).bind(ids),
        clientsByIndividual: db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client WHERE ${inList('individual_id')}`).bind(ids),
        clientsByEntity: db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client WHERE ${inList('entity_id')}`).bind(ids),
        membersByIndividual: db.prepare(`SELECT ${MEMBER_COLUMNS} FROM client_member WHERE ${inList('individual_id')}`).bind(ids),
        membersByEntity: db.prepare(`SELECT ${MEMBER_COLUMNS} FROM client_member WHERE ${inList('entity_id')}`).bind(ids),
        individualAddressLinks: db.prepare(`SELECT individual_id, ${ADDRESS_LINK_COLUMNS} FROM individual_address WHERE ${inList('individual_id')}`).bind(ids),
        entityAddressLinks: db.prepare(`SELECT entity_id, ${ADDRESS_LINK_COLUMNS} FROM entity_address WHERE ${inList('entity_id')}`).bind(ids),
        entityContactLinks: db.prepare(`SELECT ${ENTITY_CONTACT_COLUMNS} FROM entity_contact WHERE ${inList('entity_id')}`).bind(ids),
        resolutions: db.prepare(`SELECT ${RESOLUTION_COLUMNS} FROM contact_resolution WHERE ${inList('source_contact_id')}`).bind(ids),
        linkedUsers: db.prepare(`SELECT ${LINKED_USER_COLUMNS} FROM user WHERE ${inList('individual_id')}`).bind(ids),
      }
      if (includeRelatedContacts) {
        firstStatements.relationshipsA = db.prepare(`SELECT ${RELATIONSHIP_COLUMNS} FROM individual_relationship WHERE ${inList('individual_a_id')}`).bind(ids)
        firstStatements.relationshipsB = db.prepare(`SELECT ${RELATIONSHIP_COLUMNS} FROM individual_relationship WHERE ${inList('individual_b_id')}`).bind(ids)
      }
      const r = await runNamed(db, firstStatements, stats)
      const individuals = r.individuals as IndividualRow[]
      const relationships = includeRelatedContacts
        ? uniqueById([...(r.relationshipsA ?? []), ...(r.relationshipsB ?? [])] as IndividualRelationshipRow[])
        : []
      const entityContactLinks = r.entityContactLinks as EntityContactRow[]
      const directClients = uniqueById([...(r.clientsByIndividual ?? []), ...(r.clientsByEntity ?? [])] as ContactClientRow[])
      const clientMembers = [...(r.membersByIndividual ?? []), ...(r.membersByEntity ?? [])] as ContactClientMemberRow[]
      const individualAddressLinks = r.individualAddressLinks as ContactAddressLinkRow[]
      const entityAddressLinks = r.entityAddressLinks as ContactAddressLinkRow[]

      const loadedIndividualIds = new Set(individuals.map((row) => row.id))
      const loadedClientIds = new Set(directClients.map((row) => row.id))
      const addressIds = uniqueIds([...individualAddressLinks, ...entityAddressLinks].map((link) => link.address_id))
      const memberClientIds = uniqueIds(clientMembers.map((member) => member.client_id)).filter((id) => !loadedClientIds.has(id))
      const relatedIndividualIds = uniqueIds([
        ...relationships.flatMap((row) => [row.individual_a_id, row.individual_b_id]),
        ...entityContactLinks
          .filter((link) => includeRelatedContacts || [ROLE_PRINCIPAL, ROLE_REGISTERED_AGENT].includes(link.role_lookup_id))
          .map((link) => link.individual_id),
      ]).filter((id) => !loadedIndividualIds.has(id))
      const second =
        addressIds.length || memberClientIds.length || relatedIndividualIds.length
          ? await runNamed(
              db,
              {
                addresses: db.prepare(`SELECT ${ADDRESS_COLUMNS} FROM address WHERE ${inList('id')}`).bind(JSON.stringify(addressIds)),
                memberClients: db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client WHERE ${inList('id')}`).bind(JSON.stringify(memberClientIds)),
                // Related people: names only (never their SSN or date of birth).
                relatedIndividuals: db.prepare(`SELECT ${INDIVIDUAL_LIST_COLUMNS} FROM individual WHERE ${inList('id')}`).bind(JSON.stringify(relatedIndividualIds)),
              },
              stats,
            )
          : { addresses: [], memberClients: [], relatedIndividuals: [] }
      const rVal: ContactTables = {
        individuals: [...individuals, ...(second.relatedIndividuals as IndividualRow[])],
        entities: r.entities as EntityRow[],
        individualMethods: r.individualMethods as ContactMethodRow[],
        entityMethods: r.entityMethods as ContactMethodRow[],
        clients: [...directClients, ...(second.memberClients as ContactClientRow[])],
        clientMembers,
        individualAddressLinks,
        entityAddressLinks,
        addresses: second.addresses as AddressRow[],
        entityContactLinks,
        individualRelationships: relationships,
        resolutions: r.resolutions as ContactResolutionRow[],
        linkedUsers: r.linkedUsers as LinkedContactUser[],
      }
      return rVal
    },

    /**
     * Contacts touched since `floor`, found by `updated_at` (`created_at` for contact_resolution), including
     * contacts whose shown data comes from another changed row: an address, a group client, a related person's
     * or point of contact's name, a linked login email. Also returns every current contact id, so the browser
     * can drop deleted or resolved ones. Two batches. (Unchanged rules.)
     */
    async loadChangedContactIds(floor, stats) {
      const since = (table: string, columns: string, column = 'updated_at') => db.prepare(`SELECT ${columns} FROM ${table} WHERE ${column} >= ?1`).bind(floor)
      const r = (await runNamed(
        db,
        {
          individuals: since('individual', 'id'),
          entities: since('entity', 'id'),
          individualMethods: since('individual_contact_method', 'individual_id'),
          entityMethods: since('entity_contact_method', 'entity_id'),
          individualAddressLinks: since('individual_address', 'individual_id'),
          entityAddressLinks: since('entity_address', 'entity_id'),
          addresses: since('address', 'id'),
          clients: since('client', 'id, individual_id, entity_id'),
          clientMembers: since('client_member', 'individual_id, entity_id, client_id'),
          entityContactLinks: since('entity_contact', 'entity_id, individual_id'),
          relationships: since('individual_relationship', 'individual_a_id, individual_b_id'),
          resolutions: since('contact_resolution', 'source_contact_id, target_contact_id', 'created_at'),
          linkedUsers: db.prepare('SELECT individual_id FROM user WHERE updated_at >= ?1 AND individual_id IS NOT NULL').bind(floor),
          allIndividualIds: db.prepare('SELECT id FROM individual'),
          allEntityIds: db.prepare('SELECT id FROM entity'),
          allResolutions: db.prepare('SELECT source_kind, source_contact_id FROM contact_resolution'),
        },
        stats,
      )) as Record<string, Array<Record<string, string | null>>>
      const pick = (rows: Array<Record<string, string | null>> | undefined, ...columns: string[]) => (rows ?? []).flatMap((row) => columns.map((column) => row[column]))
      const changedIndividualIds = uniqueIds(pick(r.individuals, 'id'))
      const changedClientIds = uniqueIds(pick(r.clients, 'id'))
      const changed = new Set(
        uniqueIds([
          ...changedIndividualIds,
          ...pick(r.entities, 'id'),
          ...pick(r.individualMethods, 'individual_id'),
          ...pick(r.entityMethods, 'entity_id'),
          ...pick(r.individualAddressLinks, 'individual_id'),
          ...pick(r.entityAddressLinks, 'entity_id'),
          ...pick(r.clients, 'individual_id', 'entity_id'),
          ...pick(r.clientMembers, 'individual_id', 'entity_id'),
          ...pick(r.entityContactLinks, 'entity_id'),
          ...pick(r.relationships, 'individual_a_id', 'individual_b_id'),
          ...pick(r.resolutions, 'source_contact_id', 'target_contact_id'),
          ...pick(r.linkedUsers, 'individual_id'),
        ]),
      )
      // Rows that point at something that changed: an edited address, a group client, a renamed person.
      const addressIds = JSON.stringify(uniqueIds(pick(r.addresses, 'id')))
      const clientIds = JSON.stringify(changedClientIds)
      const individualIds = JSON.stringify(changedIndividualIds)
      const s = (await runNamed(
        db,
        {
          addressIndividuals: db.prepare(`SELECT individual_id FROM individual_address WHERE ${inList('address_id')}`).bind(addressIds),
          addressEntities: db.prepare(`SELECT entity_id FROM entity_address WHERE ${inList('address_id')}`).bind(addressIds),
          clientMembers: db.prepare(`SELECT individual_id, entity_id FROM client_member WHERE ${inList('client_id')}`).bind(clientIds),
          relatedA: db.prepare(`SELECT individual_b_id FROM individual_relationship WHERE ${inList('individual_a_id')}`).bind(individualIds),
          relatedB: db.prepare(`SELECT individual_a_id FROM individual_relationship WHERE ${inList('individual_b_id')}`).bind(individualIds),
          contactOf: db.prepare(`SELECT entity_id FROM entity_contact WHERE ${inList('individual_id')}`).bind(individualIds),
        },
        stats,
      )) as Record<string, Array<Record<string, string | null>>>
      for (const id of uniqueIds([
        ...pick(s.addressIndividuals, 'individual_id'),
        ...pick(s.addressEntities, 'entity_id'),
        ...pick(s.clientMembers, 'individual_id', 'entity_id'),
        ...pick(s.relatedA, 'individual_b_id'),
        ...pick(s.relatedB, 'individual_a_id'),
        ...pick(s.contactOf, 'entity_id'),
      ]))
        changed.add(id)
      const resolved = new Set((r.allResolutions ?? []).map((row) => `${row.source_kind}:${row.source_contact_id}`))
      const allIds = [
        ...pick(r.allIndividualIds, 'id').filter((id) => !resolved.has(`individual:${id}`)),
        ...pick(r.allEntityIds, 'id').filter((id) => !resolved.has(`entity:${id}`)),
      ].filter((id): id is string => Boolean(id))
      const rVal = { changedIds: [...changed], allIds }
      return rVal
    },
  }
}

// See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
// Rows of the choice lists `entity_contact_role` and `relationship_type`.
const ROLE_PRINCIPAL = 'lk_entity_contact_role_principal'
const ROLE_REGISTERED_AGENT = 'lk_entity_contact_role_registered_agent'

export function contactQueriesFor(env: { krhomebase?: D1Database } | undefined): ContactQueries | null {
  return env?.krhomebase ? createContactQueries(env.krhomebase) : null
}
