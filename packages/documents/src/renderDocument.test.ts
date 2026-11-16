// file: packages/documents/src/renderDocument.test.ts
/**
 * The server render of the documents (Billing part 7c): each document becomes one self-contained HTML page with the
 * generated stylesheet and its markup, and the PDF footer names the firm and the office. The last test rebuilds the
 * Tailwind part of the stylesheet from the templates and fails when the committed one is stale: run
 * `pnpm documents:css` after changing a template's classes.
 *
 * Run: pnpm --dir packages/documents exec vitest run src/renderDocument.test.ts
 */

import path from 'node:path'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'
import { DOCUMENT_CSS } from './generated/documentCss.generated.ts'
import { buildLetterhead } from './letterhead.ts'
import { documentPdfOptions, renderInvoiceDocumentHtml, renderReceiptDocumentHtml, renderStatementDocumentHtml } from './renderDocument.tsx'
import { SAMPLE_FIRM_PROFILE, buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from './sampleData.ts'

const KS = buildLetterhead(SAMPLE_FIRM_PROFILE, 'sample-office-pratt')

describe('server render', () => {
  it('renders each document as one page with the stylesheet inline', async () => {
    const invoice = await renderInvoiceDocumentHtml(buildSampleInvoice(KS))
    expect(invoice.startsWith('<!doctype html>')).toBe(true)
    expect(invoice).toContain('<title>Invoice 3392 · Krueger &amp; Richard</title>')
    expect(invoice).toContain('data-kr-component="InvoiceReportOption1"')
    expect(invoice).toContain("@font-face{font-family:'DM Sans'")
    expect(await renderStatementDocumentHtml(buildSampleStatement(KS))).toContain('data-kr-component="StatementOfAccountReport"')
    expect(await renderReceiptDocumentHtml(buildSampleReceipt(KS))).toContain('1790480990196')
  })

  it('draws the running footer from the letterhead', () => {
    const options = documentPdfOptions(KS, 'Invoice')
    expect(options.margin).toEqual({ top: '0.5in', right: '0', bottom: '0.85in', left: '0' })
    expect(options.footerTemplate).toContain('Krueger &amp; Richard · Attorneys at Law')
    expect(options.footerTemplate).toContain('Invoice · Kansas · Page <span class="pageNumber">')
  })

  it('has a stylesheet built from the current templates (run pnpm documents:css when this fails)', async () => {
    const root = path.resolve(import.meta.dirname, '..')
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency: () => undefined })
    const built = compiler.build(new Scanner({ sources: [{ base: path.join(root, 'src'), pattern: '**/*.tsx', negated: false }] }).scan())
    expect(DOCUMENT_CSS.includes(built)).toBe(true)
  })
})
