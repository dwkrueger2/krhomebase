'use client'
// file: apps/web/components/themes/ThemeSelector.client.tsx
/**
 * The theme selector and command bar: the old theme editor's `ThemeSelector`
 * (`hb-components/modules/settings/theme-settings/ThemeSelector.client.tsx`), ported for the firm theme editor and for
 * the person's own theme under Preferences. It saves nothing itself: it reports what the person asked for, and the
 * parent screen does it.
 *
 * Kept from the old selector: the muted bar; THEME and its list on the left; the round wastebasket above the command
 * row on the right; Download Theme, Upload Theme (a hidden `.json`/`.jsonc` picker), Create New Theme and Save Theme;
 * the upload refused with a sentence when the file is not a theme; the status line under the bar.
 *
 * Changed from the old selector:
 * - The CSS module became `LAYOUT_STYLES` and `STYLES`, with `--kr-theme-*` tokens.
 * - The middle slot, which held "Apply Theme" (gone: each person chooses their theme under Preferences), holds the
 *   screen's own fields (`fields`), such as the firm default or the text size.
 * - Create New Theme and the wastebasket appear only when the screen passes `onCreate` and `onDelete`; `extraActions`
 *   adds buttons before Download Theme (for example Undo changes).
 * - The upload is read with `parseThemeFile` (the new versioned shape, or the old editor's file) and handed over as a
 *   draft; every value is checked there.
 *
 * @param props - The list, the chosen theme, the screen's fields and the command handlers.
 * @returns The selector (`data-kr-id="ThemeSelector"`).
 */

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { parseThemeFile, type ThemeDraft } from '@/components/themes/themeEditing'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'

const LAYOUT_STYLES = {
  root: 'px-[8px] py-[6px] gap-[3px] grid',
  // THEME, the screen's fields, the commands, wrapping to the width the bar has. The old fixed grid
  // (minmax(176px,256px) max-content 1fr) pushed the commands past the edge of a narrow workspace.
  grid: 'gap-x-[8px] gap-y-[4px] flex flex-wrap items-end',
  field: 'gap-[2px] grid min-w-[176px] w-[256px] max-w-full',
  fields: 'gap-x-[8px] gap-y-[3px] flex flex-1 flex-wrap items-center min-w-0',
  commands: 'ml-auto gap-[2px] grid min-w-0 justify-items-end',
  deleteSlot: 'min-h-[24px] min-w-[24px] flex items-center justify-end',
  actions: 'gap-[6px] flex flex-wrap items-center justify-end min-w-0',
} as const

const STYLES = {
  root: 'border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text) font-(family-name:--kr-theme-font-body)',
  label: 'text-[11px] font-extrabold tracking-[.04em] text-(color:--kr-theme-text-muted)',
  select:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  button:
    'inline-flex min-h-[28px] cursor-pointer items-center justify-center rounded-[2px] text-[12px] font-[850] leading-none [padding:var(--kr-theme-button-padding-regular)] disabled:cursor-not-allowed disabled:opacity-[.72]',
  ghostButton: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) hover:enabled:border-(--kr-theme-brand-primary)',
  secondaryButton: 'border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-(color:--kr-theme-text) hover:enabled:border-(--kr-theme-brand-primary)',
  primaryButton:
    'border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse) hover:enabled:bg-(--kr-theme-button-primary-hover-background) disabled:border-(--kr-theme-line) disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  deleteButton:
    'inline-flex size-[24px] flex-none cursor-pointer items-center justify-center rounded-full border border-(--kr-theme-danger) bg-(--kr-theme-card-surface) p-0 text-[13px] font-black leading-none text-(color:--kr-theme-danger) disabled:cursor-wait disabled:opacity-[.78]',
  // The wastebasket is KRHomebaseIcons.Trash (Nov 12, 2026); the old screen drew a 🗑 emoji.
  deleteIcon: 'size-[14px]',
  hidden: 'hidden',
  status: 'm-0 text-[12px] text-(color:--kr-theme-success)',
  note: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** What an upload gives the screen. */
export interface ThemeUpload {
  draft: ThemeDraft
  shape: 'current' | 'old'
  kept: number
}

export interface ThemeSelectorProps {
  /** The list under THEME. */
  options: ReadonlyArray<{ id: string; label: string }>
  selectedId: string
  onSelect: (id: string) => void
  /** The screen's own fields, in the middle slot. */
  fields?: ReactNode
  /** Buttons before Download Theme. */
  extraActions?: ReactNode
  onDownload: () => void
  onUpload: (upload: ThemeUpload) => void
  /** Shows Create New Theme. */
  onCreate?: () => void
  /** Shows the wastebasket; its tooltip and label name `deleteLabel`. */
  onDelete?: () => void
  deleteLabel?: string
  onSave: () => void
  canSave: boolean
  saving: boolean
  busy?: boolean
  /** A result line (success). */
  status?: string | null
  /** A muted note line. */
  note?: string | null
  /** An error line (it wins over the others). */
  error?: string | null
}

export default function ThemeSelector({ options, selectedId, onSelect, fields, extraActions, onDownload, onUpload, onCreate, onDelete, deleteLabel = 'Delete theme', onSave, canSave, saving, busy = false, status, note, error }: ThemeSelectorProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const working = saving || busy

  /** Reads a chosen `.json` or `.jsonc` file. */
  async function handleUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.jsonc?$/i.test(file.name)) {
      setUploadError('Upload must be a .json or .jsonc theme file.')
      return
    }
    const result = parseThemeFile(await file.text())
    if (!result.ok) {
      setUploadError(result.message)
      return
    }
    setUploadError(null)
    onUpload({ draft: result.draft, shape: result.shape, kept: result.kept })
  }

  const message = uploadError ?? error
  return (
    <section aria-label="KR Homebase theme selector" className={`${LAYOUT_STYLES.root} ${STYLES.root}`} data-kr-component="ThemeSelector" data-kr-element="theme-selector" data-kr-id="ThemeSelector">
      <div className={LAYOUT_STYLES.grid}>
        {/* THEME list */}
        <label className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>THEME</span>
          <select className={STYLES.select} disabled={working} onChange={(event) => onSelect(event.target.value)} value={selectedId}>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* The screen's own fields (the old Apply Theme slot) */}
        <div className={LAYOUT_STYLES.fields}>{fields}</div>

        {/* Commands: the wastebasket above the command row */}
        <div className={LAYOUT_STYLES.commands}>
          <div className={LAYOUT_STYLES.deleteSlot} data-kr-component="wastebasket-button">
            {onDelete ? (
              <button aria-label={deleteLabel} className={STYLES.deleteButton} disabled={working} onClick={onDelete} title={deleteLabel} type="button">
                <KRHomebaseIcons.Trash className={STYLES.deleteIcon} />
              </button>
            ) : null}
          </div>
          <div className={LAYOUT_STYLES.actions}>
            {extraActions}
            <button className={`${STYLES.button} ${STYLES.ghostButton}`} data-kr-action="download-theme" disabled={working} onClick={onDownload} type="button">
              Download Theme
            </button>
            <button className={`${STYLES.button} ${STYLES.ghostButton}`} data-kr-action="upload-theme" disabled={working} onClick={() => { setUploadError(null); fileInput.current?.click() }} type="button">
              Upload Theme
            </button>
            {onCreate ? (
              <button className={`${STYLES.button} ${STYLES.secondaryButton}`} data-kr-action="create-theme" disabled={working} onClick={onCreate} type="button">
                Create New Theme
              </button>
            ) : null}
            <button className={`${STYLES.button} ${STYLES.primaryButton}`} data-kr-action="save-theme" disabled={!canSave || working} onClick={onSave} type="button">
              {saving ? <RainbowBusySpinner busy hideWhenIdle={false} label="Saving..." size={12} /> : 'Save Theme'}
            </button>
            <input accept="application/json,.json,.jsonc" className={STYLES.hidden} onChange={(event) => void handleUpload(event)} ref={fileInput} type="file" />
          </div>
        </div>
      </div>

      {/* Result line: an error, a result, or a note */}
      {message ? (
        <p className={STYLES.error} role="alert">
          {message}
        </p>
      ) : status ? (
        <p className={STYLES.status} role="status">
          {status}
        </p>
      ) : note ? (
        <p className={STYLES.note}>{note}</p>
      ) : null}
    </section>
  )
}
