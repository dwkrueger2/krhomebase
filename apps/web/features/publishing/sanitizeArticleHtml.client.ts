// file: apps/web/features/publishing/sanitizeArticleHtml.client.ts
/**
 * Browser-side preview sanitizer for static Article and Answer HTML previews.
 *
 * Ported from the old `front-end-publishing/utils/sanitizeArticleHtml.client.ts`. It is **not** the safety layer any
 * more: the API cleans the text with its allow-list when the package is checked and again on every save (D22), and it
 * never trusts the text the screen sends. It is kept for the preview only, because Article Details lets the person edit
 * the text (Advanced) and the preview frame shows that unsaved text before the API has cleaned it; this pass drops
 * scripts, frames, forms, `<link>` and event attributes from that unsaved copy, and its `removed` list feeds the old
 * "Preview check" and "Sanitizer removed" lines. The preview frame is sandboxed as well (no scripts, no forms).
 *
 * Changed from the old file: `buildR2ImageManifest` is gone (the API makes the image list from the ZIP); the result
 * type moved here from the old `types.ts`. `<link>` is still removed from the body: the article stylesheet is added
 * to the preview's head from the item's `stylesheetUrl` instead.
 */

/** The cleaned preview text, what was removed, and the image addresses found. */
export interface SanitizedHtmlResult {
  html: string
  removed: string[]
  imageSources: string[]
}

const BLOCKED_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link'])
const URI_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'srcset'])
const IMAGE_SRC_PATTERN = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi

function collectImageSourcesFromHtml(sourceHtml: string): string[] {
  const imageSources: string[] = []
  let match: RegExpExecArray | null
  IMAGE_SRC_PATTERN.lastIndex = 0
  while ((match = IMAGE_SRC_PATTERN.exec(sourceHtml)) !== null) {
    const src = match[1]?.trim()
    if (src) imageSources.push(src)
  }
  return Array.from(new Set(imageSources))
}

function isUnsafeUri(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith('javascript:') || trimmed.startsWith('data:text/html') || trimmed.startsWith('vbscript:') || trimmed.startsWith('file:')
}

function sanitizeNode(node: Element, removed: string[], imageSources: string[]): void {
  const children = Array.from(node.children)
  for (const child of children) {
    const tagName = child.tagName.toLowerCase()
    if (BLOCKED_ELEMENTS.has(tagName)) {
      removed.push(`<${tagName}>`)
      child.remove()
      continue
    }

    for (const attribute of Array.from(child.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value
      if (name.startsWith('on')) {
        removed.push(`${tagName}[${attribute.name}]`)
        child.removeAttribute(attribute.name)
        continue
      }
      if (name === 'srcset') {
        removed.push(`${tagName}[${attribute.name}]`)
        child.removeAttribute(attribute.name)
        continue
      }
      if (name === 'style' && /expression\s*\(|url\s*\(\s*javascript:/i.test(value)) {
        removed.push(`${tagName}[style]`)
        child.removeAttribute(attribute.name)
        continue
      }
      if (URI_ATTRIBUTES.has(name) && isUnsafeUri(value)) {
        removed.push(`${tagName}[${attribute.name}]`)
        child.removeAttribute(attribute.name)
      }
    }

    if (tagName === 'img') {
      const src = child.getAttribute('src')?.trim()
      if (src) imageSources.push(src)
    }

    sanitizeNode(child, removed, imageSources)
  }
}

/**
 * Cleans HTML for the preview frame. Outside a browser (server render, tests) it returns the text unchanged with the
 * image addresses found, as the old one did.
 *
 * @param sourceHtml - The text to preview (the API's cleaned text, or the person's unsaved edit of it).
 * @returns The cleaned text, what was removed, and the image addresses.
 */
export function sanitizeArticleHtml(sourceHtml: string): SanitizedHtmlResult {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { html: sourceHtml, removed: [], imageSources: collectImageSourcesFromHtml(sourceHtml) }
  }

  const parser = new DOMParser()
  const sourceLooksLikeDocument = /^\s*(?:<!doctype\s+html[^>]*>)?\s*<html[\s>]/i.test(sourceHtml)
  const document = parser.parseFromString(sourceLooksLikeDocument ? sourceHtml : `<main>${sourceHtml}</main>`, 'text/html')
  const root = sourceLooksLikeDocument ? document.documentElement : (document.body.firstElementChild ?? document.body)
  const removed: string[] = []
  const imageSources: string[] = []
  sanitizeNode(root, removed, imageSources)
  if (sourceLooksLikeDocument) {
    for (const element of Array.from(document.querySelectorAll('meta[name^="kr-"], meta[property^="kr-"]'))) {
      removed.push('<meta>')
      element.remove()
    }
    return { html: `<!doctype html>\n${document.documentElement.outerHTML}`.trim(), removed, imageSources: Array.from(new Set(imageSources)) }
  }
  return { html: root.innerHTML.trim(), removed, imageSources: Array.from(new Set(imageSources)) }
}
