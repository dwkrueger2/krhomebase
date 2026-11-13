'use client'
// file: apps/web/features/data-import/components/ImportUploadCard.client.tsx
/**
 * The upload stage (`data-kr-id="FirmSettingsDataManagementContactUploadCard"`): eyebrow "Contact import", heading
 * "Upload JSONC", the hidden file input, the select button and the drop zone.
 *
 * Ported from the upload block of the old `BulkDataManagementImportPanel.client.tsx` (texts, `accept` list and
 * markers kept). Changed: contact only (Matter import is disabled, so the old matter text is gone); the drag state
 * lives here instead of in the panel; sizes follow the Density Contract.
 *
 * @param props - The last upload or validation error, and `onFile`, called with the chosen or dropped file.
 */

import { useRef, useState, type DragEvent } from 'react'

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,.07)]',
  eyebrow: 'text-[11px] font-black uppercase tracking-[0.04em] text-(color:--kr-theme-accent-dark)',
  heading: 'text-[14px] font-bold leading-tight text-(color:--kr-theme-text)',
  paragraph: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  selectButton:
    'px-[8px] py-[3px] min-h-[26px] justify-self-start rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background)',
  hiddenInput: 'hidden',
  dropTarget:
    'px-[8px] min-h-[56px] rounded-[2px] border border-dashed border-[color-mix(in_srgb,var(--kr-theme-orange)_54%,var(--kr-theme-line))] bg-[color-mix(in_srgb,var(--kr-theme-orange)_7%,var(--kr-theme-card-surface))] text-center text-[12px] font-extrabold text-(color:--kr-theme-text-muted)',
  dropTargetActive:
    'border-(--kr-theme-brand-primary-active) bg-[color-mix(in_srgb,var(--kr-theme-brand-primary-active)_14%,var(--kr-theme-card-surface))] ring-2 ring-[color-mix(in_srgb,var(--kr-theme-brand-primary-active)_28%,transparent)]',
  errorText: 'text-[12px] font-extrabold text-(color:--kr-theme-danger)',
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
  card: 'p-[8px] gap-[6px] grid min-w-0',
  titleBlock: 'gap-[2px] grid min-w-0',
  text: 'm-0',
  dropTarget: 'flex items-center justify-center',
} as const

export interface ImportUploadCardProps {
  /** Parse or validation message to show under the drop zone; empty for none. */
  uploadError: string
  /** Called with the file the person chose or dropped. */
  onFile: (file: File) => void
}

export default function ImportUploadCard({ uploadError, onFile }: ImportUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files.item(0)
    if (file) onFile(file)
  }

  return (
    <div className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-id="FirmSettingsDataManagementContactUploadCard" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      {/* Upload title: the stage name and what the file holds. */}
      <div className={LAYOUT_STYLES.titleBlock}>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Contact import</p>
        <h3 className={`${LAYOUT_STYLES.text} ${STYLES.heading}`}>Upload JSONC</h3>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.paragraph}`}>Upload a contact, entity, and trust JSONC file.</p>
      </div>

      {/* File choice: the hidden input, its button and the drop zone. */}
      <input
        ref={inputRef}
        accept=".json,.jsonc,application/json"
        className={STYLES.hiddenInput}
        data-kr-element="contact-import-file-input"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          // Cleared so choosing the same file again (after fixing it) runs the checks again.
          event.target.value = ''
        }}
      />
      <button className={STYLES.selectButton} type="button" onClick={() => inputRef.current?.click()}>
        Select Contact JSONC file to upload or drop file below.
      </button>
      <div
        aria-label="JSONC file drop target"
        className={`${LAYOUT_STYLES.dropTarget} ${STYLES.dropTarget} ${dragOver ? STYLES.dropTargetActive : ''}`}
        data-kr-id="FirmSettingsDataManagementDropTarget"
        onDragEnter={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
      >
        {dragOver ? 'Release to upload JSONC file' : 'Drop JSONC file here'}
      </div>
      {uploadError ? <p className={`${LAYOUT_STYLES.text} ${STYLES.errorText}`} role="alert">{uploadError}</p> : null}
    </div>
  )
}
