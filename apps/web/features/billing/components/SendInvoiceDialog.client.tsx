'use client'
// file: apps/web/features/billing/components/SendInvoiceDialog.client.tsx

/**
 * SendInvoiceDialog — emails one invoice to the client. Wraps the shared
 * `components/dialogs/SendEmailDialog`: looks up the client's addresses and the
 * invoice's previously sent copies, posts the choices to
 * `/api/v1/billing/clients/{clientId}/invoices/{invoiceId}/email`, and reports the outcome.
 *
 * The route stores exactly what it sends (PDF + HTML → document number),
 * marks the invoice sent, and records the Workstream "Emails" activity; this
 * dialog only surfaces those results. Earlier copies are listed with their
 * stored-copy links and a Re-send that mails the stored
 * bytes again (no re-render).
 *
 * Two ways to supply the document facts shown here (balance, due date): `entries` + `staffOptions` (Billing tab —
 * the report is built here) or a prebuilt `report` (print view). Either way the API builds the invoice it sends from
 * the saved record, so the report here only fills the default message and the "Includes" line.
 *
 * Ported from the old `hb-components/KR-Billing/Invoicing/SendInvoiceDialog.client.tsx` (Billing part 7c of
 * docs/API/Billing_Audit.md). Changed:
 *  - The browser no longer builds or sends the report: the send and preview bodies carry only to, cc, subject,
 *    message, `includePdf`, `includeInvoiceBody` and `officeId` (the print view's letterhead; null elsewhere, the
 *    primary office). The report built here (`invoiceReportFromBilling`) is for the default message only.
 *  - Calls go through this feature's `api.client.ts`: `fetchInvoiceEmailInfo` (GET `.../invoices/{id}/email`),
 *    `previewInvoiceEmail` (POST `.../email/preview`), `sendInvoiceEmail` (POST `.../email`, which reloads the Billing
 *    record because the API stamps the invoice sent and locks it) and `resendBillingDocument` (POST
 *    `.../documents/{documentNumber}/resend` with `{ to, cc }`). The old dialog used `send-invoice` for all of them.
 *  - Re-send sends only `to` and `cc`; the stored copy keeps the subject it went with (the old body also carried the
 *    subject). While a re-send is chosen, Preview is hidden: the "email" link opens the stored email as it went.
 *  - No pay link yet (Billing part 7d): the default message drops "Pay online: [[PAY_LINK]]" and says to mail a check
 *    or call the office to pay by card, as the API's email says.
 *  - Billing part 7d (Nov 16, 2026): the old default message is back with "Pay online: [[PAY_LINK]]"; the API issues
 *    the link when the email is sent and puts it (with its QR image) where the token is.
 *  - Failures are `BillingApiError` sentences from the API (the old code-to-sentence mapping for
 *    `GOOGLE_WORKSPACE_MAILER_NOT_CONFIGURED` and `DOCUMENT_STORE_FAILED` is gone). A failed address lookup is shown
 *    (`suggestionsError`) instead of looking like an empty list.
 *  - The default subject is tagged with `tagEmailSubject` from the contracts (the API tags it again the same way); the
 *    old `applyEmailReferenceToSubject` is not ported.
 *  - The Previously sent list is `BillingSentCopies` (exported here; the statement and receipt dialogs use it too) and
 *    the sent sentence is `billingSentDetail`.
 *  - Density Contract sizes and `--kr-theme-*` tokens with no fallback colors (the old box used 9pt text, 4px padding
 *    and `bg-white`). New `inline` prop for the `react-dom/server` tests.
 */

import { tagEmailSubject, type BillingSentDocument } from '@krhomebase/contracts'
import type { InvoiceReportData } from '@krhomebase/documents/types'
import { useEffect, useMemo, useState } from 'react'
import SendEmailDialog from '@/components/dialogs/SendEmailDialog.client'
import type { EmailDraft, EmailPreview, EmailRecipientSuggestion, EmailSendOutcome } from '@/components/dialogs/emailTypes'
import { L } from '@/lib/KRUtilities'
import { BillingApiError, fetchInvoiceEmailInfo, previewInvoiceEmail, resendBillingDocument, sendInvoiceEmail } from '../api.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { invoiceReportFromBilling } from '../printDocuments.client'
import type { BillingInvoice, BillingTimeEntry } from '../types'

const STYLES = {
  options: 'text-[12px] leading-[1.2] text-(color:--kr-theme-text)',
  option: 'cursor-pointer',
  sentBox: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] leading-[1.3] text-(color:--kr-theme-text)',
  sentTitle: 'text-[11px] font-[700] text-(color:--kr-theme-text-muted)',
  link: 'text-(color:--kr-theme-brand-primary) underline',
  smallButton:
    'min-h-[20px] px-[6px] py-0 rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  smallButtonActive:
    'min-h-[20px] px-[6px] py-0 rounded-[3px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[11px] font-[700] text-(color:--kr-theme-text-inverse)',
  hint: 'text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
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
  // Delivery options: two tick boxes on one row (3px between a box and its words, 8px between the options).
  options: 'gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  option: 'gap-[3px] inline-flex items-center',
  sentBox: 'px-[6px] py-[3px] gap-[3px] grid',
  // Capped so a long history cannot grow the dialog; scrolls inside the box.
  sentList: 'pr-[3px] gap-[3px] grid max-h-[110px] overflow-y-auto',
  sentRow: 'gap-x-[6px] gap-y-[2px] flex flex-wrap items-center',
} as const

/** The invoice facts the dialog needs; a full BillingInvoice satisfies it. */
export type SendInvoiceTarget = Pick<BillingInvoice, 'id' | 'invoiceNumber' | 'dueDate' | 'matterNumber'> & Partial<BillingInvoice>

export interface SendInvoiceDialogProps {
  invoice: SendInvoiceTarget
  /** Every entry available to the tab; only entries attached to the invoice are counted. Not needed when `report` is given. */
  entries?: readonly BillingTimeEntry[]
  staffOptions?: readonly { id: string; label: string; staffCode?: string | null }[]
  /** Prebuilt report (print view); skips building from entries. */
  report?: InvoiceReportData
  /** Every invoice on the account: fills "Other outstanding balances" and "Less amount received" for the shown balance. */
  accountInvoices?: readonly BillingInvoice[]
  clientId: string
  clientNumber: string
  clientDisplayName: string
  /** The letterhead office (a firm location id) the document carries; null or left out: the primary office. */
  officeId?: string | null
  onCancel: () => void
  /** Runs after a delivered email, once the person presses Done. The API already marked the invoice sent and locked. */
  onSent: (invoice: SendInvoiceTarget) => Promise<void> | void
  /** For server-render tests: draw in place instead of a portal. */
  inline?: boolean
}

/** The token staff can leave in the message; the API turns it into the pay-online link when the email is sent. */
export const PAY_LINK_TOKEN = '[[PAY_LINK]]'

/** Default cover message; staff can edit it in the dialog before sending. `[[PAY_LINK]]` becomes the payment link. */
export function invoiceEmailDefaultMessage(clientDisplayName: string, invoice: Pick<SendInvoiceTarget, 'invoiceNumber' | 'dueDate'>, balanceDue: number): string {
  const rVal =
    `Dear ${clientDisplayName},\n\n` +
    `Please find Invoice #${invoice.invoiceNumber} attached. The balance due is ${formatAccountingAmount(balanceDue)}` +
    `${invoice.dueDate ? `, payable by ${invoice.dueDate}` : ''}.\n\n` +
    `Pay online: ${PAY_LINK_TOKEN}\n\n` +
    `You may also mail a check to our office.\n\nThank you for the opportunity to serve you.\n\nKrueger & Richard, PLLC`
  return rVal
}

/** Short local date-time for the sent list. */
export function billingSentWhenLabel(iso: string): string {
  const date = new Date(iso)
  const rVal = Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return rVal
}

/** The stored copy's email as it went (the file route's `format=html`). */
export function billingSentHtmlUrl(copy: Pick<BillingSentDocument, 'url'>): string {
  const rVal = `${copy.url}${copy.url.includes('?') ? '&' : '?'}format=html`
  return rVal
}

/**
 * The sentence shown after a delivered email: what went, to whom, the PDF, the stored copy and the WorkStream entry.
 * `label` names the document ("Invoice #121", "The Statement of Account", "The payment receipt").
 */
export function billingSentDetail(
  label: string,
  result: { resent: boolean; to: readonly string[]; subject: string; pdfAttached: boolean; pdfError: string | null; documentNumber: string | null; documentUrl: string; workstreamWsid: string | null; workstreamError: string | null; payLinkPrid?: string | null; payLinkError?: string | null },
  includePdf: boolean,
): string {
  const pdfNote = result.resent ? '' : includePdf ? (result.pdfAttached ? ' PDF attached.' : ` The PDF could not be attached (${result.pdfError ?? 'renderer unavailable'}); the email went without it.`) : ''
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const copy = result.documentNumber ? ` Stored copy ${result.documentNumber} (${origin}${result.documentUrl}).` : result.documentUrl ? ` Stored copy: ${result.documentUrl}.` : ''
  const workstream = result.workstreamWsid
    ? ` Recorded in the Workstream (${result.workstreamWsid}).`
    : result.workstreamError
      ? ` The email was delivered, but the Workstream entry failed: ${result.workstreamError}.`
      : ''
  // Billing part 7d: the pay link the email carries, or why it has none.
  const payLink = result.payLinkPrid ? ` Pay link ${result.payLinkPrid} included.` : result.payLinkError ? ` No pay link: ${result.payLinkError}.` : ''
  const rVal = `${label} was ${result.resent ? 're-sent' : 'emailed'} to ${result.to.join(', ')} as “${result.subject}”.${pdfNote}${payLink}${copy}${workstream}`
  return rVal
}

/** A failed call as a sentence for the dialog; `withRequest` adds the request id (the old statement dialog did). */
export function billingSendFailure(caught: unknown, fallback: string, withRequest = false): string {
  if (caught instanceof BillingApiError) return `${caught.message}${withRequest && caught.requestId ? ` (request ${caught.requestId})` : ''}`
  const rVal = caught instanceof Error ? caught.message : fallback
  return rVal
}

export interface BillingSentCopiesProps {
  /** Copies sent before, newest first. */
  copies: readonly BillingSentDocument[]
  /** The copy chosen for re-send, or null. Without `onChooseResend` the rows have no Re-send button (old receipt dialog). */
  resendOf?: BillingSentDocument | null
  onChooseResend?: (copy: BillingSentDocument | null) => void
  /** `data-kr-element` of the box, e.g. `send-invoice-sent-versions`. */
  dataKrElement: string
  /** `data-kr-action` of each Re-send button, e.g. `send-invoice-resend`. */
  resendAction?: string
}

/** Previously sent copies: open the stored PDF/HTML, or choose one to re-send its exact bytes. */
export function BillingSentCopies({ copies, resendOf = null, onChooseResend, dataKrElement, resendAction }: BillingSentCopiesProps) {
  if (!copies.length) return null
  return (
    <div className={`${LAYOUT_STYLES.sentBox} ${STYLES.sentBox}`} data-kr-element={dataKrElement}>
      <div className={STYLES.sentTitle}>Previously sent ({copies.length})</div>
      <div className={LAYOUT_STYLES.sentList}>
        {copies.map((version) => (
          <div className={LAYOUT_STYLES.sentRow} key={version.documentId}>
            <span>
              {billingSentWhenLabel(version.sentAt)} · to {version.to.join(', ') || '—'}
              {version.sentBy ? ` · by ${version.sentBy}` : ''}
            </span>
            <a className={STYLES.link} href={version.url} rel="noreferrer" target="_blank">
              {version.documentNumber ?? 'open'}
              {version.hasPdf ? ' PDF' : ''}
            </a>
            {version.hasHtml ? (
              <a className={STYLES.link} href={billingSentHtmlUrl(version)} rel="noreferrer" target="_blank">
                email
              </a>
            ) : null}
            {onChooseResend ? (
              <button
                className={resendOf?.documentId === version.documentId ? STYLES.smallButtonActive : STYLES.smallButton}
                data-kr-action={resendAction}
                disabled={!version.hasHtml}
                title={version.hasHtml ? 'Send this stored copy again, exactly as it went' : 'This copy has no stored email to send again'}
                type="button"
                onClick={() => onChooseResend(resendOf?.documentId === version.documentId ? null : version)}
              >
                {resendOf?.documentId === version.documentId ? 'Cancel re-send' : 'Re-send this copy'}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {resendOf ? <span className={STYLES.hint}>Send will re-mail stored copy {resendOf.documentNumber ?? ''} exactly as it went out; the subject, message and options above are ignored.</span> : null}
    </div>
  )
}

/**
 * Renders the send-invoice dialog. The parent (the Invoices row, the invoice editor or the print view) mounts it and
 * unmounts it on `onCancel` or `onSent`. This component owns the recipient and sent-copy lookup, the delivery options
 * and the chosen re-send; the shared dialog owns the draft, the send and the preview.
 */
export default function SendInvoiceDialog({
  invoice,
  entries,
  staffOptions = [],
  report: prebuiltReport,
  accountInvoices,
  clientId,
  clientNumber,
  clientDisplayName,
  officeId = null,
  onCancel,
  onSent,
  inline = false,
}: SendInvoiceDialogProps) {
  const [suggestions, setSuggestions] = useState<EmailRecipientSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [sentVersions, setSentVersions] = useState<BillingSentDocument[]>([])
  const [includePdf, setIncludePdf] = useState(true)
  const [includeInvoiceBody, setIncludeInvoiceBody] = useState(true)
  /** When set, Send re-mails this stored copy instead of rendering a new one. */
  const [resendOf, setResendOf] = useState<BillingSentDocument | null>(null)

  // Recipient + sent-history lookup runs once per invoice while the dialog is open.
  useEffect(() => {
    let cancelled = false
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    fetchInvoiceEmailInfo(clientId, invoice.id)
      .then((context) => {
        if (cancelled) return
        setSuggestions(context.recipients.map((item) => ({ email: item.email, label: item.label, primary: item.primary })))
        setSentVersions(context.sent)
      })
      .catch((caught: unknown) => {
        L(`[KR_SEND_INVOICE_DIALOG:204] lookup failed clientId=${clientId} invoiceId=${invoice.id} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
        if (cancelled) return
        setSuggestions([])
        setSuggestionsError(billingSendFailure(caught, 'The client’s email addresses could not be loaded.'))
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId, invoice.id])

  // The balance and due date for the default message and the "Includes" line (the API rebuilds the invoice it sends).
  const report = useMemo(() => {
    if (prebuiltReport) return prebuiltReport
    const full = invoice as BillingInvoice
    const rVal = invoiceReportFromBilling({ invoice: { ...full, entryIds: full.entryIds ?? [] }, entries: entries ?? [], clientNumber, staffOptions, accountInvoices })
    return rVal
  }, [accountInvoices, clientNumber, entries, invoice, prebuiltReport, staffOptions])

  /** The send and preview body: the choices only. */
  function body(draft: EmailDraft) {
    const rVal = { to: draft.to, cc: draft.cc, subject: draft.subject, message: draft.message, includePdf, includeInvoiceBody, officeId }
    return rVal
  }

  async function send(draft: EmailDraft): Promise<EmailSendOutcome> {
    try {
      const result = resendOf
        ? await resendBillingDocument(clientId, resendOf.documentNumber ?? resendOf.documentId, { to: draft.to, cc: draft.cc })
        : await sendInvoiceEmail(clientId, invoice.id, body(draft))
      const rVal: EmailSendOutcome = { ok: true, detail: billingSentDetail(`Invoice #${invoice.invoiceNumber}`, result, includePdf) }
      return rVal
    } catch (caught) {
      L(`[KR_SEND_INVOICE_DIALOG:236] send failed clientId=${clientId} invoiceId=${invoice.id} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
      const rVal: EmailSendOutcome = { ok: false, detail: billingSendFailure(caught, 'The invoice could not be sent.') }
      return rVal
    }
  }

  /** Server-rendered preview of the current draft (nothing is sent). */
  function renderPreview(draft: EmailDraft): Promise<EmailPreview> {
    return previewInvoiceEmail(clientId, invoice.id, body(draft))
  }

  const balanceLabel = `${formatAccountingAmount(report.balanceDue)} due ${report.dueDate}`

  return (
    <SendEmailDialog
      afterMessage={
        <>
          {/* Delivery options: PDF attachment and/or the invoice rendered in the body. Both default on. Not used for a re-send. */}
          <div className={`${LAYOUT_STYLES.options} ${STYLES.options}`} data-kr-element="send-invoice-options">
            <label className={`${LAYOUT_STYLES.option} ${STYLES.option}`}>
              <input checked={includePdf} data-kr-element="send-invoice-include-pdf" disabled={Boolean(resendOf)} type="checkbox" onChange={(event) => setIncludePdf(event.target.checked)} />
              Include PDF Invoice with Email
            </label>
            <label className={`${LAYOUT_STYLES.option} ${STYLES.option}`}>
              <input checked={includeInvoiceBody} data-kr-element="send-invoice-include-body" disabled={Boolean(resendOf)} type="checkbox" onChange={(event) => setIncludeInvoiceBody(event.target.checked)} />
              Send Invoice in Email Body
            </label>
          </div>
          {/* Previously sent copies: open the stored PDF/HTML, or re-send the exact bytes. */}
          <BillingSentCopies copies={sentVersions} dataKrElement="send-invoice-sent-versions" resendAction="send-invoice-resend" resendOf={resendOf} onChooseResend={setResendOf} />
        </>
      }
      attachmentSummary={
        resendOf
          ? `Stored copy ${resendOf.documentNumber ?? ''} of Invoice #${invoice.invoiceNumber} (${balanceLabel})`
          : `Invoice #${invoice.invoiceNumber} (${balanceLabel})${includePdf ? ' · PDF attachment' : ''}${includeInvoiceBody ? ' · itemized in the email body' : ''}`
      }
      dataKrId="send-invoice-dialog"
      defaultMessage={invoiceEmailDefaultMessage(clientDisplayName, invoice, report.balanceDue)}
      defaultSubject={tagEmailSubject(`Invoice #${invoice.invoiceNumber} from Krueger & Richard`, invoice.matterNumber)}
      footerNote="Sent from the billing mailbox; a copy of exactly what is sent is stored on the matter."
      inline={inline}
      renderPreview={resendOf ? undefined : renderPreview}
      subtitle={`[${clientNumber}] ${clientDisplayName} · Matter ${invoice.matterNumber}`}
      suggestions={suggestions}
      suggestionsError={suggestionsError}
      suggestionsLoading={suggestionsLoading}
      title={`Email Invoice #${invoice.invoiceNumber || 'Draft'}`}
      onCancel={onCancel}
      onSend={send}
      onSent={() => void onSent(invoice)}
    />
  )
}
