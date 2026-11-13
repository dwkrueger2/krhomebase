// file: apps/api/src/features/firm/firm.test.ts
/**
 * Firm Settings (Settings plan, stage 5) against an in-memory Schema 8.0. Checks: the built-in profile and policies
 * before anything is saved; anyone signed in may read, only a super admin may save; a profile save writes the lookup
 * row and the firm entity's name with an audit row; the shared checks refuse with their sentences; policies are read
 * field by field (a stored row missing fields keeps the rest), the fixed PTO bands cannot be added to, and holidays
 * keep only the fields of their rule.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/firm/firm.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_EMPLOYEE_POLICIES, DEFAULT_FIRM_PROFILE, EmployeePoliciesData, ErrorEnvelope, FirmProfileData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { readEmployeePolicies } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const one = <T,>(sql: string) => env.sqlite.prepare(sql).get() as T

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  // The audit rows name the signed-in person, so the test user must exist.
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'tester@example.com', 'x', 'super_admin')`).run()
})

async function call(method: 'GET' | 'PUT', path: string, body?: unknown, role = 'super_admin') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }))
}

const dataOf = async (res: Response) => ((await res.json()) as { data: unknown }).data

describe('Firm Profile', () => {
  it('shows the built-in profile until one is saved, to anyone signed in', async () => {
    const res = await call('GET', '/v1/firm/profile', undefined, 'staff')
    expect(res.status).toBe(200)
    expect(FirmProfileData.parse(await dataOf(res))).toMatchObject({ profile: DEFAULT_FIRM_PROFILE, saved: false, canEdit: false })
  })

  it('saves the profile and the firm entity name, and refuses with the old sentences', async () => {
    const profile = { ...DEFAULT_FIRM_PROFILE, firmName: 'Krueger & Richard, PLLC', locations: DEFAULT_FIRM_PROFILE.locations.map((row) => ({ ...row, state: 'tx' })) }
    const res = await call('PUT', '/v1/firm/profile', profile)
    expect(res.status).toBe(200)
    expect(one<{ legal_name: string }>(`SELECT legal_name FROM entity WHERE id = 'ent_krueger_richard_firm'`).legal_name).toBe('Krueger & Richard, PLLC')
    const stored = JSON.parse(one<{ description: string }>(`SELECT description FROM lookup WHERE id = 'lk_kr_firm_locations_profile'`).description)
    expect(stored).toMatchObject({ schemaVersion: 'kr-firm-settings-v1', firmEntityId: 'ent_krueger_richard_firm', locations: [{ state: 'TX' }, { state: 'TX' }] })
    const read = FirmProfileData.parse(await dataOf(await call('GET', '/v1/firm/profile')))
    expect(read).toMatchObject({ saved: true, canEdit: true, profile: { firmName: 'Krueger & Richard, PLLC' } })
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'firm_details'`).n).toBe(1)

    const refused = await call('PUT', '/v1/firm/profile', { ...profile, officePhone: '', locations: profile.locations.map((row) => ({ ...row, isPrimary: false })) })
    expect(refused.status).toBe(422)
    const error = ErrorEnvelope.parse(await refused.json()).error
    expect(error.code).toBe('FIRM_SETTINGS_INVALID')
    expect(error.details).toEqual({ problems: ['Primary office phone is required.', 'Exactly one firm location must be marked primary.'] })
    expect((await call('PUT', '/v1/firm/profile', profile, 'attorney')).status).toBe(403)
  })
})

describe('Employee Policies', () => {
  it('reads a stored row field by field', () => {
    const policies = readEmployeePolicies(JSON.stringify({ employeeClockEditWindowDays: 4, ptoPolicies: [{ yearsOfService: '5', accrualMultiplier: 0.08, maxUnusedPtoHours: 160 }], holidays: [{ id: 'x', name: 'Floater', ruleType: 'floating-weekday', month: 3, ordinal: '9th', weekday: 'Funday', dayOfMonth: 4 }] }))
    expect(policies.employeeClockEditWindowDays).toBe(4)
    expect(policies.managerClockEditWindowDays).toBe(DEFAULT_EMPLOYEE_POLICIES.managerClockEditWindowDays)
    expect(policies.ptoPolicies.find((row) => row.yearsOfService === '5')).toMatchObject({ accrualMultiplier: 0.08, maxUnusedPtoHours: 160 })
    expect(policies.holidays).toEqual([{ id: 'x', name: 'Floater', ruleType: 'floating-weekday', month: 3, ordinal: '1st', weekday: 'Monday' }])
    expect(readEmployeePolicies('not json').holidays).toEqual(DEFAULT_EMPLOYEE_POLICIES.holidays)
  })

  it('saves the policies with the fixed bands and clean holidays; only a super admin may save', async () => {
    const body = {
      ...DEFAULT_EMPLOYEE_POLICIES,
      employeeClockEditWindowDays: 3,
      ptoPolicies: [...DEFAULT_EMPLOYEE_POLICIES.ptoPolicies.map((row) => (row.yearsOfService === '0' ? { ...row, accrualMultiplier: 0.05 } : row)), { id: 'extra', yearsOfService: '99', accrualMultiplier: 1, maxUnusedPtoHours: 1 }],
      holidays: [{ id: 'h1', name: 'Founders Day', ruleType: 'specific-date', month: 2, dayOfMonth: 14, ordinal: '2nd', weekday: 'Friday' }],
    }
    expect((await call('PUT', '/v1/firm/employee-policies', body, 'staff')).status).toBe(403)
    const res = await call('PUT', '/v1/firm/employee-policies', body)
    expect(res.status).toBe(200)
    const saved = EmployeePoliciesData.parse(await dataOf(res)).policies
    expect(saved.ptoPolicies).toHaveLength(DEFAULT_EMPLOYEE_POLICIES.ptoPolicies.length)
    expect(saved.ptoPolicies[0]!.accrualMultiplier).toBe(0.05)
    expect(saved.holidays).toEqual([{ id: 'h1', name: 'Founders Day', ruleType: 'specific-date', month: 2, dayOfMonth: 14 }])
    const read = EmployeePoliciesData.parse(await dataOf(await call('GET', '/v1/firm/employee-policies', undefined, 'staff')))
    expect(read).toMatchObject({ saved: true, canEdit: false, policies: { employeeClockEditWindowDays: 3 } })
    expect(JSON.parse(one<{ description: string }>(`SELECT description FROM lookup WHERE id = 'lk_kr_employee_policies'`).description).schemaVersion).toBe('kr-employee-policies-v1')

    const refused = await call('PUT', '/v1/firm/employee-policies', { ...body, holidays: [] })
    expect(ErrorEnvelope.parse(await refused.json()).error.details).toEqual({ problems: ['At least one holiday is required.'] })
  })
})
