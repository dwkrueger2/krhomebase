// file: workers/feedback-viewer/src/markerPick.ts
/**
 * Pick a marker inside the viewer (the requester, Nov 16, 2026). KR Homebase's Dev View and Pick from page cannot see
 * into this tool: the tool runs in a sandboxed frame from another site, which the browser keeps sealed. So the viewer
 * has its own small version, for writing feedback about the viewer itself:
 *
 *  1. A small **Markers** switch, fixed at the bottom right of the page (outside the screen, so redrawing keeps it).
 *  2. While it is on, every element with a `data-kr-element` or `data-kr-id` marker gets a dashed outline, and the one
 *     under the pointer a solid one (`viewer.css`, "Marker pick").
 *  3. A click on a marked element does nothing else (no link is followed, no button pressed): its marker, written as
 *     `data-kr-element="feedback-viewer-save"`, is copied to the clipboard. The frame may refuse the clipboard, so the
 *     marker is also shown, selected, in a small box for Ctrl+C.
 *  4. Escape, or the switch again, turns it off.
 *
 * The pasted marker names a part of the viewer, so the Feedback pop-out shows its chip as "not on the page" (it reads
 * only the main window). Inspection only: nothing here changes data.
 */

/** Both marker attributes, the element one first (it names the part, the id names the screen). */
const MARKER_ATTRIBUTES = ['data-kr-element', 'data-kr-id'] as const

/** The switch and the box are the tool's own controls, never picked. */
const PICK_UI = '[data-pick-ui]'

/**
 * The marker of an element, written as it is pasted into a request.
 *
 * @param element - A page element.
 * @returns `data-kr-element="x"` (or `data-kr-id="x"`) for the element itself, or null when it has no marker.
 */
export function markerPattern(element: Element): string | null {
  for (const attribute of MARKER_ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (value) return `${attribute}="${value}"`
  }
  return null
}

/** The nearest marked element at or above `target`, leaving out the pick controls. */
export function markedElementAt(target: EventTarget | null): Element | null {
  if (!(target instanceof Element) || target.closest(PICK_UI)) return null
  return target.closest(MARKER_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(', '))
}

/**
 * Adds the Markers switch to the page and wires the pick (steps 1 to 4 above).
 *
 * @param doc - The tool's document.
 */
export function installMarkerPick(doc: Document): void {
  const toggle = doc.createElement('button')
  toggle.type = 'button'
  toggle.className = 'pick-toggle'
  toggle.dataset.pickUi = ''
  toggle.textContent = 'Markers'
  toggle.title = 'Show the markers of this tool; click one to copy it for a feedback request (Escape stops)'
  toggle.setAttribute('aria-pressed', 'false')
  const box = doc.createElement('div')
  box.className = 'pick-box'
  box.dataset.pickUi = ''
  box.hidden = true
  box.setAttribute('role', 'status')
  doc.body.append(toggle, box)

  let on = false
  let hovered: Element | null = null

  const setHovered = (element: Element | null) => {
    hovered?.classList.remove('pick-hover')
    hovered = element
    hovered?.classList.add('pick-hover')
  }

  const setOn = (value: boolean) => {
    on = value
    doc.body.classList.toggle('pick-on', on)
    toggle.setAttribute('aria-pressed', String(on))
    if (!on) {
      setHovered(null)
      box.hidden = true
    }
  }

  /** Copies the marker; the box shows it selected in case the frame refused the clipboard. */
  const pick = async (pattern: string) => {
    box.replaceChildren()
    const words = doc.createElement('span')
    const field = doc.createElement('input')
    field.type = 'text'
    field.readOnly = true
    field.value = pattern
    box.append(words, field)
    box.hidden = false
    let copied = false
    try {
      await navigator.clipboard.writeText(pattern)
      copied = true
    } catch {
      copied = false
    }
    words.textContent = copied ? 'Copied ' : 'Press Ctrl+C '
    field.focus()
    field.select()
  }

  toggle.addEventListener('click', () => setOn(!on))
  doc.addEventListener('mouseover', (event) => {
    if (on) setHovered(markedElementAt(event.target))
  })
  // Capture phase: the pick runs before the screen's own handlers, and stops them.
  doc.addEventListener(
    'click',
    (event) => {
      if (!on) return
      const element = markedElementAt(event.target)
      if (!element) return
      event.preventDefault()
      event.stopPropagation()
      const pattern = markerPattern(element)
      if (pattern) void pick(pattern)
    },
    true,
  )
  doc.addEventListener('keydown', (event) => {
    if (on && event.key === 'Escape') setOn(false)
  })
}
