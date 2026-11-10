// file: packages/contracts/src/billing.ts
/**
 * Billing (plan stages 2 to 4): one client's billing record, and the writes Billing's tabs make. Ported from the
 * old `kr-api-v1/billing` GET, POST, PATCH and DELETE (one address and a `resource` field for every write).
 *
 * Changes from the old API:
 *  - One route per action (plan difference 1). Every route sits under `/v1/billing/clients/{clientId}`, so the
 *    client is part of the address and the server checks that each record belongs to it.
 *  - Every write is one database batch with its audit rows (plan section 7); the old route made one crud Worker
 *    call per row, and a failure half-way left half a save.
 *  - Request bodies are checked against these shapes; unknown keys are refused. The old route also accepted
 *    snake_case duplicates (`matter_id`); the browser never sent them, so they are gone.
 *  - Not here yet: card payments, refunds and pay links (stage 6), and invoice and statement email and print
 *    (stage 5). A credit-card or ACH payment is refused until stage 6, as the old route refused one without a
 *    Stripe payment.
 *
 * Dates go out as `MM/DD/YYYY` (as the old projection did) and come in as `MM/DD/YYYY` or `YYYY-MM-DD`.
 */

import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max)
const id = z.string().trim().min(1).max(120)
const money = z.number().finite()
/** `MM/DD/YYYY` or `YYYY-MM-DD`. */
const dateText = z
  .string()
  .trim()
  .regex(/^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/, 'Use MM/DD/YYYY or YYYY-MM-DD.')

export const BillingStatus = z.enum(['Delay Bill', 'Bill Next Invoice', 'Billed', 'Not Billable'])
export type BillingStatus = z.infer<typeof BillingStatus>
export const BillingEntryKind = z.enum(['Time', 'Flat Fee Service'])
export type BillingEntryKind = z.infer<typeof BillingEntryKind>
export const BillingInvoiceStatus = z.enum(['Paid', 'Unpaid', 'Partially paid', 'Void'])
export type BillingInvoiceStatus = z.infer<typeof BillingInvoiceStatus>
/** Payment types a person may post by hand. Credit card and ACH need Stripe (stage 6). */
export const BillingPaymentType = z.enum(['Credit card', 'ACH', 'Check', 'Cash', 'Wire'])
export type BillingPaymentType = z.infer<typeof BillingPaymentType>

// ----------------------------------------------------------------------------------------------------------
// The record (GET)

export const BillingTimeEntry = z.object({
  id: z.string(),
  matterId: z.string(),
  date: z.string(),
  matterNumber: z.string(),
  description: z.string(),
  activityCategory: z.string(),
  kind: BillingEntryKind,
  hours: z.number(),
  rate: z.number(),
  amount: z.number(),
  billingStatus: BillingStatus,
  staffId: z.string(),
  /** `CODE - Name`. */
  staff: z.string(),
  /** The bare staff code (initials), for printed documents; null when the person has none. */
  staffCode: z.string().nullable(),
  internalTimeTracked: z.boolean(),
  invoiceId: z.string().nullable(),
  /** Public seven-character Billing Code ID; null on a row that never got one. */
  bcid: z.string().nullable(),
})
export type BillingTimeEntry = z.infer<typeof BillingTimeEntry>

export const BillingInvoice = z.object({
  id: z.string(),
  matterId: z.string(),
  matterNumber: z.string(),
  invoiceNumber: z.string(),
  dateInvoiced: z.string(),
  dueDate: z.string(),
  clientLabel: z.string(),
  amountDue: z.number(),
  /** Zero or negative. */
  writeOff: z.number(),
  ivid: z.string().nullable(),
  locked: z.boolean(),
  lockedReason: z.string().optional(),
  status: BillingInvoiceStatus,
  entryIds: z.array(z.string()),
})
export type BillingInvoice = z.infer<typeof BillingInvoice>

export const BillingLedgerEntry = z.object({
  id: z.string(),
  invoiceId: z.string().nullable().optional(),
  paymentId: z.string().nullable().optional(),
  date: z.string(),
  reference: z.string(),
  description: z.string(),
  charges: z.number().optional(),
  payments: z.number().optional(),
  writeOff: z.number().optional(),
  balance: z.number(),
  matterNumber: z.string().optional(),
  matterId: z.string().optional(),
  editable: z.boolean().optional(),
  voided: z.boolean().optional(),
  voidedAt: z.string().nullable().optional(),
  voidReason: z.string().nullable().optional(),
})
export type BillingLedgerEntry = z.infer<typeof BillingLedgerEntry>

export const BillingPaymentRefund = z.object({
  id: z.string(),
  status: z.string().nullable(),
  amount: z.number().nullable(),
  reference: z.string().nullable(),
  referenceType: z.string().nullable(),
  referenceStatus: z.string().nullable(),
  refundedAt: z.string().nullable(),
})
export type BillingPaymentRefund = z.infer<typeof BillingPaymentRefund>

export const BillingPayment = z.object({
  id: z.string(),
  paymentNumber: z.string(),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceIvid: z.string().nullable(),
  matterId: z.string(),
  matterNumber: z.string(),
  receivedDate: z.string(),
  amount: z.number(),
  paymentType: z.string(),
  referenceNumber: z.string(),
  memo: z.string(),
  writeOff: z.number(),
  /** `stripe_sandbox` or `stripe_live` for a card payment taken through Stripe; null otherwise. */
  sourceSystem: z.string().nullable(),
  voided: z.boolean(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  refund: BillingPaymentRefund.nullable(),
})
export type BillingPayment = z.infer<typeof BillingPayment>

export const BillingTrustEntry = z.object({
  id: z.string(),
  date: z.string(),
  reference: z.string(),
  description: z.string(),
  fundsReceived: z.number(),
  fundsDispersed: z.number(),
  balance: z.number(),
  matterNumber: z.string(),
  matterId: z.string(),
  trustRequestNumber: z.string().optional(),
})
export type BillingTrustEntry = z.infer<typeof BillingTrustEntry>

export const BillingAccountTotals = z.object({
  openInvoiceBalance: z.number(),
  openInvoiceCount: z.number(),
  receivableDebits: z.number(),
  receivableCredits: z.number(),
  trustCredits: z.number(),
  trustDebits: z.number(),
  trustBalance: z.number(),
  unappliedPayments: z.number(),
})
export type BillingAccountTotals = z.infer<typeof BillingAccountTotals>

export const BillingRecord = z.object({
  client: z.object({ id: z.string(), clientNumber: z.string(), displayName: z.string() }),
  matters: z.array(z.object({ id: z.string(), matterNumber: z.string(), title: z.string() })),
  timeEntries: z.array(BillingTimeEntry),
  invoices: z.array(BillingInvoice),
  payments: z.array(BillingPayment),
  ledgerEntries: z.array(BillingLedgerEntry),
  trustEntries: z.array(BillingTrustEntry),
  staffOptions: z.array(z.object({ id: z.string(), label: z.string(), staffCode: z.string().nullable() })),
  accountTotals: BillingAccountTotals,
  /** What the signed-in person may do here (from the role, the same lists the routes use). */
  viewer: z.object({
    canWrite: z.boolean().describe('May add and change entries, invoices, payments and trust.'),
    canAdminister: z.boolean().describe('Super admin: may unlock, detach payments, void invoices and payments.'),
  }),
})
export type BillingRecord = z.infer<typeof BillingRecord>

export const BillingClientParams = z.object({ clientId: id.describe('The client account id.') })
export const BillingRecordQuery = z.object({
  matterId: id.optional().describe('Only this matter. Such a load is not cached by the browser.'),
})

// ----------------------------------------------------------------------------------------------------------
// Writes

export const BillingWriteData = z.object({ id: z.string() })
export type BillingWriteData = z.infer<typeof BillingWriteData>

export const TimeEntryParams = BillingClientParams.extend({ entryId: id })
export const TimeEntryBody = z
  .object({
    matterId: id,
    date: dateText,
    description: text(4000),
    activityCategory: text(120).optional(),
    kind: BillingEntryKind,
    hours: money.min(0),
    rate: money.min(0),
    amount: money.min(0),
    billingStatus: BillingStatus,
    staffId: id.optional(),
    internalTimeTracked: z.boolean().optional(),
  })
  .strict()
export type TimeEntryBody = z.infer<typeof TimeEntryBody>

export const InvoiceParams = BillingClientParams.extend({ invoiceId: id })
export const InvoiceBody = z
  .object({
    matterId: id,
    /** Left out on create: the next number (firm-wide highest plus one). */
    invoiceNumber: text(40).optional(),
    invoiceDate: dateText,
    dueDate: dateText.optional(),
    /** Zero or negative: the write-off shown on the invoice. */
    writeOff: money.max(0),
    entryIds: z.array(id).max(500),
  })
  .strict()
export type InvoiceBody = z.infer<typeof InvoiceBody>
export const InvoiceCreateData = z.object({ id: z.string(), invoiceNumber: z.string() })
export type InvoiceCreateData = z.infer<typeof InvoiceCreateData>
export const InvoiceVoidBody = z.object({ reason: text(500).optional() }).strict()

export const PaymentParams = BillingClientParams.extend({ paymentId: id })
export const PaymentBody = z
  .object({
    /** Needed when the payment is not applied to an invoice. */
    matterId: id.optional(),
    /** The invoices this payment pays, at most 10. Empty: unapplied money on the matter. */
    invoiceAllocations: z.array(z.object({ invoiceId: id, amount: money.positive() }).strict()).max(10),
    amount: money.positive(),
    /** Positive: an approved write-off posted with the payment (one invoice only). */
    writeOff: money.min(0).optional(),
    receivedDate: dateText,
    paymentType: BillingPaymentType,
    referenceNumber: text(120).optional(),
    memo: text(1000).optional(),
    paymentNumber: text(60).optional(),
  })
  .strict()
export type PaymentBody = z.infer<typeof PaymentBody>
export const PaymentVoidBody = z
  .object({
    reason: text(500),
    /** Stripe card payments: refund the card first. Refunds arrive in stage 6; until then only `false` is accepted for them. */
    refund: z.boolean(),
  })
  .strict()
export const PaymentVoidData = z.object({ id: z.string(), invoicesUpdated: z.number().int(), refund: BillingPaymentRefund.nullable() })
export type PaymentVoidData = z.infer<typeof PaymentVoidData>

export const TrustRequestParams = BillingClientParams.extend({ requestId: id })
export const TrustRequestBody = z
  .object({
    matterId: id,
    amount: money.min(0),
    date: dateText.optional(),
    note: text(1000).optional(),
    requestNumber: text(60).optional(),
  })
  .strict()
export type TrustRequestBody = z.infer<typeof TrustRequestBody>
export const TrustEntryBody = z
  .object({
    matterId: id,
    action: z.enum(['deposit', 'disbursement']),
    amount: money.positive(),
    date: dateText.optional(),
    requestNumber: text(60).optional(),
    note: text(1000).optional(),
  })
  .strict()
export type TrustEntryBody = z.infer<typeof TrustEntryBody>

export const LedgerEntryParams = BillingClientParams.extend({ entryId: id })
export const LedgerEntryBody = z
  .object({
    matterId: id,
    date: dateText,
    description: text(2000),
    amount: money.min(0),
  })
  .strict()
export type LedgerEntryBody = z.infer<typeof LedgerEntryBody>
