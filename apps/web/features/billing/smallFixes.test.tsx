// file: apps/web/features/billing/smallFixes.test.tsx
/**
 * Billing part 7f (`docs/API/Billing_Audit.md` section 5, the small fixes): the Overview's Ending balance and Balance
 * column follow the chosen matter (item 4); a billing reader (`viewer.canWrite` false) sees no write buttons in Time &
 * Fees, Invoices, the invoice editor, Trust, the statement or Posted Payments (item 5); the Overview's payment rows say
 * what a double-click does; the "No billing records" line (old `BillingPanel:389-393`); and Billing's lock prompt uses
 * the one shared confirmation dialog (item 11). Made-up people and amounts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/smallFixes.test.tsx
 */

import type { BillingPayment, BillingRecord } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BillingApiError } from './api.client'
import { isNoBillingRecords, noBillingRecordsText } from './components/BillingClientPanel.client'
import ClientAccountingLedger, { registerEndingBalance } from './components/ClientAccountingLedger.client'
import InvoiceEditDialog from './components/InvoiceEditDialog.client'
import InvoiceLockConfirm from './components/InvoiceLockConfirm.client'
import InvoicesTab from './components/InvoicesTab.client'
import PostedPaymentsLedger from './components/PostedPaymentsLedger.client'
import TimeAndFeesLedger from './components/TimeAndFeesLedger.client'
import TrustTab from './components/TrustTab.client'
import type { ClientAccountingLedgerEntry } from './types'

const MATTERS = [
  { id: 'm-1', matterNumber: '501.0', title: 'General' },
  { id: 'm-2', matterNumber: '501.1', title: 'Estate plan' },
]

/** The client register as the API sends it: `balance` across the client, `matterBalance` per matter. */
const LEDGER: ClientAccountingLedgerEntry[] = [
  { id: 'l-1', date: '03/01/2026', reference: '121', description: 'Invoice 121', charges: 300, balance: 300, matterBalance: 300, matterNumber: '501.0', matterId: 'm-1', invoiceId: 'inv-1' },
  { id: 'l-2', date: '03/02/2026', reference: '122', description: 'Invoice 122', charges: 500, balance: 800, matterBalance: 500, matterNumber: '501.1', matterId: 'm-2' },
  { id: 'l-3', date: '03/03/2026', reference: 'payment', description: 'Check 1001', payments: 100, balance: 700, matterBalance: 200, matterNumber: '501.0', matterId: 'm-1', paymentId: 'pay-1' },
  { id: 'l-4', date: '03/04/2026', reference: 'payment', description: 'Bounced check', payments: 50, balance: 700, matterBalance: 200, matterNumber: '501.0', matterId: 'm-1', voided: true },
]

const INVOICE: BillingRecord['invoices'][number] = {
  id: 'inv-1',
  matterId: 'm-1',
  matterNumber: '501.0',
  invoiceNumber: '121',
  dateInvoiced: '03/05/2026',
  dueDate: '04/04/2026',
  clientLabel: 'Pat Sample',
  amountDue: 300,
  writeOff: 0,
  ivid: 'IV12345',
  locked: false,
  status: 'Unpaid',
  entryIds: ['te-1'],
}

const ENTRY: BillingRecord['timeEntries'][number] = {
  id: 'te-1',
  matterId: 'm-1',
  date: '03/02/2026',
  matterNumber: '501.0',
  description: 'Drafted the will',
  activityCategory: 'Drafting',
  kind: 'Time',
  hours: 1.5,
  rate: 200,
  amount: 300,
  billingStatus: 'Billed',
  staffId: 'u-1',
  staff: 'SS - Sam Staffer',
  staffCode: 'SS',
  internalTimeTracked: false,
  invoiceId: 'inv-1',
  bcid: 'AB12CD3',
}

const PAYMENT: BillingPayment = {
  id: 'pay-1',
  paymentNumber: '1790000000001',
  invoiceId: 'inv-1',
  invoiceNumber: '121',
  invoiceIvid: 'IV12345',
  matterId: 'm-1',
  matterNumber: '501.0',
  receivedDate: '03/10/2026',
  amount: 100,
  paymentType: 'Check',
  referenceNumber: '1001',
  memo: '',
  writeOff: 0,
  sourceSystem: null,
  voided: false,
  voidedAt: null,
  voidReason: null,
  refund: null,
}

const RECEIPT_SOURCE: Pick<BillingRecord, 'client' | 'matters' | 'invoices'> = {
  client: { id: 'cl-1', clientNumber: '501', displayName: 'Pat Sample' },
  matters: MATTERS,
  invoices: [INVOICE],
}

describe('the Overview balance with one matter chosen (audit item 4)', () => {
  it('reads the chosen matter\'s own running balance, and the client\'s for all matters', () => {
    expect(registerEndingBalance(LEDGER, 'ALL')).toBe(700)
    const matterRows = LEDGER.filter((entry) => entry.matterNumber === '501.0')
    // The client's balance at the matter's last live row would be 700; the matter's own balance is 200.
    expect(registerEndingBalance(matterRows, '501.0')).toBe(200)
    expect(registerEndingBalance(LEDGER.filter((entry) => entry.matterNumber === '501.1'), '501.1')).toBe(500)
    // Voided rows never count; an older record without matterBalance falls back to the client's balance.
    expect(registerEndingBalance([{ ...LEDGER[0]!, matterBalance: undefined }], '501.0')).toBe(300)
    expect(registerEndingBalance([], '501.0')).toBe(0)
  })

  it('opens on all matters with the client\'s Ending balance', () => {
    const html = renderToStaticMarkup(<ClientAccountingLedger clientDisplayName="Pat Sample" clientNumber="501" entries={LEDGER} validMatterNumbers={['501.0', '501.1']} onOpenPayment={() => undefined} />)
    expect(html).toContain('Ending balance')
    expect(html).toContain('$700.00')
    // The Overview tooltip is true again since part 7b: a payment row opens its receipt details.
    expect(html).toContain('Double-click to view this payment receipt')
  })
})

describe('a billing reader sees no write buttons (audit item 5)', () => {
  it('hides the statement Send but keeps Print', () => {
    const source = { clientId: 'cl-1', matters: MATTERS, invoices: [INVOICE], trustEntries: [] }
    const writer = renderToStaticMarkup(<ClientAccountingLedger clientDisplayName="Pat Sample" clientNumber="501" entries={LEDGER} statementSource={source} validMatterNumbers={['501.0']} />)
    const reader = renderToStaticMarkup(<ClientAccountingLedger canSendStatement={false} clientDisplayName="Pat Sample" clientNumber="501" entries={LEDGER} statementSource={source} validMatterNumbers={['501.0']} />)
    expect(writer).toContain('client-accounting-send-statement')
    expect(reader).not.toContain('client-accounting-send-statement')
    expect(reader).toContain('client-accounting-print-statement')
  })

  it('hides Add billing entry in Time & Fees', () => {
    const props = { clientDisplayName: 'Pat Sample', clientNumber: '501', entries: [ENTRY], matterNumbers: ['501.0'], staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer' }], onDelete: async () => undefined, onSave: async () => undefined }
    expect(renderToStaticMarkup(<TimeAndFeesLedger {...props} />)).toContain('Add billing entry')
    const reader = renderToStaticMarkup(<TimeAndFeesLedger {...props} canWrite={false} />)
    expect(reader).not.toContain('Add billing entry')
    expect(reader).toContain('Drafted the will')
  })

  it('hides New Invoice, the row Send and the lock button in Invoices, and shows the lock state', () => {
    const props = { clientDisplayName: 'Pat Sample', clientId: 'cl-1', clientNumber: '501', entries: [ENTRY], invoices: [INVOICE], matterNumbers: ['501.0'], payments: [], staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer' }], onOpenPayment: () => undefined, onSave: async () => undefined, onSaveEntry: async () => undefined }
    const writer = renderToStaticMarkup(<InvoicesTab {...props} />)
    expect(writer).toContain('New Invoice')
    expect(writer).toContain('data-kr-action="invoice-row-send"')
    expect(writer).toContain('data-kr-action="invoice-row-lock"')
    const reader = renderToStaticMarkup(<InvoicesTab {...props} canWrite={false} />)
    expect(reader).not.toContain('New Invoice')
    expect(reader).not.toContain('invoice-row-send')
    expect(reader).not.toContain('invoice-row-lock"')
    expect(reader).toContain('data-kr-element="invoice-row-lock-state"')
    expect(reader).toContain('data-kr-action="invoice-row-print"')
  })

  it('opens the invoice editor for review only', () => {
    const props = { allEntries: [ENTRY], clientDisplayName: 'Pat Sample', clientId: 'cl-1', clientNumber: '501', invoice: INVOICE, matterNumbers: ['501.0'], payments: [], staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer' }], onCancel: () => undefined, onOpenPayment: () => undefined, onSave: async () => undefined, onSaveEntry: async () => undefined, onToggleLock: async () => undefined }
    const writer = renderToStaticMarkup(<InvoiceEditDialog {...props} />)
    expect(writer).toContain('Save Invoice')
    expect(writer).toContain('data-kr-action="invoice-send"')
    expect(writer).toContain('data-kr-action="invoice-toggle-lock"')
    const reader = renderToStaticMarkup(<InvoiceEditDialog {...props} readOnly />)
    expect(reader).not.toContain('Save Invoice')
    expect(reader).not.toContain('invoice-send')
    expect(reader).not.toContain('invoice-toggle-lock')
    expect(reader).not.toContain('invoice-delete')
    expect(reader).not.toContain('invoice-add-open-time-fees')
    expect(reader).toContain('data-kr-element="invoice-lock-state"')
    expect(reader).toContain('data-kr-action="invoice-print"')
    expect(reader).toContain('Review only')
  })

  it('hides the Trust buttons without a save handler', () => {
    const props = { clientDisplayName: 'Pat Sample', clientNumber: '501', entries: [], matterNumbers: ['501.0'] }
    expect(renderToStaticMarkup(<TrustTab {...props} onCreate={async () => undefined} />)).toContain('Add Trust Request')
    const reader = renderToStaticMarkup(<TrustTab {...props} />)
    expect(reader).not.toContain('Add Trust Request')
    expect(reader).not.toContain('Record Trust Payment')
    expect(reader).not.toContain('Add Disbursement')
  })

  it('hides the receipt email in Posted Payments but keeps details and Print', () => {
    const reader = renderToStaticMarkup(<PostedPaymentsLedger canSend={false} canVoid={false} onVoid={async () => undefined} payments={[PAYMENT]} receiptSource={RECEIPT_SOURCE} />)
    expect(reader).not.toContain('posted-payment-email-receipt')
    expect(reader).toContain('data-kr-action="posted-payment-preview-receipt"')
    expect(reader).toContain('data-kr-action="posted-payment-print-receipt"')
  })
})

describe('the open client with no billing records (old BillingPanel:389-393)', () => {
  it('treats an unknown client as no records, with the name when known', () => {
    expect(isNoBillingRecords(new BillingApiError('VALIDATION_CLIENT_NOT_FOUND', 'No such client.', 404, 'req-1'))).toBe(true)
    expect(isNoBillingRecords(new BillingApiError('BILLING_UNAVAILABLE', 'Down.', 503, 'req-1'))).toBe(false)
    expect(isNoBillingRecords(new Error('network'))).toBe(false)
    expect(noBillingRecordsText('Pat Sample')).toBe('No billing records are available for Pat Sample.')
    expect(noBillingRecordsText(null)).toBe('No billing records are available for this client.')
  })
})

describe('one confirmation dialog (audit item 11)', () => {
  it('draws the lock prompt with the shared dialog from components/dialogs', () => {
    const html = renderToStaticMarkup(<InvoiceLockConfirm clientDisplayName="Pat Sample" clientNumber="501" invoice={INVOICE} mode="lock" onCancel={() => undefined} onConfirm={async () => undefined} />)
    // The dialogs copy's tighter panel (10px padding, 3px button corners); the removed ui copy used p-5 and rounded-[5px].
    expect(html).toContain('p-[10px] w-full max-w-[440px]')
    expect(html).not.toContain('rounded-[5px]')
  })
})
