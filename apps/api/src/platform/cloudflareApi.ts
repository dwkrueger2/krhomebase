// file: apps/api/src/platform/cloudflareApi.ts
/**
 * Read-only questions to Cloudflare's own API, for the IT Overview (`features/it`; the requester's choice of
 * Nov 18, 2026): when each Worker's live deployment was made, and the facts of a D1 database this API does not bind.
 *
 *   GET /accounts/{account}/workers/scripts/{name}/deployments   the deployments of a Worker, newest first
 *   GET /accounts/{account}/d1/database/{id}                     one D1 database: size, tables, created, region
 *
 * Config:
 *   KR_CF_ACCOUNT_ID    Cloudflare account id (a plain var in kr-api-wrangler.jsonc; the PDF renderer reads it too)
 *   KR_CF_READ_TOKEN    token text (Worker secret; locally in the git-ignored .dev.vars)
 * Token permissions: Account → Workers Scripts → Read, and Account → D1 → Read. Nothing here writes, and the token
 * needs no write permission.
 *
 * It never throws: every question answers `{ ok: true, value }` or `{ ok: false, reason }`, where the reason is a
 * plain sentence the screen shows. The token is never logged or returned. `fetcher` is passed in so tests never
 * reach Cloudflare.
 */

const API_BASE = 'https://api.cloudflare.com/client/v4'
const TIMEOUT_MS = 8000

/** The settings the reader needs. */
export type CloudflareReadEnv = { KR_CF_ACCOUNT_ID?: unknown; KR_CF_READ_TOKEN?: unknown }

export type CloudflareRead<T> = { ok: true; value: T } | { ok: false; reason: string }

/** The live deployment of a Worker, as Cloudflare records it. */
export interface CloudflareWorkerDeployment {
  /** When the deployment was made (ISO time). */
  deployedAt: string | null
  /** Cloudflare's id of the Worker version that serves the most traffic. */
  versionId: string | null
  /** The share of traffic that version serves. */
  percentage: number | null
  /** The deploy message (`workers/message`), when one was given. */
  message: string | null
}

/** One D1 database, as Cloudflare records it. */
export interface CloudflareD1Database {
  name: string | null
  createdAt: string | null
  sizeBytes: number | null
  tableCount: number | null
  region: string | null
  storageVersion: string | null
}

export interface CloudflareReader {
  /** The newest deployment of the Worker named `scriptName`. */
  workerDeployment(scriptName: string): Promise<CloudflareRead<CloudflareWorkerDeployment>>
  /** The database with the Cloudflare id `databaseId`. */
  d1Database(databaseId: string): Promise<CloudflareRead<CloudflareD1Database>>
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** The sentence shown when the reader cannot be built. */
export const CLOUDFLARE_TOKEN_MISSING = 'The Cloudflare read token (KR_CF_READ_TOKEN) is not set on the API.'
export const CLOUDFLARE_ACCOUNT_MISSING = 'The Cloudflare account id (KR_CF_ACCOUNT_ID) is not set on the API.'

/**
 * Builds the reader from the Worker's settings.
 *
 * @param env - The Worker's settings (account id and read token).
 * @param fetcher - `fetch`, or a stand-in in tests.
 * @returns The reader, or null with the sentence saying which setting is missing.
 */
export function cloudflareReaderFor(env: CloudflareReadEnv | undefined, fetcher: typeof fetch = fetch): { reader: CloudflareReader; reason: null } | { reader: null; reason: string } {
  const accountId = textOrNull(env?.KR_CF_ACCOUNT_ID)
  const token = textOrNull(env?.KR_CF_READ_TOKEN)
  if (!accountId) return { reader: null, reason: CLOUDFLARE_ACCOUNT_MISSING }
  if (!token) return { reader: null, reason: CLOUDFLARE_TOKEN_MISSING }

  /** One GET; returns Cloudflare's `result`, or the reason it could not be read. */
  async function read(path: string, what: string): Promise<CloudflareRead<unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetcher(`${API_BASE}/accounts/${encodeURIComponent(accountId as string)}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: `Cloudflare refused the read token (HTTP ${response.status}). Check that KR_CF_READ_TOKEN has Workers Scripts: Read and D1: Read on this account and has not expired.` }
      }
      if (response.status === 404) return { ok: false, reason: `Cloudflare does not know this ${what} (HTTP 404).` }
      if (!response.ok) return { ok: false, reason: `Cloudflare answered HTTP ${response.status} for this ${what}.` }
      const body = (await response.json().catch(() => null)) as { result?: unknown } | null
      if (!body || typeof body !== 'object' || body.result === undefined || body.result === null) return { ok: false, reason: `Cloudflare's answer for this ${what} could not be read.` }
      return { ok: true, value: body.result }
    } catch {
      return { ok: false, reason: controller.signal.aborted ? 'Cloudflare did not answer within 8 seconds.' : 'Cloudflare could not be reached.' }
    } finally {
      clearTimeout(timer)
    }
  }

  const reader: CloudflareReader = {
    async workerDeployment(scriptName) {
      const result = await read(`/workers/scripts/${encodeURIComponent(scriptName)}/deployments`, 'Worker')
      if (!result.ok) return result
      const deployments = (result.value as { deployments?: unknown }).deployments
      const newest = Array.isArray(deployments) ? (deployments[0] as Record<string, unknown> | undefined) : undefined
      if (!newest) return { ok: false, reason: 'Cloudflare lists no deployment for this Worker.' }
      // A gradual deployment can name two versions; the one serving the most traffic is the live one.
      const versions = Array.isArray(newest.versions) ? (newest.versions as { version_id?: unknown; percentage?: unknown }[]) : []
      const live = versions.slice().sort((a, b) => (numberOrNull(b.percentage) ?? 0) - (numberOrNull(a.percentage) ?? 0))[0]
      const annotations = (newest.annotations ?? {}) as Record<string, unknown>
      return {
        ok: true,
        value: {
          deployedAt: textOrNull(newest.created_on),
          versionId: textOrNull(live?.version_id),
          percentage: numberOrNull(live?.percentage),
          message: textOrNull(annotations['workers/message']),
        },
      }
    },

    async d1Database(databaseId) {
      const result = await read(`/d1/database/${encodeURIComponent(databaseId)}`, 'database')
      if (!result.ok) return result
      const row = result.value as Record<string, unknown>
      return {
        ok: true,
        value: {
          name: textOrNull(row.name),
          createdAt: textOrNull(row.created_at),
          sizeBytes: numberOrNull(row.file_size),
          tableCount: numberOrNull(row.num_tables),
          region: textOrNull(row.running_in_region),
          storageVersion: textOrNull(row.version),
        },
      }
    },
  }
  return { reader, reason: null }
}
