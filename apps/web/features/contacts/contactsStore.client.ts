'use client'
// file: apps/web/features/contacts/contactsStore.client.ts
/**
 * Contacts-specific projection and synchronization adapter for the browser client-data store.
 *
 * Ported from the old `hb-lib/hb-client-data-store/contacts.client.ts`. The rules are unchanged: cache first,
 * a delta (`?mode=delta&since=`) when a cache exists, a full load when there is no cache or the last full load
 * is more than 12 hours old, deleted ids dropped using `allContactIds`, and only a limited projection (no full
 * SSN, no date of birth, no notes) written to the encrypted cache.
 *
 * Changes, all marked "Changed:":
 *  - It lives in features/contacts, not lib/, because it uses the contacts area's types and API call, and
 *    lib/ may not import a feature (apps/web/AGENTS.md, dependency rule).
 *  - Requests go through `fetchContactList` (api.client.ts) to `/api/v1/contacts`, checked against the contract.
 *  - `clientDisplayName` (the client account's own name) is mapped and cached, for the billing client list.
 */

import { BLC, LCB } from '@/lib/KRUtilities'
import { applyClientDataDelta, readClientDataCollection, upsertClientDataElement, writeClientDataCollection } from '@/lib/client-data-store/browserStore.client'
import { recordClientDataMetric } from '@/lib/client-data-store/metrics.client'
import type { ClientContactElement, ClientDataCollection } from '@/lib/client-data-store/types'
import { fetchContactList } from './api.client'
import type { KRContactRecord, KRRelatedContact } from './types'

const CONTACT_COLLECTION_SCHEMA_VERSION = 1

/** Converts an API-compatible value into a display label for contact types. */
function humanizeContactType(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const labels: Record<string, string> = {
    corporation: 'Corporation', estate: 'Estate', government: 'Government', gp: 'GP', individual: 'Person',
    llc: 'LLC', lllp: 'LLLP', lp: 'LP', llp: 'LLP', nonprofit: 'Nonprofit', partnership: 'Partnership',
    person: 'Person', sole_prop: 'Sole Prop', trust: 'Trust',
  }
  return labels[text] ?? (text ? text.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Entity')
}

/** Selects the API's entity subtype label across camel and snake case responses. */
function contactTypeLabel(row: Record<string, unknown>): string {
  if (row.kind !== 'entity') return 'Person'
  return humanizeContactType(row.partnershipType ?? row.partnership_type ?? row.entitySubtype ?? row.entity_subtype ?? row.typeLabel ?? row.type ?? row.status)
}

/** Reads a non-empty contact value from either API naming convention. */
function nullableContactText(row: Record<string, unknown>, camelKey: string, snakeKey: string): string | null {
  const value = row[camelKey] ?? row[snakeKey]
  return typeof value === 'string' && value.trim() ? value : null
}

/** Converts the API's boolean-compatible values into a UI boolean. */
function contactBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/** Maps a compact API relationship object to the contact-card relationship type. */
function relatedContactFromApi(value: unknown): KRRelatedContact | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.displayName !== 'string') return null
  return {
    id: row.id,
    displayName: row.displayName,
    icid: typeof row.icid === 'string' ? row.icid : null,
    relationship: typeof row.relationship === 'string' ? row.relationship : null,
  }
}

/** Maps one server contact row to the Contacts Manager record shape. */
export function contactFromApiRow(row: Record<string, unknown>, index: number): KRContactRecord {
  return {
    id: String(row.id ?? `contact_api_${index}`),
    kind: row.kind === 'entity' ? 'entity' : 'individual',
    icid: nullableContactText(row, 'icid', 'icid'),
    ecid: nullableContactText(row, 'ecid', 'ecid'),
    typeLabel: contactTypeLabel(row),
    displayName: String(row.displayName ?? row.display_name ?? 'Unnamed contact'),
    entitySubtype: nullableContactText(row, 'entitySubtype', 'entity_subtype'),
    partnershipType: nullableContactText(row, 'partnershipType', 'partnership_type'),
    managementStructure: nullableContactText(row, 'managementStructure', 'management_structure'),
    ein: nullableContactText(row, 'ein', 'ein'),
    einLast4: nullableContactText(row, 'einLast4', 'ein_last4'),
    stateOfFormation: nullableContactText(row, 'stateOfFormation', 'state_of_formation'),
    formationDate: nullableContactText(row, 'formationDate', 'formation_date'),
    entityStatus: nullableContactText(row, 'entityStatus', 'entity_status'),
    sosFileNumber: nullableContactText(row, 'sosFileNumber', 'sos_file_number'),
    stateTaxpayerNumber: nullableContactText(row, 'stateTaxpayerNumber', 'state_taxpayer_number'),
    xtNumber: nullableContactText(row, 'xtNumber', 'xt_number'),
    registeredAgentName: nullableContactText(row, 'registeredAgentName', 'registered_agent_name'),
    boiStatus: nullableContactText(row, 'boiStatus', 'boi_status'),
    boiConfirmationNumber: nullableContactText(row, 'boiConfirmationNumber', 'boi_confirmation_number'),
    pointOfContactName: nullableContactText(row, 'pointOfContactName', 'point_of_contact_name'),
    pointOfContact: relatedContactFromApi(row.pointOfContact ?? row.point_of_contact),
    registeredAgent: relatedContactFromApi(row.registeredAgent ?? row.registered_agent),
    foreignRegistrations: Array.isArray(row.foreignRegistrations)
      ? row.foreignRegistrations.filter((value): value is string => typeof value === 'string')
      : [],
    titlePrefix: nullableContactText(row, 'titlePrefix', 'title_prefix'),
    firstName: nullableContactText(row, 'firstName', 'first_name'),
    middleName: nullableContactText(row, 'middleName', 'middle_name'),
    lastName: nullableContactText(row, 'lastName', 'last_name'),
    suffix: nullableContactText(row, 'suffix', 'suffix'),
    preferredName: nullableContactText(row, 'preferredName', 'preferred_name'),
    dob: nullableContactText(row, 'dob', 'dob'),
    ssn: nullableContactText(row, 'ssn', 'ssn'),
    ssnLast4: nullableContactText(row, 'ssnLast4', 'ssn_last4'),
    isMinor: contactBoolean(row.isMinor ?? row.is_minor),
    isAttorney: contactBoolean(row.isAttorney ?? row.is_attorney),
    email: typeof row.email === 'string' ? row.email : null,
    linkedUserId: typeof row.linkedUserId === 'string' ? row.linkedUserId : null,
    isCurrentUser: row.isCurrentUser === true,
    canEditLoginEmail: row.canEditLoginEmail === true,
    phone: typeof row.phone === 'string' ? row.phone : null,
    phoneSecondary: typeof row.phoneSecondary === 'string' ? row.phoneSecondary : null,
    fax: typeof row.fax === 'string' ? row.fax : null,
    addressLine1: String(row.addressLine1 ?? row.address_line_1 ?? ''),
    addressLine2: String(row.addressLine2 ?? row.address_line_2 ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    postalCode: String(row.postalCode ?? row.postal_code ?? ''),
    status: String(row.status ?? row.kind ?? 'active'),
    notes: typeof row.notes === 'string' ? row.notes : null,
    isClient: contactBoolean(row.isClient ?? row.is_client),
    clientId: typeof row.clientId === 'string' ? row.clientId : typeof row.client_id === 'string' ? row.client_id : null,
    clientNumber: typeof row.clientNumber === 'string' ? row.clientNumber : typeof row.client_number === 'string' ? row.client_number : null,
    // Changed: the client account's own name (new API field).
    clientDisplayName: typeof row.clientDisplayName === 'string' ? row.clientDisplayName : null,
    clientType: typeof row.clientType === 'string' ? row.clientType : typeof row.client_type === 'string' ? row.client_type : null,
    clientStatus: typeof row.clientStatus === 'string' ? row.clientStatus : typeof row.client_status === 'string' ? row.client_status : null,
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : typeof row.updated_at === 'string' ? row.updated_at : null,
    detailsLoaded: true,
    relatedMatters: [],
    relatedContacts: Array.isArray(row.relatedContacts)
      ? row.relatedContacts.map(relatedContactFromApi).filter((contact): contact is KRRelatedContact => Boolean(contact))
      : [],
  }
}

/** Response shape used by the contacts collection and delta endpoints. */
export interface ContactsClientDataResponse {
  /** Collection discriminator for response validation. */
  collectionId?: 'contacts'
  /** Version of the approved local contacts projection. */
  schemaVersion?: number
  /** Complete or changed contacts, depending on the request mode. */
  contacts: ReadonlyArray<Record<string, unknown>>
  /** Server-generated stable revision for the current contact collection. */
  collectionVersion?: string
  /** Server timestamp associated with the response. */
  generatedAt?: string
  /** Complete id set used to detect deletions during delta reconciliation. */
  allContactIds?: string[]
}

/** Result of a contacts synchronization attempt. */
export interface ContactsSyncResult {
  /** Contacts currently available to the caller. */
  readonly contacts: KRContactRecord[]
  /** Whether rows came from the browser cache, a complete network response, or a delta. */
  readonly source: 'cache' | 'collection' | 'delta'
  /** Current collection cursor/revision. */
  readonly collectionVersion: string
  /** Server/cache timestamp used for freshness display and delta requests. */
  readonly fetchedAt: string
  /** Collection envelope retained for a subsequent delta synchronization. */
  readonly collection?: ClientDataCollection<ClientContactElement>
}

/** Converts an API contact row into the deliberately limited encrypted browser projection. */
export function toClientContactElement(contact: KRContactRecord): ClientContactElement {
  return {
    id: contact.id,
    updatedAt: contact.updatedAt ?? contact.createdAt,
    kind: contact.kind,
    icid: contact.icid ?? null,
    ecid: contact.ecid ?? null,
    displayName: contact.displayName,
    typeLabel: contact.typeLabel,
    titlePrefix: contact.titlePrefix,
    firstName: contact.firstName,
    middleName: contact.middleName,
    lastName: contact.lastName,
    suffix: contact.suffix,
    preferredName: contact.preferredName,
    email: contact.email,
    phone: contact.phone,
    phoneSecondary: contact.phoneSecondary ?? null,
    fax: contact.fax ?? null,
    addressLine1: contact.addressLine1,
    addressLine2: contact.addressLine2,
    city: contact.city || null,
    state: contact.state || null,
    postalCode: contact.postalCode || null,
    status: contact.status,
    isMinor: contact.isMinor,
    isAttorney: contact.isAttorney,
    isClient: contact.isClient,
    clientId: contact.clientId,
    clientNumber: contact.clientNumber,
    clientDisplayName: contact.clientDisplayName ?? null, // Changed: new field.
    clientType: contact.clientType ?? null,
    clientStatus: contact.clientStatus,
    pointOfContact: contact.pointOfContact ?? null,
    registeredAgent: contact.registeredAgent ?? null,
    relatedContacts: contact.relatedContacts,
    createdAt: contact.createdAt,
  }
}

/** Reconstructs the Contacts Manager record shape from the safe browser projection. */
export function fromClientContactElement(element: ClientContactElement): KRContactRecord {
  return {
    id: element.id,
    kind: element.kind,
    icid: element.icid ?? null,
    ecid: element.ecid ?? null,
    typeLabel: element.typeLabel,
    displayName: element.displayName,
    titlePrefix: element.titlePrefix,
    firstName: element.firstName,
    middleName: element.middleName,
    lastName: element.lastName,
    suffix: element.suffix,
    preferredName: element.preferredName,
    dob: null,
    ssn: null,
    ssnLast4: null,
    isMinor: element.isMinor,
    isAttorney: element.isAttorney,
    email: element.email,
    phone: element.phone,
    phoneSecondary: element.phoneSecondary ?? null,
    fax: element.fax ?? null,
    addressLine1: element.addressLine1,
    addressLine2: element.addressLine2,
    city: element.city ?? '',
    state: element.state ?? '',
    postalCode: element.postalCode ?? '',
    status: element.status,
    notes: null,
    isClient: element.isClient,
    clientId: element.clientId,
    clientNumber: element.clientNumber,
    clientDisplayName: element.clientDisplayName ?? null, // Changed: new field (absent in older caches).
    clientType: element.clientType,
    clientStatus: element.clientStatus,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
    detailsLoaded: false,
    relatedMatters: [],
    pointOfContact: element.pointOfContact ?? null,
    registeredAgent: element.registeredAgent ?? null,
    relatedContacts: element.relatedContacts ?? [],
  }
}

/** Builds a collection envelope for a complete network contact response. */
function collectionFromNetworkResponse(response: ContactsClientDataResponse, contacts: KRContactRecord[], fallbackVersion: string, fetchedAt: string): ClientDataCollection<ClientContactElement> {
  return {
    collectionId: 'contacts',
    schemaVersion: response.schemaVersion ?? CONTACT_COLLECTION_SCHEMA_VERSION,
    collectionVersion: response.collectionVersion ?? fallbackVersion,
    fetchedAt: response.generatedAt ?? fetchedAt,
    elements: contacts.map(toClientContactElement),
  }
}

/** Reads the cached contact collection without making a network request. */
export async function readCachedContacts(scope: string): Promise<ContactsSyncResult | null> {
  const startedAt = typeof window === 'undefined' ? 0 : window.performance.now()
  try {
    const collection = await readClientDataCollection<ClientContactElement>(scope, 'contacts')
    if (!collection) return null
    const contacts = collection.elements.map(fromClientContactElement)
    recordClientDataMetric({ collectionId: 'contacts', operation: 'cache-read', durationMs: window.performance.now() - startedAt, elementCount: contacts.length })
    return { contacts, source: 'cache', collectionVersion: collection.collectionVersion, fetchedAt: collection.fetchedAt, collection }
  } catch (error) {
    recordClientDataMetric({ collectionId: 'contacts', operation: 'cache-read', durationMs: typeof window === 'undefined' ? 0 : window.performance.now() - startedAt, failed: true })
    LCB(`[CLIENT_DATA_STORE:202] Contacts browser cache unavailable; continuing with the server collection. ${error instanceof Error ? error.message : 'Unknown storage error.'}`, BLC.orange)
    return null
  }
}

/** Fetches the complete authorized contact collection and commits it encrypted to IndexedDB. */
export async function syncFullContacts(scope: string): Promise<ContactsSyncResult> {
  const startedAt = window.performance.now()
  const response: ContactsClientDataResponse = await fetchContactList() // Changed: contract-checked call.
  const fetchedAt = new Date().toISOString()
  const contacts = (response.contacts ?? []).map((row, index) => contactFromApiRow(row, index))
  const collection = collectionFromNetworkResponse(response, contacts, fetchedAt, fetchedAt)
  await writeClientDataCollection(scope, collection)
  writeLastFullContactsSync(scope, fetchedAt)
  recordClientDataMetric({ collectionId: 'contacts', operation: 'collection-write', durationMs: window.performance.now() - startedAt, elementCount: contacts.length })
  return { contacts, source: 'collection', collectionVersion: collection.collectionVersion, fetchedAt: collection.fetchedAt, collection }
}

/**
 * A delta finds changed rows by their timestamps, so a row removed outright
 * leaves no trace. The whole collection is reloaded when the last full load
 * is older than this.
 */
const CONTACTS_FULL_RECONCILE_MS = 12 * 60 * 60 * 1000

/** Browser key holding when this scope last loaded the full contact collection (a timestamp only). */
function lastFullSyncKey(scope: string): string {
  return `kr-homebase:contacts-full-sync:${scope}`
}

function readLastFullContactsSync(scope: string): number {
  try {
    const rVal = Date.parse(window.localStorage.getItem(lastFullSyncKey(scope)) ?? '')
    return Number.isFinite(rVal) ? rVal : 0
  } catch {
    return 0
  }
}

function writeLastFullContactsSync(scope: string, at: string): void {
  try {
    window.localStorage.setItem(lastFullSyncKey(scope), at)
  } catch {
    // Storage unavailable: the next sync simply reloads in full.
  }
}

/** Reconciles changed contacts from the server while retaining unchanged encrypted elements locally. */
export async function syncContacts(scope: string, cached: ClientDataCollection<ClientContactElement> | null): Promise<ContactsSyncResult> {
  if (!cached) return syncFullContacts(scope)
  if (Date.now() - readLastFullContactsSync(scope) > CONTACTS_FULL_RECONCILE_MS) return syncFullContacts(scope)
  const startedAt = window.performance.now()
  const response: ContactsClientDataResponse = await fetchContactList(cached.fetchedAt) // Changed: contract-checked call.
  const changed = (response.contacts ?? []).map((row, index) => contactFromApiRow(row, index))
  const changedById = new Map(changed.map((contact) => [contact.id, toClientContactElement(contact)]))
  const knownIds = new Set(response.allContactIds ?? cached.elements.map((element) => element.id))
  const elements = cached.elements
    .filter((element) => knownIds.has(element.id))
    .map((element) => changedById.get(element.id) ?? element)
  for (const element of changedById.values()) if (!elements.some((candidate) => candidate.id === element.id)) elements.push(element)
  const collectionVersion = response.collectionVersion ?? cached.collectionVersion
  const fetchedAt = response.generatedAt ?? new Date().toISOString()
  const deletedIds = cached.elements.filter((element) => !knownIds.has(element.id)).map((element) => element.id)
  await applyClientDataDelta(scope, {
    collectionId: 'contacts',
    collectionVersion,
    upserts: [...changedById.values()],
    deletedIds,
  }, fetchedAt, CONTACT_COLLECTION_SCHEMA_VERSION)
  const collection: ClientDataCollection<ClientContactElement> = { ...cached, collectionVersion, fetchedAt, elements }
  recordClientDataMetric({ collectionId: 'contacts', operation: 'sync', durationMs: window.performance.now() - startedAt, elementCount: changed.length })
  return { contacts: elements.map(fromClientContactElement), source: 'delta', collectionVersion: collection.collectionVersion, fetchedAt: collection.fetchedAt, collection }
}

/** Updates one encrypted contact element after a canonical server save response. */
export async function upsertCachedContact(scope: string, contact: KRContactRecord, collectionVersion: string): Promise<void> {
  const startedAt = window.performance.now()
  await upsertClientDataElement(scope, 'contacts', toClientContactElement(contact), collectionVersion, CONTACT_COLLECTION_SCHEMA_VERSION)
  recordClientDataMetric({ collectionId: 'contacts', operation: 'element-write', durationMs: window.performance.now() - startedAt, elementCount: 1 })
}
