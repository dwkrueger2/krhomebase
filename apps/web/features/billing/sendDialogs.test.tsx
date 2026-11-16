// file: apps/web/features/billing/sendDialogs.test.tsx
/**
 * Billing email and stored copies (part 7c of `docs/API/Billing_Audit.md`): each `api.client.ts` call's method, path
 * and body (only the choices travel; the invoice send reloads the record; the sample PDF answers a file or the error
 * envelope), the Send buttons that part 7c turns on, the sent sentence and the default messages, and the first draw of
 * the invoice, statement and receipt dialogs rendered to text (`inline`). The API is a stand-in `fetch`. Made-up people
 * and amounts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/sendDialogs.test.tsx
 */

import type { BillingPayment, BillingRecord, BillingSentDocument } from '@krhomebase/contracts'
import { SAMPLE_FIRM_PROFILE } from '@krhomebase/documents/samples'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BillingApiError,
  fetchInvoiceEmailInfo,
  fetchReceiptEmailInfo,
  fetchSamplePdf,
  fetchStatementEmailInfo,
  invalidateBilling,
  previewInvoiceEmail,
  previewReceiptEmail,
  previewStatementEmail,
  resendBillingDocument,
  sendInvoiceEmail,
  sendReceiptEmail,
  sendStatementEmail,
} from './api.client'
import BillingPrintView from './components/BillingPrintView.client'
import ClientAccountingLedger from './components/ClientAccountingLedger.client'
import InvoiceEditDialog from './components/InvoiceEditDialog.client'
import PaymentNoticeDialog from './components/PaymentNoticeDialog.client'
import SendInvoiceDialog, { BillingSentCopies, billingSentDetail, invoiceEmailDefaultMessage } from './components/SendInvoiceDialog.client'
import SendStatementDialog, { statementEmailDefaultMessage } from './components/SendStatementDialog.client'
import { statementReportFromBilling } from './printDocuments.client'

const RECORD: BillingRecord = {
  client: { id: 'cl-1', clientNumber: '501', displayName: 'Pat Sample' },
  matters: [{ id: 'm-1', matterNumber: '501.0', title: 'General' }],
  timeEntries: [
    { id: 'te-1', matterId: 'm-1', date: '03/02/2026', matterNumber: '501.0', description: 'Drafted the will', activityCategory: 'Drafting', kind: 'Time', hours: 1.5, rate: 200, amount: 300, billingStatus: 'Billed', staffId: 'u-1', staff: 'SS - Sam Staffer', staffCode: 'SS', internalTimeTracked: false, invoiceId: 'inv-1', bcid: 'AB12CD3' },
  ],
  invoices: [
    { id: 'inv-1', matterId: 'm-1', matterNumber: '501.0', invoiceNumber: '121', dateInvoiced: '03/05/2026', dueDate: '04/04/2026', clientLabel: 'Pat Sample', amountDue: 300, writeOff: 0, ivid: 'IV12345', locked: true, lockedReason: 'Locked · sent to client', status: 'Unpaid', entryIds: ['te-1'] },
  ],
  payments: [],
  ledgerEntries: [],
  trustEntries: [],
  staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer', staffCode: 'SS' }],
  accountTotals: { openInvoiceBalance: 300, openInvoiceCount: 1, receivableDebits: 300, receivableCredits: 0, trustCredits: 0, trustDebits: 0, trustBalance: 0, unappliedPayments: 0 },
  viewer: { canWrite: true, canAdminister: false },
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
  amount: 200,
  paymentType: 'Check',
  referenceNumber: '1042',
  memo: '',
  writeOff: 0,
  sourceSystem: null,
  voided: false,
  voidedAt: null,
  voidReason: null,
  refund: null,
}

const SENT: BillingSentDocument = {
  documentId: 'doc-1',
  documentNumber: 'ABC1234',
  sentAt: '2026-11-10T15:00:00.000Z',
  subject: 'Invoice #121 from Krueger & Richard [KR 501.0]',
  to: ['pat@example.com'],
  cc: [],
  sentBy: 'Sam Staffer',
  hasPdf: true,
  hasHtml: true,
  url: '/api/v1/billing/clients/cl-1/documents/ABC1234/file',
}

const INFO = { clientId: 'cl-1', clientNumber: '501', clientDisplayName: 'Pat Sample', recipients: [{ email: 'pat@example.com', label: 'Pat Sample · Home', primary: true }], sent: [SENT] }
const RECEIPT_INFO = {
  ...INFO,
  details: { receiptNumber: '1790000000001', paymentDate: 'March 10, 2026', receivedFrom: 'Pat Sample', clientNumber: '501', matterNumber: '501.0', matterTitle: 'General', appliedTo: 'Invoice #121', paymentMethod: 'Check', processor: null, reference: '1042', amountReceived: 200, invoiceBalanceBefore: 300, invoiceBalanceAfter: 100, isTest: false },
  defaultSubject: 'Payment receipt — $200.00 on Invoice #121',
  defaultMessage: 'Dear Pat Sample,',
}
const PREVIEW = { subject: 'Invoice #121 from Krueger & Richard [KR 501.0]', html: '<p>Invoice</p>' }
const SENT_DATA = {
  sent: true,
  resent: false,
  messageId: null,
  to: ['pat@example.com'],
  cc: [],
  subject: 'Invoice #121 from Krueger & Richard [KR 501.0]',
  documentId: 'doc-2',
  documentNumber: 'XYZ9876',
  documentUrl: '/api/v1/billing/clients/cl-1/documents/XYZ9876/file',
  pdfAttached: true,
  pdfError: null,
  workstreamWsid: 'WS-1',
  workstreamError: null,
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []

/** A stand-in API: answers each billing document route with a made-up reply; `refuseSample` refuses the sample PDF. */
function stubApi(options: { refuseSample?: boolean } = {}) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data, requestId: 'req-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/document-samples/pdf')) {
      if (options.refuseSample) return new Response(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN_ROLE', message: 'Only a super admin or admin may make a sample PDF.' }, requestId: 'req-2' }), { status: 403, headers: { 'content-type': 'application/json' } })
      return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } })
    }
    if (url.endsWith('/preview')) return ok(PREVIEW)
    if (url.includes('/receipt/email') && method === 'GET') return ok(RECEIPT_INFO)
    if (method === 'GET' && url.includes('/email')) return ok(INFO)
    if (method === 'GET') return ok(RECORD)
    if (url.endsWith('/resend')) return ok({ ...SENT_DATA, resent: true })
    return ok(SENT_DATA)
  })
}

beforeEach(() => {
  calls = []
  invalidateBilling()
})
afterEach(() => vi.unstubAllGlobals())

describe('billing document calls', () => {
  it('reads, previews and sends the invoice email; the send reloads the record', async () => {
    stubApi()
    const info = await fetchInvoiceEmailInfo('cl-1', 'inv-1')
    expect(info.sent[0]?.documentNumber).toBe('ABC1234')
    await previewInvoiceEmail('cl-1', 'inv-1', { to: ['pat@example.com'], subject: 'Invoice #121', message: 'Hello', includePdf: true, includeInvoiceBody: false, officeId: null })
    const sent = await sendInvoiceEmail('cl-1', 'inv-1', { to: ['pat@example.com'], cc: [], subject: 'Invoice #121', message: 'Hello', includePdf: true, includeInvoiceBody: true, officeId: 'office-1' })
    expect(sent.documentNumber).toBe('XYZ9876')
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET /api/v1/billing/clients/cl-1/invoices/inv-1/email',
      'POST /api/v1/billing/clients/cl-1/invoices/inv-1/email/preview',
      'POST /api/v1/billing/clients/cl-1/invoices/inv-1/email',
      'GET /api/v1/billing/clients/cl-1',
    ])
    // Only the choices travel: no report from the browser.
    expect(calls[2]!.body).toEqual({ to: ['pat@example.com'], cc: [], subject: 'Invoice #121', message: 'Hello', includePdf: true, includeInvoiceBody: true, officeId: 'office-1' })
  })

  it('reads, previews and sends the statement for one matter or the whole client', async () => {
    stubApi()
    await fetchStatementEmailInfo('cl-1', 'm-1')
    await fetchStatementEmailInfo('cl-1', null)
    await previewStatementEmail('cl-1', { to: [], subject: '', message: '', matterId: null })
    await sendStatementEmail('cl-1', { to: ['pat@example.com'], subject: 'Statement', message: '', matterId: 'm-1', includePdf: false, includeStatementBody: true, officeId: null })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET /api/v1/billing/clients/cl-1/statement/email?matterId=m-1',
      'GET /api/v1/billing/clients/cl-1/statement/email',
      'POST /api/v1/billing/clients/cl-1/statement/email/preview',
      'POST /api/v1/billing/clients/cl-1/statement/email',
    ])
    expect(calls[3]!.body).toMatchObject({ matterId: 'm-1', includePdf: false, includeStatementBody: true })
  })

  it('reads, previews and sends the receipt, and re-sends a stored copy by its number', async () => {
    stubApi()
    const info = await fetchReceiptEmailInfo('cl-1', 'pay-1')
    expect(info.defaultSubject).toContain('Payment receipt')
    await previewReceiptEmail('cl-1', 'pay-1', { to: [], subject: '', message: '' })
    await sendReceiptEmail('cl-1', 'pay-1', { to: ['pat@example.com'], subject: '', message: '', includePdf: true })
    const resent = await resendBillingDocument('cl-1', 'ABC1234', { to: [] })
    expect(resent.resent).toBe(true)
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET /api/v1/billing/clients/cl-1/payments/pay-1/receipt/email',
      'POST /api/v1/billing/clients/cl-1/payments/pay-1/receipt/email/preview',
      'POST /api/v1/billing/clients/cl-1/payments/pay-1/receipt/email',
      'POST /api/v1/billing/clients/cl-1/documents/ABC1234/resend',
    ])
    expect(calls[3]!.body).toEqual({ to: [] })
  })

  it('answers the sample PDF as a file, and a refusal as the API sentence', async () => {
    stubApi()
    const blob = await fetchSamplePdf({ document: 'statement', officeId: 'office-1' })
    expect(blob.size).toBe(4)
    expect(calls[0]).toEqual({ url: '/api/v1/billing/document-samples/pdf', method: 'POST', body: { document: 'statement', officeId: 'office-1' } })
    calls = []
    stubApi({ refuseSample: true })
    const refused = await fetchSamplePdf({ document: 'receipt' }).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(BillingApiError)
    expect(refused).toMatchObject({ code: 'FORBIDDEN_ROLE', status: 403, message: 'Only a super admin or admin may make a sample PDF.' })
  })
})

describe('send buttons (part 7c)', () => {
  const editorProps = {
    allEntries: RECORD.timeEntries,
    payments: [],
    clientNumber: '501',
    clientDisplayName: 'Pat Sample',
    matterNumbers: ['501.0'],
    staffOptions: RECORD.staffOptions,
    onCancel: () => undefined,
    onOpenPayment: () => undefined,
    onSave: async () => undefined,
    onSaveEntry: async () => undefined,
  }

  it('turns on the invoice editor Send for a saved invoice, and asks to save a new one first', () => {
    const saved = renderToStaticMarkup(<InvoiceEditDialog {...editorProps} clientId="cl-1" invoice={RECORD.invoices[0]!} />)
    expect(saved).toContain('data-kr-action="invoice-send"')
    expect(saved).not.toMatch(/data-kr-action="invoice-send" disabled=""/)
    expect(saved).toContain('Email the saved invoice to the client')
    const fresh = renderToStaticMarkup(<InvoiceEditDialog {...editorProps} clientId="cl-1" invoice={{ ...RECORD.invoices[0]!, id: 'new_1', invoiceNumber: '' }} />)
    expect(fresh).toMatch(/data-kr-action="invoice-send" disabled=""/)
    expect(fresh).toContain('Save the invoice before sending it.')
  })

  it('turns on the Statement of Account Send', () => {
    const html = renderToStaticMarkup(
      <ClientAccountingLedger
        clientDisplayName="Pat Sample"
        clientNumber="501"
        entries={[]}
        statementSource={{ clientId: 'cl-1', matters: RECORD.matters, invoices: RECORD.invoices, trustEntries: [] }}
        validMatterNumbers={['501.0']}
      />,
    )
    expect(html).toContain('data-kr-action="client-accounting-send-statement"')
    expect(html).not.toMatch(/data-kr-action="client-accounting-send-statement" disabled=""/)
    expect(html).not.toContain('Billing part 7c')
  })

  it('offers no Send in the print view without a handed-off document', () => {
    const html = renderToStaticMarkup(<BillingPrintView documentKind="invoice" firmProfile={SAMPLE_FIRM_PROFILE} firmProfileLoaded initialOffice={null} initialOption="option-1" source="sample" />)
    expect(html).not.toContain('print-view-send')
  })
})

describe('email dialogs', () => {
  it('writes the default messages without a pay link (part 7d)', () => {
    const invoiceMessage = invoiceEmailDefaultMessage('Pat Sample', { invoiceNumber: '121', dueDate: '04/04/2026' }, 300)
    expect(invoiceMessage).toContain('Please find Invoice #121 attached. The balance due is $300.00, payable by 04/04/2026.')
    expect(invoiceMessage).not.toContain('PAY_LINK')
    expect(statementEmailDefaultMessage('Pat Sample', { periodLabel: 'March 2026', closingBalance: 300 })).toContain('Statement of Account for March 2026 attached. The balance on your account is $300.00.')
  })

  it('says what went, the stored copy and the WorkStream entry', () => {
    expect(billingSentDetail('Invoice #121', SENT_DATA, true)).toBe(
      'Invoice #121 was emailed to pat@example.com as “Invoice #121 from Krueger & Richard [KR 501.0]”. PDF attached. Stored copy XYZ9876 (/api/v1/billing/clients/cl-1/documents/XYZ9876/file). Recorded in the Workstream (WS-1).',
    )
    expect(billingSentDetail('The payment receipt', { ...SENT_DATA, resent: true, workstreamWsid: null, workstreamError: 'WORKSTREAM_UNAVAILABLE' }, true)).toContain('was re-sent to pat@example.com')
    expect(billingSentDetail('Invoice #121', { ...SENT_DATA, pdfAttached: false, pdfError: 'renderer down' }, true)).toContain('The PDF could not be attached (renderer down)')
  })

  it('lists earlier copies with the PDF, the email as sent and Re-send', () => {
    const html = renderToStaticMarkup(<BillingSentCopies copies={[SENT]} dataKrElement="send-invoice-sent-versions" resendAction="send-invoice-resend" onChooseResend={() => undefined} />)
    expect(html).toContain('Previously sent (1)')
    expect(html).toContain('href="/api/v1/billing/clients/cl-1/documents/ABC1234/file"')
    expect(html).toContain('href="/api/v1/billing/clients/cl-1/documents/ABC1234/file?format=html"')
    expect(html).toContain('Re-send this copy')
    expect(renderToStaticMarkup(<BillingSentCopies copies={[]} dataKrElement="x" />)).toBe('')
  })

  it('draws the invoice dialog with the tagged subject, the options and the address lookup', () => {
    stubApi()
    const html = renderToStaticMarkup(
      <SendInvoiceDialog clientDisplayName="Pat Sample" clientId="cl-1" clientNumber="501" entries={RECORD.timeEntries} inline invoice={RECORD.invoices[0]!} staffOptions={RECORD.staffOptions} onCancel={() => undefined} onSent={() => undefined} />,
    )
    expect(html).toContain('Email Invoice #121')
    expect(html).toContain('value="Invoice #121 from Krueger &amp; Richard [KR 501.0]"')
    expect(html).toContain('The balance due is $300.00, payable by 04/04/2026.')
    expect(html).toContain('Include PDF Invoice with Email')
    expect(html).toContain('Send Invoice in Email Body')
    expect(html).toContain('Looking up the client&#x27;s email addresses...')
    expect(html).toContain('data-kr-id="send-invoice-dialog"')
  })

  it('draws the statement dialog for one matter', () => {
    const report = statementReportFromBilling({ clientId: 'cl-1', clientNumber: '501', clientDisplayName: 'Pat Sample', matters: RECORD.matters, ledgerEntries: [], trustEntries: [], invoices: RECORD.invoices, matterFilter: '501.0' })
    const html = renderToStaticMarkup(
      <SendStatementDialog clientDisplayName="Pat Sample" clientId="cl-1" clientNumber="501" inline matterId="m-1" matterNumber="501.0" report={report} onCancel={() => undefined} />,
    )
    expect(html).toContain('Email Statement of Account')
    expect(html).toContain('[501] Pat Sample · Matter 501.0')
    expect(html).toContain('value="Statement of Account from Krueger &amp; Richard [KR 501.0]"')
    expect(html).toContain('Include PDF Statement with Email')
  })

  it('draws the receipt dialog as a loading card until the wording arrives', () => {
    const html = renderToStaticMarkup(<PaymentNoticeDialog clientDisplayName="Pat Sample" clientId="cl-1" clientNumber="501" inline payment={PAYMENT} onClose={() => undefined} />)
    expect(html).toContain('data-kr-element="payment-receipt-loading"')
    expect(html).toContain('Loading payment receipt...')
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
  })
})
