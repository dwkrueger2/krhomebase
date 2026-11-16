// file: packages/documents/src/receiptData.ts
/**
 * Builds the Payment Receipt model (`PaymentReceiptData`) from a recorded
 * payment. Pure: used by the send-receipt route (from database rows) and by
 * the Billing Document Samples fixture.
 *
 * Ported from the old `KR-Billing/Invoicing/buildPaymentReceiptData.ts` (part 7a of `docs/API/Billing_Audit.md`).
 * Used by the print page's receipt (part 7b), the receipt notice and the paid-link webhook's receipt (parts 7c, 7d).
 *
 * Changed from the old file: the letterhead is passed in (`letterhead`, from `buildLetterhead`) instead of
 * `firmState` (decision B5), and the receipt date (now, unless given) is its date in the firm's time zone
 * (`format.ts`).
 */

import { formatLongDate, roundMoney } from './format.ts'
import type { LetterheadProfile, PaymentReceiptData } from './types.ts'

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
