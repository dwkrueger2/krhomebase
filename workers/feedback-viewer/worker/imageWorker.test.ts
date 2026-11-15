// file: workers/feedback-viewer/worker/imageWorker.test.ts
// The image script: tickets (the fixed example the KR Homebase API test checks too), refusals, and serving a PNG.
import { describe, expect, it } from 'vitest'
import worker, { serveImage, ticketOpens, type ViewerEnv } from './imageWorker.ts'

const SECRET = 'test-ticket-secret-0123456789abcdef-0123456789'
const KEY = 'feedback/FB-0012/hfi_00000000-0000-4000-8000-000000000000.png'
// HMAC-SHA256 of `homebase-feedback-image|<KEY>|1900000000` with SECRET, base64url. The same example is in
// apps/api/src/features/homebase-feedback/homebaseFeedbackImages.test.ts, so the two ticket rules stay equal.
const EXAMPLE_TICKET = '1900000000.AyYmU_p_d5DpR5fnvyp1W0p3H24m8DVXJdHZwoZqjlc'
const NOW = 1_900_000_000 - 300

function env(objects: Record<string, string> = { [KEY]: 'png-bytes' }, extra: Partial<ViewerEnv> = {}): ViewerEnv {
  return {
    ASSETS: { fetch: async () => new Response('<!doctype html>page', { headers: { 'content-type': 'text/html' } }) },
    FEEDBACK_STORAGE: {
      get: async (key) => (key in objects ? { body: new Blob([objects[key]!]).stream(), size: objects[key]!.length } : null),
    },
    KR_FEEDBACK_IMAGE_TICKET_SECRET: SECRET,
    ...extra,
  }
}
const ask = (path: string, environment = env(), now = NOW) => serveImage(new Request(`https://viewer.example${path}`), environment, now)

describe('ticketOpens', () => {
  it('opens the fixed example, and nothing else', async () => {
    expect(await ticketOpens(SECRET, KEY, EXAMPLE_TICKET, NOW)).toBe(true)
    expect(await ticketOpens(SECRET, KEY.replace('FB-0012', 'FB-0013'), EXAMPLE_TICKET, NOW)).toBe(false)
    expect(await ticketOpens(`${SECRET}x`, KEY, EXAMPLE_TICKET, NOW)).toBe(false)
    expect(await ticketOpens(SECRET, KEY, EXAMPLE_TICKET.replace('1900000000', '1900000001'), NOW)).toBe(false)
    // Expired, or too far ahead.
    expect(await ticketOpens(SECRET, KEY, EXAMPLE_TICKET, 1_900_000_000)).toBe(false)
    expect(await ticketOpens(SECRET, KEY, EXAMPLE_TICKET, 1_900_000_000 - 4000)).toBe(false)
    // No secret, or a short one.
    expect(await ticketOpens(undefined, KEY, EXAMPLE_TICKET, NOW)).toBe(false)
    expect(await ticketOpens('short', KEY, EXAMPLE_TICKET, NOW)).toBe(false)
    expect(await ticketOpens(SECRET, KEY, 'nonsense', NOW)).toBe(false)
  })
})

describe('serveImage', () => {
  it('serves the PNG for a good ticket, never cached', async () => {
    const res = await ask(`/images/${KEY}?ticket=${EXAMPLE_TICKET}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(await res.text()).toBe('png-bytes')
  })

  it('refuses a bad ticket, another key, a missing image and other methods', async () => {
    expect((await ask(`/images/${KEY}`)).status).toBe(403)
    expect((await ask(`/images/${KEY}?ticket=${EXAMPLE_TICKET}`, env(), 1_900_000_100)).status).toBe(403)
    expect((await ask(`/images/feedback/FB-0012/other.png?ticket=${EXAMPLE_TICKET}`)).status).toBe(404)
    expect((await ask(`/images/../secret?ticket=${EXAMPLE_TICKET}`)).status).toBe(404)
    expect((await ask(`/images/${KEY}?ticket=${EXAMPLE_TICKET}`, env({}))).status).toBe(404)
    expect((await ask(`/images/${KEY}?ticket=${EXAMPLE_TICKET}`, env(undefined, { FEEDBACK_STORAGE: undefined }))).status).toBe(404)
    const posted = await serveImage(new Request(`https://viewer.example/images/${KEY}?ticket=${EXAMPLE_TICKET}`, { method: 'POST' }), env(), NOW)
    expect(posted.status).toBe(404)
  })

  it('hands every other address to the static files', async () => {
    const res = await worker.fetch(new Request('https://viewer.example/'), env())
    expect(await res.text()).toBe('<!doctype html>page')
  })
})
