// file: apps/api/src/platform/pdfRenderer.ts
/**
 * Invoice PDF rendering for email attachments — web-only, no local browser.
 *
 * The PDF is a print of self-contained HTML (inline styles, no external
 * assets) produced by Cloudflare Browser Rendering's REST API
 * (`POST /accounts/{id}/browser-rendering/pdf`). The same call runs from the
 * dev server and from the Worker in production, so the bytes are identical.
 *
 * Config:
 *   KR_CF_ACCOUNT_ID                 Cloudflare account id (a plain var in kr-api-wrangler.jsonc)
 *   KR_CF_BROWSER_RENDERING_TOKEN    token text (Worker secret; locally in the git-ignored .dev.vars)
 * Token permission: Account → Browser Rendering ("Browser Run") → Edit.
 *
 * Failures never block the email: `renderPdf` returns `{ pdf: null, error }`
 * and the route reports `pdfError`.
 *
 * Ported from the old `api/_server/krInvoicePdf.ts` (Billing part 7c of `docs/API/Billing_Audit.md`). The requester
 * chose on Nov 16, 2026 to keep the old Browser Rendering setup (the REST address with the token) instead of decision
 * B2's `browser` binding. Changed: settings come from the Worker's `env` instead of `.env` and the startup loader (no
 * `_PATH` setting: a Worker has no files); `fetch` is passed in so tests never reach Cloudflare; `KR_PDF_RENDERER=none`
 * still turns PDFs off; bytes are an `ArrayBuffer` instead of a Node `Buffer`; logs use `logLine` and never carry the
 * token.
 */

import { logLine } from './log.ts'

/** Page options passed through to Browser Rendering (Puppeteer `page.pdf` names; `format` must be lowercase). */
export interface PdfRenderOptions {
  /** Page margins as CSS lengths; the document's `@page` rule should state the same values. */
  margin?: { top: string; right: string; bottom: string; left: string }
  /** Header/footer HTML fragments drawn in the margin boxes on every page (`pageNumber` / `totalPages` spans are filled by Chromium). */
  headerTemplate?: string
  footerTemplate?: string
}

export interface PdfResult {
  pdf: ArrayBuffer | null
  error?: string
}

/** What `renderPdf` reads from the Worker's settings. */
export type PdfEnv = { KR_CF_ACCOUNT_ID?: string; KR_CF_BROWSER_RENDERING_TOKEN?: string; KR_PDF_RENDERER?: string }

/** Explains the usual Cloudflare failures in terms of the fix. */
export function explainPdfFailure(error: string): string {
  if (error.includes('MISSING_KR_CF_ACCOUNT_ID')) return 'set KR_CF_ACCOUNT_ID in kr-api-wrangler.jsonc (Cloudflare dashboard → Workers & Pages → Account ID)'
  if (error.includes('MISSING_KR_CF_BROWSER_RENDERING_TOKEN')) return 'set the KR_CF_BROWSER_RENDERING_TOKEN secret (wrangler secret put; .dev.vars locally)'
  if (error.includes('HTTP_401') || error.includes('HTTP_403')) return 'token rejected: check it has Browser Rendering: Edit on this account and is not expired'
  if (error.includes('HTTP_402') || error.includes('HTTP_429')) return 'Browser Rendering quota or plan limit reached on the Cloudflare account'
  if (error.includes('HTTP_404')) return 'endpoint not found: Browser Rendering may not be enabled for this account, or the account id is wrong'
  return 'see the Cloudflare message'
}

/**
 * Renders a PDF from self-contained HTML; never throws.
 *
 * @param env - The Worker's settings (account id, token, optional `KR_PDF_RENDERER=none`).
 * @param html - The complete document (stylesheet and fonts inline).
 * @param requestId - For the log lines.
 * @param options - Margins and the running footer.
 * @param fetcher - `fetch`, or a stand-in in tests.
 * @returns The PDF bytes, or null with the reason.
 */
export async function renderPdf(env: PdfEnv, html: string, requestId: string, options: PdfRenderOptions = {}, fetcher: typeof fetch = fetch): Promise<PdfResult> {
  if ((env.KR_PDF_RENDERER ?? '').trim().toLowerCase() === 'none') return { pdf: null, error: 'PDF_RENDERER_DISABLED' }
  const accountId = env.KR_CF_ACCOUNT_ID?.trim()
  const token = env.KR_CF_BROWSER_RENDERING_TOKEN?.trim()
  logLine('PDF:cfg', requestId, { htmlBytes: html.length, account: accountId ? 'set' : 'MISSING', token: token ? 'set' : 'MISSING' })
  try {
    if (!accountId) throw new Error('CONFIG_MISSING_KR_CF_ACCOUNT_ID')
    if (!token) throw new Error('CONFIG_MISSING_KR_CF_BROWSER_RENDERING_TOKEN')
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        pdfOptions: {
          format: 'letter',
          printBackground: true,
          preferCSSPageSize: true,
          ...(options.margin ? { margin: options.margin } : {}),
          ...(options.footerTemplate || options.headerTemplate
            ? { displayHeaderFooter: true, headerTemplate: options.headerTemplate ?? '<span></span>', footerTemplate: options.footerTemplate ?? '<span></span>' }
            : {}),
        },
      }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`CLOUDFLARE_PDF_HTTP_${response.status}${text ? `: ${text.replace(/\s+/g, ' ').slice(0, 240)}` : ''}`)
    }
    const pdf = await response.arrayBuffer()
    logLine('PDF:ok', requestId, { bytes: pdf.byteLength })
    return { pdf }
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught)
    logLine('PDF:fail', requestId, { error: error.slice(0, 160), hint: explainPdfFailure(error) })
    return { pdf: null, error }
  }
}
