'use client'
// file: apps/web/components/ui/useDismissablePopup.client.ts
/**
 * Closes a small popup (a dropdown list or menu) the three ways the requester asked for (Nov 9, 2026):
 *  1. a pointer press anywhere outside `rootRef` (the popup and the control that opened it);
 *  2. the Escape key, wherever the focus is;
 *  3. five seconds with no pointer movement over `rootRef` (typing inside it counts as activity too).
 *
 * Used by the top-bar search results and the recently accessed menu. `onDismiss` is called once per close; the
 * listeners exist only while `open` is true.
 */

import { useEffect, useRef, type RefObject } from 'react'

/** How long the popup stays open without pointer movement or typing inside it. */
export const POPUP_IDLE_MS = 5000

/** Listen in the capture phase so a child that stops propagation cannot keep the popup open. The object form, not a
 * bare `true`, because Node's `EventTarget` (used in tests) does not match a bare `true` on removal. */
const CAPTURE = { capture: true } as const

/** The part of `document` the listeners need; a plain `EventTarget` stands in for it in tests. */
type ListenerTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

/**
 * Adds the three dismissal listeners and starts the idle timer. Returns the cleanup. Kept apart from the hook so
 * the tests can drive it with a plain `EventTarget` and fake timers (the web tests have no browser document).
 */
export function attachPopupDismissal(target: ListenerTarget, isInside: (eventTarget: EventTarget | null) => boolean, onDismiss: () => void, idleMs: number = POPUP_IDLE_MS): () => void {
  let idleTimer = setTimeout(onDismiss, idleMs)
  const restartIdle = (): void => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(onDismiss, idleMs)
  }
  const onPointerDown = (event: Event): void => {
    if (!isInside(event.target)) onDismiss()
  }
  const onPointerMove = (event: Event): void => {
    if (isInside(event.target)) restartIdle()
  }
  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') {
      onDismiss()
      return
    }
    if (isInside(event.target)) restartIdle()
  }
  target.addEventListener('pointerdown', onPointerDown, CAPTURE)
  target.addEventListener('pointermove', onPointerMove, CAPTURE)
  target.addEventListener('keydown', onKeyDown, CAPTURE)
  return () => {
    clearTimeout(idleTimer)
    target.removeEventListener('pointerdown', onPointerDown, CAPTURE)
    target.removeEventListener('pointermove', onPointerMove, CAPTURE)
    target.removeEventListener('keydown', onKeyDown, CAPTURE)
  }
}

export function useDismissablePopup(open: boolean, rootRef: RefObject<HTMLElement | null>, onDismiss: () => void, idleMs: number = POPUP_IDLE_MS): void {
  // Always call the latest callback without re-adding the listeners on every render.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!open) return
    const isInside = (target: EventTarget | null): boolean => target instanceof Node && Boolean(rootRef.current?.contains(target))
    return attachPopupDismissal(document, isInside, () => dismissRef.current(), idleMs)
  }, [idleMs, open, rootRef])
}
