'use client'
// file: apps/web/features/billing/components/AddOpenTimeFeesDialog.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/AddOpenTimeFeesDialog.client.tsx) with Billing (plan stages 2 to 4).

import { useMemo, useState } from 'react'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingTimeEntry } from '../types'

const STYLES = {
  backdrop: 'bg-slate-950/40',
  dialog: 'w-full max-w-4xl overflow-hidden rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white shadow-2xl',
  field: 'px-1.5 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[10pt]',
  primaryButton: 'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  title: 'text-[12pt] font-bold text-[var(--kr-theme-text,#243142)]',
  intro: 'mt-1 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  tableHeader: 'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[9pt] font-semibold',
  tableRow: 'cursor-pointer border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-table-row-background,#eaf4e7)] text-[10pt] hover:bg-[var(--kr-theme-table-row-hover,#f0f6fb)]',
  cell: 'p-[1px] leading-tight',
} as const

const LAYOUT_STYLES = {
  // Centered over the working area (right of the left panel, below the title bar), not the whole viewport.
  backdrop: 'p-3 fixed right-0 bottom-0 left-[var(--kr-shell-work-left,0px)] top-[var(--kr-shell-work-top,0px)] z-50 flex items-center justify-center',
  header: 'px-3 py-2 flex items-start justify-between border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  body: 'p-3 gap-2 grid',
  toolbar: 'gap-2 flex items-center justify-between',
  tableViewport: 'overflow-x-auto rounded border border-[var(--kr-theme-line,#d7dee5)]',
  table: 'grid min-w-[700px] grid-cols-[34px_94px_minmax(250px,1fr)_100px_90px] items-center',
  actions: 'px-3 py-2 flex items-center justify-between border-t border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  actionGroup: 'gap-2 flex',
} as const

/** Selects persisted unbilled Time & Fee entries for attachment to an invoice. */
export default function AddOpenTimeFeesDialog({ entries, onAdd, onCancel }: { entries: BillingTimeEntry[]; onAdd: (ids: string[]) => void; onCancel: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)
  const allSelected = useMemo(() => entries.length > 0 && selectedIds.length === entries.length, [entries.length, selectedIds.length])
  function toggle(id: string): void { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  return <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-element="open-time-fees-backdrop">
    <form className={STYLES.dialog} data-kr-id="add-open-time-fees-dialog" onSubmit={(event) => { event.preventDefault(); onAdd(selectedIds) }}>
      {/* Open-entry dialog header: make the invoice attachment operation explicit. */}
      <header className={LAYOUT_STYLES.header}><div><h2 className={STYLES.title}>Add Open Time &amp; Fees</h2><p className={STYLES.intro}>Select unbilled entries to attach to this invoice.</p></div><button aria-label="Close" className="text-[16pt]" type="button" onClick={onCancel}>×</button></header>
      <div className={LAYOUT_STYLES.body}>
        <div className={LAYOUT_STYLES.toolbar}><button className={`${STYLES.field} font-semibold`} type="button" onClick={() => setSelectedIds(allSelected ? [] : entries.map((entry) => entry.id))}>{allSelected ? 'Unselect All' : 'Select All'}</button><label className="flex items-center gap-2 text-[9pt]"><input checked={expanded} type="checkbox" onChange={(event) => setExpanded(event.target.checked)} />Multiline view</label></div>
        <div className={LAYOUT_STYLES.tableViewport}><div className={LAYOUT_STYLES.table}><div className={`${STYLES.tableHeader} ${STYLES.cell}`}><span className="sr-only">Select</span></div><div className={`${STYLES.tableHeader} ${STYLES.cell}`}>Date</div><div className={`${STYLES.tableHeader} ${STYLES.cell}`}>Billing note</div><div className={`${STYLES.tableHeader} ${STYLES.cell} text-right`}>Time</div><div className={`${STYLES.tableHeader} ${STYLES.cell} text-right`}>Amount</div>{entries.map((entry) => <label className={`${LAYOUT_STYLES.table} ${STYLES.tableRow} col-span-5`} key={entry.id} title={entry.description}><span className={STYLES.cell}><input checked={selectedIds.includes(entry.id)} type="checkbox" onChange={() => toggle(entry.id)} /></span><span className={STYLES.cell}>{entry.date}</span><span className={`${STYLES.cell} ${expanded ? 'whitespace-pre-line' : 'truncate'}`}>{entry.description}</span><span className={`${STYLES.cell} text-right tabular-nums`}>{entry.hours.toFixed(1)} h</span><span className={`${STYLES.cell} text-right font-semibold tabular-nums`}>{formatAccountingAmount(entry.amount)}</span></label>)}</div></div>{entries.length === 0 ? <p className="p-3 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]">No unbilled Time &amp; Fee entries are available.</p> : null}
      </div>
      <footer className={LAYOUT_STYLES.actions}><span className="text-[9pt] text-[var(--kr-theme-text-muted,#526172)]">{selectedIds.length} selected</span><div className={LAYOUT_STYLES.actionGroup}><button className={STYLES.field} type="button" onClick={onCancel}>Cancel</button><button className={STYLES.primaryButton} disabled={!selectedIds.length} type="submit">Add to Invoice</button></div></footer>
    </form>
  </div>
}
