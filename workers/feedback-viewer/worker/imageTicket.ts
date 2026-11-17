// file: workers/feedback-viewer/worker/imageTicket.ts
/**
 * The ticket rule and the image answer of the Feedback Viewer's image Worker (`imageWorker.ts`, the rules described
 * there). Kept in their own file (Nov 16, 2026) because the local Workers runtime (`wrangler dev`, used by
 * `pnpm dev:feedback-viewer:worker`) accepts only handlers as named exports of the Worker's main file: the constants
 * `TICKET_PURPOSE` and `IMAGE_KEY_PATTERN` stopped it starting ("Incorrect type for map entry 'TICKET_PURPOSE'").
 * The deployed Worker was not affected. `imageWorker.test.ts` tests this file and the handler.
 */

/** The R2 calls this script makes (a subset of the Workers `R2Bucket`, so tests can pass a stand-in). */
export interface ImageBucket {
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>
}

/** The static files binding. */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface ViewerEnv {
  ASSETS: AssetsBinding
  FEEDBACK_STORAGE?: ImageBucket
  KR_FEEDBACK_IMAGE_TICKET_SECRET?: string
}

/** The text a ticket signs (KR Homebase contracts, `feedbackImageTicketMessage`). */
export const TICKET_PURPOSE = 'homebase-feedback-image'
/** A feedback image key in the bucket. */
export const IMAGE_KEY_PATTERN = /^feedback\/FB-\d{4,9}\/hfi_[0-9a-f-]{36}\.png$/
/** The latest expiry accepted, in seconds from now. */
const MAX_TICKET_AHEAD_SECONDS = 3600
/** The shortest secret accepted (as the API). */
const MIN_SECRET_LENGTH = 32

const IMAGE_HEADERS: Record<string, string> = {
  'content-type': 'image/png',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
}

/** base64url text to bytes, or null when it is not base64url. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Whether a ticket opens this image now.
 *
 * @param secret - `KR_FEEDBACK_IMAGE_TICKET_SECRET`.
 * @param key - The R2 key asked for.
 * @param ticket - `<expiry>.<signature>`.
 * @param nowSeconds - The time now, Unix seconds.
 * @returns True only for a valid, unexpired ticket for this key.
 */
export async function ticketOpens(secret: string | undefined, key: string, ticket: string, nowSeconds: number): Promise<boolean> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{20,100})$/.exec(ticket)
  if (!match) return false
  const expiresAt = Number(match[1])
  if (!(expiresAt > nowSeconds) || expiresAt > nowSeconds + MAX_TICKET_AHEAD_SECONDS) return false
  const signature = fromBase64Url(match[2]!)
  if (!signature) return false
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', hmac, signature, new TextEncoder().encode(`${TICKET_PURPOSE}|${key}|${expiresAt}`))
}

const refuse = (status: 403 | 404) => new Response(status === 404 ? 'Not found' : 'Forbidden', { status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })

/**
 * Answers `/images/<key>?ticket=...`.
 *
 * @param request - The browser's request.
 * @param env - The bindings.
 * @param nowSeconds - The time now, Unix seconds.
 * @returns The PNG, or a plain refusal.
 */
export async function serveImage(request: Request, env: ViewerEnv, nowSeconds: number): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(404)
  const url = new URL(request.url)
  let key: string
  try {
    key = decodeURIComponent(url.pathname.slice('/images/'.length))
  } catch {
    return refuse(404)
  }
  if (!IMAGE_KEY_PATTERN.test(key)) return refuse(404)
  if (!(await ticketOpens(env.KR_FEEDBACK_IMAGE_TICKET_SECRET, key, url.searchParams.get('ticket') ?? '', nowSeconds))) return refuse(403)
  if (!env.FEEDBACK_STORAGE) return refuse(404)
  const object = await env.FEEDBACK_STORAGE.get(key)
  if (!object) return refuse(404)
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers: { ...IMAGE_HEADERS, 'content-length': String(object.size) } })
}
