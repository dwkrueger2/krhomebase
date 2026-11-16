'use client'
// file: apps/web/features/billing/components/PostedPaymentsLedger.client.tsx
/**
 * Posted payments for the client, newest first. Ported from the old `KR-Billing/PostedPaymentsLedger.client.tsx`
 * (same table, colors and void dialog). What waits for later stages:
 *  - stage 5 (documents and email): the receipt preview, print and email icons;
 *  - stage 6 (Stripe): refunding a card when its payment is voided, the refund notice, and "Refresh ARN".
 * Until stage 6 a Stripe card payment can be voided only without a refund; the dialog says so.
 *
 * A payment opened from the Billing Overview (`openPaymentId`) is scrolled to and outlined, since its receipt preview
 * arrives in stage 5.
 *
 * Billing part 7b (Nov 15, 2026, `docs/API/Billing_Audit.md`): each live row has the old receipt icons. Receipt opens
 * the Payment details dialog (`PaymentDetailsDialog`), Print opens the receipt in the print view, and Email waits for
 * part 7c (shown disabled with a tooltip). The receipt is built from the Billing record on screen
 * (`receiptFromBilling`). A payment opened from the Billing Overview is still outlined and now also opens its details,
 * as in the old app.
 *
 * Billing part 7c (Nov 16, 2026): Email receipt opens `PaymentNoticeDialog` (receipt only; the refund notice waits for
 * part 7e), as in the old ledger. Opening the details also reads the payment's sent receipts (`fetchReceiptEmailInfo`)
 * so the details dialog can preview and resend the newest one; the details themselves still come from the record
 * (the old ledger waited for the `payment-notice` route before drawing anything). The client id, number and name come
 * from `receiptSource.client` (the old ledger took them as props).
 *
 * @returns The posted-payments ledger with its void dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { BillingSentDocument } from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { describeKrRequestError, krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { L } from '@/lib/KRUtilities'
import type { BillingRecord } from '@krhomebase/contracts'
import { paymentDetailsFor } from '@krhomebase/documents/receipt'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { BillingApiError, fetchReceiptEmailInfo } from '../api.client'
import { printReceiptFromBilling, receiptFromBilling } from '../printDocuments.client'
import type { BillingPayment } from '../types'
import PaymentDetailsDialog from './PaymentDetailsDialog.client'
import PaymentNoticeDialog from './PaymentNoticeDialog.client'

/** Friendly text for void failures. */
function friendlyVoidError(code: string): string | null {
  if (code.includes('ALREADY_VOID')) return 'This payment is already void.'
  if (code.includes('FORBIDDEN')) return 'Only Super Admins can void payments.'
  if (code === 'STRIPE_REFUND_NOT_AVAILABLE') return 'Card refunds arrive with the Stripe work (plan stage 6). Void without a refund, or refund in Stripe first.'
  return null
}

const STYLES = {
  panel: 'border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) shadow-sm',
  legend: 'ml-2 px-1 text-[10pt] font-bold text-[var(--kr-theme-brand-primary,#21394f)]',
  toolbar: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  headerCell: 'px-1 py-0.5 border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[9pt] font-semibold',
  cell: 'px-1 py-0.5 border-b border-[var(--kr-theme-line,#d7dee5)] text-[9pt]',
  // The payment opened from the Billing Overview.
  openedCell: 'px-1 py-0.5 border-b border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-table-row-selected,#e7eef5)] text-[9pt]',
  // Voided rows: rose tint, muted red text, struck-through amounts — never mistaken for a live payment.
  voidedCell: 'px-1 py-0.5 border-b border-[#efd3cf] bg-[#fdf1ef] text-[9pt] text-[#7d3b33]',
  voidedDetail: 'px-2 py-0.5 border-b border-[#efd3cf] bg-[#fdf1ef] text-[8.5pt] text-[#7d3b33]',
  voidedAmount: 'line-through decoration-[#b3473b]',
  voidChip: 'px-1 rounded border border-[#b3473b] bg-white text-[7pt] font-bold uppercase text-[#9d2c20]',
  ivid: 'ml-0.5 text-[7.5pt] text-[var(--kr-theme-text-muted,#526172)]',
  amount: 'text-right tabular-nums',
  // Receipt icons on a payment row (Billing part 7b): 20px buttons, as icon buttons in rows are.
  receiptButton: 'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-[var(--kr-theme-text-muted,#526172)] hover:enabled:bg-[var(--kr-theme-muted-surface,#eef3f7)] hover:enabled:text-[var(--kr-theme-brand-primary,#21394f)] disabled:cursor-help disabled:opacity-40',
  receiptIcon: 'size-[14px]',
  noticeWarn: 'px-2 py-1 border-b border-[var(--kr-theme-danger,#9d2c20)] text-[9pt] text-[var(--kr-theme-danger,#9d2c20)]',
  voidButton: 'px-1.5 py-0.5 rounded border border-[var(--kr-theme-danger,#9d2c20)] bg-(--kr-theme-card-surface) text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)] disabled:opacity-50',
  empty: 'p-2 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  stripeTag: 'ml-1 px-1 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-brand-primary,#21394f)]',
  noticeOk: 'px-2 py-1 border-b border-emerald-300 bg-emerald-50 text-[9pt] text-emerald-800',
  backdrop: 'bg-slate-950/40',
  dialog: 'w-full max-w-md rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) shadow-2xl',
  dialogTitle: 'text-[12pt] font-bold text-[var(--kr-theme-text,#243142)]',
  dialogText: 'text-[9pt] text-[var(--kr-theme-text,#243142)]',
  dialogDetails: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  dialogWarning: 'text-[9pt] font-semibold text-amber-800',
  field: 'px-1.5 py-1 w-full rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt]',
  cancelButton: 'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] font-semibold',
  confirmButton: 'px-2 py-1 rounded border border-[var(--kr-theme-danger,#9d2c20)] bg-[var(--kr-theme-danger,#9d2c20)] text-[10pt] font-semibold text-white disabled:opacity-50',
} as const

const LAYOUT_STYLES = {
  // pb-12 (about two rows) keeps the last payment row clear of the floating Feedback button.
  root: 'min-w-0 pb-12',
  toolbar: 'px-2 py-1 gap-2 flex items-center justify-end',
  toolbarToggle: 'gap-1 inline-flex items-center',
  viewport: 'overflow-x-auto',
  // The last column holds the receipt icons (part 7b) and Void.
  table: 'grid min-w-[820px] grid-cols-[80px_110px_120px_90px_minmax(0,1fr)_90px_80px_136px]',
  fullRow: 'col-span-full gap-1.5 flex flex-wrap items-center',
  actions: 'gap-1 flex items-center justify-end',
  backdrop: 'p-3 fixed inset-0 z-[1200] flex items-center justify-center',
  dialogBody: 'p-3 gap-2 grid',
  dialogActions: 'pt-1 gap-2 flex justify-end',
} as const

/** Props for {@link PostedPaymentsLedger}. */
export interface PostedPaymentsLedgerProps {
  /** Every payment for the client, voided ones included (flagged `voided`). */
  payments: BillingPayment[]
  /** Super Admin: shows Void. */
  canVoid: boolean
  /** Voids one payment (no card refund until stage 6). */
  onVoid: (payment: BillingPayment, reason: string) => Promise<void>
  /** Payment from the Overview ledger to show after switching to Payments. */
  openPaymentId?: string | null
  onOpenPaymentConsumed?: () => void
  /** The record's client, matters and invoices, for the receipt (Billing part 7b); without it the receipt icons are hidden. */
  receiptSource?: Pick<BillingRecord, 'client' | 'matters' | 'invoices'>
}

/** "Invoice #5 (#HITKC87)" for dialogs and titles. */
function invoiceText(payment: BillingPayment): string {
  return payment.invoiceNumber ? `Invoice #${payment.invoiceNumber}${payment.invoiceIvid ? ` (#${payment.invoiceIvid})` : ''}` : 'No invoice'
}

/** ISO timestamp → MM/DD/YYYY (local). */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/** `MM/DD/YYYY` → a sortable `YYYYMMDD` (the old list sorted the display text, which put January of a later year first). */
function sortKey(date: string): string {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return match ? `${match[3]}${match[1]}${match[2]}` : date
}

export default function PostedPaymentsLedger({ payments, canVoid, onVoid, openPaymentId, onOpenPaymentConsumed, receiptSource }: PostedPaymentsLedgerProps) {
  const [showVoided, setShowVoided] = useState(false)
  const [voiding, setVoiding] = useState<BillingPayment | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [openedId, setOpenedId] = useState<string | null>(null)
  /** The payment whose receipt details are open. */
  const [detailsPayment, setDetailsPayment] = useState<BillingPayment | null>(null)
  /** Why a receipt print view did not open. */
  const [receiptProblem, setReceiptProblem] = useState<string | null>(null)
  /** The payment whose receipt email dialog is open. */
  const [emailing, setEmailing] = useState<BillingPayment | null>(null)
  /** The open details' sent receipts (newest first), and a sentence while they load or when they could not be read. */
  const [detailsSent, setDetailsSent] = useState<BillingSentDocument[]>([])
  const [detailsSentNote, setDetailsSentNote] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const sorted = useMemo(() => [...payments].sort((a, b) => sortKey(b.receivedDate).localeCompare(sortKey(a.receivedDate))), [payments])
  const voidedCount = sorted.filter((payment) => payment.voided).length
  const visible = showVoided ? sorted : sorted.filter((payment) => !payment.voided)
  const isStripe = (payment: BillingPayment): boolean => Boolean(payment.sourceSystem?.startsWith('stripe_'))

  // A payment opened from the Billing Overview: show voided rows if it is one, then scroll to it and outline it.
  useEffect(() => {
    if (!openPaymentId) return
    const target = payments.find((payment) => payment.id === openPaymentId)
    if (target) {
      if (target.voided) setShowVoided(true)
      setOpenedId(target.id)
      if (!target.voided && receiptSource) setDetailsPayment(target)
      window.requestAnimationFrame(() => rowRefs.current.get(target.id)?.scrollIntoView({ block: 'center' }))
    }
    onOpenPaymentConsumed?.()
  }, [openPaymentId, payments, onOpenPaymentConsumed, receiptSource])

  const detailsPaymentId = detailsPayment?.id ?? null
  const receiptClientId = receiptSource?.client.id ?? null
  // The open details' sent receipts, for Preview sent email and Resend (the details come from the record).
  useEffect(() => {
    if (!detailsPaymentId || !receiptClientId) return
    let cancelled = false
    setDetailsSent([])
    setDetailsSentNote('Looking for sent receipt emails...')
    fetchReceiptEmailInfo(receiptClientId, detailsPaymentId)
      .then((info) => {
        if (cancelled) return
        setDetailsSent(info.sent)
        setDetailsSentNote(null)
      })
      .catch((caught: unknown) => {
        L(`[KR_POSTED_PAYMENTS:sent] lookup failed payment=${detailsPaymentId} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
        if (!cancelled) setDetailsSentNote(`The sent receipt emails could not be read: ${caught instanceof Error ? caught.message : 'unknown error'}`)
      })
    return () => {
      cancelled = true
    }
  }, [detailsPaymentId, receiptClientId])

  /** Opens one payment's receipt in the print view. */
  function printReceipt(payment: BillingPayment): string | null {
    if (!receiptSource) return null
    const problem = printReceiptFromBilling(receiptFromBilling(payment, receiptSource))
    setReceiptProblem(problem)
    return problem
  }

  function openVoid(payment: BillingPayment): void {
    setVoiding(payment)
    setReason('')
    setError(null)
  }

  async function confirmVoid(): Promise<void> {
    if (!voiding) return
    if (!reason.trim()) {
      setError(krLocalValidationError('Enter a reason for the void.'))
      return
    }
    setBusy(true)
    setError(null)
    const payment = voiding
    try {
      await onVoid(payment, reason.trim())
      setVoiding(null)
      setNotice(`Payment ${payment.paymentNumber} voided.${isStripe(payment) ? ' The card was not refunded; refund it in Stripe if it should be.' : ''}`)
    } catch (caught) {
      setError(describeKrRequestError(caught, 'KR_PAYMENTS', 'void-payment', friendlyVoidError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className={`${STYLES.panel} ${LAYOUT_STYLES.root}`} data-kr-id="posted-payments-ledger">
      <legend className={STYLES.legend}>Posted Payments</legend>
      {/* Toolbar: Show voided toggle. */}
      <div className={`${LAYOUT_STYLES.toolbar} ${STYLES.toolbar}`} data-kr-element="posted-payments-toolbar">
        <label className={LAYOUT_STYLES.toolbarToggle}>
          <input checked={showVoided} data-kr-element="posted-payments-show-voided" onChange={(event) => setShowVoided(event.target.checked)} type="checkbox" />
          Show voided payments{voidedCount ? ` (${voidedCount})` : ''}
        </label>
      </div>
      {notice ? (
        <p className={STYLES.noticeOk} data-kr-element="posted-payments-notice" role="status">
          {notice}
        </p>
      ) : null}
      {receiptProblem ? (
        <p className={STYLES.noticeWarn} data-kr-element="posted-payments-receipt-problem" role="alert">
          {receiptProblem}
        </p>
      ) : null}
      {/* Payments table: one row per payment; voided rows add a detail line (reason, refund). */}
      <div className={LAYOUT_STYLES.viewport}>
        <div className={LAYOUT_STYLES.table} role="table" aria-label="Posted payments">
          {['Date', 'Payment #', 'Invoice', 'Type', 'Reference', 'Amount', 'Write-off', ''].map((heading, index) => (
            <div className={`${STYLES.headerCell} ${index >= 5 && index <= 6 ? STYLES.amount : ''}`} key={heading || 'actions'} role="columnheader">
              {heading}
            </div>
          ))}
          {visible.map((payment) => {
            const cell = payment.voided ? STYLES.voidedCell : payment.id === openedId ? STYLES.openedCell : STYLES.cell
            const struck = payment.voided ? STYLES.voidedAmount : ''
            return (
              <div
                className="contents"
                data-kr-element={payment.voided ? 'posted-payment-row-voided' : 'posted-payment-row'}
                key={payment.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(payment.id, node.firstElementChild as HTMLDivElement)
                  else rowRefs.current.delete(payment.id)
                }}
                role="row"
              >
                <div className={cell} role="cell">
                  {payment.receivedDate}
                </div>
                <div className={`${cell} truncate`} role="cell" title={payment.paymentNumber}>
                  {payment.paymentNumber}
                </div>
                <div className={`${cell} truncate`} role="cell" title={invoiceText(payment)}>
                  {payment.invoiceNumber ? (
                    <>
                      #{payment.invoiceNumber}
                      {payment.invoiceIvid ? <span className={STYLES.ivid}>({payment.invoiceIvid})</span> : null}
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div className={cell} role="cell">
                  {payment.paymentType}
                  {isStripe(payment) ? <span className={STYLES.stripeTag}>{payment.sourceSystem === 'stripe_live' ? 'Stripe' : 'Sandbox'}</span> : null}
                </div>
                <div className={`${cell} truncate`} role="cell" title={[payment.referenceNumber, payment.memo].filter(Boolean).join(' · ')}>
                  {payment.referenceNumber || payment.memo || '—'}
                </div>
                <div className={`${cell} ${STYLES.amount}`} role="cell">
                  <span className={struck}>{formatAccountingAmount(payment.amount)}</span>
                </div>
                <div className={`${cell} ${STYLES.amount}`} role="cell">
                  {payment.writeOff ? <span className={struck}>{formatAccountingAmount(-payment.writeOff)}</span> : '—'}
                </div>
                <div className={cell} role="cell">
                  <div className={LAYOUT_STYLES.actions}>
                    {/* Receipt icons: details, print, email */}
                    {!payment.voided && receiptSource ? (
                      <>
                        <button aria-label={`Payment receipt for payment ${payment.paymentNumber}`} className={STYLES.receiptButton} data-kr-action="posted-payment-preview-receipt" onClick={() => setDetailsPayment(payment)} title="Payment receipt details" type="button">
                          <KRHomebaseIcon className={STYLES.receiptIcon} name="preview" />
                        </button>
                        <button aria-label={`Print payment receipt for payment ${payment.paymentNumber}`} className={STYLES.receiptButton} data-kr-action="posted-payment-print-receipt" onClick={() => printReceipt(payment)} title="Print payment receipt" type="button">
                          <KRHomebaseIcon className={STYLES.receiptIcon} name="print" />
                        </button>
                        <button aria-label={`Email receipt for payment ${payment.paymentNumber}`} className={STYLES.receiptButton} data-kr-action="posted-payment-email-receipt" onClick={() => setEmailing(payment)} title="Email payment receipt" type="button">
                          <KRHomebaseIcon className={STYLES.receiptIcon} name="send" />
                        </button>
                      </>
                    ) : null}
                    {payment.voided ? (
                      <span className={STYLES.voidChip}>Voided</span>
                    ) : canVoid ? (
                      <button className={STYLES.voidButton} data-kr-action="posted-payment-void" onClick={() => openVoid(payment)} type="button">
                        Void
                      </button>
                    ) : null}
                  </div>
                </div>
                {payment.voided ? (
                  <div className={`${STYLES.voidedDetail} ${LAYOUT_STYLES.fullRow}`} data-kr-element="posted-payment-void-detail" role="cell">
                    <span>
                      Voided {shortDate(payment.voidedAt)}
                      {payment.voidReason ? ` · ${payment.voidReason}` : ''}
                    </span>
                    {payment.refund ? (
                      <span>
                        · Refund {formatAccountingAmount(payment.refund.amount ?? payment.amount)} {payment.refund.status ?? ''} ({payment.refund.id}) · ARN{' '}
                        {payment.refund.reference ?? (payment.refund.referenceStatus === 'pending' ? 'pending' : 'not available')}
                      </span>
                    ) : isStripe(payment) ? (
                      <span>· Not refunded in Stripe</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      {!visible.length ? <p className={STYLES.empty}>{voidedCount && !showVoided ? 'No active payments. Check “Show voided payments” to see voided ones.' : 'No payments posted for this client.'}</p> : null}

      {/* Void dialog: amount and invoice in the header, what happens, details, reason. */}
      {voiding ? (
        <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation">
          <section className={STYLES.dialog} aria-label="Void payment" aria-modal="true" role="dialog" data-kr-id="void-payment-dialog">
            <div className={LAYOUT_STYLES.dialogBody}>
              <h2 className={STYLES.dialogTitle}>
                Void payment of {formatAccountingAmount(voiding.amount)}
                {voiding.invoiceNumber ? ` on Invoice #${voiding.invoiceNumber}` : ''}
              </h2>
              <p className={STYLES.dialogText}>
                The payment{voiding.writeOff ? ' and its write-off' : ''} will be reversed on the ledger{voiding.invoiceNumber ? ' and the invoice balance reopened' : ''}. A void cannot be undone.
              </p>
              {isStripe(voiding) ? (
                <p className={STYLES.dialogWarning} data-kr-element="void-payment-no-refund">
                  This card payment will not be refunded: card refunds arrive with the Stripe work (plan stage 6). Refund it in Stripe if it should be.
                </p>
              ) : null}
              <p className={STYLES.dialogDetails} data-kr-element="void-payment-details">
                {invoiceText(voiding)} - Payment number: {voiding.paymentNumber}
              </p>
              <label className="gap-1 grid text-[9pt] font-semibold">
                Reason
                <input autoFocus className={STYLES.field} onChange={(event) => setReason(event.target.value)} value={reason} />
              </label>
              <KrRequestErrorNote dataKrElement="void-payment-error" error={error} />
              <div className={LAYOUT_STYLES.dialogActions}>
                <button className={STYLES.cancelButton} disabled={busy} onClick={() => setVoiding(null)} type="button">
                  Cancel
                </button>
                <button className={STYLES.confirmButton} data-kr-action="void-payment-confirm" disabled={busy} onClick={() => void confirmVoid()} type="button">
                  {busy ? 'Voiding…' : 'Void payment'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {/* Payment receipt details (part 7b), built from the record on screen. */}
      {detailsPayment && receiptSource ? (
        <PaymentDetailsDialog
          clientId={receiptSource.client.id}
          details={paymentDetailsFor(receiptFromBilling(detailsPayment, receiptSource))}
          latestSent={detailsSent[0] ?? null}
          sentNote={detailsSentNote}
          onClose={() => setDetailsPayment(null)}
          onPrint={() => printReceipt(detailsPayment)}
          paymentNumber={detailsPayment.paymentNumber}
        />
      ) : null}
      {/* Receipt email (the refund notice waits for Billing part 7e). */}
      {emailing && receiptSource ? (
        <PaymentNoticeDialog
          clientDisplayName={receiptSource.client.displayName}
          clientId={receiptSource.client.id}
          clientNumber={receiptSource.client.clientNumber}
          payment={emailing}
          onClose={() => setEmailing(null)}
        />
      ) : null}
    </fieldset>
  )
}
