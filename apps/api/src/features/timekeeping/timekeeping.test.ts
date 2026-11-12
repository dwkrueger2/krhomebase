// file: apps/api/src/features/timekeeping/timekeeping.test.ts
/**
 * Attendance reads (plan stage 1) against an in-memory copy of the real Schema 8.0. Made-up people and times only.
 * Role sets mirror the live Attendance grants: staff hold create, read, update and approve on their own records;
 * a manager also holds read, update and approve on the team scope; the built-in super admin holds everything.
 *
 * Checks: own card with punches, pairs, totals and the field-by-field policy; who may see another employee's card
 * (team lead, all scope, super admin, refused); missing employee; bad dates; a period with no card; that reads write
 * nothing; and the clock state (open shift, minutes today, an old clock-in needing repair).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/timekeeping/timekeeping.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ClockStateData, ErrorEnvelope, TimeCardData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { addDays, localDateForInstant } from './timeMath.ts'

const app = createApp()
const TZ = 'America/Chicago'
// Pay period Nov 1 to Nov 14, 2026 (the default anchor, Aug 9, 2026).
const PERIOD = 'pp_2026-11-01'

let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const count = (table: string) => (env.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

function seed() {
  run(`INSERT INTO individual (id, first_name, last_name) VALUES ('ind-sam', 'Sam', 'Staffer'), ('ind-lee', 'Lee', 'Lead')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES
        ('u-sam', 'ind-sam', 'sam@example.com', 'x', 'staff'),
        ('u-lee', 'ind-lee', 'lee@example.com', 'x', 'staff'),
        ('u-pat', NULL, 'pat@example.com', 'x', 'staff'),
        ('u-boss', NULL, 'boss@example.com', 'x', 'super_admin'),
        ('u-none', NULL, 'none@example.com', 'x', 'staff')`)
  run(`INSERT INTO employee (id, user_id, employee_number, employment_status) VALUES
        ('emp-sam', 'u-sam', 'E1', 'active'), ('emp-lee', 'u-lee', 'E2', 'active'), ('emp-pat', 'u-pat', 'E3', 'on_leave')`)
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES
        ('rs-staff', 'test_staff', 'Staff', 0), ('rs-mgr', 'test_manager', 'Manager', 0),
        ('rs-reader', 'test_reader', 'Reader', 0), ('rs-none', 'test_none', 'None', 0), ('rs-super', 'super_admin', 'Super Admin', 1)`)
  run(`INSERT INTO role_set_permission_scope (id, role_set_id, permission_key, scope, can_create, can_read, can_update, can_approve) VALUES
        ('s1', 'rs-staff', 'attendance', 'own', 1, 1, 1, 1),
        ('s2', 'rs-mgr', 'attendance', 'own', 1, 1, 1, 1),
        ('s3', 'rs-mgr', 'attendance', 'team', 0, 1, 1, 1),
        ('s4', 'rs-reader', 'attendance', 'all', 0, 1, 0, 0)`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES
        ('a1', 'u-sam', 'rs-staff'), ('a2', 'u-lee', 'rs-mgr'), ('a3', 'u-pat', 'rs-staff'), ('a4', 'u-boss', 'rs-super'), ('a5', 'u-none', 'rs-none')`)
  // The live policy row leaves out the manager window and the increment: those take their defaults (4 and 6).
  run(`INSERT INTO lookup (id, category, value, label, description) VALUES ('lk_kr_employee_policies', 'kr_employee_policies', 'employee_policies', 'Employee Policies', ?1)`,
    JSON.stringify({ schemaVersion: 'kr-employee-policies-v1', employeeClockEditWindowDays: 4, ptoPolicies: [] }))
  run(`INSERT INTO pay_period (id, period_start, period_end, status) VALUES (?1, '2026-11-01', '2026-11-14', 'open')`, PERIOD)
  run(`INSERT INTO employee_time_card (id, employee_id, pay_period_id, status) VALUES ('tc-sam', 'emp-sam', ?1, 'open')`, PERIOD)
  const punch = (id: string, type: string, at: string, source = 'button', voided: string | null = null) =>
    run(`INSERT INTO employee_time_punch (id, employee_id, time_card_id, punch_type, occurred_at, local_date, source, voided_at, created_by_user_id)
         VALUES (?1, 'emp-sam', 'tc-sam', ?2, ?3, ?4, ?5, ?6, 'u-sam')`, id, type, at, localDateForInstant(at, TZ), source, voided)
  // Mon Nov 2: 8:00 AM to 4:30 PM (8.5 h). Tue Nov 3: a clock-out with no clock-in. Wed Nov 4: one voided punch.
  punch('p1', 'clock_in', '2026-11-02T14:00:00.000Z')
  punch('p2', 'clock_out', '2026-11-02T22:30:00.000Z')
  punch('p3', 'clock_out', '2026-11-03T22:00:00.000Z', 'employee_correction')
  punch('p4', 'clock_in', '2026-11-04T14:00:00.000Z', 'button', '2026-11-04T15:00:00.000Z')
  const event = (id: string, type: string, hours: number, date = '2026-11-05') =>
    run(`INSERT INTO employee_time_event (id, employee_id, time_card_id, pay_period_id, work_date, hours, time_type, status, created_by_user_id)
         VALUES (?1, 'emp-sam', 'tc-sam', ?2, ?3, ?4, ?5, 'draft', 'u-sam')`, id, PERIOD, date, hours, type)
  event('e1', 'pto', 4)
  event('e2', 'regular', 0, '2026-11-02') // a zeroed regular row: must not wipe the pairs
  event('e3', 'overtime', 9) // stored overtime: never counted
}

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed()
  clearSessionCache()
  clearPermissionCache()
})

async function get(path: string, userId = 'u-sam', role = 'staff') {
  clearSessionCache()
  return app.request(path, { headers: SIGNED_IN_HEADERS }, signedInEnv(role, { krhomebase: env.db }, userId))
}
const data = async <T,>(res: Response) => ((await res.json()) as { data: T }).data
const code = async (res: Response) => ErrorEnvelope.parse(await res.json()).error.code
const card = async (path: string, userId?: string, role?: string) => {
  const res = await get(path, userId, role)
  expect(res.status).toBe(200)
  return TimeCardData.parse(await data(res))
}

describe('GET /v1/timekeeping/time-card', () => {
  it("shows the person's own card: punches, pairs, totals and the policy read field by field", async () => {
    const result = await card('/v1/timekeeping/time-card?date=2026-11-05')
    expect(result.period).toMatchObject({ id: PERIOD, start: '2026-11-01', end: '2026-11-14', status: 'open' })
    expect(result.employee).toMatchObject({ id: 'emp-sam', name: 'Sam Staffer', employeeNumber: 'E1' })
    expect(result.card).toMatchObject({ id: 'tc-sam', status: 'open', isLocked: false })
    expect(result.punches.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(result.punches.find((p) => p.id === 'p4')?.voidedAt).toBeTruthy()
    expect(result.exceptions).toEqual(['clock_out_without_clock_in'])
    expect(result.events.map((e) => e.timeType)).toEqual(['pto'])
    expect(result.totals).toEqual({ regularHours: 8.5, overtimeHours: 0, ptoHours: 4, holidayHours: 0, sickHours: 0, unpaidHours: 0, otherHours: 0 })
    expect(result.policy).toEqual({ timezone: TZ, incrementMinutes: 6, employeeEditWindowDays: 4, managerEditWindowDays: 4 })
    expect(result.viewer).toMatchObject({ scope: 'own', canUpdate: true, canApprove: true, isSuperAdmin: false, editWindowDays: 4 })
  })

  it('answers a period with no card yet with an empty card and a computed period', async () => {
    const result = await card('/v1/timekeeping/time-card?date=2026-12-01')
    expect(result.period).toMatchObject({ id: 'pp_2026-11-29', status: null })
    expect(result.card).toBeNull()
    expect(result.punches).toEqual([])
    expect(result.totals.regularHours).toBe(0)
  })

  it('writes nothing', async () => {
    const before = ['pay_period', 'employee_time_card', 'employee_time_punch', 'employee_time_event', 'audit_log'].map(count)
    await card('/v1/timekeeping/time-card?date=2026-12-01')
    await card('/v1/timekeeping/time-card?date=2026-11-05')
    expect(['pay_period', 'employee_time_card', 'employee_time_punch', 'employee_time_event', 'audit_log'].map(count)).toEqual(before)
  })

  it('refuses a person without Attendance access, and one who is not an employee', async () => {
    let res = await get('/v1/timekeeping/time-card', 'u-none')
    expect([res.status, await code(res)]).toEqual([403, 'ATTENDANCE_PERMISSION_REQUIRED'])
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a6', 'u-none', 'rs-staff')`)
    clearPermissionCache()
    res = await get('/v1/timekeeping/time-card', 'u-none')
    expect([res.status, await code(res)]).toEqual([403, 'EMPLOYEE_ENROLLMENT_REQUIRED'])
  })

  it("refuses another employee's card without the team or all scope", async () => {
    const res = await get('/v1/timekeeping/time-card?employeeId=emp-lee')
    expect([res.status, await code(res)]).toEqual([403, 'ATTENDANCE_SCOPE_NOT_AUTHORIZED'])
  })

  it('lets a manager see a team member only while leading that team, with an active membership', async () => {
    let res = await get('/v1/timekeeping/time-card?employeeId=emp-sam&date=2026-11-05', 'u-lee', 'manager')
    expect(await code(res)).toBe('ATTENDANCE_SCOPE_NOT_AUTHORIZED')
    run(`INSERT INTO team (id, name) VALUES ('team-1', 'Front office')`)
    run(`INSERT INTO team_lead (id, team_id, user_id) VALUES ('tl-1', 'team-1', 'u-lee')`)
    run(`INSERT INTO team_member (id, team_id, employee_id, is_active) VALUES ('tm-1', 'team-1', 'emp-sam', 0)`)
    res = await get('/v1/timekeeping/time-card?employeeId=emp-sam&date=2026-11-05', 'u-lee', 'manager')
    expect(await code(res)).toBe('ATTENDANCE_SCOPE_NOT_AUTHORIZED')
    run(`UPDATE team_member SET is_active = 1 WHERE id = 'tm-1'`)
    const result = await card('/v1/timekeeping/time-card?employeeId=emp-sam&date=2026-11-05', 'u-lee', 'manager')
    expect(result.viewer).toMatchObject({ scope: 'team', canUpdate: true, canApprove: true, editWindowDays: 4 })
    run(`UPDATE team_lead SET ends_at = '2026-01-01T00:00:00Z' WHERE id = 'tl-1'`)
    res = await get('/v1/timekeeping/time-card?employeeId=emp-sam&date=2026-11-05', 'u-lee', 'manager')
    expect(await code(res)).toBe('ATTENDANCE_SCOPE_NOT_AUTHORIZED')
  })

  it('lets an all-scope reader see any card without changing it, and a super admin do everything', async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a7', 'u-none', 'rs-reader')`)
    clearPermissionCache()
    const reader = await card('/v1/timekeeping/time-card?employeeId=emp-sam&date=2026-11-05', 'u-none')
    expect(reader.viewer).toMatchObject({ scope: 'all', canUpdate: false, canApprove: false })
    const boss = await card('/v1/timekeeping/time-card?employeeId=emp-sam&date=2026-11-05', 'u-boss', 'super_admin')
    expect(boss.viewer).toMatchObject({ scope: 'team', canUpdate: true, canApprove: true, isSuperAdmin: true })
    expect(boss.isCardEditWindowExpired).toBe(false)
  })

  it('lets an employee on leave enter hours and approve, but not change punches (decision 4)', async () => {
    const result = await card('/v1/timekeeping/time-card?date=2026-11-05', 'u-pat')
    expect(result.viewer).toMatchObject({ scope: 'own', canUpdate: true, canEditPunches: false, canApprove: true })
  })

  it('answers 404 for an unknown employee and 422 for a bad date', async () => {
    let res = await get('/v1/timekeeping/time-card?employeeId=emp-nobody', 'u-boss', 'super_admin')
    expect([res.status, await code(res)]).toEqual([404, 'EMPLOYEE_NOT_FOUND'])
    res = await get('/v1/timekeeping/time-card?date=2026-02-30')
    expect([res.status, await code(res)]).toEqual([422, 'VALIDATION_INVALID_DATE'])
    res = await get('/v1/timekeeping/time-card?date=11/05/2026')
    expect([res.status, await code(res)]).toEqual([422, 'VALIDATION_FAILED'])
  })

  it('marks a past period expired after the window, but never for a super admin', async () => {
    const result = await card('/v1/timekeeping/time-card?date=2026-09-01')
    expect(result.isCardEditWindowExpired).toBe(true)
  })
})

describe('GET /v1/timekeeping/clock-state', () => {
  it('shows the open shift, minutes worked today and an old clock-in that needs repair', async () => {
    const now = Date.now()
    const thirtyMinutesAgo = new Date(now - 30 * 60_000).toISOString()
    const today = localDateForInstant(new Date(now), TZ)
    const oldDay = addDays(today, -5)
    run(`INSERT INTO employee_time_card (id, employee_id, pay_period_id, status) VALUES ('tc-now', 'emp-lee', ?1, 'open')`, PERIOD)
    const punch = (id: string, type: string, at: string, localDate: string) =>
      run(`INSERT INTO employee_time_punch (id, employee_id, time_card_id, punch_type, occurred_at, local_date, source, created_by_user_id)
           VALUES (?1, 'emp-lee', 'tc-now', ?2, ?3, ?4, 'button', 'u-lee')`, id, type, at, localDate)
    punch('old-in', 'clock_in', `${oldDay}T15:00:00.000Z`, oldDay) // never closed: needs repair
    punch('now-in', 'clock_in', thirtyMinutesAgo, localDateForInstant(thirtyMinutesAgo, TZ))

    const res = await get('/v1/timekeeping/clock-state', 'u-lee', 'manager')
    expect(res.status).toBe(200)
    const state = ClockStateData.parse(await data(res))
    expect(state.today).toBe(today)
    expect(state.openPunch?.id).toBe('now-in')
    if (state.openPunch?.localDate === today) {
      // Skipped only in the first 30 minutes after local midnight, when the shift began yesterday.
      expect(state.isClockedIn).toBe(true)
      expect(state.minutesWorkedToday).toBeGreaterThanOrEqual(29)
    }
    expect(state.staleOpenPunch).toMatchObject({ id: 'old-in', localDate: oldDay, daysOpen: 5 })
    expect(state.staleOpenPunch?.message).toContain(oldDay)
  })

  it('shows a clocked-out employee with no repair needed', async () => {
    const state = ClockStateData.parse(await data(await get('/v1/timekeeping/clock-state')))
    expect(state).toMatchObject({ isClockedIn: false, openPunch: null, staleOpenPunch: null })
  })

  it('refuses a person who is not an employee', async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a8', 'u-none', 'rs-staff')`)
    clearPermissionCache()
    const res = await get('/v1/timekeeping/clock-state', 'u-none')
    expect([res.status, await code(res)]).toEqual([403, 'EMPLOYEE_ENROLLMENT_REQUIRED'])
  })
})
