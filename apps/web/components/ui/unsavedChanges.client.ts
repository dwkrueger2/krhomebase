'use client'
// file: apps/web/components/ui/unsavedChanges.client.ts
/**
 * Unsaved changes, reported up to the frame that can leave a page (Settings plan, Firm Settings critique of
 * Nov 12, 2026). A page with a draft calls `useReportUnsavedChanges(key, dirty)`; a frame that switches pages (the
 * Settings tab strip, `features/settings/components/SettingsAreaFrame.client.tsx`) provides `UnsavedChangesContext`
 * and asks "Leave without saving?" before it unmounts a page that has changes.
 *
 * Shared because pages from several features report to it; it knows nothing about any feature. Outside a provider
 * the hook reports only to the page-wide record below.
 *
 * Page-wide record (web patch 566, Nov 17, 2026): every report also goes to one list for the whole page
 * (`reportUnsavedWork`, `hasUnsavedWork`), so the Log out button can ask "Leave without saving?" first
 * (`components/shell/useConfirmedLogout.client.tsx`). The "Leave site?" warnings (`useUnloadWarning`) report to it as
 * well. Pop-outs are drawn by the main window's React, so their screens report to the same list.
 */

import { createContext, useContext, useEffect, useId } from 'react'

/** The screens that now hold unsaved work, by a key unique for each screen on show. */
const unsavedWork = new Set<string>()

/**
 * Records whether one screen holds unsaved work, for the page-wide check.
 *
 * @param key - A key unique for the screen (the hooks add `useId()`).
 * @param dirty - True while it holds changes that are not saved.
 */
export function reportUnsavedWork(key: string, dirty: boolean): void {
  if (dirty) unsavedWork.add(key)
  else unsavedWork.delete(key)
}

/** True while any screen on this page (pop-outs included) holds unsaved work. */
export function hasUnsavedWork(): boolean {
  return unsavedWork.size > 0
}

export interface UnsavedChangesReporter {
  /** Records whether the page known as `key` has changes that are not saved. */
  report: (key: string, dirty: boolean) => void
}

export const UnsavedChangesContext = createContext<UnsavedChangesReporter | null>(null)

/**
 * Tells the nearest frame whether this page has unsaved changes; the report is withdrawn when the page goes away.
 *
 * @param key - A name unique within the frame, for example `firm-profile`.
 * @param dirty - True while the page has changes that are not saved.
 */
export function useReportUnsavedChanges(key: string, dirty: boolean): void {
  const reporter = useContext(UnsavedChangesContext)
  const pageKey = `${key}#${useId()}`
  useEffect(() => {
    reporter?.report(key, dirty)
    reportUnsavedWork(pageKey, dirty)
    return () => {
      reporter?.report(key, false)
      reportUnsavedWork(pageKey, false)
    }
  }, [reporter, key, pageKey, dirty])
}
