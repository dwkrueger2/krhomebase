// file: apps/api/src/platform/feedbackImages.ts
/**
 * Homebase Feedback images (plan `docs/12_Homebase_Feedback_Plan.md`, stage F3): the only code that calls R2 for
 * them, and the image tickets.
 *
 * Storage: the private bucket `kr-homebase-feedback`, binding `FEEDBACK_STORAGE` in `kr-api-wrangler.jsonc`
 * (`"remote": true`, one bucket for `pnpm dev` and deployed, because `pnpm dev` already writes the live database; a
 * separate dev bucket would leave live rows pointing at images that are not there). Keys are
 * `feedback/FB-0012/<image id>.png`. A missing binding makes `feedbackStorageFor` return null (503
 * `HOMEBASE_FEEDBACK_STORAGE_UNAVAILABLE`); a failed call throws `FeedbackStorageError` (the same answer).
 *
 * Tickets: the Feedback viewer (an outside tool on its own `workers.dev` site, `workers/feedback-viewer`) is bound to
 * the same bucket and serves the PNGs itself, but it cannot tell who is asking: its site has no KR Homebase session.
 * So the API, which knows the person, adds a ticket to each image it sends: `<expiry>.<signature>`, the signature an
 * HMAC-SHA256 of `feedbackImageTicketMessage(key, expiry)` (contracts) with the secret
 * `KR_FEEDBACK_IMAGE_TICKET_SECRET`, held by the API and the viewer Worker only. A ticket lasts
 * `HOMEBASE_FEEDBACK_IMAGE_TICKET_SECONDS` (10 minutes) and opens one image. Without the secret, images carry no
 * ticket (null) and the viewer says so. WebCrypto only.
 */

import { feedbackImageTicketMessage, HOMEBASE_FEEDBACK_IMAGE_TICKET_SECONDS, type HomebaseFeedbackImageTicket } from '@krhomebase/contracts'

/** An R2 call failed. */
export class FeedbackStorageError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`FEEDBACK_STORAGE_${operation}_FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'FeedbackStorageError'
  }
}

/** The R2 calls Homebase Feedback makes. */
export interface FeedbackStorage {
  put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>
  /** Removes one object; a missing key is not an error. */
  delete(key: string): Promise<void>
}

/** The bucket methods used (a subset of `R2Bucket`, so a test can pass a stand-in). */
export type FeedbackBucket = Pick<R2Bucket, 'put' | 'delete'>

export function feedbackStorage(bucket: FeedbackBucket): FeedbackStorage {
  return {
    async put(key, body, contentType) {
      try {
        await bucket.put(key, body, { httpMetadata: { contentType } })
      } catch (error) {
        throw new FeedbackStorageError('PUT', error)
      }
    },
    async delete(key) {
      try {
        await bucket.delete(key)
      } catch (error) {
        throw new FeedbackStorageError('DELETE', error)
      }
    },
  }
}

/** The storage for this request, or null when the `FEEDBACK_STORAGE` binding is missing. */
export function feedbackStorageFor(env: { FEEDBACK_STORAGE?: FeedbackBucket } | undefined): FeedbackStorage | null {
  return env?.FEEDBACK_STORAGE ? feedbackStorage(env.FEEDBACK_STORAGE) : null
}

/** Bytes as base64url without padding. */
function base64Url(bytes: ArrayBuffer): string {
  let text = ''
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** The signature of one ticket, base64url. */
async function ticketSignature(secret: string, r2Key: string, expiresAt: number): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(feedbackImageTicketMessage(r2Key, expiresAt)))
  return base64Url(signature)
}

/** The shortest secret accepted, in characters; a shorter one is treated as missing. */
export const MIN_TICKET_SECRET_LENGTH = 32

/**
 * Makes the ticket signer for this request, or null when the secret is missing or too short.
 *
 * @param secret - `KR_FEEDBACK_IMAGE_TICKET_SECRET`.
 * @param nowMs - The time now, in milliseconds (tests pass a fixed time).
 * @returns A function giving each image key its ticket.
 */
export function feedbackImageTicketSigner(secret: string | undefined, nowMs: number = Date.now()): ((r2Key: string) => Promise<HomebaseFeedbackImageTicket>) | null {
  if (!secret || secret.length < MIN_TICKET_SECRET_LENGTH) return null
  const expiresAt = Math.floor(nowMs / 1000) + HOMEBASE_FEEDBACK_IMAGE_TICKET_SECONDS
  return async (r2Key) => ({ value: `${expiresAt}.${await ticketSignature(secret, r2Key, expiresAt)}`, expiresAt: new Date(expiresAt * 1000).toISOString() })
}
