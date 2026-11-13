'use client'
// file: apps/web/features/payment-providers/components/StripeDevTestsResultPanel.client.tsx
/**
 * The sandbox tests' result panel (the latest card or ACH test payment), moved unchanged out of the old
 * `StripeDevTestsWorkspace.client.tsx` (which grew past the 400-line limit here). The workspace owns the result; this
 * component only draws it, with the old classes, texts and markers.
 *
 * Changed from the old file (styling only, same look in the light theme): `rounded` became `rounded-[4px]` and
 * `bg-white` the card surface token with a white fallback.
 */

import type { StripeDevTestsPaymentResult } from '@krhomebase/contracts'
import { formatCents } from '@/features/payment-providers/stripeDevTestsForm'

const STYLES = {
  panelTitle: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  resultSucceeded: 'rounded-[4px] border border-[var(--kr-theme-success,#2e7d5b)] bg-[var(--kr-theme-card-surface,#ffffff)]',
  resultDeclined: 'rounded-[4px] border border-[var(--kr-theme-danger,#9d2c20)] bg-[var(--kr-theme-card-surface,#ffffff)]',
  resultPending: 'rounded-[4px] border border-[var(--kr-theme-warning,#b47a2a)] bg-[var(--kr-theme-card-surface,#ffffff)]',
  resultEmpty: 'rounded-[4px] border border-dashed border-[var(--kr-theme-line,#b8c3cd)] text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  resultKey: 'text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  resultValue: 'font-mono text-[9pt] text-[var(--kr-theme-text,#243142)] break-all',
  link: 'text-[9pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The result panel's padding and its key/value grid (the workspace's `resultPanel` and `resultGrid`). */
const LAYOUT_STYLES = {
  resultPanel: 'p-3 gap-2 grid',
  resultGrid: 'gap-x-3 gap-y-1 grid grid-cols-[120px_minmax(0,1fr)]',
} as const

/**
 * Draws the latest test payment: PaymentIntent outcome or decline details from Stripe, or the empty note.
 *
 * @param result - The latest result, or null before any test ran.
 * @returns The result panel.
 */
export default function StripeDevTestsResultPanel({ result }: { result: StripeDevTestsPaymentResult | null }) {
  const resultStyle = result
    ? result.status === 'succeeded'
      ? STYLES.resultSucceeded
      : result.errorCode
        ? STYLES.resultDeclined
        : STYLES.resultPending
    : STYLES.resultEmpty

  return (
    <section className={`${LAYOUT_STYLES.resultPanel} ${resultStyle}`} aria-live="polite" aria-label="Test payment result" data-kr-id="stripe-dev-tests-result" data-kr-element="stripe-dev-tests-result">
      {result ? (
        <>
          <h3 className={STYLES.panelTitle}>{result.status === 'succeeded' ? 'Payment succeeded' : result.errorCode ? 'Payment declined' : `Payment ${result.status ?? 'incomplete'}`}</h3>
          <dl className={LAYOUT_STYLES.resultGrid}>
            <dt className={STYLES.resultKey}>PaymentIntent</dt><dd className={STYLES.resultValue}>{result.paymentIntentId ?? '—'}</dd>
            <dt className={STYLES.resultKey}>Status</dt><dd className={STYLES.resultValue}>{result.status ?? '—'}</dd>
            <dt className={STYLES.resultKey}>Amount</dt><dd className={STYLES.resultValue}>{formatCents(result.amountCents, result.currency)}</dd>
            <dt className={STYLES.resultKey}>{result.method === 'ach' ? 'Bank' : 'Card'}</dt><dd className={STYLES.resultValue}>{result.cardBrand || result.cardLast4 ? `${result.cardBrand ?? ''} •••• ${result.cardLast4 ?? ''}`.trim() : '—'}</dd>
            {result.errorCode ? (<><dt className={STYLES.resultKey}>Error / decline</dt><dd className={STYLES.resultValue}>{result.errorCode}{result.declineCode ? ` / ${result.declineCode}` : ''}</dd></>) : null}
            {result.errorMessage ? (<><dt className={STYLES.resultKey}>Stripe message</dt><dd className={STYLES.resultValue}>{result.errorMessage}</dd></>) : null}
            <dt className={STYLES.resultKey}>Client / ICID</dt><dd className={STYLES.resultValue}>{result.clientNumber ?? '—'} / {result.icid ?? '—'}</dd>
            <dt className={STYLES.resultKey}>IVID</dt><dd className={STYLES.resultValue}>{result.ivid ?? '—'}</dd>
            <dt className={STYLES.resultKey}>Mode</dt><dd className={STYLES.resultValue}>{result.livemode ? 'LIVE' : 'sandbox'}</dd>
          </dl>
          {result.dashboardUrl ? <a className={STYLES.link} href={result.dashboardUrl} rel="noopener noreferrer" target="_blank">Open in Stripe Dashboard</a> : null}
        </>
      ) : (
        <p>No test payment yet. Run one to see the PaymentIntent here.</p>
      )}
    </section>
  )
}
