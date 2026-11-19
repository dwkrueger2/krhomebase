'use client'
// file: apps/web/features/billing/components/InvoicesTab.client.tsx
// Ported from the old app (hb-components/KR-Billing/InvoicesTab.client.tsx). Change: the row Print and Send icons are
// shown disabled until plan stage 5 (documents and email), which ports the print view and the invoice email.
// Billing part 7b (Nov 15, 2026): the row Print is back as in the old tab: a locked, void or new invoice opens the
// print view at once; an unlocked one first asks whether the print goes to the client (`InvoicePrintIntent`, which
// can lock it). Send stays disabled until part 7c (the invoice email).
// Billing part 7c (Nov 16, 2026): the row Send is back as in the old tab: it opens `SendInvoiceDialog` without opening
// the editor (a new, unsaved invoice cannot be sent). New `clientId` prop (from `BillingClientPanel`), which the old tab
// had too; it also gives the print view its send context. After a delivered email the API has already marked the
// invoice sent and locked it, and the dialog's call reloaded the record, so the tab only closes the dialog (the old tab
// called `onSend` to mark it sent).
// Billing part 7f (Nov 16, 2026, `docs/API/Billing_Audit.md` section 5, item 5): `canWrite` (the record's
// `viewer.canWrite`) hides New Invoice, the row Send and the lock button from a billing reader (the lock column shows
// the lock state as a plain icon), opens the editor read only, and prints without the print-intent prompt and without a
// send context (so the print view has no Send and asks for no pay link). The old tab showed them and the API refused.

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import InvoiceEditDialog from './InvoiceEditDialog.client'
import InvoiceLockConfirm, { type InvoiceConfirmMode } from './InvoiceLockConfirm.client'
import InvoicePrintIntent from './InvoicePrintIntent.client'
import SendInvoiceDialog from './SendInvoiceDialog.client'
import { printInvoiceFromBilling } from '../printDocuments.client'
import type { InvoiceRecordAction } from '../api.client'
import BillingTabHeader from './BillingTabHeader.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingInvoice, BillingPayment, BillingTimeEntry } from '../types'
import type { BillingRatesForEntry } from './EditTimeAndFeeDialog.client'

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
  // Part 7f: the lock state for a reader (the utility button's padding, no hover or click).
  lockState: 'p-1 cursor-default',
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

/** Why the row Send icon is disabled for a new invoice. */
const SAVE_BEFORE_SENDING = 'Save the invoice before sending it.'

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
  /** Client account id; enables the row Send action and the editor's email dialog. */
  clientId?: string
  clientNumber: string
  clientDisplayName: string
  invoices: BillingInvoice[]
  payments: readonly BillingPayment[]
  entries: BillingTimeEntry[]
  matterNumbers: readonly string[]
  /** Each matter's title by its number, for the time entry dialog's matter lists. */
  matterTitles?: Readonly<Record<string, string>>
  staffOptions: readonly { id: string; label: string; staffCode?: string | null; defaultRateClassId?: string | null }[]
  /** FB-0008: the rate classes and the signed-in person, for a new time entry's rate. */
  billingRates?: BillingRatesForEntry
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
  /** Part 7f: the person may write billing (`viewer.canWrite`). False hides New Invoice, Send and the lock button. Default true. */
  canWrite?: boolean
}

/** Displays persisted client invoices and opens the production invoice editor. */
export default function InvoicesTab({
  clientId,
  clientDisplayName,
  clientNumber,
  invoices,
  payments,
  entries,
  matterNumbers,
  matterTitles,
  billingRates,
  staffOptions,
  onSave,
  onSaveEntry,
  canUnlock = false,
  onToggleLock,
  onInvoiceAction,
  openInvoiceId,
  onOpenInvoiceConsumed,
  onOpenPayment,
  canWrite = true,
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
  /** Unlocked invoice whose Print was clicked: ask review vs. send before opening the print view. */
  const [printIntent, setPrintIntent] = useState<BillingInvoice | null>(null)
  /** Invoice whose row Send was clicked: the email dialog is open for it. */
  const [sending, setSending] = useState<BillingInvoice | null>(null)
  const canSend = Boolean(clientId) && canWrite
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
  /** Opens the print view for one invoice (no prompt). */
  function openPrintView(invoice: BillingInvoice): void {
    setProblem(
      printInvoiceFromBilling({ invoice, entries, clientNumber, staffOptions, accountInvoices: invoices, send: canSend && clientId ? { clientId, clientDisplayName } : undefined }),
    )
  }
  /** Row-level Send: opens the email dialog without opening the editor. */
  function sendRow(event: MouseEvent, invoice: BillingInvoice): void {
    event.stopPropagation()
    if (!canSend) return
    if (invoice.id.startsWith('new_')) {
      setProblem(SAVE_BEFORE_SENDING)
      return
    }
    setProblem(null)
    setSending(invoice)
  }
  /** Row-level Print: locked invoices open straight away; unlocked ones first ask whether the print goes to the client. */
  function printRow(event: MouseEvent, invoice: BillingInvoice): void {
    event.stopPropagation()
    if (invoice.locked || invoice.status === 'Void' || invoice.id.startsWith('new_') || !onToggleLock || !canWrite) openPrintView(invoice)
    else setPrintIntent(invoice)
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
            canWrite ? (
              <button className={STYLES.primaryButton} type="button" onClick={newInvoice}>
                New Invoice
              </button>
            ) : null
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
                      {/* Part 7f: a reader sees the lock state only, not a button. */}
                      {canWrite ? (
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
                      ) : (
                        <span className={STYLES.lockState} data-kr-element="invoice-row-lock-state" title={invoice.locked ? 'Locked invoice' : 'Unlocked invoice'}>
                          <InvoiceLockIcon locked={invoice.locked} />
                        </span>
                      )}
                    </span>
                    {/* Utility cell: print · send · edit */}
                    <span
                      className={LAYOUT_STYLES.utilityCell}
                      data-kr-element="invoice-utility-cell"
                      onClick={swallow}
                    >
                      <button
                        aria-label={`Print invoice ${invoice.invoiceNumber || 'draft'}`}
                        className={STYLES.utilityButton}
                        data-kr-action="invoice-row-print"
                        title="Print invoice"
                        type="button"
                        onClick={(event) => printRow(event, invoice)}
                      >
                        <KRHomebaseIcons.Print />
                      </button>
                      {canWrite ? (
                        <button
                          aria-label={`Email invoice ${invoice.invoiceNumber || 'draft'}`}
                          className={STYLES.utilityButton}
                          data-kr-action="invoice-row-send"
                          disabled={!canSend || invoice.id.startsWith('new_')}
                          title={!canSend ? 'Sending is unavailable for this account' : invoice.id.startsWith('new_') ? SAVE_BEFORE_SENDING : 'Email invoice to the client'}
                          type="button"
                          onClick={(event) => sendRow(event, invoice)}
                        >
                          <KRHomebaseIcons.Send />
                        </button>
                      ) : null}
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
          matterTitles={matterTitles}
          billingRates={billingRates}
          staffOptions={staffOptions}
          canUnlock={canUnlock}
          onToggleLock={onToggleLock}
          onInvoiceAction={onInvoiceAction}
          accountInvoices={invoices}
          clientId={clientId}
          readOnly={!canWrite}
          onCancel={() => setEditing(null)}
          onOpenPayment={onOpenPayment}
          onSave={async (invoice) => {
            await onSave(invoice)
            setEditing(null)
          }}
          onSaveEntry={onSaveEntry}
        />
      ) : null}
      {/* Email dialog from the row Send: the API marks the invoice sent and locks it; the record reloads. */}
      {sending && clientId ? (
        <SendInvoiceDialog
          accountInvoices={invoices}
          clientDisplayName={clientDisplayName}
          clientId={clientId}
          clientNumber={clientNumber}
          entries={entries}
          invoice={sending}
          staffOptions={staffOptions}
          onCancel={() => setSending(null)}
          onSent={() => setSending(null)}
        />
      ) : null}
      {printIntent && onToggleLock ? (
        <InvoicePrintIntent
          clientDisplayName={clientDisplayName}
          clientNumber={clientNumber}
          invoice={printIntent}
          onCancel={() => setPrintIntent(null)}
          onLockAndPrint={async () => {
            await onToggleLock(printIntent, true)
            setPrintIntent(null)
            openPrintView({ ...printIntent, locked: true })
          }}
          onPreview={() => {
            setPrintIntent(null)
            openPrintView(printIntent)
          }}
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
