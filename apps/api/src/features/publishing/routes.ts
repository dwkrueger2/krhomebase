// file: apps/api/src/features/publishing/routes.ts
/**
 * Front End Publishing.
 *
 * Settings (Settings plan, stage 4a; decision 7 keeps the article prompt). Replaces the old
 * `GET`/`POST /krhomebase/api/kr-api-v1/article-helper-prompt` and `GET .../front-end-publishing/prompt`:
 *
 *   GET /v1/publishing/article-prompt   the Upload Article GPT helper prompt (empty until saved); super admin and
 *                                       front-end author (the old download route allowed both)
 *   PUT /v1/publishing/article-prompt   save it (1 to 50,000 characters); super admin
 *
 * The prompt is a `lookup` settings row (`queries.ts`). The old route fell back to a prompt written in its code when
 * nothing was saved; that text is not ported, so the screen shows an empty prompt until one is saved.
 *
 * Articles and answers (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 6; as-is record section 6.6).
 * Replaces the old `GET`/`POST /krhomebase/api/front-end-publishing` (five actions), `.../package`,
 * `.../download/{id}` and `.../assets/{key}`:
 *
 *   GET    /v1/publishing/items                    articles and answers, newest first, paged (D10)
 *   GET    /v1/publishing/items/{itemId}           one item with its images, licenses and publish problems
 *   POST   /v1/publishing/packages                 check a ZIP and store its files in R2 (multipart: contentType, file)
 *   POST   /v1/publishing/items                    a draft from a checked package (the API checks the ZIP again)
 *   PATCH  /v1/publishing/items/{itemId}           change a draft or replace its package; licenses only while published
 *   POST   /v1/publishing/items/{itemId}/publish   publish (every image licensed, D25)
 *   POST   /v1/publishing/items/{itemId}/unpublish take a published item down
 *   POST   /v1/publishing/items/{itemId}/archive   archive a published item
 *   DELETE /v1/publishing/items/{itemId}           delete an item that is not published (super admin)
 *   GET    /v1/publishing/items/{itemId}/package   the source ZIP
 *   GET    /v1/publishing/assets/{assetKey}        a draft image or the article stylesheet
 *
 * Who: super admin and front-end author (the old list), except the delete and the prompt save (super admin). Rules:
 * `rules.ts`; package check: `articlePackage.ts`; HTML: `articleSanitizer.ts`; R2: `src/platform/articleStorage.ts`
 * (binding `ARTICLES`). Writes pass the write gate and are audited (resource `publishing`). Outside tools: closed.
 */

import {
  ArticlePackageCheckData,
  ArticlePackageForm,
  ArticlePromptBody,
  ArticlePromptData,
  ErrorEnvelope,
  PUBLISHING_ROLES,
  PublishingActionBody,
  PublishingAssetParams,
  PublishingDeleteBody,
  PublishingDeletedData,
  PublishingItemCreateBody,
  PublishingItemData,
  PublishingItemParams,
  PublishingItemsData,
  PublishingItemsQuery,
  PublishingItemUpdateBody,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { ArticleStorageError, articleStorageFor, type ArticleStorage } from '../../platform/articleStorage.ts'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { PublishingMigrationRequiredError, PublishingUnavailableError, publishingQueriesFor, type PublishingQueries } from './queries.ts'
import {
  checkPackage,
  createItem,
  deleteItem,
  getItem,
  listItems,
  publishItem,
  PublishingError,
  readAsset,
  readPackage,
  takeDownItem,
  updateItem,
  type PublishingContext,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const AUTHORS = { roles: [...PUBLISHING_ROLES] }
const unavailable503 = { description: 'The prompt cannot be read or saved right now (PUBLISHING_UNAVAILABLE).', content: json(ErrorEnvelope) }
const itemsUnavailable503 = error(
  'Front End Publishing cannot be reached right now (PUBLISHING_UNAVAILABLE), the articles bucket failed (PUBLISHING_STORAGE_UNAVAILABLE), or migration 031 (image licenses) is not applied yet (PUBLISHING_MIGRATION_REQUIRED).',
)
const UNAVAILABLE_CODES = ['PUBLISHING_UNAVAILABLE', 'PUBLISHING_STORAGE_UNAVAILABLE', 'PUBLISHING_MIGRATION_REQUIRED']
const itemReply = { description: 'The item.', content: json(successEnvelope(PublishingItemData)) }
const PACKAGE_CODES = ['PUBLISHING_PACKAGE_KEY_INVALID', 'PUBLISHING_PACKAGE_NOT_FOUND', 'PUBLISHING_PACKAGE_REFUSED']
const fileReply = (description: string, type: string) => ({ description, content: { [type]: { schema: z.string().describe('The file bytes.') } } })

export const articlePromptRoute = defineRoute({
  method: 'get',
  path: '/v1/publishing/article-prompt',
  feature: 'publishing',
  summary: 'The Upload Article GPT helper prompt, or an empty prompt when none is saved.',
  access: AUTHORS,
  errors: ['PUBLISHING_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The prompt.', content: json(successEnvelope(ArticlePromptData)) }, 503: unavailable503 },
})

export const saveArticlePromptRoute = defineRoute({
  method: 'put',
  path: '/v1/publishing/article-prompt',
  feature: 'publishing',
  summary: 'Saves the Upload Article GPT helper prompt.',
  access: SUPER_ADMIN,
  errors: ['PUBLISHING_UNAVAILABLE'],
  sideEffects: ['Writes lookup (row lk_kr_article_helper_prompt_upload_article)', 'Writes audit_log'],
  request: { body: { content: json(ArticlePromptBody), required: true } },
  responses: { 200: { description: 'The prompt as saved.', content: json(successEnvelope(ArticlePromptData)) }, 503: unavailable503 },
})

export const publishingItemsRoute = defineRoute({
  method: 'get',
  path: '/v1/publishing/items',
  feature: 'publishing',
  summary: 'Articles and answers, newest first (last changed, else created), one page at a time, with a line saying when more exist.',
  access: AUTHORS,
  errors: ['PUBLISHING_CURSOR_INVALID', ...UNAVAILABLE_CODES],
  sideEffects: ['None'],
  request: { query: PublishingItemsQuery },
  responses: { 200: { description: 'One page of items.', content: json(successEnvelope(PublishingItemsData)) }, 422: error('The cursor is not valid (PUBLISHING_CURSOR_INVALID).'), 503: itemsUnavailable503 },
})

export const publishingItemRoute = defineRoute({
  method: 'get',
  path: '/v1/publishing/items/{itemId}',
  feature: 'publishing',
  summary: 'One article or answer with its cleaned text, its images and their licenses, and what still stops it from being published.',
  access: AUTHORS,
  errors: ['PUBLISHING_ITEM_NOT_FOUND', ...UNAVAILABLE_CODES],
  sideEffects: ['None'],
  request: { params: PublishingItemParams },
  responses: { 200: itemReply, 404: error('No item has that id (PUBLISHING_ITEM_NOT_FOUND).'), 503: itemsUnavailable503 },
})

export const publishingPackageRoute = defineRoute({
  method: 'post',
  path: '/v1/publishing/packages',
  feature: 'publishing',
  summary: 'Checks one ZIP package against the old rules (one root HTML, kr-* meta tags, no scripts, images in the ZIP, image type and size from the bytes) and stores its files in R2; writes no item yet.',
  access: AUTHORS,
  errors: ['PUBLISHING_PACKAGE_REFUSED', ...UNAVAILABLE_CODES],
  sideEffects: [
    'Writes R2 objects (kr-homebase-articles: source-uploads/, images/, stylesheets/, sanitized-snapshots/)',
    'Writes audit_log',
  ],
  request: { body: { required: true, content: { 'multipart/form-data': { schema: ArticlePackageForm } } } },
  responses: {
    200: { description: 'Accepted and stored.', content: json(successEnvelope(ArticlePackageCheckData)) },
    422: error('The package was refused (PUBLISHING_PACKAGE_REFUSED); `details.problems` lists every reason in the old wording.'),
    503: itemsUnavailable503,
  },
})

export const createPublishingItemRoute = defineRoute({
  method: 'post',
  path: '/v1/publishing/items',
  feature: 'publishing',
  summary: 'Saves a new draft from a checked package: the API reads the stored ZIP again, checks it again, cleans the text again and makes every key itself; alt text and image licenses are given by image path.',
  access: AUTHORS,
  errors: [...PACKAGE_CODES, 'PUBLISHING_ITEM_EXISTS', 'PUBLISHING_ITEM_INVALID', ...UNAVAILABLE_CODES],
  sideEffects: ['Writes public_content', 'Writes content_asset', 'Writes content_revision', 'Writes audit_log', 'May write R2 objects missing since the package check'],
  request: { body: { content: json(PublishingItemCreateBody), required: true } },
  responses: {
    200: itemReply,
    404: error('The package is not stored (PUBLISHING_PACKAGE_NOT_FOUND).'),
    409: error('An item with that slug or address exists (PUBLISHING_ITEM_EXISTS).'),
    422: error('The package key is not one (PUBLISHING_PACKAGE_KEY_INVALID), the package fails the check (PUBLISHING_PACKAGE_REFUSED), or a field is missing (PUBLISHING_ITEM_INVALID); `details.problems` lists the reasons.'),
    503: itemsUnavailable503,
  },
})

export const updatePublishingItemRoute = defineRoute({
  method: 'patch',
  path: '/v1/publishing/items/{itemId}',
  feature: 'publishing',
  summary: 'Changes a draft (fields, text cleaned again, alt text, licenses) or replaces its package with one of the same type and slug; while published only image licenses may change.',
  access: AUTHORS,
  errors: ['PUBLISHING_ITEM_NOT_FOUND', 'PUBLISHING_ITEM_PUBLISHED', 'PUBLISHING_PACKAGE_MISMATCH', ...PACKAGE_CODES, 'PUBLISHING_ITEM_EXISTS', 'PUBLISHING_ITEM_INVALID', ...UNAVAILABLE_CODES],
  sideEffects: ['Writes public_content', 'Writes content_asset', 'Writes content_revision', 'Writes audit_log', 'Removes R2 objects of a replaced package'],
  request: { params: PublishingItemParams, body: { content: json(PublishingItemUpdateBody), required: true } },
  responses: {
    200: itemReply,
    404: error('No item has that id (PUBLISHING_ITEM_NOT_FOUND), or the package is not stored (PUBLISHING_PACKAGE_NOT_FOUND).'),
    409: error('The item is published and only licenses may change (PUBLISHING_ITEM_PUBLISHED), or another item has that address (PUBLISHING_ITEM_EXISTS).'),
    422: error('The new package has another type or slug (PUBLISHING_PACKAGE_MISMATCH), is not valid (PUBLISHING_PACKAGE_KEY_INVALID, PUBLISHING_PACKAGE_REFUSED), or a field is missing (PUBLISHING_ITEM_INVALID).'),
    503: itemsUnavailable503,
  },
})

export const publishPublishingItemRoute = defineRoute({
  method: 'post',
  path: '/v1/publishing/items/{itemId}/publish',
  feature: 'publishing',
  summary: 'Publishes an item: summary, text, thumbnail alt text and a license on every image are required; writes the published document to past-publications/ and a publication event.',
  access: AUTHORS,
  errors: ['PUBLISHING_ITEM_NOT_FOUND', 'PUBLISHING_PUBLISH_REFUSED', ...UNAVAILABLE_CODES],
  sideEffects: ['Writes an R2 object (past-publications/)', 'Writes public_content', 'Writes publication_event', 'Writes audit_log'],
  request: { params: PublishingItemParams, body: { content: json(PublishingActionBody), required: true } },
  responses: {
    200: itemReply,
    404: error('No item of that type has that id (PUBLISHING_ITEM_NOT_FOUND).'),
    422: error('The item cannot be published yet (PUBLISHING_PUBLISH_REFUSED); `details.problems` lists the reasons (`PUBLISH_REQUIRES_...`).'),
    503: itemsUnavailable503,
  },
})

const takeDownRoute = (action: 'unpublish' | 'archive', summary: string) =>
  defineRoute({
    method: 'post',
    path: `/v1/publishing/items/{itemId}/${action}`,
    feature: 'publishing',
    summary,
    access: AUTHORS,
    errors: ['PUBLISHING_ITEM_NOT_FOUND', 'PUBLISHING_ITEM_NOT_PUBLISHED', ...UNAVAILABLE_CODES],
    sideEffects: ['Writes public_content', 'Writes publication_event', 'Writes audit_log'],
    request: { params: PublishingItemParams, body: { content: json(PublishingActionBody), required: true } },
    responses: {
      200: itemReply,
      404: error('No item of that type has that id (PUBLISHING_ITEM_NOT_FOUND).'),
      409: error('The item is not published (PUBLISHING_ITEM_NOT_PUBLISHED).'),
      503: itemsUnavailable503,
    },
  })

export const unpublishPublishingItemRoute = takeDownRoute('unpublish', 'Takes a published item down: it becomes archived with its unpublished time set, and a publication event is recorded.')
export const archivePublishingItemRoute = takeDownRoute('archive', 'Archives a published item, and a publication event is recorded.')

export const deletePublishingItemRoute = defineRoute({
  method: 'delete',
  path: '/v1/publishing/items/{itemId}',
  feature: 'publishing',
  summary: 'Deletes an item that is not published, with its images, revisions and events, then removes its R2 objects (super admin, typed confirmation).',
  access: SUPER_ADMIN,
  errors: ['PUBLISHING_ITEM_NOT_FOUND', 'PUBLISHING_ITEM_PUBLISHED', 'PUBLISHING_DELETE_CONFIRMATION_MISMATCH', ...UNAVAILABLE_CODES],
  sideEffects: ['Deletes public_content (content_asset, content_revision, publication_event cascade)', 'Writes audit_log', 'Removes R2 objects'],
  request: { params: PublishingItemParams, body: { content: json(PublishingDeleteBody), required: true } },
  responses: {
    200: { description: 'Deleted.', content: json(successEnvelope(PublishingDeletedData)) },
    404: error('No item has that id (PUBLISHING_ITEM_NOT_FOUND).'),
    409: error('The item is published (PUBLISHING_ITEM_PUBLISHED).'),
    422: error('The confirmation is not `Delete <display code>` (PUBLISHING_DELETE_CONFIRMATION_MISMATCH).'),
    503: itemsUnavailable503,
  },
})

export const publishingPackageFileRoute = defineRoute({
  method: 'get',
  path: '/v1/publishing/items/{itemId}/package',
  feature: 'publishing',
  summary: 'The source ZIP of an item, as a download named <display code>-<slug>.zip (not cached).',
  access: AUTHORS,
  errors: ['PUBLISHING_ITEM_NOT_FOUND', 'PUBLISHING_PACKAGE_NOT_FOUND', 'PUBLISHING_UNAVAILABLE', 'PUBLISHING_STORAGE_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: PublishingItemParams },
  responses: {
    200: fileReply('The ZIP.', 'application/zip'),
    404: error('No item has that id (PUBLISHING_ITEM_NOT_FOUND), or its ZIP is not stored (PUBLISHING_PACKAGE_NOT_FOUND).'),
    503: itemsUnavailable503,
  },
})

export const publishingAssetRoute = defineRoute({
  method: 'get',
  path: '/v1/publishing/assets/{assetKey}',
  feature: 'publishing',
  summary: 'A draft image or article stylesheet by its R2 key (images/ and stylesheets/ only), sent private and not cached.',
  access: AUTHORS,
  errors: ['PUBLISHING_ASSET_NOT_FOUND', 'PUBLISHING_UNAVAILABLE', 'PUBLISHING_STORAGE_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: PublishingAssetParams },
  responses: {
    200: fileReply('The image or stylesheet.', 'application/octet-stream'),
    404: error('No such draft file, or the key is not an images/ or stylesheets/ key (PUBLISHING_ASSET_NOT_FOUND).'),
    503: itemsUnavailable503,
  },
})

/** Maps a refusal or an outside failure to its reply; anything else is thrown on. */
function publishingFailure(c: Context<AppEnv>, caught: unknown) {
  if (caught instanceof PublishingError) {
    logLine('PUBLISHING:refused', c.get('requestId'), { code: caught.code, problems: caught.details?.problems.length })
    return failure(c, caught.status, caught.code, caught.message, caught.details)
  }
  if (caught instanceof PublishingMigrationRequiredError) {
    logLine('PUBLISHING:migration_required', c.get('requestId'), { migration: 'Migration_Patch031_11_13_content_asset_license.sql' })
    return failure(c, 503, 'PUBLISHING_MIGRATION_REQUIRED', 'Front End Publishing needs the image license migration (031) to be applied.')
  }
  if (caught instanceof ArticleStorageError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'PUBLISHING', message: caught.message }))
    return failure(c, 503, 'PUBLISHING_STORAGE_UNAVAILABLE', 'The articles bucket cannot be reached right now.')
  }
  if (caught instanceof PublishingUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'PUBLISHING', message: caught.message }))
    return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'Front End Publishing is not available right now.')
  }
  throw caught
}

/** What a handler gets: the queries, the bucket and the context for writes. */
interface Parts {
  queries: PublishingQueries
  storage: ArticleStorage
  context: PublishingContext
}

/**
 * Registers one items route. Typed loosely on purpose, as Tasks' and Leads' are: every route shares the shape. A
 * missing database or bucket binding answers 503 `PUBLISHING_UNAVAILABLE`. A handler returns either data (sent in
 * the envelope) or a `Response` (a file).
 */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, work: (parts: Parts, c: Context<AppEnv>) => Promise<unknown>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = publishingQueriesFor(c.env)
    const storage = articleStorageFor(c.env as { ARTICLES?: R2Bucket } | undefined)
    const session = c.get('session')
    if (!queries || !storage || !session) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'Front End Publishing is not available right now.')
    const requestId = c.get('requestId')
    const context: PublishingContext = {
      queries,
      storage,
      actor: { userId: session.userId, email: session.email ?? '', role: session.role ?? '', requestId },
      now: new Date().toISOString(),
      log: (logTag, meta) => logLine(logTag, requestId, meta),
    }
    try {
      const data = await work({ queries, storage, context }, c)
      if (data instanceof Response) return data
      logLine(`PUBLISHING:${tag}`, requestId, { route: route.path })
      return c.json({ ok: true as const, data, requestId }, 200)
    } catch (caught) {
      return publishingFailure(c, caught)
    }
  }) as any)
}

const valid = <T,>(c: Context<AppEnv>, part: 'param' | 'query' | 'json' | 'form') => (c.req as any).valid(part) as T
const itemIdOf = (c: Context<AppEnv>) => valid<PublishingItemParams>(c, 'param').itemId

export function registerPublishing(app: OpenAPIHono<AppEnv>) {
  app.openapi(articlePromptRoute, async (c) => {
    const queries = publishingQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
    try {
      const row = await queries.articlePrompt()
      return c.json({ ok: true as const, data: row ?? { prompt: '', updatedAt: null }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof PublishingUnavailableError) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
      throw error
    }
  })

  app.openapi(saveArticlePromptRoute, async (c) => {
    const queries = publishingQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
    try {
      const now = new Date().toISOString()
      const { prompt } = c.req.valid('json')
      await queries.saveArticlePrompt(prompt, now, {
        requestId: c.get('requestId'),
        actorUserId: session.userId,
        actorEmail: session.email ?? null,
        actorRole: session.role ?? null,
        resource: 'publishing',
        action: 'UPDATE',
        targetTable: 'lookup',
        targetId: 'lk_kr_article_helper_prompt_upload_article',
        newJson: { characters: prompt.length },
      })
      logLine('PUBLISHING:article_prompt', c.get('requestId'), { characters: prompt.length })
      return c.json({ ok: true as const, data: { prompt, updatedAt: now }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof PublishingUnavailableError) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
      throw error
    }
  })

  // Fixed paths before `{itemId}`.
  handle(app, publishingItemsRoute, 'list', ({ queries, context }, c) => listItems(queries, context.actor, valid<PublishingItemsQuery>(c, 'query')))
  handle(app, publishingPackageRoute, 'package', ({ context }, c) => {
    const form = valid<{ contentType: 'article' | 'answer'; file: unknown }>(c, 'form')
    return checkPackage(context, { file: form.file, contentType: form.contentType })
  })
  handle(app, createPublishingItemRoute, 'create', ({ context }, c) => createItem(context, valid<PublishingItemCreateBody>(c, 'json')))
  handle(app, publishingAssetRoute, 'asset', async ({ storage }, c) => {
    const file = await readAsset(storage, valid<PublishingAssetParams>(c, 'param').assetKey)
    return new Response(file.body, { status: 200, headers: file.headers })
  })
  handle(app, publishingItemRoute, 'get', ({ queries }, c) => getItem(queries, itemIdOf(c)))
  handle(app, updatePublishingItemRoute, 'update', ({ context }, c) => updateItem(context, itemIdOf(c), valid<PublishingItemUpdateBody>(c, 'json')))
  handle(app, publishPublishingItemRoute, 'publish', ({ context }, c) => publishItem(context, itemIdOf(c), valid<PublishingActionBody>(c, 'json')))
  handle(app, unpublishPublishingItemRoute, 'unpublish', ({ context }, c) => takeDownItem(context, itemIdOf(c), valid<PublishingActionBody>(c, 'json'), 'unpublish'))
  handle(app, archivePublishingItemRoute, 'archive', ({ context }, c) => takeDownItem(context, itemIdOf(c), valid<PublishingActionBody>(c, 'json'), 'archive'))
  handle(app, deletePublishingItemRoute, 'delete', ({ context }, c) => deleteItem(context, itemIdOf(c), valid<PublishingDeleteBody>(c, 'json')))
  handle(app, publishingPackageFileRoute, 'download', async ({ queries, storage }, c) => {
    const file = await readPackage(queries, storage, itemIdOf(c))
    return new Response(file.body, { status: 200, headers: file.headers })
  })
}
