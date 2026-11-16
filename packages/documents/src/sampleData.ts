// file: packages/documents/src/sampleData.ts
/**
 * Sample fixtures for the Reports panel "Billing Documents" samples. The
 * invoice sample carries enough lines to spill onto a second page so the
 * repeating table header and the calculated 11in page break can be checked.
 * The Statement of Account sample follows the P33 Billing Overview columns.
 * Names, matters, and amounts are fictional.
 *
 * Ported from the old `KR-Billing/Invoicing/invoiceSampleData.ts` (part 7a of `docs/API/Billing_Audit.md`). The
 * Document Samples page (part 7b) shows them with the firm's own letterhead.
 *
 * Changed from the old file:
 *  - Each builder takes the letterhead (`buildLetterhead(firmProfile, officeId)`) instead of `'TX' | 'KS'`. The sample
 *    invoice is number 3392 when the letterhead leads with a Kansas office and 3391 otherwise, as before.
 *  - `SAMPLE_FIRM_PROFILE` is new: the old written-in letterhead (McKinney, TX and Pratt, KS) as a firm profile, for
 *    tests and for a sample shown before the firm profile has loaded.
 */

import type { FirmProfile } from '@krhomebase/contracts'
import { DEFAULT_INVOICE_FINE_PRINT, DEFAULT_INVOICE_PAY_ONLINE, computeInvoiceTotals } from './invoiceData.ts'
import { roundMoney } from './format.ts'
import { buildPaymentReceiptData } from './receiptData.ts'
import { DEFAULT_STATEMENT_FINE_PRINT } from './statementData.ts'
import type { InvoiceReportData, InvoiceReportLine, LetterheadProfile, PaymentReceiptData, StatementOfAccountData, StatementOfAccountRow } from './types.ts'

/** The old written-in letterhead (`firmProfiles.ts`) as a firm profile: McKinney, TX (primary) and Pratt, KS. */
export const SAMPLE_FIRM_PROFILE: FirmProfile = {
  firmName: 'Krueger & Richard',
  legalName: 'Krueger & Richard, PLLC',
  tagline: 'Attorneys at Law',
  website: 'www.krueger-richard.com',
  licensingSentence: 'Krueger & Richard, PLLC is licensed in Texas, Kansas, and Oklahoma.',
  officeEmail: 'service@krueger-richard.com',
  officePhone: '972-688-6760',
  timeZone: 'America/Chicago',
  matterNumberFormat: '[000]-LName,FName',
  locations: [
    { id: 'sample-office-mckinney', name: 'McKinney', addressLine1: '2530 Eldorado Pkwy', addressLine2: 'Ste 110', city: 'McKinney', state: 'TX', postalCode: '75070', phone: '972.688.6760', email: '', isPrimary: true, badgeLabel: '' },
    { id: 'sample-office-pratt', name: 'Pratt', addressLine1: '209 S Main St', addressLine2: '', city: 'Pratt', state: 'KS', postalCode: '67124', phone: '620.979.9077', email: '', isPrimary: false, badgeLabel: '' },
  ],
}

const SAMPLE_PARTY = {
  name: 'Margaret Ellison',
  addressLines: ['1418 Wilson Creek Pkwy', 'McKinney, TX 75069'],
}

/** Builds a realistic multi-page set of detail lines. */
function buildSampleLines(): InvoiceReportLine[] {
  const timeWork: Array<[string, string, string, number, number]> = [
    ['08/03/2026', 'DLK', 'Initial estate planning conference; reviewed family and asset summary', 1.5, 350],
    ['08/04/2026', 'DLK', 'Reviewed prior wills, deeds, and beneficiary designations provided by client', 1.2, 350],
    ['08/05/2026', 'MRR', 'Drafted revocable living trust agreement and pour-over will', 3.4, 325],
    ['08/06/2026', 'MRR', 'Drafted durable power of attorney, medical power of attorney, and HIPAA authorization', 1.8, 325],
    ['08/07/2026', 'DLK', 'Telephone conference with client regarding successor trustee selection', 0.4, 350],
    ['08/10/2026', 'DLM', 'Prepared trust funding memorandum and account retitling instructions', 1.6, 175],
    ['08/11/2026', 'MRR', 'Revised trust distribution provisions per client email', 1.1, 325],
    ['08/12/2026', 'DLK', 'Reviewed and finalized draft documents; prepared execution checklist', 1.3, 350],
    ['08/13/2026', 'DLM', 'Prepared Lady Bird deed — homestead, Collin County; ordered title information', 1.4, 175],
    ['08/14/2026', 'DLK', 'Signing conference; supervised execution and notarization of all documents', 1.5, 350],
    ['08/17/2026', 'DLM', 'Recorded deed with county clerk; assembled executed originals for binder', 0.9, 175],
    ['08/18/2026', 'MRR', 'Letters to financial institutions regarding trust ownership and TOD changes', 0.8, 325],
    ['08/19/2026', 'DLK', "Telephone conference with client's financial advisor regarding IRA beneficiary designations", 0.6, 350],
    ['08/20/2026', 'DLM', 'Follow-up with county clerk on recording confirmation; updated funding tracker', 0.5, 175],
    ['08/21/2026', 'MRR', 'Drafted certification of trust for bank and brokerage accounts', 0.7, 325],
    ['08/24/2026', 'DLK', 'Reviewed completed funding schedule with client; discussed remaining items', 0.8, 350],
    ['08/25/2026', 'DLM', 'Scanned executed documents to client portal; prepared delivery letter', 0.6, 175],
    ['08/26/2026', 'MRR', 'Reviewed life insurance ownership and beneficiary forms', 0.5, 325],
    ['08/27/2026', 'DLK', 'Conference with client regarding gifting strategy for grandchildren', 0.9, 350],
    ['08/28/2026', 'DLM', 'Prepared summary of estate plan for client binder', 1.0, 175],
    ['08/31/2026', 'MRR', 'Final review of binder contents and funding confirmations', 0.6, 325],
    ['09/01/2026', 'DLK', 'Email correspondence with client regarding out-of-state property', 0.3, 350],
    ['09/02/2026', 'MRR', 'Research on ancillary probate avoidance for Kansas farmland', 1.2, 325],
    ['09/03/2026', 'DLK', 'Telephone conference with client; recommended Kansas transfer-on-death deed', 0.5, 350],
    ['09/04/2026', 'DLM', 'Prepared Kansas transfer-on-death deed and recording package', 1.1, 175],
    ['09/08/2026', 'MRR', 'Reviewed TOD deed; coordinated execution with Pratt office', 0.4, 325],
    ['09/09/2026', 'DLK', 'Reviewed final funding status; closed planning phase', 0.5, 350],
  ]

  const lines: InvoiceReportLine[] = timeWork.map(([date, staff, description, hours, rate], index) => ({
    id: `sample-time-${index + 1}`,
    date,
    staff,
    description,
    kind: 'Time',
    hours,
    rate,
    amount: roundMoney(hours * rate),
  }))

  // Flat fee with no staff member assigned and two advanced costs.
  lines.push({
    id: 'sample-fee-1',
    date: '08/14/2026',
    description:
      'Flat fee — revocable living trust package: trust agreement, pour-over wills, durable powers of attorney, medical powers of attorney, HIPAA authorizations',
    kind: 'Flat Fee',
    amount: 1250,
  })
  lines.push({
    id: 'sample-cost-1',
    date: '08/17/2026',
    staff: 'DLM',
    description: 'Recording fee, Collin County Clerk (cost advanced)',
    kind: 'Cost',
    amount: 38,
  })
  lines.push({
    id: 'sample-cost-2',
    date: '09/08/2026',
    staff: 'DLM',
    description: 'Recording fee, Pratt County Register of Deeds (cost advanced)',
    kind: 'Cost',
    amount: 21,
  })

  const rVal = lines
  return rVal
}

/** Sample invoice with the given letterhead. */
export function buildSampleInvoice(letterhead: LetterheadProfile): InvoiceReportData {
  const lines = buildSampleLines()
  const amountReceived = 1500
  const totals = computeInvoiceTotals(lines, null, amountReceived)

  const rVal: InvoiceReportData = {
    firm: letterhead,
    invoiceNumber: letterhead.state === 'KS' ? '3392' : '3391',
    invoiceDate: 'September 23, 2026',
    dueDate: 'October 23, 2026',
    terms: 'Net 30',
    billTo: SAMPLE_PARTY,
    matterNumber: '120.1',
    matterTitle: 'Revocable Living Trust Package',
    responsibleAttorney: 'Daniel Krueger',
    clientNumber: '120',
    lines,
    professionalFeesAndCosts: totals.professionalFeesAndCosts,
    otherOutstandingBalances: null,
    totalAmount: totals.totalAmount,
    amountReceived,
    amountReceivedNote: 'Payment received September 23, 2026',
    balanceDue: totals.balanceDue,
    trustBalanceAfter: 0,
    payOnline: DEFAULT_INVOICE_PAY_ONLINE,
    finePrint: DEFAULT_INVOICE_FINE_PRINT,
  }
  return rVal
}

/**
 * Sample Statement of Account with the given letterhead. Rows follow the P33 Billing Overview: the Number column is
 * the matter number (client 120 → general matter 120.0, then 120.1, 120.2 …) and the description carries the
 * invoice/payment detail on separate lines; write-offs post to Payments.
 */
export function buildSampleStatement(letterhead: LetterheadProfile): StatementOfAccountData {
  const openingBalance = 0
  const rows: StatementOfAccountRow[] = [
    {
      id: 'soa-1',
      date: '05/01/2025',
      matterNumber: '120.2',
      description: 'Invoice 324 - Work through May 01, 2025 - sent · ✓ Paid\nPaid $4,356.00 05/15/2025\nWrite Off -$300.00 05/20/2025',
      charges: 4356,
      balance: 4356,
    },
    {
      id: 'soa-2',
      date: '05/15/2025',
      matterNumber: '120.2',
      description: 'Payment Received - Inv #324\nCheck · Invoice date 05/01/2025',
      payments: 4356,
      balance: 0,
    },
    {
      id: 'soa-3',
      date: '05/20/2025',
      matterNumber: '120.2',
      description: 'Write Off - Invoice #324 - Courtesy adjustment\napproved by Daniel Krueger · see Invoice #324',
      payments: 300,
      balance: -300,
    },
    {
      id: 'soa-4',
      date: '06/03/2025',
      matterNumber: '120.0',
      description: 'Payment Received - Other\nACH · No invoice attached',
      payments: 750,
      balance: -1050,
    },
    {
      id: 'soa-5',
      date: '06/10/2025',
      matterNumber: '120.1',
      description: 'Transfer from Trust Account',
      payments: 1200,
      balance: -2250,
    },
    {
      id: 'soa-6',
      date: '09/23/2026',
      matterNumber: '120.1',
      description: 'Invoice 3391 - Work through September 09, 2026 - sent',
      charges: 9289,
      balance: 7039,
    },
  ]
  const chargesThisPeriod = roundMoney(rows.reduce((sum, row) => sum + (row.charges ?? 0), 0))
  const paymentsAndCredits = roundMoney(rows.reduce((sum, row) => sum + (row.payments ?? 0), 0))
  const closingBalance = roundMoney(openingBalance + chargesThisPeriod - paymentsAndCredits)

  const rVal: StatementOfAccountData = {
    firm: letterhead,
    statementDate: 'September 23, 2026',
    dueDate: 'October 23, 2026',
    periodLabel: 'May 1, 2025 – September 23, 2026',
    periodStart: '05/01/2025',
    periodEnd: '09/23/2026',
    accountHolder: SAMPLE_PARTY,
    clientNumber: '120',
    matters: [
      { matterNumber: '120.0', title: 'General Matter' },
      { matterNumber: '120.1', title: 'Revocable Living Trust Package' },
      { matterNumber: '120.2', title: 'Estate Administration' },
    ],
    responsibleAttorney: 'Daniel Krueger',
    openingBalance,
    rows,
    chargesThisPeriod,
    paymentsAndCredits,
    closingBalance,
    trustRows: [
      { id: 'trust-1', date: '05/28/2025', activity: 'Client funds received (check)', deposits: 1200, held: 1200 },
      { id: 'trust-2', date: '06/10/2025', activity: 'Transfer to operating - 120.1', applied: -1200, held: 0 },
    ],
    aging: { current: closingBalance, days1to30: 0, days31to60: 0, days60plus: 0, total: closingBalance },
    payOnline: { url: 'buy.stripe.com/…', urlNote: "your account's payment link" },
    finePrint: DEFAULT_STATEMENT_FINE_PRINT,
  }
  return rVal
}

/** Sample Payment Receipt: a card payment applied to invoice 3391 (the sample invoice). */
export function buildSampleReceipt(letterhead: LetterheadProfile): PaymentReceiptData {
  const rVal = buildPaymentReceiptData({
    letterhead,
    paymentNumber: '1790480990196',
    paymentDate: '09/23/2026',
    receiptDate: '2026-09-23T15:00:00Z',
    receivedFromName: SAMPLE_PARTY.name,
    receivedFromLines: SAMPLE_PARTY.addressLines,
    clientNumber: '120',
    matterNumber: '120.1',
    matterTitle: 'Revocable Living Trust Package',
    invoiceNumber: '3391',
    invoiceIvid: 'K7M2Q9A',
    paymentType: 'Credit card',
    paymentDetail: 'Visa •••• 4242',
    reference: 'pi_3SampleSamplePI',
    sourceSystem: 'stripe_live',
    amount: 4000,
    writeOff: 289,
    invoiceBalanceAfter: 5000,
  })
  return rVal
}
