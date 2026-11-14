/**
 * Tasks (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 5). A task is a piece of work, optionally on a
 * client and one of its matters, with current assignees (`task_assignee`), a supervising user and billing fields.
 * As-is record: `docs/API/WorkStream_AsIs_Reference.md` section 5.
 *
 *   GET   /v1/tasks                       tasks by due date (no due date last), paged; open ones unless asked
 *   GET   /v1/tasks/{taskId}              one task
 *   POST  /v1/tasks                       create (the API makes the public id; client, matter and assignees checked)
 *   PATCH /v1/tasks/{taskId}              change the fields sent
 *   PUT   /v1/tasks/{taskId}/assignees    replace the current assignees
 *
 * Who (D9, Nov 13, 2026): every staff role may read and write, as WorkStream. No delete route.
 * Old route: `GET`, `POST`, `PATCH /krhomebase/api/tasks`.
 *
 * Wire names: the column `lead_user_id` is the supervising **user** (not a sales lead), so it is `supervisorUserId`
 * here.
 *
 * Public id and references (D21, the requester, Nov 13, 2026): a task's id is a seven-character public code, made by
 * the same rule as a WorkStream wsid. Tasks and WorkStream entries refer to each other only in text, `Task #ABC1234`
 * and `WS #XYZ7890`, as many times as needed in either direction; no column tracks the links, so deleting either
 * record never breaks the database. The column `task.workstream_activity_wsid` (a foreign key to
 * `workstream_activity(wsid)`, which would block deleting the entry) is not used. `findTaskReferences` and
 * `findWorkstreamReferences` read the references out of a title or note.
 */

import { z } from 'zod'

/** Task statuses, priorities and billing statuses (Schema 8.0 CHECK lists on `task`). Unknown values are refused (the old POST silently replaced them). */
export const TASK_STATUSES = ['open', 'in_progress', 'waiting', 'completed', 'cancelled'] as const
/** The statuses listed when closed tasks are not asked for. */
export const TASK_OPEN_STATUSES = ['open', 'in_progress', 'waiting'] as const
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export const TASK_BILLING_STATUSES = ['not_ready', 'ready', 'converted', 'not_billable'] as const

export const TaskStatus = z.enum(TASK_STATUSES).describe('Where the task stands.')
export type TaskStatus = z.infer<typeof TaskStatus>
export const TaskPriority = z.enum(TASK_PRIORITIES).describe('How urgent the task is.')
export type TaskPriority = z.infer<typeof TaskPriority>
export const TaskBillingStatus = z.enum(TASK_BILLING_STATUSES).describe('Whether the task is ready to bill.')
export type TaskBillingStatus = z.infer<typeof TaskBillingStatus>

/** Plain labels for the screens. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { open: 'Open', in_progress: 'In progress', waiting: 'Waiting', completed: 'Completed', cancelled: 'Cancelled' }
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }
export const TASK_BILLING_STATUS_LABELS: Record<TaskBillingStatus, string> = { not_ready: 'Not ready', ready: 'Ready', converted: 'Converted', not_billable: 'Not billable' }

/** A task's public id: seven capital letters and digits, the same rule as a WorkStream wsid (D21). */
export const TASK_ID_PATTERN = /^[A-Z0-9]{7}$/

/**
 * The task codes named in a text as `Task #ABC1234` (D21). The word is matched in any case ("task #", "TASK #"), with
 * or without spaces before `#`; the code is exactly seven capital letters and digits, not followed by another letter
 * or digit. Each code once, in the order first found.
 */
export function findTaskReferences(text: string): string[] {
  return findReferences(text, /(?<![A-Za-z0-9])[Tt][Aa][Ss][Kk]\s*#([A-Z0-9]{7})(?![A-Za-z0-9])/g)
}

/** The WorkStream wsids named in a text as `WS #XYZ7890`, by the same rules as `findTaskReferences` (D21). */
export function findWorkstreamReferences(text: string): string[] {
  return findReferences(text, /(?<![A-Za-z0-9])[Ww][Ss]\s*#([A-Z0-9]{7})(?![A-Za-z0-9])/g)
}

function findReferences(text: string, pattern: RegExp): string[] {
  const found: string[] = []
  for (const match of (text ?? '').matchAll(pattern)) if (!found.includes(match[1]!)) found.push(match[1]!)
  return found
}

/** The most assignees one task may have. */
export const TASK_MAX_ASSIGNEES = 25

const text = (max: number) => z.string().trim().max(max)
const id = (what: string) => z.string().trim().min(1).max(200).describe(what)
const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A due date is YYYY-MM-DD.')
const billingValue = z.number().finite().min(0).max(100_000_000)
const assigneeIds = z.array(id('A staff user id.')).max(TASK_MAX_ASSIGNEES)

export const TaskAssignee = z.object({
  userId: z.string().describe('The assigned staff user.'),
  label: z.string().describe("That user's name (preferred name, else first and last name, else email)."),
})
export type TaskAssignee = z.infer<typeof TaskAssignee>

export const Task = z.object({
  id: z.string().describe("The task's public id: seven capital letters and digits, written `Task #ABC1234` in text (D21)."),
  title: z.string().describe('What is to be done.'),
  description: z.string().nullable().describe('More detail.'),
  typeLabel: z.string().nullable().describe('A free-text kind of task.'),
  status: TaskStatus,
  priority: TaskPriority,
  clientId: z.string().nullable().describe('The client account the task is for.'),
  clientNumber: z.string().nullable().describe("That client's number."),
  clientDisplayName: z.string().nullable().describe("That client account's name."),
  matterId: z.string().nullable().describe("One of the client's matters."),
  matterNumber: z.string().nullable().describe("That matter's number."),
  matterTitle: z.string().nullable().describe("That matter's title."),
  assignees: z
    .array(TaskAssignee)
    .describe('The current assignees, the first assignee first. A task saved before assignee rows existed shows its single `assigned_to_user_id` (the old route\'s fallback).'),
  assignedByUserId: z.string().nullable().describe('Who assigned the task.'),
  supervisorUserId: z.string().nullable().describe('The supervising user (column `lead_user_id`; not a sales lead).'),
  supervisorLabel: z.string().nullable().describe("The supervising user's name."),
  billingValue: z.number().nullable().describe('Billing value, 0 or more.'),
  billingStatus: TaskBillingStatus,
  billingDescription: z.string().nullable().describe('Billing description.'),
  dueDate: z.string().nullable().describe('Due date (`YYYY-MM-DD`).'),
  completedAt: z.string().nullable().describe('When it was completed (ISO time); cleared when it is reopened.'),
  createdByUserId: z.string().describe('Who recorded it.'),
  createdByLabel: z.string().describe("That user's name."),
  createdAt: z.string().describe('When it was recorded (ISO time).'),
  updatedAt: z.string().nullable().describe('When it last changed (ISO time).'),
})
export type Task = z.infer<typeof Task>

export const TasksQuery = z.object({
  status: z.string().trim().max(200).optional().describe('Only these statuses, comma-separated (`open,waiting`). When given, `includeClosed` is not used.'),
  includeClosed: z.enum(['true', 'false']).optional().describe('`true` also lists completed and cancelled tasks; left out or `false` lists only open, in progress and waiting.'),
  assigneeUserId: id('Only tasks this user is a current assignee of.').optional(),
  clientId: id('Only tasks for this client account.').optional(),
  matterId: id('Only tasks on this matter.').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe('Tasks per page, 1 to 100 (50 when left out).'),
  cursor: z.string().max(500).optional().describe('The `nextCursor` of the previous page.'),
})
export type TasksQuery = z.infer<typeof TasksQuery>

export const TasksData = z.object({
  tasks: z.array(Task).describe('Earliest due date first (no due date last), then newest recorded.'),
  nextCursor: z.string().nullable().describe('Pass as `cursor` for the next page; null on the last page.'),
  viewer: z.object({ canWrite: z.boolean().describe('May create and change tasks.') }).describe('What the signed-in person may do.'),
})
export type TasksData = z.infer<typeof TasksData>

export const TaskParams = z.object({ taskId: z.string().regex(TASK_ID_PATTERN, 'A task id is seven capital letters and digits.').describe("The task's public id.") })
export type TaskParams = z.infer<typeof TaskParams>

export const TaskCreateBody = z.object({
  title: text(300).min(1, 'A title is required.').describe('What is to be done.'),
  description: text(10000).optional().describe('More detail.'),
  typeLabel: text(200).optional().describe('A free-text kind of task.'),
  status: TaskStatus.optional().describe('Status; Open when left out.'),
  priority: TaskPriority.optional().describe('Priority; Normal when left out.'),
  clientId: id('The client account; set from the matter when only a matter is given.').optional(),
  matterId: id("One of the client's primary-client matters.").optional(),
  assigneeUserIds: assigneeIds
    .optional()
    .describe("Active staff users. Left out: the person creating it, unless their Task Settings preference `assignCreatorByDefault` is off (then nobody). Empty: nobody."),
  supervisorUserId: id('The supervising user (an active staff user).').optional(),
  billingValue: billingValue.optional().describe('Billing value, 0 or more.'),
  billingStatus: TaskBillingStatus.optional().describe('Billing status; Not ready when left out.'),
  billingDescription: text(4000).optional().describe('Billing description.'),
  dueDate: dueDate.optional().describe('Due date (`YYYY-MM-DD`).'),
})
export type TaskCreateBody = z.infer<typeof TaskCreateBody>

export const TaskUpdateBody = z
  .object({
    title: text(300).min(1, 'A title is required.').optional().describe('What is to be done (cannot be cleared).'),
    description: text(10000).nullable().optional().describe('More detail; null or blank clears it.'),
    typeLabel: text(200).nullable().optional().describe('Kind of task; null or blank clears it.'),
    status: TaskStatus.optional().describe('Status; Completed sets `completedAt`, any other status clears it.'),
    priority: TaskPriority.optional(),
    clientId: id('Another client account; null clears it (the matter\'s primary client is kept when a matter stays).').nullable().optional(),
    matterId: id("Another of the client's primary-client matters; null clears it.").nullable().optional(),
    supervisorUserId: id('The supervising user; null clears it.').nullable().optional(),
    billingValue: billingValue.nullable().optional().describe('Billing value; null clears it.'),
    billingStatus: TaskBillingStatus.optional(),
    billingDescription: text(4000).nullable().optional().describe('Billing description; null or blank clears it.'),
    dueDate: dueDate.nullable().optional().describe('Due date (`YYYY-MM-DD`); null clears it.'),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' })
export type TaskUpdateBody = z.infer<typeof TaskUpdateBody>

export const TaskAssigneesBody = z.object({
  userIds: assigneeIds.describe('The whole new set of assignees (active staff users), the first assignee first; empty removes everyone.'),
})
export type TaskAssigneesBody = z.infer<typeof TaskAssigneesBody>

export const TaskSavedData = z.object({ task: Task.describe('The task after the save.') })
export type TaskSavedData = z.infer<typeof TaskSavedData>
