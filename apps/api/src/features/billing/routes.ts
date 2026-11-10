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
 *   POST   /v1/billing/clients/{clientId}/payments/{paymentId}/void           (super admin)
 *   POST   /v1/billing/clients/{clientId}/trust-requests                      add a trust request
 *   PATCH  /v1/billing/clients/{clientId}/trust-requests/{requestId}          change one
 *   POST   /v1/billing/clients/{clientId}/trust-entries                       trust deposit or disbursement
 *   PATCH  /v1/billing/clients/{clientId}/ledger-entries/{entryId}            change a manual register row
 *
 * Who may call (old role lists, unchanged): reading, the office read roles; writing, the billing write roles;
 * unlock, detach, void and payment void, super admin only (the old route checked that inside and answered 422; here
 * it is the route's access and answers 403). Outside tools: closed (no `toolAccess`).
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
  PaymentBody,
  PaymentParams,
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
import { billingQueriesFor, type BillingQueries } from './queries.ts'
import {
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
  503: errorBody('The database cannot be reached (BILLING_UNAVAILABLE).'),
}

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
    responses: { [spec.status]: { description: 'Done.', content: json(successEnvelope(spec.data)) }, ...writeResponses },
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
  summary: 'Unlink every payment and write-off from the invoice (they stay on the register) and reset what was paid.',
  superAdmin: true,
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_HAS_NO_PAYMENTS'],
  sideEffects: ['Writes ledger_entry, invoice'],
  params: InvoiceParams,
  status: 200,
  data: BillingWriteData.extend({ detached: z.number().int() }),
})
export const voidInvoiceRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/void',
  summary: 'Void an invoice: its entries become billable again, its lines are hidden, its ledger posting is voided. Refused while payments are attached.',
  superAdmin: true,
  errors: ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_HAS_PAYMENTS', 'VALIDATION_INVOICE_ALREADY_VOID'],
  sideEffects: ['Writes invoice, invoice_line_item, ledger_entry, time_entry'],
  params: InvoiceParams,
  body: InvoiceVoidBody,
  status: 200,
  data: BillingWriteData.extend({ entriesReleased: z.number().int() }),
})
export const createPaymentRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/payments',
  summary: 'Post a payment entered by hand (check, cash, wire), applied to up to 10 invoices or left unapplied on a matter. Card and ACH wait for Stripe (stage 6).',
  errors: [
    'VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED',
    'VALIDATION_PAYMENT_INVOICE_ALLOCATIONS_DUPLICATE',
    'VALIDATION_PAYMENT_WRITE_OFF_REQUIRES_SINGLE_INVOICE',
    'VALIDATION_PAYMENT_INVOICE_NOT_FOUND',
    'VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT',
    'VALIDATION_PAYMENT_EXCEEDS_BALANCE',
    'VALIDATION_PAYMENT_ALLOCATION_TOTAL',
    'VALIDATION_MISSING_MATTER_ID',
    'VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT',
  ],
  sideEffects: ['Writes payment, ledger_entry, payment_application', 'Writes invoice (paid amount, balance, status)'],
  params: BillingClientParams,
  body: PaymentBody,
  status: 201,
  data: BillingWriteData,
})
export const voidPaymentRoute = writeRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/payments/{paymentId}/void',
  summary: 'Void a payment: its ledger rows, its applications and the invoices it paid are reversed. A card refund waits for stage 6.',
  superAdmin: true,
  errors: ['VALIDATION_PAYMENT_NOT_FOUND', 'VALIDATION_PAYMENT_ALREADY_VOID', 'STRIPE_REFUND_NOT_AVAILABLE'],
  sideEffects: ['Writes payment, ledger_entry, payment_application, invoice'],
  params: PaymentParams,
  body: PaymentVoidBody,
  status: 200,
  data: PaymentVoidData,
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

/** Answers a refused write with its code and status; anything else is rethrown (a 500 with the standard envelope). */
function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof BillingError) {
    logLine('BILLING:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message)
  }
  throw error
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
      const viewer = { canWrite: (BILLING_WRITE_ROLES as readonly string[]).includes(role), canAdminister: role === 'super_admin' }
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
    return { id: p.invoiceId, entriesReleased: await voidInvoice(q, p.clientId, p.invoiceId, valid<{ reason?: string }>(c, 'json').reason, a) }
  })
  handleWrite(app, createPaymentRoute, 201, 'payment_created', async (q, c, a) => ({ id: await createPayment(q, valid<ClientP>(c, 'param').clientId, valid(c, 'json'), a) }))
  handleWrite(app, voidPaymentRoute, 200, 'payment_voided', async (q, c, a) => {
    const p = valid<ClientP & { paymentId: string }>(c, 'param')
    const body = valid<{ reason: string; refund: boolean }>(c, 'json')
    return { id: p.paymentId, invoicesUpdated: await voidPayment(q, p.clientId, p.paymentId, body.reason, body.refund, a), refund: null }
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
