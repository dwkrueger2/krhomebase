// file: packages/tool-sdk/src/defineWidget.ts
/**
 * `defineWidget`: the one place a Dashboard widget states what it is (Settings and Dashboard plan,
 * `docs/08_Settings_Dashboard_Plan.md`, section 5, stage 3). KR Homebase's own widgets use it, and an outside tool
 * lists its widgets in its manifest (`ToolManifest.widgets`) with the same shape.
 *
 *   export const clockInWidget = defineWidget({
 *     id: 'employee-clock-in',
 *     title: 'Employee Time Entry',
 *     description: 'Clock in or out from the Dashboard and open your time card.',
 *     size: 'medium',
 *     defaultEnabled: true,
 *     defaultOrder: 5,
 *     requires: { resource: 'attendance', action: 'read' },
 *   })
 *
 * It checks the values and throws a plain-language error for the first problem it finds, and returns them frozen.
 * It grants nothing: the widget's own calls are still checked by KR Homebase on every request.
 */

import { WIDGET_SIZES, type WidgetDefinition } from './types.ts'

const ACTIONS = new Set(['create', 'read', 'update', 'delete'])

/**
 * Checks a widget definition and returns it unchanged (frozen).
 *
 * @param widget - The widget's description.
 * @returns The same values, frozen.
 * @throws Error naming the first invalid value.
 */
export function defineWidget(widget: WidgetDefinition): Readonly<WidgetDefinition> {
  if (!/^[a-z][a-z0-9-]{1,47}$/.test(widget.id)) throw new Error('defineWidget: id is lowercase letters, digits and dashes, 2 to 48 characters.')
  if (!widget.title.trim() || widget.title.length > 40) throw new Error('defineWidget: title is 1 to 40 characters.')
  if (widget.description.length > 200) throw new Error('defineWidget: description is at most 200 characters.')
  if (!(WIDGET_SIZES as readonly string[]).includes(widget.size)) throw new Error(`defineWidget: size must be one of ${WIDGET_SIZES.join(', ')}.`)
  if (!Number.isInteger(widget.defaultOrder) || widget.defaultOrder < 0 || widget.defaultOrder > 1000) throw new Error('defineWidget: defaultOrder is a whole number from 0 to 1000.')
  if (widget.requires && (!/^[a-z][a-z_]{1,47}$/.test(widget.requires.resource) || !ACTIONS.has(widget.requires.action))) {
    throw new Error('defineWidget: requires is a resource (lowercase letters and underscores) and an action (create, read, update or delete).')
  }
  if (widget.refreshSeconds !== undefined && (!Number.isInteger(widget.refreshSeconds) || widget.refreshSeconds < 15 || widget.refreshSeconds > 3600)) {
    throw new Error('defineWidget: refreshSeconds is a whole number from 15 to 3600.')
  }
  return Object.freeze({ ...widget, ...(widget.requires ? { requires: Object.freeze({ ...widget.requires }) } : {}) })
}
