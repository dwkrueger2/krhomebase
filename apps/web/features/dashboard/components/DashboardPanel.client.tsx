'use client'
// file: apps/web/features/dashboard/components/DashboardPanel.client.tsx
/**
 * The Dashboard (menu id `dashboard`; Settings and Dashboard plan, section 5, stage 3). It replaces the "Module [TBD]"
 * placeholder with the widget grid, ported from the old `DashboardWidgetGrid.client.tsx` (reference section 7.2).
 *
 * - **Which widgets:** `widgets` comes from `app/page.tsx` (each feature defines its own widget), so this feature
 *   imports no other feature. The person's choices come from their preferences through the frame
 *   (`useShellPreferences().dashboardWidgets`), so a change saved in User Settings → Dashboard shows at once.
 * - **Drawing:** each widget is drawn by its own element inside `DashboardWidgetShell`, looked up from the list; the
 *   old grid's chain of `if (widget.id === ...)` is gone.
 * - **Grid:** one column on a phone, two at tablet width, three from desktop width; a `wide` widget takes two
 *   columns. The old grid used fixed 400px columns.
 * - **Nothing to show:** a short note with a button to User Settings → Dashboard (the old grid showed a placeholder).
 *
 * @param props - The widgets on offer, each with its definition and element.
 * @returns The Dashboard (`data-kr-id="DashboardPanel"`).
 */

import { useShellNavigation } from '@/components/shell/shellNavigation'
import { useShellPreferences } from '@/components/shell/shellPreferences'
import DashboardWidgetShell from '@/features/dashboard/components/DashboardWidgetShell.client'
import { visibleWidgets, type DashboardWidget } from '@/features/dashboard/dashboardWidgets'

const LAYOUT_STYLES = {
  // The 36px right padding keeps the cards clear of the workspace's pop-out button (as Contact Detail does).
  panel: 'p-[8px] pr-[36px] min-w-0',
  grid: 'gap-[8px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 items-start',
  empty: 'p-[10px] gap-[8px] flex flex-wrap items-center',
} as const

const STYLES = {
  empty: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  emptyText: 'm-0 text-[13px] text-(color:--kr-theme-text-muted)',
  button:
    'min-h-[28px] px-[9px] py-[5px] rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[12px] font-extrabold text-(color:--kr-theme-text) cursor-pointer hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface DashboardPanelProps {
  /** The widgets on offer. Empty: the note about choosing widgets. */
  widgets?: readonly DashboardWidget[]
}

export default function DashboardPanel({ widgets = [] }: DashboardPanelProps) {
  const { dashboardWidgets } = useShellPreferences()
  const navigation = useShellNavigation()
  const shown = visibleWidgets(widgets, dashboardWidgets)

  return (
    <div className={LAYOUT_STYLES.panel} data-kr-id="DashboardPanel">
      {shown.length ? (
        // Widget grid: each widget in its card, in the person's order
        <div className={LAYOUT_STYLES.grid} data-kr-id="dashboard-widget-grid" data-kr-element="dashboard-widget-grid">
          {shown.map((widget) => (
            <DashboardWidgetShell definition={widget.definition} key={widget.definition.id}>
              {widget.element}
            </DashboardWidgetShell>
          ))}
        </div>
      ) : (
        // No widget turned on: point to the place where they are chosen
        <section className={`${LAYOUT_STYLES.empty} ${STYLES.empty}`} data-kr-element="dashboard-empty">
          <p className={STYLES.emptyText}>No Dashboard widgets are turned on.</p>
          <button className={STYLES.button} data-kr-action="open-dashboard-settings" onClick={() => navigation.openSection('user-settings', 'dashboard-settings')} type="button">
            Choose widgets
          </button>
        </section>
      )}
    </div>
  )
}
