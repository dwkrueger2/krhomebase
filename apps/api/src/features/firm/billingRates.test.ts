// file: apps/api/src/features/firm/billingRates.test.ts
/**
 * Billing rate classes (FB-0008, repository patch 59) against an in-memory Schema 8.0: the six built-in classes
 * before anything is saved; anyone signed in may read, only a super admin may save; a save keeps every person's
 * default; the shared checks refuse a missing built-in class or a repeated name; a person's default is set and
 * cleared through the Users save (`defaultRateClassId`) without touching the classes, and an unknown class is refused;
 * the Users list and the billing record carry the classes and each person's default.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/firm/billingRates.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { BillingRatesData, BUILT_IN_BILLING_RATE_CLASSES, ErrorEnvelope, UserSavedData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string) => env.sqlite.prepare(sql).run()
const stored = () => JSON.parse((env.sqlite.prepare(`SELECT description FROM lookup WHERE id = 'lk_kr_billing_rate_classes'`).get() as { description: string }).description)

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO role_set (id, role_key, label, role_family, is_system, is_assignable, sort_order) VALUES
    ('role_super_admin', 'super_admin', 'Super Admin', 'system', 1, 1, 10), ('role_attorney', 'attorney', 'Attorney', 'operations', 1, 1, 20)`)
  run(`INSERT INTO individual (id, first_name, last_name) VALUES ('i-admin', 'Ada', 'Admin'), ('i-amy', 'Amy', 'Attorney')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role, role_set_id) VALUES
    ('u-admin', 'i-admin', 'admin@example.com', 'x', 'super_admin', 'role_super_admin'), ('u-amy', 'i-amy', 'amy@example.com', 'x', 'attorney', 'role_attorney')`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-a', 'u-admin', 'role_super_admin', 1), ('urs-m', 'u-amy', 'role_attorney', 1)`)
})

async function call(method: 'GET' | 'PUT', path: string, body?: unknown, role = 'super_admin', userId = 'u-admin') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db, KR_APP_BASE_URL: 'https://app.example.com' }, userId))
}
const dataOf = async (res: Response) => ((await res.json()) as { data: unknown }).data

/** Amy's Users save with a default class (the rest of her account as it is). */
const amyWith = (defaultRateClassId: string | null) => ({ accountStatus: 'active', staffCode: null, roleSetIds: ['role_attorney'], primaryRoleSetId: 'role_attorney', defaultRateClassId })

describe('billing rate classes', () => {
  it('shows the six built-in classes until the firm saves its own, to anyone signed in', async () => {
    const res = await call('GET', '/v1/firm/billing-rates', undefined, 'staff')
    expect(res.status).toBe(200)
    const data = BillingRatesData.parse(await dataOf(res))
    expect(data).toMatchObject({ saved: false, canEdit: false })
    expect(data.classes.map((item) => `${item.label} ${item.rate}`)).toEqual(BUILT_IN_BILLING_RATE_CLASSES.map((item) => `${item.label} ${item.rate}`))
  })

  it('saves the classes for a super admin only, keeping each person\'s default', async () => {
    expect((await call('PUT', '/v1/users/u-amy', amyWith('tx_attorney_sr'))).status).toBe(200)
    const classes = [
      ...BUILT_IN_BILLING_RATE_CLASSES.map((item) => (item.id === 'ks_paralegal' ? { ...item, rate: 110, active: false } : item)),
      { id: 'expert_witness', label: 'Expert Witness Rate', rate: 450, active: true, builtIn: false },
    ]
    expect((await call('PUT', '/v1/firm/billing-rates', { classes }, 'staff')).status).toBe(403)
    const res = await call('PUT', '/v1/firm/billing-rates', { classes })
    expect(res.status).toBe(200)
    expect(BillingRatesData.parse(await dataOf(res)).classes.at(-1)).toMatchObject({ id: 'expert_witness', rate: 450 })
    expect(stored().defaults).toEqual({ 'u-amy': 'tx_attorney_sr' })
    expect(stored().classes.find((item: { id: string }) => item.id === 'ks_paralegal')).toMatchObject({ rate: 110, active: false })
    const audit = env.sqlite.prepare(`SELECT resource, target_id FROM audit_log WHERE target_id = 'lk_kr_billing_rate_classes' ORDER BY rowid DESC`).get()
    expect(audit).toEqual({ resource: 'firm_details', target_id: 'lk_kr_billing_rate_classes' })
  })

  it('refuses a missing built-in class or a repeated name with the shared sentences', async () => {
    const missing = await call('PUT', '/v1/firm/billing-rates', { classes: BUILT_IN_BILLING_RATE_CLASSES.slice(1) })
    expect(missing.status).toBe(422)
    const body = ErrorEnvelope.parse(await missing.json())
    expect(body.error.code).toBe('FIRM_SETTINGS_INVALID')
    expect(body.error.message).toContain('KS Attorney Rate Sr is built in and cannot be removed')
    const twice = [...BUILT_IN_BILLING_RATE_CLASSES, { id: 'other', label: 'KS Paralegal Rate', rate: 90, active: true, builtIn: false }]
    expect(ErrorEnvelope.parse(await (await call('PUT', '/v1/firm/billing-rates', { classes: twice })).json()).error.message).toContain('Two classes are named "KS Paralegal Rate"')
  })
})

describe('a person\'s default class (Users save)', () => {
  it('sets, keeps and clears it without touching the classes, and refuses an unknown class', async () => {
    const set = UserSavedData.parse(await dataOf(await call('PUT', '/v1/users/u-amy', amyWith('ks_attorney_jr'))))
    expect(set.users.users.find((user) => user.id === 'u-amy')?.defaultRateClassId).toBe('ks_attorney_jr')
    expect(set.users.rateClasses?.length).toBe(6)
    expect(stored()).toEqual({ schema: 'kr-billing-rates-v1', defaults: { 'u-amy': 'ks_attorney_jr' } })

    // Left out keeps it.
    const { defaultRateClassId: _left, ...withoutDefault } = amyWith(null)
    expect((await call('PUT', '/v1/users/u-amy', withoutDefault)).status).toBe(200)
    expect(stored().defaults).toEqual({ 'u-amy': 'ks_attorney_jr' })

    const unknown = await call('PUT', '/v1/users/u-amy', amyWith('no_such_class'))
    expect(unknown.status).toBe(422)
    expect(ErrorEnvelope.parse(await unknown.json()).error.code).toBe('BILLING_RATE_CLASS_NOT_FOUND')

    expect((await call('PUT', '/v1/users/u-amy', amyWith(null))).status).toBe(200)
    expect(stored().defaults).toEqual({})
    expect(stored().classes).toBeUndefined()
  })
})
