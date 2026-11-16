// file: apps/web/features/billing/printDocuments.test.tsx
/**
 * Billing printing (part 7b of `docs/API/Billing_Audit.md`): the documents built from a Billing record (the invoice's
 * attached entries and staff codes, the receipt's balance and card label), the handoff to the print view (the key in
 * the address, the document in browser storage), the print-intent prompt, the Posted Payments receipt icons, the
 * print view itself with the firm's offices as letterhead choices, and the Reports list. Made-up people and amounts.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/printDocuments.test.tsx
 */

import { DEFAULT_FIRM_PROFILE, type BillingPayment, type BillingRecord } from '@krhomebase/contracts'
import { SAMPLE_FIRM_PROFILE } from '@krhomebase/documents/samples'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRINT_HANDOFF_PREFIX, buildPrintViewUrl } from '@/components/printing/printHandoff.client'
import ReportsPanel from '@/features/reports/components/ReportsPanel.client'
import BillingPrintView from './components/BillingPrintView.client'
import InvoicePrintIntent from './components/InvoicePrintIntent.client'
import PostedPaymentsLedger from './components/PostedPaymentsLedger.client'
import { invoiceReportFromBilling, printInvoiceFromBilling, receiptFromBilling } from './printDocuments.client'

const PAYMENT: BillingPayment = {
  id: 'pay-1',
  paymentNumber: '1790000000001',
  invoiceId: 'inv-1',
  invoiceNumber: '121',
  invoiceIvid: 'IV12345',
  matterId: 'm-1',
  matterNumber: '501.0',
  receivedDate: '03/10/2026',
  amount: 200,
  paymentType: 'Credit card',
  referenceNumber: 'pi_test',
  memo: 'Stripe sandbox · Visa •••• 4242',
  writeOff: 25,
  sourceSystem: 'stripe_sandbox',
  voided: false,
  voidedAt: null,
  voidReason: null,
  refund: null,
}

const RECORD: Pick<BillingRecord, 'client' | 'matters' | 'invoices'> = {
  client: { id: 'cl-1', clientNumber: '501', displayName: 'Pat Sample' },
  matters: [{ id: 'm-1', matterNumber: '501.0', title: 'General' }],
  invoices: [
    { id: 'inv-1', matterId: 'm-1', matterNumber: '501.0', invoiceNumber: '121', dateInvoiced: '03/05/2026', dueDate: '04/04/2026', clientLabel: 'Pat Sample', amountDue: 75, writeOff: -25, ivid: 'IV12345', locked: true, status: 'Partially paid', entryIds: ['te-1'] },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('documents from the Billing record', () => {
  it('builds the invoice from its attached entries with bare staff codes', () => {
    const entry = { id: 'te-1', matterId: 'm-1', date: '03/02/2026', matterNumber: '501.0', description: 'Drafted the will', activityCategory: '', kind: 'Time' as const, hours: 1.5, rate: 200, amount: 300, billingStatus: 'Billed' as const, staffId: 'u-1', staff: 'SS - Sam Staffer', invoiceId: 'inv-1' }
    const other = { ...entry, id: 'te-2', description: 'Not on this invoice' }
    const report = invoiceReportFromBilling({ invoice: RECORD.invoices[0]!, entries: [entry, other], clientNumber: '501', staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer', staffCode: 'SX' }] })
    expect(report.lines.map((line) => [line.description, line.staff])).toEqual([['Drafted the will', 'SX']])
    expect(report).toMatchObject({ invoiceNumber: '121', invoiceDate: 'March 5, 2026', professionalFeesAndCosts: 300 })
  })

  it('builds the receipt with the card label and the invoice balance after', () => {
    const receipt = receiptFromBilling(PAYMENT, RECORD)
    expect(receipt).toMatchObject({ receiptNumber: '1790000000001', paymentDate: 'March 10, 2026', receivedFrom: { name: 'Pat Sample' }, paymentMethod: 'Credit card · Visa •••• 4242', processor: 'Stripe (sandbox — test payment)', isTest: true, invoiceBalanceAfter: 75, invoiceBalanceBefore: 300, invoiceIvid: 'IV12345', matterTitle: 'General' })
  })

  it('hands the invoice to the print view through browser storage, with only a key in the address', () => {
    const stored = new Map<string, string>()
    const opened: string[] = []
    vi.stubGlobal('window', {
      localStorage: { setItem: (key: string, value: string) => stored.set(key, value), getItem: (key: string) => stored.get(key) ?? null, removeItem: (key: string) => stored.delete(key) },
      open: (url: string) => {
        opened.push(url)
        return {}
      },
    })
    expect(printInvoiceFromBilling({ invoice: RECORD.invoices[0]!, entries: [], clientNumber: '501', staffOptions: [] })).toBeNull()
    expect(opened[0]).toMatch(/^\/print\/invoice\?src=handoff&option=option-1&key=/)
    const [key, value] = [...stored.entries()][0]!
    expect(key.startsWith(PRINT_HANDOFF_PREFIX)).toBe(true)
    expect(JSON.parse(value).report.invoiceNumber).toBe('121')
    expect(buildPrintViewUrl({ document: 'receipt', source: 'sample', office: 'firm-location-primary' })).toBe('/print/receipt?src=sample&office=firm-location-primary')
  })
})

describe('printing screens', () => {
  it('asks whether a print of an unlocked invoice goes to the client', () => {
    const html = renderToStaticMarkup(<InvoicePrintIntent clientDisplayName="Pat Sample" clientNumber="501" invoice={{ invoiceNumber: '121' }} onCancel={() => undefined} onLockAndPrint={async () => undefined} onPreview={() => undefined} />)
    expect(html).toContain('Sending to client - lock it')
    expect(html).toContain('Just reviewing - don&#x27;t lock')
    expect(html).toContain('Invoice #121 for [501] Pat Sample')
  })

  it('shows the receipt icons on a live payment, with email on since part 7c', () => {
    const html = renderToStaticMarkup(<PostedPaymentsLedger canVoid={false} onVoid={async () => undefined} payments={[PAYMENT]} receiptSource={RECORD} />)
    expect(html).toContain('data-kr-action="posted-payment-preview-receipt"')
    expect(html).toContain('data-kr-action="posted-payment-print-receipt"')
    expect(html).toContain('data-kr-action="posted-payment-email-receipt"')
    expect(html).not.toMatch(/data-kr-action="posted-payment-email-receipt" disabled=""/)
    const withoutSource = renderToStaticMarkup(<PostedPaymentsLedger canVoid={false} onVoid={async () => undefined} payments={[PAYMENT]} />)
    expect(withoutSource).not.toContain('posted-payment-print-receipt')
  })

  it('draws the print view with one letterhead choice per office, and the sample document', () => {
    const html = renderToStaticMarkup(<BillingPrintView documentKind="invoice" firmProfile={SAMPLE_FIRM_PROFILE} firmProfileLoaded initialOffice="sample-office-pratt" initialOption="option-1" source="sample" />)
    expect(html).toContain('data-kr-action="print-view-office-sample-office-mckinney"')
    expect(html).toContain('data-kr-action="print-view-office-sample-office-pratt"')
    expect(html).toContain('Invoice 3392')
    expect(html).toContain('data-kr-firm-state="KS"')
    expect(html).not.toContain('print-view-firm-profile-note')
    // The built-in profile has no office addresses: no letterhead choice, and the note when it was not read.
    const fallback = renderToStaticMarkup(<BillingPrintView documentKind="statement" firmProfile={DEFAULT_FIRM_PROFILE} firmProfileLoaded={false} initialOffice={null} initialOption="option-1" source="sample" />)
    expect(fallback).not.toContain('print-view-state-toggle')
    expect(fallback).toContain('print-view-firm-profile-note')
  })

  it('lists Billing Document Samples under Reports', () => {
    const html = renderToStaticMarkup(<ReportsPanel />)
    expect(html).toContain('Billing Document Samples')
    expect(html).toContain('data-kr-id="reports-billing-document-samples-choice"')
  })
})
