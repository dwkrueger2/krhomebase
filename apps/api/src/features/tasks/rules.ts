// file: apps/api/src/features/tasks/rules.ts
/**
 * Business rules for Tasks (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 5), ported from the old
 * `/krhomebase/api/tasks` route. As-is record: `docs/API/WorkStream_AsIs_Reference.md` section 5.
 *
 * Kept from the old route: the title is required; the default assignee is the person creating the task;
 * `assigned_to_user_id` holds the first assignee and is the fallback when a task has no current `task_assignee`
 * rows; `completed_at` follows the status (set when it becomes Completed, cleared when it is reopened); a change sets
 * only the fields sent; new assignee rows `tas_<uuid>`; the person who creates or assigns comes from the session.
 *
 * Changed (the requester's decisions of Nov 13, 2026, and the points found in section 5.5):
 * - D9: only staff roles (`WORKSTREAM_ROLES`) may read and write; the old route let any signed-in person do both.
 * - D10: the list has an order (due date, no due date last, then newest recorded) and is paged with a cursor; the
 *   old one had no order and used `offset`. Assignees are read for the whole page in one query.
 * - Bad status, priority or billing status are refused (422 `VALIDATION_FAILED`); the old POST silently replaced them.
 * - D21: the API makes the id, a seven-character public code (`generatePublicCode`, the wsid rule), retried on a
 *   clash (the old POST let the caller choose it, else `tsk_<uuid>`). Tasks and WorkStream entries refer to each
 *   other only in text (`Task #ABC1234`, `WS #XYZ7890`; `findTaskReferences` in contracts), so the column
 *   `workstream_activity_wsid` (a foreign key that would block deleting the entry) is no longer written or sent.
 * - D20: with no assignees given, the creator is assigned only when their Task Settings preference
 *   `assignCreatorByDefault` is on (the default); the old route always assigned the creator.
 * - The client and matter are checked: the client must exist, the matter must be a primary-client matter of that
 *   client, and a matter given without a client sets the client from the matter's primary client. Assignees and the
 *   supervisor must be active staff users.
 * - A change needs the task to exist (404 `TASK_NOT_FOUND`); the old PATCH did not check.
 * - Assignees have their own route (`PUT .../assignees`), which never breaks the UNIQUE rule on `task_assignee`
 *   (a removed user's row is ended, a returning user's row comes back); the old sync made a second ended row on the
 *   second removal, and an empty set left `assigned_to_user_id` behind. Only `assignment_role = 'assignee'` rows are
 *   read and written.
 * - Completing a task that is already Completed keeps its first `completed_at` (the old PATCH reset it).
 * - The reply is the camelCase `Task` with names (client, matter, assignees, supervisor, creator), not raw rows.
 */

import { TASK_OPEN_STATUSES, TASK_STATUSES, type Task, type TaskAssigneesBody, type TaskCreateBody, type TasksData, type TaskSavedData, type TasksQuery, type TaskUpdateBody } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import { generatePublicCode } from '../contact-edits/rules.ts'
import { WORKSTREAM_ROLES } from '../workstream/rules.ts'
import type { AssigneeRow, TaskCursor, TaskQueries, TaskRow, TaskWrite } from './queries.ts'

/** Staff roles that may read and write tasks (D9: every staff user, the same as WorkStream; no client or outside accountant accounts). */
export const TASK_ROLES = WORKSTREAM_ROLES

const TASK_ID_ATTEMPTS = 8

/** A refusal with its code and HTTP status. */
export class TaskError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message)
    this.name = 'TaskError'
  }
}

/** The signed-in person, from the checked session. */
export interface TaskActor {
  userId: string
  email: string
  role: string
  requestId: string
}

/** A person's name: preferred name, else first and last name, else the fallback. */
function personName(preferred: string | null, first: string | null, last: string | null, fallback: string): string {
  return preferred?.trim() || [first, last].filter((part) => part?.trim()).join(' ').trim() || fallback
}

/**
 * The camelCase task. `assignees` are the current `task_assignee` rows with `assigned_to_user_id` first; a task with
 * no rows shows its `assigned_to_user_id` alone (the old route's fallback).
 */
export function serializeTask(row: TaskRow, assigneeRows: AssigneeRow[]): Task {
  const assignees = assigneeRows.map((assignee) => ({
    userId: assignee.user_id,
    label: personName(assignee.preferred_name, assignee.first_name, assignee.last_name, assignee.email ?? assignee.user_id),
  }))
  const first = assignees.findIndex((assignee) => assignee.userId === row.assigned_to_user_id)
  if (first > 0) assignees.unshift(...assignees.splice(first, 1))
  if (!assignees.length && row.assigned_to_user_id) {
    assignees.push({ userId: row.assigned_to_user_id, label: personName(row.assigned_to_preferred_name, row.assigned_to_first_name, row.assigned_to_last_name, row.assigned_to_email ?? row.assigned_to_user_id) })
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    typeLabel: row.type_label,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    clientId: row.client_id,
    clientNumber: row.client_number,
    clientDisplayName: row.client_display_name,
    matterId: row.matter_id,
    matterNumber: row.matter_number,
    matterTitle: row.matter_title,
    assignees,
    assignedByUserId: row.assigned_by_user_id,
    supervisorUserId: row.lead_user_id,
    supervisorLabel: row.lead_user_id ? personName(row.supervisor_preferred_name, row.supervisor_first_name, row.supervisor_last_name, row.supervisor_email ?? row.lead_user_id) : null,
    billingValue: row.billing_value,
    billingStatus: row.billing_status as Task['billingStatus'],
    billingDescription: row.billing_description,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdByUserId: row.created_by_user_id,
    createdByLabel: personName(row.created_by_preferred_name, row.created_by_first_name, row.created_by_last_name, row.created_by_email ?? row.created_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The opaque page position: base64url of the last row's due-date key, recorded time and id. */
export function encodeCursor(row: Pick<TaskRow, 'due_key' | 'created_at' | 'id'>): string {
  return btoa(JSON.stringify([row.due_key, row.created_at, row.id])).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function decodeCursor(value: string | undefined): TaskCursor | null {
  if (!value) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const parsed: unknown = JSON.parse(atob(padded))
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((part) => typeof part === 'string')) {
      return { dueKey: parsed[0] as string, createdAt: parsed[1] as string, id: parsed[2] as string }
    }
  } catch {
    // fall through
  }
  throw new TaskError('TASK_CURSOR_INVALID', 422, 'That page position is not valid. Load the list again.')
}

/**
 * The statuses to list: the `status` comma list when given (each checked, 422 `TASK_STATUS_INVALID`), else every
 * status with `includeClosed=true`, else only open, in progress and waiting.
 */
export function listStatuses(status: string | undefined, includeClosed: boolean): string[] {
  const parts = (status ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return includeClosed ? [...TASK_STATUSES] : [...TASK_OPEN_STATUSES]
  const bad = parts.filter((part) => !(TASK_STATUSES as readonly string[]).includes(part))
  if (bad.length) throw new TaskError('TASK_STATUS_INVALID', 422, `Not a task status: ${bad.join(', ')}.`)
  return Array.from(new Set(parts))
}

/** The completion time for a status change: kept while it stays Completed, now when it becomes Completed, else cleared. */
export function completedAtFor(status: string, previousStatus: string | null, previousCompletedAt: string | null, now: string): string | null {
  if (status !== 'completed') return null
  return previousStatus === 'completed' ? (previousCompletedAt ?? now) : now
}

async function withAssignees(q: TaskQueries, rows: TaskRow[]): Promise<Task[]> {
  const assigneeRows = await q.currentAssignees(rows.map((row) => row.id))
  return rows.map((row) => serializeTask(row, assigneeRows.filter((assignee) => assignee.task_id === row.id)))
}

async function requireTask(q: TaskQueries, taskId: string): Promise<TaskRow> {
  const row = await q.task(taskId)
  if (!row) throw new TaskError('TASK_NOT_FOUND', 404, 'No task has that id.')
  return row
}

async function savedTask(q: TaskQueries, taskId: string): Promise<TaskSavedData> {
  const [task] = await withAssignees(q, [await requireTask(q, taskId)])
  return { task: task! }
}

/**
 * The client and matter to save. A matter given without a client takes the matter's primary client; a matter with a
 * client must be one of that client's primary-client matters. 404 `TASK_CLIENT_NOT_FOUND`, `TASK_MATTER_NOT_FOUND`;
 * 422 `TASK_MATTER_NOT_FOR_CLIENT`.
 */
async function resolveClientAndMatter(q: TaskQueries, clientId: string | null, matterId: string | null): Promise<{ clientId: string | null; matterId: string | null }> {
  if (clientId && !(await q.clientExists(clientId))) throw new TaskError('TASK_CLIENT_NOT_FOUND', 404, 'No client account has that id.')
  if (!matterId) return { clientId, matterId: null }
  const matter = await q.matter(matterId)
  if (!matter) throw new TaskError('TASK_MATTER_NOT_FOUND', 404, 'No matter has that id.')
  if (!clientId) {
    if (!matter.primary_client_id) throw new TaskError('TASK_MATTER_NOT_FOR_CLIENT', 422, 'That matter has no primary client. Choose the client as well.')
    return { clientId: matter.primary_client_id, matterId }
  }
  if (!(await q.isPrimaryClientMatter(clientId, matterId))) throw new TaskError('TASK_MATTER_NOT_FOR_CLIENT', 422, 'That matter is not one of the client\'s matters.')
  return { clientId, matterId }
}

async function requireSupervisor(q: TaskQueries, userId: string | null): Promise<void> {
  if (userId && !(await q.activeStaffUsers([userId])).length) throw new TaskError('TASK_SUPERVISOR_NOT_FOUND', 422, 'The supervisor must be an active staff user.')
}

/** The assignees (duplicates dropped, order kept), each an active staff user (422 `TASK_ASSIGNEE_NOT_FOUND`), with new row ids. */
async function assigneeEntries(q: TaskQueries, userIds: string[]): Promise<Array<{ id: string; userId: string }>> {
  const unique = Array.from(new Set(userIds.map((userId) => userId.trim()).filter(Boolean)))
  const found = new Set(await q.activeStaffUsers(unique))
  const missing = unique.filter((userId) => !found.has(userId))
  if (missing.length) throw new TaskError('TASK_ASSIGNEE_NOT_FOUND', 422, `Not an active staff user: ${missing.join(', ')}.`)
  return unique.map((userId) => ({ id: `tas_${crypto.randomUUID()}`, userId }))
}

function auditFor(actor: TaskActor, action: string, taskId: string, clientId: string | null, newJson: unknown): AuditEntry {
  // No matter_id: a task's audit rows must not keep its matter from being deleted (see Projects & Matters).
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'tasks', action, targetTable: 'task', targetId: taskId, clientId, newJson }
}

/** One page of tasks and what the viewer may do. Writes nothing. Codes: `TASK_STATUS_INVALID`, `TASK_CURSOR_INVALID`. */
export async function listTasks(q: TaskQueries, actor: TaskActor, query: TasksQuery): Promise<TasksData> {
  const statuses = listStatuses(query.status, query.includeClosed === 'true')
  const rows = await q.list({ statuses, assigneeUserId: query.assigneeUserId, clientId: query.clientId, matterId: query.matterId }, decodeCursor(query.cursor), query.limit)
  const pageRows = rows.slice(0, query.limit)
  const last = pageRows.at(-1)
  return {
    tasks: await withAssignees(q, pageRows),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    viewer: { canWrite: (TASK_ROLES as readonly string[]).includes(actor.role) },
  }
}

/** One task (404 `TASK_NOT_FOUND`). Writes nothing. */
export async function getTask(q: TaskQueries, taskId: string): Promise<TaskSavedData> {
  return savedTask(q, taskId)
}

/**
 * Creates a task with its assignee rows in one batch with the audit row. The person creating and assigning it is the
 * caller. With no `assigneeUserIds`, the caller is assigned when `assignCreatorByDefault` (their Task Settings
 * preference, read only then) says so, else nobody; an empty list is nobody. The id is a new public code, retried on
 * a clash. Codes: `TASK_CLIENT_NOT_FOUND`, `TASK_MATTER_NOT_FOUND`, `TASK_MATTER_NOT_FOR_CLIENT`,
 * `TASK_ASSIGNEE_NOT_FOUND`, `TASK_SUPERVISOR_NOT_FOUND`, `TASK_ID_EXHAUSTED`.
 */
export async function createTask(q: TaskQueries, actor: TaskActor, body: TaskCreateBody, now: string, assignCreatorByDefault: () => Promise<boolean>): Promise<TaskSavedData> {
  const owner = await resolveClientAndMatter(q, body.clientId ?? null, body.matterId ?? null)
  await requireSupervisor(q, body.supervisorUserId ?? null)
  const requested = body.assigneeUserIds ?? ((await assignCreatorByDefault()) ? [actor.userId] : [])
  const assignees = await assigneeEntries(q, requested)
  const status = body.status ?? 'open'
  for (let attempt = 0; attempt < TASK_ID_ATTEMPTS; attempt += 1) {
    const id = generatePublicCode()
    const saved = await insertTask(q, actor, body, owner, assignees, status, id, now)
    if (saved) return savedTask(q, id)
  }
  throw new TaskError('TASK_ID_EXHAUSTED', 409, 'A task id could not be assigned. Try again.')
}

/** One insert attempt with the given public id; false when the id was taken. */
function insertTask(
  q: TaskQueries,
  actor: TaskActor,
  body: TaskCreateBody,
  owner: { clientId: string | null; matterId: string | null },
  assignees: Array<{ id: string; userId: string }>,
  status: string,
  id: string,
  now: string,
): Promise<boolean> {
  return q.insert(
    {
      id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      typeLabel: body.typeLabel?.trim() || null,
      status,
      priority: body.priority ?? 'normal',
      clientId: owner.clientId,
      matterId: owner.matterId,
      supervisorUserId: body.supervisorUserId ?? null,
      billingValue: body.billingValue ?? null,
      billingStatus: body.billingStatus ?? 'not_ready',
      billingDescription: body.billingDescription?.trim() || null,
      dueDate: body.dueDate ?? null,
      completedAt: completedAtFor(status, null, null, now),
      createdByUserId: actor.userId,
      assignees,
      now,
    },
    auditFor(actor, 'CREATE', id, owner.clientId, { status, matterId: owner.matterId, assigneeUserIds: assignees.map((entry) => entry.userId) }),
  )
}

/**
 * Changes only the fields sent; null clears what may be cleared. The client and matter are checked together as on
 * create (a matter kept while the client changes must belong to the new client). Codes: `TASK_NOT_FOUND` and the
 * create codes except the assignee one.
 */
export async function updateTask(q: TaskQueries, actor: TaskActor, taskId: string, body: TaskUpdateBody, now: string): Promise<TaskSavedData> {
  const current = await requireTask(q, taskId)
  const pick = <T,>(sent: T | null | undefined, kept: T | null): T | null => (sent === undefined ? kept : sent)
  const clearable = (sent: string | null | undefined, kept: string | null) => (sent === undefined ? kept : sent?.trim() || null)

  const clientSent = body.clientId !== undefined
  const matterSent = body.matterId !== undefined
  let owner = { clientId: current.client_id, matterId: current.matter_id }
  if (clientSent || matterSent) owner = await resolveClientAndMatter(q, pick(body.clientId, current.client_id), pick(body.matterId, current.matter_id))
  if (body.supervisorUserId !== undefined) await requireSupervisor(q, body.supervisorUserId)

  const status = body.status ?? current.status
  const row: TaskWrite = {
    id: current.id,
    title: body.title?.trim() || current.title,
    description: clearable(body.description, current.description),
    typeLabel: clearable(body.typeLabel, current.type_label),
    status,
    priority: body.priority ?? current.priority,
    clientId: owner.clientId,
    matterId: owner.matterId,
    supervisorUserId: pick(body.supervisorUserId, current.lead_user_id),
    billingValue: pick(body.billingValue, current.billing_value),
    billingStatus: body.billingStatus ?? current.billing_status,
    billingDescription: clearable(body.billingDescription, current.billing_description),
    dueDate: pick(body.dueDate, current.due_date),
    completedAt: body.status === undefined ? current.completed_at : completedAtFor(status, current.status, current.completed_at, now),
    now,
  }
  await q.update(row, auditFor(actor, 'UPDATE', current.id, row.clientId, { fields: Object.keys(body), status: row.status }))
  return savedTask(q, current.id)
}

/**
 * Replaces the current assignees with `userIds` (the first one becomes `assigned_to_user_id`; empty clears it). A
 * removed user's row is ended, a returning user's row is made current again, a new user gets a new row; the UNIQUE
 * rule on `task_assignee` holds however often someone is removed and added back. Codes: `TASK_NOT_FOUND`,
 * `TASK_ASSIGNEE_NOT_FOUND`.
 */
export async function replaceTaskAssignees(q: TaskQueries, actor: TaskActor, taskId: string, body: TaskAssigneesBody, now: string): Promise<TaskSavedData> {
  const current = await requireTask(q, taskId)
  const assignees = await assigneeEntries(q, body.userIds)
  await q.replaceAssignees(current.id, assignees, actor.userId, now, auditFor(actor, 'ASSIGN', current.id, current.client_id, { assigneeUserIds: assignees.map((entry) => entry.userId) }))
  return savedTask(q, current.id)
}
