'use client'
// file: apps/web/components/shell/useSectionSubPage.client.ts
/**
 * Keeps track of the page open inside a section (Settings plan, stage 1): which tab of User, Application or Firm
 * Settings is showing. It replaces the old app's per-screen `?userSettingsSection=`, `?applicationSettingsTab=` and
 * `?firmSettingsSection=` handling with one shared piece.
 *
 * What it does, for the copy of the screen drawn in the workspace (`useSectionPlace().place === 'workspace'`):
 * 1. On first draw it reads the section's second address parameter (`SECTION_SUB_PAGE_PARAMS`), so an old link or a
 *    refresh opens the same page. Old values listed in `aliases` are read as their new page.
 * 2. Whenever the page changes, it writes the parameter back. Since Nov 13, 2026 (Back and Forward, `shellHistory.ts`)
 *    a page the person chooses adds a browser history entry (`history.pushState`), as the frame does for `?section=`;
 *    the first write after the screen appears, a default page and an old alias replace the entry instead
 *    (`subPageWriteMode`). A page chosen from a pop-out's request also replaces it.
 * 3. It names the page for the last breadcrumb step (`setSubPageLabel`), and removes the name when the screen goes.
 * 4. It follows `openSection(sectionId, subPage)` requests made while the screen is already showing. A request made
 *    before the screen appears needs nothing here: the frame writes the parameter first, and step 1 reads it.
 * 5. Back and Forward: when the browser moves to an entry of this section, it shows the page that entry names (the
 *    first page when it names none), without adding an entry.
 * 6. Unsaved changes (decision D18, Nov 13, 2026): with `confirmLeave`, a Back or Forward that would leave the page
 *    while it has unsaved changes (to another page of the section, or out of the section) is blocked: the browser is
 *    put back on the page's own entry and `confirmLeave.ask` asks the person ("Leave without saving?" in
 *    `SettingsAreaFrame`). Continue goes to the entry asked for; Cancel stays (`decideShellPopState`, shellHistory.ts).
 *
 * A copy drawn in a pop-out keeps its own page and leaves the address bar and the breadcrumb alone. Outside the frame
 * (tests) the hook simply holds the chosen page.
 *
 * A page that is not in `pages` (an unknown value, or a page this viewer may not see) falls back to the first page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SECTION_SUB_PAGE_PARAMS, type BuiltInSectionId } from '@/components/shell/navigation'
import { addressLeavesSubPage, addShellLeaveGuard, decideShellPopState, subPageWriteMode, writeShellHistory } from '@/components/shell/shellHistory'
import { useSectionPlace, useShellNavigation } from '@/components/shell/shellNavigation'
import { L } from '@/lib/KRUtilities'

/** One page of a section: its address value and its name for the tab and the breadcrumb. */
export interface SectionSubPage<T extends string = string> {
  id: T
  label: string
}

export interface SectionSubPageOptions<T extends string> {
  /** The pages this viewer may open, in tab order. The first is the default. */
  pages: readonly SectionSubPage<T>[]
  /** Old address values that now mean another page, for example `stripe-dev-tests` → `stripe-payment-configuration`. */
  aliases?: Readonly<Record<string, T>>
  /** Asks before Back or Forward leaves a page with unsaved changes (step 6). Absent: Back and Forward never ask. */
  confirmLeave?: SectionLeaveConfirm
}

/** How a section's frame says it has unsaved changes and asks before Back or Forward leaves them (step 6). */
export interface SectionLeaveConfirm {
  /** True while the open page has changes that are not saved. Read at the moment of the Back or Forward. */
  hasUnsavedChanges: () => boolean
  /** Asks the person whether to leave and lose the changes; calls `proceed` when they choose to. */
  ask: (proceed: () => void) => void
}

/**
 * Holds the page open inside the current section and keeps the address bar and breadcrumb in step with it.
 *
 * @param options - The pages the viewer may open, old address values to accept, and how to ask before Back or Forward
 *   leaves unsaved changes.
 * @returns The open page's id (the first page when nothing valid was chosen), and a function to open another page.
 */
export function useSectionSubPage<T extends string>({ pages, aliases, confirmLeave }: SectionSubPageOptions<T>): [T | undefined, (pageId: T) => void] {
  const sectionPlace = useSectionPlace()
  const { setSubPageLabel, subPageRequest } = useShellNavigation()
  const sectionId = sectionPlace?.sectionId
  const ownsAddress = sectionPlace?.place === 'workspace'
  const param = sectionId ? SECTION_SUB_PAGE_PARAMS[sectionId as BuiltInSectionId] : undefined

  /** Turns an address value into a page id this viewer may open, or null. */
  const resolve = useCallback(
    (raw: string | null | undefined): T | null => {
      if (!raw) return null
      const id = aliases?.[raw] ?? raw
      return pages.some((page) => page.id === id) ? (id as T) : null
    },
    [aliases, pages],
  )

  // Step 1: the page named in the address. Only a client-side draw reaches here (the server always draws the
  // Dashboard first), but the window check keeps a server draw safe.
  const [chosen, setChosen] = useState<T | null>(() =>
    ownsAddress && param && typeof window !== 'undefined' ? resolve(new URLSearchParams(window.location.search).get(param)) : null,
  )
  const current = chosen && pages.some((page) => page.id === chosen) ? chosen : pages[0]?.id
  const label = pages.find((page) => page.id === current)?.label ?? null

  // A page asked for from a pop-out: its write replaces the history entry instead of adding one (step 2).
  const replaceForPageRef = useRef<T | null>(null)
  // False until the first write after the screen appeared; that write never adds a history entry.
  const wroteOnceRef = useRef(false)

  // Step 4: a request seen when the screen appeared was already handled through the address; only newer ones count.
  const seenNonceRef = useRef(subPageRequest?.nonce ?? 0)
  useEffect(() => {
    if (!subPageRequest || subPageRequest.nonce <= seenNonceRef.current) return
    seenNonceRef.current = subPageRequest.nonce
    if (!ownsAddress || subPageRequest.sectionId !== sectionId) return
    const requested = resolve(subPageRequest.subPage)
    if (!requested) return
    if (subPageRequest.fromPopout) replaceForPageRef.current = requested
    setChosen(requested)
  }, [ownsAddress, resolve, sectionId, subPageRequest])

  // Step 2: write the open page into the address: a new history entry when the person chose another page, otherwise
  // over the current entry (subPageWriteMode).
  useEffect(() => {
    if (!ownsAddress || !param || !current) return
    const url = new URL(window.location.href)
    const addressValue = url.searchParams.get(param)
    let mode = subPageWriteMode(addressValue, resolve(addressValue), current, !wroteOnceRef.current)
    if (mode === 'push' && replaceForPageRef.current === current) mode = 'replace'
    replaceForPageRef.current = null
    wroteOnceRef.current = true
    if (mode === 'none') return
    url.searchParams.set(param, current)
    const index = writeShellHistory(mode, url)
    if (mode === 'push') L(`[SHELL_SUB_PAGE:122] push ${param}=${current} entry=${index}`)
  }, [current, ownsAddress, param, resolve])

  // Step 5: Back or Forward reached an entry of this section; show the page it names, without adding an entry.
  useEffect(() => {
    if (!ownsAddress || !param || !sectionId) return
    const handlePopState = (event: PopStateEvent): void => {
      // The frame decides once per Back or Forward; a blocked or skipped one changes nothing here (step 6).
      if (decideShellPopState(event, window.location.href).kind !== 'proceed') return
      const params = new URLSearchParams(window.location.search)
      if (params.get('section') !== sectionId) return
      setChosen(resolve(params.get(param)))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [ownsAddress, param, resolve, sectionId])

  // Step 6: while this screen owns the address, guard Back and Forward against leaving unsaved changes. The page and the
  // frame's callbacks are read through refs, so the guard is registered again only when the section or its pages change.
  const currentRef = useRef(current)
  currentRef.current = current
  const defaultPageRef = useRef(pages[0]?.id)
  defaultPageRef.current = pages[0]?.id
  const confirmLeaveRef = useRef(confirmLeave)
  confirmLeaveRef.current = confirmLeave
  const hasConfirmLeave = !!confirmLeave
  useEffect(() => {
    if (!ownsAddress || !param || !sectionId || !hasConfirmLeave) return
    return addShellLeaveGuard({
      blocks: (search) =>
        !!confirmLeaveRef.current?.hasUnsavedChanges() &&
        addressLeavesSubPage(search, sectionId, param, resolve, defaultPageRef.current, currentRef.current),
      ask: (proceed) => {
        L(`[SHELL_SUB_PAGE:155] Back or Forward held: unsaved changes on ${param}=${currentRef.current}`)
        if (confirmLeaveRef.current) confirmLeaveRef.current.ask(proceed)
        else proceed()
      },
    })
  }, [hasConfirmLeave, ownsAddress, param, resolve, sectionId])

  // Step 3: name the page for the breadcrumb while this screen shows it.
  useEffect(() => {
    if (!ownsAddress || !sectionId) return
    setSubPageLabel(sectionId, label)
    return () => setSubPageLabel(sectionId, null)
  }, [label, ownsAddress, sectionId, setSubPageLabel])

  return [current, setChosen]
}
