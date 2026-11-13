// file: apps/web/features/leads/leadRows.ts
/**
 * Pure helpers for the Leads screen: the directory rows (leads and individuals), the five-result directory search,
 * the edit draft, the note subject, and the sentences the screen shows after a save. Nothing here calls the API or
 * touches the browser, so the tests use these functions directly.
 *
 * Ported from the old `hb-components/KR-Leads/types.ts` (`KRLeadContact`, `KRLeadDraft`), the row builders in
 * `LeadsPanel.client.tsx` (`contactRow`, `leadRow`, `sortRows`, `draftFromLead`) and the scorer in
 * `LeadSearch.client.tsx` (`score`), with their comments.
 *
 * Changed from the old files:
 *  - A lead is the contract's `Lead` (`@krhomebase/contracts`), not the old `KRLeadRecord` built by `leadFromApiRow`:
 *    the API now returns camelCase fields with checked values, so the old guessing of field names and the fallbacks
 *    (`L-PENDING-1`, "Operational individual lead.", source `manual`) are gone.
 *  - Lead notes are Workstream `Notes` entries (the requester's decision of Nov 13, 2026), so `KRLeadNote` and the
 *    draft's `noteText` are gone; `noteTitle` makes the entry's subject from the note's first line.
 *  - The draft has `assignedToUserId` (the API can now set the assignee); the old `expiresOn` "Follow-up date" is
 *    left out because it was never saved (there is no column for it), and email and phone are shown but not edited
 *    here (the lead routes do not change the person; Edit Contact does).
 *  - An individual who already has a loaded lead carries it (`leadId`, `leadNumber`), so choosing that person opens
 *    the lead instead of asking to add them again.
 */

import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, LEAD_URGENCY_LABELS, type Lead, type LeadConvertedData, type LeadSavedData } from '@krhomebase/contracts'
import type { KRContactRecord } from '@/features/contacts/types'

/** Lead source shown by the lead ledger (the contract's list; `client_prospect` is no longer a source). */
export type KRLeadSource = Lead['source']

/** Runtime contact projection used by the Leads directory before a Lead exists. */
export interface KRLeadContact {
  id: string
  recordKind: 'individual' | 'lead'
  displayName: string
  icid: string | null
  individualId: string | null
  email: string
  phone: string
  clientId: string | null
  clientNumber: string | null
  clientStatus: string | null
  isClient: boolean
  leadId: string | null
  leadNumber: string | null
  leadStatus: string | null
  source: KRLeadSource | null
  summary: string
  contact: KRContactRecord | null
  lead: Lead | null
}

/** Draft state used by the lead edit dialog. */
export interface KRLeadDraft {
  firstName: string
  lastName: string
  email: string
  phone: string
  matterType: string
  urgency: Lead['urgency']
  status: Lead['status']
  assignedToUserId: string
  summary: string
}

/** The lead's code as shown: its LCID, or "Lead" when the API has not given one (it always does for new leads). */
export function leadNumber(lead: Pick<Lead, 'lcid'>): string {
  return lead.lcid ?? 'Lead'
}

/** The person's contact in the data store: by `individualId`, else by ICID (old join). */
export function contactForLead(lead: Lead, contactById: ReadonlyMap<string, KRContactRecord>, contactByIcid: ReadonlyMap<string, KRContactRecord>): KRContactRecord | null {
  return contactById.get(lead.individualId) ?? contactByIcid.get(lead.icid?.toLowerCase() ?? '') ?? null
}

/** One individual contact as a directory row; `lead` is the person's loaded lead, if any (new). */
export function contactRow(contact: KRContactRecord, lead: Lead | null = null): KRLeadContact {
  return { id: contact.id, recordKind: 'individual', displayName: contact.displayName, icid: contact.icid ?? null, individualId: contact.kind === 'individual' ? contact.id : null, email: contact.email ?? '', phone: contact.phone ?? '', clientId: contact.clientId, clientNumber: contact.clientNumber, clientStatus: contact.clientStatus, isClient: contact.isClient, leadId: lead?.id ?? null, leadNumber: lead ? leadNumber(lead) : null, leadStatus: lead?.status ?? null, source: lead?.source ?? null, summary: contact.notes ?? '', contact, lead }
}

/** One lead as a directory row, filled from its contact where the lead has no value. */
export function leadRow(lead: Lead, contact: KRContactRecord | null): KRLeadContact {
  return { id: lead.id, recordKind: 'lead', displayName: lead.displayName, icid: lead.icid ?? contact?.icid ?? null, individualId: lead.individualId ?? contact?.id ?? null, email: lead.email || contact?.email || '', phone: lead.phone || contact?.phone || '', clientId: contact?.clientId ?? lead.convertedClientId ?? null, clientNumber: contact?.clientNumber ?? lead.convertedClientNumber ?? null, clientStatus: contact?.clientStatus ?? null, isClient: Boolean(contact?.isClient || lead.convertedClientId), leadId: lead.id, leadNumber: leadNumber(lead), leadStatus: lead.status, source: lead.source, summary: lead.summary ?? '', contact, lead }
}

export function sortRows(rows: KRLeadContact[]): KRLeadContact[] { return [...rows].sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })) }

/**
 * Builds the two directory lists from the loaded leads and the data store's contacts.
 *
 * Leads: newest first, as the API sends them (D10). A lead whose person is already a client is left out, as in the
 * old screen, unless `includeConverted` is on; then converted leads stay and say so in their status.
 * Individuals: active individual contacts by name, each carrying its loaded lead.
 *
 * @param leads - The loaded leads (pages joined, newest first).
 * @param contacts - The data store's contacts.
 * @param includeConverted - Whether converted leads are shown.
 * @returns `{ leadRows, individualRows }`.
 */
export function directoryRows(leads: readonly Lead[], contacts: readonly KRContactRecord[], includeConverted = false): { leadRows: KRLeadContact[]; individualRows: KRLeadContact[] } {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]))
  const contactByIcid = new Map(contacts.filter((contact) => contact.icid).map((contact) => [contact.icid!.toLowerCase(), contact]))
  const clientIcids = new Set(contacts.filter((contact) => contact.isClient && contact.icid).map((contact) => contact.icid!.toLowerCase()))
  const leadRows = leads
    .map((lead) => ({ lead, contact: contactForLead(lead, contactById, contactByIcid) }))
    .filter(({ contact, lead }) => includeConverted || (!lead.convertedClientId && !contact?.isClient && (!lead.icid || !clientIcids.has(lead.icid.toLowerCase()))))
    .map(({ contact, lead }) => leadRow(lead, contact))
  const leadByIndividual = new Map(leads.map((lead) => [lead.individualId, lead]))
  const individualRows = sortRows(contacts.filter((contact) => contact.kind === 'individual' && contact.clientStatus !== 'inactive').map((contact) => contactRow(contact, leadByIndividual.get(contact.id) ?? null)))
  return { leadRows, individualRows }
}

/** Status column text: the lead's status (and "converted" when it became a client), else the client status. */
export function directoryStatusLabel(row: KRLeadContact): string {
  if (row.lead?.convertedClientNumber) return `Client ${row.lead.convertedClientNumber}`
  if (row.leadStatus) return LEAD_STATUS_LABELS[row.leadStatus as Lead['status']] ?? row.leadStatus
  return row.clientStatus ?? 'Contact'
}

/** Joins a further page of leads to the list, newest first, without repeating a lead already shown. */
export function appendLeads(current: readonly Lead[], next: readonly Lead[]): Lead[] {
  const seen = new Set(current.map((lead) => lead.id))
  return [...current, ...next.filter((lead) => !seen.has(lead.id))]
}

/** Puts one saved lead in the list: replaced where it was, or first when it is new. */
export function upsertLead(current: readonly Lead[], lead: Lead): Lead[] {
  return current.some((item) => item.id === lead.id) ? current.map((item) => (item.id === lead.id ? lead : item)) : [lead, ...current]
}

/** The edit dialog's draft for one lead. */
export function draftFromLead(lead: Lead): KRLeadDraft {
  return { firstName: lead.firstName ?? '', lastName: lead.lastName ?? '', email: lead.email ?? '', phone: lead.phone ?? '', matterType: lead.practiceArea ?? '', urgency: lead.urgency, status: lead.status, assignedToUserId: lead.assignedToUserId ?? '', summary: lead.summary ?? '' }
}

/** Plain labels for the lead's choice fields. */
export const leadStatusLabel = (lead: Pick<Lead, 'status'>): string => LEAD_STATUS_LABELS[lead.status]
export const leadSourceLabel = (lead: Pick<Lead, 'source'>): string => LEAD_SOURCE_LABELS[lead.source]
export const leadUrgencyLabel = (lead: Pick<Lead, 'urgency'>): string => LEAD_URGENCY_LABELS[lead.urgency]

/** The Workstream entry's subject for a lead note: the note's first non-blank line, 160 characters at most. */
export function noteTitle(note: string): string {
  const firstLine = note.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
  return firstLine.slice(0, 160)
}

/** The sentence after a create: a new lead, or the person's existing lead returned instead (one lead per person). */
export function createdLeadMessage(saved: LeadSavedData): string {
  const code = leadNumber(saved.lead)
  return saved.created ? `Created ${code} for ${saved.lead.displayName}.` : `This person already has lead ${code}.`
}

/** The sentence after a conversion: "Lead L007 is now client 501 (501.0); 3 Workstream entries moved." */
export function conversionMessage(data: LeadConvertedData): string {
  const moved = data.movedWorkstreamEntries
  return `Lead ${leadNumber(data.lead)} is now client ${data.clientNumber} (${data.generalMatterNumber}); ${moved} Workstream ${moved === 1 ? 'entry' : 'entries'} moved.`
}

/** The line under the list when more leads exist on the server (D10). */
export function moreLeadsLine(shown: number, hasMore: boolean): string {
  return hasMore ? `Showing the newest ${shown} leads. Older leads exist; choose Load more to see them.` : ''
}

/* ---------- Directory search (ported from LeadSearch.client.tsx) ---------- */

export interface LeadSearchMatch {
  row: KRLeadContact
  rank: number
  matchPercent: number
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function resolvedIcid(row: KRLeadContact): string | null {
  return row.icid?.trim() || row.contact?.icid?.trim() || null
}

export function resolvedEmail(row: KRLeadContact): string {
  return row.email.trim() || row.contact?.email?.trim() || ''
}

export function resolvedPhone(row: KRLeadContact): string {
  return row.phone.trim() || row.contact?.phone?.trim() || ''
}

function score(query: string, row: KRLeadContact): LeadSearchMatch {
  const name = normalize(row.displayName)
  const identifiers = [row.leadNumber, resolvedIcid(row), resolvedEmail(row), resolvedPhone(row)].map(normalize).filter(Boolean)
  const text = [name, ...identifiers].join(' ')
  const exactIdentifier = identifiers.some((value) => value === query)
  const exactName = name === query
  const startsWithName = name.startsWith(query)
  const includesText = text.includes(query)

  if (exactIdentifier || exactName) return { row, rank: exactIdentifier ? 1100 : 1000, matchPercent: 100 }
  if (startsWithName) return { row, rank: 900, matchPercent: 95 }
  if (includesText) return { row, rank: 700, matchPercent: 85 }
  return { row, rank: 0, matchPercent: 0 }
}

/** The five best matches for a query of two characters or more (unchanged ranking: identifier, name, start, contains). */
export function searchLeadRows(query: string, rows: readonly KRLeadContact[]): LeadSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length < 2) return []
  return rows
    .map((row) => score(normalizedQuery, row))
    .filter((item) => item.rank > 0)
    .sort((left, right) => right.rank - left.rank || right.matchPercent - left.matchPercent || left.row.displayName.localeCompare(right.row.displayName))
    .slice(0, 5)
}
