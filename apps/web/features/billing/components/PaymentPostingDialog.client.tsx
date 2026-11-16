'use client'
// file: apps/web/features/billing/components/PaymentPostingDialog.client.tsx
/**
 * The modal shown while a payment posts (the requester, Nov 16, 2026, web patch 558): a translucent backdrop over the
 * whole viewport, "Posting payment..." (then "Emailing receipt...") with the rainbow spinner, and then the answer:
 * "Payment posted" with what was posted and where the receipt went, or "Payment not posted" with the reason. Before
 * this, a posted payment showed only a line under the form, easy to miss.
 *
 * `PaymentsTab` owns the state and the post itself; this dialog only shows it. Nothing can be pressed while the
 * request runs; afterwards OK (or Escape) closes it. Same look as `U6ConfirmationDialog` (backdrop, panel, tokens),
 * which has no result step and always shows Cancel and Confirm, so it is not reused here.
 *
 * Web patch 559 (the requester, Nov 16, 2026): the posted answer says what happened as a heading ("Payment of $10.00
 * posted against Invoice #5") and a list (where the receipt was emailed, or why not; where to review and resend it),
 * then shows the receipt itself as the Payment Receipt dialog does (`PaymentReceiptSummary`), once the reloaded record
 * has the new payment.
 *
 * Web patch 560 (the requester, Nov 16, 2026): the same dialog shows a void (`kind="void"`, from Posted Payments):
 * "Voiding the payment..." (and refunding the card in Stripe), "Emailing the refund notice...", then "Payment voided"
 * with its list (the refund, the notice, where to see it) or "Payment not voided" with the reason. No receipt section.
 * The backdrop sits above the void form and the receipt dialog (z 1300).
 *
 * Decision C2 (the requester, Nov 16, 2026): `kind="apply"` shows unapplied money being applied to invoices (from Posted
 * Payments, `ApplyUnappliedDialog`): "Applying the payment...", then "Payment applied" with its list (what went to each
 * invoice, what is left unapplied) or "Payment not applied" with the reason. No receipt section, as for a void.
 */

import type { PaymentDetails } from '@krhomebase/documents/types'
import { useEffect, useRef } from 'react'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { KrRequestErrorInfo } from '@/lib/krRequestError'
import { PaymentReceiptSummary } from './PaymentDetailsDialog.client'

/**
 * Where the request is: `posting` (posting, or voiding for `kind="void"`), `receipt` (emailing the receipt or the
 * refund notice), or finished one way or the other.
 */
export type PaymentPostingPhase = 'posting' | 'receipt' | 'posted' | 'failed'

export interface PaymentPostingDialogProps {
  /** `post` (default): Post Payment. `void`: a void from Posted Payments (web patch 560). `apply`: unapplied money applied to invoices (decision C2). */
  kind?: 'post' | 'void' | 'apply'
  /** Null: the dialog is closed. */
  phase: PaymentPostingPhase | null
  /** Credit card: the spinner says the card is charged (posting) or refunded (void) too. */
  chargingCard: boolean
  /** The posted sentence (amount, invoices, receipt address). */
  posted: string | null
  /** The receipt could not be emailed; the payment stands. */
  receiptWarning: string | null
  /** Why the payment was not posted. */
  error: KrRequestErrorInfo | null
  /** The posted answer's heading and list (web patch 559); without it the plain `posted` sentence shows. */
  summary?: { heading: string; points: readonly string[] } | null
  /** The new payment's receipt, once the reloaded record has it; null while it loads. */
  receipt?: PaymentDetails | null
  onClose: () => void
}

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  title: 'text-[length:var(--kr-theme-font-size-bigger)] font-semibold text-(color:--kr-theme-text)',
  titleFailed: 'text-(color:--kr-theme-danger)',
  text: 'text-[length:var(--kr-theme-font-size-base)] leading-normal text-(color:--kr-theme-text)',
  heading: 'm-0 text-[length:var(--kr-theme-font-size-base)] font-semibold text-(color:--kr-theme-text)',
  points: 'm-0 list-disc text-[length:var(--kr-theme-font-size-base)] leading-normal text-(color:--kr-theme-text)',
  muted: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  warning: 'text-[length:var(--kr-theme-font-size-base)] leading-normal text-(color:--kr-theme-warning)',
  button:
    'px-[10px] py-[6px] rounded-[3px] border cursor-pointer border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text-inverse)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities (the confirmation dialog's measures). */
const LAYOUT_STYLES = {
  // Above the void form (1200) and the Payment Receipt dialog (1250), which may be open beneath it.
  backdrop: 'p-[10px] fixed inset-0 z-[1300] flex items-center justify-center',
  dialog: 'p-[10px] w-full max-w-[440px]',
  // The posted answer shows the receipt: the Payment Receipt dialog's width, and a scroll on short windows.
  dialogWide: 'p-[10px] w-full max-w-[560px] max-h-[calc(100vh-20px)] overflow-y-auto',
  points: 'pl-[18px] gap-[2px] grid',
  body: 'mt-[6px] gap-[6px] grid',
  busy: 'mt-[8px]',
  actions: 'mt-[10px] gap-[6px] flex justify-end',
} as const

/** Renders the posting modal for the Post Payment form. */
export default function PaymentPostingDialog({ chargingCard, error, kind = 'post', onClose, phase, posted, receipt = null, receiptWarning, summary = null }: PaymentPostingDialogProps) {
  const okRef = useRef<HTMLButtonElement>(null)
  const working = phase === 'posting' || phase === 'receipt'

  // The answer takes the focus, so Enter or Escape closes it; nothing closes it while the request runs.
  useEffect(() => {
    if (!phase || working) return
    okRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, working, onClose])

  if (!phase) return null
  const voiding = kind === 'void'
  // A void and an apply show no receipt section (`voiding` below keeps that one rule).
  const noReceipt = voiding || kind === 'apply'
  const title = kind === 'apply'
    ? working ? 'Applying payment' : phase === 'posted' ? 'Payment applied' : 'Payment not applied'
    : voiding
      ? working ? 'Voiding payment' : phase === 'posted' ? 'Payment voided' : 'Payment not voided'
      : working ? 'Posting payment' : phase === 'posted' ? 'Payment posted' : 'Payment not posted'
  const busyLabel = kind === 'apply'
    ? 'Applying the payment to the invoices...'
    : voiding
      ? phase === 'receipt' ? 'Emailing the refund notice...' : chargingCard ? 'Voiding the payment and refunding the card in Stripe...' : 'Voiding the payment...'
      : phase === 'receipt' ? 'Emailing receipt...' : chargingCard ? 'Charging the card and posting the payment...' : 'Posting payment...'

  return (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation" data-kr-id="payment-posting-backdrop">
      {/* Panel: the running step with its spinner, then the answer with OK. */}
      <section aria-busy={working} aria-label={title} aria-live="polite" aria-modal="true" className={`${phase === 'posted' && summary && !noReceipt ? LAYOUT_STYLES.dialogWide : LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="payment-posting-dialog" data-kr-state={phase} role="dialog">
        <h2 className={`${STYLES.title} ${phase === 'failed' ? STYLES.titleFailed : ''}`}>{title}</h2>
        {working ? (
          <div className={LAYOUT_STYLES.busy}>
            <RainbowBusySpinner busy hideWhenIdle={false} label={busyLabel} size={18} />
          </div>
        ) : (
          <div className={LAYOUT_STYLES.body}>
            {/* Posted: the heading, the list, then the receipt as the Payment Receipt dialog shows it. */}
            {phase === 'posted' && summary ? (
              <>
                <p className={STYLES.heading} data-kr-element="payment-posting-heading">{summary.heading}</p>
                <ul className={`${LAYOUT_STYLES.points} ${STYLES.points}`} data-kr-element="payment-posting-points">
                  {summary.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                  {receiptWarning ? <li className={STYLES.warning}>{receiptWarning}</li> : null}
                </ul>
                {noReceipt ? null : receipt ? <PaymentReceiptSummary details={receipt} /> : <p className={STYLES.muted}>Loading the receipt...</p>}
              </>
            ) : null}
            {phase === 'posted' && !summary && posted ? <p className={STYLES.text}>{posted}</p> : null}
            {phase === 'posted' && !summary && receiptWarning ? <p className={STYLES.warning}>{receiptWarning}</p> : null}
            {phase === 'failed' ? <KrRequestErrorNote dataKrElement="payment-posting-error" error={error} /> : null}
          </div>
        )}
        {/* OK only once the answer is in. */}
        {working ? null : (
          <div className={LAYOUT_STYLES.actions}>
            <button className={STYLES.button} data-kr-action="payment-posting-ok" onClick={onClose} ref={okRef} type="button">OK</button>
          </div>
        )}
      </section>
    </div>
  )
}
