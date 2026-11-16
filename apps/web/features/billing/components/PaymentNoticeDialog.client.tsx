'use client'
// file: apps/web/features/billing/components/PaymentNoticeDialog.client.tsx

/**
 * PaymentNoticeDialog — emails one payment's Payment Receipt or Refund Notice.
 * Wraps the shared `components/dialogs/SendEmailDialog`: loads the client's addresses,
 * the default subject and cover message, and earlier sent copies from
 * `GET /api/v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email`, then sends through
 * `POST .../receipt/email` (which stores the copy and records the Workstream email).
 *
 * Opened from Posted Payments: the send icon on a payment (receipt), or on a voided,
 * refunded Stripe payment (refund notice).
 *
 * Ported from the old `hb-components/KR-Billing/PaymentNoticeDialog.client.tsx` (Billing part 7c of
 * docs/API/Billing_Audit.md). Changed:
 *  - Receipt only. The old dialog also sent the Refund Notice of a voided, refunded Stripe payment; refunds and their
 *    notice wait for Billing part 7e, so the `kind` prop is gone (`data-kr-id` stays `payment-receipt-dialog`).
 *  - Calls go through this feature's `api.client.ts`: `fetchReceiptEmailInfo`, `previewReceiptEmail` and
 *    `sendReceiptEmail` (the old dialog used `payment-notice` for all three). The bodies carry only to, cc, subject,
 *    message, `includePdf` (always on, as the old receipt always attached its PDF) and `officeId` (null, the primary
 *    office). The receipt's "pay the rest" link waits for part 7d.
 *  - A failed lookup is shown as the API's sentence (the old one showed the code), and the dialog still opens with no
 *    addresses and an empty subject, as before. Send failures are `BillingApiError` sentences with the request id; the
 *    old code-to-sentence mapping is gone.
 *  - The default subject is tagged with `tagEmailSubject` (the API tags it again the same way).
 *  - Loading shows `RainbowBusySpinner` in a small card drawn into <body> with `data-kr-theme-scope` (the old one wrote
 *    "Loading payment receipt…" on a white card at `z-[1200]`). The Previously sent list is the shared
 *    `BillingSentCopies` (links only, as before). Density Contract sizes and `--kr-theme-*` tokens. New `inline` prop
 *    for the `react-dom/server` tests.
 *
 * Billing part 7e (Nov 16, 2026): the refund notice is back (`kind: 'refund'`, as in the old dialog): its own calls
 * (`fetchRefundNoticeEmailInfo`, `previewRefundNoticeEmail`, `sendRefundNoticeEmail`), no PDF, the title "Email Refund
 * Notice", `data-kr-id="payment-refund-dialog"` and the old summary line (the refund amount and the ARN). `kind` is
 * optional and defaults to the receipt, so the 7c callers stay as they were.
 */

import { tagEmailSubject, type BillingReceiptInfoData } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import SendEmailDialog from '@/components/dialogs/SendEmailDialog.client'
import type { EmailDraft, EmailPreview, EmailSendOutcome } from '@/components/dialogs/emailTypes'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { BillingApiError, fetchReceiptEmailInfo, fetchRefundNoticeEmailInfo, previewReceiptEmail, previewRefundNoticeEmail, sendReceiptEmail, sendRefundNoticeEmail } from '../api.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingPayment } from '../types'
import { BillingSentCopies, billingSendFailure, billingSentDetail } from './SendInvoiceDialog.client'

const STYLES = {
  backdrop: 'bg-[rgba(15,23,42,0.42)]',
  loading: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) shadow-[0_18px_50px_rgba(27,35,48,0.28)]',
  loadError: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-danger)',
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
  // Same layer as the shared email dialog that replaces it.
  backdrop: 'p-[10px] fixed inset-0 z-[1000] flex items-center justify-center',
  loading: 'px-[8px] py-[6px]',
} as const

/** Props for {@link PaymentNoticeDialog}. */
export interface PaymentNoticeDialogProps {
  /** Which email: the payment receipt (default) or, for a voided payment refunded through Stripe, the refund notice. */
  kind?: 'receipt' | 'refund'
  payment: BillingPayment
  clientId: string
  clientNumber: string
  clientDisplayName: string
  /** The letterhead office (a firm location id); null or left out: the primary office. */
  officeId?: string | null
  onClose: () => void
  /** For server-render tests: draw in place instead of a portal. */
  inline?: boolean
}

/** What the dialog starts from when the lookup failed: no addresses, no wording, nothing sent. */
type ReceiptContext = Pick<BillingReceiptInfoData, 'recipients' | 'defaultSubject' | 'defaultMessage' | 'sent'>

/** Renders the receipt email dialog: a loading card until the recipients and wording arrive, then the shared dialog. */
export default function PaymentNoticeDialog({ kind = 'receipt', payment, clientId, clientNumber, clientDisplayName, officeId = null, onClose, inline = false }: PaymentNoticeDialogProps) {
  const [context, setContext] = useState<ReceiptContext | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const refund = kind === 'refund'
  const label = refund ? 'refund notice' : 'payment receipt'

  // Recipients, default wording, and sent history (once per payment and kind).
  useEffect(() => {
    let cancelled = false
    const load: Promise<ReceiptContext> = kind === 'refund' ? fetchRefundNoticeEmailInfo(clientId, payment.id) : fetchReceiptEmailInfo(clientId, payment.id)
    load
      .then((loaded) => {
        if (!cancelled) setContext(loaded)
      })
      .catch((caught: unknown) => {
        L(`[KR_PAYMENT_NOTICE_DIALOG:94] context failed kind=${kind} payment=${payment.id} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
        if (!cancelled) {
          setLoadError(billingSendFailure(caught, `The ${label} details could not be loaded.`))
          setContext({ recipients: [], defaultSubject: '', defaultMessage: '', sent: [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [kind, label, clientId, payment.id])

  /** The send and preview body: the choices only (the refund notice has no PDF). */
  function body(draft: EmailDraft) {
    const rVal = { to: draft.to, cc: draft.cc, subject: draft.subject, message: draft.message, officeId }
    return rVal
  }

  async function send(draft: EmailDraft): Promise<EmailSendOutcome> {
    try {
      const result = refund ? await sendRefundNoticeEmail(clientId, payment.id, body(draft)) : await sendReceiptEmail(clientId, payment.id, { ...body(draft), includePdf: true })
      return { ok: true, detail: billingSentDetail(refund ? 'The refund notice' : 'The payment receipt', result, !refund) }
    } catch (caught) {
      L(`[KR_PAYMENT_NOTICE_DIALOG:116] send failed kind=${kind} payment=${payment.id} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
      return { ok: false, detail: billingSendFailure(caught, `The ${label} could not be sent.`, true) }
    }
  }

  /** Server-rendered preview of the current draft (nothing is sent). */
  function renderPreview(draft: EmailDraft): Promise<EmailPreview> {
    return refund ? previewRefundNoticeEmail(clientId, payment.id, body(draft)) : previewReceiptEmail(clientId, payment.id, { ...body(draft), includePdf: true })
  }

  if (!context) {
    if (!inline && typeof document === 'undefined') return null
    const loading = (
      <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-element={refund ? 'payment-refund-loading' : 'payment-receipt-loading'} data-kr-theme-scope="krhomebase" role="presentation">
        <div className={`${LAYOUT_STYLES.loading} ${STYLES.loading}`} role="status">
          <RainbowBusySpinner busy hideWhenIdle={false} label={`Loading ${label}...`} size={14} />
        </div>
      </div>
    )
    return inline ? loading : createPortal(loading, document.body)
  }

  const invoice = payment.invoiceNumber ? `Invoice #${payment.invoiceNumber}${payment.invoiceIvid ? ` (#${payment.invoiceIvid})` : ''}` : 'no invoice'
  const refundAmount = payment.refund?.amount ?? payment.amount
  return (
    <SendEmailDialog
      afterMessage={
        <>
          {loadError ? <p className={STYLES.loadError}>The default wording could not be loaded ({loadError}).</p> : null}
          {/* Previously sent receipts: open the stored PDF or email. */}
          <BillingSentCopies copies={context.sent} dataKrElement="payment-notice-sent" />
        </>
      }
      attachmentSummary={refund ? `Refund Notice · ${formatAccountingAmount(refundAmount)} · ARN ${payment.refund?.reference ?? 'not yet available'}` : `Payment Receipt ${payment.paymentNumber} · ${formatAccountingAmount(payment.amount)} · PDF attachment`}
      dataKrId={refund ? 'payment-refund-dialog' : 'payment-receipt-dialog'}
      defaultMessage={context.defaultMessage}
      defaultSubject={context.defaultSubject && payment.matterNumber ? tagEmailSubject(context.defaultSubject, payment.matterNumber) : context.defaultSubject}
      footerNote="Sent from the billing mailbox; a copy of exactly what is sent is stored on the client."
      inline={inline}
      renderPreview={renderPreview}
      subtitle={`[${clientNumber}] ${clientDisplayName} · Payment ${payment.paymentNumber} · ${invoice}`}
      suggestions={context.recipients}
      suggestionsLoading={false}
      title={refund ? 'Email Refund Notice' : 'Email Payment Receipt'}
      onCancel={onClose}
      onSend={send}
      onSent={onClose}
    />
  )
}
