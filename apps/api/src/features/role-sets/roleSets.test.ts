// file: apps/api/src/features/role-sets/roleSets.test.ts
/**
 * Role Sets (Settings plan, stage 4c) against an in-memory Schema 8.0. Made-up role sets only. Checks: the list
 * (active only, by sort order, grants as stored, holder counts), create (next custom id, a row per resource, scope
 * rows only when they grant, protected and unknown keys dropped), change (rows changed in place, a scope row kept and
 * cleared), the name rule, built-in role sets refused, retire (assignments ended), other roles refused, one audit row
 * per write, 503 without the tables, and the contracts' protected list matching the permission resolver's.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/role-sets/roleSets.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, isProtectedPermission, PERMISSION_RESOURCES, ROLE_SET_ACTIONS, RoleSetSavedData, RoleSetsData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { CUSTOM_ROLE_PROTECTED } from '../permissions/rules.ts'
import { cleanPermissions, nextCustomIdentity } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-admin', 'admin@example.com', 'x', 'super_admin'), ('u-sam', 'sam@example.com', 'x', 'staff'), ('u-lee', 'lee@example.com', 'x', 'staff')`)
  run(`INSERT INTO role_set (id, role_key, label, description, role_family, is_system, sort_order) VALUES
    ('role_staff', 'staff', 'Staff', 'Routine work', 'operations', 1, 60),
    ('role_super_admin', 'super_admin', 'Super Admin', NULL, 'system', 1, 10),
    ('role_custom_002', 'custom_002', 'Front Desk', NULL, 'operations', 0, 100),
    ('role_custom_007', 'custom_007', 'Old Role', NULL, 'operations', 0, 100)`)
  run(`UPDATE role_set SET is_active = 0 WHERE id = 'role_custom_007'`)
  run(`INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_read, can_update) VALUES
    ('rsp_staff_contacts', 'role_staff', 'contacts', 'Contacts', 'application', 1, 1),
    ('rsp_custom_002_matters', 'role_custom_002', 'matters', 'Matters', 'application', 1, 0)`)
  run(`INSERT INTO role_set_permission_scope (id, role_set_id, permission_key, scope, can_read) VALUES ('rsps_custom_002_attendance_own', 'role_custom_002', 'attendance', 'own', 1)`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-1', 'u-sam', 'role_custom_002', 1), ('urs-2', 'u-lee', 'role_custom_002', 0), ('urs-3', 'u-lee', 'role_staff', 1)`)
})

async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, role = 'super_admin', database: D1Database = env.db) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: database }, 'u-admin'))
}

async function saved(res: Response) {
  expect(res.status).toBe(200)
  return RoleSetSavedData.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

const auditCount = () => (env.sqlite.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'role-sets'`).get() as { n: number }).n

describe('GET /v1/role-sets', () => {
  it('lists the active role sets by sort order with their stored grants and holder counts', async () => {
    const res = await call('GET', '/v1/role-sets')
    expect(res.status).toBe(200)
    const data = RoleSetsData.parse(((await res.json()) as { data: unknown }).data)
    expect(data.roleSets.map((row) => row.id)).toEqual(['role_super_admin', 'role_staff', 'role_custom_002'])
    const staff = data.roleSets.find((row) => row.id === 'role_staff')!
    expect(staff).toMatchObject({ isSystem: true, permissions: ['contacts.read', 'contacts.update'], holderCount: 1 })
    expect(data.roleSets.find((row) => row.id === 'role_custom_002')).toMatchObject({ isSystem: false, scopedPermissions: ['attendance.read.own'], holderCount: 2 })
  })

  it('refuses other roles and answers 503 without the tables', async () => {
    expect(await errorCode(await call('GET', '/v1/role-sets', undefined, 'staff'), 403)).toBeTruthy()
    const empty = createTestD1()
    expect(await errorCode(await call('GET', '/v1/role-sets', undefined, 'super_admin', empty.db), 503)).toBe('ROLE_SETS_UNAVAILABLE')
  })
})

describe('POST /v1/role-sets', () => {
  it('creates the next custom role set with a row per resource, drops protected keys and writes scope rows only when they grant', async () => {
    const data = await saved(
      await call('POST', '/v1/role-sets', {
        name: '  Intake  ',
        description: 'New clients',
        permissions: ['contacts.create', 'contacts.read', 'users.delete', 'roles.read', 'invoices.delete', 'nonsense.read', 'contacts.read'],
        scopedPermissions: ['attendance.read.own', 'attendance.update.team', 'firm_details.read.all'],
      }),
    )
    expect(data.roleSetId).toBe('role_custom_008')
    const created = data.roleSets.find((row) => row.id === 'role_custom_008')!
    expect(created).toMatchObject({ label: 'Intake', roleKey: 'custom_008', isSystem: false, permissions: ['contacts.create', 'contacts.read'] })
    expect(created.scopedPermissions).toEqual(['attendance.read.own', 'attendance.update.team'])
    const rows = env.sqlite.prepare(`SELECT COUNT(*) AS n FROM role_set_permission WHERE role_set_id = 'role_custom_008'`).get() as { n: number }
    expect(rows.n).toBe(PERMISSION_RESOURCES.length)
    const scopes = env.sqlite.prepare(`SELECT id FROM role_set_permission_scope WHERE role_set_id = 'role_custom_008' ORDER BY id`).all() as Array<{ id: string }>
    expect(scopes.map((row) => row.id)).toEqual(['rsps_custom_008_attendance_own', 'rsps_custom_008_attendance_team'])
    expect(auditCount()).toBe(1)
  })

  it('refuses a name another active role set has, ignoring case, and allows a retired one', async () => {
    expect(await errorCode(await call('POST', '/v1/role-sets', { name: 'staff', permissions: [], scopedPermissions: [] }), 409)).toBe('ROLE_SET_NAME_IN_USE')
    await saved(await call('POST', '/v1/role-sets', { name: 'Old Role', permissions: [], scopedPermissions: [] }))
  })
})

describe('PUT and DELETE /v1/role-sets/{roleSetId}', () => {
  it('changes a custom role set in place and clears a scope row that no longer grants', async () => {
    const data = await saved(await call('PUT', '/v1/role-sets/role_custom_002', { name: 'Front Desk', description: '', permissions: ['matters.read', 'matters.update'], scopedPermissions: [] }))
    const changed = data.roleSets.find((row) => row.id === 'role_custom_002')!
    expect(changed.permissions).toEqual(['matters.read', 'matters.update'])
    expect(changed.scopedPermissions).toEqual([])
    const matters = env.sqlite.prepare(`SELECT id, can_update FROM role_set_permission WHERE role_set_id = 'role_custom_002' AND permission_key = 'matters'`).all()
    expect(matters).toEqual([{ id: 'rsp_custom_002_matters', can_update: 1 }])
    const scope = env.sqlite.prepare(`SELECT can_read FROM role_set_permission_scope WHERE id = 'rsps_custom_002_attendance_own'`).get() as { can_read: number }
    expect(scope.can_read).toBe(0)
  })

  it('refuses built-in and unknown role sets', async () => {
    const body = { name: 'Staff', permissions: [], scopedPermissions: [] }
    expect(await errorCode(await call('PUT', '/v1/role-sets/role_staff', body), 409)).toBe('ROLE_SET_BUILT_IN')
    expect(await errorCode(await call('PUT', '/v1/role-sets/role_custom_007', { ...body, name: 'X' }), 404)).toBe('ROLE_SET_NOT_FOUND')
    expect(await errorCode(await call('DELETE', '/v1/role-sets/role_super_admin'), 409)).toBe('ROLE_SET_BUILT_IN')
    expect(await errorCode(await call('PUT', '/v1/role-sets/role_custom_002', body, 'staff'), 403)).toBeTruthy()
    expect(auditCount()).toBe(0)
  })

  it('retires a custom role set and ends its assignments, keeping the rows', async () => {
    const data = await saved(await call('DELETE', '/v1/role-sets/role_custom_002'))
    expect(data.assignmentsEnded).toBe(2)
    expect(data.roleSets.some((row) => row.id === 'role_custom_002')).toBe(false)
    const assignments = env.sqlite.prepare(`SELECT id, is_active FROM user_role_set ORDER BY id`).all()
    expect(assignments).toEqual([
      { id: 'urs-1', is_active: 0 },
      { id: 'urs-2', is_active: 0 },
      { id: 'urs-3', is_active: 1 },
    ])
    expect(auditCount()).toBe(1)
  })
})

describe('role set helpers', () => {
  it('numbers custom role sets one past the highest in use', () => {
    expect(nextCustomIdentity([{ id: 'role_staff' }])).toEqual({ id: 'role_custom_001', roleKey: 'custom_001' })
    expect(nextCustomIdentity([{ id: 'role_custom_009' }, { id: 'role_custom_010' }])).toEqual({ id: 'role_custom_011', roleKey: 'custom_011' })
  })

  it('protects exactly the keys the permission resolver protects', () => {
    const fromContracts = PERMISSION_RESOURCES.flatMap((resource) => ROLE_SET_ACTIONS.filter((action) => isProtectedPermission(resource.id, action)).map((action) => `${resource.id}.${action}`))
    expect(new Set(fromContracts)).toEqual(new Set(CUSTOM_ROLE_PROTECTED))
    expect(cleanPermissions(['data_management.read', 'payments.create'])).toEqual(['payments.create'])
  })
})
