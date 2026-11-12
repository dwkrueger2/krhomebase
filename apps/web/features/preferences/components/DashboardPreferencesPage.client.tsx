'use client'
// file: apps/web/features/preferences/components/DashboardPreferencesPage.client.tsx
/**
 * Settings → User Settings → Dashboard (Settings and Dashboard plan, stage 3): which widgets show on the person's
 * Dashboard, and in what order. Ported from the old `DashboardWidgetPreferences.client.tsx` (reference section 7.2).
 *
 * Kept from the old screen: one checkbox per widget with its title and description; "Reset dashboard widgets" (back to
 * each widget's own default) and "Save dashboard widgets". Changed:
 * - Saved to the person's account (the `dashboardWidgets` preference) instead of this browser, so the choice follows
 *   them; the Dashboard redraws at once.
 * - Order can be changed: Up and Down move a widget (the old screen had no order control; order came only from the
 *   defaults).
 * - The widgets on offer come from `app/page.tsx` (`widgets`), the same list the Dashboard draws, so this feature
 *   imports no other feature.
 *
 * On save every listed widget is written with its place (order 10, 20, 30 ...), so the saved set is complete.
 *
 * @param props - The widget definitions on offer.
 * @returns The Dashboard card (`data-kr-id="user-dashboard-widgets-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import type { DashboardWidgetChoices } from '@krhomebase/contracts'
import type { WidgetDefinition } from '@krhomebase/tool-sdk/types'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { PreferencesApiError } from '@/features/preferences/api.client'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'

/** One row of the list: a widget and whether it shows. The list's order is the Dashboard order. */
interface Row {
  definition: Readonly<WidgetDefinition>
  enabled: boolean
}

/** The rows from the saved choices (each widget's defaults where there is no choice), in Dashboard order. */
function rowsFrom(widgets: readonly Readonly<WidgetDefinition>[], choices: DashboardWidgetChoices): Row[] {
  return widgets
    .map((definition) => ({
      definition,
      enabled: choices[definition.id]?.enabled ?? definition.defaultEnabled,
      order: choices[definition.id]?.order ?? definition.defaultOrder,
    }))
    .sort((a, b) => a.order - b.order || a.definition.title.localeCompare(b.definition.title))
    .map(({ definition, enabled }) => ({ definition, enabled }))
}

/** The choices to save: every row, with its place as order 10, 20, 30 ... */
function choicesFrom(rows: readonly Row[]): DashboardWidgetChoices {
  return Object.fromEntries(rows.map((row, index) => [row.definition.id, { enabled: row.enabled, order: (index + 1) * 10 }]))
}

const LAYOUT_STYLES = {
  list: 'm-0 p-0 gap-[4px] grid list-none',
  row: 'gap-[8px] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center px-[6px] py-[4px]',
  text: 'gap-[1px] grid min-w-0',
  move: 'gap-[4px] flex',
  actions: 'gap-[6px] flex items-center',
} as const

const STYLES = {
  row: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  title: 'text-[13px] font-bold text-(color:--kr-theme-text)',
  description: 'text-[11px] text-(color:--kr-theme-text-muted)',
  moveButton:
    'min-w-[26px] px-[6px] py-[2px] rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[11px] font-extrabold text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 hover:border-(--kr-theme-brand-primary)',
  ghostButton:
    'gap-1 inline-flex min-h-[28px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[9px] py-[5px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse)',
  note: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface DashboardPreferencesPageProps {
  /** The widgets on offer (the same list the Dashboard draws). */
  widgets: readonly Readonly<WidgetDefinition>[]
}

export default function DashboardPreferencesPage({ widgets }: DashboardPreferencesPageProps) {
  const { data, save } = usePreferences()
  const savedRows = useMemo(() => rowsFrom(widgets, data.preferences.dashboardWidgets), [data.preferences.dashboardWidgets, widgets])
  const [rows, setRows] = useState<Row[]>(savedRows)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A newer saved set replaces the list.
  useEffect(() => {
    setRows(savedRows)
  }, [savedRows])

  const dirty = JSON.stringify(rows.map((row) => [row.definition.id, row.enabled])) !== JSON.stringify(savedRows.map((row) => [row.definition.id, row.enabled]))

  /** Turns one widget on or off. */
  function toggle(id: string, enabled: boolean): void {
    setRows((current) => current.map((row) => (row.definition.id === id ? { ...row, enabled } : row)))
    setStatus(null)
    setError(null)
  }

  /** Moves one widget up (-1) or down (+1). */
  function move(index: number, step: -1 | 1): void {
    setRows((current) => {
      const target = index + step
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row!)
      return next
    })
    setStatus(null)
    setError(null)
  }

  /** Saves the list as shown (or, with `reset`, each widget's own default). */
  async function persist(reset: boolean): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await save({ dashboardWidgets: reset ? {} : choicesFrom(rows) })
      setStatus(reset ? 'Dashboard widgets reset to their defaults.' : 'Dashboard widgets saved to your account.')
    } catch (caught) {
      setError(caught instanceof PreferencesApiError ? caught.message : 'Your Dashboard widgets were not saved.')
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <div className={LAYOUT_STYLES.actions}>
      <button className={STYLES.ghostButton} data-kr-action="reset-dashboard-widgets" disabled={saving} onClick={() => void persist(true)} type="button">
        Reset dashboard widgets
      </button>
      <SaveButton dataKrElement="save-dashboard-widgets" onClick={() => void persist(false)} state={saving ? 'Saving' : dirty ? 'Can Save' : 'Disabled'} text="Save dashboard widgets" disabledText="Save dashboard widgets" updatingText="Saving…" />
    </div>
  )

  return (
    <KRModuleCard actions={actions} component="DashboardPreferencesPage" krId="user-dashboard-widgets" note="Choose the widgets on your Dashboard and their order." title="Dashboard">
      {widgets.length ? (
        // Widget list: top to bottom is the Dashboard order
        <ul className={LAYOUT_STYLES.list} data-kr-id="dashboard-widget-preferences" data-kr-element="dashboard-widget-preferences">
          {rows.map((row, index) => (
            <li className={`${LAYOUT_STYLES.row} ${STYLES.row}`} data-kr-element="dashboard-widget-preference-row" data-kr-record-id={row.definition.id} key={row.definition.id}>
              <input
                aria-describedby={`dashboard-widget-choice-${row.definition.id}-text`}
                checked={row.enabled}
                disabled={saving}
                id={`dashboard-widget-choice-${row.definition.id}`}
                onChange={(event) => toggle(row.definition.id, event.target.checked)}
                type="checkbox"
              />
              <label className={LAYOUT_STYLES.text} htmlFor={`dashboard-widget-choice-${row.definition.id}`}>
                <span className={STYLES.title}>{row.definition.title}</span>
                <span className={STYLES.description} id={`dashboard-widget-choice-${row.definition.id}-text`}>
                  {row.definition.description}
                </span>
              </label>
              <span className={LAYOUT_STYLES.move}>
                <button aria-label={`Move ${row.definition.title} up`} className={STYLES.moveButton} disabled={saving || index === 0} onClick={() => move(index, -1)} type="button">
                  Up
                </button>
                <button aria-label={`Move ${row.definition.title} down`} className={STYLES.moveButton} disabled={saving || index === rows.length - 1} onClick={() => move(index, 1)} type="button">
                  Down
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={STYLES.note}>No dashboard widgets are available yet.</p>
      )}
      {/* Save result: confirmation or the reason it failed */}
      {error ? (
        <p className={STYLES.error} role="alert">
          {error}
        </p>
      ) : status ? (
        <p className={STYLES.note} role="status">
          {status}
        </p>
      ) : null}
    </KRModuleCard>
  )
}
