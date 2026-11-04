'use client'
// file: apps/web/components/shell/LeftPanelNavList.client.tsx
/**
 * The menu in the left column of the ApplicationPanels.
 *
 * It draws one button for each row in `SHELL_NAV_ITEMS`. Choosing a row asks ApplicationShell to
 * open that section in the KRH-Workspace. The Settings row also opens or closes its three child
 * rows. The list owns no state; every value arrives as a prop.
 *
 * Collapsed (tablet and desktop): icons only, child rows hidden, labels in tooltips.
 * Phone (under 768px): the list becomes a strip that scrolls sideways, and `collapsed` is ignored.
 */

import { Fragment } from 'react'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import { SHELL_SETTINGS_CHILD_IDS, type ShellNavItem, type ShellSectionId } from '@/components/shell/navigation'

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
}

const LAYOUT_STYLES = {
  list: 'min-h-0 flex-1 gap-[4px] px-[8px] py-[6px] md:px-[10px] md:py-[12px] flex overflow-x-auto md:flex-col md:overflow-x-hidden md:overflow-y-auto',
  item: 'shrink-0 md:shrink',
  subItem: 'shrink-0 md:ml-[18px] md:shrink',
  button: 'min-h-[38px] w-auto md:w-full gap-[12px] px-[10px] py-[9px] flex shrink-0 items-center whitespace-nowrap',
  buttonCollapsed: 'md:justify-center md:px-0',
  subButton: 'min-h-[30px] gap-[8px] px-[8px] py-[6px]',
  icon: 'size-[20px] shrink-0',
  subIcon: 'size-[14px] shrink-0',
} as const

const STYLES = {
  list: 'm-0 list-none',
  button:
    'rounded-[2px] border-0 bg-transparent text-left text-[length:var(--kr-theme-font-size-base)] text-white/[.86] cursor-pointer hover:bg-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70',
  buttonActive: 'bg-(--kr-theme-brand-primary-active) font-extrabold text-white',
  subLabel: 'text-[12px]',
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
export default function LeftPanelNavList({ items, activeSectionId, collapsed, settingsExpanded, onSelectSection }: LeftPanelNavListProps) {
  const settingsChildActive = SHELL_SETTINGS_CHILD_IDS.includes(activeSectionId)

  return (
    <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`} role="list" aria-label="KR Homebase sections" data-kr-id="LeftPanelNavList">
      {items.map((item) => {
        // Children of Settings are drawn only while the group is open.
        if (item.parentId === 'settings' && !settingsExpanded) return null

        const active = item.id === activeSectionId
        const activeParent = item.id === 'settings' && settingsChildActive
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
                  item.isSubItem ? LAYOUT_STYLES.subButton : '',
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
          </Fragment>
        )
      })}
    </ul>
  )
}
