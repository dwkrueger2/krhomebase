'use client'
// file: apps/web/features/billing/components/ClientAccountingLedger.client.tsx
// Ported from the old app (hb-components/KR-Billing/ClientAccountingLedger.client.tsx). Change: the Statement of Account
// Print and Send icons are shown disabled until plan stage 5 (documents and email), which ports the statement builder.

import { useMemo, useState } from 'react'
import AccountingDatePicker, { parseAccountingDate } from './AccountingDatePicker.client'
import BillingTabHeader from './BillingTabHeader.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingInvoice, BillingMatter, BillingTrustEntry, ClientAccountingLedgerEntry } from '../types'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'

/** Records the Statement of Account needs beyond the register rows (enables Print / Send). */
export interface ClientAccountingStatementSource {
  clientId: string
  matters: readonly BillingMatter[]
  invoices: readonly BillingInvoice[]
  trustEntries: readonly BillingTrustEntry[]
}

export interface ClientAccountingLedgerProps {
  entries: ClientAccountingLedgerEntry[]
  clientNumber: string
  clientDisplayName: string
  validMatterNumbers: readonly string[]
  onSave?: (entry: ClientAccountingLedgerEntry) => Promise<void>
  /** Opens an invoice in the Billing Panel's existing Invoice Edit Dialog. */
  onOpenInvoice?: (invoiceId: string) => void
  /** Opens the payment receipt in the Billing Panel's Payments tab. */
  onOpenPayment?: (paymentId: string) => void
  /** When given, the header shows Print and Send for the Statement of Account (whole client or the selected matter). */
  statementSource?: ClientAccountingStatementSource
}

const STYLES = {
  wrapper: 'text-[var(--kr-theme-text,_#243142)] text-[11pt] leading-tight',
  shell: 'overflow-hidden border-[2px] border-[var(--kr-theme-line,_#d7dee5)] bg-[var(--kr-theme-card-surface,_#ffffff)] shadow-sm',
  toolbar: 'border-b border-[var(--kr-theme-line,_#c4ccd4)] bg-[var(--kr-theme-muted-surface,_#eef3f7)] text-[11pt]',
  accountName: 'font-semibold text-[11pt] text-[var(--kr-theme-text,_#243142)]',
  singleLineLabel: 'gap-1.5 flex items-center whitespace-nowrap text-[11pt] font-semibold text-[var(--kr-theme-text,_#243142)]',
  matterSelect: 'px-1.5 py-0.5 rounded-[2px] border border-[var(--kr-theme-line,_#b8c3cd)] bg-[var(--kr-theme-card-surface,_#ffffff)] text-[11pt] text-[var(--kr-theme-text,_#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,_#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,_#21394f)]',
  tableGrid: 'min-w-[760px] w-full',
  tableHeader: 'border-b border-[var(--kr-theme-table-border,_#b8c3cd)] bg-[var(--kr-theme-table-header-background,_#f4f6f8)]',
  headerCell: 'p-[1px] overflow-hidden whitespace-nowrap border-r border-[var(--kr-theme-table-border,_#d7dee5)] text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-[var(--kr-theme-text-muted,_#526172)]',
  // Ledger row typography matches TimeAndFeesLedger (10pt, tight) so every Billing tab reads the same; the toolbar stays 11pt like BillingTabHeader.
  rowBase: 'grid items-center border-b border-[var(--kr-theme-table-border,_#d7dee5)] bg-[var(--kr-theme-table-row-background,_#eaf4e7)] text-[10pt] leading-tight hover:bg-[var(--kr-theme-table-row-hover,_#f0f6fb)]',
  cellText: 'p-[1px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap border-r border-[var(--kr-theme-table-border,_#d7dee5)] text-[10pt] leading-tight',
  descriptionCell: 'p-[1px] min-w-0 overflow-hidden border-r border-[var(--kr-theme-table-border,_#d7dee5)] text-[10pt] leading-tight',
  numericCell: 'p-[1px] overflow-hidden whitespace-nowrap border-r border-[var(--kr-theme-table-border,_#d7dee5)] text-right text-[10pt] leading-tight tabular-nums',
  footer: 'border-t border-[var(--kr-theme-line,_#c4ccd4)] bg-[var(--kr-theme-card-surface,_#ffffff)]',
  footerEndingLabel: 'text-right text-[10pt] font-semibold uppercase tracking-[0.08em] text-[var(--kr-theme-text-muted,_#526172)]',
  footerEndingBalance: 'text-right text-[16pt] min-w-[200px] font-semibold tabular-nums text-[var(--kr-theme-text,_#243142)]',
  utilityButton: 'p-1 rounded text-[var(--kr-theme-text-muted,#526172)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] hover:text-[var(--kr-theme-brand-primary,#21394f)] disabled:cursor-help disabled:opacity-40 disabled:hover:bg-transparent',
  // Voided rows (Show Voided): rose tint, muted red, struck amounts; they never move the balance.
  voidedRow: '!bg-[#fdf1ef] text-[#7d3b33] hover:!bg-[#fbe6e2]',
  voidedAmount: 'line-through decoration-[#b3473b]',
  voidChip: 'mr-1 px-1 rounded border border-[#b3473b] bg-white text-[7.5pt] font-bold uppercase text-[#9d2c20]',
  secondaryButton: 'px-3 py-1 rounded-[2px] border border-[var(--kr-theme-line,_#b8c3cd)] bg-[var(--kr-theme-card-surface,_#ffffff)] text-[11pt] font-semibold text-[var(--kr-theme-text-muted,_#526172)] hover:bg-[var(--kr-theme-muted-surface,_#eef3f7)]',
  primaryButton: 'px-3 py-1 rounded-[2px] border border-[var(--kr-theme-brand-primary,_#21394f)] bg-[var(--kr-theme-brand-primary,_#21394f)] text-[11pt] font-semibold text-[var(--kr-theme-text-inverse,_#ffffff)] hover:bg-[var(--kr-theme-brand-primary-active,_#0a4f9c)] disabled:cursor-not-allowed disabled:opacity-50',
  // Centered over the working area (right of the left panel, below the title bar), not the whole viewport.
  dialogBackdrop: 'p-4 fixed right-0 bottom-0 left-[var(--kr-shell-work-left,0px)] top-[var(--kr-shell-work-top,0px)] z-50 flex items-center justify-center bg-slate-950/40',
  dialog: 'w-full max-w-2xl overflow-hidden rounded border border-[var(--kr-theme-line,_#b8c3cd)] bg-[var(--kr-theme-card-surface,_#ffffff)] shadow-2xl',
  dialogHeader: 'px-4 py-3 border-b border-[var(--kr-theme-line,_#c4ccd4)] bg-[var(--kr-theme-muted-surface,_#eef3f7)]',
  dialogTitle: 'text-[14pt] font-semibold text-[var(--kr-theme-text,_#243142)]',
  dialogIntro: 'mt-1 text-[10pt] text-[var(--kr-theme-text-muted,_#526172)]',
  fieldLabel: 'text-[10pt] font-semibold text-[var(--kr-theme-text-muted,_#526172)]',
  errorText: 'text-[10pt] text-red-700',
  fieldInput: 'px-2 py-1.5 min-w-0 rounded border border-[var(--kr-theme-line,_#b8c3cd)] bg-[var(--kr-theme-card-surface,_#ffffff)] text-[11pt] text-[var(--kr-theme-text,_#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,_#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,_#21394f)]',
  fieldTextarea: 'px-2 py-1.5 min-h-24 resize-y rounded border border-[var(--kr-theme-line,_#b8c3cd)] bg-[var(--kr-theme-card-surface,_#ffffff)] text-[11pt] text-[var(--kr-theme-text,_#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,_#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,_#21394f)]',
  readOnlyValue: 'px-2 py-1.5 rounded border border-[var(--kr-theme-line,_#d7dee5)] bg-[var(--kr-theme-muted-surface,_#f7f9fb)] text-[11pt] tabular-nums text-[var(--kr-theme-text-muted,_#526172)]',
  dialogFooter: 'border-t border-[var(--kr-theme-line,_#c4ccd4)] bg-[var(--kr-theme-muted-surface,_#f7f9fb)]',
} as const

const LAYOUT_STYLES = {
  toolbar: 'px-2 py-1 gap-2 flex items-center justify-between',
  accountHeader: 'px-2 py-2 gap-3 flex items-center justify-between',
  accountCaption: 'gap-2 flex min-w-0 items-baseline',
  accountActions: 'gap-2 flex shrink-0 items-center',
  dialogBody: 'px-4 py-4 gap-1 grid',
  dialogFooter: 'px-4 py-3 gap-2 flex justify-end',
  formGrid2: 'gap-3 grid sm:grid-cols-2',
  formGrid3: 'gap-3 grid sm:grid-cols-3',
  fieldGridGap: 'gap-1 grid',
  tableViewport: 'overflow-x-auto',
  grid: 'grid',
  collapsed: '120px 80px 1fr 100px 100px 120px',
  expanded: '100px 90px minmax(260px, 1fr) 110px 100px 120px',
  footer: 'py-3 gap-4 flex-col items-end',
  footerEnding: 'flex items-baseline justify-end',
  headerActions: 'gap-1 flex items-center',
} as const

/** Why the statement icons are disabled. */
const STATEMENT_LATER = 'Printing and emailing the Statement of Account arrive in plan stage 5 (documents and email).'

function amountInput(value?: number): string { return typeof value === 'number' ? String(value) : '' }
function optionalAmount(value: string): number | undefined { const trimmed = value.trim(); if (!trimmed) return undefined; const parsed = Number(trimmed); return Number.isFinite(parsed) ? parsed : undefined }
function validOptional(value: string): boolean { return !value.trim() || Number.isFinite(Number(value)) }
function validWriteOff(value: string): boolean { return !value.trim() || (Number.isFinite(Number(value)) && Number(value) < 0) }
function normalizeWriteOff(value: string): string { const trimmed = value.trim(); if (!trimmed || ['-', '.', '-.'].includes(trimmed)) return value; const parsed = Number(trimmed); return Number.isFinite(parsed) && parsed > 0 ? String(-parsed) : value }
function charges(entry: ClientAccountingLedgerEntry): number | undefined { return entry.charges }
function payments(entry: ClientAccountingLedgerEntry): number | undefined { return entry.payments }
function displayAmount(value: number | undefined): string { return typeof value === 'number' ? formatAccountingAmount(value) : '' }

/** Renders the accounting register against persisted API-v1 ledger rows. */
export default function ClientAccountingLedger({ entries, clientDisplayName, clientNumber, validMatterNumbers, onSave, onOpenInvoice, onOpenPayment, statementSource }: ClientAccountingLedgerProps) {
  const [expanded, setExpanded] = useState(false)
  /** Show voided invoice postings, payments, and write-offs (flagged by the API; excluded from the balance). */
  const [showVoided, setShowVoided] = useState(false)
  const [selectedMatter, setSelectedMatter] = useState('ALL')
  const [editing, setEditing] = useState<ClientAccountingLedgerEntry | null>(null)
  const inMatter = useMemo(() => entries.filter((entry) => selectedMatter === 'ALL' || entry.matterNumber === selectedMatter), [entries, selectedMatter])
  const voidedCount = inMatter.filter((entry) => entry.voided).length
  const filtered = useMemo(() => (showVoided ? inMatter : inMatter.filter((entry) => !entry.voided)), [inMatter, showVoided])
  const visibleEntries = filtered.length ? filtered : [{
    id: 'empty-billing-overview-row',
    date: 'March 23, 2026',
    reference: '',
    description: 'Sample Row - No Entries Found',
    balance: 0,
    matterNumber: selectedMatter === 'ALL' ? '' : selectedMatter,
    editable: false,
    isEmpty: true,
  } satisfies ClientAccountingLedgerEntry]
  const endingBalance = filtered.filter((entry) => !entry.voided).at(-1)?.balance ?? 0
  const gridTemplateColumns = expanded ? LAYOUT_STYLES.expanded : LAYOUT_STYLES.collapsed
  const statementScope = selectedMatter === 'ALL' ? 'all matters' : `matter ${selectedMatter}`

  return <>
    <section className={`${LAYOUT_STYLES.grid} ${STYLES.wrapper}`} data-kr-id="client-accounting-ledger" data-kr-component="ClientAccountingLedger">
      <div className={STYLES.shell}>
        <BillingTabHeader
          actions={
            <>
              {/* Statement of Account: Print and Send, left of Single Line View. Disabled until plan stage 5. */}
              {statementSource ? (
                <div className={LAYOUT_STYLES.headerActions} data-kr-element="client-accounting-statement-actions">
                  <button aria-label={`Print Statement of Account (${statementScope})`} className={STYLES.utilityButton} data-kr-action="client-accounting-print-statement" disabled title={STATEMENT_LATER} type="button">
                    <KRHomebaseIcons.Print />
                  </button>
                  <button aria-label={`Email Statement of Account (${statementScope})`} className={STYLES.utilityButton} data-kr-action="client-accounting-send-statement" disabled title={STATEMENT_LATER} type="button">
                    <KRHomebaseIcons.Send />
                  </button>
                </div>
              ) : null}
              <label className={STYLES.singleLineLabel}><input checked={showVoided} data-kr-element="client-accounting-show-voided" type="checkbox" onChange={(event) => setShowVoided(event.target.checked)} />Show Voided{voidedCount ? ` (${voidedCount})` : ''}</label>
              <label className={STYLES.singleLineLabel}><input checked={!expanded} type="checkbox" onChange={(event) => setExpanded(!event.target.checked)} />Single Line View</label>
            </>
          }
          clientDisplayName={clientDisplayName}
          clientNumber={clientNumber}
          matterNumbers={validMatterNumbers}
          onMatterChange={setSelectedMatter}
          selectedMatter={selectedMatter}
        />
        {/* Ledger table: the QuickBooks-inspired register with API-backed rows. */}
         <div className={LAYOUT_STYLES.tableViewport} data-kr-element="table-root"><div className={`${STYLES.tableGrid} grid`} role="table" aria-label={`${clientNumber} ${clientDisplayName} accounting register`}>
           <div className={`${LAYOUT_STYLES.grid} ${STYLES.tableHeader}`} role="row" style={{ gridTemplateColumns }}><div className={STYLES.headerCell}>Date</div><div className={STYLES.headerCell}>Number</div><div className={STYLES.headerCell}>Description</div><div className={`${STYLES.headerCell} text-right`}>Charges</div><div className={`${STYLES.headerCell} text-right`}>Payments</div><div className={`${STYLES.headerCell} text-right`}>Balance</div></div>
           <div data-kr-element="rows-container">{visibleEntries.map((entry) => {
             const invoiceId = entry.invoiceId ?? null
             const canOpenInvoice = Boolean(invoiceId && !entry.voided && onOpenInvoice)
             const paymentId = entry.paymentId ?? null
             const canOpenPayment = Boolean(paymentId && !entry.voided && onOpenPayment)
             const canEditLedgerEntry = entry.editable !== false && Boolean(onSave)
             return <button className={`${LAYOUT_STYLES.grid} ${STYLES.rowBase} ${entry.isEmpty ? 'text-[var(--kr-theme-text-muted,_#526172)]' : ''} ${entry.voided ? STYLES.voidedRow : ''} w-full text-left disabled:cursor-default`} data-kr-element={entry.voided ? 'client-accounting-row-voided' : undefined} disabled={!canOpenInvoice && !canOpenPayment && (!canEditLedgerEntry || entry.isEmpty)} key={entry.id} onDoubleClick={() => {
               if (canOpenInvoice && invoiceId) onOpenInvoice?.(invoiceId)
               else if (canOpenPayment && paymentId) onOpenPayment?.(paymentId)
               else if (canEditLedgerEntry) setEditing(entry)
             }} onClick={() => {
               if (!canOpenInvoice && !canOpenPayment && canEditLedgerEntry) setEditing(entry)
             }} role="row" style={{ gridTemplateColumns }} title={entry.voided ? `Voided${entry.voidReason ? `: ${entry.voidReason}` : ''}. Not included in the balance.` : canOpenInvoice ? 'Double-click to edit this invoice' : canOpenPayment ? 'Double-click to view this payment receipt' : entry.editable === false ? 'Posted system entry; use its owning billing workflow to change it.' : 'Double-click to edit this client accounting entry'} type="button"><div className={STYLES.cellText}>{entry.date}</div><div className={STYLES.cellText}>{entry.matterNumber ?? ''}</div><div className={`${STYLES.descriptionCell} ${expanded ? 'whitespace-pre-line break-words' : 'text-ellipsis whitespace-nowrap'}`} title={entry.description}>{entry.voided ? <span className={STYLES.voidChip}>Void</span> : null}{entry.description}</div><div className={`${STYLES.numericCell} ${charges(entry) === undefined ? 'text-[var(--kr-theme-text-muted,_#526172)]' : ''}`}><span className={entry.voided ? STYLES.voidedAmount : ''}>{displayAmount(charges(entry))}</span></div><div className={`${STYLES.numericCell} ${payments(entry) === undefined ? 'text-[var(--kr-theme-text-muted,_#526172)]' : ''}`}><span className={entry.voided ? STYLES.voidedAmount : ''}>{displayAmount(payments(entry))}</span></div><div className={`${STYLES.numericCell} font-semibold`}>{entry.voided ? '—' : formatAccountingAmount(entry.balance)}</div></button>
           })}</div>
        </div></div>
        {/* Ending balance: close the register with the selected matter's current total. */}
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}><div className={LAYOUT_STYLES.footerEnding}><span className={STYLES.footerEndingLabel}>Ending balance </span><div className={STYLES.footerEndingBalance}>{formatAccountingAmount(endingBalance)}</div></div></footer>
      </div>
    </section>
    {editing && onSave ? <LedgerEntryDialog entry={editing} validMatterNumbers={validMatterNumbers} onCancel={() => setEditing(null)} onSave={async (next) => { await onSave(next); setEditing(null) }} /> : null}
  </>
}

/** Edit dialog for manual accounting rows; posted invoice/payment rows remain read-only. */
function LedgerEntryDialog({ entry, validMatterNumbers, onCancel, onSave }: { entry: ClientAccountingLedgerEntry; validMatterNumbers: readonly string[]; onCancel: () => void; onSave: (entry: ClientAccountingLedgerEntry) => Promise<void> }) {
  const [date, setDate] = useState(entry.date)
  const [dateValid, setDateValid] = useState(() => Boolean(parseAccountingDate(entry.date)))
  const [matterNumber, setMatterNumber] = useState(entry.matterNumber ?? '')
  const [description, setDescription] = useState(entry.description)
  const [charge, setCharge] = useState(amountInput(entry.charges))
  const [payment, setPayment] = useState(amountInput(entry.payments))
  const [writeOff, setWriteOff] = useState(amountInput(entry.writeOff))
  const amountsValid = validOptional(charge) && validOptional(payment) && validWriteOff(writeOff)
  const canSave = dateValid && validMatterNumbers.includes(matterNumber.trim()) && description.trim().length > 0 && amountsValid && !(charge.trim() && payment.trim())
  return <div className={STYLES.dialogBackdrop}><form aria-label="Edit client accounting entry" className={STYLES.dialog} data-kr-id="client-accounting-entry" onSubmit={(event) => { event.preventDefault(); if (!canSave) return; void onSave({ ...entry, date, matterNumber: matterNumber.trim(), description: description.trim(), charges: optionalAmount(charge), payments: optionalAmount(payment), writeOff: optionalAmount(writeOff) }) }}>
    {/* Manual ledger edit header: explain the API-backed record being changed. */}
    <header className={STYLES.dialogHeader}><h2 className={STYLES.dialogTitle}>Edit client accounting entry</h2><p className={STYLES.dialogIntro}>Update the billable item recorded to this client matter.</p></header>
    <div className={LAYOUT_STYLES.dialogBody}><div className={LAYOUT_STYLES.formGrid2}><label className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Date</span><AccountingDatePicker className={STYLES.fieldInput} onChange={setDate} onValidationChange={setDateValid} value={date} /></label><label className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Number (Matter #)</span><input className={STYLES.fieldInput} list="billing-matter-numbers" value={matterNumber} onChange={(event) => setMatterNumber(event.target.value)} />{!validMatterNumbers.includes(matterNumber.trim()) ? <span className={STYLES.errorText}>Choose a valid matter number for this client.</span> : null}<datalist id="billing-matter-numbers">{validMatterNumbers.map((matter) => <option key={matter} value={matter} />)}</datalist></label></div><label className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Description</span><textarea className={STYLES.fieldTextarea} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className={LAYOUT_STYLES.formGrid3}><label className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Charges</span><input className={STYLES.fieldInput} min="0" step="0.01" type="number" value={charge} onChange={(event) => { setCharge(event.target.value); if (event.target.value.trim()) setPayment('') }} /></label><label className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Payments</span><input className={STYLES.fieldInput} min="0" step="0.01" type="number" value={payment} onChange={(event) => { setPayment(event.target.value); if (event.target.value.trim()) setCharge('') }} /></label><label className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Write Off</span><input className={STYLES.fieldInput} max="0" step="0.01" type="number" value={writeOff} onChange={(event) => setWriteOff(normalizeWriteOff(event.target.value))} />{!validWriteOff(writeOff) ? <span className={STYLES.errorText}>Write Off must be negative.</span> : null}</label></div><div className={LAYOUT_STYLES.formGrid3}><div /><div /><div className={LAYOUT_STYLES.fieldGridGap}><span className={STYLES.fieldLabel}>Running balance</span><span className={STYLES.readOnlyValue}>{formatAccountingAmount(entry.balance)}</span></div></div></div>
    <footer className={`${LAYOUT_STYLES.dialogFooter} ${STYLES.dialogFooter}`}><button className={STYLES.secondaryButton} type="button" onClick={onCancel}>Cancel</button><button className={STYLES.primaryButton} disabled={!canSave} type="submit">Save entry</button></footer>
  </form></div>
}
