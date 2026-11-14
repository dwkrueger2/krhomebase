'use client'
// file: apps/web/features/tasks/components/TaskDetailCard.client.tsx
/**
 * The selected task's card on the right of the Tasks screen (plan 10, stage 5): the title, the description and every
 * field read-only, as label-beside-value rows (Save height before width), with Edit for people who may write.
 *
 * New code. The old screen (`hb-components/KR-WorkStream/TaskWorkstreamPanel.client.tsx`) showed a task in the
 * WorkStream summary card; its "No task description." wording is kept. The card's title is the task's id as people
 * write it in text, `Task #ABC1234` (D21). "—" stands for an empty value.
 *
 * The panel owns the selected task and the edit dialog; this card draws the task and calls `onEdit`.
 */

import type { Task } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import {
  assigneesFullLabel,
  formatBillingValue,
  formatShortDateTime,
  localToday,
  taskBillingStatusLabel,
  taskClientLabel,
  taskDisplayId,
  taskDueInfo,
  taskMatterLabel,
  taskPriorityLabel,
  taskStatusLabel,
} from '../taskRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  title: 'text-[13px] font-[800] leading-tight [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  description: 'text-[12px] leading-[1.3] whitespace-pre-wrap [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  descriptionEmpty: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  factLabel: 'text-[10.5px] font-[700] text-(color:--kr-theme-text-muted)',
  factValue: 'min-w-0 text-[12px] leading-tight [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  overdue: 'font-[700] text-(color:--kr-theme-danger)',
  rule: 'border-t border-(--kr-theme-line)',
  button: 'px-[8px] py-[2px] gap-[4px] min-h-[24px] inline-flex items-center rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background)',
  icon: 'size-[12px]',
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
  body: 'gap-[6px] grid min-w-0',
  text: 'm-0',
  facts: 'gap-y-[2px] grid',
  fact: 'gap-x-[3px] grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-baseline',
  divider: 'pt-[4px]',
} as const

export interface TaskDetailCardProps {
  task: Task
  /** May change tasks (the list's `viewer.canWrite`): shows Edit. */
  canWrite: boolean
  onEdit: () => void
  /** `YYYY-MM-DD` for the overdue rule; today by default (tests pass a fixed day). */
  today?: string
}

/**
 * Renders one task read-only, with Edit.
 *
 * @param props - The task, whether the viewer may write, and the panel's Edit handler.
 * @returns The `task-detail-card` block.
 */
export default function TaskDetailCard({ canWrite, onEdit, task, today = localToday() }: TaskDetailCardProps) {
  const due = taskDueInfo(task, today)
  const work: Array<[string, string, boolean?]> = [
    ['Status', taskStatusLabel(task.status)],
    ['Priority', taskPriorityLabel(task.priority)],
    ['Due', due.overdue ? `${due.label} (overdue)` : due.label, due.overdue],
    ['Client', taskClientLabel(task)],
    ['Matter', taskMatterLabel(task)],
    ['Assignees', assigneesFullLabel(task)],
    ['Supervisor', task.supervisorLabel || '—'],
  ]
  if (task.typeLabel) work.push(['Kind', task.typeLabel])
  const billing: Array<[string, string]> = [
    ['Billing value', formatBillingValue(task.billingValue)],
    ['Billing status', taskBillingStatusLabel(task.billingStatus)],
    ['Billing note', task.billingDescription || '—'],
  ]
  const record: Array<[string, string]> = [
    ['Created', `${formatShortDateTime(task.createdAt)} · ${task.createdByLabel}`],
    ['Updated', formatShortDateTime(task.updatedAt)],
  ]
  if (task.completedAt) record.push(['Completed', formatShortDateTime(task.completedAt)])

  const factList = (rows: Array<[string, string, boolean?]>, marker: string) => (
    <dl className={`${LAYOUT_STYLES.text} ${LAYOUT_STYLES.facts}`} data-kr-element={marker}>
      {rows.map(([label, value, alert]) => (
        <div className={LAYOUT_STYLES.fact} key={label}>
          <dt className={STYLES.factLabel}>{label}</dt>
          <dd className={`${LAYOUT_STYLES.text} ${STYLES.factValue} ${alert ? STYLES.overdue : ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )

  return (
    <div data-kr-id="task-detail-card">
      <KRModuleCard
        actions={
          canWrite ? (
            <button className={STYLES.button} data-kr-action="edit-task" type="button" onClick={onEdit}>
              <KRHomebaseIcons.Pencil className={STYLES.icon} />
              Edit
            </button>
          ) : null
        }
        krId="TaskDetail"
        title={taskDisplayId(task)}
      >
        <div className={LAYOUT_STYLES.body}>
          {/* Task title and description: what is to be done. */}
          <h3 className={`${LAYOUT_STYLES.text} ${STYLES.title}`}>{task.title}</h3>
          {task.description ? <p className={`${LAYOUT_STYLES.text} ${STYLES.description}`}>{task.description}</p> : <p className={`${LAYOUT_STYLES.text} ${STYLES.descriptionEmpty}`}>No task description.</p>}
          {/* Work facts: status, dates, client and matter, people. */}
          {factList(work, 'task-detail-work')}
          {/* Billing facts. */}
          <div className={`${LAYOUT_STYLES.divider} ${STYLES.rule}`}>{factList(billing, 'task-detail-billing')}</div>
          {/* Record facts: who recorded it and when it changed. */}
          <div className={`${LAYOUT_STYLES.divider} ${STYLES.rule}`}>{factList(record, 'task-detail-record')}</div>
        </div>
      </KRModuleCard>
    </div>
  )
}
