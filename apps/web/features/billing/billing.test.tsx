// file: apps/web/features/billing/billing.test.tsx
/**
 * The Billing port (plan stages 2 to 4): the session cache (one load per client, a second caller joins it, a matter
 * load is not cached, every write reloads, failures carry the API's code), the menu label, one route per write, and
 * the tabs rendered from a made-up record (print and send disabled until stage 5, card and ACH not selectable until
 * stage 6). The API is a stand-in `fetch`. Made-up people and amounts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/billing.test.tsx
 */

import type { BillingRecord } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingApiError, createInvoice, invalidateBilling, loadBilling, peekBilling, runInvoiceAction, voidPayment } from './api.client'
import InvoicesTab from './components/InvoicesTab.client'
import PaymentsTab from './components/PaymentsTab.client'
import TimeAndFeesLedger from './components/TimeAndFeesLedger.client'
import { billingMenuLabel } from './openBillingClient'

const RECORD: BillingRecord = {
  client: { id: 'cl-1', clientNumber: '501', displayName: 'Pat Sample' },
  matters: [{ id: 'm-1', matterNumber: '501.0', title: 'General' }],
  timeEntries: [
    {
      id: 'te-1',
      matterId: 'm-1',
      date: '03/02/2026',
      matterNumber: '501.0',
      description: 'Drafted the will',
      activityCategory: 'Drafting',
      kind: 'Time',
      hours: 1.5,
      rate: 200,
      amount: 300,
      billingStatus: 'Billed',
      staffId: 'u-1',
      staff: 'SS - Sam Staffer',
      staffCode: 'SS',
      internalTimeTracked: false,
      invoiceId: 'inv-1',
      bcid: 'AB12CD3',
    },
  ],
  invoices: [
    {
      id: 'inv-1',
      matterId: 'm-1',
      matterNumber: '501.0',
      invoiceNumber: '121',
      dateInvoiced: '03/05/2026',
      dueDate: '04/04/2026',
      clientLabel: 'Pat Sample',
      amountDue: 300,
      writeOff: 0,
      ivid: 'IV12345',
      locked: true,
      lockedReason: 'Locked · sent to client',
      status: 'Unpaid',
      entryIds: ['te-1'],
    },
  ],
  payments: [],
  ledgerEntries: [],
  trustEntries: [],
  staffOptions: [{ id: 'u-1', label: 'SS - Sam Staffer', staffCode: 'SS' }],
  accountTotals: { openInvoiceBalance: 300, openInvoiceCount: 1, receivableDebits: 300, receivableCredits: 0, trustCredits: 0, trustDebits: 0, trustBalance: 0, unappliedPayments: 0 },
  viewer: { canWrite: true, canAdminister: false },
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []

/** A stand-in API: GET answers the record; writes answer `{ id }`; `fail` makes the next write refuse. */
function stubApi(options: { failWith?: { status: number; code: string } } = {}) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    if (method !== 'GET' && options.failWith) {
      return new Response(JSON.stringify({ ok: false, error: { code: options.failWith.code, message: 'Refused.' }, requestId: 'req-1' }), { status: options.failWith.status })
    }
    const data = method === 'GET' ? RECORD : url.endsWith('/invoices') ? { id: 'inv-2', invoiceNumber: '122' } : url.endsWith('/void') && url.includes('/payments/') ? { id: 'pay-1', invoicesUpdated: 1, refund: null } : { id: 'x' }
    return new Response(JSON.stringify({ ok: true, data, requestId: 'req-1' }), { status: 200 })
  })
}

beforeEach(() => {
  calls = []
  invalidateBilling()
})
afterEach(() => vi.unstubAllGlobals())

describe('the billing session cache', () => {
  it('loads a client once; a second caller joins the running load', async () => {
    stubApi()
    const [a, b] = await Promise.all([loadBilling('cl-1'), loadBilling('cl-1')])
    expect(a).toBe(b)
    await loadBilling('cl-1')
    expect(calls.map((call) => call.url)).toEqual(['/api/v1/billing/clients/cl-1'])
    expect(peekBilling('cl-1')?.client.clientNumber).toBe('501')
  })

  it('never caches a load narrowed to one matter', async () => {
    stubApi()
    await loadBilling('cl-1', { matterId: 'm-1' })
    expect(peekBilling('cl-1')).toBeUndefined()
    expect(calls[0]!.url).toBe('/api/v1/billing/clients/cl-1?matterId=m-1')
  })

  it('reloads after a write, and after a refused write too', async () => {
    stubApi()
    await loadBilling('cl-1')
    await createInvoice('cl-1', { matterId: 'm-1', invoiceDate: '03/05/2026', writeOff: 0, entryIds: ['te-1'] })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(['GET /api/v1/billing/clients/cl-1', 'POST /api/v1/billing/clients/cl-1/invoices', 'GET /api/v1/billing/clients/cl-1'])

    calls = []
    stubApi({ failWith: { status: 409, code: 'VALIDATION_INVOICE_ALREADY_LOCKED' } })
    const refused = await runInvoiceAction('cl-1', 'inv-1', 'lock').catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(BillingApiError)
    expect(refused).toMatchObject({ code: 'VALIDATION_INVOICE_ALREADY_LOCKED', status: 409, requestId: 'req-1' })
    expect(calls.map((call) => call.method)).toEqual(['POST', 'GET'])
  })

  it('uses one route per action', async () => {
    stubApi()
    await runInvoiceAction('cl-1', 'inv-1', 'detachPayments')
    await runInvoiceAction('cl-1', 'inv-1', 'void', 'Wrong client')
    await voidPayment('cl-1', 'pay-1', 'Bounced', false)
    const writes = calls.filter((call) => call.method !== 'GET')
    expect(writes.map((call) => call.url)).toEqual([
      '/api/v1/billing/clients/cl-1/invoices/inv-1/detach-payments',
      '/api/v1/billing/clients/cl-1/invoices/inv-1/void',
      '/api/v1/billing/clients/cl-1/payments/pay-1/void',
    ])
    expect(writes[1]!.body).toEqual({ reason: 'Wrong client' })
    expect(writes[2]!.body).toEqual({ reason: 'Bounced', refund: false })
  })
})

describe('billing screens', () => {
  it('names an open client like an open contact', () => {
    expect(billingMenuLabel({ clientNumber: '501', displayName: 'Pat Sample' })).toBe('[501] Pat Sample')
    expect(billingMenuLabel({ clientNumber: '', displayName: 'Pat Sample' })).toBe('Pat Sample')
  })

  it('lists invoices with print and send waiting for stage 5', () => {
    const html = renderToStaticMarkup(
      <InvoicesTab
        clientDisplayName="Pat Sample"
        clientNumber="501"
        entries={RECORD.timeEntries}
        invoices={RECORD.invoices}
        matterNumbers={['501.0']}
        payments={[]}
        staffOptions={RECORD.staffOptions}
        onOpenPayment={() => undefined}
        onSave={async () => undefined}
        onSaveEntry={async () => undefined}
      />,
    )
    expect(html).toContain('#121')
    expect(html).toMatch(/data-kr-action="invoice-row-print" disabled=""/)
    expect(html).toContain('plan stage 5')
  })

  it('offers check, cash and wire, with card and ACH shown but not selectable', () => {
    const html = renderToStaticMarkup(
      <PaymentsTab
        canPost
        canVoidPayments={false}
        clientDisplayName="Pat Sample"
        clientNumber="501"
        invoices={RECORD.invoices}
        matterNumbers={['501.0']}
        payments={[]}
        onPost={async () => undefined}
        onVoidPayment={async () => undefined}
      />,
    )
    expect(html).toContain('Invoice #121')
    expect(html).toMatch(/<option disabled="" value="Credit card">/)
    expect(html).toMatch(/<option value="Check" selected="">/)
  })

  it('shows time entries with their status and amount', () => {
    const html = renderToStaticMarkup(
      <TimeAndFeesLedger
        clientDisplayName="Pat Sample"
        clientNumber="501"
        entries={RECORD.timeEntries}
        matterNumbers={['501.0']}
        staffOptions={RECORD.staffOptions}
        onDelete={async () => undefined}
        onSave={async () => undefined}
      />,
    )
    expect(html).toContain('Drafted the will')
    expect(html).toContain('$300.00')
    expect(html).toContain('Billed')
  })
})
