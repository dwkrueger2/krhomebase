// file: apps/sandbox-api/src/sandbox.ts
/**
 * The rules of `krhomebase-sandbox-api`, kept apart from `index.ts` so the tests run them without Cloudflare.
 *
 * Addresses:
 *   GET  /                       the host page: opens a frame tool against the sample data (`hostPage.ts`)
 *   GET  /health-check           `{ status, version, protocol, meta }`: the API track this Worker was built from
 *   POST /sandbox/frame-token    the host page trades the sandbox secret for a frame token (sandbox only)
 *   POST /v1/tools/token         a tool server trades its client id and sandbox secret for a server token
 *   *    /v1/...                 every route open to outside tools (`routes.ts`), answered from `sampleWorld.ts`
 *
 * Checks, in the API's order and with its refusal codes and reasons (`apps/api/src/platform/authGuard.ts`):
 *  1. The route exists here (only routes open to tools do): else 404 `NOT_FOUND`.
 *  2. A frame-only route called by a server token: 403 `TOOL_FORBIDDEN`, `tool_channel_not_allowed`.
 *  3. A bearer token, signed by this sandbox and not ended: else 401 `TOOL_TOKEN_INVALID` (`token_missing`,
 *     `token_invalid`, `token_expired`).
 *  4. The token carries the route's permission: else 403 `TOOL_FORBIDDEN`, `scope_not_granted`, `needs`.
 *  5. The path parameters and the body match the contract: else 422 `VALIDATION_FAILED` with the issues.
 *
 * Every reply carries `x-kr-sandbox` and `cache-control: no-store`; a reply never sets a cookie. The Worker has no
 * database, bucket, key store or service binding, so it cannot reach firm data (`isolation.test.ts`).
 */

import { TOOL_SANDBOX_HEADER, ToolTokenBody } from '@krhomebase/contracts'
import { z } from 'zod'
import apiPackage from '../../api/package.json'
import { hostPageResponse } from './hostPage.ts'
import { matchRoute, type SandboxAnswer, type SandboxChannel } from './routes.ts'
import { checkSandboxSecret, checkSandboxToken, makeSandboxToken, type SandboxCheckFailure } from './signing.ts'

/** Bindings this Worker reads. Declared in `kr-sandbox-api-wrangler.jsonc`; the secret is set with `wrangler secret put`. */
export interface SandboxEnv {
  /** The HMAC key shared with `krhomebase-api`, which signs the sandbox secrets. Without it every call is refused (503). */
  KR_TOOL_SANDBOX_SECRET?: string
  /** Cloudflare's record of the deployed version, for the health route. */
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string }
}

/** The API track this Worker belongs to (`AGENTS_01`), read from `apps/api/package.json` when it is bundled. */
export const SANDBOX_TRACK = { version: String(apiPackage.version), patchNum: String(apiPackage.patchNum), patchDate: String(apiPackage.patchDate) }

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/
const MAX_BODY_BYTES = 1_000_000
const FrameTokenBody = z.object({ clientId: ToolTokenBody.shape.clientId, clientSecret: ToolTokenBody.shape.clientSecret })

const COMMON_HEADERS = { 'cache-control': 'no-store', [TOOL_SANDBOX_HEADER]: 'sample data; nothing is saved', 'x-content-type-options': 'nosniff' }

function json(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': requestId, ...COMMON_HEADERS } })
}
const success = (status: number, data: unknown, requestId: string) => json(status, { ok: true, data, requestId }, requestId)
const failure = (status: number, code: string, message: string, requestId: string, details?: unknown) =>
  json(status, { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) }, requestId }, requestId)

const TOKEN_WORDS: Record<SandboxCheckFailure, string> = {
  token_invalid: 'The access token is not valid.',
  token_expired: 'The access token has ended. Ask for a new one.',
  secret_invalid: 'Unknown client id or wrong sandbox secret.',
  secret_expired: 'This sandbox secret has ended. Ask the super admin for a new one.',
  sandbox_secret_outdated: 'This sandbox secret was made for an older list of permissions. Ask the super admin for a new one.',
}

/** Reads a JSON body: undefined when there is none, or a refusal when it is not JSON or too large. */
async function readBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number; code: string; message: string }> {
  if (request.method === 'GET') return { ok: true, value: undefined }
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is larger than 1 MB.' }
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is larger than 1 MB.' }
  if (!text.trim()) return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 422, code: 'VALIDATION_FAILED', message: 'The request body is not JSON.' }
  }
}

/** The health answer: the kit's shape (`status`, `version`) and the pay Worker's `meta`, which the IT Overview reads. */
function healthResponse(env: SandboxEnv, requestId: string): Response {
  const version = `${SANDBOX_TRACK.version} p${SANDBOX_TRACK.patchNum} (${SANDBOX_TRACK.patchDate})`
  return json(
    200,
    {
      status: 'ok',
      version,
      protocol: 1,
      service: 'krhomebase-sandbox-api',
      meta: { worker: 'krhomebase-sandbox-api', track: 'api', ...SANDBOX_TRACK, deploymentId: env.CF_VERSION_METADATA?.id ?? null, deployedAt: env.CF_VERSION_METADATA?.timestamp ?? null },
    },
    requestId,
  )
}

/** Sends a route's answer. */
function reply(answer: SandboxAnswer, requestId: string): Response {
  if (answer.kind === 'data') return success(answer.status, answer.data, requestId)
  if (answer.kind === 'error') return failure(answer.status, answer.code, answer.message, requestId, answer.details)
  return new Response(answer.body, { status: 200, headers: { 'content-type': answer.contentType, 'content-disposition': 'inline', 'x-request-id': requestId, ...COMMON_HEADERS } })
}

/**
 * Handles one request to the sandbox.
 *
 * @param request - The incoming request.
 * @param env - The signing secret and the version binding.
 * @param nowMs - The time (milliseconds since 1970); tests pass a fixed one.
 * @returns The reply. Never throws.
 */
export async function handleSandboxRequest(request: Request, env: SandboxEnv, nowMs: number = Date.now()): Promise<Response> {
  const incomingId = request.headers.get('x-request-id')
  const requestId = incomingId && SAFE_REQUEST_ID.test(incomingId) ? incomingId : crypto.randomUUID()
  const url = new URL(request.url)
  const nowSeconds = Math.floor(nowMs / 1000)

  try {
    if (request.method === 'GET' && url.pathname === '/') return await hostPageResponse(`${SANDBOX_TRACK.version} p${SANDBOX_TRACK.patchNum}`)
    if (request.method === 'GET' && url.pathname === '/health-check') return healthResponse(env, requestId)

    const key = env.KR_TOOL_SANDBOX_SECRET?.trim()
    const isFrameToken = request.method === 'POST' && url.pathname === '/sandbox/frame-token'
    const found = isFrameToken ? null : matchRoute(request.method, url.pathname)
    if (!isFrameToken && !found) return failure(404, 'NOT_FOUND', 'The sandbox answers only the routes KR Homebase opens to outside tools.', requestId)
    if (!key) return failure(503, 'TOOLS_UNAVAILABLE', 'The sandbox is not set up yet (it has no signing secret).', requestId)

    const body = await readBody(request)
    if (!body.ok) return failure(body.status, body.code, body.message, requestId)

    // The frame token (host page) and the server token (POST /v1/tools/token): a sandbox secret for a token.
    if (isFrameToken || found?.route.isTokenRoute) {
      const parsed = (isFrameToken ? FrameTokenBody : ToolTokenBody).safeParse(body.value)
      if (!parsed.success) return failure(422, 'VALIDATION_FAILED', 'The request did not match the contract.', requestId, parsed.error.issues)
      const { clientId, clientSecret } = parsed.data
      const checked = await checkSandboxSecret(key, clientId, clientSecret, nowSeconds)
      if (!checked.ok) return failure(401, 'TOOL_TOKEN_INVALID', TOKEN_WORDS[checked.reason], requestId, { reason: checked.reason === 'secret_expired' || checked.reason === 'sandbox_secret_outdated' ? checked.reason : 'secret_invalid' })
      // As in KR Homebase: a frame needs a permitted person; an empty permitted-user list lets nobody in.
      if (isFrameToken && !checked.grant.hasUsers) {
        return failure(403, 'TOOL_FORBIDDEN', 'Nobody is permitted to use this tool: its permitted-user list is empty.', requestId, { reason: 'user_not_allowed' })
      }
      const requested = isFrameToken ? undefined : (parsed.data as z.infer<typeof ToolTokenBody>).scopes
      if (requested?.some((scope) => !checked.grant.scopes.includes(scope))) {
        return failure(403, 'TOOL_FORBIDDEN', 'A requested permission was not granted to this tool.', requestId, { reason: 'scope_not_granted' })
      }
      const grant = requested ? { ...checked.grant, scopes: [...new Set(requested)] } : checked.grant
      const channel: SandboxChannel = isFrameToken ? 'frame' : 'server'
      const made = await makeSandboxToken(key, clientId, grant, channel, nowSeconds)
      console.log(`[SANDBOX_TOKEN:124] issued requestId=${requestId} clientId=${clientId} channel=${channel} secretId=${checked.secretId}`)
      return success(200, { accessToken: made.token, tokenType: 'Bearer', expiresIn: made.expiresIn, scopes: grant.scopes }, requestId)
    }

    const { route, params } = found!
    const authorization = request.headers.get('authorization') ?? ''
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
    if (!token) return failure(401, 'TOOL_TOKEN_INVALID', 'Send Authorization: Bearer <access token>.', requestId, { reason: 'token_missing' })
    const caller = await checkSandboxToken(key, token, nowSeconds)
    if (!caller.ok) return failure(401, 'TOOL_TOKEN_INVALID', TOKEN_WORDS[caller.reason], requestId, { reason: caller.reason === 'token_expired' ? 'token_expired' : 'token_invalid' })
    if (route.channels && !route.channels.includes(caller.channel)) {
      const message = caller.channel === 'server' ? 'This route is available to outside tools in the signed-in frame only.' : 'This route is not available to outside tools in the signed-in frame.'
      return failure(403, 'TOOL_FORBIDDEN', message, requestId, { reason: 'tool_channel_not_allowed', availableChannels: route.channels })
    }
    if (route.access !== 'any' && !caller.grant.scopes.includes(route.access)) {
      return failure(403, 'TOOL_FORBIDDEN', 'This tool lacks the permission this route needs.', requestId, { reason: 'scope_not_granted', needs: route.access })
    }
    if (route.params) {
      const checked = route.params.safeParse(params)
      if (!checked.success) return failure(422, 'VALIDATION_FAILED', 'The request did not match the contract.', requestId, checked.error.issues)
    }
    let value = body.value
    if (route.body) {
      const checked = route.body.safeParse(body.value)
      if (!checked.success) return failure(422, 'VALIDATION_FAILED', 'The request did not match the contract.', requestId, checked.error.issues)
      value = checked.data
    }
    const answer = route.answer({ params, query: url.searchParams, body: value, channel: caller.channel, clientId: caller.clientId, grant: caller.grant })
    console.log(`[SANDBOX_CALL:154] requestId=${requestId} clientId=${caller.clientId} channel=${caller.channel} ${route.method} ${route.path} status=${answer.status}`)
    return reply(answer, requestId)
  } catch (error) {
    console.error(`[SANDBOX:157] failed requestId=${requestId} error=${error instanceof Error ? error.message.slice(0, 120) : 'unknown'}`)
    return failure(500, 'INTERNAL_ERROR', 'The sandbox could not answer.', requestId)
  }
}
