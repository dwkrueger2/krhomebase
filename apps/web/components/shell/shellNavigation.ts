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
import type { OpenItemParentId } from '@/components/shell/navigation'

export interface ShellNavigation {
  /** Opens the section with this menu id. Returns false when no such section exists. */
  openSection: (sectionId: string) => boolean
  /**
   * Opens an item under a parent row (a contact under Clients & Contacts) and shows it. Past five open items under
   * that row, the oldest is closed. Returns false outside the frame.
   */
  openItem: (parentId: OpenItemParentId, itemId: string, label: string) => boolean
  /** Closes an open item. When it was showing, its parent row opens instead. */
  closeItem: (parentId: OpenItemParentId, itemId: string) => void
}

const NO_FRAME: ShellNavigation = { openSection: () => false, openItem: () => false, closeItem: () => undefined }

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
