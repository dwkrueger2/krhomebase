// file: apps/web/components/shell/shellHistory.ts
/**
 * The browser's Back and Forward buttons for the application frame (report of Nov 13, 2026: Back left the app for
 * the login page instead of going back to the contact the person had open before).
 *
 * The app is one page (`/`). The frame keeps the open screen in the address: `?section=` (a section, an outside tool
 * or an open item such as `contact:<id>`) and, for a section with pages inside it, its second parameter
 * (`SECTION_SUB_PAGE_PARAMS`). This file holds the rules for writing that address into the browser's history:
 *
 * - **Push or replace.** A move to another screen adds a history entry (`history.pushState`), so Back returns to the
 *   screen before it. Every other write replaces the current entry (`history.replaceState`): the first draw, filling
 *   in a default section or page, and tidying parameters. `sectionWriteMode` and `subPageWriteMode` decide which.
 * - **Reading an entry back.** When Back or Forward lands on an entry, `readShellAddress` reads the screen it names and
 *   `resolvePoppedScreen` decides how to show it (open the section, show the open item, or reopen an item that was
 *   closed meanwhile).
 * - **Entry numbers.** Each entry written here carries its position (`SHELL_HISTORY_INDEX_KEY` in `history.state`), so
 *   the frame can tell how far a Back or Forward moved and undo it.
 * - **Unsaved work (decision D18, Nov 13, 2026).** A screen that would lose unsaved work registers a leave guard
 *   (`addShellLeaveGuard`): an outside tool with unsaved work (`ApplicationShell`) or a Settings page with a draft
 *   (`useSectionSubPage` with `confirmLeave`, from `SettingsAreaFrame`). Every `popstate` listener asks
 *   `decideShellPopState` first. When a guard blocks the move, the browser is put back on the page's own entry and the
 *   guard asks the person; Continue goes to the entry Back or Forward asked for, Cancel stays. The entry numbers stay
 *   right either way.
 *
 * The decisions are plain functions so they can be tested without a browser (`shellHistory.test.ts`). Only
 * `writeShellHistory` and `noteShellHistoryEntry` touch `window.history`; both take a stand-in for tests.
 *
 * vinext (the Next.js runtime) wraps `pushState` and `replaceState`; it keeps the state written here and adds its own
 * keys beside it, and it treats these entries as same-page moves, so Back and Forward do not reload the page.
 */

import {
  isShellSectionId,
  openItemSectionId,
  parseOpenItemSectionId,
  SECTION_SUB_PAGE_PARAMS,
  type OpenItemParentId,
  type ShellNavItem,
  type ShellOpenItem,
  type ShellSectionId,
} from '@/components/shell/navigation'

/** The key of the entry number in `history.state`. */
export const SHELL_HISTORY_INDEX_KEY = 'krShellHistoryIndex'

/** How an address change is written: not at all, over the current entry, or as a new entry. */
export type HistoryWriteMode = 'none' | 'replace' | 'push'

/** The part of `window.history` used here (tests pass a stand-in). */
export type ShellHistoryLike = Pick<History, 'pushState' | 'replaceState' | 'state' | 'go' | 'back'>

/** The number of the entry the person is on, as last written or reached. Starts at 0 for the first entry. */
let currentEntryIndex = 0
/** The address of that entry, as last written or reached (used when an entry carries no number). */
let currentEntryHref = ''

/**
 * Reads the entry number from a history state.
 *
 * @param state - `history.state` or a `popstate` event's `state`.
 * @returns The number, or null when the entry was not written by the frame (or its state was replaced by other code).
 */
export function readHistoryIndex(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>)[SHELL_HISTORY_INDEX_KEY]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Decides how the frame writes a new `?section=` address (the frame's address sync, `ApplicationShell`).
 *
 * @param currentSearch - The address's query now (`window.location.search`; a leading `?` is allowed).
 * @param nextSearch - The query the frame wants.
 * @returns `none` when nothing changes; `push` when the section changes (another screen); `replace` when the address
 *   named no section yet (the first draw, filling in the default) or only other parameters change (tidying).
 */
export function sectionWriteMode(currentSearch: string, nextSearch: string): HistoryWriteMode {
  const current = new URLSearchParams(currentSearch)
  const next = new URLSearchParams(nextSearch)
  if (current.toString() === next.toString()) return 'none'
  const currentSection = current.get('section')
  if (!currentSection) return 'replace'
  return currentSection === next.get('section') ? 'replace' : 'push'
}

/**
 * Decides how a section's screen writes the page open inside it (`useSectionSubPage`).
 *
 * @param addressValue - The parameter's value in the address now, or null when absent.
 * @param resolvedAddressValue - That value read as a page this viewer may open (aliases applied), or null.
 * @param nextValue - The page now open.
 * @param firstWrite - True for the screen's first write after it appeared.
 * @returns `none` when the address already shows the page; `replace` for the first write (the default page or the
 *   page named by an old link), for an absent or unknown value (filling in the default) and for an old alias of the
 *   same page (tidying); otherwise `push` (the person chose another page).
 */
export function subPageWriteMode(addressValue: string | null, resolvedAddressValue: string | null, nextValue: string, firstWrite: boolean): HistoryWriteMode {
  if (addressValue === nextValue) return 'none'
  if (firstWrite || resolvedAddressValue === null || resolvedAddressValue === nextValue) return 'replace'
  return 'push'
}

/**
 * Builds the address for a section: `?section=<id>`, keeping that section's own page parameter and every unrelated
 * parameter (for example an old `contactId` bookmark), and dropping the page parameters of other sections.
 *
 * @param href - The address now.
 * @param sectionId - The section to name.
 * @returns A new URL.
 */
export function sectionAddress(href: string, sectionId: ShellSectionId): URL {
  const url = new URL(href)
  url.searchParams.set('section', sectionId)
  for (const [ownerId, param] of Object.entries(SECTION_SUB_PAGE_PARAMS)) {
    if (ownerId !== sectionId) url.searchParams.delete(param)
  }
  return url
}

/** The screen an address names. */
export interface ShellAddressScreen {
  /** The section named by `?section=`, when it is a real section or an open-item id; otherwise null. */
  sectionId: ShellSectionId | null
  /** Set when the section is an open item (`contact:<id>`, `billing:<clientId>`). */
  item: { parentId: OpenItemParentId; itemId: string } | null
}

/**
 * Reads the screen an address names.
 *
 * @param search - The address's query (`window.location.search`).
 * @param navItems - The whole menu, outside tools included.
 * @returns The section and, for an open item, the item. Unknown or missing values give nulls.
 */
export function readShellAddress(search: string, navItems: readonly ShellNavItem[]): ShellAddressScreen {
  const requested = new URLSearchParams(search).get('section')
  const item = parseOpenItemSectionId(requested)
  if (item) return { sectionId: openItemSectionId(item.parentId, item.itemId), item }
  return { sectionId: isShellSectionId(requested, navItems) ? requested : null, item: null }
}

/** How the frame shows the screen of an entry reached with Back or Forward. */
export type PoppedScreen =
  /** Open this section (or open item that is still open). `tidy`: the address named nothing usable; rewrite it. */
  | { kind: 'section'; sectionId: ShellSectionId; tidy: boolean }
  /** Reopen an item that was closed after this entry was made. */
  | { kind: 'reopen'; item: ShellOpenItem }

/**
 * Decides how to show the screen of an entry reached with Back or Forward.
 *
 * Unlike the first load (which falls back to the parent row when the item is no longer open), an item closed since
 * the entry was made is reopened, because the person is going back to a screen they had open. Its menu label comes
 * from the open or recent lists, or is its id until its screen loads the real name.
 *
 * @param address - The screen the entry names (`readShellAddress`).
 * @param openItems - The items open now.
 * @param recentItems - The recently accessed items (closing an item keeps it here).
 * @param fallbackSectionId - Section to open when the address names nothing usable.
 * @returns The section to open, or the item to reopen.
 */
export function resolvePoppedScreen(
  address: ShellAddressScreen,
  openItems: readonly ShellOpenItem[],
  recentItems: readonly ShellOpenItem[],
  fallbackSectionId: ShellSectionId,
): PoppedScreen {
  const { item } = address
  if (item) {
    const same = (candidate: ShellOpenItem): boolean => candidate.parentId === item.parentId && candidate.itemId === item.itemId
    if (openItems.some(same)) return { kind: 'section', sectionId: openItemSectionId(item.parentId, item.itemId), tidy: false }
    const label = recentItems.find(same)?.label ?? item.itemId
    return { kind: 'reopen', item: { parentId: item.parentId, itemId: item.itemId, label } }
  }
  if (address.sectionId) return { kind: 'section', sectionId: address.sectionId, tidy: false }
  return { kind: 'section', sectionId: fallbackSectionId, tidy: true }
}

/**
 * Writes an address into the browser's history and numbers the entry.
 *
 * @param mode - `push` adds an entry (numbered one past the current one); `replace` rewrites the current entry and
 *   keeps its number; `none` does nothing.
 * @param url - The address to write.
 * @param history - Where to write; the browser's `window.history` by default.
 * @returns The entry number now current.
 */
export function writeShellHistory(mode: HistoryWriteMode, url: URL | string, history: ShellHistoryLike | undefined = browserHistory()): number {
  if (mode === 'none' || !history) return currentEntryIndex
  // The number in the entry's own state wins; other code (an old-bookmark tidy) may have replaced it with null.
  const base = readHistoryIndex(history.state) ?? currentEntryIndex
  currentEntryIndex = mode === 'push' ? base + 1 : base
  currentEntryHref = String(url)
  const state = { [SHELL_HISTORY_INDEX_KEY]: currentEntryIndex }
  if (mode === 'push') history.pushState(state, '', url)
  else history.replaceState(state, '', url)
  return currentEntryIndex
}

/**
 * Notes the entry the person reached with Back or Forward (call it from the `popstate` listener).
 *
 * @param state - The event's `state`.
 * @returns The entry number before the move (`from`) and after it (`to`, null when the entry carries none).
 */
export function noteShellHistoryEntry(state: unknown): { from: number; to: number | null } {
  const from = currentEntryIndex
  const to = readHistoryIndex(state)
  if (to !== null) currentEntryIndex = to
  return { from, to }
}

/** The entry number now current (for logging). */
export function currentShellHistoryIndex(): number {
  return currentEntryIndex
}

/**
 * A screen that would lose unsaved work if Back or Forward took the person away from it.
 */
export interface ShellLeaveGuard {
  /** True when moving to the address `search` names would leave the screen while it has unsaved work. */
  blocks: (search: string) => boolean
  /** Asks the person whether to leave (the screen's own dialog); calls `proceed` when they choose to. */
  ask: (proceed: () => void) => void
}

const leaveGuards = new Set<ShellLeaveGuard>()

/**
 * Registers a leave guard for as long as the screen shows.
 *
 * @param guard - The guard.
 * @returns A function that removes it.
 */
export function addShellLeaveGuard(guard: ShellLeaveGuard): () => void {
  leaveGuards.add(guard)
  return () => {
    leaveGuards.delete(guard)
  }
}

/**
 * What a `popstate` listener does with one Back or Forward.
 * - `proceed`: show the screen the entry names.
 * - `blocked`: a guard stopped it; the browser is going back to the page's own entry and the guard is asking.
 * - `skip`: the frame's own move back to the page's entry; do nothing.
 */
export type ShellPopDecision = { kind: 'proceed'; from: number; to: number | null } | { kind: 'blocked' } | { kind: 'skip' }

/** The decision for each `popstate` event, so every listener of the same event gets the same answer. */
const popDecisions = new WeakMap<object, ShellPopDecision>()
/** Set while the frame moves the browser back to the page's entry; that `popstate` is skipped. */
let skipNextPop = false
/** Set while the frame moves on after the person chose Continue; that `popstate` is not guarded again. */
let passNextPop = false

/**
 * Decides what to do with one Back or Forward. Every `popstate` listener of the frame calls it first, with the event;
 * the first call decides (and, when a guard blocks, moves the browser back and asks), the others get the same answer.
 *
 * @param event - The `popstate` event (any object with the event's `state`; tests pass a plain object).
 * @param href - The address the browser moved to (`window.location.href`).
 * @param history - The browser's history; tests pass a stand-in.
 * @returns The decision.
 */
export function decideShellPopState(event: { state: unknown }, href: string, history: ShellHistoryLike | undefined = browserHistory()): ShellPopDecision {
  const known = popDecisions.get(event)
  if (known) return known
  const { from, to } = noteShellHistoryEntry(event.state)
  let decision: ShellPopDecision
  if (skipNextPop) {
    skipNextPop = false
    decision = { kind: 'skip' }
  } else if (passNextPop || !history) {
    passNextPop = false
    decision = { kind: 'proceed', from, to }
  } else {
    const search = new URL(href).search
    const guard = [...leaveGuards].find((candidate) => candidate.blocks(search))
    decision = guard ? blockPop(guard, history, from, to) : { kind: 'proceed', from, to }
  }
  if (decision.kind === 'proceed') currentEntryHref = href
  popDecisions.set(event, decision)
  return decision
}

/**
 * Puts the browser back on the page's own entry, then lets the guard ask. Continue moves to the entry Back or Forward
 * asked for (by the entry numbers), and that move is not guarded again.
 *
 * When the entry reached carries no number (other code replaced its state), the page's address is added again as a
 * new entry instead; Continue then goes back one entry, to the one asked for.
 */
function blockPop(guard: ShellLeaveGuard, history: ShellHistoryLike, from: number, to: number | null): ShellPopDecision {
  if (to !== null && to !== from) {
    // Undo the move: the entry numbers come back to `from` when the skipped popstate arrives.
    skipNextPop = true
    history.go(from - to)
    guard.ask(() => {
      passNextPop = true
      history.go(to - from)
    })
  } else {
    const pageHref = currentEntryHref
    if (pageHref) writeShellHistory('push', pageHref, history)
    guard.ask(() => {
      passNextPop = true
      history.back()
    })
  }
  return { kind: 'blocked' }
}

/**
 * Tells whether an address leaves an outside tool shown in the workspace (its leave guard, `ApplicationShell`).
 *
 * @param search - The address's query.
 * @param navItems - The whole menu.
 * @param activeSectionId - The section on show.
 * @returns True when the address names another section (or nothing usable).
 */
export function addressLeavesSection(search: string, navItems: readonly ShellNavItem[], activeSectionId: ShellSectionId): boolean {
  return readShellAddress(search, navItems).sectionId !== activeSectionId
}

/**
 * Tells whether an address leaves the page open inside a section (its leave guard, `useSectionSubPage`).
 *
 * @param search - The address's query.
 * @param sectionId - The section on show.
 * @param param - The section's page parameter (`SECTION_SUB_PAGE_PARAMS`).
 * @param resolvePage - Reads a parameter value as a page this viewer may open (aliases applied), or null.
 * @param defaultPage - The page shown when the address names none (the first page).
 * @param currentPage - The page on show.
 * @returns True when the address names another section, or another page of this one.
 */
export function addressLeavesSubPage(
  search: string,
  sectionId: string,
  param: string,
  resolvePage: (raw: string | null) => string | null,
  defaultPage: string | undefined,
  currentPage: string | undefined,
): boolean {
  const params = new URLSearchParams(search)
  if (params.get('section') !== sectionId) return true
  return (resolvePage(params.get(param)) ?? defaultPage) !== currentPage
}

/** The browser's history, or undefined during a server draw. */
function browserHistory(): ShellHistoryLike | undefined {
  return typeof window === 'undefined' ? undefined : window.history
}
