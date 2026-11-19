// file: apps/api/src/features/billing/rules.ts
/**
 * Billing rules, ported from the old `kr-api-v1/billing/route.ts` (plan stages 3 and 4). The arithmetic, the
 * status words and the error codes are the old ones; what changed is noted where it happens:
 *
 *  - Each write is one batch with its audit rows (`queries.run`). The old route made one crud Worker call per row.
 *  - The record read (`loadBillingRecord`) writes nothing. The old GET also gave missing `bcid` and `ivid` codes to
 *    old rows, and posted paid pay links into the ledger; new rows get their code when they are made, and pay
 *    links move with Stripe (stage 6). Billing part 7d: posting paid links is its own route
 *    (`POST .../pay-links/post-paid`, `features/pay-links/`), which the screen calls when a Billing client opens.
 *  - Staff are named from the person linked to the login (`CODE - First Last`); the old projection used columns the
 *    `user` table does not have, so it fell back to the email address.
 *  - Credit-card and ACH payments, and refunds, wait for stage 6 (they need Stripe).
 *  - Billing part 7e (Nov 16, 2026, `docs/API/Billing_Audit.md` 6.4): the old Stripe branches are back. A credit-card
 *    payment carries its PaymentIntent (`stripePaymentIntentId`); `createPayment` re-reads it from Stripe before
 *    anything is written, and an intent already recorded returns that payment (idempotency on `source_record_id`; the
 *    database's `ux_payment_source_record_active` also allows one active payment per intent). The memo starts
 *    `Stripe <env> · <brand> •••• <last4>`. ACH stays closed. `voidPayment` refunds a Stripe card payment in full
 *    first when asked (a failed refund stops the void; a refund that worked when the database write did not answers
 *    `PAYMENT_VOID_DATABASE_SYNC_FAILED`), and `refreshPaymentRefund` re-reads the refund and its ARN. Stripe is
 *    reached through the `PaymentStripe` the route passes in (`card-payments/rules.ts` `paymentStripeFor`), so these
 *    rules never call Stripe themselves. Changed from the old code: the void is still one batch (so a database
 *    failure leaves nothing half done), and a post racing another post of the same intent returns the other's payment.
 *  - Billing part 7f (Nov 16, 2026, `docs/API/Billing_Audit.md` section 5): invoice create and save take `taxAmount`
 *    and `notes` again (item 1; the save now stores the tax, which the old save only counted in the total, and the
 *    invoice's register posting follows the total with the tax), and each register row carries `matterBalance`, its
 *    matter's own running balance (item 4).
 *  - Decision C2 (the requester, Nov 16, 2026, `docs/API/Billing_Audit.md` 8.2): `applyUnappliedPayment` applies a
 *    payment's unapplied money to open invoices later (the old app could not). The register credited the whole payment
 *    when it was received, so the apply moves money between credits and never credits the client a second time: the
 *    unapplied credit rows drawn from are voided and replaced by one credit per invoice (and one for any rest), each
 *    dated the day the money was received, so every running balance stays the same. See the function for the details.
 */

import type { BillingInvoice, BillingLedgerEntry, BillingPayment, BillingRecord, BillingTimeEntry, BillingTrustEntry, InvoiceBody, LedgerEntryBody, PaymentApplyBody, PaymentApplyData, PaymentBody, TimeEntryBody, TrustEntryBody, TrustRequestBody } from '@krhomebase/contracts'
import { readBillingRateSchedule } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import { logLine } from '../../platform/log.ts'
import { generatePublicCode } from '../contact-edits/rules.ts'
import type { ApplyAllocation, ApplyPlan, BillingQueries, ClientRow, InvoiceLineRow, InvoiceRow, LedgerEntryRow, MatterRow, PaymentRow, StaffRow, TimeEntryRow, TrustRequestRow } from './queries.ts'

/** A write refused for a reason the person can fix, with the old error code. */
export class BillingError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422 | 502,
    message?: string,
    readonly details?: Record<string, string>,
  ) {
    super(message ?? code)
    this.name = 'BillingError'
  }
}

/** A Stripe refund as KR Homebase records it on the payment row (old `BillingRefundDetails`). */
export interface StripeRefundDetails {
  /** Stripe refund id (re_…); `already_refunded` when Stripe had refunded it before and no refund could be found. */
  refundId: string
  /** pending | succeeded | failed | canceled | requires_action */
  status: string | null
  /** Refunded amount in dollars. */
  amount: number | null
  /** Acquirer reference number (ARN) once Stripe has it; the client's bank can trace the refund with it. */
  reference: string | null
  referenceType: string | null
  /** pending | available | unavailable */
  referenceStatus: string | null
}

/** What Stripe confirmed for a card payment (old `VerifiedBillingCardPayment`). */
export interface VerifiedCardIntent {
  paymentIntentId: string
  amountCents: number
  cardBrand: string | null
  cardLast4: string | null
  livemode: boolean
}

/**
 * The Stripe side of card payments, passed in by the route (`card-payments/rules.ts` `paymentStripeFor`; tests pass a
 * stand-in). Its failures are thrown as they come (`CardPaymentError`, `PaymentProviderError`).
 */
export interface PaymentStripe {
  /** The environment a new card payment is recorded in (the server decides; the browser only asks). */
  environmentFor(requested: unknown): 'sandbox' | 'live'
  /** Re-reads the intent and checks it succeeded for these invoices, this amount and this environment. */
  verify(environment: 'sandbox' | 'live', intentId: string, expected: { invoiceAllocations: Array<{ invoiceId: string; amountCents: number }>; amountCents: number }): Promise<VerifiedCardIntent>
  /** Refunds the intent in full, or returns its earlier refund. */
  refund(environment: 'sandbox' | 'live', intentId: string, reason: string): Promise<StripeRefundDetails>
  /** Re-reads one refund (status and ARN). */
  readRefund(environment: 'sandbox' | 'live', refundId: string): Promise<StripeRefundDetails>
}

/** Who is writing, from the checked session. */
export type Actor = { userId: string; email: string; role: string; requestId: string }

// See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
// A choice list: category `payment_type`, ids `lk_payment_type_<value>`.
/** Payment type words ↔ `lookup` ids (old `kr_lookup.types.ts`). */
export const PAYMENT_TYPE_LOOKUP_IDS = {
  ACH: 'lk_payment_type_ach',
  Cash: 'lk_payment_type_cash',
  Check: 'lk_payment_type_check',
  'Credit card': 'lk_payment_type_credit_card',
  Wire: 'lk_payment_type_wire',
} as const

const PUBLIC_CODE_MAX_ATTEMPTS = 8
const STRIPE_SOURCE_PREFIX = 'stripe_'
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const round = (value: number) => Math.round(value * 100) / 100

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** `YYYY-MM-DD…` → `MM/DD/YYYY` (old `dateForDisplay`). */
export function dateForDisplay(value: string | null | undefined): string {
  if (!value) return ''
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value.slice(0, 10)
}

/** `MM/DD/YYYY` or `YYYY-MM-DD…` → `YYYY-MM-DD` (old `dateForDatabase`). */
export function dateForDatabase(value: string | null | undefined, fallback: string): string {
  const raw = value?.trim() || fallback
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return match ? `${match[3]}-${match[1]}-${match[2]}` : raw.slice(0, 10)
}

export function billingStatusForUi(value: string): BillingTimeEntry['billingStatus'] {
  if (value === 'billed') return 'Billed'
  if (value === 'not_billable' || value === 'written_off') return 'Not Billable'
  if (value === 'billable') return 'Bill Next Invoice'
  return 'Delay Bill'
}

export function billingStatusForDatabase(value: BillingTimeEntry['billingStatus']): string {
  switch (value) {
    case 'Bill Next Invoice':
      return 'billable'
    case 'Billed':
      return 'billed'
    case 'Not Billable':
      return 'not_billable'
    default:
      return 'held'
  }
}

export function invoiceStatusForUi(value: string): BillingInvoice['status'] {
  if (value === 'paid') return 'Paid'
  if (value === 'partially_paid') return 'Partially paid'
  if (value === 'void' || value === 'voided') return 'Void'
  return 'Unpaid'
}

/** Every status but draft is locked: the invoice went to the client. */
export const invoiceLocked = (status: string) => status !== 'draft'

export function paymentTypeLabel(lookupId: string | null): string {
  const found = Object.entries(PAYMENT_TYPE_LOOKUP_IDS).find(([, id]) => id === lookupId)
  return found ? found[0] : lookupId || 'Other'
}

/** A time entry's amount: tax-inclusive, else ex-tax, else hours × rate (old rule). */
export const entryAmount = (row: Pick<TimeEntryRow, 'amount_inc_tax' | 'amount_ex_tax' | 'hours' | 'rate'>) => num(row.amount_inc_tax || row.amount_ex_tax || row.hours * row.rate)

function staffLabel(row: StaffRow | undefined, fallback: string): string {
  const name = row?.person_name?.trim() || row?.email?.trim() || fallback
  const code = row?.staff_code?.trim()
  return code ? `${code} - ${name}` : name
}

function isUniqueClash(error: unknown, table: string, column: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(`UNIQUE constraint failed: ${table}.${column}`) || message.includes(`${table}_${column}`)
}

// ----------------------------------------------------------------------------------------------------------
// Client and matters

export async function requireClient(queries: BillingQueries, clientId: string): Promise<ClientRow> {
  const client = await queries.clientById(clientId)
  if (!client) throw new BillingError('VALIDATION_CLIENT_NOT_FOUND', 404, 'No such client account.')
  return client
}

/** A matter is the client's when a `matter_party` row links them, or its number starts `<clientNumber>.` (old rule). */
export async function matterBelongsToClient(queries: BillingQueries, matterId: string, client: ClientRow): Promise<boolean> {
  if (await queries.matterPartyExists(matterId, client.id)) return true
  const matter = await queries.matterById(matterId)
  return Boolean(matter && matter.matter_number.startsWith(`${client.client_number}.`))
}

async function requireClientMatter(queries: BillingQueries, matterId: string, client: ClientRow): Promise<void> {
  if (!(await matterBelongsToClient(queries, matterId, client))) throw new BillingError('VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT', 422, 'That matter is not one of this client\'s matters.')
}

async function loadMatters(queries: BillingQueries, client: ClientRow, requestedMatterId: string | null): Promise<MatterRow[]> {
  if (requestedMatterId) {
    const matter = await queries.matterById(requestedMatterId)
    if (!matter || !(await matterBelongsToClient(queries, requestedMatterId, client))) throw new BillingError('VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT', 422)
    return [matter]
  }
  const linked = await queries.mattersOfClient(client.id)
  // Imported matters with no matter_party row: match by number prefix (old fallback, now one indexed query).
  return linked.length ? linked : queries.mattersByNumberPrefix(client.client_number)
}

// ----------------------------------------------------------------------------------------------------------
// The record (GET)

function projectTimeEntry(row: TimeEntryRow, matters: Map<string, MatterRow>, staff: Map<string, StaffRow>, invoiceByEntry: Map<string, string>): BillingTimeEntry {
  const flatFee = row.billing_mode === 'flat_fee_billable' || row.billing_mode === 'flat_fee_tracked'
  return {
    id: row.id,
    matterId: row.matter_id,
    date: dateForDisplay(row.entry_date),
    matterNumber: matters.get(row.matter_id)?.matter_number ?? row.matter_id,
    description: row.description,
    activityCategory: row.activity_code || 'General',
    kind: flatFee ? 'Flat Fee Service' : 'Time',
    hours: num(row.hours),
    rate: num(row.rate),
    amount: entryAmount(row),
    billingStatus: billingStatusForUi(row.billing_status),
    staffId: row.user_id,
    staff: staffLabel(staff.get(row.user_id), row.user_id),
    staffCode: staff.get(row.user_id)?.staff_code?.trim() || null,
    internalTimeTracked: row.billing_mode === 'flat_fee_tracked',
    // The invoice's line items are the authoritative attachment; time_entry.invoice_id is a copy older saves missed.
    invoiceId: row.invoice_id || invoiceByEntry.get(row.id) || null,
    bcid: row.bcid || null,
  }
}

function projectInvoice(row: InvoiceRow, client: ClientRow, matters: Map<string, MatterRow>, lines: InvoiceLineRow[]): BillingInvoice {
  const locked = invoiceLocked(row.status)
  return {
    id: row.id,
    matterId: row.matter_id,
    matterNumber: matters.get(row.matter_id)?.matter_number ?? row.matter_id,
    invoiceNumber: row.invoice_number,
    dateInvoiced: dateForDisplay(row.invoice_date),
    dueDate: dateForDisplay(row.due_date),
    clientLabel: client.display_name,
    amountDue: num(row.balance_due, num(row.total_amount)),
    writeOff: -num(row.discount_amount),
    // Tax line (the requester, Nov 16, 2026, API patch 43): the saved tax, for the editor and the invoice documents.
    taxAmount: num(row.tax_amount),
    ivid: row.ivid || null,
    locked,
    ...(locked
      ? { lockedReason: row.status === 'void' ? 'Voided' : num(row.amount_paid) > 0 ? 'Locked · payments attached (detach them before unlocking)' : 'Locked · sent to client' }
      : {}),
    status: invoiceStatusForUi(row.status),
    entryIds: lines.filter((line) => num(line.display_on_invoice, 1) !== 0 && line.time_entry_id).map((line) => line.time_entry_id!),
  }
}

/** "Invoice 324 - Work through 05/01/2025 - sent" (old P33 wording). */
function invoiceLedgerDescription(invoice: InvoiceRow): string {
  const status = invoice.status ? invoice.status.replace(/_/g, ' ') : 'draft'
  return `Invoice ${invoice.invoice_number} - Work through ${dateForDisplay(invoice.invoice_date)} - ${status}`
}

/**
 * Every non-void invoice appears on the statement. An invoice with no `invoice` ledger posting (made before the
 * posting existed, or whose posting failed) gets a read-only row built from the invoice. Nothing is written.
 */
function withSyntheticInvoiceLedger(rows: LedgerEntryRow[], invoices: InvoiceRow[], client: ClientRow): LedgerEntryRow[] {
  const posted = new Set(rows.filter((row) => row.entry_type === 'invoice' && !row.voided_at).map((row) => row.invoice_id))
  const missing = invoices.filter((invoice) => invoice.status !== 'void' && invoice.status !== 'voided' && !posted.has(invoice.id))
  return [
    ...rows,
    ...missing.map((invoice) => ({
      id: `synthetic-invoice-${invoice.id}`,
      invoice_id: invoice.id,
      matter_id: invoice.matter_id,
      client_id: client.id,
      payment_id: null,
      ledger_bucket: 'receivable',
      entry_type: 'invoice',
      entry_direction: 'debit',
      amount: num(invoice.total_amount, num(invoice.subtotal_amount) - num(invoice.discount_amount)),
      entry_date: invoice.invoice_date,
      reference_number: invoice.invoice_number,
      memo: invoiceLedgerDescription(invoice),
      notes: null,
      voided_at: null,
      void_reason: null,
    })),
  ]
}

/**
 * The client register in date order with the running balance. Voided rows are listed but never move the balance.
 * Billing part 7f (audit 5, item 4): each row also carries `matterBalance`, the running balance of its own matter, so the
 * Overview can show one matter's balance (`balance` runs across the whole client, as in the old register).
 * C3 (the requester, Nov 16, 2026, API patch 43): trust rows are left out. The register is the client's receivable
 * account (invoices, payments, write-offs, credits); the trust account keeps its own ledger and balance on the Trust
 * tab. Before, a trust deposit read here as a payment and lowered the balance, and a disbursement raised it, so the
 * two accounts were mixed (plan 06 line 87, audit section 5 item 10). Trust money reaches this register only as a
 * payment posted against an invoice.
 */
function projectLedger(rows: LedgerEntryRow[], matters: Map<string, MatterRow>, invoices: Map<string, InvoiceRow>): BillingLedgerEntry[] {
  let balance = 0
  const matterBalances = new Map<string, number>()
  // C3: the receivable register only; trust rows stay on the Trust tab (the old register listed them here too).
  return rows
    .filter((row) => row.ledger_bucket !== 'trust')
    .sort((a, b) => `${a.entry_date}:${a.id}`.localeCompare(`${b.entry_date}:${b.id}`))
    .map((row) => {
      const voided = Boolean(row.voided_at)
      const isWriteOff = row.entry_type === 'write_off'
      const isCredit = row.entry_direction === 'credit' || ['payment', 'credit', 'retainer_credit', 'opening_balance'].includes(row.entry_type)
      const charges = !isWriteOff && !isCredit ? num(row.amount) : undefined
      const payments = !isWriteOff && isCredit ? num(row.amount) : undefined
      const writeOff = isWriteOff ? -num(row.amount) : undefined
      const change = (charges ?? 0) - (payments ?? 0) + (writeOff ?? 0)
      if (!voided) balance = round(balance + change)
      const matterBalance = round((matterBalances.get(row.matter_id) ?? 0) + (voided ? 0 : change))
      matterBalances.set(row.matter_id, matterBalance)
      const invoice = row.entry_type === 'invoice' && row.invoice_id ? invoices.get(row.invoice_id) : undefined
      return {
        id: row.id,
        invoiceId: row.entry_type === 'invoice' ? row.invoice_id : null,
        paymentId: row.entry_type === 'payment' ? row.payment_id : null,
        date: dateForDisplay(row.entry_date),
        reference: invoice ? invoice.invoice_number : row.reference_number || row.entry_type,
        description: invoice ? invoiceLedgerDescription(invoice) : row.memo || row.notes || row.entry_type,
        ...(charges !== undefined ? { charges } : {}),
        ...(payments !== undefined ? { payments } : {}),
        ...(writeOff !== undefined ? { writeOff } : {}),
        balance,
        matterBalance,
        matterNumber: matters.get(row.matter_id)?.matter_number ?? row.matter_id,
        matterId: row.matter_id,
        editable: !voided && !row.invoice_id && !row.payment_id,
        ...(voided ? { voided: true, voidedAt: row.voided_at, voidReason: row.void_reason || null } : {}),
      }
    })
}

function projectPayment(payment: PaymentRow, ledger: LedgerEntryRow[], invoices: Map<string, InvoiceRow>, matters: Map<string, MatterRow>): BillingPayment {
  const voided = Boolean(payment.voided_at)
  const entries = ledger.filter((entry) => entry.payment_id === payment.id)
  const invoiceId = entries.find((entry) => entry.entry_type === 'payment' && entry.invoice_id)?.invoice_id ?? entries.find((entry) => entry.invoice_id)?.invoice_id ?? null
  const invoice = invoiceId ? invoices.get(invoiceId) : undefined
  return {
    id: payment.id,
    paymentNumber: payment.payment_number || payment.id,
    invoiceId,
    invoiceNumber: invoice?.invoice_number ?? null,
    invoiceIvid: invoice?.ivid ?? null,
    matterId: payment.matter_id || '',
    matterNumber: matters.get(payment.matter_id || '')?.matter_number ?? (payment.matter_id || ''),
    receivedDate: dateForDisplay(payment.received_date),
    amount: num(payment.amount),
    paymentType: paymentTypeLabel(payment.payment_type_lookup_id),
    referenceNumber: payment.reference_number || '',
    memo: payment.memo || '',
    // A voided payment shows the write-off that was reversed with it.
    writeOff: round(entries.filter((entry) => entry.entry_type === 'write_off' && (voided || !entry.voided_at)).reduce((sum, entry) => sum + num(entry.amount), 0)),
    sourceSystem: payment.source_system || null,
    // Decision C2: the money still to apply (a voided payment has none).
    unappliedAmount: voided ? 0 : round(num(payment.unapplied_amount)),
    voided,
    voidedAt: payment.voided_at || null,
    voidReason: payment.void_reason || null,
    refund: payment.refund_provider_id
      ? {
          id: payment.refund_provider_id,
          status: payment.refund_status || null,
          amount: payment.refund_amount ?? null,
          reference: payment.refund_reference || null,
          referenceType: payment.refund_reference_type || null,
          referenceStatus: payment.refund_reference_status || null,
          refundedAt: payment.refunded_at || null,
        }
      : null,
  }
}

function projectTrust(rows: TrustRequestRow[], ledger: LedgerEntryRow[], matters: Map<string, MatterRow>): BillingTrustEntry[] {
  const result: BillingTrustEntry[] = rows.map((row) => ({
    id: row.id,
    date: dateForDisplay(row.request_date),
    reference: 'Trust Request',
    description: `Trust Request ${row.request_number} · ${row.memo || row.status}`,
    fundsReceived: 0,
    fundsDispersed: 0,
    balance: num(row.requested_amount),
    matterNumber: matters.get(row.matter_id)?.matter_number ?? row.matter_id,
    matterId: row.matter_id,
    trustRequestNumber: row.request_number,
  }))
  const balances = new Map<string, number>()
  const trustRows = ledger.filter((entry) => entry.ledger_bucket === 'trust' && !entry.voided_at).sort((a, b) => `${a.entry_date}:${a.id}`.localeCompare(`${b.entry_date}:${b.id}`))
  for (const row of trustRows) {
    const received = row.entry_type === 'trust_deposit' ? num(row.amount) : 0
    const dispersed = row.entry_type === 'trust_disbursement' ? num(row.amount) : 0
    const balance = round((balances.get(row.matter_id) ?? 0) + received - dispersed)
    balances.set(row.matter_id, balance)
    result.push({
      id: row.id,
      date: dateForDisplay(row.entry_date),
      reference: received ? 'Trust Payment Received' : 'Disbursement',
      description: row.memo || row.entry_type,
      fundsReceived: received,
      fundsDispersed: dispersed,
      balance,
      matterNumber: matters.get(row.matter_id)?.matter_number ?? row.matter_id,
      matterId: row.matter_id,
      ...(row.reference_number ? { trustRequestNumber: row.reference_number } : {}),
    })
  }
  return result
}

/**
 * One client's whole billing record: matters, time and fees, invoices, payments, the register, trust and the
 * account totals. With `matterId`, only that matter (the client list and totals stay whole).
 */
export async function loadBillingRecord(queries: BillingQueries, clientId: string, matterId: string | null): Promise<Omit<BillingRecord, 'viewer'>> {
  const client = await requireClient(queries, clientId)
  const matters = await loadMatters(queries, client, matterId)
  const matterIds = matters.map((matter) => matter.id)
  const [timeEntries, allInvoices, allPayments, ledger, trustRequests, staff, totals, ratesJson] = await Promise.all([
    queries.timeEntriesOfMatters(matterIds),
    queries.invoicesOfClient(client.id),
    queries.paymentsOfClient(client.id),
    queries.ledgerOfClient(client.id, matterIds),
    queries.trustRequestsOfClient(client.id),
    queries.staff(),
    queries.accountTotals(client.id),
    queries.billingRates(),
  ])
  // FB-0008: the active rate classes, and each person's default, for a new time entry's rate.
  const rates = readBillingRateSchedule(ratesJson)
  const inScope = (id: string | null) => !matterId || id === matterId
  const invoices = allInvoices.filter((invoice) => inScope(invoice.matter_id))
  const payments = allPayments.filter((payment) => !matterId || payment.matter_id === matterId)
  const scopedLedger = ledger.filter((row) => inScope(row.matter_id))
  const allLedger = withSyntheticInvoiceLedger(scopedLedger, invoices, client)
  const lines = await queries.linesOfInvoices(invoices.map((invoice) => invoice.id))

  const matterMap = new Map(matters.map((matter) => [matter.id, matter]))
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const staffMap = new Map(staff.map((row) => [row.id, row]))
  const invoiceByEntry = new Map<string, string>()
  for (const line of lines) {
    if (!line.time_entry_id || num(line.display_on_invoice, 1) === 0) continue
    if (invoiceMap.get(line.invoice_id)?.status === 'void') continue
    invoiceByEntry.set(line.time_entry_id, line.invoice_id)
  }

  return {
    client: { id: client.id, clientNumber: client.client_number, displayName: client.display_name },
    matters: matters.map((matter) => ({ id: matter.id, matterNumber: matter.matter_number, title: matter.title })),
    timeEntries: timeEntries.map((row) => projectTimeEntry(row, matterMap, staffMap, invoiceByEntry)),
    invoices: invoices.map((row) => projectInvoice(row, client, matterMap, lines.filter((line) => line.invoice_id === row.id))),
    payments: payments.map((payment) => projectPayment(payment, allLedger, invoiceMap, matterMap)),
    ledgerEntries: projectLedger(allLedger, matterMap, invoiceMap),
    trustEntries: projectTrust(trustRequests.filter((row) => inScope(row.matter_id)), allLedger, matterMap),
    staffOptions: staff
      .filter((row) => row.account_status !== 'deactivated' && row.is_active !== 0)
      .map((row) => ({ id: row.id, label: staffLabel(row, row.id), staffCode: row.staff_code?.trim() || null, defaultRateClassId: rates.defaults[row.id] ?? null })),
    rateClasses: rates.classes.filter((item) => item.active),
    accountTotals: {
      openInvoiceBalance: round(num(totals.open_balance)),
      openInvoiceCount: num(totals.open_count),
      receivableDebits: round(num(totals.receivable_debits)),
      receivableCredits: round(num(totals.receivable_credits)),
      trustCredits: round(num(totals.trust_credits)),
      trustDebits: round(num(totals.trust_debits)),
      trustBalance: round(num(totals.trust_credits) - num(totals.trust_debits)),
      unappliedPayments: round(num(totals.unapplied)),
    },
  }
}

// ----------------------------------------------------------------------------------------------------------
// Writes

/** Audit helper: one entry per changed row, resource `billing`. */
function auditor(queries: BillingQueries, actor: Actor, clientId: string) {
  return (action: string, targetTable: string, targetId: string, matterId: string | null, newJson?: unknown) =>
    queries.audit({
      requestId: actor.requestId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      resource: 'billing',
      action,
      targetTable,
      targetId,
      clientId,
      matterId,
      newJson,
    })
}

/** Runs a batch whose insert carries a fresh public code; a code clash makes a new code and runs it again. */
async function runWithPublicCode(queries: BillingQueries, table: 'time_entry' | 'invoice', column: 'bcid' | 'ivid', build: (code: string) => D1PreparedStatement[]): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const code = generatePublicCode()
    try {
      await queries.run(build(code))
      return code
    } catch (error) {
      if (!isUniqueClash(error, table, column) || attempt >= PUBLIC_CODE_MAX_ATTEMPTS) throw error
    }
  }
}

function timeEntryValues(body: TimeEntryBody, actor: Actor, now: string, current?: TimeEntryRow): Parameters<BillingQueries['insertTimeEntry']>[2] {
  const flatFee = body.kind === 'Flat Fee Service'
  const tracked = Boolean(body.internalTimeTracked)
  const hours = Math.max(0, body.hours)
  const rate = Math.max(0, body.rate)
  // Old rule: a time entry's amount is what the editor computed (hours × rate there), never negative.
  const amount = Math.max(0, num(body.amount, flatFee ? 0 : hours * rate))
  return {
    matterId: body.matterId,
    userId: body.staffId || current?.user_id || actor.userId,
    activityCode: body.activityCategory?.trim() || current?.activity_code || (current ? 'General' : null),
    activityDescription: body.description || null,
    entryDate: dateForDatabase(body.date, current?.entry_date ?? now),
    // A flat fee carries no hours unless the time is tracked internally.
    hours: flatFee && !tracked ? 0 : hours,
    rate,
    amount,
    billingMode: flatFee ? (tracked ? 'flat_fee_tracked' : 'flat_fee_billable') : 'hourly_billable',
    billingStatus: billingStatusForDatabase(body.billingStatus),
    feeArrangement: flatFee ? 'flat_fee' : 'hourly',
    description: body.description.trim() || current?.description || 'Billing entry',
    now,
  }
}

export async function createTimeEntry(queries: BillingQueries, clientId: string, body: TimeEntryBody, actor: Actor): Promise<string> {
  const client = await requireClient(queries, clientId)
  await requireClientMatter(queries, body.matterId, client)
  const now = new Date().toISOString()
  const id = newId('time')
  const values = timeEntryValues(body, actor, now)
  const audit = auditor(queries, actor, client.id)
  await runWithPublicCode(queries, 'time_entry', 'bcid', (bcid) => [queries.insertTimeEntry(id, bcid, values), audit('CREATE', 'time_entry', id, values.matterId, { ...values, bcid })])
  return id
}

/** The invoice a time entry is on: `time_entry.invoice_id`, or a visible line item listing it. */
async function attachedInvoiceOf(queries: BillingQueries, entry: TimeEntryRow): Promise<InvoiceRow | null> {
  let invoiceId = entry.invoice_id
  if (!invoiceId) invoiceId = (await queries.visibleLinesOfTimeEntry(entry.id))[0]?.invoice_id ?? null
  return invoiceId ? queries.invoiceById(invoiceId) : null
}

async function requireClientTimeEntry(queries: BillingQueries, client: ClientRow, entryId: string): Promise<TimeEntryRow> {
  const entry = await queries.timeEntryById(entryId)
  if (!entry || !(await matterBelongsToClient(queries, entry.matter_id, client))) throw new BillingError('VALIDATION_TIME_ENTRY_NOT_FOUND', 404, 'No such time entry for this client.')
  return entry
}

export async function updateTimeEntry(queries: BillingQueries, clientId: string, entryId: string, body: TimeEntryBody, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientTimeEntry(queries, client, entryId)
  const invoice = await attachedInvoiceOf(queries, current)
  if (invoice && invoice.status !== 'void' && invoiceLocked(invoice.status)) throw new BillingError('VALIDATION_BILLED_TIME_ENTRY_LOCKED', 409, 'This entry is on a locked invoice.')
  await requireClientMatter(queries, body.matterId, client)
  const now = new Date().toISOString()
  const values = timeEntryValues(body, actor, now, current)
  const audit = auditor(queries, actor, client.id)
  await queries.run([queries.updateTimeEntry(entryId, values), audit('UPDATE', 'time_entry', entryId, values.matterId, values)])
}

/** Only unbilled entries may be deleted; posted accounting records stay. */
export async function deleteTimeEntry(queries: BillingQueries, clientId: string, entryId: string, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientTimeEntry(queries, client, entryId)
  if (current.invoice_id || current.is_billed) throw new BillingError('VALIDATION_BILLED_TIME_ENTRY_LOCKED', 409, 'A billed entry cannot be deleted.')
  const audit = auditor(queries, actor, client.id)
  await queries.run([queries.deleteTimeEntry(entryId), audit('DELETE', 'time_entry', entryId, current.matter_id, { description: current.description, amount: entryAmount(current) })])
}

/**
 * The statements that put `entries` on the invoice: lines upserted by time entry (lines are never deleted; a removed
 * entry's line is hidden with zero amounts), entries marked billed, and the invoice's ledger posting created or
 * resized (old `syncInvoiceLines`).
 */
async function invoiceLineStatements(
  queries: BillingQueries,
  invoiceId: string,
  matterId: string,
  client: ClientRow,
  entries: TimeEntryRow[],
  total: number,
  subtotal: number,
  actor: Actor,
  now: string,
  isNew: boolean,
): Promise<D1PreparedStatement[]> {
  const audit = auditor(queries, actor, client.id)
  const statements: D1PreparedStatement[] = []
  const existingLines = isNew ? [] : await queries.linesOfInvoice(invoiceId)
  const keep = new Set(entries.map((entry) => entry.id))
  const hide = existingLines.filter((line) => !line.time_entry_id || !keep.has(line.time_entry_id)).map((line) => line.id)
  if (hide.length) statements.push(queries.hideInvoiceLines(hide, true, now), audit('UPDATE', 'invoice_line_item', invoiceId, matterId, { hidden: hide }))
  entries.forEach((entry, index) => {
    const flatFee = entry.billing_mode.startsWith('flat_fee')
    const amount = entryAmount(entry)
    const values = {
      invoiceId,
      matterId,
      timeEntryId: entry.id,
      lineType: flatFee ? ('flat_fee' as const) : ('time' as const),
      activityCode: entry.activity_code || null,
      description: entry.description,
      quantity: flatFee ? 1 : num(entry.hours),
      unitRate: num(entry.rate),
      amount,
      sortOrder: index,
      now,
    }
    const existing = existingLines.find((line) => line.time_entry_id === entry.id)
    const lineId = existing?.id ?? newId('invl')
    statements.push(existing ? queries.updateInvoiceLine(lineId, values) : queries.insertInvoiceLine(lineId, values))
    statements.push(queries.markTimeEntryBilled(entry.id, invoiceId, now))
  })
  if (entries.length) statements.push(audit('UPDATE', 'time_entry', invoiceId, matterId, { billedOnInvoice: entries.map((entry) => entry.id) }))
  const posting = isNew ? undefined : (await queries.ledgerOfInvoice(invoiceId)).find((row) => row.entry_type === 'invoice' && !row.voided_at)
  if (posting) {
    statements.push(queries.setLedgerAmount(posting.id, total), audit('UPDATE', 'ledger_entry', posting.id, matterId, { amount: total }))
  } else {
    const ledgerId = newId('led')
    statements.push(
      queries.insertLedgerEntry({
        id: ledgerId,
        invoiceId,
        matterId,
        clientId: client.id,
        paymentId: null,
        bucket: 'receivable',
        entryType: 'invoice',
        direction: 'debit',
        paymentTypeLookupId: null,
        amount: total,
        amountExTax: subtotal,
        entryDate: now.slice(0, 10),
        referenceNumber: invoiceId,
        memo: `Invoice ${invoiceId}`,
        createdByUserId: actor.userId,
        now,
      }),
      audit('CREATE', 'ledger_entry', ledgerId, matterId, { invoiceId, amount: total }),
    )
  }
  return statements
}

async function invoiceEntries(queries: BillingQueries, body: InvoiceBody, invoiceId: string | null): Promise<TimeEntryRow[]> {
  const entries = await queries.timeEntriesByIds([...new Set(body.entryIds)])
  if (entries.length !== new Set(body.entryIds).size) throw new BillingError('VALIDATION_INVOICE_ENTRY_MISMATCH', 422, 'An entry on the invoice was not found.')
  if (entries.some((entry) => entry.matter_id !== body.matterId || (entry.invoice_id && entry.invoice_id !== invoiceId))) {
    throw new BillingError('VALIDATION_INVOICE_ENTRY_MISMATCH', 422, 'Every entry must belong to the invoice\'s matter and not be on another invoice.')
  }
  // Keep the order the person chose.
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return [...new Set(body.entryIds)].map((id) => byId.get(id)!)
}

/** Creates a draft invoice with its lines and ledger posting. Two saves racing to one number: the second steps forward. */
export async function createInvoice(queries: BillingQueries, clientId: string, body: InvoiceBody, actor: Actor): Promise<{ id: string; invoiceNumber: string }> {
  const client = await requireClient(queries, clientId)
  await requireClientMatter(queries, body.matterId, client)
  const entries = await invoiceEntries(queries, body, null)
  const subtotal = round(entries.reduce((sum, entry) => sum + entryAmount(entry), 0))
  const writeOff = Math.abs(Math.min(0, body.writeOff))
  // Part 7f (audit 5, item 1): tax and notes are taken again, as the old create did (tax 0 and no notes when left out).
  const tax = round(body.taxAmount ?? 0)
  const notes = body.notes?.trim() || null
  const total = Math.max(0, round(subtotal + tax - writeOff))
  const now = new Date().toISOString()
  const invoiceDate = dateForDatabase(body.invoiceDate, now)
  const id = newId('inv')
  const requested = body.invoiceNumber?.trim()
  let invoiceNumber = requested || String((await queries.highestInvoiceNumber()) + 1)
  const lineStatements = await invoiceLineStatements(queries, id, body.matterId, client, entries, total, subtotal, actor, now, true)
  const audit = auditor(queries, actor, client.id)

  for (let attempt = 1; ; attempt += 1) {
    try {
      await runWithPublicCode(queries, 'invoice', 'ivid', (ivid) => [
        queries.insertInvoice({ id, ivid, matterId: body.matterId, clientId: client.id, invoiceNumber, invoiceDate, dueDate: dateForDatabase(body.dueDate, invoiceDate), subtotal, discount: writeOff, tax, total, notes, now }),
        audit('CREATE', 'invoice', id, body.matterId, { invoiceNumber, ivid, subtotal, writeOff, tax, total, entryIds: entries.map((entry) => entry.id) }),
        ...lineStatements,
      ])
      return { id, invoiceNumber }
    } catch (error) {
      if (!isUniqueClash(error, 'invoice', 'invoice_number')) throw error
      if (requested) throw new BillingError('VALIDATION_INVOICE_NUMBER_TAKEN', 409, `Invoice number ${invoiceNumber} is already used.`)
      if (attempt >= 5) throw error
      invoiceNumber = String(Number(invoiceNumber) + 1)
    }
  }
}

async function requireClientInvoice(queries: BillingQueries, client: ClientRow, invoiceId: string): Promise<InvoiceRow> {
  const invoice = await queries.invoiceById(invoiceId)
  if (!invoice || invoice.billed_to_client_id !== client.id) throw new BillingError('VALIDATION_INVOICE_NOT_FOUND', 404, 'No such invoice for this client.')
  return invoice
}

/** Saves a draft invoice: header, lines, released entries and the ledger posting. A locked invoice is refused. */
export async function updateInvoice(queries: BillingQueries, clientId: string, invoiceId: string, body: InvoiceBody, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientInvoice(queries, client, invoiceId)
  if (invoiceLocked(current.status)) throw new BillingError('VALIDATION_LOCKED_INVOICE', 409, 'This invoice is locked.')
  await requireClientMatter(queries, body.matterId, client)
  const entries = await invoiceEntries(queries, body, invoiceId)
  const subtotal = round(entries.reduce((sum, entry) => sum + entryAmount(entry), 0))
  const writeOff = Math.abs(Math.min(0, body.writeOff))
  // Part 7f (audit 5, item 1): a save may change the tax and the notes; left out, the saved ones stay. The old save
  // counted a new tax in the total but never stored it; it is stored now. An empty notes text clears them.
  const tax = body.taxAmount === undefined ? num(current.tax_amount) : round(body.taxAmount)
  const notes = body.notes === undefined ? current.notes : body.notes.trim() || null
  const total = Math.max(0, round(subtotal + tax - writeOff))
  const now = new Date().toISOString()
  const invoiceDate = dateForDatabase(body.invoiceDate, current.invoice_date)
  const previous = await queries.timeEntriesOfInvoice(invoiceId)
  const released = previous.filter((entry) => !body.entryIds.includes(entry.id)).map((entry) => entry.id)
  const audit = auditor(queries, actor, client.id)
  const statements = [
    queries.updateInvoiceDraft(invoiceId, {
      matterId: body.matterId,
      invoiceDate,
      dueDate: dateForDatabase(body.dueDate, current.due_date || invoiceDate),
      subtotal,
      discount: writeOff,
      tax,
      total,
      balance: Math.max(0, round(total - num(current.amount_paid))),
      notes,
      now,
    }),
    audit('UPDATE', 'invoice', invoiceId, body.matterId, { subtotal, writeOff, tax, total, ...(body.notes !== undefined ? { notesChanged: true } : {}), entryIds: entries.map((entry) => entry.id) }),
    ...(released.length ? [queries.releaseTimeEntries(released, now), audit('UPDATE', 'time_entry', invoiceId, body.matterId, { releasedFromInvoice: released })] : []),
    ...(await invoiceLineStatements(queries, invoiceId, body.matterId, client, entries, total, subtotal, actor, now, false)),
  ]
  await queries.run(statements)
}

/** Payment and write-off ledger rows still attached to the invoice. */
async function attachedPaymentRows(queries: BillingQueries, invoiceId: string): Promise<LedgerEntryRow[]> {
  return (await queries.ledgerOfInvoice(invoiceId)).filter((row) => !row.voided_at && (row.entry_type === 'payment' || row.entry_type === 'write_off' || Boolean(row.payment_id)))
}

/** draft → sent. Any billing role. */
export async function lockInvoice(queries: BillingQueries, clientId: string, invoiceId: string, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientInvoice(queries, client, invoiceId)
  if (current.status !== 'draft') throw new BillingError('VALIDATION_INVOICE_ALREADY_LOCKED', 409, 'This invoice is already locked.')
  const now = new Date().toISOString()
  await queries.run([queries.setInvoiceStatus(invoiceId, 'sent', now), auditor(queries, actor, client.id)('LOCK', 'invoice', invoiceId, current.matter_id, { status: 'sent' })])
}

/** sent → draft. Super admin; refused while payments are attached (detach them first). */
export async function unlockInvoice(queries: BillingQueries, clientId: string, invoiceId: string, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientInvoice(queries, client, invoiceId)
  if ((await attachedPaymentRows(queries, invoiceId)).length || num(current.amount_paid) > 0) throw new BillingError('VALIDATION_INVOICE_HAS_PAYMENTS', 409, 'Detach the payments before unlocking.')
  if (current.status === 'draft') throw new BillingError('VALIDATION_INVOICE_NOT_LOCKED', 409, 'This invoice is not locked.')
  if (current.status === 'void') throw new BillingError('VALIDATION_INVOICE_VOID', 409, 'A void invoice cannot be unlocked.')
  const now = new Date().toISOString()
  await queries.run([queries.setInvoiceStatus(invoiceId, 'draft', now), auditor(queries, actor, client.id)('UNLOCK', 'invoice', invoiceId, current.matter_id, { from: current.status })])
}

/** True for an application that no longer pays its invoice: voided with its payment, or detached from the invoice. */
export const isClosedApplication = (row: { notes: string | null }) => /\b(VOIDED|DETACHED) /.test(row.notes ?? '')

/**
 * Unlinks every payment and write-off ledger row from the invoice (the payments stay on the client's register) and
 * resets what was paid. Super admin. Usually followed by unlock.
 *
 * The money goes back to unapplied (the requester, Nov 16, 2026; new, the old app left it stuck): each live payment's
 * `unapplied_amount` goes up by the receivable credits detached from it, and its applications to this invoice are
 * marked `DETACHED`, so "Apply to invoice" (`applyUnappliedPayment`) can attach the money again once the invoice is
 * corrected and finalized, and a later void of the payment no longer touches this invoice. The detached credits stay
 * on the register as they are (dated the day the money came in), so the client's balance does not change. A legacy
 * payment row with no payment record stays on the register only.
 */
export async function detachInvoicePayments(queries: BillingQueries, clientId: string, invoiceId: string, actor: Actor): Promise<number> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientInvoice(queries, client, invoiceId)
  const attached = await attachedPaymentRows(queries, invoiceId)
  if (!attached.length && num(current.amount_paid) === 0) throw new BillingError('VALIDATION_INVOICE_HAS_NO_PAYMENTS', 409, 'No payments are attached to this invoice.')
  const now = new Date().toISOString()
  const status = current.status === 'draft' ? 'draft' : 'sent'
  const total = num(current.total_amount)
  const audit = auditor(queries, actor, client.id)

  // The money each payment gets back as unapplied: its receivable payment credits on this invoice, in whole cents.
  const returnedCents = new Map<string, number>()
  for (const row of attached) {
    if (!row.payment_id || row.entry_type !== 'payment' || row.entry_direction !== 'credit' || row.ledger_bucket !== 'receivable') continue
    returnedCents.set(row.payment_id, (returnedCents.get(row.payment_id) ?? 0) + cents(num(row.amount)))
  }
  const unapplied: D1PreparedStatement[] = []
  const returned: Array<{ paymentId: string; amount: number; applications: string[] }> = []
  for (const [paymentId, amountCents] of returnedCents) {
    const payment = await queries.paymentById(paymentId)
    if (!payment || payment.voided_at || amountCents <= 0) continue
    const applications = (await queries.applicationsOfPayment(paymentId)).filter((row) => row.invoice_id === invoiceId && !isClosedApplication(row)).map((row) => row.id)
    const unappliedAfter = round(num(payment.unapplied_amount) + amountCents / 100)
    unapplied.push(queries.setPaymentUnapplied(paymentId, unappliedAfter, now))
    if (applications.length) unapplied.push(queries.noteApplications(applications, `DETACHED ${now}: from invoice ${current.invoice_number} by ${actor.email}`, now))
    returned.push({ paymentId, amount: amountCents / 100, applications })
  }

  await queries.run([
    ...attached.map((row) => queries.detachLedgerEntry(row.id, `${row.memo || row.entry_type} (detached from invoice ${current.invoice_number} by ${actor.email})`)),
    ...unapplied,
    queries.setInvoicePayments(invoiceId, { amountPaid: 0, discount: num(current.discount_amount), total, balance: total, status, paidAt: null, now }),
    audit('DETACH_PAYMENTS', 'invoice', invoiceId, current.matter_id, { detached: attached.map((row) => row.id), returnedToUnapplied: returned }),
  ])
  logLine('BILLING:detach-payments', actor.requestId, { invoice: current.invoice_number, rows: attached.length, payments: returned.length })
  return attached.length
}

/**
 * Voids the invoice as a record: its entries return to billable, its lines are hidden, its ledger posting is voided.
 * Super admin; refused while payments are attached. Stored sent copies are kept. Its open pay links are revoked by the
 * route after this batch (Billing part 7d, `pay-links/rules.ts` `revokeInvoicePayLinks`), because revoking calls Stripe.
 */
export async function voidInvoice(queries: BillingQueries, clientId: string, invoiceId: string, reason: string | undefined, actor: Actor): Promise<number> {
  const client = await requireClient(queries, clientId)
  const current = await requireClientInvoice(queries, client, invoiceId)
  if ((await attachedPaymentRows(queries, invoiceId)).length || num(current.amount_paid) > 0) throw new BillingError('VALIDATION_INVOICE_HAS_PAYMENTS', 409, 'Detach the payments before voiding.')
  if (current.status === 'void') throw new BillingError('VALIDATION_INVOICE_ALREADY_VOID', 409, 'This invoice is already void.')
  const [lines, linked, ledger] = await Promise.all([queries.linesOfInvoice(invoiceId), queries.timeEntriesOfInvoice(invoiceId), queries.ledgerOfInvoice(invoiceId)])
  // Every entry: those pointing at the invoice, plus any listed only by a visible line item (older saves). Hidden
  // lines are skipped: their entries already left the invoice and may be on another one now (the old code released
  // them too).
  const listed = lines.filter((line) => num(line.display_on_invoice, 1) !== 0).map((line) => line.time_entry_id)
  const entryIds = [...new Set([...linked.map((entry) => entry.id), ...listed.filter((id): id is string => Boolean(id))])]
  const postings = ledger.filter((row) => row.entry_type === 'invoice' && !row.voided_at).map((row) => row.id)
  const now = new Date().toISOString()
  const note = `${current.notes ? `${current.notes}\n` : ''}Voided ${now} by ${actor.email}${reason?.trim() ? `: ${reason.trim()}` : ''}`
  const audit = auditor(queries, actor, client.id)
  await queries.run([
    ...(entryIds.length ? [queries.releaseTimeEntries(entryIds, now)] : []),
    ...(lines.length ? [queries.hideInvoiceLines(lines.map((line) => line.id), false, now)] : []),
    ...(postings.length ? [queries.voidLedgerEntries(postings, actor.userId, `Invoice ${current.invoice_number} voided by ${actor.email}`, now)] : []),
    queries.voidInvoice(invoiceId, note, now),
    audit('VOID', 'invoice', invoiceId, current.matter_id, { reason: reason ?? null, entriesReleased: entryIds, postingsVoided: postings }),
  ])
  return entryIds.length
}

/**
 * Posts a payment: the payment, its receivable ledger credit per invoice, the payment applications, an optional
 * write-off (one invoice only), and each invoice's new balance and status. Old `createPayment`.
 *
 * Stripe card payments (`body.stripePaymentIntentId`, part 7e): the PaymentIntent is re-read from Stripe
 * (`stripe.verify`) and must have succeeded for these invoices and this amount before anything is written. A
 * PaymentIntent already recorded returns the existing payment id (safe retry). The payment and its ledger credits carry
 * `source_system = stripe_<environment>` and `source_record_id = pi_…`. Card and ACH selections require a PaymentIntent;
 * ACH posting stays closed until its mandate and asynchronous status reconciliation exist.
 *
 * A draft invoice is refused (`VALIDATION_INVOICE_IS_DRAFT`, the requester, Nov 16, 2026): finalize it first.
 *
 * @throws BillingError the `VALIDATION_…` codes of the route; `stripe.verify`'s `CardPaymentError`.
 */
export async function createPayment(queries: BillingQueries, clientId: string, body: PaymentBody, actor: Actor, stripe?: PaymentStripe | null): Promise<string> {
  const client = await requireClient(queries, clientId)
  const amount = round(body.amount)
  const writeOff = round(Math.max(0, body.writeOff ?? 0))
  const requested = body.invoiceAllocations
  if (new Set(requested.map((allocation) => allocation.invoiceId)).size !== requested.length) throw new BillingError('VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE', 422)
  if (writeOff > 0 && requested.length > 1) throw new BillingError('VALIDATION_PAYMENT_WRITE_OFF_REQUIRES_SINGLE_INVOICE', 422)
  const invoiceRows = new Map((await queries.invoicesByIds(requested.map((allocation) => allocation.invoiceId))).map((row) => [row.id, row]))
  const allocations = requested.map((allocation) => {
    const invoice = invoiceRows.get(allocation.invoiceId)
    if (!invoice || invoice.billed_to_client_id !== client.id) throw new BillingError('VALIDATION_PAYMENT_INVOICE_NOT_FOUND', 422)
    if (invoice.status === 'void') throw new BillingError('VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT', 422)
    // Decision of the requester (Nov 16, 2026): a payment attaches only to a finalized (locked) invoice, never a draft.
    if (invoice.status === 'draft') throw new BillingError('VALIDATION_INVOICE_IS_DRAFT', 422, `Invoice ${invoice.invoice_number} is a draft. Finalize it before attaching a payment.`)
    if (allocation.amount + (requested.length === 1 ? writeOff : 0) > Math.max(0, num(invoice.balance_due)) + 0.005) throw new BillingError('VALIDATION_PAYMENT_EXCEEDS_BALANCE', 422)
    return { invoice, amount: round(allocation.amount) }
  })
  if (allocations.length && Math.abs(allocations.reduce((sum, item) => sum + item.amount, 0) - amount) > 0.005) throw new BillingError('VALIDATION_PAYMENT_ALLOCATION_TOTAL', 422)
  const matterIds = [...new Set(allocations.map((allocation) => allocation.invoice.matter_id))]
  const matterId = body.matterId || (matterIds.length === 1 ? matterIds[0]! : '')
  if (!matterId && !allocations.length) throw new BillingError('VALIDATION_MISSING_MATTER_ID', 422, 'Choose a matter for a payment not applied to an invoice.')
  if (matterId) await requireClientMatter(queries, matterId, client)

  const requiresStripeIntent = body.paymentType === 'Credit card' || body.paymentType === 'ACH'
  const stripePaymentIntentId = body.stripePaymentIntentId?.trim() || ''
  if (requiresStripeIntent && !stripePaymentIntentId) throw new BillingError('VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED', 422, 'A card payment is posted with the Stripe payment it was charged with.')
  if (body.paymentType === 'ACH' && stripePaymentIntentId) throw new BillingError('VALIDATION_STRIPE_ACH_NOT_IMPLEMENTED', 422, 'Stripe ACH debit is not enabled yet. No ACH payment was posted.')
  if (stripePaymentIntentId && body.paymentType !== 'Credit card') throw new BillingError('VALIDATION_STRIPE_PAYMENT_TYPE_MISMATCH', 422, 'Only a credit-card payment carries a Stripe payment.')

  // Stripe card payment: verify with Stripe before posting anything.
  let sourceSystem: string | null = null
  let sourceRecordId: string | null = null
  let referenceNumber = body.referenceNumber?.trim() || null
  let memo = body.memo?.trim() || null
  if (stripePaymentIntentId) {
    if (!allocations.length) throw new BillingError('VALIDATION_STRIPE_PAYMENT_REQUIRES_INVOICE', 422, 'A card payment is applied to at least one invoice.')
    const recorded = await queries.activePaymentForIntent(stripePaymentIntentId)
    if (recorded) {
      logLine('BILLING:stripe-already-recorded', actor.requestId, { pi: stripePaymentIntentId, payment: recorded.id })
      return recorded.id
    }
    if (!stripe) throw new BillingError('STRIPE_NOT_AVAILABLE', 422, 'Stripe is not available on this server.')
    const environment = stripe.environmentFor(body.stripeEnvironment)
    const verified = await stripe.verify(environment, stripePaymentIntentId, {
      invoiceAllocations: allocations.map((allocation) => ({ invoiceId: allocation.invoice.id, amountCents: Math.round(allocation.amount * 100) })),
      amountCents: Math.round(amount * 100),
    })
    sourceSystem = `${STRIPE_SOURCE_PREFIX}${environment}`
    sourceRecordId = stripePaymentIntentId
    referenceNumber = stripePaymentIntentId
    const cardLabel = verified.cardBrand ? `${verified.cardBrand} •••• ${verified.cardLast4 ?? ''}`.trim() : 'Card'
    memo = [`Stripe ${environment} · ${cardLabel}`, memo].filter(Boolean).join(' · ')
  }

  const now = new Date().toISOString()
  const receivedDate = dateForDatabase(body.receivedDate, now)
  const paymentId = newId('pay')
  const paymentTypeLookupId = PAYMENT_TYPE_LOOKUP_IDS[body.paymentType]
  const audit = auditor(queries, actor, client.id)
  const statements: D1PreparedStatement[] = [
    queries.insertPayment({
      id: paymentId,
      paymentNumber: body.paymentNumber?.trim() || `PAY-${Date.now()}`,
      matterId: matterId || null,
      clientId: client.id,
      receivedDate,
      amount,
      unappliedAmount: allocations.length ? 0 : amount,
      paymentTypeLookupId,
      referenceNumber,
      memo,
      sourceSystem,
      sourceRecordId,
      userId: actor.userId,
      now,
    }),
    audit('CREATE', 'payment', paymentId, matterId || null, { amount, writeOff, paymentType: body.paymentType, allocations: allocations.map((item) => ({ invoiceId: item.invoice.id, amount: item.amount })), ...(sourceRecordId ? { sourceSystem, sourceRecordId } : {}) }),
  ]
  const ledgerAllocations = allocations.length ? allocations : [{ invoice: null, amount }]
  for (const allocation of ledgerAllocations) {
    const invoice = allocation.invoice
    const entryMatterId = invoice?.matter_id ?? matterId
    statements.push(
      queries.insertLedgerEntry({
        id: newId('led'),
        invoiceId: invoice?.id ?? null,
        matterId: entryMatterId,
        clientId: client.id,
        paymentId,
        bucket: 'receivable',
        entryType: 'payment',
        direction: 'credit',
        paymentTypeLookupId,
        amount: allocation.amount,
        amountExTax: null,
        entryDate: receivedDate,
        referenceNumber: referenceNumber || paymentId,
        memo: memo || `Payment ${paymentId}`,
        sourceSystem,
        sourceRecordId,
        createdByUserId: actor.userId,
        now,
      }),
    )
    if (!invoice) continue
    const amountPaid = round(num(invoice.amount_paid) + allocation.amount)
    const discount = round(num(invoice.discount_amount) + writeOff)
    const total = Math.max(0, round(num(invoice.subtotal_amount) + num(invoice.tax_amount) - discount))
    const balance = Math.max(0, round(total - amountPaid))
    const status = balance === 0 ? 'paid' : amountPaid > 0 ? 'partially_paid' : invoice.status
    statements.push(
      queries.setInvoicePayments(invoice.id, { amountPaid, discount, total, balance, status, paidAt: balance === 0 ? now : null, now }),
      queries.insertPaymentApplication(newId('paya'), { paymentId, invoiceId: invoice.id, matterId: invoice.matter_id, amount: allocation.amount, appliedDate: receivedDate, notes: memo, userId: actor.userId, now }),
      audit('UPDATE', 'invoice', invoice.id, invoice.matter_id, { amountPaid, discount, total, balance, status }),
    )
    if (writeOff > 0) {
      statements.push(
        queries.insertLedgerEntry({
          id: newId('led'),
          invoiceId: invoice.id,
          matterId: invoice.matter_id,
          clientId: client.id,
          paymentId,
          bucket: 'receivable',
          entryType: 'write_off',
          direction: 'credit',
          paymentTypeLookupId: null,
          amount: writeOff,
          amountExTax: null,
          entryDate: receivedDate,
          referenceNumber: invoice.invoice_number,
          memo: 'Approved write-off recorded with payment',
          createdByUserId: actor.userId,
          now,
        }),
      )
    }
  }
  try {
    await queries.run(statements)
  } catch (error) {
    // Another post recorded the same PaymentIntent a moment ago (`ux_payment_source_record_active`): answer its payment.
    const other = sourceRecordId ? await queries.activePaymentForIntent(sourceRecordId).catch(() => null) : null
    if (other) {
      logLine('BILLING:stripe-recorded-elsewhere', actor.requestId, { pi: sourceRecordId, payment: other.id })
      return other.id
    }
    throw error
  }
  return paymentId
}

/** `stripe_live` → live; any other Stripe source → sandbox (old `stripeEnvironmentOf`). */
function stripeEnvironmentOf(source: string): 'sandbox' | 'live' {
  return source === `${STRIPE_SOURCE_PREFIX}live` ? 'live' : 'sandbox'
}

/** A refund as the record shows it (`BillingPaymentRefund`). */
function refundProjection(refund: StripeRefundDetails, refundedAt: string | null): NonNullable<BillingPayment['refund']> {
  return { id: refund.refundId, status: refund.status, amount: refund.amount, reference: refund.reference, referenceType: refund.referenceType, referenceStatus: refund.referenceStatus, refundedAt }
}

/**
 * Voids a payment (super admin): every ledger row carrying it is voided, each invoice it paid gets its paid amount and
 * write-off reduced and its status moved back, the applications are marked, and the payment row is voided. One batch,
 * so a retry never reduces an invoice twice.
 *
 * Stripe card payments (`source_system` `stripe_sandbox` / `stripe_live`, part 7e) are refunded in full first, in the
 * payment's own environment, when `refund` is true; a failed refund stops the void so KR Homebase never shows a payment
 * as voided while the card stays charged. The refund is recorded on the payment row in the same batch. When the refund
 * worked but the batch failed, the answer is `PAYMENT_VOID_DATABASE_SYNC_FAILED` (502); a retry reuses the refund.
 *
 * @returns The invoices updated, and the refund made (or found) for a card payment.
 */
export async function voidPayment(
  queries: BillingQueries,
  clientId: string,
  paymentId: string,
  reason: string,
  refund: boolean,
  actor: Actor,
  stripe?: PaymentStripe | null,
): Promise<{ invoicesUpdated: number; refund: BillingPayment['refund'] }> {
  const client = await requireClient(queries, clientId)
  const payment = await queries.paymentById(paymentId)
  if (!payment || payment.client_id !== client.id) throw new BillingError('VALIDATION_PAYMENT_NOT_FOUND', 404, 'No such payment for this client.')
  if (payment.voided_at) throw new BillingError('VALIDATION_PAYMENT_ALREADY_VOID', 409, 'This payment is already void.')
  const now = new Date().toISOString()
  const why = reason.trim() || 'Voided'

  let refunded: StripeRefundDetails | null = null
  const source = payment.source_system || ''
  const stripeEnvironment = stripeEnvironmentOf(source)
  if (source.startsWith(STRIPE_SOURCE_PREFIX) && payment.source_record_id && refund) {
    if (!stripe) throw new BillingError('STRIPE_NOT_AVAILABLE', 422, 'Stripe is not available on this server.')
    logLine('BILLING:void-refund-start', actor.requestId, { payment: payment.payment_number || paymentId, environment: stripeEnvironment })
    refunded = await stripe.refund(stripeEnvironment, payment.source_record_id, why)
  }
  const [ledger, applicationsAll] = await Promise.all([queries.ledgerOfPayment(paymentId), queries.applicationsOfPayment(paymentId)])
  const ledgerRows = ledger.filter((row) => !row.voided_at)
  // Applications already voided, or detached from their invoice (`detachInvoicePayments`), no longer pay an invoice.
  const applications = applicationsAll.filter((row) => !isClosedApplication(row))
  const invoiceIds = [...new Set(applications.map((row) => row.invoice_id).filter((id): id is string => Boolean(id)))]
  const invoices = await queries.invoicesByIds(invoiceIds)
  const audit = auditor(queries, actor, client.id)
  const statements: D1PreparedStatement[] = []
  if (ledgerRows.length) statements.push(queries.voidLedgerEntries(ledgerRows.map((row) => row.id), actor.userId, `Payment ${payment.payment_number || paymentId} voided by ${actor.email}: ${why}`, now))
  for (const invoice of invoices) {
    const applied = applications.filter((row) => row.invoice_id === invoice.id).reduce((sum, row) => sum + num(row.amount), 0)
    const writeOff = ledgerRows.filter((row) => row.entry_type === 'write_off' && row.invoice_id === invoice.id).reduce((sum, row) => sum + num(row.amount), 0)
    const amountPaid = Math.max(0, round(num(invoice.amount_paid) - applied))
    const discount = Math.max(0, round(num(invoice.discount_amount) - writeOff))
    const total = Math.max(0, round(num(invoice.subtotal_amount) + num(invoice.tax_amount) - discount))
    const balance = invoice.status === 'void' ? 0 : Math.max(0, round(total - amountPaid))
    const status = invoice.status === 'void' ? 'void' : amountPaid > 0 ? 'partially_paid' : invoice.status === 'draft' ? 'draft' : 'sent'
    statements.push(queries.setInvoicePayments(invoice.id, { amountPaid, discount, total, balance, status, paidAt: null, now }), audit('UPDATE', 'invoice', invoice.id, invoice.matter_id, { amountPaid, discount, total, balance, status }))
  }
  if (applications.length) statements.push(queries.markApplicationsVoided(applications.map((row) => row.id), `VOIDED ${now}: ${why}`, now))
  statements.push(
    queries.voidPayment(paymentId, actor.userId, why, now, refunded),
    audit('VOID', 'payment', paymentId, payment.matter_id, { reason: why, ledgerVoided: ledgerRows.map((row) => row.id), invoices: invoiceIds, ...(refunded ? { refundId: refunded.refundId, refundStatus: refunded.status, refundEnvironment: stripeEnvironment } : {}) }),
  )
  try {
    await queries.run(statements)
  } catch (error) {
    if (refunded) {
      // The card is refunded but the database does not say so yet: a retry reuses the refund (never a second one).
      logLine('BILLING:void-db-sync-failed', actor.requestId, { payment: payment.payment_number || paymentId, refund: refunded.refundId, environment: stripeEnvironment, error: error instanceof Error ? error.message.slice(0, 160) : 'unknown' })
      throw new BillingError('PAYMENT_VOID_DATABASE_SYNC_FAILED', 502, 'Stripe refunded the card, but the void could not be saved. Void the payment again (the refund is reused, never repeated).', { refundId: refunded.refundId })
    }
    throw error
  }
  logLine('BILLING:void-payment', actor.requestId, { payment: payment.payment_number || paymentId, ledger: ledgerRows.length, invoices: invoiceIds.length, refund: refunded?.refundId ?? 'none', arn: refunded?.referenceStatus ?? '' })
  return { invoicesUpdated: invoiceIds.length, refund: refunded ? refundProjection(refunded, now) : null }
}

/**
 * Re-reads a voided payment's Stripe refund and stores its current status and ARN (super admin; old PATCH action
 * `refreshRefund`). On live the ARN is usually `pending` for a few days after the refund; sandbox refunds carry a test
 * ARN at once. One batch with its audit row.
 *
 * @throws BillingError `VALIDATION_PAYMENT_NOT_FOUND` (404), `VALIDATION_PAYMENT_HAS_NO_REFUND` (422); `stripe`'s errors.
 */
export async function refreshPaymentRefund(queries: BillingQueries, clientId: string, paymentId: string, actor: Actor, stripe?: PaymentStripe | null): Promise<NonNullable<BillingPayment['refund']>> {
  const client = await requireClient(queries, clientId)
  const payment = await queries.paymentById(paymentId)
  if (!payment || payment.client_id !== client.id) throw new BillingError('VALIDATION_PAYMENT_NOT_FOUND', 404, 'No such payment for this client.')
  const source = payment.source_system || ''
  if (!source.startsWith(STRIPE_SOURCE_PREFIX) || !payment.refund_provider_id?.startsWith('re_')) throw new BillingError('VALIDATION_PAYMENT_HAS_NO_REFUND', 422, 'This payment has no Stripe refund to read.')
  if (!stripe) throw new BillingError('STRIPE_NOT_AVAILABLE', 422, 'Stripe is not available on this server.')
  const refund = await stripe.readRefund(stripeEnvironmentOf(source), payment.refund_provider_id)
  const now = new Date().toISOString()
  await queries.run([
    queries.setPaymentRefund(paymentId, refund, now),
    auditor(queries, actor, client.id)('REFRESH_REFUND', 'payment', paymentId, payment.matter_id, { refundId: refund.refundId, status: refund.status, referenceStatus: refund.referenceStatus }),
  ])
  logLine('BILLING:refresh-refund', actor.requestId, { payment: payment.payment_number || paymentId, refund: refund.refundId, status: refund.status ?? '', arn: refund.referenceStatus ?? '' })
  return refundProjection(refund, payment.refunded_at)
}

/** Reads, checks and writes of one apply before `BILLING_CHANGED_DURING_APPLY` (as the pay links post tries three times). */
const APPLY_MAX_ATTEMPTS = 3
const cents = (dollars: number) => Math.round(dollars * 100)

/**
 * Works out one apply of unapplied money (decision C2) from what the database holds now, or refuses it. Writes
 * nothing; `applyUnappliedPayment` writes the plan.
 *
 * @throws BillingError `VALIDATION_PAYMENT_NOT_FOUND` (404), `VALIDATION_PAYMENT_ALREADY_VOID` (409),
 *   `VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE`, `VALIDATION_PAYMENT_ALLOCATION_AMOUNT`,
 *   `VALIDATION_PAYMENT_INVOICE_NOT_FOUND`, `VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT`, `VALIDATION_INVOICE_IS_DRAFT`,
 *   `VALIDATION_PAYMENT_EXCEEDS_BALANCE`, `VALIDATION_PAYMENT_EXCEEDS_UNAPPLIED` (422),
 *   `VALIDATION_PAYMENT_UNAPPLIED_LEDGER_MISMATCH` (409).
 */
async function planApply(queries: BillingQueries, client: ClientRow, paymentId: string, body: PaymentApplyBody, actor: Actor): Promise<ApplyPlan> {
  const payment = await queries.paymentById(paymentId)
  if (!payment || payment.client_id !== client.id) throw new BillingError('VALIDATION_PAYMENT_NOT_FOUND', 404, 'No such payment for this client.')
  if (payment.voided_at) throw new BillingError('VALIDATION_PAYMENT_ALREADY_VOID', 409, 'This payment is void; its money cannot be applied.')
  const requested = body.allocations
  if (new Set(requested.map((allocation) => allocation.invoiceId)).size !== requested.length) throw new BillingError('VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE', 422, 'Each invoice may be listed once.')
  if (requested.some((allocation) => cents(allocation.amount) <= 0)) throw new BillingError('VALIDATION_PAYMENT_ALLOCATION_AMOUNT', 422, 'Each amount must be at least one cent.')

  // The invoices: the payment post's rules (the client's, not void, not a draft, at most the balance due).
  const invoiceRows = new Map((await queries.invoicesByIds(requested.map((allocation) => allocation.invoiceId))).map((row) => [row.id, row]))
  const shares = requested.map((allocation) => {
    const invoice = invoiceRows.get(allocation.invoiceId)
    if (!invoice || invoice.billed_to_client_id !== client.id) throw new BillingError('VALIDATION_PAYMENT_INVOICE_NOT_FOUND', 422, 'That invoice is not one of this client\'s invoices.')
    if (invoice.status === 'void' || invoice.status === 'voided') throw new BillingError('VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT', 422, `Invoice ${invoice.invoice_number} is void.`)
    if (invoice.status === 'draft') throw new BillingError('VALIDATION_INVOICE_IS_DRAFT', 422, `Invoice ${invoice.invoice_number} is a draft. Finalize it before attaching a payment.`)
    const amountCents = cents(allocation.amount)
    if (amountCents > Math.max(0, cents(num(invoice.balance_due)))) throw new BillingError('VALIDATION_PAYMENT_EXCEEDS_BALANCE', 422, `Invoice ${invoice.invoice_number} has ${num(invoice.balance_due).toFixed(2)} due.`)
    return { invoice, amountCents }
  })
  const totalCents = shares.reduce((sum, share) => sum + share.amountCents, 0)
  const unappliedCents = Math.max(0, cents(num(payment.unapplied_amount)))
  if (totalCents > unappliedCents) {
    throw new BillingError('VALIDATION_PAYMENT_EXCEEDS_UNAPPLIED', 422, `Only ${(unappliedCents / 100).toFixed(2)} of this payment is unapplied.`, { unappliedAmount: (unappliedCents / 100).toFixed(2) })
  }

  // The register's unapplied credits of this payment, oldest first: the money is drawn from them in turn.
  const unappliedRows = (await queries.ledgerOfPayment(payment.id))
    .filter((row) => !row.voided_at && !row.invoice_id && row.ledger_bucket === 'receivable' && row.entry_type === 'payment' && row.entry_direction === 'credit')
    .sort((a, b) => `${a.entry_date}:${a.id}`.localeCompare(`${b.entry_date}:${b.id}`))
  const drawn: Array<{ row: LedgerEntryRow; amountCents: number }> = []
  let remainingCents = totalCents
  let restCents = 0
  for (const row of unappliedRows) {
    if (remainingCents <= 0) break
    const rowCents = cents(num(row.amount))
    if (rowCents <= 0) continue
    const take = Math.min(rowCents, remainingCents)
    drawn.push({ row, amountCents: rowCents })
    remainingCents -= take
    restCents = rowCents - take
  }
  if (remainingCents > 0) {
    // `unapplied_amount` says there is money, but the register has no unapplied credit for it: applying would credit
    // the client a second time, so it is refused for review.
    logLine('BILLING:apply-ledger-mismatch', actor.requestId, { payment: payment.payment_number || payment.id, unapplied: unappliedCents, rows: unappliedRows.length })
    throw new BillingError('VALIDATION_PAYMENT_UNAPPLIED_LEDGER_MISMATCH', 409, 'The register has no unapplied credit for this money. Nothing was applied; the payment needs review.')
  }

  const now = new Date().toISOString()
  const today = dateForDatabase(undefined, now)
  const number = payment.payment_number || payment.id
  const receivedDate = dateForDatabase(payment.received_date, now)
  const reference = payment.reference_number || number
  const base = { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'billing', clientId: client.id }
  const allocations: ApplyAllocation[] = shares.map(({ invoice, amountCents }) => {
    const amount = amountCents / 100
    const amountPaid = round(num(invoice.amount_paid) + amount)
    const discount = round(num(invoice.discount_amount))
    const total = Math.max(0, round(num(invoice.subtotal_amount) + num(invoice.tax_amount) - discount))
    const balance = Math.max(0, round(total - amountPaid))
    const status = balance === 0 ? 'paid' : 'partially_paid'
    return {
      invoiceId: invoice.id,
      matterId: invoice.matter_id,
      amount,
      readStatus: invoice.status,
      readPaidCents: cents(num(invoice.amount_paid)),
      readBalanceCents: cents(num(invoice.balance_due)),
      amountPaid,
      discount,
      total,
      balance,
      status,
      paidAt: balance === 0 ? now : null,
      // The invoice's credit is dated the day the money came in, as the unapplied credit it replaces was.
      ledger: {
        id: newId('led'),
        invoiceId: invoice.id,
        matterId: invoice.matter_id,
        clientId: client.id,
        paymentId: payment.id,
        bucket: 'receivable',
        entryType: 'payment',
        direction: 'credit',
        paymentTypeLookupId: payment.payment_type_lookup_id,
        amount,
        amountExTax: null,
        entryDate: receivedDate,
        referenceNumber: reference,
        memo: `Payment ${number} applied to invoice ${invoice.invoice_number} (unapplied money)`,
        sourceSystem: payment.source_system,
        sourceRecordId: payment.source_record_id,
        createdByUserId: actor.userId,
        now,
      },
      applicationId: newId('paya'),
      appliedDate: today,
      applicationNote: `Unapplied money applied ${today} by ${actor.email}`,
      audit: { ...base, action: 'UPDATE', targetTable: 'invoice', targetId: invoice.id, matterId: invoice.matter_id, newJson: { amountPaid, discount, total, balance, status, appliedFrom: payment.id } } satisfies AuditEntry,
    }
  })
  // What is left of the last row drawn from stays unapplied, as a new credit like the row it replaces.
  const last = drawn.at(-1)?.row
  const remainder = last && restCents > 0
    ? {
        id: newId('led'),
        invoiceId: null,
        matterId: last.matter_id,
        clientId: client.id,
        paymentId: payment.id,
        bucket: 'receivable' as const,
        entryType: 'payment' as const,
        direction: 'credit' as const,
        paymentTypeLookupId: payment.payment_type_lookup_id,
        amount: restCents / 100,
        amountExTax: null,
        entryDate: last.entry_date,
        referenceNumber: last.reference_number,
        memo: last.memo || `Payment ${number}`,
        sourceSystem: payment.source_system,
        sourceRecordId: payment.source_record_id,
        createdByUserId: actor.userId,
        now,
      }
    : null
  const invoiceNumbers = shares.map((share) => share.invoice.invoice_number).join(', ')
  const unappliedAfter = (unappliedCents - totalCents) / 100
  const gateAuditId = crypto.randomUUID()
  return {
    gateAuditId,
    audit: {
      ...base,
      action: 'APPLY_UNAPPLIED',
      targetTable: 'payment',
      targetId: payment.id,
      matterId: payment.matter_id,
      newJson: {
        applied: totalCents / 100,
        unappliedBefore: unappliedCents / 100,
        unappliedAfter,
        allocations: allocations.map((item) => ({ invoiceId: item.invoiceId, amount: item.amount, ledgerId: item.ledger.id })),
        ledgerReplaced: drawn.map((item) => item.row.id),
        ...(remainder ? { ledgerRemainder: remainder.id } : {}),
      },
    },
    paymentId: payment.id,
    clientId: client.id,
    readUnappliedCents: unappliedCents,
    unappliedAfter,
    drawnRows: drawn.map((item) => ({ id: item.row.id, readAmountCents: item.amountCents })),
    voidReason: `Unapplied money applied to invoice ${invoiceNumbers} by ${actor.email} (moved, not reversed: see the invoice rows${remainder ? ' and the rest left unapplied' : ''})`,
    remainder,
    allocations,
    userId: actor.userId,
    now,
  }
}

/**
 * Applies a payment's unapplied money to open invoices (decision C2, the requester, Nov 16, 2026: "Unapplied money should
 * be available to attach to a future invoice"). Billing write roles. New; the old app had no such action.
 *
 * Accounting: the payment post (or the pay link post) already credited the client register with the whole payment,
 * the unapplied part as a receivable `payment` credit with no invoice. Applying it must not credit the client again, so
 * it moves money between credits: the unapplied credits drawn from are voided ("moved, not reversed") and replaced by
 * one receivable credit per invoice (carrying the invoice, its matter, the payment and its Stripe source) and, when a row
 * is only partly used, a new unapplied credit for the rest. All of them keep the day the money was received, so the
 * client's balance on every date is unchanged; only the matter balances follow the money to the invoice's matter. The
 * payment's `unapplied_amount` goes down by the amount applied; each invoice gets its paid amount, balance and status
 * (the payment post's arithmetic) and a `payment_application` row tied to its new credit. A later payment void reverses
 * all of it, as it reverses a payment applied when it was posted.
 *
 * Re-read inside the write (audit finding 8, as the pay links post): one guarded batch (`queries.applyUnapplied`); when
 * the payment, the rows drawn from or an invoice changed after the read, nothing is written and the apply reads again,
 * three times, then answers `BILLING_CHANGED_DURING_APPLY` (409).
 *
 * @returns What was applied and what is left unapplied.
 * @throws BillingError the codes of `planApply`, and `BILLING_CHANGED_DURING_APPLY`.
 */
export async function applyUnappliedPayment(queries: BillingQueries, clientId: string, paymentId: string, body: PaymentApplyBody, actor: Actor): Promise<PaymentApplyData> {
  const client = await requireClient(queries, clientId)
  for (let attempt = 1; attempt <= APPLY_MAX_ATTEMPTS; attempt += 1) {
    const plan = await planApply(queries, client, paymentId, body, actor)
    if (await queries.applyUnapplied(plan)) {
      const applied = round(plan.allocations.reduce((sum, item) => sum + item.amount, 0))
      logLine('BILLING:apply-unapplied', actor.requestId, { payment: paymentId, applied: applied.toFixed(2), left: plan.unappliedAfter.toFixed(2), invoices: plan.allocations.length, attempt })
      return { id: paymentId, applied, unappliedAmount: plan.unappliedAfter, invoicesUpdated: plan.allocations.length }
    }
    logLine('BILLING:apply-changed', actor.requestId, { payment: paymentId, attempt })
  }
  throw new BillingError('BILLING_CHANGED_DURING_APPLY', 409, 'The payment or its invoices changed while the money was being applied. Nothing was applied; try again.')
}

export async function createTrustRequest(queries: BillingQueries, clientId: string, body: TrustRequestBody, actor: Actor): Promise<string> {
  const client = await requireClient(queries, clientId)
  await requireClientMatter(queries, body.matterId, client)
  const now = new Date().toISOString()
  const id = newId('trq')
  const values = {
    matterId: body.matterId,
    clientId: client.id,
    requestNumber: body.requestNumber?.trim() || `TR-${Date.now()}`,
    amount: Math.max(0, body.amount),
    requestDate: dateForDatabase(body.date, now),
    memo: body.note?.trim() || null,
    userId: actor.userId,
    now,
  }
  await queries.run([queries.insertTrustRequest(id, values), auditor(queries, actor, client.id)('CREATE', 'trust_request', id, body.matterId, values)])
  return id
}

export async function updateTrustRequest(queries: BillingQueries, clientId: string, requestId: string, body: TrustRequestBody, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await queries.trustRequestById(requestId)
  if (!current || current.client_id !== client.id) throw new BillingError('VALIDATION_TRUST_REQUEST_NOT_FOUND', 404, 'No such trust request for this client.')
  const now = new Date().toISOString()
  const values = { amount: Math.max(0, body.amount), requestDate: dateForDatabase(body.date, now), memo: body.note?.trim() || null, now }
  await queries.run([queries.updateTrustRequest(requestId, values), auditor(queries, actor, client.id)('UPDATE', 'trust_request', requestId, current.matter_id, values)])
}

/** A trust deposit (credit) or disbursement (debit) on the trust ledger. */
export async function createTrustEntry(queries: BillingQueries, clientId: string, body: TrustEntryBody, actor: Actor): Promise<string> {
  const client = await requireClient(queries, clientId)
  await requireClientMatter(queries, body.matterId, client)
  const now = new Date().toISOString()
  const id = newId('led')
  const deposit = body.action === 'deposit'
  const amount = round(body.amount)
  await queries.run([
    queries.insertLedgerEntry({
      id,
      invoiceId: null,
      matterId: body.matterId,
      clientId: client.id,
      paymentId: null,
      bucket: 'trust',
      entryType: deposit ? 'trust_deposit' : 'trust_disbursement',
      direction: deposit ? 'credit' : 'debit',
      paymentTypeLookupId: null,
      amount,
      amountExTax: null,
      entryDate: dateForDatabase(body.date, now),
      referenceNumber: body.requestNumber?.trim() || null,
      memo: body.note?.trim() || (deposit ? 'Trust payment received' : 'Trust disbursement'),
      createdByUserId: actor.userId,
      now,
    }),
    auditor(queries, actor, client.id)('CREATE', 'ledger_entry', id, body.matterId, { action: body.action, amount }),
  ])
  return id
}

/** Edits a manual register row. Rows posted by an invoice or a payment are changed through those instead. */
export async function updateLedgerEntry(queries: BillingQueries, clientId: string, entryId: string, body: LedgerEntryBody, actor: Actor): Promise<void> {
  const client = await requireClient(queries, clientId)
  const current = await queries.ledgerEntryById(entryId)
  if (!current || (current.client_id !== client.id && !(await matterBelongsToClient(queries, current.matter_id, client)))) {
    throw new BillingError('VALIDATION_LEDGER_ENTRY_NOT_FOUND', 404, 'No such ledger entry for this client.')
  }
  if (current.invoice_id || current.payment_id) throw new BillingError('VALIDATION_SYSTEM_LEDGER_ENTRY_LOCKED', 409, 'This row was posted by an invoice or a payment.')
  await requireClientMatter(queries, body.matterId, client)
  const values = { matterId: body.matterId, entryDate: dateForDatabase(body.date, current.entry_date), memo: body.description.trim() || current.memo || '', amount: Math.max(0, body.amount) }
  await queries.run([queries.updateManualLedgerEntry(entryId, values), auditor(queries, actor, client.id)('UPDATE', 'ledger_entry', entryId, body.matterId, values)])
}
