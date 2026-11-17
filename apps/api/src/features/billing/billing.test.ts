// file: apps/api/src/features/billing/billing.test.ts
/**
 * Billing (plan stages 3 and 4), against an in-memory copy of the real Schema 8.0. Made-up people and amounts only.
 * Checks: the record (matters by party and by number, staff labels, the register's running balance, synthetic
 * invoice rows); time entries (create with a code, refuse another client's matter, delete only unbilled); an invoice
 * from create to lock, payment, void of the payment and void of the invoice; super-admin-only actions; card payments
 * waiting for Stripe; trust; manual register rows; and that every write leaves audit rows. Decision C2 (Nov 16, 2026):
 * applying a payment's unapplied money to invoices later (the accounting, every refusal, and the re-read inside the write).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/billing/billing.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { BillingRecord, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createBillingQueries } from './queries.ts'
import { applyUnappliedPayment, dateForDatabase, dateForDisplay } from './rules.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  for (const id of ['lk_practice_area_miscellaneous', 'lk_matter_status_open', 'lk_party_role_primary_client', 'lk_payment_type_check', 'lk_payment_type_cash', 'lk_payment_type_wire']) {
    run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  }
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-pat', 'Pat', 'Sample', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-lee', 'Lee', 'Other', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-staff', 'Sam', 'Staffer', ?1, ?1)`, OLD)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-staff', 'ind-staff', 'sam@example.com', 'x', 'staff')`)
  run(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-admin', 'admin@example.com', 'x', 'super_admin')`)
  run(`INSERT INTO employee (id, user_id, staff_code) VALUES ('emp-sam', 'user-staff', 'SS')`)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-pat', '501', 'individual', 'ind-pat', 'Pat Sample', 'active', ?1, ?1)`, OLD)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-lee', '502', 'individual', 'ind-lee', 'Lee Other', 'active', ?1, ?1)`, OLD)
  const matter = (id: string, number: string) =>
    run(
      `INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id, created_at) VALUES (?1, ?2, 'Matter', 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'user-admin', ?3)`,
      id,
      number,
      OLD,
    )
  matter('m-pat-0', '501.0')
  matter('m-pat-1', '501.1') // no matter_party row: found by its number
  matter('m-lee-0', '502.0')
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES ('mp-pat', 'm-pat-0', 'cl-pat', 'lk_party_role_primary_client', 1)`)
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES ('mp-lee', 'm-lee-0', 'cl-lee', 'lk_party_role_primary_client', 1)`)
  run(`INSERT INTO invoice (id, matter_id, billed_to_client_id, invoice_number, invoice_date, total_amount, balance_due, status) VALUES ('inv-old', 'm-lee-0', 'cl-lee', '120', '2026-01-02', 10, 10, 'sent')`)
}

let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  clearSessionCache()
})

async function send(method: string, path: string, body?: unknown, role = 'staff', userId = 'user-staff') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, userId))
}
const data = async <T,>(res: Response) => ((await res.json()) as { data: T }).data
const code = async (res: Response) => ErrorEnvelope.parse(await res.json()).error.code
const row = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T
const record = async () => BillingRecord.parse(await data(await send('GET', '/v1/billing/clients/cl-pat')))
const base = '/v1/billing/clients/cl-pat'

const entry = (over: Record<string, unknown> = {}) => ({
  matterId: 'm-pat-0',
  date: '03/02/2026',
  description: 'Drafted the will',
  activityCategory: 'Drafting',
  kind: 'Time',
  hours: 1.5,
  rate: 200,
  amount: 300,
  billingStatus: 'Bill Next Invoice',
  staffId: 'user-staff',
  ...over,
})

describe('billing dates', () => {
  it('converts between the display and database forms', () => {
    expect(dateForDisplay('2026-03-02T10:00:00Z')).toBe('03/02/2026')
    expect(dateForDatabase('03/02/2026', 'x')).toBe('2026-03-02')
    expect(dateForDatabase(undefined, '2026-01-05T00:00:00Z')).toBe('2026-01-05')
  })
})

describe('the billing record', () => {
  it('lists the client\'s matters (by party and by number) and names staff from the person', async () => {
    await send('POST', `${base}/time-entries`, entry())
    const result = await record()
    expect(result.client).toEqual({ id: 'cl-pat', clientNumber: '501', displayName: 'Pat Sample' })
    expect(result.matters.map((matter) => matter.matterNumber)).toEqual(['501.0'])
    expect(result.timeEntries[0]).toMatchObject({ staff: 'SS - Sam Staffer', staffCode: 'SS', amount: 300, billingStatus: 'Bill Next Invoice', date: '03/02/2026' })
    expect(result.timeEntries[0]!.bcid).toMatch(/^[A-Z0-9]{7}$/)
    expect(result.staffOptions.map((option) => option.label)).toContain('SS - Sam Staffer')
    expect(result.viewer).toEqual({ canWrite: true, canAdminister: false, userId: 'user-staff' })
  })

  it('carries the active rate classes and each person\'s default class (FB-0008)', async () => {
    env.sqlite
      .prepare(
        `INSERT INTO lookup (id, category, value, label, description) VALUES ('lk_kr_billing_rate_classes', 'kr_billing_rate_classes', 'billing_rate_classes', 'Billing Rate Classes', ?1)`,
      )
      .run(JSON.stringify({ classes: [{ id: 'ks_paralegal', label: 'KS Paralegal Rate', rate: 100, active: false, builtIn: true }], defaults: { 'user-staff': 'tx_paralegal' } }))
    const result = await record()
    expect(result.rateClasses?.map((item) => item.id)).toEqual(['ks_attorney_sr', 'ks_attorney_jr', 'tx_attorney_sr', 'tx_attorney_jr', 'tx_paralegal'])
    expect(result.staffOptions.find((option) => option.id === 'user-staff')?.defaultRateClassId).toBe('tx_paralegal')
    expect(result.staffOptions.find((option) => option.id === 'user-admin')?.defaultRateClassId).toBeNull()
  })

  it('falls back to the number prefix when no matter_party links the client', async () => {
    env.sqlite.prepare("DELETE FROM matter_party WHERE id = 'mp-pat'").run()
    expect((await record()).matters.map((matter) => matter.matterNumber)).toEqual(['501.0', '501.1'])
  })

  it('answers 404 for an unknown client and refuses read roles it never had', async () => {
    expect(await code(await send('GET', '/v1/billing/clients/nobody'))).toBe('VALIDATION_CLIENT_NOT_FOUND')
    expect((await send('GET', base, undefined, 'client')).status).toBe(403)
  })

  it('shows an invoice with no ledger posting as a synthetic register row', async () => {
    const lee = BillingRecord.parse(await data(await send('GET', '/v1/billing/clients/cl-lee')))
    expect(lee.ledgerEntries).toEqual([expect.objectContaining({ id: 'synthetic-invoice-inv-old', charges: 10, balance: 10, reference: '120' })])
  })
})

describe('time entries', () => {
  it('refuses a matter of another client', async () => {
    expect(await code(await send('POST', `${base}/time-entries`, entry({ matterId: 'm-lee-0' })))).toBe('VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT')
  })

  it('changes and deletes an unbilled entry, with audit rows', async () => {
    const { id } = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry()))
    expect((await send('PATCH', `${base}/time-entries/${id}`, entry({ hours: 2, amount: 400 }))).status).toBe(200)
    expect(row<{ amount_inc_tax: number }>('SELECT amount_inc_tax FROM time_entry WHERE id = ?1', id).amount_inc_tax).toBe(400)
    expect((await send('DELETE', `${base}/time-entries/${id}`)).status).toBe(200)
    expect(row('SELECT id FROM time_entry WHERE id = ?1', id)).toBeUndefined()
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'billing' AND target_id = ?1", id).n).toBe(3)
  })

  it('zeroes the hours of a flat fee that is not tracked', async () => {
    const { id } = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry({ kind: 'Flat Fee Service', hours: 3, amount: 900 })))
    expect(row('SELECT hours, billing_mode FROM time_entry WHERE id = ?1', id)).toEqual({ hours: 0, billing_mode: 'flat_fee_billable' })
  })
})

describe('an invoice from draft to void', () => {
  it('creates, locks, takes a payment, voids the payment, then voids the invoice', async () => {
    const a = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry()))
    const b = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry({ description: 'Signing', hours: 1, amount: 200 })))

    // Create: next firm-wide number (120 exists for another client), lines, entries billed, ledger posting.
    const created = await data<{ id: string; invoiceNumber: string }>(await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: -50, entryIds: [a.id, b.id] }))
    expect(created.invoiceNumber).toBe('121')
    let result = await record()
    const invoice = result.invoices[0]!
    expect(invoice).toMatchObject({ invoiceNumber: '121', amountDue: 450, writeOff: -50, locked: false, status: 'Unpaid', entryIds: [a.id, b.id] })
    expect(result.timeEntries.every((item) => item.billingStatus === 'Billed' && item.invoiceId === created.id)).toBe(true)
    expect(result.ledgerEntries.at(-1)).toMatchObject({ charges: 450, balance: 450, reference: '121' })

    // Save as a draft without entry b: b is billable again and its line hidden.
    expect((await send('PATCH', `${base}/invoices/${created.id}`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [a.id] })).status).toBe(200)
    result = await record()
    expect(result.invoices[0]).toMatchObject({ amountDue: 300, entryIds: [a.id] })
    expect(result.timeEntries.find((item) => item.id === b.id)).toMatchObject({ billingStatus: 'Bill Next Invoice', invoiceId: null })

    // Lock; an entry on it may not change; unlock needs a super admin.
    expect((await send('POST', `${base}/invoices/${created.id}/lock`)).status).toBe(200)
    expect(await code(await send('PATCH', `${base}/time-entries/${a.id}`, entry()))).toBe('VALIDATION_BILLED_TIME_ENTRY_LOCKED')
    expect((await send('POST', `${base}/invoices/${created.id}/unlock`)).status).toBe(403)

    // Card payments wait for Stripe; a check pays part of it.
    expect(await code(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId: created.id, amount: 100 }], amount: 100, receivedDate: '03/06/2026', paymentType: 'Credit card' }))).toBe('VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED')
    expect(await code(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId: created.id, amount: 500 }], amount: 500, receivedDate: '03/06/2026', paymentType: 'Check' }))).toBe('VALIDATION_PAYMENT_EXCEEDS_BALANCE')
    const payment = await data<{ id: string }>(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId: created.id, amount: 100 }], amount: 100, receivedDate: '03/06/2026', paymentType: 'Check', referenceNumber: '1001' }))
    result = await record()
    expect(result.invoices[0]).toMatchObject({ amountDue: 200, status: 'Partially paid' })
    expect(result.payments[0]).toMatchObject({ amount: 100, paymentType: 'Check', invoiceNumber: '121', voided: false })
    // The invoice's posting is dated the day it was made (old rule), so it sorts after the earlier-dated payment.
    expect(result.ledgerEntries.some((item) => item.payments === 100)).toBe(true)
    expect(result.ledgerEntries.at(-1)!.balance).toBe(200)
    expect(await code(await send('POST', `${base}/invoices/${created.id}/void`, {}, 'super_admin', 'user-admin'))).toBe('VALIDATION_INVOICE_HAS_PAYMENTS')

    // Void the payment (super admin): the invoice returns to sent with its full balance.
    expect((await send('POST', `${base}/payments/${payment.id}/void`, { reason: 'Bounced', refund: false })).status).toBe(403)
    const voided = await data<{ invoicesUpdated: number }>(await send('POST', `${base}/payments/${payment.id}/void`, { reason: 'Bounced', refund: false }, 'super_admin', 'user-admin'))
    expect(voided.invoicesUpdated).toBe(1)
    result = await record()
    expect(result.invoices[0]).toMatchObject({ amountDue: 300, status: 'Unpaid', locked: true })
    expect(result.payments[0]).toMatchObject({ voided: true, voidReason: 'Bounced' })
    expect(result.ledgerEntries.filter((item) => !item.voided).at(-1)).toMatchObject({ balance: 300 })

    // Void the invoice: entries billable again, posting voided.
    const voidedInvoice = await data<{ entriesReleased: number }>(await send('POST', `${base}/invoices/${created.id}/void`, { reason: 'Wrong client' }, 'super_admin', 'user-admin'))
    expect(voidedInvoice.entriesReleased).toBe(1)
    result = await record()
    expect(result.invoices[0]).toMatchObject({ status: 'Void', lockedReason: 'Voided' })
    expect(result.timeEntries.every((item) => item.billingStatus === 'Bill Next Invoice' && !item.invoiceId)).toBe(true)
    expect(result.ledgerEntries.filter((item) => !item.voided)).toEqual([])
  })

  it('takes tax and notes on create and save, and keeps them when a save leaves them out (part 7f, audit item 1)', async () => {
    const a = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry()))
    const created = await data<{ id: string }>(await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: -50, entryIds: [a.id], taxAmount: 12.5, notes: '  Quarterly bill  ' }))
    const stored = () => row<{ tax_amount: number; notes: string | null; total_amount: number; balance_due: number }>('SELECT tax_amount, notes, total_amount, balance_due FROM invoice WHERE id = ?1', created.id)
    expect(stored()).toEqual({ tax_amount: 12.5, notes: 'Quarterly bill', total_amount: 262.5, balance_due: 262.5 })
    // The register posting follows the total with the tax.
    expect((await record()).ledgerEntries.at(-1)).toMatchObject({ charges: 262.5, balance: 262.5 })
    // The record carries the saved tax, for the editor and the invoice documents (API patch 43).
    expect((await record()).invoices.find((invoice) => invoice.id === created.id)).toMatchObject({ taxAmount: 12.5 })

    // A save without the two keeps them.
    const save = { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [a.id] }
    expect((await send('PATCH', `${base}/invoices/${created.id}`, save)).status).toBe(200)
    expect(stored()).toEqual({ tax_amount: 12.5, notes: 'Quarterly bill', total_amount: 312.5, balance_due: 312.5 })
    expect((await record()).ledgerEntries.at(-1)).toMatchObject({ charges: 312.5 })

    // A save may change the tax (stored now; the old save only counted it) and clear the notes.
    expect((await send('PATCH', `${base}/invoices/${created.id}`, { ...save, taxAmount: 0, notes: '' })).status).toBe(200)
    expect(stored()).toEqual({ tax_amount: 0, notes: null, total_amount: 300, balance_due: 300 })

    // Left out on create: no tax and no notes; a negative tax is refused.
    const b = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry({ description: 'Signing' })))
    expect((await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [b.id], taxAmount: -1 })).status).toBe(422)
    const plain = await data<{ id: string }>(await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [b.id] }))
    expect(row('SELECT tax_amount, notes FROM invoice WHERE id = ?1', plain.id)).toEqual({ tax_amount: 0, notes: null })
  })

  it('refuses an entry from another matter', async () => {
    const lee = env.sqlite.prepare("INSERT INTO time_entry (id, matter_id, user_id, entry_date, hours, description) VALUES ('te-lee', 'm-lee-0', 'user-staff', '2026-03-01', 1, 'x')")
    lee.run()
    expect(await code(await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: ['te-lee'] }))).toBe('VALIDATION_INVOICE_ENTRY_MISMATCH')
  })
})

describe('payments, trust and the register', () => {
  it('leaves an unapplied payment on a matter, and needs a matter when not applied', async () => {
    expect(await code(await send('POST', `${base}/payments`, { invoiceAllocations: [], amount: 50, receivedDate: '03/06/2026', paymentType: 'Cash' }))).toBe('VALIDATION_MISSING_MATTER_ID')
    expect((await send('POST', `${base}/payments`, { matterId: 'm-pat-0', invoiceAllocations: [], amount: 50, receivedDate: '03/06/2026', paymentType: 'Cash' })).status).toBe(201)
    const result = await record()
    expect(result.accountTotals.unappliedPayments).toBe(50)
    expect(result.ledgerEntries.at(-1)).toMatchObject({ payments: 50, balance: -50 })
  })

  it('records trust requests and deposits, and edits a trust request', async () => {
    const request = await data<{ id: string }>(await send('POST', `${base}/trust-requests`, { matterId: 'm-pat-0', amount: 1000, note: 'Retainer', requestNumber: 'TR-1' }))
    await send('POST', `${base}/trust-entries`, { matterId: 'm-pat-0', action: 'deposit', amount: 1000, requestNumber: 'TR-1', date: '03/07/2026' })
    await send('PATCH', `${base}/trust-requests/${request.id}`, { matterId: 'm-pat-0', amount: 1200, note: 'Retainer, raised' })
    const result = await record()
    expect(result.trustEntries.map((item) => [item.reference, item.balance])).toEqual([
      ['Trust Request', 1200],
      ['Trust Payment Received', 1000],
    ])
    expect(result.accountTotals.trustBalance).toBe(1000)
  })

  it('runs each matter\'s own balance beside the client\'s (part 7f, audit item 4)', async () => {
    // A second matter of the client, linked by party, with its own unapplied payment.
    env.sqlite.prepare("INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES ('mp-pat-1', 'm-pat-1', 'cl-pat', 'lk_party_role_primary_client', 1)").run()
    const a = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry()))
    await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [a.id] })
    await send('POST', `${base}/payments`, { matterId: 'm-pat-1', invoiceAllocations: [], amount: 40, receivedDate: '03/06/2026', paymentType: 'Cash' })
    const rows = (await record()).ledgerEntries
    const first = rows.find((item) => item.matterNumber === '501.0')!
    const second = rows.find((item) => item.matterNumber === '501.1')!
    // The client's balance runs across both matters; each matter's balance only over its own rows.
    expect(rows.at(-1)!.balance).toBe(260)
    expect(first).toMatchObject({ charges: 300, matterBalance: 300 })
    expect(second).toMatchObject({ payments: 40, matterBalance: -40 })
  })

  it('edits a manual register row but not one posted by a payment', async () => {
    await send('POST', `${base}/trust-entries`, { matterId: 'm-pat-0', action: 'disbursement', amount: 25 })
    // C3 (Nov 16, 2026): trust rows stay out of the client register; the row is still changed through its id.
    expect((await record()).ledgerEntries.some((item) => item.editable)).toBe(false)
    const manual = row<{ id: string }>("SELECT id FROM ledger_entry WHERE ledger_bucket = 'trust'")
    expect((await send('PATCH', `${base}/ledger-entries/${manual.id}`, { matterId: 'm-pat-0', date: '03/08/2026', description: 'Filing fee', amount: 30 })).status).toBe(200)
    expect(row<{ memo: string; amount: number }>('SELECT memo, amount FROM ledger_entry WHERE id = ?1', manual.id)).toEqual({ memo: 'Filing fee', amount: 30 })
    await send('POST', `${base}/payments`, { matterId: 'm-pat-0', invoiceAllocations: [], amount: 5, receivedDate: '03/06/2026', paymentType: 'Wire' })
    const posted = (await record()).ledgerEntries.find((item) => item.paymentId)!
    expect(await code(await send('PATCH', `${base}/ledger-entries/${posted.id}`, { matterId: 'm-pat-0', date: '03/08/2026', description: 'x', amount: 1 }))).toBe('VALIDATION_SYSTEM_LEDGER_ENTRY_LOCKED')
  })
})

describe('applying unapplied money to an invoice (decision C2)', () => {
  const PAY_DATE = '03/06/2026'

  /** A locked invoice of `amount` on matter 501.0, and its id. */
  async function lockedInvoice(amount = 300): Promise<string> {
    const a = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry({ amount, hours: amount / 200 })))
    const created = await data<{ id: string }>(await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [a.id] }))
    expect((await send('POST', `${base}/invoices/${created.id}/lock`)).status).toBe(200)
    return created.id
  }
  /** A cash payment of `amount` left unapplied on matter 501.0, and its id. */
  async function unappliedPayment(amount = 500): Promise<string> {
    return (await data<{ id: string }>(await send('POST', `${base}/payments`, { matterId: 'm-pat-0', invoiceAllocations: [], amount, receivedDate: PAY_DATE, paymentType: 'Cash', paymentNumber: 'PAY-C2' }))).id
  }
  const apply = (paymentId: string, allocations: Array<{ invoiceId: string; amount: number }>, role = 'staff', userId = 'user-staff') => send('POST', `${base}/payments/${paymentId}/apply`, { allocations }, role, userId)
  const lastBalance = (rows: BillingRecord['ledgerEntries']) => rows.filter((item) => !item.voided).at(-1)!.balance

  it('moves the money onto the invoice without crediting the client again, and the void reverses it', async () => {
    const invoiceId = await lockedInvoice(300)
    const paymentId = await unappliedPayment(500)
    let result = await record()
    expect(result.payments[0]).toMatchObject({ unappliedAmount: 500, invoiceId: null })
    const before = { balance: lastBalance(result.ledgerEntries), credits: result.accountTotals.receivableCredits }
    expect(before).toEqual({ balance: -200, credits: 500 })

    // Part of it: the invoice is partly paid, the payment keeps the rest unapplied.
    const first = await apply(paymentId, [{ invoiceId, amount: 120 }])
    expect(first.status).toBe(200)
    expect(await data(first)).toEqual({ id: paymentId, applied: 120, unappliedAmount: 380, invoicesUpdated: 1 })
    result = await record()
    expect(result.invoices[0]).toMatchObject({ amountDue: 180, status: 'Partially paid' })
    expect(result.payments[0]).toMatchObject({ unappliedAmount: 380, invoiceId, invoiceNumber: '121' })
    expect(result.accountTotals).toMatchObject({ unappliedPayments: 380, openInvoiceBalance: 180, receivableCredits: 500 })
    // The client's balance is unchanged: the unapplied credit was replaced, not added to, and dated the day it came in.
    expect(lastBalance(result.ledgerEntries)).toBe(-200)
    const paymentRows = result.ledgerEntries.filter((item) => item.paymentId === paymentId)
    expect(paymentRows.filter((item) => !item.voided).map((item) => [item.date, item.payments]).sort()).toEqual([
      [PAY_DATE, 120],
      [PAY_DATE, 380],
    ])
    expect(paymentRows.filter((item) => item.voided)).toEqual([expect.objectContaining({ payments: 500, voidReason: expect.stringContaining('moved, not reversed') })])
    const attached = row<{ invoice_id: string; amount: number }>('SELECT invoice_id, amount FROM ledger_entry WHERE payment_id = ?1 AND invoice_id IS NOT NULL AND voided_at IS NULL', paymentId)
    expect(attached).toEqual({ invoice_id: invoiceId, amount: 120 })
    expect(row<{ amount: number; linked: number }>('SELECT amount, ledger_entry_id IS NOT NULL AS linked FROM payment_application WHERE payment_id = ?1', paymentId)).toEqual({ amount: 120, linked: 1 })
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'APPLY_UNAPPLIED' AND target_id = ?1", paymentId).n).toBe(1)

    // The rest of the invoice pays it; then nothing more fits on it.
    expect((await data<{ unappliedAmount: number }>(await apply(paymentId, [{ invoiceId, amount: 180 }]))).unappliedAmount).toBe(200)
    result = await record()
    expect(result.invoices[0]).toMatchObject({ amountDue: 0, status: 'Paid' })
    expect(lastBalance(result.ledgerEntries)).toBe(-200)
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 1 }]))).toBe('VALIDATION_PAYMENT_EXCEEDS_BALANCE')

    // A void of the payment reverses the applied money too: the invoice is open again at its whole balance.
    expect((await send('POST', `${base}/payments/${paymentId}/void`, { reason: 'Wrong client', refund: false }, 'super_admin', 'user-admin')).status).toBe(200)
    result = await record()
    expect(result.invoices[0]).toMatchObject({ amountDue: 300, status: 'Unpaid' })
    expect(result.payments[0]).toMatchObject({ voided: true, unappliedAmount: 0 })
    expect(lastBalance(result.ledgerEntries)).toBe(300)
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 1 }]))).toBe('VALIDATION_PAYMENT_ALREADY_VOID')
  })

  it('splits the money over several invoices in one write', async () => {
    const one = await lockedInvoice(300)
    const two = await lockedInvoice(100)
    const paymentId = await unappliedPayment(500)
    expect(await data(await apply(paymentId, [{ invoiceId: one, amount: 300 }, { invoiceId: two, amount: 50.004 }]))).toMatchObject({ applied: 350, unappliedAmount: 150, invoicesUpdated: 2 })
    const result = await record()
    // Looked up by id: the two invoices share a date, so the record's order between them is not fixed.
    const byId = (id: string) => result.invoices.find((invoice) => invoice.id === id)!
    expect([byId(one), byId(two)].map((invoice) => [invoice.amountDue, invoice.status])).toEqual([
      [0, 'Paid'],
      [50, 'Partially paid'],
    ])
    expect(result.accountTotals.unappliedPayments).toBe(150)
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'UPDATE' AND target_table = 'invoice' AND new_json LIKE ?1", `%${paymentId}%`).n).toBe(2)
  })

  it('refuses a draft invoice for a payment post and an apply (the requester, Nov 16, 2026)', async () => {
    const a = await data<{ id: string }>(await send('POST', `${base}/time-entries`, entry()))
    const draft = await data<{ id: string }>(await send('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate: '03/05/2026', writeOff: 0, entryIds: [a.id] }))
    expect(await code(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId: draft.id, amount: 100 }], amount: 100, receivedDate: PAY_DATE, paymentType: 'Check' }))).toBe('VALIDATION_INVOICE_IS_DRAFT')
    const paymentId = await unappliedPayment(100)
    expect(await code(await apply(paymentId, [{ invoiceId: draft.id, amount: 50 }]))).toBe('VALIDATION_INVOICE_IS_DRAFT')
    // Once finalized (locked), both take money.
    expect((await send('POST', `${base}/invoices/${draft.id}/lock`)).status).toBe(200)
    expect((await apply(paymentId, [{ invoiceId: draft.id, amount: 50 }])).status).toBe(200)
  })

  it('returns detached money to unapplied, so it can be applied again once the invoice is finalized', async () => {
    const invoiceId = await lockedInvoice(300)
    const payment = await data<{ id: string }>(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 100 }], amount: 100, receivedDate: PAY_DATE, paymentType: 'Check' }))
    const balanceBefore = lastBalance((await record()).ledgerEntries)
    expect(await data(await send('POST', `${base}/invoices/${invoiceId}/detach-payments`, {}, 'super_admin', 'user-admin'))).toMatchObject({ detached: 1 })
    let result = await record()
    expect(result.invoices.find((item) => item.id === invoiceId)).toMatchObject({ amountDue: 300, status: 'Unpaid' })
    expect(result.payments.find((item) => item.id === payment.id)).toMatchObject({ unappliedAmount: 100 })
    expect(result.accountTotals.unappliedPayments).toBe(100)
    // The register credit stays as it was: the client's balance does not change.
    expect(lastBalance(result.ledgerEntries)).toBe(balanceBefore)
    expect(row<{ notes: string }>('SELECT notes FROM payment_application WHERE payment_id = ?1', payment.id).notes).toMatch(/DETACHED /)

    // Unlock, correct, finalize again, then apply the money back.
    expect((await send('POST', `${base}/invoices/${invoiceId}/unlock`, {}, 'super_admin', 'user-admin')).status).toBe(200)
    expect((await send('POST', `${base}/invoices/${invoiceId}/lock`)).status).toBe(200)
    expect(await data(await apply(payment.id, [{ invoiceId, amount: 100 }]))).toMatchObject({ applied: 100, unappliedAmount: 0 })
    result = await record()
    expect(result.invoices.find((item) => item.id === invoiceId)).toMatchObject({ amountDue: 200, status: 'Partially paid' })
    expect(lastBalance(result.ledgerEntries)).toBe(balanceBefore)
  })

  it('voids a detached payment without touching the invoice it left', async () => {
    const invoiceId = await lockedInvoice(300)
    const first = await data<{ id: string }>(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 100 }], amount: 100, receivedDate: PAY_DATE, paymentType: 'Check' }))
    expect((await send('POST', `${base}/invoices/${invoiceId}/detach-payments`, {}, 'super_admin', 'user-admin')).status).toBe(200)
    // Another payment pays the invoice in full.
    await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 300 }], amount: 300, receivedDate: PAY_DATE, paymentType: 'Wire' })
    expect((await send('POST', `${base}/payments/${first.id}/void`, { reason: 'Bounced', refund: false }, 'super_admin', 'user-admin')).status).toBe(200)
    // Before the change the void took its 100 off this invoice a second time.
    expect((await record()).invoices.find((item) => item.id === invoiceId)).toMatchObject({ amountDue: 0, status: 'Paid' })
  })

  it('refuses what the rules do not allow', async () => {
    const invoiceId = await lockedInvoice(300)
    const paymentId = await unappliedPayment(100)
    // Readers may not; the body is checked (1 to 10 invoices, positive amounts).
    expect((await apply(paymentId, [{ invoiceId, amount: 10 }], 'front_end_author')).status).toBe(403)
    expect((await apply(paymentId, [])).status).toBe(422)
    expect((await apply(paymentId, Array.from({ length: 11 }, (_, index) => ({ invoiceId: `inv-${index}`, amount: 1 })))).status).toBe(422)
    expect((await apply(paymentId, [{ invoiceId, amount: -5 }])).status).toBe(422)
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 0.004 }]))).toBe('VALIDATION_PAYMENT_ALLOCATION_AMOUNT')
    expect(await code(await apply('pay-nobody', [{ invoiceId, amount: 10 }]))).toBe('VALIDATION_PAYMENT_NOT_FOUND')
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 10 }, { invoiceId, amount: 5 }]))).toBe('VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE')
    expect(await code(await apply(paymentId, [{ invoiceId: 'inv-old', amount: 5 }]))).toBe('VALIDATION_PAYMENT_INVOICE_NOT_FOUND')
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 100.01 }]))).toBe('VALIDATION_PAYMENT_EXCEEDS_UNAPPLIED')
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 300.01 }]))).toBe('VALIDATION_PAYMENT_EXCEEDS_BALANCE')
    // Another client's payment is not found under this client.
    env.sqlite.prepare("INSERT INTO payment (id, client_id, matter_id, received_date, amount, unapplied_amount, created_by_user_id) VALUES ('pay-lee', 'cl-lee', 'm-lee-0', '2026-03-06', 20, 20, 'user-staff')").run()
    expect(await code(await apply('pay-lee', [{ invoiceId, amount: 5 }]))).toBe('VALIDATION_PAYMENT_NOT_FOUND')
    // A void invoice takes nothing.
    env.sqlite.prepare("UPDATE invoice SET status = 'void' WHERE id = ?1").run(invoiceId)
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 5 }]))).toBe('VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT')
    // Nothing was written by any refusal.
    expect(row<{ unapplied_amount: number }>('SELECT unapplied_amount FROM payment WHERE id = ?1', paymentId).unapplied_amount).toBe(100)
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'APPLY_UNAPPLIED'").n).toBe(0)
  })

  it('refuses money the register never credited as unapplied, so the client is never credited twice', async () => {
    const invoiceId = await lockedInvoice(300)
    const paymentId = (await data<{ id: string }>(await send('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 100 }], amount: 100, receivedDate: PAY_DATE, paymentType: 'Check' }))).id
    // A payment row that says money is unapplied, with no unapplied register credit behind it.
    env.sqlite.prepare('UPDATE payment SET unapplied_amount = 40 WHERE id = ?1').run(paymentId)
    expect(await code(await apply(paymentId, [{ invoiceId, amount: 40 }]))).toBe('VALIDATION_PAYMENT_UNAPPLIED_LEDGER_MISMATCH')
    expect((await record()).invoices[0]).toMatchObject({ amountDue: 200 })
  })

  it('reads again when the invoice changes during the write, and gives up after three tries', async () => {
    const invoiceId = await lockedInvoice(300)
    const paymentId = await unappliedPayment(200)
    const actor = { userId: 'user-staff', email: 'sam@example.com', role: 'staff', requestId: 'req-c2' }
    const real = createBillingQueries(env.db)
    let changes = 0
    // Another payment lands on the invoice between the read and the write (here: just before the batch), `times` times.
    const racing = (times: number) => ({
      ...real,
      applyUnapplied: async (plan: Parameters<typeof real.applyUnapplied>[0]) => {
        if (changes < times) {
          changes += 1
          env.sqlite.prepare('UPDATE invoice SET amount_paid = amount_paid + 1, balance_due = balance_due - 1 WHERE id = ?1').run(invoiceId)
        }
        return real.applyUnapplied(plan)
      },
    })
    await expect(applyUnappliedPayment(racing(3), 'cl-pat', paymentId, { allocations: [{ invoiceId, amount: 50 }] }, actor)).rejects.toMatchObject({ code: 'BILLING_CHANGED_DURING_APPLY', status: 409 })
    expect(row<{ unapplied_amount: number }>('SELECT unapplied_amount FROM payment WHERE id = ?1', paymentId).unapplied_amount).toBe(200)
    expect(row<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_entry WHERE payment_id = ?1 AND voided_at IS NULL', paymentId).n).toBe(1)
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'APPLY_UNAPPLIED'").n).toBe(0)

    // One change only: the second try reads the new balance and applies.
    changes = 0
    expect(await applyUnappliedPayment(racing(1), 'cl-pat', paymentId, { allocations: [{ invoiceId, amount: 50 }] }, actor)).toMatchObject({ applied: 50, unappliedAmount: 150 })
    expect(row<{ amount_paid: number; balance_due: number }>('SELECT amount_paid, balance_due FROM invoice WHERE id = ?1', invoiceId)).toEqual({ amount_paid: 54, balance_due: 246 })
  })
})
