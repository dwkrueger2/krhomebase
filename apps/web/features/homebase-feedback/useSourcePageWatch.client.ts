'use client'
// file: apps/web/features/homebase-feedback/useSourcePageWatch.client.ts
/**
 * Watches the source window's page for Homebase Feedback (plan 12, stage F2, point 3): the marker chips are checked
 * against the page again whenever it changes, so a chip turns grey or live as screens change.
 *
 * A `MutationObserver` on the source document's `<body>` (elements added or removed, and changed `data-kr-id` or
 * `data-kr-element` values), the window's Back and Forward (`popstate`) and its resize each move a counter on, at most
 * once every `SETTLE_MS`. A component reads the page again when the counter moves. Changes made by the Feedback
 * outline layer itself are ignored, or drawing the outlines would read as a page change and draw them again.
 */

import { useEffect, useState } from 'react'
import { FEEDBACK_HIGHLIGHT_ID } from './sourcePage'

/** True for a change made by the outline layer (`markerHighlight.ts`), which is not a change of the page. */
function isOutlineChange(mutation: MutationRecord): boolean {
  // nodeType 1 is an element (an `instanceof` test would depend on which window made the node).
  const isLayer = (node: Node) => node.nodeType === 1 && (node as Element).getAttribute('data-kr-id') === FEEDBACK_HIGHLIGHT_ID
  const target = mutation.target as Element
  if (typeof target.closest === 'function' && target.closest(`[data-kr-id="${FEEDBACK_HIGHLIGHT_ID}"]`)) return true
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return nodes.length > 0 && nodes.every(isLayer)
}

/** How long the page must be still before the counter moves, in milliseconds. */
const SETTLE_MS = 200

/**
 * @param source - The window the Feedback pop-out was opened from; null while there is none.
 * @returns A number that changes after each settled change of the source window's page.
 */
export function useSourcePageWatch(source: Window | null): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!source) return undefined
    let timer = 0
    const bump = () => {
      if (timer) source.clearTimeout(timer)
      timer = source.setTimeout(() => {
        timer = 0
        setVersion((current) => current + 1)
      }, SETTLE_MS)
    }
    // The source window's own MutationObserver, so it works for any window the pop-out reads.
    const observer = new (source as Window & typeof globalThis).MutationObserver((mutations) => {
      if (mutations.every(isOutlineChange)) return
      bump()
    })
    observer.observe(source.document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-kr-id', 'data-kr-element'] })
    source.addEventListener('popstate', bump)
    source.addEventListener('resize', bump)
    return () => {
      observer.disconnect()
      source.removeEventListener('popstate', bump)
      source.removeEventListener('resize', bump)
      if (timer) source.clearTimeout(timer)
    }
  }, [source])
  return version
}
