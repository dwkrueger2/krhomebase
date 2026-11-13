// file: apps/web/features/data-import/dataImport.test.tsx
/**
 * Firm Settings → Data Import (Settings plan, stage 8): the JSONC reader, the row checks and duplicate scores, lead
 * rows (approved since the Leads port: attached to a close existing individual, never to a row of the same file,
 * otherwise a new person; unknown values refused), the contact and lead bodies against the API's contracts (no
 * repeated "Source detail"), the store rows, the approved count matching what is sent (oddity 11), the help window's
 * fixed sentences (oddity 14), the instructions file, and first draws rendered to text. Made-up people only; nothing
 * calls the API.
 *
 * Run: pnpm --dir apps/web exec vitest run features/data-import/dataImport.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContactCreateBody, LeadCreateBody, type MaintenanceGateData } from '@krhomebase/contracts'
import { ContactImportHelpBody } from '@/features/data-import/components/ContactImportHelpDialog.client'
import { ContactImportReviewBody } from '@/features/data-import/components/ContactImportReviewDialog.client'
import { DataImportPage } from '@/features/data-import/components/DataImportPage.client'
import ImportChooser from '@/features/data-import/components/ImportChooser.client'
import {
  contactApiBody,
  contactsToSend,
  existingContactsFromStore,
  leadApiBody,
  leadAttachCandidate,
  parseKrImportJsonc,
  stripJsoncComments,
  validateBulkContactImportPayload,
} from '@/features/data-import/contactImportValidation'
import { loadInstructionsText } from '@/features/data-import/instructionsDownload'

const existing = existingContactsFromStore([
  { id: 'ind-1', kind: 'individual', displayName: 'Ann Example', email: 'ann@example.com', phone: '(555) 010-0001', relatedMatters: [{ matterNumber: '501.0', title: 'General' }] },
  { id: 'ent-1', kind: 'entity', displayName: 'Sample Holdings LLC', email: null, phone: '+1 (555) 010-0009' },
])

const payload = {
  individuals: [
    { importKey: 'p1', firstName: 'Bea', lastName: 'Sample', primaryEmail: 'bea@example.com' },
    { importKey: 'p2', firstName: 'Ann', lastName: 'Other', primaryEmail: 'ANN@example.com' },
    { importKey: 'p3', firstName: 'Cy' },
    { importKey: 'p4', firstName: 'Bea', lastName: 'Sample' },
  ],
  entities: [{ importKey: 'e1', legalName: 'New Ventures LLC', entityStatus: 'active', primaryPhone: '555-010-0009' }],
  trusts: [{ importKey: 't1', legalName: 'Dee Family Trust' }],
  leads: [
    { importKey: 'l1', firstName: 'Lee', lastName: 'Lead', status: 'new', source: 'other', urgency: 'normal', sourceDetail: 'KeyWave', inquirySummary: 'Asked about a will.', sourceMetadata: { sourceRowId: 'kw-17' } },
    { importKey: 'l2', firstName: 'Ann', lastName: 'Example', primaryEmail: 'ann@example.com' },
    { importKey: 'l3', firstName: 'Bea', lastName: 'Sample', source: 'other' },
    { importKey: 'l4', firstName: 'Max', lastName: 'Odd', source: 'KeyWave', urgency: 'soon' },
  ],
}

const actionOf = (key: string) => validated.rows.find((row) => row.record.importKey === key)?.action
const validated = validateBulkContactImportPayload(payload, existing, 'contacts.jsonc')

describe('JSONC reading', () => {
  it('removes comments outside strings only', () => {
    const text = '{ // note\n "url": "http://x.example/a//b", /* block */ "n": 1 }'
    expect(JSON.parse(stripJsoncComments(text))).toEqual({ url: 'http://x.example/a//b', n: 1 })
  })

  it('reports a parse failure', () => {
    expect(parseKrImportJsonc('{ bad').ok).toBe(false)
  })
})

describe('row checks and duplicate scores', () => {
  it('stages creates, merge reviews, denials and lead rows', () => {
    expect(actionOf('p1')).toBe('create')
    expect(actionOf('p2')).toBe('merge-review') // email matches an existing contact (0.98)
    expect(actionOf('p3')).toBe('blocked') // no last name
    expect(actionOf('p4')).toBe('merge-review') // same name as row 1 of this file
    expect(actionOf('e1')).toBe('merge-review') // phone matches once the +1 is set aside
    expect(actionOf('t1')).toBe('create')
    expect(actionOf('l1')).toBe('create') // a new person
    expect(actionOf('l2')).toBe('create') // attaches to Ann Example (email 0.98)
    expect(actionOf('l3')).toBe('create') // only matches row p1 of this file: a new person
    expect(actionOf('l4')).toBe('blocked') // unknown source and urgency stay refused
  })

  it('attaches a lead to a close existing individual only, never to a row of the same file', () => {
    const row = (key: string) => validated.rows.find((r) => r.record.importKey === key)!
    expect(leadAttachCandidate(row('l2'))).toMatchObject({ id: 'ind-1', source: 'existing' })
    expect(row('l3').duplicateCandidates.some((candidate) => candidate.source === 'import')).toBe(true)
    expect(leadAttachCandidate(row('l3'))).toBeNull()
    expect(leadAttachCandidate(row('l1'))).toBeNull()
    expect(leadAttachCandidate(row('p1'))).toBeNull() // contact rows never attach
    const l4 = row('l4')
    expect(l4.issues.map((issue) => issue.message).join(' ')).toContain('Unsupported lead source "keywave"')
    expect(l4.issues.map((issue) => issue.message).join(' ')).toContain('Unsupported lead urgency "soon"')
  })

  it('names the evidence and the source of each candidate', () => {
    const p2 = validated.rows.find((row) => row.record.importKey === 'p2')!
    expect(p2.duplicateCandidates[0]).toMatchObject({ id: 'ind-1', score: 0.98, source: 'existing', relatedMatterLabels: ['501.0 General'] })
    const p4 = validated.rows.find((row) => row.record.importKey === 'p4')!
    expect(p4.duplicateCandidates[0]).toMatchObject({ source: 'import', sourceImportKey: 'p1' })
  })

  it('sends approved creates only, the same rows the review counts (oddity 11)', () => {
    expect(contactsToSend(validated.rows).map((row) => row.record.importKey)).toEqual(['p1', 't1', 'l1', 'l2', 'l3'])
  })

  it('says no rows were found for an empty file', () => {
    expect(validateBulkContactImportPayload({}).issues[0]?.message).toBe('No contact, individual, entity, or trust rows were found.')
  })
})

describe('create body', () => {
  it('fits the strict POST /v1/contacts contract for a person, an entity and a trust', () => {
    for (const row of validated.rows.filter((r) => ['p1', 'e1', 't1'].includes(r.record.importKey))) {
      expect(() => ContactCreateBody.parse(contactApiBody(row.record))).not.toThrow()
    }
    const trust = validated.rows.find((row) => row.record.importKey === 't1')!
    expect(contactApiBody(trust.record)).toMatchObject({ kind: 'entity', legalName: 'Dee Family Trust', entitySubtype: 'trust' })
  })
})

describe('lead body', () => {
  const row = (key: string) => validated.rows.find((r) => r.record.importKey === key)!

  it('sends a new person, the source detail once and the source row trace', () => {
    const body = leadApiBody(row('l1').record)
    expect(() => LeadCreateBody.parse(body)).not.toThrow()
    expect(body).toMatchObject({ person: { firstName: 'Lee', lastName: 'Lead' }, source: 'other', sourceDetail: 'KeyWave', status: 'new', urgency: 'normal' })
    expect(body.individualId).toBeUndefined()
    expect(body.inquirySummary).toBe('Source row: kw-17\nAsked about a will.')
    expect(body.inquirySummary).not.toContain('Source detail')
  })

  it('sends the existing individual instead of a person when attached', () => {
    const lead = row('l2')
    const body = leadApiBody(lead.record, leadAttachCandidate(lead)?.id)
    expect(() => LeadCreateBody.parse(body)).not.toThrow()
    expect(body).toMatchObject({ individualId: 'ind-1' })
    expect(body.person).toBeUndefined()
  })
})

describe('first draws', () => {
  const gate = (locked: boolean): MaintenanceGateData => ({ locked, reason: locked ? 'Contact import review' : null, setBy: null, setAt: null, updatedAt: null, installed: true })
  const chooser = (value: MaintenanceGateData | null) =>
    renderToStaticMarkup(<ImportChooser gate={value} gateBusy={null} gateError="" importing={false} referenceStatus="Loaded." onHelp={() => {}} onImportContacts={() => {}} onLock={() => {}} onUnlock={() => {}} />)

  it('shows the gate pill and disables Import Contacts while writes are locked', () => {
    expect(chooser(null)).toContain('Writes: checking...')
    const locked = chooser(gate(true))
    expect(locked).toContain('LOCKED')
    expect(locked).toMatch(/data-kr-action="start-contact-import" disabled=""/)
    expect(chooser(gate(false))).not.toMatch(/data-kr-action="start-contact-import" disabled=""/)
  })

  it('lists the four review groups and counts what will be sent', () => {
    const html = renderToStaticMarkup(<ContactImportReviewBody contactReferenceReady importProgress={null} importing={false} validation={validated} onClose={() => {}} onImportApproved={() => {}} />)
    expect(html).toContain('Approved to create (2)')
    expect(html).toContain('Suggested merge review (3)')
    expect(html).toContain('Denied (2)')
    expect(html).toContain('Leads to create (3)')
    expect(html).toContain('Attaches to existing Ann Example (98% match')
    expect(html).toContain('New person and lead.')
    expect(html).not.toContain('Leads port')
    expect(html).toContain('Import approved contacts and leads (5)')
  })

  it('keeps the help window in line with the code (oddity 14)', () => {
    const html = renderToStaticMarkup(<ContactImportHelpBody onClose={() => {}} />)
    expect(html).toContain("reason = &#x27;Contact import review&#x27;")
    expect(html).not.toContain('ICID')
    expect(html).not.toContain('may continue')
    expect(html).toContain('import while writes are unlocked')
  })

  it('draws the page outside the data store with the unavailable reference line', () => {
    const html = renderToStaticMarkup(<DataImportPage />)
    expect(html).toContain('data-kr-element="firm-settings-data-management-card"')
    expect(html).toContain('Bulk Contact Staging')
    expect(html).toContain('Contact creation is disabled until duplicate-check data loads.')
  })
})

describe('instructions file', () => {
  it('bundles the help document with its header', async () => {
    const text = await loadInstructionsText()
    expect(text.startsWith('# Contact, Entity, Trust, and Lead Import JSONC Instructions')).toBe(true)
    expect(text).toContain('<small>Version 1.1.5</small>')
  })
})
