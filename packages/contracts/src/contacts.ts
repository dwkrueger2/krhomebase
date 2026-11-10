// file: packages/contracts/src/contacts.ts
/**
 * Contacts: the shapes of `GET /v1/contacts` (the whole list, or what changed since a time) and
 * `GET /v1/contacts/{contactId}` (one contact, for Edit Details). Ported from the old
 * `kr-api-v1/contacts` GET, which answered all three with one address and a `mode`.
 *
 * Full Social Security number and date of birth (decision of Nov 9, 2026, docs/06_Contacts_Billing_Port_Plan.md):
 *   - The list (`ContactListItem`) leaves out `ssn` and `dob`. The list feeds the browser's encrypted cache and
 *     the in-memory data store, which holds every contact for hours. Leaving the two fields out means a stolen
 *     laptop, a browser extension or a memory dump can never yield 2,000 SSNs and birth dates at once.
 *   - One contact (`ContactDetail`) includes them, because Edit Details shows and edits them. They are loaded
 *     only when a person opens that contact, and the browser does not cache that answer.
 *   - The old API sent both fields in the list; the old browser cache already dropped them
 *     (`toClientContactElement`). Only the network answer changes.
 *   - To change this later, add the two fields to `ContactListItem` below and to the list query in
 *     `apps/api/src/features/contacts/queries.ts`. The browser cache still drops them unless
 *     `apps/web/lib/client-data-store/types.ts` is changed as well.
 */

import { z } from 'zod'

/** Version of the contacts collection shape. The browser store keeps it with its cache (old value: 1). */
export const CONTACT_COLLECTION_SCHEMA_VERSION = 1

export const ContactListQuery = z.object({
  mode: z.enum(['delta']).optional().describe('Leave out for the whole list. `delta` returns only contacts changed since `since`.'),
  since: z.string().trim().min(10).max(40).optional().describe('With mode=delta: the `generatedAt` of the last load (ISO time).'),
})
export type ContactListQuery = z.infer<typeof ContactListQuery>

export const ContactIdParams = z.object({
  contactId: z.string().trim().min(1).max(80).describe('Id of an individual or an entity.'),
})

export const ContactOneQuery = z.object({
  includeRelatedContacts: z.enum(['0', '1']).optional().describe('`0` skips related people (faster). Default `1`.'),
})

/** A person shown beside a contact: point of contact, registered agent or related contact. */
export const RelatedContact = z.object({
  id: z.string(),
  displayName: z.string(),
  icid: z.string().nullable(),
  relationship: z.string().nullable().optional(),
})
export type RelatedContact = z.infer<typeof RelatedContact>

const contactFields = {
  id: z.string(),
  kind: z.enum(['individual', 'entity']),
  icid: z.string().nullable().optional(),
  ecid: z.string().nullable().optional(),
  typeLabel: z.string(),
  displayName: z.string(),
  entitySubtype: z.string().nullable().optional(),
  partnershipType: z.string().nullable().optional(),
  managementStructure: z.string().nullable().optional(),
  ein: z.string().nullable().optional(),
  einLast4: z.string().nullable().optional(),
  stateOfFormation: z.string().nullable().optional(),
  formationDate: z.string().nullable().optional(),
  entityStatus: z.string().nullable().optional(),
  sosFileNumber: z.string().nullable().optional(),
  stateTaxpayerNumber: z.string().nullable().optional(),
  xtNumber: z.string().nullable().optional(),
  registeredAgentName: z.string().nullable().optional(),
  boiStatus: z.string().nullable().optional(),
  boiConfirmationNumber: z.string().nullable().optional(),
  pointOfContactName: z.string().nullable().optional(),
  pointOfContact: RelatedContact.nullable().optional(),
  registeredAgent: RelatedContact.nullable().optional(),
  relatedContacts: z.array(RelatedContact),
  titlePrefix: z.string().nullable(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  suffix: z.string().nullable(),
  preferredName: z.string().nullable(),
  ssnLast4: z.string().nullable(),
  isMinor: z.boolean(),
  isAttorney: z.boolean(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  phoneSecondary: z.string().nullable(),
  fax: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  status: z.string(),
  notes: z.string().nullable(),
  isClient: z.boolean().describe('True when the contact has an active client account, directly or as a group member.'),
  clientId: z.string().nullable(),
  clientNumber: z.string().nullable(),
  clientDisplayName: z.string().nullable().optional().describe("The client account's own name (for a joint client, both people). Used for the billing client list. Added in API patch 8; optional so a browser can read an older API's reply."),
  clientType: z.string().nullable(),
  clientStatus: z.string().nullable(),
  linkedUserId: z.string().nullable().describe('The login account linked to this person, when exactly one exists.'),
  isCurrentUser: z.boolean(),
  canEditLoginEmail: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
}

/** One contact in the list. No full SSN and no date of birth (see the file header). */
export const ContactListItem = z.object(contactFields)
export type ContactListItem = z.infer<typeof ContactListItem>

/** One contact with everything Edit Details shows, including the full SSN and date of birth. */
export const ContactDetail = z.object({
  ...contactFields,
  dob: z.string().nullable(),
  ssn: z.string().nullable(),
})
export type ContactDetail = z.infer<typeof ContactDetail>

/** Where the server spent its time. Diagnostics only: no contact data. */
export const ContactLoadTiming = z.object({
  mode: z.enum(['full', 'delta', 'one']),
  totalMs: z.number(),
  queryMs: z.number(),
  statements: z.number().describe('SQL statements run (the old API counted CRUD Worker calls here).'),
  rowsLoaded: z.number(),
  tables: z.array(z.object({ table: z.string(), rows: z.number() })),
})

const collectionFields = {
  collectionId: z.literal('contacts'),
  schemaVersion: z.number(),
  generatedAt: z.string().describe('Server time when the load began. Send it back as `since` for the next delta.'),
  allContactIds: z.array(z.string()).describe('Every current contact id (delta), or the ids returned (full and one). The browser drops ids not listed.'),
  timing: ContactLoadTiming,
}

export const ContactListData = z.object({
  ...collectionFields,
  contacts: z.array(ContactListItem),
  collectionVersion: z.string().optional().describe('Hash of every id and change time. Full loads only.'),
})
export type ContactListData = z.infer<typeof ContactListData>

export const ContactDetailData = z.object({
  ...collectionFields,
  contacts: z.array(ContactDetail).describe('The one contact asked for (an empty list is never returned; that is 404).'),
})
export type ContactDetailData = z.infer<typeof ContactDetailData>
