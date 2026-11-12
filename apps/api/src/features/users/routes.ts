// file: apps/api/src/features/users/routes.ts
/**
 * Users and Invites routes (Settings plan, stage 4d; super admin only, as before). Replace the old
 * `GET`/`POST`/`PATCH /krhomebase/api/kr-api-v1/users`, `GET`/`PATCH`/`DELETE /krhomebase/api/kr-api-v1/user-invites`
 * and `PUT /krhomebase/api/admin/users/{userId}/role-sets`, one route per action:
 *
 *   GET    /v1/users                               users, invitations not accepted, role sets
 *   POST   /v1/users                               create a user (invitation emailed, or active at once)
 *   PUT    /v1/users/{userId}                      status, staff code and role sets in one save
 *   POST   /v1/users/{userId}/employee             enroll as an employee
 *   POST   /v1/user-invites/{inviteId}/resend      send a new invitation in place of this one
 *   POST   /v1/user-invites/{inviteId}/cancel      cancel a pending invitation
 *   DELETE /v1/user-invites/{inviteId}             delete an invitation that is no longer pending
 *
 * Rules: `rules.ts`. Email: `src/platform/googleWorkspaceMailer.ts`. Writes pass the write gate and are audited
 * (resource `users`). Outside tools: closed.
 */

import { CreateUserBody, ErrorEnvelope, InviteParams, ResendInviteBody, successEnvelope, UpdateUserBody, UserParams, UserSavedData, UsersData } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { mailerFor, type MailerEnv } from '../../platform/googleWorkspaceMailer.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { RoleSetsUnavailableError, roleSetQueriesFor } from '../role-sets/queries.ts'
import { loadRoleSets } from '../role-sets/rules.ts'
import { UsersUnavailableError, userQueriesFor } from './queries.ts'
import { cancelInvite, createUser, deleteInvite, enrollEmployee, loadUsers, resendInvite, updateUser, UserError, type UserContext } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const savedReply = { description: 'What changed, the invitation made (if any) and every user after the change.', content: json(successEnvelope(UserSavedData)) }
const notFound = (what: string, code: string) => ({ description: `No ${what} with that id (${code}).`, content: json(ErrorEnvelope) })
const refused = (description: string) => ({ description, content: json(ErrorEnvelope) })
const unavailable503 = refused('Users cannot be read or saved right now (USERS_UNAVAILABLE).')
const INVITE_WRITES = ['Writes user_invite', 'Writes audit_log']

export const usersRoute = defineRoute({
  method: 'get',
  path: '/v1/users',
  feature: 'users',
  summary: 'Every user with their status, role sets and employee record, every invitation not accepted, and the active role sets.',
  access: SUPER_ADMIN,
  errors: ['USERS_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The users.', content: json(successEnvelope(UsersData)) }, 503: unavailable503 },
})

export const createUserRoute = defineRoute({
  method: 'post',
  path: '/v1/users',
  feature: 'users',
  summary: 'Creates a user with a role set, either invited (an email with a sign-in link) or active at once; an inactive account may be invited again.',
  access: SUPER_ADMIN,
  errors: ['PENDING_INVITE_ALREADY_EXISTS', 'USER_EMAIL_ALREADY_EXISTS', 'USER_SSO_EMAIL_ALREADY_EXISTS', 'USER_ROLE_SET_REQUIRED', 'ROLE_SET_NOT_ASSIGNABLE', 'USERS_UNAVAILABLE'],
  sideEffects: ['Writes individual, individual_contact_method, user, employee, user_role_set and user_invite', 'Sends the invitation email (Gmail API)', 'Writes audit_log'],
  request: { body: { content: json(CreateUserBody), required: true } },
  responses: {
    200: savedReply,
    409: refused('An open invitation, a user or a Google sign-in already has this email.'),
    422: refused('No role set to activate with (USER_ROLE_SET_REQUIRED), or one that cannot be given (ROLE_SET_NOT_ASSIGNABLE).'),
    503: unavailable503,
  },
})

export const updateUserRoute = defineRoute({
  method: 'put',
  path: '/v1/users/{userId}',
  feature: 'users',
  summary: "Changes a user's account status, staff code and role sets (the list replaces the current one) in one save.",
  access: SUPER_ADMIN,
  errors: ['USER_NOT_FOUND', 'SUPER_ADMIN_OR_SELF_STATUS_CHANGE_BLOCKED', 'SELF_SUPER_ADMIN_DEMOTION_BLOCKED', 'ROLE_SET_NOT_ASSIGNABLE', 'PRIMARY_ROLE_SET_INVALID', 'STAFF_CODE_REQUIRED', 'USER_NOT_EMPLOYEE', 'STAFF_CODE_IN_USE', 'USERS_UNAVAILABLE'],
  sideEffects: ['Writes user, employee and user_role_set', 'Writes audit_log'],
  request: { params: UserParams, body: { content: json(UpdateUserBody), required: true } },
  responses: {
    200: savedReply,
    404: notFound('user', 'USER_NOT_FOUND'),
    409: refused('Another employee has that staff code (STAFF_CODE_IN_USE).'),
    422: refused('A blocked status or role change, a role set that cannot be given, or a missing staff code.'),
    503: unavailable503,
  },
})

export const enrollEmployeeRoute = defineRoute({
  method: 'post',
  path: '/v1/users/{userId}/employee',
  feature: 'users',
  summary: 'Enrolls a user as an employee (next employee number, also the staff code) and adds the Staff role set, keeping the others.',
  access: SUPER_ADMIN,
  errors: ['USER_NOT_FOUND', 'USER_ALREADY_EMPLOYEE', 'USERS_UNAVAILABLE'],
  sideEffects: ['Writes employee and user_role_set', 'Writes audit_log'],
  request: { params: UserParams },
  responses: { 200: savedReply, 404: notFound('user', 'USER_NOT_FOUND'), 409: refused('Already an employee (USER_ALREADY_EMPLOYEE).'), 503: unavailable503 },
})

export const resendInviteRoute = defineRoute({
  method: 'post',
  path: '/v1/user-invites/{inviteId}/resend',
  feature: 'users',
  summary: 'Sends a new invitation in place of this one; the old one is marked revoked. An accepted invitation is refused.',
  access: SUPER_ADMIN,
  errors: ['INVITE_NOT_FOUND', 'INVITE_ALREADY_ACCEPTED', 'USERS_UNAVAILABLE'],
  sideEffects: ['Writes user_invite', 'Sends the invitation email (Gmail API)', 'Writes audit_log'],
  request: { params: InviteParams, body: { content: json(ResendInviteBody), required: true } },
  responses: { 200: savedReply, 404: notFound('invitation', 'INVITE_NOT_FOUND'), 409: refused('Already accepted (INVITE_ALREADY_ACCEPTED).'), 503: unavailable503 },
})

export const cancelInviteRoute = defineRoute({
  method: 'post',
  path: '/v1/user-invites/{inviteId}/cancel',
  feature: 'users',
  summary: 'Cancels a pending invitation (stored as revoked); its link stops working.',
  access: SUPER_ADMIN,
  errors: ['INVITE_NOT_FOUND', 'INVITE_NOT_PENDING', 'USERS_UNAVAILABLE'],
  sideEffects: INVITE_WRITES,
  request: { params: InviteParams },
  responses: { 200: savedReply, 404: notFound('invitation', 'INVITE_NOT_FOUND'), 409: refused('Not pending (INVITE_NOT_PENDING).'), 503: unavailable503 },
})

export const deleteInviteRoute = defineRoute({
  method: 'delete',
  path: '/v1/user-invites/{inviteId}',
  feature: 'users',
  summary: 'Deletes an invitation that is no longer pending (cancelled, expired or superseded). Accepted invitations are kept.',
  access: SUPER_ADMIN,
  errors: ['INVITE_NOT_FOUND', 'INVITE_STILL_PENDING', 'INVITE_ALREADY_ACCEPTED', 'USERS_UNAVAILABLE'],
  sideEffects: ['Deletes a user_invite row', 'Writes audit_log'],
  request: { params: InviteParams },
  responses: { 200: savedReply, 404: notFound('invitation', 'INVITE_NOT_FOUND'), 409: refused('Still pending (INVITE_STILL_PENDING) or accepted (INVITE_ALREADY_ACCEPTED).'), 503: unavailable503 },
})

/** Maps a refusal or a missing table to its reply; anything else is thrown on. */
function userFailure(c: Context<AppEnv>, error: unknown) {
  if (error instanceof UserError) return failure(c, error.status, error.code, error.message)
  if (error instanceof UsersUnavailableError || error instanceof RoleSetsUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'USERS', message: error.message }))
    return failure(c, 503, 'USERS_UNAVAILABLE', 'Users are not available right now.')
  }
  throw error
}

type Handler = (context: UserContext, c: Context<AppEnv>) => Promise<unknown>

/** Registers one write. Typed loosely on purpose, as Teams' and Billing's: every write route shares the shape. */
function handleWrite(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, run: Handler) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = userQueriesFor(c.env)
    const roleSetQueries = roleSetQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !roleSetQueries || !session) return failure(c, 503, 'USERS_UNAVAILABLE', 'Users are not available right now.')
    try {
      const env = (c.env ?? {}) as unknown as MailerEnv
      const context: UserContext = {
        queries,
        actor: { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') },
        now: new Date().toISOString(),
        mailer: mailerFor(env),
        appBaseUrl: typeof env.KR_APP_BASE_URL === 'string' && env.KR_APP_BASE_URL ? env.KR_APP_BASE_URL : new URL(c.req.url).origin,
        loadRoleSets: () => loadRoleSets(roleSetQueries),
      }
      const data = (await run(context, c)) as { userId: string | null; invitation: { emailSent: boolean } | null }
      logLine(`USERS:${tag}`, c.get('requestId'), { userId: data.userId ?? '-', emailSent: data.invitation ? data.invitation.emailSent : undefined })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return userFailure(c, error)
    }
  }) as any)
}

const param = <T,>(c: Context<AppEnv>) => (c.req as any).valid('param') as T
const body = <T,>(c: Context<AppEnv>) => (c.req as any).valid('json') as T

export function registerUsers(app: OpenAPIHono<AppEnv>) {
  app.openapi(usersRoute, async (c) => {
    const queries = userQueriesFor(c.env)
    const roleSetQueries = roleSetQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !roleSetQueries || !session) return failure(c, 503, 'USERS_UNAVAILABLE', 'Users are not available right now.')
    try {
      const data = await loadUsers(queries, await loadRoleSets(roleSetQueries), session.userId)
      logLine('USERS:list', c.get('requestId'), { users: data.users.length, invites: data.invites.length })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return userFailure(c, error) as any
    }
  })
  handleWrite(app, createUserRoute, 'create', (context, c) => createUser(context, body<CreateUserBody>(c)))
  handleWrite(app, updateUserRoute, 'update', (context, c) => updateUser(context, param<UserParams>(c).userId, body<UpdateUserBody>(c)))
  handleWrite(app, enrollEmployeeRoute, 'enroll', (context, c) => enrollEmployee(context, param<UserParams>(c).userId))
  handleWrite(app, resendInviteRoute, 'resend', (context, c) => resendInvite(context, param<InviteParams>(c).inviteId, body<ResendInviteBody>(c).expirationDays))
  handleWrite(app, cancelInviteRoute, 'cancel', (context, c) => cancelInvite(context, param<InviteParams>(c).inviteId))
  handleWrite(app, deleteInviteRoute, 'delete-invite', (context, c) => deleteInvite(context, param<InviteParams>(c).inviteId))
}
