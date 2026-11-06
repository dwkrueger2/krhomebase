import {
  KR_FRONT_END_ASSET_IMAGE_ALLOW_LIST,
  KR_FRONT_END_ASSET_IMAGE_CATEGORIES,
  KR_FRONT_END_ASSET_IMAGES,
  getKRFrontEndAssetImageById,
  type KRFrontEndAssetImageRecord,
} from './front-end-asset-images'

type R2ObjectBodyLike = {
  body: ReadableStream
  httpEtag?: string
  httpMetadata?: {
    contentType?: string
    cacheControl?: string
  }
  writeHttpMetadata?: (headers: Headers) => void
}

type R2BucketLike = {
  get: (key: string) => Promise<R2ObjectBodyLike | null>
}

type FrontEndAssetsWorkerEnv = {
  KR_PUBLIC_SITE_ASSETS: R2BucketLike
}

type ResolvedAsset = {
  image: KRFrontEndAssetImageRecord
  object: R2ObjectBodyLike
  keyUsed: string
  fallback: boolean
}

const DEFAULT_ASSET_ID = 'krueger-richard-banner-default'
const ASSET_ROUTE_PREFIX = '/assets'
const ONE_HOUR_CACHE = 'public, max-age=3600'
const MANIFEST_CACHE = 'public, max-age=300'
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

export default {
  async fetch(request: Request, env: FrontEndAssetsWorkerEnv): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)
    }

    const url = new URL(request.url)
    const pathname = normalizePath(url.pathname)

    if (pathname === '/healthz') {
      return jsonResponse({ ok: true, worker: 'kr-public-site-front-end-assets' })
    }

    if (pathname === '/') {
      return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404)
    }

    if (pathname === '/manifest.json' || pathname === '/assets/manifest.json') {
      return manifestResponse(request)
    }

    if (!pathname.startsWith(`${ASSET_ROUTE_PREFIX}/`)) {
      return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404)
    }

    const requested = resolveRequestedAsset(pathname)

    if (!requested.assetId) {
      return jsonResponse({ ok: false, error: 'ASSET_ID_REQUIRED' }, 400)
    }

    const image = getKRFrontEndAssetImageById(requested.assetId)

    if (!image || (requested.category && requested.category !== image.publicCategory)) {
      return handleMissingAsset(request, env, requested.assetId)
    }

    const resolved = await resolveR2Asset(env, image, false)

    if (!resolved) {
      return handleMissingAsset(request, env, requested.assetId)
    }

    return assetResponse(request, resolved)
  },
}

function resolveRequestedAsset(pathname: string): { category: string | null; assetId: string | null } {
  const parts = pathname
    .slice(ASSET_ROUTE_PREFIX.length)
    .split('/')
    .map((part) => decodeURIComponent(part.trim()))
    .filter(Boolean)

  if (parts.length === 0) return { category: null, assetId: null }

  if (parts.length === 1) {
    return { category: null, assetId: normalizeAssetId(parts[0]) }
  }

  return {
    category: parts[0].toLowerCase(),
    assetId: normalizeAssetId(parts[parts.length - 1]),
  }
}

function normalizeAssetId(value: string): string {
  return value
    .replace(/\.(jpg|jpeg|png|webp)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) return normalized.slice(0, -1)
  return normalized
}

async function handleMissingAsset(
  request: Request,
  env: FrontEndAssetsWorkerEnv,
  requestedAssetId: string,
): Promise<Response> {
  const url = new URL(request.url)
  const wantsStrict404 = url.searchParams.get('fallback') === '0' || url.searchParams.get('strict') === '1'

  if (wantsStrict404) {
    return jsonResponse({ ok: false, error: 'ASSET_NOT_FOUND', requestedAssetId }, 404)
  }

  const fallbackImage = getKRFrontEndAssetImageById(DEFAULT_ASSET_ID)

  if (!fallbackImage) {
    return jsonResponse({ ok: false, error: 'FALLBACK_ASSET_NOT_CONFIGURED', requestedAssetId }, 404)
  }

  const resolvedFallback = await resolveR2Asset(env, fallbackImage, true)

  if (!resolvedFallback) {
    return jsonResponse({
      ok: false,
      error: 'ASSET_NOT_FOUND_AND_FALLBACK_MISSING',
      requestedAssetId,
      fallbackAssetId: DEFAULT_ASSET_ID,
    }, 404)
  }

  return assetResponse(request, resolvedFallback, requestedAssetId)
}

async function resolveR2Asset(
  env: FrontEndAssetsWorkerEnv,
  image: KRFrontEndAssetImageRecord,
  fallback: boolean,
): Promise<ResolvedAsset | null> {
  const candidateKeys = getCandidateR2Keys(image)

  for (const key of candidateKeys) {
    const object = await env.KR_PUBLIC_SITE_ASSETS.get(key)

    if (object) {
      return { image, object, keyUsed: key, fallback }
    }
  }

  return null
}

function getCandidateR2Keys(image: KRFrontEndAssetImageRecord): string[] {
  return uniqueStrings([
    image.r2Key,
    `front-end-assets/${image.filename}`,
    image.filename,
  ])
}

function assetResponse(
  request: Request,
  resolved: ResolvedAsset,
  requestedAssetId?: string,
): Response {
  const headers = new Headers()
  resolved.object.writeHttpMetadata?.(headers)
  headers.set('Content-Type', headers.get('Content-Type') || contentTypeForExtension(resolved.image.extension))
  headers.set('Cache-Control', resolved.object.httpMetadata?.cacheControl || ONE_HOUR_CACHE)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('X-KR-Asset-Id', resolved.image.id)
  headers.set('X-KR-Asset-Category', resolved.image.publicCategory)
  headers.set('X-KR-R2-Key-Used', resolved.keyUsed)

  if (resolved.object.httpEtag) headers.set('ETag', resolved.object.httpEtag)

  if (resolved.fallback) {
    headers.set('Cache-Control', 'no-store')
    headers.set('X-KR-Asset-Fallback', '1')
    if (requestedAssetId) headers.set('X-KR-Requested-Asset-Id', requestedAssetId)
  }

  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })

  return new Response(resolved.object.body, { status: 200, headers })
}

function manifestResponse(request: Request): Response {
  const url = new URL(request.url)
  const includeKeys = url.searchParams.get('keys') === '1'
  const categories = Object.entries(KR_FRONT_END_ASSET_IMAGE_CATEGORIES).map(([id, category]) => ({
    id,
    ...category,
  }))

  return new Response(
    JSON.stringify({
      ok: true,
      worker: 'kr-public-site-front-end-assets',
      assetCount: KR_FRONT_END_ASSET_IMAGES.length,
      defaultAssetId: DEFAULT_ASSET_ID,
      categories,
      assets: KR_FRONT_END_ASSET_IMAGES.map((image) => {
        const record: KRFrontEndAssetImageRecord = image

        return {
          id: record.id,
          filename: record.filename,
          familyId: record.familyId,
          category: record.category,
          publicCategory: record.publicCategory,
          label: record.label,
          bytes: record.bytes,
          extension: record.extension,
          width: record.width ?? null,
          height: record.height ?? null,
          variant: record.variant,
          status: record.status,
          publicPath: `${KR_FRONT_END_ASSET_IMAGE_CATEGORIES[record.publicCategory].publicPathPrefix}/${record.id}`,
          ...(includeKeys ? { r2Key: record.r2Key, fallbackKeys: getCandidateR2Keys(record) } : {}),
        }
      }),
      allowListIds: Object.keys(KR_FRONT_END_ASSET_IMAGE_ALLOW_LIST),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': MANIFEST_CACHE,
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function contentTypeForExtension(extension: KRFrontEndAssetImageRecord['extension']): string {
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}
