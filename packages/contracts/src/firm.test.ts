// file: packages/contracts/src/firm.test.ts
/**
 * Firm Settings (stage 5): the shared problem lists that the screen and the API both use, in the old validators'
 * words: required profile fields, named locations and exactly one primary office; the policy limits and at least one
 * holiday. The built-in profile and policies must pass.
 *
 * Run: pnpm --dir packages/contracts exec vitest run src/firm.test.ts
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_EMPLOYEE_POLICIES, DEFAULT_FIRM_PROFILE, EmployeePolicies, employeePoliciesProblems, FirmProfile, firmProfileProblems } from './firm.ts'

describe('firm profile problems', () => {
  it('passes the built-in profile and names each missing piece', () => {
    expect(FirmProfile.parse(DEFAULT_FIRM_PROFILE)).toEqual(DEFAULT_FIRM_PROFILE)
    expect(firmProfileProblems(DEFAULT_FIRM_PROFILE)).toEqual([])
    const bad = { ...DEFAULT_FIRM_PROFILE, firmName: ' ', locations: DEFAULT_FIRM_PROFILE.locations.map((row) => ({ ...row, name: '', isPrimary: true })) }
    expect(firmProfileProblems(bad)).toEqual(['Firm name is required.', 'Location 1 requires a name.', 'Location 2 requires a name.', 'Exactly one firm location must be marked primary.'])
    expect(firmProfileProblems({ ...DEFAULT_FIRM_PROFILE, locations: [] })).toEqual(['At least one firm location is required.'])
  })
})

describe('employee policy problems', () => {
  it('passes the built-in policies and refuses values out of range', () => {
    expect(EmployeePolicies.parse(DEFAULT_EMPLOYEE_POLICIES)).toEqual(DEFAULT_EMPLOYEE_POLICIES)
    expect(employeePoliciesProblems(DEFAULT_EMPLOYEE_POLICIES)).toEqual([])
    expect(DEFAULT_EMPLOYEE_POLICIES.ptoPolicies.map((row) => row.id).at(-1)).toBe('pto-years-greater-than-10')
    const bad = { ...DEFAULT_EMPLOYEE_POLICIES, managerClockEditWindowDays: 31, holidays: [] }
    expect(employeePoliciesProblems(bad)).toEqual(['Manager clock edit window must be between 0 and 30 days.', 'At least one holiday is required.'])
  })
})
