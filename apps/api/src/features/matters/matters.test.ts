// file: apps/api/src/features/matters/matters.test.ts
/**
 * Projects & Matters (plan 10, stage 1) against an in-memory Schema 8.0 with foreign keys on. Made-up records only.
 * Checks: the list (number order, `.0` title, labels, viewer rights, only `matter_party` links), the next number
 * (pure and through the route), create with its party, note and audit row (no `matter_id` on the audit row), the
 * choice check, change (title fixed on `.0`, status and opened date, notes), the delete check (the `.0` rule, real
 * record counts), delete (confirmation, records block it, super admin only, links removed), unknown ids, and roles.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/matters/matters.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ClientMattersData, ErrorEnvelope, MatterDeleteCheckData, MatterDeletedData, MatterSavedData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { chicagoDate, nextMatterNumber } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-admin', 'admin@example.com', 'x', 'super_admin'), ('u-staff', 'staff@example.com', 'x', 'staff')`)
  run(
    `INSERT INTO lookup (id, category, value, label, sort_order) VALUES
      ('lk_matter_status_open', 'matter_status', 'open', 'Open', 1),
      ('lk_matter_status_closed', 'matter_status', 'closed', 'Closed', 2),
      ('lk_practice_area_miscellaneous', 'practice_area', 'miscellaneous', 'Miscellaneous', 2),
      ('lk_practice_area_probate', 'practice_area', 'probate', 'Probate', 1),
      ('lk_party_role_primary_client', 'party_role', 'primary_client', 'Primary Client', 1)`,
  )
  run(`INSERT INTO client (id, client_number, client_type, display_name) VALUES ('cl-55', '055', 'group', 'Example Family'), ('cl-66', '066', 'group', 'Other Family'), ('cl-bad', 'ABC', 'group', 'Legacy')`)
  addMatter('mat-0', '055.0', 'Stored title', 'cl-55')
  addMatter('mat-2', '055.2', 'Second', 'cl-55')
  addMatter('mat-10', '055.10', 'Tenth', 'cl-55')
  addMatter('mat-66', '066.1', 'Other client', 'cl-66')
  // A matter numbered like client 055 but with no party: not listed (decision 5, no number-prefix fallback).
  addMatter('mat-orphan', '055.11', 'Orphan', null)
})

function addMatter(id: string, number: string, title: string, clientId: string | null) {
  run(
    `INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'u-admin', '2026-11-01T00:00:00.000Z')`,
    id,
    number,
    title,
  )
  if (clientId) {
    run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES (?, ?, ?, 'lk_party_role_primary_client', 1)`, `mpa-${id}`, id, clientId)
  }
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, role = 'super_admin') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, role === 'super_admin' ? 'u-admin' : 'u-staff'))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  expect(res.status).toBe(200)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorOf(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error
}

describe('nextMatterNumber', () => {
  it('is one more than the highest positive sequence, starting at 1, ignoring .0 and other clients', () => {
    expect(nextMatterNumber('055', [])).toBe('055.1')
    expect(nextMatterNumber('055', ['055.0'])).toBe('055.1')
    expect(nextMatterNumber('055', ['055.0', '055.2', '055.10', '0551.7', '055.x'])).toBe('055.11')
  })
})

describe('GET /v1/clients/{clientId}/matters', () => {
  it('lists the client matters in number order with the .0 title, labels and choices', async () => {
    const result = await data(await call('GET', '/v1/clients/cl-55/matters'), ClientMattersData)
    expect(result.clientNumber).toBe('055')
    expect(result.matters.map((matter) => matter.matterNumber)).toEqual(['055.0', '055.2', '055.10'])
    expect(result.matters[0]).toMatchObject({ title: 'Client General Matters', isGeneralMatter: true, statusLabel: 'Open', practiceAreaLabel: 'Miscellaneous' })
    expect(result.statuses.map((choice) => choice.id)).toEqual(['lk_matter_status_open', 'lk_matter_status_closed'])
    expect(result.practiceAreas.map((choice) => choice.label)).toEqual(['Probate', 'Miscellaneous'])
    expect(result.viewer).toEqual({ canWrite: true, canDelete: true })
  })

  it('tells a staff member they may write but not delete; billing may only read', async () => {
    expect((await data(await call('GET', '/v1/clients/cl-55/matters', undefined, 'staff'), ClientMattersData)).viewer).toEqual({ canWrite: true, canDelete: false })
    expect((await data(await call('GET', '/v1/clients/cl-55/matters', undefined, 'billing'), ClientMattersData)).viewer).toEqual({ canWrite: false, canDelete: false })
  })

  it('answers 404 for an unknown client and 403 for a client role', async () => {
    expect((await errorOf(await call('GET', '/v1/clients/cl-none/matters'), 404)).code).toBe('MATTER_CLIENT_NOT_FOUND')
    expect((await call('GET', '/v1/clients/cl-55/matters', undefined, 'client')).status).toBe(403)
  })
})

describe('POST /v1/clients/{clientId}/matters', () => {
  it('creates the next number with its primary-client party, Initial Notes and an audit row without matter_id', async () => {
    const saved = await data(await call('POST', '/v1/clients/cl-55/matters', { title: '  Estate plan ', description: 'Wills', initialNotes: 'First call' }, 'staff'), MatterSavedData)
    // 055.11 is taken by the matter with no party, so the next free number is 055.12.
    expect(saved.matter).toMatchObject({ matterNumber: '055.12', title: 'Estate plan', description: 'Wills', statusLookupId: 'lk_matter_status_open', practiceAreaLookupId: 'lk_practice_area_miscellaneous', primaryAttorneyUserId: 'u-staff' })
    expect(saved.matter.openedDate).toBe(chicagoDate(new Date().toISOString()))
    const id = saved.matter.id
    expect(one(`SELECT client_id, is_primary_client, receives_bill FROM matter_party WHERE matter_id = ?`, id)).toEqual({ client_id: 'cl-55', is_primary_client: 1, receives_bill: 1 })
    expect(one(`SELECT activity_type, subject, description, performed_by_user_id FROM matter_activity_log WHERE matter_id = ?`, id)).toEqual({ activity_type: 'note', subject: 'Matter Initial Notes', description: 'First call', performed_by_user_id: 'u-staff' })
    expect(one(`SELECT resource, action, target_id, matter_id, client_id FROM audit_log WHERE target_id = ?`, id)).toEqual({ resource: 'matters', action: 'CREATE', target_id: id, matter_id: null, client_id: 'cl-55' })
  })

  it('takes a status, practice area and opened date, and refuses an unknown choice', async () => {
    const saved = await data(await call('POST', '/v1/clients/cl-66/matters', { title: 'Probate', statusLookupId: 'lk_matter_status_closed', practiceAreaLookupId: 'lk_practice_area_probate', openedDate: '2026-10-01' }), MatterSavedData)
    expect(saved.matter).toMatchObject({ matterNumber: '066.2', statusLabel: 'Closed', practiceAreaLabel: 'Probate', openedDate: '2026-10-01' })
    const refused = await errorOf(await call('POST', '/v1/clients/cl-66/matters', { title: 'X', statusLookupId: 'lk_practice_area_probate' }), 422)
    expect(refused.code).toBe('MATTER_CHOICE_INVALID')
  })

  it('refuses a client with no valid number, an unknown client, a blank title and a read-only role', async () => {
    expect((await errorOf(await call('POST', '/v1/clients/cl-bad/matters', { title: 'X' }), 422)).code).toBe('MATTER_CLIENT_NUMBER_INVALID')
    expect((await errorOf(await call('POST', '/v1/clients/cl-none/matters', { title: 'X' }), 404)).code).toBe('MATTER_CLIENT_NOT_FOUND')
    expect((await errorOf(await call('POST', '/v1/clients/cl-55/matters', { title: '   ' }), 422)).code).toBe('VALIDATION_FAILED')
    expect((await call('POST', '/v1/clients/cl-55/matters', { title: 'X' }, 'billing')).status).toBe(403)
  })
})

describe('PATCH /v1/matters/{matterId}', () => {
  it('changes title, description, status and opened date, and adds Initial Notes', async () => {
    const saved = await data(await call('PATCH', '/v1/matters/mat-2', { title: 'Second, renamed', description: '', statusLookupId: 'lk_matter_status_closed', openedDate: '2026-09-30', initialNotes: 'Note' }), MatterSavedData)
    expect(saved.matter).toMatchObject({ title: 'Second, renamed', description: null, statusLabel: 'Closed', openedDate: '2026-09-30' })
    expect(one(`SELECT COUNT(*) AS n FROM matter_activity_log WHERE matter_id = 'mat-2'`)).toEqual({ n: 1 })
    expect(one(`SELECT action, matter_id FROM audit_log WHERE target_id = 'mat-2'`)).toEqual({ action: 'UPDATE', matter_id: null })
  })

  it('keeps the .0 title and leaves out fields unchanged', async () => {
    run(`UPDATE matter SET opened_date = '2026-01-02', description = 'Kept' WHERE id = 'mat-0'`)
    const saved = await data(await call('PATCH', '/v1/matters/mat-0', { title: 'Renamed' }), MatterSavedData)
    expect(saved.matter).toMatchObject({ title: 'Client General Matters', description: 'Kept', openedDate: '2026-01-02', statusLookupId: 'lk_matter_status_open' })
    expect(one(`SELECT title FROM matter WHERE id = 'mat-0'`)).toEqual({ title: 'Client General Matters' })
  })

  it('answers 404 for an unknown matter and 422 for an unknown status', async () => {
    expect((await errorOf(await call('PATCH', '/v1/matters/mat-none', { title: 'X' }), 404)).code).toBe('MATTER_NOT_FOUND')
    expect((await errorOf(await call('PATCH', '/v1/matters/mat-2', { title: 'X', statusLookupId: 'lk_nothing' }), 422)).code).toBe('MATTER_CHOICE_INVALID')
  })
})

describe('GET /v1/matters/{matterId}/delete-check', () => {
  it('protects the .0 matter', async () => {
    const check = await data(await call('GET', '/v1/matters/mat-0/delete-check'), MatterDeleteCheckData)
    expect(check).toMatchObject({ canDelete: false, protectedGeneralMatter: true, blockingItems: [{ table: 'client_general_matter', count: 1 }] })
  })

  it('counts every record and lets only a super admin delete a matter with none', async () => {
    run(`INSERT INTO matter_activity_log (id, matter_id, subject, performed_by_user_id) VALUES ('mal-1', 'mat-2', 'A', 'u-admin'), ('mal-2', 'mat-2', 'B', 'u-admin')`)
    const blocked = await data(await call('GET', '/v1/matters/mat-2/delete-check'), MatterDeleteCheckData)
    expect(blocked).toMatchObject({ canDelete: false, blockingItems: [{ table: 'matter_activity_log', label: 'Matter activity and notes', count: 2 }] })
    expect(await data(await call('GET', '/v1/matters/mat-10/delete-check'), MatterDeleteCheckData)).toMatchObject({ canDelete: true, requiresSuperAdmin: false, blockingItems: [] })
    expect(await data(await call('GET', '/v1/matters/mat-10/delete-check', undefined, 'staff'), MatterDeleteCheckData)).toMatchObject({ canDelete: false, requiresSuperAdmin: true })
  })
})

describe('DELETE /v1/matters/{matterId}', () => {
  it('deletes a matter with no records and its links after the typed confirmation, with an audit row', async () => {
    run(`INSERT INTO matter_access (id, matter_id, user_id) VALUES ('ma-1', 'mat-10', 'u-staff')`)
    const done = await data(await call('DELETE', '/v1/matters/mat-10', { confirmation: 'Delete Matter 055.10' }), MatterDeletedData)
    expect(done).toEqual({ matterId: 'mat-10', matterNumber: '055.10', deleted: true })
    expect(one(`SELECT COUNT(*) AS n FROM matter WHERE id = 'mat-10'`)).toEqual({ n: 0 })
    expect(one(`SELECT COUNT(*) AS n FROM matter_party WHERE matter_id = 'mat-10'`)).toEqual({ n: 0 })
    expect(one(`SELECT COUNT(*) AS n FROM matter_access WHERE matter_id = 'mat-10'`)).toEqual({ n: 0 })
    expect(one(`SELECT action, resource, matter_id, client_id FROM audit_log WHERE target_id = 'mat-10'`)).toEqual({ action: 'DELETE', resource: 'matters', matter_id: null, client_id: null })
  })

  it('a matter created here (with no notes) can be deleted again', async () => {
    const saved = await data(await call('POST', '/v1/clients/cl-66/matters', { title: 'Mistake' }), MatterSavedData)
    const res = await call('DELETE', `/v1/matters/${saved.matter.id}`, { confirmation: `Delete Matter ${saved.matter.matterNumber}` })
    expect(res.status).toBe(200)
  })

  it('refuses a wrong confirmation, the .0 matter, a matter with records, and anyone but a super admin', async () => {
    expect((await errorOf(await call('DELETE', '/v1/matters/mat-10', { confirmation: 'delete matter 055.10' }), 422)).code).toBe('MATTER_DELETE_CONFIRMATION_MISMATCH')
    expect((await errorOf(await call('DELETE', '/v1/matters/mat-0', { confirmation: 'Delete Matter 055.0' }), 409)).code).toBe('MATTER_GENERAL_PROTECTED')
    run(`INSERT INTO audit_log (id, action, target_table, target_id, matter_id) VALUES ('al-old', 'UPDATE', 'matter', 'mat-2', 'mat-2')`)
    const records = await errorOf(await call('DELETE', '/v1/matters/mat-2', { confirmation: 'Delete Matter 055.2' }), 409)
    expect(records.code).toBe('MATTER_HAS_RECORDS')
    expect(records.details).toEqual({ blockingItems: [{ table: 'audit_log', label: 'Audit records', count: 1 }] })
    expect((await call('DELETE', '/v1/matters/mat-10', { confirmation: 'Delete Matter 055.10' }, 'staff')).status).toBe(403)
    expect(one(`SELECT COUNT(*) AS n FROM matter WHERE id IN ('mat-0', 'mat-2', 'mat-10')`)).toEqual({ n: 3 })
  })
})
