// file: apps/web/features/communications/clientWorkstream.test.tsx
/**
 * The client WorkStream tab (plan 10, stage 4): the ledger row helpers (labels, the entry's own matter, the `.0` for
 * an older entry, the context line, merging a saved entry, the title from the note, next steps), and first draws
 * rendered to text of the ledger (rows, the paging line, empty, loading, failure), a row in both presentations, the
 * detail card and the Add activity dialog. Made-up entries only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/communications/clientWorkstream.test.tsx
 */

import type { Matter, WorkstreamActivity } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import WorkstreamActivityAddDialog from './components/WorkstreamActivityAddDialog.client'
import WorkstreamActivityCards from './components/WorkstreamActivityCards.client'
import WorkstreamActivityLedger, { type WorkstreamActivityLedgerProps } from './components/WorkstreamActivityLedger.client'
import WorkstreamSummaryCard from './components/WorkstreamSummaryCard.client'
import { generalMatterNumber, ledgerContextLine, ledgerRowFromActivity, mergeSavedActivity, nextStepsFromText, titleFromNote } from './workstreamLedgerRows'

const activity = (extra: Partial<WorkstreamActivity> = {}): WorkstreamActivity => ({
  id: 'wsa_1',
  wsid: 'AB12CD3',
  subgroup: 'Notes',
  clientId: 'cl-306',
  clientNumber: '306',
  clientDisplayName: 'Ann Example',
  leadId: null,
  lcid: null,
  matterId: 'm-306-1',
  matterNumber: '306.1',
  matterTitle: 'Estate plan',
  activityAt: '2026-11-13T15:30:00.000Z',
  title: 'Signed the engagement letter',
  note: 'Signed the engagement letter\nScanned to the file.',
  noteHtml: null,
  nextSteps: ['Send the intake form'],
  documentRecordId: null,
  documentUrl: null,
  documentLabel: null,
  taskId: null,
  assigneeUserId: 'u-dan',
  assigneeContactId: null,
  assigneeLabel: 'DK - Dan Krueger',
  performedByUserId: 'u-dan',
  performedByLabel: 'Dan Krueger',
  createdAt: '2026-11-13T15:30:00.000Z',
  updatedAt: null,
  ...extra,
})

const matter = (id: string, matterNumber: string, title: string): Matter => ({
  id,
  matterNumber,
  title,
  description: null,
  isGeneralMatter: matterNumber.endsWith('.0'),
  practiceAreaLookupId: 'lk_practice_area_miscellaneous',
  practiceAreaLabel: 'Miscellaneous',
  statusLookupId: 'lk_matter_status_open',
  statusLabel: 'Open',
  openedDate: null,
  closedDate: null,
  primaryAttorneyUserId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: null,
})

const noop = () => undefined

function ledgerProps(extra: Partial<WorkstreamActivityLedgerProps> = {}): WorkstreamActivityLedgerProps {
  const rows = [ledgerRowFromActivity(activity(), '306'), ledgerRowFromActivity(activity({ wsid: 'EF45GH6', subgroup: 'PhoneCalls', title: 'Called the bank', matterId: null, matterNumber: null, matterTitle: null }), '306')]
  return {
    title: 'Client 306 WorkStream',
    subtitle: 'Client-level history for work, communications, documents, notes, and tasks.',
    contextLabel: 'Client 306 · Matter 306.0 · Matter 306.1',
    rows,
    filter: 'all',
    onFilterChange: noop,
    selectedId: null,
    onSelect: noop,
    presentation: 'SingleLine',
    onPresentationChange: noop,
    presentationOverrides: {},
    onToggleRow: noop,
    loading: false,
    error: null,
    onRetry: noop,
    hasMore: false,
    loadingMore: false,
    onLoadMore: noop,
    onAdd: noop,
    onEmail: noop,
    renderDetail: (row) => <p>Detail of {row.id}</p>,
    ...extra,
  }
}

describe('ledger rows', () => {
  it('uses the old labels, the entry\'s own matter, and the client\'s .0 for an older entry without one', () => {
    const row = ledgerRowFromActivity(activity(), '306')
    expect(row).toMatchObject({ id: 'AB12CD3', kindLabel: 'Note', matterNumber: '306.1', actorLabel: 'DK - Dan Krueger', summary: 'Signed the engagement letter Scanned to the file.' })
    expect(ledgerRowFromActivity(activity({ matterNumber: null, clientNumber: null }), '306').matterNumber).toBe('306.0')
    expect(ledgerRowFromActivity(activity({ note: '  ', assigneeLabel: null }), '306')).toMatchObject({ summary: 'No note entered.', actorLabel: 'Dan Krueger' })
    expect(ledgerContextLine(row)).toBe('Client 306 · Matter 306.1 · Note · WSID AB12CD3')
    expect([generalMatterNumber(' 501 '), generalMatterNumber(null)]).toEqual(['501.0', null])
  })

  it('replaces a saved entry in place, puts a new one first, and drops one moved to another client', () => {
    const list = [activity({ wsid: 'A000001' }), activity({ wsid: 'A000002' })]
    expect(mergeSavedActivity(list, activity({ wsid: 'A000002', title: 'Changed' }), 'cl-306').map((entry) => entry.title)).toEqual(['Signed the engagement letter', 'Changed'])
    expect(mergeSavedActivity(list, activity({ wsid: 'NEW0001' }), 'cl-306').map((entry) => entry.wsid)).toEqual(['NEW0001', 'A000001', 'A000002'])
    expect(mergeSavedActivity(list, activity({ wsid: 'A000001', clientId: 'cl-501' }), 'cl-306').map((entry) => entry.wsid)).toEqual(['A000002'])
  })

  it('takes the first line as the title (160 characters) and one next step per line', () => {
    expect(titleFromNote('  First   line\nsecond')).toBe('First line')
    expect(titleFromNote('x'.repeat(200))).toHaveLength(160)
    expect(nextStepsFromText(' a \n\n b ')).toEqual(['a', 'b'])
  })
})

describe('client WorkStream ledger', () => {
  it('draws the header, the filters, the actions, the rows and the first row\'s detail', () => {
    const html = renderToStaticMarkup(<WorkstreamActivityLedger {...ledgerProps()} />)
    expect(html).toContain('data-kr-id="kr-workstream-activity-ledger"')
    expect(html).toContain('Client 306 WorkStream')
    expect(html).toContain('>All activity</button>')
    expect(html).toContain('>Work in progress</button>')
    expect(html).toContain('+ AddActivity')
    expect(html).toContain('data-kr-element="workstream-email"')
    expect(html).toContain('aria-label="2 visible activities"')
    expect(html).toContain('Called the bank')
    expect(html).toContain('306.0')
    expect(html).toContain('Detail of AB12CD3')
    expect(html).not.toContain('older entries exist')
  })

  it('says when older entries exist, and shows empty, loading and failed lists', () => {
    expect(renderToStaticMarkup(<WorkstreamActivityLedger {...ledgerProps({ hasMore: true })} />)).toContain('Showing the newest 2; older entries exist.')
    expect(renderToStaticMarkup(<WorkstreamActivityLedger {...ledgerProps({ rows: [] })} />)).toContain('No Workstream activity matches this filter.')
    expect(renderToStaticMarkup(<WorkstreamActivityLedger {...ledgerProps({ loading: true })} />)).toContain('Loading WorkStream...')
    const failed = renderToStaticMarkup(<WorkstreamActivityLedger {...ledgerProps({ error: 'WorkStream cannot be read or saved right now.' })} />)
    expect(failed).toContain('WorkStream cannot be read or saved right now.')
    expect(failed).toContain('Try again')
    expect(renderToStaticMarkup(<WorkstreamActivityLedger {...ledgerProps({ onAdd: undefined, onEmail: undefined })} />)).not.toContain('+ AddActivity')
  })

  it('draws a row single line or expanded', () => {
    const row = ledgerRowFromActivity(activity(), '306')
    const single = renderToStaticMarkup(<WorkstreamActivityCards presentation="SingleLine" row={row} onSelect={noop} onTogglePresentation={noop} />)
    expect(single).toContain('data-kr-presentation="SingleLine"')
    expect(single).toContain('aria-label="Expand Signed the engagement letter"')
    expect(single).not.toContain('Scanned to the file.</span>')
    const expanded = renderToStaticMarkup(<WorkstreamActivityCards presentation="Expanded" row={row} selected onSelect={noop} onTogglePresentation={noop} />)
    expect(expanded).toContain('aria-label="Collapse Signed the engagement letter"')
    expect(expanded).toContain('aria-pressed="true"')
  })

  it('draws the detail card with the matter, next steps and who recorded it', () => {
    const html = renderToStaticMarkup(
      <WorkstreamSummaryCard assigneeOptions={[]} canDelete contacts={[]} row={ledgerRowFromActivity(activity(), '306')} onDelete={async () => undefined} onReassigned={noop} onUpdate={async () => undefined} />,
    )
    expect(html).toContain('data-kr-element="workstream-summary-card"')
    expect(html).toContain('306.1 · Estate plan')
    expect(html).toContain('<li>Send the intake form</li>')
    expect(html).toContain('by Dan Krueger')
    expect(html).toContain('Open full view')
    expect(html).toContain('Edit note')
  })

  it('draws Add activity with the client\'s matters, the default assignee and Other', () => {
    const html = renderToStaticMarkup(
      <WorkstreamActivityAddDialog
        assigneeOptions={[{ id: 'u-sam', label: 'SS - Sam Staff' }]}
        currentUserId="u-dan"
        currentUserLabel="Dan Krueger"
        defaultMatterId="m-306-0"
        inline
        matters={[matter('m-306-0', '306.0', 'Client General Matters'), matter('m-306-1', '306.1', 'Estate plan')]}
        onCancel={noop}
        onSave={async () => undefined}
      />,
    )
    expect(html).toContain('data-kr-element="workstream-add-activity-dialog"')
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
    expect(html).toContain('306.1 · Estate plan')
    expect(html).toContain('Dan Krueger (default)')
    expect(html).toContain('SS - Sam Staff')
    expect(html).toContain('>Other</option>')
    expect(html).toContain('Save activity')
  })
})
