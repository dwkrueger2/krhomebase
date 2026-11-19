// file: apps/web/features/it/itDisplay.ts
/**
 * Display helpers of the IT Overview (Firm Settings → IT Overview; super admin). No React: the screen, the IT Report
 * and the tests read it. Every rule is the API's (`GET /v1/it/overview`); this file only arranges the reply.
 *
 *  - `withWebBuild`: adds what the web app knows about itself (its version track and its own deployment) to the
 *    `krhomebase-web` row. The API cannot know it: the web Worker is the one that draws the page.
 *  - `trackRows`: the three version tracks of `AGENTS_01`, each with who reported it.
 *  - `formatBytes`, `formatCount`, `formatItTime`, `shortId`: how sizes, counts, times and Cloudflare ids are written.
 *  - `tableRowGroups`: the data size tables in rows of three, for the printed report.
 *
 * Times are shown in the firm's time zone (America/Chicago), written as the documents write them
 * (`Nov 18, 2026 7:45pm`).
 */

import { formatItVersion, type ItOverviewData, type ItTableRows, type ItWorker } from '@krhomebase/contracts'

/** What the web app knows about itself: its version track (`apps/web/package.json`) and its deployed version. */
export interface WebBuildInfo {
  version: string
  patchNum: string
  patchDate: string
  /** Cloudflare's id of the web Worker version that drew the page; null on a development computer. */
  deploymentId: string | null
  /** When that version was made (ISO time); null on a development computer. */
  deploymentTime: string | null
}

export const WEB_WORKER_NAME = 'krhomebase-web'
const FIRM_TIME_ZONE = 'America/Chicago'
const DEVELOPMENT_WEB_NOTE = 'Drawn by the web app on this development computer, built from the working folder; the live web app may run another version.'

/**
 * Adds the web app's own version and deployment to its row.
 *
 * @param overview - The API's reply.
 * @param web - What the web app knows about itself.
 * @returns A copy of the reply whose `krhomebase-web` row carries the web track; when the API had no deployment
 *   record from Cloudflare for it, the web app's own version binding fills the deployment.
 */
export function withWebBuild(overview: ItOverviewData, web: WebBuildInfo): ItOverviewData {
  const workers = overview.workers.map((worker): ItWorker => {
    if (worker.name !== WEB_WORKER_NAME) return worker
    const local = !web.deploymentId
    const own = worker.deployment === null && !local
    return {
      ...worker,
      version: { track: 'web', version: web.version, patchNum: web.patchNum, patchDate: web.patchDate },
      versionNote: local ? DEVELOPMENT_WEB_NOTE : null,
      deployment: own ? { deployedAt: web.deploymentTime, versionId: web.deploymentId, percentage: null, message: null, source: 'version-binding' } : worker.deployment,
      deploymentNote: own ? `From the web app's own version binding (the time the version was made). ${worker.deploymentNote ?? ''}`.trim() : worker.deploymentNote,
    }
  })
  return { ...overview, workers }
}

/** One version track as the Software versions section shows it. */
export interface ItTrackRow {
  track: 'Repository' | 'API' | 'Web'
  /** `1.2.0 p64 (11-18)`. */
  version: string
  /** The package file that keeps it. */
  file: string
  /** Who reported it. */
  reportedBy: string
}

/**
 * The three version tracks.
 *
 * @param overview - The API's reply (the repository and API tracks built into the API that answered).
 * @param web - The web track built into the web app that drew the page.
 * @returns Repository, API and Web, in that order.
 */
export function trackRows(overview: ItOverviewData, web: WebBuildInfo): ItTrackRow[] {
  const apiSide = overview.environment === 'development' ? 'the API on this development computer' : 'the live API (krhomebase-api)'
  const webSide = web.deploymentId ? 'the live web app (krhomebase-web)' : 'the web app on this development computer'
  return [
    { track: 'Repository', version: formatItVersion(overview.tracks.repository), file: 'package.json', reportedBy: `Built into ${apiSide}` },
    { track: 'API', version: formatItVersion(overview.tracks.api), file: 'apps/api/package.json', reportedBy: `Built into ${apiSide}` },
    { track: 'Web', version: formatItVersion({ version: web.version, patchNum: web.patchNum, patchDate: web.patchDate }), file: 'apps/web/package.json', reportedBy: `Built into ${webSide}` },
  ]
}

/**
 * Writes a size in bytes in decimal units, as Cloudflare does: `812 bytes`, `45.2 KB`, `11.65 MB`, `1.20 GB`.
 *
 * @param bytes - The size, or null.
 * @returns The text, or an em dash for null.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 1000) return `${Math.round(bytes)} bytes`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}

/** Writes a count with thousands separators (`12,327`), or an em dash for null. */
export function formatCount(count: number | null | undefined): string {
  return count === null || count === undefined || !Number.isFinite(count) ? '—' : Math.round(count).toLocaleString('en-US')
}

/**
 * Writes an ISO time in the firm's time zone: `Nov 18, 2026 7:45pm`.
 *
 * @param iso - The time, or null.
 * @returns The text; an em dash for null; the value itself when it is not a time.
 */
export function formatItTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const time = new Date(iso)
  if (Number.isNaN(time.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(time)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('month')} ${part('day')}, ${part('year')} ${part('hour')}:${part('minute')}${part('dayPeriod').toLowerCase()}`
}

/** The first eight characters of a Cloudflare id, for a narrow column; the whole id goes in the cell's title. */
export function shortId(id: string | null | undefined): string {
  return id ? (id.length > 8 ? `${id.slice(0, 8)}...` : id) : '—'
}

/** A Worker's version as its cell shows it: `1.2.0 p49 (11-18)`, or `Not reported`. */
export function workerVersionText(worker: Pick<ItWorker, 'version'>): string {
  return worker.version ? formatItVersion(worker.version) : 'Not reported'
}

/**
 * The data size tables in rows of `across`, so the printed report lists them side by side.
 *
 * @param tables - The tables, largest first.
 * @param across - Tables on one printed row.
 * @returns Rows that read left to right in the given order; the last row may be short.
 */
export function tableRowGroups(tables: readonly ItTableRows[], across = 3): ItTableRows[][] {
  const rows: ItTableRows[][] = []
  for (let start = 0; start < tables.length; start += across) rows.push(tables.slice(start, start + across))
  return rows
}

/** One storage column of the binding matrix: a database, a key store or a bucket. */
export interface ItMatrixColumn {
  /** The Cloudflare name of the database, key store or bucket. */
  target: string
  /** `D1`, `KV` or `R2`. */
  kind: 'D1' | 'KV' | 'R2'
}

/** The binding matrix: which Worker is bound to which database, key store and bucket. */
export interface ItBindingMatrix {
  columns: ItMatrixColumn[]
  /** One row per Worker; `cells[i]` is the Worker's binding name for `columns[i]`, or null when it has none. */
  rows: { worker: string; cells: (string | null)[] }[]
}

/** A Worker as the matrix reads it: its name and its bindings (a row of the reply, or an entry of the catalog). */
export interface ItMatrixWorker {
  name: string
  bindings: readonly { binding: string; kind: string; target: string }[]
}

const MATRIX_KINDS = { d1: 'D1', kv: 'KV', r2: 'R2' } as const

/**
 * The binding matrix of the Architecture section, from the Workers' bindings.
 *
 * @param workers - The Workers with their bindings (the reply's, or the catalog's).
 * @returns The storage columns in the order D1, KV, R2 (each in first-seen order) and one row per Worker.
 */
export function bindingMatrix(workers: readonly ItMatrixWorker[]): ItBindingMatrix {
  const columns: ItMatrixColumn[] = []
  for (const kind of ['d1', 'kv', 'r2'] as const) {
    for (const worker of workers) {
      for (const binding of worker.bindings) {
        if (binding.kind === kind && !columns.some((column) => column.target === binding.target)) columns.push({ target: binding.target, kind: MATRIX_KINDS[kind] })
      }
    }
  }
  const rows = workers.map((worker) => ({
    worker: worker.name,
    cells: columns.map((column) => worker.bindings.find((binding) => binding.target === column.target && binding.kind !== 'worker')?.binding ?? null),
  }))
  return { columns, rows }
}
