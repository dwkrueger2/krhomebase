// file: apps/web/components/shell/openItemsStorage.ts
/**
 * Saves the open items and the recently accessed items for one person in `localStorage` (the browser's small
 * key-value store), so a browser refresh keeps them (plan decision 7). Pop-outs are not saved: a refresh closes them.
 *
 * Key: `kr-homebase:open-items:<scope>`, where the scope is the signed-in person's user id, so two people sharing a
 * browser do not see each other's lists. Value: `{ version: 1, openItems, recentItems }`.
 *
 * Each entry keeps its menu label as well as its id. The plan said "only ids"; the label is kept too so the menu can
 * name an item at once after a refresh, before its screen has loaded. The item's screen replaces the label from the
 * data store when it is shown (`useOpenItem().setLabel`). No contact data beyond the name and client number is saved.
 *
 * A missing, unreadable or damaged value gives empty lists. Storage that is full or blocked is ignored.
 */

import { OPEN_ITEM_PREFIXES, type OpenItemParentId, type ShellOpenItem } from '@/components/shell/navigation'

const STORAGE_PREFIX = 'kr-homebase:open-items:'
const STORAGE_VERSION = 1

/** What is saved for one person. */
export interface SavedShellItems {
  openItems: ShellOpenItem[]
  recentItems: ShellOpenItem[]
}

const EMPTY: SavedShellItems = { openItems: [], recentItems: [] }

/** The storage key for one person. */
export function openItemsStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`
}

function isParentId(value: unknown): value is OpenItemParentId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OPEN_ITEM_PREFIXES, value)
}

function readItems(value: unknown): ShellOpenItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): ShellOpenItem[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { parentId, itemId, label } = entry as Record<string, unknown>
    if (!isParentId(parentId) || typeof itemId !== 'string' || !itemId || itemId.length > 120) return []
    return [{ parentId, itemId, label: typeof label === 'string' ? label.slice(0, 200) : itemId }]
  })
}

/**
 * Reads the saved lists.
 *
 * @param scope - The signed-in person's user id. Empty: nothing is read.
 * @param storage - Where to read; the browser's `localStorage` by default (tests pass a stand-in).
 * @returns The saved lists, or empty lists.
 */
export function readSavedShellItems(scope: string, storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): SavedShellItems {
  if (!scope || !storage) return EMPTY
  try {
    const parsed = JSON.parse(storage.getItem(openItemsStorageKey(scope)) ?? 'null') as unknown
    if (typeof parsed !== 'object' || parsed === null || (parsed as { version?: unknown }).version !== STORAGE_VERSION) return EMPTY
    const record = parsed as Record<string, unknown>
    return { openItems: readItems(record.openItems), recentItems: readItems(record.recentItems) }
  } catch {
    return EMPTY
  }
}

/**
 * Saves the lists.
 *
 * @param scope - The signed-in person's user id. Empty: nothing is saved.
 * @param items - The lists to save.
 * @param storage - Where to save; the browser's `localStorage` by default.
 */
export function writeSavedShellItems(scope: string, items: SavedShellItems, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()): void {
  if (!scope || !storage) return
  try {
    storage.setItem(openItemsStorageKey(scope), JSON.stringify({ version: STORAGE_VERSION, openItems: items.openItems, recentItems: items.recentItems }))
  } catch {
    // Storage full or blocked: the lists are simply not kept after a refresh.
  }
}

/** The browser's localStorage, or undefined where it does not exist or is blocked. */
function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}
