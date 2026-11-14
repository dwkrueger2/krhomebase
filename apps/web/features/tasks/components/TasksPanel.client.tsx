'use client'
// file: apps/web/features/tasks/components/TasksPanel.client.tsx
/**
 * The Tasks screen (menu id `tasks`; plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 5). It replaces the
 * "Module [TBD]" placeholder. `app/page.tsx` places it in the workspace and the pop-out window and passes the
 * signed-in `viewer`.
 *
 * What it draws:
 *  - A compact header ("Tasks", the purpose line, the count of loaded tasks) and a filter bar: Mine / Everyone (Mine,
 *    the default, asks the API for tasks the viewer is a current assignee of), Status Open (the API default: open, in
 *    progress and waiting) or All (`includeClosed=true`), and "+ New task" when the list's `viewer.canWrite` says so.
 *  - `TaskLedger`: dense rows in the API's order (earliest due date first, no due date last), 50 a page, "Load more
 *    tasks" and a line while more exist (D10); overdue due dates in the danger color.
 *  - `TaskDetailCard` for the selected task on the right (the first row until one is chosen), with Edit.
 *  - `TaskEditDialog` for New task and Edit (a double-click on a row edits it too).
 *
 * Calls (`../api.client.ts`): `GET /v1/tasks` here; the dialog creates and changes tasks. Who (D9): every staff role
 * reads and writes; there is no delete. Saves go to the live database, also under `pnpm dev`.
 *
 * Changes from the old screen (`hb-components/KR-WorkStream/TaskWorkstreamPanel.client.tsx`, "WorkStream · Tasks"):
 *  - Real tasks only. The old screen merged WorkStream "Tasks" entries (`/workstream/Tasks?feed=global`) with the
 *    task rows; WorkStream entries stay on the Workstream screens, and the two refer to each other only in text,
 *    `Task #ABC1234` and `WS #XYZ7890` (D21).
 *  - The old assignee filter (one person, the viewer by default) became Mine / Everyone, asked of the API.
 *  - A saved task is put into the list from the API's reply (the old screen built a stand-in row with "Just now").
 *  - Loading and failure show in the list with `RainbowBusySpinner` or the API's sentence and Try again.
 *
 * State: this panel owns the filters, the loaded tasks, the paging cursor, the selection, the open dialog and the
 * status line. Its children take values and handlers only.
 */

import type { Task, TasksData } from '@krhomebase/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunicationsViewer } from '@/features/communications/communicationTypes'
import { L } from '@/lib/KRUtilities'
import { fetchTasks } from '../api.client'
import { appendTasks, emptyTasksMessage, taskDisplayId, TASKS_PAGE_SIZE, upsertTask, type TaskScope, type TaskStatusFilter } from '../taskRows'
import TaskDetailCard from './TaskDetailCard.client'
import TaskEditDialog from './TaskEditDialog.client'
import TaskLedger from './TaskLedger.client'

const NO_RIGHTS: TasksData['viewer'] = { canWrite: false }

const SCOPE_CHOICES: ReadonlyArray<{ value: TaskScope; label: string; title: string }> = [
  { value: 'mine', label: 'Mine', title: 'Tasks you are assigned to' },
  { value: 'everyone', label: 'Everyone', title: 'Every task in the firm' },
]
const STATUS_CHOICES: ReadonlyArray<{ value: TaskStatusFilter; label: string; title: string }> = [
  { value: 'open', label: 'Open', title: 'Open, in progress and waiting' },
  { value: 'all', label: 'All', title: 'Also completed and cancelled' },
]

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  shell: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  rule: 'border-(--kr-theme-line)',
  title: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-brand-primary)',
  subtitle: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  count: 'rounded-[3px] bg-(--kr-theme-muted-surface) text-(color:--kr-theme-brand-primary)',
  countNumber: 'text-[16px] font-[900] leading-none tabular-nums',
  countLabel: 'text-[10px] font-[800] uppercase tracking-[0.05em]',
  filterBar: 'bg-(--kr-theme-shell-surface)',
  eyebrow: 'text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-text-muted)',
  filter: 'min-h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active)',
  filterActive: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  filterIdle: 'bg-(--kr-theme-card-surface)',
  addButton:
    'min-h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[900] text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  status: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-success)',
  empty: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  header: 'px-[8px] py-[6px] gap-[8px] flex items-start justify-between border-b',
  headerCopy: 'min-w-0 gap-[2px] grid',
  count: 'px-[6px] py-[3px] min-w-[42px] flex flex-col items-center',
  countLabel: 'mt-[2px]',
  filterBar: 'px-[8px] py-[4px] gap-[6px] flex flex-wrap items-center justify-between border-b',
  filterGroups: 'min-w-0 gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  filterChoices: 'gap-x-[4px] flex items-center',
  filterLabel: 'mr-[2px]',
  filter: 'px-[6px] py-[1px]',
  actionGroup: 'gap-[6px] flex shrink-0 items-center',
  addButton: 'px-[8px] py-[2px] gap-[4px] inline-flex items-center',
  body: 'p-[8px] gap-[8px] grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]',
  list: 'min-w-0 self-start',
  detail: 'min-w-0',
} as const

/** Which dialog is open: New task, Edit of one task, or none. */
type TaskDialogState = { mode: 'new' } | { mode: 'edit'; task: Task } | null

export interface TasksPanelProps {
  /** The signed-in person (`app/page.tsx`): Mine filters by this user id. Optional so the module-level panel list type-checks. */
  viewer?: CommunicationsViewer | null
  /** A first page given instead of loading one (tests draw the screen without the API). */
  initialData?: TasksData
}

/**
 * Renders the Tasks screen: header and filters, the task rows, the selected task's card, and the task dialog.
 *
 * @param props - The signed-in `viewer` and, for tests, a first page.
 */
export default function TasksPanel({ initialData, viewer = null }: TasksPanelProps) {
  const [scope, setScope] = useState<TaskScope>(viewer ? 'mine' : 'everyone')
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('open')
  const [tasks, setTasks] = useState<Task[]>(initialData?.tasks ?? [])
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null)
  const [rights, setRights] = useState<TasksData['viewer']>(initialData?.viewer ?? NO_RIGHTS)
  const [loading, setLoading] = useState(!initialData)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<TaskDialogState>(null)
  const [status, setStatus] = useState('')
  const requestRef = useRef(0)
  const skipFirstLoad = useRef(Boolean(initialData))

  const assigneeUserId = scope === 'mine' ? (viewer?.userId ?? null) : null
  const includeClosed = statusFilter === 'all'

  // The first page, again whenever a filter changes or Try again is pressed (a later reply wins over an older one).
  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false
      return
    }
    const request = ++requestRef.current
    setLoading(true)
    setError('')
    L(`[TASKS_PANEL:139] load start scope=${scope} includeClosed=${includeClosed}`)
    fetchTasks({ assigneeUserId, includeClosed, limit: TASKS_PAGE_SIZE })
      .then((data) => {
        if (request !== requestRef.current) return
        setTasks(data.tasks)
        setNextCursor(data.nextCursor)
        setRights(data.viewer)
        L(`[TASKS_PANEL:146] load done count=${data.tasks.length} more=${Boolean(data.nextCursor)}`)
      })
      .catch((caught: unknown) => {
        if (request !== requestRef.current) return
        L(`[TASKS_PANEL:150] load failed error=${caught instanceof Error ? caught.message.slice(0, 80) : 'unknown'}`)
        setTasks([])
        setNextCursor(null)
        setError(caught instanceof Error && caught.message ? caught.message : 'The tasks could not be read.')
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false)
      })
  }, [assigneeUserId, includeClosed, reloadKey, scope])

  /** The next page (D10), added after the loaded rows in the API's order. */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    const request = requestRef.current
    setLoadingMore(true)
    try {
      const data = await fetchTasks({ assigneeUserId, includeClosed, limit: TASKS_PAGE_SIZE, cursor: nextCursor })
      if (request !== requestRef.current) return
      setTasks((current) => appendTasks(current, data.tasks))
      setNextCursor(data.nextCursor)
    } catch (caught) {
      if (request === requestRef.current) setError(caught instanceof Error && caught.message ? caught.message : 'More tasks could not be read.')
    } finally {
      setLoadingMore(false)
    }
  }, [assigneeUserId, includeClosed, loadingMore, nextCursor])

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null

  /** A save reached the API: the task goes into the list (it stays until the next load, even outside the filter). */
  function saved(task: Task, done: boolean): void {
    const created = dialog?.mode === 'new'
    setTasks((current) => upsertTask(current, task))
    setSelectedId(task.id)
    if (!done) return
    setDialog(null)
    setStatus(created ? `Created ${taskDisplayId(task)}.` : `Saved ${taskDisplayId(task)}.`)
  }

  function chooseFilter(next: { scope?: TaskScope; status?: TaskStatusFilter }): void {
    if (next.scope) setScope(next.scope)
    if (next.status) setStatusFilter(next.status)
    setSelectedId(null)
    setStatus('')
  }

  return (
    <div data-kr-id="TasksPanel">
      <section className={STYLES.shell} data-kr-element="tasks-screen">
        {/* Header: the screen's name and purpose, the save result, and how many tasks are loaded. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.rule}`}>
          <div className={LAYOUT_STYLES.headerCopy}>
            <h2 className={STYLES.title}>Tasks</h2>
            <p className={STYLES.subtitle}>Firm tasks by due date; overdue dates are in red.</p>
            {status ? <p className={STYLES.status} role="status">{status}</p> : null}
          </div>
          <div aria-label={`${tasks.length} tasks loaded`} className={`${LAYOUT_STYLES.count} ${STYLES.count}`} data-kr-element="tasks-count">
            <strong className={STYLES.countNumber}>{tasks.length}</strong>
            <span className={`${LAYOUT_STYLES.countLabel} ${STYLES.countLabel}`}>loaded</span>
          </div>
        </header>

        {/* Filter bar: whose tasks, which statuses, and New task. */}
        <div aria-label="Task filters" className={`${LAYOUT_STYLES.filterBar} ${STYLES.filterBar} ${STYLES.rule}`} data-kr-element="tasks-filters">
          <div className={LAYOUT_STYLES.filterGroups}>
            {/* Whose tasks: Mine needs the signed-in person. */}
            {viewer ? (
              <div className={LAYOUT_STYLES.filterChoices} role="group" aria-label="Whose tasks">
                <span className={`${LAYOUT_STYLES.filterLabel} ${STYLES.eyebrow}`}>Show</span>
                {SCOPE_CHOICES.map((choice) => (
                  <button aria-pressed={scope === choice.value} className={`${LAYOUT_STYLES.filter} ${STYLES.filter} ${scope === choice.value ? STYLES.filterActive : STYLES.filterIdle}`} key={choice.value} title={choice.title} type="button" onClick={() => chooseFilter({ scope: choice.value })}>
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : null}
            {/* Which statuses: Open is the API's default. */}
            <div className={LAYOUT_STYLES.filterChoices} role="group" aria-label="Task status">
              <span className={`${LAYOUT_STYLES.filterLabel} ${STYLES.eyebrow}`}>Status</span>
              {STATUS_CHOICES.map((choice) => (
                <button aria-pressed={statusFilter === choice.value} className={`${LAYOUT_STYLES.filter} ${STYLES.filter} ${statusFilter === choice.value ? STYLES.filterActive : STYLES.filterIdle}`} key={choice.value} title={choice.title} type="button" onClick={() => chooseFilter({ status: choice.value })}>
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
          {rights.canWrite ? (
            <div className={LAYOUT_STYLES.actionGroup} data-kr-element="tasks-actions">
              <button className={`${LAYOUT_STYLES.addButton} ${STYLES.addButton}`} data-kr-action="new-task" type="button" onClick={() => setDialog({ mode: 'new' })}>
                + New task
              </button>
            </div>
          ) : null}
        </div>

        {/* Body: the task rows on the left, the selected task's card on the right. */}
        <div className={LAYOUT_STYLES.body}>
          <div className={LAYOUT_STYLES.list}>
            <TaskLedger
              emptyMessage={emptyTasksMessage(scope, statusFilter)}
              error={error}
              hasMore={Boolean(nextCursor)}
              loading={loading}
              loadingMore={loadingMore}
              selectedId={selected?.id ?? null}
              tasks={tasks}
              onLoadMore={() => void loadMore()}
              onOpen={rights.canWrite ? (task) => setDialog({ mode: 'edit', task }) : undefined}
              onRetry={() => setReloadKey((key) => key + 1)}
              onSelect={(task) => setSelectedId(task.id)}
            />
          </div>
          <aside aria-label="Selected task" className={LAYOUT_STYLES.detail}>
            {selected ? <TaskDetailCard canWrite={rights.canWrite} task={selected} onEdit={() => setDialog({ mode: 'edit', task: selected })} /> : <p className={STYLES.empty}>Select a task to see its detail.</p>}
          </aside>
        </div>
      </section>

      {/* The task dialog: New task or Edit (portaled into the page body). */}
      {dialog ? <TaskEditDialog key={dialog.mode === 'edit' ? dialog.task.id : 'new'} task={dialog.mode === 'edit' ? dialog.task : null} onClose={() => setDialog(null)} onSaved={saved} /> : null}
    </div>
  )
}
