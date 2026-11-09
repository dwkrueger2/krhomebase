// file: packages/tool-sdk/src/server.ts
/**
 * The server side of an outside tool (path B): a small client for the tool's own server, for work that runs
 * without a person in front of it, such as a nightly sync.
 *
 * It trades the tool's client id and client secret for a 15-minute access token (`POST /v1/tools/token`),
 * keeps the token until a minute before it ends, and sends it as `Authorization: Bearer <token>` on every
 * call. When KR Homebase says the token has ended, it gets a new one and tries the call once more.
 *
 * Keep the client secret on the server, in a secret store or environment setting. Never put it in browser
 * code, a frame page or a code repository.
 *
 *   import { createServerClient } from '@krhomebase/tool-sdk/server'
 *   const kr = createServerClient({ baseUrl: 'https://<external API address>', clientId, clientSecret })
 *   const who = await kr.get('/v1/tools/context')
 */

import { isAllowedApiPath } from './protocol.ts'
import type { ApiReply, HttpMethod, TokenReply, ToolScopeName } from './types.ts'

export interface ServerClientOptions {
  /** The KR Homebase external API address the super admin gave you, for example `https://tools-api.krhomebase.com`. */
  baseUrl: string
  /** The tool's client id (`krt_...`). */
  clientId: string
  /** The tool's client secret (`krts_...`). Shown once to the super admin; keep it secret. */
  clientSecret: string
  /** Ask for fewer permissions than were granted. Left out, the token carries every granted permission. */
  scopes?: ToolScopeName[]
  /** Seconds before the token ends at which a new one is fetched. Default 60. */
  refreshMarginSeconds?: number
  /** A `fetch` to use instead of the global one (for tests or a custom agent). */
  fetch?: typeof fetch
}

export interface ServerClient {
  request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<ApiReply<T>>
  get<T = unknown>(path: string): Promise<ApiReply<T>>
  post<T = unknown>(path: string, body?: unknown): Promise<ApiReply<T>>
  put<T = unknown>(path: string, body?: unknown): Promise<ApiReply<T>>
  patch<T = unknown>(path: string, body?: unknown): Promise<ApiReply<T>>
  delete<T = unknown>(path: string): Promise<ApiReply<T>>
  /** The current access token, fetching one when needed. Rarely needed directly. */
  getAccessToken(): Promise<string>
  /** Forget the cached token, so the next call fetches a new one. */
  clearToken(): void
}

/** Reads a fetch `Response` as an `ApiReply`. */
async function readReply<T>(response: Response): Promise<ApiReply<T>> {
  const body = (await response.json().catch(() => null)) as { ok?: unknown; data?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown }; requestId?: unknown } | null
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  if (body?.ok === true) return { ok: true, data: body.data as T, requestId, status: response.status }
  if (body?.ok === false && typeof body.error?.code === 'string') {
    return { ok: false, error: { code: body.error.code, message: String(body.error.message ?? ''), details: body.error.details }, requestId, status: response.status }
  }
  return { ok: false, error: { code: 'BAD_REPLY', message: `Not a KR Homebase API reply (HTTP ${response.status}).` }, requestId, status: response.status }
}

/**
 * Makes a client for the tool's server.
 *
 * @param options - Address, client id, client secret and optional settings.
 * @returns The client. Nothing is fetched until the first call.
 */
export function createServerClient(options: ServerClientOptions): ServerClient {
  const base = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? fetch
  const margin = (options.refreshMarginSeconds ?? 60) * 1000
  let cached: { token: string; until: number } | null = null
  let inFlight: Promise<string> | null = null

  async function fetchToken(): Promise<string> {
    const response = await doFetch(`${base}/v1/tools/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ grantType: 'client_credentials', clientId: options.clientId, clientSecret: options.clientSecret, ...(options.scopes ? { scopes: options.scopes } : {}) }),
    })
    const reply = await readReply<TokenReply>(response)
    if (!reply.ok) throw new Error(`TOKEN_REFUSED: ${reply.error.code} ${reply.error.message} (requestId ${reply.requestId})`)
    cached = { token: reply.data.accessToken, until: Date.now() + reply.data.expiresIn * 1000 - margin }
    return reply.data.accessToken
  }

  async function getAccessToken(): Promise<string> {
    if (cached && cached.until > Date.now()) return cached.token
    // One token request at a time, however many calls are waiting.
    inFlight ??= fetchToken().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function send<T>(method: HttpMethod, path: string, body: unknown, token: string): Promise<ApiReply<T>> {
    const response = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return readReply<T>(response)
  }

  async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<ApiReply<T>> {
    if (!isAllowedApiPath(path)) return { ok: false, error: { code: 'BAD_PATH', message: 'API paths start with /v1/ and may not contain .., // or \\.' }, requestId: '', status: 0 }
    const first = await send<T>(method, path, body, await getAccessToken())
    // A token can end between the check above and the call; get a new one and try once more.
    if (!first.ok && first.error.code === 'TOOL_TOKEN_INVALID') {
      cached = null
      return send<T>(method, path, body, await getAccessToken())
    }
    return first
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    getAccessToken,
    clearToken: () => {
      cached = null
    },
  }
}
