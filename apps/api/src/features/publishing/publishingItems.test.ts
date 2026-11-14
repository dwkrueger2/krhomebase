// file: apps/api/src/features/publishing/publishingItems.test.ts
/**
 * Front End Publishing articles and answers (plan 10, stage 6) through the routes, against an in-memory Schema 8.0
 * with migration 031 and an in-memory R2 bucket. Made-up people, packages and images only
 * (`test/publishingFixtures.ts`).
 *
 * Checks: the package route (accepted: every file in R2 under the old prefixes, one audit row, nothing in the item
 * tables; refused: the problems and nothing stored); the draft save (the ZIP read again from R2, the keys made by the
 * API, the text cleaned again so an injected script, event attribute and foreign image are gone, the person from the
 * session, the display code, a revision; a bad, missing or taken package; missing fields); the license rule (Publish
 * refused per unlicensed image, licenses recorded with who and when); publish (one clean published document under
 * past-publications/ with public addresses and the stylesheet inlined, the event and audit rows), unpublish and
 * archive with their events; changes while published (licenses only); replacing a package (the unchanged image keeps
 * its license, the old files are removed); delete (super admin, typed confirmation, never while published, rows and
 * files gone); the asset and ZIP routes; the list (newest first, paged, the "more" line); roles; the 503 before the
 * migration and without the bucket.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/publishing/publishingItems.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ArticlePackageCheckData, ErrorEnvelope, PublishingDeletedData, PublishingItemData, PublishingItemsData, draftAssetUrl } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { jpeg, memoryBucket, packageZip, png, type MemoryBucket, type PackageOptions } from '../../../test/publishingFixtures.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
let bucket: MemoryBucket
const all = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).all(...values) as Array<Record<string, unknown>>
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined

const ADMIN = { role: 'super_admin', userId: 'u-admin' }
const AUTHOR = { role: 'front_end_author', userId: 'u-author' }
type Who = { role: string; userId: string }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  bucket = memoryBucket()
  clearSessionCache()
  env.sqlite.prepare(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-admin', 'Ada', 'Admin', NULL), ('i-author', 'Wren', 'Writer', 'Wren')`).run()
  env.sqlite
    .prepare(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('u-admin', 'i-admin', 'ada@example.com', 'x', 'super_admin'), ('u-author', 'i-author', 'wren@example.com', 'x', 'staff')`)
    .run()
})

function bindings(who: Who, extra: Record<string, unknown> = {}) {
  return signedInEnv(who.role, { krhomebase: env.db, ARTICLES: bucket, ...extra }, who.userId)
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', path: string, body?: unknown, who: Who = AUTHOR, extra: Record<string, unknown> = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, bindings(who, extra))
}

async function upload(options: PackageOptions = {}, who: Who = AUTHOR, extra: Record<string, unknown> = {}, fileName = 'trusts.zip') {
  clearSessionCache()
  const form = new FormData()
  form.set('contentType', options.contentType ?? 'article')
  form.set('file', new File([packageZip(options).slice().buffer as ArrayBuffer], fileName, { type: 'application/zip' }))
  return app.request('/v1/publishing/packages', { method: 'POST', headers: SIGNED_IN_HEADERS, body: form }, bindings(who, extra))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  if (res.status !== 200) throw new Error(`${res.status}: ${await res.text()}`)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorOf(res: Response, status: number) {
  expect(res.status, await res.clone().text()).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error
}

const LICENSE = { kind: 'stock', source: 'Example Stock Library', reference: 'ORDER-1001' } as const

/** Uploads a package and saves its draft; returns the package reply and the item. */
async function draft(options: PackageOptions = {}, body: Record<string, unknown> = {}) {
  const pkg = await data(await upload(options), ArticlePackageCheckData)
  const item = (await data(await call('POST', '/v1/publishing/items', { packageKey: pkg.packageKey, ...body }), PublishingItemData)).item
  return { pkg, item }
}

const licenseAll = (paths: string[]) => paths.map((originalPath) => ({ originalPath, license: LICENSE }))

describe('package check route', () => {
  it('stores every file under the old prefixes with one audit row and writes no item', async () => {
    const reply = await data(await upload(), ArticlePackageCheckData)
    expect(reply.contentId).toBe('article_trusts-plain-english')
    expect(reply.existingStatus).toBeNull()
    expect(reply.images.every((image) => image.licenseNeeded)).toBe(true)
    const stored = [...bucket.objects.keys()].sort()
    expect(stored).toEqual([reply.keys.sourceUpload, reply.keys.sanitizedSnapshot, reply.keys.stylesheet!, ...reply.keys.images].sort())
    expect(stored.map((key) => key.split('/')[0])).toEqual(expect.arrayContaining(['source-uploads', 'images', 'stylesheets', 'sanitized-snapshots']))
    expect(all(`SELECT action, target_table FROM audit_log WHERE resource = 'publishing'`)).toEqual([{ action: 'PACKAGE_UPLOAD', target_table: 'r2_object' }])
    expect(all('SELECT id FROM public_content')).toEqual([])
  })

  it('refuses a package with every problem in details and stores nothing', async () => {
    const error = await errorOf(await upload({ body: '<script>x()</script><img src="images/hero.png">' }), 422)
    expect(error.code).toBe('PUBLISHING_PACKAGE_REFUSED')
    expect((error.details as { problems: string[] }).problems).toEqual(expect.arrayContaining(['JAVASCRIPT_OR_EXECUTABLE_ELEMENT_NOT_ALLOWED:<script>', 'IMAGE_ALT_TEXT_REQUIRED:images/hero.png']))
    expect(bucket.objects.size).toBe(0)
    expect((await errorOf(await upload({}, AUTHOR, {}, 'trusts.tar'), 422)).details).toMatchObject({ problems: ['PACKAGE_FILE_EXTENSION_MUST_BE_ZIP'] })
  })
})

describe('draft save', () => {
  it('reads the stored ZIP again, makes the keys, cleans the sent text again and records the person', async () => {
    const pkg = await data(await upload(), ArticlePackageCheckData)
    const hero = pkg.images.find((image) => image.originalPath === 'images/hero.png')!
    const injected = `<h2 onclick="steal()">Edited</h2><script>alert(document.cookie)</script><p style="x">Safe <a href="javascript:alert(1)">bad</a></p><img src="${hero.url}" alt="Edited hero"><img src="https://evil.example/track.png" alt="t"><iframe src="https://evil.example"></iframe>`
    const res = await call('POST', '/v1/publishing/items', { packageKey: pkg.packageKey, html: injected, title: 'Trusts, edited', images: [{ originalPath: 'images/hero.png', license: LICENSE }] })
    const item = (await data(res, PublishingItemData)).item

    expect(item.html).toBe(`<h2>Edited</h2><p>Safe <a>bad</a></p><img src="${hero.url}" alt="Edited hero" width="1200" height="800" loading="lazy" decoding="async">`)
    expect(item).toMatchObject({ id: 'article_trusts-plain-english', displayCode: 'Article 001', status: 'draft', title: 'Trusts, edited', canonicalPath: '/articles/trusts-plain-english', categoryLabel: 'Estate Planning', createdByUserId: 'u-author', createdByName: 'Wren', updatedByName: 'Wren' })
    expect(item.stylesheetUrl).toBe(draftAssetUrl(pkg.keys.stylesheet!))
    expect(item.assets.map((asset) => asset.key).sort()).toEqual([...pkg.keys.images].sort())
    expect(item.assets.find((asset) => asset.originalPath === 'images/hero.png')?.license).toMatchObject({ kind: 'stock', source: 'Example Stock Library', recordedByUserId: 'u-author', recordedByName: 'Wren' })
    expect(item.publishProblems).toEqual(['PUBLISH_REQUIRES_IMAGE_LICENSE:images/bg.gif', 'PUBLISH_REQUIRES_IMAGE_LICENSE:images/thumbnail.jpg'])
    expect(one(`SELECT revision_number, changed_by_user_id FROM content_revision`)).toEqual({ revision_number: 1, changed_by_user_id: 'u-author' })
    expect(one(`SELECT sanitized_html FROM public_content`)?.sanitized_html).not.toMatch(/script|onclick|evil|javascript|style=/i)
    expect(one(`SELECT action FROM audit_log WHERE action = 'CREATE'`)).toEqual({ action: 'CREATE' })
  })

  it('stores again a package file removed since the check', async () => {
    const pkg = await data(await upload(), ArticlePackageCheckData)
    bucket.objects.delete(pkg.keys.images[0]!)
    await data(await call('POST', '/v1/publishing/items', { packageKey: pkg.packageKey }), PublishingItemData)
    expect(bucket.objects.has(pkg.keys.images[0]!)).toBe(true)
  })

  it('refuses a key that is not a package key, a package not stored, and a taken slug', async () => {
    expect((await errorOf(await call('POST', '/v1/publishing/items', { packageKey: 'images/article/x/abc-a.png' }), 422)).code).toBe('PUBLISHING_PACKAGE_KEY_INVALID')
    expect((await errorOf(await call('POST', '/v1/publishing/items', { packageKey: 'source-uploads/article/x/2026-11-13T18-20-11-123Z/a.zip' }), 404)).code).toBe('PUBLISHING_PACKAGE_NOT_FOUND')
    const { pkg } = await draft()
    expect((await errorOf(await call('POST', '/v1/publishing/items', { packageKey: pkg.packageKey }), 409)).code).toBe('PUBLISHING_ITEM_EXISTS')
    const again = await data(await upload(), ArticlePackageCheckData)
    expect(again.existingStatus).toBe('draft')
  })

  it('refuses a package key whose slug was changed by the browser', async () => {
    const pkg = await data(await upload(), ArticlePackageCheckData)
    const tampered = pkg.packageKey.replace('trusts-plain-english', 'another-slug')
    bucket.objects.set(tampered, bucket.objects.get(pkg.packageKey)!)
    expect((await errorOf(await call('POST', '/v1/publishing/items', { packageKey: tampered }), 422)).code).toBe('PUBLISHING_PACKAGE_KEY_INVALID')
  })

  it('refuses missing required fields and unknown image paths in the old wording', async () => {
    const pkg = await data(await upload(), ArticlePackageCheckData)
    const error = await errorOf(await call('POST', '/v1/publishing/items', { packageKey: pkg.packageKey, category: null, summary: '', html: '<script>only()</script>', images: [{ originalPath: 'images/none.png', altText: 'x' }] }), 422)
    expect(error.code).toBe('PUBLISHING_ITEM_INVALID')
    expect((error.details as { problems: string[] }).problems).toEqual(
      expect.arrayContaining(['IMAGE_NOT_IN_ITEM:images/none.png', 'VALIDATION_SUMMARY_REQUIRED', 'VALIDATION_SANITIZED_HTML_REQUIRED', 'VALIDATION_ARTICLE_CATEGORY_REQUIRED']),
    )
    expect(all('SELECT id FROM public_content')).toEqual([])
  })

  it('saves an answer with its pillar in the path and the Answers label', async () => {
    const { item } = await draft({ contentType: 'answer', slug: 'what-is-a-will' })
    expect(item).toMatchObject({ id: 'answer_what-is-a-will', displayCode: 'Answer 001', canonicalPath: '/answers/estate-planning/wills-and-trusts', categoryLabel: 'Answers', pillar: 'Estate planning', category: null })
  })
})

describe('licenses, publish, unpublish and archive', () => {
  it('refuses Publish until every image is licensed, then writes one clean document and the event', async () => {
    const { item, pkg } = await draft()
    const refused = await errorOf(await call('POST', `/v1/publishing/items/${item.id}/publish`, { contentType: 'article' }), 422)
    expect(refused.code).toBe('PUBLISHING_PUBLISH_REFUSED')
    expect((refused.details as { problems: string[] }).problems).toEqual(['PUBLISH_REQUIRES_IMAGE_LICENSE:images/bg.gif', 'PUBLISH_REQUIRES_IMAGE_LICENSE:images/hero.png', 'PUBLISH_REQUIRES_IMAGE_LICENSE:images/thumbnail.jpg'])
    expect((await errorOf(await call('POST', `/v1/publishing/items/${item.id}/publish`, { contentType: 'answer' }), 404)).code).toBe('PUBLISHING_ITEM_NOT_FOUND')

    const licensed = (await data(await call('PATCH', `/v1/publishing/items/${item.id}`, { images: licenseAll(pkg.images.map((image) => image.originalPath)) }), PublishingItemData)).item
    expect(licensed.publishProblems).toEqual([])
    const published = (await data(await call('POST', `/v1/publishing/items/${item.id}/publish`, { contentType: 'article' }, ADMIN), PublishingItemData)).item
    expect(published).toMatchObject({ status: 'published', archivedAt: null, updatedByUserId: 'u-admin' })
    expect(published.lastPublicationKey).toMatch(/^past-publications\/article\/trusts-plain-english\/.+-pub_[0-9a-f-]+\.html$/)

    const document = new TextDecoder().decode(bucket.objects.get(published.lastPublicationKey!)!.bytes)
    expect(document.match(/<html/g)).toHaveLength(1)
    expect(document.match(/<body/g)).toHaveLength(1)
    expect(document).toContain('<meta name="kr-publication-actor-user-id" content="u-admin">')
    expect(document).toContain(`/assets/${pkg.keys.images.find((key) => key.endsWith('hero.png'))}`)
    expect(document).toContain(`url("/assets/${pkg.keys.images.find((key) => key.endsWith('bg.gif'))}")`)
    expect(document).toContain('<style>')
    expect(document).not.toContain('/api/v1/publishing/assets/')
    expect(all(`SELECT event_type, actor_user_id, actor_role, status_after FROM publication_event`)).toEqual([{ event_type: 'publish', actor_user_id: 'u-admin', actor_role: 'super_admin', status_after: 'published' }])
  })

  it('allows only license changes while published, then unpublishes and archives with their events', async () => {
    const { item, pkg } = await draft({}, { images: licenseAll(['images/bg.gif', 'images/hero.png', 'images/thumbnail.jpg']) })
    await data(await call('POST', `/v1/publishing/items/${item.id}/publish`, { contentType: 'article' }), PublishingItemData)

    expect((await errorOf(await call('PATCH', `/v1/publishing/items/${item.id}`, { title: 'Changed live' }), 409)).code).toBe('PUBLISHING_ITEM_PUBLISHED')
    const relicensed = (await data(await call('PATCH', `/v1/publishing/items/${item.id}`, { images: [{ originalPath: 'images/hero.png', license: { kind: 'firm_owned', source: 'The firm' } }] }), PublishingItemData)).item
    expect(relicensed.title).toBe('Trusts in Plain English')
    expect(relicensed.assets.find((asset) => asset.originalPath === 'images/hero.png')?.license).toMatchObject({ kind: 'firm_owned', source: 'The firm' })
    expect((await errorOf(await call('DELETE', `/v1/publishing/items/${item.id}`, { confirmation: 'Delete Article 001' }, ADMIN), 409)).code).toBe('PUBLISHING_ITEM_PUBLISHED')

    const down = (await data(await call('POST', `/v1/publishing/items/${item.id}/unpublish`, { contentType: 'article' }), PublishingItemData)).item
    expect(down).toMatchObject({ status: 'archived' })
    expect(down.unpublishedAt).toBeTruthy()
    expect((await errorOf(await call('POST', `/v1/publishing/items/${item.id}/archive`, { contentType: 'article' }), 409)).code).toBe('PUBLISHING_ITEM_NOT_PUBLISHED')

    await data(await call('POST', `/v1/publishing/items/${item.id}/publish`, { contentType: 'article' }), PublishingItemData)
    const archived = (await data(await call('POST', `/v1/publishing/items/${item.id}/archive`, { contentType: 'article' }), PublishingItemData)).item
    expect(archived.status).toBe('archived')
    expect(all(`SELECT event_type FROM publication_event ORDER BY event_at, rowid`).map((row) => row.event_type)).toEqual(['publish', 'unpublish', 'publish', 'archive'])
    expect(all(`SELECT action FROM audit_log WHERE resource = 'publishing' ORDER BY rowid`).map((row) => row.action)).toEqual(['PACKAGE_UPLOAD', 'CREATE', 'PUBLISH', 'LICENSE', 'UNPUBLISH', 'PUBLISH', 'ARCHIVE'])
    expect(pkg.contentId).toBe(item.id)
  })

  it('refuses unpublish of a draft', async () => {
    const { item } = await draft()
    expect((await errorOf(await call('POST', `/v1/publishing/items/${item.id}/unpublish`, { contentType: 'article' }), 409)).code).toBe('PUBLISHING_ITEM_NOT_PUBLISHED')
  })
})

describe('changing a draft', () => {
  it('cleans stored text again and replaces a package: the unchanged image keeps its license, old files are removed', async () => {
    const { item, pkg } = await draft({}, { images: licenseAll(['images/thumbnail.jpg', 'images/hero.png']) })
    const changed = (await data(await call('PATCH', `/v1/publishing/items/${item.id}`, { summary: 'New teaser', html: '<p onmouseover="x()">New</p><object data="x"></object>' }), PublishingItemData)).item
    expect(changed).toMatchObject({ summary: 'New teaser', html: '<p>New</p>' })

    const oldHero = pkg.keys.images.find((key) => key.endsWith('hero.png'))!
    const next = await data(await upload({ files: { 'images/hero.png': png(1000, 500) } }), ArticlePackageCheckData)
    const replaced = (await data(await call('PATCH', `/v1/publishing/items/${item.id}`, { packageKey: next.packageKey }), PublishingItemData)).item
    expect(replaced.assets.find((asset) => asset.originalPath === 'images/thumbnail.jpg')?.license).toMatchObject({ kind: 'stock' })
    expect(replaced.assets.find((asset) => asset.originalPath === 'images/hero.png')).toMatchObject({ width: 1000, license: null })
    expect(bucket.objects.has(oldHero)).toBe(false)
    expect(bucket.objects.has(pkg.packageKey)).toBe(false)
    expect(bucket.objects.has(next.packageKey)).toBe(true)
    expect(all(`SELECT revision_number FROM content_revision ORDER BY revision_number`).map((row) => row.revision_number)).toEqual([1, 2, 3])

    const other = await data(await upload({ slug: 'another-article' }), ArticlePackageCheckData)
    expect((await errorOf(await call('PATCH', `/v1/publishing/items/${item.id}`, { packageKey: other.packageKey }), 422)).code).toBe('PUBLISHING_PACKAGE_MISMATCH')
    expect((await errorOf(await call('PATCH', '/v1/publishing/items/article_none', { summary: 'x' }), 404)).code).toBe('PUBLISHING_ITEM_NOT_FOUND')
  })
})

describe('delete', () => {
  it('is super admin only, needs the typed confirmation, and removes the rows and every file', async () => {
    const { item } = await draft({}, { images: licenseAll(['images/bg.gif', 'images/hero.png', 'images/thumbnail.jpg']) })
    await data(await call('POST', `/v1/publishing/items/${item.id}/publish`, { contentType: 'article' }), PublishingItemData)
    await data(await call('POST', `/v1/publishing/items/${item.id}/unpublish`, { contentType: 'article' }), PublishingItemData)

    expect((await call('DELETE', `/v1/publishing/items/${item.id}`, { confirmation: 'Delete Article 001' }, AUTHOR)).status).toBe(403)
    expect((await errorOf(await call('DELETE', `/v1/publishing/items/${item.id}`, { confirmation: 'delete it' }, ADMIN), 422)).code).toBe('PUBLISHING_DELETE_CONFIRMATION_MISMATCH')
    const deleted = await data(await call('DELETE', `/v1/publishing/items/${item.id}`, { confirmation: 'Delete Article 001' }, ADMIN), PublishingDeletedData)
    expect(deleted).toMatchObject({ id: item.id, filesNotRemoved: [] })
    expect(deleted.removedFiles).toBeGreaterThanOrEqual(7)
    expect([...bucket.objects.keys()]).toEqual([])
    for (const table of ['public_content', 'content_asset', 'content_revision', 'publication_event']) expect(all(`SELECT * FROM ${table}`)).toEqual([])
    expect(one(`SELECT actor_user_id FROM audit_log WHERE action = 'DELETE'`)).toEqual({ actor_user_id: 'u-admin' })
  })
})

describe('files', () => {
  it('serves draft images and the stylesheet private and not cached, and refuses other keys', async () => {
    const pkg = await data(await upload(), ArticlePackageCheckData)
    const image = await call('GET', pkg.images.find((entry) => entry.originalPath === 'images/hero.png')!.url.replace('/api', ''))
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(image.headers.get('cache-control')).toBe('private, no-store')
    const css = await call('GET', pkg.stylesheetUrl!.replace('/api', ''))
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(await css.text()).toContain('/api/v1/publishing/assets/images%2Farticle%2Ftrusts-plain-english%2F')
    expect((await errorOf(await call('GET', draftAssetUrl(pkg.packageKey).replace('/api', '')), 404)).code).toBe('PUBLISHING_ASSET_NOT_FOUND')
    expect((await errorOf(await call('GET', draftAssetUrl('images/article/x/missing.png').replace('/api', '')), 404)).code).toBe('PUBLISHING_ASSET_NOT_FOUND')
  })

  it('downloads the source ZIP as <display code>-<slug>.zip', async () => {
    const { item } = await draft()
    const zip = await call('GET', `/v1/publishing/items/${item.id}/package`)
    expect(zip.status).toBe(200)
    expect(zip.headers.get('content-disposition')).toBe('attachment; filename="article-001-trusts-plain-english.zip"')
    expect(zip.headers.get('cache-control')).toBe('private, no-store')
    expect((await zip.arrayBuffer()).byteLength).toBeGreaterThan(100)
  })
})

describe('list, roles and availability', () => {
  it('lists newest first, one page at a time, and says when more exist', async () => {
    await draft()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await draft({ slug: 'second-article', files: { 'images/thumbnail.jpg': jpeg(1600, 900) } })
    const first = await data(await call('GET', '/v1/publishing/items?limit=1'), PublishingItemsData)
    expect(first.items.map((entry) => entry.id)).toEqual(['article_second-article'])
    expect(first).toMatchObject({ hasMore: true, viewer: { canDelete: false } })
    expect(first.moreNote).toMatch(/More items exist/)
    expect(first.items[0]).toMatchObject({ imageCount: 3, unlicensedImageCount: 3 })
    const second = await data(await call('GET', `/v1/publishing/items?limit=1&cursor=${first.nextCursor}`), PublishingItemsData)
    expect(second).toMatchObject({ hasMore: false, moreNote: null, nextCursor: null })
    expect(second.items.map((entry) => entry.id)).toEqual(['article_trusts-plain-english'])
    expect((await errorOf(await call('GET', '/v1/publishing/items?cursor=bad'), 422)).code).toBe('PUBLISHING_CURSOR_INVALID')
    expect((await data(await call('GET', '/v1/publishing/items?status=published'), PublishingItemsData)).items).toEqual([])
  })

  it('lets super admins and front-end authors in, nobody else', async () => {
    expect((await call('GET', '/v1/publishing/items', undefined, { role: 'staff', userId: 'u-author' })).status).toBe(403)
    expect((await call('GET', '/v1/publishing/items', undefined, ADMIN)).status).toBe(200)
    expect((await upload({}, { role: 'attorney', userId: 'u-author' })).status).toBe(403)
    expect((await call('GET', '/v1/publishing/article-prompt', undefined, AUTHOR)).status).toBe(200)
    expect((await call('PUT', '/v1/publishing/article-prompt', { prompt: 'x' }, AUTHOR)).status).toBe(403)
  })

  it('answers 503 PUBLISHING_MIGRATION_REQUIRED before migration 031, while the package check still works', async () => {
    env = createTestD1({ fullSchema: true, withoutLicenseMigration: true })
    env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-author', 'wren@example.com', 'x', 'staff')`).run()
    expect((await errorOf(await call('GET', '/v1/publishing/items'), 503)).code).toBe('PUBLISHING_MIGRATION_REQUIRED')
    const pkg = await data(await upload(), ArticlePackageCheckData)
    expect((await errorOf(await call('POST', '/v1/publishing/items', { packageKey: pkg.packageKey }), 503)).code).toBe('PUBLISHING_MIGRATION_REQUIRED')
    expect(all('SELECT id FROM public_content')).toEqual([])
  })

  it('answers 503 PUBLISHING_UNAVAILABLE without the bucket binding', async () => {
    expect((await errorOf(await call('GET', '/v1/publishing/items', undefined, AUTHOR, { ARTICLES: undefined }), 503)).code).toBe('PUBLISHING_UNAVAILABLE')
  })
})
