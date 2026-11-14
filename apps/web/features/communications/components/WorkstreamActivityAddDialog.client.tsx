'use client'
// file: apps/web/features/communications/components/WorkstreamActivityAddDialog.client.tsx
/**
 * Add activity, the client WorkStream ledger's create dialog (plan 10, stage 4). Ported from
 * `WorkstreamActivityAddDialog` in the old `hb-components/KR-WorkStream/WorkstreamActivityLedger.client.tsx`.
 *
 * Unchanged: Activity type (Work in progress first, the old default), Matter, Title, Assignee (the person recording it
 * by default, a staff user, or Other with a typed name), the note editor and next steps. Slash commands in the note
 * (`/pc`, `/note`, `/sub:`) set the type and subject; a natural-language cue sets the type until the person picks one;
 * an empty title takes the note's first line (160 characters).
 *
 * Changes:
 *  - Matter is a choice of this client's matters (`.0` first) instead of a typed number, and is sent as `matterId`
 *    (D12: the API uses the `.0` when none is chosen).
 *  - Contacts are not offered as assignees: the old list passed only the contact being viewed, and the API's
 *    contact assignee needs an individual id the ledger does not have. Other keeps a typed name.
 *  - Drawn in the dark Communication Colors with the shared editor (the old dialog was light around the dark editor),
 *    into `document.body` with `data-kr-theme-scope`; the parent owns open, busy and error.
 *  - Density Contract: labels beside fields, 24px controls, 10px padding.
 */

import type { Matter, WorkstreamSubgroup } from '@krhomebase/contracts'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { parseWorkstreamSlashCommands } from '../communicationTypes'
import { LEDGER_ADD_TYPE_OPTIONS, titleFromNote } from '../workstreamLedgerRows'
import WorkstreamEditor, { type WorkstreamEditorAssigneeOption } from './WorkstreamEditor.client'

/** What Add activity hands to the parent to save. */
export interface WorkstreamActivityCreateInput {
  subgroup: WorkstreamSubgroup
  title: string
  note: string
  noteHtml?: string
  nextSteps: string[]
  matterId: string | null
  assigneeUserId?: string
  assigneeLabel?: string
}

export interface WorkstreamActivityAddDialogProps {
  /** This client's matters, `.0` first. */
  matters: readonly Matter[]
  /** The matter chosen at first (the ledger's default; the `.0` when null). */
  defaultMatterId?: string | null
  assigneeOptions: readonly WorkstreamEditorAssigneeOption[]
  currentUserId: string | null
  currentUserLabel: string
  /** Saves; a rejection keeps the dialog open with its message. */
  onSave: (input: WorkstreamActivityCreateInput) => Promise<void>
  onCancel: () => void
  /** For server-render tests: draw in place instead of a portal. */
  inline?: boolean
}

const OTHER = '__other__'

/** Color, type, border, and general-esthetic utilities (Communication Colors). */
const STYLES = {
  backdrop: 'bg-[rgba(15,30,48,0.48)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated) text-(color:--kr-theme-communication-text) shadow-[0_12px_36px_rgba(0,0,0,0.45)]',
  rule: 'border-(--kr-theme-communication-line)',
  eyebrow: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-communication-text-muted)',
  title: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-communication-text)',
  label: 'text-[11px] font-[700] text-(color:--kr-theme-communication-text-muted)',
  input:
    'min-h-[24px] min-w-0 px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised) text-[12px] text-(color:--kr-theme-communication-text) outline-none focus:border-(--kr-theme-communication-accent-strong)',
  action:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-line) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-text)',
  error: 'm-0 text-[11px] font-[700] text-(color:--kr-theme-danger)',
} as const

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1000] grid place-items-center overflow-auto',
  dialog: 'max-h-[min(820px,calc(100vh-32px))] w-[min(720px,100%)] overflow-y-auto p-[10px]',
  header: 'pb-[6px] gap-[8px] flex items-start justify-between border-b',
  body: 'pt-[6px] gap-[4px] grid',
  // Type and matter side by side, each label beside its field.
  pairRow: 'gap-x-[10px] gap-y-[4px] grid grid-cols-2 max-[767px]:grid-cols-1',
  fieldRow: 'gap-x-[3px] grid grid-cols-[84px_minmax(0,1fr)] items-center max-[767px]:grid-cols-1',
} as const

/** The Add activity dialog. */
export default function WorkstreamActivityAddDialog({ assigneeOptions, currentUserId, currentUserLabel, defaultMatterId = null, inline = false, matters, onCancel, onSave }: WorkstreamActivityAddDialogProps) {
  const [subgroup, setSubgroup] = useState<WorkstreamSubgroup>('WIP')
  const [typeChosen, setTypeChosen] = useState(false)
  const [matterId, setMatterId] = useState<string>(defaultMatterId ?? matters[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [assigneeKey, setAssigneeKey] = useState<string>(currentUserId ?? '')
  const [otherName, setOtherName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function save(note: string, nextSteps: string[], noteHtml?: string): Promise<void> {
    const parsed = parseWorkstreamSlashCommands(note, subgroup)
    const finalTitle = title.trim() || parsed.subject || titleFromNote(parsed.body)
    if (!finalTitle) {
      setProblem('Give the activity a title, or type a note.')
      return
    }
    if (assigneeKey === OTHER && !otherName.trim()) {
      setProblem('Type the name for the Other assignee.')
      return
    }
    setProblem(null)
    const other = assigneeKey === OTHER
    await onSave({
      subgroup: parsed.activityType,
      title: finalTitle,
      note: parsed.body,
      noteHtml,
      nextSteps,
      matterId: matterId || null,
      assigneeUserId: !other && assigneeKey ? assigneeKey : undefined,
      assigneeLabel: other ? otherName.trim() : undefined,
    })
  }

  const dialog = (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase">
      <section aria-labelledby="workstream-add-activity-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-element="workstream-add-activity-dialog" role="dialog">
        <header className={`${LAYOUT_STYLES.header} ${STYLES.rule}`}>
          <div>
            <p className={STYLES.eyebrow}>WorkStream activity</p>
            <h2 className={STYLES.title} id="workstream-add-activity-title">
              Add activity
            </h2>
          </div>
          <button className={STYLES.action} type="button" onClick={onCancel}>
            Close
          </button>
        </header>
        <div className={LAYOUT_STYLES.body}>
          <div className={LAYOUT_STYLES.pairRow}>
            <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-add-type-row">
              <span className={STYLES.label}>Activity type</span>
              <select
                className={STYLES.input}
                value={subgroup}
                onChange={(event) => {
                  setTypeChosen(true)
                  setSubgroup(event.target.value as WorkstreamSubgroup)
                }}
              >
                {LEDGER_ADD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-add-matter-row">
              <span className={STYLES.label}>Matter</span>
              <select className={STYLES.input} value={matterId} onChange={(event) => setMatterId(event.target.value)}>
                {matters.length ? null : <option value="">The client's .0 (General)</option>}
                {matters.map((matter) => (
                  <option key={matter.id} value={matter.id}>
                    {matter.matterNumber} · {matter.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-add-title-row">
            <span className={STYLES.label}>Title</span>
            <input autoFocus className={STYLES.input} placeholder="Short activity title (the note's first line when left empty)" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-add-assignee-row">
            <span className={STYLES.label}>Assignee</span>
            <select className={STYLES.input} value={assigneeKey} onChange={(event) => setAssigneeKey(event.target.value)}>
              <option value={currentUserId ?? ''}>{currentUserLabel} (default)</option>
              {assigneeOptions
                .filter((option) => option.id !== currentUserId)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              <option value={OTHER}>Other</option>
            </select>
          </label>
          {assigneeKey === OTHER ? (
            <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-add-other-row">
              <span className={STYLES.label}>Other assignee</span>
              <input className={STYLES.input} placeholder="Name or role" value={otherName} onChange={(event) => setOtherName(event.target.value)} />
            </label>
          ) : null}
          <WorkstreamEditor
            dataKrElement="workstream-add-editor"
            nextSteps={[]}
            note=""
            saveLabel="Save activity"
            onActivityTypeDetected={(detected) => {
              if (!typeChosen) setSubgroup(detected)
            }}
            onCancel={onCancel}
            onSave={save}
          />
          {problem ? (
            <p className={STYLES.error} role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )

  if (inline || typeof document === 'undefined') return inline ? dialog : null
  return createPortal(dialog, document.body)
}
