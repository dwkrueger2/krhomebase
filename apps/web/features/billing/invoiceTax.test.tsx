// file: apps/web/features/billing/invoiceTax.test.tsx
/**
 * Tax line (the requester, Nov 16, 2026: "add tax line since there may be some jurisdictions that may require tax
 * payments"): the invoice editor shows a Tax field beside Write Off, the Invoice Total and Amount due include the tax,
 * and the field is read-only when the invoice is locked or the person only reads billing. The printed and emailed
 * invoice's Tax row is tested in `packages/documents` (`templates.test.tsx`, `emails.test.ts`). Made-up people and
 * amounts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/invoiceTax.test.tsx
 */

import type { BillingRecord } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import InvoiceEditDialog from './components/InvoiceEditDialog.client'

const INVOICE: BillingRecord['invoices'][number] = {
  id: 'inv-1',
  matterId: 'm-1',
  matterNumber: '501.0',
  invoiceNumber: '121',
  dateInvoiced: '03/05/2026',
  dueDate: '04/04/2026',
  clientLabel: 'Pat Sample',
  amountDue: 324.75,
  writeOff: 0,
  taxAmount: 24.75,
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

const PROPS = {
  allEntries: [ENTRY],
  clientDisplayName: 'Pat Sample',
  clientId: 'cl-1',
  clientNumber: '501',
  matterNumbers: ['501.0'],
  payments: [],
  staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer' }],
  onCancel: () => undefined,
  onOpenPayment: () => undefined,
  onSave: async () => undefined,
  onSaveEntry: async () => undefined,
  onToggleLock: async () => undefined,
}

/** The `<input>` tag that carries the given marker. */
function inputTag(html: string, marker: string): string {
  const rVal = html.match(new RegExp(`<input[^>]*data-kr-element="${marker}"[^>]*>`))?.[0] ?? ''
  return rVal
}

describe('invoice editor tax line', () => {
  it('shows the saved tax beside Write Off and adds it to the invoice total', () => {
    const html = renderToStaticMarkup(<InvoiceEditDialog {...PROPS} invoice={{ ...INVOICE, writeOff: -50 }} />)
    const tax = inputTag(html, 'invoice-tax')
    expect(tax).toContain('aria-label="Tax"')
    expect(tax).toContain('value="$24.75"')
    expect(tax).not.toContain('disabled')
    // Tax comes before Write Off in the adjustments column.
    expect(html.indexOf('data-kr-element="invoice-tax"')).toBeLessThan(html.indexOf('data-kr-element="invoice-write-off"'))
    // 300 in fees + 24.75 tax − 50 write-off.
    expect(html).toMatch(/data-kr-element="invoice-total-summary"[\s\S]*?\$274\.75/)
  })

  it('reads a record without tax as none', () => {
    const { taxAmount: _ignored, ...untaxed } = INVOICE
    const html = renderToStaticMarkup(<InvoiceEditDialog {...PROPS} invoice={untaxed} />)
    expect(inputTag(html, 'invoice-tax')).toContain('value="$0.00"')
    expect(html).toMatch(/data-kr-element="invoice-total-summary"[\s\S]*?\$300\.00/)
  })

  it('makes the tax read-only for a locked invoice and for a billing reader', () => {
    const locked = renderToStaticMarkup(<InvoiceEditDialog {...PROPS} invoice={{ ...INVOICE, locked: true }} />)
    expect(inputTag(locked, 'invoice-tax')).toContain('disabled')
    const reader = renderToStaticMarkup(<InvoiceEditDialog {...PROPS} invoice={INVOICE} readOnly />)
    expect(inputTag(reader, 'invoice-tax')).toContain('disabled')
  })
})
