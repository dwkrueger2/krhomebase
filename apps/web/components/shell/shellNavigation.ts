// file: apps/web/components/shell/shellNavigation.ts
/**
 * Lets a screen inside the frame ask the frame to open another section or an open item, for example the top-bar
 * search opening a contact, or a Billing tab opening the workspace (plan decision 5). The frame
 * (`ApplicationShell`) provides it; screens call `useShellNavigation().openSection('contacts')` or
 * `useShellNavigation().openItem('contacts', contactId, '[306] Dan Krueger')`.
 *
 * `useOpenItem()` tells an open item's screen which item it shows (the frame draws the same screen for every open
 * contact, wrapped in a different `OpenItemContext`), and lets it refresh the item's menu label.
 *
 * Outside the frame (tests, a screen drawn on its own) every call does nothing and returns false.
 */

import { createContext, useContext } from 'react'
import type { OpenItemParentId, ShellSectionId } from '@/components/shell/navigation'

/**
 * A request to show a page inside a section (for example the Settings landing opening Firm Settings at its Stripe
 * page). `nonce` grows with every request, so a screen that is already showing can tell a new request from one it
 * has already seen.
 */
export interface SubPageRequest {
  sectionId: string
  subPage: string
  nonce: number
}

export interface ShellNavigation {
  /**
   * Opens the section with this menu id. Returns false when no such section exists. `subPage` names the page to show
   * inside it (the value of the section's second address parameter, `SECTION_SUB_PAGE_PARAMS`).
   */
  openSection: (sectionId: string, subPage?: string) => boolean
  /**
   * Opens an item under a parent row (a contact under Clients & Contacts) and shows it. Past five open items under
   * that row, the oldest is closed. Returns false outside the frame.
   */
  openItem: (parentId: OpenItemParentId, itemId: string, label: string) => boolean
  /** Closes an open item. When it was showing, its parent row opens instead. */
  closeItem: (parentId: OpenItemParentId, itemId: string) => void
  /** Names the page open inside a section, for the last breadcrumb step. Null removes it. */
  setSubPageLabel: (sectionId: ShellSectionId, label: string | null) => void
  /** The latest `openSection(..., subPage)` request, or null when there has been none. */
  subPageRequest: SubPageRequest | null
}

const NO_FRAME: ShellNavigation = {
  openSection: () => false,
  openItem: () => false,
  closeItem: () => undefined,
  setSubPageLabel: () => undefined,
  subPageRequest: null,
}

export const ShellNavigationContext = createContext<ShellNavigation>(NO_FRAME)

/** The frame's navigation, or a stand-in that does nothing when there is no frame. */
export function useShellNavigation(): ShellNavigation {
  return useContext(ShellNavigationContext)
}

/** The item an open-item screen shows, and where. */
export interface OpenItemScope {
  parentId: OpenItemParentId
  itemId: string
  /** Where the screen is drawn: the workspace, or a pop-out. */
  place: 'workspace' | 'popout'
  /** Replaces the item's menu label (for example after the contact's name changed). */
  setLabel: (label: string) => void
}

export const OpenItemContext = createContext<OpenItemScope | null>(null)

/** The item this screen shows, or null when it is not drawn as an open item. */
export function useOpenItem(): OpenItemScope | null {
  return useContext(OpenItemContext)
}

/**
 * Where a built-in section's screen is drawn. The frame wraps every built-in panel in it, because the same panel can
 * be shown in the workspace and in a pop-out at once; only the workspace copy owns the address bar and the breadcrumb.
 */
export interface SectionPlace {
  sectionId: ShellSectionId
  place: 'workspace' | 'popout'
}

export const SectionPlaceContext = createContext<SectionPlace | null>(null)

/** Where this screen is drawn, or null outside the frame (tests, a screen drawn on its own). */
export function useSectionPlace(): SectionPlace | null {
  return useContext(SectionPlaceContext)
}
