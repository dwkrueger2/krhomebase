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
 * 2. Whenever the page changes, it writes the parameter back with `history.replaceState` (no new history entry, as
 *    the frame does for `?section=`).
 * 3. It names the page for the last breadcrumb step (`setSubPageLabel`), and removes the name when the screen goes.
 * 4. It follows `openSection(sectionId, subPage)` requests made while the screen is already showing. A request made
 *    before the screen appears needs nothing here: the frame writes the parameter first, and step 1 reads it.
 *
 * A copy drawn in a pop-out keeps its own page and leaves the address bar and the breadcrumb alone. Outside the frame
 * (tests) the hook simply holds the chosen page.
 *
 * A page that is not in `pages` (an unknown value, or a page this viewer may not see) falls back to the first page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SECTION_SUB_PAGE_PARAMS, type BuiltInSectionId } from '@/components/shell/navigation'
import { useSectionPlace, useShellNavigation } from '@/components/shell/shellNavigation'

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
}

/**
 * Holds the page open inside the current section and keeps the address bar and breadcrumb in step with it.
 *
 * @param options - The pages the viewer may open, and old address values to accept.
 * @returns The open page's id (the first page when nothing valid was chosen), and a function to open another page.
 */
export function useSectionSubPage<T extends string>({ pages, aliases }: SectionSubPageOptions<T>): [T | undefined, (pageId: T) => void] {
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

  // Step 4: a request seen when the screen appeared was already handled through the address; only newer ones count.
  const seenNonceRef = useRef(subPageRequest?.nonce ?? 0)
  useEffect(() => {
    if (!subPageRequest || subPageRequest.nonce <= seenNonceRef.current) return
    seenNonceRef.current = subPageRequest.nonce
    if (!ownsAddress || subPageRequest.sectionId !== sectionId) return
    const requested = resolve(subPageRequest.subPage)
    if (requested) setChosen(requested)
  }, [ownsAddress, resolve, sectionId, subPageRequest])

  // Step 2: write the open page into the address.
  useEffect(() => {
    if (!ownsAddress || !param || !current) return
    const url = new URL(window.location.href)
    if (url.searchParams.get(param) === current) return
    url.searchParams.set(param, current)
    window.history.replaceState(null, '', url)
  }, [current, ownsAddress, param])

  // Step 3: name the page for the breadcrumb while this screen shows it.
  useEffect(() => {
    if (!ownsAddress || !sectionId) return
    setSubPageLabel(sectionId, label)
    return () => setSubPageLabel(sectionId, null)
  }, [label, ownsAddress, sectionId, setSubPageLabel])

  return [current, setChosen]
}
