// file: apps/web/features/billing/payLinks.test.tsx
/**
 * Online pay links on the Billing screens (Billing part 7d): the pay link panel (latest link and its status, a paid
 * link that could not post in red, up to three earlier links), and the calls (`refreshPayLinks` posts for a writer and
 * only lists for a reader, a post reloads the record, `issuePrintPayLink`). The API is a stand-in `fetch`. Made-up
 * people and amounts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/payLinks.test.tsx
 */

import type { BillingPayLink } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { invalidateBilling, issuePrintPayLink, refreshPayLinks } from './api.client'
import InvoicePayLinkPanel, { describePayLink } from './components/InvoicePayLinkPanel.client'

const LINK: BillingPayLink = {
  id: 'preq-1',
  prid: 'ABC1234',
  invoiceId: 'inv-1',
  invoiceIvid: 'IV12345',
  invoiceNumber: '121',
  environment: 'sandbox',
  status: 'open',
  tokenHint: 'abcd',
  expiresAt: '2026-12-31T23:59:59.000Z',
  createdAt: '2026-11-16T15:00:00.000Z',
  viewCount: 2,
  lastViewedAt: null,
  intentAttempts: 0,
  paidAmount: null,
  paidAt: null,
  payerEmail: null,
  paymentNumber: null,
  postedAt: null,
  postError: null,
  revokedAt: null,
  revokeReason: null,
  sentDocumentNumber: 'DOC1234',
  linkSource: 'email',
}

const envelope = (data: unknown) => Response.json({ ok: true, data, requestId: 'req-1' })

afterEach(() => {
  vi.unstubAllGlobals()
  invalidateBilling()
})

describe('InvoicePayLinkPanel', () => {
  it('shows the latest link, a paid link that could not post in red, and earlier links', () => {
    const paidNotPosted: BillingPayLink = { ...LINK, id: 'preq-2', prid: 'PAID999', status: 'paid', paidAmount: 120, paidAt: '2026-11-16T14:00:00.000Z', postError: 'VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH' }
    const revoked: BillingPayLink = { ...LINK, id: 'preq-3', prid: 'OLD0001', status: 'revoked', revokedAt: '2026-11-10T14:00:00.000Z', revokeReason: 'Replaced by a newer email' }
    const html = renderToStaticMarkup(<InvoicePayLinkPanel payLinks={[LINK, paidNotPosted, revoked]} />)
    expect(html).toContain('data-kr-element="invoice-pay-link-panel"')
    expect(html).toContain('ABC1234 (abcd...) · emailed · sandbox · sent in DOC1234 · opened 2× · expires')
    expect(html).toContain('data-kr-element="invoice-pay-link-not-posted"')
    expect(html).toContain('Pay link PAID999: paid $120.00 but not posted — VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH')
    expect(html).toContain('revoked')
    expect(html).toContain('Replaced by a newer email')
    expect(html).toContain('text-(color:--kr-theme-danger)')
  })

  it('says how links are issued when there is none, and describes printed and posted links', () => {
    expect(renderToStaticMarkup(<InvoicePayLinkPanel payLinks={[]} />)).toContain('Issued automatically when the invoice is emailed or printed.')
    expect(describePayLink({ ...LINK, linkSource: 'print', sentDocumentNumber: null })).toContain('printed')
    expect(describePayLink({ ...LINK, status: 'posted', paidAmount: 50, paidAt: '2026-11-16T14:00:00.000Z', paymentNumber: 'PAY-1' })).toContain('payment PAY-1')
    expect(describePayLink({ ...LINK, status: 'paid', paidAmount: 50, paidAt: '2026-11-16T14:00:00.000Z' })).toContain('posts when Billing next opens')
  })
})

describe('pay link calls', () => {
  it('posts the paid links for a writer and reloads the record when one posted; a reader only lists', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (String(url).endsWith('/pay-links/post-paid')) return envelope({ payLinks: [{ ...LINK, status: 'posted', paymentNumber: 'PAY-1' }], posted: 1, failed: 0 })
      if (String(url).endsWith('/pay-links')) return envelope({ payLinks: [LINK], posted: 0, failed: 0 })
      return Response.json({ ok: false, error: { code: 'BILLING_UNAVAILABLE', message: 'x' }, requestId: 'r' }, { status: 503 })
    })
    const posted = await refreshPayLinks('cl-1', { post: true })
    expect(posted.posted).toBe(1)
    expect(calls).toEqual(['POST /api/v1/billing/clients/cl-1/pay-links/post-paid', 'GET /api/v1/billing/clients/cl-1'])
    calls.length = 0
    const listed = await refreshPayLinks('cl-1', { post: false })
    expect(listed.payLinks[0]!.status).toBe('open')
    expect(calls).toEqual(['GET /api/v1/billing/clients/cl-1/pay-links'])
  })

  it('asks for the print link of one invoice', async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      expect(`${init?.method} ${url}`).toBe('POST /api/v1/billing/clients/cl-1/invoices/inv-1/print-pay-link')
      return envelope({ issued: false, reason: 'Draft invoices print without a pay link.' })
    })
    expect(await issuePrintPayLink('cl-1', 'inv-1')).toEqual({ issued: false, reason: 'Draft invoices print without a pay link.' })
  })
})
