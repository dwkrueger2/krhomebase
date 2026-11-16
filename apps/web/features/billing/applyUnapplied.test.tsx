// file: apps/web/features/billing/applyUnapplied.test.tsx
/**
 * Decision C2 (the requester, Nov 16, 2026): unapplied payment money can be applied to an invoice later. Checks the open
 * invoices offered and the amount checks of `ApplyUnappliedDialog`, the unapplied line and its "Apply to invoice" button
 * in Posted Payments (writers only, live payments only), the form as first drawn, and the `apply` kind of the progress
 * dialog. Made-up people and amounts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/applyUnapplied.test.tsx
 */

import type { BillingPayment, BillingRecord } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ApplyUnappliedDialog, { APPLY_MAX_INVOICES, applyAllocations, openInvoicesForApply, type ApplyInvoiceChoice } from './components/ApplyUnappliedDialog.client'
import PaymentPostingDialog from './components/PaymentPostingDialog.client'
import PostedPaymentsLedger from './components/PostedPaymentsLedger.client'

const invoice = (id: string, number: string, amountDue: number, status: BillingRecord['invoices'][number]['status'] = 'Unpaid'): BillingRecord['invoices'][number] => ({
  id,
  matterId: 'm-1',
  matterNumber: '501.0',
  invoiceNumber: number,
  dateInvoiced: '03/05/2026',
  dueDate: '04/04/2026',
  clientLabel: 'Pat Sample',
  amountDue,
  writeOff: 0,
  ivid: `IV${number}`,
  locked: true,
  status,
  entryIds: [],
})

const INVOICES = [invoice('inv-1', '121', 300), invoice('inv-2', '122', 100, 'Partially paid'), invoice('inv-3', '123', 0, 'Paid'), invoice('inv-4', '124', 50, 'Void')]

/** A cash payment of $500 with $380 still unapplied. */
const PAYMENT: BillingPayment = {
  id: 'pay-1',
  paymentNumber: 'PAY-C2',
  invoiceId: null,
  invoiceNumber: null,
  invoiceIvid: null,
  matterId: 'm-1',
  matterNumber: '501.0',
  receivedDate: '03/06/2026',
  amount: 500,
  paymentType: 'Cash',
  referenceNumber: '',
  memo: '',
  writeOff: 0,
  sourceSystem: null,
  voided: false,
  voidedAt: null,
  voidReason: null,
  refund: null,
  unappliedAmount: 380,
}

const RECEIPT_SOURCE: Pick<BillingRecord, 'client' | 'matters' | 'invoices'> = {
  client: { id: 'cl-1', clientNumber: '501', displayName: 'Pat Sample' },
  matters: [{ id: 'm-1', matterNumber: '501.0', title: 'General' }],
  invoices: INVOICES,
}

describe('the invoices and amounts the apply form accepts', () => {
  it('offers only invoices that are not void and still owe something', () => {
    expect(openInvoicesForApply(INVOICES).map((item) => item.invoiceNumber)).toEqual(['121', '122'])
  })

  it('leaves out a draft (not locked) invoice until it is finalized (the requester, Nov 16, 2026)', () => {
    const draft = { ...invoice('inv-5', '125', 200), locked: false }
    expect(openInvoicesForApply([...INVOICES, draft]).map((item) => item.invoiceNumber)).toEqual(['121', '122'])
    expect(openInvoicesForApply([...INVOICES, { ...draft, locked: true }]).map((item) => item.invoiceNumber)).toEqual(['121', '122', '125'])
  })

  it('builds the allocations in list order and stops an Apply the API would refuse', () => {
    const open: ApplyInvoiceChoice[] = openInvoicesForApply(INVOICES)
    expect(applyAllocations(open, {}, 380)).toMatchObject({ allocations: [], total: 0, problem: 'Tick an invoice and enter the amount to apply.' })
    expect(applyAllocations(open, { 'inv-2': 80, 'inv-1': 300 }, 380)).toEqual({
      allocations: [
        { invoiceId: 'inv-1', amount: 300 },
        { invoiceId: 'inv-2', amount: 80 },
      ],
      total: 380,
      problem: null,
    })
    expect(applyAllocations(open, { 'inv-2': 100.01 }, 380).problem).toBe('Invoice #122 has only $100.00 due.')
    expect(applyAllocations(open, { 'inv-1': 300, 'inv-2': 90 }, 380).problem).toBe('Only $380.00 of this payment is unapplied.')
    const many = Array.from({ length: APPLY_MAX_INVOICES + 1 }, (_, index) => invoice(`inv-m${index}`, `9${index}`, 10))
    expect(applyAllocations(many, Object.fromEntries(many.map((item) => [item.id, 1])), 380).problem).toBe('Apply to at most 10 invoices at a time.')
  })
})

describe('Posted Payments with unapplied money', () => {
  it('shows the unapplied amount and Apply to invoice to a billing writer', () => {
    const html = renderToStaticMarkup(<PostedPaymentsLedger canSend canVoid={false} onVoid={async () => undefined} payments={[PAYMENT]} receiptSource={RECEIPT_SOURCE} />)
    expect(html).toContain('data-kr-element="posted-payment-unapplied"')
    expect(html).toContain('$380.00')
    expect(html).toContain('data-kr-action="posted-payment-apply"')
  })

  it('shows the amount without the button to a reader, and nothing for a voided or fully applied payment', () => {
    const reader = renderToStaticMarkup(<PostedPaymentsLedger canSend={false} canVoid={false} onVoid={async () => undefined} payments={[PAYMENT]} receiptSource={RECEIPT_SOURCE} />)
    expect(reader).toContain('data-kr-element="posted-payment-unapplied"')
    expect(reader).not.toContain('posted-payment-apply')
    const applied = renderToStaticMarkup(<PostedPaymentsLedger canSend canVoid={false} onVoid={async () => undefined} payments={[{ ...PAYMENT, unappliedAmount: 0 }]} receiptSource={RECEIPT_SOURCE} />)
    expect(applied).not.toContain('posted-payment-unapplied')
    // An older record without the field reads as nothing unapplied.
    const older = renderToStaticMarkup(<PostedPaymentsLedger canSend canVoid={false} onVoid={async () => undefined} payments={[{ ...PAYMENT, unappliedAmount: undefined }]} receiptSource={RECEIPT_SOURCE} />)
    expect(older).not.toContain('posted-payment-unapplied')
  })
})

describe('the apply form and its progress dialog', () => {
  it('lists the open invoices with the money to apply, and Apply waits for a tick', () => {
    const html = renderToStaticMarkup(<ApplyUnappliedDialog clientId="cl-1" invoices={INVOICES} onClose={() => undefined} payment={PAYMENT} />)
    expect(html).toContain('data-kr-id="apply-unapplied-dialog"')
    expect(html).toContain('Apply $380.00 unapplied')
    expect(html.match(/data-kr-element="apply-unapplied-invoice-row"/g)).toHaveLength(2)
    expect(html).toContain('#121')
    expect(html).not.toContain('#124')
    expect(html).toMatch(/<button[^>]*data-kr-action="apply-unapplied-confirm"[^>]*disabled=""/)
    expect(html).toContain('Left unapplied $380.00')
  })

  it('says so when the client has no open invoice', () => {
    const html = renderToStaticMarkup(<ApplyUnappliedDialog clientId="cl-1" invoices={[INVOICES[2]!, INVOICES[3]!]} onClose={() => undefined} payment={PAYMENT} />)
    expect(html).toContain('data-kr-element="apply-unapplied-none"')
  })

  it('names each step of an apply in the progress dialog', () => {
    const render = (phase: 'posting' | 'posted' | 'failed') =>
      renderToStaticMarkup(<PaymentPostingDialog chargingCard={false} error={null} kind="apply" onClose={() => undefined} phase={phase} posted={null} receiptWarning={null} summary={{ heading: '$120.00 of payment PAY-C2 applied.', points: ['$120.00 to Invoice #121.'] }} />)
    expect(render('posting')).toContain('Applying the payment to the invoices...')
    const posted = render('posted')
    expect(posted).toContain('Payment applied')
    expect(posted).toContain('$120.00 to Invoice #121.')
    expect(posted).not.toContain('Loading the receipt')
    expect(render('failed')).toContain('Payment not applied')
  })
})
