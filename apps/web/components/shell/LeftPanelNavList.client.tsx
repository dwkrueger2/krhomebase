'use client'
// file: apps/web/components/shell/LeftPanelNavList.client.tsx
/**
 * The menu in the left column of the ApplicationPanels.
 *
 * It draws one button for each row in `SHELL_NAV_ITEMS`. Choosing a row asks ApplicationShell to
 * open that section in the KRH-Workspace. The Settings row also opens or closes its three child
 * rows. The list owns no state; every value arrives as a prop.
 *
 * When the Settings group opens, the list scrolls just far enough to show its last child row, so the whole group is
 * in view (the requester, Nov 13, 2026). Child rows and open items are compact: about 24px a row, 2px vertical
 * padding. Main rows are 30px with 4px vertical padding and 2px between rows (also Nov 13, 2026).
 *
 * Open items (plan decision 6): under Clients & Contacts ("Open contacts") and Billing ("Open Billing") it lists
 * the items open there, newest first, at most five, each with a close button (×), as the old LeftPanel did.
 * Choosing one shows it and moves it to the top. The lists are hidden while the panel is collapsed.
 *
 * Collapsed (tablet and desktop): icons only, child rows hidden, labels in tooltips.
 * Phone (under 768px): the list becomes a strip that scrolls sideways, and `collapsed` is ignored.
 */

import { Fragment, useEffect, useRef } from 'react'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import {
  openItemSectionId,
  parseOpenItemSectionId,
  SHELL_SETTINGS_CHILD_IDS,
  type OpenItemParentId,
  type ShellNavItem,
  type ShellOpenItem,
  type ShellSectionId,
} from '@/components/shell/navigation'

/** Heading over each parent's open items (old wording). */
const OPEN_GROUP_LABELS: Record<OpenItemParentId, string> = { contacts: 'Open contacts', billing: 'Open Billing' }

export interface LeftPanelNavListProps {
  /** Rows to draw, in order. */
  items: readonly ShellNavItem[]
  /** Section open in the workspace. Its row is highlighted. */
  activeSectionId: ShellSectionId
  /** True when the panel is the narrow icon strip. */
  collapsed: boolean
  /** True when the Settings children are listed. */
  settingsExpanded: boolean
  /** Called with the id of the row the person chose. */
  onSelectSection: (sectionId: ShellSectionId) => void
  /** Open items, newest first. Listed under their parent row. */
  openItems?: readonly ShellOpenItem[]
  /** Called when the person chooses an open item. */
  onSelectItem?: (item: ShellOpenItem) => void
  /** Called when the person presses an open item's close button. */
  onCloseItem?: (item: ShellOpenItem) => void
}

const LAYOUT_STYLES = {
  list: 'min-h-0 flex-1 gap-[2px] px-[8px] py-[6px] md:px-[10px] md:py-[12px] flex overflow-x-auto md:flex-col md:overflow-x-hidden md:overflow-y-auto',
  item: 'shrink-0 md:shrink',
  subItem: 'shrink-0 md:ml-[18px] md:shrink',
  button: 'w-auto md:w-full flex shrink-0 items-center whitespace-nowrap',
  mainButton: 'min-h-[30px] gap-[10px] px-[10px] py-[4px]',
  buttonCollapsed: 'md:justify-center md:px-0',
  subButton: 'min-h-[24px] gap-[6px] px-[8px] py-[2px]',
  icon: 'size-[20px] shrink-0',
  subIcon: 'size-[14px] shrink-0',
  openGroup: 'hidden md:flex md:ml-[18px] gap-[2px] flex-col',
  openGroupLabel: 'px-[8px] pt-[4px]',
  openList: 'm-0 p-0 gap-[2px] flex flex-col list-none',
  openRow: 'gap-[2px] flex min-w-0 items-center',
  openButton: 'min-h-[24px] min-w-0 flex-1 px-[8px] py-[2px] flex items-center',
  openClose: 'size-[22px] shrink-0 p-0 inline-flex items-center justify-center',
} as const

const STYLES = {
  list: 'm-0 list-none',
  button:
    'rounded-[2px] border-0 bg-transparent text-left text-[length:var(--kr-theme-font-size-base)] text-white/[.86] cursor-pointer hover:bg-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70',
  buttonActive: 'bg-(--kr-theme-brand-primary-active) font-extrabold text-white',
  subLabel: 'text-[12px]',
  openGroupLabel: 'text-[10px] font-extrabold tracking-[.12em] uppercase text-white/[.55]',
  openItemLabel: 'min-w-0 truncate text-[12px]',
  openItemClose:
    'rounded-[2px] border-0 bg-transparent text-[14px] leading-none text-white/[.6] cursor-pointer hover:bg-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:outline-white/70',
  chevron: 'ml-auto text-[14px] leading-none transition-transform',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Renders the left menu.
 *
 * @param props - Rows, the open section, collapsed and Settings-group state, and the choose callback.
 * @returns A `<ul data-kr-id="LeftPanelNavList">` of menu buttons.
 */
export default function LeftPanelNavList({
  items,
  activeSectionId,
  collapsed,
  settingsExpanded,
  onSelectSection,
  openItems = [],
  onSelectItem,
  onCloseItem,
}: LeftPanelNavListProps) {
  const settingsChildActive = SHELL_SETTINGS_CHILD_IDS.includes(activeSectionId)
  // The parent row of an open item that is showing stays highlighted, as Settings does for its children.
  const activeItemParentId = parseOpenItemSectionId(activeSectionId)?.parentId
  const listRef = useRef<HTMLUListElement>(null)
  const wasExpanded = useRef(settingsExpanded)

  // When the Settings group opens, scroll the list (only the list, never the page) so its last child row shows.
  useEffect(() => {
    const opened = settingsExpanded && !wasExpanded.current
    wasExpanded.current = settingsExpanded
    const list = listRef.current
    if (!opened || collapsed || !list) return
    const children = list.querySelectorAll<HTMLElement>('[data-kr-element="left-nav-subitem-wrapper"]')
    const last = children[children.length - 1]
    if (!last) return
    const overflow = last.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom
    if (overflow > 0) list.scrollBy({ top: overflow + 6, behavior: 'smooth' })
  }, [settingsExpanded, collapsed])

  return (
    <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`} ref={listRef} role="list" aria-label="KR Homebase sections" data-kr-id="LeftPanelNavList">
      {items.map((item) => {
        // Children of Settings are drawn only while the group is open.
        if (item.parentId === 'settings' && !settingsExpanded) return null

        const active = item.id === activeSectionId
        const activeParent = (item.id === 'settings' && settingsChildActive) || item.id === activeItemParentId
        const childItems = openItems.filter((open) => open.parentId === item.id)
        const highlighted = active || activeParent
        const isSettingsRow = item.id === 'settings'
        const hideWhenCollapsed = item.isSubItem && collapsed

        return (
          <Fragment key={item.id}>
            {/* Menu row: icon, label, and for Settings a chevron that shows whether the group is open */}
            <li
              className={`${item.isSubItem ? LAYOUT_STYLES.subItem : LAYOUT_STYLES.item} ${hideWhenCollapsed ? 'md:hidden' : ''}`}
              data-kr-element={item.isSubItem ? 'left-nav-subitem-wrapper' : 'left-nav-item-wrapper'}
              data-kr-section-id={item.id}
            >
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                aria-expanded={isSettingsRow ? settingsExpanded : undefined}
                className={[
                  LAYOUT_STYLES.button,
                  item.isSubItem ? LAYOUT_STYLES.subButton : LAYOUT_STYLES.mainButton,
                  collapsed ? LAYOUT_STYLES.buttonCollapsed : '',
                  STYLES.button,
                  highlighted ? STYLES.buttonActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-kr-action="select-left-nav"
                data-kr-element={item.isSubItem ? 'left-nav-subitem' : 'left-nav-item'}
                data-kr-section-id={item.id}
                onClick={() => onSelectSection(item.id)}
                title={collapsed ? item.label : item.description}
              >
                <KRHomebaseIcon name={item.icon} className={item.isSubItem ? LAYOUT_STYLES.subIcon : LAYOUT_STYLES.icon} />
                <span className={`${item.isSubItem ? STYLES.subLabel : ''} ${collapsed ? 'md:hidden' : ''}`} data-kr-element="left-nav-label">
                  {item.label}
                </span>
                {isSettingsRow && (
                  <span
                    className={`${STYLES.chevron} ${settingsExpanded ? '' : '-rotate-90'} ${collapsed ? 'md:hidden' : ''}`}
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                )}
              </button>
            </li>

            {/* Open items under this row (contacts, Billing clients): newest first, each with a close button */}
            {childItems.length > 0 && !collapsed ? (
              <li className={LAYOUT_STYLES.openGroup} data-kr-element="left-nav-open-group" data-kr-parent-id={item.id}>
                <span className={`${LAYOUT_STYLES.openGroupLabel} ${STYLES.openGroupLabel}`} data-kr-element="left-nav-open-label">
                  {OPEN_GROUP_LABELS[childItems[0]!.parentId]}
                </span>
                <ul className={LAYOUT_STYLES.openList} role="list" data-kr-element="left-nav-open-list">
                  {childItems.map((open) => {
                    const openActive = activeSectionId === openItemSectionId(open.parentId, open.itemId)
                    return (
                      <li key={open.itemId} className={LAYOUT_STYLES.openRow}>
                        <button
                          type="button"
                          aria-current={openActive ? 'page' : undefined}
                          className={`${LAYOUT_STYLES.openButton} ${STYLES.button} ${openActive ? STYLES.buttonActive : ''}`}
                          data-kr-action="select-open-item"
                          data-kr-element="left-nav-open-item"
                          data-kr-item-id={open.itemId}
                          onClick={() => onSelectItem?.(open)}
                          title={`Open ${open.label}`}
                        >
                          <span className={STYLES.openItemLabel}>{open.label}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Close ${open.label}`}
                          className={`${LAYOUT_STYLES.openClose} ${STYLES.openItemClose}`}
                          data-kr-action="close-open-item"
                          data-kr-element="left-nav-open-item-close"
                          data-kr-item-id={open.itemId}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            onCloseItem?.(open)
                          }}
                          title="Close"
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ) : null}
          </Fragment>
        )
      })}
    </ul>
  )
}
