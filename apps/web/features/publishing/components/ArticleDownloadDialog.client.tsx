'use client'
// file: apps/web/features/publishing/components/ArticleDownloadDialog.client.tsx
/**
 * Download dialog for original Article/Answer ZIP packages (plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/ArticleDownloadDialog.client.tsx`. Kept: the dark header
 * ("Download Article Packages", its line, close), the progress line with the rainbow spinner, the table with a
 * select-all tick box (part-ticked when some are), No. and Title, the selected row ticked first when there is one,
 * and Cancel / Download <count>.
 *
 * Changed:
 *  - Each ZIP comes from `GET /api/v1/publishing/items/{itemId}/package` (`fetchPackageFile`) and is saved as its own
 *    file, one after another; the old dialog bundled several into one `front-end-publications-<date>.zip` with a
 *    README through JSZip, which this app does not have (adding it is a new dependency for the requester to decide).
 *    Failures are listed in the progress line, and the dialog stays open when any fail.
 *  - Every loaded item is listed: the list reply does not say whether an item's ZIP is stored (the old one filtered
 *    on `sourceUploadR2Key`); a missing ZIP is reported per item.
 *  - Drawn into `document.body` with `data-kr-theme-scope="krhomebase"` (`inline` for tests); the CSS module became
 *    the maps below (rows 1px 6px, 12px text, close a 24px square with `KRHomebaseIcons.Close`).
 */

import type { PublishingItemSummary } from '@krhomebase/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { fetchPackageFile } from '../api.client'
import { contentCode, slugify } from '../publishingRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-[rgba(0,30,58,0.4)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  header: 'bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  title: 'm-0 text-[15px] font-[850] leading-[1.15]',
  headerNote: 'm-0 text-[11px] leading-[1.3] opacity-[0.86]',
  closeButton:
    'size-[24px] p-0 inline-flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.08)] text-(color:--kr-theme-text-inverse) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  icon: 'size-[12px]',
  progress: 'm-0 text-[12px] font-[700] leading-[1.3] text-(color:--kr-theme-text)',
  failure: 'm-0 text-[11px] font-[600] text-(color:--kr-theme-danger)',
  tableFrame: 'border border-(--kr-theme-line)',
  table: 'w-full border-collapse text-[12px] leading-tight',
  headCell: 'border-b border-(--kr-theme-line) bg-(--kr-theme-table-heading-dark) text-left text-[11px] font-[900] uppercase tracking-[0.05em] text-(color:--kr-theme-text-inverse)',
  row: 'border-b border-(--kr-theme-line) even:bg-(--kr-theme-muted-surface)',
  titleCell: 'max-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  codeCell: 'w-[112px] whitespace-nowrap',
  tickCell: 'w-[34px] text-center',
  tick: 'size-[13px] cursor-pointer accent-(--kr-theme-brand-primary-active)',
  footer: 'border-t border-(--kr-theme-line)',
  secondaryButton:
    'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border border-(--kr-theme-line) bg-transparent text-[11px] font-[800] text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton:
    'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background) disabled:cursor-not-allowed disabled:opacity-50',
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
  backdrop: 'p-[10px] fixed inset-0 z-[1100] flex items-center justify-center',
  dialog: 'w-[min(760px,100%)] max-h-[min(760px,calc(100dvh-20px))] gap-[8px] grid overflow-auto',
  header: 'px-[10px] py-[8px] gap-[8px] flex items-center justify-between',
  headerCopy: 'min-w-0 gap-[2px] grid',
  progress: 'px-[10px] gap-[8px] flex min-h-[24px] items-center',
  failure: 'px-[10px]',
  tableFrame: 'mx-[10px] max-h-[min(420px,55dvh)] overflow-auto',
  cell: 'px-[6px] py-px align-middle',
  footer: 'px-[10px] py-[8px] gap-[6px] flex justify-end',
} as const

export interface ArticleDownloadDialogProps {
  items: PublishingItemSummary[]
  selectedId?: string | null
  onClose: () => void
  /** Draw in place instead of in `document.body` (tests). */
  inline?: boolean
}

/** Text safe for a file name (old `safeFileToken`). */
function safeFileToken(value: string): string {
  return slugify(value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-')).slice(0, 90) || 'front-end-publication'
}

/** Saves a downloaded file in the browser (old `downloadBlob`). */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Renders the download dialog: tick the packages, then Download saves each ZIP.
 *
 * @param props - The loaded items, the selected item's id, the close handler and `inline` for tests.
 * @returns The dialog in `document.body` (or in place).
 */
export default function ArticleDownloadDialog({ inline = false, items, onClose, selectedId }: ArticleDownloadDialogProps) {
  const initialSelection = useMemo(() => {
    if (selectedId && items.some((item) => item.id === selectedId)) return [selectedId]
    return items.map((item) => item.id)
  }, [items, selectedId])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelection))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('Select one or more saved packages to download.')
  const [failures, setFailures] = useState<string[]>([])
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)

  const selectedItems = items.filter((item) => selectedIds.has(item.id))
  const allSelected = items.length > 0 && selectedItems.length === items.length
  const someSelected = selectedItems.length > 0 && !allSelected

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected
  }, [someSelected])

  function toggleAll(): void {
    setSelectedIds((current) => (current.size === items.length ? new Set() : new Set(items.map((item) => item.id))))
  }

  function toggleRow(item: PublishingItemSummary): void {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  async function downloadSelected(): Promise<void> {
    if (busy || !selectedItems.length) return
    setBusy(true)
    setFailures([])
    const failed: string[] = []
    let saved = 0
    try {
      for (let index = 0; index < selectedItems.length; index += 1) {
        const item = selectedItems[index]!
        setProgress(`Fetching ${index + 1} of ${selectedItems.length}: ${contentCode(item)} ${item.title}`)
        try {
          const file = await fetchPackageFile(item.id, `${safeFileToken(contentCode(item))}-${safeFileToken(item.slug || item.title)}.zip`)
          downloadBlob(file.blob, file.fileName)
          saved += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          L(`[PUBLISHING_DOWNLOAD:163] package failed id=${item.id} error=${message.slice(0, 80)}`)
          failed.push(`${contentCode(item)} ${item.title}: ${message}`)
        }
      }
      if (!failed.length) {
        onClose()
        return
      }
      setFailures(failed)
      setProgress(saved ? `Downloaded ${saved} of ${selectedItems.length} packages. These could not be retrieved:` : 'No ZIP packages could be retrieved:')
    } finally {
      setBusy(false)
    }
  }

  const dialog = (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" role="presentation">
      <section aria-label="Download article packages" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="ArticleDownloadDialog" role="dialog">
        {/* Dialog header: what the dialog does, and close. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <div className={LAYOUT_STYLES.headerCopy}>
            <h3 className={STYLES.title}>Download Article Packages</h3>
            <p className={STYLES.headerNote}>Select saved Article and Answer ZIP packages to download.</p>
          </div>
          <button aria-label="Close download dialog" className={STYLES.closeButton} disabled={busy} type="button" onClick={onClose}>
            <KRHomebaseIcons.Close className={STYLES.icon} />
          </button>
        </header>

        {/* Progress: the instruction, or the item being fetched, and any failures. */}
        <div className={LAYOUT_STYLES.progress} role="status">
          {busy ? <RainbowBusySpinner busy hideWhenIdle={false} label="" ariaLabel="Preparing download" size={16} /> : null}
          <p className={STYLES.progress}>{progress}</p>
        </div>
        {failures.length ? (
          <ul className={`${LAYOUT_STYLES.failure} ${STYLES.failure}`} data-kr-element="download-failures">
            {failures.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}

        {/* Package table: tick box, number and title. */}
        <div className={`${LAYOUT_STYLES.tableFrame} ${STYLES.tableFrame}`}>
          <table className={STYLES.table}>
            <thead>
              <tr>
                <th className={`${LAYOUT_STYLES.cell} ${STYLES.headCell} ${STYLES.tickCell}`} scope="col">
                  <input ref={headerCheckboxRef} aria-label="Select all packages" checked={allSelected} className={STYLES.tick} disabled={busy || !items.length} type="checkbox" onChange={toggleAll} />
                </th>
                <th className={`${LAYOUT_STYLES.cell} ${STYLES.headCell} ${STYLES.codeCell}`} scope="col">No.</th>
                <th className={`${LAYOUT_STYLES.cell} ${STYLES.headCell}`} scope="col">Title</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr className={STYLES.row} key={item.id}>
                    <td className={`${LAYOUT_STYLES.cell} ${STYLES.tickCell}`}>
                      <input aria-label={`Select ${item.title}`} checked={selectedIds.has(item.id)} className={STYLES.tick} disabled={busy} type="checkbox" onChange={() => toggleRow(item)} />
                    </td>
                    <td className={`${LAYOUT_STYLES.cell} ${STYLES.codeCell}`}>{contentCode(item)}</td>
                    <td className={`${LAYOUT_STYLES.cell} ${STYLES.titleCell}`} title={item.title}>{item.title}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className={LAYOUT_STYLES.cell} colSpan={3}>No saved source ZIP packages are available for download.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: Cancel and Download <count>. */}
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
          <button className={STYLES.secondaryButton} disabled={busy} type="button" onClick={onClose}>Cancel</button>
          <button className={STYLES.primaryButton} disabled={busy || !selectedItems.length} type="button" onClick={() => void downloadSelected()}>
            Download {selectedItems.length || ''}
          </button>
        </footer>
      </section>
    </div>
  )

  if (inline) return dialog
  if (typeof document === 'undefined') return null
  return createPortal(dialog, document.body)
}
