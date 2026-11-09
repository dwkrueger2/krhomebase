'use client'
// file: apps/web/components/dev-view/useMarkerPicker.client.ts
/**
 * The Pick tool's pointer and keyboard handling (new in the port).
 *
 * While `active` is true:
 * 1. Moving the pointer finds the element under it, then its nearest marked ancestor (`findMarkedAncestor`),
 *    and reports that element's box so `DevPickHighlight` can outline it.
 * 2. Clicking calls `onPick` with that element. Shift + click picks and stays in Pick mode; a plain click picks
 *    and ends it (the parent decides, from `keepPicking`).
 * 3. Up arrow moves the highlight to the next marked ancestor; Down arrow moves back toward the element under
 *    the pointer. Escape ends Pick mode.
 * 4. The page underneath never receives the click, the press or the double click (they are stopped in the
 *    capture phase), so picking a button does not press it. Scrolling still works.
 *
 * Dev View's own controls (panel, trigger, overlay labels) are ignored: they keep working while picking, and
 * the pointer looks through them to the page.
 *
 * Every listener is added to the window Dev View inspects (`targetWindow`): the main window, or a pop-out window.
 */

import { useEffect, useRef, useState } from 'react'
import { findMarkedAncestor, isInsideDevView, pickLabelForElement, type DevViewWindow } from './markers'

/** What the Pick highlight shows: the target's box in viewport coordinates and its first marker. */
export interface PickHover {
  element: HTMLElement
  label: string
  /** How many marked ancestors above the element under the pointer the highlight has climbed. */
  levelsUp: number
  left: number
  top: number
  width: number
  height: number
}

/** Events stopped before the page sees them while picking (the click itself is handled separately). */
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick'] as const

/**
 * Runs the Pick tool while `active` is true.
 *
 * @param active - Pick mode on or off. Turning it off removes every listener and restores the cursor.
 * @param onPick - Called with the highlighted element on click; `keepPicking` is true when Shift was held.
 * @param onExit - Called when Escape is pressed.
 * @param targetWindow - The window to pick in. Defaults to the main window.
 * @returns The current highlight, or null when nothing marked is under the pointer.
 */
export function useMarkerPicker(
  active: boolean,
  onPick: (element: HTMLElement, keepPicking: boolean) => void,
  onExit: () => void,
  targetWindow?: DevViewWindow,
): PickHover | null {
  const [hover, setHover] = useState<PickHover | null>(null)
  const onPickRef = useRef(onPick)
  const onExitRef = useRef(onExit)

  // Keep the newest callbacks without re-adding the listeners on every render.
  useEffect(() => {
    onPickRef.current = onPick
    onExitRef.current = onExit
  })

  useEffect(() => {
    if (!active) {
      setHover(null)
      return
    }

    let base: HTMLElement | null = null // nearest marked element under the pointer
    let levelsUp = 0
    let pointerX = -1
    let pointerY = -1
    let frame = 0
    const win = targetWindow ?? window
    const doc = win.document
    const root = doc.documentElement
    const previousCursor = root.style.cursor
    root.style.cursor = 'crosshair'

    /** The highlighted element: `base`, climbed `levelsUp` marked ancestors. Clamps at the top marker. */
    const resolveTarget = (): HTMLElement | null => {
      let target = base
      for (let level = 0; target && level < levelsUp; level += 1) {
        const parent = findMarkedAncestor(target.parentElement)
        if (!parent) {
          levelsUp = level
          break
        }
        target = parent
      }
      return target
    }

    /** Re-measures the target and publishes it. Also runs on scroll and resize, since the box moves. */
    const publish = (): void => {
      const target = resolveTarget()
      if (!target) {
        setHover(null)
        return
      }
      const rect = target.getBoundingClientRect()
      setHover({ element: target, label: pickLabelForElement(target), levelsUp, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }

    /** Finds the page element under a point, looking through Dev View's own controls. */
    const locate = (x: number, y: number): void => {
      const under = doc.elementsFromPoint(x, y).find((element) => !isInsideDevView(element)) ?? null
      const next = findMarkedAncestor(under as HTMLElement | null)
      if (next !== base) {
        base = next
        levelsUp = 0
      }
    }

    const handlePointerMove = (event: PointerEvent): void => {
      pointerX = event.clientX
      pointerY = event.clientY
      win.cancelAnimationFrame(frame)
      frame = win.requestAnimationFrame(() => {
        locate(pointerX, pointerY)
        publish()
      })
    }

    const blockPageEvent = (event: Event): void => {
      if (isInsideDevView(event.target)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const handleClick = (event: MouseEvent): void => {
      if (isInsideDevView(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      // Re-locate in case the pointer moved since the last frame. The climb level is kept when the element under
      // the pointer is unchanged.
      locate(event.clientX, event.clientY)
      const target = resolveTarget()
      if (target) onPickRef.current(target, event.shiftKey)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onExitRef.current()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        levelsUp += 1
        publish()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        levelsUp = Math.max(0, levelsUp - 1)
        publish()
      }
    }

    doc.addEventListener('pointermove', handlePointerMove, true)
    doc.addEventListener('click', handleClick, true)
    BLOCKED_EVENTS.forEach((type) => doc.addEventListener(type, blockPageEvent, true))
    win.addEventListener('keydown', handleKeyDown, true)
    win.addEventListener('scroll', publish, true)
    win.addEventListener('resize', publish)

    return () => {
      win.cancelAnimationFrame(frame)
      root.style.cursor = previousCursor
      doc.removeEventListener('pointermove', handlePointerMove, true)
      doc.removeEventListener('click', handleClick, true)
      BLOCKED_EVENTS.forEach((type) => doc.removeEventListener(type, blockPageEvent, true))
      win.removeEventListener('keydown', handleKeyDown, true)
      win.removeEventListener('scroll', publish, true)
      win.removeEventListener('resize', publish)
    }
  }, [active, targetWindow])

  return hover
}
