'use client'
// file: apps/web/features/homebase-feedback/api.client.ts
/**
 * The Homebase Feedback calls to the API from the browser (plan `docs/12_Homebase_Feedback_Plan.md`, stage F2):
 *
 *   POST /api/v1/homebase-feedback             send a request (anyone signed in)
 *   GET  /api/v1/homebase-feedback/mine        the person's own requests, with `viewer.isDeveloper`
 *   GET  /api/v1/homebase-feedback             every request (Internal Developers)
 *   GET  /api/v1/homebase-feedback/{number}    one request (developers; or its sender)
 *
 * This site forwards the calls to the API Worker. Replies are checked against the shared contract
 * (`@krhomebase/contracts`, `homebaseFeedback.ts`); a failure throws `HomebaseFeedbackApiError` with a plain sentence
 * for the screen. Requests are saved in the live database, also under `pnpm dev`.
 */

import {
  ErrorEnvelope,
  HomebaseFeedbackListData,
  HomebaseFeedbackSavedData,
  successEnvelope,
  type HomebaseFeedbackCreateBody,
  type HomebaseFeedbackStatus,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed Homebase Feedback call: the API's code, a plain sentence, the HTTP status and the request id. */
export class HomebaseFeedbackApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'HomebaseFeedbackApiError'
  }
}

/** One plain sentence for every code the Homebase Feedback routes and the shared gates can answer. */
export const HOMEBASE_FEEDBACK_ERROR_SENTENCES: Readonly<Record<string, string>> = {
  HOMEBASE_FEEDBACK_MIGRATION_REQUIRED: 'Feedback is waiting for its database update (migration 033). Nothing can be sent until it is applied.',
  HOMEBASE_FEEDBACK_UNAVAILABLE: 'Feedback cannot be read or sent right now. Try again in a moment.',
  HOMEBASE_FEEDBACK_NOT_FOUND: 'That request no longer exists, or it is not yours.',
  HOMEBASE_FEEDBACK_NUMBER_EXHAUSTED: 'A request number could not be assigned. Send again.',
  HOMEBASE_FEEDBACK_STATUS_INVALID: 'That status is not a feedback status.',
  HOMEBASE_FEEDBACK_CURSOR_INVALID: 'The list changed. Load it again.',
  VALIDATION_FAILED: 'A title and a description are required.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  MAINTENANCE_GATE_UNAVAILABLE: 'Changes cannot be checked for maintenance right now. Try again in a moment.',
  PERMISSION_REQUIRED: 'Only Internal Developers may see every request.',
  PERMISSIONS_UNAVAILABLE: 'Your permissions cannot be read right now. Try again in a moment.',
  SESSION_VALIDATION_UNAVAILABLE: 'Your session cannot be checked right now. Try again in a moment.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'You may not do this.',
  INTERNAL_ERROR: 'Something went wrong in KR Homebase. Try again.',
  NETWORK_ERROR: 'KR Homebase could not be reached. Check the connection and try again.',
  UNEXPECTED_REPLY: 'KR Homebase sent a reply the screen could not read. Try again.',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[HOMEBASE_FEEDBACK_API:63] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new HomebaseFeedbackApiError('NETWORK_ERROR', HOMEBASE_FEEDBACK_ERROR_SENTENCES.NETWORK_ERROR!, 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[HOMEBASE_FEEDBACK_API:72] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new HomebaseFeedbackApiError(code, HOMEBASE_FEEDBACK_ERROR_SENTENCES[code] ?? (refusal.success ? refusal.data.error.message : 'The request was not sent.'), response.status, requestId)
}

/** Sends a request; the reply carries its number (`FB-0012`). */
export function sendHomebaseFeedback(body: HomebaseFeedbackCreateBody): Promise<HomebaseFeedbackSavedData> {
  return send(HomebaseFeedbackSavedData, 'POST', '/api/v1/homebase-feedback', body)
}

/** The person's own requests, newest first, with whether they are an Internal Developer. */
export function fetchMyHomebaseFeedback(cursor?: string | null): Promise<HomebaseFeedbackListData> {
  const query = new URLSearchParams({ limit: '50' })
  if (cursor) query.set('cursor', cursor)
  return send(HomebaseFeedbackListData, 'GET', `/api/v1/homebase-feedback/mine?${query.toString()}`)
}

/** Every request, newest first (Internal Developers), optionally only some statuses. */
export function fetchAllHomebaseFeedback(request: { statuses?: readonly HomebaseFeedbackStatus[]; cursor?: string | null } = {}): Promise<HomebaseFeedbackListData> {
  const query = new URLSearchParams({ limit: '50' })
  if (request.statuses?.length) query.set('status', request.statuses.join(','))
  if (request.cursor) query.set('cursor', request.cursor)
  return send(HomebaseFeedbackListData, 'GET', `/api/v1/homebase-feedback?${query.toString()}`)
}

/** One request with its markers, the captured page and (for a developer) its notes. */
export function fetchHomebaseFeedback(code: string): Promise<HomebaseFeedbackSavedData> {
  return send(HomebaseFeedbackSavedData, 'GET', `/api/v1/homebase-feedback/${encodeURIComponent(code)}`)
}
