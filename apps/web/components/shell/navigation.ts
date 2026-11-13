// file: apps/web/components/shell/navigation.ts
/**
 * The menu of KR Homebase: which sections exist, what each is called, which icon it uses, and the
 * display-safe user the frame shows.
 *
 * The shell knows only section ids. It never imports a screen. `app/page.tsx` supplies one panel
 * for each built-in id (see `ApplicationShell`), so the dependency rule (app -> features -> components)
 * holds. Ported from the old `hb-components/types.ts` (navigation part only; the session and
 * worker types come back with sign-in).
 *
 * Outside tools (docs/05_Outside_Tools.md) are added to the menu at run time from `GET /v1/tools/menu`.
 * Their section id is `tool:<clientId>`, and `buildNavItems` places them after Reports and before Settings.
 * The shell draws them itself, in a sealed frame (`ExternalToolFrame`), so no feature is imported for them.
 *
 * Open items (plan decision 6) are listed under their parent row: the contacts open in Clients & Contacts
 * (`contact:<contactId>`) and, from stage 2, the clients open in Billing (`billing:<clientId>`). Each is a section
 * of its own. `app/page.tsx` supplies one screen per parent (`openItemPanels`); the screen reads which item it
 * shows with `useOpenItem()` (shellNavigation.ts).
 */

import type { ToolMenuItem } from '@krhomebase/contracts'
import type { KRHomebaseIconName } from '@/components/ui/KRHomebaseIcon.client'

/** Every built-in section the left menu can open. The three settings pages are children of `settings`. */
export type BuiltInSectionId =
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

/** Section id of an outside tool: `tool:` and the tool's client id. */
export type ToolSectionId = `tool:${string}`

/**
 * Menu rows that can list open items under them (plan decision 6): the contacts open in Clients & Contacts, and
 * later the clients open in Billing. Each open item is a section of its own, so it can be shown in the workspace
 * or popped out like any section.
 */
export type OpenItemParentId = 'contacts' | 'billing'

/** The section-id prefix of each parent's open items: `contact:<contactId>`, `billing:<clientId>`. */
export const OPEN_ITEM_PREFIXES: Readonly<Record<OpenItemParentId, string>> = { contacts: 'contact', billing: 'billing' }

/** Section id of one open item, for example `contact:ind_123`. */
export type OpenItemSectionId = `contact:${string}` | `billing:${string}`

/** Every section the frame can show: a built-in section, an outside tool, or an open item. */
export type ShellSectionId = BuiltInSectionId | ToolSectionId | OpenItemSectionId

/** The most items a parent row lists at once (plan decision 6). Opening one more drops the oldest. */
export const MAX_OPEN_ITEMS_PER_PARENT = 5

/** One open item as the frame keeps it: where it belongs, its id, and the words shown in the menu. */
export interface ShellOpenItem {
  parentId: OpenItemParentId
  itemId: string
  /** Menu text, for example `[306] Dan Krueger`. The item's screen refreshes it from the data store. */
  label: string
}

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
  /** Set for an outside tool: what the frame needs to load it. */
  outsideTool?: Pick<ToolMenuItem, 'clientId' | 'origin' | 'entryUrl' | 'scopes'>
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
  { id: 'communications', label: 'Workstream', icon: 'communications', description: 'The firm Workstream: phone calls, emails, notes, tasks, files and work in progress for every client and lead.' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', description: 'Task queues, staff assignments, due dates, and workflow tracking.' },
  { id: 'timekeeping', label: 'Attendance', icon: 'attendance', description: 'Clock in/out and employee time-card review.' },
  { id: 'billing', label: 'Billing', icon: 'billing', description: 'Invoices, ledger entries, payments, and trust/accounting views.' },
  { id: 'front-end-publishing', label: 'Front End Publishing', icon: 'documents', description: 'Article and Answer publishing workflow for the public site.' },
  { id: 'reports', label: 'Reports', icon: 'reports', description: 'Markdown-first payroll reports, time-card summaries, and printable exports.' },
  { id: 'settings', label: 'Settings', icon: 'settings', description: 'Firm settings, user management, role management, and preferences.' },
  { id: 'user-settings', label: 'User Settings', icon: 'settings', parentId: 'settings', isSubItem: true, description: 'Your own preferences: theme, starting page, auto logout, dashboard and time card.' },
  { id: 'application-settings', label: 'Application Settings', icon: 'settings', parentId: 'settings', isSubItem: true, description: 'Application-wide user management, role specifications, and configuration.' },
  { id: 'firm-settings', label: 'Firm Settings', icon: 'settings', parentId: 'settings', isSubItem: true, description: 'Firm profile, employee policies, employee documents and the firm IT settings.' },
]

/** The section opened when the page loads with no `?section=` value. */
export const SHELL_DEFAULT_SECTION_ID: ShellSectionId = 'dashboard'

/**
 * The second address-bar parameter of a section: which page inside it is open (Settings plan, stage 1). The names
 * are the old app's, so old links still work, for example `?section=firm-settings&firmSettingsSection=profile`.
 * The section's screen reads and writes it through `useSectionSubPage` (`useSectionSubPage.client.ts`); the frame
 * removes it from the address when another section opens.
 */
export const SECTION_SUB_PAGE_PARAMS: Readonly<Partial<Record<BuiltInSectionId, string>>> = {
  'user-settings': 'userSettingsSection',
  'application-settings': 'applicationSettingsTab',
  'firm-settings': 'firmSettingsSection',
}

/** One step of the breadcrumb trail. A step with a `sectionId` can be chosen to open that section. */
export interface ShellBreadcrumb {
  label: string
  sectionId?: ShellSectionId
}

/**
 * Finds a menu row by id.
 *
 * @param id - Section id to look up.
 * @param items - The menu to search; defaults to the built-in rows.
 * @returns The row, or the Dashboard row when the id is unknown.
 */
export function findNavItem(id: ShellSectionId, items: readonly ShellNavItem[] = SHELL_NAV_ITEMS): ShellNavItem {
  // An open item (`contact:<id>`) belongs to its parent row.
  const lookupId = parseOpenItemSectionId(id)?.parentId ?? id
  return items.find((item) => item.id === lookupId) ?? SHELL_NAV_ITEMS[0]!
}

/**
 * Tells whether a value read from outside the program (such as the address bar) is a section id.
 *
 * @param value - Text to test.
 * @param items - The menu to check against; defaults to the built-in rows.
 * @returns True when `value` is one of the ids in the menu.
 */
export function isShellSectionId(value: string | null | undefined, items: readonly ShellNavItem[] = SHELL_NAV_ITEMS): value is ShellSectionId {
  return !!value && items.some((item) => item.id === value)
}

/**
 * Builds the breadcrumb trail shown under the application title.
 *
 * @param id - Section that is open.
 * @param items - The menu; defaults to the built-in rows.
 * @returns For a settings child: ['Settings', 'User Settings']. Otherwise one label.
 */
export function buildBreadcrumbs(id: ShellSectionId, items: readonly ShellNavItem[] = SHELL_NAV_ITEMS): string[] {
  const item = findNavItem(id, items)
  return item.parentId ? [findNavItem(item.parentId, items).label, item.label] : [item.label]
}

/**
 * Builds the breadcrumb trail with the section each step opens, and the page inside the section as a last step.
 *
 * @param id - Section that is open.
 * @param items - The menu; defaults to the built-in rows.
 * @param subPageLabel - Name of the page open inside the section (for example `Firm Profile`), or null for none.
 * @returns For a settings child with a page: Settings (opens `settings`), Firm Settings (opens `firm-settings`),
 *   Firm Profile (the current page, no section).
 */
export function buildBreadcrumbTrail(id: ShellSectionId, items: readonly ShellNavItem[] = SHELL_NAV_ITEMS, subPageLabel: string | null = null): ShellBreadcrumb[] {
  const item = findNavItem(id, items)
  const trail: ShellBreadcrumb[] = item.parentId ? [{ label: findNavItem(item.parentId, items).label, sectionId: item.parentId }] : []
  trail.push({ label: item.label, sectionId: item.id })
  if (subPageLabel) trail.push({ label: subPageLabel })
  return trail
}

/** The section id of an outside tool. */
export function toolSectionId(clientId: string): ToolSectionId {
  return `tool:${clientId}`
}

/** The section id of an open item. */
export function openItemSectionId(parentId: OpenItemParentId, itemId: string): OpenItemSectionId {
  return `${OPEN_ITEM_PREFIXES[parentId]}:${itemId}` as OpenItemSectionId
}

/**
 * Reads an open-item section id.
 *
 * @param id - Any section id, or text from the address bar.
 * @returns The parent and item id, or null when `id` is not an open item.
 */
export function parseOpenItemSectionId(id: string | null | undefined): { parentId: OpenItemParentId; itemId: string } | null {
  if (!id) return null
  const colon = id.indexOf(':')
  if (colon < 1 || colon === id.length - 1) return null
  const prefix = id.slice(0, colon)
  const parentId = (Object.keys(OPEN_ITEM_PREFIXES) as OpenItemParentId[]).find((parent) => OPEN_ITEM_PREFIXES[parent] === prefix)
  return parentId ? { parentId, itemId: id.slice(colon + 1) } : null
}

/** True when a section id is an open item. */
export function isOpenItemSectionId(id: ShellSectionId): id is OpenItemSectionId {
  return parseOpenItemSectionId(id) !== null
}

/** True when a section id belongs to an outside tool. */
export function isToolSectionId(id: ShellSectionId): id is ToolSectionId {
  return id.startsWith('tool:')
}

/**
 * The whole menu: the built-in rows with the outside tools placed after Reports and before Settings, in
 * their menu order.
 *
 * @param tools - The tools from `GET /v1/tools/menu` (only those the signed-in person may use).
 * @returns A new list of rows.
 */
export function buildNavItems(tools: readonly ToolMenuItem[]): ShellNavItem[] {
  const toolRows: ShellNavItem[] = [...tools]
    .sort((a, b) => a.menuOrder - b.menuOrder || a.label.localeCompare(b.label))
    .map((tool) => ({
      id: toolSectionId(tool.clientId),
      label: tool.label,
      // Every tool icon is a menu icon; the typecheck fails here if the two lists drift apart.
      icon: tool.icon,
      description: tool.description || `${tool.label} (outside tool)`,
      outsideTool: { clientId: tool.clientId, origin: tool.origin, entryUrl: tool.entryUrl, scopes: tool.scopes },
    }))
  const settingsAt = SHELL_NAV_ITEMS.findIndex((item) => item.id === 'settings')
  return [...SHELL_NAV_ITEMS.slice(0, settingsAt), ...toolRows, ...SHELL_NAV_ITEMS.slice(settingsAt)]
}
