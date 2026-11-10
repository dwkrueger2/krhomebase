// file: apps/api/src/features/contact-edits/rules.ts
/**
 * Contact edits: create a contact, save the edit card, and open, renumber or close a contact's client account.
 * Ported from the old `kr-api-v1/contacts` POST and PATCH and `kr-api-v1/clients` GET, POST and PATCH
 * (plan stage 1d-3). The rules are the old ones; what changed is how a save reaches the database.
 *
 * Kept from the old routes:
 *  - Names: an individual needs a first and last name, an entity a legal name. Display name is the preferred name,
 *    or "First Last".
 *  - Email is stored lower-case; phones as `(555) 010-0000` (`+1 (…)` for 11 digits starting with 1).
 *  - SSN: the last four digits are kept in `ssn_last4`. EIN: likewise `ein_last4`.
 *  - Enum fields fall back to a safe value (`unknown`, `active`) instead of failing.
 *  - Edit card: one primary email, office phone, second phone and fax; clearing a value ends that row
 *    (`valid_to`, `is_primary` 0). The primary address is updated, or created with its link.
 *  - Related contacts (individuals) and point of contact, registered agent and related contacts (entities) are a
 *    "replace set": rows no longer chosen are ended, earlier rows chosen again are restored, new ones inserted.
 *    Every chosen person must exist.
 *  - Optimistic save: `expectedUpdatedAt` must equal the contact's current `updatedAt` (the same aggregate the
 *    list shows), else 409 `CONTACT_CONFLICT`.
 *  - Login email: when the person has one linked login account, the contact email is that account's email.
 *    Only a super admin or the account owner may change it; the owner must confirm (they are signed out); the new
 *    address must be free (compared ignoring case). Two linked accounts: 409, nothing saved.
 *  - New public codes: ICID/ECID are 7 characters, letters and digits with at least one of each (crud Worker
 *    rule). On the rare clash the whole save is retried with a new code, up to 8 times.
 *  - Client numbers: positive whole numbers, at least 3 digits (`7` becomes `007`). Next number: highest + 1.
 *    A new client gets its General Matter `<number>.0` and the matter's primary client party. Renumbering a
 *    client renames its General Matter too.
 *
 * Changed:
 *  - Each save is one database batch with its audit rows: all of it is kept or none of it (old: many separate
 *    crud Worker calls, each audited afterwards).
 *  - Saving related contacts no longer resets the label of a relationship that was already current (the old
 *    code rewrote a "Spouse" row to "Related contact" on every save). Only new or restored rows get that label.
 *  - An entity's contact methods use `use_context = 'general'` on update as on create (the old update used
 *    `business`, which the table refuses).
 *  - Creating a contact with a client account is one call (`createClient`).
 */

import type { ClientStatusBody, ClientStatusData, ContactCreateBody, ContactCreateData, ContactUpdateBody } from '@krhomebase/contracts'
import type { AddressFields, ClientRow, ContactEditQueries, ContactKind, EntityContactRow, MethodRow, NewMethod } from './queries.ts'

// ----------------------------------------------------------------------------------------------------------
// Errors

/** A refused save. `code` is the error code the route returns; `status` its HTTP status. */
export class ContactEditError extends Error {
  constructor(
    readonly code: string,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message)
  }
}

// ----------------------------------------------------------------------------------------------------------
// Constants (unchanged from the old routes and the crud Worker)

const ENTITY_SUBTYPES = new Set(['llc', 'corporation', 'partnership', 'trust', 'estate', 'nonprofit', 'government', 'sole_prop', 'unknown'])
const ENTITY_STATUSES = new Set(['active', 'inactive', 'dissolved', 'forfeited', 'reinstated', 'pending'])
const BOI_STATUSES = new Set(['filed', 'not_required', 'pending', 'unknown', 'exempt'])
const PARTNERSHIP_TYPES = new Set(['lp', 'llp', 'gp', 'lllp'])
const MANAGEMENT_STRUCTURES = new Set(['member_managed', 'manager_managed', 'board_managed', 'unknown'])

export const RELATED_CONTACT_LOOKUP_ID = 'lk_relationship_related_contact'
export const ENTITY_ROLE_PRINCIPAL = 'lk_entity_contact_role_principal'
export const ENTITY_ROLE_REGISTERED_AGENT = 'lk_entity_contact_role_registered_agent'
export const ENTITY_ROLE_RELATED = 'lk_entity_contact_role_related_contact'

const CLIENT_NUMBER_MIN_DIGITS = 3
const PUBLIC_CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const PUBLIC_CODE_DIGITS = '0123456789'
const PUBLIC_CODE_ALPHABET = PUBLIC_CODE_LETTERS + PUBLIC_CODE_DIGITS
const PUBLIC_CODE_LENGTH = 7
const PUBLIC_CODE_MAX_ATTEMPTS = 8

// ----------------------------------------------------------------------------------------------------------
// Small helpers

/** Trimmed text, or null when empty. */
export function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

/** Lower-case email, or null. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const text = clean(value)
  return text ? text.toLowerCase() : null
}

/** A phone as `(555) 010-0000`, `+1 (555) 010-0000` or `+44 (…)`; other text kept as typed; null when no digits. */
export function normalizePhone(value: string | null | undefined): string | null {
  const text = clean(value)
  if (!text) return null
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  if (digits.length > 10) {
    const local = digits.slice(-10)
    return `+${digits.slice(0, -10)} (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
  }
  return text
}

/** The value when it is in the allowed set (case-insensitive), else the fallback. */
export function enumOrFallback(value: string | null | undefined, allowed: ReadonlySet<string>, fallback: string): string {
  const normalized = clean(value)?.toLowerCase()
  return normalized && allowed.has(normalized) ? normalized : fallback
}

/** Preferred name, or "First Last". */
export function individualDisplayName(firstName: string, lastName: string, preferredName?: string | null): string {
  return preferredName || `${firstName} ${lastName}`.trim()
}

/** A positive whole number with at least three digits (`7` → `007`), or null. */
export function normalizeClientNumber(value: string | null | undefined): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!/^\d+$/.test(raw)) return null
  const numeric = BigInt(raw)
  if (numeric < 1n) return null
  return numeric.toString().padStart(CLIENT_NUMBER_MIN_DIGITS, '0')
}

/** The highest existing client number plus one (unchanged rule), at least 3 digits. */
export function nextClientNumber(existing: readonly string[]): string {
  let candidate = 1n
  for (const value of existing) {
    const normalized = normalizeClientNumber(value)
    if (!normalized) continue
    const numeric = BigInt(normalized)
    if (numeric >= candidate) candidate = numeric + 1n
  }
  return candidate.toString().padStart(CLIENT_NUMBER_MIN_DIGITS, '0')
}

function randomIndex(maxExclusive: number): number {
  const limit = 256 - (256 % maxExclusive)
  const bytes = new Uint8Array(1)
  for (;;) {
    crypto.getRandomValues(bytes)
    if (bytes[0]! < limit) return bytes[0]! % maxExclusive
  }
}

/** A 7-character public code (ICID, ECID) with at least one letter and one digit, as the crud Worker made them. */
export function generatePublicCode(): string {
  const characters = [PUBLIC_CODE_LETTERS[randomIndex(PUBLIC_CODE_LETTERS.length)]!, PUBLIC_CODE_DIGITS[randomIndex(PUBLIC_CODE_DIGITS.length)]!]
  while (characters.length < PUBLIC_CODE_LENGTH) characters.push(PUBLIC_CODE_ALPHABET[randomIndex(PUBLIC_CODE_ALPHABET.length)]!)
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1)
    ;[characters[index], characters[swap]] = [characters[swap]!, characters[index]!]
  }
  return characters.join('')
}

function isUniqueClash(error: unknown, table: string, column: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(`UNIQUE constraint failed: ${table}.${column}`) || message.includes(`${table}_${column}`)
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

/** Who is saving, from the checked session. */
export type Actor = { userId: string; email: string; role: string; requestId: string }

function auditFor(q: ContactEditQueries, actor: Actor, action: string, targetTable: string, targetId: string, newJson?: unknown, clientId?: string | null) {
  return q.audit({
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    resource: 'contacts',
    action,
    targetTable,
    targetId,
    clientId: clientId ?? null,
    newJson,
  })
}

// ----------------------------------------------------------------------------------------------------------
// Create

/** The statements that open a client account with its General Matter. Shared by create and client status. */
function clientAccountStatements(q: ContactEditQueries, actor: Actor, kind: ContactKind, contactId: string, clientNumber: string, displayName: string, prospectStatus: string, now: string) {
  const clientId = newId('cli')
  const matterId = `mat_${crypto.randomUUID()}`
  return {
    clientId,
    statements: [
      q.insertClient({ id: clientId, clientNumber, clientType: kind, contactId, displayName, prospectStatus, createdByUserId: actor.userId, now }),
      q.insertGeneralMatter(matterId, clientNumber, actor.userId, now),
      q.insertPrimaryClientParty(`mpa_${crypto.randomUUID()}`, matterId, clientId, now),
      auditFor(q, actor, 'CREATE', 'client', clientId, { clientNumber, clientType: kind, generalMatterNumber: `${clientNumber}.0` }, clientId),
    ],
  }
}

/** Throws when a client number is not free. */
async function requireFreeClientNumber(q: ContactEditQueries, clientNumber: string, exceptClientId: string | null): Promise<void> {
  const assigned = (await q.clientsByNumber(clientNumber)).find((row) => row.id !== exceptClientId)
  if (assigned) throw new ContactEditError('VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED', 422, `Client number ${clientNumber} is already assigned to ${assigned.display_name}.`)
}

/**
 * Creates an individual or entity with its primary email and phone, and, when asked, its client account and
 * General Matter. One batch; retried with a new ICID/ECID if the code clashes.
 */
export async function createContact(q: ContactEditQueries, body: ContactCreateBody, actor: Actor): Promise<ContactCreateData> {
  const kind = body.kind
  const firstName = clean(body.firstName)
  const lastName = clean(body.lastName)
  const legalName = clean(body.legalName)
  if (kind === 'individual' && !firstName) throw new ContactEditError('VALIDATION_MISSING_FIRST_NAME', 422, 'First name is required.')
  if (kind === 'individual' && !lastName) throw new ContactEditError('VALIDATION_MISSING_LAST_NAME', 422, 'Last name is required.')
  if (kind === 'entity' && !legalName) throw new ContactEditError('VALIDATION_MISSING_LEGAL_NAME', 422, 'Legal name is required.')

  const preferredName = clean(body.preferredName)
  const displayName = kind === 'individual' ? individualDisplayName(firstName!, lastName!, preferredName) : legalName!

  let clientNumber: string | null = null
  if (body.createClient) {
    const requested = clean(body.clientNumber)
    clientNumber = requested ? normalizeClientNumber(requested) : nextClientNumber(await q.allClientNumbers())
    if (!clientNumber) throw new ContactEditError('VALIDATION_INVALID_CLIENT_NUMBER', 422, 'Client number must be a positive whole number.')
    await requireFreeClientNumber(q, clientNumber, null)
  }

  const email = normalizeEmail(body.email)
  const phone = normalizePhone(body.phone)
  const contactId = newId(kind === 'individual' ? 'ind' : 'ent')

  for (let attempt = 1; attempt <= PUBLIC_CODE_MAX_ATTEMPTS; attempt += 1) {
    const now = new Date().toISOString()
    const recordCode = generatePublicCode()
    const statements: D1PreparedStatement[] = []
    if (kind === 'individual') {
      statements.push(
        q.insertIndividual({
          id: contactId,
          icid: recordCode,
          firstName: firstName!,
          middleName: clean(body.middleName),
          lastName: lastName!,
          suffix: clean(body.suffix),
          preferredName,
          isAttorney: body.isAttorney ? 1 : 0,
          notes: clean(body.notes),
          now,
        }),
      )
    } else {
      const entitySubtype = enumOrFallback(body.entitySubtype, ENTITY_SUBTYPES, 'llc')
      statements.push(
        q.insertEntity({
          id: contactId,
          ecid: recordCode,
          legalName: legalName!,
          entitySubtype,
          // The legacy column predates `unknown`; new rows fill both (unchanged).
          entitySubtypeLegacy: entitySubtype === 'unknown' ? 'llc' : entitySubtype,
          ein: null,
          stateOfFormation: null,
          entityStatus: 'active',
          boiStatus: 'unknown',
          notes: clean(body.notes),
          now,
        }),
      )
    }
    statements.push(auditFor(q, actor, 'CREATE', kind, contactId, { kind, displayName, recordCode }))

    let contactMethodCount = 0
    const methodBase = { contactId, useContext: kind === 'individual' ? 'client_contact' : 'general', isPrimary: 1 as const, now }
    if (email) {
      const id = newId(kind === 'individual' ? 'icm' : 'ecm')
      statements.push(q.insertMethod(kind, { ...methodBase, id, contactType: 'email', value: email, label: 'Primary email', canText: 0 }), auditFor(q, actor, 'CREATE', `${kind}_contact_method`, id))
      contactMethodCount += 1
    }
    if (phone) {
      const id = newId(kind === 'individual' ? 'icm' : 'ecm')
      statements.push(q.insertMethod(kind, { ...methodBase, id, contactType: 'phone', value: phone, label: 'Primary phone', canText: 1 }), auditFor(q, actor, 'CREATE', `${kind}_contact_method`, id))
      contactMethodCount += 1
    }

    let clientId: string | null = null
    if (clientNumber) {
      const account = clientAccountStatements(q, actor, kind, contactId, clientNumber, displayName, 'proposed', now)
      clientId = account.clientId
      statements.push(...account.statements)
    }

    try {
      await q.run(statements)
    } catch (error) {
      if (isUniqueClash(error, kind, kind === 'individual' ? 'icid' : 'ecid') && attempt < PUBLIC_CODE_MAX_ATTEMPTS) continue
      if (clientNumber && isUniqueClash(error, 'client', 'client_number')) {
        throw new ContactEditError('VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED', 422, `Client number ${clientNumber} was just taken. Try again.`)
      }
      throw error
    }
    return {
      contactId,
      kind,
      displayName,
      recordCode,
      contactMethodCount,
      clientId,
      clientNumber,
      generalMatterNumber: clientNumber ? `${clientNumber}.0` : null,
    }
  }
  throw new Error(`GENERATED_${kind === 'individual' ? 'ICID' : 'ECID'}_FAILED`)
}

// ----------------------------------------------------------------------------------------------------------
// Update

/** One slot of the edit card: primary email, office phone (primary), second phone, fax. */
function methodStatements(
  q: ContactEditQueries,
  actor: Actor,
  kind: ContactKind,
  contactId: string,
  rows: readonly MethodRow[],
  contactType: 'email' | 'phone' | 'fax',
  rawValue: string | null | undefined,
  isPrimary: boolean,
  now: string,
): D1PreparedStatement[] {
  const ofType = rows.filter((row) => row.contact_type === contactType)
  // The current row for this slot (unchanged): an open row with the same primary flag; for a primary slot, any open row.
  const current = ofType.find((row) => !row.valid_to && row.is_primary === (isPrimary ? 1 : 0)) ?? (isPrimary ? ofType.find((row) => !row.valid_to) : undefined)
  const value = contactType === 'email' ? normalizeEmail(rawValue) : normalizePhone(rawValue)

  if (current) {
    if (value === current.value && current.is_primary === (isPrimary ? 1 : 0)) return []
    return [
      q.updateMethod(kind, current.id, value ?? '', value ? (isPrimary ? 1 : 0) : 0, value ? null : now.slice(0, 10), now),
      auditFor(q, actor, 'UPDATE', `${kind}_contact_method`, current.id, { contactType, ended: !value }),
    ]
  }
  if (!value) return []
  const id = newId(kind === 'individual' ? 'icm' : 'ecm')
  const label = contactType === 'email' ? 'Primary email' : contactType === 'fax' ? 'Primary fax' : isPrimary ? 'Primary phone' : 'Additional phone'
  const row: NewMethod = {
    id,
    contactId,
    contactType,
    value,
    label,
    useContext: kind === 'individual' ? 'client_contact' : 'general',
    isPrimary: 1,
    canText: contactType === 'phone' ? 1 : 0,
    now,
  }
  return [q.insertMethod(kind, row), auditFor(q, actor, 'CREATE', `${kind}_contact_method`, id, { contactType })]
}

async function addressStatements(q: ContactEditQueries, actor: Actor, kind: ContactKind, contactId: string, body: ContactUpdateBody, now: string): Promise<D1PreparedStatement[]> {
  const links = await q.addressLinksOf(kind, contactId)
  const currentLink = links.find((link) => !link.valid_to && link.is_primary === 1) ?? links.find((link) => !link.valid_to)
  const fields: AddressFields = {
    street1: clean(body.addressLine1),
    street2: clean(body.addressLine2),
    city: clean(body.city),
    state: clean(body.state)?.toUpperCase() ?? null,
    postalCode: clean(body.postalCode),
  }
  const hasAddress = Object.values(fields).some(Boolean)
  if (currentLink) return [q.updateAddress(currentLink.address_id, fields, now), auditFor(q, actor, 'UPDATE', 'address', currentLink.address_id)]
  if (!hasAddress) return []
  const addressId = newId('addr')
  const linkId = newId(kind === 'individual' ? 'iad' : 'ead')
  return [
    q.insertAddress(addressId, fields, now),
    q.insertAddressLink(kind, linkId, contactId, addressId, kind === 'individual' ? 'client_contact' : 'business', now),
    auditFor(q, actor, 'CREATE', 'address', addressId),
    auditFor(q, actor, 'CREATE', `${kind}_address`, linkId),
  ]
}

/** Unique, non-empty ids. */
function idSet(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean))]
}

async function requireIndividuals(q: ContactEditQueries, ids: string[]): Promise<void> {
  if (!ids.length) return
  const found = new Set(await q.existingIndividualIds(ids))
  if (ids.some((id) => !found.has(id))) throw new ContactEditError('VALIDATION_RELATIONSHIP_INDIVIDUAL_NOT_FOUND', 422, 'A chosen person no longer exists.')
}

async function individualRelationshipStatements(q: ContactEditQueries, actor: Actor, individualId: string, relatedIds: string[], now: string): Promise<D1PreparedStatement[]> {
  const desired = relatedIds.filter((id) => id !== individualId)
  await requireIndividuals(q, desired)
  const existing = await q.relationshipsOf(individualId)
  const otherOf = (row: { individual_a_id: string; individual_b_id: string }) => (row.individual_a_id === individualId ? row.individual_b_id : row.individual_a_id)
  const statements: D1PreparedStatement[] = []
  for (const row of existing.filter((candidate) => !candidate.valid_to)) {
    if (!desired.includes(otherOf(row))) statements.push(q.endRelationship(row.id, now), auditFor(q, actor, 'UPDATE', 'individual_relationship', row.id, { ended: true }))
  }
  for (const targetId of desired) {
    const pairs = existing.filter((row) => otherOf(row) === targetId)
    if (pairs.some((row) => !row.valid_to)) continue // already current: keep its label
    const earlier = pairs[0]
    if (earlier) {
      statements.push(q.restoreRelationship(earlier.id, RELATED_CONTACT_LOOKUP_ID, now), auditFor(q, actor, 'UPDATE', 'individual_relationship', earlier.id, { restored: true }))
      continue
    }
    const id = newId('irel')
    statements.push(q.insertRelationship(id, individualId, targetId, RELATED_CONTACT_LOOKUP_ID, now), auditFor(q, actor, 'CREATE', 'individual_relationship', id))
  }
  return statements
}

async function entityContactStatements(
  q: ContactEditQueries,
  actor: Actor,
  entityId: string,
  pointOfContactId: string | null,
  registeredAgentId: string | null,
  relatedIds: string[],
  now: string,
): Promise<D1PreparedStatement[]> {
  await requireIndividuals(q, idSet([pointOfContactId, registeredAgentId, ...relatedIds]))
  const existing = await q.entityContactsOf(entityId)
  const statements: D1PreparedStatement[] = []
  const end = (row: EntityContactRow) => statements.push(q.endEntityContact(row.id, now), auditFor(q, actor, 'UPDATE', 'entity_contact', row.id, { ended: true }))
  const restore = (row: EntityContactRow, isPrimary: 0 | 1) => statements.push(q.restoreEntityContact(row.id, isPrimary, now), auditFor(q, actor, 'UPDATE', 'entity_contact', row.id, { restored: true }))
  const insert = (individualId: string, role: string, isPrimary: 0 | 1) => {
    const id = newId('ect')
    statements.push(q.insertEntityContact(id, entityId, individualId, role, isPrimary, now), auditFor(q, actor, 'CREATE', 'entity_contact', id, { role }))
  }

  // Point of contact and registered agent: one current person per role.
  for (const assignment of [
    { role: ENTITY_ROLE_PRINCIPAL, individualId: pointOfContactId, isPrimary: 1 as const },
    { role: ENTITY_ROLE_REGISTERED_AGENT, individualId: registeredAgentId, isPrimary: 0 as const },
  ]) {
    const current = existing.filter((row) => row.role_lookup_id === assignment.role && !row.end_date)
    for (const row of current) if (row.individual_id !== assignment.individualId) end(row)
    if (!assignment.individualId || current.some((row) => row.individual_id === assignment.individualId)) continue
    const earlier = existing.find((row) => row.role_lookup_id === assignment.role && row.individual_id === assignment.individualId)
    if (earlier) restore(earlier, assignment.isPrimary)
    else insert(assignment.individualId, assignment.role, assignment.isPrimary)
  }

  // Related contacts: a replace set.
  const desired = idSet(relatedIds)
  const currentRelated = existing.filter((row) => row.role_lookup_id === ENTITY_ROLE_RELATED && !row.end_date)
  for (const row of currentRelated) if (!desired.includes(row.individual_id)) end(row)
  for (const individualId of desired) {
    if (currentRelated.some((row) => row.individual_id === individualId)) continue
    const earlier = existing.find((row) => row.role_lookup_id === ENTITY_ROLE_RELATED && row.individual_id === individualId)
    if (earlier) restore(earlier, 0)
    else insert(individualId, ENTITY_ROLE_RELATED, 0)
  }
  return statements
}

/** The login-email decision for a person with a linked account (unchanged rules). Null: no linked account. */
export async function loginEmailChange(
  q: ContactEditQueries,
  actor: Actor,
  contactId: string,
  requestedEmail: string | null | undefined,
  confirmed: boolean | undefined,
): Promise<{ userId: string; email: string; changed: boolean } | null> {
  const users = await q.linkedUsersOf(contactId)
  if (!users.length) return null
  if (users.length !== 1) throw new ContactEditError('CONTACT_HAS_MULTIPLE_USER_ACCOUNTS', 409, 'This person has two login accounts; fix that first.')
  const user = users[0]!
  const email = (requestedEmail ?? '').trim().toLowerCase()
  if (email === user.email.trim().toLowerCase()) return { userId: user.id, email: user.email, changed: false }
  if (actor.role !== 'super_admin' && actor.userId !== user.id) throw new ContactEditError('LOGIN_EMAIL_CHANGE_FORBIDDEN', 403, 'Only a super admin or this person may change their login email.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ContactEditError('VALIDATION_LOGIN_EMAIL_REQUIRED', 422, 'A valid login email is required.')
  if (actor.userId === user.id && confirmed !== true) throw new ContactEditError('LOGIN_EMAIL_CHANGE_CONFIRMATION_REQUIRED', 409, 'Confirm that you will be signed out.')
  if (await q.loginEmailTakenByOther(email, user.id)) throw new ContactEditError('VALIDATION_LOGIN_EMAIL_ALREADY_ASSIGNED', 409, 'Another account already uses that email.')
  return { userId: user.id, email, changed: true }
}

/**
 * Saves the whole edit card in one batch. The caller has checked who may save and the optimistic revision.
 *
 * @returns The display name, the save time, and whether the caller must sign in again.
 */
export async function updateContact(
  q: ContactEditQueries,
  contactId: string,
  body: ContactUpdateBody,
  actor: Actor,
): Promise<{ displayName: string; updatedAt: string; requiresLogin: boolean }> {
  const kind = body.kind
  if (!(await q.identityExists(kind, contactId))) throw new ContactEditError('CONTACT_NOT_FOUND', 404, 'No such contact.')
  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  let displayName: string

  if (kind === 'individual') {
    const firstName = clean(body.firstName)
    const lastName = clean(body.lastName)
    if (!firstName || !lastName) throw new ContactEditError('VALIDATION_MISSING_INDIVIDUAL_NAME', 422, 'First and last name are required.')
    const requestedDisplay = clean(body.displayName)
    // Unchanged: a display name that differs from "First Last" is kept as the preferred name.
    const preferredName = clean(body.preferredName) || (requestedDisplay && requestedDisplay !== `${firstName} ${lastName}` ? requestedDisplay : null)
    const ssn = clean(body.ssn)
    const ssnDigits = ssn?.replace(/\D/g, '') ?? ''
    statements.push(
      q.updateIndividual(contactId, {
        titlePrefix: clean(body.titlePrefix),
        firstName,
        middleName: clean(body.middleName),
        lastName,
        suffix: clean(body.suffix),
        preferredName,
        dob: clean(body.dob),
        ssn,
        ssnLast4: ssnDigits.length >= 4 ? ssnDigits.slice(-4) : null,
        isAttorney: body.isAttorney ? 1 : 0,
        notes: clean(body.notes),
        now,
      }),
      // The audit row never carries the SSN or date of birth.
      auditFor(q, actor, 'UPDATE', 'individual', contactId, { fields: 'edit card' }),
    )
    displayName = individualDisplayName(firstName, lastName, preferredName)
    statements.push(...(await individualRelationshipStatements(q, actor, contactId, idSet(body.relatedContactIds ?? []), now)))
  } else {
    const legalName = clean(body.displayName)
    if (!legalName) throw new ContactEditError('VALIDATION_MISSING_ENTITY_NAME', 422, 'Legal name is required.')
    const ein = clean(body.ein)
    statements.push(
      q.updateEntity(contactId, {
        legalName,
        entitySubtype: enumOrFallback(body.entitySubtype, ENTITY_SUBTYPES, 'unknown'),
        partnershipType: clean(body.partnershipType) ? enumOrFallback(body.partnershipType, PARTNERSHIP_TYPES, 'lp') : null,
        managementStructure: clean(body.managementStructure) ? enumOrFallback(body.managementStructure, MANAGEMENT_STRUCTURES, 'unknown') : null,
        ein,
        einLast4: ein?.replace(/\D/g, '').slice(-4) || null,
        stateOfFormation: clean(body.stateOfFormation)?.toUpperCase() ?? null,
        formationDate: clean(body.formationDate),
        entityStatus: enumOrFallback(body.entityStatus, ENTITY_STATUSES, 'active'),
        sosFileNumber: clean(body.sosFileNumber),
        stateTaxpayerNumber: clean(body.stateTaxpayerNumber),
        xtNumber: clean(body.xtNumber),
        registeredAgentName: clean(body.registeredAgentName),
        boiStatus: enumOrFallback(body.boiStatus, BOI_STATUSES, 'unknown'),
        boiConfirmationNumber: clean(body.boiConfirmationNumber),
        notes: clean(body.notes),
        now,
      }),
      auditFor(q, actor, 'UPDATE', 'entity', contactId, { fields: 'edit card' }),
    )
    displayName = legalName
    statements.push(
      ...(await entityContactStatements(q, actor, contactId, clean(body.pointOfContactId), clean(body.registeredAgentId), idSet(body.relatedContactIds ?? []), now)),
    )
  }

  // Login email (individuals with a linked account): the account email, the primary email row, and the sign-out.
  const loginEmail = kind === 'individual' ? await loginEmailChange(q, actor, contactId, body.email, body.confirmLoginEmailChange) : null
  const methods = await q.methodsOf(kind, contactId)
  statements.push(
    ...methodStatements(q, actor, kind, contactId, methods, 'email', loginEmail ? loginEmail.email : body.email, true, now),
    ...methodStatements(q, actor, kind, contactId, methods, 'phone', body.phone, true, now),
    ...methodStatements(q, actor, kind, contactId, methods, 'phone', body.phoneSecondary, false, now),
    ...methodStatements(q, actor, kind, contactId, methods, 'fax', body.fax, true, now),
    ...(await addressStatements(q, actor, kind, contactId, body, now)),
  )
  if (loginEmail?.changed) {
    statements.push(
      q.updateLoginEmail(loginEmail.userId, loginEmail.email, now),
      q.revokeSessionsOf(loginEmail.userId, now),
      auditFor(q, actor, 'UPDATE', 'user', loginEmail.userId, { loginEmailChanged: true, sessionsRevoked: true }),
    )
  }

  await q.run(statements)
  return { displayName, updatedAt: now, requiresLogin: Boolean(loginEmail?.changed && loginEmail.userId === actor.userId) }
}

// ----------------------------------------------------------------------------------------------------------
// Client accounts

/** Client row in the API's camelCase. */
export function serializeClient(row: ClientRow) {
  return {
    id: row.id,
    clientNumber: row.client_number,
    clientType: row.client_type,
    individualId: row.individual_id,
    entityId: row.entity_id,
    displayName: row.display_name,
    prospectStatus: row.prospect_status,
    status: row.status,
    updatedAt: row.updated_at,
  }
}

/**
 * Opens, reactivates, renumbers or closes the client account of a contact (old `clients` PATCH).
 *  - `isClient: false`: the account is marked inactive (no account: nothing to do).
 *  - `isClient: true` with an account: it is made active, renumbered if asked (number must be free) and its
 *    General Matter renamed to match.
 *  - `isClient: true` without one: a new account with its General Matter.
 */
export async function setClientStatus(q: ContactEditQueries, body: ClientStatusBody, actor: Actor): Promise<ClientStatusData> {
  const requestedText = clean(body.clientNumber)
  const requestedNumber = requestedText ? normalizeClientNumber(requestedText) : null
  if (body.isClient && requestedText && !requestedNumber) throw new ContactEditError('VALIDATION_INVALID_CLIENT_NUMBER', 422, 'Client number must be a positive whole number.')
  if (!(await q.identityExists(body.kind, body.contactId))) throw new ContactEditError('CONTACT_NOT_FOUND', 404, 'No such contact.')

  const requestedClientId = clean(body.clientId)
  const existing = requestedClientId ? await q.clientById(requestedClientId) : await q.clientForIdentity(body.kind, body.contactId)
  if (existing && (existing.individual_id ?? existing.entity_id) !== body.contactId) {
    throw new ContactEditError('VALIDATION_CLIENT_NOT_LINKED', 422, 'That client account belongs to someone else.')
  }
  const now = new Date().toISOString()

  if (!body.isClient) {
    if (!existing) return { clientId: null, clientNumber: null, status: null, generalMatterNumber: null }
    await q.run([
      q.updateClientAccount(existing.id, existing.client_number, 'inactive', existing.display_name, now),
      auditFor(q, actor, 'UPDATE', 'client', existing.id, { status: 'inactive' }, existing.id),
    ])
    return { clientId: existing.id, clientNumber: existing.client_number, status: 'inactive', generalMatterNumber: null }
  }

  const displayName = clean(body.displayName)
  if (existing) {
    const nextNumber = requestedNumber ?? existing.client_number
    if (nextNumber !== existing.client_number) await requireFreeClientNumber(q, nextNumber, existing.id)
    const statements = [
      q.updateClientAccount(existing.id, nextNumber, 'active', displayName || existing.display_name, now),
      auditFor(q, actor, 'UPDATE', 'client', existing.id, { status: 'active', clientNumber: nextNumber }, existing.id),
    ]
    if (nextNumber !== existing.client_number) {
      const matterIds = await q.generalMatterIdsFor(existing.id, `${existing.client_number}.0`)
      if (matterIds.length) statements.push(q.renumberMatters(matterIds, `${nextNumber}.0`, now), auditFor(q, actor, 'UPDATE', 'matter', matterIds[0]!, { matterNumber: `${nextNumber}.0` }, existing.id))
    }
    await q.run(statements)
    return { clientId: existing.id, clientNumber: nextNumber, status: 'active', generalMatterNumber: `${nextNumber}.0` }
  }

  if (!displayName) throw new ContactEditError('VALIDATION_MISSING_DISPLAY_NAME', 422, 'A display name is required.')
  const clientNumber = requestedNumber ?? nextClientNumber(await q.allClientNumbers())
  await requireFreeClientNumber(q, clientNumber, null)
  const account = clientAccountStatements(q, actor, body.kind, body.contactId, clientNumber, displayName, 'engaged', now)
  try {
    await q.run(account.statements)
  } catch (error) {
    if (isUniqueClash(error, 'client', 'client_number')) throw new ContactEditError('VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED', 422, `Client number ${clientNumber} was just taken. Try again.`)
    throw error
  }
  return { clientId: account.clientId, clientNumber, status: 'active', generalMatterNumber: `${clientNumber}.0` }
}
