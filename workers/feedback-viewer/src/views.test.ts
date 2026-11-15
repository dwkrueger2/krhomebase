// file: workers/feedback-viewer/src/views.test.ts
// The screens: values are escaped, a change is confirmed before it is saved, read-only people see no forms.
import { describe, expect, it } from 'vitest'
import { copyForClaudeText, type FeedbackDetail, type FeedbackListData } from './feedbackTypes.ts'
import { detailView, escapeHtml, listView, pendingChangeWords } from './views.ts'

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

const list: FeedbackListData = { items: [detail], nextCursor: 'next1', viewer: { userId: 'u2', isDeveloper: true, canTriage: true } }

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
  })
})

describe('listView', () => {
  it('shows the rows escaped, links to each request and the next page', () => {
    const html = listView(list, { status: 'new' })
    expect(html).toContain('href="#/FB-0012"')
    expect(html).toContain('Save &lt;button&gt; does nothing')
    expect(html).toContain('Pat &quot;P&quot; Doe')
    expect(html).toContain('href="#/?status=new&amp;cursor=next1"')
    expect(html).not.toContain('<button> does')
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
    expect(html).toContain('data-action="note"')
  })

  it('asks for confirmation of a change, naming what changes', () => {
    const pending = { status: 'planned' as const, priority: 'high' as const, note: 'Next week' }
    const html = detailView(detail, { canTriage: true, pending, listFilter: {} })
    expect(html).toContain('data-action="confirm-change"')
    expect(html).not.toContain('data-action="change"')
    expect(pendingChangeWords(detail, pending)).toBe('Change FB-0012: status from New to Planned and priority from Normal to High, with the note below.')
    expect(pendingChangeWords(detail, { status: 'new', priority: 'normal', note: '' })).toBe('Nothing changes on FB-0012.')
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

  it('says why an image without a ticket is not shown', () => {
    const html = detailView({ ...detail, images: [{ ...image, ticket: null }] }, { canTriage: true, listFilter: {} })
    expect(html).not.toContain('<img')
    expect(html).toContain('no image ticket secret yet')
  })
})
