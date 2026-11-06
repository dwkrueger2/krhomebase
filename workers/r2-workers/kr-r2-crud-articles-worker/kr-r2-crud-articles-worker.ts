/**
 * Protected R2 CRUD worker for KR Homebase Article/Answer package objects.
 *
 * This worker is for server-to-server KR Homebase maintenance only. It can read,
 * write, and delete known article object prefixes in the kr-homebase-articles
 * bucket after a bearer-token check. Browser users should not call this worker.
 */

export interface KRR2CrudArticlesWorkerEnv {
  /** R2 binding for kr-homebase-articles. */
  ARTICLE_BUCKET: R2Bucket
  /** Shared secret used by server-side KR Homebase routes and admin scripts. */
  KR_R2_ARTICLES_WORKER_TOKEN: string
  /** Optional comma-separated CORS origin allow-list for local tooling. */
  KR_R2_CRUD_ARTICLES_ALLOWED_ORIGINS?: string
}

type JsonRecord = Record<string, unknown>

const ALLOWED_PREFIXES = [
  'images/',
  'source-uploads/',
  'sanitized-snapshots/',
  'past-publications/',
] as const

const MAX_BATCH_DELETE_KEYS = 100
const DEFAULT_CACHE_CONTROL = 'no-store'
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...(extraHeaders ?? {}),
    },
  })
}

function allowedOrigins(env: KRR2CrudArticlesWorkerEnv): string[] {
  return (env.KR_R2_CRUD_ARTICLES_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function corsHeaders(request: Request, env: KRR2CrudArticlesWorkerEnv): HeadersInit {
  const origin = request.headers.get('origin')?.trim()
  const allowed = allowedOrigins(env)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-KR-Article-R2-Token',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }

  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function tokenFromRequest(request: Request): string | null {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  return bearer || request.headers.get('x-kr-article-r2-token')?.trim() || null
}

function isAuthorized(request: Request, env: KRR2CrudArticlesWorkerEnv): boolean {
  return Boolean(env.KR_R2_ARTICLES_WORKER_TOKEN && tokenFromRequest(request) === env.KR_R2_ARTICLES_WORKER_TOKEN)
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, '/')
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function decodeKey(rawKey: string): string | null {
  const trimmed = rawKey.replace(/^\/+/, '')
  if (!trimmed) return null

  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    return null
  }

  const key = decoded.replace(/\\/g, '/')
  if (!key || key.startsWith('/') || key.includes('\0')) return null
  if (key.split('/').some((part) => !part || part === '.' || part === '..')) return null
  if (!/^[A-Za-z0-9/._~!$&'()+,;=@-]+$/.test(key)) return null
  if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) return null
  return key
}

function keyFromObjectRoute(pathname: string): string | null {
  const prefixes = ['/object/', '/admin/object/']
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) return decodeKey(pathname.slice(prefix.length))
  }
  return null
}

function objectHeaders(object: R2ObjectBody, key: string, forceDownload: boolean): Headers {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream')
  headers.set('Cache-Control', object.httpMetadata?.cacheControl || DEFAULT_CACHE_CONTROL)
  headers.set('ETag', object.httpEtag)
  headers.set('X-KR-R2-Key', key)
  headers.set('X-KR-Article-Object-Scope', 'private-admin')
  if (object.size != null) headers.set('Content-Length', String(object.size))
  if (forceDownload) headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop() || 'article-object'}"`)
  return headers
}

async function readObject(request: Request, env: KRR2CrudArticlesWorkerEnv, key: string): Promise<Response> {
  const object = await env.ARTICLE_BUCKET.get(key)
  if (!object) return json({ ok: false, error: 'ARTICLE_OBJECT_NOT_FOUND' }, 404)

  const url = new URL(request.url)
  const headers = objectHeaders(object, key, url.searchParams.get('download') === '1')
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(object.body, { status: 200, headers })
}

async function putObject(request: Request, env: KRR2CrudArticlesWorkerEnv, key: string): Promise<Response> {
  const contentType = request.headers.get('content-type') || 'application/octet-stream'
  const cacheControl = request.headers.get('cache-control') || (key.startsWith('images/') ? 'public, max-age=3600' : 'no-store')
  const body = await request.arrayBuffer()

  if (!body.byteLength) return json({ ok: false, error: 'ARTICLE_OBJECT_BODY_REQUIRED' }, 422)

  const object = await env.ARTICLE_BUCKET.put(key, body, {
    httpMetadata: {
      contentType,
      cacheControl,
    },
    customMetadata: {
      uploadedBy: 'kr-homebase',
      objectScope: 'article-publishing',
      uploadedAt: new Date().toISOString(),
    },
  })

  return json({
    ok: true,
    data: {
      key,
      etag: object?.httpEtag ?? null,
      size: body.byteLength,
      contentType,
      cacheControl,
    },
  })
}

async function deleteObject(env: KRR2CrudArticlesWorkerEnv, key: string): Promise<Response> {
  await env.ARTICLE_BUCKET.delete(key)
  return json({ ok: true, data: { key, deleted: true } })
}

async function batchDelete(request: Request, env: KRR2CrudArticlesWorkerEnv): Promise<Response> {
  const body = await request.json().catch(() => null) as { keys?: unknown } | null
  const keys = Array.isArray(body?.keys) ? body.keys : []
  if (!keys.length) return json({ ok: false, error: 'BATCH_DELETE_KEYS_REQUIRED' }, 422)
  if (keys.length > MAX_BATCH_DELETE_KEYS) return json({ ok: false, error: 'BATCH_DELETE_TOO_MANY_KEYS', max: MAX_BATCH_DELETE_KEYS }, 422)

  const validatedKeys: string[] = []
  const rejected: JsonRecord[] = []
  for (const value of keys) {
    if (typeof value !== 'string') {
      rejected.push({ key: value, error: 'KEY_MUST_BE_STRING' })
      continue
    }
    const key = decodeKey(value)
    if (!key) rejected.push({ key: value, error: 'KEY_NOT_ALLOWED' })
    else validatedKeys.push(key)
  }

  if (rejected.length) return json({ ok: false, error: 'BATCH_DELETE_CONTAINS_REJECTED_KEYS', rejected }, 422)
  await Promise.all(validatedKeys.map((key) => env.ARTICLE_BUCKET.delete(key)))
  return json({ ok: true, data: { deletedKeys: validatedKeys } })
}

export default {
  async fetch(request: Request, env: KRR2CrudArticlesWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const pathname = normalizePath(url.pathname)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })

    if (pathname === '/healthz' || pathname === '/health') {
      return json({ ok: true, worker: 'kr-r2-crud-articles-worker' })
    }

    if (pathname === '/') {
      return json({ ok: false, error: 'NOT_FOUND' }, 404)
    }

    if (!isAuthorized(request, env)) return json({ ok: false, error: 'ARTICLE_R2_WORKER_UNAUTHORIZED' }, 401)

    try {
      if (request.method === 'POST' && pathname === '/admin/batch-delete') return batchDelete(request, env)

      const key = keyFromObjectRoute(pathname)
      if (!key) return json({ ok: false, error: 'NOT_FOUND_OR_KEY_NOT_ALLOWED' }, 404)

      if (request.method === 'GET' || request.method === 'HEAD') return readObject(request, env, key)
      if (request.method === 'PUT') return putObject(request, env, key)
      if (request.method === 'DELETE') return deleteObject(env, key)
      return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'ARTICLE_R2_WORKER_FAILED' }, 500)
    }
  },
}
