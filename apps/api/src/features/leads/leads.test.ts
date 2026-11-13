// file: apps/api/src/features/leads/leads.test.ts
/**
 * Leads (plan 10, stage 3) against an in-memory Schema 8.0 with foreign keys on. Made-up people only. Checks: the
 * summary and LCID rules; the list (newest first, current email and phone, converted leads left out, paging, the
 * viewer); create for an existing person, for a new person (with email and phone), the one-lead-per-person and
 * public-inquiry repeats; change (only the fields sent, clearing, the assignee check); conversion (client account
 * with its .0, the lead Won and linked, its Workstream moved; a second conversion refused); permissions and roles.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/leads/leads.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, LeadConvertedData, LeadsData, LeadSavedData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { lcidFor, leadSummary } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  clearPermissionCache()
  run(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-staff', 'Sam', 'Staff', NULL), ('i-ann', 'Ann', 'Lead', NULL), ('i-bo', 'Robert', 'Old', 'Bo'), ('i-cy', 'Cy', 'Plain', NULL)`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('u-staff', 'i-staff', 'sam@example.com', 'x', 'staff'), ('u-billing', NULL, 'bill@example.com', 'x', 'billing')`)
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-editor', 'test_editor', 'Editor', 0)`)
  run(`INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_create, can_read, can_update) VALUES ('p1', 'rs-editor', 'contacts', 'Contacts', 'People', 1, 1, 1)`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('urs-1', 'u-staff', 'rs-editor')`)
  run(`INSERT INTO lookup (id, category, value, label) VALUES ('lk_matter_status_open', 'matter_status', 'open', 'Open'), ('lk_practice_area_miscellaneous', 'practice_area', 'misc', 'Misc'), ('lk_party_role_primary_client', 'party_role', 'pc', 'Primary Client')`)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary, created_at) VALUES
        ('m1', 'i-ann', 'email', 'old@example.com', 0, '2026-01-01'), ('m2', 'i-ann', 'email', 'ann@example.com', 1, '2026-02-01'), ('m3', 'i-ann', 'phone', '(555) 010-0001', 1, '2026-02-01')`)
  run(`INSERT INTO lead (id, lcid, individual_id, source, status, urgency, received_at) VALUES ('lead-ann', 'L007', 'i-ann', 'manual', 'new', 'normal', '2026-11-02T00:00:00Z'), ('lead-bo', 'L008', 'i-bo', 'referral', 'contacted', 'high', '2026-11-03T00:00:00Z')`)
})

async function call(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, role = 'staff', userId = 'u-staff') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, userId))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  expect(res.status).toBe(200)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

describe('lead rules', () => {
  it('puts "Source detail" first once, and pads the LCID to three digits', () => {
    expect(leadSummary('Wants a will', 'Google ad')).toBe('Source detail: Google ad\nWants a will')
    expect(leadSummary('Source detail: Google ad\nWants a will', 'Google ad')).toBe('Source detail: Google ad\nWants a will')
    expect(leadSummary(undefined, undefined)).toBeNull()
    expect([lcidFor(9), lcidFor(1234)]).toEqual(['L009', 'L1234'])
  })
})

describe('GET /v1/leads', () => {
  it('lists newest first with the current primary email and phone, and the viewer', async () => {
    const result = await data(await call('GET', '/v1/leads'), LeadsData)
    expect(result.leads.map((lead) => lead.lcid)).toEqual(['L008', 'L007'])
    expect(result.leads[1]).toMatchObject({ displayName: 'Ann Lead', email: 'ann@example.com', phone: '(555) 010-0001' })
    expect(result.leads[0]).toMatchObject({ displayName: 'Bo', source: 'referral', urgency: 'high' })
    expect(result.viewer).toEqual({ canWrite: true, canCreate: true })
    const paged = await data(await call('GET', '/v1/leads?limit=1'), LeadsData)
    expect(paged.leads).toHaveLength(1)
    const next = await data(await call('GET', `/v1/leads?limit=1&cursor=${paged.nextCursor}`), LeadsData)
    expect(next.leads.map((lead) => lead.lcid)).toEqual(['L007'])
  })

  it('reads one lead by LCID; billing may read but not create', async () => {
    expect((await data(await call('GET', '/v1/leads/L007'), LeadSavedData)).lead.id).toBe('lead-ann')
    expect((await data(await call('GET', '/v1/leads', undefined, 'billing', 'u-billing'), LeadsData)).viewer).toEqual({ canWrite: false, canCreate: false })
    expect((await call('POST', '/v1/leads', { individualId: 'i-cy' }, 'billing', 'u-billing')).status).toBe(403)
  })
})

describe('POST /v1/leads', () => {
  it('creates a lead for an existing person with the next LCID', async () => {
    const saved = await data(await call('POST', '/v1/leads', { individualId: 'i-cy', inquirySummary: 'Probate', sourceDetail: 'Friend', urgency: 'urgent' }), LeadSavedData)
    expect(saved).toMatchObject({ created: true, lead: { lcid: 'L009', individualId: 'i-cy', urgency: 'urgent', summary: 'Source detail: Friend\nProbate', status: 'new', source: 'manual' } })
    expect(one(`SELECT resource, action FROM audit_log WHERE target_id = ?`, saved.lead.id)).toEqual({ resource: 'leads', action: 'CREATE' })
  })

  it('creates a new person with email and phone', async () => {
    const saved = await data(await call('POST', '/v1/leads', { person: { firstName: 'Dee', lastName: 'New', email: 'Dee@Example.com', phone: '5550100002' } }), LeadSavedData)
    expect(saved.lead).toMatchObject({ displayName: 'Dee New', email: 'dee@example.com' })
    expect(saved.lead.icid).toMatch(/^[A-Z0-9]{7}$/)
  })

  it('returns the existing lead for the same person or public inquiry, and checks the source', async () => {
    expect(await data(await call('POST', '/v1/leads', { individualId: 'i-ann' }), LeadSavedData)).toMatchObject({ created: false, lead: { id: 'lead-ann' } })
    expect(await errorCode(await call('POST', '/v1/leads', { individualId: 'i-cy', publicInquiryId: 'pi-1' }), 422)).toBe('LEAD_PUBLIC_INQUIRY_SOURCE')
    const first = await data(await call('POST', '/v1/leads', { individualId: 'i-cy', publicInquiryId: 'pi-1', source: 'public_inquiry' }), LeadSavedData)
    expect(await data(await call('POST', '/v1/leads', { person: { firstName: 'X', lastName: 'Y' }, publicInquiryId: 'pi-1', source: 'public_inquiry' }), LeadSavedData)).toMatchObject({ created: false, lead: { id: first.lead.id } })
    expect(await errorCode(await call('POST', '/v1/leads', { individualId: 'i-none' }), 404)).toBe('LEAD_INDIVIDUAL_NOT_FOUND')
    expect(await errorCode(await call('POST', '/v1/leads', { individualId: 'i-cy', status: 'bogus' }), 422)).toBe('VALIDATION_FAILED')
  })
})

describe('PATCH /v1/leads/{leadId}', () => {
  it('changes only the fields sent, can clear, and checks the assignee', async () => {
    run(`UPDATE lead SET summary = 'Old', practice_area = 'Wills' WHERE id = 'lead-ann'`)
    const saved = await data(await call('PATCH', '/v1/leads/L007', { status: 'qualified', summary: null, assignedToUserId: 'u-staff' }), LeadSavedData)
    expect(saved.lead).toMatchObject({ status: 'qualified', summary: null, practiceArea: 'Wills', urgency: 'normal', assignedToUserId: 'u-staff', assignedToLabel: 'Sam Staff' })
    expect(await errorCode(await call('PATCH', '/v1/leads/L007', { assignedToUserId: 'u-none' }), 422)).toBe('LEAD_ASSIGNEE_NOT_FOUND')
    expect(await errorCode(await call('PATCH', '/v1/leads/L999', { status: 'lost' }), 404)).toBe('LEAD_NOT_FOUND')
  })
})

describe('POST /v1/leads/{leadId}/conversion', () => {
  it('opens the client account with its .0, marks the lead Won, and moves its Workstream entries', async () => {
    run(`INSERT INTO workstream_activity (id, wsid, lead_id, subgroup, subject) VALUES ('wsa-1', 'AB12CD3', 'lead-ann', 'Notes', 'First call'), ('wsa-2', 'EF45GH6', 'lead-ann', 'PhoneCalls', 'Follow up')`)
    const done = await data(await call('POST', '/v1/leads/lead-ann/conversion', { clientNumber: '501' }), LeadConvertedData)
    expect(done).toMatchObject({ clientNumber: '501', generalMatterNumber: '501.0', movedWorkstreamEntries: 2, lead: { status: 'won', convertedClientNumber: '501' } })
    expect(one(`SELECT client_type, individual_id, display_name FROM client WHERE id = ?`, done.clientId)).toEqual({ client_type: 'individual', individual_id: 'i-ann', display_name: 'Ann Lead' })
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity WHERE client_id = ? AND lead_id IS NULL AND matter_id IS NOT NULL`, done.clientId)).toEqual({ n: 2 })
    expect((await data(await call('GET', '/v1/leads'), LeadsData)).leads.map((lead) => lead.lcid)).toEqual(['L008'])
    expect((await data(await call('GET', '/v1/leads?includeConverted=true'), LeadsData)).leads).toHaveLength(2)
    expect(await errorCode(await call('POST', '/v1/leads/lead-ann/conversion', {}), 409)).toBe('LEAD_ALREADY_CONVERTED')
  })

  it('refuses a taken client number and a person without the permission', async () => {
    run(`INSERT INTO client (id, client_number, client_type, display_name) VALUES ('cl-taken', '501', 'group', 'Taken')`)
    expect(await errorCode(await call('POST', '/v1/leads/lead-bo/conversion', { clientNumber: '501' }), 422)).toBe('VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED')
    run(`DELETE FROM user_role_set`)
    clearPermissionCache()
    expect((await call('POST', '/v1/leads/lead-bo/conversion', {})).status).toBe(403)
  })
})
