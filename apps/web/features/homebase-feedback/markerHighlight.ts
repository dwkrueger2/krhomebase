// file: apps/web/features/homebase-feedback/markerHighlight.ts
/**
 * Outlines in the source window for Homebase Feedback's marker chips (plan 12, stage F2, point 3). A chip's click
 * outlines every element with that marker; "All" outlines every marker the text names. Since Nov 14, 2026 (the
 * requester) a chip click selects or clears its marker (`useMarkerSelection.client.ts`), and the selected markers stay
 * outlined (`persist`) until they are cleared; the panel draws them again after each page change (`scroll: false`).
 *
 * The outlines live in one layer added to the source window's `<body>` (`data-kr-id="HomebaseFeedbackHighlight"`,
 * `pointer-events: none`, so the page under it still works). The layer carries `data-kr-theme-scope="krhomebase"` so
 * the `--kr-theme-*` tokens reach it, as a portal's root does. Each box follows its element while the page scrolls or
 * resizes; the layer is removed on the next highlight, by `clearMarkerHighlight`, or (without `persist`) after
 * `HIGHLIGHT_MS`.
 * The box geometry is set as inline `top`, `left`, `width` and `height` (it is measured from the element); every
 * other look is in the style maps below.
 *
 * This is the plain outline the plan names for when Dev View is off; Dev View's own overlay for developers comes with
 * stage F4.
 */

import type { FeedbackMarkerReference } from '@krhomebase/contracts'
import { FEEDBACK_HIGHLIGHT_ID, findMarkerElements } from './sourcePage'

/** How long the outlines stay without `persist`, in milliseconds. */
export const HIGHLIGHT_MS = 8000
/** The most elements outlined at once, so a marker on every row cannot cover the page. */
const MAX_BOXES = 40

const LAYOUT_STYLES = {
  // The whole window, above the page and its dialogs.
  layer: 'fixed inset-0 z-[2147483000]',
  box: 'fixed',
  label: 'px-[3px] absolute left-[-2px] top-[-17px]',
} as const

const STYLES = {
  layer: 'pointer-events-none',
  box: 'pointer-events-none rounded-[2px] outline-2 outline-offset-[1px] outline-(--kr-theme-orange) bg-(--kr-theme-orange)/10',
  label: 'rounded-[2px] bg-(--kr-theme-orange) text-[10px] leading-[14px] font-bold whitespace-nowrap text-white',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** What is drawn in one window now, so the next highlight or a clear can take it away. */
interface HighlightState {
  layer: HTMLElement
  stop: () => void
}

const drawn = new WeakMap<Window, HighlightState>()

/** Removes the outlines from the source window, if any. */
export function clearMarkerHighlight(source: Window): void {
  const state = drawn.get(source)
  if (!state) return
  state.stop()
  state.layer.remove()
  drawn.delete(source)
}

/**
 * Outlines every element of the given markers in the source window and scrolls the first into view.
 *
 * @param source - The window the Feedback pop-out was opened from.
 * @param markers - The markers to outline (one chip, or every chip for "All").
 * @param options.persist - Keep the outlines until they are cleared (no time limit).
 * @param options.scroll - Scroll the first element into view (default true).
 * @returns How many elements were outlined (0 when none of the markers is on the page).
 */
export function highlightMarkers(source: Window, markers: readonly FeedbackMarkerReference[], options: { persist?: boolean; scroll?: boolean } = {}): number {
  clearMarkerHighlight(source)
  const doc = source.document
  const targets: Array<{ element: Element; label: string }> = []
  for (const marker of markers) {
    for (const element of findMarkerElements(doc, marker)) {
      if (targets.length >= MAX_BOXES) break
      targets.push({ element, label: marker.pattern })
    }
  }
  if (!targets.length) return 0

  // The layer and one box (with its marker label) per element.
  const layer = doc.createElement('div')
  layer.className = `${LAYOUT_STYLES.layer} ${STYLES.layer}`
  layer.setAttribute('data-kr-id', FEEDBACK_HIGHLIGHT_ID)
  layer.setAttribute('data-kr-theme-scope', 'krhomebase')
  layer.setAttribute('aria-hidden', 'true')
  const boxes = targets.map(({ element, label }) => {
    const box = doc.createElement('div')
    box.className = `${LAYOUT_STYLES.box} ${STYLES.box}`
    box.setAttribute('data-kr-element', 'homebase-feedback-highlight-box')
    const tag = doc.createElement('span')
    tag.className = `${LAYOUT_STYLES.label} ${STYLES.label}`
    tag.textContent = label
    box.appendChild(tag)
    layer.appendChild(box)
    return { element, box }
  })
  doc.body.appendChild(layer)

  // Keep each box on its element while the page scrolls or resizes.
  let frame = 0
  const place = () => {
    frame = 0
    for (const { element, box } of boxes) {
      const rect = element.getBoundingClientRect()
      box.style.left = `${rect.left}px`
      box.style.top = `${rect.top}px`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
    }
  }
  const schedule = () => {
    if (!frame) frame = source.requestAnimationFrame(place)
  }
  place()
  source.addEventListener('scroll', schedule, true)
  source.addEventListener('resize', schedule)
  const timer = options.persist ? 0 : source.setTimeout(() => clearMarkerHighlight(source), HIGHLIGHT_MS)
  drawn.set(source, {
    layer,
    stop: () => {
      source.removeEventListener('scroll', schedule, true)
      source.removeEventListener('resize', schedule)
      if (timer) source.clearTimeout(timer)
      if (frame) source.cancelAnimationFrame(frame)
    },
  })
  if (options.scroll !== false) targets[0]!.element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return targets.length
}
