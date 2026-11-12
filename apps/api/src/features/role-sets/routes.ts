// file: apps/api/src/features/role-sets/routes.ts
/**
 * Role Sets routes (Settings plan, stage 4c). Replace the old `GET`/`POST`/`DELETE /krhomebase/api/admin/role-sets`
 * (super admin only, as before). The old single POST created or changed a role set by `roleSetId`; here creating and
 * changing are separate routes, and retiring takes the id in the path instead of the query.
 *
 *   GET    /v1/role-sets               the active role sets with their grants and holder counts
 *   POST   /v1/role-sets               create a custom role set
 *   PUT    /v1/role-sets/{roleSetId}   change a custom role set
 *   DELETE /v1/role-sets/{roleSetId}   retire a custom role set and end its assignments
 *
 * Rules: `rules.ts`. Writes pass the write gate and are audited (resource `role-sets`). Outside tools: closed.
 */

import { ErrorEnvelope, RoleSetBody, RoleSetParams, RoleSetSavedData, RoleSetsData, successEnvelope } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { RoleSetsUnavailableError, roleSetQueriesFor } from './queries.ts'
import { loadRoleSets, retireRoleSet, RoleSetError, saveRoleSet, type RoleSetActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const WRITES = ['Writes role_set, role_set_permission and role_set_permission_scope', 'Writes audit_log']
const savedReply = { description: 'The role set id and every active role set after the change.', content: json(successEnvelope(RoleSetSavedData)) }
const notFound404 = { description: 'No active role set with that id (ROLE_SET_NOT_FOUND).', content: json(ErrorEnvelope) }
const unavailable503 = { description: 'Role sets cannot be read or saved right now (ROLE_SETS_UNAVAILABLE).', content: json(ErrorEnvelope) }

export const roleSetsRoute = defineRoute({
  method: 'get',
  path: '/v1/role-sets',
  feature: 'role-sets',
  summary: 'The active role sets, each with its grants (every record and by scope) and how many people hold it.',
  access: SUPER_ADMIN,
  errors: ['ROLE_SETS_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The role sets.', content: json(successEnvelope(RoleSetsData)) }, 503: unavailable503 },
})

export const createRoleSetRoute = defineRoute({
  method: 'post',
  path: '/v1/role-sets',
  feature: 'role-sets',
  summary: 'Creates a custom role set with its name, description and grants; protected grants are dropped.',
  access: SUPER_ADMIN,
  errors: ['ROLE_SET_NAME_IN_USE', 'ROLE_SETS_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { body: { content: json(RoleSetBody), required: true } },
  responses: {
    200: savedReply,
    409: { description: 'Another active role set has that name (ROLE_SET_NAME_IN_USE).', content: json(ErrorEnvelope) },
    503: unavailable503,
  },
})

export const updateRoleSetRoute = defineRoute({
  method: 'put',
  path: '/v1/role-sets/{roleSetId}',
  feature: 'role-sets',
  summary: 'Changes a custom role set; the grant lists replace the current ones. Built-in role sets are read-only.',
  access: SUPER_ADMIN,
  errors: ['ROLE_SET_NOT_FOUND', 'ROLE_SET_BUILT_IN', 'ROLE_SET_NAME_IN_USE', 'ROLE_SETS_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: RoleSetParams, body: { content: json(RoleSetBody), required: true } },
  responses: {
    200: savedReply,
    404: notFound404,
    409: { description: 'A built-in role set (ROLE_SET_BUILT_IN), or another active role set has that name (ROLE_SET_NAME_IN_USE).', content: json(ErrorEnvelope) },
    503: unavailable503,
  },
})

export const retireRoleSetRoute = defineRoute({
  method: 'delete',
  path: '/v1/role-sets/{roleSetId}',
  feature: 'role-sets',
  summary: 'Retires a custom role set and ends every active assignment to it (rows are kept). Built-in role sets cannot be retired.',
  access: SUPER_ADMIN,
  errors: ['ROLE_SET_NOT_FOUND', 'ROLE_SET_BUILT_IN', 'ROLE_SETS_UNAVAILABLE'],
  sideEffects: ['Writes role_set and user_role_set', 'Writes audit_log'],
  request: { params: RoleSetParams },
  responses: {
    200: savedReply,
    404: notFound404,
    409: { description: 'A built-in role set (ROLE_SET_BUILT_IN).', content: json(ErrorEnvelope) },
    503: unavailable503,
  },
})

/** Maps a role set refusal or a missing table to its reply; anything else is thrown on. */
function roleSetFailure(c: Context<AppEnv>, error: unknown) {
  if (error instanceof RoleSetError) return failure(c, error.status, error.code, error.message)
  if (error instanceof RoleSetsUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'ROLE_SETS', message: error.message }))
    return failure(c, 503, 'ROLE_SETS_UNAVAILABLE', 'Role sets are not available right now.')
  }
  throw error
}

type Write = 'create' | 'update' | 'retire'

/** Registers one role set write. Typed loosely on purpose, as Teams' and Billing's: every write route shares the shape. */
function handleWrite(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, write: Write) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = roleSetQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'ROLE_SETS_UNAVAILABLE', 'Role sets are not available right now.')
    try {
      const actor: RoleSetActor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') }
      const now = new Date().toISOString()
      const roleSetId = write === 'create' ? null : ((c.req as any).valid('param') as RoleSetParams).roleSetId
      const data =
        write === 'retire' && roleSetId
          ? await retireRoleSet(queries, actor, roleSetId, now)
          : await saveRoleSet(queries, actor, roleSetId, (c.req as any).valid('json') as RoleSetBody, now)
      logLine(`ROLE_SETS:${write}`, c.get('requestId'), { roleSetId: data.roleSetId, assignmentsEnded: data.assignmentsEnded })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return roleSetFailure(c, error)
    }
  }) as any)
}

export function registerRoleSets(app: OpenAPIHono<AppEnv>) {
  app.openapi(roleSetsRoute, async (c) => {
    const queries = roleSetQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'ROLE_SETS_UNAVAILABLE', 'Role sets are not available right now.')
    try {
      const roleSets = await loadRoleSets(queries)
      logLine('ROLE_SETS:list', c.get('requestId'), { roleSets: roleSets.length })
      return c.json({ ok: true as const, data: { roleSets }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return roleSetFailure(c, error) as any
    }
  })
  handleWrite(app, createRoleSetRoute, 'create')
  handleWrite(app, updateRoleSetRoute, 'update')
  handleWrite(app, retireRoleSetRoute, 'retire')
}
