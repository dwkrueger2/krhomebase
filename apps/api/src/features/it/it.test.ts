// file: apps/api/src/features/it/it.test.ts
/**
 * The IT Overview (`GET /v1/it/overview`; super admin only) against an in-memory Schema 8.0, with stand-ins for
 * Cloudflare's API, the two Workers' health routes and the buckets. Checks:
 *
 *  - who may call it: 403 `FORBIDDEN` for anyone but a super admin (401 for nobody is the contract test's);
 *  - the reply without the Cloudflare token (every part still answers, with the reason) and with it (deployment
 *    times, database facts; the token is sent only to Cloudflare and never returned);
 *  - the mapping rules: the version shown is the Worker's own repository version, a development computer says so,
 *    the deployment facts fall back to the Worker's own, the data size report, the newest migration;
 *  - the queries: every table counted across several statements, Cloudflare's own table left out;
 *  - the helpers: bucket measuring, the health route reader, the Cloudflare reader;
 *  - the catalog against the Worker configuration files.
 *
 * Made-up values only. Run: pnpm --dir apps/api exec vitest run src/features/it/it.test.ts
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, IT_BUCKETS, IT_DATABASES, IT_KEY_STORES, IT_WORKERS, ItOverviewData, type ItCatalogWorker } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { measureBucket, type BucketLister } from '../../platform/bucketUsage.ts'
import { API_BUILD_TRACKS } from '../../platform/buildVersion.ts'
import { CLOUDFLARE_ACCOUNT_MISSING, CLOUDFLARE_TOKEN_MISSING, cloudflareReaderFor } from '../../platform/cloudflareApi.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { readWorkerHealth } from '../../platform/workerHealth.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { COUNT_CHUNK, createItQueries } from './queries.ts'
import { dataSizeOf, databaseRows, latestMigration, migrationRows, workerRow } from './rules.ts'

const here = dirname(fileURLToPath(import.meta.url))
const REPOSITORY = join(here, '..', '..', '..', '..', '..')
const MIGRATION_LOG = join(REPOSITORY, 'docs', 'Schema_8.0', 'migrations', 'Migration_Patch044_11_15_schema_migration.sql')

const app = createApp()
const TOKEN = 'made-up-read-token'
const ACCOUNT = 'account-test'

let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  // The migration log (migration 044), from the real file: the table and its first six rows.
  env.sqlite.exec(readFileSync(MIGRATION_LOG, 'utf8'))
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'test.person@example.com', 'x', 'super_admin')`).run()
  clearSessionCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A bucket stand-in holding `sizes.length` objects, listed `pageSize` at a time. */
function fakeBucket(sizes: number[], pageSize = 1000): BucketLister & { calls: number } {
  const bucket = {
    calls: 0,
    async list(options?: { limit?: number; cursor?: string }) {
      bucket.calls += 1
      const start = Number(options?.cursor ?? 0)
      const objects = sizes.slice(start, start + pageSize).map((size) => ({ size }))
      const next = start + pageSize
      return next < sizes.length ? { objects, truncated: true, cursor: String(next) } : { objects, truncated: false }
    },
  }
  return bucket
}

const PAY_HEALTH = { ok: true, environment: 'dual', meta: { worker: 'kr-pay-worker-live', track: 'repository', version: '1.2.0', patchNum: '60', patchDate: '11-17', deploymentId: 'pay-version-id', deployedAt: '2026-11-17T10:00:00.000Z' } }
const VIEWER_HEALTH = { status: 'ok', version: '1.7.0', protocol: 1 }

/**
 * Stands in for everything the route fetches: the two health routes and, when `cloudflare` is given, Cloudflare's
 * API. Records every call with its Authorization header.
 */
function stubOutside(options: { cloudflare?: 'ok' | 'refused' } = {}) {
  const calls: { url: string; authorization: string | null }[] = []
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, authorization: new Headers(init?.headers).get('authorization') })
    if (url === 'https://pay.krhomebase.com/health') return reply(PAY_HEALTH)
    if (url === 'https://krhomebase-feedback-viewer.dankrueger.workers.dev/health-check') return reply(VIEWER_HEALTH)
    if (url.startsWith('https://api.cloudflare.com/') && options.cloudflare === 'refused') return reply({ success: false }, 403)
    if (url.startsWith('https://api.cloudflare.com/') && options.cloudflare === 'ok') {
      const worker = /\/workers\/scripts\/([^/]+)\/deployments$/.exec(url)?.[1]
      if (worker) {
        return reply({
          result: {
            deployments: [
              { created_on: '2026-11-19T01:45:54.743975Z', annotations: { 'workers/message': `deploy: abc1234 ${worker}` }, versions: [{ version_id: `old-${worker}`, percentage: 10 }, { version_id: `live-${worker}`, percentage: 90 }] },
              { created_on: '2026-11-01T00:00:00Z', versions: [{ version_id: 'older', percentage: 100 }] },
            ],
          },
        })
      }
      const database = /\/d1\/database\/([^/]+)$/.exec(url)?.[1]
      if (database) return reply({ result: { uuid: database, name: 'made-up', created_at: '2026-11-02T15:59:02.287Z', version: 'production', num_tables: 12, file_size: 4096 * 25, running_in_region: 'WNAM' } })
    }
    return reply({ error: 'not found' }, 404)
  })
  return calls
}

async function overview(role = 'super_admin', extra: Record<string, unknown> = {}) {
  clearSessionCache()
  return app.request('/v1/it/overview', { method: 'GET', headers: { ...SIGNED_IN_HEADERS } }, signedInEnv(role, { krhomebase: env.db, KR_APP_BASE_URL: 'https://krhomebase.com', ...extra }))
}

async function dataOf(res: Response) {
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: unknown; requestId: string }
  expect(body.requestId).toBeTruthy()
  return ItOverviewData.parse(body.data)
}

const workerOf = (data: ItOverviewData, name: string) => {
  const worker = data.workers.find((entry) => entry.name === name)
  if (!worker) throw new Error(`no worker ${name}`)
  return worker
}

describe('GET /v1/it/overview: who may call it', () => {
  it('refuses anyone but a super admin with the standard forbidden envelope', async () => {
    stubOutside()
    for (const role of ['admin', 'attorney', 'staff', 'client']) {
      const res = await overview(role)
      expect(res.status, role).toBe(403)
      const body = ErrorEnvelope.parse(await res.json())
      expect(body.error.code).toBe('FORBIDDEN')
      expect(body.requestId).toBeTruthy()
    }
  })

  it('asks nothing outside for a caller who is refused', async () => {
    const calls = stubOutside({ cloudflare: 'ok' })
    await overview('admin', { KR_CF_ACCOUNT_ID: ACCOUNT, KR_CF_READ_TOKEN: TOKEN })
    expect(calls).toEqual([])
  })
})

describe('GET /v1/it/overview: without the Cloudflare read token', () => {
  it('answers every part and says why Cloudflare was not asked', async () => {
    const calls = stubOutside()
    const data = await dataOf(await overview('super_admin', { EMPLOYEE_STORAGE: fakeBucket([100, 250]), FEEDBACK_STORAGE: fakeBucket([]) }))

    expect(data.environment).toBe('deployed')
    expect(data.tracks).toEqual(API_BUILD_TRACKS)
    expect(data.cloudflare).toEqual({ available: false, reason: CLOUDFLARE_ACCOUNT_MISSING })
    expect(calls.some((call) => call.url.includes('api.cloudflare.com'))).toBe(false)

    // Workers: the catalog's ten, in order; versions are the Workers' own.
    expect(data.workers.map((worker) => worker.name)).toEqual(IT_WORKERS.map((worker) => worker.name))
    expect(workerOf(data, 'krhomebase-api').version).toEqual({ track: 'api', ...API_BUILD_TRACKS.api })
    expect(workerOf(data, 'krhomebase-api').versionNote).toBeNull()
    expect(workerOf(data, 'krhomebase-web').version).toBeNull()
    expect(workerOf(data, 'kr-pay-worker-live').version).toEqual({ track: 'repository', version: '1.2.0', patchNum: '60', patchDate: '11-17' })
    expect(workerOf(data, 'kr-pay-worker-live').deployment).toEqual({ deployedAt: '2026-11-17T10:00:00.000Z', versionId: 'pay-version-id', percentage: null, message: null, source: 'health-route' })
    expect(workerOf(data, 'krhomebase-feedback-viewer').version).toEqual({ track: 'own', version: '1.7.0', patchNum: null, patchDate: null })
    const crud = workerOf(data, 'krhomebase-crud-worker')
    expect(crud.version).toBeNull()
    expect(crud.versionNote).toMatch(/no health-check route/)
    expect(crud.deployment).toBeNull()
    expect(crud.deploymentNote).toMatch(/KR_CF_ACCOUNT_ID/)

    // Buckets: measured where bound, a reason where not.
    const employee = data.buckets.find((bucket) => bucket.name === 'kr-homebase-employee-storage')
    expect(employee).toMatchObject({ objects: 2, bytes: 350, complete: true, note: null, measuredName: 'kr-homebase-employee-storage' })
    expect(data.buckets.find((bucket) => bucket.name === 'kr-homebase-feedback')).toMatchObject({ objects: 0, bytes: 0, complete: true })
    expect(data.buckets.find((bucket) => bucket.name === 'krhomebase-media-dev')).toMatchObject({ objects: null, bytes: null, note: 'The API has no DOCUMENTS binding here, so the bucket was not measured.' })
    expect(data.buckets.map((bucket) => bucket.name)).toEqual(IT_BUCKETS.map((bucket) => bucket.name))

    // Migrations: the log's rows by id.
    expect(data.migrations.available).toBe(true)
    expect(data.migrations.rows.map((row) => row.id)).toEqual(['016', '026', '031', '033', '034', '044'])
    expect(data.migrations.rows.find((row) => row.id === '044')?.fileName).toBe('Migration_Patch044_11_15_schema_migration.sql')

    // Data size: every table counted, the one user row among them.
    expect(data.dataSize.available).toBe(true)
    expect(data.dataSize.tableCount).toBeGreaterThan(100)
    expect(data.dataSize.tables.find((table) => table.name === 'user')?.rows).toBe(1)
    expect(data.dataSize.tables.find((table) => table.name === 'kr_schema_migration')?.rows).toBe(6)
    expect(data.dataSize.totalRows).toBe(data.dataSize.tables.reduce((sum, table) => sum + table.rows, 0))
    expect(data.dataSize.notes.join(' ')).toMatch(/dbstat/)

    // Databases: the firm database from the binding; the others say why they are empty.
    const firm = data.databases.find((database) => database.name === 'krhomebase')
    expect(firm).toMatchObject({ tableCount: data.dataSize.tableCount, latestMigration: '044 Migration_Patch044_11_15_schema_migration.sql', createdAt: null })
    expect(firm?.boundBy.map((entry) => entry.worker)).toContain('kr-pay-worker-live')
    expect(data.databases.find((database) => database.name === 'kr_public_inquiry_06_2026')).toMatchObject({ sizeBytes: null, tableCount: null, latestMigration: null })
    expect(data.databases.map((database) => database.id)).toEqual(IT_DATABASES.map((database) => database.id))
  })

  it('still answers without a database binding, a migration log or a reachable health route', async () => {
    vi.stubGlobal('fetch', async () => Promise.reject(new Error('offline')))
    clearSessionCache()
    const bare = createTestD1().db
    const withoutLog = await dataOf(await app.request('/v1/it/overview', { headers: { ...SIGNED_IN_HEADERS } }, signedInEnv('super_admin', { krhomebase: bare })))
    expect(withoutLog.migrations).toEqual({ available: false, reason: 'The migration log table (kr_schema_migration, migration 044) does not exist in this database.', rows: [] })
    expect(withoutLog.dataSize.available).toBe(true)
    expect(workerOf(withoutLog, 'kr-pay-worker-live').version).toBeNull()
    expect(workerOf(withoutLog, 'kr-pay-worker-live').versionNote).toMatch(/could not be reached/)

    clearSessionCache()
    const noDatabase = await dataOf(await app.request('/v1/it/overview', { headers: { ...SIGNED_IN_HEADERS } }, signedInEnv('super_admin')))
    expect(noDatabase.migrations.available).toBe(false)
    expect(noDatabase.dataSize).toMatchObject({ available: false, reason: 'The API has no database binding.', tables: [] })
  })

  it('says so when a development computer answers, and reports no deployment of its own there', async () => {
    stubOutside()
    const data = await dataOf(await overview('super_admin', { KR_APP_BASE_URL: 'http://localhost:3011', CF_VERSION_METADATA: { id: 'made-up-local-id', timestamp: '2026-11-18T00:00:00Z' }, ARTICLES: fakeBucket([5]) }))
    expect(data.environment).toBe('development')
    const api = workerOf(data, 'krhomebase-api')
    expect(api.versionNote).toMatch(/development computer/)
    expect(api.deployment).toBeNull()
    expect(data.buckets.find((bucket) => bucket.name === 'kr-homebase-articles')).toMatchObject({ measuredName: 'kr-homebase-articles-dev', objects: 1 })
  })

  it("reports the API's own version binding when deployed", async () => {
    stubOutside()
    const data = await dataOf(await overview('super_admin', { CF_VERSION_METADATA: { id: 'api-version-id', tag: '', timestamp: '2026-11-19T01:40:00.000Z' } }))
    expect(workerOf(data, 'krhomebase-api').deployment).toEqual({ deployedAt: '2026-11-19T01:40:00.000Z', versionId: 'api-version-id', percentage: null, message: null, source: 'version-binding' })
  })
})

describe('GET /v1/it/overview: with the Cloudflare read token', () => {
  it("shows Cloudflare's deployment time for every Worker and the facts of every database, and keeps the token to itself", async () => {
    const calls = stubOutside({ cloudflare: 'ok' })
    const res = await overview('super_admin', { KR_CF_ACCOUNT_ID: ACCOUNT, KR_CF_READ_TOKEN: TOKEN })
    const text = await res.clone().text()
    const data = await dataOf(res)

    expect(data.cloudflare).toEqual({ available: true, reason: null })
    for (const worker of data.workers) {
      expect(worker.deployment, worker.name).toEqual({ deployedAt: '2026-11-19T01:45:54.743975Z', versionId: `live-${worker.name}`, percentage: 90, message: `deploy: abc1234 ${worker.name}`, source: 'cloudflare-api' })
      expect(worker.deploymentNote, worker.name).toBeNull()
    }
    // The repository version is still the Worker's own, never Cloudflare's id.
    expect(workerOf(data, 'krhomebase-api').version).toEqual({ track: 'api', ...API_BUILD_TRACKS.api })
    expect(workerOf(data, 'krhomebase-session-worker').version).toBeNull()

    const inquiry = data.databases.find((database) => database.name === 'kr_public_inquiry_06_2026')
    expect(inquiry).toMatchObject({ sizeBytes: 102400, tableCount: 12, createdAt: '2026-11-02T15:59:02.287Z', region: 'WNAM', storageVersion: 'production', note: null })
    const firm = data.databases.find((database) => database.name === 'krhomebase')
    // The firm database's table count comes from the binding, not from Cloudflare's made-up 12.
    expect(firm?.tableCount).toBe(data.dataSize.tableCount)
    expect(firm).toMatchObject({ createdAt: '2026-11-02T15:59:02.287Z', sizeBytes: 102400, note: null })

    // The token goes to Cloudflare only, as a bearer token, and never comes back.
    const cloudflareCalls = calls.filter((call) => call.url.startsWith('https://api.cloudflare.com/'))
    expect(cloudflareCalls).toHaveLength(IT_WORKERS.length + IT_DATABASES.length)
    expect(cloudflareCalls.every((call) => call.authorization === `Bearer ${TOKEN}` && call.url.includes(`/accounts/${ACCOUNT}/`))).toBe(true)
    expect(calls.filter((call) => !call.url.startsWith('https://api.cloudflare.com/')).every((call) => call.authorization === null)).toBe(true)
    expect(text).not.toContain(TOKEN)
  })

  it('says so when Cloudflare refuses the token, and falls back to what the Workers say', async () => {
    stubOutside({ cloudflare: 'refused' })
    const data = await dataOf(await overview('super_admin', { KR_CF_ACCOUNT_ID: ACCOUNT, KR_CF_READ_TOKEN: TOKEN }))
    expect(data.cloudflare.available).toBe(true)
    expect(workerOf(data, 'krhomebase-crud-worker').deploymentNote).toMatch(/refused the read token \(HTTP 403\)/)
    expect(workerOf(data, 'kr-pay-worker-live').deployment?.source).toBe('health-route')
    expect(data.databases.find((database) => database.name === 'krhomebase_gpt_usage_dev')?.note).toMatch(/refused the read token/)
  })
})

describe('IT rules', () => {
  const catalog = (name: string): ItCatalogWorker => {
    const worker = IT_WORKERS.find((entry) => entry.name === name)
    if (!worker) throw new Error(name)
    return worker
  }
  const sources = { tracks: { repository: { version: '1.2.0', patchNum: '64', patchDate: '11-18' }, api: { version: '1.2.0', patchNum: '50', patchDate: '11-18' } }, selfDeployment: null, development: false }

  it('shows the version a Worker reports on its health route, or why it could not be read', () => {
    const read = workerRow(catalog('kr-pay-worker-live'), sources, { ok: true, reading: { track: 'repository', version: '1.5.1', patchNum: '70', patchDate: '12-01', deploymentId: null, deployedAt: null } }, null, 'No token.')
    expect(read.version).toEqual({ track: 'repository', version: '1.5.1', patchNum: '70', patchDate: '12-01' })
    expect(read.deployment).toBeNull()
    expect(read.deploymentNote).toBe('No token.')

    const failed = workerRow(catalog('kr-pay-worker-live'), sources, { ok: false, reason: 'The health route answered HTTP 500.' }, null, 'No token.')
    expect(failed.version).toBeNull()
    expect(failed.versionNote).toBe("The version could not be read from the Worker's health route. The health route answered HTTP 500.")
  })

  it("prefers Cloudflare's deployment record and never takes a version from it", () => {
    const row = workerRow(catalog('krhomebase-external-api'), sources, null, { ok: true, value: { deployedAt: '2026-11-09T12:00:00Z', versionId: 'cf-id', percentage: 100, message: null } }, null)
    expect(row.deployment).toEqual({ deployedAt: '2026-11-09T12:00:00Z', versionId: 'cf-id', percentage: 100, message: null, source: 'cloudflare-api' })
    expect(row.version).toBeNull()
    expect(row.versionNote).toMatch(/no health-check route/)
  })

  it('leaves the web row for the web app to fill', () => {
    const row = workerRow(catalog('krhomebase-web'), sources, null, null, 'No token.')
    expect(row.versionSource).toBe('web')
    expect(row.version).toBeNull()
  })

  it('picks the migration applied last as the newest (a migration from before the log is oldest)', () => {
    const rows = migrationRows([
      { id: '002', file_name: 'two.sql', applied_at: '2026-11-18T22:02:28.717Z', recorded_at: null, applied_by: null, summary: null },
      { id: '034', file_name: 'old.sql', applied_at: null, recorded_at: '2026-11-16T03:16:18.966Z', applied_by: null, summary: null },
      { id: '062', file_name: 'newest.sql', applied_at: '2026-11-19T01:04:49.711Z', recorded_at: null, applied_by: null, summary: null },
    ])
    expect(latestMigration(rows)).toBe('062 newest.sql')
    expect(latestMigration([])).toBeNull()
  })

  it('sorts the data size report largest first and adds up the rows', () => {
    const report = dataSizeOf({ tables: [{ name: 'matter', rows: 5 }, { name: 'audit_log', rows: 40 }, { name: 'address', rows: 5 }], skipped: ['odd-name'], indexCount: 7, viewCount: 1, sizeBytes: 11_649_024 }, null)
    expect(report.tables.map((table) => table.name)).toEqual(['audit_log', 'address', 'matter'])
    expect(report).toMatchObject({ available: true, databaseBytes: 11_649_024, tableCount: 3, indexCount: 7, viewCount: 1, totalRows: 50 })
    expect(report.notes.join(' ')).toMatch(/odd-name/)
    expect(dataSizeOf(null, 'No binding.')).toMatchObject({ available: false, reason: 'No binding.', totalRows: 0 })
  })

  it("fills a database from Cloudflare's answer and keeps the binding's numbers for the firm database", () => {
    const answers = new Map(IT_DATABASES.map((database) => [database.id, { ok: true as const, value: { name: database.name, createdAt: '2026-11-02T00:00:00Z', sizeBytes: 999, tableCount: 3, region: 'WNAM', storageVersion: 'production' } }]))
    const rows = databaseRows(answers, null, { tables: [{ name: 'a', rows: 1 }, { name: 'b', rows: 2 }], skipped: [], indexCount: 0, viewCount: 0, sizeBytes: 4096 }, '062 newest.sql')
    expect(rows[0]).toMatchObject({ name: 'krhomebase', sizeBytes: 4096, tableCount: 2, latestMigration: '062 newest.sql', region: 'WNAM' })
    expect(rows[1]).toMatchObject({ sizeBytes: 999, tableCount: 3, latestMigration: null })
    expect(databaseRows(new Map(), 'No token.', null, null)[2]).toMatchObject({ sizeBytes: null, note: 'No token.' })
  })
})

describe('IT queries', () => {
  it('counts every table across several statements and leaves out names that are not plain', async () => {
    env.sqlite.exec('CREATE TABLE "odd-name" (id TEXT); CREATE TABLE _cf_KV (key TEXT);')
    const queries = createItQueries(env.db)
    const schema = await queries.readSchemaObjects()
    expect(schema.tables.length).toBeGreaterThan(COUNT_CHUNK * 2)
    expect(schema.tables).toContain('odd-name')
    expect(schema.tables).not.toContain('_cf_KV')
    expect(schema.indexCount).toBeGreaterThan(0)

    const counted = await queries.countRows(schema.tables)
    expect(counted.skipped).toEqual(['odd-name'])
    expect(counted.counts).toHaveLength(schema.tables.length - 1)
    expect(counted.counts.find((table) => table.name === 'kr_schema_migration')?.rows).toBe(6)
    expect(counted.counts.find((table) => table.name === 'user')?.rows).toBe(1)
  })

  it('reads the database size D1 reports with a query', async () => {
    const stub = { prepare: () => ({ all: async () => ({ results: [{ type: 'table', name: 'client' }], meta: { size_after: 11_649_024 } }) }) } as unknown as D1Database
    expect(await createItQueries(stub).readSchemaObjects()).toEqual({ tables: ['client'], indexCount: 0, viewCount: 0, sizeBytes: 11_649_024 })
  })
})

describe('measureBucket', () => {
  it('adds up every page and says when it stopped at the limit', async () => {
    const sizes = Array.from({ length: 2500 }, () => 10)
    const whole = fakeBucket(sizes)
    expect(await measureBucket(whole)).toEqual({ objects: 2500, bytes: 25_000, complete: true })
    expect(whole.calls).toBe(3)
    expect(await measureBucket(fakeBucket(sizes), 2)).toEqual({ objects: 2000, bytes: 20_000, complete: false })
    expect(await measureBucket(fakeBucket([]))).toEqual({ objects: 0, bytes: 0, complete: true })
  })
})

describe('readWorkerHealth', () => {
  const answering = (body: unknown, status = 200) => (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch

  it("reads the pay Worker's track and the tool kit's own version", async () => {
    expect(await readWorkerHealth('https://pay.example.com/health', answering(PAY_HEALTH))).toEqual({ ok: true, reading: { track: 'repository', version: '1.2.0', patchNum: '60', patchDate: '11-17', deploymentId: 'pay-version-id', deployedAt: '2026-11-17T10:00:00.000Z' } })
    expect(await readWorkerHealth('https://tool.example.com/health-check', answering(VIEWER_HEALTH))).toEqual({ ok: true, reading: { track: 'own', version: '1.7.0', patchNum: null, patchDate: null, deploymentId: null, deployedAt: null } })
  })

  it('says why there is no version', async () => {
    expect(await readWorkerHealth('http://pay.example.com/health', answering(PAY_HEALTH))).toEqual({ ok: false, reason: 'The health route must be https.' })
    expect(await readWorkerHealth('https://pay.example.com/health', answering({ ok: true }))).toEqual({ ok: false, reason: 'The health route gives no version.' })
    expect(await readWorkerHealth('https://pay.example.com/health', answering('<html>', 200))).toEqual({ ok: false, reason: 'The health route did not answer with JSON.' })
    expect(await readWorkerHealth('https://pay.example.com/health', answering({}, 503))).toEqual({ ok: false, reason: 'The health route answered HTTP 503.' })
  })
})

describe('cloudflareReaderFor', () => {
  it('needs the account id and the token', () => {
    expect(cloudflareReaderFor({})).toMatchObject({ reader: null, reason: CLOUDFLARE_ACCOUNT_MISSING })
    expect(cloudflareReaderFor({ KR_CF_ACCOUNT_ID: ACCOUNT })).toMatchObject({ reader: null, reason: CLOUDFLARE_TOKEN_MISSING })
  })

  it('reports an unknown Worker, an empty list and an unreachable Cloudflare in words', async () => {
    const reader = (fetcher: typeof fetch) => cloudflareReaderFor({ KR_CF_ACCOUNT_ID: ACCOUNT, KR_CF_READ_TOKEN: TOKEN }, fetcher).reader
    const answering = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    expect(await reader(answering({}, 404))?.workerDeployment('gone')).toEqual({ ok: false, reason: 'Cloudflare does not know this Worker (HTTP 404).' })
    expect(await reader(answering({ result: { deployments: [] } }))?.workerDeployment('new')).toEqual({ ok: false, reason: 'Cloudflare lists no deployment for this Worker.' })
    expect(await reader((async () => Promise.reject(new Error('dns'))) as unknown as typeof fetch)?.d1Database('id')).toEqual({ ok: false, reason: 'Cloudflare could not be reached.' })
  })
})

describe('IT catalog against the configuration files', () => {
  it("finds each Worker's name, and every binding, bucket, database and key store it lists, in the Worker's configuration file", () => {
    const ids = new Map<string, string>([...IT_DATABASES.map((database) => [database.name, database.id] as const), ...IT_KEY_STORES.map((store) => [store.name, store.id] as const)])
    for (const worker of IT_WORKERS) {
      const config = readFileSync(join(REPOSITORY, worker.configFile), 'utf8')
      expect(config, worker.configFile).toContain(worker.name)
      for (const binding of worker.bindings) {
        expect(config, `${worker.name} binding ${binding.binding}`).toContain(binding.binding)
        if (binding.kind === 'worker' || binding.kind === 'r2') expect(config, `${worker.name} target ${binding.target}`).toContain(binding.target)
        if (binding.kind === 'd1') expect(config, `${worker.name} database ${binding.target}`).toContain(ids.get(binding.target) ?? 'missing id')
        if (binding.kind === 'kv') expect(config, `${worker.name} key store ${binding.target}`).toContain(ids.get(binding.target) ?? 'missing id')
      }
    }
  })
})
