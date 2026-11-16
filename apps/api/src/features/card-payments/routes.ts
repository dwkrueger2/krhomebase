// file: apps/api/src/features/card-payments/routes.ts
/**
 * Card payment routes for Billing → Payments (Billing part 7e, `docs/API/Billing_Audit.md` section 3.2). Ported from the
 * old `kr-api-v1/billing/card-payment` GET and POST (`action: 'create-intent'`). The rules are in `rules.ts`; the
 * shapes in `packages/contracts/src/cardPayments.ts`.
 *
 *   GET  /v1/billing/clients/{clientId}/card-payment?environment=   Stripe.js settings and the payer prefill
 *   POST /v1/billing/clients/{clientId}/card-payment/intent         create the PaymentIntent (sandbox: confirmed here)
 *
 * Who may call (old, unchanged): the billing write roles, the same people who may post payments. Outside tools: closed
 * (no `toolAccess`). The intent route writes nothing to the database but charges a card in the sandbox, so it goes
 * through the write gate like any other write (refused while the Data Import lock is on).
 *
 * The payment itself is posted by `POST /v1/billing/clients/{clientId}/payments` with `stripePaymentIntentId`
 * (`features/billing/`), which re-reads the intent from Stripe; the refund is part of the payment void there.
 */

import { CardPaymentConfigData, CardPaymentConfigQuery, CardPaymentIntentBody, CardPaymentIntentData, ErrorEnvelope, successEnvelope, BillingClientParams } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { BILLING_WRITE_ROLES } from '../billing/routes.ts'
import { asProviderError } from '../payment-providers/rules.ts'
import { workstreamQueriesFor } from '../workstream/queries.ts'
import { cardPaymentQueriesFor } from './queries.ts'
import {
  billingStripeEnvironment,
  canChooseStripeEnvironment,
  cardPaymentConfig,
  CardPaymentError,
  createCardPaymentIntent,
  stripeCredentialsReader,
  type CardPaymentContext,
  type CardPaymentContextEnv,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const err = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'CARD_PAYMENTS_UNAVAILABLE'

export const cardPaymentConfigRoute = defineRoute({
  method: 'get',
  path: '/v1/billing/clients/{clientId}/card-payment',
  feature: 'billing',
  summary: "Stripe.js settings for taking a card payment (the publishable key, the environment the server will use, whether this person may switch) and the client's name and email for the card rows.",
  access: { roles: BILLING_WRITE_ROLES },
  errors: ['VALIDATION_CLIENT_NOT_FOUND', UNAVAILABLE],
  sideEffects: ['None'],
  request: { params: BillingClientParams, query: CardPaymentConfigQuery },
  responses: {
    200: { description: 'The settings (a missing Stripe configuration is listed in `problems`).', content: json(successEnvelope(CardPaymentConfigData)) },
    404: err('No such client account.'),
    503: err('The database cannot be reached.'),
  },
})

export const cardPaymentIntentRoute = defineRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/card-payment/intent',
  feature: 'billing',
  summary:
    'Create a Stripe PaymentIntent for up to 10 invoices (at least $0.50, each amount within its balance, the amounts adding up). Live: the browser confirms it with Stripe.js. Sandbox: a Stripe test card is required and the server charges and confirms it.',
  access: { roles: BILLING_WRITE_ROLES },
  errors: [
    'VALIDATION_CLIENT_NOT_FOUND',
    'VALIDATION_CARD_PAYMENT_AMOUNT',
    'VALIDATION_CARD_PAYMENT_ALLOCATION_TOTAL',
    'VALIDATION_CARD_PAYMENT_DUPLICATE_INVOICE',
    'VALIDATION_SANDBOX_TEST_CARD_REQUIRED',
    'VALIDATION_LIVE_TEST_CARD_NOT_ALLOWED',
    'VALIDATION_PAYMENT_INVOICE_NOT_FOUND',
    'VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT',
    'VALIDATION_PAYMENT_EXCEEDS_BALANCE',
    'VALIDATION_STRIPE_PAYMENT_ALLOCATIONS_TOO_LARGE',
    'STRIPE_REQUEST_FAILED',
    'STRIPE_NETWORK_ERROR',
    'STRIPE_SANDBOX_NOT_CONFIGURED',
    'STRIPE_LIVE_NOT_CONFIGURED',
    UNAVAILABLE,
  ],
  sideEffects: ['Calls Stripe (creates a PaymentIntent; in the sandbox charges a Stripe test card and confirms it)'],
  request: { params: BillingClientParams, body: { required: true, content: json(CardPaymentIntentBody) } },
  responses: {
    200: { description: 'The PaymentIntent (a sandbox decline is answered here with its codes, not as a failure).', content: json(successEnvelope(CardPaymentIntentData)) },
    404: err('No such client account.'),
    422: err('A rule refused (VALIDATION_… code).'),
    502: err('Stripe refused or could not be reached (`details.stripeCode`).'),
    503: err('Stripe is not configured for the environment, or the database cannot be reached.'),
  },
})

/** The card context for this request (the signed-in person), or null when the database is missing. */
function contextOf(c: Context<AppEnv>): CardPaymentContext | null {
  const env = c.env as unknown as CardPaymentContextEnv
  const queries = cardPaymentQueriesFor(env)
  const workstream = workstreamQueriesFor(c.env as never)
  if (!queries || !workstream) return null
  const session = c.get('session')
  const role = session?.role ?? null
  return {
    queries,
    workstream,
    actor: { userId: session?.userId ?? '', email: session?.email ?? null, role, requestId: c.get('requestId') },
    environmentFor: (requested) => billingStripeEnvironment(env, requested, role),
    canChooseEnvironment: canChooseStripeEnvironment(env, role),
    stripeCredentials: stripeCredentialsReader(env),
  }
}

/** Answers a refusal with its code; a Stripe configuration failure with its own; anything else is rethrown (a 500). */
function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof CardPaymentError) {
    logLine('CARD_PAYMENTS:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message, error.details)
  }
  const provider = asProviderError(error)
  if (provider) {
    logLine('CARD_PAYMENTS:refused', c.get('requestId'), { code: provider.code })
    return failure(c, provider.status === 404 || provider.status === 409 ? 503 : provider.status, provider.code, provider.message, provider.details)
  }
  throw error
}

export function registerCardPayments(app: OpenAPIHono<AppEnv>) {
  app.openapi(cardPaymentConfigRoute, (async (c: Context<AppEnv>) => {
    const ctx = contextOf(c)
    if (!ctx) return failure(c, 503, UNAVAILABLE, 'Card payments are not available right now.')
    try {
      const { clientId } = (c.req as any).valid('param') as { clientId: string }
      const { environment } = (c.req as any).valid('query') as { environment?: string }
      return c.json({ ok: true as const, data: await cardPaymentConfig(ctx, clientId, environment), requestId: ctx.actor.requestId }, 200)
    } catch (error) {
      return refused(c, error)
    }
  }) as never)

  app.openapi(cardPaymentIntentRoute, (async (c: Context<AppEnv>) => {
    const ctx = contextOf(c)
    if (!ctx) return failure(c, 503, UNAVAILABLE, 'Card payments are not available right now.')
    try {
      const { clientId } = (c.req as any).valid('param') as { clientId: string }
      const data = await createCardPaymentIntent(ctx, clientId, (c.req as any).valid('json'))
      logLine('CARD_PAYMENTS:intent', ctx.actor.requestId, { environment: data.environment, status: data.status ?? 'browser-confirms', declined: Boolean(data.errorCode) })
      return c.json({ ok: true as const, data, requestId: ctx.actor.requestId }, 200)
    } catch (error) {
      return refused(c, error)
    }
  }) as never)
}
