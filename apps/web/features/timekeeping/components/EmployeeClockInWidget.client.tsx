'use client'
// file: apps/web/features/timekeeping/components/EmployeeClockInWidget.client.tsx
/**
 * Dashboard widget for the signed-in employee's clock (`data-kr-id="dashboard-widget-employee-clock-in"` is on the
 * card frame the Dashboard draws around it). Ported from the old `hb-components/dashboard/EmployeeClockInWidget.client.tsx`
 * and its CSS module (reference `docs/API/Settings_AsIs_Reference.md` section 7.3); the CSS module became the Tailwind
 * maps below, reading the theme tokens.
 *
 * Kept from the old widget: the name; "Working Time Today: HH:MM", moving on every 30 seconds while clocked in; the
 * Clocked In / Clocked Out state; Clock In, Clock Out and View Time Card, with the next action drawn as the primary
 * button; the period line `P{n} · start – end` and the regular hours `0.0 RH`; the repair warning, the saved message
 * and the failure message under the buttons.
 *
 * Changed:
 * - It calls the new Attendance routes (no new API): `GET /v1/timekeeping/clock-state` for the clock and
 *   `GET /v1/timekeeping/time-card` for the name, the period, the regular hours and the firm time zone; `POST
 *   /v1/timekeeping/clock-in` and `/clock-out` for the buttons. The old widget made one `view=mine` call.
 * - Last night's open shift: a clock-out that finds it opens `MissedPunchDialog` here, as Attendance does (plan 07);
 *   the old widget sent the person to the time card instead.
 * - Busy: the rainbow spinner beside the buttons (the old widget used a saving dialog).
 * - No Attendance access, or not set up as an employee: one sentence in the card (the old widget showed the raw error).
 * - The data is read again every `refreshSeconds` of the widget definition (60), so a punch made elsewhere shows.
 *
 * @returns The widget body (the Dashboard draws the card frame and title).
 */

import { useCallback, useEffect, useState } from 'react'
import type { ClockStateData, TimeCardData } from '@krhomebase/contracts'
import { useShellNavigation } from '@/components/shell/shellNavigation'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { ATTENDANCE_ACCESS_CODES, clockIn, clockOut, getClockState, getTimeCard, missedClockOut, TimekeepingApiError } from '@/features/timekeeping/api.client'
import { employeeClockInWidget } from '@/features/timekeeping/clockInWidget'
import MissedPunchDialog from '@/features/timekeeping/components/MissedPunchDialog.client'

const LAYOUT_STYLES = {
  controls: 'gap-[8px] grid min-w-0',
  identityRow: 'gap-[10px] flex items-center justify-between min-w-0',
  employeeInfo: 'gap-[1px] flex flex-col items-start min-w-0',
  // As many buttons per row as fit at 104px or more; in a narrow column View Time Card moves to a second row instead
  // of being cut off (the old widget had a fixed 400px card).
  actions: 'gap-[6px] grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))]',
  meta: 'gap-[8px] flex justify-between',
  busy: 'min-h-[18px]',
} as const

const STYLES = {
  employeeName: 'truncate text-[length:var(--kr-theme-font-size-bigger)] font-bold leading-[1.2] text-(color:--kr-theme-text)',
  text: 'm-0 text-[length:var(--kr-theme-font-size-base)] leading-[1.35] text-(color:--kr-theme-text)',
  hours: 'tabular-nums font-bold',
  // The state tag looks like the old status button, but is not a control.
  statusTag: 'px-[10px] py-[6px] rounded-[2px] border text-[length:var(--kr-theme-font-size-base)] font-[850] whitespace-nowrap text-(color:--kr-theme-text-inverse)',
  statusIn: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background)',
  statusOut: 'border-(--kr-theme-brand-primary-active) bg-(--kr-theme-brand-primary-active)',
  statusUnknown: 'border-(--kr-theme-line) bg-(--kr-theme-muted-surface) !text-(color:--kr-theme-text-muted)',
  rule: 'm-0 w-full border-0 border-t border-(--kr-theme-line)',
  actionButton: 'min-w-0 px-[10px] py-[6px] rounded-[2px] border text-center whitespace-nowrap text-[length:var(--kr-theme-font-size-base)] font-[850] cursor-pointer disabled:cursor-not-allowed disabled:opacity-55',
  primaryButton: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  secondaryButton: 'border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-(color:--kr-theme-text)',
  viewButton: 'border-(--kr-theme-orange) bg-(--kr-theme-button-secondary-background) font-black text-(color:--kr-theme-orange)',
  meta: 'tabular-nums text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text-muted)',
  success: 'm-0 text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-success)',
  warning: 'm-0 text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** `HH:MM` for a number of minutes (the old `formatRunningTime`). */
export function formatRunningTime(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

/** The clock and the card, read together. */
interface WidgetData {
  clock: ClockStateData
  card: TimeCardData
  /** When they were read (milliseconds), to move the working time on while clocked in. */
  readAt: number
}

export default function EmployeeClockInWidget() {
  const navigation = useShellNavigation()
  const [data, setData] = useState<WidgetData | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [missedDate, setMissedDate] = useState<string | null>(null)
  const [missedBusy, setMissedBusy] = useState(false)
  const [missedError, setMissedError] = useState('')

  /** Reads the clock and the person's own card for today's period. */
  const load = useCallback(async (): Promise<void> => {
    try {
      const [clock, card] = await Promise.all([getClockState(), getTimeCard()])
      setData({ clock, card, readAt: Date.now() })
      setNotice(null)
    } catch (loadError) {
      if (loadError instanceof TimekeepingApiError && ATTENDANCE_ACCESS_CODES.has(loadError.code)) setNotice(loadError.message)
      else setError(loadError instanceof Error ? loadError.message : 'The clock could not be read.')
    }
  }, [])

  // First read, then again every refreshSeconds; the working time moves on every 30 seconds (as the old widget did).
  useEffect(() => {
    void load()
    const refresh = window.setInterval(() => void load(), (employeeClockInWidget.refreshSeconds ?? 60) * 1000)
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
  }, [load])

  /** Runs a clock action under the spinner, then reads again. Last night's open shift opens the missed clock-out dialog. */
  async function act(label: string, done: string, action: () => Promise<unknown>): Promise<void> {
    setBusy(label)
    setError('')
    setStatus('')
    try {
      await action()
      setStatus(done)
      await load()
    } catch (actionError) {
      const openPunch = actionError instanceof TimekeepingApiError ? (actionError.details as { openPunch?: { localDate?: string } } | undefined)?.openPunch : undefined
      if (openPunch?.localDate) {
        setMissedError('')
        setMissedDate(openPunch.localDate)
      } else {
        setError(actionError instanceof Error ? actionError.message : 'The clock change was not saved.')
      }
    } finally {
      setBusy(null)
    }
  }

  /** Saves one of the missed clock-out choices; the dialog stays open with the sentence when it fails. */
  async function saveMissed(body: { choice: 'enter_time'; missedAt: string } | { choice: 'split_midnight' }): Promise<void> {
    setMissedBusy(true)
    setMissedError('')
    try {
      await missedClockOut(body)
      setMissedDate(null)
      setStatus('Last night\'s shift was closed.')
      await load()
    } catch (saveError) {
      setMissedError(saveError instanceof Error ? saveError.message : 'The missed clock-out was not saved.')
    } finally {
      setMissedBusy(false)
    }
  }

  if (notice) {
    return (
      <section className={LAYOUT_STYLES.controls} aria-label="Employee clock in module" data-kr-id="dashboard-employee-clock-in-controls" data-kr-component="EmployeeClockInWidget">
        {/* No Attendance access, or not set up as an employee: say so, nothing else */}
        <p className={STYLES.text}>{notice}</p>
      </section>
    )
  }

  const clock = data?.clock
  const isClockedIn = clock?.isClockedIn ?? false
  const canClock = clock?.canClock ?? false
  const minutes = clock ? clock.minutesWorkedToday + (isClockedIn ? Math.max(0, (now - (data?.readAt ?? now)) / 60_000) : 0) : 0
  const repairWarning = clock?.staleOpenPunch?.message ?? ''
  const noClockReason = clock && !canClock ? 'Your account cannot use the clock.' : undefined

  return (
    <section
      aria-busy={busy !== null}
      aria-label="Employee clock in module"
      className={LAYOUT_STYLES.controls}
      data-kr-component="EmployeeClockInWidget"
      data-kr-element="attendance-time-card-controls"
      data-kr-id="dashboard-employee-clock-in-controls"
      data-kr-pattern="control-group"
    >
      {/* Identity row: the employee's name and today's working time, the clock state on the right */}
      <div className={LAYOUT_STYLES.identityRow} data-kr-element="employee-clock-in-identity-row">
        <div className={LAYOUT_STYLES.employeeInfo}>
          <strong className={STYLES.employeeName}>{data?.card.employee.name ?? 'Loading…'}</strong>
          <p className={STYLES.text}>
            Working Time Today: <strong className={STYLES.hours}>{formatRunningTime(minutes)}</strong>
          </p>
        </div>
        {/* Until the first read the state is unknown, so it says so rather than guessing "Clocked Out" */}
        <span className={`${STYLES.statusTag} ${!clock ? STYLES.statusUnknown : isClockedIn ? STYLES.statusIn : STYLES.statusOut}`} data-kr-element="employee-clock-in-state">
          {!clock ? 'Checking…' : isClockedIn ? 'Clocked In' : 'Clocked Out'}
        </span>
      </div>

      <hr className={STYLES.rule} />

      {/* Actions: the next clock action is the primary button; View Time Card opens Attendance */}
      <div className={LAYOUT_STYLES.actions} data-kr-element="employee-clock-in-actions-row">
        <button
          className={`${STYLES.actionButton} ${!clock || isClockedIn ? STYLES.secondaryButton : STYLES.primaryButton}`}
          data-kr-action="dashboard-clock-in"
          disabled={!clock || busy !== null || isClockedIn || !canClock}
          onClick={() => void act('Clocking in', 'Clock In recorded.', () => clockIn())}
          title={noClockReason}
          type="button"
        >
          Clock In
        </button>
        <button
          className={`${STYLES.actionButton} ${isClockedIn ? STYLES.primaryButton : STYLES.secondaryButton}`}
          data-kr-action="dashboard-clock-out"
          disabled={!clock || busy !== null || !isClockedIn || !canClock}
          onClick={() => void act('Clocking out', 'Clock Out recorded.', () => clockOut())}
          title={noClockReason}
          type="button"
        >
          Clock Out
        </button>
        <button className={`${STYLES.actionButton} ${STYLES.viewButton}`} data-kr-action="dashboard-view-time-card" onClick={() => navigation.openSection('timekeeping')} type="button">
          View Time Card
        </button>
      </div>

      {/* Period line: the pay period on the left, the regular hours so far on the right */}
      {data ? (
        <div className={`${LAYOUT_STYLES.meta} ${STYLES.meta}`} data-kr-element="employee-clock-in-period-row">
          <span>
            P{data.card.period.number} · {data.card.period.start} – {data.card.period.end}
          </span>
          <span>{data.card.totals.regularHours.toFixed(1)} RH</span>
        </div>
      ) : null}

      {/* Busy, repair warning, saved message and failure, in that order */}
      {busy ? (
        <div className={LAYOUT_STYLES.busy}>
          <RainbowBusySpinner busy label={busy} size={16} />
        </div>
      ) : null}
      {repairWarning ? (
        <p className={STYLES.warning} role="status">
          {repairWarning}
        </p>
      ) : null}
      {status ? (
        <p className={STYLES.success} role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className={STYLES.warning} role="alert">
          {error}
        </p>
      ) : null}

      {/* Missed clock-out: last night's shift still open when clocking out. Drawn only once the card is read: the
          dialog formats its date even while closed, and needs a real date and the firm's time zone. */}
      {data ? (
        <MissedPunchDialog
          busy={missedBusy}
          error={missedError}
          onCancel={() => setMissedDate(null)}
          onEnterTime={(missedAt) => void saveMissed({ choice: 'enter_time', missedAt })}
          onSplitAtMidnight={() => void saveMissed({ choice: 'split_midnight' })}
          open={missedDate !== null}
          openDate={missedDate ?? data.card.today}
          timezone={data.card.policy.timezone}
        />
      ) : null}
    </section>
  )
}
