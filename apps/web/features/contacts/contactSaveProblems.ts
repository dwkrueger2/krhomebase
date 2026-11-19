// file: apps/web/features/contacts/contactSaveProblems.ts
/**
 * Which fields of the contact editor a save would be refused for, by name (FB-0015, the requester, Nov 17, 2026).
 *
 * Before this file a refused save showed only "Some fields are not in the expected form." under the card: the API's
 * `VALIDATION_FAILED` reply lists the fields (`details`, the zod issues), but the editor dropped them, and nothing on
 * the card turned red. The requester's note on FB-0015: a validation error must mark the field, with a red box and
 * red words. The cause there was the address state: contacts seeded with "Texas" could not be saved at all.
 *
 *  - `contactSaveProblems(body)` checks the body against the same contract the API uses (`ContactUpdateBody`) before
 *    it is sent, plus the one rule the contract cannot state: a state must be a real two-letter code.
 *  - `problemsFromApiDetails(details)` reads the API's issues the same way, for a refusal the browser did not foresee.
 *  - `problemSummary(problems)` is the line under the card: "Check the fields marked in red. State: Use the two-letter
 *    state code, for example TX."
 *
 * Pure functions: no React, no calls. The editor (`ContactEditDialog`) keeps the problems and passes them to
 * `ContactEditCard`, which marks the fields.
 */

import { ContactUpdateBody, usStateCode } from '@krhomebase/contracts'

/** A field of the save body with a sentence saying what is wrong with it. */
export type ContactFieldProblems = Partial<Record<keyof ContactUpdateBody, string>>

/** The editor's label for each field of the save body, as the card shows it. */
export const CONTACT_FIELD_LABELS: Record<keyof ContactUpdateBody, string> = {
  kind: 'Contact kind',
  expectedUpdatedAt: 'Revision',
  confirmLoginEmailChange: 'Login email confirmation',
  displayName: 'Display name',
  titlePrefix: 'Title',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  suffix: 'Suffix',
  preferredName: 'Preferred name',
  dob: 'Date of birth',
  ssn: 'SSN',
  isAttorney: 'Is Attorney',
  entitySubtype: 'Entity type',
  partnershipType: 'Partnership type',
  managementStructure: 'Management structure',
  ein: 'EIN',
  stateOfFormation: 'State of formation',
  formationDate: 'Formation date',
  entityStatus: 'Entity status',
  sosFileNumber: 'SOS file number',
  stateTaxpayerNumber: 'State taxpayer number',
  xtNumber: 'XT number',
  registeredAgentName: 'Registered agent',
  boiStatus: 'BOI status',
  boiConfirmationNumber: 'BOI confirmation number',
  pointOfContactId: 'Point of contact',
  registeredAgentId: 'Registered agent',
  relatedContactIds: 'Related contacts',
  email: 'Email',
  phone: 'Office phone',
  phoneSecondary: 'Cell phone',
  fax: 'Fax',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  state: 'State',
  postalCode: 'ZIP',
  notes: 'Notes',
}

/** The two fields that hold a state. */
const STATE_FIELDS = ['state', 'stateOfFormation'] as const

const STATE_SENTENCE = 'Use the two-letter state code, for example TX.'

/** One zod issue as the API sends it in `details` (only the parts read here). */
interface IssueLike {
  path?: unknown
  code?: unknown
  maximum?: unknown
  message?: unknown
}

function isBodyField(value: unknown): value is keyof ContactUpdateBody {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONTACT_FIELD_LABELS, value)
}

/** A plain sentence for one issue on one field. */
function issueSentence(field: keyof ContactUpdateBody, issue: IssueLike): string {
  if ((STATE_FIELDS as readonly string[]).includes(field)) return STATE_SENTENCE
  if (issue.code === 'too_big' && typeof issue.maximum === 'number') return `At most ${issue.maximum} characters.`
  return 'Not in the expected form.'
}

/** Reads zod issues (from the contract check here, or the API's `details`) as field problems; the first per field wins. */
function problemsFromIssues(issues: readonly IssueLike[]): ContactFieldProblems {
  const rVal: ContactFieldProblems = {}
  for (const issue of issues) {
    const field = Array.isArray(issue.path) ? issue.path[0] : undefined
    if (!isBodyField(field) || rVal[field]) continue
    rVal[field] = issueSentence(field, issue)
  }
  return rVal
}

/**
 * The fields a save of this body would be refused for. Empty when the body may be sent.
 *
 * @param body - The body the editor is about to send with `PATCH /v1/contacts/{id}`.
 */
export function contactSaveProblems(body: ContactUpdateBody): ContactFieldProblems {
  const parsed = ContactUpdateBody.safeParse(body)
  const rVal = parsed.success ? {} : problemsFromIssues(parsed.error.issues as readonly IssueLike[])
  for (const field of STATE_FIELDS) {
    const value = body[field]
    if (value && usStateCode(value) !== value) rVal[field] = STATE_SENTENCE
  }
  return rVal
}

/**
 * The fields named in the API's `VALIDATION_FAILED` reply (`error.details`, the zod issues). Empty when the details
 * name no field the editor knows.
 */
export function problemsFromApiDetails(details: unknown): ContactFieldProblems {
  return Array.isArray(details) ? problemsFromIssues(details as readonly IssueLike[]) : {}
}

/**
 * The line under the card: "Check the fields marked in red. State: Use the two-letter state code, for example TX."
 * One entry per label (two fields share "Registered agent"). Empty when there is no problem.
 */
export function problemSummary(problems: ContactFieldProblems): string {
  const byLabel = new Map<string, string>()
  for (const [field, sentence] of Object.entries(problems) as Array<[keyof ContactUpdateBody, string]>) {
    const label = CONTACT_FIELD_LABELS[field]
    if (!byLabel.has(label)) byLabel.set(label, sentence)
  }
  if (!byLabel.size) return ''
  return `Check the fields marked in red. ${[...byLabel].map(([label, sentence]) => `${label}: ${sentence}`).join(' ')}`
}

/**
 * A state as the editor shows and saves it: the two-letter code when the value is a state ("Texas" becomes "TX"),
 * otherwise the value unchanged, so the person sees it and the save marks it.
 */
export function stateForEditor(value: string | null | undefined): string {
  return usStateCode(value) ?? (value ?? '')
}
