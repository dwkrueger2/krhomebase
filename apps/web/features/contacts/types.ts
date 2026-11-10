// file: apps/web/features/contacts/types.ts
/**
 * Contact record shapes used in the browser. Ported from the old `hb-components/modules/contacts/types.ts`.
 * Changes: `KRContactRecord` no longer extends the old ledger row type (the ledger comes with Contacts Manager),
 * and it gains `clientDisplayName`, the client account's own name (for the billing client list).
 *
 * `dob` and `ssn` are filled only after one contact is opened (`GET /v1/contacts/{id}`). Records from the list
 * or the browser cache always have them as null; see packages/contracts/src/contacts.ts for why.
 */

export type KRContactKind = 'individual' | 'entity'

export interface KRRelatedMatter {
  id: string
  matterNumber: string
  title: string
  role: string
  status: string
}

export interface KRRelatedContact {
  id: string
  displayName: string
  icid?: string | null
  relationship?: string | null
}

export interface KRContactRecord {
  id: string
  kind: KRContactKind
  icid?: string | null
  ecid?: string | null
  typeLabel: string
  displayName: string
  /** Entity identity and compliance columns; null for individual contacts. */
  entitySubtype?: string | null
  partnershipType?: string | null
  managementStructure?: string | null
  ein?: string | null
  einLast4?: string | null
  stateOfFormation?: string | null
  formationDate?: string | null
  entityStatus?: string | null
  sosFileNumber?: string | null
  stateTaxpayerNumber?: string | null
  xtNumber?: string | null
  registeredAgentName?: string | null
  boiStatus?: string | null
  boiConfirmationNumber?: string | null
  /** Read-only relationship summaries until entity relationship editing is available. */
  pointOfContactName?: string | null
  pointOfContact?: KRRelatedContact | null
  registeredAgent?: KRRelatedContact | null
  foreignRegistrations?: string[]
  titlePrefix: string | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
  suffix: string | null
  preferredName: string | null
  dob: string | null
  ssn: string | null
  ssnLast4: string | null
  isMinor: boolean
  isAttorney: boolean
  email: string | null
  /** Linked login account, resolved by individual_id on the server. */
  linkedUserId?: string | null
  isCurrentUser?: boolean
  canEditLoginEmail?: boolean
  phone: string | null
  /** Optional second generic phone row; the schema does not assign it a semantic type. */
  phoneSecondary?: string | null
  fax?: string | null
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  status: string
  notes: string | null
  isClient: boolean
  clientId: string | null
  clientNumber: string | null
  /** The client account's own name ("Ann & Bob Example" for a joint client). New in this repository. */
  clientDisplayName?: string | null
  clientType?: string | null
  clientStatus: string | null
  createdAt: string
  updatedAt: string | null
  /** Whether detail-only fields were loaded from an authorized server response. */
  detailsLoaded?: boolean
  relatedMatters: KRRelatedMatter[]
  relatedContacts: KRRelatedContact[]
}

/** The contact editor's working copy (unchanged from the old types.ts). Text fields are strings; empty means none. */
export interface KRContactDraft {
  displayName: string
  /** Entity identity and compliance fields edited by the entity sections. */
  entitySubtype?: string
  partnershipType?: string
  managementStructure?: string
  ein?: string
  stateOfFormation?: string
  formationDate?: string
  entityStatus?: string
  sosFileNumber?: string
  stateTaxpayerNumber?: string
  xtNumber?: string
  registeredAgentName?: string
  boiStatus?: string
  boiConfirmationNumber?: string
  titlePrefix?: string
  firstName?: string
  middleName?: string
  lastName?: string
  suffix?: string
  preferredName?: string
  dob?: string
  ssn?: string
  isAttorney?: boolean
  email: string
  phone: string
  phoneSecondary?: string
  fax?: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  notes: string
  isClient?: boolean
  pointOfContactId?: string | null
  registeredAgentId?: string | null
  relatedContactIds?: string[]
  /** Firm-assigned client number; blank means the server may estimate one on client creation. */
  clientNumber?: string
}
