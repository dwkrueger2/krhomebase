// file: apps/api/src/features/billing/queries.ts
/**
 * The only file in the billing area that talks to D1. It replaces the crud Worker calls of the old
 * `kr-api-v1/billing` route (plan stages 3 and 4).
 *
 * Shape (as in contact-edits): the readers return rows; the writers return prepared statements and run nothing.
 * `rules.ts` gathers every statement of one write, adds `audit(...)` for each changed row, and calls
 * `run(statements)` once, so a write is one `db.batch`: all of it is kept or none of it.
 *
 * Every statement is fixed SQL with bound values. Id lists go through `json_each`. Lists select named columns.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export type ClientRow = { id: string; client_number: string; display_name: string }
export type MatterRow = { id: string; matter_number: string; title: string; description: string | null }
export type StaffRow = { id: string; email: string; account_status: string | null; is_active: number | null; person_name: string | null; staff_code: string | null }
export type TimeEntryRow = {
  id: string
  matter_id: string
  user_id: string
  activity_code: string | null
  activity_description: string | null
  entry_date: string
  hours: number
  rate: number
  amount_ex_tax: number
  amount_inc_tax: number
  billing_mode: string
  billing_status: string
  description: string
  is_billed: number
  invoice_id: string | null
  bcid: string | null
}
export type InvoiceRow = {
  id: string
  matter_id: string
  billed_to_client_id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  subtotal_amount: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  notes: string | null
  ivid: string | null
}
export type InvoiceLineRow = { id: string; invoice_id: string; time_entry_id: string | null; display_on_invoice: number | null }
export type PaymentRow = {
  id: string
  payment_number: string | null
  matter_id: string | null
  client_id: string | null
  received_date: string
  amount: number
  payment_type_lookup_id: string | null
  reference_number: string | null
  memo: string | null
  voided_at: string | null
  void_reason: string | null
  source_system: string | null
  source_record_id: string | null
  refund_provider_id: string | null
  refund_status: string | null
  refund_amount: number | null
  refund_reference: string | null
  refund_reference_type: string | null
  refund_reference_status: string | null
  refunded_at: string | null
}
export type PaymentApplicationRow = { id: string; payment_id: string; invoice_id: string | null; amount: number; notes: string | null }
export type LedgerEntryRow = {
  id: string
  invoice_id: string | null
  matter_id: string
  client_id: string | null
  payment_id: string | null
  ledger_bucket: string
  entry_type: string
  entry_direction: string
  amount: number
  entry_date: string
  reference_number: string | null
  memo: string | null
  notes: string | null
  voided_at: string | null
  void_reason: string | null
}
export type TrustRequestRow = {
  id: string
  matter_id: string
  client_id: string | null
  request_number: string
  requested_amount: number
  request_date: string
  status: string
  memo: string | null
}
export type AccountTotalsRow = {
  open_balance: number | null
  open_count: number | null
  receivable_debits: number | null
  receivable_credits: number | null
  trust_credits: number | null
  trust_debits: number | null
  unapplied: number | null
}

const TIME_ENTRY_COLUMNS =
  'id, matter_id, user_id, activity_code, activity_description, entry_date, hours, rate, amount_ex_tax, amount_inc_tax, billing_mode, billing_status, description, is_billed, invoice_id, bcid'
const INVOICE_COLUMNS =
  'id, matter_id, billed_to_client_id, invoice_number, invoice_date, due_date, subtotal_amount, discount_amount, tax_amount, total_amount, amount_paid, balance_due, status, notes, ivid'
const PAYMENT_COLUMNS =
  'id, payment_number, matter_id, client_id, received_date, amount, payment_type_lookup_id, reference_number, memo, voided_at, void_reason, source_system, source_record_id, refund_provider_id, refund_status, refund_amount, refund_reference, refund_reference_type, refund_reference_status, refunded_at'
const LEDGER_COLUMNS =
  'id, invoice_id, matter_id, client_id, payment_id, ledger_bucket, entry_type, entry_direction, amount, entry_date, reference_number, memo, notes, voided_at, void_reason'
const MATTER_COLUMNS = 'id, matter_number, title, description'

/** Values for a new or changed time entry. */
export type TimeEntryValues = {
  matterId: string
  userId: string
  activityCode: string | null
  activityDescription: string | null
  entryDate: string
  hours: number
  rate: number
  amount: number
  billingMode: 'hourly_billable' | 'flat_fee_tracked' | 'flat_fee_billable'
  billingStatus: string
  feeArrangement: 'hourly' | 'flat_fee'
  description: string
  now: string
}

/** Values for a new invoice. */
export type NewInvoice = {
  id: string
  ivid: string
  matterId: string
  clientId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  subtotal: number
  discount: number
  tax: number
  total: number
  notes: string | null
  now: string
}

/** Values for an invoice line made from a time entry. */
export type InvoiceLineValues = {
  invoiceId: string
  matterId: string
  timeEntryId: string
  lineType: 'time' | 'flat_fee'
  activityCode: string | null
  description: string
  quantity: number
  unitRate: number
  amount: number
  sortOrder: number
  now: string
}

/** Values for a new ledger entry. */
export type NewLedgerEntry = {
  id: string
  invoiceId: string | null
  matterId: string
  clientId: string
  paymentId: string | null
  bucket: 'receivable' | 'trust'
  entryType: 'invoice' | 'payment' | 'write_off' | 'trust_deposit' | 'trust_disbursement'
  direction: 'credit' | 'debit'
  paymentTypeLookupId: string | null
  amount: number
  amountExTax: number | null
  entryDate: string
  referenceNumber: string | null
  memo: string
  createdByUserId: string
  now: string
}

/** Values for a new payment. */
export type NewPayment = {
  id: string
  paymentNumber: string
  matterId: string | null
  clientId: string
  receivedDate: string
  amount: number
  unappliedAmount: number
  paymentTypeLookupId: string | null
  referenceNumber: string | null
  memo: string | null
  userId: string
  now: string
}

export interface BillingQueries {
  /** Runs the statements of one write as one batch. */
  run(statements: D1PreparedStatement[]): Promise<void>
  /** The `audit_log` insert for one write (platform `auditStatement`), to put in the same batch. */
  audit(entry: AuditEntry): D1PreparedStatement

  // ---- reads: the client and its matters
  clientById(clientId: string): Promise<ClientRow | null>
  matterById(matterId: string): Promise<MatterRow | null>
  /** Matters linked to the client through `matter_party`. */
  mattersOfClient(clientId: string): Promise<MatterRow[]>
  /** Matters numbered `<clientNumber>.<n>` (imported matters with no `matter_party` row). */
  mattersByNumberPrefix(clientNumber: string): Promise<MatterRow[]>
  matterPartyExists(matterId: string, clientId: string): Promise<boolean>

  // ---- reads: the billing record
  timeEntriesOfMatters(matterIds: string[]): Promise<TimeEntryRow[]>
  invoicesOfClient(clientId: string): Promise<InvoiceRow[]>
  paymentsOfClient(clientId: string): Promise<PaymentRow[]>
  /** Ledger entries of the client, or of any of its matters. */
  ledgerOfClient(clientId: string, matterIds: string[]): Promise<LedgerEntryRow[]>
  trustRequestsOfClient(clientId: string): Promise<TrustRequestRow[]>
  linesOfInvoices(invoiceIds: string[]): Promise<InvoiceLineRow[]>
  /** Every login with its person's name and staff code (the staff list and the `CODE - Name` labels). */
  staff(): Promise<StaffRow[]>
  accountTotals(clientId: string): Promise<AccountTotalsRow>

  // ---- reads: for writes
  timeEntryById(entryId: string): Promise<TimeEntryRow | null>
  timeEntriesByIds(entryIds: string[]): Promise<TimeEntryRow[]>
  timeEntriesOfInvoice(invoiceId: string): Promise<TimeEntryRow[]>
  invoiceById(invoiceId: string): Promise<InvoiceRow | null>
  invoicesByIds(invoiceIds: string[]): Promise<InvoiceRow[]>
  linesOfInvoice(invoiceId: string): Promise<InvoiceLineRow[]>
  /** Visible line items listing this time entry (an older save may not have set `time_entry.invoice_id`). */
  visibleLinesOfTimeEntry(entryId: string): Promise<InvoiceLineRow[]>
  ledgerOfInvoice(invoiceId: string): Promise<LedgerEntryRow[]>
  ledgerOfPayment(paymentId: string): Promise<LedgerEntryRow[]>
  ledgerEntryById(entryId: string): Promise<LedgerEntryRow | null>
  paymentById(paymentId: string): Promise<PaymentRow | null>
  applicationsOfPayment(paymentId: string): Promise<PaymentApplicationRow[]>
  trustRequestById(requestId: string): Promise<TrustRequestRow | null>
  /** Highest all-digit invoice number in the firm (invoice numbers are unique firm-wide). */
  highestInvoiceNumber(): Promise<number>

  // ---- writes (statements only)
  insertTimeEntry(id: string, bcid: string, values: TimeEntryValues): D1PreparedStatement
  updateTimeEntry(id: string, values: TimeEntryValues): D1PreparedStatement
  deleteTimeEntry(id: string): D1PreparedStatement
  markTimeEntryBilled(id: string, invoiceId: string, now: string): D1PreparedStatement
  releaseTimeEntries(entryIds: string[], now: string): D1PreparedStatement
  insertInvoice(row: NewInvoice): D1PreparedStatement
  updateInvoiceDraft(id: string, values: { matterId: string; invoiceDate: string; dueDate: string; subtotal: number; discount: number; total: number; balance: number; now: string }): D1PreparedStatement
  setInvoiceStatus(id: string, status: string, now: string): D1PreparedStatement
  setInvoicePayments(id: string, values: { amountPaid: number; discount: number; total: number; balance: number; status: string; paidAt: string | null; now: string }): D1PreparedStatement
  voidInvoice(id: string, notes: string, now: string): D1PreparedStatement
  insertInvoiceLine(id: string, values: InvoiceLineValues): D1PreparedStatement
  updateInvoiceLine(id: string, values: InvoiceLineValues): D1PreparedStatement
  /** Lines are never deleted: a removed entry's line is hidden with zero amounts, so its history stays. */
  hideInvoiceLines(lineIds: string[], zeroAmounts: boolean, now: string): D1PreparedStatement
  insertLedgerEntry(row: NewLedgerEntry): D1PreparedStatement
  setLedgerAmount(id: string, amount: number): D1PreparedStatement
  voidLedgerEntries(entryIds: string[], userId: string, reason: string, now: string): D1PreparedStatement
  detachLedgerEntry(id: string, memo: string): D1PreparedStatement
  updateManualLedgerEntry(id: string, values: { matterId: string; entryDate: string; memo: string; amount: number }): D1PreparedStatement
  insertPayment(row: NewPayment): D1PreparedStatement
  insertPaymentApplication(id: string, values: { paymentId: string; invoiceId: string; matterId: string; amount: number; appliedDate: string; notes: string | null; userId: string; now: string }): D1PreparedStatement
  markApplicationsVoided(applicationIds: string[], note: string, now: string): D1PreparedStatement
  voidPayment(id: string, userId: string, reason: string, now: string): D1PreparedStatement
  insertTrustRequest(id: string, values: { matterId: string; clientId: string; requestNumber: string; amount: number; requestDate: string; memo: string | null; userId: string; now: string }): D1PreparedStatement
  updateTrustRequest(id: string, values: { amount: number; requestDate: string; memo: string | null; now: string }): D1PreparedStatement
}

export function createBillingQueries(db: D1Database): BillingQueries {
  const all = async <T,>(statement: D1PreparedStatement): Promise<T[]> => (await statement.all<T>()).results ?? []
  const ids = (list: string[]) => JSON.stringify([...new Set(list)])

  return {
    async run(statements) {
      if (statements.length) await db.batch(statements)
    },
    audit(entry) {
      return auditStatement(db, entry)
    },

    // ---- the client and its matters
    clientById(clientId) {
      return db.prepare('SELECT id, client_number, display_name FROM client WHERE id = ?1').bind(clientId).first<ClientRow>()
    },
    matterById(matterId) {
      return db.prepare(`SELECT ${MATTER_COLUMNS} FROM matter WHERE id = ?1`).bind(matterId).first<MatterRow>()
    },
    mattersOfClient(clientId) {
      return all<MatterRow>(
        db
          .prepare(`SELECT ${MATTER_COLUMNS} FROM matter WHERE id IN (SELECT matter_id FROM matter_party WHERE client_id = ?1) ORDER BY matter_number`)
          .bind(clientId),
      )
    },
    mattersByNumberPrefix(clientNumber) {
      return all<MatterRow>(db.prepare(`SELECT ${MATTER_COLUMNS} FROM matter WHERE substr(matter_number, 1, length(?1) + 1) = ?1 || '.' ORDER BY matter_number`).bind(clientNumber))
    },
    async matterPartyExists(matterId, clientId) {
      return Boolean(await db.prepare('SELECT id FROM matter_party WHERE matter_id = ?1 AND client_id = ?2 LIMIT 1').bind(matterId, clientId).first())
    },

    // ---- the billing record
    timeEntriesOfMatters(matterIds) {
      if (!matterIds.length) return Promise.resolve([])
      return all<TimeEntryRow>(
        db.prepare(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entry WHERE matter_id IN (SELECT value FROM json_each(?1)) ORDER BY entry_date, id`).bind(ids(matterIds)),
      )
    },
    invoicesOfClient(clientId) {
      return all<InvoiceRow>(db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoice WHERE billed_to_client_id = ?1 ORDER BY invoice_date, id`).bind(clientId))
    },
    paymentsOfClient(clientId) {
      return all<PaymentRow>(db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payment WHERE client_id = ?1 ORDER BY received_date, id`).bind(clientId))
    },
    ledgerOfClient(clientId, matterIds) {
      return all<LedgerEntryRow>(
        db
          .prepare(`SELECT ${LEDGER_COLUMNS} FROM ledger_entry WHERE client_id = ?1 OR matter_id IN (SELECT value FROM json_each(?2)) ORDER BY entry_date, id`)
          .bind(clientId, ids(matterIds)),
      )
    },
    trustRequestsOfClient(clientId) {
      return all<TrustRequestRow>(
        db
          .prepare('SELECT id, matter_id, client_id, request_number, requested_amount, request_date, status, memo FROM trust_request WHERE client_id = ?1 ORDER BY request_date, id')
          .bind(clientId),
      )
    },
    linesOfInvoices(invoiceIds) {
      if (!invoiceIds.length) return Promise.resolve([])
      return all<InvoiceLineRow>(
        db
          .prepare('SELECT id, invoice_id, time_entry_id, display_on_invoice FROM invoice_line_item WHERE invoice_id IN (SELECT value FROM json_each(?1)) ORDER BY invoice_id, sort_order')
          .bind(ids(invoiceIds)),
      )
    },
    staff() {
      return all<StaffRow>(
        db.prepare(
          `SELECT u.id, u.email, u.account_status, u.is_active,
                  COALESCE(NULLIF(TRIM(i.preferred_name), ''), NULLIF(TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')), '')) AS person_name,
                  e.staff_code
             FROM user u
             LEFT JOIN individual i ON i.id = u.individual_id
             LEFT JOIN employee e ON e.user_id = u.id
            ORDER BY u.email`,
        ),
      )
    },
    async accountTotals(clientId) {
      const row = await db
        .prepare(
          `SELECT
             (SELECT SUM(balance_due) FROM invoice WHERE billed_to_client_id = ?1 AND status IN ('sent', 'partially_paid', 'overdue')) AS open_balance,
             (SELECT COUNT(*) FROM invoice WHERE billed_to_client_id = ?1 AND status IN ('sent', 'partially_paid', 'overdue')) AS open_count,
             (SELECT SUM(amount) FROM ledger_entry WHERE client_id = ?1 AND voided_at IS NULL AND ledger_bucket = 'receivable' AND entry_direction = 'debit') AS receivable_debits,
             (SELECT SUM(amount) FROM ledger_entry WHERE client_id = ?1 AND voided_at IS NULL AND ledger_bucket = 'receivable' AND entry_direction = 'credit') AS receivable_credits,
             (SELECT SUM(amount) FROM ledger_entry WHERE client_id = ?1 AND voided_at IS NULL AND ledger_bucket = 'trust' AND entry_direction = 'credit') AS trust_credits,
             (SELECT SUM(amount) FROM ledger_entry WHERE client_id = ?1 AND voided_at IS NULL AND ledger_bucket = 'trust' AND entry_direction = 'debit') AS trust_debits,
             (SELECT SUM(unapplied_amount) FROM payment WHERE client_id = ?1 AND voided_at IS NULL) AS unapplied`,
        )
        .bind(clientId)
        .first<AccountTotalsRow>()
      return row ?? { open_balance: 0, open_count: 0, receivable_debits: 0, receivable_credits: 0, trust_credits: 0, trust_debits: 0, unapplied: 0 }
    },

    // ---- for writes
    timeEntryById(entryId) {
      return db.prepare(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entry WHERE id = ?1`).bind(entryId).first<TimeEntryRow>()
    },
    timeEntriesByIds(entryIds) {
      if (!entryIds.length) return Promise.resolve([])
      return all<TimeEntryRow>(db.prepare(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entry WHERE id IN (SELECT value FROM json_each(?1))`).bind(ids(entryIds)))
    },
    timeEntriesOfInvoice(invoiceId) {
      return all<TimeEntryRow>(db.prepare(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entry WHERE invoice_id = ?1`).bind(invoiceId))
    },
    invoiceById(invoiceId) {
      return db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoice WHERE id = ?1`).bind(invoiceId).first<InvoiceRow>()
    },
    invoicesByIds(invoiceIds) {
      if (!invoiceIds.length) return Promise.resolve([])
      return all<InvoiceRow>(db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoice WHERE id IN (SELECT value FROM json_each(?1))`).bind(ids(invoiceIds)))
    },
    linesOfInvoice(invoiceId) {
      return all<InvoiceLineRow>(db.prepare('SELECT id, invoice_id, time_entry_id, display_on_invoice FROM invoice_line_item WHERE invoice_id = ?1 ORDER BY sort_order').bind(invoiceId))
    },
    visibleLinesOfTimeEntry(entryId) {
      return all<InvoiceLineRow>(
        db.prepare('SELECT id, invoice_id, time_entry_id, display_on_invoice FROM invoice_line_item WHERE time_entry_id = ?1 AND display_on_invoice <> 0').bind(entryId),
      )
    },
    ledgerOfInvoice(invoiceId) {
      return all<LedgerEntryRow>(db.prepare(`SELECT ${LEDGER_COLUMNS} FROM ledger_entry WHERE invoice_id = ?1`).bind(invoiceId))
    },
    ledgerOfPayment(paymentId) {
      return all<LedgerEntryRow>(db.prepare(`SELECT ${LEDGER_COLUMNS} FROM ledger_entry WHERE payment_id = ?1`).bind(paymentId))
    },
    ledgerEntryById(entryId) {
      return db.prepare(`SELECT ${LEDGER_COLUMNS} FROM ledger_entry WHERE id = ?1`).bind(entryId).first<LedgerEntryRow>()
    },
    paymentById(paymentId) {
      return db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payment WHERE id = ?1`).bind(paymentId).first<PaymentRow>()
    },
    applicationsOfPayment(paymentId) {
      return all<PaymentApplicationRow>(db.prepare('SELECT id, payment_id, invoice_id, amount, notes FROM payment_application WHERE payment_id = ?1').bind(paymentId))
    },
    trustRequestById(requestId) {
      return db
        .prepare('SELECT id, matter_id, client_id, request_number, requested_amount, request_date, status, memo FROM trust_request WHERE id = ?1')
        .bind(requestId)
        .first<TrustRequestRow>()
    },
    async highestInvoiceNumber() {
      // invoice_number is TEXT, so MAX() over the text would rank '99' above '100': cast the all-digit numbers.
      const row = await db
        .prepare("SELECT MAX(CAST(invoice_number AS INTEGER)) AS highest FROM invoice WHERE invoice_number <> '' AND invoice_number NOT GLOB '*[^0-9]*'")
        .first<{ highest: number | null }>()
      return Number(row?.highest ?? 0)
    },

    // ---- writes
    insertTimeEntry(id, bcid, v) {
      return db
        .prepare(
          `INSERT INTO time_entry (id, matter_id, user_id, employee_id, activity_code, activity_description, entry_date, hours, rate, amount_ex_tax, tax_amount, amount_inc_tax,
             billing_mode, billing_status, fee_arrangement, display_on_invoice, included_in_flat_fee, flat_fee_component_id, description, is_billed, invoice_id, bcid, created_at, updated_at)
           VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?9, ?10, ?11, ?12, 1, 0, NULL, ?13, 0, NULL, ?14, ?15, ?15)`,
        )
        .bind(id, v.matterId, v.userId, v.activityCode, v.activityDescription, v.entryDate, v.hours, v.rate, v.amount, v.billingMode, v.billingStatus, v.feeArrangement, v.description, bcid, v.now)
    },
    updateTimeEntry(id, v) {
      return db
        .prepare(
          `UPDATE time_entry SET matter_id = ?2, user_id = ?3, activity_code = ?4, entry_date = ?5, hours = ?6, rate = ?7, amount_ex_tax = ?8, amount_inc_tax = ?8,
             billing_mode = ?9, billing_status = ?10, description = ?11, updated_at = ?12 WHERE id = ?1`,
        )
        .bind(id, v.matterId, v.userId, v.activityCode, v.entryDate, v.hours, v.rate, v.amount, v.billingMode, v.billingStatus, v.description, v.now)
    },
    deleteTimeEntry(id) {
      return db.prepare('DELETE FROM time_entry WHERE id = ?1 AND invoice_id IS NULL AND is_billed = 0').bind(id)
    },
    markTimeEntryBilled(id, invoiceId, now) {
      return db.prepare("UPDATE time_entry SET invoice_id = ?2, is_billed = 1, billing_status = 'billed', updated_at = ?3 WHERE id = ?1").bind(id, invoiceId, now)
    },
    releaseTimeEntries(entryIds, now) {
      return db
        .prepare("UPDATE time_entry SET invoice_id = NULL, is_billed = 0, billing_status = 'billable', updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))")
        .bind(ids(entryIds), now)
    },
    insertInvoice(r) {
      return db
        .prepare(
          `INSERT INTO invoice (id, matter_id, billed_to_client_id, invoice_number, invoice_date, due_date, subtotal_amount, discount_amount, tax_amount, total_amount,
             amount_paid, balance_due, status, notes, ivid, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?10, 'draft', ?11, ?12, ?13, ?13)`,
        )
        .bind(r.id, r.matterId, r.clientId, r.invoiceNumber, r.invoiceDate, r.dueDate, r.subtotal, r.discount, r.tax, r.total, r.notes, r.ivid, r.now)
    },
    updateInvoiceDraft(id, v) {
      return db
        .prepare(
          `UPDATE invoice SET matter_id = ?2, invoice_date = ?3, due_date = ?4, subtotal_amount = ?5, discount_amount = ?6, total_amount = ?7, balance_due = ?8, updated_at = ?9
            WHERE id = ?1 AND status = 'draft'`,
        )
        .bind(id, v.matterId, v.invoiceDate, v.dueDate, v.subtotal, v.discount, v.total, v.balance, v.now)
    },
    setInvoiceStatus(id, status, now) {
      return db.prepare('UPDATE invoice SET status = ?2, updated_at = ?3 WHERE id = ?1').bind(id, status, now)
    },
    setInvoicePayments(id, v) {
      return db
        .prepare('UPDATE invoice SET amount_paid = ?2, discount_amount = ?3, total_amount = ?4, balance_due = ?5, status = ?6, paid_at = ?7, updated_at = ?8 WHERE id = ?1')
        .bind(id, v.amountPaid, v.discount, v.total, v.balance, v.status, v.paidAt, v.now)
    },
    voidInvoice(id, notes, now) {
      return db.prepare("UPDATE invoice SET status = 'void', balance_due = 0, notes = ?2, updated_at = ?3 WHERE id = ?1").bind(id, notes, now)
    },
    insertInvoiceLine(id, v) {
      return db
        .prepare(
          `INSERT INTO invoice_line_item (id, invoice_id, matter_id, time_entry_id, line_type, activity_code, description, quantity, unit_rate, subtotal_amount, tax_amount, total_amount,
             display_on_invoice, sort_order, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?10, 1, ?11, ?12, ?12)`,
        )
        .bind(id, v.invoiceId, v.matterId, v.timeEntryId, v.lineType, v.activityCode, v.description, v.quantity, v.unitRate, v.amount, v.sortOrder, v.now)
    },
    updateInvoiceLine(id, v) {
      return db
        .prepare(
          `UPDATE invoice_line_item SET matter_id = ?2, line_type = ?3, activity_code = ?4, description = ?5, quantity = ?6, unit_rate = ?7, subtotal_amount = ?8, tax_amount = 0,
             total_amount = ?8, display_on_invoice = 1, sort_order = ?9, updated_at = ?10 WHERE id = ?1`,
        )
        .bind(id, v.matterId, v.lineType, v.activityCode, v.description, v.quantity, v.unitRate, v.amount, v.sortOrder, v.now)
    },
    hideInvoiceLines(lineIds, zeroAmounts, now) {
      return zeroAmounts
        ? db
            .prepare(
              'UPDATE invoice_line_item SET display_on_invoice = 0, quantity = 0, subtotal_amount = 0, tax_amount = 0, total_amount = 0, updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))',
            )
            .bind(ids(lineIds), now)
        : db.prepare('UPDATE invoice_line_item SET display_on_invoice = 0, updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))').bind(ids(lineIds), now)
    },
    insertLedgerEntry(r) {
      return db
        .prepare(
          `INSERT INTO ledger_entry (id, invoice_id, matter_id, client_id, payment_id, ledger_bucket, entry_type, entry_direction, payment_type_lookup_id, amount, amount_ex_tax,
             tax_amount, amount_inc_tax, entry_date, reference_number, memo, created_by_user_id, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?10, ?12, ?13, ?14, ?15, ?16)`,
        )
        .bind(
          r.id,
          r.invoiceId,
          r.matterId,
          r.clientId,
          r.paymentId,
          r.bucket,
          r.entryType,
          r.direction,
          r.paymentTypeLookupId,
          r.amount,
          r.amountExTax,
          r.entryDate,
          r.referenceNumber,
          r.memo,
          r.createdByUserId,
          r.now,
        )
    },
    setLedgerAmount(id, amount) {
      // ledger_entry has no updated_at column.
      return db.prepare('UPDATE ledger_entry SET amount = ?2, amount_inc_tax = ?2 WHERE id = ?1').bind(id, amount)
    },
    voidLedgerEntries(entryIds, userId, reason, now) {
      return db
        .prepare('UPDATE ledger_entry SET voided_at = ?2, voided_by_user_id = ?3, void_reason = ?4 WHERE id IN (SELECT value FROM json_each(?1)) AND voided_at IS NULL')
        .bind(ids(entryIds), now, userId, reason)
    },
    detachLedgerEntry(id, memo) {
      return db.prepare('UPDATE ledger_entry SET invoice_id = NULL, memo = ?2 WHERE id = ?1').bind(id, memo)
    },
    updateManualLedgerEntry(id, v) {
      return db
        .prepare('UPDATE ledger_entry SET matter_id = ?2, entry_date = ?3, memo = ?4, amount = ?5 WHERE id = ?1 AND invoice_id IS NULL AND payment_id IS NULL')
        .bind(id, v.matterId, v.entryDate, v.memo, v.amount)
    },
    insertPayment(r) {
      return db
        .prepare(
          `INSERT INTO payment (id, payment_number, matter_id, client_id, received_date, amount, unapplied_amount, payment_type_lookup_id, reference_number, memo,
             source_system, source_record_id, created_by_user_id, received_by_user_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?11, ?11, ?12, ?12)`,
        )
        .bind(r.id, r.paymentNumber, r.matterId, r.clientId, r.receivedDate, r.amount, r.unappliedAmount, r.paymentTypeLookupId, r.referenceNumber, r.memo, r.userId, r.now)
    },
    insertPaymentApplication(id, v) {
      return db
        .prepare(
          `INSERT INTO payment_application (id, payment_id, invoice_id, matter_id, amount, applied_date, notes, created_by_user_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
        )
        .bind(id, v.paymentId, v.invoiceId, v.matterId, v.amount, v.appliedDate, v.notes, v.userId, v.now)
    },
    markApplicationsVoided(applicationIds, note, now) {
      return db
        .prepare(
          "UPDATE payment_application SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ?2 ELSE notes || ' · ' || ?2 END, updated_at = ?3 WHERE id IN (SELECT value FROM json_each(?1))",
        )
        .bind(ids(applicationIds), note, now)
    },
    voidPayment(id, userId, reason, now) {
      return db.prepare('UPDATE payment SET voided_at = ?2, voided_by_user_id = ?3, void_reason = ?4, updated_at = ?2 WHERE id = ?1 AND voided_at IS NULL').bind(id, now, userId, reason)
    },
    insertTrustRequest(id, v) {
      return db
        .prepare(
          `INSERT INTO trust_request (id, matter_id, client_id, request_number, requested_amount, request_date, due_date, status, memo, created_by_user_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 'draft', ?7, ?8, ?9, ?9)`,
        )
        .bind(id, v.matterId, v.clientId, v.requestNumber, v.amount, v.requestDate, v.memo, v.userId, v.now)
    },
    updateTrustRequest(id, v) {
      return db.prepare('UPDATE trust_request SET requested_amount = ?2, request_date = ?3, memo = ?4, updated_at = ?5 WHERE id = ?1').bind(id, v.amount, v.requestDate, v.memo, v.now)
    },
  }
}

export function billingQueriesFor(env: { krhomebase?: D1Database } | undefined): BillingQueries | null {
  return env?.krhomebase ? createBillingQueries(env.krhomebase) : null
}
