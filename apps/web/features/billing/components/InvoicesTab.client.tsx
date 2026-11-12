'use client'
// file: apps/web/features/billing/components/InvoicesTab.client.tsx
// Ported from the old app (hb-components/KR-Billing/InvoicesTab.client.tsx). Change: the row Print and Send icons are
// shown disabled until plan stage 5 (documents and email), which ports the print view and the invoice email.

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import InvoiceEditDialog from './InvoiceEditDialog.client'
import InvoiceLockConfirm, { type InvoiceConfirmMode } from './InvoiceLockConfirm.client'
import type { InvoiceRecordAction } from '../api.client'
import BillingTabHeader from './BillingTabHeader.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingInvoice, BillingPayment, BillingTimeEntry } from '../types'

const STYLES = {
  shell: 'text-[10pt] leading-tight text-[var(--kr-theme-text,#243142)]',
  panel: 'overflow-hidden border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) shadow-sm',
  // Ledger row typography matches TimeAndFeesLedger (10pt, tight) so every Billing tab reads the same.
  row: 'border-b border-[var(--kr-theme-table-border,#d7dee5)] bg-[var(--kr-theme-table-row-background,#eaf4e7)] text-left text-[10pt] leading-tight hover:bg-[var(--kr-theme-table-row-hover,#f0f6fb)]',
  header:
    'bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[9pt] font-semibold uppercase text-[var(--kr-theme-text-muted,#526172)]',
  cell: 'p-[1px] text-[10pt] leading-tight',
  status: 'px-1.5 py-0.5 inline-flex rounded-full border text-[9pt] leading-none',
  button:
    'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] font-semibold',
  // Small white toggle beside the matter selector.
  filterToggle:
    'px-1.5 py-0.5 rounded-[2px] border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)] hover:border-[var(--kr-theme-brand-primary,#21394f)] hover:text-[var(--kr-theme-brand-primary,#21394f)]',
  primaryButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white',
  // Row utility buttons: icon-only, inherit the row hover, disabled state reads as informational.
  utilityButton:
    'p-1 rounded text-[var(--kr-theme-text-muted,#526172)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] hover:text-[var(--kr-theme-brand-primary,#21394f)] disabled:cursor-help disabled:opacity-40 disabled:hover:bg-transparent',
  problem: 'px-2 py-1 border border-red-300 bg-red-50 text-[9pt] text-red-800',
} as const
// Columns: Number, Matter, Date, Due, Amount, Status, Lock, then the unlabeled utility column (print · send · edit).
const LAYOUT_STYLES = {
  // min-w-0: the tab never grows past the working area (the 820px table scrolls inside its viewport instead of
  // widening the card, which pushed it left under the left panel).
  shell: 'min-w-0 w-full',
  panel: 'min-w-0',
  header: 'px-2 py-1 flex items-center justify-between gap-2',
  tableViewport: 'overflow-x-auto',
  table: 'min-w-[820px]',
  grid: 'grid grid-cols-[1fr_1fr_1.15fr_1.15fr_1.35fr_1.25fr_0.7fr_84px] items-center',
  rowGrid:
    'w-full grid grid-cols-[1fr_1fr_1.15fr_1.15fr_1.35fr_1.25fr_0.7fr_84px] items-center cursor-pointer',
  cellCenter: 'p-[1px] text-center',
  cellAmount: 'p-[1px] text-right',
  lockCell: 'p-[1px] flex items-center justify-center cursor-default',
  utilityCell: 'p-[1px] gap-0.5 flex items-center justify-center',
} as const
const STATUS_CLASSES: Record<BillingInvoice['status'], string> = {
  Paid: 'border-[#9cb7a2] bg-[#e6f1e8] text-[#31563a]',
  Unpaid: 'border-[#d7bd69] bg-[#fff7cf] text-[#6f5a12]',
  'Partially paid': 'border-[#b99972] bg-[#f2e9de] text-[#6f5438]',
  Void: 'border-[#c7c2bb] bg-[#eeebe6] text-[#6b665f] line-through',
}

/** Why the row Print and Send icons are disabled. */
const DOCUMENTS_LATER = 'Printing and emailing invoices arrive in plan stage 5 (documents and email).'

function displayDate(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return [date.getMonth() + 1, date.getDate(), date.getFullYear()]
    .map((part, index) => (index === 2 ? String(part) : String(part).padStart(2, '0')))
    .join('/')
}

function InvoiceLockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 ${locked ? 'text-red-700' : 'text-emerald-700'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d={
          locked
            ? 'M7 10V8a5 5 0 0 1 10 0v2M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Z'
            : 'M7 10V8a5 5 0 0 1 9.5-2M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Z'
        }
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export interface InvoicesTabProps {
  clientNumber: string
  clientDisplayName: string
  invoices: BillingInvoice[]
  payments: readonly BillingPayment[]
  entries: BillingTimeEntry[]
  matterNumbers: readonly string[]
  staffOptions: readonly { id: string; label: string; staffCode?: string | null }[]
  onSave: (invoice: BillingInvoice) => Promise<void>
  onSaveEntry: (entry: BillingTimeEntry) => Promise<void>
  /** True for super admins: the lock icon can unlock a sent invoice. Locking never needs a role. */
  canUnlock?: boolean
  /** Locks (`lock=true`) or unlocks an invoice. */
  onToggleLock?: (invoice: BillingInvoice, lock: boolean) => Promise<void>
  /** Super-admin record actions: void, detachPayments (also lock/unlock). */
  onInvoiceAction?: (
    invoice: BillingInvoice,
    action: InvoiceRecordAction,
    reason?: string,
  ) => Promise<void>
  /** Invoice to open in the editor as soon as it is available (from another tab's link); acknowledged via onOpenInvoiceConsumed. */
  openInvoiceId?: string | null
  onOpenInvoiceConsumed?: () => void
  /** Opens a payment receipt after switching to the Payments tab. */
  onOpenPayment: (paymentId: string) => void
}

/** Displays persisted client invoices and opens the production invoice editor. */
export default function InvoicesTab({
  clientDisplayName,
  clientNumber,
  invoices,
  payments,
  entries,
  matterNumbers,
  staffOptions,
  onSave,
  onSaveEntry,
  canUnlock = false,
  onToggleLock,
  onInvoiceAction,
  openInvoiceId,
  onOpenInvoiceConsumed,
  onOpenPayment,
}: InvoicesTabProps) {
  const [editing, setEditing] = useState<BillingInvoice | null>(null)
  const [lockPrompt, setLockPrompt] = useState<{
    invoice: BillingInvoice
    mode: InvoiceConfirmMode
  } | null>(null)
  const [selectedMatter, setSelectedMatter] = useState('ALL')
  const [problem, setProblem] = useState<string | null>(null)
  /** Voided invoices stay on file but are hidden from the ledger by default. */
  const [showVoided, setShowVoided] = useState(false)
  // Open the editor for an invoice requested from elsewhere (the time & fee dialog's invoice link).
  useEffect(() => {
    if (!openInvoiceId) return
    const target = invoices.find((invoice) => invoice.id === openInvoiceId)
    if (target) setEditing(target)
    onOpenInvoiceConsumed?.()
  }, [openInvoiceId, invoices, onOpenInvoiceConsumed])
  const voidedCount = invoices.filter((invoice) => invoice.status === 'Void').length
  const visibleInvoices = invoices.filter(
    (invoice) => (selectedMatter === 'ALL' || invoice.matterNumber === selectedMatter) && (showVoided || invoice.status !== 'Void'),
  )
  const visibleEntries = entries.filter(
    (entry) => selectedMatter === 'ALL' || entry.matterNumber === selectedMatter,
  )
  /** Row lock icon: locked → unlock prompt (super admin only); unlocked → lock prompt. */
  function lockRow(event: MouseEvent, invoice: BillingInvoice): void {
    event.stopPropagation()
    if (!onToggleLock || invoice.id.startsWith('new_')) return
    if (invoice.status === 'Void') {
      setProblem('A voided invoice cannot be locked or unlocked.')
      return
    }
    if (invoice.locked && !canUnlock) {
      setProblem('Only a Super Admin can unlock a sent invoice.')
      return
    }
    setProblem(null)
    // Payments attached: the first step is to detach them; unlock is offered after that.
    const hasPayments = invoice.status === 'Paid' || invoice.status === 'Partially paid'
    setLockPrompt({
      invoice,
      mode: invoice.locked ? (hasPayments ? 'detachPayments' : 'unlock') : 'lock',
    })
  }
  /** Keeps clicks on the lock and utility cells from opening the editor. */
  function swallow(event: MouseEvent): void {
    event.stopPropagation()
  }
  /** Keyboard access for the row-as-button: Enter or Space opens the editor. */
  function rowKey(event: KeyboardEvent<HTMLDivElement>, invoice: BillingInvoice): void {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setEditing(invoice)
    }
  }
  function newInvoice(): void {
    const matterNumber = selectedMatter === 'ALL' ? (matterNumbers[0] ?? '') : selectedMatter
    setEditing({
      id: `new_${Date.now()}`,
      matterId: '',
      matterNumber,
      invoiceNumber: '',
      dateInvoiced: displayDate(),
      dueDate: displayDate(30),
      clientLabel: clientDisplayName,
      amountDue: 0,
      writeOff: 0,
      locked: false,
      status: 'Unpaid',
      entryIds: [],
    })
  }
  return (
    <section
      className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`}
      data-kr-id="invoices-tab-ledger-panel"
    >
      <div className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`}>
        <BillingTabHeader
          actions={
            <button className={STYLES.primaryButton} type="button" onClick={newInvoice}>
              New Invoice
            </button>
          }
          clientDisplayName={clientDisplayName}
          clientNumber={clientNumber}
          filters={
            <button
              className={STYLES.filterToggle}
              data-kr-action="invoices-toggle-voided"
              title={voidedCount ? `${voidedCount} voided invoice${voidedCount === 1 ? '' : 's'} on file` : 'No voided invoices on file'}
              type="button"
              onClick={() => setShowVoided((current) => !current)}
            >
              {showVoided ? 'Hide Voided Invoices' : 'Show Voided Invoices'}
            </button>
          }
          matterNumbers={matterNumbers}
          onMatterChange={setSelectedMatter}
          selectedMatter={selectedMatter}
        />
        <div className={LAYOUT_STYLES.tableViewport}>
          <div className={LAYOUT_STYLES.table}>
            <div className={`${LAYOUT_STYLES.grid} ${STYLES.header}`}>
              <span className={LAYOUT_STYLES.cellCenter}>Number</span>
              <span className={LAYOUT_STYLES.cellCenter}>Matter</span>
              <span className={LAYOUT_STYLES.cellCenter}>Date</span>
              <span className={LAYOUT_STYLES.cellCenter}>Due</span>
              <span className={LAYOUT_STYLES.cellAmount}>Amount</span>
              <span className={LAYOUT_STYLES.cellCenter}>Status</span>
              <span className={LAYOUT_STYLES.cellCenter}>Lock</span>
              <span className={LAYOUT_STYLES.cellCenter} aria-label="Row actions" />
            </div>
            {problem ? (
              <p className={STYLES.problem} role="alert">
                {problem}
              </p>
            ) : null}
            <div data-kr-element="invoice-rows-ledger">
              {visibleInvoices.length ? (
                visibleInvoices.map((invoice) => (
                  /* Invoice row: the data cells open the editor; the Lock and utility cells own their own clicks. */
                  <div
                    className={`${LAYOUT_STYLES.rowGrid} ${STYLES.row}`}
                    data-kr-element="invoice-row"
                    data-kr-invoice-id={invoice.id}
                    key={invoice.id}
                    role="button"
                    tabIndex={0}
                    title="Click to edit this invoice"
                    onClick={() => setEditing(invoice)}
                    onKeyDown={(event) => rowKey(event, invoice)}
                  >
                    <span className={`${LAYOUT_STYLES.cellCenter} font-semibold`}>
                      #{invoice.invoiceNumber || 'Draft'}
                    </span>
                    <span className={LAYOUT_STYLES.cellCenter}>{invoice.matterNumber}</span>
                    <span className={LAYOUT_STYLES.cellCenter}>{invoice.dateInvoiced}</span>
                    <span className={LAYOUT_STYLES.cellCenter}>{invoice.dueDate || '—'}</span>
                    <span className={`${LAYOUT_STYLES.cellAmount} font-semibold tabular-nums`}>
                      {formatAccountingAmount(invoice.amountDue)}
                    </span>
                    <span className={LAYOUT_STYLES.cellCenter}>
                      <span className={`${STYLES.status} ${STATUS_CLASSES[invoice.status]}`}>
                        {invoice.status}
                      </span>
                    </span>
                    <span
                      className={LAYOUT_STYLES.lockCell}
                      data-kr-element="invoice-lock-cell"
                      onClick={swallow}
                    >
                      <button
                        aria-label={invoice.locked ? 'Unlock invoice' : 'Lock invoice'}
                        className={STYLES.utilityButton}
                        data-kr-action="invoice-row-lock"
                        title={
                          invoice.locked
                            ? canUnlock
                              ? 'Locked — click to unlock (Super Admin)'
                              : 'Locked invoice'
                            : 'Unlocked — click to lock'
                        }
                        type="button"
                        onClick={(event) => lockRow(event, invoice)}
                      >
                        <InvoiceLockIcon locked={invoice.locked} />
                      </button>
                    </span>
                    {/* Utility cell: print · send (plan stage 5) · edit */}
                    <span
                      className={LAYOUT_STYLES.utilityCell}
                      data-kr-element="invoice-utility-cell"
                      onClick={swallow}
                    >
                      <button
                        aria-label={`Print invoice ${invoice.invoiceNumber || 'draft'}`}
                        className={STYLES.utilityButton}
                        data-kr-action="invoice-row-print"
                        disabled
                        title={DOCUMENTS_LATER}
                        type="button"
                      >
                        <KRHomebaseIcons.Print />
                      </button>
                      <button
                        aria-label={`Email invoice ${invoice.invoiceNumber || 'draft'}`}
                        className={STYLES.utilityButton}
                        data-kr-action="invoice-row-send"
                        disabled
                        title={DOCUMENTS_LATER}
                        type="button"
                      >
                        <KRHomebaseIcons.Send />
                      </button>
                      <button
                        aria-label={`Edit invoice ${invoice.invoiceNumber || 'draft'}`}
                        className={STYLES.utilityButton}
                        data-kr-action="invoice-row-edit"
                        title="Edit invoice"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setEditing(invoice)
                        }}
                      >
                        <KRHomebaseIcons.Pencil />
                      </button>
                    </span>
                  </div>
                ))
              ) : (
                <div
                  className={`${LAYOUT_STYLES.rowGrid} ${STYLES.row} text-[var(--kr-theme-text-muted,#526172)]`}
                  data-kr-element="empty-billing-row"
                >
                  <span className={LAYOUT_STYLES.cellCenter}>March 23, 2026</span>
                  <span className={LAYOUT_STYLES.cellCenter}>
                    {selectedMatter === 'ALL' ? '' : selectedMatter}
                  </span>
                  <span className={`${STYLES.cell} col-span-5`}>Sample Row - No Entries Found · $0</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {editing ? (
        <InvoiceEditDialog
          allEntries={visibleEntries.filter(
            (entry) => !entry.invoiceId || editing.entryIds.includes(entry.id),
          )}
          payments={payments}
          clientDisplayName={clientDisplayName}
          clientNumber={clientNumber}
          invoice={editing}
          matterNumbers={matterNumbers}
          staffOptions={staffOptions}
          canUnlock={canUnlock}
          onToggleLock={onToggleLock}
          onInvoiceAction={onInvoiceAction}
          onCancel={() => setEditing(null)}
          onOpenPayment={onOpenPayment}
          onSave={async (invoice) => {
            await onSave(invoice)
            setEditing(null)
          }}
          onSaveEntry={onSaveEntry}
        />
      ) : null}
      {lockPrompt && onToggleLock ? (
        <InvoiceLockConfirm
          clientDisplayName={clientDisplayName}
          clientNumber={clientNumber}
          invoice={lockPrompt.invoice}
          mode={lockPrompt.mode}
          onCancel={() => setLockPrompt(null)}
          onConfirm={async () => {
            if (lockPrompt.mode === 'lock' || lockPrompt.mode === 'unlock')
              await onToggleLock(lockPrompt.invoice, lockPrompt.mode === 'lock')
            else if (onInvoiceAction) await onInvoiceAction(lockPrompt.invoice, lockPrompt.mode)
            setLockPrompt(null)
          }}
        />
      ) : null}
    </section>
  )
}
