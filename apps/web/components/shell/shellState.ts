// file: apps/web/components/shell/shellState.ts
/**
 * What the frame remembers: whether the left panel is collapsed, which section is open, whether the
 * Settings group is open, and which section (if any) is shown in the pop-out window.
 *
 * It is a plain reducer so it can be tested without a browser. `ApplicationShell` owns the state and
 * hands the pieces down; the header and the panels read the same `collapsed` value, which is how
 * their left columns stay the same width.
 */

import { SHELL_DEFAULT_SECTION_ID, SHELL_SETTINGS_CHILD_IDS, type ShellSectionId } from '@/components/shell/navigation'

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
}

/** Every change the frame can make to its state. */
export type ShellAction =
  | { type: 'toggleCollapsed' }
  | { type: 'selectSection'; sectionId: ShellSectionId }
  | { type: 'restoreSection'; sectionId: ShellSectionId }
  | { type: 'toggleSettings' }
  | { type: 'openPopout'; sectionId: ShellSectionId }
  | { type: 'closePopout'; sectionId: ShellSectionId }

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
    case 'closePopout':
      return { ...state, popoutSectionIds: state.popoutSectionIds.filter((id) => id !== action.sectionId) }
    default:
      return state
  }
}
