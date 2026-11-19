// file: apps/api/src/features/card-payments/rules.ts
/**
 * Card payments and card refunds for Billing (Billing part 7e, `docs/API/Billing_Audit.md` section 6.4). Ported from
 * the old `kr-api-v1/billing/card-payment` route (settings and `create-intent`), `_server/krStripeBillingPayments.ts`
 * (create, verify, refund and read a refund) and `_server/krStripeSettings.ts` (the environment rule). The routes are
 * in `routes.ts`; the reads in `queries.ts`. Stripe is reached only through `platform/stripeApi.ts`, with the keys of
 * Settings → Stripe Payment Configuration (`readStripeCredentials`).
 *
 * Flow (old, kept):
 * 1. `cardPaymentConfig` — Stripe.js settings (publishable key, the environment the server will use, whether the person
 *    may switch) and the payer's names and email for the card rows.
 * 2. `createCardPaymentIntent` — checks the allocations (at least $0.50, every amount within its invoice's balance, at
 *    most 10 invoices, the amounts add up) and creates a PaymentIntent with `kr_source` metadata. Live: not confirmed;
 *    the browser confirms it with Stripe.js (the card typed into Stripe Elements). Sandbox: a Stripe test card scenario
 *    is required, and the server charges Stripe's matching test PaymentMethod and confirms it at once, so a real card
 *    number can never be typed into the sandbox; live refuses a test scenario.
 * 3. Posting (`billing/rules.ts` `createPayment` with `stripePaymentIntentId`) re-reads the PaymentIntent from Stripe
 *    (`verifyBillingCardPaymentIntent`) and posts it only when it succeeded for the same invoices and amounts. The
 *    browser's word is never trusted.
 * 4. Void with refund (`billing/rules.ts` `voidPayment`) refunds in full first (`refundBillingCardPayment`, reusing an
 *    earlier refund of the intent); a failed refund stops the void. `getBillingRefund` re-reads a refund and its ARN.
 *
 * The environment (`billingStripeEnvironment`): the setting `KR_STRIPE_BILLING_ENVIRONMENT` when set, else sandbox on a
 * development server (`KR_APP_BASE_URL` a localhost address, `pnpm dev`) and live otherwise, the same rule as new pay
 * links (`payLinkEnvironment`). A super admin on a development server may choose sandbox or live (old
 * `canChooseKrStripeEnvironment`); on any other server nobody may, so a deployed KR Homebase never takes a choice from
 * the browser. A payment's refund always uses the payment's own environment (`stripe_sandbox` / `stripe_live`).
 *
 * Changed from the old code:
 *  - `NODE_ENV` (which a Worker does not have) is replaced by the settings above.
 *  - The intent check also requires the environment (`livemode`), as the pay links' check does
 *    (`VALIDATION_STRIPE_PAYMENT_ENVIRONMENT_MISMATCH`).
 *  - Stripe failures are `STRIPE_REQUEST_FAILED` / `STRIPE_REFUND_FAILED` with Stripe's own code in
 *    `details.stripeCode` (the old code glued it to the code after a colon), as Stripe Payment Configuration does.
 *  - The `fetch` used to reach Stripe is a parameter (tests pass a stand-in).
 *
 * Log tags: [CARD_PAYMENTS:*]
 */

import {
  CARD_PAYMENT_MIN_AMOUNT_CENTS,
  findStripeDevTestScenario,
  type BillingStripeEnvironment,
  type CardPaymentConfigData,
  type CardPaymentIntentBody,
  type CardPaymentIntentData,
} from '@krhomebase/contracts'
import { logLine } from '../../platform/log.ts'
import { isDevelopmentServer } from '../../platform/runtime.ts'
import { callStripeApi, type StripeCredentials, type StripeFetch } from '../../platform/stripeApi.ts'
import type { PaymentStripe, StripeRefundDetails, VerifiedCardIntent } from '../billing/rules.ts'
import { KR_STRIPE_BILLING_SOURCE, payLinkEnvironment } from '../pay-links/rules.ts'
import { paymentProviderQueriesFor } from '../payment-providers/queries.ts'
import { asProviderError, readStripeCredentials, type StripeEnvironmentCredentials } from '../payment-providers/rules.ts'
import type { WorkstreamQueries } from '../workstream/queries.ts'
import { emailRecipients } from '../workstream/rules.ts'
import type { CardPaymentQueries } from './queries.ts'

/** A refused or failed card call: code, HTTP status, a plain sentence and safe details. */
export class CardPaymentError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422 | 502 | 503,
    message?: string,
    readonly details?: Record<string, string>,
  ) {
    super(message ?? code)
    this.name = 'CardPaymentError'
  }
}

/** The server settings the environment rule reads. */
export type CardPaymentEnv = { KR_STRIPE_BILLING_ENVIRONMENT?: unknown; KR_APP_BASE_URL?: unknown }

const INTENT_PATTERN = /^pi_[A-Za-z0-9]{8,64}$/
const REFUND_PATTERN = /^re_[A-Za-z0-9]{8,64}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * True on a development server: `KR_APP_BASE_URL` is a localhost address (`pnpm dev`). The rule moved to
 * `platform/runtime.ts` in repository patch 58 (the outside tools use it too); it is re-exported here unchanged.
 */
export { isDevelopmentServer }

/**
 * Whether a person may choose between sandbox and live for billing card payments: only a super admin on a development
 * server (old `canChooseKrStripeEnvironment`: a super admin in a development runtime).
 */
export function canChooseStripeEnvironment(env: CardPaymentEnv, role: string | null | undefined): boolean {
  return role === 'super_admin' && isDevelopmentServer(env)
}

/**
 * The Stripe environment a billing card payment uses. The browser may ask, but the server decides (old
 * `resolveKrStripeBillingEnvironment`): the server's environment (`payLinkEnvironment`), unless the person may choose
 * and asked for one.
 */
export function billingStripeEnvironment(env: CardPaymentEnv, requested: unknown, role: string | null | undefined): BillingStripeEnvironment {
  const base = payLinkEnvironment(env)
  if (!canChooseStripeEnvironment(env, role)) return base
  return requested === 'live' || requested === 'sandbox' ? requested : base
}

/** `stripe_live` → live; any other Stripe source → sandbox (old `stripeEnvironmentOf`). */
export function stripeEnvironmentOfSource(source: string | null | undefined): BillingStripeEnvironment {
  return source === 'stripe_live' ? 'live' : 'sandbox'
}

// ---------------------------------------------------------------------------------------------------------------
// Stripe calls (old krStripeBillingPayments.ts)

/** Inputs for a billing PaymentIntent. */
export interface BillingCardIntentInput {
  requestId: string
  amountCents: number
  currency: string
  description: string
  cardholderName: string
  email: string
  invoiceId: string
  invoiceNumber: string
  ivid: string | null
  clientId: string
  clientNumber: string
  icid: string | null
  matterId: string
  /** Invoice ids and amounts this single PaymentIntent will cover. */
  invoiceAllocations: Array<{ invoiceId: string; amountCents: number }>
  userId: string
  /** Sandbox only: Stripe test PaymentMethod (`pm_card_visa`, …) to charge and confirm on the server. */
  testPaymentMethodId?: string | null
}

/** Result of creating (and, for sandbox test cards, confirming) a billing PaymentIntent. */
export interface BillingCardIntentResult {
  paymentIntentId: string
  clientSecret: string
  /** Set when the server confirmed (sandbox test card); null when Stripe.js will confirm. */
  status: string | null
  errorCode: string | null
  declineCode: string | null
  errorMessage: string | null
}

/** `kr_invoice_allocations` metadata: `invoiceId:cents` sorted by invoice id, joined by commas. */
export function allocationMetadata(allocations: ReadonlyArray<{ invoiceId: string; amountCents: number }>): string {
  return [...allocations]
    .sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))
    .map((allocation) => `${allocation.invoiceId}:${allocation.amountCents}`)
    .join(',')
}

/** Stripe's code of a failed call, for `details.stripeCode`. */
function stripeCodeOf(response: { error: { code?: string; type?: string } | null; status: number }): string {
  return String(response.error?.code ?? response.error?.type ?? response.status)
}

/**
 * Creates (does not confirm) a card PaymentIntent for the invoices; a sandbox test card is charged and confirmed now.
 *
 * @returns PaymentIntent id and client secret for Stripe.js; a sandbox test decline returns its codes instead.
 * @throws CardPaymentError `STRIPE_REQUEST_FAILED` (Stripe's code in `details.stripeCode`),
 *   `VALIDATION_STRIPE_PAYMENT_ALLOCATIONS_TOO_LARGE`.
 */
export async function createBillingCardPaymentIntent(credentials: StripeCredentials, input: BillingCardIntentInput, fetcher?: StripeFetch): Promise<BillingCardIntentResult> {
  const form = new URLSearchParams()
  form.set('amount', String(input.amountCents))
  form.set('currency', input.currency)
  form.append('payment_method_types[]', 'card')
  form.set('description', input.description.slice(0, 200))
  if (EMAIL_PATTERN.test(input.email)) form.set('receipt_email', input.email)
  form.set('metadata[kr_source]', KR_STRIPE_BILLING_SOURCE)
  form.set('metadata[kr_invoice_id]', input.invoiceId)
  form.set('metadata[kr_invoice_number]', input.invoiceNumber)
  const allocations = allocationMetadata(input.invoiceAllocations)
  if (!allocations || allocations.length > 500) throw new CardPaymentError('VALIDATION_STRIPE_PAYMENT_ALLOCATIONS_TOO_LARGE', 422, 'The invoice list is too long for one card payment.')
  form.set('metadata[kr_invoice_allocations]', allocations)
  if (input.ivid) form.set('metadata[kr_ivid]', input.ivid)
  form.set('metadata[kr_client_id]', input.clientId)
  form.set('metadata[kr_client_number]', input.clientNumber)
  if (input.icid) form.set('metadata[kr_icid]', input.icid)
  form.set('metadata[kr_matter_id]', input.matterId)
  form.set('metadata[kr_cardholder_name]', input.cardholderName.slice(0, 100))
  form.set('metadata[kr_requested_by_user_id]', input.userId)
  form.set('metadata[kr_request_id]', input.requestId)
  if (input.testPaymentMethodId) {
    // Sandbox test card: charge Stripe's predefined test PaymentMethod and confirm now.
    form.set('payment_method', input.testPaymentMethodId)
    form.set('confirm', 'true')
    form.set('metadata[kr_test_payment_method]', input.testPaymentMethodId)
  }

  const response = await callStripeApi<{ id?: string; client_secret?: string; status?: string }>(credentials, 'POST', '/v1/payment_intents', form, `kr-billing-intent-${input.requestId}`, fetcher)
  // A test decline is an expected sandbox outcome: return the PaymentIntent and the decline codes.
  if (input.testPaymentMethodId && response.error?.type === 'card_error') {
    const intent = response.error.payment_intent ?? null
    const paymentIntentId = intent && typeof intent.id === 'string' ? intent.id : ''
    const clientSecret = intent && typeof intent.client_secret === 'string' ? intent.client_secret : ''
    logLine('CARD_PAYMENTS:sandbox-declined', input.requestId, { pi: paymentIntentId || 'none', code: response.error.code ?? 'none', decline: response.error.decline_code ?? 'none' })
    return {
      paymentIntentId,
      clientSecret,
      status: intent && typeof intent.status === 'string' ? intent.status : 'requires_payment_method',
      errorCode: response.error.code ?? 'card_declined',
      declineCode: response.error.decline_code ?? null,
      errorMessage: response.error.message ?? null,
    }
  }
  if (!response.ok || !response.body?.id || !response.body.client_secret) {
    logLine('CARD_PAYMENTS:create-intent-failed', input.requestId, { status: response.status, code: stripeCodeOf(response) })
    throw new CardPaymentError('STRIPE_REQUEST_FAILED', 502, 'Stripe refused the request.', { stripeCode: stripeCodeOf(response) })
  }
  logLine('CARD_PAYMENTS:intent-created', input.requestId, { pi: response.body.id, invoice: input.invoiceNumber, amountCents: input.amountCents })
  return {
    paymentIntentId: response.body.id,
    clientSecret: response.body.client_secret,
    status: input.testPaymentMethodId ? (response.body.status ?? null) : null,
    errorCode: null,
    declineCode: null,
    errorMessage: null,
  }
}

/**
 * Re-reads a PaymentIntent from Stripe and confirms it is a succeeded card payment for these invoices, this amount and
 * this environment.
 *
 * @throws CardPaymentError `VALIDATION_STRIPE_PAYMENT_*` when it does not match, `STRIPE_REQUEST_FAILED` when Stripe fails.
 */
export async function verifyBillingCardPaymentIntent(
  credentials: StripeCredentials,
  paymentIntentId: string,
  expected: { invoiceAllocations: Array<{ invoiceId: string; amountCents: number }>; amountCents: number; environment: BillingStripeEnvironment; requestId: string },
  fetcher?: StripeFetch,
): Promise<VerifiedCardIntent> {
  if (!INTENT_PATTERN.test(paymentIntentId)) throw new CardPaymentError('VALIDATION_STRIPE_PAYMENT_INTENT_INVALID', 422, 'That is not a Stripe PaymentIntent id.')
  const response = await callStripeApi<Record<string, unknown>>(credentials, 'GET', `/v1/payment_intents/${paymentIntentId}?expand[]=latest_charge`, undefined, undefined, fetcher)
  if (!response.ok || !response.body) throw new CardPaymentError('STRIPE_REQUEST_FAILED', 502, 'Stripe could not confirm the payment.', { stripeCode: stripeCodeOf(response) })
  const intent = response.body
  const metadata = (intent.metadata && typeof intent.metadata === 'object' ? intent.metadata : {}) as Record<string, unknown>
  if (intent.status !== 'succeeded') throw new CardPaymentError('VALIDATION_STRIPE_PAYMENT_NOT_SUCCEEDED', 422, 'Stripe has not confirmed this payment as succeeded.')
  const expectedAllocations = allocationMetadata(expected.invoiceAllocations)
  const recordedAllocations = typeof metadata.kr_invoice_allocations === 'string' ? metadata.kr_invoice_allocations : ''
  const invoiceMetadataMatches = recordedAllocations
    ? recordedAllocations === expectedAllocations
    : expected.invoiceAllocations.length === 1 && metadata.kr_invoice_id === expected.invoiceAllocations[0]?.invoiceId
  if (metadata.kr_source !== KR_STRIPE_BILLING_SOURCE || !invoiceMetadataMatches) throw new CardPaymentError('VALIDATION_STRIPE_PAYMENT_INVOICE_MISMATCH', 422, 'The Stripe payment was made for other invoices or amounts.')
  // New (audit 6.4): the intent must belong to the environment the payment is recorded in.
  if ((intent.livemode === true) !== (expected.environment === 'live')) throw new CardPaymentError('VALIDATION_STRIPE_PAYMENT_ENVIRONMENT_MISMATCH', 422, 'The Stripe payment was made in the other environment (sandbox or live).')
  const received = typeof intent.amount_received === 'number' ? intent.amount_received : 0
  if (received !== expected.amountCents) throw new CardPaymentError('VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH', 422, 'The Stripe payment amount does not match the amount being posted.')
  const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? (intent.latest_charge as { payment_method_details?: { card?: { brand?: string; last4?: string } } }) : null
  const rVal: VerifiedCardIntent = {
    paymentIntentId,
    amountCents: received,
    cardBrand: charge?.payment_method_details?.card?.brand ?? null,
    cardLast4: charge?.payment_method_details?.card?.last4 ?? null,
    livemode: intent.livemode === true,
  }
  logLine('CARD_PAYMENTS:verified', expected.requestId, { pi: paymentIntentId, amountCents: received, livemode: rVal.livemode })
  return rVal
}

/** Maps a Stripe refund object to {@link StripeRefundDetails}. */
function toRefundDetails(refund: Record<string, unknown>): StripeRefundDetails {
  const destination = refund.destination_details && typeof refund.destination_details === 'object' ? (refund.destination_details as { card?: { reference?: string | null; reference_status?: string | null; reference_type?: string | null } }) : null
  const card = destination?.card ?? null
  return {
    refundId: typeof refund.id === 'string' ? refund.id : 'unknown',
    status: typeof refund.status === 'string' ? refund.status : null,
    amount: typeof refund.amount === 'number' ? refund.amount / 100 : null,
    reference: card?.reference || null,
    referenceType: card?.reference_type || null,
    referenceStatus: card?.reference_status || null,
  }
}

/** The PaymentIntent's existing refund that is not failed or canceled (newest first), or null. */
async function findExistingRefund(credentials: StripeCredentials, paymentIntentId: string, fetcher?: StripeFetch): Promise<Record<string, unknown> | null> {
  const existing = await callStripeApi<{ data?: Array<Record<string, unknown>> }>(credentials, 'GET', `/v1/refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=10`, undefined, undefined, fetcher)
  return existing.body?.data?.find((refund) => refund.status !== 'failed' && refund.status !== 'canceled') ?? null
}

/**
 * Refunds a card PaymentIntent in full (super admin void).
 *
 * Retry-safe: an existing refund on the PaymentIntent is returned instead of creating another (a void that failed after
 * the refund can simply be run again). The idempotency key is per request, so a retry with a different reason never
 * collides with the first attempt (Stripe `idempotency_error`).
 *
 * @returns The refund, including the ARN when Stripe already has it (sandbox usually does; live often shows it a few
 *   days later — see {@link getBillingRefund}).
 * @throws CardPaymentError `STRIPE_REFUND_FAILED` (Stripe's code in `details.stripeCode`) when Stripe refuses.
 */
export async function refundBillingCardPayment(credentials: StripeCredentials, paymentIntentId: string, requestId: string, reason: string, fetcher?: StripeFetch): Promise<StripeRefundDetails> {
  const prior = await findExistingRefund(credentials, paymentIntentId, fetcher)
  if (prior) {
    const rVal = toRefundDetails(prior)
    logLine('CARD_PAYMENTS:refund-reused', requestId, { pi: paymentIntentId, refund: rVal.refundId, status: rVal.status ?? 'unknown' })
    return rVal
  }
  const form = new URLSearchParams()
  form.set('payment_intent', paymentIntentId)
  form.set('metadata[kr_source]', KR_STRIPE_BILLING_SOURCE)
  form.set('metadata[kr_void_reason]', reason.slice(0, 200))
  form.set('metadata[kr_request_id]', requestId)
  const response = await callStripeApi<Record<string, unknown>>(credentials, 'POST', '/v1/refunds', form, `kr-billing-refund-${paymentIntentId}-${requestId}`, fetcher)
  if (!response.ok || !response.body || typeof response.body.id !== 'string') {
    // Refunded in the meantime (or by an earlier attempt): read the existing refund.
    if (response.error?.code === 'charge_already_refunded' || response.error?.type === 'idempotency_error' || response.error?.code === 'idempotency_error') {
      const existing = await findExistingRefund(credentials, paymentIntentId, fetcher)
      logLine('CARD_PAYMENTS:already-refunded', requestId, { pi: paymentIntentId, refund: typeof existing?.id === 'string' ? existing.id : 'none' })
      if (existing) return toRefundDetails(existing)
      if (response.error?.code === 'charge_already_refunded') return { refundId: 'already_refunded', status: 'succeeded', amount: null, reference: null, referenceType: null, referenceStatus: null }
    }
    logLine('CARD_PAYMENTS:refund-failed', requestId, { pi: paymentIntentId, code: stripeCodeOf(response) })
    throw new CardPaymentError('STRIPE_REFUND_FAILED', 502, 'Stripe refused the refund, so the payment was not voided.', { stripeCode: stripeCodeOf(response) })
  }
  const rVal = toRefundDetails(response.body)
  logLine('CARD_PAYMENTS:refunded', requestId, { pi: paymentIntentId, refund: rVal.refundId, status: rVal.status ?? 'unknown', arn: rVal.referenceStatus ?? 'none' })
  return rVal
}

/**
 * Re-reads a refund from Stripe (status and ARN), e.g. when the ARN was still pending at void time.
 *
 * @throws CardPaymentError `VALIDATION_STRIPE_REFUND_ID_INVALID`, `STRIPE_REQUEST_FAILED`.
 */
export async function getBillingRefund(credentials: StripeCredentials, refundId: string, requestId: string, fetcher?: StripeFetch): Promise<StripeRefundDetails> {
  if (!REFUND_PATTERN.test(refundId)) throw new CardPaymentError('VALIDATION_STRIPE_REFUND_ID_INVALID', 422, 'That is not a Stripe refund id.')
  const response = await callStripeApi<Record<string, unknown>>(credentials, 'GET', `/v1/refunds/${refundId}`, undefined, undefined, fetcher)
  if (!response.ok || !response.body) throw new CardPaymentError('STRIPE_REQUEST_FAILED', 502, 'Stripe could not be read.', { stripeCode: stripeCodeOf(response) })
  const rVal = toRefundDetails(response.body)
  logLine('CARD_PAYMENTS:refund-read', requestId, { refund: refundId, status: rVal.status ?? 'unknown', arn: rVal.referenceStatus ?? 'none' })
  return rVal
}

// ---------------------------------------------------------------------------------------------------------------
// Context

/** Who is calling, from the checked session. */
export interface CardPaymentActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** Everything the card rules need, gathered once by the route. */
export interface CardPaymentContext {
  queries: CardPaymentQueries
  /** For the payer's email (the client's billing addresses). */
  workstream: WorkstreamQueries
  actor: CardPaymentActor
  /** The environment this person's payment uses, given what the browser asked for. */
  environmentFor: (requested: unknown) => BillingStripeEnvironment
  /** Whether this person may switch sandbox and live. */
  canChooseEnvironment: boolean
  /** Decrypted Stripe credentials for one environment (`readStripeCredentials`); tests pass a stand-in. */
  stripeCredentials: (environment: BillingStripeEnvironment) => Promise<StripeEnvironmentCredentials>
  /** `fetch` for Stripe (tests pass a stand-in). */
  stripeFetch?: StripeFetch
}

/** The settings the context reads. */
export type CardPaymentContextEnv = CardPaymentEnv & { krhomebase?: D1Database; KR_PAYMENT_PROVIDER_KEK?: unknown }

/**
 * Stripe credentials for one environment, read from `payment_provider` with the KEK on every call.
 *
 * @throws PaymentProviderError `STRIPE_<ENV>_NOT_CONFIGURED`, `_DISABLED`, `_KEY_MODE_MISMATCH`, `PAYMENT_PROVIDER_*`.
 */
export function stripeCredentialsReader(env: CardPaymentContextEnv): (environment: BillingStripeEnvironment) => Promise<StripeEnvironmentCredentials> {
  return async (environment) => {
    const providers = paymentProviderQueriesFor(env)
    if (!providers) throw new CardPaymentError('PAYMENT_PROVIDER_TABLE_MISSING', 503, 'Payment configuration storage is not available.')
    return readStripeCredentials(providers, env.KR_PAYMENT_PROVIDER_KEK, environment)
  }
}

/**
 * The Stripe side of posting, voiding and refreshing a card payment, for `billing/rules.ts` (which never calls Stripe
 * itself). The environment of a post follows {@link billingStripeEnvironment}; a refund uses the payment's own.
 */
export function paymentStripeFor(
  env: CardPaymentContextEnv,
  actor: CardPaymentActor,
  options: { credentials?: (environment: BillingStripeEnvironment) => Promise<StripeCredentials>; fetcher?: StripeFetch } = {},
): PaymentStripe {
  const credentials = options.credentials ?? stripeCredentialsReader(env)
  return {
    environmentFor: (requested) => billingStripeEnvironment(env, requested, actor.role),
    verify: async (environment, intentId, expected) => verifyBillingCardPaymentIntent(await credentials(environment), intentId, { ...expected, environment, requestId: actor.requestId }, options.fetcher),
    refund: async (environment, intentId, reason) => refundBillingCardPayment(await credentials(environment), intentId, actor.requestId, reason, options.fetcher),
    readRefund: async (environment, refundId) => getBillingRefund(await credentials(environment), refundId, actor.requestId, options.fetcher),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The two card routes

/**
 * Stripe.js settings for the Payments tab and the payer prefill (old `card-payment` GET). A missing configuration is
 * reported in `problems` (and `configured: false`), never as a failure.
 *
 * @throws CardPaymentError `VALIDATION_CLIENT_NOT_FOUND` (404).
 */
export async function cardPaymentConfig(ctx: CardPaymentContext, clientId: string, requested: unknown): Promise<CardPaymentConfigData> {
  const client = await ctx.queries.clientById(clientId)
  if (!client) throw new CardPaymentError('VALIDATION_CLIENT_NOT_FOUND', 404, 'No such client account.')
  const environment = ctx.environmentFor(requested)
  // Configuration comes from Settings → Stripe Payment Configuration (payment_provider).
  let publishableKey: string | null = null
  const problems: string[] = []
  try {
    publishableKey = (await ctx.stripeCredentials(environment)).publishableKey || null
  } catch (error) {
    const code = asProviderError(error)?.code ?? (error instanceof CardPaymentError ? error.code : 'STRIPE_NOT_CONFIGURED')
    problems.push(code)
    logLine('CARD_PAYMENTS:config-unavailable', ctx.actor.requestId, { environment, code })
  }

  const payer = { firstName: '', lastName: '', email: '' }
  try {
    const person = await ctx.queries.payerOf(clientId)
    payer.firstName = person?.first_name?.trim() ?? ''
    payer.lastName = person?.last_name?.trim() ?? ''
    const recipients = (await emailRecipients(ctx.workstream, clientId)).recipients
    payer.email = (recipients.find((recipient) => recipient.primary) ?? recipients[0])?.email ?? ''
  } catch (error) {
    logLine('CARD_PAYMENTS:payer-prefill-failed', ctx.actor.requestId, { error: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
  }
  const config: CardPaymentConfigData = { environment, canChooseEnvironment: ctx.canChooseEnvironment, configured: Boolean(publishableKey), publishableKey, problems, payer }
  logLine('CARD_PAYMENTS:config', ctx.actor.requestId, { environment, configured: config.configured })
  return config
}

/**
 * Creates a PaymentIntent for the invoices (old `create-intent`); the browser confirms a live one with Stripe.js.
 *
 * @throws CardPaymentError `VALIDATION_CARD_PAYMENT_AMOUNT`, `VALIDATION_CARD_PAYMENT_ALLOCATION_TOTAL`,
 *   `VALIDATION_SANDBOX_TEST_CARD_REQUIRED`, `VALIDATION_LIVE_TEST_CARD_NOT_ALLOWED`,
 *   `VALIDATION_CARD_PAYMENT_DUPLICATE_INVOICE`, `VALIDATION_PAYMENT_INVOICE_NOT_FOUND`,
 *   `VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT`, `VALIDATION_INVOICE_IS_DRAFT`, `VALIDATION_PAYMENT_EXCEEDS_BALANCE` (422),
 *   `VALIDATION_CLIENT_NOT_FOUND` (404), `STRIPE_REQUEST_FAILED` (502); the credentials' PaymentProviderError (503).
 */
export async function createCardPaymentIntent(ctx: CardPaymentContext, clientId: string, body: CardPaymentIntentBody): Promise<CardPaymentIntentData> {
  const requested = body.invoiceAllocations
  if (!Number.isInteger(body.amountCents) || body.amountCents < CARD_PAYMENT_MIN_AMOUNT_CENTS) throw new CardPaymentError('VALIDATION_CARD_PAYMENT_AMOUNT', 422, 'Card payments must be at least $0.50.')
  if (requested.reduce((sum, item) => sum + item.amountCents, 0) !== body.amountCents) throw new CardPaymentError('VALIDATION_CARD_PAYMENT_ALLOCATION_TOTAL', 422, 'The invoice amounts do not add up to the card charge.')

  const environment = ctx.environmentFor(body.environment)
  // Sandbox is locked to Stripe's test cards (no card number is ever typed); live never accepts a test scenario.
  const testScenario = findStripeDevTestScenario(body.testScenarioId)
  if (environment === 'sandbox' && !testScenario) throw new CardPaymentError('VALIDATION_SANDBOX_TEST_CARD_REQUIRED', 422, 'Choose a Stripe test card for a sandbox payment.')
  if (environment === 'live' && body.testScenarioId) throw new CardPaymentError('VALIDATION_LIVE_TEST_CARD_NOT_ALLOWED', 422, 'A Stripe test card cannot be used for a live payment.')
  if (new Set(requested.map((item) => item.invoiceId)).size !== requested.length) throw new CardPaymentError('VALIDATION_CARD_PAYMENT_DUPLICATE_INVOICE', 422, 'An invoice is listed twice.')

  const client = await ctx.queries.clientById(clientId)
  if (!client) throw new CardPaymentError('VALIDATION_CLIENT_NOT_FOUND', 404, 'No such client account.')
  const rows = new Map((await ctx.queries.invoicesByIds(requested.map((item) => item.invoiceId))).map((row) => [row.id, row]))
  const invoices = requested.map((allocation) => {
    const invoice = rows.get(allocation.invoiceId)
    if (!invoice || invoice.billed_to_client_id !== clientId) throw new CardPaymentError('VALIDATION_PAYMENT_INVOICE_NOT_FOUND', 422, 'An invoice is not on this client.')
    if (invoice.status === 'void') throw new CardPaymentError('VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT', 422, 'This invoice is void and cannot receive payments.')
    // A card is never charged for a draft (the requester, Nov 16, 2026): the payment post would refuse it after the charge.
    if (invoice.status === 'draft') throw new CardPaymentError('VALIDATION_INVOICE_IS_DRAFT', 422, `Invoice ${invoice.invoice_number} is a draft. Finalize it before attaching a payment.`)
    if (allocation.amountCents > Math.round(Number(invoice.balance_due || 0) * 100)) throw new CardPaymentError('VALIDATION_PAYMENT_EXCEEDS_BALANCE', 422, 'Payment is more than the invoice balance.')
    return { invoice, allocation }
  })
  const anchor = invoices[0]!.invoice
  const payer = await ctx.queries.payerOf(clientId)

  const credentials = await ctx.stripeCredentials(environment)
  const created = await createBillingCardPaymentIntent(
    credentials,
    {
      requestId: ctx.actor.requestId,
      amountCents: body.amountCents,
      currency: credentials.defaultCurrency,
      description: `${invoices.length === 1 ? `Invoice #${anchor.invoice_number}` : `${invoices.length} invoices`} · Client ${client.client_number}`,
      cardholderName: body.cardholderName,
      email: body.email,
      invoiceId: anchor.id,
      invoiceNumber: anchor.invoice_number,
      invoiceAllocations: invoices.map(({ invoice, allocation }) => ({ invoiceId: invoice.id, amountCents: allocation.amountCents })),
      ivid: anchor.ivid ?? null,
      clientId,
      clientNumber: client.client_number,
      icid: payer?.icid ?? null,
      matterId: anchor.matter_id,
      userId: ctx.actor.userId,
      testPaymentMethodId: environment === 'sandbox' ? (testScenario?.paymentMethodId ?? null) : null,
    },
    ctx.stripeFetch,
  )
  return { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret, environment, status: created.status, errorCode: created.errorCode, declineCode: created.declineCode, errorMessage: created.errorMessage }
}
