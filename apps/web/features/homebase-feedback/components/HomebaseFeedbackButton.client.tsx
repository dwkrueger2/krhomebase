'use client'
// file: apps/web/features/homebase-feedback/components/HomebaseFeedbackButton.client.tsx
/**
 * The Feedback button in the top bar (plan `docs/12_Homebase_Feedback_Plan.md`, stage F2; decision 4: everyone signed
 * in may send feedback). `app/page.tsx` passes it to the frame as `topBarFeedback`, so `components/shell` stays free
 * of feature code; the top bar only gives it a place before the sync light.
 *
 * A click opens the Feedback pop-out: its own browser window beside the main window, opened inside the click
 * (`openPopoutBrowserWindow`, or the browser blocks it) and drawn by this window's React (`PopOutBrowserWindow`), so the panel can read and outline
 * this window's page. A second click while it is open brings it to the front. When the browser blocks pop-ups, the
 * panel opens in the in-page `PopOutWindow` instead. Closing the window ends it; the main window closing or
 * reloading closes it too (`PopOutBrowserWindow`). In development the pop-out's Dev View button drives the main
 * window's Dev View (`devViewFor="opener"`), so the overlays appear on the page the request is about.
 */

import { useState } from 'react'
import PopOutBrowserWindow, { openPopoutBrowserWindow } from '@/components/shell/PopOutBrowserWindow.client'
import PopOutWindow from '@/components/shell/PopOutWindow.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { L } from '@/lib/KRUtilities'
import { clearMarkerHighlight } from '../markerHighlight'
import HomebaseFeedbackPanel from './HomebaseFeedbackPanel.client'

/**
 * The Feedback window opens beside the main window (the requester, Nov 14, 2026), as tall as it and 640px wide, so it
 * does not cover the page it describes (`openPopoutBrowserWindow`, `side: 'beside'`).
 */
const FEEDBACK_PLACEMENT = { width: 640, height: 'match', side: 'beside' } as const

/** Where the panel is open: its own browser window, inside this page (pop-ups blocked), or nowhere. */
type FeedbackPlace = { kind: 'window'; popup: Window } | { kind: 'in-page' } | null

const LAYOUT_STYLES = {
  // The top bar's icon button size (TopTitleBar's `iconButton`, as the clock and the bell): a word beside the icon
  // squeezed the page title at desktop widths near 1024px, so the word is in the tooltip and for screen readers.
  button: 'min-h-[32px] w-[34px] p-0 inline-flex items-center justify-center',
  icon: 'size-[16px] shrink-0',
  label: 'sr-only',
} as const

const STYLES = {
  // The top bar's button look (TopTitleBar's `button`).
  button:
    'rounded-[2px] border border-white/[.12] bg-(--kr-theme-brand-secondary)/[.34] text-[12px] font-bold text-white cursor-pointer hover:bg-white/[.12] focus-visible:outline-2 focus-visible:outline-white/70',
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
 * Renders the button and, while open, the Feedback pop-out.
 *
 * @returns The button (`data-kr-element="homebase-feedback-button"`) and the open pop-out.
 */
export default function HomebaseFeedbackButton() {
  const [place, setPlace] = useState<FeedbackPlace>(null)

  function open(): void {
    if (place?.kind === 'window' && !place.popup.closed) {
      place.popup.focus()
      return
    }
    if (place?.kind === 'in-page') return
    const popup = openPopoutBrowserWindow(0, FEEDBACK_PLACEMENT)
    L(`[HOMEBASE_FEEDBACK_BUTTON:62] open place=${popup ? 'window' : 'in-page'}`)
    setPlace(popup ? { kind: 'window', popup } : { kind: 'in-page' })
  }

  function close(): void {
    clearMarkerHighlight(window)
    setPlace(null)
  }

  // Made only once open (after a click, in the browser): `window` does not exist while the server draws the page.
  const panel = place ? <HomebaseFeedbackPanel sourceWindow={window} /> : null

  return (
    <>
      {/* The top-bar button: an icon button beside the clock and the bell */}
      <button
        type="button"
        className={`${LAYOUT_STYLES.button} ${STYLES.button}`}
        aria-label="Send feedback about KR Homebase"
        aria-expanded={place !== null}
        data-kr-element="homebase-feedback-button"
        title="Feedback about KR Homebase: a feature, an issue or a question"
        onClick={open}
      >
        <KRHomebaseIcons.Feedback className={LAYOUT_STYLES.icon} />
        <span className={LAYOUT_STYLES.label}>Feedback</span>
      </button>

      {/* The Feedback pop-out: its own window, or inside this page when pop-ups are blocked */}
      {place?.kind === 'window' ? (
        <PopOutBrowserWindow popupWindow={place.popup} title="Feedback" onClose={close} devViewFor="opener">
          {panel}
        </PopOutBrowserWindow>
      ) : null}
      {place?.kind === 'in-page' ? (
        <PopOutWindow title="Feedback" onClose={close}>
          {panel}
        </PopOutWindow>
      ) : null}
    </>
  )
}
