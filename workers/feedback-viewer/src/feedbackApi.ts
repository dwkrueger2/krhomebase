// file: workers/feedback-viewer/src/feedbackApi.ts
/**
 * The tool's calls to KR Homebase, all through the tool kit's frame bridge (`host.api` from `connectToHost`). The kit
 * passes each call to the KR Homebase page around the frame, which calls the API with the signed-in person's own
 * session. KR Homebase then checks the person (sign-in, role, the Internal Developer permission `developer_tools`) and
 * this tool (its registration, its role list and its permissions `homebase-feedback:read` / `:write`).
 *
 * Nothing here holds a secret, a cookie or a person's email. A refusal comes back as `{ ok: false, error }`; it
 * never throws (tool kit guide, section 4).
 */

import type { ToolApi } from '@krhomebase/tool-sdk/frame'
import type { ApiReply, ToolContext } from '@krhomebase/tool-sdk/types'
import type { FeedbackKind, FeedbackListData, FeedbackPriority, FeedbackSavedData, FeedbackStatus, FeedbackSummary } from './feedbackTypes.ts'

/** A status and priority change (and, since tool 1.8.0, the kind), with an optional note saved with it. */
export interface FeedbackChange {
  status: FeedbackStatus
  priority: FeedbackPriority
  /** A corrected kind (Bug, Usability, ...). Left out: the kind is not sent. */
  kind?: FeedbackKind
  note?: string
}

/** Requests per call while loading the list. The API allows 1 to 100. */
export const PAGE_SIZE = 100

/** At most this many calls for one list (10,000 requests), so a broken cursor can never loop for ever. */
export const MAX_LIST_CALLS = 100

/** Every request of one kind (or all), and what the person may do. */
export interface FeedbackAll {
  items: FeedbackSummary[]
  viewer: FeedbackListData['viewer']
}

export interface FeedbackApi {
  /**
   * Every request (one kind, or all), loaded 100 at a time through the API's pages (tool version 1.4.0): the list
   * screen sorts and pages them itself (`listTables.ts`), because the API lists newest first only.
   */
  listAll(kind?: FeedbackKind): Promise<ApiReply<FeedbackAll>>
  /** One row only, to learn what the person may do (`viewer`) when the tool opens straight on a request. */
  viewer(): Promise<ApiReply<FeedbackListData>>
  get(number: number): Promise<ApiReply<FeedbackSavedData>>
  change(number: number, change: FeedbackChange): Promise<ApiReply<FeedbackSavedData>>
  addNote(number: number, text: string): Promise<ApiReply<FeedbackSavedData>>
  /**
   * Who is using the tool (`GET /v1/tools/context`, any tool may ask): the signed-in person's name, for the line Save
   * and Mark Complete adds to its note (tool 1.7.0).
   */
  whoIsCalling(): Promise<ApiReply<ToolContext>>
}

/**
 * The calls this tool makes.
 *
 * @param api - `host.api` from the tool kit.
 * @returns The calls, each resolving with the API's reply.
 */
export function feedbackApi(api: ToolApi): FeedbackApi {
  return {
    async listAll(kind) {
      const items: FeedbackSummary[] = []
      let cursor: string | null = null
      for (let call = 0; call < MAX_LIST_CALLS; call++) {
        const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
        if (kind) query.set('kind', kind)
        if (cursor) query.set('cursor', cursor)
        const reply = await api.get<FeedbackListData>(`/v1/homebase-feedback?${query.toString()}`)
        if (!reply.ok) return reply
        items.push(...reply.data.items)
        cursor = reply.data.nextCursor
        if (!cursor) return { ...reply, data: { items, viewer: reply.data.viewer } }
      }
      return { ok: false, error: { code: 'LIST_TOO_LONG', message: `More than ${MAX_LIST_CALLS * PAGE_SIZE} requests: the list stopped there.` }, requestId: '', status: 0 }
    },
    viewer() {
      return api.get<FeedbackListData>('/v1/homebase-feedback?limit=1')
    },
    get(number) {
      return api.get<FeedbackSavedData>(`/v1/homebase-feedback/${number}`)
    },
    change(number, change) {
      const note = change.note?.trim()
      return api.patch<FeedbackSavedData>(`/v1/homebase-feedback/${number}`, {
        status: change.status,
        priority: change.priority,
        ...(change.kind ? { kind: change.kind } : {}),
        ...(note ? { note } : {}),
      })
    },
    addNote(number, text) {
      return api.post<FeedbackSavedData>(`/v1/homebase-feedback/${number}/notes`, { text: text.trim() })
    },
    whoIsCalling() {
      return api.get<ToolContext>('/v1/tools/context')
    },
  }
}

/**
 * Plain words for a refusal, by the API's stable error code (tool kit guide, section 8, and the API reference).
 * Includes the request id so the person can report it.
 */
export function problemText(error: { code: string; message: string; details?: unknown }, requestId: string): string {
  const reason = (error.details as { reason?: unknown } | undefined)?.reason
  let words: string
  switch (error.code) {
    case 'UNAUTHENTICATED':
      words = 'You are no longer signed in to KR Homebase. Sign in again, then reopen this tool.'
      break
    case 'PERMISSION_REQUIRED':
      words = 'You need the Internal Developer role set in KR Homebase for this. Ask a super admin to add it.'
      break
    case 'TOOL_FORBIDDEN':
      words =
        reason === 'role_not_allowed'
          ? "Your KR Homebase role is not on this tool's role list. Ask a super admin to add it."
          : reason === 'scope_not_granted'
            ? 'This tool was not granted the permission this needs (homebase-feedback:read or :write). Ask a super admin.'
            : reason === 'tool_disabled'
              ? 'A super admin has turned this tool off.'
              : `KR Homebase refused this tool (${String(reason ?? 'no reason given')}).`
      break
    case 'HOMEBASE_FEEDBACK_NOT_FOUND':
      words = 'No request has that number.'
      break
    case 'HOMEBASE_FEEDBACK_MIGRATION_REQUIRED':
    case 'HOMEBASE_FEEDBACK_UNAVAILABLE':
      words = 'Homebase Feedback cannot be read right now.'
      break
    case 'MAINTENANCE_IN_PROGRESS':
    case 'MAINTENANCE_LOCKED':
      words = 'KR Homebase is being updated. Try again in a few minutes.'
      break
    case 'BRIDGE_TIMEOUT':
    case 'BRIDGE_CLOSED':
      words = 'KR Homebase did not answer. Reload the tool.'
      break
    default:
      words = error.message || 'KR Homebase refused the request.'
  }
  return requestId ? `${words} (${error.code}, request ${requestId})` : `${words} (${error.code})`
}
