// file: apps/api/src/features/permissions/permissions.test.ts
/**
 * The permission resolver (ported from the old krAuthorization.ts), against the real Schema 8.0 tables.
 * Made-up users only.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/permissions/permissions.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../../test/fakes.ts'
import { createPermissionQueries } from './queries.ts'
import { clearPermissionCache, isAuthorized, resolveEffectivePermissions } from './rules.ts'

let sqlite: DatabaseSync
let queries: ReturnType<typeof createPermissionQueries>

const run = (sql: string) => sqlite.prepare(sql).run()

beforeEach(() => {
  const made = createTestD1({ fullSchema: true })
  sqlite = made.sqlite
  queries = createPermissionQueries(made.db)
  clearPermissionCache()
  run(`INSERT INTO user (id, email, password_hash, role) VALUES ('u1', 'u1@example.com', 'x', 'staff'), ('u2', 'u2@example.com', 'x', 'staff')`)
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-staff', 'test_staff', 'Staff', 0), ('rs-billing', 'test_billing', 'Billing', 0), ('rs-super', 'super_admin', 'Super Admin', 1)`)
  run(`INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_read, can_update, can_delete)
       VALUES ('p1', 'rs-staff', 'contacts', 'Contacts', 'People', 1, 1, 0),
              ('p2', 'rs-billing', 'invoices', 'Invoices', 'Billing', 1, 0, 1)`)
})

describe('resolveEffectivePermissions', () => {
  it('joins the grants of every active role set', async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a1', 'u1', 'rs-staff'), ('a2', 'u1', 'rs-billing')`)
    const resolved = await resolveEffectivePermissions(queries, 'u1')
    expect([...resolved.grants].sort()).toEqual(['contacts.read', 'contacts.update', 'invoices.read'])
  })

  it('keeps protected keys (invoices.delete) for the built-in Super Admin role set only', async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a1', 'u1', 'rs-billing')`)
    expect(await isAuthorized(queries, 'u1', 'invoices', 'delete')).toBe(false)
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a2', 'u2', 'rs-super')`)
    expect(await isAuthorized(queries, 'u2', 'invoices', 'delete')).toBe(true)
    expect(await isAuthorized(queries, 'u2', 'anything', 'send')).toBe(true)
  })

  it('ignores inactive, not-yet-started and ended assignments, and inactive role sets', async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_active) VALUES ('a1', 'u1', 'rs-staff', 0)`)
    run(`INSERT INTO user_role_set (id, user_id, role_set_id, starts_at) VALUES ('a2', 'u1', 'rs-billing', '2999-01-01T00:00:00Z')`)
    expect((await resolveEffectivePermissions(queries, 'u1')).grants.size).toBe(0)
    run(`INSERT INTO user_role_set (id, user_id, role_set_id, expires_at) VALUES ('a3', 'u2', 'rs-staff', '2000-01-01T00:00:00Z')`)
    expect(await isAuthorized(queries, 'u2', 'contacts', 'read')).toBe(false)
    clearPermissionCache()
    run(`UPDATE user_role_set SET expires_at = NULL WHERE id = 'a3'`)
    run(`UPDATE role_set SET is_active = 0 WHERE id = 'rs-staff'`)
    expect(await isAuthorized(queries, 'u2', 'contacts', 'read')).toBe(false)
  })

  it("applies the person's overrides last: deny removes, allow adds, revoked and expired do nothing", async () => {
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a1', 'u1', 'rs-staff')`)
    run(`INSERT INTO user_permission_override (id, user_id, permission_key, permission_action, override_effect) VALUES ('o1', 'u1', 'contacts', 'update', 'deny')`)
    run(`INSERT INTO user_permission_override (id, user_id, permission_key, permission_action, override_effect) VALUES ('o2', 'u1', 'matters', 'read', 'allow')`)
    run(`INSERT INTO user_permission_override (id, user_id, permission_key, permission_action, override_effect, revoked_at) VALUES ('o3', 'u1', 'contacts', 'read', 'deny', '2026-01-01')`)
    run(`INSERT INTO user_permission_override (id, user_id, permission_key, permission_action, override_effect, expires_at) VALUES ('o4', 'u1', 'tasks', 'read', 'allow', '2000-01-01T00:00:00Z')`)
    const resolved = await resolveEffectivePermissions(queries, 'u1')
    expect([...resolved.grants].sort()).toEqual(['contacts.read', 'matters.read'])
  })

  it('reuses the answer for a minute, until the cache is cleared', async () => {
    expect(await isAuthorized(queries, 'u1', 'contacts', 'read')).toBe(false)
    run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a1', 'u1', 'rs-staff')`)
    expect(await isAuthorized(queries, 'u1', 'contacts', 'read')).toBe(false)
    clearPermissionCache('u1')
    expect(await isAuthorized(queries, 'u1', 'contacts', 'read')).toBe(true)
  })
})
