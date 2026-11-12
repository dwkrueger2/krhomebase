'use client'
// file: apps/web/features/billing/components/TimeAndFeesLedger.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/TimeAndFeesLedger.client.tsx) with Billing (plan stages 2 to 4).

import { useMemo, useState } from 'react'
import EditTimeAndFeeDialog from './EditTimeAndFeeDialog.client'
import BillingTabHeader from './BillingTabHeader.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingInvoice, BillingStatus, BillingTimeEntry } from '../types'

const STATUS_CLASSES: Record<BillingStatus, string> = {
  'Delay Bill': 'border-[#b99972] bg-[#f2e9de] text-[#6f5438]',
  'Bill Next Invoice': 'border-[#d7bd69] bg-[#fff7cf] text-[#6f5a12]',
  Billed: 'border-[#9cb7a2] bg-[#e6f1e8] text-[#31563a]',
  'Not Billable': 'border-[#aeb5bb] bg-[#edf0f2] text-[#4c5660]',
}
const ALL_STATUSES: BillingStatus[] = ['Delay Bill', 'Bill Next Invoice', 'Billed', 'Not Billable']

const STYLES = {
  shell: 'text-[10pt] leading-tight text-[var(--kr-theme-text,#243142)]',
  panel: 'overflow-hidden border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) shadow-sm',
  toolbar: 'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  field: 'px-1.5 py-0.5 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt]',
  button: 'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white',
  header: 'border-b border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-table-header-background,#f4f6f8)] text-[9pt] font-semibold uppercase text-[var(--kr-theme-text-muted,#526172)]',
  row: 'border-b border-[var(--kr-theme-table-border,#d7dee5)] bg-[var(--kr-theme-table-row-background,#eaf4e7)] text-left hover:bg-[var(--kr-theme-table-row-hover,#f0f6fb)]',
  cell: 'p-[1px] text-[10pt] leading-tight',
  status: 'px-1 py-0.5 rounded-full border text-[9pt] leading-none',
  allPill: 'px-1.5 py-0.5 rounded-full border border-[var(--kr-theme-brand-primary,#21394f)] bg-(--kr-theme-card-surface) text-[9pt] text-[var(--kr-theme-brand-primary,#21394f)]',
  footer: 'px-2 py-1 border-t border-[var(--kr-theme-line,#d7dee5)] text-right font-semibold',
  singleLineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
} as const
const LAYOUT_STYLES = {
  toolbar: 'px-2 py-1 flex items-center justify-between gap-2',
  toolbarGroup: 'flex items-center gap-1',
  filters: 'px-2 py-1 flex items-center gap-1 border-b border-[var(--kr-theme-line,#d7dee5)]',
  filterLabel: 'mr-1 text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  tableViewport: 'overflow-x-auto',
  table: 'min-w-[850px]',
  grid: 'grid grid-cols-[92px_78px_minmax(240px,1fr)_110px_95px_105px_110px] items-center',
  cellRight: 'p-[1px] text-right',
  headerActions: 'gap-2 flex items-center',
  singleLineLabel: 'gap-1 flex items-center',
} as const

export interface TimeAndFeesLedgerProps {
  clientNumber: string
  clientDisplayName: string
  entries: BillingTimeEntry[]
  matterNumbers: readonly string[]
  staffOptions: readonly { id: string; label: string }[]
  /** Client invoices, so the editor can show and lock entries attached to a locked invoice. */
  invoices?: readonly BillingInvoice[]
  /** Opens the invoice editor for an attached invoice (the entry dialog closes first). */
  onOpenInvoice?: (invoiceId: string) => void
  onSave: (entry: BillingTimeEntry) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

/** Renders persisted time and flat-fee entries with the billing filters and edit workflow. */
export default function TimeAndFeesLedger({ clientDisplayName, clientNumber, entries, matterNumbers, staffOptions, invoices = [], onOpenInvoice, onSave, onDelete }: TimeAndFeesLedgerProps) {
  const [matter, setMatter] = useState('ALL')
  const [statuses, setStatuses] = useState<BillingStatus[]>([])
  const [editing, setEditing] = useState<BillingTimeEntry | null>(null)
  const [adding, setAdding] = useState(false)
  const [singleLineView, setSingleLineView] = useState(true)
  const visible = useMemo(() => entries.filter((entry) => (matter === 'ALL' || entry.matterNumber === matter) && (!statuses.length || statuses.includes(entry.billingStatus))), [entries, matter, statuses])
  const visibleEntries = visible.length ? visible : [{ id: 'empty-time-fee-row', matterId: '', date: 'March 23, 2026', matterNumber: matter === 'ALL' ? '' : matter, description: 'Sample Row - No Entries Found', activityCategory: '', kind: 'Time' as const, hours: 0, rate: 0, amount: 0, billingStatus: 'Not Billable' as const, staffId: '', staff: '', invoiceId: null, isEmpty: true }]
  function toggleStatus(status: BillingStatus): void { setStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]) }
  function toggleAll(): void { setStatuses((current) => current.length === ALL_STATUSES.length ? [] : ALL_STATUSES) }
  return <section className={STYLES.shell} data-kr-id="time-and-fees-ledger" data-kr-component="TimeAndFeesLedger"><div className={STYLES.panel}>
     {/* Time & Fees toolbar: select a matter, choose the row density, and open the entry editor. */}
     <BillingTabHeader actions={<div className={LAYOUT_STYLES.headerActions}><label className={`${LAYOUT_STYLES.singleLineLabel} ${STYLES.singleLineLabel}`}><input checked={singleLineView} type="checkbox" onChange={(event) => setSingleLineView(event.target.checked)} />Single Line View</label><button className={STYLES.button} type="button" onClick={() => setAdding(true)}>Add billing entry</button></div>} clientDisplayName={clientDisplayName} clientNumber={clientNumber} matterNumbers={matterNumbers} onMatterChange={setMatter} selectedMatter={matter} />
    <div className={LAYOUT_STYLES.filters} data-kr-element="billing-status-filters"><span className={LAYOUT_STYLES.filterLabel}>Billing status</span><button className={`${STYLES.allPill} ${statuses.length === 0 || statuses.length === ALL_STATUSES.length ? 'ring-2 ring-[var(--kr-theme-brand-primary,#21394f)]' : ''}`} aria-pressed={statuses.length === 0 || statuses.length === ALL_STATUSES.length} type="button" onClick={toggleAll}>All</button>{ALL_STATUSES.map((status) => <button className={`${STYLES.status} ${STATUS_CLASSES[status]} ${statuses.includes(status) ? 'ring-2 ring-[var(--kr-theme-brand-primary,#21394f)]' : ''}`} aria-pressed={statuses.includes(status)} key={status} type="button" onClick={() => toggleStatus(status)}>{status}</button>)}</div>
     <div className={LAYOUT_STYLES.tableViewport}><div className={LAYOUT_STYLES.table}><div className={`${LAYOUT_STYLES.grid} ${STYLES.header}`} role="row"><div className={STYLES.cell}>Date</div><div className={STYLES.cell}>Matter #</div><div className={STYLES.cell}>Description</div><div className={STYLES.cell}>Status</div><div className={LAYOUT_STYLES.cellRight}>Hours</div><div className={LAYOUT_STYLES.cellRight}>Rate</div><div className={LAYOUT_STYLES.cellRight}>Amount</div></div><div data-kr-element="time-fee-rows-container">{visibleEntries.map((entry) => <button className={`${LAYOUT_STYLES.grid} w-full ${STYLES.row} ${entry.isEmpty ? 'text-[var(--kr-theme-text-muted,#526172)]' : ''}`} disabled={entry.isEmpty} key={entry.id} type="button" onClick={() => { if (!entry.isEmpty) setEditing(entry) }}><span className={STYLES.cell}>{entry.date}</span><span className={STYLES.cell}>{entry.matterNumber}</span><span className={`${STYLES.cell} ${singleLineView ? 'truncate' : 'whitespace-pre-line break-words'}`} title={entry.description}>{entry.description}</span><span className={STYLES.cell}><span className={`${STYLES.status} ${STATUS_CLASSES[entry.billingStatus]}`}>{entry.billingStatus}</span></span><span className={`${LAYOUT_STYLES.cellRight} tabular-nums`}>{entry.hours.toFixed(1)}</span><span className={`${LAYOUT_STYLES.cellRight} tabular-nums`}>{formatAccountingAmount(entry.rate)}</span><span className={`${LAYOUT_STYLES.cellRight} font-semibold tabular-nums`}>{formatAccountingAmount(entry.amount)}</span></button>)}</div></div></div>
    <footer className={STYLES.footer}>Visible amount: {formatAccountingAmount(visible.reduce((sum, entry) => sum + entry.amount, 0))}</footer>
  </div>{adding || editing ? <EditTimeAndFeeDialog entry={editing ?? undefined} attachedInvoice={editing?.invoiceId ? invoices.find((invoice) => invoice.id === editing.invoiceId) ?? null : null} onOpenInvoice={onOpenInvoice ? (invoiceId) => { setEditing(null); onOpenInvoice(invoiceId) } : undefined} matterNumbers={matterNumbers} staffOptions={staffOptions} onCancel={() => { setAdding(false); setEditing(null) }} onDelete={editing ? async (id) => { await onDelete(id); setEditing(null) } : undefined} onSave={async (entry) => { await onSave(entry); setAdding(false); setEditing(null) }} /> : null}</section>
}
