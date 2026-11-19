// file: packages/contracts/src/it.ts
/**
 * IT Overview (Settings → Firm IT → IT Overview; super admin only; the requester, Nov 18, 2026).
 *
 *   GET /v1/it/overview   the software versions, every Worker with the version it runs live, the R2 buckets, the D1
 *                         databases, the migrations applied and the size of the firm database
 *
 * Two goals: (1) know which version each Worker runs live, (2) know how large the data set is.
 *
 * What is in this file:
 *  - The catalog: `IT_WORKERS`, `IT_DATABASES`, `IT_BUCKETS` and `IT_KEY_STORES`, a hand-kept copy of what
 *    `docs/04_Deployed_Architecture.md` and the Worker configuration files say is deployed. The API fills its reply
 *    from it and the web app draws the architecture diagram from it, so both name the same Workers. A Worker,
 *    binding, database or bucket that changes is changed here in the same change (a test in `apps/api` compares the
 *    catalog with the configuration files).
 *  - The reply shape, `ItOverviewData`.
 *
 * Versions (the requester's rule): the version shown for a Worker is the one kept in the repository (a version
 * track of `AGENTS_01`, for example `1.2.0 p49 (11-18)`), as that Worker itself reports it. Cloudflare supplies only
 * when the live deployment was made and its own deployment id. A Worker that reports nothing says so, with the
 * reason; nothing is guessed.
 *
 * A part that cannot be read never fails the whole reply: it carries `null` values and a plain sentence saying why.
 */

import { z } from 'zod'

/* ------------------------------------------------------------------------------------------------------------------
 * The catalog
 * ---------------------------------------------------------------------------------------------------------------- */

/** How the IT Overview learns the repository version a Worker runs. */
export const IT_VERSION_SOURCES = ['api', 'web', 'health-route', 'none'] as const
export type ItVersionSource = (typeof IT_VERSION_SOURCES)[number]

/** What a binding points to. */
export const IT_BINDING_KINDS = ['worker', 'd1', 'r2', 'kv', 'assets', 'version', 'rate-limit'] as const
export type ItBindingKind = (typeof IT_BINDING_KINDS)[number]

/** One binding of a Worker, as its configuration file declares it. */
export interface ItCatalogBinding {
  /** The binding's name in the Worker's code. */
  binding: string
  kind: ItBindingKind
  /** The Worker, database, bucket or key store it points to (its Cloudflare name), or a few words for the others. */
  target: string
}

/** One deployed Worker. */
export interface ItCatalogWorker {
  /** The Worker's Cloudflare name. */
  name: string
  /** What it does, in a few words. */
  role: string
  /** Its folder in the repository. */
  folder: string
  /** Its configuration file, from the repository root. */
  configFile: string
  /** Its public address (host name), or null when only another Worker can reach it. */
  publicAddress: string | null
  /** `api`: this reply's own Worker. `web`: the web app adds its own. `health-route`: read from `healthUrl`. `none`: the Worker reports no version. */
  versionSource: ItVersionSource
  /** The health route that answers with the Worker's version (only with `health-route`). */
  healthUrl: string | null
  /** Why the Worker reports no version of its own (only with `none`). */
  versionNote: string | null
  bindings: readonly ItCatalogBinding[]
}

const NO_HEALTH_ROUTE = 'This Worker reports no version: it has no health-check route that answers with one.'

/**
 * The ten deployed Workers, in the order of `docs/04_Deployed_Architecture.md` section 1 (bindings from its section 4
 * and from each configuration file).
 */
export const IT_WORKERS: readonly ItCatalogWorker[] = [
  {
    name: 'krhomebase-web',
    role: 'The screens (Next.js on vinext). No database, no business rules.',
    folder: 'apps/web',
    configFile: 'apps/web/cloudflare.config.ts',
    publicAddress: 'krhomebase.com',
    versionSource: 'web',
    healthUrl: null,
    versionNote: null,
    bindings: [
      { binding: 'API', kind: 'worker', target: 'krhomebase-api' },
      { binding: 'ASSETS', kind: 'assets', target: 'its own static files' },
      { binding: 'CF_VERSION_METADATA', kind: 'version', target: 'its deployed version' },
    ],
  },
  {
    name: 'krhomebase-api',
    role: 'The API (Hono): every business rule, and the only code that reads and writes the firm database.',
    folder: 'apps/api',
    configFile: 'apps/api/kr-api-wrangler.jsonc',
    publicAddress: null,
    versionSource: 'api',
    healthUrl: null,
    versionNote: null,
    bindings: [
      { binding: 'krhomebase', kind: 'd1', target: 'krhomebase' },
      { binding: 'CRUD_WORKER', kind: 'worker', target: 'krhomebase-crud-worker' },
      { binding: 'SESSION_WORKER', kind: 'worker', target: 'krhomebase-session-worker' },
      { binding: 'PUBLIC_INQUIRY_WORKER', kind: 'worker', target: 'krhomebase-crud-worker-pub-inquiry' },
      { binding: 'GPT_WORKER', kind: 'worker', target: 'krhomebase-gpt-models-worker' },
      { binding: 'EMPLOYEE_STORAGE', kind: 'r2', target: 'kr-homebase-employee-storage' },
      { binding: 'ARTICLES', kind: 'r2', target: 'kr-homebase-articles' },
      { binding: 'FEEDBACK_STORAGE', kind: 'r2', target: 'kr-homebase-feedback' },
      { binding: 'DOCUMENTS', kind: 'r2', target: 'krhomebase-media-dev' },
      { binding: 'CF_VERSION_METADATA', kind: 'version', target: 'its deployed version' },
    ],
  },
  {
    name: 'krhomebase-crud-worker',
    role: 'Database reader and writer used by sign-in only.',
    folder: 'workers/d1-workers/crud-worker',
    configFile: 'workers/d1-workers/crud-worker/crud-worker.jsonc',
    publicAddress: null,
    versionSource: 'none',
    healthUrl: null,
    versionNote: NO_HEALTH_ROUTE,
    bindings: [
      { binding: 'CRUD_WORKER_ASSIGNED_D1', kind: 'd1', target: 'krhomebase' },
      { binding: 'PUBLIC_KEYS', kind: 'kv', target: 'krhomebase-public-keys' },
    ],
  },
  {
    name: 'krhomebase-session-worker',
    role: 'Checks a session cookie.',
    folder: 'workers/d1-workers/session-worker',
    configFile: 'workers/d1-workers/session-worker/session-worker.jsonc',
    publicAddress: null,
    versionSource: 'none',
    healthUrl: null,
    versionNote: NO_HEALTH_ROUTE,
    bindings: [{ binding: 'SESSION_WORKER_ASSIGNED_D1', kind: 'd1', target: 'krhomebase' }],
  },
  {
    name: 'kr-pay-worker-live',
    role: 'Public pay-link pages and Stripe webhooks.',
    folder: 'workers/d1-workers/kr-pay-worker',
    configFile: 'workers/d1-workers/kr-pay-worker/kr-pay-worker.jsonc',
    publicAddress: 'pay.krhomebase.com',
    versionSource: 'health-route',
    healthUrl: 'https://pay.krhomebase.com/health',
    versionNote: null,
    bindings: [
      { binding: 'KR_PAY_D1', kind: 'd1', target: 'krhomebase' },
      { binding: 'KR_HOMEBASE_API', kind: 'worker', target: 'krhomebase-api' },
      { binding: 'CF_VERSION_METADATA', kind: 'version', target: 'its deployed version' },
    ],
  },
  {
    name: 'krhomebase-crud-worker-pub-inquiry',
    role: "The public inquiry database's reader and writer (Web Site Feedback).",
    folder: 'workers/d1-workers/crud-worker-pub-inquiry',
    configFile: 'workers/d1-workers/crud-worker-pub-inquiry/crud-worker-pub-inquiry.jsonc',
    publicAddress: null,
    versionSource: 'none',
    healthUrl: null,
    versionNote: NO_HEALTH_ROUTE,
    bindings: [
      { binding: 'PUBLIC_INQUIRY_DB', kind: 'd1', target: 'kr_public_inquiry_06_2026' },
      { binding: 'PUBLIC_KEYS', kind: 'kv', target: 'krhomebase-public-keys' },
    ],
  },
  {
    name: 'krhomebase-gpt-models-worker',
    role: "The GPT Model Gateway's providers, keys and usage.",
    folder: 'workers/gpt-workers',
    configFile: 'workers/gpt-workers/gpt-models-worker.jsonc',
    publicAddress: null,
    versionSource: 'none',
    healthUrl: null,
    versionNote: 'This Worker reports no version: its health route answers without one.',
    bindings: [{ binding: 'GPT_USAGE_DB', kind: 'd1', target: 'krhomebase_gpt_usage_dev' }],
  },
  {
    name: 'krhomebase-external-api',
    role: 'The door for outside tool servers. Forwards to the API; no rules.',
    folder: 'apps/external-api',
    configFile: 'apps/external-api/kr-external-api-wrangler.jsonc',
    publicAddress: null,
    versionSource: 'none',
    healthUrl: null,
    versionNote: NO_HEALTH_ROUTE,
    bindings: [
      { binding: 'API', kind: 'worker', target: 'krhomebase-api' },
      { binding: 'TOOL_RATE_LIMITER', kind: 'rate-limit', target: 'a rate limit for tool calls' },
    ],
  },
  {
    name: 'krhomebase-feedback-viewer',
    role: 'The Homebase Feedback viewer: an outside tool, shown in a frame by krhomebase.com.',
    folder: 'workers/feedback-viewer',
    configFile: 'workers/feedback-viewer/feedback-viewer.jsonc',
    publicAddress: 'krhomebase-feedback-viewer.dankrueger.workers.dev',
    versionSource: 'health-route',
    healthUrl: 'https://krhomebase-feedback-viewer.dankrueger.workers.dev/health-check',
    versionNote: null,
    bindings: [
      { binding: 'ASSETS', kind: 'assets', target: 'its own static files' },
      { binding: 'FEEDBACK_STORAGE', kind: 'r2', target: 'kr-homebase-feedback' },
    ],
  },
  {
    name: 'krhomebase-public-article-worker',
    role: 'Published Articles and Answers, and their images, for the public site.',
    folder: 'workers/r2-workers/public-article-worker',
    configFile: 'workers/r2-workers/public-article-worker/public-article-worker.jsonc',
    publicAddress: 'its workers.dev address',
    versionSource: 'none',
    healthUrl: null,
    versionNote: 'This Worker reports no version: its health route answers without one.',
    bindings: [
      { binding: 'KRHOMEBASE_DB', kind: 'd1', target: 'krhomebase' },
      { binding: 'ARTICLE_BUCKET', kind: 'r2', target: 'kr-homebase-articles' },
    ],
  },
]

/** One D1 database the system uses. */
export interface ItCatalogDatabase {
  /** The database's Cloudflare name. */
  name: string
  /** Its Cloudflare id (from the configuration files; not a secret). */
  id: string
  /** What it holds, in a few words. */
  role: string
  /** Its schema documentation, from the repository root. */
  schemaDoc: string
}

/** The three D1 databases the deployed Workers use (root `AGENTS.md`, "Important Documentation"). */
export const IT_DATABASES: readonly ItCatalogDatabase[] = [
  { name: 'krhomebase', id: 'ef68921f-c7d3-4d0b-9af4-defebc748616', role: "The firm's database: contacts, matters, billing, time, users and settings.", schemaDoc: 'docs/Schema_8.0' },
  { name: 'kr_public_inquiry_06_2026', id: '8517c8e6-f557-4286-824f-30f01148c325', role: 'Public inquiries and Web Site Feedback, kept apart from the firm database.', schemaDoc: 'docs/Schema_Public_Inquiry_v2.0' },
  { name: 'krhomebase_gpt_usage_dev', id: '07ead470-24b3-4ad4-b5e6-6f2a90cc8d24', role: 'GPT Model Gateway connections and token usage.', schemaDoc: 'docs/Schema_GPT_Usage_1.1' },
]

/** One R2 bucket the system uses. */
export interface ItCatalogBucket {
  /** The bucket's Cloudflare name. */
  name: string
  /** What it holds, in a few words. */
  purpose: string
  /** The API's binding to it; the API measures the bucket through this binding. */
  apiBinding: string
  /** The bucket the API's binding reaches under `pnpm dev`, when that is another bucket. */
  developmentName: string | null
}

/** The four R2 buckets, each bound by the API (`apps/api/kr-api-wrangler.jsonc`). */
export const IT_BUCKETS: readonly ItCatalogBucket[] = [
  { name: 'kr-homebase-employee-storage', purpose: 'Employee documents (private HR files).', apiBinding: 'EMPLOYEE_STORAGE', developmentName: null },
  { name: 'kr-homebase-articles', purpose: 'Front End Publishing: article packages, images and past publications.', apiBinding: 'ARTICLES', developmentName: 'kr-homebase-articles-dev' },
  { name: 'kr-homebase-feedback', purpose: 'Homebase Feedback screenshots.', apiBinding: 'FEEDBACK_STORAGE', developmentName: null },
  { name: 'krhomebase-media-dev', purpose: 'Stored billing emails and PDFs (invoices, statements, receipts).', apiBinding: 'DOCUMENTS', developmentName: null },
]

/** One KV key store the system uses. */
export interface ItCatalogKeyStore {
  name: string
  id: string
  role: string
}

/** The key store of the sign-in Workers (root `AGENTS.md`, "Workers"). */
export const IT_KEY_STORES: readonly ItCatalogKeyStore[] = [
  { name: 'krhomebase-public-keys', id: 'f70c0ff65aa148a59bd1d598236ce1de', role: 'Public keys the crud Workers check signed commands with.' },
]

/** The Workers whose bindings point at `target` (a Worker, database, bucket or key store), with the binding each uses. */
export function itBoundBy(target: string): { worker: string; binding: string }[] {
  return IT_WORKERS.flatMap((worker) => worker.bindings.filter((binding) => binding.target === target).map((binding) => ({ worker: worker.name, binding: binding.binding })))
}

/* ------------------------------------------------------------------------------------------------------------------
 * The reply
 * ---------------------------------------------------------------------------------------------------------------- */

/** One version track of `AGENTS_01` as a running Worker reports it. */
export const ItVersionTrack = z.object({
  version: z.string().describe('The semantic version kept in the repository, for example "1.2.0".'),
  patchNum: z.string().nullable().describe('The operational patch number of the track, for example "49"; null when the Worker keeps none.'),
  patchDate: z.string().nullable().describe('The patch date as MM-DD, for example "11-18"; null when the Worker keeps none.'),
})
export type ItVersionTrack = z.infer<typeof ItVersionTrack>

/** Which track a Worker's version belongs to. `own`: a version the Worker keeps for itself (the Feedback Viewer). */
export const IT_TRACK_NAMES = ['repository', 'api', 'web', 'own'] as const
export type ItTrackName = (typeof IT_TRACK_NAMES)[number]

export const ItWorkerVersion = ItVersionTrack.extend({
  track: z.enum(IT_TRACK_NAMES).describe('The version track the number belongs to: repository, api or web (AGENTS_01), or own for a version the Worker keeps for itself.'),
})
export type ItWorkerVersion = z.infer<typeof ItWorkerVersion>

/** Where the deployment facts of a Worker came from. */
export const IT_DEPLOYMENT_SOURCES = ['cloudflare-api', 'version-binding', 'health-route'] as const
export type ItDeploymentSource = (typeof IT_DEPLOYMENT_SOURCES)[number]

export const ItDeployment = z.object({
  deployedAt: z.string().nullable().describe('When the live deployment was made (ISO time); null when not reported.'),
  versionId: z.string().nullable().describe("Cloudflare's own id of the deployed Worker version (not the repository version); null when not reported."),
  percentage: z.number().nullable().describe('The share of traffic this version serves, 0 to 100; null when not reported.'),
  message: z.string().nullable().describe('The deploy message kept by Cloudflare (the deploy script writes the commit); null when there is none.'),
  source: z.enum(IT_DEPLOYMENT_SOURCES).describe("cloudflare-api: read from Cloudflare's API. version-binding: the Worker's own version binding. health-route: the Worker's health route."),
})
export type ItDeployment = z.infer<typeof ItDeployment>

const ItBinding = z.object({
  binding: z.string().describe("The binding's name in the Worker's code."),
  kind: z.enum(IT_BINDING_KINDS).describe('What the binding points to: another Worker, a D1 database, an R2 bucket, a KV key store, static files, the version binding or a rate limit.'),
  target: z.string().describe('The Cloudflare name of what it points to, or a few words.'),
})

export const ItWorker = z.object({
  name: z.string().describe("The Worker's Cloudflare name."),
  role: z.string().describe('What the Worker does, in a few words.'),
  folder: z.string().describe('Its folder in the repository.'),
  configFile: z.string().describe('Its configuration file, from the repository root.'),
  publicAddress: z.string().nullable().describe('Its public address; null when only another Worker can reach it.'),
  bindings: z.array(ItBinding).describe("The Worker's bindings, from its configuration file."),
  versionSource: z.enum(IT_VERSION_SOURCES).describe('How its repository version is learned: api (this Worker), web (the web app adds its own), health-route, or none.'),
  version: ItWorkerVersion.nullable().describe('The repository version the live Worker reports; null when it reports none or could not be read (see versionNote).'),
  versionNote: z.string().nullable().describe('A remark about the version in a plain sentence: why there is none, or that a development computer answered; null when there is nothing to say.'),
  deployment: ItDeployment.nullable().describe('When the live deployment was made and its Cloudflare id; null when not available (see deploymentNote).'),
  deploymentNote: z.string().nullable().describe("A remark about the deployment facts in a plain sentence: why they are missing, or that they come from the Worker itself because Cloudflare's API was not available; null when Cloudflare's record is shown."),
})
export type ItWorker = z.infer<typeof ItWorker>

const ItBoundBy = z.object({
  worker: z.string().describe('The Worker that holds the binding.'),
  binding: z.string().describe("The binding's name in that Worker."),
})

export const ItBucket = z.object({
  name: z.string().describe("The bucket's Cloudflare name."),
  purpose: z.string().describe('What the bucket holds.'),
  boundBy: z.array(ItBoundBy).describe('The Workers bound to the bucket.'),
  measuredName: z.string().describe('The bucket that was measured: the same name, or the development bucket under pnpm dev.'),
  objects: z.number().int().nullable().describe('How many objects the bucket holds; null when it could not be measured.'),
  bytes: z.number().nullable().describe('The total size of its objects in bytes; null when it could not be measured.'),
  complete: z.boolean().describe('False when counting stopped at the limit: the bucket holds at least the numbers given.'),
  note: z.string().nullable().describe('Why the bucket could not be measured, or that the count stopped at the limit; null otherwise.'),
})
export type ItBucket = z.infer<typeof ItBucket>

export const ItDatabase = z.object({
  name: z.string().describe("The database's Cloudflare name."),
  id: z.string().describe('Its Cloudflare id.'),
  role: z.string().describe('What the database holds.'),
  schemaDoc: z.string().describe('Its schema documentation, from the repository root.'),
  boundBy: z.array(ItBoundBy).describe('The Workers bound to the database.'),
  sizeBytes: z.number().nullable().describe('The size of the database in bytes; null when not available.'),
  tableCount: z.number().int().nullable().describe('How many tables it holds; null when not available.'),
  createdAt: z.string().nullable().describe('When the database was created (ISO time); null when not available.'),
  region: z.string().nullable().describe('The Cloudflare region it runs in; null when not available.'),
  storageVersion: z.string().nullable().describe("Cloudflare's storage version of the database (for example \"production\"); null when not available."),
  latestMigration: z.string().nullable().describe('The newest migration recorded in the migration log (id and file name); null when the database keeps no log here.'),
  note: z.string().nullable().describe('What could not be read and why; null when everything was read.'),
})
export type ItDatabase = z.infer<typeof ItDatabase>

export const ItMigration = z.object({
  id: z.string().describe('The three-digit repository patch number of the migration.'),
  fileName: z.string().describe('The migration file, in docs/Schema_8.0/migrations.'),
  appliedAt: z.string().nullable().describe('When it was applied (ISO time); null for a migration applied before the log existed.'),
  recordedAt: z.string().nullable().describe('When the log row was written (ISO time).'),
  appliedBy: z.string().nullable().describe('How it was applied.'),
  summary: z.string().nullable().describe('What it changed, in one line.'),
})
export type ItMigration = z.infer<typeof ItMigration>

export const ItTableRows = z.object({
  name: z.string().describe('The table name.'),
  rows: z.number().int().describe('How many rows the table holds.'),
})
export type ItTableRows = z.infer<typeof ItTableRows>

export const ItDataSize = z.object({
  available: z.boolean().describe('False when the firm database could not be read at all (see reason).'),
  reason: z.string().nullable().describe('Why nothing could be read; null when available.'),
  databaseName: z.string().describe('The database measured (krhomebase).'),
  databaseBytes: z.number().nullable().describe('The size of the whole database in bytes, as D1 reports it after a query; null when not reported.'),
  tableCount: z.number().int().describe('How many tables were counted.'),
  indexCount: z.number().int().describe('How many indexes the database has.'),
  viewCount: z.number().int().describe('How many views the database has.'),
  totalRows: z.number().int().describe('The rows of every counted table added up.'),
  tables: z.array(ItTableRows).describe('Every table with its row count, largest first.'),
  notes: z.array(z.string()).describe('What could not be obtained and why, in plain sentences.'),
})
export type ItDataSize = z.infer<typeof ItDataSize>

export const ItOverviewData = z.object({
  generatedAt: z.string().describe('When the API put this reply together (ISO time).'),
  environment: z.enum(['deployed', 'development']).describe('deployed: the live API. development: an API on a development computer (pnpm dev), which still reads the live database.'),
  tracks: z
    .object({
      repository: ItVersionTrack.describe('The repository track built into the answering API (root package.json).'),
      api: ItVersionTrack.describe('The API track built into the answering API (apps/api/package.json).'),
    })
    .describe('The version tracks as built into the API that answered. The web app adds its own track.'),
  cloudflare: z
    .object({
      available: z.boolean().describe("True when Cloudflare's API could be asked (the read token is set)."),
      reason: z.string().nullable().describe('Why Cloudflare could not be asked; null when available.'),
    })
    .describe("Whether Cloudflare's API was available for the deployment times and the database facts."),
  workers: z.array(ItWorker).describe('Every deployed Worker, in the order of docs/04_Deployed_Architecture.md.'),
  buckets: z.array(ItBucket).describe('Every R2 bucket, with its size when it could be measured.'),
  databases: z.array(ItDatabase).describe('Every D1 database the system uses.'),
  migrations: z
    .object({
      available: z.boolean().describe('False when the migration log could not be read (see reason).'),
      reason: z.string().nullable().describe('Why the log could not be read; null when available.'),
      rows: z.array(ItMigration).describe('The migrations recorded in kr_schema_migration, by id.'),
    })
    .describe('The migrations applied to krhomebase, from its migration log.'),
  dataSize: ItDataSize.describe('The size of the firm database: its bytes and the rows of every table.'),
})
export type ItOverviewData = z.infer<typeof ItOverviewData>

/**
 * Writes a version the way the pages' `kr-web-version` tag does: `1.2.0 p49 (11-18)`. A version with no patch
 * number is written alone (`1.7.0`).
 *
 * @param version - The version, or null.
 * @returns The text, or an empty string for null.
 */
export function formatItVersion(version: ItVersionTrack | null | undefined): string {
  if (!version) return ''
  const patch = version.patchNum ? ` p${version.patchNum}` : ''
  const date = version.patchDate ? ` (${version.patchDate})` : ''
  return `${version.version}${patch}${date}`
}
