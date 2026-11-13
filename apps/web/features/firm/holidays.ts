// file: apps/web/features/firm/holidays.ts
/**
 * Holiday calendar helpers for Employee Policies (Settings plan, stage 5), ported from the old
 * `kr-validator-helpers/EmployeePolicyValue.helpers.ts` and `firm-settings/EmployeePolicyHoliday.helpers.ts`: the
 * month labels (`01-Jan`), the days a month offers, the rule summary (`MM/DD` or `3rd Monday in 01-Jan`), the date
 * a holiday falls on in a year, the add-holiday dialog's draft, and the date order the calendar is listed in.
 *
 * Changed from the old helpers: the observed date is worked out for any year (the old column was fixed to 2026),
 * and February offers 29 days (the old list stopped at 28, so a February 29 holiday could not be chosen).
 * Display only; the API checks and cleans what is saved.
 */

import { HOLIDAY_WEEKDAYS, type HolidayRule } from '@krhomebase/contracts'

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const clampMonth = (month: number | string) => Math.min(12, Math.max(1, Number(month) || 1))

/** `01-Jan` … `12-Dec`. */
export function monthLabel(month: number | string): string {
  const numeric = clampMonth(month)
  return `${String(numeric).padStart(2, '0')}-${MONTH_NAMES[numeric - 1]}`
}

/** The day numbers a month offers. */
export function daysForMonth(month: number | string): number[] {
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][clampMonth(month) - 1] ?? 31
  return Array.from({ length: max }, (_, index) => index + 1)
}

/** `MM/DD`, or `{ordinal} {weekday} in {MM-Mon}`. */
export function holidayRuleSummary(holiday: HolidayRule): string {
  if (holiday.ruleType === 'specific-date') return `${String(holiday.month).padStart(2, '0')}/${String(holiday.dayOfMonth ?? 1).padStart(2, '0')}`
  return `${holiday.ordinal ?? '1st'} ${holiday.weekday ?? 'Monday'} in ${monthLabel(holiday.month)}`
}

/** The date the holiday falls on in `year`, as `MM-Mon-DD` (the old column's form). */
export function holidayObservation(holiday: HolidayRule, year: number): string {
  const month = clampMonth(holiday.month)
  const lastDay = new Date(year, month, 0).getDate()
  if (holiday.ruleType === 'specific-date') {
    const day = Math.min(lastDay, Math.max(1, Number(holiday.dayOfMonth) || 1))
    return `${monthLabel(month)}-${String(day).padStart(2, '0')}`
  }
  const weekdayIndex = HOLIDAY_WEEKDAYS.indexOf(holiday.weekday ?? 'Monday')
  const target = weekdayIndex < 0 ? 1 : (weekdayIndex + 1) % 7
  const dates = Array.from({ length: lastDay }, (_, index) => index + 1).filter((day) => new Date(year, month - 1, day).getDay() === target)
  const ordinalIndex = { '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4, last: -1 }[holiday.ordinal ?? '1st']
  const day = ordinalIndex === -1 ? dates.at(-1) : (dates[ordinalIndex] ?? dates.at(-1))
  return `${monthLabel(month)}-${String(day ?? 1).padStart(2, '0')}`
}

/** What the add or edit holiday dialog holds (text values, as the old dialog kept them). */
export interface HolidayDraft {
  presetId: string
  name: string
  ruleType: HolidayRule['ruleType']
  month: string
  dayOfMonth: string
  ordinal: NonNullable<HolidayRule['ordinal']>
  weekday: NonNullable<HolidayRule['weekday']>
}

/** The old new-holiday draft: "Firm Holiday No 1", January 1. */
export function defaultHolidayDraft(): HolidayDraft {
  return { presetId: 'custom', name: 'Firm Holiday No 1', ruleType: 'specific-date', month: '1', dayOfMonth: '1', ordinal: '1st', weekday: 'Monday' }
}

/** A draft from a preset or a saved holiday (`presetId` is `custom` for a holiday that is not a preset). */
export function draftFromHoliday(holiday: HolidayRule, presetId = holiday.id): HolidayDraft {
  return {
    presetId,
    name: holiday.name,
    ruleType: holiday.ruleType,
    month: String(holiday.month),
    dayOfMonth: String(holiday.dayOfMonth ?? 1),
    ordinal: holiday.ordinal ?? '1st',
    weekday: holiday.weekday ?? 'Monday',
  }
}

/** The holiday a draft describes; a custom one gets `holiday-<base36 time>-<5 random>` unless it keeps `keepId`. */
export function holidayFromDraft(draft: HolidayDraft, keepId?: string): HolidayRule {
  const id = keepId ?? (draft.presetId !== 'custom' ? draft.presetId : `holiday-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`)
  const month = clampMonth(draft.month)
  const name = draft.name.trim() || 'Firm Holiday'
  if (draft.ruleType === 'specific-date') return { id, name, ruleType: 'specific-date', month, dayOfMonth: Math.min(31, Math.max(1, Number(draft.dayOfMonth) || 1)) }
  return { id, name, ruleType: 'floating-weekday', month, ordinal: draft.ordinal, weekday: draft.weekday }
}

/** The month and day a holiday falls on in `year` (for sorting), as `MMDD`. */
export function holidaySortKey(holiday: HolidayRule, year: number): number {
  const [, , day] = holidayObservation(holiday, year).split('-')
  return Math.min(12, Math.max(1, Number(holiday.month) || 1)) * 100 + (Number(day) || 1)
}

/**
 * Holidays in the order they fall in the year (the requester, Nov 12, 2026), by the date each one falls on in
 * `year`; holidays on the same day keep their name order.
 */
export function sortHolidays(holidays: readonly HolidayRule[], year: number): HolidayRule[] {
  return [...holidays].sort((a, b) => holidaySortKey(a, year) - holidaySortKey(b, year) || a.name.localeCompare(b.name))
}
