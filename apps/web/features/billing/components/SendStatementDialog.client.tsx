'use client'
// file: apps/web/features/billing/components/SendStatementDialog.client.tsx

/**
 * SendStatementDialog — emails a client's Statement of Account. Wraps the
 * shared `components/dialogs/SendEmailDialog`, like SendInvoiceDialog: loads the
 * client's addresses and earlier sent statements, posts the choices to
 * `/api/v1/billing/clients/{clientId}/statement/email`, and reports the outcome.
 *
 * The route stores exactly what it sends (PDF + HTML → document number) on
 * the client (and the matter when the statement covers one) and records a
 * Workstream "Emails" activity. Earlier copies are listed with their
 * stored-copy links and a Re-send that mails the stored
 * bytes again.
 *
 * Ported from the old `hb-components/KR-Billing/Invoicing/SendStatementDialog.client.tsx` (Billing part 7c of
 * docs/API/Billing_Audit.md). Changed:
 *  - The browser no longer sends the statement model: the bodies carry only to, cc, subject, message, `includePdf`,
 *    `includeStatementBody`, `officeId` (the print view's letterhead; null elsewhere) and `matterId` (null for the
 *    whole client). The API builds the statement from the record. The `report` prop still fills the default message
 *    (period and balance) and the "Includes" line.
 *  - Calls go through this feature's `api.client.ts`: `fetchStatementEmailInfo` (GET `.../statement/email?matterId=`,
 *    so the Previously sent list is the one matter's statements, or the whole client's), `previewStatementEmail`,
 *    `sendStatementEmail` and `resendBillingDocument` (`{ to, cc }` only; the stored copy keeps its subject).
 *  - Failures are `BillingApiError` sentences with the request id, as before; the old code-to-sentence mapping is gone.
 *    A failed address lookup is shown (`suggestionsError`).
 *  - While a re-send is chosen, Preview is hidden (the "email" link opens the stored email as it went).
 *  - The default subject is tagged with `tagEmailSubject` (the matter, or the client's `.0`, as the API tags it).
 *  - The Previously sent list is the shared `BillingSentCopies` from SendInvoiceDialog; Density Contract sizes and
 *    `--kr-theme-*` tokens with no fallback colors. New `inline` prop for the `react-dom/server` tests.
 */

import { tagEmailSubject, type BillingSentDocument } from '@krhomebase/contracts'
import type { StatementOfAccountData } from '@krhomebase/documents/types'
import { useEffect, useState } from 'react'
import SendEmailDialog from '@/components/dialogs/SendEmailDialog.client'
import type { EmailDraft, EmailPreview, EmailRecipientSuggestion, EmailSendOutcome } from '@/components/dialogs/emailTypes'
import { L } from '@/lib/KRUtilities'
import { BillingApiError, fetchStatementEmailInfo, previewStatementEmail, resendBillingDocument, sendStatementEmail } from '../api.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { BillingSentCopies, billingSendFailure, billingSentDetail } from './SendInvoiceDialog.client'

const STYLES = {
  options: 'text-[12px] leading-[1.2] text-(color:--kr-theme-text)',
  option: 'cursor-pointer',
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
  // Delivery options: two tick boxes on one row.
  options: 'gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  option: 'gap-[3px] inline-flex items-center',
} as const

/** Props for {@link SendStatementDialog}. */
export interface SendStatementDialogProps {
  /** The statement on screen: fills the default message and the "Includes" line (the API rebuilds what it sends). */
  report: StatementOfAccountData
  clientId: string
  clientNumber: string
  clientDisplayName: string
  /** Set when the statement covers one matter; null for the whole client. */
  matterId: string | null
  matterNumber: string | null
  /** The letterhead office (a firm location id); null or left out: the primary office. */
  officeId?: string | null
  onCancel: () => void
  onSent?: () => void
  /** For server-render tests: draw in place instead of a portal. */
  inline?: boolean
}

/** Default cover message; staff can edit it before sending. */
export function statementEmailDefaultMessage(clientDisplayName: string, report: Pick<StatementOfAccountData, 'periodLabel' | 'closingBalance'>): string {
  const rVal =
    `Dear ${clientDisplayName},\n\n` +
    `Please find your Statement of Account for ${report.periodLabel} attached. ` +
    `The balance on your account is ${formatAccountingAmount(report.closingBalance)}.\n\n` +
    `If anything does not match your records, please call our office.\n\nThank you for the opportunity to serve you.\n\nKrueger & Richard, PLLC`
  return rVal
}

/**
 * Renders the send-statement dialog. The parent (the Billing Overview register or the print view) mounts it and
 * unmounts it on `onCancel` or `onSent`. This component owns the recipient and sent-copy lookup, the delivery options
 * and the chosen re-send; the shared dialog owns the draft, the send and the preview.
 */
export default function SendStatementDialog({ report, clientId, clientNumber, clientDisplayName, matterId, matterNumber, officeId = null, onCancel, onSent, inline = false }: SendStatementDialogProps) {
  const [suggestions, setSuggestions] = useState<EmailRecipientSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [sentVersions, setSentVersions] = useState<BillingSentDocument[]>([])
  const [includePdf, setIncludePdf] = useState(true)
  const [includeStatementBody, setIncludeStatementBody] = useState(true)
  /** When set, Send re-mails this stored copy instead of rendering a new one. */
  const [resendOf, setResendOf] = useState<BillingSentDocument | null>(null)

  // Recipient + sent-history lookup runs once per client (and matter) while the dialog is open.
  useEffect(() => {
    let cancelled = false
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    fetchStatementEmailInfo(clientId, matterId)
      .then((context) => {
        if (cancelled) return
        setSuggestions(context.recipients.map((item) => ({ email: item.email, label: item.label, primary: item.primary })))
        setSentVersions(context.sent)
      })
      .catch((caught: unknown) => {
        L(`[KR_SEND_STATEMENT_DIALOG:118] lookup failed clientId=${clientId} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
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
  }, [clientId, matterId])

  /** The send and preview body: the choices only. */
  function body(draft: EmailDraft) {
    const rVal = { to: draft.to, cc: draft.cc, subject: draft.subject, message: draft.message, includePdf, includeStatementBody, officeId, matterId }
    return rVal
  }

  async function send(draft: EmailDraft): Promise<EmailSendOutcome> {
    try {
      const result = resendOf
        ? await resendBillingDocument(clientId, resendOf.documentNumber ?? resendOf.documentId, { to: draft.to, cc: draft.cc })
        : await sendStatementEmail(clientId, body(draft))
      const rVal: EmailSendOutcome = { ok: true, detail: billingSentDetail('The Statement of Account', result, includePdf) }
      return rVal
    } catch (caught) {
      const error = caught instanceof BillingApiError ? caught : null
      L(`[KR_SEND_STATEMENT_DIALOG:146] send failed clientId=${clientId} code=${error?.code ?? 'unknown'} requestId=${error?.requestId ?? 'none'}`)
      const rVal: EmailSendOutcome = { ok: false, detail: billingSendFailure(caught, 'The statement could not be sent.', true) }
      return rVal
    }
  }

  /** Server-rendered preview of the current draft (nothing is sent). */
  function renderPreview(draft: EmailDraft): Promise<EmailPreview> {
    return previewStatementEmail(clientId, body(draft))
  }

  const scopeLabel = matterNumber ? `Matter ${matterNumber}` : 'All matters'

  return (
    <SendEmailDialog
      afterMessage={
        <>
          {/* Delivery options: PDF attachment and/or the account activity in the body. Both default on. Not used for a re-send. */}
          <div className={`${LAYOUT_STYLES.options} ${STYLES.options}`} data-kr-element="send-statement-options">
            <label className={`${LAYOUT_STYLES.option} ${STYLES.option}`}>
              <input checked={includePdf} data-kr-element="send-statement-include-pdf" disabled={Boolean(resendOf)} type="checkbox" onChange={(event) => setIncludePdf(event.target.checked)} />
              Include PDF Statement with Email
            </label>
            <label className={`${LAYOUT_STYLES.option} ${STYLES.option}`}>
              <input checked={includeStatementBody} data-kr-element="send-statement-include-body" disabled={Boolean(resendOf)} type="checkbox" onChange={(event) => setIncludeStatementBody(event.target.checked)} />
              Send Account Activity in Email Body
            </label>
          </div>
          {/* Previously sent statements: open the stored PDF/HTML, or re-send the exact bytes. */}
          <BillingSentCopies copies={sentVersions} dataKrElement="send-statement-sent-versions" resendAction="send-statement-resend" resendOf={resendOf} onChooseResend={setResendOf} />
        </>
      }
      attachmentSummary={
        resendOf
          ? `Stored statement ${resendOf.documentNumber ?? ''}`
          : `Statement of Account · ${scopeLabel} · balance ${formatAccountingAmount(report.closingBalance)}${includePdf ? ' · PDF attachment' : ''}${includeStatementBody ? ' · activity in the email body' : ''}`
      }
      dataKrId="send-statement-dialog"
      defaultMessage={statementEmailDefaultMessage(clientDisplayName, report)}
      defaultSubject={tagEmailSubject('Statement of Account from Krueger & Richard', matterNumber ?? `${clientNumber}.0`)}
      footerNote="Sent from the billing mailbox; a copy of exactly what is sent is stored on the client."
      inline={inline}
      renderPreview={resendOf ? undefined : renderPreview}
      subtitle={`[${clientNumber}] ${clientDisplayName} · ${scopeLabel}`}
      suggestions={suggestions}
      suggestionsError={suggestionsError}
      suggestionsLoading={suggestionsLoading}
      title="Email Statement of Account"
      onCancel={onCancel}
      onSend={send}
      onSent={() => onSent?.()}
    />
  )
}
