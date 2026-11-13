// file: apps/web/features/communications/communications.test.tsx
/**
 * Communications / WorkStream (plan 10, stage 2): the slash-command parser, the activity type and context cue detectors,
 * the subject from the first line, the HTML sanitizer, the contact ranking, the save target rules (fixed context,
 * chosen client, Internal 050 / 050.1, blocked Lead), the entry mapping, the paging sentence (D10), and first draws
 * rendered to text of the panel, the thread, the composer and the attribution panel.
 *
 * Run: pnpm --dir apps/web exec vitest run features/communications/communications.test.tsx
 */

import type { ClientMattersData, Matter, WorkstreamActivity } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { KRContactRecord } from '@/features/contacts/types'
import { detectCommunicationActivityTypeTrigger } from './communicationActivityTypeTriggers'
import { detectCommunicationContextCue } from './communicationContextTriggers'
import { resolveCommunicationSaveTarget, saveTargetBlockReason, type CommunicationSaveTargetInput } from './communicationSaveTarget'
import { communicationEntryFromActivity, communicationInitials, communicationUserFromViewer, parseWorkstreamSlashCommands, sanitizeWorkstreamNoteHtml, subjectFromBody, subjectIsDistinct } from './communicationTypes'
import CommunicationAttributionPanel from './components/CommunicationAttributionPanel.client'
import CommunicationComposer from './components/CommunicationComposer.client'
import CommunicationsPanel from './components/CommunicationsPanel.client'
import CommunicationThread, { threadPagingSentence } from './components/CommunicationThread.client'
import { contextCandidateInsertText, findInternalClientContact, rankContacts } from './workStreamContacts'

const contact = (id: string, displayName: string, extra: Partial<KRContactRecord> = {}): KRContactRecord => ({
  id,
  kind: 'individual',
  typeLabel: 'Individual',
  displayName,
  titlePrefix: null,
  firstName: null,
  middleName: null,
  lastName: null,
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

const CONTACTS = [
  contact('c1', 'Ann Example', { isClient: true, clientId: 'cl-306', clientNumber: '306', phone: '555-0100' }),
  contact('c2', 'Annette Other', { isClient: true, clientId: 'cl-410', clientNumber: '410' }),
  contact('c3', 'Annie Prospect'),
  contact('c4', 'KR Firm', { isClient: true, clientId: 'cl-050', clientNumber: '050' }),
]

const matter = (id: string, matterNumber: string): Matter => ({
  id,
  matterNumber,
  title: matterNumber.endsWith('.0') ? 'Client General Matters' : 'Internal',
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

const internalMatters = async (clientId: string): Promise<ClientMattersData> => ({
  clientId,
  clientNumber: '050',
  matters: [matter('m-050-0', '050.0'), matter('m-050-1', '050.1')],
  statuses: [],
  practiceAreas: [],
  viewer: { canWrite: true, canDelete: false },
})

const activity = (extra: Partial<WorkstreamActivity> = {}): WorkstreamActivity => ({
  id: 'wsa_1',
  wsid: 'AB12CD3',
  subgroup: 'PhoneCalls',
  clientId: 'cl-306',
  clientNumber: '306',
  clientDisplayName: 'Ann Example',
  leadId: null,
  lcid: null,
  matterId: 'm-306-0',
  matterNumber: '306.0',
  matterTitle: 'Client General Matters',
  activityAt: '2026-11-13T15:30:00.000Z',
  title: 'Called about the estimate',
  note: 'Called about the estimate\nShe will call back.',
  noteHtml: null,
  nextSteps: [],
  documentRecordId: null,
  documentUrl: null,
  documentLabel: null,
  taskId: null,
  assigneeUserId: null,
  assigneeContactId: null,
  assigneeLabel: null,
  performedByUserId: 'u-dan',
  performedByLabel: 'Dan Krueger',
  createdAt: '2026-11-13T15:30:00.000Z',
  updatedAt: null,
  ...extra,
})

const VIEWER = { userId: 'u-dan', displayName: 'Dan Dan Krueger', email: 'dan@example.com', role: 'super_admin' }

describe('slash commands and subjects', () => {
  it('reads /sub:, then one activity command, and leaves the rest as the body', () => {
    expect(parseWorkstreamSlashCommands('/sub: [Estimate call] /pc Called Ann', 'Notes')).toEqual({ body: 'Called Ann', activityType: 'PhoneCalls', activityCommand: 'pc', subject: 'Estimate call' })
    expect(parseWorkstreamSlashCommands('/sub: Plain subject\n/email Sent the draft', 'Notes').subject).toBe('Plain subject')
    expect(parseWorkstreamSlashCommands('/n Note text', 'PhoneCalls').activityType).toBe('Notes')
    expect(parseWorkstreamSlashCommands('/t follow up', 'PhoneCalls').activityType).toBe('Tasks')
    expect(parseWorkstreamSlashCommands('/received scans', 'PhoneCalls').activityType).toBe('ReceivedFiles')
    expect(parseWorkstreamSlashCommands('/sent copies', 'PhoneCalls').activityType).toBe('SentFiles')
    expect(parseWorkstreamSlashCommands('/wip drafting', 'PhoneCalls').activityType).toBe('WIP')
    expect(parseWorkstreamSlashCommands('/phonecall x', 'Notes').activityType).toBe('PhoneCalls')
    expect(parseWorkstreamSlashCommands('  no command here ', 'Emails')).toEqual({ body: 'no command here', activityType: 'Emails', activityCommand: null, subject: null })
    // A command must be followed by a word boundary: "/notes" is not "/note".
    expect(parseWorkstreamSlashCommands('/notes later', 'Emails').activityCommand).toBeNull()
  })

  it('takes the subject from /sub:, else the first line (spaces folded, 160 characters), else the type label', () => {
    expect(subjectFromBody('First   line here\nsecond', 'Notes')).toBe('First line here')
    expect(subjectFromBody('x'.repeat(200), 'Notes')).toHaveLength(160)
    expect(subjectFromBody('', 'PhoneCalls')).toBe('Phone Call communication')
    expect(subjectFromBody('body', 'Notes', 'Chosen')).toBe('Chosen')
    expect(subjectIsDistinct({ subject: 'Called about the estimate', body: 'Called about the estimate\nmore' })).toBe(false)
    expect(subjectIsDistinct({ subject: 'Estimate call', body: 'Called Ann' })).toBe(true)
  })
})

describe('cue detectors', () => {
  it('selects activity types from natural words and slash shortcuts', () => {
    expect(detectCommunicationActivityTypeTrigger('/pc with Ann')?.activityType).toBe('PhoneCalls')
    expect(detectCommunicationActivityTypeTrigger('Ann phoned in')?.activityType).toBe('PhoneCalls')
    expect(detectCommunicationActivityTypeTrigger('sent an email')?.activityType).toBe('Emails')
    expect(detectCommunicationActivityTypeTrigger('note in file: x')?.activityType).toBe('Notes')
    expect(detectCommunicationActivityTypeTrigger('todo: deed')?.activityType).toBe('Tasks')
    expect(detectCommunicationActivityTypeTrigger('received docs today')?.activityType).toBe('ReceivedFiles')
    expect(detectCommunicationActivityTypeTrigger('sent file to Ann')?.activityType).toBe('SentFiles')
    expect(detectCommunicationActivityTypeTrigger('status update for the file')?.activityType).toBe('WIP')
    // WIP as a bare word waits for the following space.
    expect(detectCommunicationActivityTypeTrigger('wip')).toBeNull()
    expect(detectCommunicationActivityTypeTrigger('wip ')?.activityType).toBe('WIP')
    expect(detectCommunicationActivityTypeTrigger('recall the hearing')).toBeNull()
  })

  it('recognizes client, lead and phone-call-from cues, the latest one winning', () => {
    expect(detectCommunicationContextCue('Called /c306')).toEqual({ kind: 'client', label: 'Client', prefix: '/c306', query: '306', referenceNumber: '306' })
    expect(detectCommunicationContextCue('/c306 then more words')).toBeNull()
    expect(detectCommunicationContextCue('Client: Ann Ex')).toMatchObject({ kind: 'client', prefix: 'Client:', query: 'Ann Ex' })
    expect(detectCommunicationContextCue('Lead - Bob')).toMatchObject({ kind: 'lead', query: 'Bob' })
    expect(detectCommunicationContextCue('Phone call from Annie')).toMatchObject({ kind: 'phone-call-from', query: 'Annie' })
    expect(detectCommunicationContextCue('nothing to see')).toBeNull()
  })

  it('ranks contacts for a cue and builds the inserted text', () => {
    const byNumber = rankContacts(detectCommunicationContextCue('/c306')!, CONTACTS)
    expect(byNumber[0]?.id).toBe('c1')
    // A client cue keeps clients only; a phone-call-from cue searches everyone.
    expect(rankContacts(detectCommunicationContextCue('Client: Ann')!, CONTACTS).map((entry) => entry.id)).toEqual(['c1', 'c2'])
    expect(rankContacts(detectCommunicationContextCue('Phone call from Annie')!, CONTACTS).map((entry) => entry.id)).toEqual(['c3'])
    expect(rankContacts(detectCommunicationContextCue('Lead: Ann')!, CONTACTS)).toEqual([])
    expect(contextCandidateInsertText(CONTACTS[0]!)).toBe('306 Ann Example · 555-0100')
    expect(findInternalClientContact(CONTACTS)?.clientId).toBe('cl-050')
  })
})

describe('HTML sanitizer', () => {
  it('removes scripts, styles, frames, form controls, event handlers and unsafe links, and keeps formatting', () => {
    const dirty = '<p onclick="x()" style="color:red">Hi <b>there</b><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><input value="a"><a href="javascript:alert(1)">bad</a> <a href="https://example.com">ok</a></p>'
    const clean = sanitizeWorkstreamNoteHtml(dirty)
    expect(clean).not.toMatch(/script|style=|onclick|<iframe|<input|javascript:/i)
    expect(clean).toContain('<b>there</b>')
    expect(clean).toContain('href="https://example.com"')
    expect(sanitizeWorkstreamNoteHtml('<img src="data:text/html,x">')).not.toMatch(/data:/i)
  })
})

describe('save target', () => {
  const base: CommunicationSaveTargetInput = { context: null, clientState: 'Internal', composerOwner: null, composerMatterId: null, contacts: CONTACTS }

  it('saves Internal entries to client 050, matter 050.1', async () => {
    expect(saveTargetBlockReason(base)).toBeNull()
    await expect(resolveCommunicationSaveTarget(base, internalMatters)).resolves.toMatchObject({ clientId: 'cl-050', matterId: 'm-050-1' })
    await expect(resolveCommunicationSaveTarget({ ...base, contacts: [] }, internalMatters)).rejects.toThrow(/050/)
  })

  it('uses the chosen client and matter, or no matter so the API picks .0 (D12)', async () => {
    const owner = { clientId: 'cl-306', clientNumber: '306', displayName: 'Ann Example' }
    await expect(resolveCommunicationSaveTarget({ ...base, clientState: 'Client', composerOwner: owner }, internalMatters)).resolves.toEqual({ clientId: 'cl-306', label: 'Client 306' })
    await expect(resolveCommunicationSaveTarget({ ...base, clientState: 'Client', composerOwner: owner, composerMatterId: 'm-306-2' }, internalMatters)).resolves.toMatchObject({ matterId: 'm-306-2' })
  })

  it('blocks Client without a client and Lead without a fixed lead, and lets a fixed context win', async () => {
    expect(saveTargetBlockReason({ ...base, clientState: 'Client' })).toMatch(/Choose a client/)
    expect(saveTargetBlockReason({ ...base, clientState: 'Lead' })).toMatch(/lead/)
    await expect(resolveCommunicationSaveTarget({ ...base, clientState: 'Lead' }, internalMatters)).rejects.toThrow(/lead/)
    await expect(resolveCommunicationSaveTarget({ ...base, context: { leadId: 'ld-1' }, clientState: 'Lead' }, internalMatters)).resolves.toMatchObject({ leadId: 'ld-1' })
    await expect(resolveCommunicationSaveTarget({ ...base, context: { clientId: 'cl-9', matterId: 'm-9-1' } }, internalMatters)).resolves.toMatchObject({ clientId: 'cl-9', matterId: 'm-9-1' })
  })
})

describe('entries and paging', () => {
  it('names the viewer once, and maps an API entry with its owner, author and linked document', () => {
    const me = communicationUserFromViewer(VIEWER)
    expect(me).toMatchObject({ name: 'Dan Krueger', initials: 'DK', avatarTone: 'teal' })
    expect(communicationInitials('', 'jo@example.com')).toBe('JO')
    const mine = communicationEntryFromActivity(activity(), me)
    expect(mine.author).toBe(me)
    expect(mine.sourceLabel).toBe('Matter 306.0 · Ann Example')
    const theirs = communicationEntryFromActivity(activity({ performedByUserId: 'u-x', performedByLabel: 'Pat Staff', documentUrl: 'https://example.com/d', documentLabel: 'Deed', subgroup: 'Tasks', assigneeLabel: 'Pat Staff' }), me)
    expect(theirs.author).toMatchObject({ name: 'Pat Staff', initials: 'PS', avatarTone: 'blue' })
    expect(theirs.attachments).toEqual([{ label: 'Deed', url: 'https://example.com/d' }])
    expect(theirs.assigneeLabel).toBe('Pat Staff')
    expect(communicationEntryFromActivity(activity({ clientId: null, clientNumber: null, clientDisplayName: null, matterId: null, matterNumber: null, leadId: 'ld-1', lcid: 'L421' }), me).sourceLabel).toBe('Lead L421')
  })

  it('says when older entries exist (D10)', () => {
    expect(threadPagingSentence(50, true)).toBe('Showing 50 entries; older entries are available.')
    expect(threadPagingSentence(1, false)).toBe('Showing all 1 entry.')
    expect(threadPagingSentence(0, false)).toBe('')
  })
})

describe('first draws', () => {
  const me = communicationUserFromViewer(VIEWER)

  it('draws the panel with the filters, the composer above the thread and the attribution panel, without a data store', () => {
    const html = renderToStaticMarkup(<CommunicationsPanel viewer={VIEWER} />)
    expect(html).toContain('data-kr-id="communications-module-panel"')
    expect(html).toContain('data-kr-id="Workstream-Activity-Filters"')
    expect(html.indexOf('communication-composer-card')).toBeLessThan(html.indexOf('communication-thread-card'))
    expect(html).toContain('Firm WorkStream feed')
    expect(html).toContain('Loading communications...')
    expect(html).toContain('data-kr-id="communication-attribution-panel"')
    // Internal is the starting state; no text glyph icons are drawn.
    expect(html).toMatch(/aria-pressed="true"[^>]*data-kr-client-state="Internal"/)
    expect(html).not.toMatch(/[☎✉▤✓⇩⇧◌↩⋮×]/)
  })

  it('draws the thread newest first with the paging footer and Load older entries', () => {
    const entries = [
      communicationEntryFromActivity(activity({ wsid: 'NEWEST1', title: 'Estimate call', note: 'Called Ann', activityAt: '2026-11-13T16:00:00.000Z' }), me),
      communicationEntryFromActivity(activity({ wsid: 'OLDER01' }), me),
    ]
    const html = renderToStaticMarkup(<CommunicationThread collapsedView={false} contextLabel="Client 306" hasOlder messages={entries} onSelectMessage={() => {}} selectedWsid="NEWEST1" />)
    expect(html.indexOf('NEWEST1')).toBeLessThan(html.indexOf('OLDER01'))
    expect(html).toContain('Newest first · 2 entries shown')
    expect(html).toContain('Showing 2 entries; older entries are available.')
    expect(html).toContain('Load older entries')
    // The distinct subject is shown; the subject equal to the first line is not repeated.
    expect(html).toContain('Estimate call')
    expect(html.match(/Called about the estimate/g)).toHaveLength(1)
  })

  it('draws stored HTML sanitized, and the collapsed view as one line', () => {
    const entry = communicationEntryFromActivity(activity({ noteHtml: '<b>Bold</b><script>alert(1)</script>', note: 'Bold' }), me)
    const html = renderToStaticMarkup(<CommunicationThread collapsedView={false} messages={[entry]} onSelectMessage={() => {}} selectedWsid={null} />)
    expect(html).toContain('<b>Bold</b>')
    expect(html).not.toContain('<script>')
    expect(renderToStaticMarkup(<CommunicationThread collapsedView messages={[entry]} onSelectMessage={() => {}} selectedWsid={null} />)).toContain('data-kr-collapsed-expanded="false"')
    expect(renderToStaticMarkup(<CommunicationThread collapsedView={false} messages={[]} onSelectMessage={() => {}} selectedWsid={null} />)).toContain('No communications are recorded for this context yet.')
  })

  it('draws the composer with the Log as buttons, the Client label, the parser line and the help buttons', () => {
    const html = renderToStaticMarkup(
      <CommunicationComposer activityTypes={['PhoneCalls', 'Tasks']} clientButtonLabel="Cnt:306" clientState="Client" contacts={CONTACTS} currentUser={me} onActivityTypesChange={() => {}} onClientStateChange={() => {}} onSubmit={async () => {}} selectedMatterNumber="306.2" statusMessage="2 communications loaded for Client 306." />,
    )
    expect(html).toContain('Log as one or more')
    expect(html).toContain('New <strong')
    expect(html).toContain('phone call + task</strong> entry')
    expect(html).toContain('Cnt:306')
    expect(html).toContain('Matter:306.2')
    expect(html).toContain('Assignees: 1')
    expect(html).toContain('Parser:')
    expect(html).toContain('HELP')
    expect(html).toContain('data-kr-element="communications-composer-input"')
  })

  it('draws the attribution panel waiting, then coming soon for a selected entry', () => {
    expect(renderToStaticMarkup(<CommunicationAttributionPanel message={null} />)).toContain('Awaiting selection')
    const html = renderToStaticMarkup(<CommunicationAttributionPanel message={communicationEntryFromActivity(activity(), me)} />)
    expect(html).toContain('Coming soon')
    expect(html).toContain('AB12CD3')
  })
})
