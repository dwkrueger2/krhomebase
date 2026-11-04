// file: apps/web/components/shell/navigation.ts
/**
 * The menu of KR Homebase: which sections exist, what each is called, which icon it uses, and the
 * display-safe user the frame shows.
 *
 * The shell knows only section ids. It never imports a screen. `app/page.tsx` supplies one panel
 * for each id (see `ApplicationShell`), so the dependency rule (app -> features -> components)
 * holds. Ported from the old `hb-components/types.ts` (navigation part only; the session and
 * worker types come back with sign-in).
 */

import type { KRHomebaseIconName } from '@/components/ui/KRHomebaseIcon.client'

/** Every section the left menu can open. The three settings pages are children of `settings`. */
export type ShellSectionId =
  | 'dashboard'
  | 'contacts'
  | 'leads'
  | 'communications'
  | 'tasks'
  | 'timekeeping'
  | 'billing'
  | 'front-end-publishing'
  | 'reports'
  | 'settings'
  | 'user-settings'
  | 'application-settings'
  | 'firm-settings'

/** One row of the left menu. */
export interface ShellNavItem {
  /** Stable id used by the menu and by the workspace to pick a panel. */
  id: ShellSectionId
  /** Words shown in the menu, the title bar and the pop-out title bar. */
  label: string
  /** Icon drawn beside the label. */
  icon: KRHomebaseIconName
  /** Parent row when this row is a child of `settings`. */
  parentId?: ShellSectionId
  /** True for rows drawn smaller and indented under their parent. */
  isSubItem?: boolean
  /** One-line purpose shown on the placeholder and used as the tooltip text. */
  description: string
}

/** The person shown at the bottom of the left panel. Display-safe values only; never a token or cookie. */
export interface ShellUser {
  displayName: string
  firmName: string
  /** Two letters drawn in the avatar circle. */
  avatarInitials: string
}

/** The three children of Settings, in menu order. */
export const SHELL_SETTINGS_CHILD_IDS: readonly ShellSectionId[] = ['user-settings', 'application-settings', 'firm-settings']

/** The menu, top to bottom (same order and wording as the old app). */
export const SHELL_NAV_ITEMS: readonly ShellNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', description: 'Personal dashboard, firm metrics, agenda, and quick links.' },
  { id: 'contacts', label: 'Clients & Contacts', icon: 'contacts', description: 'Clients, individuals, entities, contact methods, and relationship history.' },
  { id: 'leads', label: 'Leads', icon: 'leads', description: 'Prospective clients and people reaching out for initial contact.' },
  { id: 'communications', label: 'Communications', icon: 'communications', description: 'Internal messages, client communications, phone logs, and email logs.' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', description: 'Task queues, staff assignments, due dates, and workflow tracking.' },
  { id: 'timekeeping', label: 'Attendance', icon: 'attendance', description: 'Clock in/out and employee time-card review.' },
  { id: 'billing', label: 'Billing', icon: 'billing', description: 'Invoices, ledger entries, payments, and trust/accounting views.' },
  { id: 'front-end-publishing', label: 'Front End Publishing', icon: 'documents', description: 'Article and Answer publishing workflow for the public site.' },
  { id: 'reports', label: 'Reports', icon: 'reports', description: 'Markdown-first payroll reports, time-card summaries, and printable exports.' },
  { id: 'settings', label: 'Settings', icon: 'settings', description: 'Firm settings, user management, role management, and preferences.' },
  { id: 'user-settings', label: 'User Settings', icon: 'settings', parentId: 'settings', isSubItem: true, description: 'Signed-in user preferences, theme, font size, starting page, and auto logout.' },
  { id: 'application-settings', label: 'Application Settings', icon: 'settings', parentId: 'settings', isSubItem: true, description: 'Application-wide user management, role specifications, and configuration.' },
  { id: 'firm-settings', label: 'Firm Settings', icon: 'settings', parentId: 'settings', isSubItem: true, description: 'Firm profile, matter numbering, and office-level defaults.' },
]

/** The section opened when the page loads with no `?section=` value. */
export const SHELL_DEFAULT_SECTION_ID: ShellSectionId = 'dashboard'

/**
 * Finds a menu row by id.
 *
 * @param id - Section id to look up.
 * @returns The row, or the Dashboard row when the id is unknown.
 */
export function findNavItem(id: ShellSectionId): ShellNavItem {
  return SHELL_NAV_ITEMS.find((item) => item.id === id) ?? SHELL_NAV_ITEMS[0]!
}

/**
 * Tells whether a value read from outside the program (such as the address bar) is a section id.
 *
 * @param value - Text to test.
 * @returns True when `value` is one of the ids in the menu.
 */
export function isShellSectionId(value: string | null | undefined): value is ShellSectionId {
  return !!value && SHELL_NAV_ITEMS.some((item) => item.id === value)
}

/**
 * Builds the breadcrumb trail shown under the application title.
 *
 * @param id - Section that is open.
 * @returns For a settings child: ['Settings', 'User Settings']. Otherwise one label.
 */
export function buildBreadcrumbs(id: ShellSectionId): string[] {
  const item = findNavItem(id)
  return item.parentId ? [findNavItem(item.parentId).label, item.label] : [item.label]
}
