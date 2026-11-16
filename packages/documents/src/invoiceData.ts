// file: packages/documents/src/invoiceData.ts
/**
 * Maps production Billing tab records into the printable InvoiceReportData
 * model (Template v1). Totals are computed here so the templates only format.
 *
 * Ported from the old `KR-Billing/Invoicing/buildInvoiceReportData.ts` (part 7a of `docs/API/Billing_Audit.md`).
 * Used by the print page (part 7b) and by the API's `send-invoice` PDF (part 7c), so both show the same figures.
 *
 * Changed from the old file:
 *  - The letterhead is passed in (`letterhead`, built from the firm profile by `buildLetterhead`) instead of chosen
 *    by `firmState` from text written in the code (decision B5).
 *  - The inputs are the contract shapes (`BillingInvoice`, `BillingTimeEntry` from `@krhomebase/contracts`) through
 *    `Pick`, so the web app's screen types and the API's rows both fit; the old file imported the screens' types.
 *  - `roundMoney`, `formatLongDate`, `formatShortDate` and `addDaysLong` moved to `format.ts`, and dates are calendar
 *    dates in the firm's time zone (see that file's header). They are re-exported here under their old names.
 *  - `billToEmail` is new: the invoice's bill-to block has an email line (`BillToParty.email`) the old builder never
 *    filled.
 *  - Tax line (the requester, Nov 16, 2026): the invoice's `taxAmount` (from the record; missing reads as 0) is carried
 *    into the report and added to "Total amount", as the API adds it to the invoice total. The old builder had no tax.
 */

import type { BillingInvoice, BillingTimeEntry } from '@krhomebase/contracts'
import { addDaysLong, formatLongDate, formatShortDate, readCalendarDate, isoDateOf, roundMoney } from './format.ts'
import type { InvoiceLineKind, InvoiceReportData, InvoiceReportLine, LetterheadProfile, PayOnlineInfo } from './types.ts'

export { formatLongDate, formatShortDate, roundMoney }

/** The invoice fields the builder reads. The web app's `BillingInvoice` (with `ivid` optional) fits. */
export type InvoiceSource = Pick<
  BillingInvoice,
  'id' | 'matterNumber' | 'invoiceNumber' | 'dateInvoiced' | 'dueDate' | 'clientLabel' | 'amountDue' | 'writeOff' | 'taxAmount' | 'locked' | 'status'
>

/** The time entry fields the builder reads. `staffCode` may be missing (the web app's placeholder rows). */
export type InvoiceEntrySource = Pick<BillingTimeEntry, 'id' | 'date' | 'description' | 'kind' | 'hours' | 'rate' | 'amount' | 'staffId' | 'staff'> & {
  staffCode?: string | null
}

/**
 * Pay-online block before a link exists (print view, samples, previews). The
 * send-invoice route replaces it with the invoice's own pay link
 * (`<pay host>/p/<token>`, issued by krPaymentRequests.ts) for the email and PDF.
 */
export const DEFAULT_INVOICE_PAY_ONLINE: PayOnlineInfo = {
  url: '',
  urlNote: 'Your secure pay link is included when this invoice is emailed.',
}

/** Absolute pay-online URL (`url` is stored without the scheme); '' when the invoice has no link yet. */
export function payOnlineHref(payOnline: PayOnlineInfo): string {
  const raw = payOnline.url.trim()
  if (!raw) return ''
  const rVal = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return rVal
}

/** Fine print printed on every invoice (the licensing sentence is appended from the firm profile). */
export const DEFAULT_INVOICE_FINE_PRINT =
  'Questions about this invoice? Call the office listed above. Fees are billed under your engagement ' +
  'agreement; costs advanced on your behalf appear at the amount we paid.'

/** Totals derived from the detail lines, the invoice's tax and the applied credits. */
export interface InvoiceTotals {
  professionalFeesAndCosts: number
  totalAmount: number
  balanceDue: number
}

/**
 * Sums lines and derives the total and balance due.
 *
 * @param lines Detail lines (fees and costs together).
 * @param otherOutstandingBalances Carried balances, or null when none.
 * @param amountReceived Payments and credits already applied (positive).
 * @param taxAmount Tax charged on the invoice (default 0); added to the total amount.
 */
export function computeInvoiceTotals(
  lines: InvoiceReportLine[],
  otherOutstandingBalances: number | null,
  amountReceived: number,
  taxAmount = 0,
): InvoiceTotals {
  const professionalFeesAndCosts = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0))
  const totalAmount = roundMoney(professionalFeesAndCosts + taxAmount + (otherOutstandingBalances ?? 0))
  const balanceDue = Math.max(0, roundMoney(totalAmount - amountReceived))
  const rVal: InvoiceTotals = { professionalFeesAndCosts, totalAmount, balanceDue }
  return rVal
}

/**
 * Derives the bare staff code printed in the Staff column from a Billing label.
 * Labels arrive as "CODE - Display Name"; the code is the part before " - ".
 * A label without a code falls back to the name's initials (max three letters),
 * so the column never carries a full name into the description.
 */
export function deriveStaffCode(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ''
  const separator = trimmed.indexOf(' - ')
  if (separator > 0 && separator <= 6) {
    const rVal = trimmed.slice(0, separator).trim()
    return rVal
  }
  // A short single token is already a code (e.g. "DK").
  if (!/\s/.test(trimmed) && trimmed.length <= 6) {
    const rVal = trimmed.toUpperCase()
    return rVal
  }
  const rVal = trimmed
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
    .join('')
    .slice(0, 3)
  return rVal
}

/** Maps a Billing entry kind onto the printed line kind. */
function toLineKind(entry: InvoiceEntrySource): InvoiceLineKind {
  const rVal: InvoiceLineKind = entry.kind === 'Flat Fee Service' ? 'Flat Fee' : 'Time'
  return rVal
}

export interface BuildInvoiceReportDataOptions {
  invoice: InvoiceSource
  /** Entries attached to the invoice (already filtered by the caller). */
  entries: readonly InvoiceEntrySource[]
  clientNumber: string
  /** Letterhead, from `buildLetterhead(firmProfile, officeId)`. */
  letterhead: LetterheadProfile
  /** Recipient lines; the Billing tab only knows the client label today. */
  billToAddressLines?: string[]
  /** Recipient email, printed under the address when known. */
  billToEmail?: string
  matterTitle?: string
  responsibleAttorney?: string
  /** Resolves a staff id to the printed code when the entry carries none; receives the entry's UI label as fallback. */
  staffInitialsFor?: (staffId: string, fallback: string) => string
  amountReceived?: number
  amountReceivedNote?: string
  otherOutstandingBalances?: number | null
  /**
   * Every invoice on the client's account. When given (and the two amounts
   * above are not), "Other outstanding balances" and "Less amount received"
   * come from it (see {@link accountAmountsForInvoice}).
   */
  accountInvoices?: readonly InvoiceSource[]
  trustBalanceAfter?: number
  payOnline?: PayOnlineInfo
}

/** "MM/DD/YYYY" or "YYYY-MM-DD" → "YYYY-MM-DD" (sortable); '' when unknown. */
function sortableDate(value: string | null | undefined): string {
  const date = readCalendarDate(value ?? '')
  const rVal = date ? isoDateOf(date) : ''
  return rVal
}

/** True when `other` was issued before `invoice` (invoice date, then invoice number). */
function issuedBefore(other: Pick<InvoiceSource, 'dateInvoiced' | 'invoiceNumber'>, invoice: Pick<InvoiceSource, 'dateInvoiced' | 'invoiceNumber'>): boolean {
  const a = sortableDate(other.dateInvoiced)
  const b = sortableDate(invoice.dateInvoiced)
  if (a && b && a !== b) return a < b
  const rVal = (Number(other.invoiceNumber) || 0) < (Number(invoice.invoiceNumber) || Number.MAX_SAFE_INTEGER)
  return rVal
}

/** The invoice's tax as a non-negative amount (a record without `taxAmount` has none). */
function taxOf(invoice: Pick<InvoiceSource, 'taxAmount'>): number {
  const rVal = Math.max(0, roundMoney(invoice.taxAmount ?? 0))
  return rVal
}

/**
 * Amounts that come from the rest of the account:
 * - `otherOutstandingBalances`: balances still open on the client's other sent
 *   invoices issued before this one (null when none);
 * - `amountReceived`: payments already applied to this invoice (for a partly
 *   or fully paid invoice: fees + tax − write-off − balance).
 */
export function accountAmountsForInvoice(
  invoice: InvoiceSource,
  accountInvoices: readonly InvoiceSource[],
  professionalFeesAndCosts: number,
): { otherOutstandingBalances: number | null; amountReceived: number } {
  const other = roundMoney(accountInvoices
    .filter((row) => row.id !== invoice.id && row.locked && (row.status === 'Unpaid' || row.status === 'Partially paid') && row.amountDue > 0.004 && issuedBefore(row, invoice))
    .reduce((sum, row) => sum + row.amountDue, 0))
  const paid = invoice.status === 'Partially paid' || invoice.status === 'Paid'
  const amountReceived = paid ? Math.max(0, roundMoney(professionalFeesAndCosts + taxOf(invoice) - Math.abs(invoice.writeOff) - invoice.amountDue)) : 0
  const rVal = { otherOutstandingBalances: other > 0 ? other : null, amountReceived }
  return rVal
}

/**
 * Re-derives the totals of a built report from authoritative account amounts
 * (the send-invoice route does this from D1). `amountReceived` includes the
 * write-off, as printed in "Less amount received".
 */
export function applyAccountTotals(report: InvoiceReportData, otherOutstandingBalances: number | null, amountReceived: number): InvoiceReportData {
  const totalAmount = roundMoney(report.professionalFeesAndCosts + (report.taxAmount ?? 0) + (otherOutstandingBalances ?? 0))
  const rVal: InvoiceReportData = {
    ...report,
    otherOutstandingBalances,
    totalAmount,
    amountReceived: roundMoney(amountReceived),
    balanceDue: Math.max(0, roundMoney(totalAmount - amountReceived)),
  }
  return rVal
}

/**
 * Builds the printable invoice model from Billing tab state.
 *
 * The production invoice does not yet store terms, recipient address, the
 * responsible attorney, or a payment link, so defaults are applied and can be
 * overridden by the caller.
 */
export function buildInvoiceReportData({
  invoice,
  entries,
  clientNumber,
  letterhead,
  billToAddressLines = [],
  billToEmail,
  matterTitle = '',
  responsibleAttorney = 'Daniel Krueger',
  staffInitialsFor,
  amountReceived = 0,
  amountReceivedNote,
  otherOutstandingBalances: otherOutstandingInput,
  accountInvoices,
  trustBalanceAfter,
  payOnline = DEFAULT_INVOICE_PAY_ONLINE,
}: BuildInvoiceReportDataOptions): InvoiceReportData {
  const lines: InvoiceReportLine[] = entries.map((entry) => {
    const kind = toLineKind(entry)
    // Prefer the bare code from the API; otherwise let the caller resolve it; never print the UI label.
    const staff =
      entry.staffCode ||
      (staffInitialsFor ? staffInitialsFor(entry.staffId, entry.staff) : deriveStaffCode(entry.staff))
    const rLine: InvoiceReportLine = {
      id: entry.id,
      date: formatShortDate(entry.date),
      staff: staff || undefined,
      description: entry.description,
      kind,
      hours: kind === 'Time' ? entry.hours : undefined,
      rate: kind === 'Time' ? entry.rate : undefined,
      amount: entry.amount,
    }
    return rLine
  })

  // Account amounts (prior open invoices, payments on this one) when the caller passes the account's invoices.
  const fees = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0))
  const account = accountInvoices ? accountAmountsForInvoice(invoice, accountInvoices, fees) : null
  const otherOutstandingBalances = otherOutstandingInput !== undefined ? otherOutstandingInput : account?.otherOutstandingBalances ?? null
  const paymentsReceived = amountReceived || account?.amountReceived || 0
  // A draft write-off reduces what the client owes; it prints inside "Less amount received".
  const received = roundMoney(paymentsReceived + Math.abs(invoice.writeOff))
  const taxAmount = taxOf(invoice)
  const totals = computeInvoiceTotals(lines, otherOutstandingBalances, received, taxAmount)

  const rVal: InvoiceReportData = {
    firm: letterhead,
    invoiceNumber: invoice.invoiceNumber || 'Draft',
    invoiceDate: formatLongDate(invoice.dateInvoiced),
    dueDate: invoice.dueDate ? formatLongDate(invoice.dueDate) : addDaysLong(invoice.dateInvoiced, 30),
    terms: 'Net 30',
    billTo: { name: invoice.clientLabel, addressLines: billToAddressLines, ...(billToEmail ? { email: billToEmail } : {}) },
    matterNumber: invoice.matterNumber,
    matterTitle,
    responsibleAttorney,
    clientNumber,
    lines,
    professionalFeesAndCosts: totals.professionalFeesAndCosts,
    taxAmount,
    otherOutstandingBalances,
    totalAmount: totals.totalAmount,
    amountReceived: received,
    amountReceivedNote,
    balanceDue: totals.balanceDue,
    trustBalanceAfter,
    payOnline,
    finePrint: DEFAULT_INVOICE_FINE_PRINT,
  }
  return rVal
}

/** Inputs for {@link invoiceReportFromRecord}: one invoice and the client's Billing record pieces. */
export interface InvoiceReportFromRecordOptions {
  invoice: InvoiceSource & { entryIds: readonly string[] }
  /** Every entry of the record; only those attached to the invoice are printed. */
  entries: readonly InvoiceEntrySource[]
  clientNumber: string
  staffOptions: readonly { id: string; label: string; staffCode?: string | null }[]
  /** Every invoice on the account: fills "Other outstanding balances" and "Less amount received". */
  accountInvoices?: readonly InvoiceSource[]
  letterhead: LetterheadProfile
  billToEmail?: string
}

/**
 * Builds the printable invoice from the Billing record: attached entries only, the bare staff code for the Staff
 * column (the dropdown label "CODE - Name" stays in the UI). Shared by the web app's print (`printDocuments.client.ts`,
 * part 7b, where this logic began as the old `printInvoiceFromBilling`) and the API's invoice email (part 7c), so the
 * printed and the emailed invoice show the same figures.
 */
export function invoiceReportFromRecord({ invoice, entries, clientNumber, staffOptions, accountInvoices, letterhead, billToEmail }: InvoiceReportFromRecordOptions): InvoiceReportData {
  const attached = entries.filter((entry) => invoice.entryIds.includes(entry.id))
  const rVal = buildInvoiceReportData({
    invoice,
    entries: attached,
    clientNumber,
    letterhead,
    accountInvoices,
    billToEmail,
    staffInitialsFor: (staffId, fallback) => {
      const option = staffOptions.find((candidate) => candidate.id === staffId)
      return option?.staffCode ?? deriveStaffCode(option?.label ?? fallback)
    },
  })
  return rVal
}
