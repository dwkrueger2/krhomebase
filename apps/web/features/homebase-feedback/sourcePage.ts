// file: apps/web/features/homebase-feedback/sourcePage.ts
/**
 * Reading the source window for Homebase Feedback (plan 12, stage F2, points 3 and 4). The "source window" is the
 * window the Feedback pop-out was opened from: the main KR Homebase window. The pop-out is drawn by that window's
 * React, so it can read the source window's page directly.
 *
 * - `captureSourceContext` reads what each request records: the address, the open section and item, the top bar's
 *   title and breadcrumb, the three version tags in `<head>` (`kr-web-version`, `kr-deployment-id`,
 *   `kr-deployment-time`, written by `app/layout.tsx`), the window size and the theme (`data-kr-theme` on `<html>`).
 * - `findMarkerElements` finds the elements a marker names (`data-kr-id="..."` or `data-kr-element="..."`), leaving out
 *   the Feedback panel itself and the outlines this feature draws, so a marker is "found" only when the page has it.
 * - `markerPresence` and `markerCaptures` answer, for every marker in the text, whether it is on the page and where.
 *
 * Nothing here changes the page. The outlines are drawn by `markerHighlight.ts`.
 */

import type { FeedbackMarkerReference, HomebaseFeedbackContext, HomebaseFeedbackMarkerCapture } from '@krhomebase/contracts'

/** `data-kr-id` of the Feedback panel; markers inside it are not the page's. */
export const FEEDBACK_PANEL_ID = 'HomebaseFeedbackPanel'
/** `data-kr-id` of the outline layer `markerHighlight.ts` adds to the source window. */
export const FEEDBACK_HIGHLIGHT_ID = 'HomebaseFeedbackHighlight'

/** The key of a marker in maps: `data-kr-id=TopTitleBar`. */
export const markerKey = (marker: Pick<FeedbackMarkerReference, 'attribute' | 'value'>) => `${marker.attribute}=${marker.value}`

/** An attribute selector for one marker. Values never hold quotes or spaces (`findFeedbackMarkers`); backslashes and quotes are escaped anyway. */
export function markerSelector(marker: Pick<FeedbackMarkerReference, 'attribute' | 'value'>): string {
  const value = marker.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `[${marker.attribute}="${value}"]`
}

/** True for an element of the Feedback panel or of the outline layer, which never count as the page's. */
function isFeedbackOwn(element: Element): boolean {
  return Boolean(element.closest(`[data-kr-id="${FEEDBACK_PANEL_ID}"], [data-kr-id="${FEEDBACK_HIGHLIGHT_ID}"]`))
}

/** The page's elements that carry this marker, in page order. */
export function findMarkerElements(doc: Document, marker: Pick<FeedbackMarkerReference, 'attribute' | 'value'>): Element[] {
  try {
    return Array.from(doc.querySelectorAll(markerSelector(marker))).filter((element) => !isFeedbackOwn(element))
  } catch {
    return []
  }
}

/** For each marker, whether the page has it now. */
export function markerPresence(doc: Document, markers: readonly FeedbackMarkerReference[]): Record<string, boolean> {
  const presence: Record<string, boolean> = {}
  for (const marker of markers) presence[markerKey(marker)] = findMarkerElements(doc, marker).length > 0
  return presence
}

/** What a request records for each marker: found or not, and where the first such element is in the window. */
export function markerCaptures(doc: Document, markers: readonly FeedbackMarkerReference[]): HomebaseFeedbackMarkerCapture[] {
  return markers.map((marker) => {
    const element = findMarkerElements(doc, marker)[0]
    if (!element) return { attribute: marker.attribute, value: marker.value, found: false, box: null }
    const rect = element.getBoundingClientRect()
    const round = (value: number) => Math.round(value * 10) / 10
    return { attribute: marker.attribute, value: marker.value, found: true, box: { x: round(rect.left), y: round(rect.top), width: round(rect.width), height: round(rect.height) } }
  })
}

/** The open section and open item named by an address's `?section=` (`contacts`, or `contact:<id>` for an open contact). */
export function sectionFromAddress(href: string): { sectionId: string | undefined; openItem: string | undefined } {
  let section: string | null = null
  try {
    section = new URL(href).searchParams.get('section')
  } catch {
    section = null
  }
  if (!section) return { sectionId: undefined, openItem: undefined }
  const colon = section.indexOf(':')
  return colon > 0 ? { sectionId: section.slice(0, colon), openItem: section } : { sectionId: section, openItem: undefined }
}

const metaContent = (doc: Document, name: string) => doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || undefined
const squeeze = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/**
 * Everything a request records about the source window, read now. The top bar's title and breadcrumb come from
 * `TopTitleBar` (`data-kr-id="TopTitleBar"`); an open item's label is the breadcrumb's last step.
 */
export function captureSourceContext(source: Window): HomebaseFeedbackContext {
  const doc = source.document
  const href = source.location.href
  const { sectionId, openItem } = sectionFromAddress(href)
  const title = squeeze(doc.querySelector('[data-kr-id="TopTitleBar"] h1')?.textContent)
  const crumbs = squeeze(doc.querySelector('[data-kr-id="TopTitleBar"] [data-kr-element="application-breadcrumb"]')?.textContent)
  const pageTitle = [title, crumbs && crumbs !== title ? `(${crumbs})` : ''].filter(Boolean).join(' ')
  const theme = doc.documentElement.getAttribute('data-kr-theme') || 'light'
  return {
    pageAddress: href.slice(0, 2000),
    sectionId,
    openItem: openItem ? [openItem, title && `"${title}"`].filter(Boolean).join(' ').slice(0, 300) : undefined,
    pageTitle: pageTitle ? pageTitle.slice(0, 500) : undefined,
    webVersion: metaContent(doc, 'kr-web-version'),
    deploymentId: metaContent(doc, 'kr-deployment-id'),
    deploymentTime: metaContent(doc, 'kr-deployment-time'),
    windowWidth: Math.round(source.innerWidth),
    windowHeight: Math.round(source.innerHeight),
    theme,
  }
}
