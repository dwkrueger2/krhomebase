// file: apps/web/features/homebase-feedback/screenshot.ts
/**
 * Taking the Homebase Feedback screenshot (plan 12, stage F3, point 5; decision 5: in-page drawing with
 * `modern-screenshot`, a web dependency added with this stage). The picture is the source window (the main KR
 * Homebase window) as it is on screen now, at its window size and one image pixel per CSS pixel, so the marker boxes
 * and the image share one grid.
 *
 * - `readMarkerMap` lists every `data-kr-id` and `data-kr-element` element visible in the window with its box, in
 *   coordinates 0 to 1 of the window (the contracts' `HomebaseFeedbackMapEntry`), at most 400. The API uses it to
 *   name the markers each drawn shape points at.
 * - `captureSourceScreenshot` draws the page with `modern-screenshot`, leaving out the Feedback panel (when it is
 *   drawn inside the page because the pop-out was blocked) and the marker outline layer (`sourcePage.ts`).
 *
 * Known limits, said on the screen too: frames from other sites (outside tools) and images from other sites may come
 * out blank; the page is drawn from its top-left corner, which is what the window shows for KR Homebase's fixed frame.
 */

import { HOMEBASE_FEEDBACK_MAX_MAP_ENTRIES, type HomebaseFeedbackMapEntry } from '@krhomebase/contracts'
import { domToCanvas } from 'modern-screenshot'
import { clampUnit } from './annotation'
import { isFeedbackOwn } from './sourcePage'

/** A screenshot ready for the editor. */
export interface SourceScreenshot {
  /** The PNG as a `data:` address (kept in memory only, never stored in the browser). */
  dataUrl: string
  width: number
  height: number
  markerMap: HomebaseFeedbackMapEntry[]
}

const MARKER_ATTRIBUTES = ['data-kr-id', 'data-kr-element'] as const

/**
 * Every marker element visible in the window, with its box as 0 to 1 of the window, in page order.
 *
 * @param doc - The source window's document.
 * @param width - The window width in CSS pixels.
 * @param height - The window height in CSS pixels.
 */
export function readMarkerMap(doc: Pick<Document, 'querySelectorAll'>, width: number, height: number): HomebaseFeedbackMapEntry[] {
  const entries: HomebaseFeedbackMapEntry[] = []
  if (width <= 0 || height <= 0) return entries
  for (const element of Array.from(doc.querySelectorAll('[data-kr-id], [data-kr-element]'))) {
    if (isFeedbackOwn(element)) continue
    const rect = element.getBoundingClientRect()
    // Only what the window shows: the part of the box inside it.
    const left = Math.max(0, rect.left)
    const top = Math.max(0, rect.top)
    const right = Math.min(width, rect.left + rect.width)
    const bottom = Math.min(height, rect.top + rect.height)
    if (right - left < 1 || bottom - top < 1) continue
    const box = { x: clampUnit(left / width), y: clampUnit(top / height), width: clampUnit((right - left) / width), height: clampUnit((bottom - top) / height) }
    for (const attribute of MARKER_ATTRIBUTES) {
      const value = element.getAttribute(attribute)?.trim()
      if (!value || value.length > 200) continue
      entries.push({ attribute, value, box })
      if (entries.length >= HOMEBASE_FEEDBACK_MAX_MAP_ENTRIES) return entries
    }
  }
  return entries
}

/**
 * Draws the source window as it is now.
 *
 * @param source - The main KR Homebase window.
 * @returns The PNG, its size and the marker map.
 */
export async function captureSourceScreenshot(source: Window): Promise<SourceScreenshot> {
  const doc = source.document
  const width = Math.max(1, Math.round(source.innerWidth))
  const height = Math.max(1, Math.round(source.innerHeight))
  // The map first, from the same layout the picture is drawn from.
  const markerMap = readMarkerMap(doc, width, height)
  const background = source.getComputedStyle(doc.body).backgroundColor
  const canvas = await domToCanvas(doc.body, {
    width,
    height,
    scale: 1,
    backgroundColor: background && background !== 'rgba(0, 0, 0, 0)' ? background : '#ffffff',
    // Leave out the Feedback panel and the outline layer (nodeType 1 is an element).
    filter: (node) => !(node.nodeType === 1 && isFeedbackOwn(node as Element)),
    timeout: 8000,
    features: { restoreScrollPosition: true },
  })
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, markerMap }
}
