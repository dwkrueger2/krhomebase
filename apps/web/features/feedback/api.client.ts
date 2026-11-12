'use client'
// file: apps/web/features/feedback/api.client.ts
/**
 * The feedback area's calls to the API from the browser (Settings plan, stage 4e):
 *
 *   GET    /api/v1/site-feedback                     the newest feedback, up to 100 (super admin)
 *   PUT    /api/v1/site-feedback/{feedbackId}        change its review (super admin)
 *   DELETE /api/v1/site-feedback/{feedbackId}        delete it for good (super admin)
 *   POST   /api/v1/site-feedback/bulk-update         one review change for several (super admin)
 *   POST   /api/v1/site-feedback/bulk-delete         delete several for good (super admin)
 *   POST   /api/v1/site-feedback/{feedbackId}/vote   add a vote (firm staff)
 *
 * This site forwards them to the API Worker, which reaches the feedback through the public inquiry CRUD Worker.
 * Replies are checked against the shared contract; a failure throws `FeedbackApiError` with a plain sentence.
 */

import {
  ErrorEnvelope,
  SiteFeedbackCountData,
  SiteFeedbackData,
  SiteFeedbackSavedData,
  SiteFeedbackVoteData,
  successEnvelope,
  type SiteFeedbackBulkUpdateBody,
  type SiteFeedbackReviewBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed feedback call. */
export class FeedbackApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'FeedbackApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  SITE_FEEDBACK_UNAVAILABLE: 'Web Site Feedback cannot be reached right now. Try again later.',
  SITE_FEEDBACK_NOT_FOUND: 'That feedback no longer exists. Refresh the list.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may review Web Site Feedback.',
  VALIDATION_FAILED: 'One of the values was not accepted. Notes hold up to 4,000 characters and the assignee up to 120.',
}

const base = '/api/v1/site-feedback'

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[FEEDBACK_API:59] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new FeedbackApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[FEEDBACK_API:68] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new FeedbackApiError(code, ERROR_SENTENCES[code] ?? 'The feedback change was not saved.', response.status, requestId)
}

const one = (feedbackId: string) => `${base}/${encodeURIComponent(feedbackId)}`

/** The newest feedback (up to 100). */
export const fetchSiteFeedback = () => send(SiteFeedbackData, 'GET', base)
/** Changes one row's review. */
export const reviewSiteFeedback = (feedbackId: string, body: SiteFeedbackReviewBody) => send(SiteFeedbackSavedData, 'PUT', one(feedbackId), body)
/** Deletes one row for good. */
export const deleteSiteFeedback = (feedbackId: string) => send(SiteFeedbackCountData, 'DELETE', one(feedbackId))
/** One review change for several rows. */
export const bulkUpdateSiteFeedback = (body: SiteFeedbackBulkUpdateBody) => send(SiteFeedbackCountData, 'POST', `${base}/bulk-update`, body)
/** Deletes several rows for good. */
export const bulkDeleteSiteFeedback = (feedbackIds: string[]) => send(SiteFeedbackCountData, 'POST', `${base}/bulk-delete`, { feedbackIds })
/** Adds a vote. */
export const voteSiteFeedback = (feedbackId: string) => send(SiteFeedbackVoteData, 'POST', `${one(feedbackId)}/vote`)
