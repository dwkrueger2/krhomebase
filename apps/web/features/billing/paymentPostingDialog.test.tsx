// file: apps/web/features/billing/paymentPostingDialog.test.tsx
/**
 * The posting modal of the Post Payment form (web patch 558): closed, the spinner while posting and emailing the
 * receipt (no buttons), then the answer with OK: posted (with the receipt line or its warning) or not posted (the reason).
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PaymentPostingDialog, { type PaymentPostingDialogProps } from './components/PaymentPostingDialog.client'

const noop = () => undefined

function draw(extra: Partial<PaymentPostingDialogProps>): string {
  return renderToStaticMarkup(<PaymentPostingDialog chargingCard={false} error={null} phase={null} posted={null} receiptWarning={null} onClose={noop} {...extra} />)
}

describe('PaymentPostingDialog', () => {
  it('draws nothing while closed', () => {
    expect(draw({})).toBe('')
  })

  it('shows the spinner with no buttons while the payment posts and the receipt is emailed', () => {
    const posting = draw({ phase: 'posting' })
    expect(posting).toContain('aria-modal="true"')
    expect(posting).toContain('data-kr-id="payment-posting-backdrop"')
    expect(posting).toContain('Posting payment...')
    expect(posting).not.toContain('<button')
    expect(draw({ phase: 'posting', chargingCard: true })).toContain('Charging the card and posting the payment...')
    expect(draw({ phase: 'receipt' })).toContain('Emailing receipt...')
  })

  it('says the payment posted, with the receipt line or its warning, and offers OK', () => {
    const posted = draw({ phase: 'posted', posted: 'Payment of $10.00 posted across 1 invoice. Receipt emailed to pat@example.com.' })
    expect(posted).toContain('Payment posted')
    expect(posted).toContain('Receipt emailed to pat@example.com.')
    expect(posted).toContain('data-kr-action="payment-posting-ok"')
    expect(draw({ phase: 'posted', posted: 'Payment of $10.00 posted across 1 invoice.', receiptWarning: 'The payment is posted, but the receipt was not emailed.' })).toContain('the receipt was not emailed')
  })

  it('lists what happened and shows the receipt as the Payment Receipt dialog does (web patch 559)', () => {
    const summary = { heading: 'Payment of $10.00 posted against Invoice #5.', points: ['The receipt email has been sent to the client at pat@example.com.', 'You can review and resend the payment receipt in Clients > Billing > Payments > Posted Payments.'] }
    expect(draw({ phase: 'posted', summary })).toContain('Loading the receipt...')
    const receipt = {
      receiptNumber: 'PAY-1',
      paymentDate: 'November 16, 2026',
      receivedFrom: 'Pat Client',
      clientNumber: '306',
      matterNumber: '306.0',
      matterTitle: 'Client General Matters',
      appliedTo: 'Invoice #5 (4FZMANA)',
      paymentMethod: 'Credit card · visa •••• 4242',
      processor: 'Stripe (sandbox — test payment)',
      reference: 'pi_123',
      amountReceived: 10,
      invoiceBalanceBefore: 325.33,
      invoiceBalanceAfter: 315.33,
      isTest: true,
    }
    const html = draw({ phase: 'posted', summary, receipt })
    expect(html).toContain('Payment of $10.00 posted against Invoice #5.')
    expect(html).toContain('<li>The receipt email has been sent to the client at pat@example.com.</li>')
    expect(html).toContain('Clients &gt; Billing &gt; Payments &gt; Posted Payments')
    expect(html).toContain('data-kr-element="payment-details-summary"')
    expect(html).toContain('Invoice balance now $315.33')
    // The sandbox note is said once (it was doubled in the Payment Receipt dialog).
    expect(html.split('(sandbox — test payment)')).toHaveLength(2)
  })

  it('shows a void the same way, without a receipt (web patch 560)', () => {
    expect(draw({ kind: 'void', phase: 'posting', chargingCard: true })).toContain('Voiding the payment and refunding the card in Stripe...')
    expect(draw({ kind: 'void', phase: 'receipt' })).toContain('Emailing the refund notice...')
    const summary = { heading: 'Payment PAY-1 of $10.00 voided.', points: ['$10.00 was refunded to the card through Stripe (re_1).', 'The refund notice has been sent to the client at pat@example.com.'] }
    const voided = draw({ kind: 'void', phase: 'posted', summary })
    expect(voided).toContain('Payment voided')
    expect(voided).toContain('<li>$10.00 was refunded to the card through Stripe (re_1).</li>')
    expect(voided).not.toContain('Loading the receipt')
    expect(voided).not.toContain('payment-details-summary')
    expect(draw({ kind: 'void', phase: 'failed', error: { message: 'Stripe refused the refund.', code: 'STRIPE_REFUND_FAILED', status: 502, requestId: null } as never })).toContain('Payment not voided')
  })

  it('says the payment was not posted, with the reason', () => {
    const failed = draw({ phase: 'failed', error: { message: 'The card was declined.', code: 'STRIPE_CARD_DECLINED', status: 402, requestId: 'req-1' } as never })
    expect(failed).toContain('Payment not posted')
    expect(failed).toContain('The card was declined.')
    expect(failed).toContain('data-kr-action="payment-posting-ok"')
  })
})
