// file: apps/api/src/features/contact-edits/queries.ts
/**
 * The only file in the contact-edits area that talks to D1. It replaces the crud Worker calls of the old
 * `kr-api-v1/contacts` POST and PATCH and `kr-api-v1/clients` GET, POST and PATCH (plan stage 1d-3).
 *
 * Shape: the readers return rows; the writers return prepared statements and run nothing. `rules.ts` gathers
 * every statement of one save, adds `auditStatement` for each write, and calls `run(statements)` once, so a save is
 * one `db.batch`: all of it is kept or none of it. (The old route made up to twenty separate crud Worker calls, and
 * a failure half-way left half a save.)
 *
 * Every statement is fixed SQL with bound values. Where the individual and entity tables differ, the SQL is picked
 * from a constant map by the contact's kind, never built from request text. Id lists go through `json_each`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export type ContactKind = 'individual' | 'entity'

const METHOD_TABLE = { individual: 'individual_contact_method', entity: 'entity_contact_method' } as const
const ADDRESS_LINK_TABLE = { individual: 'individual_address', entity: 'entity_address' } as const

/** A contact-method row, as the edit rules need it. */
export type MethodRow = { id: string; contact_type: string; value: string; is_primary: number; valid_to: string | null }
/** An address link with its address id. */
export type AddressLinkRow = { id: string; address_id: string; is_primary: number; valid_to: string | null }
/** An individual-to-individual relationship. */
export type RelationshipRow = { id: string; individual_a_id: string; individual_b_id: string; valid_to: string | null }
/** A person linked to an entity in a role. */
export type EntityContactRow = { id: string; individual_id: string; role_lookup_id: string; end_date: string | null }
/** A login account linked to a person. */
export type LinkedUserRow = { id: string; individual_id: string | null; email: string; updated_at: string | null }
/** A client account. */
export type ClientRow = {
  id: string
  client_number: string
  client_type: string
  individual_id: string | null
  entity_id: string | null
  display_name: string
  prospect_status: string
  status: 'active' | 'inactive'
  updated_at: string | null
}

const CLIENT_COLUMNS = 'id, client_number, client_type, individual_id, entity_id, display_name, prospect_status, status, updated_at'

/** Values for a new individual. */
export type NewIndividual = {
  id: string
  icid: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  preferredName: string | null
  isAttorney: 0 | 1
  notes: string | null
  now: string
}

/** Values for a new entity. */
export type NewEntity = {
  id: string
  ecid: string
  legalName: string
  entitySubtype: string
  entitySubtypeLegacy: string
  ein: string | null
  stateOfFormation: string | null
  entityStatus: string
  boiStatus: string
  notes: string | null
  now: string
}

/** Values written by the individual editor. */
export type IndividualUpdate = {
  titlePrefix: string | null
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  preferredName: string | null
  dob: string | null
  ssn: string | null
  ssnLast4: string | null
  isAttorney: 0 | 1
  notes: string | null
  now: string
}

/** Values written by the entity editor. */
export type EntityUpdate = {
  legalName: string
  entitySubtype: string
  partnershipType: string | null
  managementStructure: string | null
  ein: string | null
  einLast4: string | null
  stateOfFormation: string | null
  formationDate: string | null
  entityStatus: string
  sosFileNumber: string | null
  stateTaxpayerNumber: string | null
  xtNumber: string | null
  registeredAgentName: string | null
  boiStatus: string
  boiConfirmationNumber: string | null
  notes: string | null
  now: string
}

/** Values for a new contact method. */
export type NewMethod = {
  id: string
  contactId: string
  contactType: 'email' | 'phone' | 'fax'
  value: string
  label: string
  useContext: string
  isPrimary: 0 | 1
  canText: 0 | 1
  now: string
}

/** Address fields. */
export type AddressFields = { street1: string | null; street2: string | null; city: string | null; state: string | null; postalCode: string | null }

/** Values for a new client and, with it, its General Matter and the matter's primary client party. */
export type NewClient = {
  id: string
  clientNumber: string
  clientType: ContactKind
  contactId: string
  displayName: string
  prospectStatus: string
  createdByUserId: string
  now: string
}

export interface ContactEditQueries {
  /** Runs the statements of one save as one batch. */
  run(statements: D1PreparedStatement[]): Promise<void>
  /** The `audit_log` insert for one write (platform `auditStatement`), to put in the same batch. */
  audit(entry: AuditEntry): D1PreparedStatement

  // ---- reads
  identityExists(kind: ContactKind, id: string): Promise<boolean>
  methodsOf(kind: ContactKind, id: string): Promise<MethodRow[]>
  addressLinksOf(kind: ContactKind, id: string): Promise<AddressLinkRow[]>
  relationshipsOf(individualId: string): Promise<RelationshipRow[]>
  entityContactsOf(entityId: string): Promise<EntityContactRow[]>
  existingIndividualIds(ids: string[]): Promise<string[]>
  linkedUsersOf(individualId: string): Promise<LinkedUserRow[]>
  loginEmailTakenByOther(email: string, userId: string): Promise<boolean>
  clientsByNumber(clientNumber: string): Promise<ClientRow[]>
  clientById(clientId: string): Promise<ClientRow | null>
  clientForIdentity(kind: ContactKind, contactId: string): Promise<ClientRow | null>
  allClientNumbers(): Promise<string[]>
  generalMatterIdsFor(clientId: string, matterNumber: string): Promise<string[]>

  // ---- writes (statements only)
  insertIndividual(row: NewIndividual): D1PreparedStatement
  insertEntity(row: NewEntity): D1PreparedStatement
  updateIndividual(id: string, row: IndividualUpdate): D1PreparedStatement
  updateEntity(id: string, row: EntityUpdate): D1PreparedStatement
  insertMethod(kind: ContactKind, row: NewMethod): D1PreparedStatement
  updateMethod(kind: ContactKind, id: string, value: string, isPrimary: 0 | 1, validTo: string | null, now: string): D1PreparedStatement
  insertAddress(id: string, fields: AddressFields, now: string): D1PreparedStatement
  updateAddress(id: string, fields: AddressFields, now: string): D1PreparedStatement
  insertAddressLink(kind: ContactKind, id: string, contactId: string, addressId: string, useContext: string, now: string): D1PreparedStatement
  endRelationship(id: string, now: string): D1PreparedStatement
  restoreRelationship(id: string, lookupId: string, now: string): D1PreparedStatement
  insertRelationship(id: string, aId: string, bId: string, lookupId: string, now: string): D1PreparedStatement
  endEntityContact(id: string, now: string): D1PreparedStatement
  restoreEntityContact(id: string, isPrimary: 0 | 1, now: string): D1PreparedStatement
  insertEntityContact(id: string, entityId: string, individualId: string, roleLookupId: string, isPrimary: 0 | 1, now: string): D1PreparedStatement
  updateLoginEmail(userId: string, email: string, now: string): D1PreparedStatement
  revokeSessionsOf(userId: string, now: string): D1PreparedStatement
  insertClient(row: NewClient): D1PreparedStatement
  insertGeneralMatter(id: string, clientNumber: string, createdByUserId: string, now: string): D1PreparedStatement
  insertPrimaryClientParty(id: string, matterId: string, clientId: string, now: string): D1PreparedStatement
  updateClientAccount(id: string, clientNumber: string, status: 'active' | 'inactive', displayName: string, now: string): D1PreparedStatement
  renumberMatters(matterIds: string[], matterNumber: string, now: string): D1PreparedStatement
}

/** The General Matter every new client gets (unchanged from the crud Worker). */
// See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
// The three `*LookupId` values below are rows of the choice lists `practice_area`, `matter_status` and `party_role`.
export const GENERAL_MATTER = {
  title: 'Client General Matters',
  description: 'General Client work that has not been assigned to a specific Matter.',
  typeLabel: 'Client General Matter',
  practiceAreaLookupId: 'lk_practice_area_miscellaneous',
  statusLookupId: 'lk_matter_status_open',
  primaryClientRoleLookupId: 'lk_party_role_primary_client',
} as const

export function createContactEditQueries(db: D1Database): ContactEditQueries {
  const all = async <T,>(statement: D1PreparedStatement): Promise<T[]> => (await statement.all<T>()).results ?? []

  return {
    async run(statements) {
      if (statements.length) await db.batch(statements)
    },
    audit(entry) {
      return auditStatement(db, entry)
    },

    async identityExists(kind, id) {
      const sql = kind === 'individual' ? 'SELECT id FROM individual WHERE id = ?1' : 'SELECT id FROM entity WHERE id = ?1'
      return Boolean(await db.prepare(sql).bind(id).first())
    },
    methodsOf(kind, id) {
      const sql =
        kind === 'individual'
          ? 'SELECT id, contact_type, value, is_primary, valid_to FROM individual_contact_method WHERE individual_id = ?1 ORDER BY created_at, id'
          : 'SELECT id, contact_type, value, is_primary, valid_to FROM entity_contact_method WHERE entity_id = ?1 ORDER BY created_at, id'
      return all<MethodRow>(db.prepare(sql).bind(id))
    },
    addressLinksOf(kind, id) {
      const sql =
        kind === 'individual'
          ? 'SELECT id, address_id, is_primary, valid_to FROM individual_address WHERE individual_id = ?1 ORDER BY created_at, id'
          : 'SELECT id, address_id, is_primary, valid_to FROM entity_address WHERE entity_id = ?1 ORDER BY created_at, id'
      return all<AddressLinkRow>(db.prepare(sql).bind(id))
    },
    relationshipsOf(individualId) {
      return all<RelationshipRow>(
        db.prepare('SELECT id, individual_a_id, individual_b_id, valid_to FROM individual_relationship WHERE individual_a_id = ?1 OR individual_b_id = ?1').bind(individualId),
      )
    },
    entityContactsOf(entityId) {
      return all<EntityContactRow>(db.prepare('SELECT id, individual_id, role_lookup_id, end_date FROM entity_contact WHERE entity_id = ?1').bind(entityId))
    },
    async existingIndividualIds(ids) {
      if (!ids.length) return []
      const rows = await all<{ id: string }>(db.prepare('SELECT id FROM individual WHERE id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(ids)))
      return rows.map((row) => row.id)
    },
    linkedUsersOf(individualId) {
      return all<LinkedUserRow>(db.prepare('SELECT id, individual_id, email, updated_at FROM user WHERE individual_id = ?1 LIMIT 2').bind(individualId))
    },
    async loginEmailTakenByOther(email, userId) {
      // The unique index on user.email is case-sensitive; older accounts may differ only in case (unchanged check).
      return Boolean(await db.prepare('SELECT id FROM user WHERE lower(trim(email)) = ?1 AND id <> ?2 LIMIT 1').bind(email, userId).first())
    },
    clientsByNumber(clientNumber) {
      return all<ClientRow>(db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client WHERE client_number = ?1 LIMIT 5`).bind(clientNumber))
    },
    async clientById(clientId) {
      return (await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client WHERE id = ?1`).bind(clientId).first<ClientRow>()) ?? null
    },
    async clientForIdentity(kind, contactId) {
      // Active first (unchanged).
      const sql =
        kind === 'individual'
          ? `SELECT ${CLIENT_COLUMNS} FROM client WHERE individual_id = ?1 ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 1`
          : `SELECT ${CLIENT_COLUMNS} FROM client WHERE entity_id = ?1 ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 1`
      return (await db.prepare(sql).bind(contactId).first<ClientRow>()) ?? null
    },
    async allClientNumbers() {
      const rows = await all<{ client_number: string | null }>(db.prepare('SELECT client_number FROM client'))
      return rows.map((row) => row.client_number ?? '').filter(Boolean)
    },
    async generalMatterIdsFor(clientId, matterNumber) {
      // A matter belongs to a client through matter_party (matter has no client_id column).
      const rows = await all<{ id: string }>(
        db
          .prepare('SELECT DISTINCT m.id FROM matter m JOIN matter_party mp ON mp.matter_id = m.id WHERE m.matter_number = ?1 AND mp.client_id = ?2')
          .bind(matterNumber, clientId),
      )
      return rows.map((row) => row.id)
    },

    insertIndividual(row) {
      return db
        .prepare(
          `INSERT INTO individual (id, icid, first_name, middle_name, last_name, suffix, preferred_name, dob, ssn_last4, is_minor, is_attorney, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, 0, ?8, ?9, ?10, ?10)`,
        )
        .bind(row.id, row.icid, row.firstName, row.middleName, row.lastName, row.suffix, row.preferredName, row.isAttorney, row.notes, row.now)
    },
    insertEntity(row) {
      return db
        .prepare(
          `INSERT INTO entity (id, ecid, legal_name, entity_subtype_legacy, entity_subtype, ein, ein_last4, state_of_formation, entity_status, boi_status, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10, ?11, ?11)`,
        )
        .bind(row.id, row.ecid, row.legalName, row.entitySubtypeLegacy, row.entitySubtype, row.ein, row.stateOfFormation, row.entityStatus, row.boiStatus, row.notes, row.now)
    },
    updateIndividual(id, row) {
      return db
        .prepare(
          `UPDATE individual SET title_prefix = ?2, first_name = ?3, middle_name = ?4, last_name = ?5, suffix = ?6, preferred_name = ?7,
             dob = ?8, ssn = ?9, ssn_last4 = ?10, is_attorney = ?11, notes = ?12, updated_at = ?13 WHERE id = ?1`,
        )
        .bind(id, row.titlePrefix, row.firstName, row.middleName, row.lastName, row.suffix, row.preferredName, row.dob, row.ssn, row.ssnLast4, row.isAttorney, row.notes, row.now)
    },
    updateEntity(id, row) {
      return db
        .prepare(
          `UPDATE entity SET legal_name = ?2, entity_subtype = ?3, partnership_type = ?4, management_structure = ?5, ein = ?6, ein_last4 = ?7,
             state_of_formation = ?8, formation_date = ?9, entity_status = ?10, sos_file_number = ?11, state_taxpayer_number = ?12, xt_number = ?13,
             registered_agent_name = ?14, boi_status = ?15, boi_confirmation_number = ?16, notes = ?17, updated_at = ?18 WHERE id = ?1`,
        )
        .bind(
          id,
          row.legalName,
          row.entitySubtype,
          row.partnershipType,
          row.managementStructure,
          row.ein,
          row.einLast4,
          row.stateOfFormation,
          row.formationDate,
          row.entityStatus,
          row.sosFileNumber,
          row.stateTaxpayerNumber,
          row.xtNumber,
          row.registeredAgentName,
          row.boiStatus,
          row.boiConfirmationNumber,
          row.notes,
          row.now,
        )
    },
    insertMethod(kind, row) {
      const identityColumn = kind === 'individual' ? 'individual_id' : 'entity_id'
      return db
        .prepare(
          `INSERT INTO ${METHOD_TABLE[kind]} (id, ${identityColumn}, contact_type, subtype_lookup_id, value, label, use_context, is_primary, can_text, is_verified, do_not_contact, valid_from, valid_to, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, 0, 0, ?9, NULL, NULL, ?10, ?10)`,
        )
        .bind(row.id, row.contactId, row.contactType, row.value, row.label, row.useContext, row.isPrimary, row.canText, row.now.slice(0, 10), row.now)
    },
    updateMethod(kind, id, value, isPrimary, validTo, now) {
      return db.prepare(`UPDATE ${METHOD_TABLE[kind]} SET value = ?2, is_primary = ?3, valid_to = ?4, updated_at = ?5 WHERE id = ?1`).bind(id, value, isPrimary, validTo, now)
    },
    insertAddress(id, fields, now) {
      return db
        .prepare(
          `INSERT INTO address (id, street1, street2, city, state, postal_code, country, address_quality, source_system, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'US', 'partial', 'kr-homebase-ui', ?7, ?7)`,
        )
        .bind(id, fields.street1, fields.street2, fields.city, fields.state, fields.postalCode, now)
    },
    updateAddress(id, fields, now) {
      return db
        .prepare('UPDATE address SET street1 = ?2, street2 = ?3, city = ?4, state = ?5, postal_code = ?6, updated_at = ?7 WHERE id = ?1')
        .bind(id, fields.street1, fields.street2, fields.city, fields.state, fields.postalCode, now)
    },
    insertAddressLink(kind, id, contactId, addressId, useContext, now) {
      const identityColumn = kind === 'individual' ? 'individual_id' : 'entity_id'
      return db
        .prepare(
          `INSERT INTO ${ADDRESS_LINK_TABLE[kind]} (id, ${identityColumn}, address_id, address_type_lookup_id, use_context, is_primary, valid_from, valid_to, source, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, NULL, ?4, 1, ?5, NULL, 'kr-homebase-ui', NULL, ?6, ?6)`,
        )
        .bind(id, contactId, addressId, useContext, now.slice(0, 10), now)
    },
    endRelationship(id, now) {
      return db.prepare("UPDATE individual_relationship SET valid_to = ?2, relationship_status = 'former', updated_at = ?3 WHERE id = ?1").bind(id, now.slice(0, 10), now)
    },
    restoreRelationship(id, lookupId, now) {
      return db
        .prepare(
          "UPDATE individual_relationship SET relationship_status = 'current', valid_to = NULL, a_to_b_relationship_lookup_id = ?2, b_to_a_relationship_lookup_id = ?2, updated_at = ?3 WHERE id = ?1",
        )
        .bind(id, lookupId, now)
    },
    insertRelationship(id, aId, bId, lookupId, now) {
      return db
        .prepare(
          `INSERT INTO individual_relationship (id, individual_a_id, individual_b_id, a_to_b_relationship_lookup_id, b_to_a_relationship_lookup_id, relationship_status, valid_from, valid_to, is_primary, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?4, 'current', ?5, NULL, 0, NULL, ?6, ?6)`,
        )
        .bind(id, aId, bId, lookupId, now.slice(0, 10), now)
    },
    endEntityContact(id, now) {
      return db.prepare('UPDATE entity_contact SET end_date = ?2, is_primary = 0, updated_at = ?3 WHERE id = ?1').bind(id, now.slice(0, 10), now)
    },
    restoreEntityContact(id, isPrimary, now) {
      return db.prepare('UPDATE entity_contact SET end_date = NULL, is_primary = ?2, updated_at = ?3 WHERE id = ?1').bind(id, isPrimary, now)
    },
    insertEntityContact(id, entityId, individualId, roleLookupId, isPrimary, now) {
      return db
        .prepare(
          `INSERT INTO entity_contact (id, entity_id, individual_id, role_lookup_id, is_primary, start_date, end_date, notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?7)`,
        )
        .bind(id, entityId, individualId, roleLookupId, isPrimary, now.slice(0, 10), now)
    },
    updateLoginEmail(userId, email, now) {
      return db.prepare('UPDATE user SET email = ?2, updated_at = ?3 WHERE id = ?1').bind(userId, email, now)
    },
    revokeSessionsOf(userId, now) {
      return db.prepare("UPDATE kr_session SET revoked_at = ?2, revoked_reason = 'login_email_changed' WHERE user_id = ?1 AND revoked_at IS NULL").bind(userId, now)
    },
    insertClient(row) {
      const individualId = row.clientType === 'individual' ? row.contactId : null
      const entityId = row.clientType === 'entity' ? row.contactId : null
      return db
        .prepare(
          `INSERT INTO client (id, client_number, client_type, individual_id, entity_id, display_name, card_image_media_id, prospect_status, intake_date, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, NULL, 'active', ?8, ?8)`,
        )
        .bind(row.id, row.clientNumber, row.clientType, individualId, entityId, row.displayName, row.prospectStatus, row.now)
    },
    insertGeneralMatter(id, clientNumber, createdByUserId, now) {
      return db
        .prepare(
          `INSERT INTO matter (id, matter_number, title, description, matter_type_label, practice_area_lookup_id, status_lookup_id, opened_date, primary_attorney_user_id, created_by_user_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?10)`,
        )
        .bind(
          id,
          `${clientNumber}.0`,
          GENERAL_MATTER.title,
          GENERAL_MATTER.description,
          GENERAL_MATTER.typeLabel,
          GENERAL_MATTER.practiceAreaLookupId,
          GENERAL_MATTER.statusLookupId,
          now.slice(0, 10),
          createdByUserId,
          now,
        )
    },
    insertPrimaryClientParty(id, matterId, clientId, now) {
      return db
        .prepare(
          `INSERT INTO matter_party (id, matter_id, client_id, individual_id, entity_id, party_role_lookup_id, is_primary_client, is_responsible_party, receives_bill, signs_engagement, added_date, notes)
           VALUES (?1, ?2, ?3, NULL, NULL, ?4, 1, 1, 1, 1, ?5, NULL)`,
        )
        .bind(id, matterId, clientId, GENERAL_MATTER.primaryClientRoleLookupId, now.slice(0, 10))
    },
    updateClientAccount(id, clientNumber, status, displayName, now) {
      return db.prepare('UPDATE client SET client_number = ?2, status = ?3, display_name = ?4, updated_at = ?5 WHERE id = ?1').bind(id, clientNumber, status, displayName, now)
    },
    renumberMatters(matterIds, matterNumber, now) {
      return db.prepare('UPDATE matter SET matter_number = ?2, updated_at = ?3 WHERE id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(matterIds), matterNumber, now)
    },
  }
}

export function contactEditQueriesFor(env: { krhomebase?: D1Database } | undefined): ContactEditQueries | null {
  return env?.krhomebase ? createContactEditQueries(env.krhomebase) : null
}
