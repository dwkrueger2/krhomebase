// file: apps/external-api/src/gateway.ts
/**
 * The forwarding rules of `krhomebase-external-api`, kept apart from `index.ts` so the tests can run them
 * without Cloudflare.
 *
 * A request from an outside tool server goes through these stages:
 *  1. **Shape.** Only `/v1/...` paths and the methods GET, POST, PUT, PATCH and DELETE pass. A body larger
 *     than 1 MB is refused (413). Anything else is 404 or 405.
 *  2. **Rate.** One count per call against the `TOOL_RATE_LIMITER` binding. The key is a hash of the bearer
 *     token, or the caller's address when there is no token (the token request). Over the limit: 429.
 *  3. **Headers.** Only `accept`, `content-type`, `authorization`, `user-agent` and `x-request-id` are passed
 *     on. Cookies never are, so a browser session can never be used through this door. The Worker adds
 *     `x-kr-gateway: external-api` (the API accepts bearer tokens only with it) and the caller's address
 *     (`cf-connecting-ip`, set by Cloudflare), which the API checks against the tool's address list.
 *  4. **Forward.** The request goes to `krhomebase-api` through the `API` service binding. The API checks the
 *     token, the tool and the route's permission; this Worker does not.
 *  5. **Reply.** The API's reply is returned without any `Set-Cookie` header and with `Cache-Control: no-store`.
 *
 * Refusals made here use the API's reply envelope: `{ ok: false, error: { code, message }, requestId }`,
 * with codes `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED` and `API_UNAVAILABLE`.
 */

import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE } from '@krhomebase/contracts'

/** The part of Cloudflare's rate-limiting binding this Worker uses. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** Bindings this Worker reads. Declared in `kr-external-api-wrangler.jsonc`. */
export interface GatewayEnv {
  /** Service binding to `krhomebase-api`. */
  API: Fetcher
  /** Rate limit per token or address. When absent (some local runs), no limit is applied. */
  TOOL_RATE_LIMITER?: RateLimiter
}

/** Largest request body passed on, in bytes. */
export const MAX_BODY_BYTES = 1_000_000

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const FORWARDED_HEADERS = ['accept', 'content-type', 'authorization', 'user-agent', 'x-request-id']
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

/** A refusal in the API's envelope, with the request id in the body and the header. */
function refuse(status: number, code: string, message: string, requestId: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message }, requestId }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId, ...extraHeaders },
  })
}

/** SHA-256 of the text, as hex. Used so the rate-limit key never holds the token itself. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Handles one request from an outside tool server.
 *
 * @param request - The incoming request.
 * @param env - The `API` service binding and the optional rate limiter.
 * @returns The API's reply (cookies removed), or a refusal made here.
 */
export async function handleGatewayRequest(request: Request, env: GatewayEnv): Promise<Response> {
  const incomingId = request.headers.get('x-request-id')
  const requestId = incomingId && SAFE_REQUEST_ID.test(incomingId) ? incomingId : crypto.randomUUID()
  const url = new URL(request.url)

  // Stage 1: shape.
  if (!url.pathname.startsWith('/v1/')) return refuse(404, 'NOT_FOUND', 'Only /v1/ routes are served here.', requestId)
  if (!ALLOWED_METHODS.has(request.method)) return refuse(405, 'METHOD_NOT_ALLOWED', 'This method is not allowed.', requestId, { allow: [...ALLOWED_METHODS].join(', ') })
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return refuse(413, 'PAYLOAD_TOO_LARGE', 'The request body is larger than 1 MB.', requestId)

  // Stage 2: rate.
  const authorization = request.headers.get('authorization')
  const ip = request.headers.get('cf-connecting-ip')
  if (env.TOOL_RATE_LIMITER) {
    const key = authorization ? `token:${(await sha256Hex(authorization)).slice(0, 32)}` : `ip:${ip ?? 'unknown'}`
    const { success } = await env.TOOL_RATE_LIMITER.limit({ key })
    if (!success) return refuse(429, 'RATE_LIMITED', 'Too many calls. Wait a minute and try again.', requestId, { 'retry-after': '60' })
  }

  // Stage 3: headers.
  const headers = new Headers()
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('x-request-id', requestId)
  headers.set(TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE)
  if (ip) headers.set('cf-connecting-ip', ip)

  // Stage 4: forward.
  const hasBody = request.method !== 'GET'
  let reply: Response
  try {
    reply = await env.API.fetch(
      new Request(`https://api.internal${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
        redirect: 'manual',
      }),
    )
  } catch {
    return refuse(502, 'API_UNAVAILABLE', 'The API could not be reached.', requestId)
  }

  // Stage 5: reply without cookies.
  const outHeaders = new Headers(reply.headers)
  outHeaders.delete('set-cookie')
  outHeaders.set('cache-control', 'no-store')
  return new Response(reply.body, { status: reply.status, headers: outHeaders })
}
