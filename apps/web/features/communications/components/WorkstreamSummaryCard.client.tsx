'use client'
// file: apps/web/features/communications/components/WorkstreamSummaryCard.client.tsx
/**
 * The detail card beside the client WorkStream ledger (plan 10, stage 4), and its full view: the selected entry's
 * title, context, note, next steps and document link, with Open full view and Edit note; the full view (dark
 * Communication Colors) adds Reassign and, for a super admin, Delete entry. Ported from the default export of the old
 * `hb-components/KR-WorkStream/WorkstreamSummaryCard.client.tsx`.
 *
 * Unchanged: the card follows the ledger's selection; Escape or a press on the backdrop closes the full view; Edit
 * note opens the full view in edit mode with the type buttons; Delete asks first in `U6ConfirmationDialog`.
 *
 * Changes:
 *  - "Move client" is now Reassign (`WorkstreamReassignDialog`, decision D16): a client and one of its matters,
 *    `.0` first. The old move took a client only and dropped the matter.
 *  - The History section and its Add comment are not ported: comments were kept in the screen only and lost on
 *    reload (`workstream_activity_comment` has no route; reference section 3.2).
 *  - "Copy note link" copied an address no screen opened (`?activity=`); the card copies the WSID instead.
 *  - The status pill showed a fixed "Open"; it now shows the matter (`306.1 · Estate plan`).
 *  - The "updated" line says who recorded the entry and when, and when it last changed.
 *  - Saves go through the parent (`onUpdate`, `onDelete`), which calls the API and replaces the row.
 *  - Density Contract: 8px card padding, 12px note text, 24px buttons, 4px corners; the full view is drawn into
 *    `document.body` with `data-kr-theme-scope` (AGENTS: portals).
 */

import type { WorkstreamActivity, WorkstreamSubgroup } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { communicationDateLabel, sanitizeWorkstreamNoteHtml } from '../communicationTypes'
import { LEDGER_ACTIVITY_LABELS, ledgerContextLine, type LedgerActivityRow } from '../workstreamLedgerRows'
import WorkstreamEditor, { type WorkstreamEditorAssigneeOption } from './WorkstreamEditor.client'
import WorkstreamReassignDialog from './WorkstreamReassignDialog.client'

/** The fields the full-view edit saves. */
export interface WorkstreamSummaryUpdate {
  subgroup: WorkstreamSubgroup
  title: string
  note: string
  /** HTML from the editor; null turns the note back to plain text. */
  noteHtml: string | null
  nextSteps: string[]
  assigneeUserId: string | null
}

export interface WorkstreamSummaryCardProps {
  row: LedgerActivityRow
  assigneeOptions: readonly WorkstreamEditorAssigneeOption[]
  /** Shows Delete entry (super admin). */
  canDelete: boolean
  /** Contacts for the Reassign client search (the browser's data store). */
  contacts: readonly KRContactRecord[]
  /** Saves an edit; rejects with a plain sentence. */
  onUpdate: (wsid: string, update: WorkstreamSummaryUpdate) => Promise<void>
  /** Deletes the entry; rejects with a plain sentence. */
  onDelete: (wsid: string) => Promise<void>
  /** The entry after a reassign (it may now belong to another client). */
  onReassigned: (activity: WorkstreamActivity) => void
}

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  card: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  eyebrow: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-text-muted)',
  date: 'text-[10.5px] font-[700] text-(color:--kr-theme-text-muted)',
  title: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-brand-primary)',
  context: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  pill: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[10.5px] font-[800] text-(color:--kr-theme-brand-primary)',
  note: 'm-0 border-l-[3px] border-l-(--kr-theme-teal) text-[12px] leading-[1.35] whitespace-pre-line [overflow-wrap:anywhere] [&_a]:text-(color:--kr-theme-accent-dark) [&_a]:underline',
  label: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-text-muted)',
  list: 'text-[11.5px] leading-[1.3]',
  link: 'text-[11px] font-[700] text-(color:--kr-theme-accent-dark) underline-offset-2 hover:underline',
  updated: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  muted: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  action:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[800] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active)',
  primaryAction:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  // The full view: dark Communication Colors (old look).
  backdrop: 'bg-[rgba(15,30,48,0.48)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated) text-(color:--kr-theme-communication-text) shadow-[0_12px_36px_rgba(0,0,0,0.45)]',
  dialogRule: 'border-(--kr-theme-communication-line)',
  dialogEyebrow: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-communication-text-muted)',
  dialogTitle: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-communication-text)',
  dialogHelper: 'm-0 text-[11px] text-(color:--kr-theme-communication-text-muted)',
  dialogNote: 'm-0 border-l-[3px] border-l-(--kr-theme-teal) text-[12px] leading-[1.4] whitespace-pre-line [overflow-wrap:anywhere] [&_a]:text-(color:--kr-theme-communication-accent) [&_a]:underline',
  dialogLink: 'text-[11px] font-[700] text-(color:--kr-theme-communication-accent) underline-offset-2 hover:underline',
  dialogAction:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-line) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-text)',
  dialogPrimary:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-accent-strong) bg-(--kr-theme-communication-accent-strong) text-[11px] font-[800] text-(color:--kr-theme-communication-surface-elevated) hover:bg-(--kr-theme-communication-accent)',
  danger:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-danger) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-danger) hover:bg-(--kr-theme-danger) hover:text-(color:--kr-theme-text-inverse)',
} as const

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  card: 'p-[8px] gap-[4px] grid',
  header: 'gap-[6px] flex items-center justify-between',
  headerTools: 'gap-[6px] flex items-center',
  pill: 'px-[6px] py-[1px] inline-block justify-self-start',
  note: 'pl-[8px]',
  list: 'm-0 pl-[16px]',
  links: 'gap-x-[10px] gap-y-[4px] flex flex-wrap',
  actions: 'mt-[2px] gap-[6px] flex flex-wrap',
  backdrop: 'p-[10px] fixed inset-0 z-[1000] grid place-items-center overflow-auto',
  dialog: 'max-h-[min(760px,calc(100vh-32px))] w-[min(720px,100%)] overflow-y-auto p-[10px]',
  dialogHeader: 'pb-[6px] gap-[8px] flex items-start justify-between border-b',
  dialogBody: 'pt-[6px] gap-[5px] grid',
  dialogContextRow: 'gap-[8px] flex items-center justify-between',
  dialogActions: 'mt-[8px] pt-[6px] gap-[6px] flex flex-wrap justify-end border-t',
} as const

/** A saved HTML note is drawn as cleaned HTML; a plain note as text. */
function NoteBody({ activity, className }: { activity: WorkstreamActivity; className: string }) {
  const html = activity.noteHtml?.trim()
  if (html) return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeWorkstreamNoteHtml(html) }} />
  return <p className={className}>{activity.note.trim() || 'No note entered.'}</p>
}

/** "Recorded 11/13/2026 2:05 PM by Dan Krueger · changed ..." */
function updatedLine(activity: WorkstreamActivity): string {
  const recorded = `Recorded ${communicationDateLabel(activity.createdAt)}${activity.performedByLabel ? ` by ${activity.performedByLabel}` : ''}`
  return activity.updatedAt && activity.updatedAt !== activity.createdAt ? `${recorded} · changed ${communicationDateLabel(activity.updatedAt)}` : recorded
}

/** "306.1 · Estate plan", or the row's matter number alone. */
function matterLabel(row: LedgerActivityRow): string {
  return row.activity.matterTitle ? `${row.matterNumber} · ${row.activity.matterTitle}` : row.matterNumber
}

/** Renders the selected entry's card and its full view. */
export default function WorkstreamSummaryCard({ assigneeOptions, canDelete, contacts, onDelete, onReassigned, onUpdate, row }: WorkstreamSummaryCardProps) {
  const { activity } = row
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(activity.title)
  const [editType, setEditType] = useState<WorkstreamSubgroup>(activity.subgroup)
  const [editAssignee, setEditAssignee] = useState<string | null>(activity.assigneeUserId)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const titleId = `workstream-summary-${row.id}-title`

  // One card is reused as the selection changes: start each entry closed, with its own saved values.
  useEffect(() => {
    setDialogOpen(false)
    setEditing(false)
    setEditTitle(activity.title)
    setEditType(activity.subgroup)
    setEditAssignee(activity.assigneeUserId)
  }, [activity.assigneeUserId, activity.subgroup, activity.title, activity.updatedAt, row.id])

  useEffect(() => {
    if (!dialogOpen) return undefined
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !reassignOpen && !deleteOpen) {
        setDialogOpen(false)
        setEditing(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [deleteOpen, dialogOpen, reassignOpen])

  function openEditor(): void {
    setEditTitle(activity.title)
    setEditType(activity.subgroup)
    setEditAssignee(activity.assigneeUserId)
    setDialogOpen(true)
    setEditing(true)
  }

  async function saveEdit(note: string, nextSteps: string[], noteHtml?: string): Promise<void> {
    await onUpdate(row.id, { subgroup: editType, title: editTitle.trim() || activity.title, note, noteHtml: noteHtml ?? null, nextSteps, assigneeUserId: editAssignee })
    setEditing(false)
  }

  async function confirmDelete(): Promise<void> {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await onDelete(row.id)
      setDeleteOpen(false)
      setDialogOpen(false)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The WorkStream entry was not deleted.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const nextSteps = activity.nextSteps.length ? (
    <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
      {activity.nextSteps.map((step, index) => (
        <li key={`${index}-${step}`}>{step}</li>
      ))}
    </ul>
  ) : null

  const fullView =
    dialogOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
            data-kr-theme-scope="krhomebase"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !editing) setDialogOpen(false)
            }}
          >
            <section aria-labelledby={titleId} aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="workstream-summary-edit-dialog" role="dialog">
              <header className={`${LAYOUT_STYLES.dialogHeader} ${STYLES.dialogRule}`}>
                <div>
                  <p className={STYLES.dialogEyebrow}>{LEDGER_ACTIVITY_LABELS[editing ? editType : activity.subgroup]} · {editing ? 'edit' : 'full view'}</p>
                  <h2 className={STYLES.dialogTitle} id={titleId}>
                    {activity.title}
                  </h2>
                </div>
                <button
                  aria-label="Close full WorkStream view"
                  className={STYLES.dialogAction}
                  type="button"
                  onClick={() => {
                    setDialogOpen(false)
                    setEditing(false)
                  }}
                >
                  Close
                </button>
              </header>
              <div className={LAYOUT_STYLES.dialogBody}>
                {editing ? (
                  <WorkstreamEditor
                    key={`${row.id}-${activity.updatedAt ?? ''}`}
                    activityType={editType}
                    assigneeOptions={assigneeOptions}
                    assigneeUserId={editAssignee}
                    dataKrElement="workstream-edit-editor"
                    nextSteps={activity.nextSteps}
                    note={activity.note}
                    noteHtml={activity.noteHtml}
                    title={editTitle}
                    onActivityTypeChange={setEditType}
                    onAssigneeChange={setEditAssignee}
                    onCancel={() => setEditing(false)}
                    onSave={saveEdit}
                    onTitleChange={setEditTitle}
                  />
                ) : (
                  <>
                    <div className={LAYOUT_STYLES.dialogContextRow}>
                      <p className={STYLES.dialogHelper}>{ledgerContextLine(row)}</p>
                      <button className={STYLES.dialogAction} data-kr-element="workstream-reassign" type="button" onClick={() => setReassignOpen(true)}>
                        Reassign
                      </button>
                    </div>
                    <span className={`${LAYOUT_STYLES.pill} ${STYLES.pill}`}>{matterLabel(row)}</span>
                    <NoteBody activity={activity} className={`${LAYOUT_STYLES.note} ${STYLES.dialogNote}`} />
                    <p className={STYLES.dialogEyebrow}>Next things to do</p>
                    {nextSteps ?? <p className={STYLES.dialogHelper}>None recorded.</p>}
                    {activity.documentUrl ? (
                      <a className={STYLES.dialogLink} href={activity.documentUrl} rel="noopener noreferrer" target="_blank">
                        {activity.documentLabel || activity.documentUrl}
                      </a>
                    ) : null}
                    <p className={STYLES.dialogHelper}>{updatedLine(activity)}</p>
                  </>
                )}
              </div>
              {!editing ? (
                <div className={`${LAYOUT_STYLES.dialogActions} ${STYLES.dialogRule}`}>
                  {canDelete ? (
                    <button className={STYLES.danger} data-kr-element="workstream-delete" type="button" onClick={() => setDeleteOpen(true)}>
                      Delete entry
                    </button>
                  ) : null}
                  <button className={STYLES.dialogPrimary} data-kr-element="workstream-edit" type="button" onClick={openEditor}>
                    Edit note
                  </button>
                </div>
              ) : null}
            </section>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <article className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="workstream-summary-card" data-kr-id={`kr-workstream-summary-card-${row.id}`} data-kr-record-id={row.id}>
        {/* The entry's identity: its type, id and date. */}
        <div className={LAYOUT_STYLES.header}>
          <p className={STYLES.eyebrow}>WorkStream note</p>
          <div className={LAYOUT_STYLES.headerTools}>
            <KRCopyButton label={`Copy WSID ${row.id}`} title="Copy this entry's WSID" value={row.id} />
            <time className={STYLES.date} dateTime={activity.activityAt}>
              {row.occurredLabel}
            </time>
          </div>
        </div>
        <h2 className={STYLES.title}>{activity.title}</h2>
        <p className={STYLES.context}>{ledgerContextLine(row)}</p>
        <span className={`${LAYOUT_STYLES.pill} ${STYLES.pill}`}>{matterLabel(row)}</span>

        {/* The narrative and what comes next. */}
        <NoteBody activity={activity} className={`${LAYOUT_STYLES.note} ${STYLES.note}`} />
        <p className={STYLES.label}>Next things to do</p>
        {nextSteps ?? <p className={STYLES.muted}>None recorded.</p>}
        {activity.documentUrl ? (
          <div aria-label="WorkStream files and folders" className={LAYOUT_STYLES.links}>
            <a className={STYLES.link} href={activity.documentUrl} rel="noopener noreferrer" target="_blank">
              {activity.documentLabel || activity.documentUrl}
            </a>
          </div>
        ) : null}
        <span className={STYLES.updated}>{updatedLine(activity)}</span>
        <div className={LAYOUT_STYLES.actions}>
          <button className={STYLES.action} data-kr-element="workstream-open-full-view" type="button" onClick={() => setDialogOpen(true)}>
            Open full view
          </button>
          <button className={STYLES.primaryAction} data-kr-element="workstream-edit-note" type="button" onClick={openEditor}>
            Edit note
          </button>
        </div>
      </article>
      {fullView}
      {reassignOpen ? (
        <WorkstreamReassignDialog
          contacts={contacts}
          currentLabel={`${activity.title} · ${matterLabel(row)}`}
          wsid={row.id}
          onCancel={() => setReassignOpen(false)}
          onReassigned={(moved) => {
            setReassignOpen(false)
            setDialogOpen(false)
            onReassigned(moved)
          }}
        />
      ) : null}
      {/* The delete question is drawn into the body after the full view, so it sits above it. */}
      {deleteOpen && typeof document !== 'undefined'
        ? createPortal(
            <div data-kr-theme-scope="krhomebase">
              <U6ConfirmationDialog
                busy={deleteBusy}
                confirmLabel="Delete entry"
                description="This permanently deletes the selected WorkStream entry and removes it from the client history."
                error={deleteError}
                open
                title="Delete WorkStream entry?"
                onCancel={() => {
                  if (!deleteBusy) setDeleteOpen(false)
                }}
                onConfirm={() => void confirmDelete()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
