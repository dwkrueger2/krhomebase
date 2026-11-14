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
import type { ApiReply } from '@krhomebase/tool-sdk/types'
import type { FeedbackKind, FeedbackListData, FeedbackPriority, FeedbackSavedData, FeedbackStatus } from './feedbackTypes.ts'

/** Which requests the list shows. Empty values mean "all". */
export interface ListFilter {
  status?: FeedbackStatus
  kind?: FeedbackKind
  cursor?: string
}

/** A status and priority change, with an optional note saved with it. */
export interface FeedbackChange {
  status: FeedbackStatus
  priority: FeedbackPriority
  note?: string
}

/** Requests per page. The API allows 1 to 100. */
export const PAGE_SIZE = 50

export interface FeedbackApi {
  list(filter: ListFilter): Promise<ApiReply<FeedbackListData>>
  /** One row only, to learn what the person may do (`viewer`) when the tool opens straight on a request. */
  viewer(): Promise<ApiReply<FeedbackListData>>
  get(number: number): Promise<ApiReply<FeedbackSavedData>>
  change(number: number, change: FeedbackChange): Promise<ApiReply<FeedbackSavedData>>
  addNote(number: number, text: string): Promise<ApiReply<FeedbackSavedData>>
}

/**
 * The four calls this tool makes.
 *
 * @param api - `host.api` from the tool kit.
 * @returns The calls, each resolving with the API's reply.
 */
export function feedbackApi(api: ToolApi): FeedbackApi {
  return {
    list(filter) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (filter.status) query.set('status', filter.status)
      if (filter.kind) query.set('kind', filter.kind)
      if (filter.cursor) query.set('cursor', filter.cursor)
      return api.get<FeedbackListData>(`/v1/homebase-feedback?${query.toString()}`)
    },
    viewer() {
      return api.get<FeedbackListData>('/v1/homebase-feedback?limit=1')
    },
    get(number) {
      return api.get<FeedbackSavedData>(`/v1/homebase-feedback/${number}`)
    },
    change(number, change) {
      const note = change.note?.trim()
      return api.patch<FeedbackSavedData>(`/v1/homebase-feedback/${number}`, { status: change.status, priority: change.priority, ...(note ? { note } : {}) })
    },
    addNote(number, text) {
      return api.post<FeedbackSavedData>(`/v1/homebase-feedback/${number}/notes`, { text: text.trim() })
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
