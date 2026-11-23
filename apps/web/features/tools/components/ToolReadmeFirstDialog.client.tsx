'use client'
// file: apps/web/features/tools/components/ToolReadmeFirstDialog.client.tsx
/**
 * "Outside Tools: README First" in a dialog, for the super admin (Outside tools screen header, and the registration
 * form beside Permissions). The text is the help document `docs/help-docs/Outside-Tools-README-First.md`, bundled as
 * text (Vite `?raw`, loaded only when the dialog first opens, as Data Import's instructions are) and drawn with
 * `parseHelpDocument` as React elements: no download, no HTML from the document.
 *
 * A custom `role="dialog"` (root `AGENTS.md`, User-Response Dialog Standard), like `ToolHealthDetailDialog`: the
 * parent owns `open`; Escape, the backdrop and Close close it. Rendered into the page's body with
 * `data-kr-theme-scope="krhomebase"` so the theme tokens apply.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { parseHelpDocument, type HelpBlock, type HelpInline } from '@/features/tools/helpDocument'

export interface ToolReadmeFirstDialogProps {
  open: boolean
  onClose: () => void
}

/** Loads the help document's text (a separate chunk, so the screen does not carry it until it is wanted). */
async function loadReadmeFirst(): Promise<string> {
  const module = await import('../../../../../docs/help-docs/Outside-Tools-README-First.md?raw')
  return module.default
}

const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1000] flex items-center justify-center',
  dialog: 'gap-[6px] p-[10px] w-full max-w-[880px] max-h-[88dvh] flex flex-col',
  body: 'pr-[4px] min-h-0 overflow-y-auto',
  list: 'my-[3px] pl-[18px]',
  cell: 'px-[6px] py-[2px]',
  actions: 'gap-[6px] flex justify-end',
} as const

const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)] text-(color:--kr-theme-text)',
  h1: 'mt-0 mb-[2px] text-[15px] leading-tight font-semibold',
  h2: 'mt-[10px] mb-[3px] text-[13.5px] leading-tight font-semibold text-(color:--kr-theme-brand-primary)',
  h3: 'mt-[8px] mb-[3px] text-[12.5px] leading-tight font-semibold',
  small: 'm-0 text-[10.5px] leading-tight text-(color:--kr-theme-text-muted)',
  paragraph: 'my-[4px] text-[12.5px] leading-snug',
  item: 'text-[12.5px] leading-snug',
  table: 'my-[4px] w-full border-collapse text-[12px] leading-snug',
  th: 'text-left align-bottom text-[10.5px] font-semibold uppercase tracking-[0.045em] text-(color:--kr-theme-text-muted) bg-(--kr-theme-table-heading-light) border-b border-(--kr-theme-line)',
  td: 'align-top border-b border-(--kr-theme-line)',
  code: 'px-[3px] rounded-[2px] bg-(--kr-theme-muted-surface) font-mono text-[11.5px]',
  error: 'm-0 text-[12px] leading-tight text-(color:--kr-theme-danger)',
  button: 'h-[24px] px-[10px] rounded-[2px] border cursor-pointer text-[12px] font-semibold leading-tight border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
} as const

/** One line's runs: plain, bold and code. */
function Inline({ runs }: { runs: HelpInline[] }) {
  return (
    <>
      {runs.map((run, index) =>
        run.code ? <code key={index} className={STYLES.code}>{run.text}</code> : run.bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>,
      )}
    </>
  )
}

/** One block of the document. */
function Block({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
      return <Tag className={block.level === 1 ? STYLES.h1 : block.level === 2 ? STYLES.h2 : STYLES.h3}><Inline runs={block.inline} /></Tag>
    }
    case 'small':
      return <p className={STYLES.small}>{block.text}</p>
    case 'paragraph':
      return <p className={STYLES.paragraph}><Inline runs={block.inline} /></p>
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <List className={`${LAYOUT_STYLES.list} ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, index) => <li key={index} className={STYLES.item}><Inline runs={item} /></li>)}
        </List>
      )
    }
    case 'table':
      return (
        <table className={STYLES.table}>
          <thead>
            <tr>{block.header.map((cell, index) => <th key={index} className={`${LAYOUT_STYLES.cell} ${STYLES.th}`}><Inline runs={cell} /></th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}><Inline runs={cell} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      )
  }
}

/**
 * Renders the README First dialog while `open`.
 *
 * @param props - Whether it is open, and the close callback.
 * @returns A portal with the backdrop and the dialog, or nothing.
 */
export default function ToolReadmeFirstDialog({ open, onClose }: ToolReadmeFirstDialogProps) {
  const [blocks, setBlocks] = useState<HelpBlock[] | null>(null)
  const [error, setError] = useState('')

  // The first open loads the document; later opens reuse it.
  useEffect(() => {
    if (!open || blocks) return
    let cancelled = false
    loadReadmeFirst()
      .then((text) => {
        if (!cancelled) setBlocks(parseHelpDocument(text))
      })
      .catch(() => {
        if (!cancelled) setError('The help document could not be loaded. Reload the page and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [open, blocks])

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-theme-scope="krhomebase"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} role="dialog" aria-modal="true" aria-label="Outside Tools: README First" data-kr-id="ToolReadmeFirstDialog">
        {/* The document: loading, failed, or its blocks */}
        <div className={LAYOUT_STYLES.body} data-kr-element="tool-readme-first-body">
          {error ? <p className={STYLES.error} role="alert">{error}</p> : blocks ? blocks.map((block, index) => <Block key={index} block={block} />) : <RainbowBusySpinner busy hideWhenIdle={false} label="Loading..." size={18} />}
        </div>

        {/* Dialog actions */}
        <div className={LAYOUT_STYLES.actions}>
          <button type="button" className={STYLES.button} onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
