// file: apps/web/features/tasks/tasks.test.tsx
/**
 * Tasks screen (plan 10, stage 5): the pure helpers in `taskRows.ts` (labels, the display id, the overdue rule,
 * assignee initials, the client and matter cell, paging joins, the "more exist" line, the create and change bodies
 * against the contract), the error sentences, and first draws rendered to text with `react-dom/server` of the ledger
 * (rows, empty, loading, failure, the "more exist" line), the detail card, the panel from a given first page, and the
 * edit dialog drawn `inline` in New and Edit modes. Every save goes to the live database, so nothing here calls the
 * API. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/tasks
 */

import { TaskCreateBody, TaskUpdateBody, type Task, type WorkstreamAssignee } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TASK_ERROR_SENTENCES } from '@/features/tasks/api.client'
import TaskDetailCard from '@/features/tasks/components/TaskDetailCard.client'
import TaskEditDialog from '@/features/tasks/components/TaskEditDialog.client'
import TaskLedger, { type TaskLedgerProps } from '@/features/tasks/components/TaskLedger.client'
import TasksPanel from '@/features/tasks/components/TasksPanel.client'
import {
  appendTasks,
  assigneeInitials,
  assigneesChanged,
  assigneesShortLabel,
  draftFromTask,
  emptyTaskDraft,
  emptyTasksMessage,
  matterChoices,
  moreTasksLine,
  parseBillingValue,
  taskBillingStatusLabel,
  taskClientMatterNumber,
  taskCreateBody,
  taskDisplayId,
  taskDraftProblem,
  taskDueInfo,
  taskPriorityLabel,
  taskShortId,
  taskStatusLabel,
  taskUpdateBody,
  toggleAssignee,
  upsertTask,
} from '@/features/tasks/taskRows'

const TODAY = '2026-11-13'

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id,
  title,
  description: null,
  typeLabel: null,
  status: 'open',
  priority: 'normal',
  clientId: null,
  clientNumber: null,
  clientDisplayName: null,
  matterId: null,
  matterNumber: null,
  matterTitle: null,
  assignees: [],
  assignedByUserId: 'u1',
  supervisorUserId: null,
  supervisorLabel: null,
  billingValue: null,
  billingStatus: 'not_ready',
  billingDescription: null,
  dueDate: null,
  completedAt: null,
  createdByUserId: 'u1',
  createdByLabel: 'Dan Example',
  createdAt: '2026-11-10T15:00:00.000Z',
  updatedAt: null,
  ...extra,
})

const TASKS = [
  task('ABC1234', 'File the deed', {
    dueDate: '2026-11-10',
    priority: 'urgent',
    clientId: 'cl_306',
    clientNumber: '306',
    clientDisplayName: 'Ann Example',
    matterId: 'mat_1',
    matterNumber: '306.1',
    matterTitle: 'Estate plan',
    assignees: [
      { userId: 'u1', label: 'Dan Example' },
      { userId: 'u2', label: 'Ann Kim' },
    ],
    supervisorUserId: 'u3',
    supervisorLabel: 'Sam Lead',
    billingValue: 1250,
    billingStatus: 'ready',
    billingDescription: 'Deed recording',
    description: 'Record at the county.\nCall the client after.',
  }),
  task('DEF5678', 'Call the bank', { dueDate: '2026-11-13', status: 'in_progress', clientId: 'cl_307', clientNumber: '307', clientDisplayName: 'Bo Example' }),
  task('GHI9012', 'Old finished task', { dueDate: '2026-10-01', status: 'completed', completedAt: '2026-10-02T12:00:00.000Z' }),
  task('JKL3456', 'Someday', {}),
]

const STAFF: WorkstreamAssignee[] = [
  { id: 'u1', label: 'DK - Dan Example', displayName: 'Dan Example', staffCode: 'DK' },
  { id: 'u2', label: 'AK - Ann Kim', displayName: 'Ann Kim', staffCode: 'AK' },
  { id: 'u3', label: 'SL - Sam Lead', displayName: 'Sam Lead', staffCode: 'SL' },
]

describe('labels and the display id', () => {
  it('reads the plain labels', () => {
    expect(taskStatusLabel('in_progress')).toBe('In progress')
    expect(taskPriorityLabel('urgent')).toBe('Urgent')
    expect(taskBillingStatusLabel('not_billable')).toBe('Not billable')
  })

  it('writes the id as people write it in text (D21)', () => {
    expect(taskDisplayId(TASKS[0]!)).toBe('Task #ABC1234')
    expect(taskShortId(TASKS[0]!)).toBe('#ABC1234')
  })

  it('shows the matter number, else the client number, else Firm task', () => {
    expect(taskClientMatterNumber(TASKS[0]!)).toBe('306.1')
    expect(taskClientMatterNumber(TASKS[1]!)).toBe('307')
    expect(taskClientMatterNumber(TASKS[3]!)).toBe('Firm task')
  })

  it('makes initials from names and staff labels', () => {
    expect(assigneeInitials('Dan Example')).toBe('DE')
    expect(assigneeInitials('DK - Dan Example')).toBe('DE')
    expect(assigneeInitials('ann@example.com')).toBe('A')
    expect(assigneesShortLabel(TASKS[0]!)).toBe('DE AK')
    expect(assigneesShortLabel(TASKS[3]!)).toBe('—')
  })
})

describe('the overdue rule', () => {
  it('flags a past due date on a task that is not completed or cancelled', () => {
    expect(taskDueInfo(TASKS[0]!, TODAY)).toEqual({ label: '11/10/2026', overdue: true })
  })

  it('does not flag a task due today, a closed task, or one with no due date', () => {
    expect(taskDueInfo(TASKS[1]!, TODAY).overdue).toBe(false)
    expect(taskDueInfo(TASKS[2]!, TODAY).overdue).toBe(false)
    expect(taskDueInfo({ ...TASKS[0]!, status: 'cancelled' }, TODAY).overdue).toBe(false)
    expect(taskDueInfo(TASKS[3]!, TODAY)).toEqual({ label: 'No due date', overdue: false })
  })
})

describe('lists and paging', () => {
  it('joins pages without repeats, in the API order', () => {
    expect(appendTasks(TASKS.slice(0, 2), TASKS.slice(1)).map((item) => item.id)).toEqual(['ABC1234', 'DEF5678', 'GHI9012', 'JKL3456'])
  })

  it('puts a saved task in place, or first when it is new, without re-sorting', () => {
    expect(upsertTask(TASKS, { ...TASKS[1]!, title: 'Called' })[1]?.title).toBe('Called')
    expect(upsertTask(TASKS.slice(1), TASKS[0]!)[0]?.id).toBe('ABC1234')
  })

  it('says when more tasks exist (D10), and words the empty list by filter', () => {
    expect(moreTasksLine(50, true)).toBe('Showing the first 50 by due date; more tasks exist.')
    expect(moreTasksLine(50, false)).toBe('')
    expect(emptyTasksMessage('mine', 'open')).toBe('No open tasks are assigned to you.')
    expect(emptyTasksMessage('everyone', 'all')).toBe('No tasks match this filter.')
  })

  it('puts the .0 matter first among the choices', () => {
    const matter = (id: string, matterNumber: string, title: string) => ({ id, matterNumber, title }) as Parameters<typeof matterChoices>[0][number]
    expect(matterChoices([matter('m2', '306.2', 'Probate'), matter('m0', '306.0', 'Client General Matters'), matter('m1', '306.1', 'Estate plan')]).map((choice) => choice.label)).toEqual(['306.0 · Client General Matters', '306.1 · Estate plan', '306.2 · Probate'])
  })
})

describe('the draft and its request bodies', () => {
  it('leaves assignees out of a new task unless the ticks changed (D20), and fits the contract', () => {
    const draft = { ...emptyTaskDraft(), title: '  Draft the will ', dueDate: '2026-12-01', billingValue: '$1,000' }
    const untouched = taskCreateBody(draft, false)
    expect(() => TaskCreateBody.parse(untouched)).not.toThrow()
    expect(untouched).toEqual({ title: 'Draft the will', status: 'open', priority: 'normal', billingStatus: 'not_ready', dueDate: '2026-12-01', billingValue: 1000 })
    expect(taskCreateBody(draft, true).assigneeUserIds).toEqual([])
    expect(taskCreateBody({ ...draft, assigneeUserIds: ['u2'] }, true).assigneeUserIds).toEqual(['u2'])
  })

  it('sends only the changed fields, with null for an emptied one', () => {
    const saved = TASKS[0]!
    expect(taskUpdateBody(saved, draftFromTask(saved))).toEqual({})
    const changed = { ...draftFromTask(saved), status: 'waiting' as const, description: '', billingValue: '' }
    const body = taskUpdateBody(saved, changed)
    expect(body).toEqual({ status: 'waiting', description: null, billingValue: null })
    expect(() => TaskUpdateBody.parse(body)).not.toThrow()
  })

  it('sends a changed client with its matter, and clears both for a firm task', () => {
    const saved = TASKS[0]!
    expect(taskUpdateBody(saved, { ...draftFromTask(saved), clientId: 'cl_307', clientLabel: '307 Bo Example', matterId: null })).toEqual({ clientId: 'cl_307', matterId: null })
    expect(taskUpdateBody(saved, { ...draftFromTask(saved), clientId: null, clientLabel: '', matterId: null })).toEqual({ clientId: null, matterId: null })
    expect(taskUpdateBody(saved, { ...draftFromTask(saved), matterId: 'mat_2' })).toEqual({ matterId: 'mat_2' })
  })

  it('tells when the assignees changed, order included, and adds a new tick last', () => {
    const saved = TASKS[0]!
    expect(assigneesChanged(saved, { assigneeUserIds: ['u1', 'u2'] })).toBe(false)
    expect(assigneesChanged(saved, { assigneeUserIds: ['u2', 'u1'] })).toBe(true)
    expect(toggleAssignee(['u1'], 'u3', true)).toEqual(['u1', 'u3'])
    expect(toggleAssignee(['u1', 'u3'], 'u1', false)).toEqual(['u3'])
  })

  it('finds the problems the screen can see before saving', () => {
    expect(taskDraftProblem(emptyTaskDraft())).toBe('A title is required.')
    expect(taskDraftProblem({ ...emptyTaskDraft(), title: 'x', billingValue: '-5' })).toBe('The billing value must be a number, 0 or more.')
    expect(parseBillingValue('')).toBeNull()
    expect(parseBillingValue('12.50')).toBe(12.5)
    expect(taskDraftProblem({ ...emptyTaskDraft(), title: 'x' })).toBe('')
  })
})

describe('error sentences', () => {
  it('has a plain sentence for every Tasks route code', () => {
    for (const code of ['TASKS_UNAVAILABLE', 'TASK_NOT_FOUND', 'TASK_STATUS_INVALID', 'TASK_CURSOR_INVALID', 'TASK_CLIENT_NOT_FOUND', 'TASK_MATTER_NOT_FOUND', 'TASK_MATTER_NOT_FOR_CLIENT', 'TASK_SUPERVISOR_NOT_FOUND', 'TASK_ASSIGNEE_NOT_FOUND', 'TASK_ID_EXHAUSTED', 'VALIDATION_FAILED']) {
      expect(TASK_ERROR_SENTENCES[code], code).toMatch(/\.$/)
    }
  })
})

describe('first draws', () => {
  const ledger = (extra: Partial<TaskLedgerProps> = {}) =>
    renderToStaticMarkup(<TaskLedger emptyMessage="No open tasks are assigned to you." error="" hasMore={false} loading={false} loadingMore={false} selectedId="ABC1234" tasks={TASKS} today={TODAY} onLoadMore={() => {}} onRetry={() => {}} onSelect={() => {}} {...extra} />)

  it('draws the rows with the overdue date marked', () => {
    const html = ledger()
    expect(html).toContain('data-kr-id="tasks-ledger"')
    expect(html).toContain('#ABC1234')
    expect(html).toContain('File the deed')
    expect(html).toContain('306.1')
    expect(html).toContain('Urgent')
    expect(html).toContain('In progress')
    expect(html).toContain('DE AK')
    expect(html.match(/data-kr-element="task-overdue"/g)).toHaveLength(1)
    expect(html).toContain('Overdue: due 11/10/2026')
    expect(html).not.toContain('Load more tasks')
  })

  it('draws the empty, loading and failure states', () => {
    expect(ledger({ tasks: [] })).toContain('No open tasks are assigned to you.')
    expect(ledger({ loading: true })).toContain('Loading tasks...')
    const failed = ledger({ error: 'Tasks cannot be read or saved right now. Try again in a moment.' })
    expect(failed).toContain('Tasks cannot be read or saved right now.')
    expect(failed).toContain('Try again')
    expect(failed).not.toContain('File the deed')
  })

  it('says when more tasks exist and offers Load more tasks', () => {
    const html = ledger({ hasMore: true })
    expect(html).toContain('Showing the first 4 by due date; more tasks exist.')
    expect(html).toContain('Load more tasks')
  })

  it('draws the detail card read-only, with Edit for a writer', () => {
    const html = renderToStaticMarkup(<TaskDetailCard canWrite task={TASKS[0]!} today={TODAY} onEdit={() => {}} />)
    expect(html).toContain('data-kr-id="task-detail-card"')
    expect(html).toContain('Task #ABC1234')
    expect(html).toContain('11/10/2026 (overdue)')
    expect(html).toContain('306 Ann Example')
    expect(html).toContain('306.1 · Estate plan')
    expect(html).toContain('Dan Example, Ann Kim')
    expect(html).toContain('Sam Lead')
    expect(html).toContain('$1,250.00')
    expect(html).toContain('Ready')
    expect(html).toContain('data-kr-action="edit-task"')
    const plain = renderToStaticMarkup(<TaskDetailCard canWrite={false} task={TASKS[3]!} today={TODAY} onEdit={() => {}} />)
    expect(plain).toContain('No task description.')
    expect(plain).toContain('None (firm task)')
    expect(plain).not.toContain('data-kr-action="edit-task"')
  })

  it('draws the panel from a given first page, with New task for a writer', () => {
    const viewer = { userId: 'u1', displayName: 'Dan Example', email: 'dan@example.com', role: 'attorney' }
    const html = renderToStaticMarkup(<TasksPanel initialData={{ tasks: TASKS, nextCursor: 'next', viewer: { canWrite: true } }} viewer={viewer} />)
    expect(html).toContain('data-kr-id="TasksPanel"')
    expect(html).toContain('Mine')
    expect(html).toContain('Everyone')
    expect(html).toContain('+ New task')
    expect(html).toContain('Load more tasks')
    expect(html).toContain('data-kr-id="task-detail-card"')
    const reader = renderToStaticMarkup(<TasksPanel initialData={{ tasks: [], nextCursor: null, viewer: { canWrite: false } }} />)
    expect(reader).not.toContain('+ New task')
    expect(reader).not.toContain('>Mine<')
    expect(reader).toContain('No open tasks match this filter.')
  })

  it('draws New task with the Task Settings note and nothing ticked', () => {
    const html = renderToStaticMarkup(<TaskEditDialog inline initialStaff={STAFF} task={null} onClose={() => {}} onSaved={() => {}} />)
    expect(html).toContain('data-kr-id="TaskEditDialog"')
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
    expect(html).toContain('New task')
    expect(html).toContain('Create task')
    expect(html).toContain('your Task Settings decide')
    expect(html).toContain('DK - Dan Example')
    expect(html).not.toContain('checked=""')
    expect(html).toContain('Choose a client first')
    expect(html).not.toContain('Discard changes?')
  })

  it('draws Edit with the saved values, the ticked assignees and the saved matter', () => {
    const html = renderToStaticMarkup(<TaskEditDialog inline initialStaff={STAFF} task={TASKS[0]!} onClose={() => {}} onSaved={() => {}} />)
    expect(html).toContain('Edit Task #ABC1234')
    expect(html).toContain('value="File the deed"')
    expect(html).toContain('value="306 Ann Example"')
    expect(html).toContain('306.1 · Estate plan')
    expect(html).toContain('value="2026-11-10"')
    expect(html).toContain('value="1250"')
    expect(html.match(/checked=""/g)).toHaveLength(2)
    expect(html).toContain('The first ticked is the main assignee.')
    expect(html).toContain('Save task')
  })
})
