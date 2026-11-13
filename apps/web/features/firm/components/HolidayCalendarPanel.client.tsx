'use client'
// file: apps/web/features/firm/components/HolidayCalendarPanel.client.tsx
/**
 * Employee Policies → Holiday Calendar (Settings plan, stage 5). Ported from the old
 * `firm-settings/HolidayCalendarPolicyPanel.client.tsx`.
 *
 * Kept: the heading and sentence, Add Holiday, the columns (Holiday, Observed Rule, the year's observation, Actions
 * with edit and remove; remove is off while one holiday is left), double-clicking a row to edit it, and the dialog
 * (Add Holiday / Edit Holiday; Preset with "Custom Holiday" and the presets, a used preset shown as
 * "<name>-Firm Holiday" and disabled; Name of Holiday, where typing switches the preset to custom; Rule Type; Month;
 * Day, or Ordinal and Weekday; the Memorial Day and Labor Day note; Cancel and OK).
 *
 * Changed from the old panel:
 * - Each change saves at once (the requester, Nov 12, 2026): OK in the dialog and Remove write the holiday calendar
 *   right away, with the rainbow spinner in the dialog while it saves, and Remove asks first. The old panel only
 *   changed a draft that the card's Save wrote later, so a wastebasket click looked like a deletion.
 * - Holidays are listed in the order they fall in the year, not the order they were added.
 * - The observation column is the current year (the old one was fixed to 2026).
 * - The rows are register rows, and the edit and remove buttons are `KRHomebaseIcons.Pencil` and `.Trash` (the old
 *   ones were the ✎ and 🗑 characters).
 * - The dialog is `U6ConfirmationDialog` with the fields inside it (the old one was its own modal).
 *
 * The card owns the save (`onSave` writes the holidays on top of the saved policies, leaving any other unsaved change
 * in the card as it is).
 *
 * @returns The panel (`data-kr-element="employee-policy-holiday-rules"`).
 */

import { useState } from 'react'
import { HOLIDAY_ORDINALS, HOLIDAY_PRESETS, HOLIDAY_WEEKDAYS, type HolidayRule } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { daysForMonth, defaultHolidayDraft, draftFromHoliday, holidayFromDraft, holidayObservation, holidayRuleSummary, monthLabel, sortHolidays, type HolidayDraft } from '@/features/firm/holidays'

const LAYOUT_STYLES = {
  section: 'gap-[4px] grid',
  head: 'gap-x-[6px] flex flex-wrap items-baseline justify-between',
  form: 'mt-[6px] gap-x-[6px] gap-y-[3px] grid grid-cols-[auto_minmax(0,1fr)] items-center',
  actions: 'gap-[2px] inline-flex',
} as const

const STYLES = {
  title: 'm-0 text-[13px] font-[850] text-(color:--kr-theme-text)',
  sub: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  table: 'w-full max-w-[640px] border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0 whitespace-nowrap',
  iconButton: 'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.4] hover:enabled:bg-(--kr-theme-muted-surface)',
  danger: 'text-(color:--kr-theme-danger)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center gap-[3px] rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  label: 'whitespace-nowrap text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  note: 'mt-[6px] mb-0 text-[11px] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const ORDINAL_LABELS: Record<(typeof HOLIDAY_ORDINALS)[number], string> = { '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th', '5th': '5th', last: 'Last' }

export interface HolidayCalendarPanelProps {
  holidays: readonly HolidayRule[]
  canEdit: boolean
  disabled?: boolean
  /** Saves the whole calendar; resolves to an error sentence, or null when it was saved. */
  onSave: (holidays: HolidayRule[]) => Promise<string | null>
  /** The year whose dates the observation column shows (this year by default). */
  year?: number
}

export default function HolidayCalendarPanel({ holidays, canEdit, disabled = false, onSave, year = new Date().getFullYear() }: HolidayCalendarPanelProps) {
  /** The holiday being edited (its id), `new` for Add Holiday, or null when the dialog is closed. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<HolidayDraft>(defaultHolidayDraft())
  /** The holiday asked about in "Remove holiday?", or null. */
  const [removing, setRemoving] = useState<HolidayRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const usedIds = new Set(holidays.filter((holiday) => holiday.id !== editing).map((holiday) => holiday.id))
  const sorted = sortHolidays(holidays, year)

  /** Saves the calendar in date order; closes the open dialog when it worked, keeps it open with the error when not. */
  async function save(next: HolidayRule[], close: () => void) {
    setSaving(true)
    setError('')
    const problem = await onSave(sortHolidays(next, year))
    setSaving(false)
    if (problem) setError(problem)
    else close()
  }

  function open(holiday: HolidayRule | null) {
    if (!canEdit || disabled) return
    if (holiday) {
      setDraft(draftFromHoliday(holiday, HOLIDAY_PRESETS.some((preset) => preset.id === holiday.id) ? holiday.id : 'custom'))
      setEditing(holiday.id)
    } else {
      setDraft(defaultHolidayDraft())
      setEditing('new')
    }
    setError('')
  }

  function confirm() {
    if (editing === 'new') void save([...holidays, holidayFromDraft(draft)], () => setEditing(null))
    else if (editing) {
      const keepId = draft.presetId === 'custom' && !HOLIDAY_PRESETS.some((preset) => preset.id === editing) ? editing : undefined
      void save(
        holidays.map((holiday) => (holiday.id === editing ? holidayFromDraft(draft, keepId) : holiday)),
        () => setEditing(null),
      )
    }
  }

  function choosePreset(presetId: string) {
    const preset = HOLIDAY_PRESETS.find((row) => row.id === presetId)
    setDraft(preset ? draftFromHoliday(preset) : { ...draft, presetId: 'custom' })
  }

  return (
    <section aria-label="Holiday rules" className={LAYOUT_STYLES.section} data-kr-element="employee-policy-holiday-rules">
      <div className={LAYOUT_STYLES.head}>
        <div>
          <p className={STYLES.title}>Holiday Calendar</p>
          <p className={STYLES.sub}>Date-certain and floating holiday rules used for employee holiday pay.</p>
        </div>
        {canEdit ? (
          <button className={STYLES.ghostButton} data-kr-action="add-holiday" disabled={disabled} onClick={() => open(null)} type="button">
            <KRHomebaseIcons.Add /> Add Holiday
          </button>
        ) : null}
      </div>

      <table className={STYLES.table}>
        <thead>
          <tr>
            <th className={STYLES.th}>Holiday</th>
            <th className={STYLES.th}>Observed Rule</th>
            <th className={STYLES.th}>{year} Observation</th>
            {canEdit ? <th className={STYLES.th}>Actions</th> : null}
          </tr>
        </thead>
        <tbody data-kr-element="rows-container">
          {sorted.map((holiday) => (
            <tr className={STYLES.row} data-kr-record-id={holiday.id} key={holiday.id} onDoubleClick={() => open(holiday)}>
              <td className={STYLES.td}>{holiday.name}</td>
              <td className={STYLES.td}>{holidayRuleSummary(holiday)}</td>
              <td className={STYLES.td}>{holidayObservation(holiday, year)}</td>
              {canEdit ? (
                <td className={STYLES.td}>
                  <span className={LAYOUT_STYLES.actions}>
                    <button aria-label={`Edit ${holiday.name}`} className={STYLES.iconButton} disabled={disabled} onClick={() => open(holiday)} title="Edit holiday" type="button">
                      <KRHomebaseIcons.Pencil />
                    </button>
                    <button
                      aria-label={`Remove ${holiday.name}`}
                      className={`${STYLES.iconButton} ${STYLES.danger}`}
                      disabled={disabled || holidays.length <= 1}
                      onClick={() => {
                        setError('')
                        setRemoving(holiday)
                      }}
                      title="Remove holiday"
                      type="button"
                    >
                      <KRHomebaseIcons.Trash />
                    </button>
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <U6ConfirmationDialog
        busy={saving && removing !== null}
        busyLabel="Removing holiday..."
        confirmLabel="Remove"
        description={removing ? `Remove ${removing.name} from the holiday calendar? It is saved right away.` : ''}
        error={removing ? error : ''}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void save(holidays.filter((row) => row.id !== removing.id), () => setRemoving(null))}
        open={removing !== null}
        title="Remove holiday?"
      />
      <U6ConfirmationDialog
        busy={saving && editing !== null}
        busyLabel="Saving holiday..."
        confirmLabel="OK"
        description="Choose a preset or describe the holiday. OK saves it to the holiday calendar right away."
        error={editing ? error : ''}
        onCancel={() => setEditing(null)}
        onConfirm={confirm}
        open={editing !== null}
        title={editing === 'new' ? 'Add Holiday' : 'Edit Holiday'}
      >
        <div className={LAYOUT_STYLES.form} data-kr-element="add-holiday-dialog">
          <label className={STYLES.label} htmlFor="holiday-preset">
            Preset
          </label>
          <select className={STYLES.field} id="holiday-preset" onChange={(event) => choosePreset(event.target.value)} value={draft.presetId}>
            <option value="custom">Custom Holiday</option>
            {HOLIDAY_PRESETS.map((preset) => (
              <option disabled={usedIds.has(preset.id)} key={preset.id} value={preset.id}>
                {usedIds.has(preset.id) ? `${preset.name}-Firm Holiday` : preset.name}
              </option>
            ))}
          </select>
          <label className={STYLES.label} htmlFor="holiday-name">
            Name of Holiday
          </label>
          <input className={STYLES.field} id="holiday-name" maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value, presetId: 'custom' })} value={draft.name} />
          <label className={STYLES.label} htmlFor="holiday-rule-type">
            Rule Type
          </label>
          <select className={STYLES.field} id="holiday-rule-type" onChange={(event) => setDraft({ ...draft, ruleType: event.target.value as HolidayDraft['ruleType'] })} value={draft.ruleType}>
            <option value="specific-date">Specific date every year</option>
            <option value="floating-weekday">Floating weekday of month</option>
          </select>
          <label className={STYLES.label} htmlFor="holiday-month">
            Month
          </label>
          <select className={STYLES.field} id="holiday-month" onChange={(event) => setDraft({ ...draft, month: event.target.value })} value={draft.month}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>
                {monthLabel(index + 1)}
              </option>
            ))}
          </select>
          {draft.ruleType === 'specific-date' ? (
            <>
              <label className={STYLES.label} htmlFor="holiday-day">
                Day
              </label>
              <select className={STYLES.field} id="holiday-day" onChange={(event) => setDraft({ ...draft, dayOfMonth: event.target.value })} value={draft.dayOfMonth}>
                {daysForMonth(draft.month).map((day) => (
                  <option key={day} value={String(day)}>
                    {String(day).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className={STYLES.label} htmlFor="holiday-ordinal">
                Ordinal
              </label>
              <select className={STYLES.field} id="holiday-ordinal" onChange={(event) => setDraft({ ...draft, ordinal: event.target.value as HolidayDraft['ordinal'] })} value={draft.ordinal}>
                {HOLIDAY_ORDINALS.map((ordinal) => (
                  <option key={ordinal} value={ordinal}>
                    {ORDINAL_LABELS[ordinal]}
                  </option>
                ))}
              </select>
              <label className={STYLES.label} htmlFor="holiday-weekday">
                Weekday
              </label>
              <select className={STYLES.field} id="holiday-weekday" onChange={(event) => setDraft({ ...draft, weekday: event.target.value as HolidayDraft['weekday'] })} value={draft.weekday}>
                {HOLIDAY_WEEKDAYS.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {weekday}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <p className={STYLES.note}>Memorial Day is normally the last Monday in May. Labor Day is normally the first Monday in September.</p>
      </U6ConfirmationDialog>
    </section>
  )
}
