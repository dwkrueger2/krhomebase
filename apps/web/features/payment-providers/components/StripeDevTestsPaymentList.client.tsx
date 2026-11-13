'use client'
// file: apps/web/features/payment-providers/components/StripeDevTestsPaymentList.client.tsx
/**
 * The search results list and status chip of the sandbox query boxes, moved unchanged out of the old
 * `StripeDevTestsQueryPanel.client.tsx` (which grew past the 400-line limit here): the short date format, the status
 * chip color and label, and `PaymentList`.
 *
 * Changed from the old file (styling only, same look in the light theme): the chips' `rounded` became `rounded-[4px]`.
 */

import type { StripeDevTestsPaymentSummary } from '@krhomebase/contracts'
import { formatCents } from '@/features/payment-providers/stripeDevTestsForm'

const STYLES = {
  listRow: 'border-b border-[var(--kr-theme-line,#d7dee5)] text-[8pt] last:border-b-0',
  listLink: 'truncate text-left font-mono text-[8pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
  listAmount: 'text-right tabular-nums text-[var(--kr-theme-text,#243142)]',
  listDate: 'text-right text-[var(--kr-theme-text-muted,#526172)]',
  chipSucceeded: 'px-1 rounded-[4px] text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-success,#2e7d5b)]',
  chipFailed: 'px-1 rounded-[4px] text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-danger,#9d2c20)]',
  chipPending: 'px-1 rounded-[4px] text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-warning,#b47a2a)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The list's height limit and its row grid (the query panel's `list` and `listRow`). */
const LAYOUT_STYLES = {
  list: 'max-h-[180px] overflow-y-auto',
  listRow: 'py-0.5 gap-1 grid grid-cols-[minmax(0,1fr)_auto_64px_52px] items-center',
} as const

/** Formats an ISO timestamp as a short local date/time, e.g. `9/25 1:42 PM`. */
export function formatShortDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Chooses the status chip color: green succeeded, red failed/canceled, amber anything in progress. */
export function statusChipStyle(status: string): string {
  if (status === 'succeeded') return STYLES.chipSucceeded
  if (status === 'requires_payment_method' || status === 'canceled') return STYLES.chipFailed
  return STYLES.chipPending
}

/** Short label for a PaymentIntent status. */
export function statusLabel(status: string): string {
  if (status === 'requires_payment_method') return 'failed'
  if (status === 'requires_action') return 'action'
  return status.replace(/_/g, ' ')
}

/**
 * Compact list of PaymentIntents returned by a search. Clicking an id sends it
 * to the lookup box through `onSelect`.
 */
export default function PaymentList({ payments, onSelect }: { payments: StripeDevTestsPaymentSummary[]; onSelect: (paymentIntentId: string) => void }) {
  return (
    <div className={LAYOUT_STYLES.list} data-kr-element="stripe-dev-tests-payment-list">
      {payments.map((payment) => (
        <div className={`${LAYOUT_STYLES.listRow} ${STYLES.listRow}`} key={payment.paymentIntentId}>
          <button className={STYLES.listLink} onClick={() => onSelect(payment.paymentIntentId)} title={`Look up ${payment.paymentIntentId}`} type="button">{payment.paymentIntentId}</button>
          <span className={statusChipStyle(payment.status)}>{statusLabel(payment.status)}</span>
          <span className={STYLES.listAmount}>{formatCents(payment.amountCents, payment.currency)}</span>
          <span className={STYLES.listDate}>{formatShortDate(payment.createdIso).split(',')[0]}</span>
        </div>
      ))}
    </div>
  )
}
