'use client'
// file: apps/web/features/communications/components/WorkstreamEditor.client.tsx
/**
 * The note editor of the client WorkStream ledger (plan 10, stage 4): the title, the shared rich-text editor
 * (`WorkStreamRTE`), the next steps, and Cancel / Save. The add dialog and the full-view edit use it. Ported from
 * `WorkstreamEditor` in the old `hb-components/KR-WorkStream/WorkstreamSummaryCard.client.tsx`.
 *
 * Unchanged: the shared editor is the only note surface (the old legacy toolbar stayed commented out and is not
 * ported); a natural-language cue in the note picks the activity type unless the person chose one; the next steps are
 * typed one per line; Save hands the plain text, the steps and the HTML to the parent, and a failed save keeps the
 * draft and shows the reason.
 *
 * Changes:
 *  - It is always drawn in the dark Communication Colors (the old light variant only wrapped the same dark editor).
 *  - The assignee is a plain choice of staff users (`assigneeOptions`), shown when the parent passes `onAssigneeChange`;
 *    the old editor's task multi-assignee menu was never saved by the API.
 *  - The old line "Rich text and links are saved ... after server-side sanitization" is dropped (save is the proof).
 *  - Density Contract: labels beside their fields, 24px controls, 3px gaps; Save shows `RainbowBusySpinner`.
 */

import { useState } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { detectCommunicationActivityTypeTrigger } from '../communicationActivityTypeTriggers'
import type { WorkstreamCommunicationActivityType } from '../communicationTypes'
import { nextStepsFromText } from '../workstreamLedgerRows'
import WorkStreamRTE, { type WorkStreamRTEDraftState } from './WorkStreamRTE.client'

export interface WorkstreamEditorAssigneeOption {
  id: string
  label: string
}

export interface WorkstreamEditorProps {
  /** The saved note as plain text, and as HTML when it was written in the editor. */
  note: string
  noteHtml?: string | null
  nextSteps: readonly string[]
  /** Title field; left out, no title field is drawn. */
  title?: string
  onTitleChange?: (title: string) => void
  /** The entry's type; with `onActivityTypeChange` the type buttons are shown. */
  activityType?: WorkstreamCommunicationActivityType
  onActivityTypeChange?: (activityType: WorkstreamCommunicationActivityType) => void
  /** Called when the note's words imply a type (the add dialog follows it until the person picks one). */
  onActivityTypeDetected?: (activityType: WorkstreamCommunicationActivityType) => void
  /** Staff users; shown as the Assignee choice when `onAssigneeChange` is given. */
  assigneeOptions?: readonly WorkstreamEditorAssigneeOption[]
  assigneeUserId?: string | null
  onAssigneeChange?: (userId: string | null) => void
  onCancel: () => void
  /** Saves; a rejection keeps the draft and shows its message. */
  onSave: (note: string, nextSteps: string[], noteHtml?: string) => void | Promise<void>
  saveLabel?: string
  /** The editor's `data-kr-element`, so the add and edit editors can be told apart. */
  dataKrElement?: string
}

/** Color, type, border, and general-esthetic utilities (Communication Colors). */
const STYLES = {
  shell: 'text-(color:--kr-theme-communication-text)',
  label: 'text-[11px] font-[700] text-(color:--kr-theme-communication-text-muted)',
  input:
    'min-h-[24px] px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised) text-[12px] text-(color:--kr-theme-communication-text) outline-none focus:border-(--kr-theme-communication-accent-strong)',
  steps:
    'px-[6px] py-[4px] rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised) text-[12px] leading-[1.3] text-(color:--kr-theme-communication-text) outline-none focus:border-(--kr-theme-communication-accent-strong)',
  error: 'm-0 text-[11px] font-[700] text-(color:--kr-theme-danger)',
  action:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-line) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-text) disabled:cursor-not-allowed disabled:opacity-50',
  primaryAction:
    'min-h-[24px] px-[10px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-accent-strong) bg-(--kr-theme-communication-accent-strong) text-[11px] font-[800] text-(color:--kr-theme-communication-surface-elevated) hover:bg-(--kr-theme-communication-accent) disabled:cursor-not-allowed disabled:opacity-50',
} as const

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  shell: 'gap-[4px] grid',
  // A label beside its field (Density Contract: save height before width).
  fieldRow: 'gap-x-[3px] grid grid-cols-[84px_minmax(0,1fr)] items-center max-[767px]:grid-cols-1',
  stepsRow: 'gap-x-[3px] grid grid-cols-[84px_minmax(0,1fr)] items-start max-[767px]:grid-cols-1',
  steps: 'min-h-[52px] w-full resize-y',
  actions: 'mt-[2px] gap-[6px] flex flex-wrap items-center justify-end',
  action: 'gap-[4px] inline-flex items-center',
} as const

/** Edits one WorkStream note: title, rich text, next steps, and (when asked) the assignee. */
export default function WorkstreamEditor({
  activityType,
  assigneeOptions = [],
  assigneeUserId = null,
  dataKrElement = 'workstream-rich-text-editor',
  nextSteps,
  note,
  noteHtml,
  onActivityTypeChange,
  onActivityTypeDetected,
  onAssigneeChange,
  onCancel,
  onSave,
  onTitleChange,
  saveLabel = 'Save note',
  title,
}: WorkstreamEditorProps) {
  const [draftNote, setDraftNote] = useState(note)
  const [draftHtml, setDraftHtml] = useState(noteHtml ?? '')
  const [draftSteps, setDraftSteps] = useState(nextSteps.join('\n'))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function save(): Promise<void> {
    setSaving(true)
    setSaveError('')
    try {
      await onSave(draftNote.trim(), nextStepsFromText(draftSteps), draftHtml.trim() || undefined)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The WorkStream entry was not saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`} data-kr-element={dataKrElement}>
      {title !== undefined ? (
        <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-editor-title-row">
          <span className={STYLES.label}>Title</span>
          <input aria-label="WorkStream activity title" className={STYLES.input} disabled={saving} placeholder="Short activity title (the note's first line when left empty)" value={title} onChange={(event) => onTitleChange?.(event.target.value)} />
        </label>
      ) : null}
      {onAssigneeChange ? (
        <label className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-editor-assignee-row">
          <span className={STYLES.label}>Assignee</span>
          <select aria-label="WorkStream activity assignee" className={STYLES.input} disabled={saving} value={assigneeUserId ?? ''} onChange={(event) => onAssigneeChange(event.target.value || null)}>
            <option value="">Not assigned</option>
            {assigneeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {/* The shared WorkStream editor: the same surface as the Workstream composer. */}
      <WorkStreamRTE
        activityTypes={activityType ? [activityType] : ['Notes']}
        clientState="Client"
        disabled={saving}
        editorAriaLabel="WorkStream rich text note"
        editorDataKrElement="communications-composer-input-workstream-editor"
        initialBody={note}
        initialHtml={noteHtml ?? undefined}
        onActivityTypesChange={(types) => onActivityTypeChange?.(types.at(-1) ?? activityType ?? 'Notes')}
        onClientStateChange={() => undefined}
        onDraftChange={(draft: WorkStreamRTEDraftState) => {
          setDraftNote(draft.body)
          setDraftHtml(draft.html)
          const trigger = detectCommunicationActivityTypeTrigger(draft.body)
          if (trigger) onActivityTypeDetected?.(trigger.activityType)
        }}
        showActivityTypes={Boolean(activityType && onActivityTypeChange)}
        showAssigneeMenu={false}
        showContextControls={false}
        showMatterMenu={false}
        showSendButton={false}
      />
      <label className={LAYOUT_STYLES.stepsRow} data-kr-element="workstream-editor-next-steps-row">
        <span className={STYLES.label}>Next things to do</span>
        <textarea aria-label="WorkStream next things to do" className={`${LAYOUT_STYLES.steps} ${STYLES.steps}`} disabled={saving} placeholder="One per line" value={draftSteps} onChange={(event) => setDraftSteps(event.target.value)} />
      </label>
      {saveError ? (
        <p className={STYLES.error} role="alert">
          {saveError}
        </p>
      ) : null}
      <div className={LAYOUT_STYLES.actions}>
        <button className={STYLES.action} disabled={saving} type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className={`${LAYOUT_STYLES.action} ${STYLES.primaryAction}`} data-kr-element="workstream-editor-save" disabled={saving} type="button" onClick={() => void save()}>
          {saving ? <RainbowBusySpinner ariaLabel="Saving the WorkStream entry" busy size={12} /> : null}
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  )
}
