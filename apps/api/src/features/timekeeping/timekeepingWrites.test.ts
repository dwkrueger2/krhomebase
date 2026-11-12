// file: apps/api/src/features/timekeeping/timekeepingWrites.test.ts
/**
 * Attendance writes (plan stages 3 to 5) against an in-memory copy of the real Schema 8.0, with the clock fixed by
 * `vi.setSystemTime`. Made-up people and times only. The firm is in Central time (UTC-6 after Nov 1, 2026); the pay
 * period is Sunday Nov 1 to Saturday Nov 14, 2026.
 *
 * Checks: clock in and out (rounding, the repeated key, the double clock-in, nothing to clock out); last night's
 * shift (the review answer, a typed clock-out kept on its own day, the midnight split, too late after 3 am); an
 * employee on leave; adding, replacing and voiding punches with the edit window; hand-entered hours and notes;
 * approval (Friday rule, problems, submit, manager approval and lock, reopen); a manager's change clearing the
 * employee's approval; the employee picker; and that every save writes its audit row.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/timekeeping/timekeepingWrites.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, TimeCardData } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { clearPermissionCache } from '../permissions/rules.ts'

const app = createApp()

let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const rows = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).all(...values) as T[]
const one = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T
const count = (sql: string, ...values: string[]) => (env.sqlite.prepare(sql).get(...values) as { n: number }).n

function seed() {
  run(`INSERT INTO individual (id, first_name, last_name) VALUES ('ind-sam', 'Sam', 'Staffer'), ('ind-pat', 'Pat', 'Leave')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES
        ('u-sam', 'ind-sam', 'sam@example.com', 'x', 'staff'),
        ('u-pat', 'ind-pat', 'pat@example.com', 'x', 'staff'),
        ('u-boss', NULL, 'boss@example.com', 'x', 'super_admin')`)
  run(`INSERT INTO employee (id, user_id, employee_number, employment_status) VALUES ('emp-sam', 'u-sam', 'E1', 'active'), ('emp-pat', 'u-pat', 'E2', 'on_leave')`)
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-staff', 'test_staff', 'Staff', 0), ('rs-super', 'super_admin', 'Super Admin', 1)`)
  run(`INSERT INTO role_set_permission_scope (id, role_set_id, permission_key, scope, can_create, can_read, can_update, can_approve) VALUES
        ('s1', 'rs-staff', 'attendance', 'own', 1, 1, 1, 1)`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a1', 'u-sam', 'rs-staff'), ('a2', 'u-pat', 'rs-staff'), ('a3', 'u-boss', 'rs-super')`)
  run(`INSERT INTO lookup (id, category, value, label, description) VALUES ('lk_kr_employee_policies', 'kr_employee_policies', 'employee_policies', 'Employee Policies', ?1)`,
    JSON.stringify({ employeeClockEditWindowDays: 4 }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  env = createTestD1({ fullSchema: true })
  seed()
  clearSessionCache()
  clearPermissionCache()
})
afterEach(() => vi.useRealTimers())

/** Sets "now" (an ISO time in UTC). */
const at = (iso: string) => vi.setSystemTime(new Date(iso))

async function send(method: string, path: string, body?: unknown, userId = 'u-sam', role = 'staff') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, userId))
}
const asBoss = (method: string, path: string, body?: unknown) => send(method, path, body, 'u-boss', 'super_admin')
const data = async <T,>(res: Response) => ((await res.json()) as { data: T }).data
async function refusal(res: Response) {
  const body = ErrorEnvelope.parse(await res.json())
  return { status: res.status, code: body.error.code, details: body.error.details as Record<string, any> | undefined }
}
async function card(date: string, userId = 'u-sam', role = 'staff', employeeId?: string) {
  const res = await send('GET', `/v1/timekeeping/time-card?date=${date}${employeeId ? `&employeeId=${employeeId}` : ''}`, undefined, userId, role)
  expect(res.status).toBe(200)
  return TimeCardData.parse(await data(res))
}
const auditRows = () => count(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'timekeeping'`)
const punch = (body: Record<string, unknown>, userId?: string, role?: string) => send('POST', '/v1/timekeeping/punches', body, userId, role)

describe('clock in and clock out (stage 3)', () => {
  it('clocks in once, rounded, makes the period and card, and answers a repeated key with the first punch', async () => {
    at('2026-11-04T16:02:00Z') // Wed 10:02 AM, rounds to 10:00
    const first = await send('POST', '/v1/timekeeping/clock-in', { idempotencyKey: 'click-0001' })
    expect(first.status).toBe(200)
    expect(await data(first)).toMatchObject({ occurredAt: '2026-11-04T16:00:00.000Z', localDate: '2026-11-04', replayed: false })
    expect(count(`SELECT COUNT(*) AS n FROM pay_period WHERE id = 'pp_2026-11-01'`)).toBe(1)
    expect(count(`SELECT COUNT(*) AS n FROM employee_time_card WHERE employee_id = 'emp-sam'`)).toBe(1)
    expect(auditRows()).toBe(1)

    const again = await send('POST', '/v1/timekeeping/clock-in', { idempotencyKey: 'click-0001' })
    expect(await data(again)).toMatchObject({ replayed: true })
    expect(count(`SELECT COUNT(*) AS n FROM employee_time_punch`)).toBe(1)

    expect(await refusal(await send('POST', '/v1/timekeeping/clock-in', { idempotencyKey: 'click-0002' }))).toMatchObject({ status: 409, code: 'ALREADY_CLOCKED_IN' })
    const state = await data<{ isClockedIn: boolean; canClock: boolean }>(await send('GET', '/v1/timekeeping/clock-state'))
    expect(state).toMatchObject({ isClockedIn: true, canClock: true })
  })

  it('clocks out the open shift and refuses a clock-out with nothing open', async () => {
    at('2026-11-04T16:00:00Z')
    await send('POST', '/v1/timekeeping/clock-in', {})
    at('2026-11-04T23:30:00Z') // 5:30 PM
    const out = await send('POST', '/v1/timekeeping/clock-out', {})
    expect(out.status).toBe(200)
    expect((await card('2026-11-04')).totals.regularHours).toBe(7.5)
    expect(await refusal(await send('POST', '/v1/timekeeping/clock-out', {}))).toMatchObject({ status: 409, code: 'NO_OPEN_CLOCK_IN', details: { openPunch: null } })
    expect(auditRows()).toBe(2)
  })

  it('keeps an employee on leave off the clock, but lets them enter hours', async () => {
    at('2026-11-04T16:00:00Z')
    expect(await refusal(await send('POST', '/v1/timekeeping/clock-in', {}, 'u-pat'))).toMatchObject({ status: 403, code: 'EMPLOYEE_NOT_ACTIVE' })
    const pto = await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-05', timeType: 'pto', hours: 8 }, 'u-pat')
    expect(pto.status).toBe(200)
    expect(await refusal(await punch({ punchType: 'clock_in', occurredAt: '2026-11-04T14:00:00Z' }, 'u-pat'))).toMatchObject({ status: 403, code: 'EMPLOYEE_NOT_ACTIVE' })
  })
})

describe("last night's open shift (stage 3)", () => {
  beforeEach(async () => {
    at('2026-11-04T02:00:00Z') // Tue Nov 3, 8:00 PM
    await send('POST', '/v1/timekeeping/clock-in', {})
  })

  it('asks for review before 3 am, then saves a typed clock-out on its own day', async () => {
    at('2026-11-04T07:00:00Z') // Wed 1:00 AM
    const review = await refusal(await send('POST', '/v1/timekeeping/clock-out', {}))
    expect(review).toMatchObject({ status: 409, code: 'MISSED_CLOCK_OUT_REQUIRES_REVIEW' })
    expect(review.details?.openPunch).toMatchObject({ localDate: '2026-11-03' })

    const wrongDay = await send('POST', '/v1/timekeeping/missed-clock-out', { choice: 'enter_time', missedAt: '2026-11-04T06:30:00Z' })
    expect(await refusal(wrongDay)).toMatchObject({ status: 422, code: 'MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE' })

    // 11:59 PM would round to midnight; it is kept on Nov 3 (11:54 PM). The old repair always failed here.
    const saved = await send('POST', '/v1/timekeeping/missed-clock-out', { choice: 'enter_time', missedAt: '2026-11-04T05:59:00Z' })
    expect(saved.status).toBe(200)
    const out = one<{ occurred_at: string; local_date: string; source: string }>(`SELECT occurred_at, local_date, source FROM employee_time_punch WHERE punch_type = 'clock_out'`)
    expect(out).toEqual({ occurred_at: '2026-11-04T05:54:00.000Z', local_date: '2026-11-03', source: 'employee_correction' })
  })

  it('splits at midnight: closes last night, starts today and clocks out now, in one save', async () => {
    at('2026-11-04T07:00:00Z') // Wed 1:00 AM
    const split = await send('POST', '/v1/timekeeping/missed-clock-out', { choice: 'split_midnight', idempotencyKey: 'split-0001' })
    expect(split.status).toBe(200)
    expect((await data<{ punchIds: string[] }>(split)).punchIds).toHaveLength(3)
    const result = await card('2026-11-04')
    expect(result.intervals.map((interval) => [interval.workDate, interval.hours, interval.exception])).toEqual([
      ['2026-11-03', 4, null],
      ['2026-11-04', 1, null],
    ])
    expect(result.exceptions).toEqual([])
    expect(auditRows()).toBe(4)
  })

  it('refuses the overnight choice after 3 am: the punch is repaired on the time card', async () => {
    at('2026-11-04T10:00:00Z') // Wed 4:00 AM
    expect(await refusal(await send('POST', '/v1/timekeeping/missed-clock-out', { choice: 'split_midnight' }))).toMatchObject({ status: 409, code: 'MISSED_CLOCK_OUT_REPAIR_REQUIRED' })
    const out = await refusal(await send('POST', '/v1/timekeeping/clock-out', {}))
    expect(out).toMatchObject({ code: 'NO_OPEN_CLOCK_IN' })
    expect(out.details?.openPunch).toMatchObject({ localDate: '2026-11-03' })
  })
})

describe('time-card edits (stage 4)', () => {
  beforeEach(() => at('2026-11-04T16:00:00Z')) // Wed Nov 4

  it('adds, replaces and voids punches; a replacement voids the original in the same save', async () => {
    const inRes = await punch({ punchType: 'clock_in', occurredAt: '2026-11-02T14:00:00Z' })
    expect(inRes.status).toBe(200)
    const outRes = await punch({ punchType: 'clock_out', occurredAt: '2026-11-02T22:30:00Z' })
    const outId = (await data<{ punchId: string }>(outRes)).punchId
    expect((await card('2026-11-04')).totals.regularHours).toBe(8.5)

    const replaced = await data<{ punchId: string; supersededPunchId: string }>(await punch({ punchType: 'clock_out', occurredAt: '2026-11-02T23:00:00Z', replacesPunchId: outId }))
    expect(replaced.supersededPunchId).toBe(outId)
    expect(one<{ voided_at: string | null }>('SELECT voided_at FROM employee_time_punch WHERE id = ?1', outId).voided_at).toBeTruthy()
    expect(one<{ source: string; correction_reason: string }>('SELECT source, correction_reason FROM employee_time_punch WHERE id = ?1', replaced.punchId)).toEqual({ source: 'employee_correction', correction_reason: 'Time Card Review correction' })
    expect((await card('2026-11-04')).totals.regularHours).toBe(9)
    expect(await refusal(await punch({ punchType: 'clock_out', occurredAt: '2026-11-02T23:30:00Z', replacesPunchId: outId }))).toMatchObject({ status: 409, code: 'PUNCH_ALREADY_VOIDED' })

    const inId = (await data<{ punchId: string }>(inRes)).punchId
    const voided = await send('DELETE', `/v1/timekeeping/punches/${inId}`)
    expect(await data(voided)).toMatchObject({ punchId: inId, alreadyVoided: false })
    expect((await card('2026-11-04')).exceptions).toEqual(['clock_out_without_clock_in'])
    expect(await data(await send('DELETE', `/v1/timekeeping/punches/${inId}`))).toMatchObject({ alreadyVoided: true })
    expect(auditRows()).toBe(5)
  })

  it('keeps employees inside the edit window (work date through 4 days after); super admins are exempt', async () => {
    expect(await refusal(await punch({ punchType: 'clock_in', occurredAt: '2026-10-30T14:00:00Z' }))).toMatchObject({ status: 403, code: 'CLOCK_EDIT_WINDOW_EXPIRED' })
    expect(await refusal(await punch({ punchType: 'clock_in', occurredAt: '2026-11-06T14:00:00Z' }))).toMatchObject({ status: 403, code: 'CLOCK_EDIT_WINDOW_EXPIRED' })
    const today = await punch({ punchType: 'clock_in', occurredAt: '2026-11-04T13:00:00Z' })
    expect(today.status).toBe(200)
    const boss = await asBoss('POST', '/v1/timekeeping/punches', { employeeId: 'emp-sam', punchType: 'clock_in', occurredAt: '2026-10-28T14:00:00Z' })
    expect(boss.status).toBe(200)
    expect(one<{ source: string }>(`SELECT source FROM employee_time_punch WHERE local_date = '2026-10-28'`).source).toBe('manager_correction')
  })

  it('refuses another employee\'s punch', async () => {
    const pats = await asBoss('POST', '/v1/timekeeping/punches', { employeeId: 'emp-pat', punchType: 'clock_in', occurredAt: '2026-11-03T14:00:00Z' })
    const patPunch = (await data<{ punchId: string }>(pats)).punchId
    expect(await refusal(await punch({ punchType: 'clock_in', occurredAt: '2026-11-03T15:00:00Z', replacesPunchId: patPunch }))).toMatchObject({ status: 404, code: 'PUNCH_NOT_FOUND' })
  })

  it('saves hours and the day note, changing the entry of that kind instead of adding another', async () => {
    const first = await data<{ eventId: string }>(await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-05', timeType: 'pto', hours: 4 }))
    const second = await data<{ eventId: string }>(await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-05', timeType: 'pto', hours: 6.04 }))
    expect(second.eventId).toBe(first.eventId)
    await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-05', timeType: 'other', hours: 0, notes: 'Dentist' })
    expect(await data(await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-06', timeType: 'holiday', hours: 0 }))).toMatchObject({ eventId: null })
    const result = await card('2026-11-04')
    expect(result.events.map((event) => [event.timeType, event.hours, event.notes])).toEqual([
      ['pto', 6, null],
      ['other', 0, 'Dentist'],
    ])
    expect(result.totals.ptoHours).toBe(6)
  })
})

describe('approval and reopen (stage 5)', () => {
  async function pair(date: string) {
    await punch({ punchType: 'clock_in', occurredAt: `${date}T14:00:00Z` })
    await punch({ punchType: 'clock_out', occurredAt: `${date}T22:00:00Z` })
  }
  const cardId = () => one<{ id: string }>(`SELECT id FROM employee_time_card WHERE employee_id = 'emp-sam'`).id

  it('lets the employee submit on a Friday once the problems are fixed; a manager then approves and locks it', async () => {
    at('2026-11-05T16:00:00Z') // Thursday
    await pair('2026-11-02')
    await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-03', timeType: 'pto', hours: 8 })
    let result = await card('2026-11-05')
    expect(result.approval).toMatchObject({ kind: 'employee', allowed: false, canReopen: false })
    expect(await refusal(await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`))).toMatchObject({ status: 409, code: 'EMPLOYEE_APPROVAL_NOT_YET_ALLOWED' })

    at('2026-11-06T16:00:00Z') // Friday
    const open = await data<{ punchId: string }>(await punch({ punchType: 'clock_in', occurredAt: '2026-11-04T14:00:00Z' }))
    expect(await refusal(await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`))).toMatchObject({ status: 409, code: 'TIME_CARD_HAS_UNRESOLVED_EXCEPTIONS' })
    await send('DELETE', `/v1/timekeeping/punches/${open.punchId}`)

    const submitted = await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`)
    expect(await data(submitted)).toMatchObject({ approvalType: 'employee', status: 'submitted' })
    expect(rows<{ status: string }>(`SELECT status FROM employee_time_event`).map((row) => row.status)).toEqual(['submitted'])
    expect(await refusal(await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`))).toMatchObject({ code: 'TIME_CARD_ALREADY_APPROVED' })

    const managerView = await card('2026-11-06', 'u-boss', 'super_admin', 'emp-sam')
    expect(managerView.approval).toMatchObject({ kind: 'manager', allowed: true, canReopen: true })
    const approved = await asBoss('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`)
    expect(await data(approved)).toMatchObject({ approvalType: 'manager', status: 'approved' })
    result = await card('2026-11-06')
    expect(result.card).toMatchObject({ status: 'approved', isLocked: true })
    expect(rows<{ status: string }>(`SELECT status FROM employee_time_event`).map((row) => row.status)).toEqual(['approved'])
    expect(await refusal(await punch({ punchType: 'clock_in', occurredAt: '2026-11-05T14:00:00Z' }))).toMatchObject({ status: 409, code: 'TIME_CARD_LOCKED' })
    expect(await refusal(await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`, undefined, 'u-boss', 'super_admin'))).toMatchObject({ code: 'TIME_CARD_LOCKED' })
  })

  it('lets only a manager or super admin reopen, clearing both approvals, the lock and the hours\' status', async () => {
    at('2026-11-06T16:00:00Z') // Friday
    await pair('2026-11-02')
    await send('PUT', '/v1/timekeeping/events', { workDate: '2026-11-03', timeType: 'pto', hours: 8 })
    await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`)
    await asBoss('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`)

    expect(await refusal(await send('POST', `/v1/timekeeping/time-cards/${cardId()}/reopen`))).toMatchObject({ status: 403, code: 'MANAGER_REOPEN_REQUIRED' })
    const reopened = await asBoss('POST', `/v1/timekeeping/time-cards/${cardId()}/reopen`)
    expect(reopened.status).toBe(200)
    expect(one(`SELECT status, employee_approved_at, manager_approved_at, locked_at, reopened_by_user_id FROM employee_time_card`)).toEqual({
      status: 'reopened', employee_approved_at: null, manager_approved_at: null, locked_at: null, reopened_by_user_id: 'u-boss',
    })
    expect(rows<{ status: string }>(`SELECT status FROM employee_time_event`).map((row) => row.status)).toEqual(['draft'])
    expect(await refusal(await asBoss('POST', `/v1/timekeeping/time-cards/${cardId()}/reopen`))).toMatchObject({ status: 409, code: 'TIME_CARD_NOT_APPROVED' })
  })

  it("clears the employee's approval when a manager changes the card", async () => {
    at('2026-11-06T16:00:00Z')
    await pair('2026-11-02')
    await send('POST', `/v1/timekeeping/time-cards/${cardId()}/approve`)
    await asBoss('POST', '/v1/timekeeping/punches', { employeeId: 'emp-sam', punchType: 'clock_in', occurredAt: '2026-11-03T14:00:00Z' })
    expect(one(`SELECT status, employee_approved_at FROM employee_time_card`)).toEqual({ status: 'reopened', employee_approved_at: null })
  })
})

describe('employee picker (stage 5)', () => {
  it('lists the viewer alone for own scope, and everyone for a super admin', async () => {
    at('2026-11-04T16:00:00Z')
    const own = await data<{ employees: Array<{ id: string }> }>(await send('GET', '/v1/timekeeping/employees'))
    expect(own.employees.map((employee) => employee.id)).toEqual(['emp-sam'])
    const all = await data<{ employees: Array<{ id: string }> }>(await asBoss('GET', '/v1/timekeeping/employees'))
    expect(all.employees.map((employee) => employee.id)).toEqual(['emp-pat', 'emp-sam'])
  })
})
