'use client'
// file: apps/web/features/preferences/components/TaskPreferencesCard.client.tsx
/**
 * User Settings → Preferences → Task Settings (plan 10, stage 5; the requester's decision D20 of Nov 13, 2026): whether
 * a new task the person makes is assigned to them when they leave the assignees untouched. On (the default) assigns the
 * creator; off leaves the task unassigned. The API applies it (`POST /v1/tasks` without `assigneeUserIds` reads the
 * preference `assignCreatorByDefault`, key `tasks`), so it holds wherever a task is made. Saved at once
 * (`usePreferences().save`).
 *
 * State: the card shows the saved choice and the change in flight; the provider owns the saved value.
 */

import { useState } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { usePreferences } from '../PreferencesProvider.client'

const STYLES = {
  choice: 'cursor-pointer text-[12.5px] text-(color:--kr-theme-text)',
  hint: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
} as const

const LAYOUT_STYLES = {
  body: 'gap-[4px] grid',
  choice: 'gap-[3px] inline-flex items-center justify-self-start',
} as const

/** The hint under the choice, for the saved value. */
export function taskAssignHint(assignCreatorByDefault: boolean): string {
  return assignCreatorByDefault
    ? 'A new task is assigned to you unless you choose other people.'
    : 'A new task is left unassigned unless you choose people.'
}

/** The Task Settings card. */
export default function TaskPreferencesCard() {
  const { data, save } = usePreferences()
  const saved = data.preferences.assignCreatorByDefault
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: boolean): Promise<void> {
    if (next === saved) return
    setSaving(true)
    setError(null)
    try {
      await save({ assignCreatorByDefault: next })
    } catch (caught) {
      L(`[TASK_PREFS:48] save failed error=${caught instanceof Error ? caught.message : 'unknown'}`)
      setError('Task Settings were not saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <KRModuleCard krId="user-task-preferences" note="How new tasks you make are assigned." title="Task Settings">
      {/* Task Settings: assign the creator by default (D20) */}
      <div className={LAYOUT_STYLES.body}>
        <label className={`${LAYOUT_STYLES.choice} ${STYLES.choice}`} data-kr-element="task-assign-creator-row">
          <input checked={saved} disabled={saving} type="checkbox" onChange={(event) => void change(event.target.checked)} />
          Assign new tasks to me by default
        </label>
        {saving ? <RainbowBusySpinner busy hideWhenIdle={false} label="Saving..." size={14} /> : null}
        {error ? (
          <p className={STYLES.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={STYLES.hint}>{taskAssignHint(saved)}</p>
        )}
      </div>
    </KRModuleCard>
  )
}
