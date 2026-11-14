'use client'
// file: apps/web/features/tasks/components/TaskEditDialog.client.tsx
/**
 * New task and Edit task, one dialog (plan 10, stage 5). Fields: Title (required), Status, Priority, Due date,
 * Supervisor, Client and Matter (`TaskClientPicker`), Description, Assignees (tick boxes of the active staff from
 * `fetchWorkstreamAssignees`), Billing value, Billing status and Billing note. Labels sit beside their fields and short
 * fields share a row, so the whole form fits a 1280 by 720 window (Save height before width).
 *
 * Saving:
 *  - New: `POST /v1/tasks`. `assigneeUserIds` is sent only when the person changed the ticks; left as is, the API
 *    applies the person's Task Settings (assign the creator by default, D20). The note beside Assignees says so.
 *  - Edit: `PATCH /v1/tasks/{id}` with the changed fields only, then `PUT .../assignees` only when the ticks changed.
 *    When the PATCH saved and the PUT failed, the saved fields are kept as the new starting point, so Save again
 *    sends only the assignees.
 *  - Saving shows `RainbowBusySpinner`; a refusal shows the API's sentence (`TasksApiError`). Saves go to the live
 *    database, also under `pnpm dev`.
 *
 * Closing with unsaved changes (Close, Cancel, Escape, or a press outside the dialog) asks "Discard changes?" in
 * `U6ConfirmationDialog`. A press outside counts only when it lands on the backdrop's own elements (checked by
 * identity), because React passes events from portals up the component tree, which closed a dialog by mistake before.
 *
 * Drawn into `document.body` with `data-kr-theme-scope="krhomebase"`; `inline` draws it in place for tests. New code;
 * the old screen created tasks through the WorkStream Add activity dialog with a title, a note and one assignee.
 */

import { TASK_BILLING_STATUSES, TASK_PRIORITIES, TASK_STATUSES, type Task, type WorkstreamAssignee } from '@krhomebase/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { fetchWorkstreamAssignees } from '@/features/communications/api.client'
import { L } from '@/lib/KRUtilities'
import { createTask, replaceTaskAssignees, updateTask } from '../api.client'
import {
  assigneesChanged,
  draftFromTask,
  emptyTaskDraft,
  taskBillingStatusLabel,
  taskCreateBody,
  taskDisplayId,
  taskDraftProblem,
  taskMatterLabel,
  taskPriorityLabel,
  taskStatusLabel,
  taskUpdateBody,
  toggleAssignee,
  type TaskDraft,
} from '../taskRows'
import TaskClientPicker from './TaskClientPicker.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-[rgba(0,30,58,0.4)]',
  dialog: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  eyebrow: 'text-[10px] font-[800] uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  title: 'text-[14px] font-[800] leading-tight',
  label: 'text-[11px] font-[700] text-(color:--kr-theme-text-muted)',
  input:
    'px-[6px] py-[2px] min-h-[24px] w-full min-w-0 rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  textarea:
    'px-[6px] py-[2px] min-h-[52px] w-full min-w-0 resize-y rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-[1.3] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  assigneeBox: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  checkLabel: 'min-w-0 truncate text-[12px] leading-tight text-(color:--kr-theme-text) cursor-pointer',
  checkbox: 'size-[13px] shrink-0 cursor-pointer accent-(--kr-theme-brand-primary-active)',
  note: 'text-[10.5px] leading-tight text-(color:--kr-theme-text-muted)',
  error: 'text-[11px] font-[600] text-(color:--kr-theme-danger)',
  footer: 'border-t border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  secondaryButton: 'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border border-(--kr-theme-line) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton: 'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background) disabled:cursor-not-allowed disabled:opacity-50',
  closeButton: 'p-0 size-[24px] inline-flex items-center justify-center rounded-[3px] border border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text) cursor-pointer disabled:opacity-50',
  closeIcon: 'size-[12px]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities, in the order the rows are drawn. */
const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1100] overflow-y-auto',
  viewport: 'flex min-h-full items-center justify-center',
  dialog: 'w-full max-w-[760px] overflow-hidden rounded-[4px]',
  header: 'px-[8px] py-[6px] gap-[6px] flex items-start justify-between',
  text: 'm-0',
  body: 'p-[8px] gap-[4px] grid',
  // One field across the dialog: label column, then the field.
  fullRow: 'gap-x-[3px] grid grid-cols-1 items-center md:grid-cols-[84px_minmax(0,1fr)]',
  fullRowTop: 'gap-x-[3px] grid grid-cols-1 items-start md:grid-cols-[84px_minmax(0,1fr)]',
  // Two short fields side by side, each with its label beside it.
  pairRow: 'gap-x-[10px] gap-y-[4px] grid grid-cols-1 md:grid-cols-2',
  fieldRow: 'gap-x-[3px] grid grid-cols-1 items-center md:grid-cols-[84px_minmax(0,1fr)]',
  assigneeField: 'gap-[2px] grid min-w-0',
  assigneeBox: 'px-[4px] py-[2px] gap-x-[8px] grid max-h-[96px] grid-cols-1 overflow-y-auto md:grid-cols-3',
  checkRow: 'gap-[3px] flex min-h-[18px] min-w-0 items-center',
  labelStack: 'pt-[3px]',
  footer: 'px-[8px] py-[6px] gap-[4px] flex items-center justify-end',
  footerError: 'mr-auto',
} as const

export interface TaskEditDialogProps {
  /** The task to edit, or null for New task. */
  task: Task | null
  /**
   * A save reached the API. `done` true: the dialog is finished (the panel closes it). `done` false: the fields were
   * saved but the assignees were not, so the dialog stays open with the message.
   */
  onSaved: (task: Task, done: boolean) => void
  /** Closes without saving (after "Discard changes?" when there are changes). */
  onClose: () => void
  /** The staff list, when the caller already has it (tests); otherwise the dialog loads it. */
  initialStaff?: readonly WorkstreamAssignee[]
  /** For server-render tests: draw in place instead of a portal. */
  inline?: boolean
}

/** A staff choice: id and label. */
interface StaffChoice {
  id: string
  label: string
}

/**
 * Renders the New task / Edit task dialog and saves it.
 *
 * @param props - The task (null for New), the saved and close handlers, an optional staff list and `inline`.
 */
export default function TaskEditDialog({ initialStaff, inline = false, onClose, onSaved, task }: TaskEditDialogProps) {
  const isNew = task === null
  const [initialDraft] = useState<TaskDraft>(() => (task ? draftFromTask(task) : emptyTaskDraft()))
  const [draft, setDraft] = useState<TaskDraft>(initialDraft)
  // The saved task the PATCH compares with; it moves forward after a save whose assignee step failed.
  const [baseline, setBaseline] = useState<Task | null>(task)
  const [assigneesTouched, setAssigneesTouched] = useState(false)
  const [staff, setStaff] = useState<readonly WorkstreamAssignee[] | null>(initialStaff ?? null)
  const [staffError, setStaffError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const dirty = (isNew && assigneesTouched) || JSON.stringify(draft) !== JSON.stringify(initialDraft)

  // The staff list for Assignees and Supervisor, once per opening (unless given).
  useEffect(() => {
    if (initialStaff) return
    let live = true
    fetchWorkstreamAssignees()
      .then((data) => live && setStaff(data.users))
      .catch((caught: unknown) => {
        L(`[TASK_EDIT:139] staff failed error=${caught instanceof Error ? caught.message.slice(0, 80) : 'unknown'}`)
        if (live) setStaffError('The staff list could not be loaded; the saved assignees and supervisor are kept.')
      })
    return () => {
      live = false
    }
  }, [initialStaff])

  /** Asks before closing when something changed; never while saving. */
  function requestClose(): void {
    if (saving) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  // Escape: closes the discard question first, then the dialog. A press another field already handled is skipped.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (confirmDiscard) setConfirmDiscard(false)
      else requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Staff choices: the active staff, plus any saved assignee or supervisor who is no longer on that list.
  const staffChoices = useMemo<StaffChoice[]>(() => {
    const choices: StaffChoice[] = (staff ?? []).map((user) => ({ id: user.id, label: user.label }))
    const known = new Set(choices.map((choice) => choice.id))
    for (const assignee of task?.assignees ?? []) if (!known.has(assignee.userId)) choices.push({ id: assignee.userId, label: assignee.label })
    if (task?.supervisorUserId && !choices.some((choice) => choice.id === task.supervisorUserId)) choices.push({ id: task.supervisorUserId, label: task.supervisorLabel ?? 'Saved supervisor' })
    return choices
  }, [staff, task])

  const change = (fields: Partial<TaskDraft>) => setDraft((current) => ({ ...current, ...fields }))

  async function save(): Promise<void> {
    const problem = taskDraftProblem(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    let patched: Task | null = null
    try {
      if (!baseline) {
        const { task: created } = await createTask(taskCreateBody(draft, assigneesTouched))
        L(`[TASK_EDIT:186] created taskId=${created.id} assigneesSent=${assigneesTouched}`)
        onSaved(created, true)
        return
      }
      let current = baseline
      const patch = taskUpdateBody(current, draft)
      if (Object.keys(patch).length) {
        current = (await updateTask(current.id, patch)).task
        patched = current
        L(`[TASK_EDIT:195] updated taskId=${current.id} fields=${Object.keys(patch).join(',')}`)
      }
      if (assigneesChanged(current, draft)) {
        current = (await replaceTaskAssignees(current.id, draft.assigneeUserIds)).task
        L(`[TASK_EDIT:199] assignees taskId=${current.id} count=${draft.assigneeUserIds.length}`)
      }
      onSaved(current, true)
    } catch (caught) {
      L(`[TASK_EDIT:203] save failed taskId=${baseline?.id ?? 'new'} error=${caught instanceof Error ? caught.message.slice(0, 80) : 'unknown'}`)
      const message = caught instanceof Error && caught.message ? caught.message : 'The task was not saved.'
      if (patched) {
        setBaseline(patched)
        onSaved(patched, false)
        setError(`The fields were saved; the assignees were not. ${message}`)
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const assigneeNote = isNew
    ? assigneesTouched
      ? 'Saved as ticked; none ticked assigns nobody.'
      : 'Left as is, your Task Settings decide (by default you are assigned).'
    : 'The first ticked is the main assignee.'

  const dialog = (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-theme-scope="krhomebase"
      ref={backdropRef}
      role="presentation"
      onMouseDown={(event) => {
        // Only a press on the backdrop's own elements; events from portals inside the tree are not outside presses.
        if (event.target === backdropRef.current || event.target === viewportRef.current) requestClose()
      }}
    >
      <div className={LAYOUT_STYLES.viewport} ref={viewportRef}>
        <section aria-busy={saving} aria-labelledby="task-edit-dialog-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="TaskEditDialog" role="dialog">
          {/* Dialog header: which task, and Close. */}
          <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
            <div>
              <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>{task ? taskDisplayId(task) : 'Tasks'}</p>
              <h2 className={`${LAYOUT_STYLES.text} ${STYLES.title}`} id="task-edit-dialog-title">
                {task ? `Edit ${taskDisplayId(task)}` : 'New task'}
              </h2>
            </div>
            <button aria-label="Close the task dialog" className={STYLES.closeButton} disabled={saving} title="Close" type="button" onClick={requestClose}>
              <KRHomebaseIcons.Close className={STYLES.closeIcon} />
            </button>
          </header>

          {/* Dialog body: the task's fields, short ones side by side. */}
          <div className={LAYOUT_STYLES.body}>
            {/* Title row: required. */}
            <label className={LAYOUT_STYLES.fullRow} data-kr-element="task-edit-title-row">
              <span className={STYLES.label}>Title</span>
              <input autoFocus className={STYLES.input} disabled={saving} maxLength={300} placeholder="What is to be done (required)" required value={draft.title} onChange={(event) => change({ title: event.target.value })} />
            </label>

            {/* Status and priority row. */}
            <div className={LAYOUT_STYLES.pairRow} data-kr-element="task-edit-status-row">
              <label className={LAYOUT_STYLES.fieldRow}>
                <span className={STYLES.label}>Status</span>
                <select className={STYLES.input} disabled={saving} value={draft.status} onChange={(event) => change({ status: event.target.value as TaskDraft['status'] })}>
                  {TASK_STATUSES.map((value) => <option key={value} value={value}>{taskStatusLabel(value)}</option>)}
                </select>
              </label>
              <label className={LAYOUT_STYLES.fieldRow}>
                <span className={STYLES.label}>Priority</span>
                <select className={STYLES.input} disabled={saving} value={draft.priority} onChange={(event) => change({ priority: event.target.value as TaskDraft['priority'] })}>
                  {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{taskPriorityLabel(value)}</option>)}
                </select>
              </label>
            </div>

            {/* Due date and supervisor row. */}
            <div className={LAYOUT_STYLES.pairRow} data-kr-element="task-edit-due-row">
              <label className={LAYOUT_STYLES.fieldRow}>
                <span className={STYLES.label}>Due date</span>
                <input className={STYLES.input} disabled={saving} type="date" value={draft.dueDate} onChange={(event) => change({ dueDate: event.target.value })} />
              </label>
              <label className={LAYOUT_STYLES.fieldRow}>
                <span className={STYLES.label}>Supervisor</span>
                <select className={STYLES.input} disabled={saving} value={draft.supervisorUserId} onChange={(event) => change({ supervisorUserId: event.target.value })}>
                  <option value="">None</option>
                  {staffChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                </select>
              </label>
            </div>

            {/* Client and matter row: the client search and that client's matters. */}
            <div className={LAYOUT_STYLES.pairRow}>
              <TaskClientPicker
                disabled={saving}
                savedMatter={task?.matterId ? { id: task.matterId, label: taskMatterLabel(task) } : null}
                value={{ clientId: draft.clientId, clientLabel: draft.clientLabel, matterId: draft.matterId }}
                onChange={(next) => change(next)}
              />
            </div>

            {/* Description row: a short text area. */}
            <label className={LAYOUT_STYLES.fullRowTop} data-kr-element="task-edit-description-row">
              <span className={`${LAYOUT_STYLES.labelStack} ${STYLES.label}`}>Description</span>
              <textarea className={STYLES.textarea} disabled={saving} maxLength={10000} rows={3} value={draft.description} onChange={(event) => change({ description: event.target.value })} />
            </label>

            {/* Assignees row: tick boxes of the active staff, with the note on how they are saved. */}
            <div className={LAYOUT_STYLES.fullRowTop} data-kr-element="task-edit-assignees-row">
              <span className={`${LAYOUT_STYLES.labelStack} ${STYLES.label}`}>Assignees</span>
              <div className={LAYOUT_STYLES.assigneeField}>
                <div aria-label="Assignees" className={`${LAYOUT_STYLES.assigneeBox} ${STYLES.assigneeBox}`} role="group">
                  {staffChoices.map((choice) => {
                    const checked = draft.assigneeUserIds.includes(choice.id)
                    return (
                      <label className={LAYOUT_STYLES.checkRow} key={choice.id} title={choice.label}>
                        <input
                          checked={checked}
                          className={STYLES.checkbox}
                          disabled={saving}
                          type="checkbox"
                          onChange={(event) => {
                            setAssigneesTouched(true)
                            change({ assigneeUserIds: toggleAssignee(draft.assigneeUserIds, choice.id, event.target.checked) })
                          }}
                        />
                        <span className={STYLES.checkLabel}>{choice.label}</span>
                      </label>
                    )
                  })}
                  {!staff && !staffError ? <RainbowBusySpinner busy hideWhenIdle={false} label="Loading staff..." size={12} /> : null}
                </div>
                <p className={`${LAYOUT_STYLES.text} ${STYLES.note}`} data-kr-element="task-edit-assignee-note">{staffError || assigneeNote}</p>
              </div>
            </div>

            {/* Billing value and billing status row. */}
            <div className={LAYOUT_STYLES.pairRow} data-kr-element="task-edit-billing-row">
              <label className={LAYOUT_STYLES.fieldRow}>
                <span className={STYLES.label}>Billing value</span>
                <input className={STYLES.input} disabled={saving} inputMode="decimal" placeholder="0.00" value={draft.billingValue} onChange={(event) => change({ billingValue: event.target.value })} />
              </label>
              <label className={LAYOUT_STYLES.fieldRow}>
                <span className={STYLES.label}>Billing status</span>
                <select className={STYLES.input} disabled={saving} value={draft.billingStatus} onChange={(event) => change({ billingStatus: event.target.value as TaskDraft['billingStatus'] })}>
                  {TASK_BILLING_STATUSES.map((value) => <option key={value} value={value}>{taskBillingStatusLabel(value)}</option>)}
                </select>
              </label>
            </div>

            {/* Billing note row: the billing description. */}
            <label className={LAYOUT_STYLES.fullRow} data-kr-element="task-edit-billing-description-row">
              <span className={STYLES.label}>Billing note</span>
              <input className={STYLES.input} disabled={saving} maxLength={4000} placeholder="Billing description" value={draft.billingDescription} onChange={(event) => change({ billingDescription: event.target.value })} />
            </label>
          </div>

          {/* Dialog actions: the API's sentence on a refusal, the busy spinner, Cancel and Save. */}
          <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
            {error ? <p className={`${LAYOUT_STYLES.text} ${LAYOUT_STYLES.footerError} ${STYLES.error}`} role="alert">{error}</p> : null}
            {saving ? <RainbowBusySpinner busy label="Saving..." size={14} /> : null}
            <button className={STYLES.secondaryButton} disabled={saving} type="button" onClick={requestClose}>Cancel</button>
            <button className={STYLES.primaryButton} data-kr-action="save-task" disabled={saving || (!isNew && !dirty)} type="button" onClick={() => void save()}>
              {saving ? 'Saving...' : isNew ? 'Create task' : 'Save task'}
            </button>
          </footer>
        </section>
      </div>

      {/* Unsaved changes: asked inside the dialog's own tree, so a press on it is never an outside press. */}
      <U6ConfirmationDialog
        confirmLabel="Discard"
        description="Close this task without saving your changes?"
        open={confirmDiscard}
        title="Discard changes?"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
      />
    </div>
  )

  if (inline) return dialog
  if (typeof document === 'undefined') return null
  return createPortal(dialog, document.body)
}
