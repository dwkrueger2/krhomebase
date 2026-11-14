'use client'
// file: apps/web/features/settings/components/SettingsAreaFrame.client.tsx
/**
 * The frame shared by the three Settings areas (User, Application and Firm Settings; plan stage 1): one Menu Style
 * One tab strip with the chosen page under it, so every area has the same strip (plan section 3).
 *
 * Which page is open is held by `useSectionSubPage` (`components/shell`): it reads and writes the area's second
 * address parameter (`?userSettingsSection=`, `?applicationSettingsTab=`, `?firmSettingsSection=`) and names the page
 * for the third breadcrumb step, for example `Settings / Firm Settings / Firm Profile`. The area panel decides which
 * pages this viewer sees; a page given in `builtPages` is drawn as given, and every other page shows
 * `SettingsPagePlaceholder` with the stage that builds it.
 *
 * `focusPage` (Nov 12, 2026): the area may open a page itself, for example Firm Settings opening the Edit User tab
 * when a pencil in Users is clicked; each new `nonce` opens `id` once.
 *
 * Unsaved changes (Nov 12, 2026): a page reports its draft with `useReportUnsavedChanges` (`components/ui`); while
 * one does, choosing another tab asks "Leave without saving?" in `U6ConfirmationDialog` first, because the tab strip
 * unmounts the page it leaves and its draft would be lost.
 *
 * Back and Forward (decision D18, Nov 13, 2026): the frame passes `confirmLeave` to `useSectionSubPage`, so a browser
 * Back or Forward that would leave a page with a draft (to another tab of this area, or out of the area) first puts
 * the browser back on the page's entry and asks the same "Leave without saving?". Discard changes goes where Back or
 * Forward asked; Cancel stays on the page with its draft.
 *
 * @param props - The area's marker, accessible name, visible pages, old address aliases and its finished pages.
 * @returns The tab strip and the open page (`data-kr-id="<krId>"`).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { useSectionSubPage, type SectionLeaveConfirm } from '@/components/shell/useSectionSubPage.client'
import MenuStyleOne from '@/components/ui/MenuStyleOne.client'
import { UnsavedChangesContext, type UnsavedChangesReporter } from '@/components/ui/unsavedChanges.client'
import SettingsPagePlaceholder from '@/features/settings/components/SettingsPagePlaceholder.client'
import type { SettingsPageDefinition } from '@/features/settings/settingsAreas'

const LAYOUT_STYLES = {
  // The 36px right padding keeps the end of the tab strip clear of the workspace's pop-out button (as Contact Detail does).
  panel: 'p-[8px] pr-[36px] min-w-0',
} as const

export interface SettingsAreaFrameProps<T extends string> {
  /** The area's `data-kr-id`, for example `FirmSettingsPanel`. Also the prefix of the tab ids. */
  krId: string
  /** Accessible name of the tab strip, for example `Firm Settings pages`. */
  ariaLabel: string
  /** The pages this viewer sees, in tab order. */
  pages: readonly SettingsPageDefinition<T>[]
  /** Old address values that now mean another page. */
  aliases?: Readonly<Record<string, T>>
  /** Finished pages, by page id. A page missing here shows its placeholder. */
  builtPages?: Partial<Record<T, ReactNode>>
  /** A page the area wants shown now; each new `nonce` opens it once. */
  focusPage?: { id: T; nonce: number } | null
}

export default function SettingsAreaFrame<T extends string>({ krId, ariaLabel, pages, aliases, builtPages, focusPage }: SettingsAreaFrameProps<T>) {
  const unsavedRef = useRef(new Set<string>())
  // The move waiting for "Leave without saving?": another tab chosen here, or a browser Back or Forward.
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(null)
  // Back and Forward ask through the same dialog (useSectionSubPage step 6); the draft is read at that moment.
  const confirmLeave = useMemo<SectionLeaveConfirm>(
    () => ({
      hasUnsavedChanges: () => unsavedRef.current.size > 0,
      ask: (proceed) => setPendingLeave({ run: proceed }),
    }),
    [],
  )
  const [activePageId, setActivePageId] = useSectionSubPage<T>({ pages, aliases, confirmLeave })
  const reporter = useMemo<UnsavedChangesReporter>(
    () => ({
      report: (key, dirty) => {
        if (dirty) unsavedRef.current.add(key)
        else unsavedRef.current.delete(key)
      },
    }),
    [],
  )

  // The area asked for a page (each nonce once), once that page is in the list.
  const focusedNonce = useRef(0)
  useEffect(() => {
    if (!focusPage || focusPage.nonce <= focusedNonce.current || !pages.some((page) => page.id === focusPage.id)) return
    focusedNonce.current = focusPage.nonce
    setActivePageId(focusPage.id)
  }, [focusPage, pages, setActivePageId])

  /** Opens a page, asking first while the open page has unsaved changes. */
  function choosePage(pageId: T) {
    if (pageId === activePageId) return
    if (unsavedRef.current.size) setPendingLeave({ run: () => setActivePageId(pageId) })
    else setActivePageId(pageId)
  }

  const items = pages.map((page) => ({
    id: page.id,
    label: page.label,
    card: builtPages?.[page.id] ?? (
      <SettingsPagePlaceholder description={page.description} krId={`${krId}-${page.id}`} label={page.label} stage={page.stage ?? 'a later stage'} />
    ),
  }))

  return (
    <div className={LAYOUT_STYLES.panel} data-kr-id={krId}>
      {/* Area pages: the shared tab strip, the open page under it */}
      <UnsavedChangesContext.Provider value={reporter}>
        <MenuStyleOne
          props={{
            items,
            activeItemId: activePageId,
            onActiveItemChange: (itemId) => choosePage(itemId as T),
            ariaLabel,
            idPrefix: krId,
            menuKrId: `${krId}-tabs`,
          }}
        />
      </UnsavedChangesContext.Provider>
      <U6ConfirmationDialog
        confirmLabel="Discard changes"
        description="This page has changes that are not saved. Leave it and discard them?"
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          unsavedRef.current.clear()
          pendingLeave?.run()
          setPendingLeave(null)
        }}
        open={pendingLeave !== null}
        title="Leave without saving?"
      />
    </div>
  )
}
