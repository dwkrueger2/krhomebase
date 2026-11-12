'use client'
// file: apps/web/features/timekeeping/components/TimeCardCellInput.client.tsx
/**
 * One typed cell of the time-card grid (stage 4): a punch time, PTO or holiday hours, or the day note. It saves on
 * its own when the person leaves the cell (or presses Enter), shows a small rainbow spinner over itself while that
 * save runs, and turns Brick Red when the text cannot be read or the save failed, with the reason as its tooltip and
 * screen-reader description. Escape puts the saved value back and clears the failure.
 *
 * Ported from the old panel's `TimeCardCellEditor` and `TimeCardPunchCell` (the input and its save indicator). The
 * parent (`AttendancePanel`) owns every draft, the save state and the saves; this cell only reports typing and
 * leaving. `TimeCardEditing` is the bundle the grid passes down; the print copy and read-only cards pass none.
 */

import type { TimeCardRow } from '../timeCardRows'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'

/** Which cell of a day: a punch slot (0-based; even slots are clock-ins), the two hour cells, or the note. */
export type TimeCardCell = { kind: 'punch'; slot: number } | { kind: 'pto' } | { kind: 'holiday' } | { kind: 'notes' }

/** The cell's key in the draft and save maps: `<date>:punch-<slot>`, `<date>:pto`, `<date>:holiday`, `<date>:notes`. */
export const timeCardCellKey = (date: string, cell: TimeCardCell) => `${date}:${cell.kind === 'punch' ? `punch-${cell.slot}` : cell.kind}`

/** What the grid needs to make cells typed. Absent: the grid is read-only. */
export interface TimeCardEditing {
  /** Typed text per cell key, while it differs from the saved value. */
  drafts: Record<string, string>
  /** Cells whose save is running. */
  saving: Record<string, boolean>
  /** Cells whose text could not be read or whose save failed, with the reason in a sentence. */
  invalid: Record<string, string>
  /** Hours and the note may be typed (rights, lock and card window allow it). */
  canEditHours: boolean
  /** Punches on this date may be typed (rights, lock and the edit window allow it). */
  canEditPunchesOn: (date: string) => boolean
  /** Extra rows of four punch slots added with "+" per date. */
  extraRows: Record<string, number>
  onDraft: (key: string, value: string | undefined) => void
  /** Escape: drop the typing and any failure, back to the saved value. */
  onRevert: (key: string) => void
  onCommit: (row: TimeCardRow, cell: TimeCardCell) => void
  onAddRow: (date: string) => void
}

const STYLES = {
  /* STYLES FOR TimeCardCellInput */
  input: 'bg-transparent text-inherit text-[13px] outline-none rounded-[2px] border border-transparent hover:border-(--kr-theme-line) focus:border-(--kr-theme-brand-primary-active) focus:bg-(--kr-theme-card-surface) disabled:cursor-wait',
  inputInvalid: 'border-(--kr-theme-danger)! bg-[color-mix(in_srgb,var(--kr-theme-danger)_8%,transparent)] text-(color:--kr-theme-danger)',
  centered: 'text-center',
  right: 'text-right',
  left: 'text-left',
  spinner: 'bg-[color-mix(in_srgb,var(--kr-theme-card-surface)_70%,transparent)]',
} as const

const LAYOUT_STYLES = {
  shell: 'relative',
  /* A text box is about 20 characters wide by default, which would widen the column: each kind gets a set width */
  input: 'min-w-0 h-[23px] px-[3px]',
  punch: 'w-[76px]',
  hours: 'w-[44px]',
  note: 'w-full',
  spinner: 'absolute inset-0 z-[3] flex items-center justify-center',
} as const

export interface TimeCardCellInputProps {
  row: TimeCardRow
  cell: TimeCardCell
  /** The saved value as the cell shows it (`8:00 AM`, `4.0`, the note). */
  value: string
  /** Read by screen readers and shown in the save-failure list. */
  label: string
  align: 'center' | 'right' | 'left'
  editing: TimeCardEditing
  placeholder?: string
}

/**
 * Renders one typed cell with its save indicator.
 *
 * @returns The input inside a positioned shell (the spinner covers it while saving).
 */
export default function TimeCardCellInput({ row, cell, value, label, align, editing, placeholder }: TimeCardCellInputProps) {
  const key = timeCardCellKey(row.date, cell)
  const draft = editing.drafts[key]
  const saving = Boolean(editing.saving[key])
  const problem = editing.invalid[key]
  const invalid = Boolean(problem)

  return (
    <div aria-busy={saving || undefined} className={LAYOUT_STYLES.shell}>
      <input
        aria-description={problem || undefined}
        aria-invalid={invalid || undefined}
        aria-label={label}
        className={`${LAYOUT_STYLES.input} ${LAYOUT_STYLES[cell.kind === 'punch' ? 'punch' : cell.kind === 'notes' ? 'note' : 'hours']} ${STYLES.input} ${STYLES[align === 'center' ? 'centered' : align]} ${invalid ? STYLES.inputInvalid : ''}`}
        data-kr-element={`attendance-time-card-input-${key}`}
        disabled={saving}
        maxLength={cell.kind === 'notes' ? 500 : 12}
        placeholder={placeholder}
        title={problem || undefined}
        value={draft ?? value}
        onBlur={() => editing.onCommit(row, cell)}
        onChange={(event) => editing.onDraft(key, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') editing.onRevert(key)
        }}
      />
      {/* Save indicator: this cell only */}
      {saving ? (
        <span className={`${LAYOUT_STYLES.spinner} ${STYLES.spinner}`}>
          <RainbowBusySpinner ariaLabel={`Saving ${label}`} busy hideWhenIdle={false} size={14} />
        </span>
      ) : null}
    </div>
  )
}
