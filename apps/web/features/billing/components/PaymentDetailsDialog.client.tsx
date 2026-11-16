'use client'
// file: apps/web/features/billing/components/PaymentDetailsDialog.client.tsx
/**
 * Standalone details for a posted payment, including the immutable sent-email actions.
 *
 * Ported from the old `KR-Billing/PaymentDetailsDialog.client.tsx` (Billing part 7b of `docs/API/Billing_Audit.md`).
 * Opened by the Posted Payments row's receipt icon and by a payment double-clicked on the Billing Overview
 * (`PostedPaymentsLedger` owns the open state; this dialog shows what it is given).
 *
 * Changed from the old dialog:
 *  - The details come from the Billing record already on screen (`receiptFromBilling` and `paymentDetailsFor`), not
 *    from the old `payment-notice` route, which arrives with part 7c.
 *  - Print opens the receipt in the print view (`/print/receipt`); the old dialog opened the stored, emailed PDF.
 *  - Preview sent email and Resend need the stored copies of part 7c: they are shown disabled with a tooltip.
 *    Billing part 7c (Nov 16, 2026): they are back as in the old dialog. The parent passes the latest sent receipt
 *    (`latestSent`, from `fetchReceiptEmailInfo`; the details still come from the record) and the client id. Preview
 *    opens the stored email (`url` + `?format=html`) in a frame inside the dialog, as the old one did; the frame is
 *    sandboxed (no scripts), which the old one was not. Resend calls `resendBillingDocument` with `to: []` (the
 *    addresses it went to) here, where the old dialog took an `onResend` from the parent. Print still opens the print
 *    view (the old Print opened the stored PDF and was off until a receipt was sent).
 *  - Styled with the theme tokens and the Density Contract; the overlay carries `data-kr-theme-scope` because it is
 *    drawn into <body> (apps/web/AGENTS.md, "Portals").
 *
 * @returns The dialog, drawn into <body> once mounted.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PaymentDetails } from '@krhomebase/documents/types'
import type { BillingSentDocument } from '@krhomebase/contracts'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import { L } from '@/lib/KRUtilities'
import { BillingApiError, resendBillingDocument } from '../api.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { billingSentHtmlUrl } from './SendInvoiceDialog.client'

const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'w-full max-w-[560px] overflow-hidden rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[13px] font-bold text-(color:--kr-theme-text)',
  body: 'text-[12px] text-(color:--kr-theme-text)',
  summary: 'rounded-[3px] bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  summaryLabel: 'text-[10px] uppercase tracking-[0.14em]',
  summaryAmount: 'text-[17px] font-bold leading-tight tabular-nums',
  table: 'w-full border-collapse',
  label: 'p-[2px] border-b border-(--kr-theme-line) text-left align-top text-[10px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap text-(color:--kr-theme-text-muted)',
  value: 'p-[2px] border-b border-(--kr-theme-line) text-left tabular-nums',
  iconButton: 'inline-flex size-[24px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-(color:--kr-theme-brand-primary) hover:enabled:bg-(--kr-theme-card-surface) disabled:cursor-help disabled:opacity-40',
  icon: 'size-[16px]',
  closeButton: 'px-[8px] py-[2px] min-h-[24px] cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-semibold text-(color:--kr-theme-text)',
  status: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  // The sent-email preview: a second dialog over this one, with the stored email in a frame.
  previewDialog: 'overflow-hidden rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  previewHeader: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[12px] font-bold text-(color:--kr-theme-text)',
  // The email's own HTML paints its paper color; this only shows while the frame loads.
  previewFrame: 'border-0 bg-(--kr-theme-muted-surface)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1250] flex items-center justify-center',
  header: 'px-[8px] py-[4px] gap-[6px] flex items-center justify-between',
  actions: 'gap-[3px] flex items-center',
  body: 'p-[8px] gap-[6px] grid',
  summary: 'px-[8px] py-[6px]',
  previewDialog: 'flex h-[85vh] w-full max-w-[820px] flex-col',
  previewHeader: 'px-[8px] py-[4px] gap-[6px] flex shrink-0 items-center justify-between',
  previewFrame: 'h-full w-full min-h-0 flex-1',
} as const

/** Why Preview sent email and Resend are disabled. */
const NOTHING_SENT = 'No receipt email has been sent for this payment.'

export interface PaymentDetailsDialogProps {
  paymentNumber: string
  details: PaymentDetails
  /** The client account id, for the re-send. */
  clientId: string
  /** The newest sent receipt email of this payment, or null when none was sent (or the list is still loading). */
  latestSent: BillingSentDocument | null
  /** A sentence about the sent list: still loading, or why it could not be read. Null once it is known. */
  sentNote?: string | null
  onClose: () => void
  /** Opens the receipt in the print view; returns a sentence when it did not open. */
  onPrint: () => string | null
}

function money(value: number | null): string {
  return value === null ? '—' : formatAccountingAmount(value)
}

/** Receipt details dialog: the payment's receipt details, Print (print view) and Close. */
export default function PaymentDetailsDialog({ paymentNumber, details, clientId, latestSent, sentNote = null, onClose, onPrint }: PaymentDetailsDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // The Homebase main panel is an isolated stacking context below TopTitleBar.
  // Portaling this overlay to body lets the dialog's z-index cross that shell boundary.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Escape closes, as the other Billing dialogs do (the sent-email preview first, when it is open).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (previewOpen) setPreviewOpen(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, previewOpen])

  /** Sends the stored receipt again, exactly as it went, to the addresses it went to. */
  async function resend(): Promise<void> {
    if (!latestSent) return
    setBusy(true)
    setStatus('')
    try {
      const result = await resendBillingDocument(clientId, latestSent.documentNumber ?? latestSent.documentId, { to: [] })
      setStatus(`The exact stored receipt was resent to ${result.to.join(', ')}.`)
    } catch (caught) {
      L(`[KR_PAYMENT_DETAILS:resend] failed clientId=${clientId} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
      setStatus(caught instanceof Error ? caught.message : 'The stored receipt could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const previewUrl = latestSent?.hasHtml ? billingSentHtmlUrl(latestSent) : ''

  const rows: Array<[string, string]> = [
    ['Receipt Number', details.receiptNumber],
    ['Payment Date', details.paymentDate],
    ['Received From', details.receivedFrom],
    ['Client / Matter', [details.clientNumber, details.matterNumber, details.matterTitle].filter(Boolean).join(' · ') || '—'],
    ['Applied To', details.appliedTo],
    ['Payment Method', details.paymentMethod],
    ['Processed By', `${details.processor ?? '—'}${details.isTest ? ' (sandbox — test payment)' : ''}`],
    ['Reference', details.reference ?? '—'],
    ['Amount Received', money(details.amountReceived)],
    ['Invoice Balance Before', money(details.invoiceBalanceBefore)],
    ['Invoice Balance After', money(details.invoiceBalanceAfter)],
  ]

  const content = (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" role="presentation">
      <section aria-label="Payment receipt details" aria-modal="true" className={STYLES.dialog} data-kr-id="payment-details-dialog" role="dialog">
        {/* Header: title and the receipt actions */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <h2 className={STYLES.title}>Payment Receipt — {paymentNumber}</h2>
          <div className={LAYOUT_STYLES.actions}>
            <button aria-label="Preview the sent payment receipt email" className={STYLES.iconButton} data-kr-action="payment-details-preview-email" disabled={!previewUrl} title={previewUrl ? 'Preview sent email' : NOTHING_SENT} type="button" onClick={() => setPreviewOpen(true)}>
              <KRHomebaseIcon className={STYLES.icon} name="preview" />
            </button>
            <button aria-label="Print the payment receipt" className={STYLES.iconButton} data-kr-action="payment-details-print" onClick={() => setStatus(onPrint() ?? '')} title="Print receipt" type="button">
              <KRHomebaseIcon className={STYLES.icon} name="print" />
            </button>
            <button aria-label="Resend the sent payment receipt" className={STYLES.iconButton} data-kr-action="payment-details-resend" disabled={!previewUrl || busy} title={previewUrl ? 'Resend exact email' : NOTHING_SENT} type="button" onClick={() => void resend()}>
              <KRHomebaseIcon className={STYLES.icon} name="send" />
            </button>
            <button aria-label="Close payment receipt details" className={STYLES.closeButton} data-kr-action="payment-details-close" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </header>
        {/* Body: amount summary, then the receipt details */}
        <div className={`${LAYOUT_STYLES.body} ${STYLES.body}`}>
          <div className={`${LAYOUT_STYLES.summary} ${STYLES.summary}`} data-kr-element="payment-details-summary">
            <div className={STYLES.summaryLabel}>Amount Received</div>
            <div className={STYLES.summaryAmount}>{money(details.amountReceived)}</div>
            <div>Invoice balance now {money(details.invoiceBalanceAfter)}</div>
          </div>
          <table className={STYLES.table}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th className={STYLES.label} scope="row">
                    {label}
                  </th>
                  <td className={STYLES.value}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {status ? (
            <p className={STYLES.status} role="status">
              {status}
            </p>
          ) : null}
          {sentNote || !latestSent ? (
            <p className={STYLES.status} data-kr-element="payment-details-sent-note">
              {sentNote ?? 'No stored receipt email is available for this payment.'}
            </p>
          ) : null}
        </div>
      </section>
      {/* Sent-email preview: the stored email exactly as it went, in a frame over the details. */}
      {previewOpen && previewUrl ? (
        <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation">
          <section aria-label="Sent payment receipt email preview" aria-modal="true" className={`${LAYOUT_STYLES.previewDialog} ${STYLES.previewDialog}`} data-kr-id="payment-receipt-email-preview-dialog" role="dialog">
            <header className={`${LAYOUT_STYLES.previewHeader} ${STYLES.previewHeader}`}>
              <span>Sent payment receipt email</span>
              <button className={STYLES.closeButton} data-kr-action="payment-details-preview-close" type="button" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </header>
            <iframe className={`${LAYOUT_STYLES.previewFrame} ${STYLES.previewFrame}`} sandbox="" src={previewUrl} title="Sent payment receipt email" />
          </section>
        </div>
      ) : null}
    </div>
  )
  return mounted ? createPortal(content, document.body) : null
}
