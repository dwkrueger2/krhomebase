'use client'
// file: apps/web/features/communications/components/WorkstreamEmailDialog.client.tsx

/**
 * WorkstreamEmailDialog — emails a client from the Workstream ledger. Wraps
 * the shared `components/dialogs/SendEmailDialog`: looks up the client's addresses,
 * lets staff pick the matter the email belongs to (drives the `[KR 120.1]`
 * subject tag), posts to `/api/v1/workstream/email` (firm mailbox),
 * and hands the delivered result back so the ledger can show the new
 * "Emails" activity without a refetch.
 *
 * Lead emails (`[LN ####]`) are covered by the reference contract but this
 * dialog is client-scoped; the lead panel will get its own wiring.
 *
 * Ported from the old `hb-components/KR-WorkStream/WorkstreamEmailDialog.client.tsx` (plan 10, stage 4).
 *
 * Changes:
 * - Calls go through this feature's `api.client.ts`: `fetchEmailRecipients` (`GET /v1/workstream/email/recipients`),
 *   `previewWorkstreamEmail` (`POST /v1/workstream/email/preview`) and `sendWorkstreamEmail`
 *   (`POST /v1/workstream/email`). The old dialog used one route for all three (`kr-api-v1/workstream/send-email`,
 *   with `preview: true`). Failures throw `WorkstreamApiError`, whose message is already a plain sentence, so the
 *   old code-to-sentence mapping (`GOOGLE_WORKSPACE_MAILER_NOT_CONFIGURED`) is gone.
 * - The body names the matter by `matterId`, not `matterNumber`. Each option carries both; the `.0` Client General
 *   Matters is the choice with no id when the list has no `.0` (the API then uses the client's `.0`), so the general
 *   matter is still always offered. `defaultMatterNumber` became `defaultMatterId`.
 * - The subject tag in the hint comes from `tagEmailSubject` in `@krhomebase/contracts`, the same function the API
 *   uses, so the screen and the server agree (the old `hb-lib/email/emailReference.ts` is not ported).
 * - A failed address lookup is shown in the dialog (`suggestionsError`) instead of looking like an empty list.
 * - The matter row has its label beside the field (the shared dialog's 88px label column) and the hint under the
 *   field; Density Contract sizes, `--kr-theme-*` tokens with no fallback colors.
 * - New `inline` prop, passed to the shared dialog, for the `react-dom/server` tests.
 * - Logs name the client id and the error code only.
 */

import { tagEmailSubject, type WorkstreamEmailBody } from '@krhomebase/contracts'
import { useEffect, useId, useMemo, useState } from 'react'
import SendEmailDialog from '@/components/dialogs/SendEmailDialog.client'
import type { EmailDraft, EmailPreview, EmailRecipientSuggestion, EmailSendOutcome } from '@/components/dialogs/emailTypes'
import { L } from '@/lib/KRUtilities'
import { fetchEmailRecipients, previewWorkstreamEmail, sendWorkstreamEmail, WorkstreamApiError } from '../api.client'

const STYLES = {
  label: 'text-[12px] font-[700] leading-[1.2] text-(color:--kr-theme-text)',
  select:
    'min-h-[24px] px-[4px] py-[2px] w-full rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] leading-[1.2] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent) disabled:cursor-not-allowed disabled:opacity-[0.55]',
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
  // Same 88px label column and 3px gap as the shared dialog's To, Cc and Subject rows, so the fields line up.
  matterRow: 'gap-x-[3px] gap-y-[2px] grid grid-cols-[88px_minmax(0,1fr)] items-center',
  matterHint: 'col-start-2',
} as const

/** A matter the email can be filed under. */
export interface WorkstreamEmailMatterOption {
  matterId: string
  matterNumber: string
  title?: string | null
}

/** What the dialog hands back after a delivered email. */
export interface WorkstreamEmailSentResult {
  /** Workstream id of the recorded "Emails" activity; null when logging failed. */
  wsid: string | null
  workstreamError: string | null
  matterNumber: string
  /** Subject as sent, including the reference tag. */
  subject: string
  to: string[]
  cc: string[]
  message: string
}

export interface WorkstreamEmailDialogProps {
  clientId: string
  /** Client number for the `[KR ...]` tag; when unknown it is taken from the recipient lookup. */
  clientNumber?: string | null
  clientDisplayName: string
  /** Matters on the client, `.0` first; the general matter is always offered. */
  matterOptions: readonly WorkstreamEmailMatterOption[]
  /** Pre-selected matter; defaults to the first option (the `.0`) or the general matter. */
  defaultMatterId?: string | null
  /** Signature line in the default message. */
  senderDisplayName: string
  onCancel: () => void
  /** Runs after the staff member dismisses the delivered confirmation. */
  onSent: (result: WorkstreamEmailSentResult) => void
  /** For server-render tests: draw in place instead of a portal. */
  inline?: boolean
}

/** One choice in the matter select. `value` is the matter id, or '' for the client's `.0` chosen by the API. */
export interface WorkstreamEmailMatterChoice {
  value: string
  /** The matter number for the subject tag; '' while the client number is unknown. */
  matterNumber: string
  label: string
}

/** Default cover message; staff replace it in the dialog. */
export function workstreamEmailDefaultMessage(clientDisplayName: string, senderDisplayName: string): string {
  const rVal = `Dear ${clientDisplayName},\n\n\n\nKind regards,\n${senderDisplayName}\nKrueger & Richard, PLLC`
  return rVal
}

/**
 * The matter choices, in the order given (`.0` first). When no option is a `.0` matter, the client's general matter
 * is put first with no id, so the API files the email on the client's `.0` (as the old dialog always offered it).
 */
export function workstreamEmailMatterChoices(matterOptions: readonly WorkstreamEmailMatterOption[], clientNumber: string): WorkstreamEmailMatterChoice[] {
  const list = matterOptions
    .filter((option) => option.matterId.trim() && option.matterNumber.trim())
    .map((option) => ({
      value: option.matterId,
      matterNumber: option.matterNumber.trim(),
      label: option.title ? `${option.matterNumber.trim()} · ${option.title}` : option.matterNumber.trim(),
    }))
  if (list.some((choice) => choice.matterNumber.endsWith('.0'))) return list
  const generalNumber = clientNumber ? `${clientNumber}.0` : ''
  const general = { value: '', matterNumber: generalNumber, label: generalNumber ? `${generalNumber} · General` : 'General (.0)' }
  const rVal = [general, ...list]
  return rVal
}

/** The matter to start with: the default when it is one of the choices, else the first choice. */
export function workstreamEmailInitialMatter(choices: readonly WorkstreamEmailMatterChoice[], defaultMatterId?: string | null): string {
  const rVal = defaultMatterId && choices.some((choice) => choice.value === defaultMatterId) ? defaultMatterId : (choices[0]?.value ?? '')
  return rVal
}

/** The hint under the matter choice, with the tag the API will add (`tagEmailSubject`, shared with the server). */
export function workstreamEmailTagHint(matterNumber: string): string {
  const rVal = matterNumber
    ? `${tagEmailSubject('', matterNumber)} is added to the end of the subject so replies sort by matter in Gmail.`
    : 'The [KR matter] tag is added to the end of the subject so replies sort by matter in Gmail.'
  return rVal
}

/** The request body for preview and send; `matterId` is left out for the `.0` chosen by the API. */
export function buildWorkstreamEmailBody(clientId: string, matterId: string, draft: EmailDraft): WorkstreamEmailBody {
  const rVal: WorkstreamEmailBody = { clientId, to: draft.to, cc: draft.cc, subject: draft.subject, message: draft.message }
  if (matterId) rVal.matterId = matterId
  return rVal
}

/** The sentence shown after a delivered email, with what happened to the Workstream entry. */
export function workstreamEmailSentDetail(result: { to: readonly string[]; subject: string; workstreamWsid: string | null; workstreamError: string | null }): string {
  const workstream = result.workstreamWsid
    ? ` Recorded in the Workstream (${result.workstreamWsid}).`
    : result.workstreamError
      ? ` The email was delivered, but the Workstream entry failed: ${result.workstreamError}.`
      : ''
  const rVal = `Emailed ${result.to.join(', ')} as “${result.subject}”.${workstream}`
  return rVal
}

/**
 * Renders the Workstream email dialog. The parent (the client WorkStream ledger) mounts it, passes the client and its
 * matters, and unmounts it on `onCancel` or `onSent`. This component owns the recipient lookup, the matter choice and
 * the last delivered result; the shared dialog owns the draft, the send and the preview.
 */
export default function WorkstreamEmailDialog({
  clientId,
  clientNumber: clientNumberProp,
  clientDisplayName,
  matterOptions,
  defaultMatterId,
  senderDisplayName,
  onCancel,
  onSent,
  inline = false,
}: WorkstreamEmailDialogProps) {
  const matterFieldId = useId()
  const [resolvedClientNumber, setResolvedClientNumber] = useState<string | null>(null)
  const clientNumber = (clientNumberProp ?? '').trim() || resolvedClientNumber || ''
  const choices = useMemo(() => workstreamEmailMatterChoices(matterOptions, clientNumber), [clientNumber, matterOptions])
  const [matterId, setMatterId] = useState(() => workstreamEmailInitialMatter(choices, defaultMatterId))
  const [suggestions, setSuggestions] = useState<EmailRecipientSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<WorkstreamEmailSentResult | null>(null)

  // When the matter list changes (it may arrive after the dialog opens), keep the choice valid.
  useEffect(() => {
    if (!choices.some((choice) => choice.value === matterId)) setMatterId(workstreamEmailInitialMatter(choices, defaultMatterId))
  }, [choices, defaultMatterId, matterId])

  // Recipient lookup runs once per client while the dialog is open.
  useEffect(() => {
    let cancelled = false
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    fetchEmailRecipients(clientId)
      .then((data) => {
        if (cancelled) return
        setSuggestions(data.recipients.map((item) => ({ email: item.email, label: item.label, primary: item.primary })))
        if (data.clientNumber) setResolvedClientNumber(data.clientNumber)
      })
      .catch((caught: unknown) => {
        const code = caught instanceof WorkstreamApiError ? caught.code : 'unknown'
        L(`[WS_EMAIL_DIALOG:211] recipient lookup failed clientId=${clientId} code=${code}`)
        if (cancelled) return
        setSuggestions([])
        setSuggestionsError(caught instanceof WorkstreamApiError ? caught.message : 'The client’s email addresses could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const chosen = choices.find((choice) => choice.value === matterId) ?? choices[0]
  const tagMatterNumber = chosen?.matterNumber ?? ''

  async function send(draft: EmailDraft): Promise<EmailSendOutcome> {
    try {
      const result = await sendWorkstreamEmail(buildWorkstreamEmailBody(clientId, matterId, draft))
      setLastResult({
        wsid: result.workstreamWsid,
        workstreamError: result.workstreamError,
        matterNumber: result.matterNumber,
        subject: result.subject,
        to: result.to,
        cc: result.cc,
        message: draft.message,
      })
      const rVal: EmailSendOutcome = { ok: true, detail: workstreamEmailSentDetail(result) }
      return rVal
    } catch (caught) {
      const code = caught instanceof WorkstreamApiError ? caught.code : 'unknown'
      L(`[WS_EMAIL_DIALOG:243] send failed clientId=${clientId} code=${code}`)
      const rVal: EmailSendOutcome = { ok: false, detail: caught instanceof WorkstreamApiError ? caught.message : 'The email could not be sent.' }
      return rVal
    }
  }

  /** Server-rendered preview of the current draft (nothing is sent). */
  async function renderPreview(draft: EmailDraft): Promise<EmailPreview> {
    try {
      const rVal = await previewWorkstreamEmail(buildWorkstreamEmailBody(clientId, matterId, draft))
      return rVal
    } catch (caught) {
      const code = caught instanceof WorkstreamApiError ? caught.code : 'unknown'
      L(`[WS_EMAIL_DIALOG:256] preview failed clientId=${clientId} code=${code}`)
      throw caught
    }
  }

  return (
    <SendEmailDialog
      beforeSubject={
        // Matter selector: sets the [KR 120.1] tag and where the activity is filed.
        <div className={LAYOUT_STYLES.matterRow} data-kr-element="workstream-email-matter-row">
          <label className={STYLES.label} htmlFor={matterFieldId}>Matter</label>
          <select
            className={STYLES.select}
            data-kr-element="workstream-email-matter"
            id={matterFieldId}
            value={chosen?.value ?? ''}
            onChange={(event) => setMatterId(event.target.value)}
          >
            {choices.map((choice) => (
              <option key={choice.value || 'general'} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          <span className={`${LAYOUT_STYLES.matterHint} ${STYLES.hint}`} data-kr-element="workstream-email-matter-hint">
            {workstreamEmailTagHint(tagMatterNumber)}
          </span>
        </div>
      }
      dataKrId="workstream-email-dialog"
      defaultMessage={workstreamEmailDefaultMessage(clientDisplayName, senderDisplayName)}
      defaultSubject=""
      footerNote={'Sent from the firm mailbox; a copy is recorded on this client’s Workstream.'}
      inline={inline}
      subtitle={clientNumber ? `[${clientNumber}] ${clientDisplayName}` : clientDisplayName}
      suggestions={suggestions}
      suggestionsError={suggestionsError}
      suggestionsLoading={suggestionsLoading}
      title="Email the client"
      renderPreview={renderPreview}
      onCancel={onCancel}
      onSend={send}
      onSent={() => {
        if (lastResult) onSent(lastResult)
        else onCancel()
      }}
    />
  )
}
