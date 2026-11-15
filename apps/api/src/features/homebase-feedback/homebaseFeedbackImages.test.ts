// file: apps/api/src/features/homebase-feedback/homebaseFeedbackImages.test.ts
/**
 * Homebase Feedback images (plan 12, stage F3) against an in-memory Schema 8.0 plus migration 033 and an in-memory R2
 * bucket. Made-up people and pages only. Checks: the sender adds a PNG (stored under feedback/FB-0001/<id>.png, the
 * size read from the PNG, the shapes kept with the markers they point at, one audit row without the text); someone
 * else 404, a developer allowed; refusals (no file, not a PNG, bad shapes, the five-image limit, no bucket); the PNG
 * removed again when the row cannot be saved; the viewer tickets (signed with the secret, none without it); and the
 * pure rules (`pngSize`, `nearMarkersFor`).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/homebase-feedback/homebaseFeedbackImages.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, feedbackImageTicketMessage, HomebaseFeedbackSavedData, type HomebaseFeedbackMapEntry } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { feedbackImageTicketSigner, feedbackStorage, type FeedbackBucket } from '../../platform/feedbackImages.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createHomebaseFeedbackQueries } from './queries.ts'
import { addFeedbackImage, nearMarkersFor, pngSize, type FeedbackActor } from './rules.ts'

const app = createApp()
const SECRET = 'test-ticket-secret-0123456789abcdef-0123456789'
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined

/** An R2 bucket in memory, with the calls the API makes. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>()
  return {
    objects,
    async put(key: string, body: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { body: new Uint8Array(body), contentType: options?.httpMetadata?.contentType ?? '' })
      return null as never
    },
    async delete(key: string) {
      objects.delete(key)
    },
  }
}
let bucket: ReturnType<typeof fakeBucket>

/** The first bytes of a PNG of this size: the signature and the IHDR chunk (enough for the API's check). */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

const MAP: HomebaseFeedbackMapEntry[] = [
  { attribute: 'data-kr-id', value: 'ContactsPage', box: { x: 0, y: 0, width: 1, height: 1 } },
  { attribute: 'data-kr-element', value: 'related-contacts-list', box: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } },
  { attribute: 'data-kr-element', value: 'related-contact-row', box: { x: 0.12, y: 0.22, width: 0.36, height: 0.05 } },
  { attribute: 'data-kr-id', value: 'TopTitleBar', box: { x: 0, y: 0, width: 1, height: 0.06 } },
]

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  bucket = fakeBucket()
  clearSessionCache()
  clearPermissionCache()
  run(`INSERT INTO individual (id, first_name, last_name) VALUES ('i-sam', 'Sam', 'Staff'), ('i-dee', 'Dee', 'Developer')`)
  run(
    `INSERT INTO user (id, individual_id, email, password_hash, role, is_active) VALUES
       ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff', 1), ('u-dee', 'i-dee', 'dee@example.com', 'x', 'staff', 1),
       ('u-pat', NULL, 'pat@example.com', 'x', 'paralegal', 1)`,
  )
  run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-dee-dev', 'u-dee', 'role_internal_developer', 0)`)
})

function bindings(extra: Record<string, unknown> = {}) {
  return { krhomebase: env.db, FEEDBACK_STORAGE: bucket, KR_FEEDBACK_IMAGE_TICKET_SECRET: SECRET, ...extra }
}

async function send(userId = 'u-sam', role = 'staff') {
  clearSessionCache()
  const res = await app.request(
    '/v1/homebase-feedback',
    { method: 'POST', headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'issue', title: 'Rows too tall', body: 'See data-kr-element="related-contacts-list".' }) },
    signedInEnv(role, bindings(), userId),
  )
  expect(res.status).toBe(200)
}

function form(file: Blob | null, shapes: unknown = [], markerMap: unknown = MAP) {
  const data = new FormData()
  if (file) data.set('file', file, 'shot.png')
  data.set('shapes', typeof shapes === 'string' ? shapes : JSON.stringify(shapes))
  data.set('markerMap', JSON.stringify(markerMap))
  return data
}

async function upload(body: FormData, userId = 'u-sam', role = 'staff', extra: Record<string, unknown> = {}, number = 'FB-0001') {
  clearSessionCache()
  return app.request(`/v1/homebase-feedback/${number}/images`, { method: 'POST', headers: { ...SIGNED_IN_HEADERS }, body }, signedInEnv(role, bindings(extra), userId))
}

async function codeOf(res: Response, status: number) {
  expect(res.status, await res.clone().text()).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

/** The ticket signature the viewer Worker would compute. */
async function expectedSignature(key: string, expiresAt: number) {
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(feedbackImageTicketMessage(key, expiresAt))))
  return Buffer.from(bytes).toString('base64url')
}

describe('POST /v1/homebase-feedback/{number}/images', () => {
  it('stores the sender PNG, keeps the shapes with their markers, and gives a signed ticket', async () => {
    await send()
    const shapes = [
      { type: 'rectangle', x: 0.08, y: 0.18, width: 0.45, height: 0.35 },
      { type: 'arrow', x1: 0.8, y1: 0.8, x2: 0.2, y2: 0.24 },
      { type: 'text', x: 0.3, y: 0.03, text: 'Title too long' },
      { type: 'redact', x: 0.6, y: 0.6, width: 0.1, height: 0.1 },
    ]
    const res = await upload(form(new Blob([png(1280, 720)], { type: 'image/png' }), shapes))
    expect(res.status, await res.clone().text()).toBe(200)
    const { feedback } = HomebaseFeedbackSavedData.parse(((await res.json()) as { data: unknown }).data)
    const image = feedback.images[0]!
    expect(image).toMatchObject({ contentType: 'image/png', width: 1280, height: 720, byteSize: 33, markerMapCount: 4 })
    expect(image.r2Key).toMatch(/^feedback\/FB-0001\/hfi_[0-9a-f-]{36}\.png$/)
    expect(bucket.objects.get(image.r2Key)?.contentType).toBe('image/png')
    expect(image.shapes.map((shape) => [shape.type, shape.nearMarkers])).toEqual([
      ['rectangle', ['data-kr-element="related-contacts-list"', 'data-kr-element="related-contact-row"']],
      ['arrow', ['data-kr-element="related-contact-row"', 'data-kr-element="related-contacts-list"', 'data-kr-id="ContactsPage"']],
      ['text', ['data-kr-id="TopTitleBar"', 'data-kr-id="ContactsPage"']],
      ['redact', ['data-kr-id="ContactsPage"']],
    ])
    expect(image.shapes[2]).toMatchObject({ text: 'Title too long', x: 0.3, y: 0.03, x1: null, width: null })

    const [expiry, signature] = image.ticket!.value.split('.')
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000 + 500)
    expect(signature).toBe(await expectedSignature(image.r2Key, Number(expiry)))

    const audit = one(`SELECT action, new_json FROM audit_log WHERE resource = 'homebase-feedback' AND action = 'IMAGE'`)
    expect(audit?.action).toBe('IMAGE')
    expect(String(audit?.new_json)).not.toContain('Rows too tall')
    expect(JSON.parse(String(audit?.new_json))).toMatchObject({ number: 'FB-0001', shapes: 4, redactions: 1, markerMap: 4 })

    // Read again: the same image, with a ticket.
    clearSessionCache()
    const again = await app.request('/v1/homebase-feedback/FB-0001', { headers: SIGNED_IN_HEADERS }, signedInEnv('staff', bindings(), 'u-sam'))
    const read = HomebaseFeedbackSavedData.parse(((await again.json()) as { data: unknown }).data)
    expect(read.feedback.images.map((entry) => entry.id)).toEqual([image.id])
    expect(read.feedback.images[0]!.ticket).not.toBeNull()
  })

  it('lets a developer add one, refuses anyone else, and gives no ticket without the secret', async () => {
    await send()
    expect(await codeOf(await upload(form(new Blob([png(10, 10)])), 'u-pat', 'paralegal'), 404)).toBe('HOMEBASE_FEEDBACK_NOT_FOUND')
    const res = await upload(form(new Blob([png(10, 10)])), 'u-dee', 'staff', { KR_FEEDBACK_IMAGE_TICKET_SECRET: undefined })
    expect(res.status).toBe(200)
    expect(HomebaseFeedbackSavedData.parse(((await res.json()) as { data: unknown }).data).feedback.images[0]!.ticket).toBeNull()
  })

  it('refuses a missing file, a file that is not a PNG, bad shapes, a sixth image and a missing bucket', async () => {
    await send()
    // No file at all fails the form check; a text in its place reaches the rule.
    expect(await codeOf(await upload(form(null)), 422)).toBe('VALIDATION_FAILED')
    const textInstead = form(null)
    textInstead.set('file', 'not a file')
    expect(await codeOf(await upload(textInstead), 422)).toBe('HOMEBASE_FEEDBACK_IMAGE_REQUIRED')
    expect(await codeOf(await upload(form(new Blob(['GIF89a not a png']))), 422)).toBe('HOMEBASE_FEEDBACK_IMAGE_NOT_PNG')
    expect(await codeOf(await upload(form(new Blob([png(10, 10)]), '{not json')), 422)).toBe('HOMEBASE_FEEDBACK_IMAGE_DATA_INVALID')
    expect(await codeOf(await upload(form(new Blob([png(10, 10)]), [{ type: 'rectangle', x: 2, y: 0, width: 1, height: 1 }])), 422)).toBe('HOMEBASE_FEEDBACK_IMAGE_DATA_INVALID')
    expect(bucket.objects.size).toBe(0)
    for (let index = 0; index < 5; index += 1) expect((await upload(form(new Blob([png(10, 10)])))).status).toBe(200)
    expect(await codeOf(await upload(form(new Blob([png(10, 10)]))), 409)).toBe('HOMEBASE_FEEDBACK_IMAGE_LIMIT')
    expect(bucket.objects.size).toBe(5)
    expect(await codeOf(await upload(form(new Blob([png(10, 10)])), 'u-sam', 'staff', { FEEDBACK_STORAGE: undefined }), 503)).toBe('HOMEBASE_FEEDBACK_STORAGE_UNAVAILABLE')
  })

  it('removes the PNG again when the row cannot be saved', async () => {
    await send()
    const queries = { ...createHomebaseFeedbackQueries(env.db), insertImage: async () => Promise.reject(new Error('disk full')) }
    const actor: FeedbackActor = { userId: 'u-sam', email: 'sam@example.com', role: 'staff', requestId: 'req-test', isDeveloper: false, canTriage: false }
    await expect(addFeedbackImage(queries, feedbackStorage(bucket as unknown as FeedbackBucket), actor, 'FB-0001', { file: new Blob([png(10, 10)]), shapes: '[]', markerMap: '[]' }, new Date().toISOString())).rejects.toThrow('disk full')
    expect(bucket.objects.size).toBe(0)
  })
})

describe('image rules', () => {
  it('signs the fixed example ticket the Feedback viewer Worker checks (workers/feedback-viewer/worker/imageWorker.test.ts)', async () => {
    const sign = feedbackImageTicketSigner(SECRET, (1_900_000_000 - 600) * 1000)!
    expect(await sign('feedback/FB-0012/hfi_00000000-0000-4000-8000-000000000000.png')).toEqual({
      value: '1900000000.AyYmU_p_d5DpR5fnvyp1W0p3H24m8DVXJdHZwoZqjlc',
      expiresAt: new Date(1_900_000_000 * 1000).toISOString(),
    })
    expect(feedbackImageTicketSigner('too-short')).toBeNull()
  })

  it('reads the size from a PNG and refuses other files', () => {
    expect(pngSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 })
    expect(pngSize(new TextEncoder().encode('not a png at all, really not'))).toBeNull()
    expect(pngSize(png(0, 10))).toBeNull()
  })

  it('names what a rectangle is around, and what a point is on', () => {
    expect(nearMarkersFor({ type: 'rectangle', x: 0.11, y: 0.21, width: 0.38, height: 0.07 }, MAP)).toEqual(['data-kr-element="related-contact-row"'])
    // Nothing mostly inside: what is under its middle.
    expect(nearMarkersFor({ type: 'redact', x: 0.2, y: 0.3, width: 0.01, height: 0.01 }, MAP)).toEqual(['data-kr-element="related-contacts-list"', 'data-kr-id="ContactsPage"'])
    expect(nearMarkersFor({ type: 'text', x: 0.5, y: 0.02, text: 'x' }, MAP)).toEqual(['data-kr-id="TopTitleBar"', 'data-kr-id="ContactsPage"'])
    expect(nearMarkersFor({ type: 'arrow', x1: 0, y1: 0, x2: 0.9, y2: 0.9 }, [])).toEqual([])
  })
})
