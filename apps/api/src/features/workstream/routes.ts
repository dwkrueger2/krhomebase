// file: apps/api/src/features/workstream/routes.ts
/**
 * Communications / WorkStream routes (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 2). They replace
 * the old `/krhomebase/api/workstream/{subgroup}` (list one type, create), `/{subgroup}/{wsid}` (read, change, move,
 * delete), `/workstream/assignees` and `/kr-api-v1/workstream/send-email` (recipients, preview, send):
 *
 *   GET    /v1/workstream                    a client's (and matter's) or a lead's entries, newest first, paged
 *   GET    /v1/workstream/feed               every entry, newest first, paged
 *   GET    /v1/workstream/assignees          staff users who may be assigned
 *   GET    /v1/workstream/email/recipients   a client's email addresses
 *   POST   /v1/workstream/email/preview      the email as it will look
 *   POST   /v1/workstream/email              send it and record an Emails entry
 *   GET    /v1/workstream/{wsid}             one entry
 *   POST   /v1/workstream                    create an entry (one entry for every type chosen; a Task type makes a task)
 *   PATCH  /v1/workstream/{wsid}             change the fields sent (types, task assignees)
 *   POST   /v1/workstream/{wsid}/move        move an entry to another client's .0 matter
 *   DELETE /v1/workstream/{wsid}             delete an entry (super admin)
 *
 * Who: every staff role (D9); email the old send roles; delete super admin. Rules: `rules.ts`. Writes pass the write
 * gate and are audited (resource `workstream`). Outside tools: closed. The fixed paths are registered before
 * `{wsid}` so they always win.
 */

import {
  ErrorEnvelope,
  successEnvelope,
  WorkstreamAssigneesData,
  WorkstreamCreateBody,
  WorkstreamDeletedData,
  WorkstreamEmailBody,
  WorkstreamEmailPreviewData,
  WorkstreamEmailRecipientsData,
  WorkstreamEmailRecipientsQuery,
  WorkstreamEmailSentData,
  WorkstreamFeedQuery,
  WorkstreamListData,
  WorkstreamListQuery,
  WorkstreamMoveBody,
  WorkstreamParams,
  WorkstreamSavedData,
  WorkstreamUpdateBody,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { mailerFor } from '../../platform/googleWorkspaceMailer.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { taskQueriesFor } from '../tasks/queries.ts'
import { createTask, replaceTaskAssignees, type TaskActor } from '../tasks/rules.ts'
import { WorkstreamUnavailableError, workstreamQueriesFor, type WorkstreamQueries } from './queries.ts'
import {
  createActivity,
  deleteActivity,
  emailRecipients,
  feedActivities,
  getActivity,
  listActivities,
  listAssignees,
  moveActivity,
  previewEmail,
  sendEmail,
  updateActivity,
  WORKSTREAM_EMAIL_ROLES,
  WORKSTREAM_ROLES,
  WorkstreamError,
  type WorkstreamActor,
  type WorkstreamTaskPort,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const STAFF = { roles: WORKSTREAM_ROLES }
const WRITES = ['Writes workstream_activity', 'Writes audit_log']
/** Create and change also write the other types and, for the Task type, the task (FB-0016, FB-0017). */
const ENTRY_WRITES = ['Writes workstream_activity and workstream_activity_type', 'Writes task and task_assignee (an entry with the Task type)', 'Writes audit_log']
const TASK_ERRORS = ['WORKSTREAM_ASSIGNEE_NOT_FOUND']
const unavailable503 = error('WorkStream cannot be read or saved right now (WORKSTREAM_UNAVAILABLE).')
const notFound404 = error('No entry with that id (WORKSTREAM_NOT_FOUND), or no such client or lead (WORKSTREAM_CLIENT_NOT_FOUND, WORKSTREAM_LEAD_NOT_FOUND).')
const owner422 = error('Owner or matter refused: WORKSTREAM_OWNER_REQUIRED, WORKSTREAM_MATTER_NOT_FOR_CLIENT, WORKSTREAM_LEAD_HAS_NO_MATTER, WORKSTREAM_GENERAL_MATTER_MISSING, WORKSTREAM_ASSIGNEE_CONFLICT, WORKSTREAM_CURSOR_INVALID.')
const listReply = { description: 'One page of entries, newest first.', content: json(successEnvelope(WorkstreamListData)) }
const savedReply = { description: 'The entry.', content: json(successEnvelope(WorkstreamSavedData)) }
const OWNER_ERRORS = ['WORKSTREAM_CLIENT_NOT_FOUND', 'WORKSTREAM_LEAD_NOT_FOUND', 'WORKSTREAM_MATTER_NOT_FOR_CLIENT', 'WORKSTREAM_LEAD_HAS_NO_MATTER', 'WORKSTREAM_GENERAL_MATTER_MISSING']

export const listWorkstreamRoute = defineRoute({
  method: 'get',
  path: '/v1/workstream',
  feature: 'workstream',
  summary: "A client's (optionally one matter's) or a lead's WorkStream entries, every type or one, newest first, one page at a time.",
  access: STAFF,
  errors: ['WORKSTREAM_OWNER_REQUIRED', 'WORKSTREAM_CURSOR_INVALID', 'WORKSTREAM_SUBGROUP_INVALID', ...OWNER_ERRORS, 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: WorkstreamListQuery },
  responses: { 200: listReply, 404: notFound404, 422: owner422, 503: unavailable503 },
})

export const workstreamFeedRoute = defineRoute({
  method: 'get',
  path: '/v1/workstream/feed',
  feature: 'workstream',
  summary: 'Every WorkStream entry of every client and lead, newest first, one page at a time (the Communications section).',
  access: STAFF,
  errors: ['WORKSTREAM_CURSOR_INVALID', 'WORKSTREAM_SUBGROUP_INVALID', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: WorkstreamFeedQuery },
  responses: { 200: listReply, 422: owner422, 503: unavailable503 },
})

export const workstreamAssigneesRoute = defineRoute({
  method: 'get',
  path: '/v1/workstream/assignees',
  feature: 'workstream',
  summary: 'The active staff users an entry may be assigned to, labeled with their staff code.',
  access: STAFF,
  errors: ['WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The users.', content: json(successEnvelope(WorkstreamAssigneesData)) }, 503: unavailable503 },
})

export const workstreamRecipientsRoute = defineRoute({
  method: 'get',
  path: '/v1/workstream/email/recipients',
  feature: 'workstream',
  summary: "A client's current email addresses (a group client's members'), primary first, for the email dialog.",
  access: STAFF,
  errors: ['WORKSTREAM_CLIENT_NOT_FOUND', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: WorkstreamEmailRecipientsQuery },
  responses: { 200: { description: 'The addresses.', content: json(successEnvelope(WorkstreamEmailRecipientsData)) }, 404: notFound404, 503: unavailable503 },
})

export const workstreamEmailPreviewRoute = defineRoute({
  method: 'post',
  path: '/v1/workstream/email/preview',
  feature: 'workstream',
  summary: 'The client email as it will be sent, with its `[KR <matter>]` subject tag. Nothing is sent or saved.',
  access: { roles: WORKSTREAM_EMAIL_ROLES },
  errors: [...OWNER_ERRORS, 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { body: { content: json(WorkstreamEmailBody), required: true } },
  responses: { 200: { description: 'The preview.', content: json(successEnvelope(WorkstreamEmailPreviewData)) }, 404: notFound404, 422: owner422, 503: unavailable503 },
})

export const workstreamEmailSendRoute = defineRoute({
  method: 'post',
  path: '/v1/workstream/email',
  feature: 'workstream',
  summary: "Sends a client email from the firm's mailbox and records it as an Emails entry on its matter (the client's .0 when none is chosen).",
  access: { roles: WORKSTREAM_EMAIL_ROLES },
  errors: [
    'WORKSTREAM_EMAIL_INVALID_RECIPIENT',
    'WORKSTREAM_EMAIL_INVALID_CC',
    'WORKSTREAM_EMAIL_SUBJECT_REQUIRED',
    'WORKSTREAM_EMAIL_MESSAGE_REQUIRED',
    'WORKSTREAM_EMAIL_NOT_CONFIGURED',
    'WORKSTREAM_EMAIL_FAILED',
    ...OWNER_ERRORS,
    'WORKSTREAM_UNAVAILABLE',
  ],
  sideEffects: ['Sends an email through Gmail (firm mailbox)', ...WRITES],
  request: { body: { content: json(WorkstreamEmailBody), required: true } },
  responses: {
    200: { description: 'Sent; the entry id, or why it was not recorded.', content: json(successEnvelope(WorkstreamEmailSentData)) },
    404: notFound404,
    422: error('An address, the subject or the message is missing or invalid, or the matter is refused.'),
    502: error('Gmail did not accept the email (WORKSTREAM_EMAIL_FAILED; the reason in `details.reason`).'),
    503: error('The firm mailbox is not set up (WORKSTREAM_EMAIL_NOT_CONFIGURED) or WorkStream is unavailable.'),
  },
})

export const getWorkstreamRoute = defineRoute({
  method: 'get',
  path: '/v1/workstream/{wsid}',
  feature: 'workstream',
  summary: 'One WorkStream entry by its seven-character id.',
  access: STAFF,
  errors: ['WORKSTREAM_NOT_FOUND', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: WorkstreamParams },
  responses: { 200: savedReply, 404: notFound404, 503: unavailable503 },
})

export const createWorkstreamRoute = defineRoute({
  method: 'post',
  path: '/v1/workstream',
  feature: 'workstream',
  summary: "Records one WorkStream entry, with every activity type chosen, for a client (on the chosen matter, else the client's .0) or for a lead; the Task type also makes a task on the Tasks screen.",
  access: STAFF,
  errors: [...OWNER_ERRORS, 'WORKSTREAM_ASSIGNEE_CONFLICT', ...TASK_ERRORS, 'WORKSTREAM_WSID_EXHAUSTED', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ENTRY_WRITES,
  request: { body: { content: json(WorkstreamCreateBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 409: error('No free WorkStream id after eight tries (WORKSTREAM_WSID_EXHAUSTED).'), 422: owner422, 503: unavailable503 },
})

export const updateWorkstreamRoute = defineRoute({
  method: 'patch',
  path: '/v1/workstream/{wsid}',
  feature: 'workstream',
  summary: "Changes the fields sent (types, matter of the same client, subject, note, next steps, time, assignee, the task's assignees); the rest stay as they are. Adding the Task type makes the task.",
  access: STAFF,
  errors: ['WORKSTREAM_NOT_FOUND', 'WORKSTREAM_MATTER_NOT_FOR_CLIENT', 'WORKSTREAM_LEAD_HAS_NO_MATTER', ...TASK_ERRORS, 'WORKSTREAM_TASK_TYPE_REQUIRED', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ENTRY_WRITES,
  request: { params: WorkstreamParams, body: { content: json(WorkstreamUpdateBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 422: owner422, 503: unavailable503 },
})

export const moveWorkstreamRoute = defineRoute({
  method: 'post',
  path: '/v1/workstream/{wsid}/move',
  feature: 'workstream',
  summary: "Moves (reassigns) an entry to a client's matter, the chosen one or else the client's .0; the entry leaves any lead.",
  access: STAFF,
  errors: ['WORKSTREAM_NOT_FOUND', 'WORKSTREAM_CLIENT_NOT_FOUND', 'WORKSTREAM_MATTER_NOT_FOR_CLIENT', 'WORKSTREAM_GENERAL_MATTER_MISSING', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: WorkstreamParams, body: { content: json(WorkstreamMoveBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 422: owner422, 503: unavailable503 },
})

export const deleteWorkstreamRoute = defineRoute({
  method: 'delete',
  path: '/v1/workstream/{wsid}',
  feature: 'workstream',
  summary: 'Deletes a WorkStream entry and its comments (super admin).',
  access: { roles: ['super_admin'] },
  errors: ['WORKSTREAM_NOT_FOUND', 'WORKSTREAM_UNAVAILABLE'],
  sideEffects: ['Deletes workstream_activity (and its comments)', 'Writes audit_log'],
  request: { params: WorkstreamParams },
  responses: { 200: { description: 'Deleted.', content: json(successEnvelope(WorkstreamDeletedData)) }, 404: notFound404, 503: unavailable503 },
})

/** Maps a WorkStream refusal or a database failure to its reply; anything else is thrown on. */
function workstreamFailure(c: Context<AppEnv>, caught: unknown) {
  if (caught instanceof WorkstreamError) return failure(c, caught.status, caught.code, caught.message, caught.details)
  if (caught instanceof WorkstreamUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'WORKSTREAM', message: caught.message }))
    return failure(c, 503, 'WORKSTREAM_UNAVAILABLE', 'WorkStream is not available right now.')
  }
  throw caught
}

/** Registers one route. Typed loosely on purpose, as Matters' and Teams': every route shares the shape. */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, work: (q: WorkstreamQueries, actor: WorkstreamActor, c: Context<AppEnv>) => Promise<unknown>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = workstreamQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'WORKSTREAM_UNAVAILABLE', 'WorkStream is not available right now.')
    try {
      const actor: WorkstreamActor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, displayName: session.displayName || session.email || session.userId, requestId: c.get('requestId') }
      const data = await work(queries, actor, c)
      logLine(`WORKSTREAM:${tag}`, c.get('requestId'), { route: route.path })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (caught) {
      return workstreamFailure(c, caught)
    }
  }) as any)
}

const valid = <T,>(c: Context<AppEnv>, part: 'param' | 'query' | 'json') => (c.req as any).valid(part) as T

/**
 * The Tasks rules for an entry's Task type (FB-0017), run as the same person: the task is made and reassigned with
 * the Tasks area's own checks and audit rows. Undefined without the database binding.
 */
function taskPortFor(c: Context<AppEnv>, actor: WorkstreamActor, now: string): WorkstreamTaskPort | undefined {
  const queries = taskQueriesFor(c.env)
  if (!queries) return undefined
  const taskActor: TaskActor = { userId: actor.userId, email: actor.email ?? '', role: actor.role ?? '', requestId: actor.requestId }
  return {
    async create(input) {
      const owner = { ...(input.clientId ? { clientId: input.clientId } : {}), ...(input.matterId ? { matterId: input.matterId } : {}) }
      // The assignees are always given, so the creator's Task Settings default is never asked.
      const saved = await createTask(queries, taskActor, { title: input.title, description: input.description, ...owner, assigneeUserIds: input.assigneeUserIds }, now, async () => false)
      return saved.task.id
    },
    async assign(taskId, assigneeUserIds) {
      await replaceTaskAssignees(queries, taskActor, taskId, { userIds: assigneeUserIds }, now)
    },
  }
}

export function registerWorkstream(app: OpenAPIHono<AppEnv>) {
  const now = () => new Date().toISOString()
  // Fixed paths first, so `feed`, `assignees` and `email` are never read as a `{wsid}`.
  handle(app, workstreamFeedRoute, 'feed', (q, _actor, c) => feedActivities(q, valid<WorkstreamFeedQuery>(c, 'query')))
  handle(app, workstreamAssigneesRoute, 'assignees', (q) => listAssignees(q))
  handle(app, workstreamRecipientsRoute, 'email-recipients', (q, _actor, c) => emailRecipients(q, valid<WorkstreamEmailRecipientsQuery>(c, 'query').clientId))
  handle(app, workstreamEmailPreviewRoute, 'email-preview', (q, actor, c) => previewEmail(q, actor, valid<WorkstreamEmailBody>(c, 'json')))
  handle(app, workstreamEmailSendRoute, 'email-send', (q, actor, c) => sendEmail(q, mailerFor(c.env as never), actor, valid<WorkstreamEmailBody>(c, 'json'), now()))
  handle(app, listWorkstreamRoute, 'list', (q, _actor, c) => listActivities(q, valid<WorkstreamListQuery>(c, 'query')))
  handle(app, createWorkstreamRoute, 'create', (q, actor, c) => {
    const at = now()
    return createActivity(q, actor, valid<WorkstreamCreateBody>(c, 'json'), at, taskPortFor(c, actor, at))
  })
  handle(app, getWorkstreamRoute, 'get', (q, _actor, c) => getActivity(q, valid<WorkstreamParams>(c, 'param').wsid))
  handle(app, updateWorkstreamRoute, 'update', (q, actor, c) => {
    const at = now()
    return updateActivity(q, actor, valid<WorkstreamParams>(c, 'param').wsid, valid<WorkstreamUpdateBody>(c, 'json'), at, taskPortFor(c, actor, at))
  })
  handle(app, moveWorkstreamRoute, 'move', (q, actor, c) => moveActivity(q, actor, valid<WorkstreamParams>(c, 'param').wsid, valid<WorkstreamMoveBody>(c, 'json').clientId, now(), valid<WorkstreamMoveBody>(c, 'json').matterId))
  handle(app, deleteWorkstreamRoute, 'delete', (q, actor, c) => deleteActivity(q, actor, valid<WorkstreamParams>(c, 'param').wsid))
}
