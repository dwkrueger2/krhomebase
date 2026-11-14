// file: apps/api/src/features/publishing/articleSanitizer.ts
/**
 * The article HTML and CSS rules of Front End Publishing (plan 10, stage 6; D22), with no database, no request and no
 * storage, so the same code runs on the Worker and under vitest (Node).
 *
 * Ported from the old `hb-lib/front-end-publishing/server/articlePackageIngestion.ts`, which used jsdom and
 * isomorphic-dompurify (neither runs on a Worker, point 7 of the as-is record, section 6.5). Workers' built-in
 * `HTMLRewriter` does not exist in Node, so the tests could not run it; the HTML is read with `htmlparser2` (pure
 * JavaScript, runs in both) and written back by this file's own allow-list writer, which escapes every text and
 * attribute value itself.
 *
 * Two jobs:
 *
 *  1. `inspectPackageHtml`: the old `validateArticlePackageStructure`. It reads the package's HTML and refuses what the
 *     old rules refused (the `kr-*` meta tags, the one stylesheet link, scripts, frames, forms, event attributes,
 *     inline styles, `<style>`, `srcset`, unsafe addresses, images without alt text or outside the ZIP). Every
 *     problem keeps the old wording, for example `IMAGE_ALT_TEXT_REQUIRED:images/a.jpg`.
 *  2. `cleanArticleHtml`: the allow-list cleaner. It keeps only the article tags and attributes listed below, drops
 *     everything else (with its content for the dangerous tags, unwrapping the rest), and returns the body only. The
 *     package check runs it on the package's HTML, and the draft save and change routes run it again on any text the
 *     screen sends (closing point 2 of section 6.5: the old `saveDraft` trusted the browser's "sanitized" HTML).
 *     Images keep only addresses the caller's `resolveImage` accepts (the item's own images); others are dropped.
 *
 * The CSS rules (`validateArticleCss`, `rewriteCssUrls`) are the old ones: one root `article.css`, 256 KB, no
 * `@import`, no `expression(...)`, `url(...)` only to images in the ZIP.
 */

import { parseDocument } from 'htmlparser2'
import type { ArticlePackageMetadata, ContentType } from '@krhomebase/contracts'

type ParsedDocument = ReturnType<typeof parseDocument>
type DomNode = ParsedDocument['children'][number]

/** An element of the parsed tree (htmlparser2 marks `<script>` and `<style>` with their own node types). */
interface DomElement {
  type: string
  name: string
  attribs: Record<string, string>
  children: DomNode[]
}

export const ARTICLE_STYLESHEET_FILENAME = 'article.css'
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const BLOCKED_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select']

function isElement(node: DomNode): node is DomNode & DomElement {
  return 'name' in node && 'attribs' in node
}

function textOf(node: DomNode): string {
  if (node.type === 'text') return (node as { data: string }).data
  if (isElement(node)) return node.children.map(textOf).join('')
  return ''
}

/** Every element of the tree, in document order. */
function allElements(nodes: DomNode[], into: DomElement[] = []): DomElement[] {
  for (const node of nodes) {
    if (!isElement(node)) continue
    into.push(node)
    allElements(node.children, into)
  }
  return into
}

function parse(html: string): ParsedDocument {
  return parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true })
}

// ---------------------------------------------------------------------------------------------------------------
// Paths (the old `normalizeZipPath`, `normalizeImageReference`; `node:path` is replaced by `normalizePosix`)
// ---------------------------------------------------------------------------------------------------------------

/** A ZIP path made relative with `/` separators, or null when it is empty or has a `.` or `..` part (old rule). */
export function normalizeZipPath(value: string): string | null {
  const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null
  return parts.join('/')
}

/** `path.posix.normalize` for a relative path: `.` parts dropped, `a/..` folded; a `..` that climbs out is kept (and refused later). */
function normalizePosix(value: string): string {
  const out: string[] = []
  for (const part of value.split('/')) {
    if (!part || part === '.') continue
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

export function isHtmlFile(zipPath: string): boolean {
  return /\.html?$/i.test(zipPath)
}

export function isRootHtmlFile(zipPath: string): boolean {
  return !zipPath.includes('/') && isHtmlFile(zipPath)
}

export function isImageFile(zipPath: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(zipPath))
}

export function isCssFile(zipPath: string): boolean {
  return extensionOf(zipPath) === '.css'
}

/** Images may live only under `images/` or `assets/images/` (old rule). */
export function isAllowedImagePath(zipPath: string): boolean {
  return isImageFile(zipPath) && (zipPath.startsWith('images/') || zipPath.startsWith('assets/images/'))
}

type PathResult = { ok: true; normalized: string } | { ok: false; error: string }

/** An `<img src>` or `kr-thumbnail-src` value as a ZIP path, or the old refusal. */
export function normalizeImageReference(src: string): PathResult {
  const trimmed = src.trim()
  const lower = trimmed.toLowerCase()
  if (!trimmed) return { ok: false, error: 'IMAGE_SRC_EMPTY' }
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('//')) return { ok: false, error: `REMOTE_IMAGE_NOT_ALLOWED:${trimmed}` }
  if (lower.startsWith('file:') || trimmed.startsWith('/') || /^[a-z]:[\\/]/i.test(trimmed)) return { ok: false, error: `ABSOLUTE_LOCAL_IMAGE_PATH_NOT_ALLOWED:${trimmed}` }
  if (lower.startsWith('data:')) return { ok: false, error: `DATA_IMAGE_NOT_ALLOWED:${trimmed.slice(0, 40)}` }
  const withoutQuery = trimmed.split('#')[0]!.split('?')[0]!
  let decoded: string
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    return { ok: false, error: `IMAGE_SRC_BAD_ENCODING:${trimmed}` }
  }
  const normalized = normalizeZipPath(normalizePosix(decoded.replace(/\\/g, '/')))
  if (!normalized) return { ok: false, error: `IMAGE_SRC_PATH_ESCAPE:${trimmed}` }
  if (!isAllowedImagePath(normalized)) return { ok: false, error: `IMAGE_OUTSIDE_ALLOWED_FOLDER:${trimmed}` }
  return { ok: true, normalized }
}

/** Lowercase letters, digits and hyphens (old `slugValue`). */
export function slugValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '')
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Package HTML inspection (old `validateArticlePackageStructure` and its helpers)
// ---------------------------------------------------------------------------------------------------------------

export interface ImageReference {
  /** The `src` as written. */
  original: string
  /** Its ZIP path. */
  normalized: string
  altText: string
}

export interface PackageHtmlFindings {
  problems: string[]
  warnings: string[]
  metadata: ArticlePackageMetadata
  imageReferences: ImageReference[]
  /** The thumbnail's ZIP path, when `kr-thumbnail-src` is valid. */
  thumbnailPath: string | null
  /** Whether the HTML links `article.css`. */
  linksStylesheet: boolean
}

function metaValue(elements: DomElement[], name: string): string {
  const meta = elements.find((element) => element.name === 'meta' && element.attribs.name === name)
  return (meta?.attribs.content ?? '').trim()
}

/** Reads the `kr-*` meta tags (old `extractPackageMetadata`); adds a problem for each one missing. */
function extractPackageMetadata(elements: DomElement[], expected: ContentType, problems: string[]): ArticlePackageMetadata {
  const declaredContentType = metaValue(elements, 'kr-content-type')
  const titleElement = elements.find((element) => element.name === 'title')
  const title = metaValue(elements, 'kr-title') || (titleElement ? textOf(titleElement as unknown as DomNode).trim() : '')
  const slug = slugValue(metaValue(elements, 'kr-slug'))
  const summary = metaValue(elements, 'kr-summary') || metaValue(elements, 'description')
  const thumbnailSrc = metaValue(elements, 'kr-thumbnail-src')
  const thumbnailAlt = metaValue(elements, 'kr-thumbnail-alt')
  const seoTitle = metaValue(elements, 'kr-seo-title') || title
  const seoDescription = metaValue(elements, 'kr-seo-description') || metaValue(elements, 'description') || summary
  const category = metaValue(elements, 'kr-category') || null
  const categoryLabel = metaValue(elements, 'kr-category-label') || category
  const pillar = metaValue(elements, 'kr-pillar') || null
  const topicSlug = slugValue(metaValue(elements, 'kr-topic-slug')) || null
  const readingTimeRaw = metaValue(elements, 'kr-reading-time-minutes')
  const readingTimeMinutes = readingTimeRaw ? Number(readingTimeRaw) : null
  const authorDisplayName = metaValue(elements, 'kr-author-display-name') || null

  if (declaredContentType !== 'article' && declaredContentType !== 'answer') problems.push('META_KR_CONTENT_TYPE_REQUIRED_ARTICLE_OR_ANSWER')
  else if (declaredContentType !== expected) problems.push(`META_CONTENT_TYPE_MISMATCH:expected_${expected}_found_${declaredContentType}`)
  if (!title) problems.push('META_KR_TITLE_REQUIRED')
  if (!slug) problems.push('META_KR_SLUG_REQUIRED')
  if (!summary) problems.push('META_KR_SUMMARY_REQUIRED')
  if (!thumbnailSrc) problems.push('META_KR_THUMBNAIL_SRC_REQUIRED')
  if (!thumbnailAlt) problems.push('META_KR_THUMBNAIL_ALT_REQUIRED')
  if (!seoTitle) problems.push('META_KR_SEO_TITLE_REQUIRED')
  if (!seoDescription) problems.push('META_KR_SEO_DESCRIPTION_REQUIRED')
  if (expected === 'article' && !category) problems.push('META_KR_CATEGORY_REQUIRED_FOR_ARTICLE')
  if (expected === 'answer' && !pillar) problems.push('META_KR_PILLAR_REQUIRED_FOR_ANSWER')
  if (readingTimeRaw && (!Number.isFinite(readingTimeMinutes) || (readingTimeMinutes ?? 0) < 1)) problems.push('META_KR_READING_TIME_MINUTES_MUST_BE_POSITIVE_NUMBER')

  return {
    contentType: expected,
    title,
    slug,
    summary,
    thumbnailSrc,
    thumbnailAlt,
    seoTitle,
    seoDescription,
    category,
    categoryLabel,
    readingTimeMinutes: Number.isFinite(readingTimeMinutes) ? readingTimeMinutes : null,
    pillar,
    topicSlug,
    authorDisplayName,
  }
}

/** The one `article.css` rule (old `validateStylesheetUsage`): problems and whether the HTML links it. */
function validateStylesheetUsage(elements: DomElement[], normalizedPaths: string[], problems: string[], warnings: string[]): boolean {
  const cssFiles = normalizedPaths.filter(isCssFile)
  for (const zipPath of cssFiles.filter((candidate) => candidate !== ARTICLE_STYLESHEET_FILENAME)) problems.push(`CSS_FILE_NOT_ALLOWED:${zipPath}:only_article_css_at_zip_root_is_allowed`)
  if (cssFiles.length > 1) problems.push(`PACKAGE_ALLOWS_ONLY_ONE_CSS_FILE:found_${cssFiles.length}`)

  const stylesheetLinks = elements.filter((element) => element.name === 'link' && (element.attribs.rel ?? '').toLowerCase().split(/\s+/).includes('stylesheet'))
  for (const link of stylesheetLinks) {
    const href = (link.attribs.href ?? '').trim()
    const normalized = normalizeZipPath(href.split('#')[0]!.split('?')[0]!)
    if (normalized !== ARTICLE_STYLESHEET_FILENAME) problems.push(`STYLESHEET_LINK_NOT_ALLOWED:${href || '(missing-href)'}:use_article.css_only`)
  }
  if (stylesheetLinks.length > 1) problems.push(`HTML_ALLOWS_ONLY_ONE_STYLESHEET_LINK:found_${stylesheetLinks.length}`)
  if (stylesheetLinks.length === 1 && !cssFiles.includes(ARTICLE_STYLESHEET_FILENAME)) problems.push('ARTICLE_CSS_LINKED_BUT_FILE_MISSING')
  if (cssFiles.includes(ARTICLE_STYLESHEET_FILENAME) && stylesheetLinks.length === 0) warnings.push('ARTICLE_CSS_INCLUDED_BUT_NOT_LINKED_FROM_HTML')
  if (elements.some((element) => element.name === 'style')) problems.push('STYLE_TAG_NOT_ALLOWED_USE_ARTICLE_CSS')
  for (const element of elements) {
    if ('style' in element.attribs) problems.push(`INLINE_STYLE_ATTRIBUTE_NOT_ALLOWED:${element.name}`)
  }
  return stylesheetLinks.length > 0
}

/** Scripts, frames, forms, event attributes and unsafe addresses (old `findJavaScriptViolations`). */
function findJavaScriptViolations(elements: DomElement[], problems: string[]): void {
  for (const tag of BLOCKED_ELEMENTS) {
    if (elements.some((element) => element.name === tag)) problems.push(`JAVASCRIPT_OR_EXECUTABLE_ELEMENT_NOT_ALLOWED:<${tag}>`)
  }
  for (const element of elements) {
    for (const [attribute, raw] of Object.entries(element.attribs)) {
      const name = attribute.toLowerCase()
      const value = raw.trim().toLowerCase()
      if (name.startsWith('on')) problems.push(`EVENT_HANDLER_NOT_ALLOWED:${element.name}[${attribute}]`)
      if (
        (name === 'href' || name === 'src' || name === 'xlink:href') &&
        (value.startsWith('javascript:') || value.startsWith('vbscript:') || value.startsWith('data:text/html') || value.startsWith('file:') || /^[a-z]:[\\/]/i.test(raw.trim()))
      ) {
        problems.push(`UNSAFE_URI_NOT_ALLOWED:${element.name}[${attribute}]`)
      }
    }
  }
}

/**
 * Checks a package's HTML against its ZIP entry paths (old `validateArticlePackageStructure`, remote images refused
 * as the old upload route always did). `entryPaths` are the ZIP's normalized file paths.
 */
export function inspectPackageHtml(html: string, contentType: ContentType, entryPaths: string[]): PackageHtmlFindings {
  const problems: string[] = []
  const warnings: string[] = []
  const elements = allElements(parse(html).children)
  const metadata = extractPackageMetadata(elements, contentType, problems)
  const linksStylesheet = validateStylesheetUsage(elements, entryPaths, problems, warnings)
  findJavaScriptViolations(elements, problems)

  const imageEntries = new Set(entryPaths.filter(isAllowedImagePath))
  let thumbnailPath: string | null = null
  if (metadata.thumbnailSrc) {
    const thumbnail = normalizeImageReference(metadata.thumbnailSrc)
    if (!thumbnail.ok) problems.push(`META_THUMBNAIL_SRC_INVALID:${thumbnail.error}`)
    else if (!imageEntries.has(thumbnail.normalized)) problems.push(`META_THUMBNAIL_IMAGE_MISSING_FROM_ZIP:${thumbnail.normalized}`)
    else thumbnailPath = thumbnail.normalized
  }

  const imageReferences: ImageReference[] = []
  for (const image of elements.filter((element) => element.name === 'img')) {
    const src = image.attribs.src ?? ''
    if ('srcset' in image.attribs) problems.push(`IMAGE_SRCSET_NOT_ALLOWED:${src || '(missing-src)'}`)
    const altText = (image.attribs.alt ?? '').trim()
    if (!altText) problems.push(`IMAGE_ALT_TEXT_REQUIRED:${src || '(missing-src)'}`)
    const normalized = normalizeImageReference(src)
    if (!normalized.ok) {
      problems.push(normalized.error)
      continue
    }
    if (!imageEntries.has(normalized.normalized)) problems.push(`REFERENCED_IMAGE_MISSING_FROM_ZIP:${normalized.normalized}`)
    imageReferences.push({ original: src, normalized: normalized.normalized, altText })
  }

  return { problems, warnings, metadata, imageReferences, thumbnailPath, linksStylesheet }
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The allow-list cleaner
// ---------------------------------------------------------------------------------------------------------------

/** Tags kept (with the attributes below). Everything else is dropped or unwrapped. */
const ALLOWED_TAGS = new Set([
  'article', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'div', 'span', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'q', 'cite',
  'figure', 'figcaption', 'img', 'a', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
  'abbr', 'code', 'pre', 'kbd', 'samp', 'var', 'time', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr',
  'th', 'td', 'colgroup', 'col', 'details', 'summary', 'address', 'del', 'ins', 'wbr',
])

/** Tags with no closing tag. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'col'])

/** Tags removed together with everything inside them: active content, forms, media, the document head. */
const DROPPED_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'optgroup', 'datalist', 'output', 'noscript', 'template', 'svg', 'math',
  'head', 'title', 'meta', 'link', 'base', 'canvas', 'audio', 'video', 'source', 'track', 'param', 'map',
  'area', 'portal', 'dialog', 'slot',
])

/** Attributes any kept tag may have. `aria-*` attributes are kept as well. */
const GLOBAL_ATTRIBUTES = new Set(['id', 'class', 'title', 'lang', 'dir', 'role'])

/** Further attributes by tag (`img` is written by the image rule, `a` by the link rule). */
const TAG_ATTRIBUTES: Record<string, string[]> = {
  td: ['colspan', 'rowspan', 'headers', 'scope'],
  th: ['colspan', 'rowspan', 'headers', 'scope', 'abbr'],
  ol: ['start', 'reversed', 'type'],
  li: ['value'],
  time: ['datetime'],
  del: ['datetime', 'cite'],
  ins: ['datetime', 'cite'],
  blockquote: ['cite'],
  q: ['cite'],
  col: ['span'],
  colgroup: ['span'],
  details: ['open'],
}

const NUMBER_ATTRIBUTES = new Set(['colspan', 'rowspan', 'start', 'value', 'span'])
const URL_ATTRIBUTES = new Set(['cite'])

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * A link or citation address the cleaner keeps: `http:`, `https:`, `mailto:`, `tel:`, a `#fragment` or a site path
 * (`/contact`, `page.html`). Control characters and spaces are ignored when the scheme is read, so `java\tscript:`
 * is refused like `javascript:`. Protocol-relative (`//host`) addresses are refused.
 */
export function safeLinkUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const compact = trimmed.replace(/[\u0000- \u007f-\u009f]/g, '')
  if (compact.startsWith('//') || compact.startsWith('\\\\') || compact.startsWith('/\\')) return null
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)
  if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme[1]!.toLowerCase())) return null
  return trimmed
}

/** What `resolveImage` returns for an image the item owns. */
export interface ResolvedImage {
  /** The address written into `src`. */
  url: string
  /** The alt text used when the `<img>` has none. */
  altText: string
  width: number | null
  height: number | null
  /** The image's ZIP path, for the problem list. */
  originalPath: string
}

export interface CleanResult {
  /** The cleaned body text. */
  html: string
  /** `src` values of images that were dropped because they are not the item's own. */
  droppedImages: string[]
  /** ZIP paths of kept images that have no alt text (a draft cannot be saved with these). */
  imagesMissingAlt: string[]
}

function keptAttributes(element: DomElement): string {
  const allowed = TAG_ATTRIBUTES[element.name] ?? []
  const parts: string[] = []
  for (const [name, raw] of Object.entries(element.attribs)) {
    if (!(GLOBAL_ATTRIBUTES.has(name) || /^aria-[a-z]+$/.test(name) || allowed.includes(name))) continue
    let value = raw
    if (name === 'id' && !/^[A-Za-z][A-Za-z0-9_:.-]{0,99}$/.test(value)) continue
    if (NUMBER_ATTRIBUTES.has(name) && !/^\d{1,4}$/.test(value.trim())) continue
    if (name === 'type' && !/^[1aAiI]$/.test(value.trim())) continue
    if (URL_ATTRIBUTES.has(name)) {
      const safe = safeLinkUrl(value)
      if (!safe) continue
      value = safe
    }
    parts.push(name === 'reversed' || name === 'open' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`)
  }
  return parts.join('')
}

/**
 * Cleans article HTML with the allow-list and returns the body only (a whole document is unwrapped; its `<head>` is
 * dropped). Comments, doctype lines and processing instructions are dropped. `<a>` keeps a safe `href` (see
 * `safeLinkUrl`). `<img>` keeps only an address `resolveImage` accepts, written as the resolved address with the
 * image's own width and height, `loading="lazy"` and `decoding="async"`; the `<img>` alt text wins over the image's
 * stored alt text. Every text and attribute value is escaped again on the way out.
 */
export function cleanArticleHtml(html: string, resolveImage: (src: string) => ResolvedImage | null): CleanResult {
  const droppedImages: string[] = []
  const imagesMissingAlt: string[] = []
  const out: string[] = []

  const walk = (nodes: DomNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        out.push(escapeText((node as { data: string }).data))
        continue
      }
      if (!isElement(node)) continue // comments, doctype, processing instructions, CDATA
      const name = node.name
      if (DROPPED_WITH_CONTENT.has(name)) continue
      if (!ALLOWED_TAGS.has(name)) {
        walk(node.children) // html, body and unknown tags: keep their content only
        continue
      }
      if (name === 'img') {
        const src = node.attribs.src ?? ''
        const image = resolveImage(src)
        if (!image) {
          droppedImages.push(src || '(missing-src)')
          continue
        }
        const alt = (node.attribs.alt ?? '').trim() || image.altText.trim()
        if (!alt) imagesMissingAlt.push(image.originalPath)
        const size = `${image.width ? ` width="${image.width}"` : ''}${image.height ? ` height="${image.height}"` : ''}`
        out.push(`<img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(alt)}"${size} loading="lazy" decoding="async"${keptAttributes(node)}>`)
        continue
      }
      let attributes = keptAttributes(node)
      if (name === 'a') {
        const href = node.attribs.href === undefined ? null : safeLinkUrl(node.attribs.href)
        if (href) attributes = ` href="${escapeAttribute(href)}"${attributes}`
      }
      out.push(`<${name}${attributes}>`)
      if (VOID_TAGS.has(name)) continue
      walk(node.children)
      out.push(`</${name}>`)
    }
  }

  walk(parse(html).children)
  return { html: out.join('').trim(), droppedImages, imagesMissingAlt }
}

// ---------------------------------------------------------------------------------------------------------------
// CSS (old `validateArticleCss`, `normalizeCssAssetReference`, `rewriteCssWithDraftImageUrls`)
// ---------------------------------------------------------------------------------------------------------------

const CSS_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi

function normalizeCssAssetReference(reference: string): PathResult {
  const trimmed = reference.trim()
  const lower = trimmed.toLowerCase()
  if (!trimmed) return { ok: false, error: 'CSS_URL_EMPTY' }
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('//')) return { ok: false, error: `CSS_REMOTE_URL_NOT_ALLOWED:${trimmed}` }
  if (lower.startsWith('data:')) return { ok: false, error: `CSS_DATA_URL_NOT_ALLOWED:${trimmed.slice(0, 40)}` }
  if (lower.startsWith('file:') || trimmed.startsWith('/') || /^[a-z]:[\\/]/i.test(trimmed)) return { ok: false, error: `CSS_ABSOLUTE_OR_FILE_URL_NOT_ALLOWED:${trimmed}` }
  const withoutQuery = trimmed.split('#')[0]!.split('?')[0]!
  let decoded: string
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    return { ok: false, error: `CSS_URL_BAD_ENCODING:${trimmed}` }
  }
  const normalized = normalizeZipPath(normalizePosix(decoded.replace(/\\/g, '/')))
  if (!normalized) return { ok: false, error: `CSS_URL_PATH_ESCAPE:${trimmed}` }
  if (!isAllowedImagePath(normalized)) return { ok: false, error: `CSS_URL_OUTSIDE_ALLOWED_IMAGE_FOLDER:${trimmed}` }
  return { ok: true, normalized }
}

/** The old CSS rules: 256 KB, no `@import`, no `expression(...)`, `url(...)` only to images in the ZIP. */
export function validateArticleCss(cssText: string, imageEntries: Set<string>, maxBytes: number): { problems: string[]; references: string[] } {
  const problems: string[] = []
  const references: string[] = []
  if (new TextEncoder().encode(cssText).byteLength > maxBytes) problems.push(`ARTICLE_CSS_TOO_LARGE:max_${maxBytes}_bytes`)
  if (/@import\b/i.test(cssText)) problems.push('ARTICLE_CSS_IMPORT_NOT_ALLOWED')
  if (/expression\s*\(/i.test(cssText)) problems.push('ARTICLE_CSS_EXPRESSION_NOT_ALLOWED')
  for (const match of cssText.matchAll(CSS_URL_PATTERN)) {
    const value = match[2]?.trim()
    if (!value) continue
    const normalized = normalizeCssAssetReference(value)
    if (!normalized.ok) {
      problems.push(normalized.error)
      continue
    }
    if (!imageEntries.has(normalized.normalized)) problems.push(`CSS_REFERENCED_IMAGE_MISSING_FROM_ZIP:${normalized.normalized}`)
    references.push(normalized.normalized)
  }
  return { problems, references }
}

/** Points each `url(...)` at an image's address (old `rewriteCssWithDraftImageUrls`); `urlFor` gets the ZIP path. */
export function rewriteCssUrls(cssText: string, urlFor: (zipPath: string) => string | null): string {
  return cssText.replace(CSS_URL_PATTERN, (fullMatch, quote: string, rawValue: string) => {
    const normalized = normalizeCssAssetReference(String(rawValue || ''))
    if (!normalized.ok) return fullMatch
    const url = urlFor(normalized.normalized)
    if (!url) return fullMatch
    const safeQuote = quote || '"'
    return `url(${safeQuote}${url}${safeQuote})`
  })
}
