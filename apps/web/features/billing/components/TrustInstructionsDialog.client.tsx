'use client'
// file: apps/web/features/billing/components/TrustInstructionsDialog.client.tsx
/**
 * How the trust account works, opened by the [i] button on the Trust tab (decision C3, the requester, Nov 16, 2026,
 * web patch 561). The trust ledger keeps its own integrity: trust money never appears on the Billing Overview, and it
 * reaches the client's billing ledger only as a payment posted against an invoice. The text says how to record each
 * step until a one-step "Pay invoice from trust" exists.
 *
 * Read-only: the dialog shows text and closes with Close, Escape or a press on the backdrop.
 */

import { useEffect, useRef } from 'react'

export interface TrustInstructionsDialogProps {
  open: boolean
  onClose: () => void
}

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[13px] font-bold text-(color:--kr-theme-text)',
  body: 'text-[12px] leading-normal text-(color:--kr-theme-text)',
  heading: 'm-0 text-[11px] font-bold uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  text: 'm-0',
  list: 'm-0',
  strong: 'font-semibold',
  closeButton: 'cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-semibold text-(color:--kr-theme-text)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1250] flex items-center justify-center',
  dialog: 'w-full max-w-[560px] max-h-[calc(100vh-20px)] flex flex-col overflow-hidden',
  header: 'px-[8px] py-[4px] gap-[6px] flex shrink-0 items-center justify-between',
  body: 'p-[8px] gap-[6px] grid overflow-y-auto',
  list: 'pl-[18px] gap-[3px] grid',
  closeButton: 'px-[8px] py-[2px] min-h-[24px]',
} as const

/** Renders the trust account instructions. */
export default function TrustInstructionsDialog({ onClose, open }: TrustInstructionsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus Close and let Escape close the dialog.
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-id="trust-instructions-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section aria-label="How the trust account works" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="trust-instructions-dialog" role="dialog">
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <h2 className={STYLES.title}>How the trust account works</h2>
          <button className={`${LAYOUT_STYLES.closeButton} ${STYLES.closeButton}`} data-kr-action="trust-instructions-close" ref={closeRef} type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className={`${LAYOUT_STYLES.body} ${STYLES.body}`}>
          {/* The rule: two separate accounts. */}
          <p className={STYLES.text}>
            Money in trust belongs to the client until it is earned or returned. The trust ledger is its own account with its own balance: it is kept here on the Trust tab and is never mixed into the client&apos;s billing balance on the Billing Overview.
          </p>
          <p className={STYLES.heading}>Recording trust money</p>
          <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
            <li>
              <span className={STYLES.strong}>Add Trust Request:</span> asks the client for a retainer. It records the request only; no money moves.
            </li>
            <li>
              <span className={STYLES.strong}>Record Trust Payment:</span> money received into the trust account, for example the retainer the request asked for. It raises the trust balance only.
            </li>
            <li>
              <span className={STYLES.strong}>Record Trust Disbursement:</span> money taken out of the trust account, to pay an earned invoice or to return funds to the client. It lowers the trust balance only.
            </li>
          </ul>
          <p className={STYLES.heading}>Paying an invoice from trust</p>
          <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
            <li>
              First, here on the Trust tab: <span className={STYLES.strong}>Record Trust Disbursement</span> for the amount, with the invoice number in the note.
            </li>
            <li>
              Then, on <span className={STYLES.strong}>Payments → Post Payment</span>: post a payment of the same amount against that invoice, with &quot;Paid from trust&quot; and the invoice number in Payment Notes. This is the step that lowers the client&apos;s billing balance and marks the invoice paid.
            </li>
            <li>Both amounts must match. The trust balance and the billing balance are reconciled by these two entries, never by moving rows between the ledgers.</li>
          </ul>
          <p className={STYLES.heading}>Returning funds</p>
          <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
            <li>A balance left in trust at the end of a matter is returned with a Record Trust Disbursement. It does not touch the billing ledger.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
