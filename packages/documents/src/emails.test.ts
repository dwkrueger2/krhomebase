// file: packages/documents/src/emails.test.ts
/**
 * The three client email builders (Billing part 7c): the invoice email, the Statement of Account email and the
 * payment receipt email, HTML and plain text. Each is built from the sample documents with the sample letterhead and
 * checked for its key facts, the staff message (paragraphs, line breaks, HTML escaping), the footer passed in, the
 * switch that leaves the document body out, and (invoice) what the `[[PAY_LINK]]` token becomes with and without a
 * pay link. Part 7e adds the refund notice (its builder from the record, its wording and its test banner). Made-up data only.
 *
 * Run: pnpm --dir packages/documents exec vitest run src/emails.test.ts
 */

import { describe, expect, it } from 'vitest'
import { formatMoney } from './format.ts'
import { PAY_LINK_TOKEN, buildInvoiceEmailHtml, buildInvoiceEmailText, payOnlineHref } from './invoiceEmail.ts'
import { buildLetterhead } from './letterhead.ts'
import { buildReceiptEmailHtml, buildReceiptEmailText, buildRefundEmailHtml, buildRefundEmailText, defaultReceiptMessage, defaultReceiptSubject, defaultRefundMessage, defaultRefundSubject, paymentEmailMoney, type ReceiptPayLink } from './receiptEmail.ts'
import { refundNoticeFromRecord } from './receiptData.ts'
import { SAMPLE_FIRM_PROFILE, buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from './sampleData.ts'
import { buildStatementEmailHtml, buildStatementEmailText } from './statementEmail.ts'
import type { InvoiceReportData } from './types.ts'

const TX = buildLetterhead(SAMPLE_FIRM_PROFILE)
const SCRIPT = '<script>alert("x")</script>'
const SCRIPT_ESCAPED = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
const FOOTER_HTML = '<tr><td data-test="footer">Sent from KR Homebase</td></tr>'
const FOOTER_TEXT = 'Sent from KR Homebase (text)'
const MESSAGE = `Dear Avery,\n\nPlease find your document below.\nSecond line ${SCRIPT}\n\nThank you.`

/** The sample invoice with a pay link (the sample itself has none). */
function invoiceWithPayLink(): InvoiceReportData {
  const report = buildSampleInvoice(TX)
  const rVal: InvoiceReportData = { ...report, payOnline: { url: 'pay.example.test/i/sample', urlNote: 'unique link for this invoice' } }
  return rVal
}

describe('invoice email', () => {
  const report = buildSampleInvoice(TX)

  it('prints the invoice facts, the message paragraphs, the escaped message and the footer', () => {
    const html = buildInvoiceEmailHtml({ report, message: MESSAGE, footerHtml: FOOTER_HTML })
    expect(html).toContain(`<title>Invoice ${report.invoiceNumber} · Krueger &amp; Richard</title>`)
    expect(html).toContain(`Invoice ${report.invoiceNumber} · due ${report.dueDate}`)
    expect(html).toContain(formatMoney(report.balanceDue))
    expect(html).toContain('>Dear Avery,</p>')
    expect(html).toContain(`Please find your document below.<br>Second line ${SCRIPT_ESCAPED}</p>`)
    expect(html).toContain('>Thank you.</p>')
    expect(html).not.toContain(SCRIPT)
    expect(html).toContain(FOOTER_HTML)
    expect(html).toContain(TX.tagline)
  })

  it('includes the itemized invoice by default and leaves it out when asked', () => {
    const withBody = buildInvoiceEmailHtml({ report, message: MESSAGE })
    expect(withBody).toContain('Itemized details')
    expect(withBody).toContain(report.lines[0]!.description.replace(/&/g, '&amp;'))
    expect(withBody).toContain('Less amount received')
    const withoutBody = buildInvoiceEmailHtml({ report, message: MESSAGE, includeInvoiceBody: false })
    expect(withoutBody).not.toContain('Itemized details')
    expect(withoutBody).toContain(formatMoney(report.balanceDue))

    const text = buildInvoiceEmailText({ report, message: MESSAGE, footerText: FOOTER_TEXT })
    expect(text).toContain(`INVOICE ${report.invoiceNumber} — ${TX.legalName}`)
    expect(text).toContain(`BALANCE DUE: ${formatMoney(report.balanceDue)}`)
    expect(text).toContain(SCRIPT)
    expect(text).toContain(FOOTER_TEXT)
    const shortText = buildInvoiceEmailText({ report, message: MESSAGE, includeInvoiceBody: false })
    expect(shortText).toContain(`Invoice ${report.invoiceNumber} · Balance due ${formatMoney(report.balanceDue)} · due ${report.dueDate}`)
    expect(shortText).not.toContain('BALANCE DUE:')
  })

  it('turns [[PAY_LINK]] into the call-the-office text when there is no pay link', () => {
    expect(payOnlineHref(report)).toBe('')
    const message = `Dear Avery,\n\nPay online: ${PAY_LINK_TOKEN}`
    const html = buildInvoiceEmailHtml({ report, message, payQrSrc: 'data:image/png;base64,AAAA' })
    expect(html).not.toContain(PAY_LINK_TOKEN)
    expect(html).toContain('Pay online: our office (call to pay by card)')
    expect(html).toContain('To pay by card, call the office listed above.')
    expect(html).not.toContain('<img')
    const text = buildInvoiceEmailText({ report, message })
    expect(text).toContain('Pay online: our office (call to pay by card)')
    expect(text).toContain('To pay by card, call the office.')
  })

  it('turns [[PAY_LINK]] into a link with the QR image when there is a pay link', () => {
    const linked = invoiceWithPayLink()
    expect(payOnlineHref(linked)).toBe('https://pay.example.test/i/sample')
    const html = buildInvoiceEmailHtml({ report: linked, message: `Pay online: ${PAY_LINK_TOKEN}`, payQrSrc: 'cid:kr-pay-qr' })
    expect(html).toContain('<a href="https://pay.example.test/i/sample" style="color:#174d73;font-weight:600;text-decoration:none;">Pay online: <img')
    expect(html.match(/src="cid:kr-pay-qr"/g)).toHaveLength(1)
    // Token removed by staff: the QR image moves to the Pay online box.
    const boxed = buildInvoiceEmailHtml({ report: linked, message: 'Dear Avery,', payQrSrc: 'cid:kr-pay-qr' })
    expect(boxed).toContain('<div style="margin:8px 0 4px;"><a href="https://pay.example.test/i/sample"')
    const text = buildInvoiceEmailText({ report: linked, message: `Pay here: ${PAY_LINK_TOKEN}` })
    expect(text).toContain('Pay here: https://pay.example.test/i/sample')
    expect(text).toContain('Pay online by card: https://pay.example.test/i/sample (unique link for this invoice).')
  })

  it('prints a Tax row in the HTML and the text only when the invoice carries tax (tax line, Nov 16, 2026)', () => {
    const taxed: InvoiceReportData = { ...report, taxAmount: 61.2, totalAmount: report.totalAmount + 61.2 }
    const html = buildInvoiceEmailHtml({ report: taxed, message: MESSAGE })
    expect(html).toContain('>Tax</td>')
    expect(html).toContain(formatMoney(61.2))
    expect(html.indexOf('Professional fees and costs')).toBeLessThan(html.indexOf('>Tax</td>'))
    expect(html.indexOf('>Tax</td>')).toBeLessThan(html.indexOf('Other outstanding balances'))
    const text = buildInvoiceEmailText({ report: taxed, message: MESSAGE })
    expect(text).toContain(`Professional fees and costs: ${formatMoney(report.professionalFeesAndCosts)}\nTax: $61.20\nTotal amount:`)
    expect(buildInvoiceEmailHtml({ report, message: MESSAGE })).not.toContain('>Tax</td>')
    expect(buildInvoiceEmailText({ report, message: MESSAGE })).not.toContain('Tax:')
  })
})

describe('statement email', () => {
  const report = buildSampleStatement(TX)

  it('prints the statement facts, the message paragraphs, the escaped message and the footer', () => {
    const html = buildStatementEmailHtml({ report, message: MESSAGE, footerHtml: FOOTER_HTML })
    expect(html).toContain(`<title>Statement of Account · ${report.accountHolder.name} · Krueger &amp; Richard</title>`)
    expect(html).toContain(`Client ${report.clientNumber}`)
    expect(html).toContain(`Statement date ${report.statementDate}`)
    expect(html).toContain(formatMoney(report.closingBalance))
    expect(html).toContain(`Please find your document below.<br>Second line ${SCRIPT_ESCAPED}</p>`)
    expect(html).not.toContain(SCRIPT)
    expect(html).toContain(FOOTER_HTML)
  })

  it('includes the account activity by default and leaves it out when asked', () => {
    expect(buildStatementEmailHtml({ report, message: MESSAGE })).toContain('Account activity')
    const withoutBody = buildStatementEmailHtml({ report, message: MESSAGE, includeStatementBody: false })
    expect(withoutBody).not.toContain('Account activity')
    expect(withoutBody).toContain('Opening balance')

    const text = buildStatementEmailText({ report, message: MESSAGE, footerText: FOOTER_TEXT })
    expect(text).toContain(`STATEMENT OF ACCOUNT — ${TX.legalName}`)
    expect(text).toContain(`BALANCE: ${formatMoney(report.closingBalance)}`)
    expect(text).toContain(`${report.rows[0]!.date}  ${report.rows[0]!.matterNumber}`)
    expect(text).toContain(FOOTER_TEXT)
    const shortText = buildStatementEmailText({ report, message: MESSAGE, includeStatementBody: false })
    expect(shortText).not.toContain(`${report.rows[0]!.date}  ${report.rows[0]!.matterNumber}`)
  })

  it('prints $0.00, not $-0.00, for payments and credits of zero', () => {
    const html = buildStatementEmailHtml({ report: { ...report, paymentsAndCredits: 0 }, message: MESSAGE })
    expect(html).not.toContain('-0.00')
  })
})

describe('receipt email', () => {
  const receipt = buildSampleReceipt(TX)
  const payLink: ReceiptPayLink = { url: 'https://pay.example.test/a/sample', displayUrl: 'pay.example.test/a/sample', balance: 5000, expires: 'October 23, 2026', qrSrc: 'cid:kr-pay-qr' }

  it('writes the default subject and message', () => {
    expect(paymentEmailMoney(-12.5)).toBe('−$12.50')
    expect(defaultReceiptSubject(receipt)).toBe(`Payment receipt — ${paymentEmailMoney(receipt.amount)} on Invoice #3391`)
    const message = defaultReceiptMessage(receipt)
    expect(message).toContain(`Dear ${receipt.receivedFrom.name},`)
    expect(message).toContain(`Thank you for your payment of ${paymentEmailMoney(receipt.amount)} received ${receipt.paymentDate} on Invoice #3391.`)
    expect(message).toContain(`at ${TX.offices[0]!.phone}`)
  })

  it('prints the receipt facts, the message paragraphs, the escaped message and the footer', () => {
    const html = buildReceiptEmailHtml({ receipt, message: MESSAGE, footerHtml: FOOTER_HTML })
    expect(html).toContain('<title>Payment Receipt · Krueger &amp; Richard</title>')
    expect(html).toContain(`No. ${receipt.receiptNumber} · ${receipt.receiptDate}`)
    expect(html).toContain(paymentEmailMoney(receipt.amount))
    expect(html).toContain('Invoice #3391 (K7M2Q9A)')
    expect(html).toContain(`Please find your document below.<br>Second line ${SCRIPT_ESCAPED}</p>`)
    expect(html).not.toContain(SCRIPT)
    expect(html).toContain(FOOTER_HTML)
    expect(html).not.toContain('TEST RECEIPT')
    expect(html).not.toContain('Balance remaining on your account')

    const text = buildReceiptEmailText({ receipt, message: MESSAGE, footerText: FOOTER_TEXT })
    expect(text).toContain(`PAYMENT RECEIPT — ${TX.legalName}`)
    expect(text).toContain(`Receipt number: ${receipt.receiptNumber}`)
    expect(text).toContain(`Amount received: ${paymentEmailMoney(receipt.amount)}`)
    expect(text).toContain(FOOTER_TEXT)
  })

  it('adds the sandbox notice and the balance pay link when given', () => {
    const html = buildReceiptEmailHtml({ receipt: { ...receipt, isTest: true }, message: MESSAGE, payLink })
    expect(html).toContain('TEST RECEIPT — Stripe sandbox payment. No money was charged.')
    expect(html).toContain('Balance remaining on your account')
    expect(html).toContain('<a href="https://pay.example.test/a/sample" style="display:inline-block;text-decoration:none;"><img')
    expect(html).toContain('link expires October 23, 2026')
    const text = buildReceiptEmailText({ receipt: { ...receipt, isTest: true }, message: MESSAGE, payLink: { ...payLink, url: '' } })
    expect(text.startsWith('TEST RECEIPT')).toBe(true)
    expect(text).toContain('Pay online: pay.example.test/a/sample (covers every open invoice; expires October 23, 2026).')
  })
})

describe('refund notice email (part 7e)', () => {
  const payment = {
    id: 'pay-1',
    paymentNumber: 'PAY-100',
    invoiceId: 'inv-1',
    invoiceNumber: '12',
    invoiceIvid: 'IVID001',
    matterId: 'm-1',
    matterNumber: '306.1',
    receivedDate: '10/01/2026',
    amount: 300,
    paymentType: 'Credit card',
    memo: 'Stripe sandbox · visa •••• 4242 · front desk',
    sourceSystem: 'stripe_sandbox',
    voided: true,
    voidedAt: '2026-10-05T23:30:00.000Z',
    refund: { id: 're_madeUp0001', status: 'succeeded', amount: 300, reference: null, referenceType: null, referenceStatus: 'pending', refundedAt: '2026-10-05T23:30:00.000Z' },
  }
  const record = {
    client: { displayName: 'Avery Sample', clientNumber: '306' },
    matters: [{ id: 'm-1', matterNumber: '306.1', title: 'Estate plan' }],
    invoices: [{ id: 'inv-1', invoiceNumber: '12', ivid: 'IVID001', amountDue: 300 }],
  }

  it('builds the notice from the record: card label, refund date in the firm time zone, test flag; none without a refund', () => {
    const notice = refundNoticeFromRecord(payment, record, TX)!
    expect(notice).toMatchObject({ clientName: 'Avery Sample', paymentMethod: 'Credit card · visa •••• 4242', refundAmount: 300, refundDate: 'October 5, 2026', paymentDate: 'October 1, 2026', invoiceNumber: '12', arn: null, arnStatus: 'pending', isTest: true })
    expect(refundNoticeFromRecord({ ...payment, refund: null }, record, TX)).toBeNull()
    expect(refundNoticeFromRecord({ ...payment, voided: false }, record, TX)).toBeNull()
  })

  it('writes the old subject, message (ARN sentence), detail rows, test banner and fine print', () => {
    const notice = refundNoticeFromRecord(payment, record, TX)!
    expect(defaultRefundSubject(notice)).toBe('Refund of $300.00 requested — Invoice #12')
    expect(defaultRefundMessage(notice)).toContain('for your card payment of October 1, 2026 on Invoice #12 has been requested from our payment processor, Stripe.')
    expect(defaultRefundMessage(notice)).toContain('A refund reference number (ARN) is not available yet.')
    expect(defaultRefundMessage({ ...notice, arn: 'ARN-9' })).toContain('(ARN): ARN-9.')
    const html = buildRefundEmailHtml({ notice, message: MESSAGE, footerHtml: FOOTER_HTML })
    expect(html).toContain('TEST NOTICE — Stripe sandbox refund. No money was moved.')
    expect(html).toContain('Pending — available on request')
    expect(html).toContain('re_madeUp0001')
    expect(html).toContain(SCRIPT_ESCAPED)
    expect(html).toContain(FOOTER_HTML)
    const text = buildRefundEmailText({ notice: { ...notice, isTest: false, arn: 'ARN-9' }, message: 'Hello', footerText: FOOTER_TEXT })
    expect(text).toContain('Refund reference (ARN): ARN-9')
    expect(text).not.toContain('TEST NOTICE')
    expect(text).toContain(FOOTER_TEXT)
  })
})
