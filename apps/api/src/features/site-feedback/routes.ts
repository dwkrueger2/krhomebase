// file: apps/api/src/features/site-feedback/routes.ts
/**
 * Web Site Feedback routes (Settings plan, stage 4e). Replace the old `GET`/`POST
 * /krhomebase/api/kr-api-v1/site-feedback`, whose one POST chose its work by an `action` field.
 *
 *   GET    /v1/site-feedback                     the newest feedback, up to 100 (super admin)
 *   PUT    /v1/site-feedback/{feedbackId}        change its review (super admin)
 *   DELETE /v1/site-feedback/{feedbackId}        delete it for good (super admin)
 *   POST   /v1/site-feedback/bulk-update         the same review change for several (super admin)
 *   POST   /v1/site-feedback/bulk-delete         delete several for good (super admin)
 *   POST   /v1/site-feedback/{feedbackId}/vote   add a vote (firm staff roles, as the old route)
 *
 * The rows live in the public inquiry database, reached only through the public inquiry CRUD Worker
 * (`queries.ts`). Writes pass the write gate; each change writes an audit row in `krhomebase`. Outside tools: closed.
 */

import {
  ErrorEnvelope,
  SiteFeedbackBulkDeleteBody,
  SiteFeedbackBulkUpdateBody,
  SiteFeedbackCountData,
  SiteFeedbackData,
  SiteFeedbackParams,
  SiteFeedbackQuery,
  SiteFeedbackReviewBody,
  SiteFeedbackSavedData,
  SiteFeedbackVoteData,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { SiteFeedbackUnavailableError, siteFeedbackQueriesFor, type SiteFeedbackQueries } from './queries.ts'
import { bulkReviewFeedback, deleteFeedback, listFeedback, reviewFeedback, SiteFeedbackError, voteFeedback, type SiteFeedbackActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
/** The old route's internal roles that may vote (`KR_API_V1_INTERNAL_READ_ROLES`). */
const FIRM_STAFF = { roles: ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'front_end_author'] } as const
const WRITES = ['Writes site_feedback in the public inquiry database (through its CRUD Worker)', 'Writes audit_log']
const unavailable503 = { description: 'The feedback cannot be reached right now (SITE_FEEDBACK_UNAVAILABLE).', content: json(ErrorEnvelope) }
const notFound404 = { description: 'No feedback with that id (SITE_FEEDBACK_NOT_FOUND).', content: json(ErrorEnvelope) }
const countReply = { description: 'How many rows changed, and the ids not found.', content: json(successEnvelope(SiteFeedbackCountData)) }

export const siteFeedbackListRoute = defineRoute({
  method: 'get',
  path: '/v1/site-feedback',
  feature: 'site-feedback',
  summary: 'The newest Web Site Feedback (up to 100), optionally by review status and app context.',
  access: SUPER_ADMIN,
  errors: ['SITE_FEEDBACK_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: SiteFeedbackQuery },
  responses: { 200: { description: 'The feedback, newest first.', content: json(successEnvelope(SiteFeedbackData)) }, 503: unavailable503 },
})

export const siteFeedbackReviewRoute = defineRoute({
  method: 'put',
  path: '/v1/site-feedback/{feedbackId}',
  feature: 'site-feedback',
  summary: "Changes a feedback row's review: status, classification, priority, assignee and internal notes.",
  access: SUPER_ADMIN,
  errors: ['SITE_FEEDBACK_NOT_FOUND', 'SITE_FEEDBACK_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: SiteFeedbackParams, body: { content: json(SiteFeedbackReviewBody), required: true } },
  responses: { 200: { description: 'The feedback after the change.', content: json(successEnvelope(SiteFeedbackSavedData)) }, 404: notFound404, 503: unavailable503 },
})

export const siteFeedbackDeleteRoute = defineRoute({
  method: 'delete',
  path: '/v1/site-feedback/{feedbackId}',
  feature: 'site-feedback',
  summary: 'Deletes a feedback row for good (it cannot be brought back).',
  access: SUPER_ADMIN,
  errors: ['SITE_FEEDBACK_NOT_FOUND', 'SITE_FEEDBACK_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: SiteFeedbackParams },
  responses: { 200: countReply, 404: notFound404, 503: unavailable503 },
})

export const siteFeedbackBulkUpdateRoute = defineRoute({
  method: 'post',
  path: '/v1/site-feedback/bulk-update',
  feature: 'site-feedback',
  summary: 'Applies the same review change (status, classification, priority, assignee) to up to 100 rows.',
  access: SUPER_ADMIN,
  errors: ['SITE_FEEDBACK_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { body: { content: json(SiteFeedbackBulkUpdateBody), required: true } },
  responses: { 200: countReply, 503: unavailable503 },
})

export const siteFeedbackBulkDeleteRoute = defineRoute({
  method: 'post',
  path: '/v1/site-feedback/bulk-delete',
  feature: 'site-feedback',
  summary: 'Deletes up to 100 feedback rows for good.',
  access: SUPER_ADMIN,
  errors: ['SITE_FEEDBACK_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { body: { content: json(SiteFeedbackBulkDeleteBody), required: true } },
  responses: { 200: countReply, 503: unavailable503 },
})

export const siteFeedbackVoteRoute = defineRoute({
  method: 'post',
  path: '/v1/site-feedback/{feedbackId}/vote',
  feature: 'site-feedback',
  summary: 'Adds a vote to a feedback row; each person votes once, a super admin any number of times.',
  access: FIRM_STAFF,
  errors: ['SITE_FEEDBACK_NOT_FOUND', 'SITE_FEEDBACK_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: SiteFeedbackParams },
  responses: { 200: { description: 'The feedback after the vote.', content: json(successEnvelope(SiteFeedbackVoteData)) }, 404: notFound404, 503: unavailable503 },
})

/** Maps a refusal or an unreachable Worker to its reply; anything else is thrown on. */
function feedbackFailure(c: Context<AppEnv>, error: unknown) {
  if (error instanceof SiteFeedbackError) return failure(c, error.status, error.code, error.message)
  if (error instanceof SiteFeedbackUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'SITE_FEEDBACK', message: error.message }))
    return failure(c, 503, 'SITE_FEEDBACK_UNAVAILABLE', 'Web Site Feedback cannot be reached right now.')
  }
  throw error
}

// Valid input, read once the route has checked it (hono's `c.req.valid` is typed per route; the helper is shared).
const valid = <T,>(c: Context<AppEnv>, target: 'param' | 'json' | 'query'): T => (c.req as any).valid(target) as T

/**
 * Registers one feedback route: finds the Worker client and the person, runs `work`, answers `{ ok, data,
 * requestId }`. Typed loosely on purpose, as Billing's, Themes' and Teams' shared handlers.
 */
function handle<T>(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, work: (queries: SiteFeedbackQueries, actor: SiteFeedbackActor, now: string, c: Context<AppEnv>) => Promise<T>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = siteFeedbackQueriesFor(c.env as any)
    const session = c.get('session')
    if (!queries) {
      console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'SITE_FEEDBACK', message: 'PUBLIC_INQUIRY_WORKER binding or a Worker key is missing' }))
      return failure(c, 503, 'SITE_FEEDBACK_UNAVAILABLE', 'Web Site Feedback cannot be reached right now.')
    }
    try {
      const actor: SiteFeedbackActor = { userId: session?.userId ?? '', email: session?.email ?? null, role: session?.role ?? null, requestId: c.get('requestId') }
      const data = await work(queries, actor, new Date().toISOString(), c)
      logLine(`SITE_FEEDBACK:${tag}`, c.get('requestId'), {})
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return feedbackFailure(c, error)
    }
  }) as any)
}

export function registerSiteFeedback(app: OpenAPIHono<AppEnv>) {
  handle(app, siteFeedbackListRoute, 'list', (q, actor, _now, c) => listFeedback(q, valid<SiteFeedbackQuery>(c, 'query'), actor.requestId))
  // The two bulk routes are registered before /{feedbackId}/vote; their paths cannot clash with it anyway.
  handle(app, siteFeedbackBulkUpdateRoute, 'bulk_update', (q, actor, now, c) => bulkReviewFeedback(q, actor, valid<SiteFeedbackBulkUpdateBody>(c, 'json'), now))
  handle(app, siteFeedbackBulkDeleteRoute, 'bulk_delete', (q, actor, _now, c) => deleteFeedback(q, actor, valid<SiteFeedbackBulkDeleteBody>(c, 'json').feedbackIds))
  handle(app, siteFeedbackReviewRoute, 'review', async (q, actor, now, c) => ({ feedback: await reviewFeedback(q, actor, valid<SiteFeedbackParams>(c, 'param').feedbackId, valid<SiteFeedbackReviewBody>(c, 'json'), now) }))
  handle(app, siteFeedbackDeleteRoute, 'delete', async (q, actor, _now, c) => {
    const result = await deleteFeedback(q, actor, [valid<SiteFeedbackParams>(c, 'param').feedbackId])
    if (result.count === 0) throw new SiteFeedbackError('SITE_FEEDBACK_NOT_FOUND', 'That feedback no longer exists.', 404)
    return result
  })
  handle(app, siteFeedbackVoteRoute, 'vote', (q, actor, now, c) => voteFeedback(q, actor, valid<SiteFeedbackParams>(c, 'param').feedbackId, now))
}
