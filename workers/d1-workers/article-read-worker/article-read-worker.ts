/**
 * Read-only Cloudflare Worker for public Article and Answer content.
 *
 * The Next.js server calls this worker with KR_ARTICLE_READ_WORKER_TOKEN and
 * renders public pages. Browser clients never receive direct D1 or R2 access.
 */

export interface ArticleReadWorkerEnv {
  /** D1 binding for the Schema_6.0 public content database. */
  ARTICLES_DB: D1Database
  /** R2 binding for kr-homebase-articles, used for approved published images. */
  ARTICLE_BUCKET?: R2Bucket
  /** Shared bearer token required for read requests. */
  KR_ARTICLE_READ_WORKER_TOKEN: string
}

type SqlValue = string | number | null

interface PublicContentRow extends Record<string, unknown> {
  id: string
  content_type: 'article' | 'answer'
  title: string
  slug: string
  topic_slug: string | null
  canonical_path: string
  status: string
  summary: string
  sanitized_html: string
  thumbnail_r2_key: string | null
  thumbnail_public_url: string | null
  thumbnail_alt: string | null
  seo_title: string | null
  seo_description: string | null
  author_id: string | null
  author_display_name: string | null
  category: string | null
  category_label: string | null
  pillar: string | null
  reading_time_minutes: number | null
  published_at: string | null
  updated_at: string | null
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
  return bearer || request.headers.get('x-kr-article-read-token')?.trim() || null
}

/** Returns true when the incoming request is allowed to read content. */
function isAuthorized(request: Request, env: ArticleReadWorkerEnv): boolean {
  return Boolean(env.KR_ARTICLE_READ_WORKER_TOKEN && requestToken(request) === env.KR_ARTICLE_READ_WORKER_TOKEN)
}

/** Runs a D1 query and returns result rows. */
async function all<T>(env: ArticleReadWorkerEnv, sql: string, params: SqlValue[] = []): Promise<T[]> {
  const statement = env.ARTICLES_DB.prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  const result = await bound.all<T>()
  return result.results ?? []
}

/** Runs a D1 query and returns the first row. */
async function first<T>(env: ArticleReadWorkerEnv, sql: string, params: SqlValue[] = []): Promise<T | null> {
  const statement = env.ARTICLES_DB.prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  return bound.first<T>()
}

const PUBLIC_ARTICLE_ASSET_ROUTE_PREFIX = '/api/article-assets/'
const DRAFT_ARTICLE_ASSET_ROUTE_PREFIX = '/krhomebase/api/front-end-publishing/assets/'

function encodeR2KeyForPublicRoute(r2Key: string): string {
  return r2Key.split('/').map(encodeURIComponent).join('/')
}

function publicArticleAssetUrl(r2Key: string | null): string | null {
  return r2Key ? `${PUBLIC_ARTICLE_ASSET_ROUTE_PREFIX}${encodeR2KeyForPublicRoute(r2Key)}` : null
}

function rewriteDraftImageUrlsForPublicHtml(html: string): string {
  return html.replaceAll(DRAFT_ARTICLE_ASSET_ROUTE_PREFIX, PUBLIC_ARTICLE_ASSET_ROUTE_PREFIX)
}

function mapArticle(row: PublicContentRow): Record<string, unknown> {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    dek: row.summary,
    bodyFormat: 'sanitized_html',
    bodyMarkdown: '',
    bodyHtml: rewriteDraftImageUrlsForPublicHtml(row.sanitized_html),
    category: row.category || 'estate-planning',
    categoryLabel: row.category_label || 'Article',
    author: {
      id: row.author_id,
      name: row.author_display_name || 'Krueger & Richard',
      role: 'Attorney',
      initials: (row.author_display_name || 'KR').split(/\s+/).map((piece) => piece[0]).join('').slice(0, 3).toUpperCase(),
    },
    publishedAt: row.published_at || new Date(0).toISOString(),
    updatedAt: row.updated_at || undefined,
    readingMinutes: row.reading_time_minutes ?? 0,
    thumbnailAlt: row.thumbnail_alt || '',
    thumbnailUrl: publicArticleAssetUrl(row.thumbnail_r2_key) || row.thumbnail_public_url,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    canonicalPath: row.canonical_path,
    status: row.status,
  }
}

function mapAnswerTopic(row: PublicContentRow): Record<string, unknown> {
  return {
    id: row.id,
    pillar: row.pillar || 'answers',
    slug: row.topic_slug || row.slug,
    question: row.title,
    summary: row.summary,
    answerMarkdown: '',
    bodyFormat: 'sanitized_html',
    bodyHtml: rewriteDraftImageUrlsForPublicHtml(row.sanitized_html),
    faqs: [],
    publishedAt: row.published_at || new Date(0).toISOString(),
    updatedAt: row.updated_at || undefined,
    thumbnailAlt: row.thumbnail_alt || '',
    thumbnailUrl: publicArticleAssetUrl(row.thumbnail_r2_key) || row.thumbnail_public_url,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    canonicalPath: row.canonical_path,
    status: row.status,
  }
}

/** Returns all published articles ordered newest first. */
async function listArticles(env: ArticleReadWorkerEnv): Promise<unknown[]> {
  const rows = await all<PublicContentRow>(env, `
    SELECT *
    FROM public_content
    WHERE content_type = 'article' AND status = 'published'
    ORDER BY published_at DESC, title ASC
  `)
  return rows.map(mapArticle)
}

/** Returns one published article by slug. */
async function getArticle(env: ArticleReadWorkerEnv, slug: string): Promise<unknown | null> {
  const row = await first<PublicContentRow>(env, `
    SELECT *
    FROM public_content
    WHERE content_type = 'article' AND slug = ? AND status = 'published'
    LIMIT 1
  `, [slug])
  return row ? mapArticle(row) : null
}

/** Returns answer pillars inferred from published Answers. */
async function listQuestionPillars(env: ArticleReadWorkerEnv): Promise<unknown[]> {
  const rows = await all<{ pillar: string; description: string }>(env, `
    SELECT pillar, MIN(summary) AS description
    FROM public_content
    WHERE content_type = 'answer' AND status = 'published' AND pillar IS NOT NULL
    GROUP BY pillar
    ORDER BY pillar ASC
  `)
  return rows.map((row) => ({ slug: row.pillar, title: row.pillar.split('-').map((piece) => `${piece.charAt(0).toUpperCase()}${piece.slice(1)}`).join(' '), description: row.description, accent: 'var(--mfe-deep-navy)' }))
}

/** Returns published answer topics, optionally filtered by pillar. */
async function listAnswerTopics(env: ArticleReadWorkerEnv, pillar?: string): Promise<unknown[]> {
  const where = pillar ? 'content_type = \'answer\' AND status = \'published\' AND pillar = ?' : 'content_type = \'answer\' AND status = \'published\''
  const rows = await all<PublicContentRow>(env, `
    SELECT *
    FROM public_content
    WHERE ${where}
    ORDER BY published_at DESC, title ASC
  `, pillar ? [pillar] : [])
  return rows.map(mapAnswerTopic)
}

/** Returns one answer topic. */
async function getAnswerTopic(env: ArticleReadWorkerEnv, pillar: string, topic: string): Promise<unknown | null> {
  const row = await first<PublicContentRow>(env, `
    SELECT *
    FROM public_content
    WHERE content_type = 'answer' AND status = 'published' AND pillar = ? AND COALESCE(topic_slug, slug) = ?
    LIMIT 1
  `, [pillar, topic])
  return row ? mapAnswerTopic(row) : null
}

/** Converts database row shape into the MFE public content bundle shape. */
function bundleRows(articles: unknown[], questionPillars: unknown[], answerTopics: unknown[]) {
  return {
    articles,
    questionPillars,
    answerTopics,
  }
}

async function serveAsset(env: ArticleReadWorkerEnv, key: string): Promise<Response> {
  if (!env.ARTICLE_BUCKET) return json({ ok: false, error: 'ARTICLE_BUCKET_NOT_BOUND' }, 404)
  if (!key.startsWith('images/') || key.includes('..') || key.includes('\\')) return json({ ok: false, error: 'BAD_ASSET_KEY' }, 404)

  const row = await first<{ r2_key: string; mime_type: string }>(env, `
    SELECT a.r2_key, a.mime_type
    FROM content_asset a
    INNER JOIN public_content c ON c.id = a.content_id
    WHERE a.r2_key = ? AND c.status = 'published'
    LIMIT 1
  `, [key])
  if (!row) return json({ ok: false, error: 'ARTICLE_ASSET_NOT_PUBLISHED' }, 404)

  const object = await env.ARTICLE_BUCKET.get(key)
  if (!object) return json({ ok: false, error: 'ARTICLE_ASSET_NOT_FOUND' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || row.mime_type || 'application/octet-stream')
  headers.set('Cache-Control', 'public, max-age=3600')
  headers.set('ETag', object.httpEtag)
  if (object.size) headers.set('Content-Length', String(object.size))
  return new Response(object.body, { status: 200, headers })
}

/** Main Cloudflare Worker fetch handler. */
export default {
  async fetch(request: Request, env: ArticleReadWorkerEnv): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') return json({ ok: true, worker: 'article-read-worker', schema: 'Schema_6.0' })
    if (!isAuthorized(request, env)) return json({ ok: false, error: 'ARTICLE_READ_UNAUTHORIZED' }, 401)
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

    try {
      const assetMatch = url.pathname.match(/^\/assets\/(.+)$/)
      if (assetMatch?.[1]) return serveAsset(env, decodeURIComponent(assetMatch[1]))

      if (url.pathname === '/bundle' || url.pathname === '/') {
        const articles = await listArticles(env)
        const questionPillars = await listQuestionPillars(env)
        const answerTopics = await listAnswerTopics(env)
        return json({ ok: true, data: bundleRows(articles, questionPillars, answerTopics) })
      }

      if (url.pathname === '/articles') return json({ ok: true, data: { articles: await listArticles(env) } })

      const articleMatch = url.pathname.match(/^\/articles\/([^/]+)$/)
      if (articleMatch?.[1]) return json({ ok: true, data: { article: await getArticle(env, decodeURIComponent(articleMatch[1])) } })

      if (url.pathname === '/answers') return json({ ok: true, data: { answerTopics: await listAnswerTopics(env) } })

      const pillarMatch = url.pathname.match(/^\/answers\/([^/]+)$/)
      if (pillarMatch?.[1]) return json({ ok: true, data: { answerTopics: await listAnswerTopics(env, decodeURIComponent(pillarMatch[1])) } })

      const topicMatch = url.pathname.match(/^\/answers\/([^/]+)\/([^/]+)$/)
      if (topicMatch?.[1] && topicMatch[2]) {
        return json({ ok: true, data: { answerTopic: await getAnswerTopic(env, decodeURIComponent(topicMatch[1]), decodeURIComponent(topicMatch[2])) } })
      }

      return json({ ok: false, error: 'NOT_FOUND' }, 404)
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'ARTICLE_READ_FAILED' }, 500)
    }
  },
}
