// file: apps/web/features/billing/timeRounding.ts
/**
 * Time rounding for billing entries, from the old `hb-lib/timekeeping/timekeeping.ts` (only the part Billing uses).
 * Time is billed in tenths of an hour: six-minute steps.
 */

/** The billing step in minutes (old `DEFAULT_TIME_INCREMENT_MINUTES`). */
export const DEFAULT_TIME_INCREMENT_MINUTES = 6

/** Minutes → hours, rounded to the nearest step and shown to one decimal (old `roundMinutesToTenths`). */
export function roundMinutesToTenths(minutes: number, incrementMinutes = DEFAULT_TIME_INCREMENT_MINUTES): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  const increment = Math.max(1, incrementMinutes)
  return Number(((Math.round(minutes / increment) * increment) / 60).toFixed(1))
}
