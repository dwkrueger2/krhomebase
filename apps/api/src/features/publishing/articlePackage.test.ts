// file: apps/api/src/features/publishing/articlePackage.test.ts
/**
 * The Front End Publishing package check and HTML cleaner (plan 10, stage 6; D22), with made-up ZIPs built in memory
 * (`test/publishingFixtures.ts`). Checks: every refusal rule in its old wording (ZIP name, size, readability, file
 * count, root HTML, paths, image folders, the `kr-*` meta tags, the one stylesheet, scripts, frames, forms, event
 * attributes, inline styles, `<style>`, `srcset`, unsafe addresses, alt text, images in the ZIP, the CSS rules, image
 * type from the bytes, image size and pixels); an accepted package (keys, sizes from the headers, usage, the
 * stylesheet's addresses, the cleaned text, the thumbnail tips); the image header readers; the allow-list cleaner.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/publishing/articlePackage.test.ts
 */

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { gif, jpeg, packageHtml, packageZip, png, webp, type PackageOptions } from '../../../test/publishingFixtures.ts'
import { checkArticlePackage, imageDimensions, sniffImageType, sourceKeyParts } from './articlePackage.ts'
import { cleanArticleHtml, safeLinkUrl } from './articleSanitizer.ts'

const STAMP = '2026-11-13T18-20-11-123Z'

async function check(options: PackageOptions = {}, extra: { fileName?: string; contentType?: 'article' | 'answer'; zip?: Uint8Array } = {}) {
  return checkArticlePackage({ zipBytes: extra.zip ?? packageZip(options), fileName: extra.fileName ?? 'Trusts Package.zip', contentType: extra.contentType ?? options.contentType ?? 'article', stamp: STAMP })
}

async function problemsOf(options: PackageOptions = {}, extra: Parameters<typeof check>[1] = {}) {
  const result = await check(options, extra)
  if (result.ok) throw new Error('expected the package to be refused')
  return result.problems
}

describe('accepted package', () => {
  it('plans the old keys, reads the image sizes from the headers, points the stylesheet at the draft images and cleans the text', async () => {
    const result = await check()
    if (!result.ok) throw new Error(result.problems.join('\n'))
    const pkg = result.pkg
    expect(pkg.contentId).toBe('article_trusts-plain-english')
    expect(pkg.sourceKey).toBe(`source-uploads/article/trusts-plain-english/${STAMP}/trusts-package.zip`)
    expect(pkg.snapshotKey).toBe(`sanitized-snapshots/article/trusts-plain-english/${STAMP}/sanitized.html`)
    expect(sourceKeyParts(pkg.sourceKey)).toEqual({ contentType: 'article', slug: 'trusts-plain-english', stamp: STAMP, fileName: 'trusts-package.zip' })

    const byPath = Object.fromEntries(pkg.images.map((image) => [image.originalPath, image]))
    expect(Object.keys(byPath).sort()).toEqual(['images/bg.gif', 'images/hero.png', 'images/thumbnail.jpg'])
    expect(byPath['images/hero.png']).toMatchObject({ mimeType: 'image/png', width: 1200, height: 800, usage: 'body', altText: 'A hero image' })
    expect(byPath['images/thumbnail.jpg']).toMatchObject({ mimeType: 'image/jpeg', width: 1600, height: 900, usage: 'thumbnail', altText: 'A desk with papers' })
    expect(byPath['images/bg.gif']).toMatchObject({ mimeType: 'image/gif', width: 40, height: 20, usage: 'body' })
    for (const image of pkg.images) expect(image.key).toMatch(/^images\/article\/trusts-plain-english\/[0-9a-f]{12}-[a-z0-9._-]+$/)

    expect(pkg.stylesheet?.key).toMatch(/^stylesheets\/article\/trusts-plain-english\/[0-9a-f]{12}-article\.css$/)
    expect(pkg.stylesheet?.text).toContain(`url("${byPath['images/bg.gif']!.url}")`)
    expect(pkg.html).toContain(`<img src="${byPath['images/hero.png']!.url}" alt="A hero image" width="1200" height="800" loading="lazy" decoding="async">`)
    expect(pkg.html).not.toMatch(/<head|<meta|<link|<title|<html|<body/i)
    expect(pkg.metadata).toMatchObject({ title: 'Trusts in Plain English', category: 'Estate', categoryLabel: 'Estate Planning', readingTimeMinutes: 7 })
    expect(pkg.warnings).toEqual([])
  })

  it('gives the old thumbnail tips and the file name tip without refusing', async () => {
    const result = await check({ files: { 'images/thumbnail.jpg': jpeg(800, 800), 'images/Hero Photo.png': png(10, 10) } })
    if (!result.ok) throw new Error(result.problems.join('\n'))
    expect(result.pkg.warnings).toEqual(
      expect.arrayContaining([
        'IMAGE_FILENAME_TIP_USE_LOWER_URL_SAFE_WHEN_PRACTICAL:images/Hero Photo.png',
        'THUMBNAIL_TIP_USE_16_BY_9_IMAGE:images/thumbnail.jpg:current_800x800',
        'THUMBNAIL_TIP_RECOMMENDED_1600x900:images/thumbnail.jpg:current_800x800',
      ]),
    )
  })

  it('accepts an answer with its pillar and topic', async () => {
    const result = await check({ contentType: 'answer', slug: 'what-is-a-will' })
    if (!result.ok) throw new Error(result.problems.join('\n'))
    expect(result.pkg.contentId).toBe('answer_what-is-a-will')
    expect(result.pkg.metadata).toMatchObject({ pillar: 'Estate planning', topicSlug: 'wills-and-trusts' })
  })
})

describe('refused package (old wording)', () => {
  it('refuses a file that is not a .zip, a ZIP over 50 MB and bytes that are not a ZIP', async () => {
    expect(await problemsOf({}, { fileName: 'article.rar' })).toEqual(['PACKAGE_FILE_EXTENSION_MUST_BE_ZIP'])
    expect(await problemsOf({}, { zip: new Uint8Array(50 * 1024 * 1024 + 1) })).toEqual(['PACKAGE_ZIP_TOO_LARGE'])
    expect(await problemsOf({}, { zip: strToU8('this is not a zip file at all') })).toEqual(['PACKAGE_ZIP_UNREADABLE'])
  })

  it('refuses more than 500 files', async () => {
    const files: Record<string, Uint8Array> = { 'article.html': strToU8(packageHtml({ noStylesheetLink: true })) }
    for (let index = 0; index < 501; index += 1) files[`notes/n${index}.txt`] = strToU8('x')
    expect(await problemsOf({}, { zip: zipSync(files) })).toContain('PACKAGE_HAS_TOO_MANY_FILES:max_500')
  })

  it('needs exactly one HTML file, at the root, and no unsafe paths', async () => {
    expect(await problemsOf({ files: { 'article.html': null } })).toContain('PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_0_found_total_0')
    expect(await problemsOf({ files: { 'second.html': '<p>x</p>' } })).toContain('PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_2_found_total_2')
    const nested = await problemsOf({ files: { 'pages/more.html': '<p>x</p>' } })
    expect(nested).toEqual(expect.arrayContaining(['PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_1_found_total_2', 'HTML_FILE_MUST_BE_AT_PACKAGE_ROOT:pages/more.html']))
    expect(await problemsOf({ files: { '../escape.png': png(1, 1) } })).toContain('PACKAGE_CONTAINS_UNSAFE_PATH:../escape.png')
    expect(await problemsOf({ files: { 'article.html': 'x'.repeat(1_000_001) } })).toContain('HTML_FILE_TOO_LARGE:article.html:max_1000000_bytes')
  })

  it('keeps images under images/ or assets/images/', async () => {
    expect(await problemsOf({ files: { 'pictures/extra.png': png(1, 1) } })).toContain('IMAGE_OUTSIDE_ALLOWED_FOLDER:pictures/extra.png')
    const result = await check({ files: { 'assets/images/extra.png': png(2, 2) } })
    expect(result.ok).toBe(true)
  })

  it('needs the kr-* meta tags', async () => {
    const missing = await problemsOf({ omitMeta: ['kr-content-type', 'kr-slug', 'kr-summary', 'kr-thumbnail-src', 'kr-thumbnail-alt', 'kr-category'] })
    expect(missing).toEqual(
      expect.arrayContaining([
        'META_KR_CONTENT_TYPE_REQUIRED_ARTICLE_OR_ANSWER',
        'META_KR_SLUG_REQUIRED',
        'META_KR_SUMMARY_REQUIRED',
        'META_KR_THUMBNAIL_SRC_REQUIRED',
        'META_KR_THUMBNAIL_ALT_REQUIRED',
        'META_KR_CATEGORY_REQUIRED_FOR_ARTICLE',
      ]),
    )
    expect(await problemsOf({ meta: { 'kr-content-type': 'answer' } })).toContain('META_CONTENT_TYPE_MISMATCH:expected_article_found_answer')
    expect(await problemsOf({ meta: { 'kr-reading-time-minutes': 'soon' } })).toContain('META_KR_READING_TIME_MINUTES_MUST_BE_POSITIVE_NUMBER')
    expect(await problemsOf({ contentType: 'answer', omitMeta: ['kr-pillar'] })).toContain('META_KR_PILLAR_REQUIRED_FOR_ANSWER')
    // A missing kr-title falls back to the <title> (old rule), so the package is still accepted.
    const titled = await check({ omitMeta: ['kr-title'] })
    expect(titled.ok && titled.pkg.metadata.title).toBe('Trusts')
    expect(await problemsOf({ meta: { 'kr-thumbnail-src': 'images/none.jpg' } })).toContain('META_THUMBNAIL_IMAGE_MISSING_FROM_ZIP:images/none.jpg')
    expect(await problemsOf({ meta: { 'kr-thumbnail-src': 'https://example.com/a.jpg' } })).toContain('META_THUMBNAIL_SRC_INVALID:REMOTE_IMAGE_NOT_ALLOWED:https://example.com/a.jpg')
  })

  it('allows only the root article.css, linked once, with no <style> or inline styles', async () => {
    expect(await problemsOf({ files: { 'css/site.css': 'p{}' } })).toContain('CSS_FILE_NOT_ALLOWED:css/site.css:only_article_css_at_zip_root_is_allowed')
    expect(await problemsOf({ head: '<link rel="stylesheet" href="https://cdn.example.com/x.css">' })).toEqual(
      expect.arrayContaining(['STYLESHEET_LINK_NOT_ALLOWED:https://cdn.example.com/x.css:use_article.css_only', 'HTML_ALLOWS_ONLY_ONE_STYLESHEET_LINK:found_2']),
    )
    expect(await problemsOf({ files: { 'article.css': null } })).toContain('ARTICLE_CSS_LINKED_BUT_FILE_MISSING')
    expect(await problemsOf({ head: '<style>p{color:red}</style>' })).toContain('STYLE_TAG_NOT_ALLOWED_USE_ARTICLE_CSS')
    expect(await problemsOf({ body: '<p style="color:red">x</p><img src="images/hero.png" alt="a">' })).toContain('INLINE_STYLE_ATTRIBUTE_NOT_ALLOWED:p')
  })

  it('refuses scripts, frames, forms, event attributes and unsafe addresses', async () => {
    const problems = await problemsOf({
      body: '<script>alert(1)</script><iframe src="x"></iframe><form><input></form><p onclick="go()">x</p><a href="javascript:alert(1)">y</a><img src="images/hero.png" alt="a">',
    })
    expect(problems).toEqual(
      expect.arrayContaining([
        'JAVASCRIPT_OR_EXECUTABLE_ELEMENT_NOT_ALLOWED:<script>',
        'JAVASCRIPT_OR_EXECUTABLE_ELEMENT_NOT_ALLOWED:<iframe>',
        'JAVASCRIPT_OR_EXECUTABLE_ELEMENT_NOT_ALLOWED:<form>',
        'JAVASCRIPT_OR_EXECUTABLE_ELEMENT_NOT_ALLOWED:<input>',
        'EVENT_HANDLER_NOT_ALLOWED:p[onclick]',
        'UNSAFE_URI_NOT_ALLOWED:a[href]',
      ]),
    )
  })

  it('needs alt text, no srcset, and every image in the ZIP', async () => {
    const problems = await problemsOf({
      body: '<img src="images/hero.png"><img src="images/hero.png" alt="a" srcset="images/hero.png 2x"><img src="images/gone.png" alt="b"><img src="https://example.com/r.png" alt="c"><img src="/images/hero.png" alt="d"><img src="data:image/png;base64,AAAA" alt="e"><img src="../../x.png" alt="f"><img src="other/x.png" alt="g">',
    })
    expect(problems).toEqual(
      expect.arrayContaining([
        'IMAGE_ALT_TEXT_REQUIRED:images/hero.png',
        'IMAGE_SRCSET_NOT_ALLOWED:images/hero.png',
        'REFERENCED_IMAGE_MISSING_FROM_ZIP:images/gone.png',
        'REMOTE_IMAGE_NOT_ALLOWED:https://example.com/r.png',
        'ABSOLUTE_LOCAL_IMAGE_PATH_NOT_ALLOWED:/images/hero.png',
        'DATA_IMAGE_NOT_ALLOWED:data:image/png;base64,AAAA',
        'IMAGE_SRC_PATH_ESCAPE:../../x.png',
        'IMAGE_OUTSIDE_ALLOWED_FOLDER:other/x.png',
      ]),
    )
  })

  it('keeps the old CSS rules', async () => {
    const problems = await problemsOf({ files: { 'article.css': '@import "x.css";\np { width: expression(1); background: url(https://example.com/a.png); }\nh1 { background: url(images/none.png); }\na { background: url(data:image/png;base64,AA); }' } })
    expect(problems).toEqual(
      expect.arrayContaining([
        'ARTICLE_CSS_IMPORT_NOT_ALLOWED',
        'ARTICLE_CSS_EXPRESSION_NOT_ALLOWED',
        'CSS_REMOTE_URL_NOT_ALLOWED:https://example.com/a.png',
        'CSS_REFERENCED_IMAGE_MISSING_FROM_ZIP:images/none.png',
        'CSS_DATA_URL_NOT_ALLOWED:data:image/png;base64,AA',
      ]),
    )
    expect(await problemsOf({ files: { 'article.css': `p{}${' '.repeat(256 * 1024)}` } })).toContain('ARTICLE_CSS_TOO_LARGE:max_262144_bytes')
  })

  it('reads the image type from the bytes and checks size and pixels', async () => {
    expect(await problemsOf({ files: { 'images/hero.png': jpeg(10, 10) } })).toContain('IMAGE_MIME_MISMATCH:images/hero.png:expected_image/png:detected_image/jpeg')
    expect(await problemsOf({ files: { 'images/hero.png': strToU8('not an image') } })).toContain('IMAGE_MIME_MISMATCH:images/hero.png:expected_image/png:detected_unknown')
    expect(await problemsOf({ files: { 'images/hero.png': png(6000, 5000) } })).toContain('IMAGE_DIMENSIONS_TOO_LARGE:images/hero.png:max_24000000_pixels')
    expect(await problemsOf({ files: { 'images/thumbnail.jpg': jpeg(10, 10, false) } })).toContain('IMAGE_DIMENSIONS_UNREADABLE:images/thumbnail.jpg')
    expect(await problemsOf({ files: { 'images/hero.png': png(10, 10, 8 * 1024 * 1024) } })).toContain('IMAGE_FILE_TOO_LARGE:images/hero.png:max_8388608_bytes')
  })
})

describe('image headers', () => {
  it('reads the type and size of PNG, JPEG, GIF and the three WebP forms', () => {
    const cases: Array<[Uint8Array, string, number, number]> = [
      [png(321, 123), 'image/png', 321, 123],
      [jpeg(640, 480), 'image/jpeg', 640, 480],
      [gif(17, 9), 'image/gif', 17, 9],
      [webp(800, 600, 'VP8X'), 'image/webp', 800, 600],
      [webp(300, 200, 'VP8 '), 'image/webp', 300, 200],
      [webp(77, 55, 'VP8L'), 'image/webp', 77, 55],
    ]
    for (const [bytes, type, width, height] of cases) {
      expect(sniffImageType(bytes)).toBe(type)
      expect(imageDimensions(bytes, type)).toEqual({ width, height })
    }
    expect(sniffImageType(strToU8('<svg></svg>'))).toBeNull()
  })
})

describe('allow-list cleaner', () => {
  const resolveNone = () => null

  it('removes scripts, styles, frames, forms, event attributes, inline styles and unsafe links, and escapes text', () => {
    const { html } = cleanArticleHtml(
      '<p onclick="steal()" style="color:red" class="lead" id="intro">Hello &amp; <b>bold</b> &lt;not a tag&gt;</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><form><button>Go</button></form><a href="javascript:alert(1)">bad</a><a href=" java\tscript:alert(1)">tab</a><a href="https://example.com/?a=1&b=2" target="_blank">ok</a><!-- note --><svg><script>x</script></svg><font color="red">kept text</font>',
      resolveNone,
    )
    expect(html).toBe(
      '<p class="lead" id="intro">Hello &amp; <b>bold</b> &lt;not a tag&gt;</p><a>bad</a><a>tab</a><a href="https://example.com/?a=1&amp;b=2">ok</a>kept text',
    )
  })

  it('drops images the item does not own and writes owned ones with their size', () => {
    const result = cleanArticleHtml('<img src="https://evil.example/x.png" alt="x"><img src="images/a.png" onerror="x()">', (src) =>
      src === 'images/a.png' ? { url: '/api/v1/publishing/assets/images%2Fa.png', altText: 'Stored alt', width: 10, height: 5, originalPath: 'images/a.png' } : null,
    )
    expect(result.html).toBe('<img src="/api/v1/publishing/assets/images%2Fa.png" alt="Stored alt" width="10" height="5" loading="lazy" decoding="async">')
    expect(result.droppedImages).toEqual(['https://evil.example/x.png'])
  })

  it('keeps only the body of a whole document', () => {
    expect(cleanArticleHtml('<!doctype html><html><head><title>T</title><meta name="kr-title" content="x"></head><body><h2>Body</h2></body></html>', resolveNone).html).toBe('<h2>Body</h2>')
  })

  it('accepts only http, https, mailto, tel, fragments and site paths as links', () => {
    expect(safeLinkUrl('https://example.com')).toBe('https://example.com')
    expect(safeLinkUrl('mailto:info@example.com')).toBe('mailto:info@example.com')
    expect(safeLinkUrl('#section-2')).toBe('#section-2')
    expect(safeLinkUrl('/contact')).toBe('/contact')
    expect(safeLinkUrl('//evil.example')).toBeNull()
    expect(safeLinkUrl('data:text/html,x')).toBeNull()
    expect(safeLinkUrl('vbscript:x')).toBeNull()
  })
})
