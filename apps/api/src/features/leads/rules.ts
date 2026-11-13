// file: apps/api/src/features/leads/rules.ts
/**
 * Business rules for Leads (plan 10, stage 3), ported from the old `kr-api-v1/leads` route and the crud Worker's
 * LCID rule. As-is record: `docs/API/WorkStream_AsIs_Reference.md` section 4.
 *
 * Kept from the old route: a lead is always a person; one lead per person (a repeat returns the person's lead with
 * `created: false`); a public inquiry makes at most one lead (a repeat returns it) and needs source `public_inquiry`;
 * a new person is created with their email and phone (now through `POST /v1/contacts`'s own rule, `createContact`);
 * the summary starts with "Source detail: ..." when a source detail is given; LCID `L` and the highest number plus
 * one, at least three digits, retried on a clash (eight times).
 *
 * Changed (the requester's decisions of Nov 13, 2026):
 * - Lead notes are Workstream `Notes` entries on the lead (`POST /v1/workstream` with `leadId`); the old PATCH
 *   `noteText` appended them to the person's contact notes, where the old Leads screen never showed them.
 * - Conversion is new: the person becomes a client (`setClientStatus`, the contact screens' own rule: the next free
 *   number and its `.0` Client General Matters, or the person's existing account made active), the lead is marked
 *   Won and linked to it, and its Workstream entries move to the `.0` matter (D12). A second conversion is refused.
 * - Unknown source, status or urgency are refused by the contract (the old route silently replaced them).
 * - "Source detail" is not added a second time when the summary already starts with it (the old import doubled it).
 * - A change may clear the summary and practice area, and may set the assignee (an active staff user); the old one
 *   could do neither.
 */

import type { Lead, LeadConversionBody, LeadConvertedData, LeadCreateBody, LeadsData, LeadSavedData, LeadsQuery, LeadUpdateBody } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { ContactEditQueries } from '../contact-edits/queries.ts'
import { createContact, setClientStatus, type Actor } from '../contact-edits/rules.ts'
import type { LeadQueries, LeadRow } from './queries.ts'

/** Office roles that may read leads (old `KR_API_V1_INTERNAL_READ_ROLES`). */
export const LEAD_READ_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'front_end_author'] as const
/** Office roles that may change leads (old `KR_API_V1_INTERNAL_WRITE_ROLES`). */
export const LEAD_WRITE_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee'] as const

const LCID_ATTEMPTS = 8

export class LeadError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message)
    this.name = 'LeadError'
  }
}

/** The signed-in person (from the checked session) and whether they hold contacts.create. */
export interface LeadActor extends Actor {
  canCreate: boolean
}

function name(preferred: string | null, first: string | null, last: string | null, fallback: string): string {
  return preferred?.trim() || [first, last].filter((part) => part?.trim()).join(' ').trim() || fallback
}

export function serializeLead(row: LeadRow): Lead {
  return {
    id: row.id,
    lcid: row.lcid,
    individualId: row.individual_id,
    displayName: name(row.preferred_name, row.first_name, row.last_name, 'Unnamed lead'),
    firstName: row.first_name,
    lastName: row.last_name,
    icid: row.icid,
    email: row.email,
    phone: row.phone,
    source: row.source as Lead['source'],
    status: row.status as Lead['status'],
    urgency: row.urgency as Lead['urgency'],
    summary: row.summary,
    practiceArea: row.practice_area,
    assignedToUserId: row.assigned_to_user_id,
    assignedToLabel: row.assigned_to_user_id ? name(row.assignee_preferred_name, row.assignee_first_name, row.assignee_last_name, row.assignee_email ?? row.assigned_to_user_id) : null,
    publicInquiryId: row.public_inquiry_id,
    receivedAt: row.received_at,
    lastActionAt: row.last_action_at,
    convertedClientId: row.converted_client_id,
    convertedClientNumber: row.converted_client_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** `L` and the number, at least three digits (crud Worker rule). */
export function lcidFor(number: number): string {
  return `L${String(number).padStart(3, '0')}`
}

/** The summary saved for a new lead: "Source detail: X" first (once), then the inquiry text. */
export function leadSummary(inquirySummary: string | undefined, sourceDetail: string | undefined): string | null {
  const summary = inquirySummary?.trim() ?? ''
  const detail = sourceDetail?.trim()
  if (!detail || summary.toLowerCase().startsWith('source detail:')) return summary || null
  return [`Source detail: ${detail}`, summary].filter(Boolean).join('\n')
}

function encodeCursor(row: LeadRow): string {
  return btoa(JSON.stringify([row.received_at, row.id])).replace(/=+$/, '')
}

function decodeCursor(value: string | undefined): { receivedAt: string; id: string } | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(atob(value + '='.repeat((4 - (value.length % 4)) % 4)))
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((part) => typeof part === 'string')) return { receivedAt: parsed[0] as string, id: parsed[1] as string }
  } catch {
    // fall through
  }
  throw new LeadError('LEAD_CURSOR_INVALID', 422, 'That page position is not valid. Load the list again.')
}

async function requireLead(q: LeadQueries, idOrLcid: string): Promise<LeadRow> {
  const row = await q.lead(idOrLcid)
  if (!row) throw new LeadError('LEAD_NOT_FOUND', 404, 'No lead has that id or LCID.')
  return row
}

function auditFor(actor: Actor, action: string, leadId: string, newJson: unknown, clientId: string | null = null): AuditEntry {
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'leads', action, targetTable: 'lead', targetId: leadId, clientId, newJson }
}

/** Leads newest first, one page, and what the viewer may do. Writes nothing. */
export async function listLeads(q: LeadQueries, actor: LeadActor, query: LeadsQuery): Promise<LeadsData> {
  const rows = await q.list({ status: query.status, includeConverted: query.includeConverted === 'true' }, decodeCursor(query.cursor), query.limit)
  const pageRows = rows.slice(0, query.limit)
  const last = pageRows.at(-1)
  return {
    leads: pageRows.map(serializeLead),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    viewer: { canWrite: (LEAD_WRITE_ROLES as readonly string[]).includes(actor.role), canCreate: actor.canCreate },
  }
}

export async function getLead(q: LeadQueries, idOrLcid: string): Promise<LeadSavedData> {
  return { lead: serializeLead(await requireLead(q, idOrLcid)), created: false }
}

/**
 * Creates a lead for an existing person or a new one. A repeat for the same person or the same public inquiry returns
 * the existing lead (`created: false`), as the old route did.
 */
export async function createLead(q: LeadQueries, contacts: ContactEditQueries, actor: Actor, body: LeadCreateBody, now: string): Promise<LeadSavedData> {
  const source = body.source ?? 'manual'
  if (body.publicInquiryId && source !== 'public_inquiry') throw new LeadError('LEAD_PUBLIC_INQUIRY_SOURCE', 422, 'A lead from a public inquiry must have the source "Public inquiry".')
  if (body.publicInquiryId) {
    const existing = await q.leadForPublicInquiry(body.publicInquiryId)
    if (existing) return { lead: serializeLead(existing), created: false }
  }

  let individualId = body.individualId ?? null
  if (individualId) {
    if (!(await q.individualExists(individualId))) throw new LeadError('LEAD_INDIVIDUAL_NOT_FOUND', 404, 'No person has that id.')
    const existing = await q.leadForIndividual(individualId)
    if (existing) return { lead: serializeLead(existing), created: false }
  } else {
    const person = body.person!
    const created = await createContact(
      contacts,
      { kind: 'individual', firstName: person.firstName, middleName: person.middleName, lastName: person.lastName, suffix: person.suffix, preferredName: person.preferredName, email: person.email, phone: person.phone },
      actor,
    )
    individualId = created.contactId
  }

  const id = `lead_${crypto.randomUUID()}`
  for (let attempt = 0; attempt < LCID_ATTEMPTS; attempt += 1) {
    const lcid = lcidFor((await q.highestLcidNumber()) + 1)
    const saved = await q.insert(
      {
        id,
        lcid,
        individualId,
        publicInquiryId: body.publicInquiryId ?? null,
        source,
        status: body.status ?? 'new',
        urgency: body.urgency ?? 'normal',
        summary: leadSummary(body.inquirySummary, body.sourceDetail),
        practiceArea: body.practiceArea?.trim() || null,
        now,
      },
      auditFor(actor, 'CREATE', id, { lcid, individualId, source, newPerson: Boolean(body.person) }),
    )
    if (saved) return { lead: serializeLead(await requireLead(q, id)), created: true }
  }
  throw new LeadError('LEAD_LCID_EXHAUSTED', 409, 'An LCID could not be assigned. Try again.')
}

/** Changes the fields sent. */
export async function updateLead(q: LeadQueries, actor: Actor, idOrLcid: string, body: LeadUpdateBody, now: string): Promise<LeadSavedData> {
  const current = await requireLead(q, idOrLcid)
  if (body.assignedToUserId && !(await q.activeStaffUser(body.assignedToUserId))) throw new LeadError('LEAD_ASSIGNEE_NOT_FOUND', 422, 'The assignee must be an active staff user.')
  const row = {
    id: current.id,
    status: body.status ?? current.status,
    urgency: body.urgency ?? current.urgency,
    summary: body.summary === undefined ? current.summary : body.summary?.trim() || null,
    practiceArea: body.practiceArea === undefined ? current.practice_area : body.practiceArea?.trim() || null,
    assignedToUserId: body.assignedToUserId === undefined ? current.assigned_to_user_id : body.assignedToUserId || null,
    now,
  }
  await q.update(row, auditFor(actor, 'UPDATE', current.id, { fields: Object.keys(body), status: row.status, urgency: row.urgency }))
  return { lead: serializeLead(await requireLead(q, current.id)), created: false }
}

/**
 * Converts a lead: the person becomes a client (the next free number, or the one given, and its `.0` matter; an
 * existing account of the person is made active), the lead is marked Won and linked, and its Workstream entries move
 * to the `.0` matter. The account is saved first (its own batch); running the conversion again after a failure finds
 * that account and finishes.
 */
export async function convertLead(q: LeadQueries, contacts: ContactEditQueries, actor: Actor, idOrLcid: string, body: LeadConversionBody, now: string): Promise<LeadConvertedData> {
  const current = await requireLead(q, idOrLcid)
  if (current.converted_client_id) throw new LeadError('LEAD_ALREADY_CONVERTED', 409, `This lead is already client ${current.converted_client_number ?? ''}.`.replace(' .', '.'))
  const displayName = body.displayName?.trim() || name(current.preferred_name, current.first_name, current.last_name, 'Client')
  const account = await setClientStatus(contacts, { contactId: current.individual_id, kind: 'individual', isClient: true, displayName, clientNumber: body.clientNumber }, actor)
  if (!account.clientId || !account.clientNumber) throw new LeadError('LEAD_CONVERSION_FAILED', 409, 'The client account could not be opened.')
  const matterId = await q.generalMatterId(account.clientId)
  if (!matterId) throw new LeadError('LEAD_CONVERSION_FAILED', 409, 'The client has no .0 Client General Matters for the lead\'s Workstream entries.')
  const moved = await q.convert(current.id, account.clientId, matterId, now, auditFor(actor, 'CONVERT', current.id, { clientId: account.clientId, clientNumber: account.clientNumber }, account.clientId))
  return {
    lead: serializeLead(await requireLead(q, current.id)),
    clientId: account.clientId,
    clientNumber: account.clientNumber,
    generalMatterNumber: account.generalMatterNumber ?? `${account.clientNumber}.0`,
    movedWorkstreamEntries: moved,
  }
}
