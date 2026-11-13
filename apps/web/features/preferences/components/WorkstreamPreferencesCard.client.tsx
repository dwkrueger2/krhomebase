'use client'
// file: apps/web/features/preferences/components/WorkstreamPreferencesCard.client.tsx
/**
 * User Settings → Preferences → WorkStream view (the requester, Nov 13, 2026): which activity types the WorkStream
 * lists show when they open. "All" (the default, an empty list) or any of the seven types. Each change is saved at
 * once (`usePreferences().save`, preference `workstreamTypes`); the Communications section starts from it, and its
 * own filter buttons change only the current view.
 *
 * State: the card shows the saved choice and the change in flight; the provider owns the saved value.
 */

import { WORKSTREAM_SUBGROUP_LABELS, WORKSTREAM_SUBGROUPS, type WorkstreamSubgroup } from '@krhomebase/contracts'
import { useState } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { usePreferences } from '../PreferencesProvider.client'

const STYLES = {
  choice: 'cursor-pointer text-[12.5px] text-(color:--kr-theme-text)',
  hint: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  body: 'gap-[4px] grid',
  // One row of short choices, wrapping on narrow screens (a group of tick boxes, not a data-entry form).
  choicesRow: 'gap-x-[10px] gap-y-[3px] flex flex-wrap items-center',
  choice: 'gap-[3px] inline-flex items-center',
} as const

/** The next saved list after ticking or unticking one choice; ticking All, or unticking the last type, means All. */
export function nextWorkstreamTypes(current: readonly WorkstreamSubgroup[], choice: WorkstreamSubgroup | 'all', checked: boolean): WorkstreamSubgroup[] {
  if (choice === 'all') return []
  const next = checked ? [...new Set([...current, choice])] : current.filter((type) => type !== choice)
  // Keep the canonical order so equal choices compare equal.
  return WORKSTREAM_SUBGROUPS.filter((type) => next.includes(type))
}

/** The WorkStream view card. */
export default function WorkstreamPreferencesCard() {
  const { data, save } = usePreferences()
  const saved = data.preferences.workstreamTypes
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(choice: WorkstreamSubgroup | 'all', checked: boolean): Promise<void> {
    const next = nextWorkstreamTypes(saved, choice, checked)
    if (next.join(',') === saved.join(',')) return
    setSaving(true)
    setError(null)
    try {
      await save({ workstreamTypes: next })
    } catch (caught) {
      L(`[WORKSTREAM_PREFS:62] save failed error=${caught instanceof Error ? caught.message : 'unknown'}`)
      setError('The WorkStream view was not saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <KRModuleCard krId="user-workstream-preferences" note="Which activity types WorkStream shows when it opens. The filter buttons in WorkStream change only the current view." title="WorkStream view">
      {/* WorkStream view: All, or any of the seven activity types */}
      <div className={LAYOUT_STYLES.body}>
        <div className={LAYOUT_STYLES.choicesRow} data-kr-element="workstream-view-row">
          <label className={`${LAYOUT_STYLES.choice} ${STYLES.choice}`}>
            <input checked={saved.length === 0} disabled={saving} type="checkbox" onChange={(event) => { if (event.target.checked) void change('all', true) }} />
            All
          </label>
          {WORKSTREAM_SUBGROUPS.map((type) => (
            <label className={`${LAYOUT_STYLES.choice} ${STYLES.choice}`} key={type}>
              <input checked={saved.includes(type)} disabled={saving} type="checkbox" onChange={(event) => { void change(type, event.target.checked) }} />
              {WORKSTREAM_SUBGROUP_LABELS[type]}
            </label>
          ))}
        </div>
        {saving ? <RainbowBusySpinner busy hideWhenIdle={false} label="Saving..." size={14} /> : null}
        {error ? <p className={STYLES.error} role="alert">{error}</p> : <p className={STYLES.hint}>{saved.length ? `Opens on: ${saved.map((type) => WORKSTREAM_SUBGROUP_LABELS[type]).join(', ')}.` : 'Opens on All activity.'}</p>}
      </div>
    </KRModuleCard>
  )
}
