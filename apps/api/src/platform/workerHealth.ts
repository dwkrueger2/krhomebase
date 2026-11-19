// file: apps/api/src/platform/workerHealth.ts
/**
 * Reads the version a deployed Worker reports about itself on its health route, for the IT Overview
 * (`features/it`). Two answers are understood:
 *
 *  - The pay Worker's `GET /health` (`workers/d1-workers/kr-pay-worker/payWorkerVersion.ts`): a `meta` object with
 *    `track`, `version`, `patchNum`, `patchDate`, `deploymentId` and `deployedAt`.
 *  - The tool kit's `GET /health-check` (`packages/tool-sdk`, `healthDocument`): `{ "status": "ok", "version": "1.7.0" }`,
 *    a version the tool keeps for itself.
 *
 * Kept narrow: only `https:`, no redirects, 5 seconds at most, 16 KB at most. It never throws: the answer is the
 * reading or a plain sentence saying why there is none. `fetcher` is passed in so tests use a stand-in.
 */

const TIMEOUT_MS = 5000
const MAX_BYTES = 16 * 1024

/** What a Worker says about itself. */
export interface WorkerHealthReading {
  /** `repository`, `api` or `web` when the Worker names its track; `own` for a version it keeps for itself. */
  track: 'repository' | 'api' | 'web' | 'own'
  version: string
  patchNum: string | null
  patchDate: string | null
  /** Cloudflare's id of the version that answered, when the Worker reports it. */
  deploymentId: string | null
  /** When that version was made, when the Worker reports it (ISO time). */
  deployedAt: string | null
}

export type WorkerHealthRead = { ok: true; reading: WorkerHealthReading } | { ok: false; reason: string }

const textOrNull = (value: unknown, max = 80): string | null => (typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null)

/**
 * Reads one health route.
 *
 * @param url - The full address of the health route.
 * @param fetcher - `fetch`, or a stand-in in tests.
 * @returns The version the Worker reports, or why it could not be read.
 */
export async function readWorkerHealth(url: string, fetcher: typeof fetch = fetch): Promise<WorkerHealthRead> {
  let address: URL
  try {
    address = new URL(url)
  } catch {
    return { ok: false, reason: 'The health route is not a full address.' }
  }
  if (address.protocol !== 'https:') return { ok: false, reason: 'The health route must be https.' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let text: string
  try {
    const response = await fetcher(address.href, { method: 'GET', redirect: 'manual', headers: { accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) return { ok: false, reason: `The health route answered HTTP ${response.status}.` }
    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return { ok: false, reason: 'The health route answered more than 16 KB.' }
    text = new TextDecoder().decode(body)
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'The health route did not answer within 5 seconds.' : 'The health route could not be reached.' }
  } finally {
    clearTimeout(timer)
  }

  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'The health route did not answer with JSON.' }
  }
  if (!document || typeof document !== 'object') return { ok: false, reason: 'The health route did not answer with JSON.' }
  const value = document as { meta?: unknown; version?: unknown }

  // The pay Worker's shape: the repository track in `meta`.
  if (value.meta && typeof value.meta === 'object') {
    const meta = value.meta as Record<string, unknown>
    const version = textOrNull(meta.version, 40)
    if (version) {
      const track = meta.track === 'api' || meta.track === 'web' || meta.track === 'repository' ? meta.track : 'repository'
      return { ok: true, reading: { track, version, patchNum: textOrNull(meta.patchNum, 12), patchDate: textOrNull(meta.patchDate, 12), deploymentId: textOrNull(meta.deploymentId), deployedAt: textOrNull(meta.deployedAt) } }
    }
  }
  // The tool kit's shape: a version of the tool's own.
  const version = textOrNull(value.version, 40)
  if (version) return { ok: true, reading: { track: 'own', version, patchNum: null, patchDate: null, deploymentId: null, deployedAt: null } }
  return { ok: false, reason: 'The health route gives no version.' }
}
