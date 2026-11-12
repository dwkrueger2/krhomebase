// file: apps/api/src/features/timekeeping/timeMath.ts
/**
 * Pure time rules for Attendance (plan `docs/07_Attendance_Port_Plan.md`, stage 1; decision 9 allows this fifth file).
 * Ported from the old `apps/kr-homebase/src/hb-lib/timekeeping/timekeeping.ts`; the as-is description of every old
 * function is in `docs/API/Timekeeping_AsIs_Reference.md`, section 5. No database, no clock reads except where a
 * caller passes "now", no date library: time zones go through `Intl`.
 *
 * Changes from the old rules (each is tested in `timeMath.test.ts`):
 *  1. Edit window (decision 3): a punch may be changed from its own work date through the end of the window.
 *     The old rule needed at least one full day to pass, so a punch could never be fixed on the day it was made.
 *  2. Overtime (decision 10): computed only, from hours over 40 in a Sunday-start week. Stored `overtime` events
 *     never count (the old code accepted them and then ignored them, silently).
 *  3. Totals come from the punch pairs. The old code preferred the stored `regular` event rows and fell back to
 *     the pairs only when there were none, so one zeroed regular row could wipe a card's regular hours.
 *  4. A clock-out with no clock-in is still shown as an exception, but adds nothing (the old code wrote a
 *     zero-hour regular event for it).
 *  5. `roundInstantToReportingIncrement` can keep the result on the same local date (`keepDate`). The old missed
 *     clock-out repair rounded 11:59 PM up to midnight of the next day and then refused it.
 *  6. Data comes in camelCase (the `queries.ts` rows are mapped before they reach these rules).
 *  7. `deriveIntervals` puts a clock-out before a clock-in at the same instant (stage 3: the midnight split closes
 *     last night and starts today at the same midnight).
 *
 * Not ported: `formatReportedHours` (no caller), and the old manager/employee window names, which `rules.ts` owns.
 */

export const DEFAULT_TIMEZONE = 'America/Chicago'
/** A Sunday. Periods are 14 days from here, forward and back. */
export const DEFAULT_PAY_PERIOD_ANCHOR = '2026-08-09'
export const DEFAULT_TIME_INCREMENT_MINUTES = 6
/** Before this local hour, yesterday's open clock-in still counts as the live shift (an overnight shift). */
export const OVERNIGHT_RECOVERY_CUTOFF_HOUR = 3
/** Weekly hours after which time is overtime. */
export const OVERTIME_WEEKLY_THRESHOLD_HOURS = 40
/** Sunday (0). The week the overtime rule counts. */
export const WORKWEEK_START_DAY = 0
/** A shift longer than this is flagged (`shift_over_10_hours`). */
export const LONG_SHIFT_MINUTES = 600

export type PunchType = 'clock_in' | 'clock_out'

/** The punch fields the rules need. */
export interface PunchLike {
  id: string
  punchType: PunchType
  /** ISO instant. */
  occurredAt: string
  voidedAt?: string | null
}

export type IntervalException =
  | 'duplicate_clock_in'
  | 'clock_out_without_clock_in'
  | 'shift_over_10_hours'
  | 'assumed_midnight_close'

/** One worked span made from a clock-in and its clock-out (or a stand-in end when the pair is broken). */
export interface DerivedInterval {
  startPunchId: string
  /** Null when no clock-out closed it. For a clock-out without a clock-in, the clock-out itself. */
  endPunchId: string | null
  startAt: string
  endAt: string
  /** Local date of the start. */
  workDate: string
  /** Rounded reported hours. 0 for a clock-out without a clock-in. */
  hours: number
  /** True when the end is a stand-in (midnight after the start), not a real clock-out. Never payable. */
  isAssumedMidnightClose: boolean
  exception: IntervalException | null
}

/** The time event fields the totals need. Regular and overtime rows are ignored (see change 2 and 3). */
export interface TimeEventLike {
  timeType: string
  hours: number
}

export interface TimekeepingTotals {
  regularHours: number
  overtimeHours: number
  ptoHours: number
  holidayHours: number
  sickHours: number
  unpaidHours: number
  otherHours: number
}

export interface PayPeriod {
  /** `pp_<start>`, the old id format. */
  id: string
  start: string
  end: string
  /** 1 for the first period of the year (the first one that ends in January). */
  number: number
}

export interface OpenPunchAgeStatus {
  /** Whole local days between the open punch's date and today. */
  daysOpen: number
  isCurrentWorkDate: boolean
  /** Yesterday's punch, before the 3 am cutoff: the overnight shift can still be closed with today's clock. */
  isRecoverableOvernight: boolean
  /** The open punch is the live shift (today, or a recoverable overnight). */
  isCurrentClockState: boolean
  /** An older open punch that must be repaired on the time card. */
  isStaleRepairRequired: boolean
}

// ----------------------------------------------------------------------------------------------------------
// Dates

/** Year, month and day of a `YYYY-MM-DD` text (missing parts read as 0, which makes an invalid date). */
function dateNumbers(value: string): [number, number, number] {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  return [year, month, day]
}

function dateAtUtc(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`)
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(value: string, days: number): string {
  const result = dateAtUtc(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

/** Whole calendar days from `start` to `end` (both `YYYY-MM-DD`); negative when `end` is earlier. */
export function calendarDayDifference(start: string, end: string): number {
  return Math.round((dateAtUtc(end).getTime() - dateAtUtc(start).getTime()) / 86_400_000)
}

/** True for a real `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = dateAtUtc(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function localParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

/** The ISO instant of a local date and wall-clock time in `timezone` (three correction passes, as the old code). */
export function localDateTimeToIso(localDate: string, hour: number, minute: number, timezone: string): string {
  const [year, month, day] = dateNumbers(localDate)
  const requestedUtc = Date.UTC(year, month - 1, day, hour, minute)
  let guess = requestedUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = localParts(new Date(guess), timezone)
    const [ly, lm, ld] = dateNumbers(local.date)
    const localAsUtc = Date.UTC(ly, lm - 1, ld, local.hour, local.minute, local.second)
    guess += requestedUtc - localAsUtc
  }
  return new Date(guess).toISOString()
}

/** The local `YYYY-MM-DD` of an instant, independent of the server's own time zone. */
export function localDateForInstant(instant: string | Date, timezone = DEFAULT_TIMEZONE): string {
  return localParts(instant instanceof Date ? instant : new Date(instant), timezone).date
}

/** The local hour (0 to 23) of an instant. */
export function localHourForInstant(instant: string | Date, timezone = DEFAULT_TIMEZONE): number {
  return localParts(instant instanceof Date ? instant : new Date(instant), timezone).hour
}

function localMidnightIso(localDate: string, timezone: string): string {
  return localDateTimeToIso(localDate, 0, 0, timezone)
}

function nextMidnightIso(occurredAt: string, timezone: string): string {
  return localMidnightIso(addDays(localDateForInstant(occurredAt, timezone), 1), timezone)
}

// ----------------------------------------------------------------------------------------------------------
// Pay periods

function periodBoundsForDate(workDate: string, anchorDate: string): { start: string; end: string } {
  const offset = calendarDayDifference(anchorDate, workDate)
  const start = addDays(anchorDate, Math.floor(offset / 14) * 14)
  return { start, end: addDays(start, 13) }
}

/** The first 14-day period of `year`: the earliest one whose end date falls in January. */
export function firstPayPeriodOfYear(year: number, anchorDate = DEFAULT_PAY_PERIOD_ANCHOR): { start: string; end: string } {
  const yearText = String(year)
  let first = periodBoundsForDate(`${yearText}-01-01`, anchorDate)
  let previous = periodBoundsForDate(addDays(first.start, -14), anchorDate)
  while (previous.end.startsWith(`${yearText}-01`)) {
    first = previous
    previous = periodBoundsForDate(addDays(first.start, -14), anchorDate)
  }
  return first
}

/** The 14-day pay period holding `workDate`, numbered within the year its end date falls in. */
export function payPeriodForDate(workDate: string, anchorDate = DEFAULT_PAY_PERIOD_ANCHOR): PayPeriod {
  const bounds = periodBoundsForDate(workDate, anchorDate)
  const first = firstPayPeriodOfYear(Number(bounds.end.slice(0, 4)), anchorDate)
  return {
    id: `pp_${bounds.start}`,
    start: bounds.start,
    end: bounds.end,
    number: Math.round(calendarDayDifference(first.start, bounds.start) / 14) + 1,
  }
}

// ----------------------------------------------------------------------------------------------------------
// Rounding

/** Rounds minutes to the reporting increment and returns hours with one decimal (6 minutes = 0.1 hour). */
export function roundMinutesToTenths(minutes: number, incrementMinutes = DEFAULT_TIME_INCREMENT_MINUTES): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  const increment = Math.max(1, incrementMinutes)
  return Number(((Math.round(minutes / increment) * increment) / 60).toFixed(1))
}

/** Reported hours between two instants; 0 when either is invalid or the end is not after the start. */
export function hoursBetween(startAt: string, endAt: string, incrementMinutes = DEFAULT_TIME_INCREMENT_MINUTES): number {
  const startMs = Date.parse(startAt)
  const endMs = Date.parse(endAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  return roundMinutesToTenths((endMs - startMs) / 60_000, incrementMinutes)
}

/**
 * Rounds a punch to the nearest increment of local wall-clock time. With `keepDate`, a time that would round past
 * midnight is rounded down instead, so it stays on its own local date (change 5).
 *
 * @throws Error `INVALID_PUNCH_TIMESTAMP` when `instant` is not a valid time (as the old code).
 */
export function roundInstantToReportingIncrement(
  instant: string | Date,
  timezone = DEFAULT_TIMEZONE,
  incrementMinutes = DEFAULT_TIME_INCREMENT_MINUTES,
  options: { keepDate?: boolean } = {},
): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_PUNCH_TIMESTAMP')
  const local = localParts(date, timezone)
  const totalMinutes = local.hour * 60 + local.minute
  const increment = Math.max(1, Math.round(incrementMinutes))
  let roundedMinutes = Math.round(totalMinutes / increment) * increment
  if (options.keepDate && roundedMinutes >= 1440) roundedMinutes = Math.floor(totalMinutes / increment) * increment
  const roundedDate = addDays(local.date, Math.floor(roundedMinutes / 1440))
  const dayMinutes = roundedMinutes % 1440
  return localDateTimeToIso(roundedDate, Math.floor(dayMinutes / 60), dayMinutes % 60, timezone)
}

// ----------------------------------------------------------------------------------------------------------
// Punch pairs

/**
 * Pairs the punches that are not voided, in time order, into intervals (the old `deriveIntervals`):
 *  - clock-in then clock-out: one interval; flagged `shift_over_10_hours` past 10 hours.
 *  - clock-in then another clock-in: the first is closed at its next local midnight, flagged `duplicate_clock_in`.
 *  - clock-out with nothing open: a zero-hour interval flagged `clock_out_without_clock_in`.
 *  - a clock-in still open at the end: closed at its next local midnight, flagged `assumed_midnight_close`.
 * Stand-in ends are display only; they never count toward totals.
 */
export function deriveIntervals(
  punches: PunchLike[],
  timezone = DEFAULT_TIMEZONE,
  incrementMinutes = DEFAULT_TIME_INCREMENT_MINUTES,
): DerivedInterval[] {
  // At the same instant a clock-out comes first, so it closes the earlier shift before a new one starts (the midnight
  // split saves both at local midnight).
  const order = (punch: PunchLike) => (punch.punchType === 'clock_out' ? 0 : 1)
  const active = punches
    .filter((punch) => !punch.voidedAt)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || order(a) - order(b))
  const intervals: DerivedInterval[] = []
  let open: PunchLike | null = null

  const assumedClose = (start: PunchLike, exception: IntervalException): DerivedInterval => {
    const endAt = nextMidnightIso(start.occurredAt, timezone)
    return {
      startPunchId: start.id,
      endPunchId: null,
      startAt: start.occurredAt,
      endAt,
      workDate: localDateForInstant(start.occurredAt, timezone),
      hours: hoursBetween(start.occurredAt, endAt, incrementMinutes),
      isAssumedMidnightClose: true,
      exception,
    }
  }

  for (const punch of active) {
    if (punch.punchType === 'clock_in') {
      if (open) intervals.push(assumedClose(open, 'duplicate_clock_in'))
      open = punch
      continue
    }
    if (!open) {
      intervals.push({
        startPunchId: punch.id,
        endPunchId: punch.id,
        startAt: punch.occurredAt,
        endAt: punch.occurredAt,
        workDate: localDateForInstant(punch.occurredAt, timezone),
        hours: 0,
        isAssumedMidnightClose: false,
        exception: 'clock_out_without_clock_in',
      })
      continue
    }
    const minutes = (Date.parse(punch.occurredAt) - Date.parse(open.occurredAt)) / 60_000
    intervals.push({
      startPunchId: open.id,
      endPunchId: punch.id,
      startAt: open.occurredAt,
      endAt: punch.occurredAt,
      workDate: localDateForInstant(open.occurredAt, timezone),
      hours: hoursBetween(open.occurredAt, punch.occurredAt, incrementMinutes),
      isAssumedMidnightClose: false,
      exception: minutes > LONG_SHIFT_MINUTES ? 'shift_over_10_hours' : null,
    })
    open = null
  }
  if (open) intervals.push(assumedClose(open, 'assumed_midnight_close'))
  return intervals
}

/** True for an interval made of a real clock-in and a real clock-out (the only kind that counts toward pay). */
export function isPayableInterval(interval: DerivedInterval): boolean {
  return !interval.isAssumedMidnightClose && interval.exception !== 'clock_out_without_clock_in' && interval.endPunchId !== null
}

/**
 * How long an open clock-in has been open, by local date (the old `getOpenPunchAgeStatus`). Yesterday's punch
 * before 3 am local time is still the live (overnight) shift; anything older must be repaired on the card.
 */
export function openPunchAgeStatus(
  openPunchLocalDate: string,
  today: string,
  now: string | Date,
  timezone = DEFAULT_TIMEZONE,
  cutoffHour = OVERNIGHT_RECOVERY_CUTOFF_HOUR,
): OpenPunchAgeStatus {
  const daysOpen = calendarDayDifference(openPunchLocalDate, today)
  const isCurrentWorkDate = daysOpen === 0
  const isRecoverableOvernight = daysOpen === 1 && localHourForInstant(now, timezone) < cutoffHour
  return {
    daysOpen,
    isCurrentWorkDate,
    isRecoverableOvernight,
    isCurrentClockState: isCurrentWorkDate || isRecoverableOvernight,
    isStaleRepairRequired: daysOpen > 0 && !isRecoverableOvernight,
  }
}

// ----------------------------------------------------------------------------------------------------------
// Edit windows

/**
 * True when a punch dated `workDate` may still be changed on `today` with a window of `windowDays` (change 1):
 * from the work date itself through `windowDays` days after it. A future date is never in the window.
 */
export function isWithinCalendarEditWindow(workDate: string, today: string, windowDays: number): boolean {
  const elapsed = calendarDayDifference(workDate, today)
  return elapsed >= 0 && elapsed <= windowDays
}

/** True when more than `windowDays` days have passed since the period ended (unchanged). */
export function isTimeCardEditWindowExpired(periodEnd: string, today: string, windowDays: number): boolean {
  return calendarDayDifference(periodEnd, today) > windowDays
}

// ----------------------------------------------------------------------------------------------------------
// Totals

/** Splits hours into regular and overtime by Sunday-start week (over 40 a week is overtime; weeks not averaged). */
export function workweekOvertime(intervals: Array<{ workDate: string; hours: number }>): { regularHours: number; overtimeHours: number } {
  const weeks = new Map<string, number>()
  for (const interval of intervals) {
    const offset = (dateAtUtc(interval.workDate).getUTCDay() - WORKWEEK_START_DAY + 7) % 7
    const weekStart = addDays(interval.workDate, -offset)
    weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + interval.hours)
  }
  let regularHours = 0
  let overtimeHours = 0
  for (const total of weeks.values()) {
    regularHours += Math.min(OVERTIME_WEEKLY_THRESHOLD_HOURS, total)
    overtimeHours += Math.max(0, total - OVERTIME_WEEKLY_THRESHOLD_HOURS)
  }
  return { regularHours: Number(regularHours.toFixed(1)), overtimeHours: Number(overtimeHours.toFixed(1)) }
}

const EVENT_TOTAL: Record<string, keyof TimekeepingTotals> = {
  pto: 'ptoHours',
  holiday: 'holidayHours',
  sick: 'sickHours',
  unpaid: 'unpaidHours',
  other: 'otherHours',
}

/**
 * A card's totals. Regular and overtime come from the payable punch pairs (changes 2 to 4); the other categories
 * from the hand-entered events. Every figure is rounded to the reporting increment.
 */
export function timekeepingTotals(
  intervals: DerivedInterval[],
  events: TimeEventLike[] = [],
  incrementMinutes = DEFAULT_TIME_INCREMENT_MINUTES,
): TimekeepingTotals {
  const round = (hours: number) => roundMinutesToTenths(hours * 60, incrementMinutes)
  const work = workweekOvertime(intervals.filter(isPayableInterval))
  const totals: TimekeepingTotals = {
    regularHours: round(work.regularHours),
    overtimeHours: round(work.overtimeHours),
    ptoHours: 0,
    holidayHours: 0,
    sickHours: 0,
    unpaidHours: 0,
    otherHours: 0,
  }
  for (const event of events) {
    const field = EVENT_TOTAL[event.timeType]
    const hours = round(Number(event.hours))
    if (field && hours > 0) totals[field] = round(totals[field] + hours)
  }
  return totals
}

/**
 * Minutes worked on `today` up to `now`: closed pairs, plus the shift still open (the old dashboard widget counted
 * it; the old server did not). Only the part of each span inside today's local day counts.
 */
export function minutesWorkedOnDay(intervals: DerivedInterval[], openPunchAt: string | null, today: string, now: string, timezone = DEFAULT_TIMEZONE): number {
  const dayStart = Date.parse(localMidnightIso(today, timezone))
  const dayEnd = Math.min(Date.parse(localMidnightIso(addDays(today, 1), timezone)), Date.parse(now))
  const overlap = (startAt: string, endAt: string) => Math.max(0, Math.min(Date.parse(endAt), dayEnd) - Math.max(Date.parse(startAt), dayStart))
  let ms = intervals.filter(isPayableInterval).reduce((sum, interval) => sum + overlap(interval.startAt, interval.endAt), 0)
  if (openPunchAt) ms += overlap(openPunchAt, now)
  return Math.floor(ms / 60_000)
}
