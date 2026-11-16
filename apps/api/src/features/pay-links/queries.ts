// file: apps/api/src/features/pay-links/queries.ts
/**
 * The only file of the pay links area that talks to D1 (Billing part 7d, `docs/API/Billing_Audit.md` section 6.3).
 *
 * Tables: `payment_request` (the links; `token_hash` is written once and never read back), `invoice`, `client` and
 * `user` (read), and, when a paid link is posted, `payment`, `ledger_entry`, `payment_application`, `invoice` and
 * `audit_log` (resource `billing`). The audit rows carry the client and no `matter_id`, so they never block a matter
 * delete (as the billing documents rows).
 *
 * Posting a paid link is one batch that re-reads inside the write (audit finding 8, "two payments at once"): its first
 * statement is the payment's audit row, inserted only while (a) no active payment carries the PaymentIntent, (b) the
 * link is still paid and unposted, and (c) every invoice the money goes to still has the paid amount, balance and status
 * read a moment before. Every later statement runs only if that audit row exists (the contact-maintenance guard). So a
 * change made between the read and the write leaves the batch with nothing written, and the caller reads again.
 * D1 also allows one active payment per PaymentIntent (`ux_payment_source_record_active`).
 *
 * The old code made one crud Worker call per row (`krPayLinkSettlement.ts`), so a failure half-way left half a post.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** A `payment_request` row as KR Homebase reads it (`token_hash` is never selected). */
export type PayLinkRow = {
  id: string
  prid: string
  invoice_id: string
  invoice_ivid: string
  invoice_number: string
  client_id: string
  client_number: string
  environment: 'sandbox' | 'live'
  token_hint: string
  status: 'open' | 'paid' | 'posted' | 'expired' | 'revoked'
  expires_at: string
  link_source: 'email' | 'print' | null
  sent_document_number: string | null
  last_viewed_at: string | null
  view_count: number
  intent_attempts: number
  stripe_payment_intent_id: string | null
  payer_email: string | null
  paid_amount: number | null
  paid_at: string | null
  payment_id: string | null
  payment_number: string | null
  posted_at: string | null
  post_error: string | null
  revoked_at: string | null
  revoke_reason: string | null
  created_by_user_id: string | null
  created_at: string
}

/** The invoice fields issuing and posting need. */
export type PayInvoiceRow = {
  id: string
  matter_id: string
  billed_to_client_id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  ivid: string | null
  status: string
  subtotal_amount: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
}

export type PayClientRow = { id: string; client_number: string; display_name: string }
export type PayUserRow = { id: string; email: string; role: string | null; account_status: string | null }

/** A new link, with its audit row. */
export interface NewPayLink {
  id: string
  prid: string
  invoiceId: string
  invoiceIvid: string
  invoiceNumber: string
  clientId: string
  clientNumber: string
  environment: 'sandbox' | 'live'
  tokenHash: string
  tokenHint: string
  expiresAt: string
  sentDocumentNumber: string | null
  linkSource: 'email' | 'print'
  createdByUserId: string
  now: string
}

/** One invoice's share of a posted link, worked out by `rules.ts`. */
export interface PostAllocation {
  invoiceId: string
  matterId: string
  amount: number
  /** The invoice as read (cents), checked again inside the write. */
  readPaidCents: number
  readBalanceCents: number
  /** The invoice after this payment. */
  amountPaid: number
  total: number
  balance: number
  status: 'paid' | 'partially_paid'
  paidAt: string | null
  ledgerId: string
  applicationId: string
}

/** Everything one post writes. */
export interface PostPlan {
  /** The id of the guarding audit row (the payment's CREATE row). */
  gateAuditId: string
  linkId: string
  intentId: string
  clientId: string
  payment: {
    id: string
    paymentNumber: string
    matterId: string
    receivedDate: string
    amount: number
    unapplied: number
    paymentTypeLookupId: string
    memo: string
    sourceSystem: string
  }
  allocations: PostAllocation[]
  /** The unapplied receivable credit ("for review"), when money is left over. */
  unapplied: { ledgerId: string; memo: string } | null
  applicationNote: string
  actor: { userId: string; email: string | null; role: string | null; requestId: string }
  now: string
}

export interface PayLinkQueries {
  linksOfClient(clientId: string): Promise<PayLinkRow[]>
  linkById(linkId: string): Promise<PayLinkRow | null>
  linksOfInvoice(invoiceId: string): Promise<PayLinkRow[]>
  invoiceById(invoiceId: string): Promise<PayInvoiceRow | null>
  /** The client's open invoices (sent, partially paid, overdue, more than half a cent due), oldest invoice date first. */
  openInvoices(clientId: string): Promise<PayInvoiceRow[]>
  clientById(clientId: string): Promise<PayClientRow | null>
  userById(userId: string): Promise<PayUserRow | null>
  /** The active (not voided) payment that carries this PaymentIntent, if any. */
  activePaymentForIntent(intentId: string): Promise<{ id: string; payment_number: string | null } | null>
  /** Inserts the link and its audit row in one batch (a `prid` clash throws; the caller tries a new code). */
  insertLink(row: NewPayLink, audit: AuditEntry): Promise<void>
  /** Revokes a link that is still open and unpaid, with its audit row; true when it changed. */
  revokeLink(linkId: string, userId: string, reason: string, now: string, audit: AuditEntry): Promise<boolean>
  /** Records which stored sent copy carried the link. */
  setSentDocument(linkId: string, documentNumber: string, now: string): Promise<void>
  /** The guarded post (see the file header); true when this call wrote the payment. */
  postPayment(plan: PostPlan): Promise<boolean>
  /** Marks a link posted to a payment that already exists (an earlier post wrote the payment). */
  markPosted(linkId: string, payment: { id: string; payment_number: string | null }, now: string, audit: AuditEntry): Promise<void>
  /** Keeps why a paid link could not be posted (only while it is still unposted). */
  recordPostError(linkId: string, message: string, now: string): Promise<void>
}

/** True when an insert failed on the UNIQUE `prid` (try again with a new code). */
export function isPridClash(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE/i.test(message) && /prid/i.test(message)
}

const LINK_COLUMNS = `id, prid, invoice_id, invoice_ivid, invoice_number, client_id, client_number, environment, token_hint, status, expires_at,
  link_source, sent_document_number, last_viewed_at, view_count, intent_attempts, stripe_payment_intent_id, payer_email, paid_amount, paid_at,
  payment_id, payment_number, posted_at, post_error, revoked_at, revoke_reason, created_by_user_id, created_at`
const INVOICE_COLUMNS =
  'id, matter_id, billed_to_client_id, invoice_number, invoice_date, due_date, ivid, status, subtotal_amount, discount_amount, tax_amount, total_amount, amount_paid, balance_due'
/** Invoice statuses that can still take a payment (drafts are never sent; void, paid and written off are closed). */
export const PAYABLE_STATUS_SQL = "('sent', 'partially_paid', 'overdue')"

/** The `audit_log` insert of `entry`, written only when `guard` (SQL with `?` values `guardValues`) holds. */
function guardedAudit(db: D1Database, id: string, entry: AuditEntry, now: string, guard: string, guardValues: Array<string | number | null>): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (id, request_id, actor_user_id, actor_email, actor_role, source, resource, action, target_table, target_id,
         matter_id, client_id, previous_json, new_json, idempotency_key, success, error_message, created_at)
       SELECT ?, ?, ?, ?, ?, 'krhomebase-api', ?, ?, ?, ?, NULL, ?, NULL, ?, ?, 1, NULL, ? WHERE ${guard}`,
    )
    .bind(
      id,
      entry.requestId,
      entry.actorUserId,
      entry.actorEmail,
      entry.actorRole,
      entry.resource,
      entry.action,
      entry.targetTable,
      entry.targetId,
      entry.clientId ?? null,
      entry.newJson === undefined ? null : JSON.stringify(entry.newJson),
      entry.idempotencyKey ?? null,
      now,
      ...guardValues,
    )
}

export function createPayLinkQueries(db: D1Database): PayLinkQueries {
  const all = async <T,>(statement: D1PreparedStatement): Promise<T[]> => (await statement.all<T>()).results ?? []

  return {
    linksOfClient: (clientId) => all<PayLinkRow>(db.prepare(`SELECT ${LINK_COLUMNS} FROM payment_request WHERE client_id = ?1 ORDER BY created_at DESC, id LIMIT 500`).bind(clientId)),
    linkById: (linkId) => db.prepare(`SELECT ${LINK_COLUMNS} FROM payment_request WHERE id = ?1`).bind(linkId).first<PayLinkRow>(),
    linksOfInvoice: (invoiceId) => all<PayLinkRow>(db.prepare(`SELECT ${LINK_COLUMNS} FROM payment_request WHERE invoice_id = ?1 ORDER BY created_at DESC, id`).bind(invoiceId)),
    invoiceById: (invoiceId) => db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoice WHERE id = ?1`).bind(invoiceId).first<PayInvoiceRow>(),
    openInvoices: (clientId) =>
      all<PayInvoiceRow>(
        db
          .prepare(
            `SELECT ${INVOICE_COLUMNS} FROM invoice
             WHERE billed_to_client_id = ?1 AND status IN ${PAYABLE_STATUS_SQL} AND balance_due > 0.004
             ORDER BY invoice_date, CAST(invoice_number AS INTEGER), invoice_number`,
          )
          .bind(clientId),
      ),
    clientById: (clientId) => db.prepare('SELECT id, client_number, display_name FROM client WHERE id = ?1').bind(clientId).first<PayClientRow>(),
    userById: (userId) => db.prepare('SELECT id, email, role, account_status FROM user WHERE id = ?1').bind(userId).first<PayUserRow>(),
    activePaymentForIntent: (intentId) =>
      db.prepare('SELECT id, payment_number FROM payment WHERE source_record_id = ?1 AND voided_at IS NULL LIMIT 1').bind(intentId).first<{ id: string; payment_number: string | null }>(),

    async insertLink(r, audit) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO payment_request (id, prid, invoice_id, invoice_ivid, invoice_number, client_id, client_number, environment, token_hash, token_hint,
               status, expires_at, sent_document_number, link_source, created_by_user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'open', ?11, ?12, ?13, ?14, ?15, ?15)`,
          )
          .bind(r.id, r.prid, r.invoiceId, r.invoiceIvid, r.invoiceNumber, r.clientId, r.clientNumber, r.environment, r.tokenHash, r.tokenHint, r.expiresAt, r.sentDocumentNumber, r.linkSource, r.createdByUserId, r.now),
        auditStatement(db, audit),
      ])
    },

    async revokeLink(linkId, userId, reason, now, audit) {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE payment_request SET status = 'revoked', revoked_at = ?2, revoked_by_user_id = ?3, revoke_reason = ?4, updated_at = ?2
             WHERE id = ?1 AND status = 'open' AND paid_at IS NULL`,
          )
          .bind(linkId, now, userId, reason),
        guardedAudit(db, crypto.randomUUID(), audit, now, `EXISTS (SELECT 1 FROM payment_request WHERE id = ? AND status = 'revoked' AND revoked_at = ?)`, [linkId, now]),
      ])
      return Number(results[0]?.meta?.changes ?? 0) > 0
    },

    async setSentDocument(linkId, documentNumber, now) {
      await db.prepare('UPDATE payment_request SET sent_document_number = ?2, updated_at = ?3 WHERE id = ?1').bind(linkId, documentNumber, now).run()
    },

    async postPayment(plan) {
      const gate = 'EXISTS (SELECT 1 FROM audit_log WHERE id = ?)'
      const p = plan.payment
      const auditBase = { requestId: plan.actor.requestId, actorUserId: plan.actor.userId, actorEmail: plan.actor.email, actorRole: plan.actor.role, resource: 'billing', clientId: plan.clientId }
      const expected = JSON.stringify(plan.allocations.map((item) => ({ id: item.invoiceId, paid: item.readPaidCents, balance: item.readBalanceCents })))
      const statements: D1PreparedStatement[] = [
        // The guard: the payment's own audit row, only while nothing changed since the read.
        guardedAudit(
          db,
          plan.gateAuditId,
          { ...auditBase, action: 'CREATE', targetTable: 'payment', targetId: p.id, newJson: { amount: p.amount, unapplied: p.unapplied, source: p.sourceSystem, payLink: plan.linkId, allocations: plan.allocations.map((item) => ({ invoiceId: item.invoiceId, amount: item.amount })) }, idempotencyKey: plan.intentId },
          plan.now,
          `NOT EXISTS (SELECT 1 FROM payment WHERE source_record_id = ? AND voided_at IS NULL)
           AND EXISTS (SELECT 1 FROM payment_request WHERE id = ? AND payment_id IS NULL AND paid_at IS NOT NULL AND stripe_payment_intent_id = ?)
           AND NOT EXISTS (
             SELECT 1 FROM json_each(?) AS e LEFT JOIN invoice AS i ON i.id = json_extract(e.value, '$.id')
             WHERE i.id IS NULL OR i.status NOT IN ${PAYABLE_STATUS_SQL}
               OR CAST(ROUND(i.amount_paid * 100) AS INTEGER) <> json_extract(e.value, '$.paid')
               OR CAST(ROUND(i.balance_due * 100) AS INTEGER) <> json_extract(e.value, '$.balance'))`,
          [plan.intentId, plan.linkId, plan.intentId, expected],
        ),
        db
          .prepare(
            `INSERT INTO payment (id, payment_number, matter_id, client_id, received_date, amount, unapplied_amount, payment_type_lookup_id, reference_number, memo,
               source_system, source_record_id, created_by_user_id, received_by_user_id, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
          )
          .bind(p.id, p.paymentNumber, p.matterId, plan.clientId, p.receivedDate, p.amount, p.unapplied, p.paymentTypeLookupId, plan.intentId, p.memo, p.sourceSystem, plan.intentId, plan.actor.userId, plan.actor.userId, plan.now, plan.now, plan.gateAuditId),
      ]
      const ledger = (id: string, invoiceId: string | null, matterId: string, amount: number, memo: string) =>
        db
          .prepare(
            `INSERT INTO ledger_entry (id, invoice_id, matter_id, client_id, payment_id, ledger_bucket, entry_type, entry_direction, payment_type_lookup_id, amount,
               amount_ex_tax, tax_amount, amount_inc_tax, entry_date, reference_number, memo, source_system, source_record_id, created_by_user_id, created_at)
             SELECT ?, ?, ?, ?, ?, 'receivable', 'payment', 'credit', ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
          )
          .bind(id, invoiceId, matterId, plan.clientId, p.id, p.paymentTypeLookupId, amount, amount, p.receivedDate, plan.intentId, memo, p.sourceSystem, plan.intentId, plan.actor.userId, plan.now, plan.gateAuditId)
      for (const item of plan.allocations) {
        statements.push(
          ledger(item.ledgerId, item.invoiceId, item.matterId, item.amount, p.memo),
          db
            .prepare(`UPDATE invoice SET amount_paid = ?2, total_amount = ?3, balance_due = ?4, status = ?5, paid_at = ?6, updated_at = ?7 WHERE id = ?1 AND ${gate.replace('?', '?8')}`)
            .bind(item.invoiceId, item.amountPaid, item.total, item.balance, item.status, item.paidAt, plan.now, plan.gateAuditId),
          db
            .prepare(
              `INSERT INTO payment_application (id, payment_id, invoice_id, matter_id, amount, applied_date, notes, created_by_user_id, created_at, updated_at)
               SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
            )
            .bind(item.applicationId, p.id, item.invoiceId, item.matterId, item.amount, p.receivedDate, plan.applicationNote, plan.actor.userId, plan.now, plan.now, plan.gateAuditId),
          guardedAudit(db, crypto.randomUUID(), { ...auditBase, action: 'UPDATE', targetTable: 'invoice', targetId: item.invoiceId, newJson: { amountPaid: item.amountPaid, total: item.total, balance: item.balance, status: item.status } }, plan.now, gate, [plan.gateAuditId]),
        )
      }
      if (plan.unapplied) statements.push(ledger(plan.unapplied.ledgerId, null, p.matterId, p.unapplied, plan.unapplied.memo))
      statements.push(
        db
          .prepare(`UPDATE payment_request SET status = 'posted', payment_id = ?2, payment_number = ?3, posted_at = ?4, post_error = NULL, updated_at = ?4 WHERE id = ?1 AND payment_id IS NULL AND ${gate.replace('?', '?5')}`)
          .bind(plan.linkId, p.id, p.paymentNumber, plan.now, plan.gateAuditId),
        guardedAudit(db, crypto.randomUUID(), { ...auditBase, action: 'PAY_LINK_POSTED', targetTable: 'payment_request', targetId: plan.linkId, newJson: { paymentId: p.id, paymentNumber: p.paymentNumber } }, plan.now, gate, [plan.gateAuditId]),
      )
      const results = await db.batch(statements)
      return Number(results[0]?.meta?.changes ?? 0) === 1
    },

    async markPosted(linkId, payment, now, audit) {
      await db.batch([
        db
          .prepare(`UPDATE payment_request SET status = 'posted', payment_id = ?2, payment_number = ?3, posted_at = ?4, post_error = NULL, updated_at = ?4 WHERE id = ?1 AND payment_id IS NULL`)
          .bind(linkId, payment.id, payment.payment_number, now),
        auditStatement(db, audit),
      ])
    },

    async recordPostError(linkId, message, now) {
      await db.prepare('UPDATE payment_request SET post_error = ?2, updated_at = ?3 WHERE id = ?1 AND payment_id IS NULL').bind(linkId, message, now).run()
    },
  }
}

export function payLinkQueriesFor(env: { krhomebase?: D1Database } | undefined): PayLinkQueries | null {
  return env?.krhomebase ? createPayLinkQueries(env.krhomebase) : null
}
