// file: apps/api/src/features/tools/routes.ts
/**
 * Outside-tool routes. The design and the security model are in docs/05_Outside_Tools.md; the developer guide
 * is packages/tool-sdk/README.md.
 *
 *  Super admin only (`{ roles: ['super_admin'] }`):
 *   GET    /v1/tools/registrations                     every registered tool
 *   POST   /v1/tools/registrations                     register a tool (shows the client secret once)
 *   GET    /v1/tools/registrations/{toolId}            one tool
 *   PATCH  /v1/tools/registrations/{toolId}            change a tool (turning server access off ends its tokens)
 *   DELETE /v1/tools/registrations/{toolId}            remove a tool and its tokens (audit rows stay)
 *   POST   /v1/tools/registrations/{toolId}/secret     make a new client secret (shown once)
 *   POST   /v1/tools/registrations/{toolId}/sandbox-secret  make a sandbox secret: sample data only (shown once)
 *   GET    /v1/tools/registrations/{toolId}/audit      the most recent calls and changes
 *   POST   /v1/tools/registrations/health-check        read a tool address's health route and icon route (before or after saving)
 *
 *  Any signed-in person:
 *   GET    /v1/tools/menu                              active tools this person may use (`toolRefusal`: role, permitted email, local only, developers only)
 *   GET    /v1/tools/menu/{clientId}/health            read the health route of a tool this person may open
 *
 * Icons: a tool has a built-in fallback icon name (default `tool`, the orange diamond) and, optionally, its own SVG
 * icon, which the tool serves at `GET <origin>/tool-icon.svg` (the kit's rules; not typed by the super admin). The API
 * reads it each time a registration is saved (`fetchToolIcon`) and stores its standard form beside the name in the
 * one `icon` column, as `<name>` or `<name> <svg ...>` (`storedIcon` / `iconParts`), so no migration is needed.
 *
 * Visibility (repository patch 58, migration 058): `localOnly` keeps a tool to a development server (`pnpm dev`; for a
 * tool registered at a localhost address, which the deployed app could not load anyway) and `developersOnly` to people
 * who hold `developer_tools` read. Both are applied by `toolRefusal` (rules.ts) to the menu, the health check and every
 * frame call; a hidden tool's health answers 404, as if it did not exist.
 *
 * Health: every tool answers `GET <origin>/health-check` with `{ status, version }` (`platform/toolHealth.ts`). The
 * menu does not wait for it; the frame asks when a person opens the tool and shows a notice in place of the tool
 * when it fails. The super admin's check also returns the raw answer and the icon it found.
 *
 *  Outside tools:
 *   POST   /v1/tools/token                             server path: client id + secret for a 15-minute token
 *   GET    /v1/tools/context                           who is calling (any tool, either path)
 *   GET    /v1/tools/permitted-users                   this registration's permitted emails (scoped server calls only)
 *
 * The registration routes are closed to outside tools (no `toolAccess`), so a tool can never change its own
 * permissions. Every change a super admin makes is written to `workspace_tool_audit` with channel `admin`.
 */

import {
  ToolAuditData,
  ToolContextData,
  ToolPermittedUsersData,
  ToolCreateBody,
  ToolCreatedData,
  ToolDeletedData,
  ToolIconNames,
  ToolIdParams,
  ToolListData,
  ToolMenuData,
  ToolRegistrationData,
  ToolSecretData,
  ToolSecretRotateBody,
  ToolTokenBody,
  ToolTokenData,
  ToolUpdateBody,
  ToolSandboxSecretData,
  TOOL_SANDBOX_ADDRESS,
  TOOL_SANDBOX_SECRET_DAYS,
  ToolSdkData,
  ToolSdkPointer,
  ErrorEnvelope,
  TOOL_GATEWAY_HEADER,
  TOOL_GATEWAY_VALUE,
  successEnvelope,
  ToolHealthCheckBody,
  ToolHealthData,
  ToolHealthParams,
  checkToolIcon,
  type ToolRegistration,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { clientIp, toolViewerFor } from '../../platform/authGuard.ts'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import { randomBase64Url } from '../../platform/crypto.ts'
import { checkToolHealth, fetchToolIcon } from '../../platform/toolHealth.ts'
import { signSandboxSecret } from '../../platform/toolSandbox.ts'
import type { AppEnv } from '../../platform/types.ts'
import { toolQueriesFor, type ToolChanges, type ToolQueries } from './queries.ts'
import {
  TOOL_TOKEN_TTL_SECONDS,
  hashToolSecret,
  ipAllowed,
  newAccessToken,
  newClientId,
  newClientSecret,
  overlapUntil,
  parseToolEntryUrl,
  secretMatches,
  tokenScopes,
  toolUsableBy,
  withSuperAdmin,
  type ToolRecord,
} from './rules.ts'

const SUPER_ADMIN = { roles: ['super_admin'] } as const
const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const errorBody = (description: string) => ({ description, content: json(ErrorEnvelope) })
const AUDIT_LIMIT = 200

export const listToolsRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/registrations',
  feature: 'tools',
  summary: 'List every registered outside tool, for the super admin.',
  access: SUPER_ADMIN,
  errors: ['TOOLS_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: {
    200: { description: 'Every tool.', content: json(successEnvelope(ToolListData)) },
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const createToolRoute = defineRoute({
  method: 'post',
  path: '/v1/tools/registrations',
  feature: 'tools',
  summary: 'Register an outside tool and, when server access is on, make its client secret.',
  access: SUPER_ADMIN,
  errors: ['TOOL_ENTRY_URL_REFUSED', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Calls the icon route of the tool (<origin>/tool-icon.svg)', 'Writes workspace_tool', 'Writes workspace_tool_audit'],
  request: { body: { required: true, content: json(ToolCreateBody) } },
  responses: {
    201: { description: 'Registered. The client secret is in this reply only.', content: json(successEnvelope(ToolCreatedData)) },
    400: errorBody('The tool address is not allowed (TOOL_ENTRY_URL_REFUSED); details.reason says why.'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const getToolRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/registrations/{toolId}',
  feature: 'tools',
  summary: 'Return one registered outside tool, for the super admin.',
  access: SUPER_ADMIN,
  errors: ['TOOL_NOT_FOUND', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: ToolIdParams },
  responses: {
    200: { description: 'The tool.', content: json(successEnvelope(ToolRegistrationData)) },
    404: errorBody('No such tool (TOOL_NOT_FOUND).'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const updateToolRoute = defineRoute({
  method: 'patch',
  path: '/v1/tools/registrations/{toolId}',
  feature: 'tools',
  summary: 'Change an outside tool: menu text, address, roles, permissions, status or server access.',
  access: SUPER_ADMIN,
  errors: ['TOOL_NOT_FOUND', 'TOOL_ENTRY_URL_REFUSED', 'TOOLS_UNAVAILABLE'],
  sideEffects: [
    'Calls the icon route of the tool (<origin>/tool-icon.svg)',
    'Writes workspace_tool',
    'Deletes workspace_tool_token rows when the tool is turned off, server access is turned off or permissions change',
    'Writes workspace_tool_audit',
  ],
  request: { params: ToolIdParams, body: { required: true, content: json(ToolUpdateBody) } },
  responses: {
    200: { description: 'The changed tool.', content: json(successEnvelope(ToolRegistrationData)) },
    400: errorBody('The tool address is not allowed (TOOL_ENTRY_URL_REFUSED).'),
    404: errorBody('No such tool (TOOL_NOT_FOUND).'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const deleteToolRoute = defineRoute({
  method: 'delete',
  path: '/v1/tools/registrations/{toolId}',
  feature: 'tools',
  summary: 'Remove an outside tool and end its access tokens. Its audit rows are kept.',
  access: SUPER_ADMIN,
  errors: ['TOOL_NOT_FOUND', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Deletes workspace_tool and its workspace_tool_token rows', 'Writes workspace_tool_audit'],
  request: { params: ToolIdParams },
  responses: {
    200: { description: 'Removed.', content: json(successEnvelope(ToolDeletedData)) },
    404: errorBody('No such tool (TOOL_NOT_FOUND).'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const rotateSecretRoute = defineRoute({
  method: 'post',
  path: '/v1/tools/registrations/{toolId}/secret',
  feature: 'tools',
  summary: 'Make a new client secret for an outside tool; the old one may keep working for a short overlap.',
  access: SUPER_ADMIN,
  errors: ['TOOL_NOT_FOUND', 'TOOL_SERVER_ACCESS_OFF', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Writes workspace_tool (secret hashes)', 'Deletes workspace_tool_token rows when the overlap is 0', 'Writes workspace_tool_audit'],
  request: { params: ToolIdParams, body: { required: true, content: json(ToolSecretRotateBody) } },
  responses: {
    200: { description: 'The new secret, in this reply only.', content: json(successEnvelope(ToolSecretData)) },
    404: errorBody('No such tool (TOOL_NOT_FOUND).'),
    409: errorBody('Turn server access on first (TOOL_SERVER_ACCESS_OFF).'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

/**
 * A sandbox secret (the requester, Nov 23, 2026): lets the tool's developer try the tool against the sandbox's made-up
 * sample data (`krhomebase-sandbox-api`), with the tool's permissions and permitted users as they are now. It opens no
 * firm data, is not stored, and ends after TOOL_SANDBOX_SECRET_DAYS; each one is recorded in the tool's Activity.
 */
export const sandboxSecretRoute = defineRoute({
  method: 'post',
  path: '/v1/tools/registrations/{toolId}/sandbox-secret',
  feature: 'tools',
  summary: "Make a sandbox secret for an outside tool: it opens the tool sandbox's made-up sample data only, never firm data, and ends after 30 days.",
  access: SUPER_ADMIN,
  errors: ['TOOL_NOT_FOUND', 'TOOLS_SANDBOX_NOT_CONFIGURED', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Writes workspace_tool_audit'],
  request: { params: ToolIdParams },
  responses: {
    200: { description: 'The sandbox secret, in this reply only.', content: json(successEnvelope(ToolSandboxSecretData)) },
    404: errorBody('No such tool (TOOL_NOT_FOUND).'),
    503: errorBody('The sandbox signing secret is not set (TOOLS_SANDBOX_NOT_CONFIGURED), or the tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const toolAuditRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/registrations/{toolId}/audit',
  feature: 'tools',
  summary: 'List the most recent calls and changes for an outside tool, newest first.',
  access: SUPER_ADMIN,
  errors: ['TOOLS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: ToolIdParams },
  responses: {
    200: { description: 'Up to 200 entries.', content: json(successEnvelope(ToolAuditData)) },
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const toolHealthCheckRoute = defineRoute({
  method: 'post',
  path: '/v1/tools/registrations/health-check',
  feature: 'tools',
  summary: 'Read the health route (GET <origin>/health-check) and the icon route (GET <origin>/tool-icon.svg) of a tool address and say whether they answer as the tool kit asks, with the raw answer, for the super admin.',
  access: SUPER_ADMIN,
  errors: ['TOOL_ENTRY_URL_REFUSED'],
  sideEffects: ['Calls the health route and the icon route of the tool (https, no redirects, 5 seconds)'],
  request: { body: { required: true, content: json(ToolHealthCheckBody) } },
  responses: {
    200: { description: 'The result: ok, failed (with the problem) or not_checked (a local address).', content: json(successEnvelope(ToolHealthData)) },
    400: errorBody('The tool address is not allowed (TOOL_ENTRY_URL_REFUSED).'),
  },
})

export const toolMenuRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/menu',
  feature: 'tools',
  summary: 'List the active outside tools the signed-in person may use, for the left menu.',
  access: 'signed-in',
  errors: [],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The tools for this person. Empty when the tools tables cannot be reached.', content: json(successEnvelope(ToolMenuData)) },
  },
})

export const toolMenuHealthRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/menu/{clientId}/health',
  feature: 'tools',
  summary: 'Read the health route of an outside tool the signed-in person may open, so the frame can show a notice when the tool does not answer.',
  access: 'signed-in',
  errors: ['TOOL_NOT_FOUND', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Calls the health route of the tool (https, no redirects, 5 seconds; a good answer is reused for 60 seconds)'],
  request: { params: ToolHealthParams },
  responses: {
    200: { description: 'The result: ok, failed (with the problem) or not_checked (a local address).', content: json(successEnvelope(ToolHealthData)) },
    404: errorBody('No active tool with that client id that this person may use (TOOL_NOT_FOUND).'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const toolTokenRoute = defineRoute({
  method: 'post',
  path: '/v1/tools/token',
  feature: 'tools',
  summary: 'Trade a tool client id and secret for a 15-minute access token (server path only).',
  access: 'public',
  toolAccess: 'any',
  errors: ['TOOL_GATEWAY_REQUIRED', 'TOOL_TOKEN_INVALID', 'TOOL_FORBIDDEN', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Writes workspace_tool_token', 'Deletes ended workspace_tool_token rows', 'Writes workspace_tool_audit'],
  request: { body: { required: true, content: json(ToolTokenBody) } },
  responses: {
    200: { description: 'The access token.', content: json(successEnvelope(ToolTokenData)) },
    401: errorBody('Unknown client id or wrong secret (TOOL_TOKEN_INVALID).'),
    403: errorBody('Not through external-api (TOOL_GATEWAY_REQUIRED), or the tool may not get tokens (TOOL_FORBIDDEN).'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

export const toolContextRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/context',
  feature: 'tools',
  summary: 'Tell an outside tool who is calling: the tool, its permissions and, for frame calls, the person.',
  access: 'signed-in',
  toolAccess: 'any',
  errors: ['TOOL_CALLER_REQUIRED'],
  sideEffects: ['Writes workspace_tool_audit'],
  responses: {
    200: { description: 'The caller.', content: json(successEnvelope(ToolContextData)) },
    403: errorBody('Called without a tool (TOOL_CALLER_REQUIRED).'),
  },
})

export const toolPermittedUsersRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/permitted-users',
  feature: 'tools',
  summary: 'For a registered tool server, return the permitted sign-in emails for its own registration.',
  access: 'signed-in',
  toolAccess: 'tool-registration:read',
  toolChannels: ['server'],
  errors: ['TOOL_CALLER_REQUIRED', 'TOOL_FORBIDDEN', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Writes workspace_tool_audit'],
  responses: {
    200: { description: 'The exact users this registration allows.', content: json(successEnvelope(ToolPermittedUsersData)) },
    403: errorBody('Only a registered tool server with tool-registration:read may call this route.'),
    503: errorBody('The tools tables cannot be reached (TOOLS_UNAVAILABLE).'),
  },
})

/**
 * The built-in icon name and the SVG icon held in the one `icon` column (`<name>` or `<name> <svg ...>`). An unknown
 * name reads as `documents`; an SVG that no longer passes `checkToolIcon` is dropped.
 */
export function iconParts(stored: string): { icon: ToolRegistration['icon']; iconSvg: string | null } {
  const at = stored.indexOf('<svg')
  const name = (at >= 0 ? stored.slice(0, at) : stored).trim()
  const icon = (ToolIconNames as readonly string[]).includes(name) ? (name as ToolRegistration['icon']) : 'documents'
  if (at < 0) return { icon, iconSvg: null }
  const svg = checkToolIcon(stored.slice(at))
  return { icon, iconSvg: svg.ok ? svg.svg : null }
}

/** What goes in the `icon` column for a name and an optional SVG icon (written in its standard form). */
export function storedIcon(icon: string, iconSvg: string | null): string {
  if (!iconSvg) return icon
  const svg = checkToolIcon(iconSvg)
  return svg.ok ? `${icon} ${svg.svg}` : icon
}

/** The registration as the super admin sees it: no secret hashes. */
export function toRegistration(tool: ToolRecord): ToolRegistration {
  return {
    id: tool.id,
    clientId: tool.clientId,
    label: tool.label,
    description: tool.description,
    ...iconParts(tool.icon),
    menuOrder: tool.menuOrder,
    origin: tool.origin,
    entryUrl: tool.entryUrl,
    allowedRoles: tool.allowedRoles,
    permittedUsers: tool.permittedUsers,
    localOnly: tool.localOnly,
    developersOnly: tool.developersOnly,
    scopes: tool.scopes,
    status: tool.status,
    serverAccessEnabled: tool.serverAccessEnabled,
    serverIpAllowlist: tool.serverIpAllowlist,
    hasSecret: Boolean(tool.secretHash),
    secretCreatedAt: tool.secretCreatedAt,
    previousSecretValidUntil: tool.previousSecretValidUntil,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  }
}

/** Records a super-admin change. Never throws. */
async function auditAdmin(c: Context<AppEnv>, queries: ToolQueries, toolId: string, action: string, status: number): Promise<void> {
  try {
    await queries.insertAudit({
      id: crypto.randomUUID(),
      toolId,
      channel: 'admin',
      userId: c.get('session')?.userId ?? null,
      method: action,
      path: c.req.path,
      status,
      requestId: c.get('requestId'),
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    logLine('TOOLS_ADMIN:audit_failed', c.get('requestId'), { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
  }
}

const unavailable = (c: Context<AppEnv>) => failure(c, 503, 'TOOLS_UNAVAILABLE', 'Outside tools are not available right now.')

const toolSdkMissing = (c: Context<AppEnv>) => failure(c, 404, 'TOOL_SDK_NOT_FOUND', 'No tool kit ZIP is stored yet.')

const toolSdkRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/sdk',
  feature: 'tools',
  summary: 'The latest tool kit ZIP stored in R2: version, file name, byte size and upload time.',
  access: 'signed-in',
  permission: { resource: 'developer_tools', action: 'read' },
  errors: ['TOOL_SDK_NOT_FOUND', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Reads R2 DOCUMENTS'],
  responses: {
    200: { description: 'The stored tool kit archive metadata.', content: json(successEnvelope(ToolSdkData)) },
    404: errorBody('No tool kit ZIP is stored yet (TOOL_SDK_NOT_FOUND).'),
    503: errorBody('The tool kit storage is unavailable (TOOLS_UNAVAILABLE).'),
  },
})

const toolSdkDownloadRoute = defineRoute({
  method: 'get',
  path: '/v1/tools/sdk/download',
  feature: 'tools',
  summary: 'Download the latest versioned tool kit ZIP stored in R2.',
  access: 'signed-in',
  permission: { resource: 'developer_tools', action: 'read' },
  errors: ['TOOL_SDK_NOT_FOUND', 'TOOLS_UNAVAILABLE'],
  sideEffects: ['Reads R2 DOCUMENTS'],
  responses: {
    200: { description: 'The stored ZIP file.', content: { 'application/zip': { schema: z.string().describe('The ZIP file bytes.') } } },
    404: errorBody('No tool kit ZIP is stored yet (TOOL_SDK_NOT_FOUND).'),
    503: errorBody('The tool kit storage is unavailable (TOOLS_UNAVAILABLE).'),
  },
})

/** Reads and validates the latest pointer, then fetches its versioned ZIP without traversing outside tool-sdk/. */
async function readStoredToolSdk(c: Context<AppEnv>) {
  const bucket = c.env.DOCUMENTS
  if (!bucket) return { kind: 'unavailable' as const }
  let pointerObject: R2ObjectBody | null
  try {
    pointerObject = await bucket.get('tool-sdk/latest.json')
  } catch {
    return { kind: 'unavailable' as const }
  }
  if (!pointerObject) return { kind: 'missing' as const }
  let pointerText: string
  try {
    pointerText = await pointerObject.text()
  } catch {
    return { kind: 'unavailable' as const }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(pointerText)
  } catch {
    return { kind: 'missing' as const }
  }
  const pointer = ToolSdkPointer.safeParse(parsed)
  if (!pointer.success || !/^krhomebase-sdk-[0-9]+\.[0-9]+\.[0-9]+\.zip$/.test(pointer.data.fileName) ||
      pointer.data.key !== `tool-sdk/${pointer.data.fileName}` || pointer.data.version !== pointer.data.fileName.slice('krhomebase-sdk-'.length, -'.zip'.length)) {
    return { kind: 'missing' as const }
  }
  let archive: R2ObjectBody | null
  try {
    archive = await bucket.get(pointer.data.key)
  } catch {
    return { kind: 'unavailable' as const }
  }
  if (!archive) return { kind: 'missing' as const }
  return {
    kind: 'ok' as const,
    pointer: pointer.data,
    archive,
    data: { version: pointer.data.version, fileName: pointer.data.fileName, size: archive.size, uploadedAt: archive.uploaded.toISOString() },
  }
}

/** Registers the tools routes on the app. */
export function registerTools(app: OpenAPIHono<AppEnv>) {
  app.openapi(toolSdkRoute, async (c) => {
    const stored = await readStoredToolSdk(c)
    if (stored.kind === 'missing') return toolSdkMissing(c)
    if (stored.kind === 'unavailable') return failure(c, 503, 'TOOLS_UNAVAILABLE', 'Tool kit storage is not available right now.')
    c.header('Cache-Control', 'no-store')
    return c.json({ ok: true as const, data: stored.data, requestId: c.get('requestId') }, 200)
  })

  app.openapi(toolSdkDownloadRoute, async (c) => {
    const stored = await readStoredToolSdk(c)
    if (stored.kind === 'missing') return toolSdkMissing(c)
    if (stored.kind === 'unavailable') return failure(c, 503, 'TOOLS_UNAVAILABLE', 'Tool kit storage is not available right now.')
    c.header('Cache-Control', 'no-store')
    c.header('Content-Disposition', `attachment; filename="${stored.pointer.fileName}"`)
    c.header('Content-Type', 'application/zip')
    c.header('Content-Length', String(stored.archive.size))
    return new Response(stored.archive.body, { status: 200, headers: c.res.headers })
  })

  app.openapi(listToolsRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const tools = await queries.listTools()
    return c.json({ ok: true as const, data: { tools: tools.map(toRegistration) }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(createToolRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const body = c.req.valid('json')
    const place = parseToolEntryUrl(body.entryUrl, c.env?.KR_APP_BASE_URL?.trim() || null)
    if (!place.ok) return failure(c, 400, 'TOOL_ENTRY_URL_REFUSED', 'This tool address is not allowed.', { reason: place.reason })

    const now = new Date().toISOString()
    const secret = body.serverAccessEnabled ? newClientSecret() : null
    const tool: ToolRecord = {
      id: crypto.randomUUID(),
      clientId: newClientId(),
      label: body.label,
      description: body.description,
      icon: storedIcon(body.icon, (await fetchToolIcon(place.origin)).svg),
      menuOrder: body.menuOrder,
      origin: place.origin,
      entryUrl: place.entryUrl,
      allowedRoles: withSuperAdmin(body.allowedRoles),
      permittedUsers: body.permittedUsers,
      localOnly: body.localOnly,
      developersOnly: body.developersOnly,
      scopes: [...new Set(body.scopes)],
      status: 'active',
      serverAccessEnabled: body.serverAccessEnabled,
      serverIpAllowlist: body.serverIpAllowlist,
      secretHash: secret ? await hashToolSecret(secret) : null,
      secretCreatedAt: secret ? now : null,
      previousSecretHash: null,
      previousSecretValidUntil: null,
      createdAt: now,
      updatedAt: now,
    }
    await queries.insertTool(tool, c.get('session')?.userId ?? '')
    await auditAdmin(c, queries, tool.id, 'CREATE', 201)
    logLine('TOOLS_ADMIN:created', c.get('requestId'), { clientId: tool.clientId, scopes: tool.scopes.length })
    return c.json({ ok: true as const, data: { tool: toRegistration(tool), clientSecret: secret }, requestId: c.get('requestId') }, 201)
  })

  app.openapi(getToolRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const tool = await queries.findToolById(c.req.valid('param').toolId)
    if (!tool) return failure(c, 404, 'TOOL_NOT_FOUND', 'No such tool.')
    return c.json({ ok: true as const, data: { tool: toRegistration(tool) }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(updateToolRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { toolId } = c.req.valid('param')
    const body = c.req.valid('json')
    const tool = await queries.findToolById(toolId)
    if (!tool) return failure(c, 404, 'TOOL_NOT_FOUND', 'No such tool.')

    const changes: ToolChanges = {
      label: body.label,
      description: body.description,
      menuOrder: body.menuOrder,
      allowedRoles: body.allowedRoles ? withSuperAdmin(body.allowedRoles) : undefined,
      permittedUsers: body.permittedUsers,
      localOnly: body.localOnly,
      developersOnly: body.developersOnly,
      scopes: body.scopes ? [...new Set(body.scopes)] : undefined,
      status: body.status,
      serverAccessEnabled: body.serverAccessEnabled,
      serverIpAllowlist: body.serverIpAllowlist,
    }
    if (body.entryUrl !== undefined) {
      const place = parseToolEntryUrl(body.entryUrl, c.env?.KR_APP_BASE_URL?.trim() || null)
      if (!place.ok) return failure(c, 400, 'TOOL_ENTRY_URL_REFUSED', 'This tool address is not allowed.', { reason: place.reason })
      changes.origin = place.origin
      changes.entryUrl = place.entryUrl
    }
    // Every save reads the tool's own icon again (`<origin>/tool-icon.svg`); the column holds it beside the name.
    const iconRead = await fetchToolIcon(changes.origin ?? tool.origin)
    changes.icon = storedIcon(body.icon ?? iconParts(tool.icon).icon, iconRead.svg)
    await queries.updateTool(toolId, changes, c.get('session')?.userId ?? '', new Date().toISOString())

    // Tokens carry the permissions they were issued with, so any narrowing ends them at once.
    const scopesChanged = changes.scopes !== undefined && JSON.stringify([...changes.scopes].sort()) !== JSON.stringify([...tool.scopes].sort())
    if (body.status === 'disabled' || body.serverAccessEnabled === false || scopesChanged) await queries.deleteTokensForTool(toolId)

    await auditAdmin(c, queries, toolId, 'UPDATE', 200)
    const updated = (await queries.findToolById(toolId)) ?? tool
    return c.json({ ok: true as const, data: { tool: toRegistration(updated) }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(deleteToolRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { toolId } = c.req.valid('param')
    if (!(await queries.findToolById(toolId))) return failure(c, 404, 'TOOL_NOT_FOUND', 'No such tool.')
    await queries.deleteTool(toolId)
    await auditAdmin(c, queries, toolId, 'DELETE', 200)
    return c.json({ ok: true as const, data: { deleted: true as const }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(rotateSecretRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { toolId } = c.req.valid('param')
    const { keepPreviousForHours } = c.req.valid('json')
    const tool = await queries.findToolById(toolId)
    if (!tool) return failure(c, 404, 'TOOL_NOT_FOUND', 'No such tool.')
    if (!tool.serverAccessEnabled) return failure(c, 409, 'TOOL_SERVER_ACCESS_OFF', 'Turn server access on before making a secret.')

    const secret = newClientSecret()
    const now = new Date().toISOString()
    const validUntil = tool.secretHash ? overlapUntil(keepPreviousForHours) : null
    await queries.setSecret(
      toolId,
      { hash: await hashToolSecret(secret), createdAt: now, previousHash: validUntil ? tool.secretHash : null, previousValidUntil: validUntil },
      c.get('session')?.userId ?? '',
    )
    // With no overlap, tokens from the old secret end now too.
    if (!validUntil) await queries.deleteTokensForTool(toolId)
    await auditAdmin(c, queries, toolId, 'ROTATE_SECRET', 200)
    return c.json({ ok: true as const, data: { clientSecret: secret, previousSecretValidUntil: validUntil }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(sandboxSecretRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { toolId } = c.req.valid('param')
    const tool = await queries.findToolById(toolId)
    if (!tool) return failure(c, 404, 'TOOL_NOT_FOUND', 'No such tool.')
    const key = (c.env as { KR_TOOL_SANDBOX_SECRET?: string } | undefined)?.KR_TOOL_SANDBOX_SECRET?.trim()
    if (!key) return failure(c, 503, 'TOOLS_SANDBOX_NOT_CONFIGURED', 'The tool sandbox is not set up yet: its signing secret is missing.')

    // The tool's grant now. A later change to the registration does not change a secret already made.
    const expiresAt = Math.floor(Date.now() / 1000) + TOOL_SANDBOX_SECRET_DAYS * 86400
    const secretId = randomBase64Url(6)
    const sandboxSecret = await signSandboxSecret(key, tool.clientId, { scopes: tool.scopes, emails: tool.permittedUsers, expiresAt }, secretId)
    await auditAdmin(c, queries, toolId, 'SANDBOX_SECRET', 200)
    logLine('TOOLS_SANDBOX:secret', c.get('requestId'), { clientId: tool.clientId, secretId })
    c.header('Cache-Control', 'no-store')
    return c.json(
      {
        ok: true as const,
        data: { clientId: tool.clientId, sandboxSecret, secretId, expiresAt: new Date(expiresAt * 1000).toISOString(), sandboxAddress: TOOL_SANDBOX_ADDRESS, scopes: tool.scopes },
        requestId: c.get('requestId'),
      },
      200,
    )
  })

  app.openapi(toolAuditRoute, async (c) => {
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const entries = await queries.listAudit(c.req.valid('param').toolId, AUDIT_LIMIT)
    return c.json({ ok: true as const, data: { entries }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(toolHealthCheckRoute, async (c) => {
    const body = c.req.valid('json')
    const place = parseToolEntryUrl(body.entryUrl, c.env?.KR_APP_BASE_URL?.trim() || null)
    if (!place.ok) return failure(c, 400, 'TOOL_ENTRY_URL_REFUSED', 'This tool address is not allowed.', { reason: place.reason })
    // The super admin check returns the raw answer (detail) and the icon the tool serves, read side by side.
    const [result, icon] = await Promise.all([checkToolHealth(place.origin, { detail: true }), fetchToolIcon(place.origin)])
    logLine('TOOLS_HEALTH:checked', c.get('requestId'), { origin: place.origin, state: result.state, icon: Boolean(icon.svg) })
    return c.json({ ok: true as const, data: { ...result, icon }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(toolMenuHealthRoute, async (c) => {
    const session = c.get('session')
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const tool = await queries.findToolByClientId(c.req.valid('param').clientId)
    // A tool this person may not open answers as if it did not exist.
    if (!tool || !session || !toolUsableBy(tool, await toolViewerFor(c, session, tool.developersOnly))) {
      return failure(c, 404, 'TOOL_NOT_FOUND', 'No such tool.')
    }
    const result = await checkToolHealth(tool.origin)
    if (result.state === 'failed') logLine('TOOLS_HEALTH:failed', c.get('requestId'), { clientId: tool.clientId, problem: result.problem ?? '' })
    return c.json({ ok: true as const, data: result, requestId: c.get('requestId') }, 200)
  })

  app.openapi(toolMenuRoute, async (c) => {
    const session = c.get('session')
    const queries = toolQueriesFor(c.env)
    // The menu must still draw when the tools tables are missing (for example before the migration is applied).
    let tools: ToolRecord[] = []
    if (queries && session) {
      try {
        const all = await queries.listTools()
        // One permission read for the whole menu, and only when a developers-only tool is registered.
        const viewer = await toolViewerFor(c, session, all.some((tool) => tool.developersOnly))
        tools = all.filter((tool) => toolUsableBy(tool, viewer))
      } catch (error) {
        logLine('TOOLS_MENU:read_failed', c.get('requestId'), { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
      }
    }
    const items = tools.map((tool) => ({
      clientId: tool.clientId,
      label: tool.label,
      description: tool.description,
      ...iconParts(tool.icon),
      menuOrder: tool.menuOrder,
      origin: tool.origin,
      entryUrl: tool.entryUrl,
      scopes: tool.scopes,
    }))
    return c.json({ ok: true as const, data: { tools: items }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(toolTokenRoute, async (c) => {
    const requestId = c.get('requestId')
    if (c.req.header(TOOL_GATEWAY_HEADER) !== TOOL_GATEWAY_VALUE) {
      return failure(c, 403, 'TOOL_GATEWAY_REQUIRED', 'Ask for tokens through the external API address.')
    }
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const body = c.req.valid('json')

    const tool = await queries.findToolByClientId(body.clientId)
    // Unknown client and wrong secret give the same answer, so the reply does not reveal which client ids exist.
    if (!tool || !(await secretMatches(body.clientSecret, tool))) {
      logLine('TOOLS_TOKEN:refused', requestId, { reason: tool ? 'secret_invalid' : 'tool_unknown' })
      return failure(c, 401, 'TOOL_TOKEN_INVALID', 'Unknown client id or wrong client secret.', { reason: 'secret_invalid' })
    }
    if (tool.status !== 'active') return failure(c, 403, 'TOOL_FORBIDDEN', 'This tool is turned off.', { reason: 'tool_disabled' })
    if (!tool.serverAccessEnabled) return failure(c, 403, 'TOOL_FORBIDDEN', 'Server access is turned off for this tool.', { reason: 'server_access_disabled' })
    if (!ipAllowed(tool.serverIpAllowlist, clientIp(c.req.raw.headers))) {
      return failure(c, 403, 'TOOL_FORBIDDEN', 'This address may not ask for tokens for this tool.', { reason: 'ip_not_allowed' })
    }
    const scopes = tokenScopes(tool.scopes, body.scopes)
    if (!scopes.ok) return failure(c, 403, 'TOOL_FORBIDDEN', 'A requested permission was not granted to this tool.', { reason: scopes.reason })

    const token = newAccessToken()
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    await queries.deleteExpiredTokens(now)
    await queries.insertToken({
      hash: await hashToolSecret(token),
      toolId: tool.id,
      scopes: scopes.scopes,
      expiresAt: new Date(nowMs + TOOL_TOKEN_TTL_SECONDS * 1000).toISOString(),
      createdAt: now,
    })
    try {
      await queries.insertAudit({ id: crypto.randomUUID(), toolId: tool.id, channel: 'server', userId: null, method: 'POST', path: c.req.path, status: 200, requestId, createdAt: now })
    } catch (error) {
      logLine('TOOLS_TOKEN:audit_failed', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
    }
    c.header('Cache-Control', 'no-store')
    return c.json(
      { ok: true as const, data: { accessToken: token, tokenType: 'Bearer' as const, expiresIn: TOOL_TOKEN_TTL_SECONDS, scopes: scopes.scopes }, requestId },
      200,
    )
  })

  app.openapi(toolContextRoute, (c) => {
    const tool = c.get('tool')
    if (!tool) return failure(c, 403, 'TOOL_CALLER_REQUIRED', 'Only an outside tool calls this route.')
    const session = c.get('session')
    const user = tool.channel === 'frame' && session ? { displayName: session.displayName, role: session.role, firmName: session.firmName } : null
    return c.json(
      { ok: true as const, data: { tool: { clientId: tool.clientId, label: tool.label, scopes: tool.scopes }, channel: tool.channel, user }, requestId: c.get('requestId') },
      200,
    )
  })

  app.openapi(toolPermittedUsersRoute, async (c) => {
    const caller = c.get('tool')
    if (!caller) return failure(c, 403, 'TOOL_CALLER_REQUIRED', 'Only a registered tool calls this route.')
    if (caller.channel !== 'server') {
      return failure(c, 403, 'TOOL_FORBIDDEN', 'Only the registered tool server may read its permitted-user list.', { reason: 'server_channel_required' })
    }
    const queries = toolQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const tool = await queries.findToolById(caller.toolId)
    if (!tool) return failure(c, 403, 'TOOL_FORBIDDEN', 'This registration is no longer available.', { reason: 'tool_unknown' })
    c.header('Cache-Control', 'no-store, private')
    return c.json({ ok: true as const, data: { emails: tool.permittedUsers }, requestId: c.get('requestId') }, 200)
  })
}
