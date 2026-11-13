// file: apps/api/src/features/matters/routes.ts
/**
 * Projects & Matters routes (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 1). They replace the old
 * `GET`, `POST`, `PATCH`, `DELETE /krhomebase/api/kr-api-v1/matters` (the delete check was `GET ...?deleteCheck=true`),
 * one route per action:
 *
 *   GET    /v1/clients/{clientId}/matters       the client's matters, the choice lists and the viewer's rights (read roles)
 *   POST   /v1/clients/{clientId}/matters       create the next numbered matter (office write roles)
 *   PATCH  /v1/matters/{matterId}               change title, description, status, opened date; add Initial Notes (office write roles)
 *   GET    /v1/matters/{matterId}/delete-check  whether it may be deleted and what blocks it (read roles)
 *   DELETE /v1/matters/{matterId}               delete a matter with no records (super admin, typed confirmation)
 *
 * Rules: `rules.ts`. Writes pass the write gate and are audited (resource `matters`). Outside tools: closed.
 */

import {
  ClientMattersData,
  ErrorEnvelope,
  MatterClientParams,
  MatterCreateBody,
  MatterDeleteBody,
  MatterDeleteCheckData,
  MatterDeletedData,
  MatterParams,
  MatterSavedData,
  MatterUpdateBody,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { MattersUnavailableError, matterQueriesFor, type MatterQueries } from './queries.ts'
import {
  checkMatterDelete,
  createMatter,
  deleteMatter,
  loadClientMatters,
  MATTER_READ_ROLES,
  MATTER_WRITE_ROLES,
  MatterError,
  updateMatter,
  type MatterActor,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const unavailable503 = error('Matters cannot be read or saved right now (MATTERS_UNAVAILABLE).')
const matterNotFound404 = error('No matter has that id (MATTER_NOT_FOUND).')
const clientNotFound404 = error('No client account has that id (MATTER_CLIENT_NOT_FOUND).')
const choice422 = error('A status or practice area is not one of the choices (MATTER_CHOICE_INVALID).')

export const clientMattersRoute = defineRoute({
  method: 'get',
  path: '/v1/clients/{clientId}/matters',
  feature: 'matters',
  summary: "A client's matters in number order, the status and practice-area choices, and whether the viewer may add, change or delete matters.",
  access: { roles: MATTER_READ_ROLES },
  errors: ['MATTER_CLIENT_NOT_FOUND', 'MATTERS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: MatterClientParams },
  responses: { 200: { description: "The client's matters.", content: json(successEnvelope(ClientMattersData)) }, 404: clientNotFound404, 503: unavailable503 },
})

export const createMatterRoute = defineRoute({
  method: 'post',
  path: '/v1/clients/{clientId}/matters',
  feature: 'matters',
  summary: "Creates the client's next numbered matter (`[Client Number].[n]`, n from 1) with its primary-client party and optional Initial Notes.",
  access: { roles: MATTER_WRITE_ROLES },
  errors: ['MATTER_CLIENT_NOT_FOUND', 'MATTER_CLIENT_NUMBER_INVALID', 'MATTER_CHOICE_INVALID', 'MATTER_NUMBER_IN_USE', 'MATTERS_UNAVAILABLE'],
  sideEffects: ['Writes matter, matter_party and matter_activity_log (Initial Notes)', 'Writes audit_log'],
  request: { params: MatterClientParams, body: { content: json(MatterCreateBody), required: true } },
  responses: {
    200: { description: 'The new matter.', content: json(successEnvelope(MatterSavedData)) },
    404: clientNotFound404,
    409: error('Another matter took the number at the same moment, three times (MATTER_NUMBER_IN_USE).'),
    422: error('The client has no valid number (MATTER_CLIENT_NUMBER_INVALID) or a choice is unknown (MATTER_CHOICE_INVALID).'),
    503: unavailable503,
  },
})

export const updateMatterRoute = defineRoute({
  method: 'patch',
  path: '/v1/matters/{matterId}',
  feature: 'matters',
  summary: "Changes a matter's title (fixed on a `.0` matter), description, status and opened date, and adds Initial Notes when given.",
  access: { roles: MATTER_WRITE_ROLES },
  errors: ['MATTER_NOT_FOUND', 'MATTER_CHOICE_INVALID', 'MATTERS_UNAVAILABLE'],
  sideEffects: ['Writes matter and matter_activity_log (Initial Notes)', 'Writes audit_log'],
  request: { params: MatterParams, body: { content: json(MatterUpdateBody), required: true } },
  responses: { 200: { description: 'The matter after the change.', content: json(successEnvelope(MatterSavedData)) }, 404: matterNotFound404, 422: choice422, 503: unavailable503 },
})

export const matterDeleteCheckRoute = defineRoute({
  method: 'get',
  path: '/v1/matters/{matterId}/delete-check',
  feature: 'matters',
  summary: 'Whether the viewer may delete the matter, and which records (or the `.0` rule) block it.',
  access: { roles: MATTER_READ_ROLES },
  errors: ['MATTER_NOT_FOUND', 'MATTERS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: MatterParams },
  responses: { 200: { description: 'The delete check.', content: json(successEnvelope(MatterDeleteCheckData)) }, 404: matterNotFound404, 503: unavailable503 },
})

export const deleteMatterRoute = defineRoute({
  method: 'delete',
  path: '/v1/matters/{matterId}',
  feature: 'matters',
  summary: 'Deletes a matter that has no records, with its party, access and staff rows, after the typed confirmation `Delete Matter <number>` (super admin).',
  access: { roles: ['super_admin'] },
  errors: ['MATTER_NOT_FOUND', 'MATTER_DELETE_CONFIRMATION_MISMATCH', 'MATTER_GENERAL_PROTECTED', 'MATTER_HAS_RECORDS', 'MATTERS_UNAVAILABLE'],
  sideEffects: ['Deletes matter, matter_party, matter_access and matter_staff_assignment rows', 'Writes audit_log'],
  request: { params: MatterParams, body: { content: json(MatterDeleteBody), required: true } },
  responses: {
    200: { description: 'The matter was deleted.', content: json(successEnvelope(MatterDeletedData)) },
    404: matterNotFound404,
    409: error('The matter is the `.0` Client General Matters (MATTER_GENERAL_PROTECTED) or has records (MATTER_HAS_RECORDS, listed in `details.blockingItems`).'),
    422: error('The confirmation is not exactly `Delete Matter <number>` (MATTER_DELETE_CONFIRMATION_MISMATCH).'),
    503: unavailable503,
  },
})

/** Maps a matter refusal or a database failure to its reply; anything else is thrown on. */
function matterFailure(c: Context<AppEnv>, caught: unknown) {
  if (caught instanceof MatterError) return failure(c, caught.status, caught.code, caught.message, caught.details)
  if (caught instanceof MattersUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'MATTERS', message: caught.message }))
    return failure(c, 503, 'MATTERS_UNAVAILABLE', 'Matters are not available right now.')
  }
  throw caught
}

/**
 * Registers one matters route. Typed loosely on purpose, as Teams' and Billing's: every route shares the shape
 * (queries, actor, rule, reply).
 */
function handle(
  app: OpenAPIHono<AppEnv>,
  route: ReturnType<typeof defineRoute>,
  tag: string,
  work: (q: MatterQueries, actor: MatterActor, c: Context<AppEnv>) => Promise<unknown>,
) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = matterQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'MATTERS_UNAVAILABLE', 'Matters are not available right now.')
    try {
      const actor: MatterActor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') }
      const data = await work(queries, actor, c)
      logLine(`MATTERS:${tag}`, c.get('requestId'), { route: route.path })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (caught) {
      return matterFailure(c, caught)
    }
  }) as any)
}

const param = <T,>(c: Context<AppEnv>) => (c.req as any).valid('param') as T
const body = <T,>(c: Context<AppEnv>) => (c.req as any).valid('json') as T

export function registerMatters(app: OpenAPIHono<AppEnv>) {
  handle(app, clientMattersRoute, 'list', (q, actor, c) => loadClientMatters(q, actor, param<MatterClientParams>(c).clientId))
  handle(app, createMatterRoute, 'create', (q, actor, c) => createMatter(q, actor, param<MatterClientParams>(c).clientId, body<MatterCreateBody>(c), new Date().toISOString()))
  handle(app, updateMatterRoute, 'update', (q, actor, c) => updateMatter(q, actor, param<MatterParams>(c).matterId, body<MatterUpdateBody>(c), new Date().toISOString()))
  handle(app, matterDeleteCheckRoute, 'delete-check', (q, actor, c) => checkMatterDelete(q, actor, param<MatterParams>(c).matterId))
  handle(app, deleteMatterRoute, 'delete', (q, actor, c) => deleteMatter(q, actor, param<MatterParams>(c).matterId, body<MatterDeleteBody>(c)))
}
