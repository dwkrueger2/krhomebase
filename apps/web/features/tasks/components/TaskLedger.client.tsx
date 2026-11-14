'use client'
// file: apps/web/features/tasks/components/TaskLedger.client.tsx
/**
 * The dense task rows of the Tasks screen (plan 10, stage 5): a heading row and one row per task with Due, #, Title,
 * Client / matter, Priority, Status and Assignees, then the D10 line and "Load more tasks" while more tasks exist.
 * Loading shows `RainbowBusySpinner`; a failure shows the API's sentence with Try again; an empty list says so.
 *
 * New code. The old screen (`hb-components/KR-WorkStream/TaskWorkstreamPanel.client.tsx`) showed tasks as WorkStream
 * activity cards mixed with WorkStream "Tasks" entries; this ledger shows real tasks only, in the API's order (earliest
 * due date first, no due date last). Nothing here re-sorts them.
 *
 * Rows follow the Density Contract's record row (the Client Accounting register): 12px text, 10.5px small print,
 * `leading-tight`, 1px cell padding, hairline rules, about 20px a row. An overdue due date (before today, not completed
 * or cancelled) is in `--kr-theme-danger`. A click selects a row; a double-click asks the panel to edit it.
 *
 * The panel (`TasksPanel`) owns the tasks, the selection and the paging; this component draws them only.
 */

import type { Task } from '@krhomebase/contracts'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { assigneesFullLabel, assigneesShortLabel, localToday, moreTasksLine, taskClientMatterNumber, taskDisplayId, taskDueInfo, taskPriorityLabel, taskShortId, taskStatusLabel } from '../taskRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  table: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  headRow: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  headCell: 'p-[1px] overflow-hidden whitespace-nowrap text-left text-[10.5px] font-[700] uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted)',
  row: 'min-h-[20px] w-full cursor-pointer border-0 border-b border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-left text-[12px] leading-tight text-(color:--kr-theme-text) hover:bg-(--kr-theme-table-row-hover)',
  rowSelected: 'bg-(--kr-theme-table-row-selected) hover:bg-(--kr-theme-table-row-selected)',
  cell: 'p-[1px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  small: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  idCell: 'text-[10.5px] tabular-nums text-(color:--kr-theme-text-muted)',
  dueCell: 'tabular-nums',
  overdue: 'font-[700] text-(color:--kr-theme-danger)',
  urgent: 'font-[700] text-(color:--kr-theme-danger)',
  high: 'font-[700]',
  clientName: 'text-(color:--kr-theme-text-muted)',
  empty: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  more: 'border-t border-(--kr-theme-line) bg-(--kr-theme-shell-surface) text-[10.5px] text-(color:--kr-theme-text-muted)',
  moreButton: 'min-h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
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
  // The table scrolls sideways inside itself on narrow screens; the page never does.
  viewport: 'min-w-0 overflow-x-auto',
  table: 'min-w-[640px]',
  // One column template for the heading and every row: Due, #, Title, Client / matter, Priority, Status, Assignees.
  columns: 'px-[4px] gap-x-[6px] grid grid-cols-[74px_64px_minmax(140px,1fr)_minmax(90px,170px)_54px_76px_minmax(44px,90px)] items-center',
  clientCell: 'gap-[3px] flex min-w-0 items-baseline',
  status: 'p-[8px] gap-[6px] flex items-center',
  more: 'px-[6px] py-[3px] gap-[6px] flex flex-wrap items-center justify-between',
  moreButton: 'px-[8px] py-[1px] gap-[4px] inline-flex items-center',
} as const

export interface TaskLedgerProps {
  tasks: readonly Task[]
  /** The selected task's id; the panel shows its card beside the rows. */
  selectedId: string | null
  onSelect: (task: Task) => void
  /** Double-click: edit the task (absent when the viewer may not write). */
  onOpen?: (task: Task) => void
  loading: boolean
  /** The reason the list could not be read, or "". */
  error: string
  onRetry: () => void
  /** The sentence for an empty list (it depends on the filters). */
  emptyMessage: string
  /** More tasks exist beyond the loaded ones (D10). */
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** `YYYY-MM-DD` for the overdue rule; today by default (tests pass a fixed day). */
  today?: string
}

/**
 * Renders the task rows with their loading, failure, empty and "more exist" states.
 *
 * @param props - The loaded tasks in the API's order, the selection and its handlers, the list state, and paging.
 * @returns The `tasks-ledger` section.
 */
export default function TaskLedger({ emptyMessage, error, hasMore, loading, loadingMore, onLoadMore, onOpen, onRetry, onSelect, selectedId, tasks, today = localToday() }: TaskLedgerProps) {
  const moreLine = moreTasksLine(tasks.length, hasMore)

  return (
    <section aria-label="Tasks" className={`${LAYOUT_STYLES.viewport} ${STYLES.table}`} data-kr-id="tasks-ledger">
      <div className={LAYOUT_STYLES.table} role="table">
        {/* Heading row: the same column template as every task row. */}
        <div className={`${LAYOUT_STYLES.columns} ${STYLES.headRow}`} data-kr-element="tasks-ledger-head" role="row">
          <span className={STYLES.headCell} role="columnheader">Due</span>
          <span className={STYLES.headCell} role="columnheader">#</span>
          <span className={STYLES.headCell} role="columnheader">Title</span>
          <span className={STYLES.headCell} role="columnheader">Client / matter</span>
          <span className={STYLES.headCell} role="columnheader">Priority</span>
          <span className={STYLES.headCell} role="columnheader">Status</span>
          <span className={STYLES.headCell} role="columnheader">Assignees</span>
        </div>

        {/* Rows: loading, failure, the tasks, or the empty sentence. */}
        <div data-kr-element="tasks-ledger-rows" role="rowgroup">
          {loading ? (
            <div className={LAYOUT_STYLES.status} role="status">
              <RainbowBusySpinner busy hideWhenIdle={false} label="Loading tasks..." size={16} />
            </div>
          ) : error ? (
            <div className={LAYOUT_STYLES.status} role="alert">
              <p className={STYLES.error}>{error}</p>
              <button className={`${LAYOUT_STYLES.moreButton} ${STYLES.moreButton}`} type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : tasks.length ? (
            tasks.map((task) => {
              const due = taskDueInfo(task, today)
              const selected = task.id === selectedId
              return (
                <button
                  aria-pressed={selected}
                  className={`${LAYOUT_STYLES.columns} ${STYLES.row} ${selected ? STYLES.rowSelected : ''}`}
                  data-kr-element="tasks-ledger-row"
                  key={task.id}
                  role="row"
                  title={onOpen ? `${taskDisplayId(task)}: double-click to edit` : taskDisplayId(task)}
                  type="button"
                  onClick={() => onSelect(task)}
                  onDoubleClick={() => onOpen?.(task)}
                >
                  <span className={`${STYLES.cell} ${STYLES.dueCell} ${due.overdue ? STYLES.overdue : ''}`} data-kr-element={due.overdue ? 'task-overdue' : undefined} role="cell" title={due.overdue ? `Overdue: due ${due.label}` : due.label}>
                    {task.dueDate ? due.label : '—'}
                  </span>
                  <span className={`${STYLES.cell} ${STYLES.idCell}`} role="cell">{taskShortId(task)}</span>
                  <span className={STYLES.cell} role="cell" title={task.title}>{task.title}</span>
                  <span className={`${STYLES.cell} ${LAYOUT_STYLES.clientCell} ${STYLES.small}`} role="cell" title={[task.matterNumber ?? task.clientNumber, task.clientDisplayName, task.matterTitle].filter(Boolean).join(' · ') || 'Firm task'}>
                    <span>{taskClientMatterNumber(task)}</span>
                    {task.clientDisplayName ? <span className={`${STYLES.cell} ${STYLES.clientName}`}>{task.clientDisplayName}</span> : null}
                  </span>
                  <span className={`${STYLES.cell} ${task.priority === 'urgent' ? STYLES.urgent : task.priority === 'high' ? STYLES.high : ''}`} role="cell">{taskPriorityLabel(task.priority)}</span>
                  <span className={STYLES.cell} role="cell">{taskStatusLabel(task.status)}</span>
                  <span className={`${STYLES.cell} ${STYLES.small}`} role="cell" title={assigneesFullLabel(task)}>{assigneesShortLabel(task)}</span>
                </button>
              )
            })
          ) : (
            <p className={`${LAYOUT_STYLES.status} ${STYLES.empty}`}>{emptyMessage}</p>
          )}
        </div>
      </div>

      {/* D10: say when the list is not complete, and load the next page on request. */}
      {!loading && !error && moreLine ? (
        <div className={`${LAYOUT_STYLES.more} ${STYLES.more}`} data-kr-element="tasks-ledger-more">
          <span>{moreLine}</span>
          <button className={`${LAYOUT_STYLES.moreButton} ${STYLES.moreButton}`} disabled={loadingMore} type="button" onClick={onLoadMore}>
            {loadingMore ? <RainbowBusySpinner ariaLabel="Loading more tasks" busy size={12} /> : null}
            {loadingMore ? 'Loading...' : 'Load more tasks'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
