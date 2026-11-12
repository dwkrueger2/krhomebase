'use client'
// file: apps/web/features/timekeeping/components/MissedPunchDialog.client.tsx
/**
 * "No clock-out detected": opens when Clock out finds last night's shift still open (the API answers
 * `MISSED_CLOCK_OUT_REQUIRES_REVIEW`, before 3 am). Three choices, as in the old panel:
 *  - Enter yesterday's clock-out: the typed time (default 11:59 PM) on the open shift's date.
 *  - Split at midnight and clock out: last night ends at midnight, today starts at midnight, and the clock-out is now.
 *  - Cancel: nothing is saved (the old "Cancel — I meant to clock in"); the open clock-in stays for the time card.
 * The labels are in sentence case (the old ones mixed "Clock out" and "Clock Out").
 *
 * Ported from the old panel's hand-built dialog; it now uses the shared `U6ConfirmationDialog` (root AGENTS.md,
 * "User-Response Dialog Standard"), with the time field as its content. The parent runs the save, owns `busy` and
 * `error`, and closes the dialog. The typed time is read with the time-card rules (`timeInput.ts`).
 */

import { useEffect, useState } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { displayDateOnly } from '../timeCardRows'
import { localTimeToIso, parseTypedTime } from '../timeInput'

const STYLES = {
  /* STYLES FOR MissedPunchDialog */
  label: 'text-(color:--kr-theme-text-muted) text-[11px] font-[800] uppercase tracking-[.045em]',
  input: 'px-[7px] py-[5px] min-h-[30px] w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active)',
  inputInvalid: 'border-(--kr-theme-danger)',
  hint: 'text-(color:--kr-theme-danger) text-[12px]',
} as const

const LAYOUT_STYLES = {
  field: 'mt-[10px] gap-[4px] grid',
  hint: 'm-0',
} as const

export interface MissedPunchDialogProps {
  open: boolean
  /** The open shift's firm-local date. */
  openDate: string
  timezone: string
  busy: boolean
  /** The save's failure sentence, shown in place of the description. */
  error: string
  onCancel: () => void
  /** Saves the typed clock-out (an ISO time on the open date). */
  onEnterTime: (missedAt: string) => void
  onSplitAtMidnight: () => void
}

/**
 * Renders the missed clock-out dialog.
 *
 * @returns The shared dialog with the clock-out time field, or nothing when closed.
 */
export default function MissedPunchDialog({ open, openDate, timezone, busy, error, onCancel, onEnterTime, onSplitAtMidnight }: MissedPunchDialogProps) {
  const [text, setText] = useState('11:59 PM')
  const [invalid, setInvalid] = useState(false)

  // A fresh dialog starts from the old default.
  useEffect(() => {
    if (open) {
      setText('11:59 PM')
      setInvalid(false)
    }
  }, [open])

  const enter = () => {
    const time = parseTypedTime(text)
    if (!time || time === 'invalid') {
      setInvalid(true)
      return
    }
    onEnterTime(localTimeToIso(openDate, time.hour, time.minute, timezone))
  }

  return (
    <U6ConfirmationDialog
      busy={busy}
      busyLabel="Saving time punch"
      confirmLabel="Enter yesterday's clock-out"
      description={`No clock-out was recorded for ${displayDateOnly(openDate)}. If you were working late, enter the time you stopped, or split the shift at midnight and clock out now. Cancel saves nothing: last night's clock-in stays open until it is fixed on the time card.`}
      error={error}
      open={open}
      secondaryLabel="Split at midnight and clock out"
      title="No clock-out detected"
      onCancel={onCancel}
      onConfirm={enter}
      onSecondary={onSplitAtMidnight}
    >
      {/* Clock-out time for the open shift's date */}
      <label className={LAYOUT_STYLES.field} data-kr-element="attendance-missed-punch-time">
        <span className={STYLES.label}>Yesterday&apos;s clock-out time</span>
        <input
          aria-invalid={invalid || undefined}
          className={`${STYLES.input} ${invalid ? STYLES.inputInvalid : ''}`}
          disabled={busy}
          placeholder="11:59 PM"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setInvalid(false)
          }}
        />
        {invalid ? <p className={`${LAYOUT_STYLES.hint} ${STYLES.hint}`} role="alert">Enter a time such as 11:30 PM.</p> : null}
      </label>
    </U6ConfirmationDialog>
  )
}
