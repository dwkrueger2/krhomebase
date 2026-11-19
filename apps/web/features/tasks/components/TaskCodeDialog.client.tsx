'use client'
// file: apps/web/features/tasks/components/TaskCodeDialog.client.tsx
/**
 * Opens one task by its id, from any screen (web patch 571, "Following a code"; drawn by the code-link host): reads the
 * task and shows its card (`TaskDetailCard`: the fields, the WorkStream entry box, the follow-up notes) in a dialog,
 * with Edit opening the task's own Edit dialog (`TaskEditDialog`). The Tasks screen shows a change on its next load.
 *
 * While the task loads nothing is drawn; a failure goes to `onFailed` with a plain sentence (the host says it). Escape
 * or a press on the backdrop closes, as the WorkStream dialogs do.
 */

import type { Task } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { L } from '@/lib/KRUtilities'
import { fetchTask } from '../api.client'
import TaskDetailCard from './TaskDetailCard.client'
import TaskEditDialog from './TaskEditDialog.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-[rgba(15,30,48,0.48)]',
  frame: 'rounded-[4px] bg-(--kr-theme-card-surface) shadow-[0_12px_36px_rgba(0,0,0,0.35)]',
  close: 'min-h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[800] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active)',
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
  backdrop: 'p-[10px] fixed inset-0 z-[1000] grid place-items-center overflow-auto',
  frame: 'max-h-[min(820px,calc(100vh-32px))] w-[min(420px,100%)] overflow-y-auto p-[6px] gap-[4px] grid',
  closeRow: 'flex justify-end',
  close: 'px-[8px] py-[2px]',
} as const

export interface TaskCodeDialogProps {
  taskId: string
  /** May change tasks (staff roles): Edit and the note box show. */
  canWrite: boolean
  onClose: () => void
  /** The task could not be read: the sentence to show. */
  onFailed: (message: string) => void
}

/** Reads the task, then draws its card in a dialog. */
export default function TaskCodeDialog({ canWrite, onClose, onFailed, taskId }: TaskCodeDialogProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchTask(taskId)
      .then(({ task: loaded }) => {
        if (!cancelled) setTask(loaded)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        L(`[TASK_CODE_DIALOG:66] task failed taskId=${taskId}`)
        onFailed(error instanceof Error && error.message ? error.message : `Task ${taskId} could not be read.`)
      })
    return () => {
      cancelled = true
    }
    // onFailed is the host's; a new one must not read the task again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    if (editing) return undefined
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [editing, onClose])

  if (!task || typeof document === 'undefined') return null
  return (
    <>
      {createPortal(
        <div
          className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
          data-kr-theme-scope="krhomebase"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <section aria-label={`Task ${task.id}`} aria-modal="true" className={`${LAYOUT_STYLES.frame} ${STYLES.frame}`} data-kr-element="task-code-dialog" role="dialog">
            <div className={LAYOUT_STYLES.closeRow}>
              <button aria-label="Close the task" className={`${LAYOUT_STYLES.close} ${STYLES.close}`} type="button" onClick={onClose}>
                Close
              </button>
            </div>
            <TaskDetailCard canWrite={canWrite} task={task} onEdit={() => setEditing(true)} />
          </section>
        </div>,
        document.body,
      )}
      {editing ? (
        <TaskEditDialog
          key={task.id}
          task={task}
          onClose={() => setEditing(false)}
          onSaved={(saved, done) => {
            setTask(saved)
            if (done) setEditing(false)
          }}
        />
      ) : null}
    </>
  )
}
