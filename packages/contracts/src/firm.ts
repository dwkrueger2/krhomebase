// file: packages/contracts/src/firm.ts
/**
 * Firm Settings (Settings and Dashboard plan, stage 5): the firm's profile and its employee policies. Both are
 * settings rows of the `lookup` table, written only by the API.
 *
 *   GET /v1/firm/profile             the firm profile (every signed-in person may read it)
 *   PUT /v1/firm/profile             save it (super admin)
 *   GET /v1/firm/employee-policies   clock windows, PTO accrual, holiday pay and the holiday calendar (signed in)
 *   PUT /v1/firm/employee-policies   save them (super admin)
 *
 * Old routes: `GET`/`POST /krhomebase/api/kr-api-v1/firm-settings` and `/employee-policies`. The shapes, defaults,
 * limits and error sentences are the old `hb-components/firm/KRFirmSettings.ts` and `KREmployeePolicies.ts`; the
 * problem lists below are shared, so the screen and the API refuse the same things with the same words.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------------------------------------------
// Firm Profile

export const FIRM_SETTINGS_SCHEMA_VERSION = 'kr-firm-settings-v1'

/** The time zones the old Profile offered. */
export const FIRM_TIME_ZONES = [
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
] as const

const text = (max: number) => z.string().trim().max(max)

export const FirmLocation = z.object({
  id: z.string().trim().min(1).max(80).describe('Location id (`firm-location-<…>`).'),
  name: text(120).describe('Location name.'),
  addressLine1: text(200).describe('Address line 1.'),
  addressLine2: text(200).describe('Address line 2.'),
  city: text(100).describe('City.'),
  state: text(2).describe('State (two letters).'),
  postalCode: text(20).describe('Postal code.'),
  phone: text(40).describe('Phone.'),
  email: text(200).describe('Email.'),
  isPrimary: z.boolean().describe('The primary office (exactly one).'),
})
export type FirmLocation = z.infer<typeof FirmLocation>

export const FirmProfile = z.object({
  firmName: text(200).describe('Firm display name (also the firm entity\'s legal name).'),
  officeEmail: text(200).describe('Primary office email.'),
  officePhone: text(40).describe('Primary office phone.'),
  timeZone: text(60).describe('Time zone (IANA name).'),
  matterNumberFormat: text(120).describe('Matter numbering format, such as `[000]-LName,FName`.'),
  locations: z.array(FirmLocation).max(50).describe('Offices; exactly one is primary.'),
})
export type FirmProfile = z.infer<typeof FirmProfile>

/** The old built-in profile, shown until one is saved. */
export const DEFAULT_FIRM_PROFILE: FirmProfile = {
  firmName: 'Krueger & Richard',
  officeEmail: 'service@krueger-richard.com',
  officePhone: '972-688-6760',
  timeZone: 'America/Chicago',
  matterNumberFormat: '[000]-LName,FName',
  locations: [
    { id: 'firm-location-primary', name: 'Primary Office', addressLine1: '', addressLine2: '', city: '', state: 'TX', postalCode: '', phone: '972-688-6760', email: 'service@krueger-richard.com', isPrimary: true },
    { id: 'firm-location-secondary', name: 'Second Office', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', phone: '', email: '', isPrimary: false },
  ],
}

/** What stops a profile from being saved, in the old validator's words (empty when it may be saved). */
export function firmProfileProblems(profile: FirmProfile): string[] {
  const problems: string[] = []
  if (!profile.firmName.trim()) problems.push('Firm name is required.')
  if (!profile.officeEmail.trim()) problems.push('Primary office email is required.')
  if (!profile.officePhone.trim()) problems.push('Primary office phone is required.')
  if (!profile.timeZone.trim()) problems.push('Time zone is required.')
  if (!profile.matterNumberFormat.trim()) problems.push('Matter number format is required.')
  if (!profile.locations.length) problems.push('At least one firm location is required.')
  profile.locations.forEach((location, index) => {
    if (!location.name.trim()) problems.push(`Location ${index + 1} requires a name.`)
  })
  if (profile.locations.length && profile.locations.filter((location) => location.isPrimary).length !== 1) problems.push('Exactly one firm location must be marked primary.')
  return problems
}

export const FirmProfileData = z.object({
  profile: FirmProfile.describe('The profile (the built-in one until a profile is saved).'),
  saved: z.boolean().describe('False when nothing is saved yet and the built-in profile is shown.'),
  updatedAt: z.string().nullable().describe('When the profile was last saved.'),
  canEdit: z.boolean().describe('True for a super admin.'),
})
export type FirmProfileData = z.infer<typeof FirmProfileData>

// ---------------------------------------------------------------------------------------------------------------
// Employee Policies

export const EMPLOYEE_POLICIES_SCHEMA_VERSION = 'kr-employee-policies-v1'

export const HOLIDAY_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', 'last'] as const
export const HOLIDAY_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const YEARS_OF_SERVICE_BANDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Greater than 10'] as const

export const PtoPolicyRow = z.object({
  id: z.string().min(1).max(80).describe('Row id (`pto-years-<band>`).'),
  yearsOfService: z.string().min(1).max(40).describe('Years-of-service band.'),
  accrualMultiplier: z.number().min(0).max(1).describe('PTO hours accrued per regular hour worked (0 to 1).'),
  maxUnusedPtoHours: z.number().min(0).max(999).describe('Accrual stops above this many unused PTO hours (0 to 999).'),
})
export type PtoPolicyRow = z.infer<typeof PtoPolicyRow>

export const HolidayPayTier = z.object({
  id: z.string().min(1).max(80).describe('Tier id (`holiday-tier-<range>`).'),
  averageHoursRange: z.string().min(1).max(120).describe('Fixed average-hours range.'),
  holidayPayHours: z.number().min(0).max(12).describe('Holiday pay hours for the range (0 to 12).'),
})
export type HolidayPayTier = z.infer<typeof HolidayPayTier>

export const HolidayRule = z.object({
  id: z.string().min(1).max(80).describe('Holiday id (a preset id, or `holiday-<…>`).'),
  name: z.string().trim().min(1).max(120).describe('Holiday name.'),
  ruleType: z.enum(['specific-date', 'floating-weekday']).describe('A date every year, or a weekday of a month.'),
  month: z.number().int().min(1).max(12).describe('Month (1 to 12).'),
  dayOfMonth: z.number().int().min(1).max(31).optional().describe('For a specific date.'),
  ordinal: z.enum(HOLIDAY_ORDINALS).optional().describe('For a floating weekday.'),
  weekday: z.enum(HOLIDAY_WEEKDAYS).optional().describe('For a floating weekday.'),
})
export type HolidayRule = z.infer<typeof HolidayRule>

export const EmployeePolicies = z.object({
  employeeClockEditWindowDays: z.number().int().min(0).max(30).describe('Days an employee may adjust clock entries (0 to 30).'),
  managerClockEditWindowDays: z.number().int().min(0).max(30).describe('Days a manager may adjust clock entries (0 to 30).'),
  firmTimezone: z.string().min(1).max(60).describe('Time zone for work dates and pay periods (not edited on screen).'),
  payPeriodAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Pay-period start date (YYYY-MM-DD).'),
  employeeAutoClockInAfterBreak: z.boolean().describe('Automatic return after break.'),
  timeReportingIncrementMinutes: z.number().int().min(1).max(60).describe('Reporting increment in minutes (not edited on screen).'),
  ptoPolicies: z.array(PtoPolicyRow).max(20).describe('PTO accrual by years of service.'),
  holidayPayTiers: z.array(HolidayPayTier).max(10).describe('Holiday pay by average hours.'),
  holidays: z.array(HolidayRule).max(60).describe('The holiday calendar (at least one).'),
})
export type EmployeePolicies = z.infer<typeof EmployeePolicies>

export const HOLIDAY_PAY_TIER_DEFAULTS: HolidayPayTier[] = [
  { id: 'holiday-tier-0-33', averageHoursRange: '0-33 Average Hours in last 12 weeks', holidayPayHours: 6 },
  { id: 'holiday-tier-33-36', averageHoursRange: '33-36 Average Hours in last 12 weeks', holidayPayHours: 7 },
  { id: 'holiday-tier-36-40', averageHoursRange: '36-40 Average Hours in last 12 weeks', holidayPayHours: 8 },
]

/** The add-holiday dialog's presets (old `KR_EMPLOYEE_HOLIDAY_PRESETS`). */
export const HOLIDAY_PRESETS: HolidayRule[] = [
  { id: 'holiday-new-years-day', name: "New Year's Day", ruleType: 'specific-date', month: 1, dayOfMonth: 1 },
  { id: 'holiday-martin-luther-king-jr-day', name: 'Martin Luther King Jr. Day', ruleType: 'floating-weekday', month: 1, ordinal: '3rd', weekday: 'Monday' },
  { id: 'holiday-presidents-day', name: "Presidents' Day", ruleType: 'floating-weekday', month: 2, ordinal: '3rd', weekday: 'Monday' },
  { id: 'holiday-memorial-day', name: 'Memorial Day', ruleType: 'floating-weekday', month: 5, ordinal: 'last', weekday: 'Monday' },
  { id: 'holiday-juneteenth', name: 'Juneteenth', ruleType: 'specific-date', month: 6, dayOfMonth: 19 },
  { id: 'holiday-independence-day', name: 'Independence Day', ruleType: 'specific-date', month: 7, dayOfMonth: 4 },
  { id: 'holiday-labor-day', name: 'Labor Day', ruleType: 'floating-weekday', month: 9, ordinal: '1st', weekday: 'Monday' },
  { id: 'holiday-thanksgiving-day', name: 'Thanksgiving Day', ruleType: 'floating-weekday', month: 11, ordinal: '4th', weekday: 'Thursday' },
  { id: 'holiday-christmas-eve', name: 'Christmas Eve', ruleType: 'specific-date', month: 12, dayOfMonth: 24 },
  { id: 'holiday-christmas-day', name: 'Christmas Day', ruleType: 'specific-date', month: 12, dayOfMonth: 25 },
  { id: 'holiday-new-years-eve', name: "New Year's Eve", ruleType: 'specific-date', month: 12, dayOfMonth: 31 },
]

const DEFAULT_HOLIDAY_IDS = ['holiday-new-years-day', 'holiday-memorial-day', 'holiday-independence-day', 'holiday-labor-day', 'holiday-thanksgiving-day', 'holiday-christmas-eve', 'holiday-christmas-day', 'holiday-new-years-eve']

/** The id of a years-of-service row (`pto-years-0` … `pto-years-greater-than-10`). */
export const ptoRowId = (yearsOfService: string) => `pto-years-${yearsOfService.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

/** The old built-in policies (`KR_DEFAULT_EMPLOYEE_POLICIES`). */
export const DEFAULT_EMPLOYEE_POLICIES: EmployeePolicies = {
  employeeClockEditWindowDays: 1,
  managerClockEditWindowDays: 4,
  firmTimezone: 'America/Chicago',
  payPeriodAnchorDate: '2026-08-09',
  employeeAutoClockInAfterBreak: true,
  timeReportingIncrementMinutes: 6,
  ptoPolicies: YEARS_OF_SERVICE_BANDS.map((yearsOfService) => {
    const early = yearsOfService === '0' || yearsOfService === '1' || yearsOfService === '2'
    return { id: ptoRowId(yearsOfService), yearsOfService, accrualMultiplier: early ? 0.04 : 0.06, maxUnusedPtoHours: early ? 80 : 120 }
  }),
  holidayPayTiers: HOLIDAY_PAY_TIER_DEFAULTS.map((tier) => ({ ...tier })),
  holidays: HOLIDAY_PRESETS.filter((holiday) => DEFAULT_HOLIDAY_IDS.includes(holiday.id)).map((holiday) => ({ ...holiday })),
}

/** What stops the policies from being saved, in the old validator's words (empty when they may be saved). */
export function employeePoliciesProblems(policies: EmployeePolicies): string[] {
  const problems: string[] = []
  const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max
  if (!inRange(policies.employeeClockEditWindowDays, 0, 30)) problems.push('Employee clock edit window must be between 0 and 30 days.')
  if (!inRange(policies.managerClockEditWindowDays, 0, 30)) problems.push('Manager clock edit window must be between 0 and 30 days.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(policies.payPeriodAnchorDate)) problems.push('Pay-period start date must be a date.')
  for (const row of policies.ptoPolicies) {
    if (!inRange(row.accrualMultiplier, 0, 1)) problems.push(`PTO multiplier for ${row.yearsOfService} years must be between 0 and 1.`)
    if (!inRange(row.maxUnusedPtoHours, 0, 999)) problems.push(`Max PTO for ${row.yearsOfService} years must be between 0 and 999.`)
  }
  for (const tier of policies.holidayPayTiers) {
    if (!inRange(tier.holidayPayHours, 0, 12)) problems.push(`Holiday pay for ${tier.averageHoursRange} must be between 0 and 12 hours.`)
  }
  if (!policies.holidays.length) problems.push('At least one holiday is required.')
  policies.holidays.forEach((holiday, index) => {
    if (!holiday.name.trim()) problems.push(`Holiday ${index + 1} requires a name.`)
    if (holiday.ruleType === 'specific-date' && !inRange(holiday.dayOfMonth ?? 0, 1, 31)) problems.push(`Holiday ${index + 1} requires a day of month.`)
  })
  return problems
}

export const EmployeePoliciesData = z.object({
  policies: EmployeePolicies.describe('The policies (the built-in ones until they are saved).'),
  saved: z.boolean().describe('False when nothing is saved yet and the built-in policies are shown.'),
  updatedAt: z.string().nullable().describe('When the policies were last saved.'),
  canEdit: z.boolean().describe('True for a super admin.'),
})
export type EmployeePoliciesData = z.infer<typeof EmployeePoliciesData>
