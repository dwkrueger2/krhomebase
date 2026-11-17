// file: apps/api/src/features/billing/routes.ts
/**
 * Billing routes (plan stages 3 and 4). Ported from the old `kr-api-v1/billing` GET, POST, PATCH and DELETE, which
 * took every write at one address with a `resource` field; here each action has its own route (plan difference 1)
 * and every route is under one client. The rules are in `rules.ts`.
 *
 *   GET    /v1/billing/clients/{clientId}                                     the client's billing record
 *   POST   /v1/billing/clients/{clientId}/time-entries                        add a time or flat-fee entry
 *   PATCH  /v1/billing/clients/{clientId}/time-entries/{entryId}              change one (not on a locked invoice)
 *   DELETE /v1/billing/clients/{clientId}/time-entries/{entryId}              delete an unbilled one
 *   POST   /v1/billing/clients/{clientId}/invoices                            create a draft invoice
 *   PATCH  /v1/billing/clients/{clientId}/invoices/{invoiceId}                save a draft invoice
 *   POST   /v1/billing/clients/{clientId}/invoices/{invoiceId}/lock           draft → sent
 *   POST   /v1/billing/clients/{clientId}/invoices/{invoiceId}/unlock         sent → draft (super admin)
 *   POST   /v1/billing/clients/{clientId}/invoices/{invoiceId}/detach-payments  (super admin)
 *   POST   /v1/billing/clients/{clientId}/invoices/{invoiceId}/void           (super admin)
 *   POST   /v1/billing/clients/{clientId}/payments                            post a payment entered by hand
 *   POST   /v1/billing/clients/{clientId}/payments/{paymentId}/void           (super admin; refunds a card first)
 *   POST   /v1/billing/clients/{clientId}/payments/{paymentId}/refresh-refund (super admin; re-reads the refund, part 7e)
 *   POST   /v1/billing/clients/{clientId}/payments/{paymentId}/apply          apply unapplied money to invoices (decision C2)
 *   POST   /v1/billing/clients/{clientId}/trust-requests                      add a trust request
 *   PATCH  /v1/billing/clients/{clientId}/trust-requests/{requestId}          change one
 *   POST   /v1/billing/clients/{clientId}/trust-entries                       trust deposit or disbursement
 *   PATCH  /v1/billing/clients/{clientId}/ledger-entries/{entryId}            change a manual register row
 *
 * Who may call (old role lists, unchanged): reading, the office read roles; writing, the billing write roles;
 * unlock, detach, void and payment void, super admin only (the old route checked that inside and answered 422; here
 * it is the route's access and answers 403). Outside tools: closed (no `toolAccess`).
 *
 * Pay links (Billing part 7d) have their own area, `features/pay-links/` (list, post paid links, print link, the pay
 * Worker's webhook); the invoice void here revokes the invoice's open links after the void is saved.
 *
 * Card payments (Billing part 7e): the card settings and the PaymentIntent have their own area,
 * `features/card-payments/`; here the payment post re-reads a card payment's intent from Stripe, the payment void
 * refunds the card first, and `refresh-refund` (the old PATCH action `refreshRefund`) re-reads the refund and its ARN.
 * Stripe is reached through `paymentStripeFor` (card-payments), handed to the rules.
 */

import {
  BillingClientParams,
  BillingRecord,
  BillingRecordQuery,
  BillingWriteData,
  ErrorEnvelope,
  InvoiceBody,
  InvoiceCreateData,
  InvoiceParams,
  InvoiceVoidBody,
  LedgerEntryBody,
  LedgerEntryParams,
  PaymentApplyBody,
  PaymentApplyData,
  PaymentBody,
  PaymentParams,
  PaymentRefundRefreshData,
  PaymentVoidBody,
  PaymentVoidData,
  successEnvelope,
  TimeEntryBody,
  TimeEntryParams,
  TrustEntryBody,
  TrustRequestBody,
  TrustRequestParams,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { CardPaymentError, paymentStripeFor, type CardPaymentContextEnv } from '../card-payments/rules.ts'
import { payLinkContextFor, revokeInvoicePayLinks, type PayLinkEnv } from '../pay-links/rules.ts'
import { asProviderError } from '../payment-providers/rules.ts'
import { billingQueriesFor, type BillingQueries } from './queries.ts'
import {
  applyUnappliedPayment,
  BillingError,
  createInvoice,
  createPayment,
  createTimeEntry,
  createTrustEntry,
  createTrustRequest,
  deleteTimeEntry,
  detachInvoicePayments,
  loadBillingRecord,
  lockInvoice,
  refreshPaymentRefund,
  unlockInvoice,
  updateInvoice,
  updateLedgerEntry,
  updateTimeEntry,
  updateTrustRequest,
  voidInvoice,
  voidPayment,
  type Actor,
} from './rules.ts'

/** Office roles that may read billing (old KR_API_V1_INTERNAL_READ_ROLES). */
export const BILLING_READ_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'front_end_author'] as const
/** Roles that may write billing (old BILLING_WRITE_ROLES). */
export const BILLING_WRITE_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'office_manager'] as const
const SUPER_ADMIN = ['super_admin'] as const

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const errorBody = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'BILLING_UNAVAILABLE'

/** The refusals every write can give, with the status each uses. */
const writeResponses = {
  404: errorBody('No such client, or the record is not this client\'s.'),
  409: errorBody('The record is locked or already in that state.'),
  422: errorBody('A rule refused the write (VALIDATION_… code).'),
  503: errorBody('The database cannot be reached (BILLING_UNAVAILABLE), or Stripe is not configured (STRIPE_<ENV>_NOT_CONFIGURED, PAYMENT_PROVIDER_…).'),
}
/** Part 7e: a route that calls Stripe can also answer 502 (Stripe refused, or could not be reached). */
const stripeResponses = { 502: errorBody('Stripe refused or could not be reached (STRIPE_REQUEST_FAILED, STRIPE_REFUND_FAILED, STRIPE_NETWORK_ERROR), or the void could not be saved after the refund (PAYMENT_VOID_DATABASE_SYNC_FAILED).') }

type WriteSpec = {
  method: 'post' | 'patch' | 'delete'
  path: string
  summary: string
  superAdmin?: boolean
  errors: readonly string[]
  sideEffects: readonly string[]
  params: z.ZodObject
  body?: z.ZodType
  status: 200 | 201
  data: z.ZodType
  /** Part 7e: the route calls Stripe (adds the 502 answer). */
  stripe?: boolean
}

function writeRoute(spec: WriteSpec) {
  return defineRoute({
    method: spec.method,
    path: spec.path,
    feature: 'billing',
    summary: spec.summary,
    access: { roles: spec.superAdmin ? SUPER_ADMIN : BILLING_WRITE_ROLES },
    errors: ['VALIDATION_CLIENT_NOT_FOUND', ...spec.errors, UNAVAILABLE],
    sideEffects: [...spec.sideEffects, 'Writes audit_log'],
    request: { params: spec.params, ...(spec.body ? { body: { required: true, content: json(spec.body) } } : {}) },
    responses: { [spec.status]: { description: 'Done.', content: json(successEnvelope(spec.data)) }, ...writeResponses, ...(spec.stripe ? stripeResponses : {}) },
  })
}

export const billingRecordRoute = defineRoute({
  method: 'get',
  path: '/v1/billing/clients/{clientId}',
  feature: 'billing',
  summary: "One client's billing record: matters, time and fees, invoices, payments, the register, trust and the account totals.",
  access: { roles: BILLING_READ_ROLES },
  errors: ['VALIDATION_CLIENT_NOT_FOUND', 'VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT', UNAVAILABLE],
  sideEffects: ['None'],
  request: { params: BillingClientParams, query: BillingRecordQuery },
  responses: {
    200: { description: 'The record.', content: json(successEnvelope(BillingRecord)) },
    404: errorBody('No such client account (VALIDATION_CLIENT_NOT_FOUND).'),
    422: errorBody('The matter is not this client\'s.'),
    503: errorBody('The database cannot be reached (BILLING_UNAVAILABLE).'),
  },
})

export const createTimeEntryRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/time-entries',
  summary: 'Add a time or flat-fee entry to one of the client\'s matters.',
  errors: ['VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'],
  sideEffects: ['Writes time_entry'],
  params: BillingClientParams,
  body: TimeEntryBody,
  status: 201,
  data: BillingWriteData,
})
export const updateTimeEntryRoute = writeRoute({
  method: 'patch',
  path: '/v1/billing/clients/{clientId}/time-entries/{entryId}',
  summary: 'Change a time or flat-fee entry. Refused when it is on a locked invoice.',
  errors: ['VALIDATION_TIME_ENTRY_NOT_FOUND', 'VALIDATION_BILLED_TIME_ENTRY_LOCKED', 'VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'],
  sideEffects: ['Writes time_entry'],
  params: TimeEntryParams,
  body: TimeEntryBody,
  status: 200,
  data: BillingWriteData,
})
export const deleteTimeEntryRoute = writeRoute({
  method: 'delete',
  path: '/v1/billing/clients/{clientId}/time-entries/{entryId}',
  summary: 'Delete an unbilled time or flat-fee entry.',
  errors: ['VALIDATION_TIME_ENTRY_NOT_FOUND', 'VALIDATION_BILLED_TIME_ENTRY_LOCKED'],
  sideEffects: ['Deletes time_entry'],
  params: TimeEntryParams,
  status: 200,
  data: BillingWriteData,
})
export const createInvoiceRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices',
  summary: 'Create a draft invoice from unbilled entries of one matter, with its lines and ledger posting. The number is the firm-wide highest plus one unless given.',
  errors: ['VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT', 'VALIDATION_INVOICE_ENTRY_MISMATCH', 'VALIDATION_INVOICE_NUMBER_TAKEN'],
  sideEffects: ['Writes invoice, invoice_line_item, ledger_entry', 'Marks the entries billed (time_entry)'],
  params: BillingClientParams,
  body: InvoiceBody,
  status: 201,
  data: InvoiceCreateData,
})
export const updateInvoiceRoute = writeRoute({
  method: 'patch',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}',
  summary: 'Save a draft invoice: dates, write-off and entries. Removed entries become billable again. Refused when locked.',
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_LOCKED_INVOICE', 'VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT', 'VALIDATION_INVOICE_ENTRY_MISMATCH'],
  sideEffects: ['Writes invoice, invoice_line_item, ledger_entry, time_entry'],
  params: InvoiceParams,
  body: InvoiceBody,
  status: 200,
  data: BillingWriteData,
})
export const lockInvoiceRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/lock',
  summary: 'Lock a draft invoice (status sent).',
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_ALREADY_LOCKED'],
  sideEffects: ['Writes invoice'],
  params: InvoiceParams,
  status: 200,
  data: BillingWriteData,
})
export const unlockInvoiceRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/unlock',
  summary: 'Unlock a sent invoice back to draft. Refused while payments are attached.',
  superAdmin: true,
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_HAS_PAYMENTS', 'VALIDATION_INVOICE_NOT_LOCKED', 'VALIDATION_INVOICE_VOID'],
  sideEffects: ['Writes invoice'],
  params: InvoiceParams,
  status: 200,
  data: BillingWriteData,
})
export const detachInvoicePaymentsRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/detach-payments',
  summary: "Unlink every payment and write-off from the invoice (they stay on the register) and reset what was paid. Each payment's detached money returns to its unapplied amount, to be applied again.",
  superAdmin: true,
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_HAS_NO_PAYMENTS'],
  sideEffects: ['Writes ledger_entry, invoice, payment (unapplied amount), payment_application (marked detached)'],
  params: InvoiceParams,
  status: 200,
  data: BillingWriteData.extend({ detached: z.number().int() }),
})
export const voidInvoiceRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/void',
  summary: 'Void an invoice: its entries become billable again, its lines are hidden, its ledger posting is voided, and its open pay links are revoked. Refused while payments are attached.',
  superAdmin: true,
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_HAS_PAYMENTS', 'VALIDATION_INVOICE_ALREADY_VOID'],
  sideEffects: ['Writes invoice, invoice_line_item, ledger_entry, time_entry', 'Writes payment_request (revokes the open pay links)', 'Calls Stripe (cancels their open PaymentIntents)'],
  params: InvoiceParams,
  body: InvoiceVoidBody,
  status: 200,
  data: BillingWriteData.extend({
    entriesReleased: z.number().int(),
    payLinksRevoked: z.number().int().describe('Open pay links (emailed or printed) of the invoice that were revoked (Billing part 7d).'),
  }),
})
export const createPaymentRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/payments',
  summary:
    'Post a payment (check, cash, wire, or a credit card charged through Stripe), applied to up to 10 invoices or left unapplied on a matter. A card payment is re-read from Stripe before anything is written; an intent already recorded answers its payment. ACH is not posted yet.',
  errors: [
    'VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED',
    'VALIDATION_STRIPE_ACH_NOT_IMPLEMENTED',
    'VALIDATION_STRIPE_PAYMENT_TYPE_MISMATCH',
    'VALIDATION_STRIPE_PAYMENT_REQUIRES_INVOICE',
    'VALIDATION_STRIPE_PAYMENT_INTENT_INVALID',
    'VALIDATION_STRIPE_PAYMENT_NOT_SUCCEEDED',
    'VALIDATION_STRIPE_PAYMENT_INVOICE_MISMATCH',
    'VALIDATION_STRIPE_PAYMENT_ENVIRONMENT_MISMATCH',
    'VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH',
    'STRIPE_REQUEST_FAILED',
    'STRIPE_NETWORK_ERROR',
    'STRIPE_SANDBOX_NOT_CONFIGURED',
    'STRIPE_LIVE_NOT_CONFIGURED',
    'VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE',
    'VALIDATION_PAYMENT_WRITE_OFF_REQUIRES_SINGLE_INVOICE',
    'VALIDATION_PAYMENT_INVOICE_NOT_FOUND',
    'VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT',
    'VALIDATION_INVOICE_IS_DRAFT',
    'VALIDATION_PAYMENT_EXCEEDS_BALANCE',
    'VALIDATION_PAYMENT_ALLOCATION_TOTAL',
    'VALIDATION_MISSING_MATTER_ID',
    'VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT',
  ],
  sideEffects: ['Writes payment, ledger_entry, payment_application', 'Writes invoice (paid amount, balance, status)', "Calls Stripe (re-reads a card payment's PaymentIntent)"],
  params: BillingClientParams,
  body: PaymentBody,
  status: 201,
  data: BillingWriteData,
  stripe: true,
})
export const voidPaymentRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/payments/{paymentId}/void',
  summary:
    'Void a payment: its ledger rows, its applications and the invoices it paid are reversed. A Stripe card payment is refunded in full first when `refund` is true (an earlier refund of the intent is reused); a failed refund stops the void.',
  superAdmin: true,
  errors: ['VALIDATION_PAYMENT_NOT_FOUND', 'VALIDATION_PAYMENT_ALREADY_VOID', 'STRIPE_REFUND_FAILED', 'STRIPE_NETWORK_ERROR', 'PAYMENT_VOID_DATABASE_SYNC_FAILED', 'STRIPE_SANDBOX_NOT_CONFIGURED', 'STRIPE_LIVE_NOT_CONFIGURED'],
  sideEffects: ['Writes payment (with the refund), ledger_entry, payment_application, invoice', 'Calls Stripe (refunds a card payment)'],
  params: PaymentParams,
  body: PaymentVoidBody,
  status: 200,
  data: PaymentVoidData,
  stripe: true,
})
export const refreshPaymentRefundRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/payments/{paymentId}/refresh-refund',
  summary: "Read a voided card payment's Stripe refund again and store its status and refund reference (ARN), which live Stripe often has only days after the refund.",
  superAdmin: true,
  errors: ['VALIDATION_PAYMENT_NOT_FOUND', 'VALIDATION_PAYMENT_HAS_NO_REFUND', 'VALIDATION_STRIPE_REFUND_ID_INVALID', 'STRIPE_REQUEST_FAILED', 'STRIPE_NETWORK_ERROR', 'STRIPE_SANDBOX_NOT_CONFIGURED', 'STRIPE_LIVE_NOT_CONFIGURED'],
  sideEffects: ['Writes payment (refund status and ARN)', 'Calls Stripe (reads the refund)'],
  params: PaymentParams,
  status: 200,
  data: PaymentRefundRefreshData,
  stripe: true,
})
export const applyPaymentRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/payments/{paymentId}/apply',
  summary:
    "Apply a payment's unapplied money to up to 10 open invoices of the client (decision C2). The register already counted the payment, so its unapplied credits are moved onto the invoices (dated the day the money came in) and the client's balance does not change.",
  errors: [
    'VALIDATION_PAYMENT_NOT_FOUND',
    'VALIDATION_PAYMENT_ALREADY_VOID',
    'VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE',
    'VALIDATION_PAYMENT_ALLOCATION_AMOUNT',
    'VALIDATION_PAYMENT_INVOICE_NOT_FOUND',
    'VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT',
    'VALIDATION_INVOICE_IS_DRAFT',
    'VALIDATION_PAYMENT_EXCEEDS_BALANCE',
    'VALIDATION_PAYMENT_EXCEEDS_UNAPPLIED',
    'VALIDATION_PAYMENT_UNAPPLIED_LEDGER_MISMATCH',
    'BILLING_CHANGED_DURING_APPLY',
  ],
  sideEffects: ['Writes payment (unapplied amount), ledger_entry (moves the unapplied credits onto the invoices), payment_application', 'Writes invoice (paid amount, balance, status)'],
  params: PaymentParams,
  body: PaymentApplyBody,
  status: 200,
  data: PaymentApplyData,
})
export const createTrustRequestRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/trust-requests',
  summary: 'Add a trust request (a draft request for money into trust).',
  errors: ['VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'],
  sideEffects: ['Writes trust_request'],
  params: BillingClientParams,
  body: TrustRequestBody,
  status: 201,
  data: BillingWriteData,
})
export const updateTrustRequestRoute = writeRoute({
  method: 'patch',
  path: '/v1/billing/clients/{clientId}/trust-requests/{requestId}',
  summary: 'Change a trust request\'s amount, date or note.',
  errors: ['VALIDATION_TRUST_REQUEST_NOT_FOUND'],
  sideEffects: ['Writes trust_request'],
  params: TrustRequestParams,
  body: TrustRequestBody,
  status: 200,
  data: BillingWriteData,
})
export const createTrustEntryRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/trust-entries',
  summary: 'Record a trust deposit or disbursement on the trust ledger.',
  errors: ['VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'],
  sideEffects: ['Writes ledger_entry'],
  params: BillingClientParams,
  body: TrustEntryBody,
  status: 201,
  data: BillingWriteData,
})
export const updateLedgerEntryRoute = writeRoute({
  method: 'patch',
  path: '/v1/billing/clients/{clientId}/ledger-entries/{entryId}',
  summary: 'Change a manual register row. Rows posted by an invoice or payment are refused.',
  errors: ['VALIDATION_LEDGER_ENTRY_NOT_FOUND', 'VALIDATION_SYSTEM_LEDGER_ENTRY_LOCKED', 'VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'],
  sideEffects: ['Writes ledger_entry'],
  params: LedgerEntryParams,
  body: LedgerEntryBody,
  status: 200,
  data: BillingWriteData,
})

const unavailable = (c: Context<AppEnv>) => failure(c, 503, UNAVAILABLE, 'Billing is not available right now.')

function actorOf(c: Context<AppEnv>): Actor {
  const session = c.get('session')
  return { userId: session?.userId ?? '', email: session?.email ?? '', role: session?.role ?? '', requestId: c.get('requestId') }
}

/**
 * Answers a refused write with its code and status; anything else is rethrown (a 500 with the standard envelope).
 * Part 7e: Stripe refusals (`CardPaymentError`) and the Stripe configuration's (`PaymentProviderError`, a missing key
 * or a network failure) are answered with their own codes too.
 */
function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof BillingError || error instanceof CardPaymentError) {
    logLine('BILLING:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message, error.details)
  }
  const provider = asProviderError(error)
  if (provider) {
    logLine('BILLING:refused', c.get('requestId'), { code: provider.code })
    return failure(c, provider.status === 404 || provider.status === 409 ? 503 : provider.status, provider.code, provider.message, provider.details)
  }
  throw error
}

/** The Stripe side of card payments for this request (keys read only when Stripe is called). */
function stripeOf(c: Context<AppEnv>, actor: Actor) {
  return paymentStripeFor(c.env as unknown as CardPaymentContextEnv, { userId: actor.userId, email: actor.email, role: actor.role, requestId: actor.requestId })
}

/**
 * Registers one write: finds the database, runs `work`, answers `{ ok, data, requestId }` with `status`, and maps a
 * `BillingError` to its refusal. Typed loosely on purpose: every write route declares the same refusals.
 */
function handleWrite<D>(
  app: OpenAPIHono<AppEnv>,
  route: ReturnType<typeof writeRoute>,
  status: 200 | 201,
  event: string,
  work: (queries: BillingQueries, c: Context<AppEnv>, actor: Actor) => Promise<D>,
) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = billingQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const actor = actorOf(c)
    try {
      const data = await work(queries, c, actor)
      logLine(`BILLING:${event}`, actor.requestId)
      return c.json({ ok: true as const, data, requestId: actor.requestId }, status)
    } catch (error) {
      return refused(c, error)
    }
  }) as any)
}

// Valid input, read once the route has checked it (hono's `c.req.valid` is typed per route; the write helper is shared).
const valid = <T,>(c: Context<AppEnv>, target: 'param' | 'json'): T => (c.req as any).valid(target) as T

export function registerBilling(app: OpenAPIHono<AppEnv>) {
  app.openapi(billingRecordRoute, async (c) => {
    const queries = billingQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { clientId } = c.req.valid('param')
    const { matterId } = c.req.valid('query')
    try {
      const role = c.get('session')?.role ?? ''
      // userId (FB-0008): a new time entry starts with the signed-in person as its staff.
      const viewer = { canWrite: (BILLING_WRITE_ROLES as readonly string[]).includes(role), canAdminister: role === 'super_admin', userId: c.get('session')?.userId ?? '' }
      const data = { ...(await loadBillingRecord(queries, clientId, matterId ?? null)), viewer }
      logLine('BILLING:record', c.get('requestId'), { matters: data.matters.length, entries: data.timeEntries.length, invoices: data.invoices.length, ledger: data.ledgerEntries.length })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof BillingError && (error.status === 404 || error.status === 422)) return failure(c, error.status, error.code, error.message)
      throw error
    }
  })

  type ClientP = { clientId: string }
  handleWrite(app, createTimeEntryRoute, 201, 'time_entry_created', async (q, c, a) => ({ id: await createTimeEntry(q, valid<ClientP>(c, 'param').clientId, valid(c, 'json'), a) }))
  handleWrite(app, updateTimeEntryRoute, 200, 'time_entry_updated', async (q, c, a) => {
    const p = valid<ClientP & { entryId: string }>(c, 'param')
    await updateTimeEntry(q, p.clientId, p.entryId, valid(c, 'json'), a)
    return { id: p.entryId }
  })
  handleWrite(app, deleteTimeEntryRoute, 200, 'time_entry_deleted', async (q, c, a) => {
    const p = valid<ClientP & { entryId: string }>(c, 'param')
    await deleteTimeEntry(q, p.clientId, p.entryId, a)
    return { id: p.entryId }
  })
  handleWrite(app, createInvoiceRoute, 201, 'invoice_created', async (q, c, a) => createInvoice(q, valid<ClientP>(c, 'param').clientId, valid(c, 'json'), a))
  handleWrite(app, updateInvoiceRoute, 200, 'invoice_updated', async (q, c, a) => {
    const p = valid<ClientP & { invoiceId: string }>(c, 'param')
    await updateInvoice(q, p.clientId, p.invoiceId, valid(c, 'json'), a)
    return { id: p.invoiceId }
  })
  handleWrite(app, lockInvoiceRoute, 200, 'invoice_locked', async (q, c, a) => {
    const p = valid<ClientP & { invoiceId: string }>(c, 'param')
    await lockInvoice(q, p.clientId, p.invoiceId, a)
    return { id: p.invoiceId }
  })
  handleWrite(app, unlockInvoiceRoute, 200, 'invoice_unlocked', async (q, c, a) => {
    const p = valid<ClientP & { invoiceId: string }>(c, 'param')
    await unlockInvoice(q, p.clientId, p.invoiceId, a)
    return { id: p.invoiceId }
  })
  handleWrite(app, detachInvoicePaymentsRoute, 200, 'invoice_payments_detached', async (q, c, a) => {
    const p = valid<ClientP & { invoiceId: string }>(c, 'param')
    return { id: p.invoiceId, detached: await detachInvoicePayments(q, p.clientId, p.invoiceId, a) }
  })
  handleWrite(app, voidInvoiceRoute, 200, 'invoice_voided', async (q, c, a) => {
    const p = valid<ClientP & { invoiceId: string }>(c, 'param')
    const entriesReleased = await voidInvoice(q, p.clientId, p.invoiceId, valid<{ reason?: string }>(c, 'json').reason, a)
    // Billing part 7d (audit table 3.1): a voided invoice's open links, emailed or printed, stop working. After the
    // void, because revoking cancels the Stripe intent first; a failure is logged and the void stands.
    const payLinks = payLinkContextFor(c.env as unknown as PayLinkEnv, { userId: a.userId, email: a.email, role: a.role, requestId: a.requestId })
    const payLinksRevoked = payLinks ? await revokeInvoicePayLinks(payLinks, p.invoiceId, 'Invoice voided').catch(() => 0) : 0
    return { id: p.invoiceId, entriesReleased, payLinksRevoked }
  })
  handleWrite(app, createPaymentRoute, 201, 'payment_created', async (q, c, a) => ({ id: await createPayment(q, valid<ClientP>(c, 'param').clientId, valid(c, 'json'), a, stripeOf(c, a)) }))
  handleWrite(app, voidPaymentRoute, 200, 'payment_voided', async (q, c, a) => {
    const p = valid<ClientP & { paymentId: string }>(c, 'param')
    const body = valid<{ reason: string; refund: boolean }>(c, 'json')
    const result = await voidPayment(q, p.clientId, p.paymentId, body.reason, body.refund, a, stripeOf(c, a))
    return { id: p.paymentId, invoicesUpdated: result.invoicesUpdated, refund: result.refund }
  })
  handleWrite(app, refreshPaymentRefundRoute, 200, 'payment_refund_refreshed', async (q, c, a) => {
    const p = valid<ClientP & { paymentId: string }>(c, 'param')
    return { id: p.paymentId, refund: await refreshPaymentRefund(q, p.clientId, p.paymentId, a, stripeOf(c, a)) }
  })
  handleWrite(app, applyPaymentRoute, 200, 'payment_applied', async (q, c, a) => {
    const p = valid<ClientP & { paymentId: string }>(c, 'param')
    return applyUnappliedPayment(q, p.clientId, p.paymentId, valid(c, 'json'), a)
  })
  handleWrite(app, createTrustRequestRoute, 201, 'trust_request_created', async (q, c, a) => ({ id: await createTrustRequest(q, valid<ClientP>(c, 'param').clientId, valid(c, 'json'), a) }))
  handleWrite(app, updateTrustRequestRoute, 200, 'trust_request_updated', async (q, c, a) => {
    const p = valid<ClientP & { requestId: string }>(c, 'param')
    await updateTrustRequest(q, p.clientId, p.requestId, valid(c, 'json'), a)
    return { id: p.requestId }
  })
  handleWrite(app, createTrustEntryRoute, 201, 'trust_entry_created', async (q, c, a) => ({ id: await createTrustEntry(q, valid<ClientP>(c, 'param').clientId, valid(c, 'json'), a) }))
  handleWrite(app, updateLedgerEntryRoute, 200, 'ledger_entry_updated', async (q, c, a) => {
    const p = valid<ClientP & { entryId: string }>(c, 'param')
    await updateLedgerEntry(q, p.clientId, p.entryId, valid(c, 'json'), a)
    return { id: p.entryId }
  })
}
