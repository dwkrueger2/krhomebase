// file: apps/web/features/homebase-feedback/homebaseFeedback.test.tsx
/**
 * Homebase Feedback screens (plan 12, stage F2). The tests run in Node without a browser, so the source window is a
 * small stand-in: an address, three `<meta>` tags, the top bar's title and breadcrumb, and elements found by an
 * attribute selector. Checks: the open section and item read from `?section=`; the captured page; markers found or not
 * (the Feedback panel's own elements never count); the chip row (live chips are buttons, missing ones grey and
 * disabled, "All" off when none is on the page); the captured-page card; the note wording.
 *
 * Run: pnpm --dir apps/web exec vitest run features/homebase-feedback/homebaseFeedback.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { findFeedbackMarkers } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import CapturedContextCard from './components/CapturedContextCard.client'
import { noteText } from './components/FeedbackRequestList.client'
import MarkerChipRow from './components/MarkerChipRow.client'
import { captureSourceContext, findMarkerElements, markerCaptures, markerKey, markerPresence, markerSelector, sectionFromAddress } from './sourcePage'

/** A stand-in element: its markers, whether it sits inside the Feedback panel, and its box. */
function element(attributes: Record<string, string>, insidePanel = false) {
  return {
    attributes,
    closest: () => (insidePanel ? {} : null),
    getBoundingClientRect: () => ({ left: 10.04, top: 20, width: 300, height: 40 }),
  }
}

/** A stand-in document that answers `[attr="value"]` selectors and the few other reads `sourcePage.ts` makes. */
function fakeDocument(elements: ReturnType<typeof element>[], extra: Record<string, { textContent?: string; content?: string }> = {}, theme = 'dark') {
  return {
    querySelectorAll: (selector: string) => {
      const match = /^\[([a-z-]+)="(.*)"\]$/.exec(selector)
      return match ? elements.filter((candidate) => candidate.attributes[match[1]!] === match[2]) : []
    },
    querySelector: (selector: string) => {
      const found = extra[selector]
      return found ? { textContent: found.textContent ?? null, getAttribute: () => found.content ?? null } : null
    },
    documentElement: { getAttribute: () => theme },
  } as unknown as Document
}

describe('sourcePage', () => {
  it('reads the open section and item from the address', () => {
    expect(sectionFromAddress('http://localhost:3011/?section=contacts')).toEqual({ sectionId: 'contacts', openItem: undefined })
    expect(sectionFromAddress('http://localhost:3011/?section=contact:ind_123&x=1')).toEqual({ sectionId: 'contact', openItem: 'contact:ind_123' })
    expect(sectionFromAddress('http://localhost:3011/')).toEqual({ sectionId: undefined, openItem: undefined })
  })

  it('writes an attribute selector for a marker', () => {
    expect(markerSelector({ attribute: 'data-kr-id', value: 'TopTitleBar' })).toBe('[data-kr-id="TopTitleBar"]')
  })

  it('finds markers on the page but never inside the Feedback panel', () => {
    const doc = fakeDocument([element({ 'data-kr-id': 'TopTitleBar' }), element({ 'data-kr-element': 'feedback-marker-chips' }, true)])
    const markers = findFeedbackMarkers('data-kr-id="TopTitleBar" data-kr-element="feedback-marker-chips" data-kr-id="Gone"')
    expect(markerPresence(doc, markers)).toEqual({ 'data-kr-id=TopTitleBar': true, 'data-kr-element=feedback-marker-chips': false, 'data-kr-id=Gone': false })
    expect(findMarkerElements(doc, markers[1]!)).toEqual([])
    expect(markerCaptures(doc, markers)).toEqual([
      { attribute: 'data-kr-id', value: 'TopTitleBar', found: true, box: { x: 10, y: 20, width: 300, height: 40 } },
      { attribute: 'data-kr-element', value: 'feedback-marker-chips', found: false, box: null },
      { attribute: 'data-kr-id', value: 'Gone', found: false, box: null },
    ])
  })

  it('captures the page: address, section, open item, title, version tags, window size and theme', () => {
    const doc = fakeDocument([], {
      'meta[name="kr-web-version"]': { content: '1.1.5 p542 (11-13)' },
      'meta[name="kr-deployment-id"]': { content: 'local' },
      'meta[name="kr-deployment-time"]': { content: 'local' },
      '[data-kr-id="TopTitleBar"] h1': { textContent: 'Clients & Contacts' },
      '[data-kr-id="TopTitleBar"] [data-kr-element="application-breadcrumb"]': { textContent: 'Clients & Contacts /  Ann  Example' },
    })
    const source = { document: doc, location: { href: 'http://localhost:3011/?section=contact:ind_1' }, innerWidth: 1280, innerHeight: 720 } as unknown as Window
    expect(captureSourceContext(source)).toEqual({
      pageAddress: 'http://localhost:3011/?section=contact:ind_1',
      sectionId: 'contact',
      openItem: 'contact:ind_1 "Clients & Contacts"',
      pageTitle: 'Clients & Contacts (Clients & Contacts / Ann Example)',
      webVersion: '1.1.5 p542 (11-13)',
      deploymentId: 'local',
      deploymentTime: 'local',
      windowWidth: 1280,
      windowHeight: 720,
      theme: 'dark',
    })
  })
})

describe('MarkerChipRow', () => {
  const markers = findFeedbackMarkers('data-kr-id="TopTitleBar" data-kr-element="gone-list"')

  const none = new Set<string>()
  const noop = () => undefined

  it('draws live chips as buttons and missing ones grey and disabled', () => {
    const html = renderToStaticMarkup(<MarkerChipRow markers={markers} presence={{ [markerKey(markers[0]!)]: true }} selected={none} onToggle={noop} onToggleAll={noop} emptyHint="none" />)
    expect(html).toContain('data-kr-marker="data-kr-id=&quot;TopTitleBar&quot;"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-kr-marker="data-kr-element=&quot;gone-list&quot;"/)
    expect(html).toContain('Outline all 1 marker on the page')
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('marks a selected chip pressed with the orange border, and All pressed when every live chip is selected', () => {
    const live = new Set([markerKey(markers[0]!)])
    const html = renderToStaticMarkup(<MarkerChipRow markers={markers} presence={live.size ? { [markerKey(markers[0]!)]: true } : {}} selected={live} onToggle={noop} onToggleAll={noop} emptyHint="none" />)
    expect(html).toMatch(/aria-pressed="true"[^>]*data-kr-action="highlight-all-markers"/)
    expect(html).toMatch(/outline-\(--kr-theme-orange\)[^>]*aria-pressed="true"[^>]*data-kr-marker="data-kr-id=&quot;TopTitleBar&quot;"/)
    expect(html).toContain('Clear the outline of data-kr-id=&quot;TopTitleBar&quot;')
  })

  it('turns All off when no marker is on the page, and shows the hint when the text names none', () => {
    const off = renderToStaticMarkup(<MarkerChipRow markers={markers} presence={{}} selected={none} onToggle={noop} onToggleAll={noop} emptyHint="none" />)
    expect(off).toMatch(/<button[^>]*disabled=""[^>]*data-kr-action="highlight-all-markers"/)
    expect(renderToStaticMarkup(<MarkerChipRow markers={[]} presence={{}} selected={none} onToggle={noop} onToggleAll={noop} emptyHint="Paste a marker." />)).toContain('Paste a marker.')
  })
})

describe('CapturedContextCard and notes', () => {
  it('shows each captured value, and a dash for a missing one', () => {
    const html = renderToStaticMarkup(<CapturedContextCard context={{ pageAddress: 'http://x/?section=tasks', sectionId: 'tasks', windowWidth: 1280, windowHeight: 720 }} />)
    expect(html).toContain('http://x/?section=tasks')
    expect(html).toContain('1280 x 720')
    expect(html).toContain('>-</dd>')
  })

  it('words a status change and keeps a plain note as written', () => {
    const base = { id: 'n1', authorUserId: 'u', authorLabel: 'Dee', createdAt: '2026-11-13T00:00:00Z' }
    expect(noteText({ ...base, noteType: 'status_change', text: 'Next week.', fromValue: 'new', toValue: 'in_progress' })).toBe('Status New to In progress: Next week.')
    expect(noteText({ ...base, noteType: 'note', text: 'Looking.', fromValue: null, toValue: null })).toBe('Looking.')
  })
})
