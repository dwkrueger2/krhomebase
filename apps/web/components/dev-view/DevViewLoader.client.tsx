'use client'
// file: apps/web/components/dev-view/DevViewLoader.client.tsx
/**
 * Loads Dev View: always in development, and in the deployed app only for Internal Developers (stage F4 of
 * `docs/12_Homebase_Feedback_Plan.md`, decision 1; the requester, Nov 15, 2026).
 *
 * `app/layout.tsx` places this small component on every page, and `PopOutBrowserWindow` places one inside each
 * pop-out browser window with `targetWindow` set to that window, so the pop-out gets its own Dev View. A pop-out that
 * describes the main window's page (the Feedback pop-out) passes `controlWindow` instead: it then shows only a remote
 * Dev View button (`DevViewRemote.client.tsx`) that drives the main window's Dev View (Nov 13, 2026).
 *
 * Dev View and the remote button are separate chunks (`lazy`), downloaded only when they are first drawn. Whether they
 * may be drawn is `useDevViewAccess` (`devViewAccess.ts`): always in development; in the deployed app only after the
 * Feedback pop-out has heard from the API that the person is an Internal Developer. Everyone else renders nothing
 * here and never downloads the Dev View code.
 *
 * In the deployed app the round Dev View button is not drawn on the main window or on other pop-outs (the requester,
 * Nov 15, 2026): Dev View there is driven only from the Feedback pop-out's own button (`controlWindow`), so it is
 * seen only while Feedback is open, and closing Feedback switches it off. In development every button stays.
 *
 * Check after `pnpm build:web`: `Dev-View-Marker-Controls` must appear only in a Dev View chunk, never in the page's
 * main chunk (command in `Readme-dev-view.md`).
 */

import { lazy, Suspense } from 'react'
import { useDevViewAccess } from './devViewAccess'
import type { DevViewWindow } from './markers'

const DevView = lazy(() => import('./DevView.client'))
const DevViewRemote = lazy(() => import('./DevViewRemote.client'))
/** The round button on every window in development; in the deployed app only the Feedback pop-out's. */
const SHOW_OWN_BUTTON = process.env.NODE_ENV === 'development'

/**
 * Renders Dev View when it is allowed.
 *
 * @param props.targetWindow - The window to inspect; leave it out for the main window.
 * @param props.controlWindow - Show only a remote button that drives this window's Dev View (instead of inspecting).
 */
export default function DevViewLoader({ targetWindow, controlWindow }: { targetWindow?: DevViewWindow; controlWindow?: DevViewWindow }) {
  const allowed = useDevViewAccess()
  if (!allowed) return null
  if (controlWindow) {
    return (
      <Suspense fallback={null}>
        <DevViewRemote controlWindow={controlWindow} />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={null}>
      <DevView targetWindow={targetWindow} showTrigger={SHOW_OWN_BUTTON} />
    </Suspense>
  )
}
