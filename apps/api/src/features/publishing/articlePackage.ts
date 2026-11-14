// file: apps/api/src/features/publishing/articlePackage.ts
/**
 * The Front End Publishing package check (plan 10, stage 6; D22), with no database, no request and no storage: it
 * reads one ZIP and returns either every problem (old wording) or the plan of what to store. The routes store the
 * plan through `src/platform/articleStorage.ts`. Runs on the Worker and under vitest.
 *
 * Ported from the old `ingestArticlePackage` (`hb-lib/front-end-publishing/server/articlePackageIngestion.ts`), whose
 * server libraries do not run on a Worker (jszip, sharp, file-type; point 7 of the as-is record, section 6.5):
 *
 *  - fflate unzips (D22). Each entry's stated size is checked before it is unpacked, and only the root HTML, the root
 *    `article.css` and the allowed images are unpacked at all.
 *  - The image type is read from the file's first bytes and must match its extension; width and height are read from
 *    the file header (PNG IHDR, GIF screen descriptor, WebP VP8/VP8L/VP8X, JPEG start-of-frame).
 *  - The HTML rules and the cleaner are in `articleSanitizer.ts`.
 *
 * Kept: 50 MB ZIP; exactly one `.html`, at the root; optional root `article.css` (256 KB); images only under
 * `images/` or `assets/images/` (jpg, jpeg, png, webp, gif), 8 MB and 24 megapixels each; the `kr-*` meta tags; the
 * thumbnail tips (16:9, 1600 x 900); the image usage rule (`thumbnail`, `both`, `body`); the keys
 * `source-uploads/<type>/<slug>/<time>/<file>.zip`, `images/<type>/<slug>/<12 hex>-<name>`,
 * `stylesheets/<type>/<slug>/<12 hex>-article.css`, `sanitized-snapshots/<type>/<slug>/<time>/sanitized.html`; the
 * content id `<type>_<slug>`.
 *
 * Changed from the old check:
 *  - Every problem is collected and returned together (the old route stopped at the first image or CSS failure).
 *  - An image whose type cannot be read from its bytes is refused (`IMAGE_MIME_MISMATCH:...:detected_unknown`); the
 *    old check accepted it when file-type found nothing. An image whose size cannot be read is refused
 *    (`IMAGE_DIMENSIONS_UNREADABLE:<path>`); the old check skipped the pixel limit then.
 *  - New limits, to protect the Worker's memory and D1: at most 500 files in a ZIP
 *    (`PACKAGE_HAS_TOO_MANY_FILES:max_500`), and an HTML file of at most 1,000,000 bytes
 *    (`HTML_FILE_TOO_LARGE:<path>:max_1000000_bytes`). An unreadable ZIP answers `PACKAGE_ZIP_UNREADABLE`.
 *  - The key time and file name come from the caller, so the draft save can check a stored ZIP again and get the
 *    same keys (it never takes keys from the browser).
 */

import { unzipSync } from 'fflate'
import {
  ARTICLE_CSS_MAX_BYTES,
  ARTICLE_HTML_MAX_BYTES,
  ARTICLE_IMAGE_MAX_BYTES,
  ARTICLE_IMAGE_MAX_PIXELS,
  ARTICLE_PACKAGE_MAX_BYTES,
  draftAssetUrl,
  type ArticlePackageMetadata,
  type ContentType,
} from '@krhomebase/contracts'
import {
  ARTICLE_STYLESHEET_FILENAME,
  cleanArticleHtml,
  extensionOf,
  inspectPackageHtml,
  isAllowedImagePath,
  isCssFile,
  isHtmlFile,
  isImageFile,
  isRootHtmlFile,
  normalizeImageReference,
  normalizeZipPath,
  rewriteCssUrls,
  slugValue,
  validateArticleCss,
} from './articleSanitizer.ts'

const MAX_ZIP_ENTRIES = 500
const THUMBNAIL_RECOMMENDED_WIDTH = 1600
const THUMBNAIL_RECOMMENDED_HEIGHT = 900
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** One image ready to store. */
export interface CheckedImage {
  originalPath: string
  key: string
  url: string
  mimeType: string
  fileSize: number
  width: number
  height: number
  usage: 'body' | 'thumbnail' | 'both'
  altText: string
  sha256: string
  bytes: Uint8Array
}

/** An accepted package and everything to store for it. */
export interface CheckedPackage {
  contentType: ContentType
  slug: string
  contentId: string
  htmlFileName: string
  metadata: ArticlePackageMetadata
  /** The cleaned body text with draft image addresses. */
  html: string
  stylesheet: { key: string; url: string; text: string } | null
  images: CheckedImage[]
  sourceKey: string
  snapshotKey: string
  warnings: string[]
}

export type PackageCheckResult = { ok: true; pkg: CheckedPackage } | { ok: false; problems: string[]; warnings: string[] }

export interface PackageCheckInput {
  zipBytes: Uint8Array
  /** The uploaded file's name (must end `.zip`). */
  fileName: string
  contentType: ContentType
  /** The key time, `2026-11-13T18-20-11-123Z` (`keyStamp`). */
  stamp: string
}

/** The time part of the keys: the ISO time with `.` and `:` made `-` (old `nowSafeStamp`). */
export function keyStamp(now: Date): string {
  return now.toISOString().replace(/[.:]/g, '-')
}

/** A ZIP file name safe for a key (old `safeOriginalFilename`). */
export function safeOriginalFilename(value: string): string {
  const basename = (value.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  return basename || 'article-package.zip'
}

/** An image file name safe for a key (old `safeR2ImageBasename`). */
function safeR2ImageBasename(zipPath: string): string {
  const basename = zipPath.split('/').pop() ?? ''
  const extension = extensionOf(basename)
  const name = basename.slice(0, basename.length - extension.length).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^[-_.]+|[-_.]+$)/g, '')
  return `${name || 'image'}${extension || '.jpg'}`
}

/** `source-uploads/<type>/<slug>/<time>/<file>.zip`, read back into its parts, or null when the key is not one. */
export function sourceKeyParts(key: string): { contentType: ContentType; slug: string; stamp: string; fileName: string } | null {
  const match = /^source-uploads\/(article|answer)\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\/([a-z0-9._-]+\.zip)$/.exec(key)
  return match ? { contentType: match[1] as ContentType, slug: match[2]!, stamp: match[3]!, fileName: match[4]! } : null
}

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------------------------------------------
// Image bytes
// ---------------------------------------------------------------------------------------------------------------

const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8)
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16)
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) >>> 0) + ((b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!)
const ascii = (b: Uint8Array, at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length))

/** The image type read from its first bytes, or null when it is none of jpeg, png, webp, gif. */
export function sniffImageType(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'image/gif'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp'
  return null
}

function jpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  let at = 2
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1]!
    if (marker === 0xff) {
      at += 1 // fill byte
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2 // markers without a length
      continue
    }
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) return { height: u16be(b, at + 5), width: u16be(b, at + 7) }
    if (marker === 0xd9 || marker === 0xda) return null // end of image or start of scan before any frame
    at += 2 + u16be(b, at + 2)
  }
  return null
}

/** Width and height read from the file header, or null when they cannot be read. */
export function imageDimensions(b: Uint8Array, mimeType: string): { width: number; height: number } | null {
  let size: { width: number; height: number } | null = null
  if (mimeType === 'image/png' && b.length >= 24 && ascii(b, 12, 4) === 'IHDR') size = { width: u32be(b, 16), height: u32be(b, 20) }
  else if (mimeType === 'image/gif' && b.length >= 10) size = { width: u16le(b, 6), height: u16le(b, 8) }
  else if (mimeType === 'image/jpeg') size = jpegDimensions(b)
  else if (mimeType === 'image/webp' && b.length >= 30) {
    const chunk = ascii(b, 12, 4)
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) size = { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
    else if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    } else if (chunk === 'VP8X') size = { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  }
  return size && size.width > 0 && size.height > 0 ? size : null
}

/** The old usage rule: the thumbnail is `thumbnail` (or `both` when the text shows it too); `thumbnail` in the name hints. */
function usageForImage(zipPath: string, thumbnailPath: string | null, inText: boolean): CheckedImage['usage'] {
  const basename = (zipPath.split('/').pop() ?? '').toLowerCase()
  const declared = thumbnailPath && zipPath === thumbnailPath ? 'thumbnail' : basename.startsWith('thumbnail.') ? 'thumbnail' : basename.includes('thumbnail') ? 'both' : 'body'
  return inText && declared === 'thumbnail' ? 'both' : declared
}

// ---------------------------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------------------------

/**
 * Checks one package and plans what to store. Writes nothing. Returns every problem in the old wording, or the
 * cleaned HTML, the stylesheet (its `url(...)` pointed at the images' draft addresses), the images with their bytes,
 * and every key.
 */
export async function checkArticlePackage(input: PackageCheckInput): Promise<PackageCheckResult> {
  const problems: string[] = []
  const warnings: string[] = []
  const refuse = () => ({ ok: false as const, problems, warnings })

  if (!input.fileName.toLowerCase().endsWith('.zip')) problems.push('PACKAGE_FILE_EXTENSION_MUST_BE_ZIP')
  if (input.zipBytes.byteLength > ARTICLE_PACKAGE_MAX_BYTES) problems.push('PACKAGE_ZIP_TOO_LARGE')
  if (problems.length) return refuse()

  // Pass 1: every entry's name and stated size; only the files the package may hold are unpacked.
  const entryPaths: string[] = []
  const unsafePaths: string[] = []
  let entryCount = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(input.zipBytes, {
      filter: (file) => {
        if (file.name.endsWith('/')) return false // a folder entry
        entryCount += 1
        const path = normalizeZipPath(file.name)
        if (!path) {
          unsafePaths.push(file.name)
          return false
        }
        entryPaths.push(path)
        if (entryCount > MAX_ZIP_ENTRIES) return false
        if (isRootHtmlFile(path)) {
          if (file.originalSize > ARTICLE_HTML_MAX_BYTES) problems.push(`HTML_FILE_TOO_LARGE:${path}:max_${ARTICLE_HTML_MAX_BYTES}_bytes`)
          return file.originalSize <= ARTICLE_HTML_MAX_BYTES
        }
        if (path === ARTICLE_STYLESHEET_FILENAME) {
          if (file.originalSize > ARTICLE_CSS_MAX_BYTES) problems.push(`ARTICLE_CSS_TOO_LARGE:max_${ARTICLE_CSS_MAX_BYTES}_bytes`)
          return file.originalSize <= ARTICLE_CSS_MAX_BYTES
        }
        if (isAllowedImagePath(path)) {
          if (file.originalSize > ARTICLE_IMAGE_MAX_BYTES) problems.push(`IMAGE_FILE_TOO_LARGE:${path}:max_${ARTICLE_IMAGE_MAX_BYTES}_bytes`)
          return file.originalSize <= ARTICLE_IMAGE_MAX_BYTES
        }
        return false
      },
    })
  } catch {
    problems.push('PACKAGE_ZIP_UNREADABLE')
    return refuse()
  }

  if (entryCount > MAX_ZIP_ENTRIES) problems.push(`PACKAGE_HAS_TOO_MANY_FILES:max_${MAX_ZIP_ENTRIES}`)
  for (const path of unsafePaths) problems.push(`PACKAGE_CONTAINS_UNSAFE_PATH:${path}`)
  const rootHtml = entryPaths.filter(isRootHtmlFile)
  const allHtml = entryPaths.filter(isHtmlFile)
  if (rootHtml.length !== 1 || allHtml.length !== 1) problems.push(`PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_${rootHtml.length}_found_total_${allHtml.length}`)
  for (const path of allHtml.filter((candidate) => !isRootHtmlFile(candidate))) problems.push(`HTML_FILE_MUST_BE_AT_PACKAGE_ROOT:${path}`)
  for (const path of entryPaths.filter((candidate) => isImageFile(candidate) && !isAllowedImagePath(candidate))) problems.push(`IMAGE_OUTSIDE_ALLOWED_FOLDER:${path}`)
  for (const path of entryPaths.filter(isAllowedImagePath)) {
    const basename = path.split('/').pop() ?? ''
    if (!/^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp|gif)$/.test(basename)) warnings.push(`IMAGE_FILENAME_TIP_USE_LOWER_URL_SAFE_WHEN_PRACTICAL:${path}`)
  }

  const htmlPath = rootHtml.length === 1 ? rootHtml[0]! : null
  const htmlBytes = htmlPath ? files[htmlPath] : undefined
  if (!htmlPath || !htmlBytes) return refuse()
  const html = new TextDecoder().decode(htmlBytes)
  const findings = inspectPackageHtml(html, input.contentType, entryPaths)
  problems.push(...findings.problems)
  warnings.push(...findings.warnings)

  // The stylesheet.
  const imagePaths = entryPaths.filter(isAllowedImagePath).sort()
  const imageSet = new Set(imagePaths)
  const cssBytes = files[ARTICLE_STYLESHEET_FILENAME]
  const cssText = cssBytes ? new TextDecoder().decode(cssBytes) : null
  const cssCheck = cssText === null ? null : validateArticleCss(cssText, imageSet, ARTICLE_CSS_MAX_BYTES)
  if (cssCheck) problems.push(...cssCheck.problems)
  const cssReferences = new Set(cssCheck?.references ?? [])

  // The images: type from the bytes, size from the header.
  const slug = slugValue(findings.metadata.slug)
  const contentType = input.contentType
  const referenceByPath = new Map(findings.imageReferences.map((reference) => [reference.normalized, reference]))
  const images: CheckedImage[] = []
  for (const path of imagePaths) {
    const bytes = files[path]
    if (!bytes) continue // too large: already a problem
    const expected = IMAGE_MIME_BY_EXTENSION[extensionOf(path)]
    const detected = sniffImageType(bytes)
    if (!expected || detected !== expected) {
      problems.push(`IMAGE_MIME_MISMATCH:${path}:expected_${expected ?? 'unknown'}:detected_${detected ?? 'unknown'}`)
      continue
    }
    const size = imageDimensions(bytes, detected)
    if (!size) {
      problems.push(`IMAGE_DIMENSIONS_UNREADABLE:${path}`)
      continue
    }
    if (size.width * size.height > ARTICLE_IMAGE_MAX_PIXELS) {
      problems.push(`IMAGE_DIMENSIONS_TOO_LARGE:${path}:max_${ARTICLE_IMAGE_MAX_PIXELS}_pixels`)
      continue
    }
    if (path === findings.thumbnailPath) {
      if (Math.abs(size.width / size.height - 16 / 9) > 0.04) warnings.push(`THUMBNAIL_TIP_USE_16_BY_9_IMAGE:${path}:current_${size.width}x${size.height}`)
      if (size.width < THUMBNAIL_RECOMMENDED_WIDTH || size.height < THUMBNAIL_RECOMMENDED_HEIGHT) warnings.push(`THUMBNAIL_TIP_RECOMMENDED_1600x900:${path}:current_${size.width}x${size.height}`)
    }
    const hash = await sha256Hex(bytes)
    const key = `images/${contentType}/${slug}/${hash.slice(0, 12)}-${safeR2ImageBasename(path)}`
    const reference = referenceByPath.get(path)
    images.push({
      originalPath: path,
      key,
      url: draftAssetUrl(key),
      mimeType: detected,
      fileSize: bytes.byteLength,
      width: size.width,
      height: size.height,
      usage: usageForImage(path, findings.thumbnailPath, Boolean(reference) || cssReferences.has(path)),
      altText: path === findings.thumbnailPath ? findings.metadata.thumbnailAlt : (reference?.altText ?? ''),
      sha256: hash,
      bytes,
    })
  }
  if (problems.length || !slug) return refuse()

  // Accepted: the cleaned text, the stylesheet and the keys.
  const imageByPath = new Map(images.map((image) => [image.originalPath, image]))
  let stylesheet: CheckedPackage['stylesheet'] = null
  if (cssText !== null) {
    const rewritten = rewriteCssUrls(cssText, (zipPath) => imageByPath.get(zipPath)?.url ?? null)
    const key = `stylesheets/${contentType}/${slug}/${(await sha256Hex(rewritten)).slice(0, 12)}-${ARTICLE_STYLESHEET_FILENAME}`
    stylesheet = { key, url: draftAssetUrl(key), text: rewritten }
  }
  const cleaned = cleanArticleHtml(html, (src) => {
    const normalized = normalizeImageReference(src)
    const image = normalized.ok ? imageByPath.get(normalized.normalized) : undefined
    return image ? { url: image.url, altText: image.altText, width: image.width, height: image.height, originalPath: image.originalPath } : null
  })
  const fileName = safeOriginalFilename(input.fileName)
  return {
    ok: true,
    pkg: {
      contentType,
      slug,
      contentId: `${contentType}_${slug}`,
      htmlFileName: htmlPath,
      metadata: { ...findings.metadata, slug },
      html: cleaned.html,
      stylesheet,
      images,
      sourceKey: `source-uploads/${contentType}/${slug}/${input.stamp}/${fileName}`,
      snapshotKey: `sanitized-snapshots/${contentType}/${slug}/${input.stamp}/sanitized.html`,
      warnings,
    },
  }
}
