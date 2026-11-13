'use client'
// file: apps/web/features/matters/components/MatterEditCard.client.tsx
/**
 * The Add Matter / Edit Matter dialog. Ported from the old `hb-components/KR-EditMatter/MatterEditCard.tsx`: Matter
 * Title (locked on the `.0` Client General Matters, with a hint), Matter Description and Initial Notes; Save Matter is
 * enabled only when something changed; Delete Matter opens the guarded warning (`MatterDeletePrompt`).
 *
 * Changed from the old file:
 * - Status and Opened Date are on the dialog (the requester's decision 6 of Nov 13, 2026), side by side on one row;
 *   a new matter starts Open, opened today. The matter number is assigned by the API and never typed
 *   (`docs/help-docs/Client-and-Matter-Numbering.md`).
 * - Calls go through `api.client.ts` (`/api/v1/clients/{clientId}/matters`, `/api/v1/matters/{matterId}`); the
 *   saved matter comes back from the API (the old screen guessed `<client>.pending` for the number).
 * - The title row has its label beside the field; spacing, field heights and corners follow the Density Contract;
 *   saving shows `RainbowBusySpinner`; errors are plain sentences.
 * - Delete Matter shows only for a super admin (`canDelete` from the API).
 * - The dialog is rendered into `document.body` (as `ContactEditDialog` is) with `data-kr-theme-scope`, so the shell's
 *   top bar and left panel cannot cover its header; the old one sat under the top bar through a shell height variable.
 */

import type { Matter, MatterChoice } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { createMatter, MattersApiError, updateMatter } from '../api.client'
import MatterDeletePrompt from './MatterDeletePrompt.client'

const STYLES = {
  backdrop: 'bg-[rgba(15,23,42,0.42)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(27,35,48,0.28)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  footer: 'border-t border-(--kr-theme-line)',
  title: 'm-0 text-[14px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  subtitle: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  label: 'text-[12px] font-[700] text-(color:--kr-theme-text)',
  field:
    'min-h-[24px] px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent) disabled:cursor-not-allowed disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  textArea:
    'px-[6px] py-[3px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] leading-[1.3] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent)',
  hint: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  primaryButton:
    'min-h-[24px] px-[10px] py-[2px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  secondaryButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  deleteButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-danger) bg-transparent text-[11px] font-[700] text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  backdrop: 'p-[10px] pt-[8vh] fixed inset-0 z-[1000] grid items-start justify-center overflow-y-auto',
  dialog: 'relative w-[560px] max-w-[calc(100vw-20px)]',
  header: 'px-[10px] py-[6px] gap-[8px] flex items-start justify-between',
  form: 'p-[10px] gap-[6px] grid',
  // Rows in visual order: title, status and opened date, description, initial notes.
  titleRow: 'gap-x-[3px] gap-y-[2px] grid grid-cols-[96px_minmax(0,1fr)] items-center',
  titleHint: 'col-start-2',
  choiceRow: 'gap-x-[3px] gap-y-[4px] grid grid-cols-[96px_minmax(0,1fr)] items-center md:grid-cols-[96px_minmax(0,1fr)_72px_150px]',
  stackRow: 'gap-[2px] grid',
  footer: 'px-[10px] py-[6px] gap-[6px] flex items-center justify-end',
  leftActions: 'mr-auto',
} as const

/** Props for the Add/Edit/Delete matter dialog. The parent owns whether it is open and which matter it edits. */
export interface MatterEditCardProps {
  open: boolean
  /** The matter being edited; null adds a new one. */
  matter: Matter | null
  clientId: string
  clientNumber: string | null
  statuses: readonly MatterChoice[]
  /** The viewer may delete (super admin). */
  canDelete?: boolean
  onClose: () => void
  onSaved: (matter: Matter) => void
  onDeleted: (matterId: string) => void
  /** Draws the dialog in place instead of in `document.body` (the render tests, which have no document). */
  inline?: boolean
}

/** Today in Chicago as `YYYY-MM-DD` (the default Opened Date of a new matter). */
function chicagoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const OPEN_STATUS = 'lk_matter_status_open'

/** Persists one matter from a modal form; the API assigns the number and enforces every rule. */
export default function MatterEditCard({ canDelete = false, inline = false, clientId, clientNumber, matter, onClose, onDeleted, onSaved, open, statuses }: MatterEditCardProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusLookupId, setStatusLookupId] = useState(OPEN_STATUS)
  const [openedDate, setOpenedDate] = useState('')
  const [initialNotes, setInitialNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletePromptOpen, setDeletePromptOpen] = useState(false)

  const isGeneralMatter = Boolean(matter?.isGeneralMatter)
  const initialStatus = matter?.statusLookupId ?? OPEN_STATUS
  const initialOpenedDate = matter ? (matter.openedDate ?? '') : chicagoToday()
  const hasChanges =
    title !== (matter?.title ?? '') ||
    description !== (matter?.description ?? '') ||
    statusLookupId !== initialStatus ||
    openedDate !== initialOpenedDate ||
    initialNotes.trim().length > 0

  useEffect(() => {
    if (!open) return
    setTitle(matter?.title ?? '')
    setDescription(matter?.description ?? '')
    setStatusLookupId(matter?.statusLookupId ?? OPEN_STATUS)
    setOpenedDate(matter ? (matter.openedDate ?? '') : chicagoToday())
    setInitialNotes('')
    setError(null)
    setDeletePromptOpen(false)
  }, [matter, open])

  if (!open || (!inline && typeof document === 'undefined')) return null

  // A status no longer in the active list stays visible for the matter that has it.
  const statusChoices = statuses.some((choice) => choice.id === statusLookupId)
    ? statuses
    : [...statuses, { id: statusLookupId, label: matter?.statusLabel ?? statusLookupId }]

  async function saveMatter(): Promise<void> {
    if (!hasChanges || saving) return
    if (!title.trim()) {
      setError('Matter Title is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const common = {
        title: title.trim(),
        description: description.trim() || null,
        initialNotes: initialNotes.trim() || undefined,
        statusLookupId,
      }
      const saved = matter
        ? await updateMatter(matter.id, { ...common, openedDate: openedDate || null })
        : await createMatter(clientId, { ...common, openedDate: openedDate || undefined })
      onSaved(saved.matter)
    } catch (saveError) {
      setError(saveError instanceof MattersApiError ? saveError.message : 'The matter was not saved.')
    } finally {
      setSaving(false)
    }
  }

  const dialog = (
    <div aria-labelledby="matter-edit-dialog-title" aria-modal="true" className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-id="edit-matter-dialog" data-kr-theme-scope="krhomebase" role="dialog">
      <section className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`}>
        {/* Matter dialog header: identifies whether the user is adding or editing the selected matter. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <div>
            <h2 className={STYLES.title} id="matter-edit-dialog-title">{matter ? 'Edit Matter' : 'Add Matter'}</h2>
            <p className={STYLES.subtitle}>
              {matter ? `${matter.matterNumber} · ${matter.title}` : `Client ${clientNumber ?? 'selected client'} · the next matter number is assigned on save`}
            </p>
          </div>
          <button aria-label="Close matter dialog" className={STYLES.secondaryButton} type="button" onClick={onClose}>Close</button>
        </header>
        {/* Matter dialog form: the matter fields and the first activity note. */}
        <form className={LAYOUT_STYLES.form} onSubmit={(event) => { event.preventDefault(); void saveMatter() }}>
          {/* Title row: label beside the field; the .0 title is fixed. */}
          <div className={LAYOUT_STYLES.titleRow} data-kr-element="matter-edit-title-row">
            <label className={STYLES.label} htmlFor="matter-edit-title">Matter Title</label>
            <input className={STYLES.field} disabled={isGeneralMatter} id="matter-edit-title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
            {isGeneralMatter ? <p className={`${LAYOUT_STYLES.titleHint} ${STYLES.hint}`}>The .0 matter is always named Client General Matters.</p> : null}
          </div>
          {/* Status and opened date row: short fields side by side. */}
          <div className={LAYOUT_STYLES.choiceRow} data-kr-element="matter-edit-status-row">
            <label className={STYLES.label} htmlFor="matter-edit-status">Status</label>
            <select className={STYLES.field} id="matter-edit-status" value={statusLookupId} onChange={(event) => setStatusLookupId(event.target.value)}>
              {statusChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
            <label className={STYLES.label} htmlFor="matter-edit-opened">Opened</label>
            <input className={STYLES.field} id="matter-edit-opened" type="date" value={openedDate} onChange={(event) => setOpenedDate(event.target.value)} />
          </div>
          {/* Description row: a tall field, so its label sits above it. */}
          <div className={LAYOUT_STYLES.stackRow} data-kr-element="matter-edit-description-row">
            <label className={STYLES.label} htmlFor="matter-edit-description">Matter Description</label>
            <textarea className={STYLES.textArea} id="matter-edit-description" maxLength={4000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          {/* Initial notes row: saved as a matter activity note, not a matter column. */}
          <div className={LAYOUT_STYLES.stackRow} data-kr-element="matter-edit-notes-row">
            <label className={STYLES.label} htmlFor="matter-edit-initial-notes">Initial Notes</label>
            <textarea className={STYLES.textArea} id="matter-edit-initial-notes" maxLength={10000} rows={3} value={initialNotes} onChange={(event) => setInitialNotes(event.target.value)} />
          </div>
          {error ? <p className={STYLES.error} role="alert">{error}</p> : null}
          {saving ? <RainbowBusySpinner busy hideWhenIdle={false} label="Saving matter..." size={16} /> : null}
          {/* Dialog actions: delete on the left (super admin, existing matter), cancel and save on the right. */}
          <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
            {matter && canDelete ? (
              <div className={LAYOUT_STYLES.leftActions}>
                <button className={STYLES.deleteButton} data-kr-element="matter-edit-delete" disabled={saving} type="button" onClick={() => setDeletePromptOpen(true)}>Delete Matter</button>
              </div>
            ) : null}
            <button className={STYLES.secondaryButton} disabled={saving} type="button" onClick={onClose}>Cancel</button>
            <button className={STYLES.primaryButton} data-kr-element="matter-edit-save" disabled={saving || !hasChanges} type="submit">{saving ? 'Saving...' : 'Save Matter'}</button>
          </footer>
        </form>
        {deletePromptOpen && matter ? <MatterDeletePrompt matter={matter} onClose={() => setDeletePromptOpen(false)} onDeleted={onDeleted} /> : null}
      </section>
    </div>
  )
  return inline ? dialog : createPortal(dialog, document.body)
}
