// file: apps/api/src/features/it/routes.ts
/**
 * The IT Overview (Settings → Firm IT → IT Overview; super admin only; the requester, Nov 18, 2026).
 *
 *   GET /v1/it/overview   the version tracks built into this API, every deployed Worker with the repository version
 *                         it reports and when its live deployment was made, the R2 buckets with their sizes, the D1
 *                         databases, the migrations applied (kr_schema_migration) and the size of the firm database
 *                         (bytes, and the rows of every table)
 *
 * Who: super admin only (the route's `access`; anyone else gets the standard 403 `FORBIDDEN`). Outside tools: closed.
 * It writes nothing. It reads the firm database (`queries.ts`), lists the four buckets through their bindings, reads
 * two Workers' public health routes (the pay Worker and the Feedback Viewer) and, when the secret `KR_CF_READ_TOKEN`
 * is set, asks Cloudflare's API (read-only) for the deployment records and the database facts.
 *
 * It has no error code of its own: a source that cannot be read leaves its part of the reply with a plain sentence
 * saying why (`rules.ts`, rule 2), so the screen still shows everything else.
 *
 * No similar route existed: `GET /v1/health` is public and says only that the API is up and the server status.
 */

import { ItOverviewData, successEnvelope } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { BucketLister } from '../../platform/bucketUsage.ts'
import { API_BUILD_TRACKS } from '../../platform/buildVersion.ts'
import { cloudflareReaderFor, type CloudflareReadEnv } from '../../platform/cloudflareApi.ts'
import { defineRoute } from '../../platform/defineRoute.ts'
import { logLine } from '../../platform/log.ts'
import { isDevelopmentServer } from '../../platform/runtime.ts'
import type { AppEnv } from '../../platform/types.ts'
import { readWorkerHealth } from '../../platform/workerHealth.ts'
import { itQueriesFor } from './queries.ts'
import { gatherItOverview, type SelfDeployment } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const

/** The bindings and settings this route reads beyond the generated `Env`. */
type ItEnv = CloudflareReadEnv & {
  krhomebase?: D1Database
  KR_APP_BASE_URL?: unknown
  /** Cloudflare's version binding (`version_metadata` in kr-api-wrangler.jsonc): the version that is answering. */
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string }
  EMPLOYEE_STORAGE?: BucketLister
  ARTICLES?: BucketLister
  FEEDBACK_STORAGE?: BucketLister
  DOCUMENTS?: BucketLister
}

export const itOverviewRoute = defineRoute({
  method: 'get',
  path: '/v1/it/overview',
  feature: 'it',
  summary:
    'The IT Overview: the version tracks built into the API, every deployed Worker with the repository version it reports and when its live deployment was made, the R2 buckets with their sizes, the D1 databases, the migrations applied and the size of the firm database. A part that cannot be read says why instead of failing the reply.',
  access: SUPER_ADMIN,
  errors: [],
  sideEffects: [
    'None written',
    "Reads Cloudflare's API (deployments and D1 databases) when KR_CF_READ_TOKEN is set",
    'Reads the health routes of kr-pay-worker-live and krhomebase-feedback-viewer',
    'Lists the four R2 buckets through their bindings',
  ],
  responses: { 200: { description: 'The overview.', content: json(successEnvelope(ItOverviewData)) } },
})

/**
 * This API's own deployed version, from its version binding. On a development computer the local tooling makes up
 * an id, so nothing is reported there (as `apps/web/app/layout.tsx` says "local").
 */
function selfDeploymentOf(env: ItEnv, development: boolean): SelfDeployment | null {
  if (development) return null
  const metadata = env.CF_VERSION_METADATA
  const id = typeof metadata?.id === 'string' && metadata.id ? metadata.id : null
  const time = typeof metadata?.timestamp === 'string' && metadata.timestamp ? metadata.timestamp : null
  return id || time ? { id, time } : null
}

/**
 * Registers `GET /v1/it/overview`.
 *
 * Super admin only (checked by the sign-in middleware from the route's `access`). The handler gathers the sources
 * from the Worker's bindings and settings and hands them to `gatherItOverview`; it reads tables through
 * `queries.ts` only and never returns or logs the Cloudflare token.
 */
export function registerIt(app: OpenAPIHono<AppEnv>) {
  app.openapi(itOverviewRoute, async (c) => {
    const requestId = c.get('requestId')
    const env = c.env as unknown as ItEnv
    const started = Date.now()
    const development = isDevelopmentServer(env)
    // `fetch` is looked up at call time, so a test's stand-in is used.
    const fetcher: typeof fetch = (input, init) => fetch(input, init)
    const cloudflare = cloudflareReaderFor(env, fetcher)
    logLine('IT:88 overview_start', requestId, { development, cloudflare: cloudflare.reader ? 'token_set' : 'not_available' })

    const data = await gatherItOverview({
      now: new Date(),
      development,
      tracks: API_BUILD_TRACKS,
      selfDeployment: selfDeploymentOf(env, development),
      queries: itQueriesFor(env),
      cloudflare: cloudflare.reader,
      cloudflareReason: cloudflare.reason,
      readHealth: (url) => readWorkerHealth(url, fetcher),
      buckets: { EMPLOYEE_STORAGE: env.EMPLOYEE_STORAGE, ARTICLES: env.ARTICLES, FEEDBACK_STORAGE: env.FEEDBACK_STORAGE, DOCUMENTS: env.DOCUMENTS },
      log: (tag, meta) => logLine(tag, requestId, meta),
    })

    logLine('IT:103 overview_done', requestId, {
      ms: Date.now() - started,
      workers: data.workers.length,
      versions: data.workers.filter((worker) => worker.version).length,
      deployments: data.workers.filter((worker) => worker.deployment).length,
      tables: data.dataSize.tableCount,
      rows: data.dataSize.totalRows,
      migrations: data.migrations.rows.length,
    })
    return c.json({ ok: true as const, data, requestId }, 200)
  })
}
