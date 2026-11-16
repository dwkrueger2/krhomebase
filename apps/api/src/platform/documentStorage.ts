// file: apps/api/src/platform/documentStorage.ts
/**
 * Firm document storage (Billing part 7c, `docs/API/Billing_Audit.md`): the only code that calls R2 for stored copies
 * of sent invoices, statements and receipts. The rows (`media_asset`, `document_record`) are written by the billing
 * documents area's `queries.ts`; this file holds the bytes and the key rule.
 *
 * Storage: the R2 bucket `krhomebase-media-dev`, binding `DOCUMENTS` in `kr-api-wrangler.jsonc` (the requester, Nov 16,
 * 2026: the old app's documents bucket, so the documents it stored still open). `"remote": true`, one bucket for
 * `pnpm dev` and deployed, because `pnpm dev` already writes the live database (as `FEEDBACK_STORAGE`).
 *
 * Keys follow the old `api/_server/krDocumentStorage.ts`, readable on purpose (client and matter numbers never
 * change), every write under a new version folder so nothing is overwritten:
 *   clients/306/matters/306.0/invoices/3/20260924T2252Z-a1b2c3/INV-0003 (sent) 2026-09-24 [306] ... .pdf
 *   clients/306/statements/<version>/...            (a whole-client statement)
 *   clients/306/matters/306.2/statements/<version>/... (one matter)
 *   clients/306/matters/306.0/payments/<version>/Receipt (sent) ... .pdf
 * Lookups never build a key from request text: number → `document_record` → `media_asset` → key.
 *
 * Changed from the old file: an R2 binding instead of the S3 API with access keys; WebCrypto for the SHA-256 and the
 * random part; the database rows are the caller's (one batch with the audit row), so this file only writes, reads
 * and removes objects. A missing binding makes `documentStorageFor` return null (503 `BILLING_DOCUMENT_STORAGE_UNAVAILABLE`).
 */

/** An R2 call failed. */
export class DocumentStorageError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`DOCUMENT_STORAGE_${operation}_FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'DocumentStorageError'
  }
}

/** One stored object's bytes and type. */
export interface StoredObject {
  body: ArrayBuffer
  contentType: string
}

/** The R2 calls document storage makes. */
export interface DocumentStorage {
  readonly bucketName: string
  put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>
  /** The object, or null when it is not there. */
  get(key: string): Promise<StoredObject | null>
  /** Removes one object; a missing key is not an error. */
  delete(key: string): Promise<void>
}

/** The bucket methods used (a subset of `R2Bucket`, so a test can pass a stand-in). */
export type DocumentBucket = Pick<R2Bucket, 'put' | 'get' | 'delete'>

/** The bucket's name, recorded in `media_asset.r2_bucket` (the binding does not tell its name). */
export const DOCUMENTS_BUCKET_NAME = 'krhomebase-media-dev'

export function documentStorage(bucket: DocumentBucket, bucketName: string = DOCUMENTS_BUCKET_NAME): DocumentStorage {
  return {
    bucketName,
    async put(key, body, contentType) {
      try {
        await bucket.put(key, body, { httpMetadata: { contentType } })
      } catch (error) {
        throw new DocumentStorageError('PUT', error)
      }
    },
    async get(key) {
      try {
        const object = await bucket.get(key)
        if (!object) return null
        return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? 'application/octet-stream' }
      } catch (error) {
        throw new DocumentStorageError('GET', error)
      }
    },
    async delete(key) {
      try {
        await bucket.delete(key)
      } catch (error) {
        throw new DocumentStorageError('DELETE', error)
      }
    },
  }
}

/** The storage for this request, or null when the `DOCUMENTS` binding is missing. */
export function documentStorageFor(env: { DOCUMENTS?: DocumentBucket } | undefined): DocumentStorage | null {
  return env?.DOCUMENTS ? documentStorage(env.DOCUMENTS) : null
}

/** Characters a key segment keeps; others become "_" (the old `sanitizeObjectSegment`). */
export function keySegment(value: string): string {
  const rVal = value.trim().replace(/[^0-9A-Za-z .,_()\[\]$&'-]/g, '_').replace(/\s+/g, ' ').slice(0, 120) || '_'
  return rVal
}

/** Timestamped, collision-free version folder: 20260924T2252Z-a1b2c3 (the old `versionSegment`). */
export function versionSegment(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const random = Array.from(crypto.getRandomValues(new Uint8Array(3)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${stamp}-${random}`
}

/** The key of one file: the readable path, the version folder, the file name. */
export function documentObjectKey(keyPath: readonly string[], version: string, filename: string): string {
  return [...keyPath.map(keySegment), version, keySegment(filename)].join('/')
}

/** SHA-256 of the bytes, hex. */
export async function sha256Hex(body: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', body)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
