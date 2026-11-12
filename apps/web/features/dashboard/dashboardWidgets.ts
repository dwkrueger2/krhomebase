// file: apps/web/features/dashboard/dashboardWidgets.ts
/**
 * Which Dashboard widgets show, and in what order (Settings and Dashboard plan, section 5, stage 3). Ported from the
 * old `hb-components/dashboard/dashboardWidgetRegistry.ts` (`mergeDashboardWidgetPreferences`,
 * `getVisibleDashboardWidgets`); reference `docs/API/Settings_AsIs_Reference.md` section 7.1.
 *
 * Changed from the old registry:
 * - The definitions are not listed here. Each widget is defined by the feature that owns it with `defineWidget`
 *   (`@krhomebase/tool-sdk/manifest`), and `app/page.tsx` hands the list to the Dashboard, so this feature never
 *   imports another feature's files.
 * - The person's choices come from their preferences (`dashboardWidgets`, saved to their account) instead of the
 *   browser's `kr_homebase_dashboard_widgets_v1`.
 * - The old `requiredRole` became `requires` (a permission). The Dashboard cannot read permissions; a widget whose
 *   person lacks the permission says so inside its own card (the API refuses its calls).
 *
 * Pure functions; no React.
 */

import type { ReactNode } from 'react'
import type { DashboardWidgetChoices } from '@krhomebase/contracts'
import type { WidgetDefinition } from '@krhomebase/tool-sdk/types'

/** One widget the Dashboard can show: its definition and the element that draws its card body. */
export interface DashboardWidget {
  definition: Readonly<WidgetDefinition>
  element: ReactNode
}

/** A widget with the person's choice applied. */
export interface ArrangedWidget<T extends { definition: Readonly<WidgetDefinition> }> {
  widget: T
  enabled: boolean
  order: number
}

/**
 * Applies the person's choices to the widgets and sorts them.
 *
 * @param widgets - The widgets on offer.
 * @param choices - The person's saved choices by widget id; a widget without a choice uses its own defaults.
 * @returns Every widget with `enabled` and `order`, sorted by order, then by title (choices for unknown ids are ignored).
 */
export function arrangeWidgets<T extends { definition: Readonly<WidgetDefinition> }>(widgets: readonly T[], choices: DashboardWidgetChoices): ArrangedWidget<T>[] {
  return widgets
    .map((widget) => {
      const choice = choices[widget.definition.id]
      return {
        widget,
        enabled: choice ? choice.enabled : widget.definition.defaultEnabled,
        order: choice ? choice.order : widget.definition.defaultOrder,
      }
    })
    .sort((a, b) => a.order - b.order || a.widget.definition.title.localeCompare(b.widget.definition.title))
}

/** The widgets to draw on the Dashboard, in order. */
export function visibleWidgets<T extends { definition: Readonly<WidgetDefinition> }>(widgets: readonly T[], choices: DashboardWidgetChoices): T[] {
  return arrangeWidgets(widgets, choices)
    .filter((arranged) => arranged.enabled)
    .map((arranged) => arranged.widget)
}
