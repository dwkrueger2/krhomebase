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
 * Billing part 7e (Nov 16, 2026): refunds, as in the old ledger. The Void dialog of a Stripe card payment asks whether
 * to "Refund the card in Stripe" (default yes) and whether to "Email the client a refund notice" (default yes, the
 * address prefilled with the client's primary email); the notice is sent after the void succeeds, so a mail failure is
 * reported but never undoes the void. A voided, refunded row shows the refund with its ARN and an info tip, "Refresh ARN"
 * for a super admin while Stripe has no ARN yet (`refreshPaymentRefund`), and a send icon for the refund notice
 * (`PaymentNoticeDialog` kind `refund`). Changed from the old ledger: the notice line keeps its two tones as theme
 * colors (the old amber warning became the danger-toned warning row this file already had).
 *
 * Billing part 7f (Nov 16, 2026, `docs/API/Billing_Audit.md` section 5, item 5): `canSend` false (a billing reader)
 * leaves out the Email receipt icon, the refund notice icon and the details dialog's Resend; the receipt details,
 * Print and the sent-email preview stay. Void and Refresh ARN were already super admin only (`canVoid`).
 *
 * Web patch 560 (the requester, Nov 16, 2026): confirming a void closes the form and opens `PaymentPostingDialog`
 * (`kind="void"`): the spinner while the payment is voided (and the card refunded, the notice emailed), then the
 * answer until OK, "Payment voided" with a list (the refund, the notice, where to see it) or "Payment not voided" with
 * the reason; OK on a failure brings the form back with the reason and the error. The green line under the toolbar
 * stays. The columns no longer wrap: all but Reference are as wide as their widest entry, and the payment number is
 * one step smaller (8pt).
 *
 * Decision C2 (the requester, Nov 16, 2026): a live payment with unapplied money (`unappliedAmount`, left on a matter
 * when it was posted, or the rest of a pay link payment) shows it on a line under its row, with "Apply to invoice" for a
 * billing writer (`canSend`) when the record is at hand (`receiptSource`). The button opens `ApplyUnappliedDialog`
 * (choose open invoices and amounts, then the progress and result dialog); a success also shows the green line.
 *
 * @returns The posted-payments ledger with its void dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { BillingSentDocument, PaymentVoidData } from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { describeKrRequestError, krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { L } from '@/lib/KRUtilities'
import type { BillingRecord } from '@krhomebase/contracts'
import { paymentDetailsFor } from '@krhomebase/documents/receipt'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { BillingApiError, fetchReceiptEmailInfo, fetchStatementEmailInfo, refreshPaymentRefund, sendRefundNoticeEmail } from '../api.client'
import { printReceiptFromBilling, receiptFromBilling } from '../printDocuments.client'
import type { BillingPayment } from '../types'
import PaymentDetailsDialog from './PaymentDetailsDialog.client'
import PaymentNoticeDialog from './PaymentNoticeDialog.client'
import PaymentPostingDialog, { type PaymentPostingPhase } from './PaymentPostingDialog.client'
import ApplyUnappliedDialog from './ApplyUnappliedDialog.client'

/** Friendly text for void failures (the old wording, part 7e). */
function friendlyVoidError(code: string): string | null {
  if (code.includes('ALREADY_VOID')) return 'This payment is already void.'
  if (code.includes('FORBIDDEN')) return 'Only Super Admins can void payments.'
  if (code.includes('DATABASE_SYNC')) return 'Stripe refunded this payment, but the database sync failed. Void it again: the refund is reused, never repeated.'
  if (code.includes('REFUND')) return 'Stripe rejected the refund; the payment was not voided in the database.'
  if (code.includes('NOT_CONFIGURED')) return 'Stripe keys are not configured for this environment, so the card could not be refunded.'
  return null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "a@x.com, b@y.com" → the addresses. */
function parseAddresses(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** What the ARN is, for the tip beside it. */
const ARN_HELP = 'ARN (Acquirer Reference Number): the card network’s reference for the refund. The client’s bank can trace the refund with it.'

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
  // Web patch 560: cells that never wrap; the payment number one step smaller.
  nowrap: 'whitespace-nowrap',
  paymentNumber: 'whitespace-nowrap text-[8pt] tabular-nums',
  amount: 'text-right tabular-nums',
  // Receipt icons on a payment row (Billing part 7b): 20px buttons, as icon buttons in rows are.
  receiptButton: 'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-[var(--kr-theme-text-muted,#526172)] hover:enabled:bg-[var(--kr-theme-muted-surface,#eef3f7)] hover:enabled:text-[var(--kr-theme-brand-primary,#21394f)] disabled:cursor-help disabled:opacity-40',
  receiptIcon: 'size-[14px]',
  noticeWarn: 'px-2 py-1 border-b border-[var(--kr-theme-danger,#9d2c20)] text-[9pt] text-[var(--kr-theme-danger,#9d2c20)]',
  voidButton: 'px-1.5 py-0.5 rounded border border-[var(--kr-theme-danger,#9d2c20)] bg-(--kr-theme-card-surface) text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)] disabled:opacity-50',
  empty: 'p-2 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  stripeTag: 'ml-1 px-1 rounded text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-brand-primary,#21394f)]',
  noticeOk: 'px-2 py-1 border-b border-emerald-300 bg-emerald-50 text-[9pt] text-emerald-800',
  // Decision C2: the unapplied money line under a live row, and its Apply to invoice button.
  unappliedDetail: 'px-2 py-[1px] border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[8.5pt] text-(color:--kr-theme-text)',
  unappliedAmount: 'font-semibold tabular-nums',
  applyButton: 'px-1.5 py-0.5 rounded-[3px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-card-surface) text-[8pt] font-semibold text-(color:--kr-theme-brand-primary) hover:bg-(--kr-theme-table-row-hover)',
  // Part 7e: the refund's ARN tip, Refresh ARN and the refund notice icon on a voided row.
  infoIcon: 'h-3 w-3 shrink-0 cursor-help',
  linkButton: 'px-0.5 border-0 bg-transparent text-[8.5pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline disabled:opacity-50',
  checkLabel: 'gap-1.5 inline-flex items-center text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
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
  // The last column holds the receipt icons (part 7b) and Void. Web patch 560 (the requester): every column but
  // Reference is as wide as its widest entry (no wrapping: "Credit card SANDBOX", the payment number on one line, a
  // narrower Invoice); Reference takes the rest and truncates.
  table: 'grid min-w-[820px] grid-cols-[max-content_max-content_max-content_max-content_minmax(120px,1fr)_max-content_max-content_max-content]',
  fullRow: 'col-span-full gap-1.5 flex flex-wrap items-center',
  actions: 'gap-1 flex items-center justify-end',
  backdrop: 'p-3 fixed inset-0 z-[1200] flex items-center justify-center',
  dialogBody: 'p-3 gap-2 grid',
  dialogActions: 'pt-1 gap-2 flex justify-end',
  // Part 7e: the refund notice address under its tick box.
  notifyField: 'ml-5 gap-1 grid grid-cols-[auto_minmax(0,1fr)] items-center',
  arn: 'gap-0.5 inline-flex items-center',
} as const

/** Props for {@link PostedPaymentsLedger}. */
export interface PostedPaymentsLedgerProps {
  /** Every payment for the client, voided ones included (flagged `voided`). */
  payments: BillingPayment[]
  /** Super Admin: shows Void. */
  canVoid: boolean
  /** Voids one payment; a Stripe card payment is refunded when `refund` is true (part 7e). Answers the API's reply. */
  onVoid: (payment: BillingPayment, reason: string, refund: boolean) => Promise<PaymentVoidData | null | void>
  /** Payment from the Overview ledger to show after switching to Payments. */
  openPaymentId?: string | null
  onOpenPaymentConsumed?: () => void
  /** The record's client, matters and invoices, for the receipt (Billing part 7b); without it the receipt icons are hidden. */
  receiptSource?: Pick<BillingRecord, 'client' | 'matters' | 'invoices'>
  /** Part 7f: the person may send billing email (`viewer.canWrite`). False leaves out the email icons. Default true. */
  canSend?: boolean
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

/** Props for {@link PaymentRefundLine}. */
export interface PaymentRefundLineProps {
  /** A voided payment with a recorded Stripe refund. */
  payment: BillingPayment & { refund: NonNullable<BillingPayment['refund']> }
  /** Super Admin with a client open: offers Refresh ARN while Stripe has no ARN yet. */
  canRefresh: boolean
  refreshing: boolean
  onRefresh: () => void
  /** Opens the refund notice email; left out, no send icon. */
  onEmail?: () => void
}

/**
 * The refund part of a voided row (Billing part 7e, the old ledger's refund line): amount, status and refund id, the ARN
 * with its tip, Refresh ARN and the refund notice icon. The ledger owns the refresh and the dialog.
 */
export function PaymentRefundLine({ payment, canRefresh, refreshing, onRefresh, onEmail }: PaymentRefundLineProps) {
  const refund = payment.refund
  return (
    <>
      <span>
        · Refund {formatAccountingAmount(refund.amount ?? payment.amount)} {refund.status ?? ''} ({refund.id})
      </span>
      {/* The refund reference (ARN) with its tip; Refresh ARN while Stripe has none yet (super admin). */}
      <span className={LAYOUT_STYLES.arn} data-kr-element="posted-payment-refund-arn" title={`${ARN_HELP} Stripe status: ${refund.referenceStatus ?? 'unknown'}.`}>
        · ARN {refund.reference ?? (refund.referenceStatus === 'pending' ? 'pending' : 'not available')}
        <KRHomebaseIcon className={STYLES.infoIcon} name="info-square" title={ARN_HELP} />
      </span>
      {canRefresh && !refund.reference && refund.id.startsWith('re_') ? (
        <button className={STYLES.linkButton} data-kr-action="posted-payment-refresh-refund" disabled={refreshing} onClick={onRefresh} type="button">
          {refreshing ? 'Refreshing...' : 'Refresh ARN'}
        </button>
      ) : null}
      {onEmail ? (
        <button aria-label={`Email refund notice for payment ${payment.paymentNumber}`} className={STYLES.receiptButton} data-kr-action="posted-payment-email-refund" onClick={onEmail} title="Email refund notice" type="button">
          <KRHomebaseIcon className={STYLES.receiptIcon} name="send" />
        </button>
      ) : null}
    </>
  )
}

export default function PostedPaymentsLedger({ payments, canVoid, onVoid, openPaymentId, onOpenPaymentConsumed, receiptSource, canSend = true }: PostedPaymentsLedgerProps) {
  const [showVoided, setShowVoided] = useState(false)
  const [voiding, setVoiding] = useState<BillingPayment | null>(null)
  const [reason, setReason] = useState('')
  /** Part 7e: refund the card in Stripe (default yes) and email the client a refund notice (default yes). */
  const [refund, setRefund] = useState(true)
  const [notify, setNotify] = useState(true)
  const [notifyTo, setNotifyTo] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  /** The void's progress and answer (web patch 560): the phase, the list, the reason when it failed, and the payment. */
  const [voidPhase, setVoidPhase] = useState<PaymentPostingPhase | null>(null)
  const [voidSummary, setVoidSummary] = useState<{ heading: string; points: string[] } | null>(null)
  const [voidWarning, setVoidWarning] = useState<string | null>(null)
  const [voidError, setVoidError] = useState<KrRequestErrorInfo | null>(null)
  const [voidRefunding, setVoidRefunding] = useState(false)
  const [voidFailedPayment, setVoidFailedPayment] = useState<BillingPayment | null>(null)
  const [openedId, setOpenedId] = useState<string | null>(null)
  /** The payment whose receipt details are open. */
  const [detailsPayment, setDetailsPayment] = useState<BillingPayment | null>(null)
  /** Why a receipt print view did not open. */
  const [receiptProblem, setReceiptProblem] = useState<string | null>(null)
  /** The payment whose receipt (or, part 7e, refund notice) email dialog is open. */
  const [emailing, setEmailing] = useState<{ kind: 'receipt' | 'refund'; payment: BillingPayment } | null>(null)
  /** The open details' sent receipts (newest first), and a sentence while they load or when they could not be read. */
  const [detailsSent, setDetailsSent] = useState<BillingSentDocument[]>([])
  const [detailsSentNote, setDetailsSentNote] = useState<string | null>(null)
  /** Decision C2: the payment whose unapplied money is being applied to invoices. */
  const [applying, setApplying] = useState<BillingPayment | null>(null)
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
    setRefund(true)
    setNotify(isStripe(payment))
    setNotifyTo('')
    setError(null)
    // Prefill the refund-notice address with the client's primary email.
    if (isStripe(payment) && receiptClientId)
      fetchStatementEmailInfo(receiptClientId, null)
        .then((info) => {
          const primary = info.recipients.filter((item) => item.primary).map((item) => item.email)
          const seed = primary.length ? primary : info.recipients.slice(0, 1).map((item) => item.email)
          setNotifyTo((current) => current || seed.join(', '))
        })
        .catch(() => undefined)
  }

  async function confirmVoid(): Promise<void> {
    if (!voiding) return
    if (!reason.trim()) {
      setError(krLocalValidationError('Enter a reason for the void.'))
      return
    }
    const refundCard = isStripe(voiding) && refund
    const sendNotice = refundCard && notify && Boolean(receiptClientId)
    const to = parseAddresses(notifyTo)
    if (sendNotice && (!to.length || to.some((item) => !EMAIL_PATTERN.test(item)))) {
      setError(krLocalValidationError('Enter the email address for the refund notice, or uncheck it.'))
      return
    }
    setBusy(true)
    setError(null)
    const payment = voiding
    // Web patch 560: the form closes and the progress dialog takes over (spinner, then the answer until OK).
    setVoiding(null)
    setVoidSummary(null)
    setVoidWarning(null)
    setVoidError(null)
    setVoidFailedPayment(null)
    setVoidRefunding(refundCard)
    setVoidPhase('posting')
    let succeeded = false
    try {
      const result = await onVoid(payment, reason.trim(), refundCard)
      succeeded = true
      const refunded = result ? result.refund : null
      const voidText = `Payment ${payment.paymentNumber} voided${refunded ? ` and ${formatAccountingAmount(refunded.amount ?? payment.amount)} refunded through Stripe (${refunded.id})` : isStripe(payment) ? '; the card was not refunded in Stripe' : ''}.`
      const refundPoint = refunded
        ? `${formatAccountingAmount(refunded.amount ?? payment.amount)} was refunded to the card through Stripe (${refunded.id}).`
        : isStripe(payment)
          ? 'The card was not refunded in Stripe.'
          : `No card refund applies to a ${payment.paymentType.toLowerCase()} payment.`
      const reviewPoint = 'You can see the voided payment under Clients > Billing > Payments > Posted Payments (Show voided payments).'
      const willNotify = Boolean(sendNotice && refunded && receiptClientId)
      setVoidSummary({
        heading: `Payment ${payment.paymentNumber} of ${formatAccountingAmount(payment.amount)} voided.`,
        points: [refundPoint, ...(willNotify ? ['Emailing the refund notice to the client...'] : []), reviewPoint],
      })
      if (!willNotify || !receiptClientId) {
        setNotice({ tone: 'ok', text: voidText })
        return
      }
      // The notice goes after the void: a mail failure is reported, the void stands.
      setVoidPhase('receipt')
      try {
        const sent = await sendRefundNoticeEmail(receiptClientId, payment.id, { to, subject: '', message: '' })
        setNotice({ tone: 'ok', text: `${voidText} Refund notice emailed to ${sent.to.join(', ')}.` })
        setVoidSummary((current) => (current ? { ...current, points: current.points.map((point) => (point.startsWith('Emailing the refund notice') ? `The refund notice has been sent to the client at ${sent.to.join(', ')}.` : point)) } : current))
      } catch (caught) {
        const info = describeKrRequestError(caught, 'KR_PAYMENTS', 'refund-notice')
        setNotice({ tone: 'warn', text: `${voidText} The void and the refund succeeded; only the refund notice failed (${info.message}). Use the send icon on the voided payment to try again.` })
        setVoidWarning(`The refund notice was not emailed (${info.message}). Use the send icon on the voided payment to try again.`)
        setVoidSummary((current) => (current ? { ...current, points: current.points.filter((point) => !point.startsWith('Emailing the refund notice')) } : current))
      }
    } catch (caught) {
      const info = describeKrRequestError(caught, 'KR_PAYMENTS', 'void-payment', friendlyVoidError)
      setVoidError(info)
      setError(info)
      // OK on the failure brings the form back with the reason kept.
      setVoidFailedPayment(payment)
    } finally {
      setBusy(false)
      setVoidPhase(succeeded ? 'posted' : 'failed')
    }
  }

  /** Closes the void's answer; after a failure the form comes back with the reason and the error. */
  function closeVoidDialog(): void {
    setVoidPhase(null)
    if (voidFailedPayment) setVoiding(voidFailedPayment)
    setVoidFailedPayment(null)
  }

  /** Super Admin: re-reads a refund's ARN from Stripe (live usually has it a few days after the refund). */
  async function refreshRefund(payment: BillingPayment): Promise<void> {
    if (!receiptClientId) return
    setRefreshingId(payment.id)
    try {
      const updated = (await refreshPaymentRefund(receiptClientId, payment.id)).refund
      setNotice({ tone: 'ok', text: updated.reference ? `ARN for payment ${payment.paymentNumber}: ${updated.reference}.` : `Stripe has no ARN yet for payment ${payment.paymentNumber} (${updated.referenceStatus ?? 'pending'}).` })
    } catch (caught) {
      setNotice({ tone: 'warn', text: `Could not refresh the refund: ${describeKrRequestError(caught, 'KR_PAYMENTS', 'refresh-refund', friendlyVoidError).message}` })
    } finally {
      setRefreshingId(null)
    }
  }

  const voidingStripe = voiding ? isStripe(voiding) : false

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
        <p className={notice.tone === 'ok' ? STYLES.noticeOk : STYLES.noticeWarn} data-kr-element="posted-payments-notice" role="status">
          {notice.text}
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
                <div className={`${cell} ${STYLES.nowrap}`} role="cell">
                  {payment.receivedDate}
                </div>
                <div className={`${cell} ${STYLES.paymentNumber}`} role="cell" title={payment.paymentNumber}>
                  {payment.paymentNumber}
                </div>
                <div className={`${cell} ${STYLES.nowrap}`} role="cell" title={invoiceText(payment)}>
                  {payment.invoiceNumber ? (
                    <>
                      #{payment.invoiceNumber}
                      {payment.invoiceIvid ? <span className={STYLES.ivid}>({payment.invoiceIvid})</span> : null}
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div className={`${cell} ${STYLES.nowrap}`} role="cell">
                  {payment.paymentType}
                  {isStripe(payment) ? <span className={STYLES.stripeTag}>{payment.sourceSystem === 'stripe_live' ? 'Stripe' : 'Sandbox'}</span> : null}
                </div>
                <div className={`${cell} truncate`} role="cell" title={[payment.referenceNumber, payment.memo].filter(Boolean).join(' · ')}>
                  {payment.referenceNumber || payment.memo || '—'}
                </div>
                <div className={`${cell} ${STYLES.amount} ${STYLES.nowrap}`} role="cell">
                  <span className={struck}>{formatAccountingAmount(payment.amount)}</span>
                </div>
                <div className={`${cell} ${STYLES.amount} ${STYLES.nowrap}`} role="cell">
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
                        {canSend ? (
                          <button aria-label={`Email receipt for payment ${payment.paymentNumber}`} className={STYLES.receiptButton} data-kr-action="posted-payment-email-receipt" onClick={() => setEmailing({ kind: 'receipt', payment })} title="Email payment receipt" type="button">
                            <KRHomebaseIcon className={STYLES.receiptIcon} name="send" />
                          </button>
                        ) : null}
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
                      <PaymentRefundLine
                        canRefresh={canVoid && Boolean(receiptSource)}
                        onRefresh={() => void refreshRefund(payment)}
                        payment={{ ...payment, refund: payment.refund }}
                        refreshing={refreshingId === payment.id}
                        {...(receiptSource && canSend ? { onEmail: () => setEmailing({ kind: 'refund', payment }) } : {})}
                      />
                    ) : isStripe(payment) ? (
                      <span>· Not refunded in Stripe</span>
                    ) : null}
                  </div>
                ) : null}
                {/* Decision C2: unapplied money on a live payment, with Apply to invoice for a billing writer. */}
                {!payment.voided && (payment.unappliedAmount ?? 0) > 0.005 ? (
                  <div className={`${STYLES.unappliedDetail} ${LAYOUT_STYLES.fullRow}`} data-kr-element="posted-payment-unapplied" role="cell">
                    <span>
                      Unapplied <span className={STYLES.unappliedAmount}>{formatAccountingAmount(payment.unappliedAmount ?? 0)}</span>
                    </span>
                    {canSend && receiptSource ? (
                      <button className={STYLES.applyButton} data-kr-action="posted-payment-apply" onClick={() => setApplying(payment)} title="Apply this payment's unapplied money to open invoices" type="button">
                        Apply to invoice
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      {!visible.length ? <p className={STYLES.empty}>{voidedCount && !showVoided ? 'No active payments. Check “Show voided payments” to see voided ones.' : 'No payments posted for this client.'}</p> : null}

      {/* Void dialog: amount and invoice in the header, what happens, details, reason, refund, refund notice. */}
      {voiding ? (
        <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation">
          <section className={STYLES.dialog} aria-label="Void payment" aria-modal="true" role="dialog" data-kr-id="void-payment-dialog">
            <div className={LAYOUT_STYLES.dialogBody}>
              <h2 className={STYLES.dialogTitle}>
                Void payment of {formatAccountingAmount(voiding.amount)}
                {voiding.invoiceNumber ? ` on Invoice #${voiding.invoiceNumber}` : ''}
              </h2>
              <p className={STYLES.dialogText}>
                The payment{voiding.writeOff ? ' and its write-off' : ''} will be reversed on the ledger{voiding.invoiceNumber ? ' and the invoice balance reopened' : ''}.
                {voidingStripe ? (refund ? ' The card is refunded in full through Stripe; the refund usually reaches the client’s statement in 5–10 business days.' : ' The card will not be refunded in Stripe.') : ''} A void cannot be undone.
              </p>
              <p className={STYLES.dialogDetails} data-kr-element="void-payment-details">
                {invoiceText(voiding)} - Payment number: {voiding.paymentNumber}
              </p>
              <label className="gap-1 grid text-[9pt] font-semibold">
                Reason
                <input autoFocus className={STYLES.field} onChange={(event) => setReason(event.target.value)} value={reason} />
              </label>
              {/* Stripe card payment: refund the card (default yes) and email the client a refund notice (default yes). */}
              {voidingStripe ? (
                <>
                  <label className={STYLES.checkLabel}>
                    <input checked={refund} data-kr-element="void-payment-refund" onChange={(event) => setRefund(event.target.checked)} type="checkbox" />
                    Refund the card in Stripe ({voiding.sourceSystem === 'stripe_live' ? 'live' : 'sandbox'})
                  </label>
                  {refund && receiptSource ? (
                    <>
                      <label className={STYLES.checkLabel}>
                        <input checked={notify} data-kr-element="void-payment-notify" onChange={(event) => setNotify(event.target.checked)} type="checkbox" />
                        Email the client a refund notice
                      </label>
                      {notify ? (
                        <label className={`${LAYOUT_STYLES.notifyField} text-[9pt] font-semibold`}>
                          To
                          <input className={STYLES.field} data-kr-element="void-payment-notify-to" onChange={(event) => setNotifyTo(event.target.value)} placeholder="client@example.com" value={notifyTo} />
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
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
      {/* Void progress and answer (web patch 560): spinner while voiding (and emailing the refund notice), then the result until OK. */}
      <PaymentPostingDialog chargingCard={voidRefunding} error={voidError} kind="void" phase={voidPhase} posted={null} receiptWarning={voidWarning} summary={voidSummary} onClose={closeVoidDialog} />
      {/* Decision C2: apply a payment's unapplied money to open invoices (form, then progress and result). */}
      {applying && receiptSource ? (
        <ApplyUnappliedDialog
          clientId={receiptSource.client.id}
          invoices={receiptSource.invoices}
          payment={applying}
          onApplied={(result, numbers) => setNotice({ tone: 'ok', text: `${formatAccountingAmount(result.applied)} of payment ${applying.paymentNumber} applied to Invoice #${numbers.join(', #')}.` })}
          onClose={() => setApplying(null)}
        />
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
          canResend={canSend}
        />
      ) : null}
      {/* Receipt or refund notice email (part 7e). */}
      {emailing && receiptSource ? (
        <PaymentNoticeDialog
          clientDisplayName={receiptSource.client.displayName}
          clientId={receiptSource.client.id}
          clientNumber={receiptSource.client.clientNumber}
          kind={emailing.kind}
          payment={emailing.payment}
          onClose={() => setEmailing(null)}
        />
      ) : null}
    </fieldset>
  )
}
