// file: apps/web/features/timekeeping/timeCardRows.ts
/**
 * Display helpers for the Attendance time card: the 14 visible day rows, the problems on each row, the pay-period
 * list for the period picker, and date and time formats in the firm time zone. Display only: every rule that decides
 * hours, pairing or locks is in the API (`apps/api/src/features/timekeeping/timeMath.ts`); this file only arranges
 * what the API sent.
 *
 * Ported from the old `hb-components/modules/timekeeping/timeCardRows.ts` and the helper functions at the top of
 * `TimekeepingPanel.client.tsx`. Changes:
 *  - Rows are built from the API's `intervals` (the old file paired the punches again in the browser).
 *  - Regular hours come from the real in and out pairs only, the same rule the API's totals use (plan decision 10).
 *    The old file preferred stored "regular" event rows, which one zeroed row could wipe out.
 *  - Problems come from the API's pairing exceptions instead of from typed text (typed cells, stage 4, are checked
 *    by `timeInput.ts` before they are sent).
 *  - The period list steps 14 days from the period the API sent, so the browser does not need the pay-period anchor.
 */

import type { IntervalException, TimeCardData, TimeEvent, TimeInterval, TimePunch } from '@krhomebase/contracts'

/** One day of the pay period as the time-card grid shows it. */
export interface TimeCardRow {
  date: string
  day: string
  /** Active punches owned by this work date, including any punches beyond the first two pairs. */
  punches: TimePunch[]
  regularHours: number
  overtimeHours: number
  ptoHours: number
  holidayHours: number
  sickHours: number
  unpaidHours: number
  otherHours: number
  totalHours: number
  /** What the Notes column shows: a correction reason, else the day's entry notes. */
  notes: string
  /** The editable day note: the note on that day's `other` entry (old panel's notes cell), or empty. */
  dayNote: string
  /** Plain labels for the problems on this day (empty when the day is in order). */
  problems: string[]
}

/** One entry of the period picker. */
export interface PayPeriodOption {
  start: string
  end: string
  number: number
  label: string
}

/** Adds calendar days without relying on the server's local timezone. */
export function addDaysToIsoDate(value: string, days: number): string {
  const result = new Date(`${value.slice(0, 10)}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

/** `MM/DD/YYYY` for a date-only value (old `displayDateOnly`). */
export function displayDateOnly(value: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
}

/** `Mon D, YYYY` for a date-only value (old `formatPeriodEnding`). */
export function formatPeriodEnding(value: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
}

/** Formats an instant using the firm's configured timezone. */
export function formatTimeCardTime(value: string | null, timezone: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

/** `MM/DD/YYYY h:mm AM` for an instant, in the firm's timezone (old `displayDate`): audit rows, approvals, printed-on. */
export function formatTimeCardStamp(value: string | null, timezone: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(new Date(value))
    .replace(',', '')
}

/**
 * The browser's suggested file name for a printed card ("Save as PDF" uses the page title):
 * `YYYY-MM-DD Time Card Review-<Employee Name> Period <N>`, dated by the last day of the period. Characters that file
 * names cannot hold are removed from the employee name.
 */
export function timeCardPrintTitle(card: Pick<TimeCardData, 'period' | 'employee'>): string {
  const name = card.employee.name.replace(/[\\/:*?"<>|]/g, '').trim()
  return `${card.period.end} Time Card Review-${name} Period ${card.period.number}`
}

/** One decimal place, the way every hour figure on the card is shown. */
export function formatHours(value: number): string {
  return value.toFixed(1)
}

/** Plain label for each pairing problem the API reports. */
const PROBLEM_LABELS: Record<IntervalException, string> = {
  assumed_midnight_close: 'Missing clock-out',
  duplicate_clock_in: 'Missing clock-out',
  clock_out_without_clock_in: 'Missing clock-in',
  shift_over_10_hours: 'Long shift',
}

/**
 * The problems on one day. A clock-in still open today is the running shift, not a problem (the old panel ignored a
 * missing partner on today's row the same way).
 */
function problemsForDay(intervals: TimeInterval[], date: string, today: string): string[] {
  const labels = intervals
    .filter((interval) => interval.exception && !(interval.exception === 'assumed_midnight_close' && date === today))
    .map((interval) => PROBLEM_LABELS[interval.exception!])
  return Array.from(new Set(labels))
}

function noteForRow(punches: TimePunch[], events: TimeEvent[]): string {
  const exception = punches.find((punch) => punch.correctionReason)?.correctionReason
  const eventNote = events.find((event) => typeof event.notes === 'string' && event.notes.trim())?.notes?.trim()
  const eventStatus = events.find((event) => event.status && event.status !== 'draft')?.status
  return exception ? `Correction: ${exception}` : eventNote || eventStatus ? (eventNote || `Event ${eventStatus}`) : ''
}

/** True for a span that counts toward hours (a real clock-in closed by a real clock-out). */
function isPayable(interval: TimeInterval): boolean {
  return !interval.isAssumedMidnightClose && interval.exception !== 'clock_out_without_clock_in' && interval.endPunchId !== null
}

/**
 * Builds the 14 visible ledger rows from the API's punches, intervals and events.
 *
 * In/out cells are still taken from the punches so corrections remain auditable. A pair that crosses midnight
 * belongs to the day it started, as in the old screen. The period's overtime is shown on the last row (old
 * `timeCardRows.ts` line 99), while each row's RH shows the full daily hours, so a row's Total leaves overtime out.
 *
 * @param card - The time-card reply.
 * @returns Fourteen rows, from the period start.
 */
export function buildTimeCardRows(card: Pick<TimeCardData, 'period' | 'punches' | 'intervals' | 'events' | 'totals' | 'today'>): TimeCardRow[] {
  const punchById = new Map(card.punches.map((punch) => [punch.id, punch]))
  const round = (value: number) => Number(value.toFixed(1))

  return Array.from({ length: 14 }, (_, index) => {
    const date = addDaysToIsoDate(card.period.start, index)
    const dayEvents = card.events.filter((event) => event.workDate === date)
    const dayIntervals = card.intervals.filter((interval) => interval.workDate === date)
    /**
     * Preserve the physical punch sequence while assigning overnight clock-outs
     * to the work date that owns their interval. Deduplication matters for an
     * orphan clock-out interval, whose start and end ids are intentionally the
     * same diagnostic punch.
     */
    const dayPunches = Array.from(new Map(
      dayIntervals
        .flatMap((interval) => [interval.startPunchId, interval.endPunchId])
        .filter((punchId): punchId is string => Boolean(punchId))
        .map((punchId) => punchById.get(punchId))
        .filter((punch): punch is TimePunch => punch !== undefined && !punch.voidedAt)
        .map((punch) => [punch.id, punch] as [string, TimePunch]),
    ).values()).sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    const eventHours = (timeType: string): number => round(dayEvents.filter((event) => event.timeType === timeType).reduce((sum, event) => sum + (Number(event.hours) || 0), 0))
    const regularHours = round(dayIntervals.filter(isPayable).reduce((sum, interval) => sum + interval.hours, 0))
    const ptoHours = eventHours('pto')
    const holidayHours = eventHours('holiday')
    const sickHours = eventHours('sick')
    const unpaidHours = eventHours('unpaid')
    const otherHours = eventHours('other')
    const overtimeHours = card.totals.overtimeHours > 0 && index === 13 ? card.totals.overtimeHours : 0
    return {
      date,
      day: formatDay(date),
      punches: dayPunches,
      regularHours,
      overtimeHours,
      ptoHours,
      holidayHours,
      sickHours,
      unpaidHours,
      otherHours,
      totalHours: round(regularHours + ptoHours + holidayHours + sickHours + unpaidHours + otherHours),
      notes: noteForRow(dayPunches, dayEvents),
      dayNote: dayEvents.find((event) => event.timeType === 'other')?.notes?.trim() ?? '',
      problems: problemsForDay(dayIntervals, date, card.today),
    }
  })
}

/** The period's problems in one sentence, by date (old `periodProblemSummary`). Empty when there are none. */
export function periodProblemSummary(rows: TimeCardRow[]): string {
  return rows
    .filter((row) => row.problems.length)
    .map((row) => `${row.day} ${displayDateOnly(row.date)}: ${row.problems.join(', ')}`)
    .join('; ')
}

/**
 * The pay periods for the picker: every period whose end date falls in the year of the shown period's end, as the
 * old `buildPeriodOptions` listed (at most 30). Periods are 14 days back to back, so the list steps from the shown
 * period; their numbers count from it the same way.
 *
 * @param period - The period the API returned (`start`, `end`, `number`).
 */
export function buildPeriodOptions(period: Pick<TimeCardData['period'], 'start' | 'end' | 'number'>): PayPeriodOption[] {
  const year = period.end.slice(0, 4)
  const option = (offset: number): PayPeriodOption => {
    const start = addDaysToIsoDate(period.start, offset * 14)
    const end = addDaysToIsoDate(period.end, offset * 14)
    const number = period.number + offset
    return { start, end, number, label: `${year} Pay Period ${number} Ending ${formatPeriodEnding(end)}` }
  }
  const options: PayPeriodOption[] = []
  for (let offset = 1 - period.number; options.length < 30; offset += 1) {
    const candidate = option(offset)
    if (!candidate.end.startsWith(`${year}-`)) break
    options.push(candidate)
  }
  return options
}

/**
 * Why the card cannot change, or null when it can. Old panel: locked, approved or exported; otherwise the edit window
 * (super admins are exempt, which the API already applies to `isCardEditWindowExpired`).
 */
export function timeCardLockMessage(card: Pick<TimeCardData, 'card' | 'isCardEditWindowExpired' | 'viewer'>): string | null {
  if (card.card?.isLocked) return card.card.status === 'approved' ? 'Time card approved and locked.' : card.card.status === 'exported' ? 'Time card exported and locked.' : 'Time card locked.'
  if (card.isCardEditWindowExpired) {
    const days = card.viewer.editWindowDays
    return `Time card locked after ${days} day${days === 1 ? '' : 's'} past the pay-period end.`
  }
  return null
}

/** Card status in words for the State column (old `humanizeLabel(card.status ?? 'not started')`). */
export function cardStateLabel(status: string | null | undefined): string {
  const value = (status ?? 'not started').replace(/_/g, ' ')
  return value.charAt(0).toUpperCase() + value.slice(1)
}
