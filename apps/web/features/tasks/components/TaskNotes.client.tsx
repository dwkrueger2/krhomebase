'use client'
// file: apps/web/features/tasks/components/TaskNotes.client.tsx
/**
 * A task's follow-up notes (the requester, Nov 18, 2026, web patch 571; table `task_note`, migration 003): a note box
 * with its save button, then every note, newest first, with who wrote it and when. Drawn on the task card
 * (`TaskDetailCard`) and in the task's Edit dialog (`TaskEditDialog`). Notes are added, never changed.
 *
 * Unsaved Changes Standard (root `AGENTS.md`): the box is dirty while it holds text; **Save Changes** keeps its place
 * (`invisible` until then) and shows in Signal Orange; the page-wide record knows (`useReportUnsavedChanges`), so
 * leaving asks "Leave without saving?". Calls: `fetchTaskNotes`, `addTaskNote` (`../api.client.ts`).
 */

import type { TaskNote } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useReportUnsavedChanges } from '@/components/ui/unsavedChanges.client'
import { L } from '@/lib/KRUtilities'
import { addTaskNote, fetchTaskNotes } from '../api.client'
import { formatShortDateTime } from '../taskRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  label: 'text-[10.5px] font-[700] uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted)',
  box: 'min-h-[44px] w-full resize-y rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) px-[6px] py-[3px] text-[12px] leading-[1.3] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent)',
  save: 'min-h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-orange) bg-(--kr-theme-orange) px-[8px] py-[2px] text-[11px] font-[800] text-(color:--kr-theme-text-inverse) disabled:cursor-wait disabled:opacity-70',
  note: 'border-t border-(--kr-theme-line)',
  noteMeta: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  noteText: 'text-[12px] leading-[1.3] whitespace-pre-wrap [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  muted: 'text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'text-[11px] font-[700] text-(color:--kr-theme-danger)',
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
  shell: 'gap-[4px] grid',
  text: 'm-0',
  actions: 'gap-[6px] flex items-center justify-end',
  saveHidden: 'invisible',
  list: 'm-0 p-0 gap-[0px] grid list-none',
  note: 'py-[3px] gap-[1px] grid',
} as const

export interface TaskNotesProps {
  taskId: string
  /** May add notes (staff roles); without it the notes are read only. */
  canWrite: boolean
  /** Draws its own "Follow-up notes" label (the Edit dialog's row has a label of its own). */
  showLabel?: boolean
}

/** Draws the note box and the task's notes. */
export default function TaskNotes({ canWrite, showLabel = true, taskId }: TaskNotesProps) {
  const [notes, setNotes] = useState<TaskNote[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const dirty = draft.trim() !== ''
  useReportUnsavedChanges(`task-notes-${taskId}`, dirty)

  // The task's notes, again for another task (a later reply wins).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setProblem('')
    setDraft('')
    fetchTaskNotes(taskId)
      .then((data) => {
        if (!cancelled) setNotes(data.notes)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        L(`[TASK_NOTES:72] notes failed taskId=${taskId}`)
        setNotes([])
        setProblem(error instanceof Error && error.message ? error.message : 'The notes could not be read.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  async function save(): Promise<void> {
    if (!dirty || saving) return
    setSaving(true)
    setProblem('')
    try {
      const data = await addTaskNote(taskId, draft.trim())
      setNotes(data.notes)
      setDraft('')
    } catch (error) {
      L(`[TASK_NOTES:93] note not saved taskId=${taskId}`)
      setProblem(error instanceof Error && error.message ? error.message : 'The note was not saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={LAYOUT_STYLES.shell} data-kr-element="task-notes">
      {showLabel ? <span className={STYLES.label}>Follow-up notes</span> : null}
      {/* The note box: Save Changes shows (Signal Orange) only while it holds text. */}
      {canWrite ? (
        <>
          <textarea aria-label="Follow-up note" className={STYLES.box} data-kr-element="task-note-box" disabled={saving} placeholder="Type a follow-up note" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className={LAYOUT_STYLES.actions}>
            {saving ? <RainbowBusySpinner ariaLabel="Saving the note" busy size={12} /> : null}
            <button className={`${STYLES.save} ${dirty ? '' : LAYOUT_STYLES.saveHidden}`} data-kr-element="task-note-save" disabled={saving} type="button" onClick={() => void save()}>
              Save Changes
            </button>
          </div>
        </>
      ) : null}
      {problem ? (
        <p className={`${LAYOUT_STYLES.text} ${STYLES.error}`} role="alert">
          {problem}
        </p>
      ) : null}
      {/* The notes, newest first. */}
      {loading ? (
        <RainbowBusySpinner ariaLabel="Loading the notes" busy size={12} />
      ) : notes.length ? (
        <ul className={LAYOUT_STYLES.list} data-kr-element="task-note-list">
          {notes.map((note) => (
            <li className={`${LAYOUT_STYLES.note} ${STYLES.note}`} key={note.id}>
              <span className={STYLES.noteMeta}>
                {note.authorLabel} · {formatShortDateTime(note.createdAt)}
              </span>
              <span className={STYLES.noteText}>{note.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${LAYOUT_STYLES.text} ${STYLES.muted}`}>No notes yet.</p>
      )}
    </div>
  )
}
