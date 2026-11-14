// file: apps/api/src/platform/articleStorage.ts
/**
 * The articles bucket for Front End Publishing (plan 10, stage 6; D23): the only code that calls R2 for articles.
 * The binding is `ARTICLES` in `kr-api-wrangler.jsonc`: `kr-homebase-articles` when deployed,
 * `kr-homebase-articles-dev` under `pnpm dev` (its `preview_bucket_name`).
 *
 * It replaces the old app's HTTP calls to `kr-r2-crud-articles-worker` (bearer token) and the S3 fallback with keys.
 * The old calls did nothing at all when that Worker was not configured (point 5 of the as-is record, section 6.5);
 * here a missing binding makes `articleStorageFor` return null and the routes answer 503 `PUBLISHING_UNAVAILABLE`, and a
 * failed call throws `ArticleStorageError` (503 `PUBLISHING_STORAGE_UNAVAILABLE`).
 *
 * Tests pass a stand-in bucket with the same four methods (`put`, `get`, `head`, `delete`).
 */

/** An R2 call failed (the routes answer 503 `PUBLISHING_STORAGE_UNAVAILABLE`). */
export class ArticleStorageError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`ARTICLE_STORAGE_${operation}_FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ArticleStorageError'
  }
}

/** Runs one R2 call; any failure becomes an `ArticleStorageError`. */
async function attempt<T>(operation: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw new ArticleStorageError(operation, error)
  }
}

/** One stored object, read back as a stream. */
export interface StoredArticleObject {
  body: ReadableStream
  size: number
  contentType: string | null
}

/** The R2 calls Front End Publishing makes. */
export interface ArticleStorage {
  put(key: string, body: Uint8Array | string, contentType: string): Promise<void>
  /** The object as a stream, or null when there is none. */
  get(key: string): Promise<StoredArticleObject | null>
  /** The object's bytes, or null when there is none. */
  getBytes(key: string): Promise<Uint8Array | null>
  /** Whether the object exists. */
  exists(key: string): Promise<boolean>
  /** Removes these objects (R2 takes up to 1,000 keys per call); a missing key is not an error. */
  delete(keys: string[]): Promise<void>
}

/** The R2 bucket methods used (the subset of `R2Bucket`, so a test can pass a stand-in). */
export type ArticleBucket = Pick<R2Bucket, 'put' | 'get' | 'head' | 'delete'>

export function articleStorage(bucket: ArticleBucket): ArticleStorage {
  return {
    put: (key, body, contentType) =>
      attempt('PUT', async () => {
        await bucket.put(key, body, { httpMetadata: { contentType } })
      }),
    get: (key) =>
      attempt('GET', async () => {
        const object = await bucket.get(key)
        return object ? { body: object.body, size: object.size, contentType: object.httpMetadata?.contentType ?? null } : null
      }),
    getBytes: (key) =>
      attempt('GET', async () => {
        const object = await bucket.get(key)
        return object ? new Uint8Array(await object.arrayBuffer()) : null
      }),
    exists: (key) => attempt('HEAD', async () => (await bucket.head(key)) !== null),
    delete: (keys) =>
      attempt('DELETE', async () => {
        for (let at = 0; at < keys.length; at += 1000) await bucket.delete(keys.slice(at, at + 1000))
      }),
  }
}

/** The storage for this request, or null when the `ARTICLES` binding is missing. */
export function articleStorageFor(env: { ARTICLES?: ArticleBucket } | undefined): ArticleStorage | null {
  return env?.ARTICLES ? articleStorage(env.ARTICLES) : null
}
