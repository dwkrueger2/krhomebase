// file: apps/web/features/firm/firm.test.tsx
/**
 * Firm Settings (Settings plan, stage 5): the location rules (a removed primary passes to the first remaining
 * office), the holiday helpers (rule summaries, the dates of floating holidays in a year, the dialog draft), the
 * clock-window and clamp rules, and first draws of both cards rendered to text, editable and read-only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/firm/firm.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EMPLOYEE_POLICIES, DEFAULT_FIRM_PROFILE, HOLIDAY_PRESETS } from '@krhomebase/contracts'
import EmployeePoliciesCard, { clampNumber, clockWindowFromText } from '@/features/firm/components/EmployeePoliciesCard.client'
import FirmProfileCard, { newFirmLocation, removeFirmLocation } from '@/features/firm/components/FirmProfileCard.client'
import { daysForMonth, defaultHolidayDraft, holidayFromDraft, holidayObservation, holidayRuleSummary, sortHolidays } from '@/features/firm/holidays'

const preset = (id: string) => HOLIDAY_PRESETS.find((row) => row.id === id)!

describe('firm locations', () => {
  it('adds "New Location" and passes primary on when the primary office is removed', () => {
    expect(newFirmLocation()).toMatchObject({ name: 'New Location', isPrimary: false })
    const rest = removeFirmLocation(DEFAULT_FIRM_PROFILE.locations, 'firm-location-primary')
    expect(rest.map((row) => [row.id, row.isPrimary])).toEqual([['firm-location-secondary', true]])
  })
})

describe('holiday helpers', () => {
  it('summarizes rules and finds the dates in a year', () => {
    expect(holidayRuleSummary(preset('holiday-independence-day'))).toBe('07/04')
    expect(holidayRuleSummary(preset('holiday-memorial-day'))).toBe('last Monday in 05-May')
    expect(holidayObservation(preset('holiday-memorial-day'), 2026)).toBe('05-May-25')
    expect(holidayObservation(preset('holiday-labor-day'), 2026)).toBe('09-Sep-07')
    expect(holidayObservation(preset('holiday-thanksgiving-day'), 2026)).toBe('11-Nov-26')
    expect(daysForMonth(2)).toHaveLength(29)
  })

  it('lists holidays in the order they fall in the year (Nov 12, 2026, D3)', () => {
    const added = [preset('holiday-christmas-day'), preset('holiday-new-years-day'), preset('holiday-thanksgiving-day'), preset('holiday-memorial-day')]
    expect(sortHolidays(added, 2026).map((row) => row.name)).toEqual(["New Year's Day", 'Memorial Day', 'Thanksgiving Day', 'Christmas Day'])
  })

  it('makes holidays from the dialog draft', () => {
    expect(holidayFromDraft({ ...defaultHolidayDraft(), name: ' ', month: '3', dayOfMonth: '17' })).toMatchObject({ name: 'Firm Holiday', ruleType: 'specific-date', month: 3, dayOfMonth: 17 })
    expect(holidayFromDraft({ ...defaultHolidayDraft(), presetId: 'holiday-labor-day', ruleType: 'floating-weekday', ordinal: '1st', weekday: 'Monday', month: '9' })).toMatchObject({ id: 'holiday-labor-day', ordinal: '1st' })
  })
})

describe('policy inputs', () => {
  it('keeps clock windows to digits 0 to 30 and clamps numbers', () => {
    expect(clockWindowFromText('4 days')).toBe(4)
    expect(clockWindowFromText('45')).toBe(30)
    expect(clockWindowFromText('')).toBe(0)
    expect(clampNumber(1.5, 0, 1)).toBe(1)
    expect(clampNumber(Number.NaN, 0, 12)).toBe(0)
  })
})

describe('Firm Settings cards', () => {
  it('draws the profile with its locations, and read-only for someone who cannot edit', () => {
    const editable = renderToStaticMarkup(<FirmProfileCard initial={{ profile: DEFAULT_FIRM_PROFILE, canEdit: true }} />)
    expect(editable).toContain('data-kr-id="firm-profile-KRModuleCard"')
    expect(editable).toContain('Add location')
    expect(editable).toContain('value="Primary Office"')
    const readOnly = renderToStaticMarkup(<FirmProfileCard initial={{ profile: DEFAULT_FIRM_PROFILE, canEdit: false }} />)
    expect(readOnly).toContain('Only Super Admin can change the firm profile.')
    expect(readOnly).not.toContain('Add location')
    // Copyable for everyone (D8): read-only fields, not disabled ones.
    expect(readOnly).toMatch(/id="firm-office-email" readOnly=""|readOnly="" [^>]*id="firm-office-email"/)
    expect(readOnly).not.toMatch(/disabled=""[^>]*id="firm-office-email"/)
  })

  it('draws the policies with PTO, holiday pay and the holiday calendar', () => {
    const html = renderToStaticMarkup(<EmployeePoliciesCard initial={{ policies: DEFAULT_EMPLOYEE_POLICIES, canEdit: true }} />)
    expect(html).toContain('PTO Accrual')
    expect(html).toContain('Greater than 10')
    expect(html).toContain('36-40 Average Hours in last 12 weeks')
    expect(html).toContain('Thanksgiving Day')
    expect(html).toContain('Add Holiday')
  })
})
