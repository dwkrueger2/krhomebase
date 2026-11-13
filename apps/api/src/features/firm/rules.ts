// file: apps/api/src/features/firm/rules.ts
/**
 * Firm Settings rules (Settings plan, stage 5). Ported from the old `KRFirmSettings.ts` / `KREmployeePolicies.ts`
 * validators and the `kr-api-v1/firm-settings` and `/employee-policies` routes.
 *
 * Kept: the stored JSON shapes and schema markers (`kr-firm-settings-v1`, `kr-employee-policies-v1`) with the firm
 * entity id inside the profile JSON; the built-in defaults shown until something is saved; the limits and the error
 * sentences (shared with the screen through `@krhomebase/contracts`); the fixed PTO bands and holiday-pay tiers
 * (a save may change their numbers, not add or rename rows); an empty holiday name is saved as "Firm Holiday".
 *
 * Changed from the old routes:
 * - Everyone signed in may read both (the old routes allowed only admins, so other people silently saw the defaults);
 *   only a super admin may save either (the old profile save also allowed the retired `admin` role).
 * - Policies are read field by field, as Attendance reads them: a missing or invalid field takes its default and the
 *   others are kept (the old reader dropped the whole row when one field was missing, and the live row misses two).
 *   The profile is still all or nothing: a stored profile that fails the checks shows the built-in one.
 * - A floating holiday keeps only its ordinal and weekday, and a dated one only its day, so the JSON holds no stale
 *   fields.
 */

import {
  DEFAULT_EMPLOYEE_POLICIES,
  DEFAULT_FIRM_PROFILE,
  EMPLOYEE_POLICIES_SCHEMA_VERSION,
  FIRM_SETTINGS_SCHEMA_VERSION,
  FirmProfile,
  HOLIDAY_ORDINALS,
  HOLIDAY_WEEKDAYS,
  employeePoliciesProblems,
  firmProfileProblems,
  type EmployeePolicies,
  type HolidayRule,
} from '@krhomebase/contracts'
import { FIRM_ENTITY_ID } from './queries.ts'

/** A save the shared checks refuse; `problems` are the sentences to show. */
export class FirmSettingsError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '))
    this.name = 'FirmSettingsError'
  }
}

function parseObject(json: string | null): Record<string, unknown> | null {
  try {
    const parsed: unknown = json ? JSON.parse(json) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

function numberIn(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

/** The stored profile, or null when there is none or it fails the checks (the screen then shows the built-in one). */
export function readFirmProfile(json: string | null): FirmProfile | null {
  const value = parseObject(json)
  if (!value || value.schemaVersion !== FIRM_SETTINGS_SCHEMA_VERSION || !Array.isArray(value.locations)) return null
  const candidate = {
    firmName: str(value.firmName),
    officeEmail: str(value.officeEmail),
    officePhone: str(value.officePhone),
    timeZone: str(value.timeZone),
    matterNumberFormat: str(value.matterNumberFormat),
    locations: (value.locations as unknown[]).map((item, index) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        id: str(row.id) || `firm-location-${index + 1}`,
        name: str(row.name),
        addressLine1: str(row.addressLine1),
        addressLine2: str(row.addressLine2),
        city: str(row.city),
        state: str(row.state).toUpperCase().slice(0, 2),
        postalCode: str(row.postalCode),
        phone: str(row.phone),
        email: str(row.email),
        isPrimary: row.isPrimary === true,
      }
    }),
  }
  const parsed = FirmProfile.safeParse(candidate)
  return parsed.success && !firmProfileProblems(parsed.data).length ? parsed.data : null
}

/** The profile to save, checked; throws `FirmSettingsError` with the old sentences. */
export function profileToSave(body: FirmProfile): { profile: FirmProfile; json: string } {
  const profile: FirmProfile = { ...body, locations: body.locations.map((location) => ({ ...location, state: location.state.toUpperCase().slice(0, 2) })) }
  const problems = firmProfileProblems(profile)
  if (problems.length) throw new FirmSettingsError(problems)
  return { profile, json: JSON.stringify({ schemaVersion: FIRM_SETTINGS_SCHEMA_VERSION, firmEntityId: FIRM_ENTITY_ID, ...profile }) }
}

/** One holiday as stored: unknown ordinals and weekdays become 1st and Monday (old rule); a bad row is dropped. */
function readHoliday(item: unknown): HolidayRule | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const month = numberIn(row.month, 1, 12)
  if (month === null) return null
  const base = { id: str(row.id) || `holiday-${month}-${str(row.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: str(row.name) || 'Firm Holiday', month: Math.floor(month) }
  if (row.ruleType === 'floating-weekday') {
    const ordinal = (HOLIDAY_ORDINALS as readonly string[]).includes(str(row.ordinal)) ? (str(row.ordinal) as HolidayRule['ordinal']) : '1st'
    const weekday = (HOLIDAY_WEEKDAYS as readonly string[]).includes(str(row.weekday)) ? (str(row.weekday) as HolidayRule['weekday']) : 'Monday'
    return { ...base, ruleType: 'floating-weekday', ordinal, weekday }
  }
  const day = numberIn(row.dayOfMonth, 1, 31)
  return day === null ? null : { ...base, ruleType: 'specific-date', dayOfMonth: Math.floor(day) }
}

/** A holiday reduced to the fields its rule uses. */
function cleanHoliday(holiday: HolidayRule): HolidayRule {
  const base = { id: holiday.id, name: holiday.name.trim() || 'Firm Holiday', month: holiday.month }
  return holiday.ruleType === 'floating-weekday'
    ? { ...base, ruleType: 'floating-weekday', ordinal: holiday.ordinal ?? '1st', weekday: holiday.weekday ?? 'Monday' }
    : { ...base, ruleType: 'specific-date', dayOfMonth: holiday.dayOfMonth ?? 1 }
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return Boolean(value)
  } catch {
    return false
  }
}

/** The stored policies read field by field; anything missing or invalid takes its default. */
export function readEmployeePolicies(json: string | null): EmployeePolicies {
  const value = parseObject(json) ?? {}
  const d = DEFAULT_EMPLOYEE_POLICIES
  const window = (raw: unknown, fallback: number) => {
    const number = numberIn(raw, 0, 30)
    return number === null ? fallback : Math.floor(number)
  }
  const pto = Array.isArray(value.ptoPolicies) ? (value.ptoPolicies as Array<Record<string, unknown>>) : []
  const tiers = Array.isArray(value.holidayPayTiers) ? (value.holidayPayTiers as Array<Record<string, unknown>>) : []
  const holidays = Array.isArray(value.holidays) ? (value.holidays as unknown[]).map(readHoliday).filter((row): row is HolidayRule => row !== null) : []
  const increment = numberIn(value.timeReportingIncrementMinutes, 1, 60)
  const anchor = str(value.payPeriodAnchorDate)
  return {
    employeeClockEditWindowDays: window(value.employeeClockEditWindowDays, d.employeeClockEditWindowDays),
    managerClockEditWindowDays: window(value.managerClockEditWindowDays, d.managerClockEditWindowDays),
    firmTimezone: isTimezone(str(value.firmTimezone)) ? str(value.firmTimezone) : d.firmTimezone,
    payPeriodAnchorDate: /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : d.payPeriodAnchorDate,
    employeeAutoClockInAfterBreak: typeof value.employeeAutoClockInAfterBreak === 'boolean' ? value.employeeAutoClockInAfterBreak : d.employeeAutoClockInAfterBreak,
    timeReportingIncrementMinutes: increment === null ? d.timeReportingIncrementMinutes : Math.floor(increment),
    ptoPolicies: d.ptoPolicies.map((band) => {
      const stored = pto.find((row) => row && str(row.yearsOfService) === band.yearsOfService)
      return {
        ...band,
        accrualMultiplier: numberIn(stored?.accrualMultiplier, 0, 1) ?? band.accrualMultiplier,
        maxUnusedPtoHours: numberIn(stored?.maxUnusedPtoHours, 0, 999) ?? band.maxUnusedPtoHours,
      }
    }),
    holidayPayTiers: d.holidayPayTiers.map((tier) => {
      const stored = tiers.find((row) => row && str(row.id) === tier.id)
      return { ...tier, holidayPayHours: numberIn(stored?.holidayPayHours, 0, 12) ?? tier.holidayPayHours }
    }),
    holidays: holidays.length ? holidays : d.holidays.map((holiday) => ({ ...holiday })),
  }
}

/**
 * The policies to save: the fixed PTO bands and tiers take the numbers sent for them (rows are matched by band and by
 * id, so none can be added or renamed), holidays are cleaned, then the shared checks run.
 */
export function policiesToSave(body: EmployeePolicies): { policies: EmployeePolicies; json: string } {
  const d = DEFAULT_EMPLOYEE_POLICIES
  const policies: EmployeePolicies = {
    ...body,
    firmTimezone: isTimezone(body.firmTimezone) ? body.firmTimezone : d.firmTimezone,
    ptoPolicies: d.ptoPolicies.map((band) => {
      const sent = body.ptoPolicies.find((row) => row.yearsOfService === band.yearsOfService)
      return sent ? { ...band, accrualMultiplier: sent.accrualMultiplier, maxUnusedPtoHours: sent.maxUnusedPtoHours } : band
    }),
    holidayPayTiers: d.holidayPayTiers.map((tier) => {
      const sent = body.holidayPayTiers.find((row) => row.id === tier.id)
      return sent ? { ...tier, holidayPayHours: sent.holidayPayHours } : tier
    }),
    holidays: body.holidays.map(cleanHoliday),
  }
  const problems = employeePoliciesProblems(policies)
  if (problems.length) throw new FirmSettingsError(problems)
  return { policies, json: JSON.stringify({ schemaVersion: EMPLOYEE_POLICIES_SCHEMA_VERSION, ...policies }) }
}

/** The built-in profile, for a firm with nothing saved. */
export const builtInProfile = (): FirmProfile => structuredClone(DEFAULT_FIRM_PROFILE)
