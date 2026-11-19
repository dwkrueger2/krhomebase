// file: apps/api/src/features/it/rules.ts
/**
 * The IT Overview's rules (Settings → Firm IT → IT Overview; super admin only; the requester, Nov 18, 2026): how the
 * reply of `GET /v1/it/overview` is put together from its sources. Nothing here writes.
 *
 * Sources, each handed in by `routes.ts` (so tests pass stand-ins):
 *  - the catalog in `@krhomebase/contracts` (`IT_WORKERS`, `IT_DATABASES`, `IT_BUCKETS`): what is deployed;
 *  - the version tracks built into this API (`platform/buildVersion.ts`) and its own version binding;
 *  - the health routes of the Workers that report a version (`platform/workerHealth.ts`);
 *  - Cloudflare's API, when the read token is set (`platform/cloudflareApi.ts`): when each Worker's live deployment
 *    was made, and the facts of the databases;
 *  - the firm database through `queries.ts`: the migration log, the table list and the row counts;
 *  - the four buckets through their bindings (`platform/bucketUsage.ts`).
 *
 * Two rules decide the shape:
 *  1. **The version shown is the repository's own** (the requester): a version track as the Worker itself reports
 *     it. Cloudflare supplies only when the deployment was made and its own deployment id. A Worker that reports no
 *     version says so; nothing is guessed from the working folder or from Cloudflare's id.
 *  2. **A source that fails never fails the reply.** Its part carries nulls and a plain sentence saying why. The
 *     route therefore has no error code of its own.
 *
 * On a development computer (`pnpm dev`) the API that answers is the local one: its own row says so, because its
 * version is the working folder's, not the live Worker's. The database, the buckets and Cloudflare's answers are the
 * live ones either way.
 */

import {
  IT_BUCKETS,
  IT_DATABASES,
  IT_WORKERS,
  itBoundBy,
  type ItBucket,
  type ItCatalogWorker,
  type ItDataSize,
  type ItDatabase,
  type ItDeployment,
  type ItMigration,
  type ItOverviewData,
  type ItWorker,
  type ItWorkerVersion,
} from '@krhomebase/contracts'
import { BUCKET_USAGE_MAX_PAGES, measureBucket, type BucketLister } from '../../platform/bucketUsage.ts'
import type { BuildTrack } from '../../platform/buildVersion.ts'
import type { CloudflareD1Database, CloudflareRead, CloudflareReader, CloudflareWorkerDeployment } from '../../platform/cloudflareApi.ts'
import type { WorkerHealthRead } from '../../platform/workerHealth.ts'
import type { ItQueries, MigrationLogRow } from './queries.ts'

/** The API's own deployed version, from its version binding (`CF_VERSION_METADATA`). */
export interface SelfDeployment {
  /** Cloudflare's id of the Worker version that is answering. */
  id: string | null
  /** When that version was made (ISO time). */
  time: string | null
}

/** Everything the overview is built from. */
export interface ItSources {
  /** The time of the reply. */
  now: Date
  /** True on a development computer (`isDevelopmentServer`). */
  development: boolean
  /** The repository and API tracks built into this API. */
  tracks: { repository: BuildTrack; api: BuildTrack }
  /** This API's own version binding; null when it is not bound or the API runs on a development computer. */
  selfDeployment: SelfDeployment | null
  /** The firm database; null when the API has no database binding. */
  queries: ItQueries | null
  /** Cloudflare's API; null when the read token or the account id is not set. */
  cloudflare: CloudflareReader | null
  /** Why `cloudflare` is null. */
  cloudflareReason: string | null
  /** Reads one Worker's health route. */
  readHealth(url: string): Promise<WorkerHealthRead>
  /** The API's bucket bindings, by binding name. */
  buckets: Record<string, BucketLister | undefined>
  /** Writes one diagnostic line (`logLine` with the request id). */
  log(tag: string, meta?: Record<string, string | number | boolean | null | undefined>): void
}

const DEVELOPMENT_API_NOTE = 'Answered by the API on this development computer, built from the working folder; the live API may run another version.'
const WEB_VERSION_NOTE = 'The web app reports its own version; the screen adds it.'
const PER_TABLE_BYTES_NOTE = 'The size of each table in bytes is not available: D1 refuses PRAGMA page_count and has no dbstat table. Row counts are the measure for each table.'
const OTHER_DATABASES_NOTE = 'Row counts are read for krhomebase only: this API does not bind the public inquiry database or the GPT usage database.'

/**
 * One Worker's row.
 *
 * @param worker - The Worker's catalog entry.
 * @param sources - The API's own tracks and version binding, and whether this is a development computer.
 * @param health - What the Worker's health route answered (only for a Worker whose version comes from one).
 * @param cloudflare - Cloudflare's answer about the Worker's live deployment, or null when Cloudflare was not asked.
 * @param cloudflareReason - Why Cloudflare was not asked.
 * @returns The row: the repository version the Worker reports (or why there is none) and its deployment facts,
 *   Cloudflare's first, else the Worker's own.
 */
export function workerRow(
  worker: ItCatalogWorker,
  sources: Pick<ItSources, 'tracks' | 'selfDeployment' | 'development'>,
  health: WorkerHealthRead | null,
  cloudflare: CloudflareRead<CloudflareWorkerDeployment> | null,
  cloudflareReason: string | null,
): ItWorker {
  let version: ItWorkerVersion | null = null
  let versionNote: string | null = null
  if (worker.versionSource === 'api') {
    version = { track: 'api', ...sources.tracks.api }
    versionNote = sources.development ? DEVELOPMENT_API_NOTE : null
  } else if (worker.versionSource === 'web') {
    versionNote = WEB_VERSION_NOTE
  } else if (worker.versionSource === 'health-route') {
    if (health?.ok) version = { track: health.reading.track, version: health.reading.version, patchNum: health.reading.patchNum, patchDate: health.reading.patchDate }
    else versionNote = `The version could not be read from the Worker's health route. ${health ? health.reason : 'It was not asked.'}`
  } else {
    versionNote = worker.versionNote
  }

  // Deployment facts: Cloudflare's record first; else what the Worker says about itself.
  let deployment: ItDeployment | null = null
  let deploymentNote: string | null = null
  const cloudflareProblem = cloudflare ? (cloudflare.ok ? null : cloudflare.reason) : cloudflareReason
  if (cloudflare?.ok) {
    deployment = { ...cloudflare.value, source: 'cloudflare-api' }
  } else if (worker.versionSource === 'api' && sources.selfDeployment && (sources.selfDeployment.id || sources.selfDeployment.time)) {
    deployment = { deployedAt: sources.selfDeployment.time, versionId: sources.selfDeployment.id, percentage: null, message: null, source: 'version-binding' }
    deploymentNote = `From the API's own version binding (the time the version was made). ${cloudflareProblem ?? ''}`.trim()
  } else if (health?.ok && (health.reading.deployedAt || health.reading.deploymentId)) {
    deployment = { deployedAt: health.reading.deployedAt, versionId: health.reading.deploymentId, percentage: null, message: null, source: 'health-route' }
    deploymentNote = `From the Worker's health route (the time the version was made). ${cloudflareProblem ?? ''}`.trim()
  } else {
    deploymentNote = cloudflareProblem ?? "Cloudflare's API was not asked."
  }

  return {
    name: worker.name,
    role: worker.role,
    folder: worker.folder,
    configFile: worker.configFile,
    publicAddress: worker.publicAddress,
    bindings: worker.bindings.map((binding) => ({ ...binding })),
    versionSource: worker.versionSource,
    version,
    versionNote,
    deployment,
    deploymentNote,
  }
}

/** The log rows as the reply carries them. */
export function migrationRows(rows: readonly MigrationLogRow[]): ItMigration[] {
  return rows.map((row) => ({ id: row.id, fileName: row.file_name, appliedAt: row.applied_at, recordedAt: row.recorded_at, appliedBy: row.applied_by, summary: row.summary }))
}

/**
 * The newest migration of the log, as "062 Migration_Patch062_....sql": the one applied last (a migration recorded
 * without a time, from before the log, counts as oldest; ties go to the higher id).
 */
export function latestMigration(rows: readonly ItMigration[]): string | null {
  const newest = rows.slice().sort((a, b) => (b.appliedAt ?? '').localeCompare(a.appliedAt ?? '') || b.id.localeCompare(a.id))[0]
  return newest ? `${newest.id} ${newest.fileName}` : null
}

/** What was read from the firm database for the size report. */
export interface MeasuredDatabase {
  tables: { name: string; rows: number }[]
  skipped: string[]
  indexCount: number
  viewCount: number
  sizeBytes: number | null
}

/**
 * The data size report of the firm database.
 *
 * @param measured - The counts read, or null with `reason` when the database could not be read.
 * @param reason - Why nothing was read.
 * @returns The report: tables largest first (then by name), the totals, and the notes on what D1 does not give.
 */
export function dataSizeOf(measured: MeasuredDatabase | null, reason: string | null): ItDataSize {
  if (!measured) {
    return { available: false, reason: reason ?? 'The firm database could not be read.', databaseName: 'krhomebase', databaseBytes: null, tableCount: 0, indexCount: 0, viewCount: 0, totalRows: 0, tables: [], notes: [] }
  }
  const tables = measured.tables.slice().sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))
  const notes = [PER_TABLE_BYTES_NOTE, OTHER_DATABASES_NOTE]
  if (measured.sizeBytes === null) notes.unshift('D1 did not report the size of the database with this read.')
  if (measured.skipped.length > 0) notes.push(`Not counted (a table name with characters other than letters, digits and underscores): ${measured.skipped.join(', ')}.`)
  return {
    available: true,
    reason: null,
    databaseName: 'krhomebase',
    databaseBytes: measured.sizeBytes,
    tableCount: tables.length,
    indexCount: measured.indexCount,
    viewCount: measured.viewCount,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
    tables,
    notes,
  }
}

/**
 * The database rows.
 *
 * @param cloudflare - Cloudflare's answer for each database id, or an empty map when Cloudflare was not asked.
 * @param cloudflareReason - Why Cloudflare was not asked.
 * @param firm - The firm database as measured through the binding (null when it could not be read).
 * @param newestMigration - The newest migration of the firm database's log.
 * @returns One row per database of the catalog. The firm database's size and table count come from the binding
 *   first; everything else comes from Cloudflare, and a note says what is missing without it.
 */
export function databaseRows(
  cloudflare: ReadonlyMap<string, CloudflareRead<CloudflareD1Database>>,
  cloudflareReason: string | null,
  firm: MeasuredDatabase | null,
  newestMigration: string | null,
): ItDatabase[] {
  return IT_DATABASES.map((database) => {
    const answer = cloudflare.get(database.id) ?? null
    const facts = answer?.ok ? answer.value : null
    const problem = answer ? (answer.ok ? null : answer.reason) : (cloudflareReason ?? "Cloudflare's API was not asked.")
    const isFirm = database.name === 'krhomebase'
    const sizeBytes = (isFirm ? firm?.sizeBytes : null) ?? facts?.sizeBytes ?? null
    const tableCount = (isFirm && firm ? firm.tables.length : null) ?? facts?.tableCount ?? null
    let note: string | null = null
    if (problem) {
      note = isFirm && firm ? `Created, region and storage version come from Cloudflare's API. ${problem}` : problem
    }
    return {
      name: database.name,
      id: database.id,
      role: database.role,
      schemaDoc: database.schemaDoc,
      boundBy: itBoundBy(database.name),
      sizeBytes,
      tableCount,
      createdAt: facts?.createdAt ?? null,
      region: facts?.region ?? null,
      storageVersion: facts?.storageVersion ?? null,
      latestMigration: isFirm ? newestMigration : null,
      note,
    }
  })
}

/**
 * Measures the four buckets through the API's bindings.
 *
 * @param buckets - The bindings by name.
 * @param development - True on a development computer, where a binding may reach a development bucket.
 * @returns One row per bucket of the catalog, with its object count and bytes, or the reason it was not measured.
 */
export async function bucketRows(buckets: ItSources['buckets'], development: boolean, log: ItSources['log']): Promise<ItBucket[]> {
  return Promise.all(
    IT_BUCKETS.map(async (bucket): Promise<ItBucket> => {
      const measuredName = development && bucket.developmentName ? bucket.developmentName : bucket.name
      const base = { name: bucket.name, purpose: bucket.purpose, boundBy: itBoundBy(bucket.name), measuredName }
      const binding = buckets[bucket.apiBinding]
      if (!binding) return { ...base, objects: null, bytes: null, complete: false, note: `The API has no ${bucket.apiBinding} binding here, so the bucket was not measured.` }
      try {
        const usage = await measureBucket(binding)
        const notes: string[] = []
        if (!usage.complete) notes.push(`Counting stopped at ${(BUCKET_USAGE_MAX_PAGES * 1000).toLocaleString('en-US')} objects; the bucket holds at least this much.`)
        if (measuredName !== bucket.name) notes.push(`Under pnpm dev the API reaches ${measuredName}, so that bucket was measured, not ${bucket.name}.`)
        return { ...base, objects: usage.objects, bytes: usage.bytes, complete: usage.complete, note: notes.length > 0 ? notes.join(' ') : null }
      } catch (error) {
        log('IT:207 bucket_failed', { binding: bucket.apiBinding, reason: (error instanceof Error ? error.message : String(error)).slice(0, 80) })
        return { ...base, objects: null, bytes: null, complete: false, note: 'The bucket could not be listed right now.' }
      }
    }),
  )
}

/**
 * Puts the whole overview together. Every source is asked at the same time; one that fails leaves its part with the
 * reason and the rest stands.
 *
 * @param sources - The sources (see `ItSources`).
 * @returns The reply of `GET /v1/it/overview`.
 */
export async function gatherItOverview(sources: ItSources): Promise<ItOverviewData> {
  const { cloudflare, cloudflareReason, queries, log } = sources

  // The firm database: the migration log, then the tables and their row counts.
  const migrationsRead = (async (): Promise<ItOverviewData['migrations']> => {
    if (!queries) return { available: false, reason: 'The API has no database binding.', rows: [] }
    try {
      const rows = await queries.readMigrations()
      if (rows === null) return { available: false, reason: 'The migration log table (kr_schema_migration, migration 044) does not exist in this database.', rows: [] }
      return { available: true, reason: null, rows: migrationRows(rows) }
    } catch (error) {
      log('IT:232 migrations_failed', { reason: (error instanceof Error ? error.message : String(error)).slice(0, 80) })
      return { available: false, reason: 'The migration log could not be read right now.', rows: [] }
    }
  })()

  const measuredRead = (async (): Promise<{ measured: MeasuredDatabase | null; reason: string | null }> => {
    if (!queries) return { measured: null, reason: 'The API has no database binding.' }
    try {
      const schema = await queries.readSchemaObjects()
      const counted = await queries.countRows(schema.tables)
      return { measured: { tables: counted.counts, skipped: counted.skipped, indexCount: schema.indexCount, viewCount: schema.viewCount, sizeBytes: counted.sizeBytes ?? schema.sizeBytes }, reason: null }
    } catch (error) {
      log('IT:244 data_size_failed', { reason: (error instanceof Error ? error.message : String(error)).slice(0, 80) })
      return { measured: null, reason: 'The firm database could not be read right now.' }
    }
  })()

  // The Workers: a health route where the catalog names one, and Cloudflare's deployment record for each.
  const workersRead = Promise.all(
    IT_WORKERS.map(async (worker) => {
      const [health, deployment] = await Promise.all([
        worker.versionSource === 'health-route' && worker.healthUrl ? sources.readHealth(worker.healthUrl) : Promise.resolve(null),
        cloudflare ? cloudflare.workerDeployment(worker.name) : Promise.resolve(null),
      ])
      return workerRow(worker, sources, health, deployment, cloudflareReason)
    }),
  )

  const databasesRead = Promise.all(
    IT_DATABASES.map(async (database) => [database.id, cloudflare ? await cloudflare.d1Database(database.id) : null] as const),
  )

  const [migrations, { measured, reason }, workers, databaseAnswers, buckets] = await Promise.all([
    migrationsRead,
    measuredRead,
    workersRead,
    databasesRead,
    bucketRows(sources.buckets, sources.development, log),
  ])

  const cloudflareAnswers = new Map<string, CloudflareRead<CloudflareD1Database>>()
  for (const [id, answer] of databaseAnswers) if (answer) cloudflareAnswers.set(id, answer)

  return {
    generatedAt: sources.now.toISOString(),
    environment: sources.development ? 'development' : 'deployed',
    tracks: { repository: { ...sources.tracks.repository }, api: { ...sources.tracks.api } },
    cloudflare: { available: Boolean(cloudflare), reason: cloudflare ? null : cloudflareReason },
    workers,
    buckets,
    databases: databaseRows(cloudflareAnswers, cloudflareReason, measured, latestMigration(migrations.rows)),
    migrations,
    dataSize: dataSizeOf(measured, reason),
  }
}
