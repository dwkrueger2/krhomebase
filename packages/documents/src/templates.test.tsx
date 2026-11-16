// file: packages/documents/src/templates.test.tsx
/**
 * The React templates (Billing part 7b): each renders its sample document to markup with the letterhead it is given,
 * keeps every section a direct child of the PrintDocument root (the pagination contract), and prints the pay link
 * only when one is given. Rendered with `react-dom/server`, as the API will render them for the PDF (part 7c).
 *
 * Run: pnpm --dir packages/documents exec vitest run src/templates.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import InvoiceReportOption1 from './InvoiceReportOption1.tsx'
import InvoiceReportOption2 from './InvoiceReportOption2.tsx'
import { buildLetterhead } from './letterhead.ts'
import PaymentReceiptReport from './PaymentReceiptReport.tsx'
import { paymentDetailsFor, stripeCardLabel } from './receiptData.ts'
import { SAMPLE_FIRM_PROFILE, buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from './sampleData.ts'
import StatementOfAccountReport from './StatementOfAccountReport.tsx'

const KS = buildLetterhead(SAMPLE_FIRM_PROFILE, 'sample-office-pratt')

describe('templates', () => {
  it('render the sample invoice in both options with the letterhead given', () => {
    const invoice = buildSampleInvoice(KS)
    for (const html of [renderToStaticMarkup(<InvoiceReportOption1 data={invoice} />), renderToStaticMarkup(<InvoiceReportOption2 data={invoice} />)]) {
      expect(html).toContain('data-kr-firm-state="KS"')
      expect(html).toContain('Kansas')
      expect(html).toContain('PRATT, KS')
      expect(html).toContain('3392')
      expect(html).toContain('$7,789.00')
      expect(html).toContain('class="kr-print-table')
      expect(html).not.toContain('href="https://')
    }
    // Option 1 without a pay link: the placeholder note, not a link (Option 2's pay strip never prints the link).
    expect(renderToStaticMarkup(<InvoiceReportOption1 data={invoice} />)).toContain('Your secure pay link is included when this invoice is emailed.')
    const linked = renderToStaticMarkup(<InvoiceReportOption1 data={{ ...invoice, payOnline: { url: 'pay.example.com/p/abc', urlNote: '' } }} />)
    expect(linked).toContain('href="https://pay.example.com/p/abc"')
  })

  it('print a Tax row in both options only when the invoice carries tax (tax line, Nov 16, 2026)', () => {
    const invoice = buildSampleInvoice(KS)
    const taxed = { ...invoice, taxAmount: 123.45, totalAmount: invoice.totalAmount + 123.45 }
    for (const Template of [InvoiceReportOption1, InvoiceReportOption2]) {
      const html = renderToStaticMarkup(<Template data={taxed} />)
      expect(html).toContain('data-kr-element="invoice-tax-row"')
      expect(html).toMatch(/<dt[^>]*>Tax<\/dt><dd[^>]*>\$123\.45<\/dd>/)
      // The row sits between "Invoice amount" and "Other outstanding balances".
      expect(html.indexOf('Invoice amount')).toBeLessThan(html.indexOf('invoice-tax-row'))
      expect(html.indexOf('invoice-tax-row')).toBeLessThan(html.indexOf('Other outstanding balances'))
      expect(renderToStaticMarkup(<Template data={invoice} />)).not.toContain('invoice-tax-row')
      expect(renderToStaticMarkup(<Template data={{ ...invoice, taxAmount: 0 }} />)).not.toContain('invoice-tax-row')
    }
  })

  it('render the statement and the receipt', () => {
    const statement = renderToStaticMarkup(<StatementOfAccountReport data={buildSampleStatement(KS)} />)
    expect(statement).toContain('Statement of Account')
    expect(statement).toContain('$7,039.00')
    const receiptData = buildSampleReceipt(KS)
    const receipt = renderToStaticMarkup(<PaymentReceiptReport data={receiptData} />)
    expect(receipt).toContain('1790480990196')
    expect(receipt).toContain('$4,000.00')
    expect(paymentDetailsFor(receiptData)).toMatchObject({ appliedTo: 'Invoice #3391 (K7M2Q9A)', amountReceived: 4000, invoiceBalanceBefore: 9289, invoiceBalanceAfter: 5000 })
  })

  it('reads the card label from a Stripe memo only', () => {
    expect(stripeCardLabel('Stripe sandbox · Visa •••• 4242 · note', 'stripe_sandbox')).toBe('Visa •••• 4242')
    expect(stripeCardLabel('Stripe sandbox · Visa •••• 4242', null)).toBeNull()
    expect(stripeCardLabel('Check 1001', 'stripe_live')).toBeNull()
  })
})
