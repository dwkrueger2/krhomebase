'use client'
// file: apps/web/features/timekeeping/components/TimeEntryControls.client.tsx
/**
 * Employee time-entry controls for the Attendance time-card workspace: whose card and the clock status, the
 * employee picker in the card note (stage 5, when the viewer may open more than their own card), the pay-period picker (back, list,
 * forward, Current Period), Clock in and Clock out (stage 3), Approve and Reopen (stage 5), Print, and the problem
 * and missed-punch notices.
 *
 * Ported from the old `TimekeepingControls.client.tsx`. Changes:
 *  - The section uses the shared `KRModuleCard` instead of the old 36px navy bar (plan decision 6, recommended). The
 *    collapse caret is dropped: the card is short.
 *  - The employee name moved from a read-only field into the card's note, with the clock status, to save a row.
 *    With more than one employee to choose from, a slim picker takes the name's place in the note, at the note's
 *    size (the old screen had no manager view). A picker row of its own widened the pickers column and pushed the
 *    action row under it at about 1100px.
 *  - The four hour boxes moved to the time-card header (`TimeCardLedger`), so they print with the grid.
 *  - The clock works only on one's own card in the current period, as before; a disabled button says why.
 *  - Approve follows the API's decision (`card.approval`): the old Friday rule and the problem check are made there,
 *    and the button's tooltip gives the reason when it is disabled. Reopen is new (decision 7).
 *
 * The parent (`AttendancePanel`) owns the loaded data, the selected period and employee, and the saves; this
 * component only reports clicks.
 */

import type { AttendanceEmployee, ClockStateData, TimeCardData } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { formatTimeCardTime, type PayPeriodOption } from '../timeCardRows'

const STYLES = {
  /* STYLES FOR TimeEntryControls */
  button: 'px-[10px] py-[6px] inline-flex min-h-[30px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-(color:--kr-theme-text) text-[13px] font-[800] hover:border-(--kr-theme-accent) focus-visible:outline-2 focus-visible:outline-(--kr-theme-accent) disabled:cursor-not-allowed disabled:opacity-[.55] disabled:hover:border-(--kr-theme-line)',
  primaryButton: 'px-[10px] py-[6px] inline-flex min-h-[30px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse) text-[13px] font-[800] hover:bg-(--kr-theme-button-primary-hover-background) focus-visible:outline-2 focus-visible:outline-(--kr-theme-accent) disabled:cursor-not-allowed disabled:opacity-[.55] disabled:hover:bg-(--kr-theme-button-primary-background)',
  select: 'px-[7px] py-[5px] min-h-[30px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  /* Employee picker in the card note: the note's size and weight, a hairline box, no extra height */
  notePicker: 'px-[3px] py-0 max-w-[260px] cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[12px] font-[600] leading-[1.35] outline-none hover:border-(--kr-theme-accent) focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  arrowButton: 'w-[30px] px-0',
  clockStatusIn: 'font-[800] text-(color:--kr-theme-success)',
  clockStatusOut: 'font-[800] text-(color:--kr-theme-text)',
  notice: 'border border-[color-mix(in_srgb,var(--kr-theme-danger)_30%,var(--kr-theme-line))] bg-[color-mix(in_srgb,var(--kr-theme-danger)_8%,transparent)] text-(color:--kr-theme-danger) text-[13px] leading-[1.4]',
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
  /* Controls grid: the pickers and the action row; side by side from desktop width */
  controls: 'gap-[8px] grid lg:grid-cols-[minmax(0,560px)_auto] lg:items-center lg:justify-between',
  pickers: 'gap-[6px] grid min-w-0',
  periodRow: 'gap-[6px] grid grid-cols-[30px_minmax(0,1fr)_30px_auto] items-center',
  actionRow: 'gap-[6px] flex flex-wrap items-center print:hidden',
  printIcon: 'mr-[5px]',
  notice: 'm-0 px-[8px] py-[6px]',
} as const

export interface TimeEntryControlsProps {
  card: TimeCardData | null
  clock: ClockStateData | null
  loading: boolean
  /** True while a clock, approve or reopen save runs. */
  busy: boolean
  periodOptions: PayPeriodOption[]
  isCurrentPeriodSelected: boolean
  canNavigateBack: boolean
  /** The period's problems in one sentence (empty when none). */
  problemSummary: string
  /** Employees the viewer may open (their own first). The picker shows when there is more than one. */
  employees: AttendanceEmployee[]
  /** The employee whose card is shown. */
  selectedEmployeeId: string
  onEmployeeChange: (employeeId: string) => void
  onPeriodChange: (periodStart: string) => void
  onNavigateBack: () => void
  onNavigateForward: () => void
  onCurrentPeriod: () => void
  onClockIn: () => void
  onClockOut: () => void
  onApprove: () => void
  onReopen: () => void
  onPrint: () => void
}

/** The clock line for the card note: in or out, since when, and hours today. */
function clockLine(clock: ClockStateData | null, timezone: string) {
  if (!clock) return <span className={STYLES.clockStatusOut}>Checking the clock…</span>
  const hoursToday = (clock.minutesWorkedToday / 60).toFixed(1)
  return clock.isClockedIn && clock.openPunch
    ? <><span className={STYLES.clockStatusIn}>Clocked in</span> since {formatTimeCardTime(clock.openPunch.occurredAt, timezone)} · {hoursToday} h today</>
    : <><span className={STYLES.clockStatusOut}>Not clocked in</span> · {hoursToday} h today</>
}

/** Why the clock buttons are off, or null when they may be used. */
function clockBlockedReason(card: TimeCardData | null, clock: ClockStateData | null, isCurrentPeriodSelected: boolean): string | null {
  if (!card || !clock) return 'Loading the clock.'
  if (!clock.canClock) return 'Only active employees can use the clock.'
  if (card.viewer.scope !== 'own') return 'The clock is for your own time card. Choose yourself in the employee list at the top of this card.'
  if (!isCurrentPeriodSelected) return 'Go to the current pay period to use the clock.'
  if (card.card?.isLocked) return 'This time card is approved and locked.'
  return null
}

/** The Approve button's words for who is approving and what has happened. */
function approveLabel(card: TimeCardData | null): string {
  if (!card || !card.approval.kind) return 'Approve time card'
  if (card.approval.kind === 'manager') return card.card?.managerApprovedAt ? 'Approved' : 'Approve and lock'
  return card.card?.employeeApprovedAt ? 'Employee approved' : 'Approve time card'
}

/**
 * Renders the employee time-entry card.
 *
 * @returns The card: note with the name (or the employee picker) and clock status, the period picker, the action
 *   buttons, and any notices.
 */
export default function TimeEntryControls({
  card,
  clock,
  loading,
  busy,
  periodOptions,
  isCurrentPeriodSelected,
  canNavigateBack,
  problemSummary,
  employees,
  selectedEmployeeId,
  onEmployeeChange,
  onPeriodChange,
  onNavigateBack,
  onNavigateForward,
  onCurrentPeriod,
  onClockIn,
  onClockOut,
  onApprove,
  onReopen,
  onPrint,
}: TimeEntryControlsProps) {
  const timezone = card?.policy.timezone ?? 'America/Chicago'
  const hasData = Boolean(card)
  const clockBlocked = clockBlockedReason(card, clock, isCurrentPeriodSelected)
  const working = loading || busy
  /* Whose card: a picker when the viewer may open other employees' cards, otherwise the name */
  const whose = employees.length > 1 ? (
    <select aria-label="Employee" className={STYLES.notePicker} data-kr-element="attendance-employee-dropdown" disabled={working} value={selectedEmployeeId} onChange={(event) => onEmployeeChange(event.target.value)}>
      {employees.map((employee) => (
        <option key={employee.id} value={employee.id}>{employee.name}{employee.employmentStatus !== 'active' ? ` · ${employee.employmentStatus.replace(/_/g, ' ')}` : ''}</option>
      ))}
    </select>
  ) : card ? card.employee.name : null
  const note = <>{whose ? <>{whose} · </> : null}{clockLine(clock, timezone)}</>
  const approval = card?.approval
  const clockedIn = Boolean(clock?.isClockedIn)

  return (
    <KRModuleCard component="AttendanceTimeEntryControls" krId="attendance-time-entry" note={note} noteTone="strong" title="Employee Time Entry">
      {/* Controls: the period picker on the left; clock, approve and print on the right */}
      <div className={LAYOUT_STYLES.controls} data-kr-element="attendance-time-entry-controls">
        <div className={LAYOUT_STYLES.pickers}>
          {/* Pay-period row: back, the year's periods, forward, back to the current period */}
          <div className={LAYOUT_STYLES.periodRow} data-kr-element="attendance-period-row">
            <button aria-label="Previous pay period" className={`${STYLES.button} ${STYLES.arrowButton}`} disabled={working || !hasData || !canNavigateBack} type="button" onClick={onNavigateBack}>{'<'}</button>
            <select aria-label="Pay period" className={STYLES.select} data-kr-element="payperiod-dropdown" disabled={working || !hasData} value={card?.period.start ?? ''} onChange={(event) => onPeriodChange(event.target.value)}>
              {periodOptions.map((period) => <option key={period.start} value={period.start}>{period.label}</option>)}
            </select>
            <button aria-label="Next pay period" className={`${STYLES.button} ${STYLES.arrowButton}`} disabled={working || !hasData} type="button" onClick={onNavigateForward}>{'>'}</button>
            <button aria-pressed={isCurrentPeriodSelected} className={STYLES.button} disabled={working || !hasData || isCurrentPeriodSelected} type="button" onClick={onCurrentPeriod}>Current Period</button>
          </div>
        </div>

        {/* Action row: clock in and out, approve or reopen, print */}
        <div className={LAYOUT_STYLES.actionRow} data-kr-element="attendance-action-row">
          <button className={STYLES.primaryButton} disabled={working || Boolean(clockBlocked) || clockedIn} title={clockBlocked ?? (clockedIn ? 'You are already clocked in.' : undefined)} type="button" onClick={onClockIn}>Clock in</button>
          <button className={clockedIn ? STYLES.primaryButton : STYLES.button} disabled={working || Boolean(clockBlocked) || !clockedIn} title={clockBlocked ?? (!clockedIn ? 'You are not clocked in.' : undefined)} type="button" onClick={onClockOut}>Clock out</button>
          {approval?.kind ? (
            <button className={STYLES.button} data-kr-element="attendance-approve" disabled={working || !approval.allowed} title={approval.blockedReason ?? undefined} type="button" onClick={onApprove}>{approveLabel(card)}</button>
          ) : null}
          {approval?.canReopen ? (
            <button className={STYLES.button} data-kr-element="attendance-reopen" disabled={working} title="Clear the approvals and the lock so the card can be changed." type="button" onClick={onReopen}>Reopen</button>
          ) : null}
          <button className={STYLES.button} disabled={!hasData} type="button" onClick={onPrint}>
            <KRHomebaseIcons.Print className={LAYOUT_STYLES.printIcon} />Print report
          </button>
        </div>
      </div>

      {/* Problem notice: the days whose punches do not pair up */}
      {problemSummary ? (
        <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-id="attendance-time-entry-problems" data-kr-element="time-entry-problems">
          <strong>Time Entry Problems:</strong> {problemSummary}
        </p>
      ) : null}

      {/* Missed-punch notice: an older clock-in was never closed; it is fixed in the grid below */}
      {clock?.staleOpenPunch && card?.viewer.scope === 'own' ? (
        <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-id="attendance-missed-punch-repair-warning" data-kr-element="missed-punch-repair-warning">
          <strong>Missed Punch:</strong> {clock.staleOpenPunch.message}
        </p>
      ) : null}
    </KRModuleCard>
  )
}
