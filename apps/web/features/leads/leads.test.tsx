// file: apps/web/features/leads/leads.test.tsx
/**
 * Leads screen (plan 10, stage 3): the pure helpers in `leadRows.ts` (directory rows, client leads left out unless
 * converted leads are shown, an individual carrying its lead, the five-result search, the note subject, the sentences
 * after a create and a conversion, paging joins), the create dialog's request body against the contract, and first
 * draws rendered to text of the panel (from a given first page, no API), the Detail tab and the conversion dialog.
 * Every save goes to the live database, so nothing here calls the API. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/leads/leads.test.tsx
 */

import { LeadCreateBody, type Lead, type LeadsData, type WorkstreamActivity } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { KRContactRecord } from '@/features/contacts/types'
import LeadConvertDialog from '@/features/leads/components/LeadConvertDialog.client'
import { displayNameFromDraft, leadCreateBody } from '@/features/leads/components/LeadCreateDialog.client'
import LeadDetailCard from '@/features/leads/components/LeadDetailCard.client'
import LeadsPanel from '@/features/leads/components/LeadsPanel.client'
import {
  appendLeads,
  conversionMessage,
  createdLeadMessage,
  directoryRows,
  directoryStatusLabel,
  draftFromLead,
  moreLeadsLine,
  noteTitle,
  searchLeadRows,
  upsertLead,
} from '@/features/leads/leadRows'

const lead = (id: string, lcid: string, individualId: string, displayName: string, extra: Partial<Lead> = {}): Lead => ({
  id,
  lcid,
  individualId,
  displayName,
  firstName: displayName.split(' ')[0] ?? null,
  lastName: displayName.split(' ')[1] ?? null,
  icid: null,
  email: null,
  phone: null,
  source: 'manual',
  status: 'new',
  urgency: 'normal',
  summary: null,
  practiceArea: null,
  assignedToUserId: null,
  assignedToLabel: null,
  publicInquiryId: null,
  receivedAt: '2026-11-10T15:00:00.000Z',
  lastActionAt: null,
  convertedClientId: null,
  convertedClientNumber: null,
  createdAt: '2026-11-10T15:00:00.000Z',
  updatedAt: null,
  ...extra,
})

const contact = (id: string, displayName: string, extra: Partial<KRContactRecord> = {}): KRContactRecord => ({
  id,
  kind: 'individual',
  icid: null,
  typeLabel: 'Individual',
  displayName,
  titlePrefix: null,
  firstName: displayName.split(' ')[0] ?? null,
  middleName: null,
  lastName: displayName.split(' ')[1] ?? null,
  suffix: null,
  preferredName: null,
  dob: null,
  ssn: null,
  ssnLast4: null,
  isMinor: false,
  isAttorney: false,
  email: null,
  phone: null,
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  status: 'active',
  notes: null,
  isClient: false,
  clientId: null,
  clientNumber: null,
  clientStatus: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: null,
  relatedMatters: [],
  relatedContacts: [],
  ...extra,
})

const LEADS = [
  lead('lead_1', 'L007', 'ind_1', 'Lee Lead', { email: 'lee@example.com', phone: '(555) 010-0007', summary: 'Asked about a will.', status: 'contacted', urgency: 'high', assignedToUserId: 'u1', assignedToLabel: 'DK - Dan Example' }),
  lead('lead_2', 'L006', 'ind_2', 'Cal Client'),
  lead('lead_3', 'L005', 'ind_3', 'Vic Converted', { status: 'won', convertedClientId: 'cl_9', convertedClientNumber: '509' }),
]
const CONTACTS = [
  contact('ind_1', 'Lee Lead', { icid: 'I0101' }),
  contact('ind_2', 'Cal Client', { isClient: true, clientId: 'cl_2', clientNumber: '502' }),
  contact('ind_4', 'Pat Person', { email: 'pat@example.com' }),
  contact('ind_5', 'Old Inactive', { clientStatus: 'inactive' }),
]

describe('directory rows', () => {
  it('leaves out leads whose person is a client unless converted leads are shown', () => {
    expect(directoryRows(LEADS, CONTACTS).leadRows.map((row) => row.leadNumber)).toEqual(['L007'])
    expect(directoryRows(LEADS, CONTACTS, true).leadRows.map((row) => row.leadNumber)).toEqual(['L007', 'L006', 'L005'])
  })

  it('lists active individuals by name, each carrying its loaded lead', () => {
    const { individualRows } = directoryRows(LEADS, CONTACTS)
    expect(individualRows.map((row) => row.displayName)).toEqual(['Cal Client', 'Lee Lead', 'Pat Person'])
    expect(individualRows.find((row) => row.id === 'ind_1')?.lead?.lcid).toBe('L007')
    expect(individualRows.find((row) => row.id === 'ind_4')?.lead).toBeNull()
  })

  it('labels the status, and a converted lead by its client', () => {
    const rows = directoryRows(LEADS, CONTACTS, true).leadRows
    expect(directoryStatusLabel(rows[0]!)).toBe('Contacted')
    expect(directoryStatusLabel(rows[2]!)).toBe('Client 509')
  })

  it('finds five at most, an exact identifier first', () => {
    const { leadRows, individualRows } = directoryRows(LEADS, CONTACTS)
    expect(searchLeadRows('l', leadRows)).toEqual([])
    expect(searchLeadRows('L007', leadRows)[0]).toMatchObject({ rank: 1100, matchPercent: 100 })
    expect(searchLeadRows('pat', individualRows).map((match) => match.row.displayName)).toEqual(['Pat Person'])
    expect(searchLeadRows('example.com', individualRows).map((match) => match.matchPercent)).toEqual([85])
  })

  it('joins pages without repeats and puts a saved lead in place or first', () => {
    expect(appendLeads(LEADS.slice(0, 2), LEADS.slice(1)).map((item) => item.id)).toEqual(['lead_1', 'lead_2', 'lead_3'])
    const changed = { ...LEADS[1]!, status: 'qualified' as const }
    expect(upsertLead(LEADS, changed)[1]?.status).toBe('qualified')
    expect(upsertLead(LEADS.slice(1), LEADS[0]!)[0]?.id).toBe('lead_1')
  })
})

describe('sentences and small helpers', () => {
  it('makes the note subject from the first non-blank line, 160 characters at most', () => {
    expect(noteTitle('\n  Called back  \nLeft a message')).toBe('Called back')
    expect(noteTitle('x'.repeat(200))).toHaveLength(160)
  })

  it('says whether a create made a lead or found the person\'s lead', () => {
    expect(createdLeadMessage({ lead: LEADS[0]!, created: true })).toBe('Created L007 for Lee Lead.')
    expect(createdLeadMessage({ lead: LEADS[0]!, created: false })).toBe('This person already has lead L007.')
  })

  it('reports a conversion with the client, its .0 matter and the moved entries', () => {
    const data = { lead: LEADS[0]!, clientId: 'cl_1', clientNumber: '501', generalMatterNumber: '501.0', movedWorkstreamEntries: 3 }
    expect(conversionMessage(data)).toBe('Lead L007 is now client 501 (501.0); 3 Workstream entries moved.')
    expect(conversionMessage({ ...data, movedWorkstreamEntries: 1 })).toBe('Lead L007 is now client 501 (501.0); 1 Workstream entry moved.')
  })

  it('says when older leads exist (D10)', () => {
    expect(moreLeadsLine(100, true)).toContain('Older leads exist')
    expect(moreLeadsLine(100, false)).toBe('')
  })

  it('drafts the edit fields from the lead, with no follow-up date', () => {
    expect(draftFromLead(LEADS[0]!)).toEqual({ firstName: 'Lee', lastName: 'Lead', email: 'lee@example.com', phone: '(555) 010-0007', matterType: '', urgency: 'high', status: 'contacted', assignedToUserId: 'u1', summary: 'Asked about a will.' })
  })
})

describe('create body', () => {
  const draft = { firstName: 'Ann', middleName: '', lastName: 'Example', preferredName: '', email: 'ann@example.com', phone: '', notes: 'Asked about probate.' }

  it('sends a new person, or only the existing person\'s id, and fits the contract', () => {
    const fresh = leadCreateBody(null, draft)
    expect(() => LeadCreateBody.parse(fresh)).not.toThrow()
    expect(fresh).toMatchObject({ person: { firstName: 'Ann', lastName: 'Example', email: 'ann@example.com' }, inquirySummary: 'Asked about probate.', source: 'manual', status: 'new', urgency: 'normal' })
    expect(fresh.person?.phone).toBeUndefined()
    const existing = leadCreateBody({ id: 'ind_4' }, draft)
    expect(() => LeadCreateBody.parse(existing)).not.toThrow()
    expect(existing).toMatchObject({ individualId: 'ind_4' })
    expect(existing.person).toBeUndefined()
  })

  it('uses the preferred name for the display name', () => {
    expect(displayNameFromDraft({ ...draft, preferredName: 'Annie' })).toBe('Annie')
    expect(displayNameFromDraft({ ...draft, middleName: 'B' })).toBe('Ann B Example')
  })
})

describe('first draws', () => {
  const data = (extra: Partial<LeadsData> = {}): LeadsData => ({ leads: LEADS, nextCursor: null, viewer: { canWrite: true, canCreate: true }, ...extra })

  it('draws the directory from a given first page, with Load more while older leads exist', () => {
    const html = renderToStaticMarkup(<LeadsPanel initialData={data({ nextCursor: 'next-page' })} />)
    expect(html).toContain('data-kr-id="LeadsPanel"')
    expect(html).toContain('Lead directory')
    expect(html).toContain('Lee Lead')
    expect(html).not.toContain('Vic Converted')
    expect(html).toContain('Load more leads')
    expect(html).toContain('Older leads exist')
    expect(html).toContain('Add Lead')
  })

  it('hides Add Lead and Load more when the viewer may not create and no more leads exist', () => {
    const html = renderToStaticMarkup(<LeadsPanel initialData={data({ viewer: { canWrite: false, canCreate: false } })} />)
    expect(html).not.toContain('Load more leads')
    expect(html).not.toMatch(/>Add Lead</)
  })

  const note: WorkstreamActivity = {
    id: 'wsa_1', wsid: 'ABC1234', subgroup: 'Notes', clientId: null, clientNumber: null, clientDisplayName: null, leadId: 'lead_1', lcid: 'L007', matterId: null, matterNumber: null, matterTitle: null,
    activityAt: '2026-11-12T16:00:00.000Z', title: 'Called back', note: 'Called back\nLeft a message', noteHtml: null, nextSteps: [], documentRecordId: null, documentUrl: null, documentLabel: null, taskId: null,
    assigneeUserId: null, assigneeContactId: null, assigneeLabel: null, performedByUserId: 'u1', performedByLabel: 'Dan Example', createdAt: '2026-11-12T16:00:00.000Z', updatedAt: null,
  }

  it('draws the Detail tab with the facts, Convert to client and the Workstream notes', () => {
    const html = renderToStaticMarkup(<LeadDetailCard canCreate canWrite initialNotes={[note]} lead={LEADS[0]!} onConvert={() => {}} onEdit={() => {}} />)
    expect(html).toContain('L007 · Lee Lead')
    expect(html).toContain('Contacted')
    expect(html).toContain('DK - Dan Example')
    expect(html).toContain('Edit Lead')
    expect(html).toContain('data-kr-action="convert-lead"')
    expect(html).toContain('Add note')
    expect(html).toContain('Dan Example · Nov 12, 2026')
    expect(html).not.toContain('Open contact')
  })

  it('draws a converted lead without Convert, with Open client', () => {
    const html = renderToStaticMarkup(<LeadDetailCard canCreate canWrite={false} initialNotes={[]} lead={LEADS[2]!} onConvert={() => {}} onEdit={() => {}} onOpenContact={() => {}} />)
    expect(html).toContain('Converted: client 509.')
    expect(html).not.toContain('data-kr-action="convert-lead"')
    expect(html).toContain('Open client')
    expect(html).not.toContain('Add note')
    expect(html).toContain('No notes have been added to this lead yet.')
  })

  it('asks before converting, with an optional client number', () => {
    const html = renderToStaticMarkup(<LeadConvertDialog busy={false} error="" lead={LEADS[0]!} open onCancel={() => {}} onConfirm={() => {}} />)
    expect(html).toContain('Convert lead to client')
    expect(html).toContain('Make Lee Lead (L007) a client?')
    expect(html).toContain('Client number')
    expect(html).toContain('Leave blank for the next free number.')
  })
})
