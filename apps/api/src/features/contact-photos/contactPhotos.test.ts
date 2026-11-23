// file: apps/api/src/features/contact-photos/contactPhotos.test.ts
/**
 * Contact photos (FB-0019, API patch 58, migration 078) and a person's Related Entities in the contact read (the
 * requester's plans of Nov 23, 2026). An in-memory Schema 8.0 database and an in-memory bucket; made-up rows only.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/contact-photos
 */

import { ContactDetailData, ContactListData, ContactPhotoSavedData, ErrorEnvelope } from '@krhomebase/contracts'
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { memoryBucket } from '../../../test/publishingFixtures.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3])

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  for (const id of ['lk_entity_contact_role_principal', 'lk_entity_contact_role_related_contact']) run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  run(`INSERT INTO individual (id, icid, first_name, last_name, created_at, updated_at) VALUES ('ind-ann', 'IC1', 'Ann', 'Example', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, icid, first_name, last_name, created_at, updated_at) VALUES ('ind-bob', 'IC2', 'Bob', 'Example', ?1, ?1)`, OLD)
  run(`INSERT INTO entity (id, ecid, legal_name, entity_subtype_legacy, entity_subtype, created_at, updated_at) VALUES ('ent-acme', 'EC1', 'Acme Test LLC', 'llc', 'llc', ?1, ?1)`, OLD)
  run(`INSERT INTO entity (id, ecid, legal_name, entity_subtype_legacy, entity_subtype, created_at, updated_at) VALUES ('ent-zed', 'EC2', 'Zed Holdings LLC', 'llc', 'llc', ?1, ?1)`, OLD)
  run(`INSERT INTO client (id, client_number, client_type, entity_id, display_name, status, created_at, updated_at) VALUES ('cl-acme', '077', 'entity', 'ent-acme', 'Acme Test LLC', 'active', ?1, ?1)`, OLD)
  // Ann is Acme's point of contact and a related contact of Zed; a link that ended is not listed.
  run(`INSERT INTO entity_contact (id, entity_id, individual_id, role_lookup_id, is_primary, created_at, updated_at) VALUES ('ec-1', 'ent-acme', 'ind-ann', 'lk_entity_contact_role_principal', 1, ?1, ?1)`, OLD)
  run(`INSERT INTO entity_contact (id, entity_id, individual_id, role_lookup_id, is_primary, created_at, updated_at) VALUES ('ec-2', 'ent-zed', 'ind-ann', 'lk_entity_contact_role_related_contact', 0, ?1, ?1)`, OLD)
  run(`INSERT INTO entity_contact (id, entity_id, individual_id, role_lookup_id, is_primary, end_date, created_at, updated_at) VALUES ('ec-3', 'ent-zed', 'ind-bob', 'lk_entity_contact_role_related_contact', 0, '2026-02-01', ?1, ?1)`, OLD)
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-editor', 'test_editor', 'Editor', 0), ('rs-nothing', 'test_nothing', 'Nothing', 0)`)
  run(`INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_create, can_read, can_update) VALUES ('p1', 'rs-editor', 'contacts', 'Contacts', 'People', 1, 1, 1)`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-editor', NULL, 'editor@example.com', 'x', 'staff')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-bob', 'ind-bob', 'bob@example.com', 'x', 'staff')`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('urs-1', 'user-editor', 'rs-editor'), ('urs-2', 'user-bob', 'rs-nothing')`)
}

let env: { db: D1Database; sqlite: DatabaseSync }
let bucket: ReturnType<typeof memoryBucket>

function useDatabase(options: { withoutContactPhotoMigration?: boolean } = {}) {
  env = createTestD1({ fullSchema: true, ...options })
  seed(env.sqlite)
  bucket = memoryBucket()
  clearSessionCache()
  clearPermissionCache()
}

beforeEach(() => useDatabase())

async function send(method: string, path: string, userId = 'user-editor', init: { json?: unknown; form?: FormData } = {}) {
  clearSessionCache()
  const headers: Record<string, string> = { ...SIGNED_IN_HEADERS }
  let body: BodyInit | undefined
  if (init.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.json)
  } else if (init.form) body = init.form
  return app.request(path, { method, headers, body }, signedInEnv('staff', { krhomebase: env.db, DOCUMENTS: bucket }, userId))
}

function photoForm(bytes: Uint8Array, crop = { cropX: 0.5, cropY: 0.4, cropSize: 0.6 }, type = 'image/png') {
  const form = new FormData()
  form.set('file', new File([bytes.slice().buffer as ArrayBuffer], 'headshot.png', { type }))
  form.set('width', '800')
  form.set('height', '1000')
  for (const [key, value] of Object.entries(crop)) form.set(key, String(value))
  return form
}

const dataOf = async <T,>(res: Response, schema: { parse: (value: unknown) => T }) => schema.parse(((await res.json()) as { data: unknown }).data)
const errorOf = async (res: Response) => ErrorEnvelope.parse(await res.json()).error.code
const rows = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).all(...values) as T[]

describe('contact photos', () => {
  it('uploads a photo with its circle, lists it with the contact and answers its image', async () => {
    const res = await send('PUT', '/v1/contacts/ind-ann/photo', 'user-editor', { form: photoForm(PNG) })
    expect(res.status).toBe(200)
    const saved = await dataOf(res, ContactPhotoSavedData)
    expect(saved.photo).toMatchObject({ width: 800, height: 1000, cropX: 0.5, cropY: 0.4, cropSize: 0.6 })
    const assetId = saved.photo!.assetId
    expect(rows<{ r2_key: string; purpose: string; owner_type: string }>('SELECT r2_key, purpose, owner_type FROM media_asset WHERE id = ?', assetId)[0]).toMatchObject({
      r2_key: `contacts/individual/ind-ann/photo/${assetId}.png`,
      purpose: 'profile_image',
      owner_type: 'individual',
    })
    expect(bucket.objects.has(`contacts/individual/ind-ann/photo/${assetId}.png`)).toBe(true)

    const list = await dataOf(await send('GET', '/v1/contacts'), ContactListData)
    expect(list.contacts.find((contact) => contact.id === 'ind-ann')?.photo?.assetId).toBe(assetId)
    expect(list.contacts.find((contact) => contact.id === 'ind-bob')?.photo).toBeNull()

    const image = await send('GET', `/v1/contacts/ind-ann/photo/${assetId}`)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(image.headers.get('cache-control')).toContain('immutable')
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG)
  })

  it('moves the circle, replaces the photo (the old one kept) and removes it', async () => {
    const first = (await dataOf(await send('PUT', '/v1/contacts/ind-ann/photo', 'user-editor', { form: photoForm(PNG) }), ContactPhotoSavedData)).photo!
    const moved = await dataOf(await send('PATCH', '/v1/contacts/ind-ann/photo', 'user-editor', { json: { cropX: 0.3, cropY: 0.2, cropSize: 0.5 } }), ContactPhotoSavedData)
    expect(moved.photo).toMatchObject({ assetId: first.assetId, cropX: 0.3, cropY: 0.2, cropSize: 0.5 })

    const second = (await dataOf(await send('PUT', '/v1/contacts/ind-ann/photo', 'user-editor', { form: photoForm(JPEG, undefined, 'image/jpeg') }), ContactPhotoSavedData)).photo!
    expect(second.assetId).not.toBe(first.assetId)
    expect(rows<{ is_current: number }>('SELECT is_current FROM contact_photo WHERE contact_id = ? ORDER BY created_at, is_current', 'ind-ann').map((row) => row.is_current).sort()).toEqual([0, 1])
    expect(rows<{ status: string }>('SELECT status FROM media_asset WHERE id = ?', first.assetId)[0]?.status).toBe('replaced')
    // The earlier image still opens (it is kept).
    expect((await send('GET', `/v1/contacts/ind-ann/photo/${first.assetId}`)).status).toBe(200)

    const removed = await dataOf(await send('DELETE', '/v1/contacts/ind-ann/photo'), ContactPhotoSavedData)
    expect(removed.photo).toBeNull()
    expect((await dataOf(await send('GET', '/v1/contacts/ind-ann'), ContactDetailData)).contacts[0]?.photo).toBeNull()
    expect(await errorOf(await send('PATCH', '/v1/contacts/ind-ann/photo', 'user-editor', { json: { cropX: 0.5, cropY: 0.5, cropSize: 1 } }))).toBe('CONTACT_PHOTO_NOT_FOUND')
  })

  it('lets a person change their own photo without contacts.update, and nobody else’s', async () => {
    expect((await send('PUT', '/v1/contacts/ind-bob/photo', 'user-bob', { form: photoForm(PNG) })).status).toBe(200)
    const refused = await send('PUT', '/v1/contacts/ind-ann/photo', 'user-bob', { form: photoForm(PNG) })
    expect(refused.status).toBe(403)
    expect(await errorOf(refused)).toBe('PERMISSION_REQUIRED')
  })

  it('refuses a file that is not an image, an empty file, and an unknown contact', async () => {
    expect(await errorOf(await send('PUT', '/v1/contacts/ind-ann/photo', 'user-editor', { form: photoForm(new TextEncoder().encode('not an image')) }))).toBe('VALIDATION_CONTACT_PHOTO_TYPE_UNSUPPORTED')
    expect(await errorOf(await send('PUT', '/v1/contacts/ind-ann/photo', 'user-editor', { form: photoForm(new Uint8Array()) }))).toBe('VALIDATION_CONTACT_PHOTO_EMPTY')
    expect(await errorOf(await send('PUT', '/v1/contacts/ind-none/photo', 'user-editor', { form: photoForm(PNG) }))).toBe('CONTACT_NOT_FOUND')
    expect(await errorOf(await send('GET', '/v1/contacts/ind-ann/photo/mda_none'))).toBe('CONTACT_PHOTO_NOT_FOUND')
  })

  it('before migration 078: the list still works without photos, and the photo routes answer 503', async () => {
    useDatabase({ withoutContactPhotoMigration: true })
    const list = await dataOf(await send('GET', '/v1/contacts'), ContactListData)
    expect(list.contacts.find((contact) => contact.id === 'ind-ann')?.photo).toBeNull()
    expect(await errorOf(await send('PUT', '/v1/contacts/ind-ann/photo', 'user-editor', { form: photoForm(PNG) }))).toBe('CONTACT_PHOTOS_UNAVAILABLE')
  })
})

describe('Related Entities in the contact read (API patch 58)', () => {
  it('lists a person’s current businesses with the role and client number, in the list and in one contact', async () => {
    const expected = [
      { id: 'ent-acme', displayName: 'Acme Test LLC', ecid: 'EC1', clientNumber: '077', role: 'Point of contact' },
      { id: 'ent-zed', displayName: 'Zed Holdings LLC', ecid: 'EC2', clientNumber: null, role: 'Related contact' },
    ]
    const list = await dataOf(await send('GET', '/v1/contacts'), ContactListData)
    expect(list.contacts.find((contact) => contact.id === 'ind-ann')?.relatedEntities).toEqual(expected)
    expect(list.contacts.find((contact) => contact.id === 'ind-bob')?.relatedEntities).toEqual([]) // his link ended
    expect(list.contacts.find((contact) => contact.id === 'ent-acme')?.relatedEntities).toEqual([])
    const one = await dataOf(await send('GET', '/v1/contacts/ind-ann'), ContactDetailData)
    expect(one.contacts[0]?.relatedEntities).toEqual(expected)
  })

  it('marks the person changed in a delta when a link of theirs changes', async () => {
    env.sqlite.prepare(`UPDATE entity_contact SET updated_at = '2026-11-20T10:00:00.000Z' WHERE id = 'ec-2'`).run()
    const delta = await dataOf(await send('GET', '/v1/contacts?mode=delta&since=2026-11-20T12:00:00.000Z'), ContactListData)
    expect(delta.contacts.map((contact) => contact.id).sort()).toEqual(['ent-zed', 'ind-ann'])
    expect(delta.contacts.find((contact) => contact.id === 'ind-ann')?.relatedEntities?.map((related) => related.id)).toEqual(['ent-acme', 'ent-zed'])
  })
})
