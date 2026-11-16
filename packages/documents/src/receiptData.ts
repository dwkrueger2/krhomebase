// file: packages/documents/src/receiptData.ts
/**
 * Builds the Payment Receipt model (`PaymentReceiptData`) from a recorded
 * payment. Pure: used by the send-receipt route (from database rows) and by
 * the Billing Document Samples fixture.
 *
 * Ported from the old `KR-Billing/Invoicing/buildPaymentReceiptData.ts` (part 7a of `docs/API/Billing_Audit.md`).
 * Used by the print page's receipt (part 7b), the receipt notice and the paid-link webhook's receipt (parts 7c, 7d).
 *
 * `paymentDetailsFor` and `stripeCardLabel` (part 7b) are the old server helpers of the same names in
 * `api/_server/krPaymentNotice.ts`, moved here so the Payment details dialog (web) and the receipt notice (API, part
 * 7c) build the same details from the same receipt.
 *
 * Changed from the old file: the letterhead is passed in (`letterhead`, from `buildLetterhead`) instead of
 * `firmState` (decision B5), and the receipt date (now, unless given) is its date in the firm's time zone
 * (`format.ts`).
 *
 * Billing part 7e (Nov 16, 2026): `refundNoticeFromRecord` builds the refund notice of a voided, refunded Stripe card
 * payment from the Billing record, as the old `refundNoticeFor` (`api/_server/krPaymentNotice.ts`) built it from the
 * rows. Changed: the letterhead is the chosen office's (the old notice always used Texas), the client name is the
 * client's display name (as the receipt here), and the dates are read in the firm's time zone.
 */

import { formatLongDate, roundMoney } from './format.ts'
import type { BillingPayment, BillingRecord } from '@krhomebase/contracts'
import type { PaymentRefundNoticeData } from './receiptEmail.ts'
import type { LetterheadProfile, PaymentDetails, PaymentReceiptData } from './types.ts'

/** Closing paragraph printed on every receipt. */
export const DEFAULT_RECEIPT_FINE_PRINT =
  'Thank you for your payment. Please keep this receipt for your records. If anything on it does not match your ' +
  'records, call the office listed above.'

/** Inputs for {@link buildPaymentReceiptData}. */
export interface BuildPaymentReceiptOptions {
  /** Letterhead, from `buildLetterhead(firmProfile, officeId)`. */
  letterhead: LetterheadProfile
  paymentNumber: string
  /** ISO or MM/DD/YYYY. */
  paymentDate: string
  /** Defaults to now. */
  receiptDate?: string | Date
  receivedFromName: string
  receivedFromLines?: string[]
  clientNumber: string
  matterNumber: string
  matterTitle?: string
  invoiceNumber?: string | null
  invoiceIvid?: string | null
  /** Payment type label, e.g. "Credit card". */
  paymentType: string
  /** Card or bank detail, e.g. "Visa •••• 4242". */
  paymentDetail?: string | null
  reference?: string | null
  /** `stripe_sandbox` / `stripe_live` / null. */
  sourceSystem?: string | null
  amount: number
  writeOff?: number
  /** Invoice balance after this payment (null when unapplied). */
  invoiceBalanceAfter?: number | null
}

/**
 * Builds the receipt model; the balance before is derived from the balance
 * after plus this payment and its write-off.
 *
 * @returns The printable receipt.
 */
export function buildPaymentReceiptData(options: BuildPaymentReceiptOptions): PaymentReceiptData {
  const writeOff = roundMoney(Math.abs(options.writeOff ?? 0))
  const after = typeof options.invoiceBalanceAfter === 'number' ? roundMoney(options.invoiceBalanceAfter) : null
  const isTest = options.sourceSystem === 'stripe_sandbox'
  const processor = options.sourceSystem?.startsWith('stripe_') ? (isTest ? 'Stripe (sandbox — test payment)' : 'Stripe') : null
  const rVal: PaymentReceiptData = {
    firm: options.letterhead,
    receiptNumber: options.paymentNumber,
    receiptDate: formatLongDate(options.receiptDate ?? new Date()),
    paymentDate: formatLongDate(options.paymentDate),
    receivedFrom: { name: options.receivedFromName, addressLines: options.receivedFromLines ?? [] },
    clientNumber: options.clientNumber,
    matterNumber: options.matterNumber,
    matterTitle: options.matterTitle ?? '',
    invoiceNumber: options.invoiceNumber ?? null,
    invoiceIvid: options.invoiceIvid ?? null,
    paymentMethod: [options.paymentType, options.paymentDetail].filter(Boolean).join(' · '),
    reference: options.reference ?? null,
    processor,
    amount: roundMoney(options.amount),
    writeOff,
    invoiceBalanceBefore: after === null ? null : roundMoney(after + options.amount + writeOff),
    invoiceBalanceAfter: after,
    isTest,
    finePrint: DEFAULT_RECEIPT_FINE_PRINT,
  }
  return rVal
}

/** Card label from a Stripe payment memo ("Stripe sandbox · Visa •••• 4242 · notes" → "Visa •••• 4242"); null for other payments. */
export function stripeCardLabel(memo: string | null | undefined, sourceSystem: string | null | undefined): string | null {
  if (!sourceSystem?.startsWith('stripe_') || !memo?.startsWith('Stripe ')) return null
  const rVal = memo.split(' · ')[1]?.trim() || null
  return rVal
}

/** The stable details the posted-payment receipt dialog shows, read from the receipt (old `paymentDetailsFor`). */
export function paymentDetailsFor(receipt: PaymentReceiptData): PaymentDetails {
  return {
    receiptNumber: receipt.receiptNumber,
    paymentDate: receipt.paymentDate,
    receivedFrom: receipt.receivedFrom.name,
    clientNumber: receipt.clientNumber,
    matterNumber: receipt.matterNumber,
    matterTitle: receipt.matterTitle,
    appliedTo: receipt.invoiceNumber ? `Invoice #${receipt.invoiceNumber}${receipt.invoiceIvid ? ` (${receipt.invoiceIvid})` : ''}` : 'Not applied to an invoice',
    paymentMethod: receipt.paymentMethod,
    processor: receipt.processor,
    reference: receipt.reference,
    amountReceived: receipt.amount,
    invoiceBalanceBefore: receipt.invoiceBalanceBefore,
    invoiceBalanceAfter: receipt.invoiceBalanceAfter,
    isTest: receipt.isTest,
  }
}

/** The payment fields a receipt reads (the contract's `BillingPayment`). */
export type ReceiptPaymentSource = Pick<
  BillingPayment,
  'id' | 'paymentNumber' | 'invoiceId' | 'invoiceNumber' | 'invoiceIvid' | 'matterId' | 'matterNumber' | 'receivedDate' | 'amount' | 'paymentType' | 'referenceNumber' | 'memo' | 'writeOff' | 'sourceSystem'
>

/** The record pieces a receipt reads. */
export interface ReceiptRecordSource {
  client: Pick<BillingRecord['client'], 'displayName' | 'clientNumber'>
  matters: readonly Pick<BillingRecord['matters'][number], 'id' | 'matterNumber' | 'title'>[]
  invoices: readonly Pick<BillingRecord['invoices'][number], 'id' | 'invoiceNumber' | 'ivid' | 'amountDue'>[]
}

/**
 * Builds a payment's receipt from the Billing record, as the old receipt notice built it from the database
 * (`api/_server/krPaymentNotice.ts` `receiptFor`): received from the client, the card label from a Stripe memo, and
 * the invoice's balance now as the balance after (exact for the latest payment on the invoice, as the old receipt).
 * Shared by the web app's receipt print (part 7b) and the API's receipt email (part 7c).
 */
export function receiptFromRecord(payment: ReceiptPaymentSource, record: ReceiptRecordSource, letterhead: LetterheadProfile, receiptDate?: string | Date): PaymentReceiptData {
  const invoice = payment.invoiceId ? record.invoices.find((row) => row.id === payment.invoiceId) ?? null : null
  const matter = record.matters.find((row) => row.id === payment.matterId) ?? null
  const rVal = buildPaymentReceiptData({
    letterhead,
    paymentNumber: payment.paymentNumber || payment.id,
    paymentDate: payment.receivedDate,
    receiptDate,
    receivedFromName: record.client.displayName,
    clientNumber: record.client.clientNumber,
    matterNumber: matter?.matterNumber ?? payment.matterNumber,
    matterTitle: matter?.title ?? '',
    invoiceNumber: invoice?.invoiceNumber ?? payment.invoiceNumber ?? null,
    invoiceIvid: invoice?.ivid ?? payment.invoiceIvid ?? null,
    paymentType: payment.paymentType || 'Payment',
    paymentDetail: stripeCardLabel(payment.memo, payment.sourceSystem),
    reference: payment.referenceNumber || null,
    sourceSystem: payment.sourceSystem,
    amount: payment.amount,
    writeOff: payment.writeOff,
    invoiceBalanceAfter: invoice ? invoice.amountDue : null,
  })
  return rVal
}

/** The payment fields a refund notice reads (the contract's `BillingPayment`). */
export type RefundNoticePaymentSource = Pick<
  BillingPayment,
  'id' | 'paymentNumber' | 'invoiceId' | 'invoiceNumber' | 'invoiceIvid' | 'matterId' | 'matterNumber' | 'receivedDate' | 'amount' | 'paymentType' | 'memo' | 'sourceSystem' | 'voided' | 'voidedAt' | 'refund'
>

/**
 * Builds a voided payment's refund notice from the Billing record (old `refundNoticeFor`): the refund amount (the
 * payment's when Stripe gave none), the refund date (when it was refunded, else the void), the ARN when Stripe has one,
 * and the test flag of a sandbox payment.
 *
 * @returns The notice, or null when the payment is not voided or has no recorded refund (the old
 *   `VALIDATION_PAYMENT_HAS_NO_REFUND`; the caller refuses).
 */
export function refundNoticeFromRecord(payment: RefundNoticePaymentSource, record: Pick<ReceiptRecordSource, 'client' | 'matters' | 'invoices'>, letterhead: LetterheadProfile): PaymentRefundNoticeData | null {
  const refund = payment.refund
  if (!payment.voided || !refund) return null
  const invoice = payment.invoiceId ? record.invoices.find((row) => row.id === payment.invoiceId) ?? null : null
  const matter = record.matters.find((row) => row.id === payment.matterId) ?? null
  const refundedOn = refund.refundedAt ?? payment.voidedAt
  const rVal: PaymentRefundNoticeData = {
    firm: letterhead,
    clientName: record.client.displayName,
    clientNumber: record.client.clientNumber,
    matterNumber: matter?.matterNumber ?? payment.matterNumber,
    paymentNumber: payment.paymentNumber || payment.id,
    paymentDate: payment.receivedDate ? formatLongDate(payment.receivedDate) : '',
    paymentMethod: [payment.paymentType || 'Payment', stripeCardLabel(payment.memo, payment.sourceSystem)].filter(Boolean).join(' · '),
    paymentAmount: payment.amount,
    refundAmount: typeof refund.amount === 'number' ? refund.amount : payment.amount,
    invoiceNumber: invoice?.invoiceNumber ?? payment.invoiceNumber ?? null,
    invoiceIvid: invoice?.ivid ?? payment.invoiceIvid ?? null,
    refundDate: refundedOn ? formatLongDate(refundedOn) : '',
    refundId: refund.id,
    refundStatus: refund.status,
    arn: refund.reference || null,
    arnStatus: refund.referenceStatus,
    isTest: payment.sourceSystem === 'stripe_sandbox',
  }
  return rVal
}
