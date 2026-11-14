// file: apps/web/features/publishing/publishingRows.ts
/**
 * Pure helpers for the Front End Publishing screens (plan 10, stage 6): labels, the edit draft and the change body
 * sent to `PATCH /v1/publishing/items/{itemId}`, the image license drafts (D25), the list paging joins, the delete
 * confirmation text, the upload dialog's validation text, the image path labels and the preview document. No calls
 * and no React; every rule stays in the API, and these only arrange what it sends for display or shape what the screen
 * sends back.
 *
 * Ported pieces keep the old names and wording: `formatShortDate` and `humanizeLabel` (old
 * `modules/shared/krModuleApi.client.ts`), `slugify` and `canonicalPathForDraft` (old `ArticleEditCard`),
 * `contentCode` (old `ArticleDownloadDialog`), `formatIssues` and `validationSuccessText` (old `PackageUploadDialog`),
 * `imageNameFromR2Key`, `r2PathLabel` and `apiPathLabel` (old `ArticleImagesCard`), `srcDocFor` (old
 * `PublicationPreviewPanel`). The old row normalizer (`normalizePublishingRow`), the draft built from loose rows and
 * the browser-made content id are gone: the API sends one checked shape (`@krhomebase/contracts`) and makes the ids.
 */

import {
  IMAGE_LICENSE_KIND_LABELS,
  IMAGE_LICENSE_KINDS,
  type ArticlePackageCheckData,
  type ContentAsset,
  type ContentType,
  type ImageLicense,
  type PublishingImageInput,
  type PublishingItem,
  type PublishingItemSummary,
  type PublishingItemUpdateBody,
} from '@krhomebase/contracts'

// ---------------------------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------------------------

/** A short date such as "Nov 13, 2026", or "—" (old `formatShortDate`). */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Humanizes underscored status and kind labels (old `humanizeLabel`). */
export function humanizeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((piece) => `${piece.charAt(0).toUpperCase()}${piece.slice(1)}`)
    .join(' ')
}

/** "Article" or "Answer". */
export function contentTypeLabel(contentType: ContentType): string {
  return contentType === 'answer' ? 'Answer' : 'Article'
}

/** "Article" or "Answer Blog", the old upload dialog's names. */
export function packageLabel(contentType: ContentType): string {
  return contentType === 'answer' ? 'Answer Blog' : 'Article'
}

/** The display code, or "Article pending" / "Answer pending" before the database gives one (old `contentCode`). */
export function contentCode(item: Pick<PublishingItemSummary, 'displayCode' | 'contentType'>): string {
  if (item.displayCode) return item.displayCode
  return item.contentType === 'answer' ? 'Answer pending' : 'Article pending'
}

/** The ledger's Published cell: the date, or the old "Un Published". */
export function publishedCell(item: Pick<PublishingItemSummary, 'publishedAt'>): string {
  return item.publishedAt ? formatShortDate(item.publishedAt) : 'Un Published'
}

/** Address-safe text: lowercase letters, digits and hyphens (old `slugify`). */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** The counts shown in the module header. */
export function statusCounts(items: readonly Pick<PublishingItemSummary, 'status'>[]): { published: number; draft: number; archived: number } {
  return {
    published: items.filter((item) => item.status === 'published').length,
    draft: items.filter((item) => item.status === 'draft').length,
    archived: items.filter((item) => item.status === 'archived').length,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// List paging (D10)
// ---------------------------------------------------------------------------------------------------------------

/** Adds a later page after the loaded items, skipping any id already shown. */
export function appendItems<T extends { id: string }>(current: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(current.map((item) => item.id))
  return [...current, ...next.filter((item) => !seen.has(item.id))]
}

/** Puts a saved item in place of its old row, or first when it is new (the list is newest first). */
export function upsertItem<T extends { id: string }>(current: readonly T[], item: T): T[] {
  return current.some((candidate) => candidate.id === item.id) ? current.map((candidate) => (candidate.id === item.id ? item : candidate)) : [item, ...current]
}

/** The line under the list while more items exist: the API's own sentence, else a plain one; "" on the last page. */
export function moreItemsLine(loaded: number, hasMore: boolean, moreNote: string | null): string {
  if (!hasMore) return ''
  return moreNote ?? `Showing the newest ${loaded}. More articles and answers exist.`
}

// ---------------------------------------------------------------------------------------------------------------
// The edit draft (Article Details)
// ---------------------------------------------------------------------------------------------------------------

/** The fields Article Details edits, as text (the old `FrontEndArticleDraft`, cut to what the API accepts). */
export interface PublishingDraft {
  title: string
  summary: string
  seoTitle: string
  seoDescription: string
  thumbnailAlt: string
  category: string
  categoryLabel: string
  pillar: string
  topicSlug: string
  readingTimeMinutes: string
  authorDisplayName: string
  html: string
}

/** The draft of an item as the API sent it. */
export function draftFromItem(item: PublishingItem): PublishingDraft {
  return {
    title: item.title,
    summary: item.summary,
    seoTitle: item.seoTitle ?? '',
    seoDescription: item.seoDescription ?? '',
    thumbnailAlt: item.thumbnailAlt,
    category: item.category ?? '',
    categoryLabel: item.categoryLabel ?? '',
    pillar: item.pillar ?? '',
    topicSlug: item.topicSlug ?? '',
    readingTimeMinutes: item.readingTimeMinutes == null ? '' : String(item.readingTimeMinutes),
    authorDisplayName: item.authorDisplayName ?? '',
    html: item.html,
  }
}

/** The reading time typed, as a whole number, or null when empty or not a number. */
export function readingMinutesValue(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isInteger(value) && value > 0 ? value : null
}

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null)

/**
 * The `PATCH` body for the fields that differ from the item: only changed fields are sent, empty optional text is
 * sent as null, and the text (`html`) only when it was edited. An article sends no pillar or topic; an answer no
 * category, label or reading time. Returns `{}` when nothing changed.
 */
export function itemUpdateBody(item: PublishingItem, draft: PublishingDraft): PublishingItemUpdateBody {
  const before = draftFromItem(item)
  const body: PublishingItemUpdateBody = {}
  const isArticle = item.contentType === 'article'
  if (draft.title.trim() !== before.title.trim()) body.title = draft.title.trim()
  if (draft.summary.trim() !== before.summary.trim()) body.summary = draft.summary.trim()
  if (draft.thumbnailAlt.trim() !== before.thumbnailAlt.trim()) body.thumbnailAlt = draft.thumbnailAlt.trim()
  if (draft.seoTitle.trim() !== before.seoTitle.trim()) body.seoTitle = nullable(draft.seoTitle)
  if (draft.seoDescription.trim() !== before.seoDescription.trim()) body.seoDescription = nullable(draft.seoDescription)
  if (draft.authorDisplayName.trim() !== before.authorDisplayName.trim()) body.authorDisplayName = nullable(draft.authorDisplayName)
  if (isArticle) {
    if (draft.category.trim() !== before.category.trim()) body.category = nullable(draft.category)
    if (draft.categoryLabel.trim() !== before.categoryLabel.trim()) body.categoryLabel = nullable(draft.categoryLabel)
    if (draft.readingTimeMinutes.trim() !== before.readingTimeMinutes.trim()) body.readingTimeMinutes = readingMinutesValue(draft.readingTimeMinutes)
  } else {
    if (draft.pillar.trim() !== before.pillar.trim()) body.pillar = nullable(draft.pillar)
    if (draft.topicSlug.trim() !== before.topicSlug.trim()) body.topicSlug = nullable(draft.topicSlug)
  }
  if (draft.html !== before.html) body.html = draft.html
  return body
}

/** Whether Article Details has a change to save. */
export function draftIsDirty(item: PublishingItem, draft: PublishingDraft): boolean {
  return Object.keys(itemUpdateBody(item, draft)).length > 0
}

/** A problem the screen can name before sending, or "" (the API checks every field again). */
export function draftProblem(item: PublishingItem, draft: PublishingDraft): string {
  if (!draft.title.trim()) return 'A title is required.'
  if (item.contentType === 'article' && draft.readingTimeMinutes.trim() && readingMinutesValue(draft.readingTimeMinutes) === null) return 'Read Time must be a whole number of minutes.'
  return ''
}

/**
 * The public path the draft would have (old `canonicalPathForDraft`): `/articles/<slug>` for an article, and
 * `/answers/<pillar>/<topic>` for an answer, the pillar made URL safe as the API does. The slug never changes here.
 */
export function canonicalPathForDraft(item: Pick<PublishingItem, 'contentType' | 'slug'>, draft: Pick<PublishingDraft, 'pillar' | 'topicSlug' | 'title'>): string {
  if (item.contentType === 'answer') {
    const pillar = slugify(draft.pillar) || 'pillar-slug'
    const topic = slugify(draft.topicSlug || item.slug || draft.title) || 'topic-slug'
    return `/answers/${pillar}/${topic}`
  }
  return `/articles/${slugify(item.slug || draft.title) || 'article-slug'}`
}

/** The typed delete confirmation the API expects: `Delete <display code>`, else `Delete <item id>`. */
export function deleteConfirmationText(item: Pick<PublishingItemSummary, 'displayCode' | 'id'>): string {
  return `Delete ${item.displayCode ?? item.id}`
}

// ---------------------------------------------------------------------------------------------------------------
// Image licenses (D25)
// ---------------------------------------------------------------------------------------------------------------

/** One image's license fields as typed; `kind` is "" until chosen. */
export interface LicenseDraft {
  kind: ImageLicense['kind'] | ''
  source: string
  reference: string
  attribution: string
}

/** The license kinds with their labels, for the choice list. */
export const LICENSE_KIND_CHOICES: ReadonlyArray<{ value: ImageLicense['kind']; label: string }> = IMAGE_LICENSE_KINDS.map((value) => ({ value, label: IMAGE_LICENSE_KIND_LABELS[value] }))

/** The license fields of one image as recorded (empty when it has none). */
export function licenseDraftFromAsset(asset: Pick<ContentAsset, 'license'>): LicenseDraft {
  const license = asset.license
  return { kind: license?.kind ?? '', source: license?.source ?? '', reference: license?.reference ?? '', attribution: license?.attribution ?? '' }
}

/** Every image's license draft, by its path in the ZIP. */
export function licenseDraftsFromItem(item: Pick<PublishingItem, 'assets'>): Record<string, LicenseDraft> {
  return Object.fromEntries(item.assets.map((asset) => [asset.originalPath, licenseDraftFromAsset(asset)]))
}

const blankLicense = (draft: LicenseDraft) => !draft.kind && !draft.source.trim() && !draft.reference.trim() && !draft.attribution.trim()

/** Whether a license draft differs from what is recorded. */
export function licenseChanged(asset: Pick<ContentAsset, 'license'>, draft: LicenseDraft): boolean {
  const before = licenseDraftFromAsset(asset)
  return before.kind !== draft.kind || before.source.trim() !== draft.source.trim() || before.reference.trim() !== draft.reference.trim() || before.attribution.trim() !== draft.attribution.trim()
}

/** What is missing from one changed license, or "" (a blank draft clears the license and is allowed). */
export function licenseProblem(draft: LicenseDraft): string {
  if (blankLicense(draft)) return ''
  if (!draft.kind) return 'Choose the kind of license.'
  if (!draft.source.trim()) return 'Say who owns the image or where it came from.'
  return ''
}

/**
 * The `images` of a change body: one entry per image whose license changed, by its path in the ZIP; a cleared draft
 * sends `license: null`. Images with a problem are left out (the screen shows the problem and keeps Save off).
 */
export function licenseImagesBody(assets: readonly ContentAsset[], drafts: Readonly<Record<string, LicenseDraft>>): PublishingImageInput[] {
  const images: PublishingImageInput[] = []
  for (const asset of assets) {
    const draft = drafts[asset.originalPath]
    if (!draft || !licenseChanged(asset, draft) || licenseProblem(draft)) continue
    images.push({
      originalPath: asset.originalPath,
      license: blankLicense(draft) || !draft.kind ? null : { kind: draft.kind, source: draft.source.trim(), reference: nullable(draft.reference), attribution: nullable(draft.attribution) },
    })
  }
  return images
}

/** The image paths the API names in `PUBLISH_REQUIRES_IMAGE_LICENSE:<path>` problems. */
export function unlicensedImagePaths(publishProblems: readonly string[]): Set<string> {
  const prefix = 'PUBLISH_REQUIRES_IMAGE_LICENSE:'
  return new Set(publishProblems.filter((problem) => problem.startsWith(prefix)).map((problem) => problem.slice(prefix.length)))
}

// ---------------------------------------------------------------------------------------------------------------
// Image path labels (old ArticleImagesCard)
// ---------------------------------------------------------------------------------------------------------------

/** The file name at the end of an R2 key. */
export function imageNameFromR2Key(value: string): string {
  return value.split('/').filter(Boolean).pop() || value || 'image'
}

/** The R2 key shown as a path. */
export function r2PathLabel(value: string): string {
  const normalized = value.replace(/^\/+/, '')
  return normalized ? `/${normalized}` : '/images/(missing-image-key)'
}

/** The draft address shown with `[DOMAIN]` in front of the path. */
export function apiPathLabel(value: string): string {
  if (!value) return '[DOMAIN]/api/(missing-image-route)'
  if (value.startsWith('/')) return `[DOMAIN]${value}`
  try {
    const url = new URL(value)
    return `[DOMAIN]${url.pathname}${url.search}`
  } catch {
    return `[DOMAIN]/${value}`
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The upload dialog's validation text (old PackageUploadDialog)
// ---------------------------------------------------------------------------------------------------------------

/** The dialog title for the chosen type. */
export function uploadDialogTitle(contentType: ContentType): string {
  return contentType === 'answer' ? 'Upload Answer Blog ZIP Package' : 'Upload Article ZIP Package'
}

/** The dialog's instruction for the chosen type. */
export function uploadDialogInstruction(contentType: ContentType): string {
  if (contentType === 'answer') return 'Upload a strict Answer Blog ZIP package. The HTML metadata supplies the text fields; the public card shape stays controlled by website code.'
  return 'Upload a strict Article ZIP package. The HTML metadata supplies the text fields; the public card shape stays controlled by website code.'
}

/** The validation text for a refusal: the error, then every problem, then every warning (old `formatIssues`). */
export function formatIssues(error: string, details: readonly string[] = [], warnings: readonly string[] = []): string {
  const lines: string[] = []
  if (error) lines.push(`Error: ${error}`)
  if (details.length) {
    lines.push('', 'Validation errors:')
    for (const detail of details) lines.push(`- ${detail}`)
  }
  if (warnings.length) {
    lines.push('', 'Warnings and image tips:')
    for (const warning of warnings) lines.push(`- ${warning}`)
  }
  if (!lines.length) lines.push('No validation messages.')
  return lines.join('\n')
}

/**
 * The validation text for an accepted package (old `validationSuccessText`), with one line added for D25: every image
 * needs a license, given in the Article images card after saving.
 */
export function validationSuccessText(fileName: string, contentType: ContentType, result: Pick<ArticlePackageCheckData, 'htmlFileName' | 'images' | 'warnings' | 'existingStatus'>): string {
  const contentLabel = packageLabel(contentType)
  const listLabel = contentType === 'answer' ? "firm's Answer Blog list" : "firm's Article list"
  const htmlCount = result.htmlFileName ? 1 : 0
  const imageCount = result.images.length
  const lines = [
    'Package is validated.',
    `Zip File "${fileName || 'Selected ZIP package'}" validated.`,
    `Located ${htmlCount} html file${htmlCount === 1 ? '' : 's'}, ${imageCount} image file${imageCount === 1 ? '' : 's'}.`,
    `Click SAVE ${contentLabel === 'Answer Blog' ? 'ANSWER BLOG' : 'ARTICLE'} to add to the ${listLabel}.`,
  ]
  if (imageCount) lines.push(`Each image needs a license before Publish. Add them in the Article images card after saving (${imageCount} to add).`)
  if (result.existingStatus) lines.push(`An item with this slug already exists (${result.existingStatus}). Saving will be refused; change that item instead.`)
  if (result.warnings.length) lines.push('', 'Warnings and image tips:', ...result.warnings.map((warning) => `- ${warning}`))
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// The preview document (old PublicationPreviewPanel)
// ---------------------------------------------------------------------------------------------------------------

function escapePreviewText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapePreviewText(value).replace(/"/g, '&quot;')
}

/**
 * The sandboxed preview frame's document (old `srcDocFor`): the title, the article stylesheet through the API's draft
 * address when the package had one (`stylesheetUrl`, made with `draftAssetUrl`), and the cleaned body. The old
 * rewrite of `/api/article-assets/` addresses is gone: the API sends draft image addresses already. One inline rule
 * (new) keeps the page light, as the public site is, when KR Homebase is in its dark theme; the article stylesheet
 * comes after it and wins.
 */
export function srcDocFor(title: string, bodyHtml: string, stylesheetUrl: string | null): string {
  const trimmed = bodyHtml.trim()
  const stylesheet = stylesheetUrl ? `\n<link rel="stylesheet" href="${escapeAttribute(stylesheetUrl)}" />` : ''
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapePreviewText(title || 'Publication preview')}</title>
<style>html{background:#ffffff;color:#1f3040;color-scheme:light}img{max-width:100%;height:auto}</style>${stylesheet}
</head>
<body>
${trimmed || '<article><p>No HTML body selected.</p></article>'}
</body>
</html>`
}
