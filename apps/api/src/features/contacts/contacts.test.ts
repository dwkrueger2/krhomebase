// file: apps/api/src/features/contacts/contacts.test.ts
/**
 * Contacts list, delta and one-contact routes, against an in-memory copy of the real Schema 8.0.
 * Made-up people only. Checks: the permission rule, the "own contact" exception, that the list never carries
 * the full SSN or date of birth while one contact does, the old serializer's output (client account, primary
 * email, address, spouse label, point of contact, resolved duplicates hidden), and the delta rules.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/contacts/contacts.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ContactDetailData, ContactListData, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
const OLD = '2026-01-01 00:00:00'

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  // Lookups the relationship and entity-contact rows point at.
  for (const id of ['lk_relationship_spouse', 'lk_entity_contact_role_principal']) {
    run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  }
  // People.
  run(`INSERT INTO individual (id, icid, first_name, last_name, dob, ssn, ssn_last4, created_at, updated_at) VALUES ('ind-ann', 'IC1', 'Ann', 'Example', '1960-02-03', '111-22-3333', '3333', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, icid, first_name, last_name, preferred_name, dob, ssn, ssn_last4, created_at, updated_at) VALUES ('ind-bob', 'IC2', 'Robert', 'Example', 'Bob', '1959-04-05', '444-55-6666', '6666', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-dup', 'Ann', 'Duplicate', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-staff', 'Sam', 'Staff', ?1, ?1)`, OLD)
  run(`INSERT INTO entity (id, ecid, legal_name, entity_subtype_legacy, entity_subtype, created_at, updated_at) VALUES ('ent-acme', 'EC1', 'Acme Test LLC', 'llc', 'llc', ?1, ?1)`, OLD)
  // Contact methods: Ann has a primary and a second email; Bob a phone.
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary, created_at, updated_at) VALUES ('m1', 'ind-ann', 'email', 'ann@example.com', 1, ?1, ?1)`, OLD)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary, created_at, updated_at) VALUES ('m2', 'ind-ann', 'email', 'ann.other@example.com', 0, ?1, ?1)`, OLD)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary, created_at, updated_at) VALUES ('m3', 'ind-bob', 'phone', '555-0100', 1, ?1, ?1)`, OLD)
  // Address for Ann.
  run(`INSERT INTO address (id, street1, city, state, postal_code, created_at, updated_at) VALUES ('addr-1', '1 Test St', 'Testville', 'TX', '75000', ?1, ?1)`, OLD)
  run(`INSERT INTO individual_address (id, individual_id, address_id, is_primary, created_at, updated_at) VALUES ('ia-1', 'ind-ann', 'addr-1', 1, ?1, ?1)`, OLD)
  // Ann is an active client; Bob is her spouse; Bob is Acme's point of contact.
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-ann', '0042', 'individual', 'ind-ann', 'Ann Example', 'active', ?1, ?1)`, OLD)
  run(`INSERT INTO individual_relationship (id, individual_a_id, individual_b_id, a_to_b_relationship_lookup_id, b_to_a_relationship_lookup_id, created_at, updated_at) VALUES ('rel-1', 'ind-ann', 'ind-bob', 'lk_relationship_spouse', 'lk_relationship_spouse', ?1, ?1)`, OLD)
  run(`INSERT INTO entity_contact (id, entity_id, individual_id, role_lookup_id, is_primary, created_at, updated_at) VALUES ('ec-1', 'ent-acme', 'ind-bob', 'lk_entity_contact_role_principal', 1, ?1, ?1)`, OLD)
  // A resolved duplicate is hidden.
  run(`INSERT INTO contact_resolution (id, source_kind, source_contact_id, target_kind, target_contact_id, operation, created_at) VALUES ('res-1', 'individual', 'ind-dup', 'individual', 'ind-ann', 'merge', ?1)`, OLD)
  // Role sets: "reader" grants contacts.read; "nothing" grants nothing.
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-reader', 'test_reader', 'Reader', 0), ('rs-nothing', 'test_nothing', 'Nothing', 0)`)
  run(`INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_read) VALUES ('p1', 'rs-reader', 'contacts', 'Contacts', 'People', 1)`)
  // Users: a reader, a person with no contacts permission whose login is linked to Bob, and Sam (linked to ind-staff).
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-reader', NULL, 'reader@example.com', 'x', 'staff')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-bob', 'ind-bob', 'bob.login@example.com', 'x', 'client')`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('urs-1', 'user-reader', 'rs-reader'), ('urs-2', 'user-bob', 'rs-nothing')`)
}

let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  clearSessionCache()
  clearPermissionCache()
})

async function call(path: string, userId: string) {
  clearSessionCache()
  return app.request(path, { headers: SIGNED_IN_HEADERS }, signedInEnv('staff', { krhomebase: env.db }, userId))
}

describe('GET /v1/contacts (the list)', () => {
  it('refuses a person without contacts.read', async () => {
    const res = await call('/v1/contacts', 'user-bob')
    expect(res.status).toBe(403)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('PERMISSION_REQUIRED')
  })

  it('returns every contact the old way, without the full SSN or date of birth', async () => {
    const res = await call('/v1/contacts', 'user-reader')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('111-22-3333')
    expect(text).not.toContain('1960-02-03')
    const { data } = { data: ContactListData.parse(JSON.parse(text).data) }
    const ids = data.contacts.map((contact) => contact.id).sort()
    expect(ids).toEqual(['ent-acme', 'ind-ann', 'ind-bob', 'ind-staff'])
    const ann = data.contacts.find((contact) => contact.id === 'ind-ann')!
    expect(ann).not.toHaveProperty('ssn')
    expect(ann).not.toHaveProperty('dob')
    expect(ann).toMatchObject({
      displayName: 'Ann Example',
      typeLabel: 'Person',
      ssnLast4: '3333',
      email: 'ann@example.com',
      addressLine1: '1 Test St',
      city: 'Testville',
      isClient: true,
      clientNumber: '0042',
      clientStatus: 'active',
    })
    expect(ann.relatedContacts).toEqual([{ id: 'ind-bob', displayName: 'Bob', icid: 'IC2', relationship: 'Spouse' }])
    const bob = data.contacts.find((contact) => contact.id === 'ind-bob')!
    expect(bob.email).toBe('bob.login@example.com') // the login account's email wins
    expect(bob.linkedUserId).toBe('user-bob')
    const acme = data.contacts.find((contact) => contact.id === 'ent-acme')!
    expect(acme).toMatchObject({ typeLabel: 'LLC', pointOfContactName: 'Bob', isClient: false })
    expect(data.collectionVersion).toMatch(/^[0-9a-f]{64}$/)
    expect(data.allContactIds.sort()).toEqual(ids)
    expect(data.timing.mode).toBe('full')
  })

  it('with mode=delta returns only changed contacts and every current id', async () => {
    env.sqlite.prepare("UPDATE individual_contact_method SET value = 'bob.new@example.com', updated_at = '2026-11-08 12:00:00' WHERE id = 'm3'").run()
    const res = await call('/v1/contacts?mode=delta&since=2026-11-09T00:00:00.000Z', 'user-reader')
    expect(res.status).toBe(200)
    const data = ContactListData.parse(((await res.json()) as { data: unknown }).data)
    // Bob changed. Ann (his spouse) and Acme (he is its point of contact) show his name, but only a change to
    // Bob's own individual row marks them; a phone change does not.
    expect(data.contacts.map((contact) => contact.id)).toEqual(['ind-bob'])
    expect(data.allContactIds.sort()).toEqual(['ent-acme', 'ind-ann', 'ind-bob', 'ind-staff'])
    expect(data.collectionVersion).toBeUndefined()
    expect(data.timing.mode).toBe('delta')
  })

  it('with mode=delta marks the people who show a renamed person', async () => {
    env.sqlite.prepare("UPDATE individual SET preferred_name = 'Rob', updated_at = '2026-11-08 12:00:00' WHERE id = 'ind-bob'").run()
    const res = await call('/v1/contacts?mode=delta&since=2026-11-09T00:00:00.000Z', 'user-reader')
    const data = ContactListData.parse(((await res.json()) as { data: unknown }).data)
    expect(data.contacts.map((contact) => contact.id).sort()).toEqual(['ent-acme', 'ind-ann', 'ind-bob'])
    expect(JSON.stringify(data)).not.toContain('444-55-6666')
  })
})

describe('GET /v1/contacts/{contactId} (one contact)', () => {
  it('returns the full SSN and date of birth to a person with contacts.read', async () => {
    const res = await call('/v1/contacts/ind-ann', 'user-reader')
    expect(res.status).toBe(200)
    const data = ContactDetailData.parse(((await res.json()) as { data: unknown }).data)
    expect(data.contacts).toHaveLength(1)
    expect(data.contacts[0]).toMatchObject({ id: 'ind-ann', ssn: '111-22-3333', dob: '1960-02-03' })
    // The related person carries a name only.
    expect(data.contacts[0]!.relatedContacts[0]).toEqual({ id: 'ind-bob', displayName: 'Bob', icid: 'IC2', relationship: 'Spouse' })
  })

  it('lets a person without contacts.read open their own contact, and nobody else', async () => {
    const own = await call('/v1/contacts/ind-bob', 'user-bob')
    expect(own.status).toBe(200)
    expect(ContactDetailData.parse(((await own.json()) as { data: unknown }).data).contacts[0]).toMatchObject({ id: 'ind-bob', isCurrentUser: true })
    const other = await call('/v1/contacts/ind-ann', 'user-bob')
    expect(other.status).toBe(403)
    expect(ErrorEnvelope.parse(await other.json()).error.code).toBe('PERMISSION_REQUIRED')
  })

  it('answers 404 for an unknown or resolved contact', async () => {
    expect((await call('/v1/contacts/no-such-id', 'user-reader')).status).toBe(404)
    expect((await call('/v1/contacts/ind-dup', 'user-reader')).status).toBe(404)
  })
})
