// file: apps/api/src/platform/toolHealth.ts
/**
 * Reads two fixed routes every outside tool serves on its own origin (the tool kit's rules):
 *  - `GET <origin>/health-check` (`TOOL_HEALTH_PATH`): JSON `{ "status": "ok", "version": "1.2.0" }`, optionally with
 *    `"protocol": 1`; the kit's `healthDocument` writes it. `checkToolHealth` reads it for the registration check
 *    (super admin) and each time a person opens a tool (`features/tools/routes.ts`).
 *  - `GET <origin>/tool-icon.svg` (`TOOL_ICON_PATH`): the tool's own menu icon, a "tool icon" SVG (`checkToolIcon`).
 *    `fetchToolIcon` reads it for the registration check and when a registration is saved; the API stores it.
 * The browser cannot read another site's files, so the API reads them.
 *
 * Kept narrow, because the address was typed by a super admin:
 *  - Only those fixed paths on the tool's own origin; only `https:`. A `localhost` or `127.0.0.1` origin is not read
 *    (`not_checked`; the deployed API cannot reach a developer's computer).
 *  - No redirects, no cookies (a Worker sends none), 5 seconds at most, 4096 bytes at most.
 *  - A good health answer is remembered for 60 seconds per origin in this Worker instance, so opening a tool again
 *    does not call it again at once. A failure is never remembered.
 *
 * `fetcher` is passed in so tests use a stand-in.
 */

import { checkToolIcon, TOOL_HEALTH_PATH, TOOL_ICON_PATH, type ToolHealthData, type ToolHealthResponse } from '@krhomebase/contracts'

/** The bridge protocol version a tool must speak when it says which (the kit's `PROTOCOL_VERSION`). */
const PROTOCOL_VERSION = 1
const TIMEOUT_MS = 5000
const MAX_BYTES = 4096
const REMEMBER_MS = 60_000
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Good health answers, by origin, with the time they stop counting and the version they reported. */
const remembered = new Map<string, { until: number; version: string }>()

/** Forgets remembered answers (tests). */
export function clearToolHealthCache(): void {
  remembered.clear()
}

type Fetcher = (input: Request) => Promise<Response>

/** One read of a fixed route: the status, the type, the text (at most 4096 bytes), or the problem in words. */
type Read = { ok: true; status: number; contentType: string | null; text: string } | { ok: false; status: number | null; problem: string }

/** Reads `url` with the limits above. */
async function readLimited(url: string, accept: string, fetcher: Fetcher | undefined, what: string): Promise<Read> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await (fetcher ?? fetch)(new Request(url, { method: 'GET', redirect: 'manual', headers: { accept }, signal: controller.signal }))
    if (response.status >= 300 && response.status < 400) return { ok: false, status: response.status, problem: `The ${what} redirects (HTTP ${response.status}); it must answer itself.` }
    if (!response.ok) return { ok: false, status: response.status, problem: `The ${what} answered HTTP ${response.status}.` }
    if (Number(response.headers.get('content-length') ?? '0') > MAX_BYTES) return { ok: false, status: response.status, problem: `The ${what} answered more than 4096 bytes.` }
    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return { ok: false, status: response.status, problem: `The ${what} answered more than 4096 bytes.` }
    return { ok: true, status: response.status, contentType: response.headers.get('content-type'), text: new TextDecoder().decode(body) }
  } catch {
    return { ok: false, status: null, problem: controller.signal.aborted ? `The ${what} did not answer within 5 seconds.` : `The ${what} could not be reached.` }
  } finally {
    clearTimeout(timer)
  }
}

/** The address of a fixed route on the origin, or the reason it is not read. */
function placeOf(origin: string, path: string): { ok: true; url: URL } | { ok: false; address: string; state: 'failed' | 'not_checked'; problem: string } {
  let url: URL
  try {
    url = new URL(path, origin)
  } catch {
    return { ok: false, address: String(origin), state: 'failed', problem: 'The tool address is not a full address.' }
  }
  if (LOCAL_HOSTS.has(url.hostname)) return { ok: false, address: url.href, state: 'not_checked', problem: "A local address (localhost) cannot be checked from KR Homebase's server." }
  if (url.protocol !== 'https:') return { ok: false, address: url.href, state: 'failed', problem: 'The tool address must be https.' }
  return { ok: true, url }
}

/**
 * Reads and checks a tool's health route.
 *
 * @param origin - The tool's origin (scheme, host and port), as stored on the registration.
 * @param options - `fetcher` (defaults to `fetch`), `now`, and `detail` (true for the super admin check: the raw
 *   answer is returned in `response`, and the remembered answer is not used).
 * @returns The state, the address read, the problem (null when ok), the version, the time and, with `detail`, the
 *   raw answer. `icon` is always null here (see `fetchToolIcon`).
 */
export async function checkToolHealth(origin: string, options: { fetcher?: Fetcher; now?: number; detail?: boolean } = {}): Promise<ToolHealthData> {
  const now = options.now ?? Date.now()
  const checkedAt = new Date(now).toISOString()
  const base = { checkedAt, response: null, icon: null, version: null }
  const place = placeOf(origin, TOOL_HEALTH_PATH)
  if (!place.ok) return { ...base, state: place.state, address: place.address, problem: place.problem }
  const address = place.url.href

  const known = remembered.get(place.url.origin)
  if (!options.detail && known && known.until > now) return { ...base, state: 'ok', address, problem: null, version: known.version }

  const read = await readLimited(address, 'application/json', options.fetcher, 'health route')
  if (!read.ok) {
    const response: ToolHealthResponse | null = options.detail && read.status !== null ? { status: read.status, contentType: null, body: null } : null
    return { ...base, state: 'failed', address, problem: read.problem, response }
  }
  let document: unknown
  let isJson = true
  try {
    document = JSON.parse(read.text)
  } catch {
    isJson = false
    document = read.text
  }
  const response: ToolHealthResponse | null = options.detail ? { status: read.status, contentType: read.contentType, body: document } : null
  const fail = (problem: string): ToolHealthData => ({ ...base, state: 'failed', address, problem, response })
  if (!isJson) return fail('The health route did not answer with JSON.')
  const value = document as { status?: unknown; version?: unknown; protocol?: unknown } | null
  if (value?.status !== 'ok') return fail('The health route did not say "status": "ok".')
  if (typeof value.version !== 'string' || !value.version.trim() || value.version.length > 40) return fail('The health route gives no version (1 to 40 characters).')
  if (value.protocol !== undefined && value.protocol !== PROTOCOL_VERSION) return fail(`The tool speaks protocol ${String(value.protocol)}; KR Homebase speaks ${PROTOCOL_VERSION}.`)

  remembered.set(place.url.origin, { until: now + REMEMBER_MS, version: value.version })
  return { ...base, state: 'ok', address, problem: null, version: value.version, response }
}

/**
 * Reads a tool's own menu icon (`GET <origin>/tool-icon.svg`) and checks it with the "tool icon" rules.
 *
 * @param origin - The tool's origin.
 * @param options - `fetcher` (defaults to `fetch`).
 * @returns The address read, the icon in its standard form (or null) and why there is none (or null).
 */
export async function fetchToolIcon(origin: string, options: { fetcher?: Fetcher } = {}): Promise<{ address: string; svg: string | null; problem: string | null }> {
  const place = placeOf(origin, TOOL_ICON_PATH)
  if (!place.ok) return { address: place.address, svg: null, problem: place.problem }
  const address = place.url.href
  const read = await readLimited(address, 'image/svg+xml', options.fetcher, 'icon route')
  if (!read.ok) return { address, svg: null, problem: read.problem }
  // A site that answers every address with its own page (a single-page app) sends HTML here, not an icon.
  if (/html/i.test(read.contentType ?? '') || /^\s*<!doctype html/i.test(read.text)) {
    return { address, svg: null, problem: `The icon route answered a web page (${read.contentType ?? 'HTML'}), not an SVG; serve the icon file at /tool-icon.svg.` }
  }
  const icon = checkToolIcon(read.text)
  return icon.ok ? { address, svg: icon.svg, problem: null } : { address, svg: null, problem: `The icon does not pass the tool icon rules: ${icon.problem}` }
}
