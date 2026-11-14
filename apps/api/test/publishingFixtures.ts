// file: apps/api/test/publishingFixtures.ts
/**
 * Made-up article packages for the Front End Publishing tests (no real articles, people or images). Builds small ZIPs
 * in memory with fflate and the smallest image headers the package check reads (PNG, JPEG, GIF, WebP), plus an
 * in-memory R2 bucket with the four calls `src/platform/articleStorage.ts` makes.
 *
 * Used by `src/features/publishing/articlePackage.test.ts` and `publishingItems.test.ts`.
 */

import { strToU8, zipSync } from 'fflate'

/** A PNG header of the given size (signature and IHDR; the check reads nothing more). */
export function png(width: number, height: number, padding = 16): Uint8Array {
  const bytes = new Uint8Array(33 + padding)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return bytes
}

/** A JPEG with an APP0 segment and a start-of-frame of the given size; `withFrame: false` leaves the frame out. */
export function jpeg(width: number, height: number, withFrame = true): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const frame = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  return new Uint8Array([0xff, 0xd8, ...app0, ...(withFrame ? frame : []), 0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xff, 0xd9])
}

/** A GIF header of the given size. */
export function gif(width: number, height: number): Uint8Array {
  return new Uint8Array([...strToU8('GIF89a'), width & 0xff, width >> 8, height & 0xff, height >> 8, 0, 0, 0, 0x3b])
}

/** A WebP header of the given size, in one of its three forms. */
export function webp(width: number, height: number, form: 'VP8 ' | 'VP8L' | 'VP8X' = 'VP8X'): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set(strToU8('RIFF'), 0)
  bytes.set(strToU8('WEBP'), 8)
  bytes.set(strToU8(form), 12)
  if (form === 'VP8X') {
    const w = width - 1
    const h = height - 1
    bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24)
  } else if (form === 'VP8 ') {
    bytes.set([0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f], 23)
  } else {
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
    bytes.set([0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff], 20)
  }
  return bytes
}

export interface PackageOptions {
  contentType?: 'article' | 'answer'
  slug?: string
  /** Replaces the `<body>` content. */
  body?: string
  /** Extra tags for the `<head>`. */
  head?: string
  /** Meta tag names to leave out. */
  omitMeta?: string[]
  /** Meta values to change. */
  meta?: Record<string, string>
  /** Leave out `<link rel="stylesheet" href="article.css">`. */
  noStylesheetLink?: boolean
  /** Files to add or replace (null removes one). */
  files?: Record<string, Uint8Array | string | null>
}

/** The HTML of a made-up article or answer package. */
export function packageHtml(options: PackageOptions = {}): string {
  const contentType = options.contentType ?? 'article'
  const meta: Record<string, string> = {
    'kr-content-type': contentType,
    'kr-title': 'Trusts in Plain English',
    'kr-slug': options.slug ?? 'trusts-plain-english',
    'kr-summary': 'A short teaser about trusts.',
    'kr-thumbnail-src': 'images/thumbnail.jpg',
    'kr-thumbnail-alt': 'A desk with papers',
    'kr-seo-title': 'Trusts explained',
    'kr-seo-description': 'What a trust is and how it works.',
    ...(contentType === 'article' ? { 'kr-category': 'Estate', 'kr-category-label': 'Estate Planning', 'kr-reading-time-minutes': '7' } : { 'kr-pillar': 'Estate planning', 'kr-topic-slug': 'wills-and-trusts' }),
    'kr-author-display-name': 'Example Author',
    ...options.meta,
  }
  const tags = Object.entries(meta)
    .filter(([name]) => !options.omitMeta?.includes(name))
    .map(([name, value]) => `<meta name="${name}" content="${value}">`)
    .join('\n')
  const body = options.body ?? '<article class="story"><h1>Trusts</h1><p>Plain text with a <a href="https://example.com/trusts">link</a>.</p><img src="images/hero.png" alt="A hero image"></article>'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Trusts</title>
${tags}
${options.noStylesheetLink ? '' : '<link rel="stylesheet" href="article.css">'}
${options.head ?? ''}
</head>
<body>${body}</body>
</html>`
}

/** A made-up package as ZIP bytes: `article.html`, `article.css`, `images/hero.png`, `images/thumbnail.jpg`, `images/bg.gif`. */
export function packageZip(options: PackageOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array | string | null> = {
    'article.html': packageHtml(options),
    'article.css': '.story { color: #222; }\n.story h1 { background: url("images/bg.gif") no-repeat; }\n',
    'images/hero.png': png(1200, 800),
    'images/thumbnail.jpg': jpeg(1600, 900),
    'images/bg.gif': gif(40, 20),
    ...options.files,
  }
  const entries: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(files)) {
    if (value === null) continue
    entries[name] = typeof value === 'string' ? strToU8(value) : value
  }
  return zipSync(entries)
}

/** An R2 bucket in memory with `put`, `get`, `head` and `delete`, as the platform module calls them. */
export function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string | null }>()
  const toBytes = async (body: unknown): Promise<Uint8Array> => {
    if (typeof body === 'string') return strToU8(body)
    if (body instanceof Uint8Array) return new Uint8Array(body)
    if (body instanceof ArrayBuffer) return new Uint8Array(body)
    throw new Error('memoryBucket: unsupported body')
  }
  const bucket = {
    objects,
    async put(key: string, body: unknown, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: await toBytes(body), contentType: options?.httpMetadata?.contentType ?? null })
      return {}
    },
    async get(key: string) {
      const found = objects.get(key)
      if (!found) return null
      return {
        size: found.bytes.byteLength,
        httpMetadata: { contentType: found.contentType ?? undefined },
        body: new Blob([found.bytes.slice().buffer as ArrayBuffer]).stream(),
        arrayBuffer: async () => found.bytes.slice().buffer,
      }
    },
    async head(key: string) {
      return objects.has(key) ? { key } : null
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
    },
  }
  return bucket
}

export type MemoryBucket = ReturnType<typeof memoryBucket>

