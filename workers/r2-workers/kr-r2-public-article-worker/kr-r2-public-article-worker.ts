/**
 * Public R2 worker for published Article/Answer image assets.
 *
 * This worker intentionally exposes only R2 objects that are present in the D1
 * content_asset table and joined to a public_content row with status='published'.
 * It does not serve source ZIP uploads, draft snapshots, or arbitrary bucket keys.
 */

export interface KRR2PublicArticleWorkerEnv {
  /** D1 binding for Schema_6.0 public content tables. */
  KRHOMEBASE_DB: D1Database
  /** R2 binding for kr-homebase-articles. */
  ARTICLE_BUCKET: R2Bucket
  /** Optional comma-separated CORS origin allow-list. Defaults to public wildcard for images. */
  KR_ARTICLE_PUBLIC_ALLOWED_ORIGINS?: string
}

type SqlValue = string | number | null

type PublishedAssetRow = {
  r2_key: string
  mime_type: string | null
  file_size: number | null
  alt_text: string | null
  usage: string | null
  content_id: string
  content_type: 'article' | 'answer'
  slug: string
  title: string
  status: string
  published_at: string | null
}

type PublishedContentRow = {
  id: string
  content_type: 'article' | 'answer'
  title: string
  slug: string
  summary: string | null
  canonical_path: string | null
  category_label: string | null
  reading_time_minutes: number | null
  thumbnail_r2_key: string | null
  thumbnail_public_url: string | null
  thumbnail_alt: string | null
  published_at: string | null
  updated_at: string | null
}

type PublishedContentDocumentRow = {
  id: string
  content_type: 'article' | 'answer'
  title: string
  slug: string
  last_publication_r2_key: string | null
  sanitized_snapshot_r2_key: string | null
  published_at: string | null
  updated_at: string | null
}

const IMAGE_ROUTE_PREFIX = '/assets/'
const IMAGE_KEY_PREFIX = 'images/'
const PUBLIC_IMAGE_CACHE = 'public, max-age=3600'
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function articleDatabase(env: KRR2PublicArticleWorkerEnv): D1Database {
  if (!env.KRHOMEBASE_DB) throw new Error('KRHOMEBASE_DB_BINDING_MISSING')
  return env.KRHOMEBASE_DB
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...(headers ?? {}),
    },
  })
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, '/')
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function allowedOrigins(env: KRR2PublicArticleWorkerEnv): string[] {
  return (env.KR_ARTICLE_PUBLIC_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function publicCorsHeaders(request: Request, env: KRR2PublicArticleWorkerEnv): HeadersInit {
  const origin = request.headers.get('origin')?.trim()
  const allowed = allowedOrigins(env)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }

  if (!allowed.length) headers['Access-Control-Allow-Origin'] = '*'
  else if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function decodeAssetKey(rawKey: string): string | null {
  const trimmed = rawKey.replace(/^\/+/, '')
  if (!trimmed) return null

  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    return null
  }

  const key = decoded.replace(/\\/g, '/')
  if (!key.startsWith(IMAGE_KEY_PREFIX)) return null
  if (key.startsWith('/') || key.includes('\0')) return null
  if (key.split('/').some((part) => !part || part === '.' || part === '..')) return null
  if (!/^[A-Za-z0-9/._~!$&'()+,;=@-]+$/.test(key)) return null
  return key
}

function assetKeyFromPath(pathname: string): string | null {
  if (!pathname.startsWith(IMAGE_ROUTE_PREFIX)) return null
  return decodeAssetKey(pathname.slice(IMAGE_ROUTE_PREFIX.length))
}

function publishedContentPath(pathname: string): { contentType: 'article' | 'answer'; slug: string } | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 2 && (parts[0] === 'articles' || parts[0] === 'answers')) {
    const slug = parts[1]
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return null
    return { contentType: parts[0] === 'articles' ? 'article' : 'answer', slug }
  }

  if (parts.length === 3 && parts[0] === 'content' && (parts[1] === 'article' || parts[1] === 'answer')) {
    const slug = parts[2]
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return null
    return { contentType: parts[1], slug }
  }

  return null
}

async function first<T>(env: KRR2PublicArticleWorkerEnv, sql: string, params: SqlValue[] = []): Promise<T | null> {
  const statement = articleDatabase(env).prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  return bound.first<T>()
}

async function publishedAssetRow(env: KRR2PublicArticleWorkerEnv, key: string): Promise<PublishedAssetRow | null> {
  return first<PublishedAssetRow>(env, `
    SELECT
      a.r2_key,
      a.mime_type,
      a.file_size,
      a.alt_text,
      a.usage,
      c.id AS content_id,
      c.content_type,
      c.slug,
      c.title,
      c.status,
      c.published_at
    FROM content_asset a
    INNER JOIN public_content c ON c.id = a.content_id
    WHERE a.r2_key = ?
      AND c.status = 'published'
      AND c.content_type IN ('article', 'answer')
      AND a.usage IN ('body', 'thumbnail', 'both')

    UNION ALL

    SELECT
      c.thumbnail_r2_key AS r2_key,
      NULL AS mime_type,
      NULL AS file_size,
      c.thumbnail_alt AS alt_text,
      'thumbnail' AS usage,
      c.id AS content_id,
      c.content_type,
      c.slug,
      c.title,
      c.status,
      c.published_at
    FROM public_content c
    WHERE c.thumbnail_r2_key = ?
      AND c.status = 'published'
      AND c.content_type IN ('article', 'answer')

    LIMIT 1
  `, [key, key])
}

async function publishedContentRows(env: KRR2PublicArticleWorkerEnv): Promise<PublishedContentRow[]> {
  const result = await articleDatabase(env).prepare(`
    SELECT
      id,
      content_type,
      title,
      slug,
      summary,
      canonical_path,
      category_label,
      reading_time_minutes,
      thumbnail_r2_key,
      thumbnail_public_url,
      thumbnail_alt,
      published_at,
      updated_at
    FROM public_content
    WHERE status = 'published'
      AND content_type IN ('article', 'answer')
    ORDER BY COALESCE(published_at, updated_at) DESC, title COLLATE NOCASE ASC
    LIMIT 200
  `).all<PublishedContentRow>()
  return result.results || []
}

async function publishedContentResponse(request: Request, env: KRR2PublicArticleWorkerEnv): Promise<Response> {
  const rows = await publishedContentRows(env)
  const origin = new URL(request.url).origin
  const articles = rows.map((row) => {
    const plural = row.content_type === 'answer' ? 'answers' : 'articles'
    return {
      id: row.id,
      contentType: row.content_type,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      canonicalPath: row.canonical_path,
      publicContentUrl: `${origin}/${plural}/${row.slug}`,
      publicWorkerPath: `/${plural}/${row.slug}`,
      categoryLabel: row.category_label,
      readingTimeMinutes: row.reading_time_minutes,
      thumbnailPublicUrl: row.thumbnail_r2_key ? `${origin}/assets/${row.thumbnail_r2_key}` : row.thumbnail_public_url,
      thumbnailAlt: row.thumbnail_alt,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    }
  })

  return json({
    ok: true,
    count: articles.length,
    empty: articles.length === 0,
    articles,
    items: articles,
    message: articles.length ? 'Published content rows found.' : 'No published Article or Answer Blog rows found.',
  }, 200, publicCorsHeaders(request, env))
}

async function publishedContentDocumentRow(
  env: KRR2PublicArticleWorkerEnv,
  contentType: 'article' | 'answer',
  slug: string,
): Promise<PublishedContentDocumentRow | null> {
  return first<PublishedContentDocumentRow>(env, `
    SELECT
      id,
      content_type,
      title,
      slug,
      last_publication_r2_key,
      sanitized_snapshot_r2_key,
      published_at,
      updated_at
    FROM public_content
    WHERE status = 'published'
      AND content_type = ?
      AND slug = ?
    LIMIT 1
  `, [contentType, slug])
}

function rewritePublishedHtmlAssetUrls(html: string, contentType: 'article' | 'answer', slug: string): string {
  const contentSegment = `${contentType}/${slug}`
  const publicPrefix = `/assets/images/${contentSegment}/`
  const draftPrefixes = [
    `/krhomebase/api/front-end-publishing/assets/images/${contentSegment}/`,
    `http://localhost:3000/krhomebase/api/front-end-publishing/assets/images/${contentSegment}/`,
    `https://localhost:3000/krhomebase/api/front-end-publishing/assets/images/${contentSegment}/`,
  ]

  return draftPrefixes.reduce((nextHtml, draftPrefix) => nextHtml.split(draftPrefix).join(publicPrefix), html)
}

async function servePublishedContentDocument(
  request: Request,
  env: KRR2PublicArticleWorkerEnv,
  contentType: 'article' | 'answer',
  slug: string,
): Promise<Response> {
  const row = await publishedContentDocumentRow(env, contentType, slug)
  if (!row) return json({ ok: false, error: 'PUBLISHED_CONTENT_NOT_FOUND' }, 404, publicCorsHeaders(request, env))

  const key = row.last_publication_r2_key || row.sanitized_snapshot_r2_key
  if (!key) return json({ ok: false, error: 'PUBLISHED_CONTENT_HTML_NOT_AVAILABLE' }, 404, publicCorsHeaders(request, env))
  if (!key.startsWith('past-publications/') && !key.startsWith('sanitized-snapshots/')) {
    return json({ ok: false, error: 'PUBLISHED_CONTENT_HTML_KEY_INVALID' }, 404, publicCorsHeaders(request, env))
  }

  const object = await env.ARTICLE_BUCKET.get(key)
  if (!object) return json({ ok: false, error: 'PUBLISHED_CONTENT_HTML_NOT_FOUND' }, 404, publicCorsHeaders(request, env))

  const headers = new Headers(publicCorsHeaders(request, env))
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', object.httpMetadata?.cacheControl || 'public, max-age=300')
  headers.set('ETag', object.httpEtag)
  headers.set('X-KR-Article-Document', 'published')
  headers.set('X-KR-Article-Content-Id', row.id)
  headers.set('X-KR-Article-Content-Type', row.content_type)
  headers.delete('Content-Length')
  headers.delete('ETag')
  headers.set('X-KR-Article-Document-Asset-Rewrite', 'published-worker')

  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })

  const html = await object.text()
  const rewrittenHtml = rewritePublishedHtmlAssetUrls(html, contentType, slug)
  return new Response(rewrittenHtml, { status: 200, headers })
}

function responseHeaders(request: Request, env: KRR2PublicArticleWorkerEnv, object: R2ObjectBody, row: PublishedAssetRow): Headers {
  const headers = new Headers(publicCorsHeaders(request, env))
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', headers.get('Content-Type') || row.mime_type || 'application/octet-stream')
  headers.set('Cache-Control', object.httpMetadata?.cacheControl || PUBLIC_IMAGE_CACHE)
  headers.set('ETag', object.httpEtag)
  headers.set('X-KR-Article-Asset', 'published')
  headers.set('X-KR-Article-Content-Id', row.content_id)
  headers.set('X-KR-Article-Content-Type', row.content_type)
  headers.set('X-KR-Article-Asset-Usage', row.usage || 'body')
  if (object.size != null) headers.set('Content-Length', String(object.size))
  return headers
}

async function servePublishedAsset(request: Request, env: KRR2PublicArticleWorkerEnv, key: string): Promise<Response> {
  const row = await publishedAssetRow(env, key)
  if (!row) return json({ ok: false, error: 'ARTICLE_ASSET_NOT_PUBLISHED' }, 404, publicCorsHeaders(request, env))

  const object = await env.ARTICLE_BUCKET.get(key)
  if (!object) return json({ ok: false, error: 'ARTICLE_ASSET_NOT_FOUND' }, 404, publicCorsHeaders(request, env))

  const headers = responseHeaders(request, env, object, row)
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(object.body, { status: 200, headers })
}

function methodNotAllowed(request: Request, env: KRR2PublicArticleWorkerEnv): Response {
  return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, {
    ...publicCorsHeaders(request, env),
    Allow: 'GET, HEAD, POST, OPTIONS',
  })
}

function notFound(request: Request, env: KRR2PublicArticleWorkerEnv): Response {
  return json({ ok: false, error: 'NOT_FOUND' }, 404, publicCorsHeaders(request, env))
}


export default {
  async fetch(request: Request, env: KRR2PublicArticleWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const pathname = normalizePath(url.pathname)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: publicCorsHeaders(request, env) })

    if (pathname === '/healthz' || pathname === '/health') {
      return json({ ok: true }, 200, publicCorsHeaders(request, env))
    }

    if (pathname === '/') {
      return notFound(request, env)
    }

    if (pathname === '/published' || pathname === '/articles') {
      if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowed(request, env)
      return publishedContentResponse(request, env)
    }

    const contentPath = publishedContentPath(pathname)
    if (contentPath) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(request, env)
      return servePublishedContentDocument(request, env, contentPath.contentType, contentPath.slug)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return methodNotAllowed(request, env)
    }

    try {
      const key = assetKeyFromPath(pathname)
      if (!key) return json({ ok: false, error: 'ARTICLE_ASSET_KEY_INVALID' }, 404, publicCorsHeaders(request, env))
      return servePublishedAsset(request, env, key)
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'ARTICLE_PUBLIC_ASSET_FAILED' }, 500, publicCorsHeaders(request, env))
    }
  },
}
