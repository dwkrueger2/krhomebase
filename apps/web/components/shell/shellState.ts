// file: apps/web/components/shell/shellState.ts
/**
 * What the frame remembers: whether the left panel is collapsed, which section is open, whether the
 * Settings group is open, which sections are shown in pop-out windows, the open items listed under the
 * menu rows, and the recently accessed items.
 *
 * It is a plain reducer so it can be tested without a browser. `ApplicationShell` owns the state and
 * hands the pieces down; the header and the panels read the same `collapsed` value, which is how
 * their left columns stay the same width.
 */

import {
  MAX_OPEN_ITEMS_PER_PARENT,
  openItemSectionId,
  parseOpenItemSectionId,
  SHELL_DEFAULT_SECTION_ID,
  SHELL_SETTINGS_CHILD_IDS,
  type OpenItemParentId,
  type ShellOpenItem,
  type ShellSectionId,
} from '@/components/shell/navigation'

/** How many recently accessed items the top-bar menu keeps (plan item 8). */
export const MAX_RECENT_ITEMS = 5

/** Everything the frame remembers. */
export interface ShellState {
  /** True when the left panel is the narrow icon strip. */
  collapsed: boolean
  /** Section shown in the workspace. */
  activeSectionId: ShellSectionId
  /** True when the Settings children are listed in the menu. */
  settingsExpanded: boolean
  /** Sections that are popped out, one window each. Empty when no pop-out is open. */
  popoutSectionIds: readonly ShellSectionId[]
  /** Open items, newest first, at most five per parent row. Saved per person; a refresh keeps them. */
  openItems: readonly ShellOpenItem[]
  /** Items opened most recently, newest first, at most five. Saved per person. Closing an item keeps it here. */
  recentItems: readonly ShellOpenItem[]
}

/** Every change the frame can make to its state. */
export type ShellAction =
  | { type: 'toggleCollapsed' }
  | { type: 'selectSection'; sectionId: ShellSectionId }
  | { type: 'restoreSection'; sectionId: ShellSectionId }
  | { type: 'toggleSettings' }
  | { type: 'openPopout'; sectionId: ShellSectionId }
  | { type: 'closePopout'; sectionId: ShellSectionId }
  | { type: 'openItem'; item: ShellOpenItem }
  | { type: 'closeItem'; parentId: OpenItemParentId; itemId: string }
  | { type: 'setItemLabel'; parentId: OpenItemParentId; itemId: string; label: string }
  | { type: 'restoreItems'; openItems: readonly ShellOpenItem[]; recentItems: readonly ShellOpenItem[] }

/**
 * Builds the starting state.
 *
 * @param sectionId - Section to open first (defaults to the Dashboard).
 * @returns State with the left panel expanded and no pop-out.
 */
export function createInitialShellState(sectionId: ShellSectionId = SHELL_DEFAULT_SECTION_ID): ShellState {
  return {
    collapsed: false,
    activeSectionId: sectionId,
    settingsExpanded: SHELL_SETTINGS_CHILD_IDS.includes(sectionId),
    popoutSectionIds: [],
    openItems: [],
    recentItems: [],
  }
}

function sameItem(item: ShellOpenItem, parentId: OpenItemParentId, itemId: string): boolean {
  return item.parentId === parentId && item.itemId === itemId
}

/** Removes one open item; when it was showing, its parent row opens instead, and its pop-out ends. */
function withoutItem(state: ShellState, parentId: OpenItemParentId, itemId: string): ShellState {
  const sectionId = openItemSectionId(parentId, itemId)
  return {
    ...state,
    openItems: state.openItems.filter((item) => !sameItem(item, parentId, itemId)),
    activeSectionId: state.activeSectionId === sectionId ? parentId : state.activeSectionId,
    popoutSectionIds: state.popoutSectionIds.filter((id) => id !== sectionId),
  }
}

/**
 * Applies one action to the state.
 *
 * Choosing the Settings row opens that section and flips the group, as in the old app. `restoreSection` opens a section named in the address bar and never closes the group. Choosing one
 * of its children keeps the group open. Collapsing the panel does not touch the open section. Any number of sections can be popped out at once.
 *
 * @param state - Current state.
 * @param action - Change to make.
 * @returns The next state (a new object).
 */
export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'toggleCollapsed':
      return { ...state, collapsed: !state.collapsed }
    case 'selectSection': {
      const isSettingsRow = action.sectionId === 'settings'
      const isSettingsChild = SHELL_SETTINGS_CHILD_IDS.includes(action.sectionId)
      return {
        ...state,
        activeSectionId: action.sectionId,
        settingsExpanded: isSettingsRow ? !state.settingsExpanded : isSettingsChild ? true : state.settingsExpanded,
      }
    }
    case 'restoreSection':
      // Used when the section comes from the address bar. Unlike selectSection it can be applied twice with the same result.
      return {
        ...state,
        activeSectionId: action.sectionId,
        settingsExpanded: state.settingsExpanded || SHELL_SETTINGS_CHILD_IDS.includes(action.sectionId) || action.sectionId === 'settings',
      }
    case 'toggleSettings':
      return { ...state, settingsExpanded: !state.settingsExpanded }
    case 'openPopout':
      // One pop-out for each section; popping out a section that is already out changes nothing.
      return state.popoutSectionIds.includes(action.sectionId)
        ? state
        : { ...state, popoutSectionIds: [...state.popoutSectionIds, action.sectionId] }
    case 'closePopout': {
      // Closing the pop-out of an open item also closes the item (plan decision 6).
      const item = parseOpenItemSectionId(action.sectionId)
      if (item) return withoutItem(state, item.parentId, item.itemId)
      return { ...state, popoutSectionIds: state.popoutSectionIds.filter((id) => id !== action.sectionId) }
    }
    case 'openItem': {
      // The item moves to the top of its parent's list; past five, the oldest is dropped (and its pop-out ends).
      const { item } = action
      const others = state.openItems.filter((open) => !sameItem(open, item.parentId, item.itemId))
      const siblings = others.filter((open) => open.parentId === item.parentId)
      const dropped = siblings.slice(MAX_OPEN_ITEMS_PER_PARENT - 1)
      const droppedIds: ShellSectionId[] = dropped.map((open) => openItemSectionId(open.parentId, open.itemId))
      return {
        ...state,
        activeSectionId: openItemSectionId(item.parentId, item.itemId),
        openItems: [item, ...others.filter((open) => !dropped.includes(open))],
        recentItems: [item, ...state.recentItems.filter((recent) => !sameItem(recent, item.parentId, item.itemId))].slice(0, MAX_RECENT_ITEMS),
        popoutSectionIds: state.popoutSectionIds.filter((id) => !droppedIds.includes(id)),
      }
    }
    case 'closeItem':
      return withoutItem(state, action.parentId, action.itemId)
    case 'setItemLabel': {
      const relabel = (item: ShellOpenItem): ShellOpenItem =>
        sameItem(item, action.parentId, action.itemId) && item.label !== action.label ? { ...item, label: action.label } : item
      const openItems = state.openItems.map(relabel)
      const recentItems = state.recentItems.map(relabel)
      const changed = openItems.some((item, index) => item !== state.openItems[index]) || recentItems.some((item, index) => item !== state.recentItems[index])
      return changed ? { ...state, openItems, recentItems } : state
    }
    case 'restoreItems':
      // Used once, after the page loads, with the lists saved for this person.
      return { ...state, openItems: action.openItems, recentItems: action.recentItems.slice(0, MAX_RECENT_ITEMS) }
    default:
      return state
  }
}
