'use client'
// file: apps/web/features/billing/components/InvoiceEditDialog.client.tsx
// Ported from the old app (hb-components/KR-Billing/InvoiceEditDialog.client.tsx). Changes:
//  - Print and Send are shown disabled until plan stage 5 (documents and email).
//  - Status is shown, not chosen: the old select saved "Paid" or "Partially paid" on a draft without a payment. A
//    status now changes only through a payment, a void, or the lock.
//  - The four dashed layout-check borders (b1 to b4) were removed.

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import EditTimeAndFeeDialog from './EditTimeAndFeeDialog.client'
import AddOpenTimeFeesDialog from './AddOpenTimeFeesDialog.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import InvoiceLockConfirm, { type InvoiceConfirmMode } from './InvoiceLockConfirm.client'
import U6CurrencyInput from '@/components/ui/U6CurrencyInput.client'
import type { InvoiceRecordAction } from '../api.client'
import type { BillingInvoice, BillingPayment, BillingTimeEntry } from '../types'

const STYLES = {
  backdrop: 'bg-slate-950/40',
  dialog:
    'flex max-h-[calc(100vh-1.5rem)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) shadow-2xl',
  field:
    'px-1.5 py-1 w-full rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[9pt]',
  label: 'gap-1 grid text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  mutedBox:
    'p-2 rounded border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  button:
    'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[9pt] font-semibold',
  primaryButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  // Orange call-to-action so the entry-adding button is easy to find; dark lettering per Dan.
  accentButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-orange,var(--kr-orange,#e45e25))] bg-[var(--kr-theme-orange,var(--kr-orange,#e45e25))] text-[9pt] font-semibold text-[var(--kr-theme-text-strong,#17212b)] hover:bg-[var(--kr-orange-dark,#b94a1e)] disabled:cursor-not-allowed disabled:opacity-50',
  headerTitle: 'text-[12pt] font-bold text-[var(--kr-theme-text,#243142)]',
  headerClient: 'text-[12pt] font-bold text-[var(--kr-theme-text,#243142)]',
  entryHeader:
    'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[9pt] font-semibold',
  entryRow:
    'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-table-row-background,#eaf4e7)] text-[9pt]',
  cell: 'p-[1px] leading-tight',
  trashButton: 'p-[1px] text-[12pt] text-red-700 disabled:opacity-40',
  lockStatus: 'gap-1 flex items-center text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  lockButton:
    'gap-1 inline-flex items-center rounded px-1 hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] disabled:cursor-default disabled:hover:bg-transparent',
  // Wastebasket beside the lock: void the invoice (Super Admin); greyed while locked/void/unsaved.
  deleteButton:
    'inline-flex items-center rounded p-1 text-[var(--kr-theme-text-muted,#526172)] hover:bg-red-50 hover:text-red-700 disabled:cursor-help disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--kr-theme-text-muted,#526172)]',
  deleteIcon: 'h-4 w-4',
  deliveryMessage: 'mt-1 text-[9pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)]',
  sectionTitle: 'text-[11pt] font-bold',
  summaryHeading: 'text-[10pt] font-bold',
  summaryLabel:
    'text-[9pt] font-bold uppercase tracking-[0.08em] text-[var(--kr-theme-text-muted,#526172)]',
  summaryTotal: 'mt-1 text-[16pt] leading-none text-[var(--kr-theme-text,#243142)]',
  statusError: 'px-2 py-1 border border-red-300 bg-red-50 text-[9pt] text-red-800',
  actionText: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  // Public record code: muted monospace, never competes with the surrounding text.
  publicCode:
    'font-mono text-[8.5pt] tracking-[0.04em] text-[var(--kr-theme-text-muted,#526172)] opacity-80',
  closeButton: 'text-[14pt] leading-none',
} as const

/** Why Print and Send are disabled. */
const DOCUMENTS_LATER = 'Printing and emailing invoices arrive in plan stage 5 (documents and email).'

const LAYOUT_STYLES = {
  // Centered over the working area (right of the left panel, below the title bar), not the whole viewport.
  backdrop: 'p-3 fixed right-0 bottom-0 left-[var(--kr-shell-work-left,0px)] top-[var(--kr-shell-work-top,0px)] z-50 flex items-center justify-center overflow-y-auto',
  header:
    'px-2 py-1 flex shrink-0 items-start justify-between gap-2 border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] cursor-grab active:cursor-grabbing select-none',
  headerActions: 'gap-1 flex shrink-0',
  headerIdentity: 'min-w-0',
  clientIdentity: 'gap-1 flex items-center',
  headerGrid: 'p-2 gap-2 grid shrink-0 sm:grid-cols-4',
  middle: 'px-2 pb-2 gap-2 grid min-h-0 flex-1 overflow-y-auto',
  middleToolbar: 'gap-2 flex items-center justify-between',
  entryRows: 'max-h-[30vh] overflow-y-auto rounded border border-[var(--kr-theme-line,#d7dee5)]',
  entryGrid: 'grid grid-cols-[34px_94px_minmax(250px,1fr)_100px_110px] items-center',
  cellRight: 'p-[1px] text-right',
  summary:
    'px-2 py-2 gap-2 grid shrink-0 border-t border-[var(--kr-theme-line,#d7dee5)] sm:grid-cols-3',
  summaryProvider: 'max-h-24 overflow-y-auto',
  summaryProviderRow: 'gap-2 flex justify-between text-[9pt]',
  summaryTotal: 'flex min-h-[76px] flex-col justify-center',
  footer:
    'px-2 py-2 flex shrink-0 items-center justify-between gap-2 border-t border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  footerActions: 'gap-1 flex',
} as const

export interface InvoiceEditDialogProps {
  allEntries: BillingTimeEntry[]
  payments: readonly BillingPayment[]
  clientNumber: string
  clientDisplayName?: string
  invoice: BillingInvoice
  matterNumbers: readonly string[]
  staffOptions: readonly { id: string; label: string; staffCode?: string | null }[]
  onCancel: () => void
  /** Closes the editor and opens the selected receipt on the Payments tab. */
  onOpenPayment: (paymentId: string) => void
  onSave: (invoice: BillingInvoice) => Promise<void>
  onSaveEntry: (entry: BillingTimeEntry) => Promise<void>
  /** True for super admins: the header lock icon can unlock a sent invoice. */
  canUnlock?: boolean
  /** Locks (`lock=true`) or unlocks this invoice. */
  onToggleLock?: (invoice: BillingInvoice, lock: boolean) => Promise<void>
  /** Super-admin record actions: void, detachPayments. */
  onInvoiceAction?: (invoice: BillingInvoice, action: InvoiceRecordAction, reason?: string) => Promise<void>
}

/** Shows whether the current invoice can be changed, with the accessible reason on its parent. */
function InvoiceStatusIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={locked ? 'h-4 w-4 text-red-700' : 'h-4 w-4 text-emerald-700'}
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

/** Production invoice editor; line attachment and invoice updates are persisted by the parent panel. */
export default function InvoiceEditDialog({
  allEntries,
  payments,
  clientNumber,
  clientDisplayName,
  invoice,
  matterNumbers,
  staffOptions,
  onCancel,
  onOpenPayment,
  onSave,
  onSaveEntry,
  canUnlock = false,
  onToggleLock,
  onInvoiceAction,
}: InvoiceEditDialogProps) {
  const [draft, setDraft] = useState(invoice)
  const [entries, setEntries] = useState(() =>
    allEntries.filter((entry) => invoice.entryIds.includes(entry.id)),
  )
  const [expanded, setExpanded] = useState(false)
  const [openTimeFees, setOpenTimeFees] = useState(false)
  const [editingEntry, setEditingEntry] = useState<BillingTimeEntry | null>(null)
  // Write-off is held as a positive dollar amount for the currency input; it is saved as a negative adjustment.
  const [writeOff, setWriteOff] = useState(Math.abs(invoice.writeOff || 0))
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockPrompt, setLockPrompt] = useState<InvoiceConfirmMode | null>(null)
  const [dialogOffset, setDialogOffset] = useState({ x: 0, y: 0 })
  const dialogRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{
    pointerX: number
    pointerY: number
    offsetX: number
    offsetY: number
    bounds: DOMRect
    dialog: DOMRect
  } | null>(null)
  const invoicePayments = useMemo(
    () => payments.filter((payment) => payment.invoiceId === draft.id && !payment.voided),
    [draft.id, payments],
  )
  function startDialogDrag(event: PointerEvent<HTMLElement>): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const dialog = dialogRef.current
    const bounds = dialog?.parentElement?.getBoundingClientRect()
    const dialogBounds = dialog?.getBoundingClientRect()
    if (!bounds || !dialogBounds) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: dialogOffset.x,
      offsetY: dialogOffset.y,
      bounds,
      dialog: dialogBounds,
    }
  }
  function moveDialog(event: PointerEvent<HTMLElement>): void {
    const drag = dragRef.current
    if (!drag) return
    const deltaX = event.clientX - drag.pointerX
    const deltaY = event.clientY - drag.pointerY
    const boundedDeltaX = Math.max(
      drag.bounds.left - drag.dialog.left,
      Math.min(drag.bounds.right - drag.dialog.right, deltaX),
    )
    const boundedDeltaY = Math.max(
      drag.bounds.top - drag.dialog.top,
      Math.min(drag.bounds.bottom - drag.dialog.bottom, deltaY),
    )
    setDialogOffset({ x: drag.offsetX + boundedDeltaX, y: drag.offsetY + boundedDeltaY })
  }
  function stopDialogDrag(): void {
    dragRef.current = null
  }
  const availableEntries = useMemo(
    () =>
      allEntries.filter(
        (entry) =>
          entry.matterNumber === draft.matterNumber &&
          !entries.some((attached) => attached.id === entry.id) &&
          !entry.invoiceId,
      ),
    [allEntries, draft.matterNumber, entries],
  )
  const providerSummaries = useMemo(() => {
    const grouped = new Map<
      string,
      { staff: string; amount: number; hours: number; hasFees: boolean; hasTime: boolean }
    >()
    entries.forEach((entry) => {
      const staff = staffOptions.find((option) => option.id === entry.staffId)?.label ?? entry.staff
      const groupKey = entry.staffId || staff
      const current = grouped.get(groupKey) ?? {
        staff,
        amount: 0,
        hours: 0,
        hasFees: false,
        hasTime: false,
      }
      grouped.set(groupKey, {
        staff,
        amount: current.amount + entry.amount,
        hours: current.hours + (entry.kind === 'Time' ? entry.hours : 0),
        hasFees: current.hasFees || entry.kind === 'Flat Fee Service',
        hasTime: current.hasTime || entry.kind === 'Time',
      })
    })
    return Array.from(grouped.values())
  }, [entries, staffOptions])
  const entriesTotal = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const totalDue = Math.max(0, entriesTotal - Math.abs(writeOff || 0))
  const hasPayments = draft.status === 'Paid' || draft.status === 'Partially paid'
  const isVoid = draft.status === 'Void'
  const locked = draft.locked
  const isNew = draft.id.startsWith('new_')
  // Why the invoice is locked; the API sends the reason, this is the fallback for older payloads.
  const lockReason =
    draft.lockedReason ??
    (draft.status === 'Paid' || draft.status === 'Partially paid'
      ? 'Locked · payments attached (detach them before unlocking)'
      : 'Locked · sent to client')

  function attach(ids: string[]): void {
    setEntries((current) => [
      ...current,
      ...allEntries.filter(
        (entry) => ids.includes(entry.id) && entry.matterNumber === draft.matterNumber,
      ),
    ])
    setOpenTimeFees(false)
  }

  function returnToTimeFees(id: string): void {
    if (!locked) setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  async function saveInvoice(): Promise<void> {
    // An existing invoice with every entry removed has nothing to bill: offer to void it instead of saving an empty record.
    if (!isNew && entries.length === 0) {
      if (canUnlock && onInvoiceAction) {
        setLockPrompt('void')
      } else {
        setSaveError('This invoice has no time or fee entries. Attach at least one entry, or ask a Super Admin to void the invoice.')
      }
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      await onSave({
        ...draft,
        writeOff: -Math.abs(writeOff || 0),
        amountDue: totalDue,
        entryIds: entries.map((entry) => entry.id),
      })
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'The invoice could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-element="invoice-edit-backdrop"
    >
      <section
        aria-label={`${isNew ? 'Create' : 'Edit'} Invoice ${draft.invoiceNumber || 'Draft'}`}
        className={STYLES.dialog}
        data-kr-id="invoice-edit-dialog"
        ref={dialogRef}
        style={{ transform: `translate(${dialogOffset.x}px, ${dialogOffset.y}px)` }}
      >
        {/* Invoice editor header: identity, lock state, and delivery affordance. */}
        <header
          className={LAYOUT_STYLES.header}
          data-kr-element="invoice-dialog-drag-handle"
          onPointerDown={startDialogDrag}
          onPointerMove={moveDialog}
          onPointerUp={stopDialogDrag}
          onPointerCancel={stopDialogDrag}
          title="Drag this header to move the invoice dialog"
        >
          <div className={LAYOUT_STYLES.headerIdentity}>
            <h2 className={STYLES.headerTitle}>
              {isNew ? 'Create Invoice' : `Edit Invoice #${draft.invoiceNumber}`}
            </h2>
            <div className={LAYOUT_STYLES.clientIdentity}>
              <span className={STYLES.headerClient}>
                [{clientNumber}] {draft.clientLabel}
              </span>
              {/* Lock icon: click to lock (any role) or unlock (super admin); paid invoices stay locked. */}
              <button
                className={`${STYLES.lockStatus} ${STYLES.lockButton}`}
                data-kr-action="invoice-toggle-lock"
                disabled={!onToggleLock || isNew || busy || isVoid || (locked && !canUnlock)}
                title={
                  isVoid
                    ? 'Voided invoice'
                    : locked
                      ? canUnlock
                        ? hasPayments
                          ? 'Payments attached — click to detach them, then unlock (Super Admin)'
                          : `${lockReason} — click to unlock (Super Admin)`
                        : `${lockReason} — a Super Admin can unlock it`
                      : 'Unlocked — click to lock'
                }
                type="button"
                onClick={() =>
                  setLockPrompt(locked ? (hasPayments ? 'detachPayments' : 'unlock') : 'lock')
                }
              >
                <InvoiceStatusIcon locked={locked} />
                {locked ? <span>{lockReason}</span> : null}
              </button>
              {/* Delete (void): same flow as saving with no entries — Super Admin confirms; entries return to the open list. */}
              <button
                aria-label="Delete (void) this invoice"
                className={STYLES.deleteButton}
                data-kr-action="invoice-delete"
                disabled={isNew || busy || isVoid || locked || !canUnlock || !onInvoiceAction}
                title={
                  isVoid
                    ? 'Already voided'
                    : isNew
                      ? 'Save the invoice first'
                      : locked
                        ? 'Unlock the invoice before deleting it'
                        : !canUnlock || !onInvoiceAction
                          ? 'Only a Super Admin can delete (void) an invoice'
                          : 'Delete (void) this invoice — its time and fee entries return to the open list'
                }
                type="button"
                onClick={() => setLockPrompt('void')}
              >
                <KRHomebaseIcons.Trash className={STYLES.deleteIcon} />
              </button>
            </div>
            {saveError ? (
              <p className={STYLES.statusError} role="alert">
                {saveError}
              </p>
            ) : null}
            {deliveryMessage ? <p className={STYLES.deliveryMessage}>{deliveryMessage}</p> : null}
          </div>
          <div className={LAYOUT_STYLES.headerActions}>
            <button className={STYLES.button} data-kr-action="invoice-print" disabled title={DOCUMENTS_LATER} type="button">
              Print
            </button>
            <button className={STYLES.button} data-kr-action="invoice-send" disabled title={DOCUMENTS_LATER} type="button">
              Send
            </button>
            <button
              aria-label="Close"
              className={STYLES.closeButton}
              type="button"
              onClick={onCancel}
            >
              ×
            </button>
          </div>
        </header>

        {/* Invoice details row: only editable or calculated invoice metadata remains in the grid. */}
        <div className={LAYOUT_STYLES.headerGrid} data-kr-element="invoice-details-row">
          <label className={STYLES.label}>
            Invoice date
            <input
              className={STYLES.field}
              disabled={locked}
              value={draft.dateInvoiced}
              onChange={(event) => setDraft({ ...draft, dateInvoiced: event.target.value })}
            />
          </label>
          <label className={STYLES.label}>
            Amount due
            <input className={STYLES.field} readOnly value={formatAccountingAmount(totalDue)} />
          </label>
          <label className={STYLES.label}>
            Days past due
            <input
              className={STYLES.field}
              readOnly
              value={
                draft.dueDate
                  ? String(
                      Math.max(
                        0,
                        Math.floor((Date.now() - new Date(draft.dueDate).getTime()) / 86400000),
                      ),
                    )
                  : '0'
              }
            />
          </label>
          <label className={STYLES.label}>
            Status
            <input className={STYLES.field} data-kr-element="invoice-status" readOnly value={draft.status} />
          </label>
        </div>

        {/* Invoice entries: attach open work, expand notes, or return a line to Time & Fees. */}
        <div className={LAYOUT_STYLES.middle}>
          <div className={LAYOUT_STYLES.middleToolbar}>
            <h3 className={STYLES.sectionTitle}>Time &amp; Fee entries on invoice</h3>
            <div className={LAYOUT_STYLES.headerActions}>
              <button
                className={STYLES.accentButton}
                data-kr-element="invoice-add-open-time-fees"
                disabled={locked || !availableEntries.length}
                title={
                  locked
                    ? lockReason
                    : availableEntries.length
                      ? 'Attach unbilled time and fee entries to this invoice'
                      : 'No open entries to add'
                }
                type="button"
                onClick={() => setOpenTimeFees(true)}
              >
                Add Open Time &amp; Fees
              </button>
              <button
                className={STYLES.button}
                type="button"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? 'Collapse rows' : 'Expand rows'}
              </button>
            </div>
          </div>
          <div className={LAYOUT_STYLES.entryRows}>
            <div className={`${LAYOUT_STYLES.entryGrid} ${STYLES.entryHeader}`}>
              <span />
              <span className={STYLES.cell}>Date</span>
              <span className={STYLES.cell}>Billing note</span>
              <span className={LAYOUT_STYLES.cellRight}>Time</span>
              <span className={LAYOUT_STYLES.cellRight}>Amount</span>
            </div>
            {entries.map((entry) => (
              <div
                className={`${LAYOUT_STYLES.entryGrid} ${STYLES.entryRow}`}
                key={entry.id}
                onDoubleClick={() => {
                  if (!locked) setEditingEntry(entry)
                }}
                title={entry.description}
              >
                <button
                  aria-label={`Return ${entry.id} to Time & Fees`}
                  className={STYLES.trashButton}
                  disabled={locked}
                  type="button"
                  onClick={() => returnToTimeFees(entry.id)}
                >
                  🗑️
                </button>
                <span className={STYLES.cell}>{entry.date}</span>
                <span
                  className={`${STYLES.cell} ${expanded ? 'whitespace-pre-line break-words' : 'truncate'}`}
                >
                  {entry.description}
                </span>
                <span className={`${LAYOUT_STYLES.cellRight} tabular-nums`}>
                  {entry.hours.toFixed(1)} h
                </span>
                <span className={`${LAYOUT_STYLES.cellRight} font-semibold tabular-nums`}>
                  {formatAccountingAmount(entry.amount)}
                </span>
              </div>
            ))}
            <div className="min-h-1.5"></div>
            <div className={`${LAYOUT_STYLES.entryGrid} ${STYLES.entryHeader}`}>
              <span />
              <span className={STYLES.cell}>Date</span>
              <span className={STYLES.cell}>Payments Made</span>
              <span className={LAYOUT_STYLES.cellRight}></span>
              <span className={LAYOUT_STYLES.cellRight}>Amount</span>
            </div>
            {invoicePayments.map((payment) => (
              <div
                className={`${LAYOUT_STYLES.entryGrid} ${STYLES.entryRow}`}
                data-kr-element="invoice-payment-row"
                data-kr-payment-id={payment.id}
                key={payment.id}
                title={payment.invoiceIvid ? `Applied to invoice #${payment.invoiceIvid}` : undefined}
              >
                <button
                  aria-label={`View payment ${payment.paymentNumber} in Payments`}
                  className={STYLES.trashButton}
                  data-kr-action="invoice-view-payment"
                  title="Open this receipt in the Payments tab"
                  type="button"
                  onClick={() => {
                    onCancel()
                    onOpenPayment(payment.id)
                  }}
                >
                  <KRHomebaseIcons.Preview />
                </button>
                <span className={STYLES.cell}>{payment.receivedDate}</span>
                <span className={`${STYLES.cell} truncate`}>
                  {payment.paymentNumber}{payment.paymentType ? ` · ${payment.paymentType}` : ''}
                </span>
                <span className={LAYOUT_STYLES.cellRight}></span>
                <span className={`${LAYOUT_STYLES.cellRight} font-semibold tabular-nums`}>
                  {formatAccountingAmount(payment.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Invoice summary: provider totals, invoice total, and draft write-off. */}
        <div className={LAYOUT_STYLES.summary}>
          <div className={`${STYLES.mutedBox} ${LAYOUT_STYLES.summaryProvider}`}>
            <h3 className={STYLES.summaryHeading}>Provider time and fees</h3>
            {providerSummaries.length ? (
              providerSummaries.map((provider) => (
                <div className={LAYOUT_STYLES.summaryProviderRow} key={provider.staff}>
                  <span>
                    {provider.staff} -{' '}
                    {provider.hasTime ? `Time (${provider.hours.toFixed(1)} hr)` : ''}
                    {provider.hasTime && provider.hasFees ? ' & ' : ''}
                    {provider.hasFees ? 'Fees' : ''}
                  </span>
                  <span>{formatAccountingAmount(provider.amount)}</span>
                </div>
              ))
            ) : (
              <p className={STYLES.actionText}>No entries attached.</p>
            )}
          </div>
          <div
            className={`${STYLES.mutedBox} ${LAYOUT_STYLES.summaryTotal}`}
            data-kr-element="invoice-total-summary"
          >
            <span className={STYLES.summaryLabel}>Invoice Total</span>
            <strong className={STYLES.summaryTotal}>{formatAccountingAmount(totalDue)}</strong>
          </div>
          <label className={STYLES.label}>
            Write Off
            <U6CurrencyInput
              aria-label="Write Off"
              className={STYLES.field}
              data-kr-element="invoice-write-off"
              disabled={locked}
              value={writeOff}
              onChange={(dollars) => setWriteOff(dollars)}
            />
          </label>
        </div>

        {/* Invoice actions: only unlocked drafts can be persisted or sent. */}
        <footer className={LAYOUT_STYLES.footer}>
          <span className={STYLES.actionText}>
            {locked ? 'Locked invoice · review only' : 'Changes save to the Billing API.'}
            {draft.ivid ? (
              <span
                className={STYLES.publicCode}
                data-kr-element="invoice-ivid"
                title="Invoice ID (ivid)"
              >
                {' '}
                · #{draft.ivid}
              </span>
            ) : null}
          </span>
          <div className={LAYOUT_STYLES.footerActions}>
            <button className={STYLES.button} type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              className={STYLES.primaryButton}
              disabled={locked || busy}
              type="button"
              onClick={() => void saveInvoice()}
            >
              {busy ? 'Saving…' : 'Save Invoice'}
            </button>
          </div>
        </footer>
        {openTimeFees ? (
          <AddOpenTimeFeesDialog
            entries={availableEntries}
            onAdd={attach}
            onCancel={() => setOpenTimeFees(false)}
          />
        ) : null}
        {editingEntry ? (
          <EditTimeAndFeeDialog
            entry={editingEntry}
            matterNumbers={matterNumbers}
            staffOptions={staffOptions}
            onCancel={() => setEditingEntry(null)}
            onSave={async (next) => {
              await onSaveEntry(next)
              setEntries((current) => current.map((item) => (item.id === next.id ? next : item)))
              setEditingEntry(null)
            }}
          />
        ) : null}
        {lockPrompt && onToggleLock ? (
          <InvoiceLockConfirm
            clientDisplayName={clientDisplayName ?? draft.clientLabel}
            clientNumber={clientNumber}
            invoice={draft}
            mode={lockPrompt}
            onCancel={() => setLockPrompt(null)}
            onConfirm={async () => {
              const mode = lockPrompt
              if (mode === 'lock' || mode === 'unlock') {
                const lock = mode === 'lock'
                await onToggleLock(draft, lock)
                setDraft((current) => ({
                  ...current,
                  locked: lock,
                  lockedReason: lock ? 'Invoice is locked' : undefined,
                }))
                setDeliveryMessage(
                  `Invoice #${draft.invoiceNumber || 'draft'} ${lock ? 'locked' : 'unlocked'}.`,
                )
              } else if (mode === 'detachPayments' && onInvoiceAction) {
                await onInvoiceAction(draft, 'detachPayments')
                setDraft((current) => ({
                  ...current,
                  status: 'Unpaid',
                  lockedReason: 'Invoice is locked',
                }))
                setDeliveryMessage(
                  `Payments detached from invoice #${draft.invoiceNumber}. Click the lock again to unlock it.`,
                )
              } else if (mode === 'void' && onInvoiceAction) {
                await onInvoiceAction(draft, 'void')
                setLockPrompt(null)
                onCancel()
                return
              }
              setLockPrompt(null)
            }}
          />
        ) : null}
      </section>
    </div>
  )
}
