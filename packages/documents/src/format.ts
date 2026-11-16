// file: packages/documents/src/format.ts
/**
 * Money, hour and date formatting for the printable billing documents. Every builder and (from part 7b) every
 * template formats through this file, so the print page, the emailed PDF and the stored copy print the same text.
 *
 * Ported from the old `KR-Billing/formatAccountingAmount.ts`, the formatters at the top of
 * `KR-Billing/Invoicing/invoiceReportShared.tsx` (`formatMoney`, `formatMoneyOrDash`, `formatRateOrDash`,
 * `formatHoursSuffix`) and the date helpers of `buildInvoiceReportData.ts` (`roundMoney`, `formatLongDate`,
 * `formatShortDate`, `addDaysLong`).
 *
 * Changed from the old helpers: dates. The old ones read every text with `new Date(text)` and printed it in the
 * computer's own time zone. That works in a browser in Texas for `MM/DD/YYYY`, but prints the day before for
 * `YYYY-MM-DD` (read as UTC midnight), and on a Worker (which runs in UTC) prints tomorrow's date for anything after
 * 6pm in Texas. Here a date text is a calendar date and is never moved; an instant (a `Date`, or a text with a time)
 * is shown as its calendar date in the firm's time zone (`FIRM_TIME_ZONE`).
 */

/** The firm's time zone: work dates, statement dates and file names are dates here (the offices are in TX and KS). */
export const FIRM_TIME_ZONE = 'America/Chicago'

/** Rounds to cents to avoid floating-point drift in displayed totals. */
export function roundMoney(value: number): number {
  const rVal = Math.round(value * 100) / 100
  return rVal
}

/** Formats accounting amounts with a dollar sign, commas, and two decimals (old `KR-Billing/formatAccountingAmount.ts`). */
export function formatAccountingAmount(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Formats a dollar amount; negatives print with a leading minus as in the templates (−$1,500.00). */
export function formatMoney(value: number): string {
  const rVal = value < 0 ? `−${formatAccountingAmount(Math.abs(value))}` : formatAccountingAmount(value)
  return rVal
}

/** Formats a nullable amount; null prints the template's em dash. */
export function formatMoneyOrDash(value: number | null | undefined): string {
  const rVal = typeof value === 'number' ? formatMoney(value) : '—'
  return rVal
}

/** Formats an hourly rate for the Rate column; lines without a rate print an em dash. */
export function formatRateOrDash(rate: number | undefined): string {
  const rVal = typeof rate === 'number' ? formatAccountingAmount(rate) : '—'
  return rVal
}

/** Formats decimal hours for the description suffix, e.g. "1.50 hrs". */
export function formatHoursSuffix(hours: number | undefined): string {
  const rVal = typeof hours === 'number' && hours > 0 ? ` — ${hours.toFixed(2)} hrs` : ''
  return rVal
}

// ---------------------------------------------------------------------------------------------------------------
// Calendar dates

/** A date with no time and no time zone. `month` is 1 to 12. */
export interface CalendarDate {
  year: number
  month: number
  day: number
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

/** True when the three numbers name a real day (no February 30). */
function isRealDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

/** The calendar date of an instant in a time zone (default: the firm's). */
export function calendarDateOfInstant(instant: Date, timeZone: string = FIRM_TIME_ZONE): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(instant)
  const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? NaN)
  const rVal: CalendarDate = { year: pick('year'), month: pick('month'), day: pick('day') }
  return rVal
}

/**
 * Reads a date as a calendar date.
 *
 * - `MM/DD/YYYY` (the Billing record's form) and `YYYY-MM-DD` are calendar dates as written.
 * - A `Date`, or a text with a time (`2026-09-24T03:10:00Z`), is an instant: its date in `timeZone`.
 *
 * @returns The calendar date, or null when the value is not a date.
 */
export function readCalendarDate(value: string | Date | null | undefined, timeZone: string = FIRM_TIME_ZONE): CalendarDate | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : calendarDateOfInstant(value, timeZone)
  const text = (value ?? '').trim()
  if (!text) return null
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    const [year, month, day] = [Number(us[3]), Number(us[1]), Number(us[2])]
    return isRealDay(year, month, day) ? { year, month, day } : null
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return isRealDay(year, month, day) ? { year, month, day } : null
  }
  const instant = new Date(text)
  const rVal = Number.isNaN(instant.getTime()) ? null : calendarDateOfInstant(instant, timeZone)
  return rVal
}

/** Adds whole days to a calendar date (month and year ends roll over). */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  const rVal: CalendarDate = { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() }
  return rVal
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  const rVal = Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000)
  return rVal
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** "September 23, 2026". */
export function longDateOf(date: CalendarDate): string {
  const rVal = `${MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`
  return rVal
}

/** "09/23/2026". */
export function shortDateOf(date: CalendarDate): string {
  const rVal = `${pad2(date.month)}/${pad2(date.day)}/${date.year}`
  return rVal
}

/** "2026-09-23" (sorts as text). */
export function isoDateOf(date: CalendarDate): string {
  const rVal = `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
  return rVal
}

/** Formats a date as the long form the templates print ("September 23, 2026"); a value that is not a date is returned as it is. */
export function formatLongDate(value: string | Date, timeZone: string = FIRM_TIME_ZONE): string {
  const date = readCalendarDate(value, timeZone)
  const rVal = date ? longDateOf(date) : String(value)
  return rVal
}

/** Formats a date as MM/DD/YYYY for table rows; a value that is not a date is returned as it is. */
export function formatShortDate(value: string | Date, timeZone: string = FIRM_TIME_ZONE): string {
  const date = readCalendarDate(value, timeZone)
  const rVal = date ? shortDateOf(date) : String(value)
  return rVal
}

/** Adds days to a date and returns the long form; falls back to the input (old `addDaysLong`). */
export function addDaysLong(value: string | Date, days: number, timeZone: string = FIRM_TIME_ZONE): string {
  const date = readCalendarDate(value, timeZone)
  const rVal = date ? longDateOf(addCalendarDays(date, days)) : String(value)
  return rVal
}
