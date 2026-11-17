'use client'
// file: apps/web/components/shell/useUnloadWarning.client.ts
/**
 * The one way to ask the browser for its "Leave site?" warning (web patch 566, the requester, Nov 17, 2026). A screen
 * with unsaved work that cannot ask with a dialog of its own (closing a browser window, reloading the tab) calls
 * `useUnloadWarning(key, dirty, windowsOf)`.
 *
 * Two things this adds over a bare `beforeunload` listener:
 *  - It stays quiet while KR Homebase signs the person out by force (`isForcedLeave`, `forcedLeave.ts`), so the
 *    maintenance countdown, the idle limit and an ended session always reach the login page.
 *  - It reports the work to the page-wide record (`reportUnsavedWork`), so the Log out button asks first.
 *
 * Used by the Feedback pop-out (`HomebaseFeedbackButton`) and the outside tool frame (`ExternalToolFrame`). Do not add
 * a `beforeunload` listener anywhere else in `apps/web`.
 */

import { useEffect, useId, useRef } from 'react'
import { isForcedLeave } from '@/components/shell/forcedLeave'
import { reportUnsavedWork } from '@/components/ui/unsavedChanges.client'

/**
 * A `beforeunload` listener that asks for the browser's warning unless the page is leaving by force.
 *
 * @param event - The browser's event.
 * @param forced - Whether the page is leaving by force (the tests pass it).
 */
export function warnUnlessForced(event: Pick<BeforeUnloadEvent, 'preventDefault'>, forced: boolean = isForcedLeave()): void {
  if (forced) return
  event.preventDefault()
}

/**
 * Warns before the given windows close or reload while `active` is true.
 *
 * @param key - A short name for the screen, for example `homebase-feedback`.
 * @param active - True while the screen holds unsaved work.
 * @param windowsOf - Returns the windows to guard; read when `active` turns true (a ref may be read here).
 * @param watch - Optional: a value that, when it changes, reads the windows again (the Feedback pop-out passes its place).
 */
export function useUnloadWarning(key: string, active: boolean, windowsOf: () => readonly (Window | null | undefined)[], watch?: unknown): void {
  const pageKey = `${key}#${useId()}`
  const windowsRef = useRef(windowsOf)
  windowsRef.current = windowsOf
  useEffect(() => {
    if (!active) return
    const targets = windowsRef.current().filter((target): target is Window => Boolean(target))
    const warn = (event: BeforeUnloadEvent): void => warnUnlessForced(event)
    for (const target of targets) target.addEventListener('beforeunload', warn)
    reportUnsavedWork(pageKey, true)
    return () => {
      for (const target of targets) target.removeEventListener('beforeunload', warn)
      reportUnsavedWork(pageKey, false)
    }
  }, [active, pageKey, watch])
}
