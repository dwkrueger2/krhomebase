'use client'
// file: apps/web/features/communications/api.client.ts
/**
 * The Communications / WorkStream calls to the API from the browser (plan 10, stage 2):
 *
 *   GET    /api/v1/workstream                   a client's (and matter's) or a lead's entries, newest first, paged
 *   GET    /api/v1/workstream/feed              every entry, newest first, paged
 *   GET    /api/v1/workstream/assignees         staff users who may be assigned
 *   GET    /api/v1/workstream/{wsid}            one entry
 *   POST   /api/v1/workstream                   create an entry (D12: a client entry lands on the chosen matter, else .0)
 *   PATCH  /api/v1/workstream/{wsid}            change the fields sent
 *   POST   /api/v1/workstream/{wsid}/move       move to another client's .0 matter
 *   DELETE /api/v1/workstream/{wsid}            delete (super admin)
 *   GET    /api/v1/workstream/email/recipients  a client's email addresses
 *   POST   /api/v1/workstream/email/preview     the email as it will look
 *   POST   /api/v1/workstream/email             send it and record an Emails entry
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract; a failure throws
 * `WorkstreamApiError` with a plain sentence for the screen (the old screens showed the raw code). The old screens
 * made seven calls per load, one per activity type; one call now returns every type, newest first.
 */

import {
  ErrorEnvelope,
  successEnvelope,
  WorkstreamAssigneesData,
  WorkstreamDeletedData,
  WorkstreamEmailPreviewData,
  WorkstreamEmailRecipientsData,
  WorkstreamEmailSentData,
  WorkstreamListData,
  WorkstreamSavedData,
  type WorkstreamCreateBody,
  type WorkstreamEmailBody,
  type WorkstreamSubgroup,
  type WorkstreamUpdateBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed WorkStream call. */
export class WorkstreamApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'WorkstreamApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  WORKSTREAM_UNAVAILABLE: 'WorkStream cannot be read or saved right now. Try again in a moment.',
  WORKSTREAM_NOT_FOUND: 'That WorkStream entry no longer exists. Reload the list.',
  WORKSTREAM_CLIENT_NOT_FOUND: 'That client account no longer exists.',
  WORKSTREAM_LEAD_NOT_FOUND: 'That lead no longer exists.',
  WORKSTREAM_OWNER_REQUIRED: 'Choose a client or a lead first.',
  WORKSTREAM_MATTER_NOT_FOR_CLIENT: 'That matter does not belong to this client.',
  WORKSTREAM_LEAD_HAS_NO_MATTER: 'A lead\'s entries have no matter.',
  WORKSTREAM_GENERAL_MATTER_MISSING: 'This client has no .0 Client General Matters, so the entry has nowhere to go. Add the .0 matter first.',
  WORKSTREAM_ASSIGNEE_CONFLICT: 'Assign the entry to a user or to a contact, not both.',
  WORKSTREAM_CURSOR_INVALID: 'The list changed. Load it again.',
  WORKSTREAM_WSID_EXHAUSTED: 'A WorkStream id could not be assigned. Save again.',
  WORKSTREAM_EMAIL_INVALID_RECIPIENT: 'Give at least one valid recipient address.',
  WORKSTREAM_EMAIL_INVALID_CC: 'A copy address is not valid.',
  WORKSTREAM_EMAIL_SUBJECT_REQUIRED: 'The email needs a subject.',
  WORKSTREAM_EMAIL_MESSAGE_REQUIRED: 'The email needs a message.',
  WORKSTREAM_EMAIL_NOT_CONFIGURED: 'The firm mailbox is not set up on this server, so email cannot be sent.',
  WORKSTREAM_EMAIL_FAILED: 'Gmail did not accept the email.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'You may not do this.',
  VALIDATION_FAILED: 'Something in the entry is missing or too long (a subject is required).',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[WORKSTREAM_API:86] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new WorkstreamApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[WORKSTREAM_API:95] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new WorkstreamApiError(code, ERROR_SENTENCES[code] ?? 'The WorkStream entry was not saved.', response.status, requestId, refusal.success ? refusal.data.error.details : undefined)
}

/** What a list asks for: one owner (client, optionally a matter, or lead), or the whole feed when neither is given. */
export interface WorkstreamListRequest {
  clientId?: string | null
  leadId?: string | null
  matterId?: string | null
  subgroup?: WorkstreamSubgroup | null
  /** Several types, comma-separated (`PhoneCalls,Notes`); null or empty means every type. */
  subgroups?: string | null
  assigneeUserId?: string | null
  limit?: number
  cursor?: string | null
}

/** One page of entries, newest first; `nextCursor` is set when more exist (D10). */
export function fetchWorkstream(request: WorkstreamListRequest): Promise<WorkstreamListData> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) if (value !== null && value !== undefined && value !== '') query.set(key, String(value))
  const isFeed = !request.clientId && !request.leadId
  if (isFeed) query.delete('matterId')
  return send(WorkstreamListData, 'GET', `/api/v1/workstream${isFeed ? '/feed' : ''}?${query.toString()}`)
}

export function fetchWorkstreamEntry(wsid: string): Promise<WorkstreamSavedData> {
  return send(WorkstreamSavedData, 'GET', `/api/v1/workstream/${encodeURIComponent(wsid)}`)
}

export function fetchWorkstreamAssignees(): Promise<WorkstreamAssigneesData> {
  return send(WorkstreamAssigneesData, 'GET', '/api/v1/workstream/assignees')
}

export function createWorkstreamEntry(body: WorkstreamCreateBody): Promise<WorkstreamSavedData> {
  return send(WorkstreamSavedData, 'POST', '/api/v1/workstream', body)
}

export function updateWorkstreamEntry(wsid: string, body: WorkstreamUpdateBody): Promise<WorkstreamSavedData> {
  return send(WorkstreamSavedData, 'PATCH', `/api/v1/workstream/${encodeURIComponent(wsid)}`, body)
}

/** Reassigns an entry to a client's matter (the client's `.0` when no matter is given; D12, D16). */
export function moveWorkstreamEntry(wsid: string, clientId: string, matterId?: string | null): Promise<WorkstreamSavedData> {
  return send(WorkstreamSavedData, 'POST', `/api/v1/workstream/${encodeURIComponent(wsid)}/move`, matterId ? { clientId, matterId } : { clientId })
}

export function deleteWorkstreamEntry(wsid: string): Promise<WorkstreamDeletedData> {
  return send(WorkstreamDeletedData, 'DELETE', `/api/v1/workstream/${encodeURIComponent(wsid)}`)
}

export function fetchEmailRecipients(clientId: string): Promise<WorkstreamEmailRecipientsData> {
  return send(WorkstreamEmailRecipientsData, 'GET', `/api/v1/workstream/email/recipients?clientId=${encodeURIComponent(clientId)}`)
}

export function previewWorkstreamEmail(body: WorkstreamEmailBody): Promise<WorkstreamEmailPreviewData> {
  return send(WorkstreamEmailPreviewData, 'POST', '/api/v1/workstream/email/preview', body)
}

export function sendWorkstreamEmail(body: WorkstreamEmailBody): Promise<WorkstreamEmailSentData> {
  return send(WorkstreamEmailSentData, 'POST', '/api/v1/workstream/email', body)
}
