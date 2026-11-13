'use client'
// file: apps/web/components/ui/unsavedChanges.client.ts
/**
 * Unsaved changes, reported up to the frame that can leave a page (Settings plan, Firm Settings critique of
 * Nov 12, 2026). A page with a draft calls `useReportUnsavedChanges(key, dirty)`; a frame that switches pages (the
 * Settings tab strip, `features/settings/components/SettingsAreaFrame.client.tsx`) provides `UnsavedChangesContext`
 * and asks "Leave without saving?" before it unmounts a page that has changes.
 *
 * Shared because pages from several features report to it; it knows nothing about any feature. Outside a provider
 * the hook does nothing.
 */

import { createContext, useContext, useEffect } from 'react'

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
  useEffect(() => {
    reporter?.report(key, dirty)
    return () => reporter?.report(key, false)
  }, [reporter, key, dirty])
}
