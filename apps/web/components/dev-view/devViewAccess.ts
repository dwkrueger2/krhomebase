// file: apps/web/components/dev-view/devViewAccess.ts
/**
 * Who may load Dev View (plan `docs/12_Homebase_Feedback_Plan.md`, stage F4, decision 1; the requester, Nov 15, 2026).
 *
 * - In development (`pnpm dev`) Dev View is always allowed, as before.
 * - In the deployed app it is allowed only after the API has said the signed-in person is an Internal Developer (the
 *   `developer_tools` permission). The Feedback pop-out asks the API (`viewer.isDeveloper`) and calls
 *   `grantDevViewAccess()` when the answer is yes. Until then `DevViewLoader` renders nothing and the Dev View code
 *   (a separate chunk) is never downloaded.
 *
 * The grant lasts until the page is reloaded. It is a convenience, not a security boundary: Dev View only reads the
 * page's own `data-kr-*` markers, which are not secrets. Every pop-out window is drawn by the main window's React, so
 * this one module-level flag covers the main window and every pop-out.
 */

import { useSyncExternalStore } from 'react'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'

let granted = IS_DEVELOPMENT
const listeners = new Set<() => void>()

/** Allows Dev View for the rest of this page's life (the API said the person is an Internal Developer). */
export function grantDevViewAccess(): void {
  if (granted) return
  granted = true
  for (const listener of listeners) listener()
}

/** Whether Dev View may load now. */
export function hasDevViewAccess(): boolean {
  return granted
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React hook: true once Dev View may load (always true in development). */
export function useDevViewAccess(): boolean {
  return useSyncExternalStore(subscribe, hasDevViewAccess, () => IS_DEVELOPMENT)
}
