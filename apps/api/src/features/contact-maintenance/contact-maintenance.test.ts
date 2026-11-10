// file: apps/api/src/features/contact-maintenance/contact-maintenance.test.ts
/**
 * Contact maintenance (plan stage 1d-4), against an in-memory copy of the real Schema 8.0. Made-up people only.
 * Checks: super admin only; the duplicate preflight's rules and blockers; merge fills empty fields, closes the
 * duplicate's client and hides it; the confirmation phrases; removal preflight; delete of an unreferenced contact
 * (with its own emails and addresses); inactivate of a referenced one.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/contact-maintenance/contact-maintenance.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ContactRemovalPreflightData, ContactResolutionPreflightData, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  run(`INSERT INTO individual (id, first_name, last_name, dob, notes, created_at, updated_at) VALUES ('ind-dup', 'Ann', 'Example', '1960-02-03', 'From the duplicate', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, notes, created_at, updated_at) VALUES ('ind-keep', 'Ann', 'Example', 'Kept note', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-lone', 'Lone', 'Person', ?1, ?1)`, OLD)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary, created_at) VALUES ('m-lone', 'ind-lone', 'email', 'lone@example.com', 1, ?1)`, OLD)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, short_name, created_at, updated_at) VALUES ('cl-dup', '010', 'individual', 'ind-dup', 'Ann Example', 'active', 'Annie', ?1, ?1)`, OLD)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-keep', '020', 'individual', 'ind-keep', 'Ann Example', 'active', ?1, ?1)`, OLD)
  run(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-admin', 'admin@example.com', 'x', 'super_admin')`)
}

let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  clearSessionCache()
})

async function post(path: string, body: unknown, role = 'super_admin') {
  clearSessionCache()
  return app.request(path, { method: 'POST', headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(body) }, signedInEnv(role, { krhomebase: env.db }, 'user-admin'))
}
const data = async (res: Response) => ((await res.json()) as { data: unknown }).data
const code = async (res: Response) => ErrorEnvelope.parse(await res.json()).error.code
const row = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T

const pair = { sourceKind: 'individual', sourceContactId: 'ind-dup', targetKind: 'individual', targetContactId: 'ind-keep' }

describe('contact maintenance', () => {
  it('is for super admins only', async () => {
    expect((await post('/v1/contact-maintenance/resolution-preflight', pair, 'admin')).status).toBe(403)
  })

  it('preflights a duplicate: both sides, no blockers, merge allowed', async () => {
    const result = ContactResolutionPreflightData.parse(await data(await post('/v1/contact-maintenance/resolution-preflight', pair)))
    expect(result.source).toMatchObject({ contactId: 'ind-dup', clientNumber: '010' })
    expect(result.target).toMatchObject({ contactId: 'ind-keep', clientNumber: '020' })
    expect(result.blockers).toEqual([])
    expect(result.mergeAllowed).toBe(true)
  })

  it('refuses the same contact on both sides, and a duplicate whose target has no client account', async () => {
    expect(await code(await post('/v1/contact-maintenance/resolution-preflight', { ...pair, targetContactId: 'ind-dup' }))).toBe('VALIDATION_SOURCE_AND_TARGET_MUST_DIFFER')
    expect(await code(await post('/v1/contact-maintenance/resolution-preflight', { ...pair, targetContactId: 'ind-lone' }))).toBe('CONTACT_MAINTENANCE_TARGET_CLIENT_REQUIRED')
  })

  it('needs the exact confirmation phrase, then merges in one batch', async () => {
    expect(await code(await post('/v1/contact-maintenance/merge', { ...pair, confirmationPhrase: 'MERGE 10 INTO 20' }))).toBe('VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH')
    const res = await post('/v1/contact-maintenance/merge', { ...pair, confirmationPhrase: 'MERGE 010 INTO 020', reason: 'Duplicate' })
    expect(res.status).toBe(200)
    const keep = row<{ dob: string; notes: string }>("SELECT dob, notes FROM individual WHERE id = 'ind-keep'")
    expect(keep).toMatchObject({ dob: '1960-02-03', notes: 'Kept note' }) // empty filled, filled kept
    expect(row<{ short_name: string }>("SELECT short_name FROM client WHERE id = 'cl-keep'").short_name).toBe('Annie')
    expect(row<{ status: string }>("SELECT status FROM client WHERE id = 'cl-dup'").status).toBe('inactive')
    expect(row<{ operation: string }>("SELECT operation FROM contact_resolution WHERE source_contact_id = 'ind-dup'").operation).toBe('merge')
    expect(row<{ action: string }>("SELECT action FROM audit_log WHERE target_id = 'ind-dup'").action).toBe('contact_merge')
    // A second attempt is refused: already resolved.
    expect(await code(await post('/v1/contact-maintenance/merge', { ...pair, confirmationPhrase: 'MERGE 010 INTO 020' }))).toBe('CONTACT_MAINTENANCE_SOURCE_ALREADY_RESOLVED')
  })

  it('blocks a merge when the duplicate has WorkStream tasks, but allows copy-and-inactivate', async () => {
    env.sqlite.prepare(`INSERT INTO task (id, title, client_id, created_by_user_id) VALUES ('task-1', 'Call', 'cl-dup', 'user-admin')`).run()
    const preflight = ContactResolutionPreflightData.parse(await data(await post('/v1/contact-maintenance/resolution-preflight', pair)))
    expect(preflight.blockers.map((blocker) => blocker.label)).toEqual(['Client tasks'])
    expect(await code(await post('/v1/contact-maintenance/merge', { ...pair, confirmationPhrase: 'MERGE 010 INTO 020' }))).toBe('CONTACT_MAINTENANCE_MERGE_BLOCKED')
    expect((await post('/v1/contact-maintenance/copy-and-inactivate', { ...pair, confirmationPhrase: 'INACTIVATE 010' })).status).toBe(200)
  })

  it('deletes an unreferenced contact with its own email; inactivates a referenced one', async () => {
    const lone = ContactRemovalPreflightData.parse(await data(await post('/v1/contact-maintenance/removal-preflight', { sourceKind: 'individual', sourceContactId: 'ind-lone' })))
    expect(lone).toEqual({ deleteAllowed: true, inactivateAllowed: false, blockers: [] })
    expect(await code(await post('/v1/contact-maintenance/delete', { sourceKind: 'individual', sourceContactId: 'ind-lone', confirmationPhrase: 'DELETE lone' }))).toBe('VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH')
    expect((await post('/v1/contact-maintenance/delete', { sourceKind: 'individual', sourceContactId: 'ind-lone', confirmationPhrase: 'DELETE ind-lone' })).status).toBe(200)
    expect(row("SELECT id FROM individual WHERE id = 'ind-lone'")).toBeUndefined()
    expect(row("SELECT id FROM individual_contact_method WHERE id = 'm-lone'")).toBeUndefined()

    const keep = ContactRemovalPreflightData.parse(await data(await post('/v1/contact-maintenance/removal-preflight', { sourceKind: 'individual', sourceContactId: 'ind-keep' })))
    expect(keep.deleteAllowed).toBe(false)
    expect(keep.blockers.map((blocker) => blocker.code)).toEqual(['client'])
    expect(await code(await post('/v1/contact-maintenance/delete', { sourceKind: 'individual', sourceContactId: 'ind-keep', confirmationPhrase: 'DELETE ind-keep' }))).toBe('CONTACT_MAINTENANCE_DELETE_BLOCKED')
    expect((await post('/v1/contact-maintenance/inactivate', { sourceKind: 'individual', sourceContactId: 'ind-keep', confirmationPhrase: 'INACTIVATE ind-keep' })).status).toBe(200)
    expect(row<{ status: string }>("SELECT status FROM client WHERE id = 'cl-keep'").status).toBe('inactive')
    expect(row<{ operation: string }>("SELECT operation FROM contact_resolution WHERE source_contact_id = 'ind-keep'").operation).toBe('inactivate')
  })
})
