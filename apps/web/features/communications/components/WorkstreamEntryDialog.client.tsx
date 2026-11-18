'use client'
// file: apps/web/features/communications/components/WorkstreamEntryDialog.client.tsx
/**
 * One WorkStream entry's dialog (`data-kr-id="workstream-summary-edit-dialog"`): its full view, its edit, and, since web
 * patch 571, adding a new entry. Split out of `WorkstreamSummaryCard.client.tsx` (the requester, Nov 18, 2026), so the
 * client tab's + AddActivity, a row's double-click, the card's buttons and a followed WSID (`KRCodeLink`, through
 * `WorkstreamEntryLoader`) all open the same dialog. It replaces the separate Add activity dialog.
 *
 * Kept from the card's full view: dark Communication Colors, drawn into `document.body` with `data-kr-theme-scope`;
 * Escape or a press on the backdrop (not while editing) closes; Reassign (`WorkstreamReassignDialog`, D16); Delete
 * entry for a super admin, asked first in `U6ConfirmationDialog`; Edit note with the composer's type buttons and, while
 * Task is chosen, its Assignees menu.
 *
 * Changed in web patch 571:
 *  - The top line that named the types and the mode ("Note · Task · full view") is gone; the line under the title
 *    keeps the types, as colored chips, and its "Client 090" follows the code (closes the dialog, opens the client).
 *  - Adding: the client comes from the screen (the tab's client), the matter is chosen here (the client's .0 first),
 *    and the editor shows the composer's prompt. It starts as a Note; the first type picked (a button, or one the
 *    note's words imply) replaces it, and later picks add types. Slash commands (`/pc`, `/t`, `/sub:`) add a type and
 *    set the title as they did. The old Add dialog's Assignee list is
 *    not kept: the API assigns the person saving, and a Task takes its people from the Assignees menu.
 *  - The dialog carries `panelColors` (`Communications.module.css`), so the type buttons and chips have their colors.
 */

import type { Matter, WorkstreamActivity, WorkstreamSubgroup } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { communicationDateLabel, parseWorkstreamSlashCommands, sanitizeWorkstreamNoteHtml } from '../communicationTypes'
import { activityTypesOf, ledgerRowFromActivity, titleFromNote } from '../workstreamLedgerRows'
// Read, not only imported: a CSS module imported for its side effect is left out of the production build (web patch 554).
import communicationColors from './Communications.module.css'
import WorkstreamContextLine from './WorkstreamContextLine.client'
import WorkstreamEditor, { type WorkstreamEditorAssigneeOption } from './WorkstreamEditor.client'
import WorkstreamReassignDialog from './WorkstreamReassignDialog.client'

/** The composer's prompt, shown while the note is empty. */
export const WORKSTREAM_NOTE_PROMPT = 'Type the note; /pc, /email, /n, /t, /sub: and Client: work here...'

/** The fields an edit saves. */
export interface WorkstreamSummaryUpdate {
  /** Every type chosen, the main one first (FB-0016). */
  subgroups: WorkstreamSubgroup[]
  title: string
  note: string
  /** HTML from the editor; null turns the note back to plain text. */
  noteHtml: string | null
  nextSteps: string[]
  /** The task's people, sent only while Task is one of the types (FB-0017). */
  assigneeUserIds?: string[]
}

/** What adding saves (the client is the parent's). */
export interface WorkstreamEntryCreateInput {
  subgroups: WorkstreamSubgroup[]
  title: string
  note: string
  noteHtml?: string
  nextSteps: string[]
  /** One of the client's matters; null for the client's .0 (the API's choice, D12). */
  matterId: string | null
  /** The task's people, only while Task is chosen. */
  assigneeUserIds?: string[]
}

export interface WorkstreamEntryDialogProps {
  /** The entry; null to add one. */
  activity: WorkstreamActivity | null
  /** The client's number, for an older entry without a matter. */
  clientNumber?: string | null
  /** Opens in Edit (the card's Edit note). Adding always edits. */
  startEditing?: boolean
  assigneeOptions: readonly WorkstreamEditorAssigneeOption[]
  /** Shows Delete entry (super admin). */
  canDelete: boolean
  /** Contacts for the Reassign client search. */
  contacts: readonly KRContactRecord[]
  /** Adding: the client's matters, `.0` first, and the one chosen at first. */
  matters?: readonly Matter[]
  defaultMatterId?: string | null
  onClose: () => void
  /** Saves an edit; rejects with a plain sentence (the editor shows it). */
  onUpdate?: (wsid: string, update: WorkstreamSummaryUpdate) => Promise<void>
  /** Saves a new entry; rejects with a plain sentence. */
  onCreate?: (input: WorkstreamEntryCreateInput) => Promise<void>
  /** Deletes the entry; rejects with a plain sentence. */
  onDelete?: (wsid: string) => Promise<void>
  /** The entry after a reassign (it may now belong to another client). */
  onReassigned?: (activity: WorkstreamActivity) => void
}

/** Color, type, border, and general-esthetic utilities (Communication Colors). */
const STYLES = {
  backdrop: 'bg-[rgba(15,30,48,0.48)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated) text-(color:--kr-theme-communication-text) shadow-[0_12px_36px_rgba(0,0,0,0.45)]',
  rule: 'border-(--kr-theme-communication-line)',
  eyebrow: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-communication-text-muted)',
  title: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-communication-text)',
  helper: 'm-0 text-[11px] text-(color:--kr-theme-communication-text-muted)',
  pill: 'rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised) text-[10.5px] font-[800] text-(color:--kr-theme-communication-text)',
  note: 'm-0 border-l-[3px] border-l-(--kr-theme-teal) text-[12px] leading-[1.4] whitespace-pre-line [overflow-wrap:anywhere] [&_a]:text-(color:--kr-theme-communication-accent) [&_a]:underline',
  list: 'text-[11.5px] leading-[1.3]',
  link: 'text-[11px] font-[700] text-(color:--kr-theme-communication-accent) underline-offset-2 hover:underline',
  label: 'text-[11px] font-[700] text-(color:--kr-theme-communication-text-muted)',
  input:
    'min-h-[24px] min-w-0 px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised) text-[12px] text-(color:--kr-theme-communication-text) outline-none focus:border-(--kr-theme-communication-accent-strong)',
  error: 'm-0 text-[11px] font-[700] text-(color:--kr-theme-danger)',
  action:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-line) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-text)',
  primary:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-accent-strong) bg-(--kr-theme-communication-accent-strong) text-[11px] font-[800] text-(color:--kr-theme-communication-surface-elevated) hover:bg-(--kr-theme-communication-accent)',
  danger:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-danger) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-danger) hover:bg-(--kr-theme-danger) hover:text-(color:--kr-theme-text-inverse)',
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
  dialog: 'max-h-[min(820px,calc(100vh-32px))] w-[min(720px,100%)] overflow-y-auto p-[10px]',
  header: 'pb-[6px] gap-[8px] flex items-start justify-between border-b',
  body: 'pt-[6px] gap-[5px] grid',
  contextRow: 'gap-[8px] flex items-center justify-between',
  pill: 'px-[6px] py-[1px] inline-block justify-self-start',
  note: 'pl-[8px]',
  list: 'm-0 pl-[16px]',
  // Adding: the matter beside its label, as the editor's rows are.
  matterRow: 'gap-x-[3px] grid grid-cols-[84px_minmax(0,1fr)] items-center max-[767px]:grid-cols-1',
  actions: 'mt-[8px] pt-[6px] gap-[6px] flex flex-wrap justify-end border-t',
} as const

/** A saved HTML note is drawn as cleaned HTML; a plain note as text. */
export function NoteBody({ activity, className }: { activity: WorkstreamActivity; className: string }) {
  const html = activity.noteHtml?.trim()
  if (html) return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeWorkstreamNoteHtml(html) }} />
  return <p className={className}>{activity.note.trim() || 'No note entered.'}</p>
}

/** "Recorded 11/13/2026 2:05 PM by Dan Krueger · changed ..." */
export function updatedLine(activity: WorkstreamActivity): string {
  const recorded = `Recorded ${communicationDateLabel(activity.createdAt)}${activity.performedByLabel ? ` by ${activity.performedByLabel}` : ''}`
  return activity.updatedAt && activity.updatedAt !== activity.createdAt ? `${recorded} · changed ${communicationDateLabel(activity.updatedAt)}` : recorded
}

/** "306.1 · Estate plan", or the matter number alone. */
export function matterLabel(activity: WorkstreamActivity, matterNumber: string): string {
  return activity.matterTitle ? `${matterNumber} · ${activity.matterTitle}` : matterNumber
}

/** Draws the dialog for one entry, or for a new one. */
export default function WorkstreamEntryDialog(props: WorkstreamEntryDialogProps) {
  const { activity, assigneeOptions, canDelete, clientNumber = null, contacts, defaultMatterId = null, matters = [], onClose, onCreate, onDelete, onReassigned, onUpdate, startEditing = false } = props
  const adding = !activity
  const [editing, setEditing] = useState(adding || startEditing)
  const [title, setTitle] = useState(activity?.title ?? '')
  const [types, setTypes] = useState<WorkstreamSubgroup[]>(activity ? activityTypesOf(activity) : ['Notes'])
  const [typesChosen, setTypesChosen] = useState(!adding)
  const [matterId, setMatterId] = useState<string>(defaultMatterId ?? matters[0]?.id ?? '')
  const [problem, setProblem] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const row = activity ? ledgerRowFromActivity(activity, clientNumber) : null
  const titleId = `workstream-entry-${activity?.wsid ?? 'new'}-title`

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !reassignOpen && !deleteOpen) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [deleteOpen, onClose, reassignOpen])

  /** Saves the edit, or the new entry. The editor shows a rejection and keeps the draft. */
  async function save(note: string, nextSteps: string[], noteHtml?: string, assigneeUserIds?: string[]): Promise<void> {
    const withTask = (list: WorkstreamSubgroup[]) => (list.includes('Tasks') ? { assigneeUserIds: assigneeUserIds ?? activity?.assigneeUserIds ?? [] } : {})
    if (activity) {
      await onUpdate?.(activity.wsid, { subgroups: types, title: title.trim() || activity.title, note, noteHtml: noteHtml ?? null, nextSteps, ...withTask(types) })
      setEditing(false)
      return
    }
    // Adding: slash commands set a type and the title as before; the title falls back to the note's first line.
    const parsed = parseWorkstreamSlashCommands(note, types[0] ?? 'Notes')
    const chosen = parsed.activityCommand ? Array.from(new Set([...types, parsed.activityType])) : types
    const finalTitle = title.trim() || parsed.subject || titleFromNote(parsed.body)
    if (!finalTitle) {
      setProblem('Give the activity a title, or type a note.')
      return
    }
    setProblem('')
    await onCreate?.({ subgroups: chosen, title: finalTitle, note: parsed.body, noteHtml: parsed.body === note.trim() ? noteHtml : undefined, nextSteps, matterId: matterId || null, ...withTask(chosen) })
  }

  async function confirmDelete(): Promise<void> {
    if (!activity) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await onDelete?.(activity.wsid)
      setDeleteOpen(false)
      onClose()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The WorkStream entry was not deleted.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const nextSteps = activity?.nextSteps.length ? (
    <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
      {activity.nextSteps.map((step, index) => (
        <li key={`${index}-${step}`}>{step}</li>
      ))}
    </ul>
  ) : null

  if (typeof document === 'undefined') return null
  return (
    <>
      {createPortal(
        <div
          className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
          data-kr-theme-scope="krhomebase"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editing) onClose()
          }}
        >
          <section aria-labelledby={titleId} aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog} ${communicationColors.panelColors}`} data-kr-id="workstream-summary-edit-dialog" role="dialog">
            {/* Header: the entry's title (or Add activity) and Close. */}
            <header className={`${LAYOUT_STYLES.header} ${STYLES.rule}`}>
              <div>
                {adding ? <p className={STYLES.eyebrow}>WorkStream activity</p> : null}
                <h2 className={STYLES.title} id={titleId}>
                  {activity ? activity.title : 'Add activity'}
                </h2>
              </div>
              <button aria-label="Close the WorkStream entry" className={STYLES.action} type="button" onClick={onClose}>
                Close
              </button>
            </header>
            <div className={LAYOUT_STYLES.body}>
              {/* The owner, matter, types, WSID and task, with the owner and task as links. */}
              {row ? (
                <div className={LAYOUT_STYLES.contextRow}>
                  <WorkstreamContextLine className={STYLES.helper} row={row} tone="dark" onBeforeOpen={onClose} />
                  {!editing && onReassigned ? (
                    <button className={STYLES.action} data-kr-element="workstream-reassign" type="button" onClick={() => setReassignOpen(true)}>
                      Reassign
                    </button>
                  ) : null}
                </div>
              ) : null}
              {/* Adding: the matter (the client's .0 first). */}
              {adding ? (
                <label className={LAYOUT_STYLES.matterRow} data-kr-element="workstream-add-matter-row">
                  <span className={STYLES.label}>Matter</span>
                  <select className={STYLES.input} value={matterId} onChange={(event) => setMatterId(event.target.value)}>
                    {matters.length ? null : <option value="">The client&apos;s .0 (General)</option>}
                    {matters.map((matter) => (
                      <option key={matter.id} value={matter.id}>
                        {matter.matterNumber} · {matter.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {editing ? (
                <WorkstreamEditor
                  key={`${activity?.wsid ?? 'new'}-${activity?.updatedAt ?? ''}`}
                  activityTypes={types}
                  assigneeOptions={assigneeOptions}
                  assigneeUserIds={activity?.assigneeUserIds ?? []}
                  dataKrElement={adding ? 'workstream-add-editor' : 'workstream-edit-editor'}
                  nextSteps={activity?.nextSteps ?? []}
                  note={activity?.note ?? ''}
                  noteHtml={activity?.noteHtml}
                  placeholder={WORKSTREAM_NOTE_PROMPT}
                  saveLabel={adding ? 'Save activity' : 'Save note'}
                  title={title}
                  onActivityTypesChange={(next) => {
                    // While adding, the first type picked (a button, or the note's words) replaces the starting Note.
                    const added = next.filter((type) => !types.includes(type))
                    setTypes(adding && !typesChosen && added.length ? added : next)
                    setTypesChosen(true)
                  }}
                  onCancel={() => (adding ? onClose() : setEditing(false))}
                  onSave={save}
                  onTitleChange={setTitle}
                />
              ) : activity && row ? (
                <>
                  <span className={`${LAYOUT_STYLES.pill} ${STYLES.pill}`}>{matterLabel(activity, row.matterNumber)}</span>
                  <NoteBody activity={activity} className={`${LAYOUT_STYLES.note} ${STYLES.note}`} />
                  <p className={STYLES.eyebrow}>Next things to do</p>
                  {nextSteps ?? <p className={STYLES.helper}>None recorded.</p>}
                  {activity.documentUrl ? (
                    <a className={STYLES.link} href={activity.documentUrl} rel="noopener noreferrer" target="_blank">
                      {activity.documentLabel || activity.documentUrl}
                    </a>
                  ) : null}
                  <p className={STYLES.helper}>{updatedLine(activity)}</p>
                </>
              ) : null}
              {problem ? (
                <p className={STYLES.error} role="alert">
                  {problem}
                </p>
              ) : null}
            </div>
            {!editing && activity ? (
              <div className={`${LAYOUT_STYLES.actions} ${STYLES.rule}`}>
                {canDelete && onDelete ? (
                  <button className={STYLES.danger} data-kr-element="workstream-delete" type="button" onClick={() => setDeleteOpen(true)}>
                    Delete entry
                  </button>
                ) : null}
                {onUpdate ? (
                  <button className={STYLES.primary} data-kr-element="workstream-edit" type="button" onClick={() => setEditing(true)}>
                    Edit note
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>,
        document.body,
      )}
      {reassignOpen && activity ? (
        <WorkstreamReassignDialog
          contacts={contacts}
          currentLabel={`${activity.title} · ${row ? matterLabel(activity, row.matterNumber) : ''}`}
          wsid={activity.wsid}
          onCancel={() => setReassignOpen(false)}
          onReassigned={(moved) => {
            setReassignOpen(false)
            onReassigned?.(moved)
            onClose()
          }}
        />
      ) : null}
      {/* The delete question is drawn into the body after the dialog, so it sits above it. */}
      {deleteOpen
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
