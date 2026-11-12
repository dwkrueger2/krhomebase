// file: apps/api/src/features/users/users.test.ts
/**
 * Users and Invites (Settings plan, stage 4d) against an in-memory Schema 8.0, with the mailer not configured (no
 * test reaches Google). Made-up people only. Checks: the list (names, role sets, employee, invitations with their
 * shown status, no writes), create by invitation (person, user, employee, role sets, invitation row with a hashed
 * token, the link returned because no email went out) and active at once, the duplicate refusals, the status and
 * role set rules, staff codes, enrollment, resend, cancel and delete, other roles refused, and audit rows.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/users/users.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, UserSavedData, UsersData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { inviteDisplayStatus, storedRole } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = <T,>(sql: string) => env.sqlite.prepare(sql).get() as T
const FUTURE = '2099-01-01T00:00:00.000Z'
const PAST = '2001-01-01T00:00:00.000Z'

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO role_set (id, role_key, label, role_family, is_system, is_assignable, sort_order) VALUES
    ('role_super_admin', 'super_admin', 'Super Admin', 'system', 1, 1, 10),
    ('role_attorney', 'attorney', 'Attorney', 'operations', 1, 1, 20),
    ('role_manager', 'manager', 'Manager', 'operations', 1, 1, 45),
    ('role_staff', 'staff', 'Staff', 'operations', 1, 1, 60),
    ('role_unassigned', 'unassigned', 'Do Not Assign a Role', 'system', 1, 0, 999)`)
  run(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-admin', 'Ada', 'Admin', NULL), ('i-sam', 'Samuel', 'Staff', 'Sam')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role, role_set_id) VALUES ('u-admin', 'i-admin', 'admin@example.com', 'x', 'super_admin', 'role_super_admin'), ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff', 'role_staff')`)
  run(`INSERT INTO user (id, email, password_hash, role, is_active, account_status) VALUES ('u-gone', 'gone@example.com', 'x', 'staff', 0, 'deactivated')`)
  run(`INSERT INTO employee (id, user_id, employee_number, staff_code) VALUES ('emp-sam', 'u-sam', '007', 'SAM')`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-a', 'u-admin', 'role_super_admin', 1), ('urs-s', 'u-sam', 'role_staff', 1)`)
  run(`INSERT INTO user_invite (id, email, role, invite_token_hash, status, expires_at, created_at) VALUES
    ('inv-open', 'open@example.com', 'staff', 'h1', 'pending', '${FUTURE}', '2026-11-01T00:00:00.000Z'),
    ('inv-old', 'old@example.com', 'staff', 'h2', 'pending', '${PAST}', '2026-10-01T00:00:00.000Z'),
    ('inv-done', 'sam@example.com', 'staff', 'h3', 'accepted', '${FUTURE}', '2026-09-01T00:00:00.000Z')`)
})

async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, role = 'super_admin') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db, KR_APP_BASE_URL: 'https://app.example.com' }, 'u-admin'))
}

async function saved(res: Response) {
  expect(res.status).toBe(200)
  return UserSavedData.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

const auditCount = () => one<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'users'`).n
const newUser = { firstName: 'Nora', lastName: 'New', email: 'Nora@Example.com', phone: '(555) 123-4567', roleSetId: 'role_manager', workerClassification: 'employee', activation: 'invite', inviteExpirationDays: 3 }

describe('GET /v1/users', () => {
  it('lists users with names, role sets and employee records, and invitations not accepted, without writing', async () => {
    const res = await call('GET', '/v1/users')
    expect(res.status).toBe(200)
    const data = UsersData.parse(((await res.json()) as { data: unknown }).data)
    const sam = data.users.find((row) => row.id === 'u-sam')!
    expect(sam).toMatchObject({ name: 'Samuel Staff (Sam)', roleSetIds: ['role_staff'], primaryRoleSetId: 'role_staff', employee: { staffCode: 'SAM', employeeNumber: '007' } })
    expect(data.users.find((row) => row.id === 'u-gone')?.accountStatus).toBe('deactivated')
    expect(data.invites.map((row) => [row.id, row.displayStatus])).toEqual([
      ['inv-open', 'pending'],
      ['inv-old', 'expired'],
    ])
    expect(data.roleSets.map((row) => row.id)).toContain('role_manager')
    expect(one<{ status: string }>(`SELECT status FROM user_invite WHERE id = 'inv-old'`).status).toBe('pending')
  })

  it('refuses other roles', async () => {
    expect(await errorCode(await call('GET', '/v1/users', undefined, 'staff'), 403)).toBeTruthy()
  })
})

describe('POST /v1/users', () => {
  it('creates an invited employee with a person, role sets and a hashed invitation, and returns the link when no email went out', async () => {
    const data = await saved(await call('POST', '/v1/users', newUser))
    const userId = data.userId!
    const user = one<{ email: string; role: string; role_set_id: string; is_active: number; account_status: string }>(`SELECT email, role, role_set_id, is_active, account_status FROM user WHERE id = '${userId}'`)
    expect(user).toEqual({ email: 'nora@example.com', role: 'staff', role_set_id: 'role_manager', is_active: 0, account_status: 'pending' })
    const roles = env.sqlite.prepare(`SELECT role_set_id, is_primary FROM user_role_set WHERE user_id = ? ORDER BY role_set_id`).all(userId)
    expect(roles).toEqual([
      { role_set_id: 'role_manager', is_primary: 1 },
      { role_set_id: 'role_staff', is_primary: 0 },
    ])
    expect(one<{ employee_number: string; staff_code: string; employment_status: string }>(`SELECT employee_number, staff_code, employment_status FROM employee WHERE user_id = '${userId}'`)).toEqual({ employee_number: '008', staff_code: '008', employment_status: 'inactive' })
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM individual_contact_method`).n).toBe(2)
    expect(data.invitation).toMatchObject({ emailSent: false, reason: 'GOOGLE_WORKSPACE_MAILER_NOT_CONFIGURED' })
    const token = new URL(data.invitation!.inviteUrl!).searchParams.get('invite')!
    expect(data.invitation!.inviteUrl).toMatch(/^https:\/\/app\.example\.com\/login\?invite=/)
    const invite = one<{ invite_token_hash: string; expires_at: string; sent_at: string | null }>(`SELECT invite_token_hash, expires_at, sent_at FROM user_invite WHERE id = '${data.invitation!.inviteId}'`)
    expect(invite.invite_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(invite.invite_token_hash).not.toContain(token)
    expect(invite.sent_at).toBeNull()
    expect(auditCount()).toBe(2)
  })

  it('creates an active user at once without an invitation, and refuses "Do Not Assign a Role" for that', async () => {
    const data = await saved(await call('POST', '/v1/users', { ...newUser, activation: 'activate', workerClassification: 'unspecified' }))
    expect(data.invitation).toBeNull()
    expect(one<{ is_active: number }>(`SELECT is_active FROM user WHERE id = '${data.userId}'`).is_active).toBe(1)
    expect(await errorCode(await call('POST', '/v1/users', { ...newUser, email: 'x@example.com', activation: 'activate', roleSetId: null }), 422)).toBe('USER_ROLE_SET_REQUIRED')
  })

  it('refuses duplicates and invites an inactive account again', async () => {
    expect(await errorCode(await call('POST', '/v1/users', { ...newUser, email: 'open@example.com' }), 409)).toBe('PENDING_INVITE_ALREADY_EXISTS')
    expect(await errorCode(await call('POST', '/v1/users', { ...newUser, email: 'sam@example.com' }), 409)).toBe('USER_EMAIL_ALREADY_EXISTS')
    run(`INSERT INTO user_sso_identity (id, user_id, provider, provider_subject, email) VALUES ('usi-1', 'u-sam', 'google', 'g-1', 'other@example.com')`)
    expect(await errorCode(await call('POST', '/v1/users', { ...newUser, email: 'other@example.com' }), 409)).toBe('USER_SSO_EMAIL_ALREADY_EXISTS')
    const again = await saved(await call('POST', '/v1/users', { ...newUser, email: 'gone@example.com' }))
    expect(again.userId).toBe('u-gone')
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM user WHERE email = 'gone@example.com'`).n).toBe(1)
  })

  it('marks a lapsed pending invitation expired when the same email is invited again', async () => {
    await saved(await call('POST', '/v1/users', { ...newUser, email: 'old@example.com' }))
    expect(one<{ status: string }>(`SELECT status FROM user_invite WHERE id = 'inv-old'`).status).toBe('expired')
  })
})

describe('PUT /v1/users/{userId}', () => {
  const change = { accountStatus: 'active', staffCode: 'SAM', roleSetIds: ['role_staff', 'role_attorney'], primaryRoleSetId: 'role_attorney' }

  it('changes role sets, the primary and the stored role in one save', async () => {
    await saved(await call('PUT', '/v1/users/u-sam', change))
    expect(one<{ role: string; role_set_id: string }>(`SELECT role, role_set_id FROM user WHERE id = 'u-sam'`)).toEqual({ role: 'attorney', role_set_id: 'role_attorney' })
    const rows = env.sqlite.prepare(`SELECT role_set_id, is_primary, is_active FROM user_role_set WHERE user_id = 'u-sam' ORDER BY role_set_id`).all()
    expect(rows).toEqual([
      { role_set_id: 'role_attorney', is_primary: 1, is_active: 1 },
      { role_set_id: 'role_staff', is_primary: 0, is_active: 1 },
    ])
    await saved(await call('PUT', '/v1/users/u-sam', { ...change, staffCode: null, roleSetIds: ['role_attorney'] }))
    expect(one<{ is_active: number }>(`SELECT is_active FROM user_role_set WHERE id = 'urs-s'`).is_active).toBe(0)
  })

  it('applies the status, self, super admin, role set and staff code rules', async () => {
    expect(await errorCode(await call('PUT', '/v1/users/u-admin', { ...change, accountStatus: 'deactivated', roleSetIds: ['role_super_admin'], primaryRoleSetId: 'role_super_admin', staffCode: null }), 422)).toBe('SUPER_ADMIN_OR_SELF_STATUS_CHANGE_BLOCKED')
    expect(await errorCode(await call('PUT', '/v1/users/u-admin', { accountStatus: 'active', staffCode: null, roleSetIds: ['role_attorney'], primaryRoleSetId: 'role_attorney' }), 422)).toBe('SELF_SUPER_ADMIN_DEMOTION_BLOCKED')
    expect(await errorCode(await call('PUT', '/v1/users/u-sam', { ...change, roleSetIds: ['role_unassigned'], primaryRoleSetId: 'role_unassigned' }), 422)).toBe('ROLE_SET_NOT_ASSIGNABLE')
    expect(await errorCode(await call('PUT', '/v1/users/u-sam', { ...change, primaryRoleSetId: 'role_manager' }), 422)).toBe('PRIMARY_ROLE_SET_INVALID')
    expect(await errorCode(await call('PUT', '/v1/users/u-sam', { ...change, staffCode: null }), 422)).toBe('STAFF_CODE_REQUIRED')
    expect(await errorCode(await call('PUT', '/v1/users/u-gone', { ...change, accountStatus: 'deactivated', roleSetIds: [], primaryRoleSetId: null, staffCode: 'GO' }), 422)).toBe('USER_NOT_EMPLOYEE')
    expect(await errorCode(await call('PUT', '/v1/users/nobody', change), 404)).toBe('USER_NOT_FOUND')
    expect(auditCount()).toBe(0)
  })

  it('upper-cases the staff code and refuses one another employee has', async () => {
    run(`INSERT INTO employee (id, user_id, employee_number, staff_code) VALUES ('emp-admin', 'u-admin', '001', 'ADA')`)
    expect(await errorCode(await call('PUT', '/v1/users/u-sam', { ...change, staffCode: 'ada' }), 409)).toBe('STAFF_CODE_IN_USE')
    await saved(await call('PUT', '/v1/users/u-sam', { ...change, staffCode: 'sm1' }))
    expect(one<{ staff_code: string }>(`SELECT staff_code FROM employee WHERE id = 'emp-sam'`).staff_code).toBe('SM1')
  })
})

describe('enrollment and invitations', () => {
  it('enrolls a user as an employee with the Staff role set, once', async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-g', 'u-gone', 'role_attorney', 1)`)
    await saved(await call('POST', '/v1/users/u-gone/employee'))
    expect(one<{ employee_number: string }>(`SELECT employee_number FROM employee WHERE user_id = 'u-gone'`).employee_number).toBe('008')
    const roles = env.sqlite.prepare(`SELECT role_set_id, is_primary FROM user_role_set WHERE user_id = 'u-gone' AND is_active = 1 ORDER BY role_set_id`).all()
    expect(roles).toEqual([
      { role_set_id: 'role_attorney', is_primary: 1 },
      { role_set_id: 'role_staff', is_primary: 0 },
    ])
    expect(await errorCode(await call('POST', '/v1/users/u-gone/employee'), 409)).toBe('USER_ALREADY_EMPLOYEE')
  })

  it('resends, cancels and deletes invitations by their rules', async () => {
    const resent = await saved(await call('POST', '/v1/user-invites/inv-open/resend', { expirationDays: 10 }))
    expect(one<{ status: string }>(`SELECT status FROM user_invite WHERE id = 'inv-open'`).status).toBe('revoked')
    const newId = resent.invitation!.inviteId
    expect(resent.users.invites.find((row) => row.id === newId)?.displayStatus).toBe('pending')
    expect(await errorCode(await call('POST', '/v1/user-invites/inv-done/resend', { expirationDays: 7 }), 409)).toBe('INVITE_ALREADY_ACCEPTED')
    expect(await errorCode(await call('DELETE', `/v1/user-invites/${newId}`), 409)).toBe('INVITE_STILL_PENDING')
    await saved(await call('POST', `/v1/user-invites/${newId}/cancel`))
    expect(await errorCode(await call('POST', `/v1/user-invites/${newId}/cancel`), 409)).toBe('INVITE_NOT_PENDING')
    await saved(await call('DELETE', `/v1/user-invites/${newId}`))
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM user_invite WHERE id = '${newId}'`).n).toBe(0)
    expect(await errorCode(await call('POST', '/v1/user-invites/nope/cancel'), 404)).toBe('INVITE_NOT_FOUND')
  })
})

describe('user helpers', () => {
  it('stores a role the column allows, keeping super admin', () => {
    const sets = [{ id: 'role_manager', roleKey: 'manager' }, { id: 'role_attorney', roleKey: 'attorney' }] as never
    expect(storedRole(sets, ['role_manager'], 'role_manager')).toBe('staff')
    expect(storedRole(sets, ['role_attorney'], 'role_attorney')).toBe('attorney')
    expect(storedRole(sets, ['role_attorney', 'role_super_admin'], 'role_attorney')).toBe('super_admin')
  })

  it('shows revoked as cancelled and a lapsed pending invitation as expired', () => {
    expect(inviteDisplayStatus({ status: 'revoked', expires_at: FUTURE })).toBe('cancelled')
    expect(inviteDisplayStatus({ status: 'pending', expires_at: PAST })).toBe('expired')
    expect(inviteDisplayStatus({ status: 'pending', expires_at: FUTURE })).toBe('pending')
  })
})
