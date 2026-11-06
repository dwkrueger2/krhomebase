/**
 * Write-capable Cloudflare Worker for KRH Front End Publishing.
 *
 * Only server-side KRH API routes should call this worker. It updates the
 * dedicated public_content D1 table and memorializes publish/unpublish snapshots
 * in R2 under kr-homebase-articles/past-publications/...
 */

export interface ArticlePublishWorkerEnv {
  /** D1 binding for the Schema_6.0 public content database. */
  ARTICLES_DB: D1Database
  /** R2 binding for kr-homebase-articles. */
  ARTICLE_BUCKET?: R2Bucket
  /** Shared bearer token required for publishing requests. */
  KR_ARTICLE_PUBLISH_WORKER_TOKEN: string
}

type ContentType = 'article' | 'answer'
type PublishAction = 'publish' | 'unpublish' | 'archive' | 'deleteArchived'
type SqlValue = string | number | null

interface SaveRequestBody {
  action?: 'saveDraft'
  content?: Record<string, unknown>
  actorUserId?: string
  actorRole?: string
}

interface PublishRequestBody {
  action?: PublishAction
  id?: string
  contentType?: ContentType
  actorUserId?: string
  actorRole?: string
}

interface PublicContentRow extends Record<string, unknown> {
  id: string
  content_type: ContentType
  title: string
  slug: string
  topic_slug: string | null
  canonical_path: string
  status: string
  summary: string
  thumbnail_r2_key: string | null
  thumbnail_public_url: string | null
  thumbnail_alt: string
  body_format: string
  sanitized_html: string
  source_upload_r2_key: string | null
  sanitized_snapshot_r2_key: string | null
  asset_manifest_json: string | null
  seo_title: string | null
  seo_description: string | null
  author_id: string | null
  author_display_name: string | null
  category: string | null
  category_label: string | null
  pillar: string | null
  reading_time_minutes: number | null
  published_at: string | null
  unpublished_at: string | null
  created_at: string
  updated_at: string | null
  archived_at: string | null
  last_publication_r2_key: string | null
}

/** Builds a JSON response with standard headers. */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** Extracts a bearer or custom-header token from an incoming request. */
function requestToken(request: Request): string | null {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  return bearer || request.headers.get('x-kr-article-publish-token')?.trim() || null
}

/** Returns true when the incoming request may write publishing state. */
function isAuthorized(request: Request, env: ArticlePublishWorkerEnv): boolean {
  return Boolean(env.KR_ARTICLE_PUBLISH_WORKER_TOKEN && requestToken(request) === env.KR_ARTICLE_PUBLISH_WORKER_TOKEN)
}

/** Runs a D1 query and returns rows. */
async function all<T>(env: ArticlePublishWorkerEnv, sql: string, params: SqlValue[] = []): Promise<T[]> {
  const statement = env.ARTICLES_DB.prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  const result = await bound.all<T>()
  return result.results ?? []
}

/** Runs a D1 query and returns the first row. */
async function first<T>(env: ArticlePublishWorkerEnv, sql: string, params: SqlValue[] = []): Promise<T | null> {
  const statement = env.ARTICLES_DB.prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  return bound.first<T>()
}

/** Executes a D1 statement. */
async function run(env: ArticlePublishWorkerEnv, sql: string, params: SqlValue[] = []): Promise<void> {
  const statement = env.ARTICLES_DB.prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  await bound.run()
}

function stringValue(record: Record<string, unknown>, key: string, fallback = ''): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : fallback
}

function nullableStringValue(record: Record<string, unknown>, key: string): string | null {
  const value = stringValue(record, key)
  return value || null
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isContentType(value: unknown): value is ContentType {
  return value === 'article' || value === 'answer'
}

function isAllowedActorRole(role: unknown): boolean {
  return role === 'super_admin' || role === 'front_end_author'
}

function canonicalPath(contentType: ContentType, slug: string, pillar: string | null, topicSlug: string | null): string {
  if (contentType === 'answer') return `/answers/${pillar || 'pillar'}/${topicSlug || slug}`
  return `/articles/${slug}`
}

function mapQueueRow(row: PublicContentRow): Record<string, unknown> {
  return {
    id: row.id,
    contentType: row.content_type,
    kind: row.content_type,
    title: row.title,
    slug: row.slug,
    topicSlug: row.topic_slug,
    canonicalPath: row.canonical_path,
    status: row.status,
    summary: row.summary,
    thumbnailR2Key: row.thumbnail_r2_key,
    thumbnailPublicUrl: row.thumbnail_public_url,
    thumbnailAlt: row.thumbnail_alt,
    bodyFormat: row.body_format,
    sanitizedHtml: row.sanitized_html,
    bodyHtml: row.sanitized_html,
    sourceUploadR2Key: row.source_upload_r2_key,
    sanitizedSnapshotR2Key: row.sanitized_snapshot_r2_key,
    assetManifestJson: row.asset_manifest_json,
    htmlAssetManifestJson: row.asset_manifest_json,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    authorId: row.author_id,
    authorAssigned: row.author_display_name,
    category: row.category,
    categoryLabel: row.category_label,
    pillar: row.pillar,
    readingTimeMinutes: row.reading_time_minutes,
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    historyKey: row.last_publication_r2_key,
    lastPublicationR2Key: row.last_publication_r2_key,
  }
}

/** Builds the public queue shown in KRH Front End Publishing. */
async function queue(env: ArticlePublishWorkerEnv): Promise<unknown[]> {
  const rows = await all<PublicContentRow>(env, `
    SELECT *
    FROM public_content
    WHERE content_type IN ('article','answer')
    ORDER BY
      CASE status WHEN 'review' THEN 1 WHEN 'draft' THEN 2 WHEN 'published' THEN 3 ELSE 4 END,
      COALESCE(updated_at, created_at) DESC
  `)
  return rows.map(mapQueueRow)
}

function validateSaveBody(body: SaveRequestBody): { content: Record<string, unknown>; actorUserId: string; actorRole: string } | Response {
  if (!body.content || !body.actorUserId || !body.actorRole) return json({ ok: false, error: 'VALIDATION_MISSING_SAVE_FIELDS' }, 422)
  if (!isAllowedActorRole(body.actorRole)) return json({ ok: false, error: 'ROLE_NOT_AUTHORIZED' }, 403)
  if (!isContentType(body.content.contentType)) return json({ ok: false, error: 'VALIDATION_CONTENT_TYPE_ARTICLE_OR_ANSWER_ONLY' }, 422)
  if (!stringValue(body.content, 'id')) return json({ ok: false, error: 'VALIDATION_CONTENT_ID_REQUIRED' }, 422)
  if (!stringValue(body.content, 'title')) return json({ ok: false, error: 'VALIDATION_TITLE_REQUIRED' }, 422)
  if (!stringValue(body.content, 'slug')) return json({ ok: false, error: 'VALIDATION_SLUG_REQUIRED' }, 422)
  if (!stringValue(body.content, 'summary')) return json({ ok: false, error: 'VALIDATION_SUMMARY_REQUIRED' }, 422)
  if (!stringValue(body.content, 'sanitizedHtml')) return json({ ok: false, error: 'VALIDATION_SANITIZED_HTML_REQUIRED' }, 422)

  const contentType = body.content.contentType
  if (contentType === 'article' && !stringValue(body.content, 'category')) return json({ ok: false, error: 'VALIDATION_ARTICLE_CATEGORY_REQUIRED' }, 422)
  if (contentType === 'answer' && !stringValue(body.content, 'pillar')) return json({ ok: false, error: 'VALIDATION_ANSWER_PILLAR_REQUIRED' }, 422)

  return { content: body.content, actorUserId: body.actorUserId, actorRole: body.actorRole }
}

function statusForDraftSave(record: Record<string, unknown>): 'draft' | 'review' {
  return stringValue(record, 'status') === 'review' ? 'review' : 'draft'
}

async function nextRevisionNumber(env: ArticlePublishWorkerEnv, contentId: string): Promise<number> {
  const row = await first<{ value: number }>(env, 'SELECT COALESCE(MAX(revision_number), 0) + 1 AS value FROM content_revision WHERE content_id = ?', [contentId])
  return row?.value ?? 1
}

async function writeAssetManifest(env: ArticlePublishWorkerEnv, contentId: string, assetManifestJson: string | null): Promise<void> {
  await run(env, 'DELETE FROM content_asset WHERE content_id = ?', [contentId])
  if (!assetManifestJson) return

  let parsed: unknown
  try {
    parsed = JSON.parse(assetManifestJson)
  } catch {
    return
  }
  if (!Array.isArray(parsed)) return

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const r2Key = stringValue(record, 'r2Key')
    if (!r2Key) continue
    await run(env, `
      INSERT OR REPLACE INTO content_asset (
        id, content_id, original_relative_path, r2_key, public_url, mime_type, file_size,
        width, height, usage, alt_text, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `asset_${crypto.randomUUID()}`,
      contentId,
      stringValue(record, 'originalRelativePath'),
      r2Key,
      stringValue(record, 'publicUrl'),
      stringValue(record, 'mimeType', 'application/octet-stream'),
      numberOrNull(record.fileSize),
      numberOrNull(record.width),
      numberOrNull(record.height),
      stringValue(record, 'usage', 'body'),
      stringValue(record, 'altText'),
      nullableStringValue(record, 'sha256'),
      new Date().toISOString(),
    ])
  }
}

async function saveDraft(env: ArticlePublishWorkerEnv, body: { content: Record<string, unknown>; actorUserId: string }): Promise<unknown> {
  const now = new Date().toISOString()
  const content = body.content
  const contentType = content.contentType as ContentType
  const id = stringValue(content, 'id')
  const slug = stringValue(content, 'slug')
  const topicSlug = contentType === 'answer' ? nullableStringValue(content, 'topicSlug') || slug : null
  const pillar = contentType === 'answer' ? nullableStringValue(content, 'pillar') : null
  const category = contentType === 'article' ? nullableStringValue(content, 'category') : null
  const canonical = stringValue(content, 'canonicalPath') || canonicalPath(contentType, slug, pillar, topicSlug)
  const assetManifestJson = nullableStringValue(content, 'assetManifestJson')

  await run(env, `
    INSERT INTO public_content (
      id, content_type, title, slug, topic_slug, canonical_path, status, summary,
      thumbnail_r2_key, thumbnail_public_url, thumbnail_alt, body_format, sanitized_html,
      source_upload_r2_key, sanitized_snapshot_r2_key, asset_manifest_json,
      seo_title, seo_description, author_id, author_display_name, category, category_label,
      pillar, reading_time_minutes, created_at, updated_at, updated_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sanitized_html', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content_type = excluded.content_type,
      title = excluded.title,
      slug = excluded.slug,
      topic_slug = excluded.topic_slug,
      canonical_path = excluded.canonical_path,
      status = CASE WHEN public_content.status = 'published' THEN public_content.status ELSE excluded.status END,
      summary = excluded.summary,
      thumbnail_r2_key = excluded.thumbnail_r2_key,
      thumbnail_public_url = excluded.thumbnail_public_url,
      thumbnail_alt = excluded.thumbnail_alt,
      body_format = 'sanitized_html',
      sanitized_html = excluded.sanitized_html,
      source_upload_r2_key = excluded.source_upload_r2_key,
      sanitized_snapshot_r2_key = excluded.sanitized_snapshot_r2_key,
      asset_manifest_json = excluded.asset_manifest_json,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      author_id = excluded.author_id,
      author_display_name = excluded.author_display_name,
      category = excluded.category,
      category_label = excluded.category_label,
      pillar = excluded.pillar,
      reading_time_minutes = excluded.reading_time_minutes,
      updated_at = excluded.updated_at,
      updated_by_user_id = excluded.updated_by_user_id
  `, [
    id,
    contentType,
    stringValue(content, 'title'),
    slug,
    topicSlug,
    canonical,
    statusForDraftSave(content),
    stringValue(content, 'summary'),
    nullableStringValue(content, 'thumbnailR2Key'),
    nullableStringValue(content, 'thumbnailPublicUrl'),
    stringValue(content, 'thumbnailAlt'),
    stringValue(content, 'sanitizedHtml'),
    nullableStringValue(content, 'sourceUploadR2Key'),
    nullableStringValue(content, 'sanitizedSnapshotR2Key'),
    assetManifestJson,
    nullableStringValue(content, 'seoTitle'),
    nullableStringValue(content, 'seoDescription'),
    nullableStringValue(content, 'authorId'),
    nullableStringValue(content, 'authorDisplayName'),
    category,
    contentType === 'article' ? nullableStringValue(content, 'categoryLabel') : 'Answers',
    pillar,
    contentType === 'article' ? numberOrNull(content.readingTimeMinutes) : null,
    now,
    now,
    body.actorUserId,
  ])

  const revisionNumber = await nextRevisionNumber(env, id)
  await run(env, `
    INSERT INTO content_revision (
      id, content_id, revision_number, content_json, sanitized_html, asset_manifest_json,
      changed_by_user_id, change_note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [`rev_${crypto.randomUUID()}`, id, revisionNumber, JSON.stringify(content), stringValue(content, 'sanitizedHtml'), assetManifestJson, body.actorUserId, 'KRH saveDraft', now])

  await writeAssetManifest(env, id, assetManifestJson)

  const row = await first<PublicContentRow>(env, 'SELECT * FROM public_content WHERE id = ? LIMIT 1', [id])
  return row ? mapQueueRow(row) : null
}


function r2KeysForDeletion(row: PublicContentRow): string[] {
  const keys = new Set<string>()
  if (row.source_upload_r2_key) keys.add(row.source_upload_r2_key)
  if (row.sanitized_snapshot_r2_key) keys.add(row.sanitized_snapshot_r2_key)
  if (row.thumbnail_r2_key) keys.add(row.thumbnail_r2_key)
  try {
    const parsed = JSON.parse(row.asset_manifest_json || '[]') as unknown
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          const r2Key = (item as Record<string, unknown>).r2Key
          if (typeof r2Key === 'string' && r2Key.trim()) keys.add(r2Key.trim())
        }
      }
    }
  } catch {
    // Ignore malformed historical manifests. Database deletion should not fail because of old JSON.
  }
  return Array.from(keys)
}

async function deleteDraftR2Objects(env: ArticlePublishWorkerEnv, row: PublicContentRow): Promise<void> {
  if (!env.ARTICLE_BUCKET) return
  const keys = r2KeysForDeletion(row)
  await Promise.all(keys.map((key) => env.ARTICLE_BUCKET!.delete(key).catch(() => undefined)))
}

/** Builds a stable R2 past-publication key. */
function pastPublicationKey(row: PublicContentRow): string {
  return row.last_publication_r2_key || `past-publications/${row.content_type}/${row.slug}/current.html`
}

function publicationSnapshotHtml(row: PublicContentRow, options: { eventId: string; eventType: string; eventAt: string; actorUserId: string; actorRole: string; unpublishedAt: string | null }): string {
  const title = row.seo_title || row.title
  const description = row.seo_description || row.summary
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="kr-content-id" content="${escapeHtml(row.id)}">
<meta name="kr-content-type" content="${escapeHtml(row.content_type)}">
<meta name="kr-canonical-path" content="${escapeHtml(row.canonical_path)}">
<meta name="kr-published-at" content="${escapeHtml(row.published_at || options.eventAt)}">
<meta name="kr-unpublished-at" content="${escapeHtml(options.unpublishedAt || '')}">
<meta name="kr-publication-event-id" content="${escapeHtml(options.eventId)}">
<meta name="kr-publication-event-type" content="${escapeHtml(options.eventType)}">
<meta name="kr-publication-event-at" content="${escapeHtml(options.eventAt)}">
<meta name="kr-publication-actor-user-id" content="${escapeHtml(options.actorUserId)}">
<meta name="kr-publication-actor-role" content="${escapeHtml(options.actorRole)}">
</head>
<body>
${row.sanitized_html}
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function validatePublishBody(body: PublishRequestBody): Required<PublishRequestBody> | Response {
  if (!body.id || !body.contentType || !body.action || !body.actorUserId || !body.actorRole) {
    return json({ ok: false, error: 'VALIDATION_MISSING_PUBLISH_FIELDS' }, 422)
  }
  if (!isContentType(body.contentType)) return json({ ok: false, error: 'VALIDATION_CONTENT_TYPE_ARTICLE_OR_ANSWER_ONLY' }, 422)
  if (!['publish', 'unpublish', 'archive', 'deleteArchived'].includes(body.action)) return json({ ok: false, error: 'VALIDATION_BAD_ACTION' }, 422)
  if (!isAllowedActorRole(body.actorRole)) return json({ ok: false, error: 'ROLE_NOT_AUTHORIZED' }, 403)
  if (body.action === 'deleteArchived' && body.actorRole !== 'super_admin') return json({ ok: false, error: 'DELETE_REQUIRES_SUPER_ADMIN' }, 403)
  return body as Required<PublishRequestBody>
}

async function applyPublishAction(env: ArticlePublishWorkerEnv, body: Required<PublishRequestBody>): Promise<unknown> {
  const now = new Date().toISOString()
  const existing = await first<PublicContentRow>(env, 'SELECT * FROM public_content WHERE id = ? AND content_type = ? LIMIT 1', [body.id, body.contentType])
  if (!existing) throw new Error('CONTENT_ROW_NOT_FOUND')

  if (body.action === 'deleteArchived') {
    if (existing.status === 'published') throw new Error('CONTENT_DELETE_BLOCKED_WHILE_PUBLISHED')
    await deleteDraftR2Objects(env, existing)
    await run(env, 'DELETE FROM public_content WHERE id = ?', [body.id])
    return null
  }

  if (body.action === 'publish') {
    if (!existing.summary.trim()) throw new Error('PUBLISH_REQUIRES_SUMMARY')
    if (!existing.sanitized_html.trim()) throw new Error('PUBLISH_REQUIRES_SANITIZED_HTML')
    if ((existing.thumbnail_r2_key || existing.thumbnail_public_url) && !existing.thumbnail_alt.trim()) throw new Error('PUBLISH_REQUIRES_THUMBNAIL_ALT_TEXT')
    const missingAlt = await first<{ count: number }>(env, `
      SELECT COUNT(*) AS count
      FROM content_asset
      WHERE content_id = ?
        AND usage IN ('body','thumbnail','both')
        AND TRIM(COALESCE(alt_text, '')) = ''
    `, [body.id])
    if ((missingAlt?.count ?? 0) > 0) throw new Error('PUBLISH_REQUIRES_ALT_TEXT_FOR_ALL_IMAGES')
  }

  const nextStatus = body.action === 'publish' ? 'published' : 'archived'
  const unpublishedAt = body.action === 'unpublish' ? now : existing.unpublished_at
  const publishedAt = body.action === 'publish' ? now : existing.published_at
  const archivedAt = body.action === 'publish' ? null : now
  const r2Key = pastPublicationKey(existing)
  const eventId = `pub_${crypto.randomUUID()}`

  await run(env, `
    UPDATE public_content
    SET status = ?,
        published_at = ?,
        unpublished_at = ?,
        archived_at = ?,
        last_publication_r2_key = ?,
        updated_at = ?,
        updated_by_user_id = ?
    WHERE id = ?
  `, [nextStatus, publishedAt, unpublishedAt, archivedAt, r2Key, now, body.actorUserId, body.id])

  const updated = await first<PublicContentRow>(env, 'SELECT * FROM public_content WHERE id = ? LIMIT 1', [body.id])
  if (!updated) throw new Error('CONTENT_ROW_NOT_FOUND_AFTER_UPDATE')

  await run(env, `
    INSERT INTO publication_event (id, content_type, content_id, event_type, event_at, actor_user_id, actor_role, status_after, past_publication_r2_key, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [eventId, body.contentType, body.id, body.action, now, body.actorUserId, body.actorRole, nextStatus, r2Key, JSON.stringify(updated), now])

  if (env.ARTICLE_BUCKET && (body.action === 'publish' || body.action === 'unpublish')) {
    const snapshot = publicationSnapshotHtml(updated, { eventId, eventType: body.action, eventAt: now, actorUserId: body.actorUserId, actorRole: body.actorRole, unpublishedAt })
    await env.ARTICLE_BUCKET.put(r2Key, snapshot, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
      customMetadata: {
        contentId: body.id,
        contentType: body.contentType,
        eventId,
        eventType: body.action,
        eventAt: now,
      },
    })
  }

  return mapQueueRow(updated)
}

/** Main Cloudflare Worker fetch handler. */
export default {
  async fetch(request: Request, env: ArticlePublishWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return json({ ok: true, worker: 'article-publish-worker', schema: 'Schema_6.0' })
    if (!isAuthorized(request, env)) return json({ ok: false, error: 'ARTICLE_PUBLISH_UNAUTHORIZED' }, 401)

    try {
      if (request.method === 'GET' && url.pathname === '/queue') {
        return json({ ok: true, data: { rows: await queue(env) } })
      }

      if (request.method === 'POST' && url.pathname === '/save') {
        const parsed = await request.json().catch(() => null) as SaveRequestBody | null
        if (!parsed) return json({ ok: false, error: 'REQUEST_PARSE_ERROR' }, 400)
        const validated = validateSaveBody(parsed)
        if (validated instanceof Response) return validated
        return json({ ok: true, data: { row: await saveDraft(env, validated) } })
      }

      if (request.method === 'POST' && url.pathname === '/publish') {
        const parsed = await request.json().catch(() => null) as PublishRequestBody | null
        if (!parsed) return json({ ok: false, error: 'REQUEST_PARSE_ERROR' }, 400)
        const validated = validatePublishBody(parsed)
        if (validated instanceof Response) return validated
        return json({ ok: true, data: { row: await applyPublishAction(env, validated) } })
      }

      return json({ ok: false, error: 'NOT_FOUND' }, 404)
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'ARTICLE_PUBLISH_FAILED' }, 500)
    }
  },
}
