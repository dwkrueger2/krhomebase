// file: apps/api/src/features/timekeeping/timeMath.test.ts
/**
 * The Attendance time rules (`timeMath.ts`). The old library had no tests; the expected values come from the as-is
 * reference (`docs/API/Timekeeping_AsIs_Reference.md`, section 5) and the changes listed in `timeMath.ts`. Change 8
 * (Nov 13, 2026): punch times are exact; only the hours worked out from them are rounded ("exact punches" below).
 * Change 9 (decision D19): a pair's rounded hours are stored when it is closed and read back ("stored pair hours").
 * Times are in America/Chicago: CDT (UTC-5) until Nov 1, 2026, CST (UTC-6) after.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/timekeeping/timeMath.test.ts
 */

import { describe, expect, it } from 'vitest'
import {
  addDays,
  applyStoredPairHours,
  calendarDayDifference,
  deriveIntervals,
  firstPayPeriodOfYear,
  hoursBetween,
  isIsoDate,
  isTimeCardEditWindowExpired,
  isWithinCalendarEditWindow,
  localDateForInstant,
  localDateTimeToIso,
  minutesWorkedOnDay,
  openPunchAgeStatus,
  payPeriodForDate,
  planPairHours,
  roundInstantToReportingIncrement,
  roundMinutesToTenths,
  timekeepingTotals,
  truncateToMinute,
  workweekOvertime,
  type PunchLike,
} from './timeMath.ts'

const TZ = 'America/Chicago'
const punchIn = (id: string, at: string): PunchLike => ({ id, punchType: 'clock_in', occurredAt: at })
const punchOut = (id: string, at: string): PunchLike => ({ id, punchType: 'clock_out', occurredAt: at })

describe('dates', () => {
  it('adds days and counts days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(calendarDayDifference('2026-11-10', '2026-11-11')).toBe(1)
    expect(calendarDayDifference('2026-11-11', '2026-11-10')).toBe(-1)
  })

  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('11/11/2026')).toBe(false)
  })

  it('turns local wall-clock time into an instant on both sides of daylight-saving time', () => {
    expect(localDateTimeToIso('2026-07-01', 8, 0, TZ)).toBe('2026-07-01T13:00:00.000Z')
    expect(localDateTimeToIso('2026-11-11', 8, 0, TZ)).toBe('2026-11-11T14:00:00.000Z')
  })

  it('finds the local date of an instant, not the UTC date', () => {
    expect(localDateForInstant('2026-11-12T03:30:00.000Z', TZ)).toBe('2026-11-11')
  })
})

describe('pay periods', () => {
  it('counts 14-day periods from the anchor, forward and back', () => {
    expect(payPeriodForDate('2026-08-09')).toMatchObject({ id: 'pp_2026-08-09', start: '2026-08-09', end: '2026-08-22' })
    expect(payPeriodForDate('2026-11-11')).toMatchObject({ id: 'pp_2026-11-01', start: '2026-11-01', end: '2026-11-14' })
    expect(payPeriodForDate('2026-08-08')).toMatchObject({ start: '2026-07-26', end: '2026-08-08' })
  })

  it('numbers periods within the year of their end date, starting at the first period ending in January', () => {
    const first = firstPayPeriodOfYear(2027)
    expect(first.end.startsWith('2027-01')).toBe(true)
    expect(addDays(first.start, -1).startsWith('2026-12') || addDays(first.start, -1).startsWith('2027-01')).toBe(true)
    expect(payPeriodForDate(first.start).number).toBe(1)
    expect(payPeriodForDate(addDays(first.start, 14)).number).toBe(2)
    // The period before the first one ends in December and belongs to 2026.
    const previous = payPeriodForDate(addDays(first.start, -1))
    expect(previous.end.startsWith('2026-12')).toBe(true)
    expect(previous.number).toBeGreaterThan(20)
  })
})

describe('rounding', () => {
  it('rounds minutes to the nearest 6 and reports tenths of an hour', () => {
    expect(roundMinutesToTenths(8)).toBe(0.1)
    expect(roundMinutesToTenths(9)).toBe(0.2)
    expect(roundMinutesToTenths(480)).toBe(8)
    expect(roundMinutesToTenths(-5)).toBe(0)
  })

  it('reports 0 hours for a reversed or invalid span', () => {
    expect(hoursBetween('2026-11-11T14:00:00.000Z', '2026-11-11T22:30:00.000Z')).toBe(8.5)
    expect(hoursBetween('2026-11-11T22:30:00.000Z', '2026-11-11T14:00:00.000Z')).toBe(0)
    expect(hoursBetween('not a time', '2026-11-11T14:00:00.000Z')).toBe(0)
  })

  it('rounds a punch to the nearest increment of local time', () => {
    expect(roundInstantToReportingIncrement('2026-11-11T14:02:00.000Z', TZ)).toBe('2026-11-11T14:00:00.000Z')
    expect(roundInstantToReportingIncrement('2026-11-11T14:03:00.000Z', TZ)).toBe('2026-11-11T14:06:00.000Z')
  })

  it('moves 11:59 PM to midnight of the next day by default, but keeps it on its date with keepDate (change 5)', () => {
    const lateNov10 = '2026-11-11T05:59:00.000Z' // 11:59 PM Nov 10, local
    const rounded = roundInstantToReportingIncrement(lateNov10, TZ)
    expect(localDateForInstant(rounded, TZ)).toBe('2026-11-11')
    const kept = roundInstantToReportingIncrement(lateNov10, TZ, 6, { keepDate: true })
    expect(kept).toBe('2026-11-11T05:54:00.000Z') // 11:54 PM Nov 10
    expect(localDateForInstant(kept, TZ)).toBe('2026-11-10')
  })

  it('refuses an invalid time', () => {
    expect(() => roundInstantToReportingIncrement('nope', TZ)).toThrow('INVALID_PUNCH_TIMESTAMP')
  })
})

describe('exact punches (change 8)', () => {
  it('keeps a typed punch to the minute: seconds dropped, nothing rounded, 11:59 PM on its own date', () => {
    expect(truncateToMinute('2026-11-11T14:02:59.999Z')).toBe('2026-11-11T14:02:00.000Z')
    expect(truncateToMinute(new Date('2026-11-11T14:04:00.000Z'))).toBe('2026-11-11T14:04:00.000Z')
    const lateNov10 = truncateToMinute('2026-11-11T05:59:30.000Z') // 11:59:30 PM Nov 10, local
    expect(lateNov10).toBe('2026-11-11T05:59:00.000Z')
    expect(localDateForInstant(lateNov10, TZ)).toBe('2026-11-10')
    expect(() => truncateToMinute('nope')).toThrow('INVALID_PUNCH_TIMESTAMP')
  })

  it('rounds the span of a pair of exact punches, not the punches', () => {
    // 8:04 AM to 4:31 PM is 507 minutes: 8.5 hours. Rounding each punch first (8:06 to 4:30) gave 8.4.
    const [pair] = deriveIntervals([punchIn('i', '2026-11-11T14:04:00.000Z'), punchOut('o', '2026-11-11T22:31:00.000Z')], TZ)
    expect(pair).toMatchObject({ startAt: '2026-11-11T14:04:00.000Z', endAt: '2026-11-11T22:31:00.000Z', hours: 8.5 })
    // Seconds count toward the span: 2:00:00 to 2:02:59 is just under 3 minutes, so 0 hours.
    expect(hoursBetween('2026-11-11T20:00:00.000Z', '2026-11-11T20:02:59.000Z')).toBe(0)
    expect(hoursBetween('2026-11-11T20:00:00.000Z', '2026-11-11T20:03:00.000Z')).toBe(0.1)
  })

  it('keeps a pair across midnight on the start date, with the hours of the real span', () => {
    // 11:58 PM Nov 10 to 12:03 AM Nov 11: 5 minutes, 0.1 hour, on Nov 10.
    const [pair] = deriveIntervals([punchIn('i', '2026-11-11T05:58:00.000Z'), punchOut('o', '2026-11-11T06:03:00.000Z')], TZ)
    expect(pair).toMatchObject({ workDate: '2026-11-10', hours: 0.1, exception: null })
  })

  it('totals the rounded pair hours of exact punches', () => {
    const intervals = deriveIntervals(
      [
        punchIn('i1', '2026-11-11T14:04:00.000Z'), // 8:04 AM
        punchOut('o1', '2026-11-11T18:01:37.000Z'), // 12:01:37 PM: 237.6 minutes, 4.0 hours
        punchIn('i2', '2026-11-11T18:32:00.000Z'), // 12:32 PM
        punchOut('o2', '2026-11-11T22:31:00.000Z'), // 4:31 PM: 239 minutes, 4.0 hours
      ],
      TZ,
    )
    expect(intervals.map((interval) => interval.hours)).toEqual([4, 4])
    expect(timekeepingTotals(intervals).regularHours).toBe(8)
  })
})

describe('deriveIntervals', () => {
  it('pairs in and out in time order, ignoring voided punches', () => {
    const intervals = deriveIntervals(
      [
        punchOut('o1', '2026-11-11T22:00:00.000Z'),
        punchIn('i1', '2026-11-11T14:00:00.000Z'),
        { ...punchIn('void', '2026-11-11T13:00:00.000Z'), voidedAt: '2026-11-11T15:00:00.000Z' },
      ],
      TZ,
    )
    expect(intervals).toEqual([
      expect.objectContaining({ startPunchId: 'i1', endPunchId: 'o1', workDate: '2026-11-11', hours: 8, exception: null, isAssumedMidnightClose: false }),
    ])
  })

  it('closes the earlier shift first when a clock-out and a clock-in share an instant (the midnight split)', () => {
    const midnight = '2026-11-12T06:00:00.000Z'
    const intervals = deriveIntervals(
      [punchIn('new', midnight), punchOut('close', midnight), punchIn('old', '2026-11-12T02:00:00.000Z'), punchOut('end', '2026-11-12T07:00:00.000Z')],
      TZ,
    )
    expect(intervals.map((interval) => [interval.startPunchId, interval.endPunchId, interval.hours, interval.exception])).toEqual([
      ['old', 'close', 4, null],
      ['new', 'end', 1, null],
    ])
  })

  it('flags a shift over 10 hours', () => {
    const [interval] = deriveIntervals([punchIn('i', '2026-11-11T13:00:00.000Z'), punchOut('o', '2026-11-11T23:30:00.000Z')], TZ)
    expect(interval!.exception).toBe('shift_over_10_hours')
  })

  it('closes a duplicate clock-in at midnight and an open one at midnight, as stand-ins', () => {
    const intervals = deriveIntervals([punchIn('a', '2026-11-11T14:00:00.000Z'), punchIn('b', '2026-11-12T14:00:00.000Z')], TZ)
    expect(intervals.map((i) => [i.startPunchId, i.exception, i.isAssumedMidnightClose, i.endAt])).toEqual([
      ['a', 'duplicate_clock_in', true, '2026-11-12T06:00:00.000Z'],
      ['b', 'assumed_midnight_close', true, '2026-11-13T06:00:00.000Z'],
    ])
  })

  it('shows a clock-out without a clock-in as a zero-hour exception', () => {
    const [interval] = deriveIntervals([punchOut('o', '2026-11-11T22:00:00.000Z')], TZ)
    expect(interval!).toMatchObject({ startPunchId: 'o', endPunchId: 'o', hours: 0, exception: 'clock_out_without_clock_in' })
  })
})

describe('stored pair hours (change 9)', () => {
  const pairs = () =>
    deriveIntervals(
      [
        punchIn('i1', '2026-11-11T14:00:00.000Z'),
        punchOut('o1', '2026-11-11T22:30:00.000Z'), // 8.5 hours
        punchIn('i2', '2026-11-12T14:00:00.000Z'),
        punchOut('o2', '2026-11-12T18:00:00.000Z'), // 4 hours
        punchIn('open', '2026-11-13T14:00:00.000Z'), // a stand-in end: never stored
      ],
      TZ,
    )
  const row = (id: string, startAt: string | null, endAt: string | null, hours: number) => ({ id, startAt, endAt, hours })

  it('shows the stored figure for a pair, and the calculated hours for a pair with none', () => {
    const shown = applyStoredPairHours(pairs(), [row('r1', '2026-11-11T14:00:00Z', '2026-11-11T22:30:00Z', 8.4)])
    expect(shown.map((interval) => interval.hours)).toEqual([8.4, 4, expect.any(Number)])
    expect(timekeepingTotals(shown).regularHours).toBe(12.4)
  })

  it('does not trust a retired 0 for a pair that works out to more than 0, nor a row with no start and end', () => {
    const shown = applyStoredPairHours(pairs(), [row('r1', '2026-11-11T14:00:00.000Z', '2026-11-11T22:30:00.000Z', 0), row('r2', null, null, 3)])
    expect(shown.slice(0, 2).map((interval) => interval.hours)).toEqual([8.5, 4])
  })

  it('plans a new row for a newly closed pair and keeps a pair that has its figure', () => {
    const plan = planPairHours(pairs(), [row('r1', '2026-11-11T14:00:00.000Z', '2026-11-11T22:30:00.000Z', 8.5)])
    expect(plan).toEqual({
      writes: [{ rowId: null, workDate: '2026-11-12', startAt: '2026-11-12T14:00:00.000Z', endAt: '2026-11-12T18:00:00.000Z', hours: 4 }],
      retire: [],
    })
  })

  it('reuses the row of an edited pair, rewrites a retired row of the same pair, and retires a figure whose pair is gone', () => {
    const plan = planPairHours(pairs(), [
      row('old', '2026-11-11T14:00:00.000Z', '2026-11-11T22:00:00.000Z', 8), // the first pair before its clock-out was changed
      row('retired', '2026-11-12T14:00:00.000Z', '2026-11-12T18:00:00.000Z', 0), // the second pair, retired earlier
      row('gone', '2026-11-10T14:00:00.000Z', '2026-11-10T22:00:00.000Z', 8), // a pair that was voided
    ])
    expect(plan.writes).toEqual([
      { rowId: 'retired', workDate: '2026-11-12', startAt: '2026-11-12T14:00:00.000Z', endAt: '2026-11-12T18:00:00.000Z', hours: 4 },
      { rowId: 'old', workDate: '2026-11-11', startAt: '2026-11-11T14:00:00.000Z', endAt: '2026-11-11T22:30:00.000Z', hours: 8.5 },
    ])
    expect(plan.retire).toEqual(['gone'])
  })

  it('plans nothing when every pair has its figure and no other row has hours', () => {
    const stored = [
      row('r1', '2026-11-11T14:00:00.000Z', '2026-11-11T22:30:00.000Z', 8.5),
      row('r2', '2026-11-12T14:00:00.000Z', '2026-11-12T18:00:00.000Z', 4),
      row('spent', '2026-11-09T14:00:00.000Z', '2026-11-09T15:00:00.000Z', 0),
    ]
    expect(planPairHours(pairs(), stored)).toEqual({ writes: [], retire: [] })
  })
})

describe('open punch age', () => {
  it("treats yesterday's punch before 3 am as the live overnight shift, and after 3 am as needing repair", () => {
    const at2am = '2026-11-11T08:00:00.000Z' // 2 AM local
    const at4am = '2026-11-11T10:00:00.000Z' // 4 AM local
    expect(openPunchAgeStatus('2026-11-10', '2026-11-11', at2am, TZ)).toMatchObject({ isRecoverableOvernight: true, isCurrentClockState: true, isStaleRepairRequired: false })
    expect(openPunchAgeStatus('2026-11-10', '2026-11-11', at4am, TZ)).toMatchObject({ isRecoverableOvernight: false, isCurrentClockState: false, isStaleRepairRequired: true })
    expect(openPunchAgeStatus('2026-11-11', '2026-11-11', at4am, TZ)).toMatchObject({ isCurrentWorkDate: true, isCurrentClockState: true })
  })
})

describe('edit windows', () => {
  it('allows changes from the work date itself through the window (change 1), never for a future date', () => {
    expect(isWithinCalendarEditWindow('2026-11-11', '2026-11-11', 1)).toBe(true)
    expect(isWithinCalendarEditWindow('2026-11-10', '2026-11-11', 1)).toBe(true)
    expect(isWithinCalendarEditWindow('2026-11-09', '2026-11-11', 1)).toBe(false)
    expect(isWithinCalendarEditWindow('2026-11-07', '2026-11-11', 4)).toBe(true)
    expect(isWithinCalendarEditWindow('2026-11-12', '2026-11-11', 4)).toBe(false)
    expect(isWithinCalendarEditWindow('2026-11-11', '2026-11-11', 0)).toBe(true)
  })

  it('expires a card the given number of days after its period ends', () => {
    expect(isTimeCardEditWindowExpired('2026-11-07', '2026-11-08', 1)).toBe(false)
    expect(isTimeCardEditWindowExpired('2026-11-07', '2026-11-09', 1)).toBe(true)
  })
})

describe('totals', () => {
  it('counts overtime past 40 hours per Sunday-start week, without averaging weeks', () => {
    expect(workweekOvertime([
      { workDate: '2026-11-08', hours: 30 }, // Sunday
      { workDate: '2026-11-14', hours: 15 }, // Saturday, same week
      { workDate: '2026-11-15', hours: 5 }, // next Sunday
    ])).toEqual({ regularHours: 45, overtimeHours: 5 })
  })

  it('takes regular hours from real pairs only and hand-entered categories from events (changes 2 to 4)', () => {
    const intervals = deriveIntervals(
      [
        punchIn('i1', '2026-11-11T14:00:00.000Z'),
        punchOut('o1', '2026-11-11T22:00:00.000Z'),
        punchOut('orphan', '2026-11-12T22:00:00.000Z'),
        punchIn('open', '2026-11-13T14:00:00.000Z'),
      ],
      TZ,
    )
    const totals = timekeepingTotals(intervals, [
      { timeType: 'pto', hours: 4 },
      { timeType: 'holiday', hours: 8 },
      { timeType: 'overtime', hours: 9 }, // stored overtime never counts
      { timeType: 'regular', hours: 0 }, // a zeroed regular row no longer wipes the pairs
      { timeType: 'sick', hours: -2 },
    ])
    expect(totals).toEqual({ regularHours: 8, overtimeHours: 0, ptoHours: 4, holidayHours: 8, sickHours: 0, unpaidHours: 0, otherHours: 0 })
  })

  it('counts minutes worked today, including the shift still open', () => {
    const today = '2026-11-11'
    const intervals = deriveIntervals([punchIn('i1', '2026-11-11T14:00:00.000Z'), punchOut('o1', '2026-11-11T16:00:00.000Z')], TZ)
    expect(minutesWorkedOnDay(intervals, null, today, '2026-11-11T20:00:00.000Z', TZ)).toBe(120)
    expect(minutesWorkedOnDay(intervals, '2026-11-11T19:00:00.000Z', today, '2026-11-11T20:00:00.000Z', TZ)).toBe(180)
    // An overnight shift counts only from today's midnight.
    expect(minutesWorkedOnDay([], '2026-11-11T05:00:00.000Z', today, '2026-11-11T07:00:00.000Z', TZ)).toBe(60)
  })
})
