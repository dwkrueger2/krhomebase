// file: packages/documents/src/types.ts
/**
 * Data contracts for printable billing documents (invoice Option 1 / Option 2
 * and the Statement of Account), modeled on the 2026-09 Template v1 PDFs.
 * These are presentation models: buildInvoiceReportData.ts maps production
 * Billing records into them and invoiceSampleData.ts supplies fixtures.
 *
 * Ported from the old `hb-components/KR-Billing/Invoicing/invoiceReportTypes.ts` (part 7a of
 * `docs/API/Billing_Audit.md`). The builders are now `invoiceData.ts`, `statementData.ts` and `receiptData.ts`, and
 * the fixtures `sampleData.ts`, in this package.
 *
 * Changed from the old file:
 *  - The letterhead types are `LetterheadProfile` and `LetterheadOffice` (old `FirmProfile` and `FirmOffice`), so they
 *    are not confused with the firm profile settings row (`FirmProfile` in `@krhomebase/contracts`), which they are now
 *    built from (`letterhead.ts`, decision B5).
 *  - `FirmState` was the fixed pair `'TX' | 'KS'`; an office is now any firm location, so `state` is its two-letter
 *    state and `officeId` names the location the letterhead leads with.
 */

/** Visual template. Option 1 is the navy-banner layout; Option 2 is the centered lockup layout. */
export type InvoiceTemplateOption = 'option-1' | 'option-2'

/** One office line on the letterhead, e.g. "MCKINNEY, TX · 2530 Eldorado Pkwy … · 972.688.6760". */
export interface LetterheadOffice {
  cityState: string
  address: string
  phone: string
}

/** Letterhead details (built from the firm profile by `buildLetterhead`). */
export interface LetterheadProfile {
  /** The firm location the letterhead leads with (its badge, its checks address). */
  officeId: string
  /** Two-letter state of that office, e.g. "TX" (also `data-kr-firm-state` on the printed document). */
  state: string
  /** Badge text, e.g. "Texas". */
  stateName: string
  firmName: string
  legalName: string
  tagline: string
  /** Every office with an address; the leading office first. */
  offices: LetterheadOffice[]
  website: string
  /** Office that receives mailed checks, e.g. "McKinney, TX". */
  checksOffice: string
  /** Licensing sentence for the fine print. */
  licensedIn: string
}

/** Recipient block. */
export interface BillToParty {
  name: string
  addressLines: string[]
  email?: string
}

/** Kind of charge on an invoice line; costs and flat fees may have no staff member. */
export type InvoiceLineKind = 'Time' | 'Flat Fee' | 'Cost'

/** One detail row on the invoice. */
export interface InvoiceReportLine {
  id: string
  date: string
  /** Timekeeper initials; omitted for costs and unassigned flat fees. */
  staff?: string
  description: string
  kind: InvoiceLineKind
  /** Decimal hours; only for `Time` lines (appended to the description in print). */
  hours?: number
  /** Hourly rate; omitted when it does not apply (printed as an em dash). */
  rate?: number
  amount: number
}

/** Online payment block. The QR code is a placeholder until the Stripe link is wired. */
export interface PayOnlineInfo {
  /** Display form of the link, e.g. "invoice.stripe.com/i/…". */
  url: string
  /** Parenthetical after the link, e.g. "unique link for this invoice". */
  urlNote: string
  /** QR code of the link as a data: URI (SVG), set by send-invoice for the PDF. */
  qrDataUri?: string
}

/** Everything a rendered invoice needs. Totals are precomputed so templates only format. */
export interface InvoiceReportData {
  firm: LetterheadProfile
  invoiceNumber: string
  /** Long-form dates as printed, e.g. "September 23, 2026". */
  invoiceDate: string
  dueDate: string
  terms: string
  billTo: BillToParty
  matterNumber: string
  matterTitle: string
  responsibleAttorney: string
  clientNumber: string
  lines: InvoiceReportLine[]
  /** Sum of every line (fees and costs). */
  professionalFeesAndCosts: number
  /** Balances carried from earlier invoices; null prints an em dash. */
  otherOutstandingBalances: number | null
  /** professionalFeesAndCosts + otherOutstandingBalances. */
  totalAmount: number
  /** Payments and credits already applied (positive number). */
  amountReceived: number
  /** Explanation under "Less amount received", e.g. "Payment received September 23, 2026". */
  amountReceivedNote?: string
  /** totalAmount - amountReceived, floored at zero. */
  balanceDue: number
  /** Client trust balance after this invoice; omitted rows are not printed. */
  trustBalanceAfter?: number
  payOnline: PayOnlineInfo
  /** Fine print above the footer. */
  finePrint: string
}

/**
 * One posted row on the Statement of Account (P33 Billing Overview columns).
 * The Number column is the matter number only — client number plus matter
 * suffix, e.g. "120.0" (general matter, assigned automatically) or "120.2".
 * Everything else (invoice number, payment method, approvals) belongs in the
 * description, which may contain newlines.
 */
export interface StatementOfAccountRow {
  id: string
  date: string
  /** Matter number, e.g. "120.2". */
  matterNumber: string
  /** P33-style description; newlines are preserved in print. */
  description: string
  charges?: number
  /** Payments and credits, write-offs included (positive number). */
  payments?: number
  balance: number
}

/** Trust account activity shown under the statement. */
export interface StatementTrustRow {
  id: string
  date: string
  activity: string
  deposits?: number
  applied?: number
  held: number
}

/** Aging buckets. */
export interface StatementAging {
  current: number
  days1to30: number
  days31to60: number
  days60plus: number
  total: number
}

/** Everything a rendered Statement of Account needs. */
export interface StatementOfAccountData {
  firm: LetterheadProfile
  statementDate: string
  dueDate: string
  /** Period text as printed, e.g. "July 1 – September 23, 2026". */
  periodLabel: string
  periodStart: string
  periodEnd: string
  accountHolder: BillToParty
  /** Three-digit (later four-digit) client number, e.g. "120". */
  clientNumber: string
  /** Matters covered by the statement; "<client>.0" is the general matter. */
  matters: Array<{ matterNumber: string; title: string }>
  responsibleAttorney: string
  openingBalance: number
  rows: StatementOfAccountRow[]
  chargesThisPeriod: number
  paymentsAndCredits: number
  closingBalance: number
  trustRows: StatementTrustRow[]
  aging: StatementAging
  payOnline: PayOnlineInfo
  finePrint: string
}

/**
 * Everything a rendered Payment Receipt needs (PaymentReceiptReport, the
 * receipt email, and its PDF). Built by buildPaymentReceiptData.ts from the
 * recorded payment; amounts are dollars.
 */
export interface PaymentReceiptData {
  firm: LetterheadProfile
  /** Payment number, e.g. "1790480990196". */
  receiptNumber: string
  /** Long-form dates as printed. */
  receiptDate: string
  paymentDate: string
  receivedFrom: BillToParty
  clientNumber: string
  matterNumber: string
  matterTitle: string
  /** Invoice the payment was applied to; null for an unapplied payment. */
  invoiceNumber: string | null
  /** Public seven-character invoice id (ivid). */
  invoiceIvid: string | null
  /** e.g. "Credit card · Visa •••• 4242", "Check", "ACH". */
  paymentMethod: string
  /** Check number, wire reference, or processor reference (pi_…). */
  reference: string | null
  /** "Stripe" / "Stripe (sandbox — test payment)" for processed cards; null otherwise. */
  processor: string | null
  amount: number
  /** Write-off approved with the payment (positive magnitude). */
  writeOff: number
  /** Invoice balance before and after this payment; null when not applied to an invoice. */
  invoiceBalanceBefore: number | null
  invoiceBalanceAfter: number | null
  /** True for sandbox (test) payments: the receipt says no money moved. */
  isTest: boolean
  finePrint: string
}

/** The stable payment details projection shown by the posted-payment receipt dialog. */
export interface PaymentDetails {
  receiptNumber: string
  paymentDate: string
  receivedFrom: string
  clientNumber: string
  matterNumber: string
  matterTitle: string
  appliedTo: string
  paymentMethod: string
  processor: string | null
  reference: string | null
  amountReceived: number
  invoiceBalanceBefore: number | null
  invoiceBalanceAfter: number | null
  isTest: boolean
}
