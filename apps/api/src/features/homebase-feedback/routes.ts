// file: apps/api/src/features/homebase-feedback/routes.ts
/**
 * Homebase Feedback routes (plan `docs/12_Homebase_Feedback_Plan.md`, stage F1, section 4.3; decisions in section
 * 7.1, Nov 13, 2026). Requests about KR Homebase itself, FB-0001 upwards:
 *
 *   POST  /v1/homebase-feedback                  send a request (anyone signed in)
 *   GET   /v1/homebase-feedback/mine             the caller's own requests, with `viewer` (anyone signed in)
 *   GET   /v1/homebase-feedback                  every request (permission developer_tools.read)
 *   GET   /v1/homebase-feedback/{number}         one request (developers; or its sender, without notes)
 *   PATCH /v1/homebase-feedback/{number}         status and priority (permission developer_tools.update)
 *   POST  /v1/homebase-feedback/{number}/notes   a developer note (permission developer_tools.update)
 *
 * The image upload (`POST .../{number}/images`) comes with stage F3. `/mine` is registered before `{number}`.
 * Until migration 033 is applied every route answers 503 `HOMEBASE_FEEDBACK_MIGRATION_REQUIRED`. Rules: `rules.ts`.
 * Writes pass the write gate and are audited (resource `homebase-feedback`). Outside tools: closed.
 */

import {
  ErrorEnvelope,
  HomebaseFeedbackCreateBody,
  HomebaseFeedbackListData,
  HomebaseFeedbackListQuery,
  HomebaseFeedbackMineQuery,
  HomebaseFeedbackNoteBody,
  HomebaseFeedbackParams,
  HomebaseFeedbackSavedData,
  HomebaseFeedbackUpdateBody,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { isAuthorized } from '../permissions/rules.ts'
import { HomebaseFeedbackMigrationRequiredError, homebaseFeedbackQueriesFor, HomebaseFeedbackUnavailableError, type HomebaseFeedbackQueries } from './queries.ts'
import { addFeedbackNote, changeFeedback, createFeedback, DEVELOPER_RESOURCE, getFeedback, HomebaseFeedbackError, listFeedback, listMyFeedback, type FeedbackActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE_CODES = ['HOMEBASE_FEEDBACK_UNAVAILABLE', 'HOMEBASE_FEEDBACK_MIGRATION_REQUIRED']
const unavailable503 = error(
  'Homebase Feedback cannot be read or saved right now (HOMEBASE_FEEDBACK_UNAVAILABLE), or migration 033 (the feedback tables) is not applied yet (HOMEBASE_FEEDBACK_MIGRATION_REQUIRED).',
)
const savedReply = { description: 'The request.', content: json(successEnvelope(HomebaseFeedbackSavedData)) }
const listReply = { description: 'One page of requests, newest first, and what the caller may do.', content: json(successEnvelope(HomebaseFeedbackListData)) }
const notFound404 = error('No request has that number, or it is not the caller\'s and the caller is not a developer (HOMEBASE_FEEDBACK_NOT_FOUND).')

export const createHomebaseFeedbackRoute = defineRoute({
  method: 'post',
  path: '/v1/homebase-feedback',
  feature: 'homebase-feedback',
  summary: 'Sends a feedback request about KR Homebase with the next number (FB-0001 upwards), the markers its text names and the page it was sent from.',
  access: 'signed-in',
  errors: ['HOMEBASE_FEEDBACK_NUMBER_EXHAUSTED', ...UNAVAILABLE_CODES],
  sideEffects: ['Writes homebase_feedback', 'Writes homebase_feedback_marker', 'Writes audit_log'],
  request: { body: { content: json(HomebaseFeedbackCreateBody), required: true } },
  responses: { 200: savedReply, 409: error('No free number after eight tries (HOMEBASE_FEEDBACK_NUMBER_EXHAUSTED).'), 503: unavailable503 },
})

export const myHomebaseFeedbackRoute = defineRoute({
  method: 'get',
  path: '/v1/homebase-feedback/mine',
  feature: 'homebase-feedback',
  summary: "The caller's own feedback requests, newest first, one page at a time, with whether the caller is a developer (`viewer.isDeveloper`).",
  access: 'signed-in',
  errors: ['HOMEBASE_FEEDBACK_CURSOR_INVALID', ...UNAVAILABLE_CODES],
  sideEffects: ['None'],
  request: { query: HomebaseFeedbackMineQuery },
  responses: { 200: listReply, 422: error('The cursor is not valid (HOMEBASE_FEEDBACK_CURSOR_INVALID).'), 503: unavailable503 },
})

export const homebaseFeedbackListRoute = defineRoute({
  method: 'get',
  path: '/v1/homebase-feedback',
  feature: 'homebase-feedback',
  summary: 'Every feedback request, newest first, by status and kind, one page at a time (Internal Developers).',
  access: 'signed-in',
  permission: { resource: DEVELOPER_RESOURCE, action: 'read' },
  errors: ['HOMEBASE_FEEDBACK_STATUS_INVALID', 'HOMEBASE_FEEDBACK_CURSOR_INVALID', ...UNAVAILABLE_CODES],
  sideEffects: ['None'],
  request: { query: HomebaseFeedbackListQuery },
  responses: {
    200: listReply,
    422: error('A status is not a feedback status (HOMEBASE_FEEDBACK_STATUS_INVALID) or the cursor is not valid (HOMEBASE_FEEDBACK_CURSOR_INVALID).'),
    503: unavailable503,
  },
})

export const homebaseFeedbackRoute = defineRoute({
  method: 'get',
  path: '/v1/homebase-feedback/{number}',
  feature: 'homebase-feedback',
  summary: 'One feedback request with its markers, images and notes; an Internal Developer may read any request, anyone else only their own, without the notes.',
  access: 'signed-in',
  errors: ['HOMEBASE_FEEDBACK_NOT_FOUND', ...UNAVAILABLE_CODES],
  sideEffects: ['None'],
  request: { params: HomebaseFeedbackParams },
  responses: { 200: savedReply, 404: notFound404, 503: unavailable503 },
})

export const updateHomebaseFeedbackRoute = defineRoute({
  method: 'patch',
  path: '/v1/homebase-feedback/{number}',
  feature: 'homebase-feedback',
  summary: "Changes a feedback request's status or priority; each change is recorded as a note, with the optional note text.",
  access: 'signed-in',
  permission: { resource: DEVELOPER_RESOURCE, action: 'update' },
  errors: ['HOMEBASE_FEEDBACK_NOT_FOUND', ...UNAVAILABLE_CODES],
  sideEffects: ['Writes homebase_feedback', 'Writes homebase_feedback_note', 'Writes audit_log'],
  request: { params: HomebaseFeedbackParams, body: { content: json(HomebaseFeedbackUpdateBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 503: unavailable503 },
})

export const homebaseFeedbackNoteRoute = defineRoute({
  method: 'post',
  path: '/v1/homebase-feedback/{number}/notes',
  feature: 'homebase-feedback',
  summary: 'Adds a developer note to a feedback request.',
  access: 'signed-in',
  permission: { resource: DEVELOPER_RESOURCE, action: 'update' },
  errors: ['HOMEBASE_FEEDBACK_NOT_FOUND', ...UNAVAILABLE_CODES],
  sideEffects: ['Writes homebase_feedback_note', 'Writes homebase_feedback', 'Writes audit_log'],
  request: { params: HomebaseFeedbackParams, body: { content: json(HomebaseFeedbackNoteBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 503: unavailable503 },
})

/** Maps a refusal or a database failure to its reply; anything else is thrown on. */
function feedbackFailure(c: Context<AppEnv>, caught: unknown) {
  if (caught instanceof HomebaseFeedbackError) return failure(c, caught.status, caught.code, caught.message)
  if (caught instanceof HomebaseFeedbackMigrationRequiredError) {
    logLine('HOMEBASE_FEEDBACK:migration-required', c.get('requestId'), { migration: '033' })
    return failure(c, 503, 'HOMEBASE_FEEDBACK_MIGRATION_REQUIRED', 'Homebase Feedback needs its migration (033) to be applied.')
  }
  if (caught instanceof HomebaseFeedbackUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'HOMEBASE_FEEDBACK', message: caught.message.slice(0, 300) }))
    return failure(c, 503, 'HOMEBASE_FEEDBACK_UNAVAILABLE', 'Homebase Feedback is not available right now.')
  }
  throw caught
}

/**
 * Whether the person holds `developer_tools` read and update (the built-in Super Admin holds every permission). When
 * the permissions cannot be read the answer is no, and it is logged: the routes that need it have already passed the
 * route's own permission check, so this only decides what the screen offers.
 */
async function developerAccess(c: Context<AppEnv>, userId: string): Promise<{ isDeveloper: boolean; canTriage: boolean }> {
  const queries = permissionQueriesFor(c.env)
  if (!queries) return { isDeveloper: false, canTriage: false }
  try {
    const [isDeveloper, canTriage] = await Promise.all([isAuthorized(queries, userId, DEVELOPER_RESOURCE, 'read'), isAuthorized(queries, userId, DEVELOPER_RESOURCE, 'update')])
    return { isDeveloper, canTriage }
  } catch (caught) {
    logLine('HOMEBASE_FEEDBACK:permissions-unavailable', c.get('requestId'), { reason: caught instanceof Error ? caught.message.slice(0, 80) : 'unknown' })
    return { isDeveloper: false, canTriage: false }
  }
}

/** Registers one route. Typed loosely on purpose, as Tasks' and Leads': every route shares the shape. */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, work: (q: HomebaseFeedbackQueries, actor: FeedbackActor, c: Context<AppEnv>) => Promise<unknown>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = homebaseFeedbackQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'HOMEBASE_FEEDBACK_UNAVAILABLE', 'Homebase Feedback is not available right now.')
    try {
      const access = await developerAccess(c, session.userId)
      const actor: FeedbackActor = { userId: session.userId, email: session.email ?? '', role: session.role ?? '', requestId: c.get('requestId'), ...access }
      const data = await work(queries, actor, c)
      logLine(`HOMEBASE_FEEDBACK:${tag}`, c.get('requestId'), { route: route.path, isDeveloper: access.isDeveloper })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (caught) {
      return feedbackFailure(c, caught)
    }
  }) as any)
}

const valid = <T,>(c: Context<AppEnv>, part: 'param' | 'query' | 'json') => (c.req as any).valid(part) as T

export function registerHomebaseFeedback(app: OpenAPIHono<AppEnv>) {
  const now = () => new Date().toISOString()
  handle(app, createHomebaseFeedbackRoute, 'create', (q, actor, c) => createFeedback(q, actor, valid<HomebaseFeedbackCreateBody>(c, 'json'), now()))
  // The fixed path before `{number}`.
  handle(app, myHomebaseFeedbackRoute, 'mine', (q, actor, c) => listMyFeedback(q, actor, valid<HomebaseFeedbackMineQuery>(c, 'query')))
  handle(app, homebaseFeedbackListRoute, 'list', (q, actor, c) => listFeedback(q, actor, valid<HomebaseFeedbackListQuery>(c, 'query')))
  handle(app, homebaseFeedbackRoute, 'get', (q, actor, c) => getFeedback(q, actor, valid<HomebaseFeedbackParams>(c, 'param').number))
  handle(app, updateHomebaseFeedbackRoute, 'update', (q, actor, c) => changeFeedback(q, actor, valid<HomebaseFeedbackParams>(c, 'param').number, valid<HomebaseFeedbackUpdateBody>(c, 'json'), now()))
  handle(app, homebaseFeedbackNoteRoute, 'note', (q, actor, c) => addFeedbackNote(q, actor, valid<HomebaseFeedbackParams>(c, 'param').number, valid<HomebaseFeedbackNoteBody>(c, 'json'), now()))
}
