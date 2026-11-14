// file: apps/api/src/features/publishing/rules.ts
/**
 * Business rules for Front End Publishing articles and answers (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`,
 * stage 6), ported from the old `/krhomebase/api/front-end-publishing` routes (`route.ts`, `package`, `download/[id]`,
 * `assets/[...key]`). As-is record: `docs/API/WorkStream_AsIs_Reference.md` section 6; decisions D22 to D25 of
 * section 8.1 (Nov 13, 2026). The package rules are in `articlePackage.ts`, the HTML and CSS rules in
 * `articleSanitizer.ts`, the bucket calls in `src/platform/articleStorage.ts`.
 *
 * Kept from the old routes: super admin and front-end author only, delete super admin only; the content id
 * `<type>_<slug>`; the canonical paths `/articles/<slug>` and `/answers/<pillar>/<topic>` (an answer's topic defaults
 * to its slug); the required fields (title, slug, summary, text; an article's category; an answer's pillar); the
 * category label `Answers` for an answer; the asset id `asset_` + 32 hex of the SHA-256 of its key; publish needs a
 * summary, text and the thumbnail's alt text, sets `published_at` and clears `archived_at`; unpublish and archive only
 * from published, both leave the item `archived` (unpublish also sets `unpublished_at`); each of the three adds a
 * `publication_event` (`pub_<uuid>`); every save adds a `content_revision` (`rev_<uuid>`); a published item is never
 * deleted; the R2 objects go with a deleted item; the source ZIP downloads as `<display code>-<slug>.zip`; draft
 * files are sent `private, no-store`.
 *
 * Changed (the requester's decisions and the points of section 6.5):
 * - D22, point 2: the draft is made from the stored ZIP, not from the browser. The save names the package by the key
 *   the package check returned; the API reads that ZIP from R2, checks it again, and makes every key, address and
 *   image row itself. Text sent by the screen is cleaned again with the allow-list, and keeps only this item's
 *   images. The old `saveDraft` stored whatever HTML, keys and manifest the browser sent.
 * - D25: every image needs a license. The package has no place for one, so licenses are given by image path on
 *   save or change; `publishProblems` adds `PUBLISH_REQUIRES_IMAGE_LICENSE:<path>` for each image without one, and
 *   Publish is refused while any remain. The license's recorder and time come from the session.
 * - Point 3: who created, changed, licensed and published comes from the session (the old code wrote null).
 * - Point 4: Publish writes the published document as one clean HTML document (head with the old `kr-*` publication
 *   meta tags and the article stylesheet inlined, body with the text) under a new key per publish,
 *   `past-publications/<type>/<slug>/<time>-<event id>.html`, so earlier publications are kept; the old route
 *   overwrote `.../current.html` and nested a whole document inside `<body>`. Draft image and stylesheet addresses
 *   are rewritten to the public site's `/assets/<key>` in that document, so the public Worker no longer needs to know
 *   the draft address. While an item is published only its image licenses may change (409
 *   `PUBLISHING_ITEM_PUBLISHED`); the old route changed the live title and summary at once.
 * - Unpublish writes no new document (the public Worker serves only published items); its event records the last
 *   published key.
 * - Point 5: a replaced package's old files are removed after the change is saved; a deleted item's files are
 *   removed after its rows (rows first, so a failed delete leaves everything in place); files that cannot be removed
 *   are listed in the reply and logged.
 * - Point 1: the article stylesheet works: it is stored with its `url(...)` pointed at the draft image addresses and
 *   served by `GET /v1/publishing/assets/{assetKey}`, and inlined into the published document.
 * - The text stored is the body only (the old one kept the whole document with its head).
 * - The list (D10) is newest first (last changed, else created), paged with a cursor, and says when more exist; the
 *   old one read the first 100 rows and sorted them by status.
 * - Delete takes a typed confirmation, `Delete <display code>` (the old screen used `window.confirm`).
 * - An answer's canonical path uses the pillar made URL safe (`/answers/estate-planning/...`); the old path used the
 *   pillar text as typed.
 * - A revision's `content_json` and an event's `snapshot_json` hold the fields without the text (the text is in
 *   `sanitized_html` and in the published document), to keep rows small.
 */

import {
  ARTICLE_PACKAGE_MAX_BYTES,
  CONTENT_ASSET_USAGES,
  draftAssetUrl,
  IMAGE_LICENSE_KINDS,
  PUBLISHING_DRAFT_ASSET_PREFIX,
  type ArticlePackageCheckData,
  type ContentAsset,
  type ContentType,
  type ImageLicense,
  type PublishingActionBody,
  type PublishingDeleteBody,
  type PublishingDeletedData,
  type PublishingImageInput,
  type PublishingItem,
  type PublishingItemCreateBody,
  type PublishingItemData,
  type PublishingItemsData,
  type PublishingItemsQuery,
  type PublishingItemSummary,
  type PublishingItemUpdateBody,
} from '@krhomebase/contracts'
import type { ArticleStorage } from '../../platform/articleStorage.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import { checkArticlePackage, keyStamp, sha256Hex, sourceKeyParts, type CheckedPackage } from './articlePackage.ts'
import { cleanArticleHtml, escapeAttribute, normalizeImageReference, slugValue, type ResolvedImage } from './articleSanitizer.ts'
import type { AssetRow, AssetWrite, ItemCursor, ItemRow, ItemWrite, PublishingQueries } from './queries.ts'

/** The old address prefix of draft images, still found in the text of items saved by the old app. */
const OLD_DRAFT_ASSET_PREFIX = '/krhomebase/api/front-end-publishing/assets/'
/** The public site's address of a published image (the public article Worker's `/assets/<key>`). */
const PUBLIC_ASSET_PREFIX = '/assets/'
/** Keys this area may serve or remove. */
const DRAFT_ASSET_KEY = /^(images|stylesheets)\/(article|answer)\/[a-z0-9-]+\/[a-z0-9._-]+$/
const OWNED_KEY_PREFIXES = ['source-uploads/', 'images/', 'stylesheets/', 'sanitized-snapshots/', 'past-publications/']

/** A refusal with its code, HTTP status and (for lists of problems) `details`. */
export class PublishingError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
    readonly details?: { problems: string[]; warnings: string[] },
  ) {
    super(message)
    this.name = 'PublishingError'
  }
}

/** The signed-in person, from the checked session. */
export interface PublishingActor {
  userId: string
  email: string
  role: string
  requestId: string
}

/** What every write needs. */
export interface PublishingContext {
  queries: PublishingQueries
  storage: ArticleStorage
  actor: PublishingActor
  /** ISO time of the request. */
  now: string
  /** Logs a file that could not be removed (never throws). */
  log?: (tag: string, meta: Record<string, string | number>) => void
}

function auditFor(actor: PublishingActor, action: string, targetTable: string, targetId: string, newJson: unknown): AuditEntry {
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'publishing', action, targetTable, targetId, newJson }
}

const problemsError = (code: string, status: 422, message: string, problems: string[], warnings: string[] = []) => new PublishingError(code, status, message, { problems, warnings })

// ---------------------------------------------------------------------------------------------------------------
// Serializing
// ---------------------------------------------------------------------------------------------------------------

/** The stored manifest: `{ stylesheetKey, images }` (this API) or the old array of images (old rows, no stylesheet). */
export function stylesheetKeyOf(manifestJson: string | null): string | null {
  if (!manifestJson) return null
  try {
    const parsed: unknown = JSON.parse(manifestJson)
    const key = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { stylesheetKey?: unknown }).stylesheetKey : null
    return typeof key === 'string' && DRAFT_ASSET_KEY.test(key) && key.startsWith('stylesheets/') ? key : null
  } catch {
    return null
  }
}

/** Licensed means a kind and a source (the same rule as `UNLICENSED` in queries.ts). */
export function isLicensed(row: Pick<AssetRow, 'license_kind' | 'license_source'>): boolean {
  return Boolean(row.license_kind && (IMAGE_LICENSE_KINDS as readonly string[]).includes(row.license_kind) && row.license_source?.trim())
}

export function serializeAsset(row: AssetRow): ContentAsset {
  return {
    id: row.id,
    originalPath: row.original_relative_path,
    key: row.r2_key,
    url: draftAssetUrl(row.r2_key),
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    usage: (CONTENT_ASSET_USAGES as readonly string[]).includes(row.usage) ? (row.usage as ContentAsset['usage']) : 'body',
    altText: row.alt_text,
    license: isLicensed(row)
      ? {
          kind: row.license_kind as ImageLicense['kind'],
          source: row.license_source!.trim(),
          reference: row.license_reference,
          attribution: row.license_attribution,
          recordedAt: row.license_recorded_at,
          recordedByUserId: row.license_recorded_by_user_id,
          recordedByName: row.license_recorded_by_name,
        }
      : null,
  }
}

export function serializeSummary(row: ItemRow): PublishingItemSummary {
  return {
    id: row.id,
    displayCode: row.display_code,
    contentType: row.content_type as ContentType,
    slug: row.slug,
    topicSlug: row.topic_slug,
    canonicalPath: row.canonical_path,
    title: row.title,
    summary: row.summary,
    status: row.status === 'published' || row.status === 'archived' ? row.status : 'draft',
    category: row.category,
    categoryLabel: row.category_label,
    pillar: row.pillar,
    authorDisplayName: row.author_display_name,
    thumbnailUrl: row.thumbnail_r2_key ? draftAssetUrl(row.thumbnail_r2_key) : row.thumbnail_public_url,
    thumbnailAlt: row.thumbnail_alt ?? '',
    imageCount: Number(row.image_count ?? 0),
    unlicensedImageCount: Number(row.unlicensed_image_count ?? 0),
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    updatedByUserId: row.updated_by_user_id,
    updatedByName: row.updated_by_name,
  }
}

/** Why Publish would be refused now, in the old wording, plus the license rule (D25). */
export function publishProblems(row: ItemRow, assets: AssetRow[]): string[] {
  const problems: string[] = []
  if (!row.summary?.trim()) problems.push('PUBLISH_REQUIRES_SUMMARY')
  if (!row.sanitized_html?.trim()) problems.push('PUBLISH_REQUIRES_SANITIZED_HTML')
  if ((row.thumbnail_r2_key || row.thumbnail_public_url) && !String(row.thumbnail_alt || '').trim()) problems.push('PUBLISH_REQUIRES_THUMBNAIL_ALT_TEXT')
  for (const asset of assets) if (!isLicensed(asset)) problems.push(`PUBLISH_REQUIRES_IMAGE_LICENSE:${asset.original_relative_path}`)
  return problems
}

export function serializeItem(row: ItemRow, assets: AssetRow[]): PublishingItem {
  const stylesheetKey = stylesheetKeyOf(row.asset_manifest_json)
  return {
    ...serializeSummary(row),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    readingTimeMinutes: row.reading_time_minutes,
    thumbnailKey: row.thumbnail_r2_key,
    html: row.sanitized_html ?? '',
    stylesheetUrl: stylesheetKey ? draftAssetUrl(stylesheetKey) : null,
    hasSourcePackage: Boolean(row.source_upload_r2_key),
    lastPublicationKey: row.last_publication_r2_key,
    assets: assets.map(serializeAsset),
    publishProblems: publishProblems(row, assets),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

/** The opaque page position: base64url of the last row's sort time and id. */
export function encodeCursor(row: Pick<ItemRow, 'sort_at' | 'id'>): string {
  return btoa(JSON.stringify([row.sort_at, row.id])).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function decodeCursor(value: string | undefined): ItemCursor | null {
  if (!value) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const parsed: unknown = JSON.parse(atob(padded))
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((part) => typeof part === 'string')) return { sortAt: parsed[0] as string, id: parsed[1] as string }
  } catch {
    // fall through
  }
  throw new PublishingError('PUBLISHING_CURSOR_INVALID', 422, 'That page position is not valid. Load the list again.')
}

/** One page of items, newest first, and what the viewer may do. Writes nothing. Code: `PUBLISHING_CURSOR_INVALID`. */
export async function listItems(q: PublishingQueries, actor: PublishingActor, query: PublishingItemsQuery): Promise<PublishingItemsData> {
  const rows = await q.listItems({ status: query.status, contentType: query.contentType }, decodeCursor(query.cursor), query.limit)
  const page = rows.slice(0, query.limit)
  const hasMore = rows.length > query.limit
  const last = page.at(-1)
  return {
    items: page.map(serializeSummary),
    hasMore,
    moreNote: hasMore ? `More items exist. Showing the newest ${page.length}; load the next page to see older ones.` : null,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    viewer: { canDelete: actor.role === 'super_admin' },
  }
}

async function requireItem(q: PublishingQueries, id: string): Promise<ItemRow> {
  const row = await q.item(id)
  if (!row) throw new PublishingError('PUBLISHING_ITEM_NOT_FOUND', 404, 'No article or answer has that id.')
  return row
}

/** One item with its images (404 `PUBLISHING_ITEM_NOT_FOUND`). Writes nothing. */
export async function getItem(q: PublishingQueries, id: string): Promise<PublishingItemData> {
  const row = await requireItem(q, id)
  return { item: serializeItem(row, await q.assets(row.id)) }
}

// ---------------------------------------------------------------------------------------------------------------
// The package check
// ---------------------------------------------------------------------------------------------------------------

/** Removes keys and reports the ones that failed (never throws). */
async function removeFiles(context: PublishingContext, keys: string[]): Promise<string[]> {
  const owned = Array.from(new Set(keys.filter((key) => OWNED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))))
  if (!owned.length) return []
  try {
    await context.storage.delete(owned)
    return []
  } catch (error) {
    context.log?.('PUBLISHING:files_not_removed', { count: owned.length, reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
    return owned
  }
}

/** Every R2 object of an accepted package: the ZIP, the images, the stylesheet and the cleaned snapshot. */
function packageObjects(pkg: CheckedPackage, zipBytes: Uint8Array): Array<{ key: string; body: Uint8Array | string; contentType: string }> {
  return [
    { key: pkg.sourceKey, body: zipBytes, contentType: 'application/zip' },
    ...pkg.images.map((image) => ({ key: image.key, body: image.bytes, contentType: image.mimeType })),
    ...(pkg.stylesheet ? [{ key: pkg.stylesheet.key, body: pkg.stylesheet.text, contentType: 'text/css; charset=utf-8' }] : []),
    { key: pkg.snapshotKey, body: pkg.html, contentType: 'text/html; charset=utf-8' },
  ]
}

/**
 * Checks one uploaded ZIP and stores its files in R2 under the old prefixes, with one `audit_log` row. Nothing is
 * written to the item tables (the screen then saves the draft with `packageKey`). A refused package answers 422
 * `PUBLISHING_PACKAGE_REFUSED` with every problem in `details.problems`. If a file or the audit row cannot be
 * stored, the files already stored are removed again.
 */
export async function checkPackage(context: PublishingContext, input: { file: unknown; contentType: ContentType }): Promise<ArticlePackageCheckData> {
  if (!(input.file instanceof File)) throw problemsError('PUBLISHING_PACKAGE_REFUSED', 422, 'Choose a ZIP package to upload.', ['PACKAGE_FILE_REQUIRED'])
  // The size is checked before the file is read into memory (the check repeats it on the bytes).
  if (input.file.size > ARTICLE_PACKAGE_MAX_BYTES) throw problemsError('PUBLISHING_PACKAGE_REFUSED', 422, 'The package is larger than 50 MB.', ['PACKAGE_ZIP_TOO_LARGE'])
  const zipBytes = new Uint8Array(await input.file.arrayBuffer())
  const result = await checkArticlePackage({ zipBytes, fileName: input.file.name || 'article-package.zip', contentType: input.contentType, stamp: keyStamp(new Date(context.now)) })
  if (!result.ok) throw problemsError('PUBLISHING_PACKAGE_REFUSED', 422, 'The package was refused. See the list of problems.', result.problems, result.warnings)
  const pkg = result.pkg
  const existing = await context.queries.itemFiles(pkg.contentId)

  const stored: string[] = []
  try {
    for (const object of packageObjects(pkg, zipBytes)) {
      await context.storage.put(object.key, object.body, object.contentType)
      stored.push(object.key)
    }
    await context.queries.recordPackage(auditFor(context.actor, 'PACKAGE_UPLOAD', 'r2_object', pkg.sourceKey, { contentId: pkg.contentId, images: pkg.images.length, stylesheet: Boolean(pkg.stylesheet), bytes: zipBytes.byteLength }))
  } catch (error) {
    await removeFiles(context, stored)
    throw error
  }

  return {
    accepted: true,
    contentId: pkg.contentId,
    existingStatus: existing ? (existing.status === 'published' || existing.status === 'archived' ? existing.status : 'draft') : null,
    packageKey: pkg.sourceKey,
    htmlFileName: pkg.htmlFileName,
    metadata: pkg.metadata,
    html: pkg.html,
    stylesheetUrl: pkg.stylesheet?.url ?? null,
    images: pkg.images.map((image) => ({
      originalPath: image.originalPath,
      key: image.key,
      url: image.url,
      mimeType: image.mimeType,
      fileSize: image.fileSize,
      width: image.width,
      height: image.height,
      usage: image.usage,
      altText: image.altText,
      sha256: image.sha256,
      licenseNeeded: true as const,
    })),
    keys: { sourceUpload: pkg.sourceKey, sanitizedSnapshot: pkg.snapshotKey, stylesheet: pkg.stylesheet?.key ?? null, images: pkg.images.map((image) => image.key) },
    warnings: pkg.warnings,
  }
}

/**
 * The package a save names, read from R2 and checked again (never trusted from the browser): the key must be a
 * `source-uploads/...` key (422 `PUBLISHING_PACKAGE_KEY_INVALID`), the ZIP must be stored (404
 * `PUBLISHING_PACKAGE_NOT_FOUND`), it must pass the check again (422 `PUBLISHING_PACKAGE_REFUSED`) and give back the
 * same key. Any of its files missing from R2 (removed in between) are stored again from the ZIP.
 */
async function storedPackage(context: PublishingContext, packageKey: string): Promise<CheckedPackage> {
  const parts = sourceKeyParts(packageKey)
  if (!parts) throw new PublishingError('PUBLISHING_PACKAGE_KEY_INVALID', 422, 'That is not a package key from the package check.')
  const zipBytes = await context.storage.getBytes(packageKey)
  if (!zipBytes) throw new PublishingError('PUBLISHING_PACKAGE_NOT_FOUND', 404, 'That package is not stored. Upload it again.')
  const result = await checkArticlePackage({ zipBytes, fileName: parts.fileName, contentType: parts.contentType, stamp: parts.stamp })
  if (!result.ok) throw problemsError('PUBLISHING_PACKAGE_REFUSED', 422, 'The stored package no longer passes the check.', result.problems, result.warnings)
  if (result.pkg.sourceKey !== packageKey) throw new PublishingError('PUBLISHING_PACKAGE_KEY_INVALID', 422, 'That package key does not match the package it names.')
  for (const object of packageObjects(result.pkg, zipBytes)) {
    if (!(await context.storage.exists(object.key))) await context.storage.put(object.key, object.body, object.contentType)
  }
  return result.pkg
}

// ---------------------------------------------------------------------------------------------------------------
// Saving a draft
// ---------------------------------------------------------------------------------------------------------------

/** An image of the item, as the cleaner and the save need it. */
interface ItemImage {
  originalPath: string
  key: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  usage: string
  altText: string
  sha256: string | null
  license: { kind: string; source: string; reference: string | null; attribution: string | null; recordedAt: string | null; recordedByUserId: string | null } | null
  createdAt: string
}

function imageFromRow(row: AssetRow): ItemImage {
  return {
    originalPath: row.original_relative_path,
    key: row.r2_key,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    usage: row.usage,
    altText: row.alt_text,
    sha256: row.sha256,
    license: isLicensed(row)
      ? { kind: row.license_kind!, source: row.license_source!.trim(), reference: row.license_reference, attribution: row.license_attribution, recordedAt: row.license_recorded_at, recordedByUserId: row.license_recorded_by_user_id }
      : null,
    createdAt: '',
  }
}

/**
 * The image an `<img src>` names, when it is one of this item's: its draft address (with or without the site
 * address in front), the old app's draft address, the public `/assets/<key>` address, or its path in the ZIP.
 */
export function imageResolver(images: ItemImage[]): (src: string) => ResolvedImage | null {
  const byKey = new Map(images.map((image) => [image.key, image]))
  const byPath = new Map(images.map((image) => [image.originalPath, image]))
  return (src) => {
    const raw = src.trim().replace(/^https?:\/\/[^/]+/i, '')
    let image: ItemImage | undefined
    for (const prefix of [PUBLISHING_DRAFT_ASSET_PREFIX, OLD_DRAFT_ASSET_PREFIX, PUBLIC_ASSET_PREFIX]) {
      if (!image && raw.startsWith(prefix)) {
        try {
          image = byKey.get(decodeURIComponent(raw.slice(prefix.length).split(/[?#]/)[0]!))
        } catch {
          image = undefined
        }
      }
    }
    if (!image) {
      const normalized = normalizeImageReference(src)
      if (normalized.ok) image = byPath.get(normalized.normalized)
    }
    return image ? { url: draftAssetUrl(image.key), altText: image.altText, width: image.width, height: image.height, originalPath: image.originalPath } : null
  }
}

/** Applies the body's alt text and licenses by image path (422 `PUBLISHING_ITEM_INVALID` for a path not in the item). */
function applyImageInputs(images: ItemImage[], inputs: PublishingImageInput[] | undefined, actor: PublishingActor, now: string, problems: string[]): ItemImage[] {
  const byPath = new Map(images.map((image) => [image.originalPath, { ...image }]))
  for (const input of inputs ?? []) {
    const image = byPath.get(input.originalPath)
    if (!image) {
      problems.push(`IMAGE_NOT_IN_ITEM:${input.originalPath}`)
      continue
    }
    if (input.altText !== undefined) image.altText = input.altText
    if (input.license === null) image.license = null
    else if (input.license) {
      const next = { kind: input.license.kind, source: input.license.source, reference: input.license.reference?.trim() || null, attribution: input.license.attribution?.trim() || null }
      const same = image.license && image.license.kind === next.kind && image.license.source === next.source && image.license.reference === next.reference && image.license.attribution === next.attribution
      image.license = same ? image.license : { ...next, recordedAt: now, recordedByUserId: actor.userId }
    }
  }
  return images.map((image) => byPath.get(image.originalPath)!)
}

/** The fields of a draft, before checking. */
interface DraftFields {
  title: string
  summary: string
  seoTitle: string | null
  seoDescription: string | null
  thumbnailAlt: string
  category: string | null
  categoryLabel: string | null
  pillar: string | null
  topicSlug: string | null
  readingTimeMinutes: number | null
  authorDisplayName: string | null
}

/** The body's fields over the defaults (the package's meta tags, or the stored item). */
function mergeFields(body: Partial<PublishingItemCreateBody>, defaults: DraftFields): DraftFields {
  const pick = <K extends keyof DraftFields>(key: K): DraftFields[K] => (body[key] === undefined ? defaults[key] : (body[key] as DraftFields[K]))
  return {
    title: (body.title ?? defaults.title).trim(),
    summary: (body.summary ?? defaults.summary).trim(),
    seoTitle: pick('seoTitle')?.trim() || null,
    seoDescription: pick('seoDescription')?.trim() || null,
    thumbnailAlt: (body.thumbnailAlt ?? defaults.thumbnailAlt).trim(),
    category: pick('category')?.trim() || null,
    categoryLabel: pick('categoryLabel')?.trim() || null,
    pillar: pick('pillar')?.trim() || null,
    topicSlug: pick('topicSlug')?.trim() || null,
    readingTimeMinutes: pick('readingTimeMinutes') ?? null,
    authorDisplayName: pick('authorDisplayName')?.trim() || null,
  }
}

function fieldsFromPackage(pkg: CheckedPackage): DraftFields {
  const m = pkg.metadata
  return {
    title: m.title,
    summary: m.summary,
    seoTitle: m.seoTitle || null,
    seoDescription: m.seoDescription || null,
    thumbnailAlt: m.thumbnailAlt,
    category: m.category,
    categoryLabel: m.categoryLabel,
    pillar: m.pillar,
    topicSlug: m.topicSlug,
    readingTimeMinutes: m.readingTimeMinutes === null ? null : Math.round(m.readingTimeMinutes),
    authorDisplayName: m.authorDisplayName,
  }
}

function fieldsFromRow(row: ItemRow): DraftFields {
  return {
    title: row.title,
    summary: row.summary,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    thumbnailAlt: row.thumbnail_alt ?? '',
    category: row.category,
    categoryLabel: row.category_label,
    pillar: row.pillar,
    topicSlug: row.topic_slug,
    readingTimeMinutes: row.reading_time_minutes,
    authorDisplayName: row.author_display_name,
  }
}

function imagesFromPackage(pkg: CheckedPackage, now: string): ItemImage[] {
  return pkg.images.map((image) => ({
    originalPath: image.originalPath,
    key: image.key,
    mimeType: image.mimeType,
    fileSize: image.fileSize,
    width: image.width,
    height: image.height,
    usage: image.usage,
    altText: image.altText,
    sha256: image.sha256,
    license: null,
    createdAt: now,
  }))
}

/** The `content_asset` rows of these images; the id is `asset_` and 32 hex of the SHA-256 of the key (old rule). */
async function assetWrites(images: ItemImage[], contentId: string, now: string): Promise<AssetWrite[]> {
  const rows: AssetWrite[] = []
  for (const image of images) {
    rows.push({
      id: `asset_${(await sha256Hex(image.key)).slice(0, 32)}`,
      contentId,
      originalPath: image.originalPath,
      key: image.key,
      publicUrl: draftAssetUrl(image.key),
      mimeType: image.mimeType,
      fileSize: image.fileSize,
      width: image.width,
      height: image.height,
      usage: image.usage,
      altText: image.altText,
      sha256: image.sha256,
      licenseKind: image.license?.kind ?? null,
      licenseSource: image.license?.source ?? null,
      licenseReference: image.license?.reference ?? null,
      licenseAttribution: image.license?.attribution ?? null,
      licenseRecordedAt: image.license?.recordedAt ?? null,
      licenseRecordedByUserId: image.license?.recordedByUserId ?? null,
      createdAt: image.createdAt || now,
    })
  }
  return rows
}

/** The stored item as it is (no field changed): for a license-only change of a published item. */
function unchangedItem(row: ItemRow, context: PublishingContext): ItemWrite {
  return {
    id: row.id,
    contentType: row.content_type,
    title: row.title,
    slug: row.slug,
    topicSlug: row.topic_slug,
    canonicalPath: row.canonical_path,
    summary: row.summary,
    thumbnailKey: row.thumbnail_r2_key,
    thumbnailUrl: row.thumbnail_public_url,
    thumbnailAlt: row.thumbnail_alt ?? '',
    html: row.sanitized_html,
    sourceKey: row.source_upload_r2_key,
    snapshotKey: row.sanitized_snapshot_r2_key,
    manifestJson: row.asset_manifest_json ?? '',
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    authorDisplayName: row.author_display_name,
    category: row.category,
    categoryLabel: row.category_label,
    pillar: row.pillar,
    readingTimeMinutes: row.reading_time_minutes,
    userId: context.actor.userId,
    now: context.now,
  }
}

interface DraftPlan {
  item: ItemWrite
  assets: AssetWrite[]
  contentJson: string
  manifestJson: string
}

/**
 * Builds and checks one draft (the old `validateSaveContent` and `publicContentCreateData`): the text is cleaned
 * again and keeps only this item's images; the required fields give `VALIDATION_..._REQUIRED` problems; an image
 * shown without alt text gives `IMAGE_ALT_TEXT_REQUIRED:<path>`. Refused: 422 `PUBLISHING_ITEM_INVALID`.
 */
async function planDraft(
  context: PublishingContext,
  base: { id: string; contentType: ContentType; slug: string; sourceKey: string | null; snapshotKey: string | null; stylesheetKey: string | null; html: string; thumbnailPath: string | null; thumbnailKey: string | null },
  fields: DraftFields,
  images: ItemImage[],
  sentHtml: string | undefined,
  problems: string[],
): Promise<DraftPlan> {
  const isArticle = base.contentType === 'article'
  const cleaned = cleanArticleHtml(sentHtml ?? base.html, imageResolver(images))
  for (const path of cleaned.imagesMissingAlt) problems.push(`IMAGE_ALT_TEXT_REQUIRED:${path}`)
  if (cleaned.droppedImages.length) context.log?.('PUBLISHING:images_dropped', { count: cleaned.droppedImages.length })

  const category = isArticle ? fields.category : null
  const pillar = isArticle ? null : fields.pillar
  const topicSlug = isArticle ? null : slugValue(fields.topicSlug ?? '') || base.slug
  if (!fields.title) problems.push('VALIDATION_TITLE_REQUIRED')
  if (!base.slug) problems.push('VALIDATION_SLUG_REQUIRED')
  if (!fields.summary) problems.push('VALIDATION_SUMMARY_REQUIRED')
  if (!cleaned.html) problems.push('VALIDATION_SANITIZED_HTML_REQUIRED')
  if (isArticle && !category) problems.push('VALIDATION_ARTICLE_CATEGORY_REQUIRED')
  if (!isArticle && !pillar) problems.push('VALIDATION_ANSWER_PILLAR_REQUIRED')
  if (problems.length) throw problemsError('PUBLISHING_ITEM_INVALID', 422, 'The draft was not saved. See the list of problems.', problems)

  const thumbnail = base.thumbnailPath ? images.find((image) => image.originalPath === base.thumbnailPath) : base.thumbnailKey ? images.find((image) => image.key === base.thumbnailKey) : undefined
  const assets = await assetWrites(images, base.id, context.now)
  const manifestJson = JSON.stringify({
    stylesheetKey: base.stylesheetKey,
    images: images.map((image) => ({ originalRelativePath: image.originalPath, r2Key: image.key, mimeType: image.mimeType, fileSize: image.fileSize, width: image.width, height: image.height, usage: image.usage, altText: image.altText, sha256: image.sha256 })),
  })
  const item: ItemWrite = {
    id: base.id,
    contentType: base.contentType,
    title: fields.title,
    slug: base.slug,
    topicSlug,
    canonicalPath: isArticle ? `/articles/${base.slug}` : `/answers/${slugValue(pillar ?? '') || 'pillar'}/${topicSlug}`,
    summary: fields.summary,
    thumbnailKey: thumbnail?.key ?? null,
    thumbnailUrl: thumbnail ? draftAssetUrl(thumbnail.key) : null,
    thumbnailAlt: fields.thumbnailAlt,
    html: cleaned.html,
    sourceKey: base.sourceKey,
    snapshotKey: base.snapshotKey,
    manifestJson,
    seoTitle: fields.seoTitle,
    seoDescription: fields.seoDescription,
    authorDisplayName: fields.authorDisplayName,
    category,
    categoryLabel: isArticle ? fields.categoryLabel || category : 'Answers',
    pillar,
    readingTimeMinutes: isArticle ? fields.readingTimeMinutes : null,
    userId: context.actor.userId,
    now: context.now,
  }
  const { html: _html, manifestJson: _manifest, ...withoutText } = item
  return { item, assets, contentJson: JSON.stringify(withoutText), manifestJson }
}

/**
 * Saves a new draft from a checked package (D22): the API reads the ZIP named by `packageKey` from R2, checks it
 * again and makes the keys, image rows and text itself; the body's fields, alt text, licenses and edited text (cleaned
 * again) go over the package's values. One batch: `public_content`, `content_asset`, `content_revision`, `audit_log`.
 * Codes: `PUBLISHING_PACKAGE_KEY_INVALID`, `PUBLISHING_PACKAGE_NOT_FOUND`, `PUBLISHING_PACKAGE_REFUSED`,
 * `PUBLISHING_ITEM_EXISTS` (the id, path or slug is taken: change that item instead), `PUBLISHING_ITEM_INVALID`.
 */
export async function createItem(context: PublishingContext, body: PublishingItemCreateBody): Promise<PublishingItemData> {
  const parts = sourceKeyParts(body.packageKey)
  if (!parts) throw new PublishingError('PUBLISHING_PACKAGE_KEY_INVALID', 422, 'That is not a package key from the package check.')
  if (await context.queries.itemFiles(`${parts.contentType}_${parts.slug}`)) throw new PublishingError('PUBLISHING_ITEM_EXISTS', 409, 'An item with that slug already exists. Replace its package instead.')
  const pkg = await storedPackage(context, body.packageKey)
  const problems: string[] = []
  const images = applyImageInputs(imagesFromPackage(pkg, context.now), body.images, context.actor, context.now, problems)
  const thumbnailPath = normalizeImageReference(pkg.metadata.thumbnailSrc)
  const plan = await planDraft(
    context,
    { id: pkg.contentId, contentType: pkg.contentType, slug: pkg.slug, sourceKey: pkg.sourceKey, snapshotKey: pkg.snapshotKey, stylesheetKey: pkg.stylesheet?.key ?? null, html: pkg.html, thumbnailPath: thumbnailPath.ok ? thumbnailPath.normalized : null, thumbnailKey: null },
    mergeFields(body, fieldsFromPackage(pkg)),
    images,
    body.html,
    problems,
  )
  const saved = await context.queries.insertItem(
    plan.item,
    plan.assets,
    { id: `rev_${crypto.randomUUID()}`, contentId: plan.item.id, contentJson: plan.contentJson, html: plan.item.html, manifestJson: plan.manifestJson, userId: context.actor.userId, note: 'Draft created from package', now: context.now },
    auditFor(context.actor, 'CREATE', 'public_content', plan.item.id, { contentType: plan.item.contentType, slug: plan.item.slug, images: plan.assets.length, licensed: plan.assets.filter((asset) => asset.licenseKind).length }),
  )
  if (saved === 'conflict') throw new PublishingError('PUBLISHING_ITEM_EXISTS', 409, 'An item with that slug or address already exists. Change that item instead.')
  return getItem(context.queries, plan.item.id)
}

/** Only image licenses were sent (the one change allowed while an item is published). */
function onlyLicenses(body: PublishingItemUpdateBody): boolean {
  return Object.entries(body).every(([key, value]) => value === undefined || (key === 'images' && (value as PublishingImageInput[]).every((image) => image.altText === undefined)))
}

/**
 * Changes an item. With `packageKey`, a newly checked package of the same type and slug replaces the old one (422
 * `PUBLISHING_PACKAGE_MISMATCH` otherwise): its images replace the old ones, an unchanged image (same key, so same
 * bytes) keeps its license, and the old files no longer used are removed after the save. Without it, the fields and
 * images sent change and the text (sent or stored) is cleaned again. While published, only image licenses may change
 * (409 `PUBLISHING_ITEM_PUBLISHED`). One batch with a revision and the audit row. Codes: `PUBLISHING_ITEM_NOT_FOUND`,
 * the package codes of `createItem`, `PUBLISHING_ITEM_INVALID`, `PUBLISHING_ITEM_EXISTS`.
 */
export async function updateItem(context: PublishingContext, id: string, body: PublishingItemUpdateBody): Promise<PublishingItemData> {
  const row = await requireItem(context.queries, id)
  if (row.status === 'published' && !onlyLicenses(body)) {
    throw new PublishingError('PUBLISHING_ITEM_PUBLISHED', 409, 'A published item can only have its image licenses changed. Unpublish it to change anything else.')
  }
  const currentRows = await context.queries.assets(row.id)
  const contentType = row.content_type as ContentType
  const problems: string[] = []
  const current = currentRows.map((asset) => ({ ...imageFromRow(asset), createdAt: asset.created_at ?? context.now }))

  // A published item: only the image licenses change; the text and every other field stay exactly as published.
  if (row.status === 'published') {
    const licensed = applyImageInputs(current, body.images, context.actor, context.now, problems)
    if (problems.length) throw problemsError('PUBLISHING_ITEM_INVALID', 422, 'The licenses were not saved. See the list of problems.', problems)
    const item = unchangedItem(row, context)
    const { html: _html, manifestJson: _manifest, ...withoutText } = item
    await context.queries.updateItem(
      item,
      await assetWrites(licensed, row.id, context.now),
      [],
      { id: `rev_${crypto.randomUUID()}`, contentId: row.id, contentJson: JSON.stringify(withoutText), html: item.html, manifestJson: item.manifestJson, userId: context.actor.userId, note: 'Image licenses changed', now: context.now },
      auditFor(context.actor, 'LICENSE', 'content_asset', row.id, { images: (body.images ?? []).map((image) => image.originalPath) }),
    )
    return getItem(context.queries, row.id)
  }

  let pkg: CheckedPackage | null = null
  if (body.packageKey) {
    const parts = sourceKeyParts(body.packageKey)
    if (parts && (parts.contentType !== contentType || parts.slug !== row.slug)) throw new PublishingError('PUBLISHING_PACKAGE_MISMATCH', 422, 'The new package must have the same type and slug as the item.')
    pkg = await storedPackage(context, body.packageKey)
  }

  let images: ItemImage[]
  if (pkg) {
    const kept = new Map(current.map((image) => [image.key, image]))
    images = imagesFromPackage(pkg, context.now).map((image) => {
      const before = kept.get(image.key)
      return before ? { ...image, license: before.license, createdAt: before.createdAt } : image
    })
  } else images = current
  images = applyImageInputs(images, body.images, context.actor, context.now, problems)

  const stylesheetKey = pkg ? (pkg.stylesheet?.key ?? null) : stylesheetKeyOf(row.asset_manifest_json)
  const thumbnailPath = pkg ? normalizeImageReference(pkg.metadata.thumbnailSrc) : null
  const plan = await planDraft(
    context,
    {
      id: row.id,
      contentType,
      slug: row.slug,
      sourceKey: pkg ? pkg.sourceKey : row.source_upload_r2_key,
      snapshotKey: pkg ? pkg.snapshotKey : row.sanitized_snapshot_r2_key,
      stylesheetKey,
      html: pkg ? pkg.html : row.sanitized_html,
      thumbnailPath: thumbnailPath?.ok ? thumbnailPath.normalized : null,
      thumbnailKey: pkg ? null : row.thumbnail_r2_key,
    },
    mergeFields(body, pkg ? { ...fieldsFromPackage(pkg) } : fieldsFromRow(row)),
    images,
    body.html,
    problems,
  )
  // A stored item from the old app may keep its old thumbnail address when no image row matches it.
  if (!pkg && !plan.item.thumbnailKey && row.thumbnail_public_url && !row.thumbnail_r2_key) plan.item.thumbnailUrl = row.thumbnail_public_url
  if (!pkg && !plan.item.thumbnailKey && row.thumbnail_r2_key) {
    plan.item.thumbnailKey = row.thumbnail_r2_key
    plan.item.thumbnailUrl = row.thumbnail_public_url
  }

  const keptIds = new Set(plan.assets.map((asset) => asset.id))
  const removed = currentRows.filter((asset) => !keptIds.has(asset.id))
  const saved = await context.queries.updateItem(
    plan.item,
    plan.assets,
    removed.map((asset) => asset.id),
    { id: `rev_${crypto.randomUUID()}`, contentId: row.id, contentJson: plan.contentJson, html: plan.item.html, manifestJson: plan.manifestJson, userId: context.actor.userId, note: pkg ? 'Package replaced' : 'Draft changed', now: context.now },
    auditFor(context.actor, 'UPDATE', 'public_content', row.id, { fields: Object.keys(body).filter((key) => body[key as keyof PublishingItemUpdateBody] !== undefined), packageReplaced: Boolean(pkg), removedImages: removed.length }),
  )
  if (saved === 'conflict') throw new PublishingError('PUBLISHING_ITEM_EXISTS', 409, 'Another item already has that address.')
  if (pkg) {
    const oldStylesheet = stylesheetKeyOf(row.asset_manifest_json)
    const stale = [
      ...removed.map((asset) => asset.r2_key),
      ...(row.source_upload_r2_key && row.source_upload_r2_key !== pkg.sourceKey ? [row.source_upload_r2_key] : []),
      ...(row.sanitized_snapshot_r2_key && row.sanitized_snapshot_r2_key !== pkg.snapshotKey ? [row.sanitized_snapshot_r2_key] : []),
      ...(oldStylesheet && oldStylesheet !== stylesheetKey ? [oldStylesheet] : []),
    ]
    await removeFiles(context, stale)
  }
  return getItem(context.queries, row.id)
}

// ---------------------------------------------------------------------------------------------------------------
// Publish, unpublish, archive
// ---------------------------------------------------------------------------------------------------------------

async function requireItemOfType(q: PublishingQueries, id: string, contentType: ContentType): Promise<ItemRow> {
  const row = await q.item(id)
  if (!row || row.content_type !== contentType) throw new PublishingError('PUBLISHING_ITEM_NOT_FOUND', 404, 'No article or answer of that type has that id.')
  return row
}

function escapeHtml(value: string): string {
  return escapeAttribute(value)
}

/** The item's fields for `publication_event.snapshot_json` (no text). */
function eventSnapshot(row: ItemRow, status: string, at: Record<string, string | null>): string {
  const { sanitized_html: _html, created_by_name: _c, updated_by_name: _u, image_count: _i, unlicensed_image_count: _l, sort_at: _s, ...fields } = row
  return JSON.stringify({ ...fields, ...at, status })
}

/**
 * The published document (D22, point 4): one clean HTML document with the old `kr-*` publication meta tags in its
 * head, the article stylesheet inlined (`</style` cannot close it early), and the text in its body, every draft
 * image and stylesheet address rewritten to the public site's `/assets/<key>`.
 */
export function publicationDocument(row: ItemRow, assets: AssetRow[], cssText: string | null, event: { id: string; type: string; at: string; actorUserId: string; actorRole: string; publishedAt: string }): string {
  const toPublic = (text: string) => {
    let out = text
    for (const asset of assets) out = out.split(draftAssetUrl(asset.r2_key)).join(`${PUBLIC_ASSET_PREFIX}${asset.r2_key}`)
    return out
  }
  const meta = (name: string, value: string) => `<meta name="${name}" content="${escapeHtml(value)}">`
  const css = cssText === null ? '' : `<style>\n${toPublic(cssText).replace(/<\/style/gi, '<\\/style')}\n</style>\n`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(row.seo_title || row.title)}</title>
${meta('description', row.seo_description || row.summary)}
${meta('kr-content-id', row.id)}
${meta('kr-content-type', row.content_type)}
${meta('kr-canonical-path', row.canonical_path)}
${meta('kr-published-at', event.publishedAt)}
${meta('kr-unpublished-at', '')}
${meta('kr-publication-event-id', event.id)}
${meta('kr-publication-event-type', event.type)}
${meta('kr-publication-event-at', event.at)}
${meta('kr-publication-actor-user-id', event.actorUserId)}
${meta('kr-publication-actor-role', event.actorRole)}
${css}</head>
<body>
${toPublic(row.sanitized_html)}
</body>
</html>
`
}

/**
 * Publishes an item (old `publish`): 404 `PUBLISHING_ITEM_NOT_FOUND` when the id and type do not match; 422
 * `PUBLISHING_PUBLISH_REFUSED` with `publishProblems` (summary, text, thumbnail alt text, an image without a
 * license). The published document is written to R2 first, then the status, the `publication_event` and the audit
 * row in one batch; if the batch fails the document is removed. A published item may be published again (a new
 * document). Writes `published_at`, clears `archived_at`, keeps `unpublished_at`.
 */
export async function publishItem(context: PublishingContext, id: string, body: PublishingActionBody): Promise<PublishingItemData> {
  const row = await requireItemOfType(context.queries, id, body.contentType)
  const assets = await context.queries.assets(row.id)
  const problems = publishProblems(row, assets)
  const stylesheetKey = stylesheetKeyOf(row.asset_manifest_json)
  const cssBytes = stylesheetKey ? await context.storage.getBytes(stylesheetKey) : null
  if (stylesheetKey && !cssBytes) problems.push(`PUBLISH_REQUIRES_STYLESHEET_FILE:${stylesheetKey}`)
  if (problems.length) throw problemsError('PUBLISHING_PUBLISH_REFUSED', 422, 'The item cannot be published yet. See the list of problems.', problems)

  const eventId = `pub_${crypto.randomUUID()}`
  const key = `past-publications/${row.content_type}/${row.slug}/${keyStamp(new Date(context.now))}-${eventId}.html`
  const document = publicationDocument(row, assets, cssBytes ? new TextDecoder().decode(cssBytes) : null, { id: eventId, type: 'publish', at: context.now, actorUserId: context.actor.userId, actorRole: context.actor.role, publishedAt: context.now })
  await context.storage.put(key, document, 'text/html; charset=utf-8')
  try {
    await context.queries.changeStatus(
      {
        id: row.id,
        contentType: row.content_type,
        status: 'published',
        publishedAt: context.now,
        unpublishedAt: row.unpublished_at,
        archivedAt: null,
        lastPublicationKey: key,
        userId: context.actor.userId,
        role: context.actor.role,
        eventId,
        eventType: 'publish',
        snapshotJson: eventSnapshot(row, 'published', { published_at: context.now, archived_at: null, last_publication_r2_key: key }),
        now: context.now,
      },
      auditFor(context.actor, 'PUBLISH', 'public_content', row.id, { eventId, key }),
    )
  } catch (error) {
    await removeFiles(context, [key])
    throw error
  }
  return getItem(context.queries, row.id)
}

/**
 * Unpublish or archive (old `unpublish`, `archive`): only from published (409 `PUBLISHING_ITEM_NOT_PUBLISHED`, the
 * old `ARCHIVE_REQUIRES_PUBLISHED_STATUS`); both leave the item `archived` with `archived_at` set, unpublish also sets
 * `unpublished_at`. One batch with the `publication_event` (its key is the last published document) and the audit row.
 */
export async function takeDownItem(context: PublishingContext, id: string, body: PublishingActionBody, action: 'unpublish' | 'archive'): Promise<PublishingItemData> {
  const row = await requireItemOfType(context.queries, id, body.contentType)
  if (row.status !== 'published') throw new PublishingError('PUBLISHING_ITEM_NOT_PUBLISHED', 409, 'Only a published item can be unpublished or archived.')
  const unpublishedAt = action === 'unpublish' ? context.now : row.unpublished_at
  const eventId = `pub_${crypto.randomUUID()}`
  await context.queries.changeStatus(
    {
      id: row.id,
      contentType: row.content_type,
      status: 'archived',
      publishedAt: row.published_at,
      unpublishedAt,
      archivedAt: context.now,
      lastPublicationKey: row.last_publication_r2_key,
      userId: context.actor.userId,
      role: context.actor.role,
      eventId,
      eventType: action,
      snapshotJson: eventSnapshot(row, 'archived', { unpublished_at: unpublishedAt, archived_at: context.now }),
      now: context.now,
    },
    auditFor(context.actor, action.toUpperCase(), 'public_content', row.id, { eventId }),
  )
  return getItem(context.queries, row.id)
}

// ---------------------------------------------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------------------------------------------

/**
 * Deletes an item that is not published (old `deleteArchived`; super admin by the route's access). The body must say
 * `Delete <display code>` (422 `PUBLISHING_DELETE_CONFIRMATION_MISMATCH`). The rows go first in one batch with the
 * audit row (images, revisions and events cascade); then every R2 object of the item is removed: the ZIP, the
 * snapshot, the images, the stylesheet and every published document. Codes: `PUBLISHING_ITEM_NOT_FOUND`,
 * `PUBLISHING_ITEM_PUBLISHED`.
 */
export async function deleteItem(context: PublishingContext, id: string, body: PublishingDeleteBody): Promise<PublishingDeletedData> {
  const row = await requireItem(context.queries, id)
  if (row.status === 'published') throw new PublishingError('PUBLISHING_ITEM_PUBLISHED', 409, 'A published item cannot be deleted. Unpublish it first.')
  const expected = `Delete ${row.display_code ?? row.id}`
  if (body.confirmation.trim() !== expected) throw new PublishingError('PUBLISHING_DELETE_CONFIRMATION_MISMATCH', 422, `Type exactly "${expected}" to delete this item.`)

  const assets = await context.queries.assets(row.id)
  const keys = [
    row.source_upload_r2_key,
    row.sanitized_snapshot_r2_key,
    row.thumbnail_r2_key,
    row.last_publication_r2_key,
    stylesheetKeyOf(row.asset_manifest_json),
    ...assets.map((asset) => asset.r2_key),
    ...(await context.queries.publicationKeys(row.id)),
  ].filter((key): key is string => Boolean(key))
  const deleted = await context.queries.deleteItem(row.id, auditFor(context.actor, 'DELETE', 'public_content', row.id, { displayCode: row.display_code, files: keys.length }))
  if (!deleted) throw new PublishingError('PUBLISHING_ITEM_PUBLISHED', 409, 'The item was published meanwhile and was not deleted.')
  const unique = Array.from(new Set(keys.filter((key) => OWNED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))))
  const notRemoved = await removeFiles(context, unique)
  return { id: row.id, removedFiles: unique.length - notRemoved.length, filesNotRemoved: notRemoved }
}

// ---------------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------------

function safeFileToken(value: string | null | undefined): string {
  return (
    (value || 'front-end-publication')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'front-end-publication'
  )
}

/** The source ZIP of an item (old `download/[id]`): `<display code>-<slug>.zip`, `private, no-store`. 404 `PUBLISHING_ITEM_NOT_FOUND`, `PUBLISHING_PACKAGE_NOT_FOUND`. */
export async function readPackage(q: PublishingQueries, storage: ArticleStorage, id: string): Promise<{ body: ReadableStream; headers: Record<string, string> }> {
  const row = await q.itemFiles(id)
  if (!row) throw new PublishingError('PUBLISHING_ITEM_NOT_FOUND', 404, 'No article or answer has that id.')
  const object = row.source_upload_r2_key ? await storage.get(row.source_upload_r2_key) : null
  if (!object) throw new PublishingError('PUBLISHING_PACKAGE_NOT_FOUND', 404, 'The source package of that item is not stored.')
  return {
    body: object.body,
    headers: {
      'Content-Type': 'application/zip',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${safeFileToken(row.display_code)}-${safeFileToken(row.slug || row.title || row.id)}.zip"`,
      'Content-Length': String(object.size),
      'X-Content-Type-Options': 'nosniff',
    },
  }
}

const ASSET_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.css': 'text/css; charset=utf-8' }

/**
 * A draft image or article stylesheet (old `assets/[...key]`, which served images only; the stylesheet is new and
 * makes `article.css` work, point 1). Only `images/<type>/<slug>/<file>` and `stylesheets/<type>/<slug>/<file>` keys;
 * anything else, or a missing object, is 404 `PUBLISHING_ASSET_NOT_FOUND`. Sent `private, no-store` with the type
 * taken from the key's extension (never from the stored metadata) and `nosniff`.
 */
export async function readAsset(storage: ArticleStorage, key: string): Promise<{ body: ReadableStream; headers: Record<string, string> }> {
  const extension = /\.[a-z0-9]+$/.exec(key)?.[0] ?? ''
  const type = ASSET_TYPES[extension]
  const allowed = DRAFT_ASSET_KEY.test(key) && type && (key.startsWith('stylesheets/') ? extension === '.css' : extension !== '.css')
  const object = allowed ? await storage.get(key) : null
  if (!object || !type) throw new PublishingError('PUBLISHING_ASSET_NOT_FOUND', 404, 'That draft file does not exist.')
  return {
    body: object.body,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(object.size),
      'X-Content-Type-Options': 'nosniff',
      'X-KR-Article-Asset-Scope': 'krhomebase-draft-preview',
    },
  }
}
