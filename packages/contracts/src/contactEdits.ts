// file: packages/contracts/src/contactEdits.ts
/**
 * Contact writes (plan stages 1d-3 and 1d-4): create and edit a contact, a contact's client account, and contact
 * maintenance (merge, copy and inactivate, delete). Ported from the old `kr-api-v1/contacts` POST and PATCH,
 * `kr-api-v1/clients` GET, POST and PATCH, and `kr-api-v1/contact-maintenance` POST.
 *
 * Changes from the old API:
 *  - One route per action (plan difference 1): the old maintenance address took an `operation` field; here each
 *    operation has its own route.
 *  - Creating a contact with a client account is one call (`createClient: true`) and one database batch: the
 *    person or entity, the email and phone, the client, its General Matter (`<number>.0`) and the matter's primary
 *    client party are saved together or not at all. The old app made two calls through two routes.
 *  - Every request body is checked against these shapes; unknown keys are refused. The old routes also accepted
 *    snake_case duplicates (`first_name`); the browser never sent them, so they are gone.
 */

import { z } from 'zod'
import { ContactDetail } from './contacts.ts'

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) => text(max).nullable().optional()

export const ContactKind = z.enum(['individual', 'entity'])

// ----------------------------------------------------------------------------------------------------------
// Create

export const ContactCreateBody = z
  .object({
    kind: ContactKind,
    /** Individuals: required. */
    firstName: optionalText(120),
    middleName: optionalText(120),
    lastName: optionalText(120),
    suffix: optionalText(40),
    preferredName: optionalText(200),
    isAttorney: z.boolean().optional(),
    /** Entities: required (the legal name). */
    legalName: optionalText(300),
    entitySubtype: optionalText(40),
    email: optionalText(254),
    phone: optionalText(40),
    notes: optionalText(4000),
    /** Also open a client account (with its General Matter). */
    createClient: z.boolean().optional(),
    /** With `createClient`: the client number to use. Left out: the next free number. */
    clientNumber: optionalText(12),
  })
  .strict()
export type ContactCreateBody = z.infer<typeof ContactCreateBody>

export const ContactCreateData = z.object({
  contactId: z.string(),
  kind: ContactKind,
  displayName: z.string(),
  /** The new ICID or ECID. */
  recordCode: z.string(),
  contactMethodCount: z.number().int(),
  clientId: z.string().nullable(),
  clientNumber: z.string().nullable(),
  generalMatterNumber: z.string().nullable(),
})
export type ContactCreateData = z.infer<typeof ContactCreateData>

// ----------------------------------------------------------------------------------------------------------
// Update

export const ContactUpdateBody = z
  .object({
    kind: ContactKind,
    /** The contact's `updatedAt` when the editor opened. A different current value answers 409 CONTACT_CONFLICT. */
    expectedUpdatedAt: optionalText(40),
    /** A person changing their own login email must say they accept being signed out. */
    confirmLoginEmailChange: z.boolean().optional(),
    displayName: optionalText(300),
    titlePrefix: optionalText(40),
    firstName: optionalText(120),
    middleName: optionalText(120),
    lastName: optionalText(120),
    suffix: optionalText(40),
    preferredName: optionalText(200),
    dob: optionalText(10),
    ssn: optionalText(20),
    isAttorney: z.boolean().optional(),
    entitySubtype: optionalText(40),
    partnershipType: optionalText(10),
    managementStructure: optionalText(40),
    ein: optionalText(20),
    stateOfFormation: optionalText(2),
    formationDate: optionalText(10),
    entityStatus: optionalText(20),
    sosFileNumber: optionalText(60),
    stateTaxpayerNumber: optionalText(60),
    xtNumber: optionalText(60),
    registeredAgentName: optionalText(200),
    boiStatus: optionalText(20),
    boiConfirmationNumber: optionalText(80),
    pointOfContactId: optionalText(80),
    registeredAgentId: optionalText(80),
    relatedContactIds: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    email: optionalText(254),
    phone: optionalText(40),
    phoneSecondary: optionalText(40),
    fax: optionalText(40),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(120),
    state: optionalText(2),
    postalCode: optionalText(20),
    notes: optionalText(4000),
  })
  .strict()
export type ContactUpdateBody = z.infer<typeof ContactUpdateBody>

export const ContactUpdateData = z.object({
  contactId: z.string(),
  kind: ContactKind,
  displayName: z.string(),
  updatedAt: z.string(),
  /** True when the caller changed their own login email: every session was ended, so sign in again. */
  requiresLogin: z.boolean(),
  /** The contact as saved, with the full SSN and date of birth (the editor already had them). */
  contact: ContactDetail.nullable(),
})
export type ContactUpdateData = z.infer<typeof ContactUpdateData>

// ----------------------------------------------------------------------------------------------------------
// Client accounts

export const ClientSummary = z.object({
  id: z.string(),
  clientNumber: z.string(),
  clientType: z.string(),
  individualId: z.string().nullable(),
  entityId: z.string().nullable(),
  displayName: z.string(),
  prospectStatus: z.string(),
  status: z.string(),
  updatedAt: z.string().nullable(),
})
export type ClientSummary = z.infer<typeof ClientSummary>

export const ClientLookupQuery = z.object({
  clientNumber: text(12).optional().describe('A client number; leading zeros do not matter.'),
  clientId: text(80).optional(),
})
export const ClientLookupData = z.object({ clients: z.array(ClientSummary) })

export const NextClientNumberData = z.object({ suggestedClientNumber: z.string() })

export const ClientStatusBody = z
  .object({
    contactId: text(80).min(1),
    kind: ContactKind,
    /** True: make (or reactivate) the contact's client account. False: mark it inactive. */
    isClient: z.boolean(),
    displayName: optionalText(300),
    clientId: optionalText(80),
    clientNumber: optionalText(12),
  })
  .strict()
export type ClientStatusBody = z.infer<typeof ClientStatusBody>

export const ClientStatusData = z.object({
  clientId: z.string().nullable(),
  clientNumber: z.string().nullable(),
  status: z.enum(['active', 'inactive']).nullable(),
  generalMatterNumber: z.string().nullable(),
})
export type ClientStatusData = z.infer<typeof ClientStatusData>

// ----------------------------------------------------------------------------------------------------------
// Contact maintenance (super admin only)

const sourceFields = {
  sourceKind: ContactKind,
  sourceContactId: text(80).min(1),
}

/** Merge or copy-and-inactivate: a duplicate (source) into the record that stays (target). */
export const ContactResolutionBody = z
  .object({
    ...sourceFields,
    sourceClientId: optionalText(80),
    targetKind: ContactKind,
    targetContactId: text(80).min(1),
    targetClientId: optionalText(80),
    reason: optionalText(500),
    /** Required by merge and copy-and-inactivate: `MERGE <source number> INTO <target number>` or `INACTIVATE <source number>`. */
    confirmationPhrase: optionalText(200),
  })
  .strict()
export type ContactResolutionBody = z.infer<typeof ContactResolutionBody>

export const ContactMaintenanceParty = z.object({
  contactId: z.string(),
  kind: ContactKind,
  displayName: z.string(),
  clientId: z.string().nullable(),
  clientNumber: z.string().nullable(),
  clientStatus: z.string().nullable(),
  resolved: z.boolean(),
})

export const ContactMaintenanceItem = z.object({ code: z.string(), label: z.string(), count: z.number().int().optional(), category: z.string().optional() })

export const ContactResolutionPreflightData = z.object({
  source: ContactMaintenanceParty,
  target: ContactMaintenanceParty,
  blockers: z.array(ContactMaintenanceItem),
  advisories: z.array(ContactMaintenanceItem),
  mergeAllowed: z.boolean(),
  copyAndInactivateAllowed: z.boolean(),
})

export const ContactResolutionData = z.object({
  operation: z.enum(['merge', 'copy_and_inactivate']),
  source: ContactMaintenanceParty,
  target: ContactMaintenanceParty,
  resolved: z.literal(true),
})

/** Removing one contact on its own: delete when nothing refers to it, otherwise inactivate. */
export const ContactRemovalBody = z
  .object({
    ...sourceFields,
    reason: optionalText(500),
    /** Required by delete and inactivate: `DELETE <contact id>` or `INACTIVATE <contact id>`. */
    confirmationPhrase: optionalText(200),
  })
  .strict()
export type ContactRemovalBody = z.infer<typeof ContactRemovalBody>

export const ContactRemovalPreflightData = z.object({
  deleteAllowed: z.boolean(),
  inactivateAllowed: z.boolean(),
  blockers: z.array(ContactMaintenanceItem),
})

export const ContactRemovalData = z.object({
  operation: z.enum(['delete', 'inactivate']),
  resolved: z.literal(true),
  sourceContactId: z.string(),
})
