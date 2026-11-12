// file: apps/web/features/timekeeping/timeInput.ts
/**
 * Reads the times typed into the Attendance time-card cells (stage 4) and turns a firm-local time on a day into an
 * exact time (ISO, UTC) for the API.
 *
 * Ported from the old panel's `normalizeTimeValue`, `parseTimeMinutes` and `localTimeToIso`
 * (`docs/API/Timekeeping_AsIs_Reference.md`, section 10.2). The rules are unchanged:
 *  - Spaces are removed and case is ignored. The text must end in `a`, `am`, `p` or `pm`: a time without one is
 *    refused (`8:00` is not a time), so a morning and an evening are never confused.
 *  - The number part is `H:MM` or `HH:MM`, or 1 to 4 digits: 1 or 2 digits are the hour; 3 or 4 digits are the hour
 *    followed by two digits of minutes (`830p` is 8:30 PM, `1230am` is 12:30 AM).
 *  - Hour 1 to 12, minute 0 to 59. The tidy form is `H:MM AM` or `H:MM PM`.
 * The API rounds the result to the reporting increment; the browser does not round.
 */

/** A typed time read as a time of day. */
export interface TypedTime {
  /** 0 to 23. */
  hour: number
  minute: number
  /** The tidy form, `H:MM AM`. */
  text: string
}

/**
 * Reads one typed time.
 *
 * @param value - The cell text.
 * @returns The time, `null` for an empty cell, or `'invalid'` when the text is not a time.
 */
export function parseTypedTime(value: string): TypedTime | null | 'invalid' {
  const compact = value.replace(/\s+/g, '').toLowerCase()
  if (!compact) return null
  const match = /^(\d{1,2}:\d{2}|\d{1,4})(a|am|p|pm)$/.exec(compact)
  if (!match) return 'invalid'
  const [, digits = '', meridiem = ''] = match
  let hour12: number
  let minute: number
  if (digits.includes(':')) {
    const [h = '', m = ''] = digits.split(':')
    hour12 = Number(h)
    minute = Number(m)
  } else if (digits.length <= 2) {
    hour12 = Number(digits)
    minute = 0
  } else {
    hour12 = Number(digits.slice(0, -2))
    minute = Number(digits.slice(-2))
  }
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return 'invalid'
  const pm = meridiem.startsWith('p')
  const hour = (hour12 % 12) + (pm ? 12 : 0)
  return { hour, minute, text: `${hour12}:${String(minute).padStart(2, '0')} ${pm ? 'PM' : 'AM'}` }
}

/** The zone's offset from UTC, in minutes, at one instant (positive east of UTC). */
function zoneOffsetMinutes(instantMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs))
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'))
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60_000)
}

/**
 * The exact time of a firm-local wall-clock time on a date (old `localDateTimeToIso`).
 *
 * @param date - `YYYY-MM-DD`, firm-local.
 * @param hour - 0 to 23.
 * @param minute - 0 to 59.
 * @param timezone - The firm's IANA time zone.
 * @returns An ISO time in UTC.
 */
export function localTimeToIso(date: string, hour: number, minute: number, timezone: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const wallClock = Date.UTC(year, month - 1, day, hour, minute)
  // Two passes settle the offset on days the clocks change.
  let instant = wallClock - zoneOffsetMinutes(wallClock, timezone) * 60_000
  instant = wallClock - zoneOffsetMinutes(instant, timezone) * 60_000
  return new Date(instant).toISOString()
}

/**
 * Reads a typed hours value for the PTO and holiday cells: a number of 0 or more, at most 24.
 *
 * @returns The hours, `null` for an empty cell, or `'invalid'`.
 */
export function parseTypedHours(value: string): number | null | 'invalid' {
  const text = value.trim()
  if (!text) return null
  const hours = Number(text)
  return Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours : 'invalid'
}
