'use client'
// file: apps/web/components/dev-view/DevViewRemote.client.tsx
/**
 * A Dev View button that drives another window's Dev View (the requester, Nov 13, 2026). The Feedback pop-out shows it
 * instead of a Dev View of its own, so its button switches the overlays and the panel on and off over the **source
 * window**: the main window, where the page being described is.
 *
 * It looks like Dev View's own round button and sits in the same corner. A click sends `toggle` to the controlled
 * window (`devViewRemote.ts`); that window's Dev View does exactly what its own button does (on with the panel, panel
 * again, or off). The button shows on or off from the state that Dev View announces; on mount it asks once
 * (`report`). Loaded only in development, by `DevViewLoader` with `controlWindow`.
 */

import { useEffect, useState } from 'react'
import { CORNER_LAYOUT_STYLES, DEFAULT_DEV_VIEW_CORNER, readStoredCorner, type DevViewCorner } from './corner'
import { DEV_VIEW_STATE_EVENT, readDevViewState, sendDevViewCommand } from './devViewRemote'
import type { DevViewWindow } from './markers'

/** The same look as Dev View's own round button (`DevView.client.tsx`). */
const STYLES = {
  trigger:
    'px-[11px] py-2 fixed z-[9996] appearance-none bg-[rgba(0,48,91,0.92)] border border-[rgba(255,255,255,0.72)] rounded-full shadow-[0_6px_18px_rgba(0,30,58,0.2)] text-white cursor-pointer font-mono text-[11px] font-extrabold leading-none transition-[opacity,transform,translate] duration-150 ease-[ease] hover:opacity-100 hover:outline-solid hover:outline-3 hover:outline-[#fb923c] hover:outline-offset-3 hover:-translate-y-px focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-3 focus-visible:outline-[#fb923c] focus-visible:outline-offset-3 focus-visible:-translate-y-px',
  triggerIdle: 'opacity-[0.78]',
  triggerActive: 'opacity-100 outline-solid outline-3 outline-[#fb923c] outline-offset-3 -translate-y-px',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Renders the remote Dev View button.
 *
 * @param props.controlWindow - The window whose Dev View the button drives (the main window).
 * @returns The round button, marked `data-dev-view-root` so Dev View never lists it.
 */
export default function DevViewRemote({ controlWindow }: { controlWindow: DevViewWindow }) {
  const [enabled, setEnabled] = useState(false)
  const [corner, setCorner] = useState<DevViewCorner>(DEFAULT_DEV_VIEW_CORNER)

  // The saved corner is read after mount, so the server and the first browser render agree.
  useEffect(() => {
    setCorner(readStoredCorner())
  }, [])

  // Follow the controlled Dev View's state, and ask it once now.
  useEffect(() => {
    const onState = (event: Event) => {
      const state = readDevViewState(event)
      if (state) setEnabled(state.enabled)
    }
    controlWindow.addEventListener(DEV_VIEW_STATE_EVENT, onState)
    sendDevViewCommand(controlWindow, { action: 'report' })
    return () => controlWindow.removeEventListener(DEV_VIEW_STATE_EVENT, onState)
  }, [controlWindow])

  return (
    <div data-dev-view-root="">
      {/* Remote Dev View button: switches Dev View on the source window */}
      <button
        className={`${STYLES.trigger} ${CORNER_LAYOUT_STYLES[corner].trigger} ${enabled ? STYLES.triggerActive : STYLES.triggerIdle}`}
        type="button"
        aria-pressed={enabled}
        data-kr-action="dev-view-source-window"
        title="Dev View on the source window: overlays and the panel appear over the page this window was opened from"
        onClick={() => sendDevViewCommand(controlWindow, { action: 'toggle' })}
      >
        Dev View
      </button>
    </div>
  )
}
