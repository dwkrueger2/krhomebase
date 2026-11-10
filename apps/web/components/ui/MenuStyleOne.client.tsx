'use client'
// file: apps/web/components/ui/MenuStyleOne.client.tsx
/**
 * Menu Style One: a strip of tabs with the chosen tab's card below it. Ported from the old
 * `hb-components/menu/tab-menu-style1/MenuStyleOne.client.tsx`; behavior unchanged. Used by Contact Detail now and
 * by Billing from plan stage 2.
 *
 * The component owns only which tab is chosen. Each item brings its own card. It can be left to itself
 * (`defaultActiveItemId`) or controlled by its parent (`activeItemId` with `onActiveItemChange`), for example when a
 * card asks to open another tab.
 *
 * Styles: the old CSS module became Tailwind classes. The three paddings a person may configure stay as theme tokens
 * in `styles/theme.css` (plan decision 8): `--kr-theme-tab-strip-padding`, `--kr-theme-tab-button-padding` and
 * `--kr-theme-menu-panel-padding`. The props keep the old `<MenuStyleOne props={...} />` shape so ported screens read
 * the same.
 */

import { useEffect, useState, type ReactNode } from 'react'

/** One tab and the card shown when it is chosen. */
export interface MenuStyleOneItem {
  /** Stable id used for the choice and for the accessibility links between tab and panel. */
  id: string
  /** Words on the tab. */
  label: string
  /** Card shown under the strip while this tab is chosen. */
  card: ReactNode
  /** Shows the tab but does not let it be chosen (planned features). */
  disabled?: boolean
}

/** Settings for the menu. */
export interface MenuStyleOneProps {
  /** Tabs, left to right. */
  items: readonly MenuStyleOneItem[]
  /** Tab chosen at first. Defaults to the first. */
  defaultActiveItemId?: string
  /** The chosen tab, when the parent controls it. */
  activeItemId?: string
  /** Called whenever a tab is chosen. */
  onActiveItemChange?: (itemId: string) => void
  /** Accessible name of the tab strip. */
  ariaLabel?: string
  /** Prefix for the generated tab and panel ids. */
  idPrefix?: string
  /** Value of the root's `data-kr-id-menu` marker. */
  menuKrId?: string
}

/** The old `<MenuStyleOne props={...} />` shape. */
export interface MenuStyleOneComponentProps {
  props: MenuStyleOneProps
}

const LAYOUT_STYLES = {
  root: 'flex w-full min-w-0 flex-col',
  menu: 'flex gap-[2px] items-end overflow-x-auto overflow-y-hidden p-(--kr-theme-tab-strip-padding)',
  button: 'min-h-[34px] flex-none whitespace-nowrap p-(--kr-theme-tab-button-padding)',
  panel: 'min-w-0 p-(--kr-theme-menu-panel-padding)',
} as const

const STYLES = {
  menu: 'border-b border-(--kr-theme-line) bg-(--kr-theme-table-row-background-1) [scrollbar-width:thin] [scrollbar-color:color-mix(in_srgb,var(--kr-theme-brand-primary)_32%,transparent)_transparent]',
  button:
    'border-0 border-b-[3px] border-transparent bg-transparent font-(family-name:--kr-theme-font-body) text-[length:var(--kr-theme-font-size-base)] font-bold text-(color:--kr-theme-text-muted) cursor-pointer hover:text-(color:--kr-theme-text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--kr-theme-accent) disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-(color:--kr-theme-text-muted)',
  buttonActive: 'border-b-(color:--kr-theme-accent) font-extrabold text-(color:--kr-theme-table-heading-dark)',
} as const

/**
 * Renders the tab strip and the chosen tab's card.
 *
 * @param props - `{ props: { items, ... } }`, the old shape.
 * @returns The strip and the active panel.
 */
export default function MenuStyleOne({ props: menuProps }: MenuStyleOneComponentProps) {
  const {
    ariaLabel = 'Menu Style One tabs',
    activeItemId: controlledActiveItemId,
    defaultActiveItemId,
    idPrefix = 'menu-style-one',
    items,
    menuKrId = 'menu-style1',
    onActiveItemChange,
  } = menuProps
  const firstItemId = items[0]?.id ?? ''
  const initialItemId = defaultActiveItemId && items.some((item) => item.id === defaultActiveItemId) ? defaultActiveItemId : firstItemId
  const [uncontrolledActiveItemId, setUncontrolledActiveItemId] = useState<string>(initialItemId)
  const activeItemId = controlledActiveItemId ?? uncontrolledActiveItemId

  function chooseItem(itemId: string): void {
    if (controlledActiveItemId === undefined) setUncontrolledActiveItemId(itemId)
    onActiveItemChange?.(itemId)
  }

  // A chosen tab that disappears (for example a tab shown only to some roles) falls back to the first tab.
  useEffect(() => {
    if (!items.length || items.some((item) => item.id === activeItemId)) return
    if (controlledActiveItemId === undefined) setUncontrolledActiveItemId(firstItemId)
    onActiveItemChange?.(firstItemId)
  }, [activeItemId, controlledActiveItemId, firstItemId, items, onActiveItemChange])

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0]
  const activePanelId = activeItem ? `${idPrefix}-panel-${activeItem.id}` : `${idPrefix}-panel-empty`

  return (
    <div className={LAYOUT_STYLES.root} data-kr-id-menu={menuKrId}>
      {/* Tab strip */}
      <nav className={`${LAYOUT_STYLES.menu} ${STYLES.menu}`} aria-label={ariaLabel} role="tablist">
        {items.map((item) => {
          const isActive = item.id === activeItem?.id
          return (
            <button
              aria-controls={`${idPrefix}-panel-${item.id}`}
              aria-selected={isActive}
              className={`${LAYOUT_STYLES.button} ${STYLES.button} ${isActive ? STYLES.buttonActive : ''}`}
              data-kr-element-menu-item={item.id}
              disabled={item.disabled}
              id={`${idPrefix}-tab-${item.id}`}
              key={item.id}
              onClick={() => {
                if (!item.disabled) chooseItem(item.id)
              }}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* The chosen tab's card */}
      <div
        aria-labelledby={activeItem ? `${idPrefix}-tab-${activeItem.id}` : undefined}
        className={LAYOUT_STYLES.panel}
        data-kr-element-menu-panel="menu-style1-panel"
        id={activePanelId}
        role="tabpanel"
      >
        {activeItem?.card ?? null}
      </div>
    </div>
  )
}
