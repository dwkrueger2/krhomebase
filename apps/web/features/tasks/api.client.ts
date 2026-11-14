'use client'
// file: apps/web/features/tasks/api.client.ts
/**
 * The Tasks calls to the API from the browser (plan 10, stage 5):
 *
 *   GET   /api/v1/tasks                       tasks by due date (no due date last), paged; open ones unless asked
 *   GET   /api/v1/tasks/{taskId}              one task
 *   POST  /api/v1/tasks                       create (the API makes the seven-character id; D21)
 *   PATCH /api/v1/tasks/{taskId}              change the fields sent
 *   PUT   /api/v1/tasks/{taskId}/assignees    replace the current assignees
 *
 * This site forwards the calls to the API Worker. Replies are checked against the shared contract
 * (`@krhomebase/contracts`, `tasks.ts`); a failure throws `TasksApiError` with a plain sentence for the screen. The
 * staff list for the assignee and supervisor choices is the WorkStream one (`fetchWorkstreamAssignees` in
 * `features/communications/api.client.ts`), and a client's matters come from `fetchClientMatters`
 * (`features/matters/api.client.ts`). Saves go to the live database, also under `pnpm dev`.
 */

import {
  ErrorEnvelope,
  successEnvelope,
  TasksData,
  TaskSavedData,
  type TaskCreateBody,
  type TaskUpdateBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed Tasks call: the API's code, a plain sentence, the HTTP status and the request id. */
export class TasksApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'TasksApiError'
  }
}

/** One plain sentence for every code the Tasks routes and the shared gates can answer. */
export const TASK_ERROR_SENTENCES: Readonly<Record<string, string>> = {
  TASKS_UNAVAILABLE: 'Tasks cannot be read or saved right now. Try again in a moment.',
  TASK_NOT_FOUND: 'That task no longer exists. Reload the list.',
  TASK_STATUS_INVALID: 'That status is not a task status.',
  TASK_CURSOR_INVALID: 'The list changed. Load it again.',
  TASK_CLIENT_NOT_FOUND: 'That client no longer exists. Choose another client.',
  TASK_MATTER_NOT_FOUND: 'That matter no longer exists. Choose another matter.',
  TASK_MATTER_NOT_FOR_CLIENT: 'That matter does not belong to the chosen client. Choose one of its matters.',
  TASK_SUPERVISOR_NOT_FOUND: 'The supervisor must be an active staff user.',
  TASK_ASSIGNEE_NOT_FOUND: 'Every assignee must be an active staff user.',
  TASK_ID_EXHAUSTED: 'A task number could not be assigned. Save again.',
  VALIDATION_FAILED: 'Something in the task is missing or not allowed. A title is required; billing value is 0 or more.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  MAINTENANCE_GATE_UNAVAILABLE: 'Changes cannot be checked for maintenance right now. Try again in a moment.',
  PERMISSION_REQUIRED: 'You need permission for this.',
  PERMISSIONS_UNAVAILABLE: 'Your permissions cannot be read right now. Try again in a moment.',
  SESSION_VALIDATION_UNAVAILABLE: 'Your session cannot be checked right now. Try again in a moment.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'You may not do this.',
  INTERNAL_ERROR: 'Something went wrong in KR Homebase. Try again.',
  NETWORK_ERROR: 'KR Homebase could not be reached. Check the connection and try again.',
  UNEXPECTED_REPLY: 'KR Homebase sent a reply the screen could not read. Try again.',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[TASKS_API:74] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new TasksApiError('NETWORK_ERROR', TASK_ERROR_SENTENCES.NETWORK_ERROR!, 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[TASKS_API:83] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new TasksApiError(code, TASK_ERROR_SENTENCES[code] ?? (refusal.success ? refusal.data.error.message : 'The task was not saved.'), response.status, requestId)
}

/** What the list screen asks for; every field is optional (the API's defaults: open tasks, 50 a page). */
export interface TasksRequest {
  /** Only tasks this user is a current assignee of (the screen's "Mine"). */
  assigneeUserId?: string | null
  /** Also completed and cancelled tasks (the screen's Status "All"). */
  includeClosed?: boolean
  clientId?: string | null
  matterId?: string | null
  limit?: number
  cursor?: string | null
}

const taskPath = (taskId: string) => `/api/v1/tasks/${encodeURIComponent(taskId)}`

/** One page of tasks, earliest due date first (no due date last), as the API orders them. */
export function fetchTasks(request: TasksRequest = {}): Promise<TasksData> {
  const query = new URLSearchParams()
  if (request.assigneeUserId) query.set('assigneeUserId', request.assigneeUserId)
  if (request.includeClosed) query.set('includeClosed', 'true')
  if (request.clientId) query.set('clientId', request.clientId)
  if (request.matterId) query.set('matterId', request.matterId)
  if (request.limit) query.set('limit', String(request.limit))
  if (request.cursor) query.set('cursor', request.cursor)
  return send(TasksData, 'GET', `/api/v1/tasks?${query.toString()}`)
}

/** One task with its current assignees. */
export function fetchTask(taskId: string): Promise<TaskSavedData> {
  return send(TaskSavedData, 'GET', taskPath(taskId))
}

/** Creates a task; with `assigneeUserIds` left out the API applies the creator's Task Settings (D20). */
export function createTask(body: TaskCreateBody): Promise<TaskSavedData> {
  return send(TaskSavedData, 'POST', '/api/v1/tasks', body)
}

/** Changes the fields sent (null clears what may be cleared). */
export function updateTask(taskId: string, body: TaskUpdateBody): Promise<TaskSavedData> {
  return send(TaskSavedData, 'PATCH', taskPath(taskId), body)
}

/** Replaces the task's current assignees; the first one is the main assignee, and an empty list removes everyone. */
export function replaceTaskAssignees(taskId: string, userIds: readonly string[]): Promise<TaskSavedData> {
  return send(TaskSavedData, 'PUT', `${taskPath(taskId)}/assignees`, { userIds: [...userIds] })
}
