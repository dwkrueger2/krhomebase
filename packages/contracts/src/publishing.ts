/**
 * Front End Publishing.
 *
 * Settings (Settings and Dashboard plan, stage 4a; decision 7 keeps the article prompt):
 *
 *   GET /v1/publishing/article-prompt   the Upload Article GPT helper prompt (super admin, front-end author)
 *   PUT /v1/publishing/article-prompt   save it (super admin)
 *
 * The prompt is a settings row of the `lookup` table: id `lk_kr_article_helper_prompt_upload_article`, category
 * `kr_article_helper_prompt`, the text in `description` (see the lookup table as described in Schema 8.0:
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table"). Old route:
 * `GET`/`POST /krhomebase/api/kr-api-v1/article-helper-prompt` (reference section 4.2e).
 *
 * Articles and answers (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 6; as-is record
 * `docs/API/WorkStream_AsIs_Reference.md` section 6, decisions D22 to D25 of section 8.1):
 *
 *   GET    /v1/publishing/items                    articles and answers, newest first, paged
 *   GET    /v1/publishing/items/{itemId}           one item with its images and their licenses
 *   POST   /v1/publishing/packages                 check one ZIP package and store its files (multipart)
 *   POST   /v1/publishing/items                    a draft from an accepted package
 *   PATCH  /v1/publishing/items/{itemId}           change a draft (or record image licenses on any item)
 *   POST   /v1/publishing/items/{itemId}/publish   publish
 *   POST   /v1/publishing/items/{itemId}/unpublish take a published item down
 *   POST   /v1/publishing/items/{itemId}/archive   archive a published item
 *   DELETE /v1/publishing/items/{itemId}           delete an item that is not published (super admin)
 *   GET    /v1/publishing/items/{itemId}/package   the source ZIP
 *   GET    /v1/publishing/assets/{assetKey}        a draft image or the article stylesheet
 *
 * Who: super admin and front-end author, except the delete (super admin). Tables: `public_content`, `content_asset`
 * (with the license columns of migration 031), `content_revision`, `publication_event`. Files: the R2 bucket bound as
 * `ARTICLES` (`kr-homebase-articles`; `kr-homebase-articles-dev` under `pnpm dev`).
 *
 * Image licenses (D25): the old package format has no place for a license (its helper prompt lists only `kr-*` meta
 * tags about the item, none about images), so a package never carries one. The package check lists each image as
 * needing a license; the draft save and the change route accept licenses by the image's path in the ZIP; Publish
 * refuses an item while any image has none (`PUBLISH_REQUIRES_IMAGE_LICENSE:<path>`).
 */

import { z } from 'zod'

export const ArticlePromptData = z.object({
  prompt: z.string().describe('The prompt text, or an empty string when none is saved yet.'),
  updatedAt: z.string().nullable().describe('When it was last saved (ISO time), or null when never.'),
})
export type ArticlePromptData = z.infer<typeof ArticlePromptData>

export const ArticlePromptBody = z.object({
  prompt: z.string().trim().min(1).max(50000).describe('The prompt text, 1 to 50,000 characters (the old limit).'),
})
export type ArticlePromptBody = z.infer<typeof ArticlePromptBody>

// ---------------------------------------------------------------------------------------------------------------
// Articles and answers
// ---------------------------------------------------------------------------------------------------------------

/** The roles that may use Front End Publishing (the old routes' list). Deleting an item is super admin only. */
export const PUBLISHING_ROLES = ['super_admin', 'front_end_author'] as const

/** The two kinds of public content (Schema 8.0 CHECK on `public_content.content_type`). */
export const CONTENT_TYPES = ['article', 'answer'] as const
export const ContentType = z.enum(CONTENT_TYPES).describe('`article` or `answer`.')
export type ContentType = z.infer<typeof ContentType>

/** The statuses this API writes. The database also allows `review`, which no screen ever used; it reads as `draft`. */
export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const
export const ContentStatus = z.enum(CONTENT_STATUSES).describe('`draft`, `published` or `archived`.')
export type ContentStatus = z.infer<typeof ContentStatus>

/** How an image may be used (Schema 8.0 CHECK on `content_asset.usage`). */
export const CONTENT_ASSET_USAGES = ['body', 'thumbnail', 'both'] as const

/** The kinds of image license (migration 031 CHECK on `content_asset.license_kind`). */
export const IMAGE_LICENSE_KINDS = ['firm_owned', 'stock', 'creative_commons', 'public_domain', 'permission'] as const
export const IMAGE_LICENSE_KIND_LABELS: Record<(typeof IMAGE_LICENSE_KINDS)[number], string> = {
  firm_owned: 'Owned by the firm',
  stock: 'Stock license',
  creative_commons: 'Creative Commons',
  public_domain: 'Public domain',
  permission: 'Used with permission',
}

/** The old package limits, kept (articlePackageIngestion.ts). The HTML limit is new: the text must fit a D1 value. */
export const ARTICLE_PACKAGE_MAX_BYTES = 50 * 1024 * 1024
export const ARTICLE_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const ARTICLE_IMAGE_MAX_PIXELS = 24_000_000
export const ARTICLE_CSS_MAX_BYTES = 256 * 1024
export const ARTICLE_HTML_MAX_BYTES = 1_000_000

/**
 * Where the screens load a draft image or stylesheet: this prefix and the R2 key as one encoded path segment
 * (`encodeURIComponent`, so `/` becomes `%2F`). The web app passes `/api/v1/...` on to the API unchanged. Publish
 * rewrites these addresses to the public site's `/assets/<key>` in the published document.
 */
export const PUBLISHING_DRAFT_ASSET_PREFIX = '/api/v1/publishing/assets/'

/** The draft address of an R2 key under `images/` or `stylesheets/`. */
export function draftAssetUrl(key: string): string {
  return `${PUBLISHING_DRAFT_ASSET_PREFIX}${encodeURIComponent(key)}`
}

const text = (max: number) => z.string().trim().max(max)

/** A license as sent by the screen. */
export const ImageLicense = z.object({
  kind: z.enum(IMAGE_LICENSE_KINDS).describe('The kind of license: `firm_owned`, `stock`, `creative_commons`, `public_domain` or `permission`.'),
  source: text(200).min(1, 'Say who owns the image or where it came from.').describe('Who owns the image or where it came from (the firm, a stock library, a photographer).'),
  reference: text(500).nullable().optional().describe('License or order number, or the address of the license terms.'),
  attribution: text(300).nullable().optional().describe('The credit line the license requires, if any.'),
})
export type ImageLicense = z.infer<typeof ImageLicense>

/** A license as stored, with who recorded it and when (from the session, never from the request). */
export const RecordedImageLicense = z.object({
  kind: z.enum(IMAGE_LICENSE_KINDS).describe('The kind of license.'),
  source: z.string().describe('Who owns the image or where it came from.'),
  reference: z.string().nullable().describe('License or order number, or the address of the license terms.'),
  attribution: z.string().nullable().describe('The credit line the license requires, if any.'),
  recordedAt: z.string().nullable().describe('When the license was recorded (ISO time).'),
  recordedByUserId: z.string().nullable().describe('Who recorded it.'),
  recordedByName: z.string().nullable().describe("That person's name."),
})
export type RecordedImageLicense = z.infer<typeof RecordedImageLicense>

/** One image of an item (`content_asset`). */
export const ContentAsset = z.object({
  id: z.string().describe('`asset_` and 32 characters of the SHA-256 of its key (the old rule).'),
  originalPath: z.string().describe('Its path in the ZIP package, for example `images/hero.jpg`. Licenses and alt text are matched by this path.'),
  key: z.string().describe('Its R2 key, `images/<type>/<slug>/<12 hex>-<name>`.'),
  url: z.string().describe('Its draft address (`/api/v1/publishing/assets/<encoded key>`), for the screens only.'),
  mimeType: z.string().describe('Its type, read from the file bytes.'),
  fileSize: z.number().int().describe('Its size in bytes.'),
  width: z.number().int().nullable().describe('Its width in pixels, read from the file header.'),
  height: z.number().int().nullable().describe('Its height in pixels, read from the file header.'),
  usage: z.enum(CONTENT_ASSET_USAGES).describe('`body` (in the text), `thumbnail` (the card image) or `both`.'),
  altText: z.string().describe('Its alt text.'),
  license: RecordedImageLicense.nullable().describe('Its license, or null while none is recorded (Publish is refused then).'),
})
export type ContentAsset = z.infer<typeof ContentAsset>

/** The fields an item has in a list. */
export const PublishingItemSummary = z.object({
  id: z.string().describe('The item id, `<type>_<slug>` (the old rule).'),
  displayCode: z.string().nullable().describe('Its display code, for example `Article 001` (set by the database).'),
  contentType: ContentType,
  slug: z.string().describe('Its address name, lowercase letters, digits and hyphens.'),
  topicSlug: z.string().nullable().describe('An answer’s topic address name; null for an article.'),
  canonicalPath: z.string().describe('Its public path: `/articles/<slug>` or `/answers/<pillar>/<topic>`.'),
  title: z.string().describe('Its title.'),
  summary: z.string().describe('The short teaser shown on the public card.'),
  status: ContentStatus,
  category: z.string().nullable().describe('An article’s category.'),
  categoryLabel: z.string().nullable().describe('An article’s category as shown; `Answers` for an answer.'),
  pillar: z.string().nullable().describe('An answer’s pillar.'),
  authorDisplayName: z.string().nullable().describe('The author name shown on the public site.'),
  thumbnailUrl: z.string().nullable().describe('The draft address of the card image.'),
  thumbnailAlt: z.string().describe('The card image’s alt text.'),
  imageCount: z.number().int().describe('How many images it has.'),
  unlicensedImageCount: z.number().int().describe('How many of them have no license yet.'),
  publishedAt: z.string().nullable().describe('When it was last published (ISO time).'),
  unpublishedAt: z.string().nullable().describe('When it was last taken down (ISO time).'),
  archivedAt: z.string().nullable().describe('When it was archived or taken down (ISO time).'),
  createdAt: z.string().describe('When it was created (ISO time).'),
  updatedAt: z.string().nullable().describe('When it last changed (ISO time).'),
  createdByUserId: z.string().nullable().describe('Who created it (null on items saved by the old app).'),
  createdByName: z.string().nullable().describe('That person’s name.'),
  updatedByUserId: z.string().nullable().describe('Who changed it last: the editor (null on items saved by the old app).'),
  updatedByName: z.string().nullable().describe('That person’s name.'),
})
export type PublishingItemSummary = z.infer<typeof PublishingItemSummary>

/** One item with its text, images and what still stops it from being published. */
export const PublishingItem = PublishingItemSummary.extend({
  seoTitle: z.string().nullable().describe('The title for search engines.'),
  seoDescription: z.string().nullable().describe('The description for search engines.'),
  readingTimeMinutes: z.number().int().nullable().describe('An article’s reading time in minutes.'),
  thumbnailKey: z.string().nullable().describe('The R2 key of the card image.'),
  html: z.string().describe('The cleaned article text (the body only), with draft image addresses.'),
  stylesheetUrl: z.string().nullable().describe('The draft address of its `article.css`, or null when the package had none.'),
  hasSourcePackage: z.boolean().describe('Whether the source ZIP is stored (`GET .../package`).'),
  lastPublicationKey: z.string().nullable().describe('The R2 key of the last published document (`past-publications/...`).'),
  assets: z.array(ContentAsset).describe('Its images, in ZIP path order.'),
  publishProblems: z.array(z.string()).describe('Why Publish would be refused now, in the old wording (`PUBLISH_REQUIRES_...`); empty when it may be published.'),
})
export type PublishingItem = z.infer<typeof PublishingItem>

export const PublishingItemsQuery = z.object({
  status: ContentStatus.optional().describe('Only items with this status; every status when left out.'),
  contentType: ContentType.optional().describe('Only articles or only answers; both when left out.'),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe('Items per page, 1 to 100 (50 when left out).'),
  cursor: z.string().max(500).optional().describe('The `nextCursor` of the previous page.'),
})
export type PublishingItemsQuery = z.infer<typeof PublishingItemsQuery>

export const PublishingItemsData = z.object({
  items: z.array(PublishingItemSummary).describe('Newest first (last changed, else created; D10).'),
  hasMore: z.boolean().describe('True when more items exist after this page.'),
  moreNote: z.string().nullable().describe('A line for the screen when the list is cut short ("More items exist. ..."); null on the last page.'),
  nextCursor: z.string().nullable().describe('Pass as `cursor` for the next page; null on the last page.'),
  viewer: z.object({ canDelete: z.boolean().describe('May delete items (super admin).') }).describe('What the signed-in person may do.'),
})
export type PublishingItemsData = z.infer<typeof PublishingItemsData>

export const PublishingItemParams = z.object({
  itemId: z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/, 'Not an item id.').describe('The item id, `<type>_<slug>`.'),
})
export type PublishingItemParams = z.infer<typeof PublishingItemParams>

export const PublishingAssetParams = z.object({
  assetKey: z.string().min(1).max(400).describe('The R2 key as one encoded path segment (`images%2Farticle%2F...`); only `images/` and `stylesheets/` keys.'),
})
export type PublishingAssetParams = z.infer<typeof PublishingAssetParams>

export const PublishingItemData = z.object({
  item: PublishingItem.describe('The item.'),
})
export type PublishingItemData = z.infer<typeof PublishingItemData>

// ---------------------------------------------------------------------------------------------------------------
// Package check
// ---------------------------------------------------------------------------------------------------------------

export const ArticlePackageForm = z.object({
  contentType: ContentType.describe('What the package is: `article` or `answer`. Must match its `kr-content-type` meta tag.'),
  file: z.any().describe('The ZIP package (50 MB at most): one root `.html`, an optional root `article.css`, images under `images/` or `assets/images/`.'),
})
export type ArticlePackageForm = z.infer<typeof ArticlePackageForm>

/** The `kr-*` meta tags read from the package (old `extractPackageMetadata`). */
export const ArticlePackageMetadata = z.object({
  contentType: ContentType,
  title: z.string().describe('`kr-title`, else the `<title>`.'),
  slug: z.string().describe('`kr-slug`, made URL safe.'),
  summary: z.string().describe('`kr-summary`, else the `description` meta tag.'),
  thumbnailSrc: z.string().describe('`kr-thumbnail-src`, the card image’s path in the ZIP.'),
  thumbnailAlt: z.string().describe('`kr-thumbnail-alt`.'),
  seoTitle: z.string().describe('`kr-seo-title`, else the title.'),
  seoDescription: z.string().describe('`kr-seo-description`, else the description or summary.'),
  category: z.string().nullable().describe('`kr-category` (required for an article).'),
  categoryLabel: z.string().nullable().describe('`kr-category-label`, else the category.'),
  readingTimeMinutes: z.number().nullable().describe('`kr-reading-time-minutes`.'),
  pillar: z.string().nullable().describe('`kr-pillar` (required for an answer).'),
  topicSlug: z.string().nullable().describe('`kr-topic-slug`, made URL safe.'),
  authorDisplayName: z.string().nullable().describe('`kr-author-display-name`.'),
})
export type ArticlePackageMetadata = z.infer<typeof ArticlePackageMetadata>

/** One image accepted from the package. */
export const ArticlePackageImage = z.object({
  originalPath: z.string().describe('Its path in the ZIP.'),
  key: z.string().describe('The R2 key it was stored under.'),
  url: z.string().describe('Its draft address.'),
  mimeType: z.string().describe('Its type, read from the bytes.'),
  fileSize: z.number().int().describe('Its size in bytes.'),
  width: z.number().int().describe('Its width in pixels.'),
  height: z.number().int().describe('Its height in pixels.'),
  usage: z.enum(CONTENT_ASSET_USAGES).describe('`body`, `thumbnail` or `both`.'),
  altText: z.string().describe('Its alt text from the HTML (or `kr-thumbnail-alt`).'),
  sha256: z.string().describe('The SHA-256 of its bytes.'),
  licenseNeeded: z.literal(true).describe('Always true: a package carries no license; give one when saving the draft (D25).'),
})
export type ArticlePackageImage = z.infer<typeof ArticlePackageImage>

/** The R2 keys the package check stored. */
export const ArticlePackageKeys = z.object({
  sourceUpload: z.string().describe('The ZIP, `source-uploads/<type>/<slug>/<time>/<name>.zip`. Send it as `packageKey` to save the draft.'),
  sanitizedSnapshot: z.string().describe('The cleaned text, `sanitized-snapshots/<type>/<slug>/<time>/sanitized.html`.'),
  stylesheet: z.string().nullable().describe('The stylesheet, `stylesheets/<type>/<slug>/<12 hex>-article.css`, or null.'),
  images: z.array(z.string()).describe('The images, `images/<type>/<slug>/<12 hex>-<name>`.'),
})
export type ArticlePackageKeys = z.infer<typeof ArticlePackageKeys>

/** An accepted package. Nothing is saved to the item tables until the draft is saved (`POST /v1/publishing/items`). */
export const ArticlePackageCheckData = z.object({
  accepted: z.literal(true).describe('The package passed every check and its files are stored.'),
  contentId: z.string().describe('The item id the draft will have, `<type>_<slug>`.'),
  existingStatus: ContentStatus.nullable().describe('The status of the item that already has that id (save with `PATCH` and `packageKey` to replace its package), or null when there is none.'),
  packageKey: z.string().describe('The stored ZIP’s key; send it to save the draft.'),
  htmlFileName: z.string().describe('The package’s HTML file name.'),
  metadata: ArticlePackageMetadata.describe('The `kr-*` meta tags read from the HTML.'),
  html: z.string().describe('The cleaned text (body only) with draft image addresses.'),
  stylesheetUrl: z.string().nullable().describe('The draft address of `article.css`, or null.'),
  images: z.array(ArticlePackageImage).describe('Every image in the ZIP, each needing a license.'),
  keys: ArticlePackageKeys.describe('Every R2 key stored.'),
  warnings: z.array(z.string()).describe('Tips that did not stop the package, in the old wording (`THUMBNAIL_TIP_...`, `IMAGE_FILENAME_TIP_...`).'),
})
export type ArticlePackageCheckData = z.infer<typeof ArticlePackageCheckData>

/**
 * `details` of a refused package (422 `PUBLISHING_PACKAGE_REFUSED`), a refused draft (422 `PUBLISHING_ITEM_INVALID`)
 * or a refused publish (422 `PUBLISHING_PUBLISH_REFUSED`): every problem in the old wording, for example
 * `PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_0_found_total_0` or `IMAGE_ALT_TEXT_REQUIRED:images/a.jpg`.
 */
export const PublishingProblems = z.object({
  problems: z.array(z.string()).describe('Every reason, in the old wording.'),
  warnings: z.array(z.string()).describe('Tips that would not have stopped it.'),
})
export type PublishingProblems = z.infer<typeof PublishingProblems>

// ---------------------------------------------------------------------------------------------------------------
// Save, change, publish, unpublish, archive, delete
// ---------------------------------------------------------------------------------------------------------------

/** Alt text and license for one image, matched by its path in the ZIP. */
export const PublishingImageInput = z.object({
  originalPath: text(300).min(1).describe('The image’s path in the ZIP, for example `images/hero.jpg`.'),
  altText: text(500).optional().describe('New alt text; left out keeps it.'),
  license: ImageLicense.nullable().optional().describe('Its license; null clears it; left out keeps it.'),
})
export type PublishingImageInput = z.infer<typeof PublishingImageInput>

const itemFields = {
  title: text(300).optional().describe('The title; left out takes the package’s `kr-title`.'),
  summary: text(2000).optional().describe('The teaser; left out takes the package’s `kr-summary`.'),
  seoTitle: text(300).nullable().optional().describe('The search-engine title.'),
  seoDescription: text(1000).nullable().optional().describe('The search-engine description.'),
  thumbnailAlt: text(500).optional().describe('The card image’s alt text.'),
  category: text(200).nullable().optional().describe('An article’s category (required for an article).'),
  categoryLabel: text(200).nullable().optional().describe('An article’s category as shown.'),
  pillar: text(200).nullable().optional().describe('An answer’s pillar (required for an answer).'),
  topicSlug: text(200).nullable().optional().describe('An answer’s topic address name; made URL safe.'),
  readingTimeMinutes: z.number().int().min(1).max(600).nullable().optional().describe('An article’s reading time in minutes.'),
  authorDisplayName: text(200).nullable().optional().describe('The author name shown on the public site.'),
  html: z.string().max(ARTICLE_HTML_MAX_BYTES).optional().describe('Edited article text. The API cleans it again (the allow-list), keeps only images of this item, and never trusts addresses or keys sent here.'),
  images: z.array(PublishingImageInput).max(200).optional().describe('Alt text and licenses by image path.'),
}

export const PublishingItemCreateBody = z.object({
  packageKey: text(400).min(1).describe('The `packageKey` from the package check. The API reads that ZIP again, checks it again and makes every key itself.'),
  ...itemFields,
})
export type PublishingItemCreateBody = z.infer<typeof PublishingItemCreateBody>

export const PublishingItemUpdateBody = z.object({
  packageKey: text(400).min(1).optional().describe('Replace the package with a newly checked one of the same type and slug; its images replace the old ones.'),
  ...itemFields,
})
export type PublishingItemUpdateBody = z.infer<typeof PublishingItemUpdateBody>

/** Publish, unpublish and archive: the type is sent back as a check that the screen acts on the item it shows (the old rule). */
export const PublishingActionBody = z.object({
  contentType: ContentType.describe('The item’s type; a different type answers 404 (the old check).'),
})
export type PublishingActionBody = z.infer<typeof PublishingActionBody>

export const PublishingDeleteBody = z.object({
  confirmation: z.string().max(300).describe('Exactly `Delete <display code>` (for example `Delete Article 001`), or `Delete <item id>` when it has no display code.'),
})
export type PublishingDeleteBody = z.infer<typeof PublishingDeleteBody>

export const PublishingDeletedData = z.object({
  id: z.string().describe('The deleted item’s id.'),
  removedFiles: z.number().int().describe('How many R2 objects were removed.'),
  filesNotRemoved: z.array(z.string()).describe('R2 keys that could not be removed (logged for clean-up); empty normally.'),
})
export type PublishingDeletedData = z.infer<typeof PublishingDeletedData>
