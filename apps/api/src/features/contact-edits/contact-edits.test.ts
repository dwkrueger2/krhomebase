// file: apps/api/src/features/contact-edits/contact-edits.test.ts
/**
 * Contact edits (plan stage 1d-3), against an in-memory copy of the real Schema 8.0 with foreign keys on.
 * Made-up people only. Checks: who may create and edit, the one-batch create (with and without a client account and
 * General Matter), the edit card's writes (names, methods, address, related contacts), the optimistic-save conflict,
 * the login-email rules, and the client-account routes (lookup, next number, close, renumber).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/contact-edits/contact-edits.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ClientStatusData, ContactCreateData, ContactUpdateData, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { generatePublicCode, nextClientNumber, normalizeClientNumber, normalizePhone } from './rules.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  for (const id of [
    'lk_relationship_spouse',
    'lk_relationship_related_contact',
    'lk_entity_contact_role_principal',
    'lk_entity_contact_role_registered_agent',
    'lk_entity_contact_role_related_contact',
    'lk_practice_area_miscellaneous',
    'lk_matter_status_open',
    'lk_party_role_primary_client',
  ]) {
    run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  }
  run(`INSERT INTO individual (id, icid, first_name, last_name, created_at, updated_at) VALUES ('ind-ann', 'IC1', 'Ann', 'Example', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, icid, first_name, last_name, created_at, updated_at) VALUES ('ind-bob', 'IC2', 'Bob', 'Example', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, icid, first_name, last_name, created_at, updated_at) VALUES ('ind-cat', 'IC3', 'Cat', 'Other', ?1, ?1)`, OLD)
  run(`INSERT INTO entity (id, ecid, legal_name, entity_subtype_legacy, entity_subtype, created_at, updated_at) VALUES ('ent-acme', 'EC1', 'Acme Test LLC', 'llc', 'llc', ?1, ?1)`, OLD)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary, created_at, updated_at) VALUES ('m1', 'ind-ann', 'email', 'ann@example.com', 1, ?1, ?1)`, OLD)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-ann', '042', 'individual', 'ind-ann', 'Ann Example', 'active', ?1, ?1)`, OLD)
  // Ann and Bob are spouses (a current relationship whose label must survive a save).
  run(`INSERT INTO individual_relationship (id, individual_a_id, individual_b_id, a_to_b_relationship_lookup_id, b_to_a_relationship_lookup_id, created_at, updated_at) VALUES ('rel-1', 'ind-ann', 'ind-bob', 'lk_relationship_spouse', 'lk_relationship_spouse', ?1, ?1)`, OLD)
  // Role sets: "editor" may create, read and update contacts; "nothing" grants nothing.
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-editor', 'test_editor', 'Editor', 0), ('rs-nothing', 'test_nothing', 'Nothing', 0)`)
  run(`INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_create, can_read, can_update) VALUES ('p1', 'rs-editor', 'contacts', 'Contacts', 'People', 1, 1, 1)`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-editor', NULL, 'editor@example.com', 'x', 'staff')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-bob', 'ind-bob', 'bob.login@example.com', 'x', 'client')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-admin', NULL, 'admin@example.com', 'x', 'super_admin')`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('urs-1', 'user-editor', 'rs-editor'), ('urs-2', 'user-bob', 'rs-nothing'), ('urs-3', 'user-admin', 'rs-editor')`)
  run(`INSERT INTO kr_session (id, session_token_hash, user_id, created_at, expires_at) VALUES ('s-bob', 'hash-bob', 'user-bob', ?1, '2099-01-01T00:00:00Z')`, OLD)
}

let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  clearSessionCache()
  clearPermissionCache()
})

async function send(method: string, path: string, userId: string, role: string, body?: unknown) {
  clearSessionCache()
  return app.request(
    path,
    { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    signedInEnv(role, { krhomebase: env.db }, userId),
  )
}
const row = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T
const rows = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).all(...values) as T[]

describe('rules', () => {
  it('formats phones, client numbers and public codes as before', () => {
    expect(normalizePhone('555 010 0000')).toBe('(555) 010-0000')
    expect(normalizePhone('15550100000')).toBe('+1 (555) 010-0000')
    expect(normalizePhone('ext. only')).toBeNull()
    expect(normalizeClientNumber('7')).toBe('007')
    expect(normalizeClientNumber('0')).toBeNull()
    expect(normalizeClientNumber('12a')).toBeNull()
    expect(nextClientNumber(['042', '0099', 'x'])).toBe('100')
    expect(nextClientNumber([])).toBe('001')
    const code = generatePublicCode()
    expect(code).toMatch(/^[A-Z0-9]{7}$/)
    expect(code).toMatch(/[A-Z]/)
    expect(code).toMatch(/\d/)
  })
})

describe('POST /v1/contacts', () => {
  it('refuses a role outside the office and a person without contacts.create', async () => {
    expect((await send('POST', '/v1/contacts', 'user-bob', 'client', { kind: 'individual', firstName: 'A', lastName: 'B' })).status).toBe(403)
    const res = await send('POST', '/v1/contacts', 'user-bob', 'staff', { kind: 'individual', firstName: 'A', lastName: 'B' })
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('PERMISSION_REQUIRED')
  })

  it('requires the last name', async () => {
    const res = await send('POST', '/v1/contacts', 'user-editor', 'staff', { kind: 'individual', firstName: 'Dee' })
    expect(res.status).toBe(422)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('VALIDATION_MISSING_LAST_NAME')
  })

  it('creates a person with email and phone in one batch, with audit rows', async () => {
    const res = await send('POST', '/v1/contacts', 'user-editor', 'staff', { kind: 'individual', firstName: 'Dee', lastName: 'New', email: 'DEE@Example.com', phone: '5550100000' })
    expect(res.status).toBe(201)
    const data = ContactCreateData.parse(((await res.json()) as { data: unknown }).data)
    expect(data).toMatchObject({ kind: 'individual', displayName: 'Dee New', contactMethodCount: 2, clientId: null })
    expect(row<{ icid: string }>('SELECT icid FROM individual WHERE id = ?', data.contactId).icid).toBe(data.recordCode)
    expect(rows<{ value: string }>('SELECT value FROM individual_contact_method WHERE individual_id = ? ORDER BY contact_type', data.contactId).map((r) => r.value)).toEqual([
      'dee@example.com',
      '(555) 010-0000',
    ])
    expect(rows('SELECT id FROM audit_log WHERE request_id IS NOT NULL').length).toBe(3)
  })

  it('creates a client account with the next number, its General Matter and primary client party', async () => {
    const res = await send('POST', '/v1/contacts', 'user-editor', 'staff', { kind: 'entity', legalName: 'Zed Holdings LLC', createClient: true })
    const data = ContactCreateData.parse(((await res.json()) as { data: unknown }).data)
    expect(data).toMatchObject({ clientNumber: '043', generalMatterNumber: '043.0' })
    const matter = row<{ id: string; title: string }>("SELECT id, title FROM matter WHERE matter_number = '043.0'")
    expect(matter.title).toBe('Client General Matters')
    expect(row<{ client_id: string }>('SELECT client_id FROM matter_party WHERE matter_id = ?', matter.id).client_id).toBe(data.clientId)
  })

  it('refuses a client number already in use', async () => {
    const res = await send('POST', '/v1/contacts', 'user-editor', 'staff', { kind: 'individual', firstName: 'Dee', lastName: 'New', createClient: true, clientNumber: '42' })
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED')
    expect(rows("SELECT id FROM individual WHERE first_name = 'Dee'").length).toBe(0) // nothing half-saved
  })
})

describe('PATCH /v1/contacts/{contactId}', () => {
  const annEdit = { kind: 'individual', firstName: 'Ann', lastName: 'Example', email: 'ann.new@example.com', phone: '5550100001', addressLine1: '9 New Rd', city: 'Testville', state: 'tx', postalCode: '75001', relatedContactIds: ['ind-bob', 'ind-cat'] }

  it('refuses a person without contacts.update who does not own the contact', async () => {
    const res = await send('PATCH', '/v1/contacts/ind-ann', 'user-bob', 'client', annEdit)
    expect(res.status).toBe(403)
  })

  it('saves the edit card: methods, address, related contacts, and keeps the spouse label', async () => {
    const res = await send('PATCH', '/v1/contacts/ind-ann', 'user-editor', 'staff', { ...annEdit, expectedUpdatedAt: OLD })
    expect(res.status).toBe(200)
    const data = ContactUpdateData.parse(((await res.json()) as { data: unknown }).data)
    expect(data.contact).toMatchObject({ email: 'ann.new@example.com', phone: '(555) 010-0001', addressLine1: '9 New Rd', state: 'TX' })
    expect(row<{ a_to_b_relationship_lookup_id: string }>("SELECT a_to_b_relationship_lookup_id FROM individual_relationship WHERE id = 'rel-1'").a_to_b_relationship_lookup_id).toBe('lk_relationship_spouse')
    expect(rows("SELECT id FROM individual_relationship WHERE individual_b_id = 'ind-cat' AND valid_to IS NULL").length).toBe(1)
    // Clearing the related list ends both rows.
    await send('PATCH', '/v1/contacts/ind-ann', 'user-editor', 'staff', { ...annEdit, relatedContactIds: [] })
    expect(rows("SELECT id FROM individual_relationship WHERE (individual_a_id = 'ind-ann' OR individual_b_id = 'ind-ann') AND valid_to IS NULL").length).toBe(0)
  })

  it('refuses a stale save with CONTACT_CONFLICT', async () => {
    const res = await send('PATCH', '/v1/contacts/ind-ann', 'user-editor', 'staff', { ...annEdit, expectedUpdatedAt: '2025-01-01T00:00:00.000Z' })
    expect(res.status).toBe(409)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('CONTACT_CONFLICT')
  })

  it('refuses a related person who does not exist, saving nothing', async () => {
    const res = await send('PATCH', '/v1/contacts/ind-ann', 'user-editor', 'staff', { ...annEdit, relatedContactIds: ['ind-missing'] })
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('VALIDATION_RELATIONSHIP_INDIVIDUAL_NOT_FOUND')
    expect(row<{ value: string }>("SELECT value FROM individual_contact_method WHERE id = 'm1'").value).toBe('ann@example.com')
  })

  it('lets a person edit their own contact; changing their login email needs confirmation and ends their sessions', async () => {
    const bobEdit = { kind: 'individual', firstName: 'Bob', lastName: 'Example', email: 'bob.new@example.com' }
    const first = await send('PATCH', '/v1/contacts/ind-bob', 'user-bob', 'client', bobEdit)
    expect(ErrorEnvelope.parse(await first.json()).error.code).toBe('LOGIN_EMAIL_CHANGE_CONFIRMATION_REQUIRED')
    const second = await send('PATCH', '/v1/contacts/ind-bob', 'user-bob', 'client', { ...bobEdit, confirmLoginEmailChange: true })
    expect(second.status).toBe(200)
    expect(ContactUpdateData.parse(((await second.json()) as { data: unknown }).data).requiresLogin).toBe(true)
    expect(row<{ email: string }>("SELECT email FROM user WHERE id = 'user-bob'").email).toBe('bob.new@example.com')
    expect(row<{ revoked_at: string | null }>("SELECT revoked_at FROM kr_session WHERE id = 's-bob'").revoked_at).not.toBeNull()
  })

  it('refuses another person changing a login email unless super admin', async () => {
    const res = await send('PATCH', '/v1/contacts/ind-bob', 'user-editor', 'staff', { kind: 'individual', firstName: 'Bob', lastName: 'Example', email: 'other@example.com' })
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('LOGIN_EMAIL_CHANGE_FORBIDDEN')
    const admin = await send('PATCH', '/v1/contacts/ind-bob', 'user-admin', 'super_admin', { kind: 'individual', firstName: 'Bob', lastName: 'Example', email: 'admin.set@example.com' })
    expect(admin.status).toBe(200)
  })
})

describe('client accounts', () => {
  it('looks a number up, ignoring leading zeros, and suggests the next one', async () => {
    const lookup = await send('GET', '/v1/clients?clientNumber=42', 'user-editor', 'staff')
    expect(((await lookup.json()) as { data: { clients: Array<{ id: string }> } }).data.clients.map((client) => client.id)).toEqual(['cl-ann'])
    const next = await send('GET', '/v1/clients/next-number', 'user-editor', 'staff')
    expect(((await next.json()) as { data: { suggestedClientNumber: string } }).data.suggestedClientNumber).toBe('043')
  })

  it('opens an account for a contact, renumbers it with its General Matter, and closes it', async () => {
    const opened = ClientStatusData.parse(((await (await send('PATCH', '/v1/clients/status', 'user-editor', 'staff', { contactId: 'ind-cat', kind: 'individual', isClient: true, displayName: 'Cat Other' })).json()) as { data: unknown }).data)
    expect(opened).toMatchObject({ clientNumber: '043', status: 'active', generalMatterNumber: '043.0' })
    const renumbered = await send('PATCH', '/v1/clients/status', 'user-editor', 'staff', { contactId: 'ind-cat', kind: 'individual', isClient: true, clientNumber: '50' })
    expect(ClientStatusData.parse(((await renumbered.json()) as { data: unknown }).data).clientNumber).toBe('050')
    expect(rows("SELECT id FROM matter WHERE matter_number = '050.0'").length).toBe(1)
    const taken = await send('PATCH', '/v1/clients/status', 'user-editor', 'staff', { contactId: 'ind-cat', kind: 'individual', isClient: true, clientNumber: '042' })
    expect(ErrorEnvelope.parse(await taken.json()).error.code).toBe('VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED')
    const closed = await send('PATCH', '/v1/clients/status', 'user-editor', 'staff', { contactId: 'ind-cat', kind: 'individual', isClient: false })
    expect(ClientStatusData.parse(((await closed.json()) as { data: unknown }).data).status).toBe('inactive')
  })

  it('refuses an account that belongs to someone else', async () => {
    const res = await send('PATCH', '/v1/clients/status', 'user-editor', 'staff', { contactId: 'ind-cat', kind: 'individual', isClient: false, clientId: 'cl-ann' })
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('VALIDATION_CLIENT_NOT_LINKED')
  })
})

describe('GET /v1/contact-capabilities', () => {
  it('answers from the permissions and the role', async () => {
    const editor = await send('GET', '/v1/contact-capabilities', 'user-editor', 'staff')
    expect(((await editor.json()) as { data: unknown }).data).toEqual({ canCreate: true, canUpdate: true, canMaintain: false })
    const bob = await send('GET', '/v1/contact-capabilities', 'user-bob', 'client')
    expect(((await bob.json()) as { data: unknown }).data).toEqual({ canCreate: false, canUpdate: false, canMaintain: false })
    const admin = await send('GET', '/v1/contact-capabilities', 'user-admin', 'super_admin')
    expect(((await admin.json()) as { data: unknown }).data).toEqual({ canCreate: true, canUpdate: true, canMaintain: true })
  })
})
