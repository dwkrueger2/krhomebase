// file: apps/web/components/ui/useDismissablePopup.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachPopupDismissal, POPUP_IDLE_MS } from '@/components/ui/useDismissablePopup.client'

/**
 * Checks the three ways a popup closes: a press outside, Escape, and 5 seconds without pointer movement or typing
 * inside. A plain `EventTarget` stands in for the document; `inside` and `outside` stand in for elements.
 */
const inside = new EventTarget()
const outside = new EventTarget()

function fire(target: EventTarget, source: EventTarget, type: string, key?: string): void {
  const event = new Event(type)
  Object.defineProperty(event, 'target', { value: source })
  if (key) Object.defineProperty(event, 'key', { value: key })
  target.dispatchEvent(event)
}

describe('attachPopupDismissal', () => {
  let doc: EventTarget
  let dismiss: ReturnType<typeof vi.fn<() => void>>
  let cleanup: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    doc = new EventTarget()
    dismiss = vi.fn<() => void>()
    cleanup = attachPopupDismissal(doc, (target) => target === inside, dismiss)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('closes on a press outside but not inside', () => {
    fire(doc, inside, 'pointerdown')
    expect(dismiss).not.toHaveBeenCalled()
    fire(doc, outside, 'pointerdown')
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    fire(doc, outside, 'keydown', 'Escape')
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('closes after 5 seconds without movement', () => {
    vi.advanceTimersByTime(POPUP_IDLE_MS - 1)
    expect(dismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('restarts the 5 seconds on movement or typing inside, not outside', () => {
    vi.advanceTimersByTime(4000)
    fire(doc, inside, 'pointermove')
    vi.advanceTimersByTime(4000)
    fire(doc, inside, 'keydown', 'a')
    vi.advanceTimersByTime(4000)
    expect(dismiss).not.toHaveBeenCalled()
    fire(doc, outside, 'pointermove')
    vi.advanceTimersByTime(1000)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('stops listening after cleanup', () => {
    cleanup()
    fire(doc, outside, 'pointerdown')
    vi.advanceTimersByTime(POPUP_IDLE_MS * 2)
    expect(dismiss).not.toHaveBeenCalled()
  })
})
