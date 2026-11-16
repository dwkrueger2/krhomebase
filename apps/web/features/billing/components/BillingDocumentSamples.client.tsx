'use client'
// file: apps/web/features/billing/components/BillingDocumentSamples.client.tsx
/**
 * BillingDocumentSamples — the Reports panel workspace that demonstrates the
 * printable billing documents with fixture data. Staff pick a document
 * (Invoice Option 1, Invoice Option 2, Statement of Account, Payment Receipt) and a letterhead,
 * see it inline as paginated Letter pages — the same
 * calculated page breaks the printer will use — and can open the same document
 * in the session-gated print view (`/print/...`) to print or save
 * as PDF.
 *
 * State ownership: this component owns the document/letterhead choice and the firm profile it reads; the
 * report templates are pure renderers of the sample data built here.
 *
 * Ported from the old `KR-Billing/Invoicing/BillingDocumentSamples.client.tsx` (Billing part 7b of
 * `docs/API/Billing_Audit.md`). Placed by `features/reports/components/ReportsPanel.client.tsx`.
 *
 * Changed from the old page:
 *  - The letterhead buttons are the firm's offices from the firm profile (`letterheadChoices`, decision B5), read with
 *    the firm feature's `fetchFirmProfile` (`GET /v1/firm/profile`); until it loads, or when it cannot be read, the
 *    samples show the old written-in letterhead (`SAMPLE_FIRM_PROFILE`) and say so.
 *  - "Email Sample" (the old server render of the sample to a stored PDF through `billing/sample-pdf`) arrives with
 *    part 7c, with the PDF render.
 *    Billing part 7c (Nov 16, 2026): in its place a "Sample PDF" button asks the API to render the chosen sample
 *    (Invoice Option 1, the Statement of Account or the Payment Receipt; Option 2 has no PDF) with the chosen office's
 *    letterhead (`fetchSamplePdf`, `POST /v1/billing/document-samples/pdf`) and opens the PDF in a new tab. The PDF
 *    is not stored and nothing is emailed (the requester's choice). Only a super admin or admin may (the API decides;
 *    its refusal sentence is shown under the title).
 *  - Spacing and colors follow the theme tokens and the Density Contract; the old page used larger paddings and
 *    hard-coded white.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FirmProfile } from '@krhomebase/contracts'
import InvoiceReportOption1 from '@krhomebase/documents/invoice-option-1'
import InvoiceReportOption2 from '@krhomebase/documents/invoice-option-2'
import { buildLetterhead, letterheadChoices } from '@krhomebase/documents/letterhead'
import PaymentReceiptReport from '@krhomebase/documents/receipt-report'
import { SAMPLE_FIRM_PROFILE, buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from '@krhomebase/documents/samples'
import StatementOfAccountReport from '@krhomebase/documents/statement-report'
import PaginatedPrintPreview from '@/components/printing/PaginatedPrintPreview.client'
import { PRINT_VIEW_BLOCKED, openPrintView } from '@/components/printing/printHandoff.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { fetchFirmProfile } from '@/features/firm/api.client'
import { L } from '@/lib/KRUtilities'
import { BillingApiError, fetchSamplePdf } from '../api.client'

type SampleDocument = 'invoice-option-1' | 'invoice-option-2' | 'statement-of-account' | 'payment-receipt'

/** The API's sample for each document; Option 2 has no PDF. */
const SAMPLE_PDF_DOCUMENTS: Record<SampleDocument, 'invoice-option-1' | 'statement' | 'receipt' | null> = {
  'invoice-option-1': 'invoice-option-1',
  'invoice-option-2': null,
  'statement-of-account': 'statement',
  'payment-receipt': 'receipt',
}

const DOCUMENT_LABELS: Record<SampleDocument, string> = {
  'invoice-option-1': 'Invoice · Option 1',
  'invoice-option-2': 'Invoice · Option 2',
  'statement-of-account': 'Statement of Account',
  'payment-receipt': 'Payment Receipt',
}

const STYLES = {
  headerCard: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.08)]',
  eyebrow: 'text-[10px] font-bold uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  title: 'm-0 text-[clamp(20px,2.4vw,30px)] leading-[1.05] text-(color:--kr-theme-text) [font-family:var(--kr-theme-font-display,Georgia,serif)]',
  description: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  button:
    'px-[8px] py-[2px] min-h-[26px] cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-extrabold text-(color:--kr-theme-text) hover:border-(--kr-theme-brand-primary)',
  primaryButton:
    'px-[8px] py-[2px] min-h-[26px] cursor-pointer rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-brand-primary-active)',
  toggle:
    'px-[8px] py-[2px] min-h-[24px] cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-semibold text-(color:--kr-theme-text)',
  toggleActive:
    'px-[8px] py-[2px] min-h-[24px] cursor-pointer rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] font-semibold text-(color:--kr-theme-text-inverse)',
  groupLabel: 'text-[10px] font-bold uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  previewCard: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  previewHint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  notice: 'm-0 px-[6px] py-[2px] rounded-[2px] border border-(--kr-theme-danger) text-[11px] text-(color:--kr-theme-danger)',
  info: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  link: 'text-(color:--kr-theme-brand-primary) underline',
  // While the PDF is made, the disabled button stays fully visible (it carries the spinner).
  busyButton: 'disabled:cursor-wait',
  disabledButton: 'disabled:cursor-not-allowed disabled:opacity-[0.55]',
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
  workspace: 'p-[8px] gap-[8px] flex flex-col',
  header: 'px-[8px] py-[6px] gap-[8px] flex items-start justify-between',
  headerCopy: 'min-w-0 gap-[3px] grid',
  headerActions: 'gap-[4px] flex flex-wrap items-center',
  controlsRow: 'px-[8px] py-[4px] gap-x-[16px] gap-y-[4px] flex flex-wrap items-center border-t border-(--kr-theme-line)',
  controlGroup: 'gap-[4px] flex flex-wrap items-center',
  previewHeader: 'px-[8px] py-[4px] gap-[6px] flex items-center justify-between border-b border-(--kr-theme-line)',
  // Sample PDF button content: rainbow spinner + "Making PDF..." while the API renders it.
  buttonBusy: 'gap-[4px] inline-flex items-center',
} as const

interface BillingDocumentSamplesProps {
  onBack: () => void
}

/** Renders the sample chooser, inline paginated preview, and print-view action. */
export default function BillingDocumentSamples({ onBack }: BillingDocumentSamplesProps) {
  const [sampleDocument, setSampleDocument] = useState<SampleDocument>('invoice-option-1')
  const [profile, setProfile] = useState<FirmProfile | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [office, setOffice] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  /** The API's refusal or failure sentence for the sample PDF. */
  const [pdfError, setPdfError] = useState<string | null>(null)
  /** The last sample PDF, kept as a link when the browser blocked the new tab. */
  const [pdfLink, setPdfLink] = useState<string | null>(null)
  const pdfUrlRef = useRef<string | null>(null)

  // The object URL of the last sample PDF is released when the page closes.
  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    },
    [],
  )

  // The firm profile gives the letterhead; the built-in sample letterhead shows until it arrives.
  useEffect(() => {
    let live = true
    fetchFirmProfile()
      .then((data) => live && setProfile(data.profile))
      .catch(() => live && setProfileError(true))
    return () => {
      live = false
    }
  }, [])

  const firmProfile = profile ?? SAMPLE_FIRM_PROFILE
  const choices = useMemo(() => letterheadChoices(firmProfile), [firmProfile])
  const letterhead = useMemo(() => buildLetterhead(firmProfile, office), [firmProfile, office])
  const invoice = useMemo(() => buildSampleInvoice(letterhead), [letterhead])
  const statement = useMemo(() => buildSampleStatement(letterhead), [letterhead])
  const receipt = useMemo(() => buildSampleReceipt(letterhead), [letterhead])
  const isStatement = sampleDocument === 'statement-of-account'
  const isReceipt = sampleDocument === 'payment-receipt'
  const footerLeft = [letterhead.firmName, letterhead.tagline].filter(Boolean).join(' · ')
  const footerRight = [isStatement ? 'Statement of Account' : isReceipt ? 'Payment Receipt' : 'Invoice', letterhead.stateName].filter(Boolean).join(' · ')

  /** Opens the previewed document in the print-view tab. */
  function openPrint(): void {
    const opened = openPrintView({
      document: isStatement ? 'statement' : isReceipt ? 'receipt' : 'invoice',
      source: 'sample',
      office: profile ? letterhead.officeId : undefined,
      option: sampleDocument === 'invoice-option-2' ? 'option-2' : 'option-1',
    })
    setPopupBlocked(!opened)
  }

  const handlePaginated = useCallback((count: number) => setPageCount(count), [])
  const pdfDocument = SAMPLE_PDF_DOCUMENTS[sampleDocument]

  /**
   * Asks the API for the chosen sample as a PDF and opens it in a new tab. The tab is opened at the click (a tab
   * opened after the wait would be blocked) and pointed at the PDF once it arrives; when the browser blocks it, the
   * PDF is offered as a link instead.
   */
  async function openSamplePdf(): Promise<void> {
    if (!pdfDocument || pdfBusy) return
    const tab = window.open('', '_blank')
    setPdfBusy(true)
    setPdfError(null)
    setPdfLink(null)
    try {
      const blob = await fetchSamplePdf({ document: pdfDocument, officeId: profile ? letterhead.officeId : null })
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
      const url = URL.createObjectURL(blob)
      pdfUrlRef.current = url
      if (tab) tab.location.href = url
      else setPdfLink(url)
    } catch (caught) {
      tab?.close()
      L(`[KR_BILLING_SAMPLES:sample-pdf] failed document=${pdfDocument} code=${caught instanceof BillingApiError ? caught.code : 'unknown'}`)
      setPdfError(caught instanceof Error ? caught.message : 'The sample PDF could not be made.')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <section aria-label="Billing document samples" className={LAYOUT_STYLES.workspace} data-kr-component="BillingDocumentSamples" data-kr-id="BillingDocumentSamples">
      {/* Workspace header: title, description, and back / print-view actions. */}
      <header className={STYLES.headerCard} data-kr-element="billing-samples-header">
        <div className={LAYOUT_STYLES.header}>
          <div className={LAYOUT_STYLES.headerCopy}>
            <div className={STYLES.eyebrow}>Reports / Billing</div>
            <h2 className={STYLES.title}>Billing Document Samples</h2>
            <p className={STYLES.description}>
              Preview the invoice templates, the Statement of Account and the Payment Receipt with sample data on calculated Letter pages, then open the print view to print or save as PDF.
            </p>
            {profileError ? (
              <p className={STYLES.info} data-kr-element="billing-samples-profile-note" role="status">
                The firm profile could not be read; the samples show the built-in letterhead.
              </p>
            ) : null}
            {popupBlocked ? (
              <p className={STYLES.notice} role="alert">
                {PRINT_VIEW_BLOCKED}
              </p>
            ) : null}
            {pdfError ? (
              <p className={STYLES.notice} data-kr-element="billing-samples-pdf-error" role="alert">
                {pdfError}
              </p>
            ) : null}
            {pdfLink ? (
              <p className={STYLES.info} data-kr-element="billing-samples-pdf-link" role="status">
                The browser blocked the new tab.{' '}
                <a className={STYLES.link} href={pdfLink} rel="noreferrer" target="_blank">
                  Open the sample PDF
                </a>
              </p>
            ) : null}
          </div>
          <div className={LAYOUT_STYLES.headerActions}>
            <button className={STYLES.button} data-kr-action="billing-samples-back" type="button" onClick={onBack}>
              ← Report list
            </button>
            <button
              className={`${STYLES.button} ${pdfBusy ? STYLES.busyButton : STYLES.disabledButton}`}
              data-kr-action="billing-samples-sample-pdf"
              disabled={!pdfDocument || pdfBusy}
              title={pdfDocument ? 'Render this sample to a PDF on the server (Super Admin and Admin) and open it in a new tab' : 'Invoice Option 2 has no PDF; choose Option 1, the statement or the receipt'}
              type="button"
              onClick={() => void openSamplePdf()}
            >
              {pdfBusy ? (
                <span className={LAYOUT_STYLES.buttonBusy}>
                  <RainbowBusySpinner ariaLabel="Making the PDF" busy hideWhenIdle={false} size={12} />
                  Making PDF...
                </span>
              ) : (
                'Sample PDF'
              )}
            </button>
            <button className={STYLES.primaryButton} data-kr-action="billing-samples-open-print-view" type="button" onClick={openPrint}>
              Open print view
            </button>
          </div>
        </div>

        {/* Controls row: document and letterhead choices. */}
        <div className={LAYOUT_STYLES.controlsRow} data-kr-element="billing-samples-controls-row">
          <div className={LAYOUT_STYLES.controlGroup} data-kr-element="billing-samples-document-toggle">
            <span className={STYLES.groupLabel}>Document</span>
            {(Object.keys(DOCUMENT_LABELS) as SampleDocument[]).map((key) => (
              <button className={sampleDocument === key ? STYLES.toggleActive : STYLES.toggle} data-kr-action={`billing-samples-select-${key}`} key={key} type="button" onClick={() => setSampleDocument(key)}>
                {DOCUMENT_LABELS[key]}
              </button>
            ))}
          </div>
          {choices.length > 1 ? (
            <div className={LAYOUT_STYLES.controlGroup} data-kr-element="billing-samples-state-toggle">
              <span className={STYLES.groupLabel}>Letterhead</span>
              {choices.map((choice) => (
                <button
                  className={letterhead.officeId === choice.officeId ? STYLES.toggleActive : STYLES.toggle}
                  data-kr-action={`billing-samples-office-${choice.officeId}`}
                  key={choice.officeId}
                  type="button"
                  onClick={() => setOffice(choice.officeId)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {/* Inline paginated preview of the selected document (same page breaks as the print view). */}
      <div className={STYLES.previewCard} data-kr-element="billing-samples-preview">
        <div className={LAYOUT_STYLES.previewHeader}>
          <span className={STYLES.groupLabel}>{DOCUMENT_LABELS[sampleDocument]}</span>
          <span className={STYLES.previewHint}>
            {pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'} · ` : ''}Letter 8.5 × 11 in · breaks calculated at 11 in
          </span>
        </div>
        <PaginatedPrintPreview dataKrId="billing-samples-paper-stage" footerLeft={footerLeft} footerRight={footerRight} inline paginationKey={`${sampleDocument}:${letterhead.officeId}:${profile ? 'profile' : 'sample'}`} onPaginated={handlePaginated}>
          {sampleDocument === 'invoice-option-1' ? <InvoiceReportOption1 data={invoice} /> : null}
          {sampleDocument === 'invoice-option-2' ? <InvoiceReportOption2 data={invoice} /> : null}
          {isStatement ? <StatementOfAccountReport data={statement} /> : null}
          {isReceipt ? <PaymentReceiptReport data={receipt} /> : null}
        </PaginatedPrintPreview>
      </div>
    </section>
  )
}
