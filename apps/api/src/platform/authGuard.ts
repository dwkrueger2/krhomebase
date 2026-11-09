// file: apps/api/src/platform/authGuard.ts
/**
 * The sign-in middleware. It runs before every route and enforces the `access` each route declared with
 * `defineRoute()`:
 *
 *  - `'public'`: nothing to check; `session` is set to null.
 *  - `'signed-in'`: the request must carry a live session cookie, else 401 `UNAUTHENTICATED`.
 *  - `{ roles }`: as above, and the session's role must be listed, else 403 `FORBIDDEN`.
 *  - `permission` (optional, any non-public route): after the role check, the person's role sets must grant
 *    `<resource>.<action>`, else 403 `PERMISSION_REQUIRED` (see `permissionDenied`).
 *
 * A route is found by matching the request's method and matched path against `routeRegistry`. A route that
 * is not in the registry cannot exist (every route is declared with `defineRoute()`), and an unknown
 * address falls through to the not-found reply.
 *
 * The cookie token is checked with the Session Worker (`sessionClient.ts`). When that check cannot be made
 * (worker down, secret wrong), the reply is 503 `SESSION_VALIDATION_UNAVAILABLE`, not 401, so a broken
 * deployment is not mistaken for a signed-out person.
 *
 * Outside tools (docs/05_Outside_Tools.md) add two more checks, both against the route's `toolAccess`:
 *
 *  - **Frame call (path A):** the request carries the header `x-kr-tool-id` as well as the session cookie.
 *    After the session check, the tool must exist and be active, the person's role must be on the tool's
 *    list, and the route must be open to the tool (`toolAccess`). Refusals are 403 `TOOL_FORBIDDEN`.
 *  - **Server call (path B):** the request arrived through `krhomebase-external-api` (header
 *    `x-kr-gateway: external-api`, which the web app strips from browser requests). No cookie is read. A
 *    route that is not public needs `Authorization: Bearer <token>` from `POST /v1/tools/token`; a missing,
 *    unknown or expired token is 401 `TOOL_TOKEN_INVALID`. The tool must be active with the server path on,
 *    the caller's address must be on the tool's list (when it has one), and the token must carry the route's
 *    permission. A route without `toolAccess` refuses every server call, public or not.
 *
 * Every tool call is written to `workspace_tool_audit` after the route answers (method, path, status, no bodies).
 * When the database binding is missing, tool calls get 503 `TOOLS_UNAVAILABLE`.
 */

import type { Context, MiddlewareHandler, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE, TOOL_ID_HEADER, type RoutePermission, type SessionUser } from '@krhomebase/contracts'
import { accessAllows } from '../features/auth/rules.ts'
import { permissionQueriesFor } from '../features/permissions/queries.ts'
import { isAuthorized } from '../features/permissions/rules.ts'
import { toolQueriesFor, type ToolQueries } from '../features/tools/queries.ts'
import { bearerToken, hashToolSecret, ipAllowed, scopeAllows, toolUsableBy, type ToolCaller } from '../features/tools/rules.ts'
import { routeRegistry, type RouteMeta } from './defineRoute.ts'
import { failure } from './envelope.ts'
import { logLine } from './log.ts'
import { readAuthSettings } from './settings.ts'
import { validateSession } from './sessionClient.ts'
import type { AppEnv } from './types.ts'

/** The visitor's address, from the headers Cloudflare sets. Used only as a hash. */
export function clientIp(headers: Headers): string | null {
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

/** The paths Hono matched for this request (the route patterns, not the URL). */
export function matchedPathsOf(c: Context<AppEnv>): string[] {
  return c.req.matchedRoutes.filter((r) => r.method !== 'ALL').map((r) => r.path)
}

/** Finds the declared facts (`access`, `toolAccess`, `permission`) for the route that matched this request, or null when none matched. */
export function declaredRoute(method: string, matchedPaths: string[]): RouteMeta | null {
  const wanted = method.toLowerCase() === 'head' ? 'get' : method.toLowerCase()
  for (const path of matchedPaths) {
    const normalized = path.replace(/:([A-Za-z]+)/g, '{$1}')
    const found = routeRegistry.find((r) => r.config.method === wanted && r.config.path.replace(/:([A-Za-z]+)/g, '{$1}') === normalized)
    if (found) return found.meta
  }
  return null
}

/** Records one tool call after the route answered. Never throws: a failed audit write is logged, not shown. */
async function auditToolCall(c: Context<AppEnv>, queries: ToolQueries, tool: ToolCaller, userId: string | null): Promise<void> {
  try {
    await queries.insertAudit({
      id: crypto.randomUUID(),
      toolId: tool.toolId,
      channel: tool.channel,
      userId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      requestId: c.get('requestId'),
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    logLine('TOOL_AUDIT:write_failed', c.get('requestId'), { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
  }
}

/**
 * Path B: a request forwarded by `krhomebase-external-api` for a tool server. Checks the bearer token and
 * the route's `toolAccess`; never reads a cookie.
 */
async function serverToolGate(c: Context<AppEnv>, next: Next, route: RouteMeta | null) {
  const requestId = c.get('requestId')
  if (!route) return next()
  const open = scopeAllows(route.toolAccess, [])
  if (!open.ok && open.reason === 'route_not_open_to_tools') {
    return failure(c, 403, 'TOOL_FORBIDDEN', 'This route is not open to outside tools.', { reason: open.reason })
  }
  // The token route is public: it is where the token comes from.
  if (route.access === 'public') return next()

  const token = bearerToken(c.req.header('authorization'))
  if (!token) return failure(c, 401, 'TOOL_TOKEN_INVALID', 'Send Authorization: Bearer <access token>.', { reason: 'token_missing' })
  const queries = toolQueriesFor(c.env)
  if (!queries) return failure(c, 503, 'TOOLS_UNAVAILABLE', 'Outside tools are not available right now.')

  const stored = await queries.findToken(await hashToolSecret(token))
  if (!stored) return failure(c, 401, 'TOOL_TOKEN_INVALID', 'The access token is not valid.', { reason: 'token_invalid' })
  if (new Date(stored.expiresAt).getTime() <= Date.now()) {
    return failure(c, 401, 'TOOL_TOKEN_INVALID', 'The access token has ended. Ask for a new one.', { reason: 'token_expired' })
  }
  const tool = await queries.findToolById(stored.toolId)
  if (!tool) return failure(c, 401, 'TOOL_TOKEN_INVALID', 'The access token is not valid.', { reason: 'token_invalid' })
  if (tool.status !== 'active') return failure(c, 403, 'TOOL_FORBIDDEN', 'This tool is turned off.', { reason: 'tool_disabled' })
  if (!tool.serverAccessEnabled) return failure(c, 403, 'TOOL_FORBIDDEN', 'Server access is turned off for this tool.', { reason: 'server_access_disabled' })
  if (!ipAllowed(tool.serverIpAllowlist, clientIp(c.req.raw.headers))) {
    return failure(c, 403, 'TOOL_FORBIDDEN', 'This address may not call for this tool.', { reason: 'ip_not_allowed' })
  }
  const allowed = scopeAllows(route.toolAccess, stored.scopes)
  if (!allowed.ok) return failure(c, 403, 'TOOL_FORBIDDEN', 'The access token lacks the permission this route needs.', { reason: allowed.reason, needs: route.toolAccess })

  const caller: ToolCaller = { toolId: tool.id, clientId: tool.clientId, label: tool.label, channel: 'server', scopes: stored.scopes }
  c.set('tool', caller)
  logLine('TOOL_GATE:server_allowed', requestId, { clientId: tool.clientId, path: c.req.path })
  await next()
  await auditToolCall(c, queries, caller, null)
}

/**
 * Path A: a browser call the host page made for a tool in a frame. The session was already checked; this
 * adds the tool's role list and permissions.
 */
async function frameToolGate(c: Context<AppEnv>, next: Next, route: RouteMeta, session: SessionUser, clientId: string) {
  const queries = toolQueriesFor(c.env)
  if (!queries) return failure(c, 503, 'TOOLS_UNAVAILABLE', 'Outside tools are not available right now.')
  const tool = await queries.findToolByClientId(clientId)
  if (!tool) return failure(c, 403, 'TOOL_FORBIDDEN', 'No such tool.', { reason: 'tool_unknown' })
  if (tool.status !== 'active') return failure(c, 403, 'TOOL_FORBIDDEN', 'This tool is turned off.', { reason: 'tool_disabled' })
  if (!toolUsableBy(tool, session)) return failure(c, 403, 'TOOL_FORBIDDEN', 'Your role may not use this tool.', { reason: 'role_not_allowed' })
  const allowed = scopeAllows(route.toolAccess, tool.scopes)
  if (!allowed.ok) return failure(c, 403, 'TOOL_FORBIDDEN', 'This tool lacks the permission this route needs.', { reason: allowed.reason, needs: route.toolAccess ?? null })

  const caller: ToolCaller = { toolId: tool.id, clientId: tool.clientId, label: tool.label, channel: 'frame', scopes: tool.scopes }
  c.set('tool', caller)
  await next()
  await auditToolCall(c, queries, caller, session.userId)
}

/**
 * The fine-grained check (`permission` in `defineRoute()`), after the role check. Uses the person's role sets
 * and overrides (features/permissions). 403 `PERMISSION_REQUIRED` names the missing key; 503
 * `PERMISSIONS_UNAVAILABLE` when the database cannot be read. A server call from an outside tool has no
 * person, so this check does not apply to it: the tool's own permissions (`toolAccess`) decide.
 */
async function permissionDenied(c: Context<AppEnv>, permission: RoutePermission, userId: string): Promise<Response | null> {
  const queries = permissionQueriesFor(c.env)
  if (!queries) return failure(c, 503, 'PERMISSIONS_UNAVAILABLE', 'Permission checks are not available right now.')
  try {
    if (await isAuthorized(queries, userId, permission.resource, permission.action)) return null
  } catch (error) {
    logLine('AUTH_GUARD:permission_check_failed', c.get('requestId'), { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
    return failure(c, 503, 'PERMISSIONS_UNAVAILABLE', 'Permission checks are not available right now.')
  }
  const key = `${permission.resource}.${permission.action}`
  logLine('AUTH_GUARD:permission_denied', c.get('requestId'), { permission: key })
  return failure(c, 403, 'PERMISSION_REQUIRED', `You need the ${key} permission.`, { permission: key })
}

export const signInGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('session', null)
  c.set('tool', null)
  const route = declaredRoute(c.req.method, matchedPathsOf(c))
  // Path B: forwarded by external-api for a tool server. Never falls back to the cookie.
  if (c.req.header(TOOL_GATEWAY_HEADER) === TOOL_GATEWAY_VALUE) return serverToolGate(c, next, route)

  const access = route?.access
  const toolClientId = c.req.header(TOOL_ID_HEADER)?.trim()
  if (!route || !access || access === 'public') {
    // A frame call to a public route is still limited to routes open to tools.
    if (route && toolClientId && !route.toolAccess) {
      return failure(c, 403, 'TOOL_FORBIDDEN', 'This route is not open to outside tools.', { reason: 'route_not_open_to_tools' })
    }
    return next()
  }

  const requestId = c.get('requestId')
  const settings = readAuthSettings(c.env)
  // Cookie name is a plain setting; read it without needing every other setting to be present.
  const cookieName = settings.ok ? settings.settings.sessionCookieName : (c.env?.KR_SESSION_COOKIE_NAME?.trim() || 'kr_session')
  const token = getCookie(c, cookieName)
  if (!token) return failure(c, 401, 'UNAUTHENTICATED', 'Sign in to continue.', { reason: 'missing_session_cookie' })

  if (!c.env?.SESSION_WORKER || !c.env.KR_SESSION_WORKER_SECRET) {
    logLine('AUTH_GUARD:not_configured', requestId)
    return failure(c, 503, 'SESSION_VALIDATION_UNAVAILABLE', 'Sign-in checks are not available right now.')
  }

  const check = await validateSession({
    fetcher: c.env.SESSION_WORKER,
    secret: c.env.KR_SESSION_WORKER_SECRET,
    token,
    requestId,
    userAgent: c.req.header('user-agent') ?? null,
    ip: clientIp(c.req.raw.headers),
  })
  if (!check.valid) {
    logLine('AUTH_GUARD:rejected', requestId, { reason: check.reason, unavailable: check.unavailable })
    if (check.unavailable) return failure(c, 503, 'SESSION_VALIDATION_UNAVAILABLE', 'Sign-in checks are not available right now.')
    return failure(c, 401, 'UNAUTHENTICATED', 'Sign in to continue.', { reason: check.reason })
  }
  if (!accessAllows(access, check.session)) return failure(c, 403, 'FORBIDDEN', 'Your role may not use this route.')
  if (route.permission) {
    const denied = await permissionDenied(c, route.permission, check.session.userId)
    if (denied) return denied
  }

  c.set('session', check.session)
  // Path A: the host page is calling for a tool in a frame.
  if (toolClientId) return frameToolGate(c, next, route, check.session, toolClientId)
  return next()
}
