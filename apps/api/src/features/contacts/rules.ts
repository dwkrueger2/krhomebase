// file: apps/api/src/features/contacts/rules.ts
/**
 * Contacts: turning database rows into contact cards. Ported from the old
 * `apps/kr-homebase/.../api/kr-api-v1/contacts/route.ts` (GET). The row types, `serializeContacts` and its
 * helpers are copied unchanged, so every contact looks exactly as before: display name, type label, primary
 * email and phone, primary address, client account (direct or through a group), point of contact,
 * registered agent and related people. Resolved duplicates (`contact_resolution`) are left out.
 *
 * One field is new: `clientDisplayName`, the client account's own name, so the browser can build the billing
 * client list from contacts (plan item 3) and list a joint client once, under its own name.
 *
 * Added here (the old route did these inline): `applyLinkedAccounts` (the login account's email wins),
 * `toListItem` (drops the full SSN and date of birth from the list; see packages/contracts/src/contacts.ts),
 * `contactCollectionVersion` (the same SHA-256 as before, with Web Crypto instead of node:crypto) and
 * `changedSinceFloor`.
 */

import type { ContactDetail, ContactListItem } from '@krhomebase/contracts'
import type { ContactTables } from './queries.ts'

/** A contact card before the login-account fields are added. */
export type SerializedContact = Omit<ContactDetail, 'linkedUserId' | 'isCurrentUser' | 'canEditLoginEmail'>

/** A login account linked to a person (columns of `user`). */
export type LinkedContactUser = { id: string; individual_id: string | null; email: string; updated_at: string | null }

/** A selectable individual projected for relationship fields in the editor. */
type PublicRelatedContact = {
  id: string
  displayName: string
  icid: string | null
  relationship?: string | null
}

/** Individual row projection used by contacts aggregation. */
export type IndividualRow = {
  id: string
  icid: string | null
  title_prefix: string | null
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  preferred_name: string | null
  dob: string | null
  ssn: string | null
  ssn_last4: string | null
  is_minor: number | null
  is_attorney: number | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

/** Entity row projection used by contacts aggregation. */
export type EntityRow = {
  id: string
  ecid: string | null
  legal_name: string
  entity_subtype: string
  partnership_type?: string | null
  management_structure?: string | null
  ein?: string | null
  ein_last4?: string | null
  state_of_formation?: string | null
  formation_date?: string | null
  entity_status: string
  sos_file_number?: string | null
  state_taxpayer_number?: string | null
  xt_number?: string | null
  registered_agent_name?: string | null
  boi_status: string
  boi_confirmation_number?: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

/** Contact-method row projection used by contacts aggregation. */
export type ContactMethodRow = {
  id: string
  individual_id?: string | null
  entity_id?: string | null
  contact_type: string
  value: string
  label: string | null
  is_primary: number
  valid_to?: string | null
  created_at: string
  updated_at?: string | null
}

/** Entity-to-individual relationship used to display a primary point of contact. */
export type EntityContactRow = {
  id: string
  entity_id: string
  individual_id: string
  role_lookup_id: string
  is_primary: number
  end_date?: string | null
  created_at?: string | null
  updated_at?: string | null
}

/** Individual-to-individual relationship row used by related-contact projections. */
export type IndividualRelationshipRow = {
  id: string
  individual_a_id: string
  individual_b_id: string
  a_to_b_relationship_lookup_id: string
  b_to_a_relationship_lookup_id: string
  relationship_status: string
  valid_to?: string | null
  is_primary: number
  updated_at?: string | null
  created_at: string
}

/** Address row projected for contact-card enrichment. */
export type AddressRow = {
  id: string
  street1: string | null
  street2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  created_at?: string | null
  updated_at?: string | null
}

/** Link row connecting a contact identity to its primary address. */
export type ContactAddressLinkRow = {
  id: string
  individual_id?: string | null
  entity_id?: string | null
  address_id: string
  is_primary: number
  valid_to?: string | null
}

/** Client row projection used to mark contacts that have a client account. */
export type ContactClientRow = {
  id: string
  client_number: string
  client_type: string
  individual_id: string | null
  entity_id: string | null
  /** The client account's own name ("Ann & Bob Example" for a joint client). Added for the billing client list. */
  display_name?: string | null
  status: string
  updated_at?: string | null
}

/** Client-member row used to mark group-client contacts. */
export type ContactClientMemberRow = {
  client_id: string
  individual_id: string | null
  entity_id: string | null
  end_date: string | null
  updated_at?: string | null
}

/** Durable source-to-target mapping used to suppress resolved duplicates. */
export type ContactResolutionRow = {
  source_kind: 'individual' | 'entity'
  source_contact_id: string
  operation: 'merge' | 'copy_and_inactivate' | 'inactivate'
}


const ENTITY_CONTACT_ROLE_PRINCIPAL = 'lk_entity_contact_role_principal'
const ENTITY_CONTACT_ROLE_REGISTERED_AGENT = 'lk_entity_contact_role_registered_agent'
const ENTITY_CONTACT_ROLE_RELATED = 'lk_entity_contact_role_related_contact'
const RELATED_CONTACT_LOOKUP_ID = 'lk_relationship_related_contact'
const RELATIONSHIP_LABELS: Record<string, string> = {
  lk_relationship_spouse: 'Spouse',
  lk_relationship_former_spouse: 'Former spouse',
  lk_relationship_parent: 'Parent',
  lk_relationship_child: 'Child',
  lk_relationship_sibling: 'Sibling',
  lk_relationship_guardian: 'Guardian',
  lk_relationship_ward: 'Ward',
  lk_relationship_emergency_contact: 'Emergency contact',
  [RELATED_CONTACT_LOOKUP_ID]: 'Related contact',
  [ENTITY_CONTACT_ROLE_RELATED]: 'Related contact',
}

export function entityTypeLabel(row: EntityRow): string {
  const labels: Record<string, string> = {
    corporation: 'Corporation',
    estate: 'Estate',
    government: 'Government',
    llc: 'LLC',
    nonprofit: 'Nonprofit',
    partnership: 'Partnership',
    sole_prop: 'Sole Prop',
    trust: 'Trust',
  }
  if (row.entity_subtype === 'partnership' && row.partnership_type) return row.partnership_type.toUpperCase()
  return labels[row.entity_subtype] ?? row.entity_subtype
}

/**
 * Selects the primary value for a contact type.
 *
 * @param rows - Candidate contact-method rows.
 * @param contactType - Desired contact type.
 * @returns Primary value or first matching value.
 */
function primaryContactValue(rows: ContactMethodRow[], contactType: string): string | null {
  const matching = rows.filter((row) => row.contact_type === contactType && !row.valid_to)
  const primary = matching.find((row) => row.is_primary === 1) ?? matching[0]
  return primary?.value ?? null
}

/** Builds a stable display name for an individual relationship target. */
function individualPublicName(row: IndividualRow): string {
  return row.preferred_name || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')
}

/** Converts one individual row to the compact selector option shape. */
function relatedContactOption(row: IndividualRow, relationship?: string | null): PublicRelatedContact {
  return { id: row.id, displayName: individualPublicName(row), icid: row.icid ?? null, relationship: relationship ?? null }
}

/** Selects the first active non-primary value for a contact type. */
function secondaryContactValue(rows: ContactMethodRow[], contactType: string): string | null {
  const matching = rows
    .filter((row) => row.contact_type === contactType && !row.valid_to && row.is_primary !== 1)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
  return matching[0]?.value ?? null
}

function primaryAddress(
  links: ContactAddressLinkRow[],
  addresses: AddressRow[],
  kind: 'individual' | 'entity',
  contactId: string,
): AddressRow | null {
  const matching = links
    .filter((link) => (kind === 'individual' ? link.individual_id === contactId : link.entity_id === contactId) && !link.valid_to)
    .sort((left, right) => right.is_primary - left.is_primary)
  const addressId = matching[0]?.address_id
  return addressId ? addresses.find((address) => address.id === addressId) ?? null : null
}

function clientForContact(
  clients: ContactClientRow[],
  members: ContactClientMemberRow[],
  kind: 'individual' | 'entity',
  contactId: string,
): ContactClientRow | null {
  const matching = clients.filter((client) => kind === 'individual' ? client.individual_id === contactId : client.entity_id === contactId)
  if (matching.length) return matching.find((client) => client.status === 'active') ?? matching[0] ?? null
  const memberClientIds = new Set(
    members
      .filter((member) => (kind === 'individual' ? member.individual_id === contactId : member.entity_id === contactId) && !member.end_date)
      .map((member) => member.client_id),
  )
  const memberClients = clients.filter((client) => memberClientIds.has(client.id))
  return memberClients.find((client) => client.status === 'active') ?? memberClients[0] ?? null
}

/** Returns the newest usable source timestamp for a contact projection. */
export function latestContactTimestamp(...timestamps: Array<string | null | undefined>): string | null {
  const usable = timestamps.filter((timestamp): timestamp is string => Boolean(timestamp))
  if (usable.length === 0) return null
  return usable.reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest))
}

/**
 * Converts individual and entity rows to card-ready contact objects.
 *
 * @param individuals - Individual rows.
 * @param entities - Entity rows.
 * @param individualMethods - Individual contact methods.
 * @param entityMethods - Entity contact methods.
 * @returns Combined public contacts.
 */
export function serializeContacts(
  individuals: IndividualRow[],
  entities: EntityRow[],
  individualMethods: ContactMethodRow[],
  entityMethods: ContactMethodRow[],
  clients: ContactClientRow[],
  clientMembers: ContactClientMemberRow[],
  individualAddressLinks: ContactAddressLinkRow[],
  entityAddressLinks: ContactAddressLinkRow[],
  addresses: AddressRow[],
  entityContactLinks: EntityContactRow[],
  individualRelationships: IndividualRelationshipRow[],
  resolutions: ContactResolutionRow[],
): SerializedContact[] {
  const resolvedIds = new Set(resolutions.map((resolution) => `${resolution.source_kind}:${resolution.source_contact_id}`))
  const individualContacts = individuals.map((row) => {
    const methods = individualMethods.filter((method) => method.individual_id === row.id)
    const address = primaryAddress(individualAddressLinks, addresses, 'individual', row.id)
    const fullName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')
    const client = clientForContact(clients, clientMembers, 'individual', row.id)
    const relatedContacts = individualRelationships
      .filter((relationship) => (relationship.individual_a_id === row.id || relationship.individual_b_id === row.id) && !relationship.valid_to && relationship.relationship_status === 'current')
      .map((relationship) => {
        const isA = relationship.individual_a_id === row.id
        const relatedId = isA ? relationship.individual_b_id : relationship.individual_a_id
        const related = individuals.find((individual) => individual.id === relatedId)
        if (!related) return null
        const lookupId = isA ? relationship.a_to_b_relationship_lookup_id : relationship.b_to_a_relationship_lookup_id
        return relatedContactOption(related, RELATIONSHIP_LABELS[lookupId] ?? 'Related contact')
      })
      .filter((related): related is PublicRelatedContact => Boolean(related))
    return {
      id: row.id,
      kind: 'individual' as const,
      icid: row.icid ?? null,
      typeLabel: 'Person',
      displayName: row.preferred_name || fullName,
      titlePrefix: row.title_prefix,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      suffix: row.suffix,
      preferredName: row.preferred_name,
      dob: row.dob,
      ssn: row.ssn,
      ssnLast4: row.ssn_last4,
      isMinor: row.is_minor === 1,
      isAttorney: row.is_attorney === 1,
      email: primaryContactValue(methods, 'email'),
      phone: primaryContactValue(methods, 'phone'),
      phoneSecondary: secondaryContactValue(methods, 'phone'),
      fax: primaryContactValue(methods, 'fax'),
      addressLine1: address?.street1 ?? '',
      addressLine2: address?.street2 ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      postalCode: address?.postal_code ?? '',
      status: 'individual',
      notes: row.notes,
      relatedContacts,
      isClient: client?.status === 'active',
      clientId: client?.id ?? null,
      clientNumber: client?.client_number ?? null,
      clientDisplayName: client?.display_name ?? null,
      clientType: client?.client_type ?? null,
      clientStatus: client?.status ?? null,
      createdAt: row.created_at,
      updatedAt: latestContactTimestamp(
        row.updated_at,
        ...methods.map((method) => method.updated_at ?? method.created_at),
        address?.updated_at,
        client?.updated_at,
      ),
    }
  })

  const entityContacts = entities.map((row) => {
    const methods = entityMethods.filter((method) => method.entity_id === row.id)
    const address = primaryAddress(entityAddressLinks, addresses, 'entity', row.id)
    const client = clientForContact(clients, clientMembers, 'entity', row.id)
    const primaryContactLink = entityContactLinks
      .filter((link) => link.entity_id === row.id && !link.end_date && link.role_lookup_id === ENTITY_CONTACT_ROLE_PRINCIPAL)
      .sort((left, right) => right.is_primary - left.is_primary)[0]
    const pointOfContact = primaryContactLink
      ? individuals.find((individual) => individual.id === primaryContactLink.individual_id)
      : null
    const pointOfContactOption = pointOfContact ? relatedContactOption(pointOfContact) : null
    const registeredAgentLink = entityContactLinks
      .filter((link) => link.entity_id === row.id && !link.end_date && link.role_lookup_id === ENTITY_CONTACT_ROLE_REGISTERED_AGENT)
      .sort((left, right) => right.is_primary - left.is_primary)[0]
    const registeredAgent = registeredAgentLink
      ? individuals.find((individual) => individual.id === registeredAgentLink.individual_id)
      : null
    const relatedContacts = entityContactLinks
      .filter((link) => link.entity_id === row.id && !link.end_date && link.role_lookup_id === ENTITY_CONTACT_ROLE_RELATED)
      .map((link) => {
        const related = individuals.find((individual) => individual.id === link.individual_id)
        return related ? relatedContactOption(related, RELATIONSHIP_LABELS[ENTITY_CONTACT_ROLE_RELATED]) : null
      })
      .filter((related): related is PublicRelatedContact => Boolean(related))
    return {
      id: row.id,
      kind: 'entity' as const,
      ecid: row.ecid ?? null,
      entitySubtype: row.entity_subtype,
      partnershipType: row.partnership_type ?? null,
      managementStructure: row.management_structure ?? null,
      ein: row.ein ?? null,
      einLast4: row.ein_last4 ?? null,
      stateOfFormation: row.state_of_formation ?? null,
      formationDate: row.formation_date ?? null,
      entityStatus: row.entity_status,
      sosFileNumber: row.sos_file_number ?? null,
      stateTaxpayerNumber: row.state_taxpayer_number ?? null,
      xtNumber: row.xt_number ?? null,
      registeredAgentName: row.registered_agent_name ?? null,
      boiStatus: row.boi_status ?? null,
      boiConfirmationNumber: row.boi_confirmation_number ?? null,
      pointOfContactName: pointOfContactOption?.displayName ?? null,
      pointOfContact: pointOfContactOption,
      registeredAgent: registeredAgent ? relatedContactOption(registeredAgent) : null,
      typeLabel: entityTypeLabel(row),
      displayName: row.legal_name,
      titlePrefix: null,
      firstName: null,
      middleName: null,
      lastName: null,
      suffix: null,
      preferredName: null,
      dob: null,
      ssn: null,
      ssnLast4: null,
      isMinor: false,
      isAttorney: false,
      email: primaryContactValue(methods, 'email'),
      phone: primaryContactValue(methods, 'phone'),
      phoneSecondary: secondaryContactValue(methods, 'phone'),
      fax: primaryContactValue(methods, 'fax'),
      addressLine1: address?.street1 ?? '',
      addressLine2: address?.street2 ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      postalCode: address?.postal_code ?? '',
      status: `${row.entity_subtype} / ${row.entity_status}`,
      notes: row.notes,
      relatedContacts,
      isClient: client?.status === 'active',
      clientId: client?.id ?? null,
      clientNumber: client?.client_number ?? null,
      clientDisplayName: client?.display_name ?? null,
      clientType: client?.client_type ?? null,
      clientStatus: client?.status ?? null,
      createdAt: row.created_at,
      updatedAt: latestContactTimestamp(
        row.updated_at,
        ...methods.map((method) => method.updated_at ?? method.created_at),
        address?.updated_at,
        ...entityContactLinks
          .filter((link) => link.entity_id === row.id)
          .map((link) => link.updated_at ?? link.created_at),
        client?.updated_at,
      ),
    }
  })

  return [...individualContacts, ...entityContacts].filter((contact) => !resolvedIds.has(`${contact.kind}:${contact.id}`))
}

/** Creates a stable revision for the current contact collection (unchanged rule; Web Crypto SHA-256). */
export async function contactCollectionVersion(contacts: ReadonlyArray<{ kind: string; id: string; updatedAt: string | null; createdAt: string }>): Promise<string> {
  const revisionInput = contacts
    .map((contact) => `${contact.kind}:${contact.id}:${contact.updatedAt ?? contact.createdAt}`)
    .sort()
    .join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revisionInput))
  const rVal = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return rVal
}

/**
 * Lower bound for "changed since": the day before `since`, at midnight, in the
 * space-separated form. Rows written by SQLite CURRENT_TIMESTAMP
 * ('2026-09-28 14:00:00') and by the app (ISO '2026-09-28T14:00:00.000Z') both
 * compare correctly against it; the extra day only adds a few rows. (Unchanged.)
 */
export function changedSinceFloor(since: string, now = Date.now()): string {
  const parsed = Date.parse(since)
  const day = new Date((Number.isFinite(parsed) ? parsed : now) - 24 * 60 * 60 * 1000)
  const rVal = `${day.toISOString().slice(0, 10)} 00:00:00`
  return rVal
}

/** The login account's email is authoritative for linked individuals in both list and detail views (unchanged). */
export function applyLinkedAccounts(
  contacts: SerializedContact[],
  linkedUsers: LinkedContactUser[],
  session: { userId: string; role: string },
): ContactDetail[] {
  const rVal = contacts.map((contact) => {
    const accounts = contact.kind === 'individual' ? linkedUsers.filter((row) => row.individual_id === contact.id) : []
    const account = accounts.length === 1 ? accounts[0] : undefined
    return {
      ...contact,
      email: account?.email ?? contact.email,
      linkedUserId: account?.id ?? null,
      isCurrentUser: account?.id === session.userId,
      canEditLoginEmail: accounts.length === 0 || (accounts.length === 1 && (session.role === 'super_admin' || account?.id === session.userId)),
      updatedAt: latestContactTimestamp(contact.updatedAt, ...accounts.map((row) => row.updated_at)),
    }
  })
  return rVal
}

/**
 * The list form of a contact: everything except the full SSN and the date of birth.
 * Why: the list is cached in the browser for hours; see packages/contracts/src/contacts.ts. To send them in
 * the list again, return `contact` unchanged here and add the two fields to `ContactListItem`.
 */
export function toListItem(contact: ContactDetail): ContactListItem {
  const { ssn: _ssn, dob: _dob, ...rVal } = contact
  return rVal
}

/** Turns the loaded tables into contact cards (the serializer's arguments, in its order). */
export function serializeContactTables(tables: ContactTables): SerializedContact[] {
  return serializeContacts(
    tables.individuals,
    tables.entities,
    tables.individualMethods,
    tables.entityMethods,
    tables.clients,
    tables.clientMembers,
    tables.individualAddressLinks,
    tables.entityAddressLinks,
    tables.addresses,
    tables.entityContactLinks,
    tables.individualRelationships,
    tables.resolutions,
  )
}
