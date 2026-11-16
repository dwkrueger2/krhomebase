// file: apps/api/src/features/billing-documents/billing-documents.test.ts
/**
 * Billing documents by email (Billing part 7c), against an in-memory Schema 8.0 with a stand-in mailer, a stand-in R2
 * bucket and a stand-in Browser Rendering. Made-up people and amounts only. Checks: the invoice email (PDF attached,
 * stored copy under the old key pattern with its rows and number, `sent_at` stamped and the draft locked, the
 * WorkStream entry, the tagged subject); preview stores nothing; the statement and the receipt; a refused email marks
 * the copy superseded; a PDF failure still sends; re-send of a stored copy; reading a stored file; no storage is 503
 * before anything is sent; and the routes over HTTP (roles, storage missing, the mailbox not set up).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/billing-documents/billing-documents.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { BillingEmailSentData, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { documentStorage, type DocumentBucket } from '../../platform/documentStorage.ts'
import type { EmailInput, Mailer } from '../../platform/googleWorkspaceMailer.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createBillingQueries } from '../billing/queries.ts'
import { createFirmQueries } from '../firm/queries.ts'
import { createWorkstreamQueries } from '../workstream/queries.ts'
import { createBillingDocumentQueries } from './queries.ts'
import { invoiceEmailInfo, previewInvoiceEmail, readDocumentFile, receiptEmailInfo, resendDocument, sendInvoiceEmail, sendReceiptEmail, sendStatementEmail, type DocumentContext } from './rules.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'
const NOW = new Date('2026-11-16T15:00:00.000Z')

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  for (const id of ['lk_practice_area_miscellaneous', 'lk_matter_status_open', 'lk_party_role_primary_client', 'lk_payment_type_check']) run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-pat', 'Pat', 'Sample', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-staff', 'Sam', 'Staffer', ?1, ?1)`, OLD)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-staff', 'ind-staff', 'sam@example.com', 'x', 'staff')`)
  run(`INSERT INTO employee (id, user_id, staff_code) VALUES ('emp-sam', 'user-staff', 'SS')`)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-pat', '501', 'individual', 'ind-pat', 'Pat Sample', 'active', ?1, ?1)`, OLD)
  run(`INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id, created_at) VALUES ('m-pat-0', '501.0', 'General', 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'user-staff', ?1)`, OLD)
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES ('mp-pat', 'm-pat-0', 'cl-pat', 'lk_party_role_primary_client', 1)`)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary) VALUES ('icm-pat', 'ind-pat', 'email', 'pat@example.com', 1)`)
}

let env: { db: D1Database; sqlite: DatabaseSync }
let objects: Map<string, { body: ArrayBuffer; type: string }>
let sent: EmailInput[]
let mailRefuses: boolean
let pdfRefuses: boolean

const bucket: DocumentBucket = {
  put: (async (key: string, body: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) => {
    const bytes = body instanceof Uint8Array ? body.slice().buffer : body
    objects.set(key, { body: bytes, type: options?.httpMetadata?.contentType ?? '' })
    return null
  }) as never,
  get: (async (key: string) => {
    const object = objects.get(key)
    return object ? { arrayBuffer: async () => object.body, httpMetadata: { contentType: object.type } } : null
  }) as never,
  delete: (async (key: string) => void objects.delete(key)) as never,
}

const mailer: Mailer = {
  sendInvite: async () => ({ sent: false, provider: 'not_configured' }),
  sendEmail: async (input) => {
    sent.push(input)
    return mailRefuses ? { sent: false, provider: 'google_workspace', reason: 'NOPE' } : { sent: true, provider: 'google_workspace', messageId: `gm-${sent.length}` }
  },
}

const fetcher = (async () => (pdfRefuses ? new Response('quota', { status: 429 }) : new Response(new TextEncoder().encode('%PDF-1.7 test'), { status: 200 }))) as unknown as typeof fetch

function context(storage = true): DocumentContext {
  return {
    billing: createBillingQueries(env.db),
    workstream: createWorkstreamQueries(env.db),
    firm: createFirmQueries(env.db),
    docs: createBillingDocumentQueries(env.db),
    storage: storage ? documentStorage(bucket) : null,
    mailer,
    pdfEnv: { KR_CF_ACCOUNT_ID: 'acct', KR_CF_BROWSER_RENDERING_TOKEN: 'token' },
    fetcher,
    actor: { userId: 'user-staff', email: 'sam@example.com', role: 'staff', displayName: 'Sam Staffer', requestId: 'req-1' },
    now: () => NOW,
  }
}

async function call(method: string, path: string, body?: unknown, role = 'staff', extra: Record<string, unknown> = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db, ...extra }, 'user-staff'))
}
const dataOf = async <T,>(res: Response) => ((await res.json()) as { data: T }).data
const one = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T
const base = '/v1/billing/clients/cl-pat'

/** A time entry and a draft invoice made through the billing routes; returns the invoice id. */
async function draftInvoice(): Promise<string> {
  const entry = await dataOf<{ id: string }>(await call('POST', `${base}/time-entries`, { matterId: 'm-pat-0', date: '03/02/2026', description: 'Drafted the will', activityCategory: 'Drafting', kind: 'Time', hours: 1.5, rate: 200, amount: 300, billingStatus: 'Bill Next Invoice', staffId: 'user-staff' }))
  const invoice = await dataOf<{ id: string }>(await call('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [entry.id] }))
  return invoice.id
}

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  objects = new Map()
  sent = []
  mailRefuses = false
  pdfRefuses = false
  clearSessionCache()
})

const emailBody = (over: Record<string, unknown> = {}) => ({ to: ['pat@example.com'], cc: [], subject: 'Your invoice', message: 'Thank you.\n\nCall with questions.', includePdf: true, includeInvoiceBody: true, ...over })

describe('invoice email', () => {
  it('stores the copy, sends with the PDF, stamps sent_at, locks the draft and records the WorkStream entry', async () => {
    const invoiceId = await draftInvoice()
    const invoiceNumber = one<{ invoice_number: string }>('SELECT invoice_number FROM invoice WHERE id = ?', invoiceId).invoice_number
    const result = BillingEmailSentData.parse(await sendInvoiceEmail(context(), 'cl-pat', invoiceId, emailBody() as never))
    expect(result).toMatchObject({ sent: true, resent: false, pdfAttached: true, pdfError: null, to: ['pat@example.com'], workstreamError: null })
    expect(result.subject).toContain('[KR 501.0]')
    expect(result.documentNumber).toMatch(/^[A-Z0-9]{7}$/)
    // The email: billing mailbox, the PDF attached under the file name rule, the logo inline.
    expect(sent[0]).toMatchObject({ sender: 'billing', headers: { 'X-KR-Doc': 'invoice', 'X-KR-Client': '501', 'X-KR-Matter': '501.0' } })
    expect(sent[0]!.attachments?.[0]?.filename).toMatch(/^INV-\d{4} \(sent\) 2026-11-16 \[501\] Sample, Pat - \$300\.00 - Krueger-Richard\.pdf$/)
    expect(sent[0]!.html).toContain('Call with questions.')
    // Stored under the old key pattern, with its rows.
    const keys = [...objects.keys()]
    expect(keys.every((key) => key.startsWith(`clients/501/matters/501.0/invoices/${invoiceNumber}/20261116T150000Z-`))).toBe(true)
    expect(keys.map((key) => key.split('.').pop()).sort()).toEqual(['html', 'pdf'])
    expect(one<{ n: number }>("SELECT COUNT(*) AS n FROM media_asset WHERE status = 'active'").n).toBe(2)
    const document = one<{ document_type: string; owner_type: string; storage_status: string; notes: string }>('SELECT document_type, owner_type, storage_status, notes FROM document_record WHERE id = ?', result.documentId)
    expect(document).toMatchObject({ document_type: 'invoice_sent', owner_type: 'matter', storage_status: 'active' })
    expect(JSON.parse(document.notes)).toMatchObject({ invoiceId, to: ['pat@example.com'], sentBy: 'Sam Staffer' })
    // Step 4: sent_at and the lock (audit finding 2).
    expect(one<{ status: string; sent_at: string }>('SELECT status, sent_at FROM invoice WHERE id = ?', invoiceId)).toEqual({ status: 'sent', sent_at: NOW.toISOString() })
    // Step 5: the Emails entry linked to the copy.
    expect(one<{ subgroup: string; document_record_id: string }>('SELECT subgroup, document_record_id FROM workstream_activity WHERE wsid = ?', result.workstreamWsid!)).toEqual({ subgroup: 'Emails', document_record_id: result.documentId })
    // The dialog's list of sent copies.
    const info = await invoiceEmailInfo(context(), 'cl-pat', invoiceId)
    expect(info.recipients[0]).toMatchObject({ email: 'pat@example.com', primary: true })
    expect(info.sent).toHaveLength(1)
    expect(info.sent[0]).toMatchObject({ documentNumber: result.documentNumber, hasPdf: true, hasHtml: true, url: `/api/v1/billing/clients/cl-pat/documents/${result.documentNumber}/file` })
  })

  it('previews without storing or sending, and still sends when the PDF cannot be made', async () => {
    const invoiceId = await draftInvoice()
    const preview = await previewInvoiceEmail(context(), 'cl-pat', invoiceId, emailBody() as never)
    expect(preview.html).toContain('data:image/png;base64,')
    expect(objects.size + sent.length).toBe(0)
    pdfRefuses = true
    const result = await sendInvoiceEmail(context(), 'cl-pat', invoiceId, emailBody() as never)
    expect(result).toMatchObject({ pdfAttached: false, pdfError: expect.stringContaining('CLOUDFLARE_PDF_HTTP_429') })
    expect([...objects.keys()].map((key) => key.split('.').pop())).toEqual(['html'])
  })

  it('stops before sending when there is no storage, and marks the copy superseded when Gmail refuses', async () => {
    const invoiceId = await draftInvoice()
    await expect(sendInvoiceEmail(context(false), 'cl-pat', invoiceId, emailBody() as never)).rejects.toMatchObject({ code: 'BILLING_DOCUMENT_STORAGE_UNAVAILABLE', status: 503 })
    expect(sent).toHaveLength(0)
    mailRefuses = true
    await expect(sendInvoiceEmail(context(), 'cl-pat', invoiceId, emailBody() as never)).rejects.toMatchObject({ code: 'BILLING_EMAIL_FAILED', status: 502 })
    expect(one<{ storage_status: string }>('SELECT storage_status FROM document_record').storage_status).toBe('superseded')
    expect(one<{ sent_at: string | null }>('SELECT sent_at FROM invoice WHERE id = ?', invoiceId).sent_at).toBeNull()
  })
})

describe('statement, receipt, re-send and stored files', () => {
  it('sends the statement and the receipt, re-sends a stored copy and reads its files', async () => {
    const invoiceId = await draftInvoice()
    await call('POST', `${base}/invoices/${invoiceId}/lock`)
    const payment = await dataOf<{ id: string }>(await call('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 100 }], amount: 100, receivedDate: '03/10/2026', paymentType: 'Check', referenceNumber: '1001' }))

    const statement = await sendStatementEmail(context(), 'cl-pat', { ...emailBody({ subject: 'Your statement' }), includeStatementBody: true } as never)
    expect(statement.subject).toContain('[KR 501.0]')
    expect([...objects.keys()].some((key) => key.startsWith('clients/501/statements/'))).toBe(true)

    const info = await receiptEmailInfo(context(), 'cl-pat', payment.id)
    expect(info.details).toMatchObject({ amountReceived: 100, invoiceBalanceAfter: 200, paymentMethod: 'Check' })
    const receipt = await sendReceiptEmail(context(), 'cl-pat', payment.id, { to: ['pat@example.com'], cc: [], subject: '', message: '', includePdf: true } as never)
    expect(receipt.subject).toContain(info.defaultSubject)
    expect([...objects.keys()].some((key) => key.startsWith('clients/501/matters/501.0/payments/'))).toBe(true)

    const again = await resendDocument(context(), 'cl-pat', receipt.documentNumber!, { to: [], cc: [] })
    expect(again).toMatchObject({ resent: true, to: ['pat@example.com'], pdfAttached: true, documentId: receipt.documentId })
    expect(sent.at(-1)!.html).toBe(sent.at(-2)!.html)

    const pdf = await readDocumentFile(context(), 'cl-pat', receipt.documentNumber!, undefined)
    expect(pdf.contentType).toBe('application/pdf')
    const html = await readDocumentFile(context(), 'cl-pat', receipt.documentNumber!, 'html')
    expect(new TextDecoder().decode(html.body)).toContain('<html')
    await expect(readDocumentFile(context(), 'cl-other', receipt.documentNumber!, undefined)).rejects.toMatchObject({ code: 'BILLING_DOCUMENT_NOT_FOUND' })
  })
})

describe('routes', () => {
  it('answers 503 without storage before sending, and lets readers list but not send', async () => {
    const invoiceId = await draftInvoice()
    const info = await call('GET', `${base}/invoices/${invoiceId}/email`, undefined, 'front_end_author')
    expect(info.status).toBe(200)
    expect((await call('POST', `${base}/invoices/${invoiceId}/email`, emailBody(), 'front_end_author')).status).toBe(403)
    const refused = await call('POST', `${base}/invoices/${invoiceId}/email`, emailBody())
    expect(refused.status).toBe(503)
    expect(ErrorEnvelope.parse(await refused.json()).error.code).toBe('BILLING_DOCUMENT_STORAGE_UNAVAILABLE')
    // With storage but no mailbox key: the copy is stored, the send is refused, the copy is superseded.
    const notConfigured = await call('POST', `${base}/invoices/${invoiceId}/email`, emailBody({ includePdf: false }), 'staff', { DOCUMENTS: bucket })
    expect(ErrorEnvelope.parse(await notConfigured.json()).error.code).toBe('BILLING_EMAIL_NOT_CONFIGURED')
    expect(one<{ storage_status: string }>('SELECT storage_status FROM document_record').storage_status).toBe('superseded')
  })
})
