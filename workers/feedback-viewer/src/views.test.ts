// file: workers/feedback-viewer/src/views.test.ts
// The screens: values are escaped, Save Changes names what it will change, read-only people see no forms, pills and arrows.
import { describe, expect, it } from 'vitest'
import type { FeedbackAll } from './feedbackApi.ts'
import { copyForClaudeText, type FeedbackDetail } from './feedbackTypes.ts'
import { completionNote, detailView, draftChangeWords, escapeHtml, isDraftDirty, leaveDialogHtml, listView } from './views.ts'

describe('completionNote', () => {
  it('ends the note with who marked the request complete, on a line of its own', () => {
    expect(completionNote('  Fixed in web 569.  ', 'Dan Krueger')).toBe('Fixed in web 569.\n\nFB Marked complete by Dan Krueger')
    expect(completionNote('   ', ' Dan Krueger ')).toBe('FB Marked complete by Dan Krueger')
    expect(completionNote('', '')).toBe('FB Marked complete')
  })

  it('stays within the note limit by shortening the typed note, never the line', () => {
    const note = completionNote('x'.repeat(10_000), 'Dan Krueger')
    expect(note.length).toBeLessThanOrEqual(10_000)
    expect(note.endsWith('\n\nFB Marked complete by Dan Krueger')).toBe(true)
  })
})

const detail: FeedbackDetail = {
  number: 12,
  code: 'FB-0012',
  kind: 'issue',
  title: 'Save <button> does nothing',
  status: 'new',
  priority: 'normal',
  submittedByUserId: 'u1',
  submittedByLabel: 'Pat "P" Doe',
  sectionId: 'contacts',
  markerCount: 1,
  noteCount: 1,
  createdAt: '2026-11-14T09:30:12.000Z',
  updatedAt: null,
  body: '<script>alert(1)</script>\nSecond line',
  submitterRole: 'staff',
  context: {
    pageAddress: 'https://krhomebase.com/contacts',
    sectionId: 'contacts',
    openItem: null,
    pageTitle: 'Contacts',
    webVersion: '1.2.3',
    deploymentId: null,
    deploymentTime: null,
    windowWidth: 1280,
    windowHeight: 800,
    theme: 'light',
  },
  markers: [{ attribute: 'data-kr-element', value: 'save', pattern: 'data-kr-element="save"', foundAtCapture: true, box: { x: 1.4, y: 2, width: 30, height: 10 } }],
  images: [],
  notes: [{ id: 'n1', noteType: 'status_change', text: null, fromValue: 'new', toValue: 'triaged', authorUserId: 'u2', authorLabel: 'Dev', createdAt: '2026-11-14T10:00:00Z' }],
}

const list: FeedbackAll = { items: [detail], viewer: { userId: 'u2', isDeveloper: true, canTriage: true } }
/** A request of the given number, status and priority, for the two tables. */
const row = (number: number, status: FeedbackDetail['status'], priority: FeedbackDetail['priority'] = 'normal') => ({
  ...detail,
  number,
  code: `FB-${String(number).padStart(4, '0')}`,
  title: `Request ${number}`,
  status,
  priority,
})

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
  })
})

describe('listView', () => {
  it('shows the rows escaped and links to each request', () => {
    const html = listView(list, {})
    expect(html).toContain('href="#/FB-0012"')
    expect(html).toContain('Save &lt;button&gt; does nothing')
    expect(html).toContain('Pat &quot;P&quot; Doe')
    expect(html).not.toContain('<button> does')
    expect(html).toContain('<tr data-fb-tone="navy">')
  })

  it('puts open requests on top and Completed and Will not do below, each keeping ten rows of space', () => {
    const html = listView({ ...list, items: [row(1, 'done'), row(2, 'new'), row(3, 'will_not_do'), row(4, 'planned', 'urgent')] }, {})
    const open = html.slice(html.indexOf('feedback-viewer-open-table'), html.indexOf('feedback-viewer-completed-table'))
    const completed = html.slice(html.indexOf('feedback-viewer-completed-table'))
    // Open Items: P1 first, then the rest; Completed Items: newest number first.
    expect(open.indexOf('FB-0004')).toBeLessThan(open.indexOf('FB-0002'))
    expect(open).not.toContain('FB-0001')
    expect(completed.indexOf('FB-0003')).toBeLessThan(completed.indexOf('FB-0001'))
    expect(completed).toContain('>Completed</span>')
    expect(open.match(/class="filler"/g)?.length).toBe(8)
    expect(html).toContain('<table data-kr-element="feedback-viewer-list">')
    expect(html).toContain('<table data-kr-element="feedback-viewer-completed-list">')
    expect(html).not.toContain('name="status"')
  })

  it('marks a developer\'s request with the orange D, left of From', () => {
    const html = listView({ ...list, items: [{ ...detail, submittedByDeveloper: true }] }, {})
    expect(html).toContain('<td class="dev"><span class="dev-badge" title="Sent by a developer">D</span></td>\n<td>Pat &quot;P&quot; Doe</td>')
    expect(html).toMatch(/<th class="sortable sorted dev" aria-sort="ascending"><a class="sort" href="#\/\?open=developer-desc-10-1" title="Sent by a developer\. Sorted developers first\. Sort developers last"/)
  })

  it('sorts from the Number, Status and Priority headings and pages with the rows choice', () => {
    const items = Array.from({ length: 12 }, (_, i) => row(i + 1, 'new'))
    const html = listView({ ...list, items }, {})
    // D sorts the open table now (developers first): its link reverses it; Priority starts P1 first.
    expect(html).toContain('aria-sort="ascending"><a class="sort" href="#/?open=developer-desc-10-1"')
    expect(html).toContain('href="#/?open=priority-asc-10-1"')
    expect(html).toContain('href="#/?open=status-asc-10-1"')
    expect(html).toContain('href="#/?completed=number-asc-10-1"')
    expect(html).toContain('1–10 of 12')
    expect(html).toContain('href="#/?open=developer-asc-10-2" rel="next"')
    const second = listView({ ...list, items }, { open: { sort: 'developer', direction: 'asc', size: 10, page: 2 } })
    expect(second).toContain('11–12 of 12')
    expect(second).toContain('<option value="25">25</option>')
  })

  it('says when the person may only read', () => {
    expect(listView({ ...list, viewer: { ...list.viewer, canTriage: false } }, {})).toContain('may read requests but not change them')
  })
})

describe('detailView', () => {
  it('shows the request text as text, the markers, notes and the Copy for Claude words', () => {
    const html = detailView(detail, { canTriage: true, listFilter: {} })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('data-kr-element=&quot;save&quot;')
    expect(html).toContain('Status New to Triaged.')
    expect(html).toContain(`value="${copyForClaudeText(12)}"`)
    expect(copyForClaudeText(12)).toBe('plan FB-0012')
    expect(html).toContain('data-action="change"')
    expect(html).not.toContain('data-action="note"')
  })

  it('keeps one change form whose Save Changes names what it will change', () => {
    const html = detailView(detail, { canTriage: true, listFilter: {} })
    expect(html).toContain('Save Changes')
    expect(html).not.toContain('Review change')
    expect(html).not.toContain('data-action="note"')
    const draft = { status: 'planned' as const, priority: 'high' as const, note: 'Next week' }
    expect(isDraftDirty(detail, draft)).toBe(true)
    expect(draftChangeWords(detail, draft)).toBe('Status New → Planned, Priority P3 Normal → P2 High, with the note')
    expect(draftChangeWords(detail, { status: 'new', priority: 'normal', note: 'Only a note' })).toBe('Add the note')
  })

  it('offers Save and Mark Complete while the request is open, and not once it is Completed or Will not do (FB-0013)', () => {
    const html = detailView(detail, { canTriage: true, listFilter: {} })
    expect(html).toContain('data-kr-element="feedback-viewer-save-complete"')
    expect(html).toContain('name="intent" value="complete"')
    expect(html).toContain('Save and Mark Complete')
    expect(detailView({ ...detail, status: 'done' }, { canTriage: true, listFilter: {} })).not.toContain('Save and Mark Complete')
    expect(detailView({ ...detail, status: 'will_not_do' }, { canTriage: true, listFilter: {} })).not.toContain('Save and Mark Complete')
    expect(detailView(detail, { canTriage: false, listFilter: {} })).not.toContain('Save and Mark Complete')
  })

  // Tool 1.8.0 (the requester, Nov 23, 2026): the kind can be corrected on the same form.
  it('offers the kind on the change form and names a kind change beside Save Changes', () => {
    const html = detailView(detail, { canTriage: true, listFilter: {} })
    expect(html).toContain('data-kr-element="feedback-viewer-kind"')
    expect(html).toContain('<option value="usability"')
    const draft = { status: detail.status, priority: detail.priority, kind: 'usability' as const, note: '' }
    expect(isDraftDirty(detail, draft)).toBe(true)
    expect(draftChangeWords(detail, draft)).toBe('Kind Bug → Usability')
    expect(isDraftDirty(detail, { ...draft, kind: detail.kind })).toBe(false)
  })

  it('is clean again when the values are set back', () => {
    expect(isDraftDirty(detail, { status: 'new', priority: 'normal', note: '  ' })).toBe(false)
  })

  it('shows the kind, status and priority as colored pills, and the arrows to the neighbors', () => {
    const html = detailView(detail, { canTriage: true, listFilter: {}, neighbors: { previous: 'FB-0013', next: undefined } })
    expect(html).toContain('<span class="pill" data-fb-tone="brick">Bug</span>')
    expect(html).toContain('<span class="pill" data-fb-tone="navy">New</span>')
    expect(html).toContain('<span class="pill" data-fb-tone="slate">P3 Normal</span>')
    expect(html).toContain('href="#/FB-0013" rel="prev"')
    expect(html).toContain('class="nav-arrow off"')
  })

  it('colors each status and priority choice in the open list', () => {
    const html = detailView(detail, { canTriage: true, listFilter: {} })
    expect(html).toContain('<option value="done" data-fb-tone="green">Completed</option>')
    expect(html).toContain('<option value="urgent" data-fb-tone="brickSolid">P1 Urgent</option>')
    expect(html).toContain('<option value="new" data-fb-tone="navy" selected>New</option>')
  })

  it('draws its own Leave or Stay dialog', () => {
    const html = leaveDialogHtml('FB-0012')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Leave without saving?')
    expect(html).toContain('data-dialog="stay"')
    expect(html).toContain('data-dialog="leave"')
  })

  it('has no forms for a person who may only read', () => {
    const html = detailView(detail, { canTriage: false, listFilter: {} })
    expect(html).not.toContain('data-action="change"')
    expect(html).not.toContain('data-action="note"')
    expect(html).toContain('data-action="copy"')
  })
})

describe('screenshots', () => {
  const image = {
    id: 'hfi_1',
    r2Key: 'feedback/FB-0012/hfi_00000000-0000-4000-8000-000000000000.png',
    contentType: 'image/png',
    byteSize: 20480,
    width: 1280,
    height: 720,
    createdAt: '2026-11-14T09:31:00.000Z',
    markerMapCount: 40,
    ticket: { value: '1900000000.abc_DEF-123', expiresAt: '2030-03-17T17:46:40.000Z' },
    shapes: [
      { type: 'rectangle' as const, x: 0.1, y: 0.2, width: 0.4, height: 0.3, x1: null, y1: null, x2: null, y2: null, text: null, nearMarkers: ['data-kr-element="related-contacts-list"'] },
      { type: 'text' as const, x: 0.3, y: 0.03, width: null, height: null, x1: null, y1: null, x2: null, y2: null, text: 'Too <tall>', nearMarkers: [] },
    ],
  }

  it('shows each image from the tool image script, with its shapes in words, escaped', () => {
    const html = detailView({ ...detail, images: [image] }, { canTriage: true, listFilter: {} })
    expect(html).toContain('src="/images/feedback/FB-0012/hfi_00000000-0000-4000-8000-000000000000.png?ticket=1900000000.abc_DEF-123"')
    expect(html).toContain('Rectangle around data-kr-element=&quot;related-contacts-list&quot;')
    expect(html).toContain('Text &quot;Too &lt;tall&gt;&quot; (no marker under it)')
    expect(html).toContain('1280 x 720, 20 KB, 40 markers in the shot')
  })

  it('gives every screenshot its tool row: Magnify, the lens size and Pop out', () => {
    const html = detailView({ ...detail, images: [image, { ...image, id: 'hfi_2' }] }, { canTriage: true, listFilter: {} })
    expect(html.match(/data-action="magnify"/g)?.length).toBe(2)
    expect(html).toContain('<option value="large">Large</option>')
    expect(html).toContain('data-action="pop-image" data-src="/images/feedback/FB-0012/hfi_00000000-0000-4000-8000-000000000000.png?ticket=1900000000.abc_DEF-123"')
  })

  it('says why an image without a ticket is not shown', () => {
    const html = detailView({ ...detail, images: [{ ...image, ticket: null }] }, { canTriage: true, listFilter: {} })
    expect(html).not.toContain('<img')
    expect(html).toContain('no image ticket secret yet')
  })
})
