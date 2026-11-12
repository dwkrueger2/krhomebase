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
 * @returns The posted-payments ledger with its void dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { describeKrRequestError, krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingPayment } from '../types'

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
  table: 'grid min-w-[760px] grid-cols-[80px_110px_120px_90px_minmax(0,1fr)_90px_80px_76px]',
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

export default function PostedPaymentsLedger({ payments, canVoid, onVoid, openPaymentId, onOpenPaymentConsumed }: PostedPaymentsLedgerProps) {
  const [showVoided, setShowVoided] = useState(false)
  const [voiding, setVoiding] = useState<BillingPayment | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [openedId, setOpenedId] = useState<string | null>(null)
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
      window.requestAnimationFrame(() => rowRefs.current.get(target.id)?.scrollIntoView({ block: 'center' }))
    }
    onOpenPaymentConsumed?.()
  }, [openPaymentId, payments, onOpenPaymentConsumed])

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
    </fieldset>
  )
}
