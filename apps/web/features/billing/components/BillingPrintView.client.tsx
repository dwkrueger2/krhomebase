'use client'
// file: apps/web/features/billing/components/BillingPrintView.client.tsx
/**
 * BillingPrintView — the client side of the print-view route. It resolves the
 * requested document (sample fixture or localStorage handoff), lets staff switch
 * the invoice template and letterhead, paginates the document onto Letter pages
 * with PaginatedPrintPreview, and offers Print / Close.
 *
 * State ownership: this component owns option/letterhead/page-count state; the
 * templates are pure renderers.
 *
 * Ported from the old `KR-Billing/Invoicing/BillingPrintView.client.tsx` (Billing part 7b of
 * `docs/API/Billing_Audit.md`). Placed by `app/print/[document]/page.tsx`, which checks the session and passes the
 * firm profile.
 *
 * Changed from the old view:
 *  - Letterhead: one button per firm office that has an address, labeled with its badge (`letterheadChoices`), built
 *    from the firm profile (`buildLetterhead`, decision B5); the old view had the fixed Texas and Kansas pair. The
 *    letterhead the screen handed over is always replaced by the chosen office's, so a document prints the firm
 *    profile as it is now. The running footer reads the profile too ("<firm name> · <tagline>").
 *  - Not here yet: Send (the email dialogs, part 7c) and the print pay link with its QR code (the old first Print
 *    click issued one through `billing/print-pay-link`; part 7d). Print prints the placeholder pay block.
 *  - Printing no longer adds the old `printing-report` class to <body>: this page has no application frame or
 *    banner to hide, and the module CSS hides the toolbar.
 *  - Close falls back to the Billing section (`/?section=billing`) when the browser keeps the tab open.
 *  - Billing part 7c (Nov 16, 2026): Send is back as in the old view, for a real invoice or statement handed off with
 *    its send context: it opens `SendInvoiceDialog` or `SendStatementDialog` with the report on screen (for the
 *    default message) and the chosen letterhead office as `officeId`, so the emailed copy carries the same letterhead
 *    (the API builds the document from the record; the old view sent the report itself). A sent email leaves a
 *    screen-only notice above the pages.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FirmProfile } from '@krhomebase/contracts'
import InvoiceReportOption1 from '@krhomebase/documents/invoice-option-1'
import InvoiceReportOption2 from '@krhomebase/documents/invoice-option-2'
import { buildLetterhead, letterheadChoices } from '@krhomebase/documents/letterhead'
import PaymentReceiptReport from '@krhomebase/documents/receipt-report'
import { buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from '@krhomebase/documents/samples'
import StatementOfAccountReport from '@krhomebase/documents/statement-report'
import type { InvoiceReportData, InvoiceTemplateOption, PaymentReceiptData, StatementOfAccountData } from '@krhomebase/documents/types'
import PaginatedPrintPreview from '@/components/printing/PaginatedPrintPreview.client'
import {
  readPrintHandoff,
  unwrapInvoicePrintHandoff,
  unwrapStatementPrintHandoff,
  type PrintHandoffSendContext,
  type PrintViewDocumentKind,
  type StatementPrintSendContext,
} from '@/components/printing/printHandoff.client'
import { L } from '@/lib/KRUtilities'
import styles from './BillingPrintView.module.css'
import SendInvoiceDialog from './SendInvoiceDialog.client'
import SendStatementDialog from './SendStatementDialog.client'

const STYLES = {
  title: 'text-[12px] font-bold text-(color:--kr-theme-text)',
  hint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  groupLabel: 'text-[10px] font-bold uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  toggle:
    'px-[8px] py-[2px] min-h-[24px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-semibold text-(color:--kr-theme-text) cursor-pointer',
  toggleActive:
    'px-[8px] py-[2px] min-h-[24px] rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] font-semibold text-(color:--kr-theme-text-inverse) cursor-pointer',
  button:
    'px-[10px] py-[2px] min-h-[26px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-extrabold text-(color:--kr-theme-text) cursor-pointer hover:border-(--kr-theme-brand-primary)',
  primaryButton:
    'px-[10px] py-[2px] min-h-[26px] rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-brand-primary-active)',
  notice: 'px-[8px] py-[4px] rounded-[2px] border border-(--kr-theme-danger) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-danger)',
  info: 'px-[8px] py-[4px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text)',
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
  identity: 'gap-[6px] flex min-w-0 flex-1 flex-wrap items-baseline',
  group: 'gap-[4px] flex items-center',
  actions: 'gap-[4px] flex shrink-0 items-center',
  message: 'mx-[10px] mt-[8px]',
} as const

export interface BillingPrintViewProps {
  documentKind: PrintViewDocumentKind
  source: 'sample' | 'handoff'
  handoffKey?: string
  initialOption: InvoiceTemplateOption
  /** Letterhead office (a firm location id) from the address; null: the primary office. */
  initialOffice: string | null
  /** The firm profile read by the page (`GET /v1/firm/profile`), or the built-in one when it could not be read. */
  firmProfile: FirmProfile
  /** False when the page could not read the firm profile; the view then says so. */
  firmProfileLoaded: boolean
}

/** Renders the toolbar and the paginated document for the print-view route. */
export default function BillingPrintView({ documentKind, source, handoffKey, initialOption, initialOffice, firmProfile, firmProfileLoaded }: BillingPrintViewProps) {
  const choices = useMemo(() => letterheadChoices(firmProfile), [firmProfile])
  const [option, setOption] = useState<InvoiceTemplateOption>(initialOption)
  const [office, setOffice] = useState<string | null>(initialOffice)
  const [pageCount, setPageCount] = useState(0)
  const [handoffInvoice, setHandoffInvoice] = useState<InvoiceReportData | null>(null)
  const [handoffStatement, setHandoffStatement] = useState<StatementOfAccountData | null>(null)
  const [handoffReceipt, setHandoffReceipt] = useState<PaymentReceiptData | null>(null)
  const [handoffMissing, setHandoffMissing] = useState(false)
  /** Send contexts handed over with a real invoice or statement; without one there is no Send. */
  const [sendContext, setSendContext] = useState<PrintHandoffSendContext | null>(null)
  const [statementSendContext, setStatementSendContext] = useState<StatementPrintSendContext | null>(null)
  /** The email dialog is open. */
  const [sending, setSending] = useState(false)
  /** What was emailed from this tab (screen only). */
  const [sentNotice, setSentNotice] = useState<string | null>(null)
  const letterhead = useMemo(() => buildLetterhead(firmProfile, office), [firmProfile, office])

  // Handoff payloads live in localStorage, so they are read after mount (client only) and removed.
  useEffect(() => {
    if (source !== 'handoff') return
    if (!handoffKey) {
      setHandoffMissing(true)
      return
    }
    if (documentKind === 'invoice') {
      const envelope = unwrapInvoicePrintHandoff<InvoiceReportData>(readPrintHandoff<unknown>(handoffKey))
      setHandoffInvoice(envelope?.report ?? null)
      setSendContext(envelope?.send ?? null)
      setHandoffMissing(!envelope)
    } else if (documentKind === 'receipt') {
      const payload = readPrintHandoff<PaymentReceiptData>(handoffKey)
      setHandoffReceipt(payload)
      setHandoffMissing(!payload)
    } else {
      const envelope = unwrapStatementPrintHandoff<StatementOfAccountData>(readPrintHandoff<unknown>(handoffKey))
      setHandoffStatement(envelope?.report ?? null)
      setStatementSendContext(envelope?.send ?? null)
      setHandoffMissing(!envelope)
    }
  }, [documentKind, handoffKey, source])

  // Every document prints the chosen office's letterhead from the firm profile.
  const invoice = useMemo(() => {
    if (documentKind !== 'invoice') return null
    const base = source === 'sample' ? buildSampleInvoice(letterhead) : handoffInvoice
    const rVal = base ? { ...base, firm: letterhead } : null
    return rVal
  }, [documentKind, handoffInvoice, letterhead, source])

  const statement = useMemo(() => {
    if (documentKind !== 'statement') return null
    const base = source === 'sample' ? buildSampleStatement(letterhead) : handoffStatement
    const rVal = base ? { ...base, firm: letterhead } : null
    return rVal
  }, [documentKind, handoffStatement, letterhead, source])

  const receipt = useMemo(() => {
    if (documentKind !== 'receipt') return null
    const base = source === 'sample' ? buildSampleReceipt(letterhead) : handoffReceipt
    const rVal = base ? { ...base, firm: letterhead } : null
    return rVal
  }, [documentKind, handoffReceipt, letterhead, source])

  const documentLabel = documentKind === 'invoice' ? 'Invoice' : documentKind === 'receipt' ? 'Payment Receipt' : 'Statement of Account'
  const title =
    documentKind === 'invoice'
      ? `Invoice ${invoice?.invoiceNumber ?? ''} · ${invoice?.billTo.name ?? ''}`
      : documentKind === 'receipt'
        ? `Payment Receipt ${receipt?.receiptNumber ?? ''} · ${receipt?.receivedFrom.name ?? ''}`
        : `Statement of Account · ${statement?.accountHolder.name ?? ''}`
  const footerLeft = [letterhead.firmName, letterhead.tagline].filter(Boolean).join(' · ')
  const footerRight = [documentLabel, letterhead.stateName].filter(Boolean).join(' · ')
  const paginationKey = `${documentKind}:${source}:${handoffKey ?? ''}:${option}:${letterhead.officeId}:${invoice?.lines.length ?? statement?.rows.length ?? 0}`

  // The browser tab title is the name a "Save as PDF" suggests.
  useEffect(() => {
    if (title.trim()) document.title = title
  }, [title])

  /** Prints the paginated pages (the module CSS hides the toolbar). */
  const printNow = useCallback(() => {
    L(`[KR_PRINT_VIEW:166] print requested document=${documentKind} pages=${pageCount}`)
    window.requestAnimationFrame(() => window.print())
  }, [documentKind, pageCount])

  /** Closes the tab when the browser allows it; otherwise returns to Billing. */
  function closeView(): void {
    window.close()
    window.setTimeout(() => {
      if (!window.closed) window.location.assign('/?section=billing')
    }, 150)
  }

  const handlePaginated = useCallback((count: number) => setPageCount(count), [])
  /** The office whose letterhead the emailed copy carries: the chosen one (none when the firm profile was not read). */
  const sendOfficeId = firmProfileLoaded ? letterhead.officeId : null
  const canSend = Boolean((sendContext && invoice) || (statementSendContext && statement))

  const preview = (content: ReactNode) => (
    <PaginatedPrintPreview dataKrId="billing-print-preview" footerLeft={footerLeft} footerRight={footerRight} paginationKey={paginationKey} onPaginated={handlePaginated}>
      {content}
    </PaginatedPrintPreview>
  )

  return (
    <div className={styles.viewport} data-kr-component="BillingPrintView" data-kr-document={documentKind} data-kr-id="billing-print-view" data-kr-theme-scope="krhomebase">
      {/* Print-view toolbar: identity, template/letterhead switches, Print and Close; never printed. */}
      <div className={styles.toolbar} data-kr-element="print-view-toolbar">
        <div className={LAYOUT_STYLES.identity}>
          <span className={STYLES.title}>{title}</span>
          <span className={STYLES.hint}>{pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'} · Letter 8.5 × 11 in` : 'Laying out pages...'}</span>
        </div>
        {documentKind === 'invoice' ? (
          <div className={LAYOUT_STYLES.group} data-kr-element="print-view-template-toggle">
            <span className={STYLES.groupLabel}>Template</span>
            <button className={option === 'option-1' ? STYLES.toggleActive : STYLES.toggle} data-kr-action="print-view-option-1" type="button" onClick={() => setOption('option-1')}>
              Option 1
            </button>
            <button className={option === 'option-2' ? STYLES.toggleActive : STYLES.toggle} data-kr-action="print-view-option-2" type="button" onClick={() => setOption('option-2')}>
              Option 2
            </button>
          </div>
        ) : null}
        {choices.length > 1 ? (
          <div className={LAYOUT_STYLES.group} data-kr-element="print-view-state-toggle">
            <span className={STYLES.groupLabel}>Letterhead</span>
            {choices.map((choice) => (
              <button
                className={letterhead.officeId === choice.officeId ? STYLES.toggleActive : STYLES.toggle}
                data-kr-action={`print-view-office-${choice.officeId}`}
                key={choice.officeId}
                type="button"
                onClick={() => setOffice(choice.officeId)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className={LAYOUT_STYLES.actions}>
          {/* Send: only for a real invoice or statement handed off with its send context; opens the same email dialog as Billing. */}
          {canSend ? (
            <button className={STYLES.button} data-kr-action="print-view-send" title={invoice ? 'Email this invoice to the client' : 'Email this statement to the client'} type="button" onClick={() => setSending(true)}>
              Send
            </button>
          ) : null}
          <button className={STYLES.primaryButton} data-kr-action="print-view-print" type="button" onClick={printNow}>
            Print
          </button>
          <button className={STYLES.button} data-kr-action="print-view-close" type="button" onClick={closeView}>
            Close
          </button>
        </div>
      </div>

      {/* Notices above the pages: screen only. */}
      {!firmProfileLoaded ? (
        <p className={`kr-print-screen-only ${LAYOUT_STYLES.message} ${STYLES.info}`} data-kr-element="print-view-firm-profile-note" role="status">
          The firm profile could not be read, so the letterhead shows the built-in details. Close this tab and try again.
        </p>
      ) : null}
      {sentNotice ? (
        <p className={`kr-print-screen-only ${LAYOUT_STYLES.message} ${STYLES.info}`} data-kr-element="print-view-sent-notice" role="status">
          {sentNotice}
        </p>
      ) : null}
      {handoffMissing ? (
        <p className={`${LAYOUT_STYLES.message} ${STYLES.notice}`} role="alert">
          This print view has expired or was opened without a document. Return to the invoice and click Print again.
        </p>
      ) : null}

      {/* Email dialog from the print view: the invoice on screen, with the chosen letterhead. */}
      {sending && sendContext && invoice ? (
        <SendInvoiceDialog
          clientDisplayName={sendContext.clientDisplayName}
          clientId={sendContext.clientId}
          clientNumber={sendContext.clientNumber}
          invoice={{ id: sendContext.invoiceId, invoiceNumber: sendContext.invoiceNumber, matterNumber: sendContext.matterNumber, dueDate: sendContext.dueDate }}
          officeId={sendOfficeId}
          report={invoice}
          onCancel={() => setSending(false)}
          onSent={() => {
            setSending(false)
            setSentNotice(`Invoice #${sendContext.invoiceNumber} was emailed; it is now marked sent.`)
          }}
        />
      ) : null}
      {/* Statement email dialog from the print view: the statement on screen, with the chosen letterhead. */}
      {sending && statementSendContext && statement ? (
        <SendStatementDialog
          clientDisplayName={statementSendContext.clientDisplayName}
          clientId={statementSendContext.clientId}
          clientNumber={statementSendContext.clientNumber}
          matterId={statementSendContext.matterId}
          matterNumber={statementSendContext.matterNumber}
          officeId={sendOfficeId}
          report={statement}
          onCancel={() => setSending(false)}
          onSent={() => {
            setSending(false)
            setSentNotice('The Statement of Account was emailed; the sent copy is stored on the client.')
          }}
        />
      ) : null}

      {/* Document pages: paginated preview shared by screen and print. */}
      {invoice ? preview(option === 'option-1' ? <InvoiceReportOption1 data={invoice} /> : <InvoiceReportOption2 data={invoice} />) : null}
      {statement ? preview(<StatementOfAccountReport data={statement} />) : null}
      {receipt ? preview(<PaymentReceiptReport data={receipt} />) : null}
    </div>
  )
}
