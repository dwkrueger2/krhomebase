// file: packages/documents/src/renderDocument.tsx
/**
 * Server-side document — the HTML that becomes the emailed PDF.
 *
 * Renders the same React template the print view shows
 * (`InvoiceReportOption1`, `StatementOfAccountReport`, `PaymentReceiptReport`) with
 * react-dom's streaming server renderer, and embeds the generated stylesheet (Tailwind classes used
 * by the templates + print-document.css + print-pdf.css + fonts as data: URIs) so
 * the document is self-contained: Cloudflare Browser Rendering needs no access
 * to the app. Layout, fonts, and margins therefore match "Print → Save as PDF"
 * from the print view; only the pagination engine differs (Chromium's own
 * page breaks instead of PaginatedPrintPreview's measured pages), which the
 * `print-pdf.css` layer keeps equivalent.
 *
 * The stylesheet is a build artifact: run `pnpm documents:css` (repository root)
 * after changing a template, either CSS file, or the fonts. See scripts/write-document-css.mjs.
 *
 * Ported from the old `api/_server/krInvoiceDocument.tsx` (Billing part 7c of `docs/API/Billing_Audit.md`), where the
 * API (`apps/api`) renders the PDF. Changed: it lives in this package beside the templates (the API may not import the
 * web app); the running footer's left side comes from the letterhead (`<firm name> · <tagline>`, the print view's
 * footer) instead of written-in text; no logging here (the API logs around the call); the PDF options are plain data
 * (the API's `pdfRenderer.ts` takes them).
 */

// 'react-dom/server.edge' + renderToReadableStream: it runs on the Cloudflare Worker and in Node (tests) alike.
import type { ReactElement } from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import { DOCUMENT_CSS } from './generated/documentCss.generated.ts'
import InvoiceReportOption1 from './InvoiceReportOption1.tsx'
import PaymentReceiptReport from './PaymentReceiptReport.tsx'
import StatementOfAccountReport from './StatementOfAccountReport.tsx'
import type { InvoiceReportData, LetterheadProfile, PaymentReceiptData, StatementOfAccountData } from './types.ts'

/**
 * Page margins for the PDF: top and bottom only, matching the `@page` rule in
 * print-pdf.css (--kr-print-top-margin / --kr-print-bottom-reserve). The 0.75in
 * side margins are the document's own padding, not page margins, because
 * Chromium clips content at the page area and the navy banner must bleed to
 * the sheet edge as it does on the print view. The running footer sits inside
 * the bottom reserve, 0.4in from the sheet edge.
 */
export const DOCUMENT_PDF_MARGINS = { top: '0.5in', right: '0', bottom: '0.85in', left: '0' } as const

/** Side inset for the footer text (the document's side padding; --kr-print-side-margin). */
const DOCUMENT_PDF_SIDE_INSET = '0.75in'

/** Page options for Browser Rendering (the API's `PdfRenderOptions`). */
export interface DocumentPdfOptions {
  margin: { top: string; right: string; bottom: string; left: string }
  headerTemplate: string
  footerTemplate: string
}

/** Renders a React element to a complete HTML string via the streaming renderer (waits for the whole tree). */
async function renderElementToMarkup(element: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element)
  await stream.allReady
  const rVal = await new Response(stream).text()
  return rVal
}

function escapeHtml(value: string): string {
  const rVal = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return rVal
}

/** The complete document around the rendered markup. */
function documentShell(title: string, markup: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${DOCUMENT_CSS}</style></head><body>${markup}</body></html>`
}

/** Renders the complete, self-contained HTML document for an invoice (Option 1, as the old email did). */
export async function renderInvoiceDocumentHtml(report: InvoiceReportData): Promise<string> {
  return documentShell(`Invoice ${report.invoiceNumber} · ${report.firm.firmName}`, await renderElementToMarkup(<InvoiceReportOption1 data={report} />))
}

/** Renders the complete, self-contained HTML document for a Statement of Account. */
export async function renderStatementDocumentHtml(report: StatementOfAccountData): Promise<string> {
  return documentShell(`Statement of Account · ${report.accountHolder.name} · ${report.firm.firmName}`, await renderElementToMarkup(<StatementOfAccountReport data={report} />))
}

/** Renders the complete, self-contained HTML document for a Payment Receipt. */
export async function renderReceiptDocumentHtml(receipt: PaymentReceiptData): Promise<string> {
  return documentShell(`Payment Receipt ${receipt.receiptNumber} · ${receipt.firm.firmName}`, await renderElementToMarkup(<PaymentReceiptReport data={receipt} />))
}

/**
 * Margins and the running footer ("<firm name> · <tagline>" / "Invoice · Texas · Page n of N"),
 * drawn the way print-document.css draws `.kr-print-page-footer` (cream rule,
 * 6.4pt tracked uppercase, secondary text colour, 0.4in from the bottom edge).
 * Header/footer templates are separate documents in Chromium, so they use the
 * system sans fallback rather than the embedded DM Sans.
 *
 * @param letterhead - The document's letterhead (footer left, and the badge for the right side).
 * @param documentLabel - "Invoice", "Statement of Account" or "Payment Receipt".
 */
export function documentPdfOptions(letterhead: LetterheadProfile, documentLabel: string): DocumentPdfOptions {
  const left = [letterhead.firmName, letterhead.tagline].filter(Boolean).join(' · ')
  const right = [documentLabel, letterhead.stateName].filter(Boolean).join(' · ')
  const footerTemplate =
    `<div style="position:relative;width:100%;height:${DOCUMENT_PDF_MARGINS.bottom};margin:0;padding:0;-webkit-print-color-adjust:exact;">` +
    `<div style="position:absolute;left:${DOCUMENT_PDF_SIDE_INSET};right:${DOCUMENT_PDF_SIDE_INSET};bottom:0.4in;display:flex;justify-content:space-between;` +
    `padding-top:8pt;border-top:1.5pt solid #f1eadf;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:6.4pt;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#736a62;">` +
    `<span>${escapeHtml(left)}</span>` +
    `<span>${escapeHtml(right)} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div></div>`
  return { margin: { ...DOCUMENT_PDF_MARGINS }, headerTemplate: '<span></span>', footerTemplate }
}
