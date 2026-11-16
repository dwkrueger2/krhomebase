// file: apps/api/src/features/card-payments/queries.ts
/**
 * The only file in the card payments area that talks to D1 (Billing part 7e). It reads; it writes nothing: a card
 * payment is posted by the Billing area (`POST .../payments`), and its refund is recorded by the payment void.
 *
 * Replaces the old `card-payment` route's crud Worker reads: the invoices of the allocation, the client's number, and
 * the client's person (first and last name for the cardholder row, `icid` for the PaymentIntent metadata). The payer
 * email comes from the WorkStream area's `emailRecipients` (the same client addresses every billing email uses).
 *
 * Every statement is fixed SQL with bound values; id lists go through `json_each`.
 */

/** The client row the card routes read. */
export type CardClientRow = { id: string; client_number: string; display_name: string }
/** The client's person (null fields for an entity client). */
export type CardPayerRow = { first_name: string | null; last_name: string | null; icid: string | null }
/** One invoice of the allocation. */
export type CardInvoiceRow = { id: string; matter_id: string; billed_to_client_id: string; invoice_number: string; balance_due: number; status: string; ivid: string | null }

export interface CardPaymentQueries {
  clientById(clientId: string): Promise<CardClientRow | null>
  /** The client's person (`client.individual_id`); null names for an entity client. */
  payerOf(clientId: string): Promise<CardPayerRow | null>
  invoicesByIds(invoiceIds: string[]): Promise<CardInvoiceRow[]>
}

export function createCardPaymentQueries(db: D1Database): CardPaymentQueries {
  return {
    clientById: (clientId) => db.prepare('SELECT id, client_number, display_name FROM client WHERE id = ?1').bind(clientId).first<CardClientRow>(),
    payerOf: (clientId) =>
      db
        .prepare('SELECT i.first_name, i.last_name, i.icid FROM client c LEFT JOIN individual i ON i.id = c.individual_id WHERE c.id = ?1')
        .bind(clientId)
        .first<CardPayerRow>(),
    async invoicesByIds(invoiceIds) {
      if (!invoiceIds.length) return []
      const result = await db
        .prepare('SELECT id, matter_id, billed_to_client_id, invoice_number, balance_due, status, ivid FROM invoice WHERE id IN (SELECT value FROM json_each(?1))')
        .bind(JSON.stringify([...new Set(invoiceIds)]))
        .all<CardInvoiceRow>()
      return result.results ?? []
    },
  }
}

export function cardPaymentQueriesFor(env: { krhomebase?: D1Database } | undefined): CardPaymentQueries | null {
  return env?.krhomebase ? createCardPaymentQueries(env.krhomebase) : null
}
