// file: packages/documents/src/documents.test.ts
/**
 * The document core (Billing part 7a): formatters, calendar dates in the firm's time zone, the file name rule, the
 * letterhead built from the firm profile (it must print the old written-in letterhead from the same facts), and the
 * three builders (invoice, statement, receipt) with the sample documents. Made-up data only.
 *
 * Run: pnpm --dir packages/documents exec vitest run src/documents.test.ts
 */

import { DEFAULT_FIRM_PROFILE, FirmProfile, type BillingInvoice, type BillingTimeEntry } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { buildInvoiceFileBaseName, formatFileAmount, formatInvoiceNumberForFile } from './fileName.ts'
import { addDaysLong, formatHoursSuffix, formatLongDate, formatMoney, formatMoneyOrDash, formatRateOrDash, formatShortDate, readCalendarDate } from './format.ts'
import { applyAccountTotals, buildInvoiceReportData, deriveStaffCode, payOnlineHref } from './invoiceData.ts'
import { buildLetterhead, formatLetterheadPhone, letterheadChoices, officeBadge } from './letterhead.ts'
import { buildPaymentReceiptData } from './receiptData.ts'
import { SAMPLE_FIRM_PROFILE, buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from './sampleData.ts'
import { buildStatementOfAccountData } from './statementData.ts'

const TX = buildLetterhead(SAMPLE_FIRM_PROFILE)
const KS = buildLetterhead(SAMPLE_FIRM_PROFILE, 'sample-office-pratt')

describe('formatters', () => {
  it('formats money, rates and hours as the templates print them', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(-1500)).toBe('−$1,500.00')
    expect(formatMoneyOrDash(null)).toBe('—')
    expect(formatMoneyOrDash(0)).toBe('$0.00')
    expect(formatRateOrDash(undefined)).toBe('—')
    expect(formatRateOrDash(350)).toBe('$350.00')
    expect(formatHoursSuffix(1.5)).toBe(' — 1.50 hrs')
    expect(formatHoursSuffix(0)).toBe('')
  })

  it('reads date texts as calendar dates and instants in the firm time zone', () => {
    expect(formatLongDate('09/23/2026')).toBe('September 23, 2026')
    // A plain ISO date is not UTC midnight (the old helper printed September 22 in Texas).
    expect(formatLongDate('2026-09-23')).toBe('September 23, 2026')
    // 10:30pm in Texas is already the next day in UTC; the firm's date is still the 23rd.
    expect(formatLongDate(new Date('2026-09-24T03:30:00Z'))).toBe('September 23, 2026')
    expect(formatShortDate('2026-09-24T03:30:00Z')).toBe('09/23/2026')
    expect(formatShortDate('not a date')).toBe('not a date')
    expect(readCalendarDate('02/30/2026')).toBeNull()
    expect(addDaysLong('01/31/2026', 30)).toBe('March 2, 2026')
  })
})

describe('file name', () => {
  it('builds the old example and keeps the length and character rules', () => {
    expect(buildInvoiceFileBaseName({ invoiceNumber: 3, status: 'sent', date: '2026-09-24T22:10:00Z', clientNumber: '306', firstName: 'Dan', lastName: 'Krueger', amount: 0 })).toBe(
      'INV-0003 (sent) 2026-09-24 [306] Krueger, Dan - $0.00 - Krueger-Richard',
    )
    expect(formatInvoiceNumberForFile('A-12')).toBe('A-12')
    expect(formatFileAmount(-1234.5)).toBe('-$1,234.50')
    const long = buildInvoiceFileBaseName({ invoiceNumber: 12, status: 'sent', date: '2026-01-02T12:00:00Z', clientNumber: '501', displayName: 'Smith/Jones: ' + 'x'.repeat(200), amount: 10 })
    expect(long.length).toBe(110)
    expect(long).toContain('[501] Smith_Jones_ x')
  })
})

describe('letterhead from the firm profile', () => {
  it('prints the old written-in letterhead from the same facts', () => {
    // Old `FIRM_PROFILES.TX` and `.KS` (KR-Billing/Invoicing/firmProfiles.ts).
    const mckinney = { cityState: 'MCKINNEY, TX', address: '2530 Eldorado Pkwy, Ste 110, McKinney, TX 75070', phone: '972.688.6760' }
    const pratt = { cityState: 'PRATT, KS', address: '209 S Main St, Pratt, KS 67124', phone: '620.979.9077' }
    const common = { firmName: 'Krueger & Richard', legalName: 'Krueger & Richard, PLLC', tagline: 'Attorneys at Law', website: 'www.krueger-richard.com', licensedIn: 'Krueger & Richard, PLLC is licensed in Texas, Kansas, and Oklahoma.' }
    expect(TX).toEqual({ ...common, officeId: 'sample-office-mckinney', state: 'TX', stateName: 'Texas', offices: [mckinney, pratt], checksOffice: 'McKinney, TX' })
    expect(KS).toEqual({ ...common, officeId: 'sample-office-pratt', state: 'KS', stateName: 'Kansas', offices: [pratt, mckinney], checksOffice: 'Pratt, KS' })
    expect(letterheadChoices(SAMPLE_FIRM_PROFILE)).toEqual([
      { officeId: 'sample-office-mckinney', label: 'Texas' },
      { officeId: 'sample-office-pratt', label: 'Kansas' },
    ])
  })

  it('uses the badge label, leaves out offices with no address, and dots ten-digit phones', () => {
    expect(officeBadge({ badgeLabel: ' Lone Star ', state: 'TX' })).toBe('Lone Star')
    expect(officeBadge({ badgeLabel: '', state: 'zz' })).toBe('ZZ')
    expect(formatLetterheadPhone('(620) 979-9077')).toBe('620.979.9077')
    expect(formatLetterheadPhone('+1 972-688-6760')).toBe('972.688.6760')
    expect(formatLetterheadPhone('ext. 12')).toBe('ext. 12')
    // The built-in profile has no addresses yet: the primary office still gives the badge, no office lines print.
    const builtIn = buildLetterhead(DEFAULT_FIRM_PROFILE, 'unknown-office')
    expect(builtIn).toMatchObject({ officeId: 'firm-location-primary', state: 'TX', stateName: 'Texas', offices: [], checksOffice: 'TX' })
  })

  it('reads a stored profile from before the letterhead fields with their defaults', () => {
    const { legalName, tagline, website, licensingSentence, ...older } = SAMPLE_FIRM_PROFILE
    const parsed = FirmProfile.parse({ ...older, locations: older.locations.map(({ badgeLabel, ...location }) => location) })
    expect(parsed).toEqual(SAMPLE_FIRM_PROFILE)
    expect([legalName, tagline, website, licensingSentence].every(Boolean)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Invoice

const invoice = (over: Partial<BillingInvoice> = {}): BillingInvoice => ({
  id: 'inv-2',
  matterId: 'm-1',
  matterNumber: '120.1',
  invoiceNumber: '42',
  dateInvoiced: '01/15/2026',
  dueDate: '',
  clientLabel: 'Ellison, Margaret',
  amountDue: 500,
  writeOff: 0,
  ivid: 'ABC1234',
  locked: false,
  status: 'Unpaid',
  entryIds: [],
  ...over,
})

const entry = (over: Partial<BillingTimeEntry>): BillingTimeEntry => ({
  id: 'te-1',
  matterId: 'm-1',
  date: '01/10/2026',
  matterNumber: '120.1',
  description: 'Work',
  activityCategory: '',
  kind: 'Time',
  hours: 1,
  rate: 300,
  amount: 300,
  billingStatus: 'Billed',
  staffId: 's-1',
  staff: 'DLK - Daniel Example',
  staffCode: null,
  internalTimeTracked: false,
  invoiceId: 'inv-2',
  bcid: null,
  ...over,
})

describe('invoice builder', () => {
  it('builds lines, staff codes, due date and totals', () => {
    const report = buildInvoiceReportData({
      invoice: invoice({ writeOff: -50 }),
      entries: [entry({}), entry({ id: 'te-2', kind: 'Flat Fee Service', staff: 'Mary Rose Example', amount: 250.005, hours: 0, rate: 0 }), entry({ id: 'te-3', staffCode: 'XY' })],
      clientNumber: '120',
      letterhead: TX,
      billToEmail: 'client@example.com',
    })
    expect(report.lines.map((line) => [line.staff, line.kind, line.hours, line.rate])).toEqual([
      ['DLK', 'Time', 1, 300],
      ['MRE', 'Flat Fee', undefined, undefined],
      ['XY', 'Time', 1, 300],
    ])
    expect(report).toMatchObject({ invoiceNumber: '42', invoiceDate: 'January 15, 2026', dueDate: 'February 14, 2026', terms: 'Net 30', clientNumber: '120' })
    expect(report.billTo).toEqual({ name: 'Ellison, Margaret', addressLines: [], email: 'client@example.com' })
    expect(report.professionalFeesAndCosts).toBe(850.01)
    // The draft write-off prints inside "Less amount received".
    expect(report.amountReceived).toBe(50)
    expect(report.balanceDue).toBe(800.01)
    expect(deriveStaffCode('dk')).toBe('DK')
  })

  it('takes earlier open invoices and payments on this one from the account', () => {
    const current = invoice({ status: 'Partially paid', amountDue: 100, locked: true })
    const account = [
      current,
      invoice({ id: 'inv-1', invoiceNumber: '41', dateInvoiced: '12/15/2025', locked: true, status: 'Unpaid', amountDue: 75.5 }),
      invoice({ id: 'inv-0', invoiceNumber: '40', dateInvoiced: '11/15/2025', locked: false, status: 'Unpaid', amountDue: 999 }),
      invoice({ id: 'inv-3', invoiceNumber: '43', dateInvoiced: '02/15/2026', locked: true, status: 'Unpaid', amountDue: 999 }),
    ]
    const report = buildInvoiceReportData({ invoice: current, entries: [entry({ amount: 300 })], clientNumber: '120', letterhead: TX, accountInvoices: account })
    expect(report.otherOutstandingBalances).toBe(75.5)
    expect(report.totalAmount).toBe(375.5)
    expect(report.amountReceived).toBe(200)
    expect(report.balanceDue).toBe(175.5)
    expect(applyAccountTotals(report, null, 400).balanceDue).toBe(0)
    expect(payOnlineHref({ url: 'pay.example.com/p/abc', urlNote: '' })).toBe('https://pay.example.com/p/abc')
  })

  it('adds the invoice tax to the total (tax line, Nov 16, 2026)', () => {
    // A draft with tax: 300 in fees + 24.75 tax − 50 write-off.
    const draft = buildInvoiceReportData({ invoice: invoice({ taxAmount: 24.75, writeOff: -50 }), entries: [entry({})], clientNumber: '120', letterhead: TX })
    expect(draft.professionalFeesAndCosts).toBe(300)
    expect(draft.taxAmount).toBe(24.75)
    expect(draft.totalAmount).toBe(324.75)
    expect(draft.balanceDue).toBe(274.75)
    // No tax on the record (an older reply) reads as 0.
    const untaxed = buildInvoiceReportData({ invoice: invoice(), entries: [entry({})], clientNumber: '120', letterhead: TX })
    expect(untaxed.taxAmount).toBe(0)
    expect(untaxed.totalAmount).toBe(300)
    // A partly paid taxed invoice: received = fees + tax − balance (324.75 − 100).
    const paid = invoice({ taxAmount: 24.75, status: 'Partially paid', amountDue: 100, locked: true })
    const report = buildInvoiceReportData({ invoice: paid, entries: [entry({})], clientNumber: '120', letterhead: TX, accountInvoices: [paid] })
    expect(report.amountReceived).toBe(224.75)
    expect(report.balanceDue).toBe(100)
    // The send route's re-derivation keeps the tax in the total.
    expect(applyAccountTotals(report, 10, 224.75)).toMatchObject({ totalAmount: 334.75, balanceDue: 110 })
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Statement

describe('statement builder', () => {
  it('runs the balance, counts write-offs as payments, leaves out empty and voided rows, and ages open invoices', () => {
    const statement = buildStatementOfAccountData({
      clientNumber: '120',
      clientDisplayName: 'Margaret Ellison',
      matters: [{ matterNumber: '120.0', title: 'General' }, { matterNumber: '120.1', title: 'Trust' }],
      ledgerEntries: [
        { id: 'l0', date: '', description: 'Sample Row - No Entries Found', isEmpty: true },
        { id: 'l1', date: '01/02/2026', description: 'Invoice 41', charges: 1000, matterNumber: '120.1' },
        { id: 'l2', date: '01/05/2026', description: 'Payment', payments: 400, writeOff: -50, matterNumber: '120.1' },
        { id: 'l3', date: '01/06/2026', description: 'Voided payment', payments: 900, matterNumber: '120.1', voided: true },
        { id: 'l4', date: '01/07/2026', description: 'Other matter', charges: 10, matterNumber: '120.0' },
      ],
      trustEntries: [
        { id: 't1', date: '01/03/2026', description: 'Deposit', fundsReceived: 500, fundsDispersed: 0, balance: 500, matterNumber: '120.1' },
        { id: 't2', date: '01/04/2026', description: 'Request only', fundsReceived: 0, fundsDispersed: 0, balance: 500, matterNumber: '120.1' },
      ],
      invoices: [
        { status: 'Unpaid', amountDue: 100, matterNumber: '120.1', dueDate: '03/31/2026', dateInvoiced: '03/01/2026' },
        { status: 'Unpaid', amountDue: 20, matterNumber: '120.1', dueDate: '03/01/2026', dateInvoiced: '02/01/2026' },
        { status: 'Partially paid', amountDue: 30, matterNumber: '120.1', dueDate: '02/01/2026', dateInvoiced: '01/01/2026' },
        { status: 'Unpaid', amountDue: 40, matterNumber: '120.1', dueDate: '12/01/2025', dateInvoiced: '11/01/2025' },
        { status: 'Void', amountDue: 999, matterNumber: '120.1', dueDate: '12/01/2025', dateInvoiced: '11/01/2025' },
        { status: 'Unpaid', amountDue: 5, matterNumber: '120.0', dueDate: '12/01/2025', dateInvoiced: '11/01/2025' },
      ],
      matterFilter: '120.1',
      letterhead: KS,
      // 10:30pm in Texas on March 31 is April 1 in UTC; the statement is dated March 31.
      statementDate: new Date('2026-04-01T03:30:00Z'),
    })
    expect(statement.rows.map((row) => [row.id, row.charges, row.payments, row.balance])).toEqual([
      ['l1', 1000, undefined, 1000],
      ['l2', undefined, 450, 550],
    ])
    expect(statement).toMatchObject({ chargesThisPeriod: 1000, paymentsAndCredits: 450, closingBalance: 550, statementDate: 'March 31, 2026', dueDate: 'April 30, 2026' })
    expect(statement.periodLabel).toBe('January 2, 2026 – March 31, 2026')
    expect(statement.matters).toEqual([{ matterNumber: '120.1', title: 'Trust' }])
    expect(statement.aging).toEqual({ current: 100, days1to30: 20, days31to60: 30, days60plus: 40, total: 190 })
    expect(statement.trustRows).toEqual([{ id: 't1', date: '01/03/2026', activity: 'Deposit', deposits: 500, applied: undefined, held: 500 }])
    expect(statement.firm.stateName).toBe('Kansas')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Receipt and samples

describe('receipt builder', () => {
  it('works out the balance before and marks sandbox payments as tests', () => {
    const receipt = buildPaymentReceiptData({
      letterhead: TX,
      paymentNumber: '1001',
      paymentDate: '2026-02-03',
      receiptDate: new Date('2026-02-04T02:00:00Z'),
      receivedFromName: 'Margaret Ellison',
      clientNumber: '120',
      matterNumber: '120.1',
      paymentType: 'Credit card',
      paymentDetail: 'Visa •••• 4242',
      sourceSystem: 'stripe_sandbox',
      amount: 100,
      writeOff: -10,
      invoiceBalanceAfter: 25,
    })
    expect(receipt).toMatchObject({ paymentDate: 'February 3, 2026', receiptDate: 'February 3, 2026', paymentMethod: 'Credit card · Visa •••• 4242', processor: 'Stripe (sandbox — test payment)', isTest: true, writeOff: 10, invoiceBalanceBefore: 135, invoiceBalanceAfter: 25 })
    const check = buildPaymentReceiptData({ letterhead: TX, paymentNumber: '1002', paymentDate: '02/03/2026', receivedFromName: 'X', clientNumber: '120', matterNumber: '120.0', paymentType: 'Check', amount: 5 })
    expect(check).toMatchObject({ processor: null, isTest: false, invoiceBalanceBefore: null, invoiceNumber: null, paymentMethod: 'Check' })
  })
})

describe('samples', () => {
  it('builds the three sample documents with the chosen letterhead', () => {
    const tx = buildSampleInvoice(TX)
    expect(tx.invoiceNumber).toBe('3391')
    expect(buildSampleInvoice(KS).invoiceNumber).toBe('3392')
    expect(tx.lines.length).toBe(30)
    expect(tx.professionalFeesAndCosts).toBe(9289)
    expect(tx.balanceDue).toBe(7789)
    const statement = buildSampleStatement(KS)
    expect(statement.closingBalance).toBe(7039)
    expect(statement.rows.at(-1)?.balance).toBe(statement.closingBalance)
    expect(statement.firm.checksOffice).toBe('Pratt, KS')
    const receipt = buildSampleReceipt(TX)
    expect(receipt).toMatchObject({ receiptDate: 'September 23, 2026', invoiceBalanceBefore: 9289, processor: 'Stripe' })
  })
})
