// file: apps/api/src/features/billing/billing.test.ts
/**
 * Billing (plan stages 3 and 4), against an in-memory copy of the real Schema 8.0. Made-up people and amounts only.
 * Checks: the record (matters by party and by number, staff labels, the register's running balance, synthetic
 * invoice rows); time entries (create with a code, refuse another client's matter, delete only unbilled); an invoice
 * from create to lock, payment, void of the payment and void of the invoice; super-admin-only actions; card payments
 * waiting for Stripe; trust; manual register rows; and that every write leaves audit rows.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/billing/billing.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { BillingRecord, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { dateForDatabase, dateForDisplay } from './rules.ts'

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
    expect(result.viewer).toEqual({ canWrite: true, canAdminister: false })
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

  it('edits a manual register row but not one posted by a payment', async () => {
    await send('POST', `${base}/trust-entries`, { matterId: 'm-pat-0', action: 'disbursement', amount: 25 })
    const manual = (await record()).ledgerEntries.find((item) => item.editable)!
    expect((await send('PATCH', `${base}/ledger-entries/${manual.id}`, { matterId: 'm-pat-0', date: '03/08/2026', description: 'Filing fee', amount: 30 })).status).toBe(200)
    expect(row<{ memo: string; amount: number }>('SELECT memo, amount FROM ledger_entry WHERE id = ?1', manual.id)).toEqual({ memo: 'Filing fee', amount: 30 })
    await send('POST', `${base}/payments`, { matterId: 'm-pat-0', invoiceAllocations: [], amount: 5, receivedDate: '03/06/2026', paymentType: 'Wire' })
    const posted = (await record()).ledgerEntries.find((item) => item.paymentId)!
    expect(await code(await send('PATCH', `${base}/ledger-entries/${posted.id}`, { matterId: 'm-pat-0', date: '03/08/2026', description: 'x', amount: 1 }))).toBe('VALIDATION_SYSTEM_LEDGER_ENTRY_LOCKED')
  })
})
