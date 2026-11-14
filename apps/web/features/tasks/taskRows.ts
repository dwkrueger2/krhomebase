// file: apps/web/features/tasks/taskRows.ts
/**
 * Pure helpers for the Tasks screen (plan 10, stage 5): labels, the display id, the due-date label with the overdue
 * flag, assignee initials, the client and matter cell, paging joins, the "more exist" line (D10), and the edit draft
 * with the request bodies it turns into. Nothing here calls the API or reads the browser, so the tests cover it
 * directly.
 *
 * The API orders the list (earliest due date first, no due date last, then newest recorded); nothing here re-sorts
 * tasks. Only a client's matters are put `.0` first for the matter choice.
 *
 * New code: the old screen (`hb-components/KR-WorkStream/TaskWorkstreamPanel.client.tsx`) mixed WorkStream "Tasks"
 * entries with tasks and showed "Firm task" where a task had no matter; that wording is kept for a task with no
 * client.
 */

import {
  TASK_BILLING_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type Matter,
  type Task,
  type TaskBillingStatus,
  type TaskCreateBody,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateBody,
} from '@krhomebase/contracts'

/** Tasks asked for at a time (the API's default page, D10). */
export const TASKS_PAGE_SIZE = 50

/** Whose tasks the list shows: the viewer's own (a current assignee) or everyone's. */
export type TaskScope = 'mine' | 'everyone'
/** Which statuses the list shows: Open (the API default: open, in progress and waiting) or All. */
export type TaskStatusFilter = 'open' | 'all'

/** The plain status label ("In progress"). */
export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status] ?? status
}

/** The plain priority label ("Urgent"). */
export function taskPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_LABELS[priority] ?? priority
}

/** The plain billing status label ("Not billable"). */
export function taskBillingStatusLabel(status: TaskBillingStatus): string {
  return TASK_BILLING_STATUS_LABELS[status] ?? status
}

/** The task's id as people write it in text (D21): `Task #ABC1234`. */
export function taskDisplayId(task: Pick<Task, 'id'>): string {
  return `Task #${task.id}`
}

/** The short form for a ledger cell: `#ABC1234`. */
export function taskShortId(task: Pick<Task, 'id'>): string {
  return `#${task.id}`
}

/** A task is closed when it is completed or cancelled; closed tasks are never overdue. */
export function isTaskClosed(status: TaskStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** Today's local date as `YYYY-MM-DD`, the form the due dates use. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** "11/13/2026" for `2026-11-13`; the text as given when it is not a date; "" for none. */
export function formatDueDate(value: string | null): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

/** "11/13/2026" for an ISO time, or "—". */
export function formatShortDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/** The due-date cell: its label and whether it is overdue. */
export interface TaskDueInfo {
  /** "11/13/2026", or "No due date". */
  label: string
  /** Due before today and not completed or cancelled. */
  overdue: boolean
}

/**
 * The due-date label and the overdue flag. A task is overdue when its due date is before today (local date) and it
 * is not completed or cancelled; a task due today is not overdue yet.
 *
 * @param today - `YYYY-MM-DD` (tests pass a fixed day; the screen passes `localToday()`).
 */
export function taskDueInfo(task: Pick<Task, 'dueDate' | 'status'>, today: string = localToday()): TaskDueInfo {
  if (!task.dueDate) return { label: 'No due date', overdue: false }
  return { label: formatDueDate(task.dueDate), overdue: !isTaskClosed(task.status) && task.dueDate < today }
}

/** Initials for one assignee label: the first letters of the first two words ("Dan Example" → "DE"). */
export function assigneeInitials(label: string): string {
  const name = label.includes(' - ') ? label.slice(label.indexOf(' - ') + 3) : label
  const words = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') || '?'
}

/** The assignee cell: initials joined by spaces ("DE AK"), or "—" for nobody. */
export function assigneesShortLabel(task: Pick<Task, 'assignees'>): string {
  return task.assignees.length ? task.assignees.map((assignee) => assigneeInitials(assignee.label)).join(' ') : '—'
}

/** The assignees in full for a tooltip and the detail card ("Dan Example, Ann Kim"), or "Unassigned". */
export function assigneesFullLabel(task: Pick<Task, 'assignees'>): string {
  return task.assignees.length ? task.assignees.map((assignee) => assignee.label).join(', ') : 'Unassigned'
}

/** The number for the client and matter cell: the matter (`306.1`), else the client (`306`), else "Firm task". */
export function taskClientMatterNumber(task: Pick<Task, 'clientNumber' | 'matterNumber' | 'clientId'>): string {
  return task.matterNumber ?? task.clientNumber ?? (task.clientId ? '—' : 'Firm task')
}

/** The client line for the detail card: "306 Ann Example", or "None (firm task)". */
export function taskClientLabel(task: Pick<Task, 'clientId' | 'clientNumber' | 'clientDisplayName'>): string {
  if (!task.clientId) return 'None (firm task)'
  return [task.clientNumber, task.clientDisplayName].filter(Boolean).join(' ') || task.clientId
}

/** The matter line for the detail card: "306.1 · Estate plan", or "—". */
export function taskMatterLabel(task: Pick<Task, 'matterId' | 'matterNumber' | 'matterTitle'>): string {
  if (!task.matterId) return '—'
  return [task.matterNumber, task.matterTitle].filter(Boolean).join(' · ') || task.matterId
}

/** "$1,250.00" for a billing value, or "—". */
export function formatBillingValue(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Adds the next page to the loaded tasks, leaving out any already loaded (the API's order is kept). */
export function appendTasks(current: readonly Task[], page: readonly Task[]): Task[] {
  const known = new Set(current.map((task) => task.id))
  return [...current, ...page.filter((task) => !known.has(task.id))]
}

/**
 * Puts a saved task into the loaded list: in its place when it is there, else first. The list is not re-sorted, so
 * a changed due date moves the row on the next load (the API orders the list).
 */
export function upsertTask(current: readonly Task[], saved: Task): Task[] {
  return current.some((task) => task.id === saved.id) ? current.map((task) => (task.id === saved.id ? saved : task)) : [saved, ...current]
}

/** The D10 line under the rows while more tasks exist, or "". */
export function moreTasksLine(count: number, hasMore: boolean): string {
  return hasMore ? `Showing the first ${count} by due date; more tasks exist.` : ''
}

/** The empty-list sentence for the current filters. */
export function emptyTasksMessage(scope: TaskScope, status: TaskStatusFilter): string {
  const which = status === 'open' ? 'open tasks' : 'tasks'
  return scope === 'mine' ? `No ${which} are assigned to you.` : `No ${which} match this filter.`
}

/** The matter's sequence after the point (`306.12` → 12), for `.0` first. */
function matterSequence(matter: Pick<Matter, 'matterNumber'>): number {
  const sequence = Number(matter.matterNumber.split('.').pop())
  return Number.isFinite(sequence) ? sequence : Number.MAX_SAFE_INTEGER
}

/** A client's matters as choices, `.0` (Client General Matters) first: `{ id, label: "306.1 · Estate plan" }`. */
export function matterChoices(matters: readonly Matter[]): Array<{ id: string; label: string }> {
  return [...matters].sort((left, right) => matterSequence(left) - matterSequence(right)).map((matter) => ({ id: matter.id, label: `${matter.matterNumber} · ${matter.title}` }))
}

/** The edit dialog's fields as typed; text fields hold "" for empty. */
export interface TaskDraft {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  /** `YYYY-MM-DD` or "". */
  dueDate: string
  clientId: string | null
  /** "306 Ann Example" for the chosen client, or "". */
  clientLabel: string
  matterId: string | null
  /** The assignees in order; the first is the main assignee. */
  assigneeUserIds: string[]
  supervisorUserId: string
  /** The billing value as typed ("" for none). */
  billingValue: string
  billingStatus: TaskBillingStatus
  billingDescription: string
}

/** A new task's fields: Open, Normal, Not ready, nobody ticked (the API then applies the Task Settings, D20). */
export function emptyTaskDraft(): TaskDraft {
  return { title: '', description: '', status: 'open', priority: 'normal', dueDate: '', clientId: null, clientLabel: '', matterId: null, assigneeUserIds: [], supervisorUserId: '', billingValue: '', billingStatus: 'not_ready', billingDescription: '' }
}

/** A saved task's fields for the edit dialog. */
export function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? '',
    clientId: task.clientId,
    clientLabel: task.clientId ? taskClientLabel(task) : '',
    matterId: task.matterId,
    assigneeUserIds: task.assignees.map((assignee) => assignee.userId),
    supervisorUserId: task.supervisorUserId ?? '',
    billingValue: task.billingValue === null ? '' : String(task.billingValue),
    billingStatus: task.billingStatus,
    billingDescription: task.billingDescription ?? '',
  }
}

/** The billing value as a number, null for blank, or NaN when it is not a number of 0 or more. */
export function parseBillingValue(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN
}

/** The first problem the screen can see before saving, or "". The API checks everything again. */
export function taskDraftProblem(draft: TaskDraft): string {
  if (!draft.title.trim()) return 'A title is required.'
  if (draft.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) return 'The due date is not a date.'
  if (Number.isNaN(parseBillingValue(draft.billingValue))) return 'The billing value must be a number, 0 or more.'
  return ''
}

/**
 * The create body. Blank fields are left out, so the API's defaults apply. `assigneeUserIds` is sent only when the
 * person changed the assignee ticks (`assigneesTouched`); left out, the API applies the creator's Task Settings
 * (assign the creator by default, D20). Sent empty, nobody is assigned.
 */
export function taskCreateBody(draft: TaskDraft, assigneesTouched: boolean): TaskCreateBody {
  const billingValue = parseBillingValue(draft.billingValue)
  const body: TaskCreateBody = { title: draft.title.trim(), status: draft.status, priority: draft.priority, billingStatus: draft.billingStatus }
  if (draft.description.trim()) body.description = draft.description.trim()
  if (draft.dueDate) body.dueDate = draft.dueDate
  if (draft.clientId) body.clientId = draft.clientId
  if (draft.matterId) body.matterId = draft.matterId
  if (assigneesTouched) body.assigneeUserIds = [...draft.assigneeUserIds]
  if (draft.supervisorUserId) body.supervisorUserId = draft.supervisorUserId
  if (billingValue !== null && !Number.isNaN(billingValue)) body.billingValue = billingValue
  if (draft.billingDescription.trim()) body.billingDescription = draft.billingDescription.trim()
  return body
}

/**
 * The PATCH body: only the fields that differ from the saved task, with null for a field emptied. Assignees are not
 * part of it (they are replaced with `PUT .../assignees`). An empty object means nothing to change.
 *
 * A changed client is sent with its matter (null when none is chosen), so a matter of the old client is never left
 * on the new one.
 */
export function taskUpdateBody(task: Task, draft: TaskDraft): Partial<TaskUpdateBody> {
  const body: Partial<TaskUpdateBody> = {}
  const text = (value: string): string | null => value.trim() || null
  if (draft.title.trim() !== task.title) body.title = draft.title.trim()
  if (text(draft.description) !== (task.description ?? null)) body.description = text(draft.description)
  if (draft.status !== task.status) body.status = draft.status
  if (draft.priority !== task.priority) body.priority = draft.priority
  if ((draft.dueDate || null) !== task.dueDate) body.dueDate = draft.dueDate || null
  if (draft.clientId !== task.clientId) {
    body.clientId = draft.clientId
    body.matterId = draft.matterId
  } else if (draft.matterId !== task.matterId) {
    body.matterId = draft.matterId
  }
  if ((draft.supervisorUserId || null) !== task.supervisorUserId) body.supervisorUserId = draft.supervisorUserId || null
  const billingValue = parseBillingValue(draft.billingValue)
  if (!Number.isNaN(billingValue) && billingValue !== task.billingValue) body.billingValue = billingValue
  if (draft.billingStatus !== task.billingStatus) body.billingStatus = draft.billingStatus
  if (text(draft.billingDescription) !== (task.billingDescription ?? null)) body.billingDescription = text(draft.billingDescription)
  return body
}

/** Whether the ticked assignees differ from the task's current ones, order included (the first is the main one). */
export function assigneesChanged(task: Pick<Task, 'assignees'>, draft: Pick<TaskDraft, 'assigneeUserIds'>): boolean {
  const saved = task.assignees.map((assignee) => assignee.userId)
  return saved.length !== draft.assigneeUserIds.length || saved.some((userId, index) => draft.assigneeUserIds[index] !== userId)
}

/** Ticks or unticks one assignee; a newly ticked one goes last, so the first assignee stays the main one. */
export function toggleAssignee(userIds: readonly string[], userId: string, checked: boolean): string[] {
  const without = userIds.filter((id) => id !== userId)
  return checked ? [...without, userId] : without
}
