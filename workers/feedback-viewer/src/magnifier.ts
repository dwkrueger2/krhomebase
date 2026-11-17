// file: workers/feedback-viewer/src/magnifier.ts
/**
 * The screenshot magnifier and pop-out (the requester, Nov 16, 2026). Each screenshot has a small tool row in its
 * upper right (`imageToolsHtml` in `views.ts`):
 *
 *  - **Magnify** turns the magnifier on or off. While it is on, the button has a distinct Signal Orange border and the
 *    pointer over any screenshot shows a lens: a rectangle beside the pointer with that part of the image enlarged
 *    (at least 2.5 times the shown size, and never less than the image's own pixels).
 *  - **The size list** picks the lens: Small, Medium or Large (`LENS_SIZES`).
 *  - **Pop out** opens the screenshot alone in its own window, full size (the frame allows pop-ups).
 *
 * The setting is one for the whole page, so every screenshot's row shows the same state and the lens works on any of
 * them, however many there are. One lens element is drawn into the page body and moved with the pointer; its size,
 * place and picture are set from script (the page's Content-Security-Policy forbids `style="..."` in HTML but allows
 * script-set styles). Nothing here changes data.
 */

/** The three lens rectangles, width by height in CSS pixels. */
export const LENS_SIZES = {
  small: { label: 'Small', width: 140, height: 90 },
  medium: { label: 'Medium', width: 220, height: 140 },
  large: { label: 'Large', width: 320, height: 200 },
} as const
export type LensSize = keyof typeof LENS_SIZES

/** The least enlargement, against the screenshot as shown. */
const MIN_ZOOM = 2.5

/** The magnifier's state for the whole page. */
const state: { on: boolean; size: LensSize } = { on: false, size: 'medium' }

/**
 * Where the lens shows and which part of the image it holds.
 *
 * @param image - The shown image's box, and its own size in pixels.
 * @param pointer - The pointer, page coordinates.
 * @param lens - The lens size.
 * @returns The lens box, the background size and its offset (CSS pixels), or null when the pointer is off the image.
 */
export function lensPlacement(
  image: { left: number; top: number; width: number; height: number; naturalWidth: number },
  pointer: { x: number; y: number },
  lens: { width: number; height: number },
): { left: number; top: number; backgroundWidth: number; backgroundHeight: number; offsetX: number; offsetY: number } | null {
  const x = pointer.x - image.left
  const y = pointer.y - image.top
  if (x < 0 || y < 0 || x > image.width || y > image.height || image.width <= 0) return null
  const zoom = Math.max(MIN_ZOOM, image.naturalWidth / image.width)
  return {
    // The lens sits centered on the pointer.
    left: pointer.x - lens.width / 2,
    top: pointer.y - lens.height / 2,
    backgroundWidth: image.width * zoom,
    backgroundHeight: image.height * zoom,
    offsetX: lens.width / 2 - x * zoom,
    offsetY: lens.height / 2 - y * zoom,
  }
}

/** Shows the page's state on every screenshot's tool row (after each redraw too). */
export function syncMagnifierControls(root: ParentNode): void {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-action="magnify"]'))) {
    button.setAttribute('aria-pressed', String(state.on))
  }
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>('select[data-action="magnify-size"]'))) {
    select.value = state.size
  }
}

/**
 * Wires the magnifier and the pop-out for the screens drawn inside `app`.
 *
 * @param app - The element the screens are drawn into.
 */
export function installMagnifier(app: HTMLElement): void {
  const doc = app.ownerDocument
  const lens = doc.createElement('div')
  lens.className = 'lens'
  lens.hidden = true
  lens.setAttribute('aria-hidden', 'true')
  doc.body.append(lens)

  const setOn = (on: boolean) => {
    state.on = on
    doc.body.classList.toggle('magnify-on', on)
    if (!on) lens.hidden = true
    syncMagnifierControls(app)
  }

  app.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
    if (button?.dataset.action === 'magnify') setOn(!state.on)
    if (button?.dataset.action === 'pop-image' && button.dataset.src) {
      // Its own window, about the size of the screen's free space; the image shows full size there.
      const width = Math.min(1400, screen.availWidth - 40)
      const height = Math.min(900, screen.availHeight - 40)
      window.open(button.dataset.src, '_blank', `popup=yes,width=${width},height=${height}`)
    }
  })
  app.addEventListener('change', (event) => {
    const select = event.target as HTMLSelectElement
    if (select.dataset?.action !== 'magnify-size' || !(select.value in LENS_SIZES)) return
    state.size = select.value as LensSize
    syncMagnifierControls(app)
  })
  app.addEventListener('mousemove', (event) => {
    if (!state.on) return
    const image = (event.target as HTMLElement).closest<HTMLImageElement>('.shot img')
    if (!image) {
      lens.hidden = true
      return
    }
    const box = image.getBoundingClientRect()
    const size = LENS_SIZES[state.size]
    const place = lensPlacement(
      { left: box.left, top: box.top, width: box.width, height: box.height, naturalWidth: image.naturalWidth || box.width },
      { x: event.clientX, y: event.clientY },
      size,
    )
    if (!place) {
      lens.hidden = true
      return
    }
    lens.hidden = false
    lens.style.width = `${size.width}px`
    lens.style.height = `${size.height}px`
    lens.style.left = `${place.left}px`
    lens.style.top = `${place.top}px`
    lens.style.backgroundImage = `url("${image.currentSrc || image.src}")`
    lens.style.backgroundSize = `${place.backgroundWidth}px ${place.backgroundHeight}px`
    lens.style.backgroundPosition = `${place.offsetX}px ${place.offsetY}px`
  })
  app.addEventListener('mouseleave', () => {
    lens.hidden = true
  })
  doc.addEventListener('keydown', (event) => {
    if (state.on && event.key === 'Escape') setOn(false)
  })
}
