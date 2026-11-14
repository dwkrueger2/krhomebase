'use client'
// file: apps/web/features/publishing/api.client.ts
/**
 * The publishing area's calls to the API from the browser.
 *
 * Settings plan, stage 4a (the article prompt; the GET is open to super admin and front-end author, the PUT to super
 * admin):
 *
 *   GET /api/v1/publishing/article-prompt   the Upload Article GPT helper prompt
 *   PUT /api/v1/publishing/article-prompt   save it
 *
 * The prompt is a `lookup` settings row written only by the API (see the lookup table as described in Schema 8.0:
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table").
 *
 * Front End Publishing (plan 10, stage 6; super admin and front-end author, delete super admin only):
 *
 *   GET    /api/v1/publishing/items                    articles and answers, newest first, paged (D10)
 *   GET    /api/v1/publishing/items/{itemId}           one item with its text, images, licenses and publish problems
 *   POST   /api/v1/publishing/packages                 check one ZIP package (multipart `contentType`, `file`)
 *   POST   /api/v1/publishing/items                    a draft from the checked package (`packageKey`)
 *   PATCH  /api/v1/publishing/items/{itemId}           change a draft, or image licenses on any item (D25)
 *   POST   /api/v1/publishing/items/{itemId}/publish   publish
 *   POST   /api/v1/publishing/items/{itemId}/unpublish take a published item down
 *   POST   /api/v1/publishing/items/{itemId}/archive   archive a published item
 *   DELETE /api/v1/publishing/items/{itemId}           delete (body `confirmation: "Delete <display code>"`)
 *   GET    /api/v1/publishing/items/{itemId}/package   the source ZIP (a link: `packageDownloadUrl`)
 *   GET    /api/v1/publishing/assets/{assetKey}        a draft image or `article.css` (`draftAssetUrl` in contracts)
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract (`@krhomebase/contracts`,
 * `publishing.ts`); a failure throws `PublishingApiError` with the API's code, a plain sentence, and for a refused
 * package, draft or publish the API's `details.problems` and `details.warnings` in the old wording
 * (`PACKAGE_REQUIRES_...`, `PUBLISH_REQUIRES_...`). Saves and uploads go to the live database and the articles bucket
 * (`kr-homebase-articles-dev` under `pnpm dev`).
 */

import {
  ArticlePackageCheckData,
  ArticlePromptData,
  ErrorEnvelope,
  PublishingDeletedData,
  PublishingItemData,
  PublishingItemsData,
  PublishingProblems,
  successEnvelope,
  type ContentStatus,
  type ContentType,
  type PublishingItem,
  type PublishingItemCreateBody,
  type PublishingItemUpdateBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/**
 * A refused or failed publishing call: the API's code, a plain sentence, the HTTP status, the request id, and the
 * problem and warning lists of a refused package, draft or publish (empty otherwise).
 */
export class PublishingApiError extends Error {
  readonly problems: readonly string[]
  readonly warnings: readonly string[]

  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    lists: { problems?: readonly string[]; warnings?: readonly string[] } = {},
  ) {
    super(message)
    this.name = 'PublishingApiError'
    this.problems = lists.problems ?? []
    this.warnings = lists.warnings ?? []
  }
}

/** The notice shown in place of the list while migration 031 (image licenses) is not applied. */
export const PUBLISHING_MIGRATION_NOTICE = 'Image licenses need database migration 031 before articles can be listed or saved.'

/**
 * One plain sentence for each shared code. The publishing feature's own refusals (`PUBLISHING_PACKAGE_REFUSED`,
 * `PUBLISHING_ITEM_PUBLISHED`, ...) already carry a plain sentence from the API, which is shown as sent.
 */
export const PUBLISHING_ERROR_SENTENCES: Readonly<Record<string, string>> = {
  PUBLISHING_UNAVAILABLE: 'Front End Publishing cannot be reached right now. Try again in a moment.',
  PUBLISHING_STORAGE_UNAVAILABLE: 'The articles bucket cannot be reached right now. Try again in a moment.',
  PUBLISHING_MIGRATION_REQUIRED: PUBLISHING_MIGRATION_NOTICE,
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  MAINTENANCE_GATE_UNAVAILABLE: 'Changes cannot be checked for maintenance right now. Try again in a moment.',
  SESSION_VALIDATION_UNAVAILABLE: 'Your session cannot be checked right now. Try again in a moment.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  // The old screen's permission notice (ArticleEditCard), for the API's 403.
  FORBIDDEN: 'Front End Publishing is limited to Super Admin and Front End Author roles.',
  VALIDATION_FAILED: 'Something sent to Front End Publishing is missing or not allowed.',
  INTERNAL_ERROR: 'Something went wrong in KR Homebase. Try again.',
  NETWORK_ERROR: 'KR Homebase could not be reached. Check the connection and try again.',
  UNEXPECTED_REPLY: 'KR Homebase sent a reply the screen could not read. Try again.',
}

/** The prompt card's own wording for the two codes whose general sentence does not fit it. */
const PROMPT_SENTENCES: Readonly<Record<string, string>> = {
  PUBLISHING_UNAVAILABLE: 'The prompt cannot be read or saved right now. Try again in a moment.',
  FORBIDDEN: 'Only a super admin may change the article prompt.',
  VALIDATION_FAILED: 'The prompt must hold 1 to 50,000 characters.',
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function reach(path: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(path, { credentials: 'same-origin', ...init })
  } catch (error) {
    L(`[PUBLISHING_API:108] network failure ${what} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new PublishingApiError('NETWORK_ERROR', PUBLISHING_ERROR_SENTENCES.NETWORK_ERROR!, 0, null)
  }
}

/** Builds the error for a refused reply; the problem lists come from `details` when they are there. */
function refusal(response: Response, reply: unknown, what: string, sentences: Readonly<Record<string, string>> = {}): PublishingApiError {
  const parsed = ErrorEnvelope.safeParse(reply)
  const code = parsed.success ? parsed.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = parsed.success ? (parsed.data.requestId ?? null) : null
  const lists = parsed.success ? PublishingProblems.safeParse(parsed.data.error.details) : null
  L(`[PUBLISHING_API:119] refused ${what} status=${response.status} code=${code} problems=${lists?.success ? lists.data.problems.length : 0} requestId=${requestId ?? '-'}`)
  const message = sentences[code] ?? PUBLISHING_ERROR_SENTENCES[code] ?? (parsed.success ? parsed.data.error.message : 'The request did not finish.')
  return new PublishingApiError(code, message, response.status, requestId, lists?.success ? lists.data : {})
}

async function send<T extends z.ZodTypeAny>(schema: T, method: Method, path: string, body?: unknown, what = path, sentences?: Readonly<Record<string, string>>): Promise<z.infer<T>> {
  const response = await reach(
    path,
    { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    `${method} ${what}`,
  )
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  throw refusal(response, reply, `${method} ${what}`, sentences)
}

// ---------------------------------------------------------------------------------------------------------------
// The article prompt (Settings plan, stage 4a)
// ---------------------------------------------------------------------------------------------------------------

/** Reads the Upload Article GPT helper prompt (empty until one is saved). */
export function fetchArticlePrompt(): Promise<ArticlePromptData> {
  return send(ArticlePromptData, 'GET', '/api/v1/publishing/article-prompt', undefined, 'article-prompt', PROMPT_SENTENCES)
}

/** Saves the Upload Article GPT helper prompt. */
export function saveArticlePrompt(prompt: string): Promise<ArticlePromptData> {
  return send(ArticlePromptData, 'PUT', '/api/v1/publishing/article-prompt', { prompt }, 'article-prompt', PROMPT_SENTENCES)
}

// ---------------------------------------------------------------------------------------------------------------
// Articles and answers (plan 10, stage 6)
// ---------------------------------------------------------------------------------------------------------------

/** Items per page asked of the API (its default). */
export const PUBLISHING_PAGE_SIZE = 50

/** What the list asks for; every field is optional (the API's defaults: every status and type, 50 a page). */
export interface PublishingItemsRequest {
  status?: ContentStatus
  contentType?: ContentType
  limit?: number
  cursor?: string | null
}

const itemPath = (itemId: string) => `/api/v1/publishing/items/${encodeURIComponent(itemId)}`

/** One page of articles and answers, newest first (last changed, else created). */
export function fetchPublishingItems(request: PublishingItemsRequest = {}): Promise<PublishingItemsData> {
  const query = new URLSearchParams()
  if (request.status) query.set('status', request.status)
  if (request.contentType) query.set('contentType', request.contentType)
  query.set('limit', String(request.limit ?? PUBLISHING_PAGE_SIZE))
  if (request.cursor) query.set('cursor', request.cursor)
  return send(PublishingItemsData, 'GET', `/api/v1/publishing/items?${query.toString()}`, undefined, 'items')
}

/** One item with its cleaned text, its images and their licenses, and its publish problems. */
export async function fetchPublishingItem(itemId: string): Promise<PublishingItem> {
  return (await send(PublishingItemData, 'GET', itemPath(itemId), undefined, 'item')).item
}

/**
 * Checks one ZIP package and stores its files (nothing is saved to the item tables yet). A refused package throws
 * `PublishingApiError` with code `PUBLISHING_PACKAGE_REFUSED` and every reason in `problems`.
 */
export async function checkArticlePackage(contentType: ContentType, file: File): Promise<ArticlePackageCheckData> {
  const form = new FormData()
  form.set('contentType', contentType)
  form.set('file', file)
  const response = await reach('/api/v1/publishing/packages', { method: 'POST', body: form }, 'POST packages')
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(ArticlePackageCheckData).safeParse(reply)
  if (response.ok && parsed.success) return parsed.data.data
  throw refusal(response, reply, 'POST packages')
}

/** Saves a new draft from the checked package; the API reads the ZIP again and makes every key itself (D22). */
export async function createPublishingItem(body: PublishingItemCreateBody): Promise<PublishingItem> {
  return (await send(PublishingItemData, 'POST', '/api/v1/publishing/items', body, 'items')).item
}

/** Changes the fields sent; while the item is published only `images[].license` may be sent. */
export async function updatePublishingItem(itemId: string, body: PublishingItemUpdateBody): Promise<PublishingItem> {
  return (await send(PublishingItemData, 'PATCH', itemPath(itemId), body, 'item')).item
}

/** The three status actions; each sends the item's type back as the API's check that the screen acts on that item. */
export type PublishingAction = 'publish' | 'unpublish' | 'archive'

async function act(itemId: string, contentType: ContentType, action: PublishingAction): Promise<PublishingItem> {
  return (await send(PublishingItemData, 'POST', `${itemPath(itemId)}/${action}`, { contentType }, action)).item
}

/** Publishes an item. A refusal lists every reason in `problems` (`PUBLISH_REQUIRES_...`). */
export function publishPublishingItem(itemId: string, contentType: ContentType): Promise<PublishingItem> {
  return act(itemId, contentType, 'publish')
}

/** Takes a published item down (it becomes archived, with its unpublished time set). */
export function unpublishPublishingItem(itemId: string, contentType: ContentType): Promise<PublishingItem> {
  return act(itemId, contentType, 'unpublish')
}

/** Archives a published item. */
export function archivePublishingItem(itemId: string, contentType: ContentType): Promise<PublishingItem> {
  return act(itemId, contentType, 'archive')
}

/** Runs one of the three status actions by name. */
export function runPublishingAction(action: PublishingAction, itemId: string, contentType: ContentType): Promise<PublishingItem> {
  return act(itemId, contentType, action)
}

/** Deletes an item that is not published (super admin). `confirmation` must be `Delete <display code>`. */
export function deletePublishingItem(itemId: string, confirmation: string): Promise<PublishingDeletedData> {
  return send(PublishingDeletedData, 'DELETE', itemPath(itemId), { confirmation }, 'item')
}

/** The address of an item's source ZIP (downloads as `<display code>-<slug>.zip`; not cached). */
export function packageDownloadUrl(itemId: string): string {
  return `${itemPath(itemId)}/package`
}

/** The file name from a `Content-Disposition` header, else the fallback (old `parseFileName`). */
export function parseFileName(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1])
    } catch {
      return fallback
    }
  }
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  return match?.[1] || fallback
}

/**
 * Reads an item's source ZIP from `packageDownloadUrl` (the old download dialog's `fetchZip`), so the dialog can
 * report a missing package per item. A refusal throws `PublishingApiError` (`PUBLISHING_PACKAGE_NOT_FOUND`, ...).
 */
export async function fetchPackageFile(itemId: string, fallbackName: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await reach(packageDownloadUrl(itemId), { method: 'GET', cache: 'no-store' }, 'GET package')
  if (!response.ok) {
    const reply: unknown = await response.json().catch(() => null)
    throw refusal(response, reply, 'GET package')
  }
  return { blob: await response.blob(), fileName: parseFileName(response.headers.get('Content-Disposition'), fallbackName) }
}
