// file: apps/api/src/features/tasks/routes.ts
/**
 * Tasks routes (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 5). They replace the old `GET`, `POST`,
 * `PATCH /krhomebase/api/tasks`:
 *
 *   GET   /v1/tasks                       tasks by due date (no due date last), paged; open ones unless asked
 *   GET   /v1/tasks/{taskId}              one task
 *   POST  /v1/tasks                       create a task with its assignees
 *   PATCH /v1/tasks/{taskId}              change the fields sent
 *   PUT   /v1/tasks/{taskId}/assignees    replace the current assignees
 *
 * Task ids are seven-character public codes (D21). The default assignee follows the creator's Task Settings
 * preference (D20). Who: every staff role (D9, the same as WorkStream). No delete route. Rules: `rules.ts`. Writes pass the write gate
 * and are audited (resource `tasks`). Outside tools: closed.
 */

import { DEFAULT_USER_PREFERENCES, ErrorEnvelope, successEnvelope, TaskAssigneesBody, TaskCreateBody, TaskParams, TasksData, TaskSavedData, TasksQuery, TaskUpdateBody } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { PreferencesUnavailableError, preferenceQueriesFor } from '../preferences/queries.ts'
import { loadPreferences } from '../preferences/rules.ts'
import { TasksUnavailableError, taskQueriesFor, type TaskQueries } from './queries.ts'
import { createTask, getTask, listTasks, replaceTaskAssignees, TASK_ROLES, TaskError, updateTask, type TaskActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const STAFF = { roles: TASK_ROLES }
const unavailable503 = error('Tasks cannot be read or saved right now (TASKS_UNAVAILABLE).')
const savedReply = { description: 'The task.', content: json(successEnvelope(TaskSavedData)) }
const LINK_ERRORS = ['TASK_CLIENT_NOT_FOUND', 'TASK_MATTER_NOT_FOUND', 'TASK_MATTER_NOT_FOR_CLIENT', 'TASK_SUPERVISOR_NOT_FOUND']
const link404 = 'no such client or matter (TASK_CLIENT_NOT_FOUND, TASK_MATTER_NOT_FOUND)'
const link422 = 'the matter is not a primary-client matter of the client (TASK_MATTER_NOT_FOR_CLIENT), or the supervisor is not an active staff user (TASK_SUPERVISOR_NOT_FOUND)'

export const tasksRoute = defineRoute({
  method: 'get',
  path: '/v1/tasks',
  feature: 'tasks',
  summary: 'Tasks by due date (no due date last, then newest recorded) with their current assignees; open ones unless closed ones are asked for; one page at a time.',
  access: STAFF,
  errors: ['TASK_STATUS_INVALID', 'TASK_CURSOR_INVALID', 'TASKS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: TasksQuery },
  responses: {
    200: { description: 'One page of tasks.', content: json(successEnvelope(TasksData)) },
    422: error('A status is not a task status (TASK_STATUS_INVALID) or the cursor is not valid (TASK_CURSOR_INVALID).'),
    503: unavailable503,
  },
})

export const taskRoute = defineRoute({
  method: 'get',
  path: '/v1/tasks/{taskId}',
  feature: 'tasks',
  summary: 'One task with its current assignees.',
  access: STAFF,
  errors: ['TASK_NOT_FOUND', 'TASKS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: TaskParams },
  responses: { 200: savedReply, 404: error('No task has that id (TASK_NOT_FOUND).'), 503: unavailable503 },
})

export const createTaskRoute = defineRoute({
  method: 'post',
  path: '/v1/tasks',
  feature: 'tasks',
  summary: "Creates a task with a new seven-character public id and its assignees (when none are given, the caller unless their Task Settings say nobody); the client, matter, supervisor and assignees are checked.",
  access: STAFF,
  errors: [...LINK_ERRORS, 'TASK_ASSIGNEE_NOT_FOUND', 'TASK_ID_EXHAUSTED', 'TASKS_UNAVAILABLE'],
  sideEffects: ['Writes task', 'Writes task_assignee', 'Writes audit_log'],
  request: { body: { content: json(TaskCreateBody), required: true } },
  responses: {
    200: savedReply,
    404: error(`A link was not found: ${link404}.`),
    409: error('No free task id after eight tries (TASK_ID_EXHAUSTED).'),
    422: error(`A refused field: ${link422}, or an assignee is not an active staff user (TASK_ASSIGNEE_NOT_FOUND).`),
    503: unavailable503,
  },
})

export const updateTaskRoute = defineRoute({
  method: 'patch',
  path: '/v1/tasks/{taskId}',
  feature: 'tasks',
  summary: "Changes a task's fields (only the fields sent; null clears what may be cleared); the completion time follows the status.",
  access: STAFF,
  errors: ['TASK_NOT_FOUND', ...LINK_ERRORS, 'TASKS_UNAVAILABLE'],
  sideEffects: ['Writes task', 'Writes audit_log'],
  request: { params: TaskParams, body: { content: json(TaskUpdateBody), required: true } },
  responses: {
    200: savedReply,
    404: error(`No task has that id (TASK_NOT_FOUND), or ${link404}.`),
    422: error(`A refused field: ${link422}.`),
    503: unavailable503,
  },
})

export const taskAssigneesRoute = defineRoute({
  method: 'put',
  path: '/v1/tasks/{taskId}/assignees',
  feature: 'tasks',
  summary: "Replaces a task's current assignees: removed users' rows are ended, returning users' rows come back, the first assignee is the task's main assignee.",
  access: STAFF,
  errors: ['TASK_NOT_FOUND', 'TASK_ASSIGNEE_NOT_FOUND', 'TASKS_UNAVAILABLE'],
  sideEffects: ['Writes task_assignee', 'Writes task', 'Writes audit_log'],
  request: { params: TaskParams, body: { content: json(TaskAssigneesBody), required: true } },
  responses: {
    200: savedReply,
    404: error('No task has that id (TASK_NOT_FOUND).'),
    422: error('An assignee is not an active staff user (TASK_ASSIGNEE_NOT_FOUND).'),
    503: unavailable503,
  },
})

/** Maps a refusal or a database failure to its reply; anything else is thrown on. */
function taskFailure(c: Context<AppEnv>, caught: unknown) {
  if (caught instanceof TaskError) return failure(c, caught.status, caught.code, caught.message)
  if (caught instanceof TasksUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'TASKS', message: caught.message }))
    return failure(c, 503, 'TASKS_UNAVAILABLE', 'Tasks are not available right now.')
  }
  throw caught
}

/** Registers one route. Typed loosely on purpose, as Leads' and Workstream's: every route shares the shape. */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, work: (q: TaskQueries, actor: TaskActor, c: Context<AppEnv>) => Promise<unknown>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = taskQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'TASKS_UNAVAILABLE', 'Tasks are not available right now.')
    try {
      const actor: TaskActor = { userId: session.userId, email: session.email ?? '', role: session.role ?? '', requestId: c.get('requestId') }
      const data = await work(queries, actor, c)
      logLine(`TASKS:${tag}`, c.get('requestId'), { route: route.path })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (caught) {
      return taskFailure(c, caught)
    }
  }) as any)
}

/**
 * The creator's Task Settings preference `assignCreatorByDefault` (D20), read through the preferences area's own
 * queries. When the preferences cannot be read (no binding, or the table missing) the default (true) is used, so a
 * task can still be created; the failure is logged.
 */
async function assignCreatorByDefault(c: Context<AppEnv>, actor: TaskActor): Promise<boolean> {
  const queries = preferenceQueriesFor(c.env)
  if (!queries) return DEFAULT_USER_PREFERENCES.assignCreatorByDefault
  try {
    return (await loadPreferences(queries, actor.userId)).preferences.assignCreatorByDefault
  } catch (caught) {
    if (!(caught instanceof PreferencesUnavailableError)) throw caught
    logLine('TASKS:preferences-unavailable', actor.requestId, { fallback: DEFAULT_USER_PREFERENCES.assignCreatorByDefault })
    return DEFAULT_USER_PREFERENCES.assignCreatorByDefault
  }
}

const valid = <T,>(c: Context<AppEnv>, part: 'param' | 'query' | 'json') => (c.req as any).valid(part) as T

export function registerTasks(app: OpenAPIHono<AppEnv>) {
  const now = () => new Date().toISOString()
  handle(app, tasksRoute, 'list', (q, actor, c) => listTasks(q, actor, valid<TasksQuery>(c, 'query')))
  handle(app, createTaskRoute, 'create', (q, actor, c) => createTask(q, actor, valid<TaskCreateBody>(c, 'json'), now(), () => assignCreatorByDefault(c, actor)))
  handle(app, taskRoute, 'get', (q, _actor, c) => getTask(q, valid<TaskParams>(c, 'param').taskId))
  handle(app, updateTaskRoute, 'update', (q, actor, c) => updateTask(q, actor, valid<TaskParams>(c, 'param').taskId, valid<TaskUpdateBody>(c, 'json'), now()))
  handle(app, taskAssigneesRoute, 'assignees', (q, actor, c) => replaceTaskAssignees(q, actor, valid<TaskParams>(c, 'param').taskId, valid<TaskAssigneesBody>(c, 'json'), now()))
}
