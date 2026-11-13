// file: apps/api/src/features/payment-providers/routes.ts
/**
 * Stripe Payment Configuration routes (Settings plan, stage 6; super admin only, as before). They replace the old
 * `GET`/`POST /krhomebase/api/payment-providers` (one POST with `action: save | delete | test-connection`) and the
 * old `POST /krhomebase/api/stripe-dev-tests` (one POST with four actions), one route per action:
 *
 *   GET    /v1/payment-providers                                              list (no secret values) and KEK state
 *   PUT    /v1/payment-providers/{environment}                                save one profile (old `save`)
 *   DELETE /v1/payment-providers/{environment}/{providerId}                   delete one profile (old `delete`)
 *   POST   /v1/payment-providers/{environment}/test-connection                Stripe balance check (old `test-connection`)
 *   POST   /v1/payment-providers/sandbox-tests/card-payments                  old `create-test-payment`
 *   POST   /v1/payment-providers/sandbox-tests/ach-payments                   old `create-test-ach-payment`
 *   GET    /v1/payment-providers/sandbox-tests/payments/{paymentIntentId}     old `get-payment`
 *   GET    /v1/payment-providers/sandbox-tests/payments?field=&value=         old `search-payments`
 *
 * The payment encryption key is the Worker secret `KR_PAYMENT_PROVIDER_KEK` (the same value the pay Worker holds), read
 * from `c.env`. Rules: `rules.ts` and `sandboxTests.ts`. Writes pass the write gate and are audited (resource
 * `payment-providers`). Request bodies are never logged: they can carry a secret key. Outside tools: closed.
 */

import {
  ErrorEnvelope,
  PaymentProviderConnectionData,
  PaymentProviderDeleteBody,
  PaymentProviderDeletedData,
  PaymentProviderEnvironmentParams,
  PaymentProviderParams,
  PaymentProviderSaveBody,
  PaymentProviderSavedData,
  PaymentProvidersData,
  StripeDevTestsAchPaymentBody,
  StripeDevTestsCardPaymentBody,
  StripeDevTestsPaymentData,
  StripeDevTestsPaymentParams,
  StripeDevTestsResultData,
  StripeDevTestsSearchData,
  StripeDevTestsSearchQuery,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { PAYMENT_PROVIDER_KEK_SETTING } from './crypto.ts'
import { paymentProviderQueriesFor, type PaymentProviderQueries } from './queries.ts'
import {
  asProviderError,
  deletePaymentProvider,
  listPaymentProviders,
  PaymentProviderError,
  readStripeCredentials,
  savePaymentProvider,
  testPaymentProviderConnection,
  type PaymentProviderActor,
} from './rules.ts'
import {
  checkAchPayment,
  checkCardPayment,
  checkPaymentIntentId,
  checkSearch,
  lookupSandboxPayment,
  runSandboxAchPayment,
  runSandboxCardPayment,
  searchSandboxPayments,
} from './sandboxTests.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const FEATURE = 'payment-providers'
const KEK_CODES = ['PAYMENT_PROVIDER_KEK_NOT_CONFIGURED', 'PAYMENT_PROVIDER_KEK_INVALID', 'PAYMENT_PROVIDER_KEK_MISMATCH']
const SANDBOX_CREDENTIAL_CODES = ['STRIPE_SANDBOX_NOT_CONFIGURED', 'STRIPE_SANDBOX_DISABLED', 'STRIPE_SANDBOX_KEY_MODE_MISMATCH', 'PAYMENT_PROVIDER_SECRET_UNREADABLE', 'PAYMENT_PROVIDER_TABLE_MISSING', ...KEK_CODES]
const unavailable503 = error('The payment_provider table, the encryption key or the sandbox keys are not available (PAYMENT_PROVIDER_TABLE_MISSING, PAYMENT_PROVIDER_KEK_*, STRIPE_<ENV>_NOT_CONFIGURED or _DISABLED).')
const stripe502 = error('Stripe could not be reached or refused the request (STRIPE_NETWORK_ERROR, STRIPE_REQUEST_FAILED with `details.stripeCode`), or a stored secret could not be read.')

export const paymentProvidersRoute = defineRoute({
  method: 'get',
  path: '/v1/payment-providers',
  feature: FEATURE,
  summary: 'Every Stripe provider profile (live and sandbox) without secret values, and whether the payment encryption key is configured.',
  access: SUPER_ADMIN,
  errors: ['PAYMENT_PROVIDER_TABLE_MISSING'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The profiles and the encryption key state.', content: json(successEnvelope(PaymentProvidersData)) }, 503: unavailable503 },
})

export const savePaymentProviderRoute = defineRoute({
  method: 'put',
  path: '/v1/payment-providers/{environment}',
  feature: FEATURE,
  summary: 'Saves one Stripe profile of an environment (creates one when providerId is null); a new secret key is checked with Stripe, then stored encrypted.',
  access: SUPER_ADMIN,
  errors: [
    'VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY_LIVE',
    'VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY_SANDBOX',
    'VALIDATION_PAYMENT_PROVIDER_ACCOUNT_ID',
    'VALIDATION_PAYMENT_PROVIDER_ACCOUNT_EMAIL',
    'VALIDATION_PAYMENT_PROVIDER_API_VERSION',
    'VALIDATION_PAYMENT_PROVIDER_CURRENCY',
    'VALIDATION_PAYMENT_PROVIDER_SECRET_KEY_LIVE',
    'VALIDATION_PAYMENT_PROVIDER_SECRET_KEY_SANDBOX',
    'VALIDATION_PAYMENT_PROVIDER_WEBHOOK_SECRET',
    'PAYMENT_PROVIDER_STRIPE_REJECTED_KEY',
    'PAYMENT_PROVIDER_MODE_MISMATCH',
    'PAYMENT_PROVIDER_NOT_FOUND',
    'PAYMENT_PROVIDER_CHANGED_ELSEWHERE',
    'PAYMENT_PROVIDER_TABLE_MISSING',
    'PAYMENT_PROVIDER_KEK_NOT_CONFIGURED',
    'PAYMENT_PROVIDER_KEK_INVALID',
    'PAYMENT_PROVIDER_SAVE_READBACK_FAILED',
    'STRIPE_NETWORK_ERROR',
  ],
  sideEffects: ['Writes payment_provider (and disables the other profiles of the environment when this one is enabled)', 'Writes audit_log', 'Calls Stripe GET /v1/balance when a new secret key is sent'],
  request: { params: PaymentProviderEnvironmentParams, body: { content: json(PaymentProviderSaveBody), required: true } },
  responses: {
    200: { description: 'The saved profile, read back.', content: json(successEnvelope(PaymentProviderSavedData)) },
    404: error('No profile with that id in this environment (PAYMENT_PROVIDER_NOT_FOUND).'),
    409: error('The profile changed since it was loaded (PAYMENT_PROVIDER_CHANGED_ELSEWHERE).'),
    422: error('A field has the wrong shape (VALIDATION_PAYMENT_PROVIDER_*), or Stripe rejected the key or it is for the other mode.'),
    502: stripe502,
    503: unavailable503,
  },
})

export const deletePaymentProviderRoute = defineRoute({
  method: 'delete',
  path: '/v1/payment-providers/{environment}/{providerId}',
  feature: FEATURE,
  summary: 'Permanently deletes one Stripe profile after the exact confirmation phrase DELETE KEY.',
  access: SUPER_ADMIN,
  errors: ['VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION', 'PAYMENT_PROVIDER_NOT_FOUND', 'PAYMENT_PROVIDER_CHANGED_ELSEWHERE', 'PAYMENT_PROVIDER_TABLE_MISSING'],
  sideEffects: ['Deletes a payment_provider row', 'Writes audit_log'],
  request: { params: PaymentProviderParams, body: { content: json(PaymentProviderDeleteBody), required: true } },
  responses: {
    200: { description: 'The profile was deleted.', content: json(successEnvelope(PaymentProviderDeletedData)) },
    404: error('No profile with that id in this environment (PAYMENT_PROVIDER_NOT_FOUND).'),
    409: error('The profile changed since it was loaded (PAYMENT_PROVIDER_CHANGED_ELSEWHERE).'),
    422: error('The confirmation was not exactly DELETE KEY (VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION).'),
    503: unavailable503,
  },
})

export const testPaymentProviderRoute = defineRoute({
  method: 'post',
  path: '/v1/payment-providers/{environment}/test-connection',
  feature: FEATURE,
  summary: "Checks the environment's stored secret key with Stripe (GET /v1/balance) and records the outcome on the profile.",
  access: SUPER_ADMIN,
  errors: [
    'STRIPE_LIVE_NOT_CONFIGURED',
    'STRIPE_SANDBOX_NOT_CONFIGURED',
    'STRIPE_LIVE_DISABLED',
    'STRIPE_SANDBOX_DISABLED',
    'STRIPE_LIVE_KEY_MODE_MISMATCH',
    'STRIPE_SANDBOX_KEY_MODE_MISMATCH',
    'PAYMENT_PROVIDER_STRIPE_REJECTED_KEY',
    'PAYMENT_PROVIDER_MODE_MISMATCH',
    'PAYMENT_PROVIDER_SECRET_UNREADABLE',
    'PAYMENT_PROVIDER_TABLE_MISSING',
    ...KEK_CODES,
    'STRIPE_NETWORK_ERROR',
  ],
  sideEffects: ['Calls Stripe GET /v1/balance', 'Writes payment_provider (last_verified_at, last_verified_status)', 'Writes audit_log'],
  request: { params: PaymentProviderEnvironmentParams },
  responses: {
    200: { description: 'The balance Stripe reports for the stored key.', content: json(successEnvelope(PaymentProviderConnectionData)) },
    422: error('Stripe rejected the key, or it is for the other mode.'),
    502: stripe502,
    503: unavailable503,
  },
})

const SANDBOX_PAYMENT_ERRORS = ['STRIPE_DEV_TESTS_UNKNOWN_SCENARIO', 'STRIPE_DEV_TESTS_INVALID_AMOUNT', 'STRIPE_DEV_TESTS_INVALID_REFERENCE', ...SANDBOX_CREDENTIAL_CODES, 'STRIPE_REQUEST_FAILED', 'STRIPE_NETWORK_ERROR']
const sandboxResult = { description: 'The test payment, succeeded or declined (a decline is an expected outcome).', content: json(successEnvelope(StripeDevTestsResultData)) }
const sandbox422 = error('The scenario, amount or a reference is not allowed (STRIPE_DEV_TESTS_*).')

export const sandboxCardPaymentRoute = defineRoute({
  method: 'post',
  path: '/v1/payment-providers/sandbox-tests/card-payments',
  feature: FEATURE,
  summary: "Creates and confirms a Stripe sandbox card PaymentIntent with the scenario's test PaymentMethod (the card number is never sent).",
  access: SUPER_ADMIN,
  errors: SANDBOX_PAYMENT_ERRORS,
  sideEffects: ['Calls Stripe POST /v1/payment_intents in the sandbox (creates a test PaymentIntent); no KR Homebase table is written'],
  request: { body: { content: json(StripeDevTestsCardPaymentBody), required: true } },
  responses: { 200: sandboxResult, 422: sandbox422, 502: stripe502, 503: unavailable503 },
})

export const sandboxAchPaymentRoute = defineRoute({
  method: 'post',
  path: '/v1/payment-providers/sandbox-tests/ach-payments',
  feature: FEATURE,
  summary: "Creates and confirms a Stripe sandbox ACH PaymentIntent with the scenario's test bank account and an online mandate (the caller's IP and browser).",
  access: SUPER_ADMIN,
  errors: [...SANDBOX_PAYMENT_ERRORS, 'STRIPE_DEV_TESTS_ACCOUNT_HOLDER_REQUIRED'],
  sideEffects: ['Calls Stripe POST /v1/payment_intents in the sandbox (creates a test PaymentIntent); no KR Homebase table is written'],
  request: { body: { content: json(StripeDevTestsAchPaymentBody), required: true } },
  responses: { 200: sandboxResult, 422: sandbox422, 502: stripe502, 503: unavailable503 },
})

export const sandboxPaymentRoute = defineRoute({
  method: 'get',
  path: '/v1/payment-providers/sandbox-tests/payments/{paymentIntentId}',
  feature: FEATURE,
  summary: 'Reads one sandbox PaymentIntent from Stripe with its latest charge and the KR metadata.',
  access: SUPER_ADMIN,
  errors: ['STRIPE_DEV_TESTS_INVALID_PAYMENT_INTENT', 'STRIPE_PAYMENT_NOT_FOUND', ...SANDBOX_CREDENTIAL_CODES, 'STRIPE_REQUEST_FAILED', 'STRIPE_NETWORK_ERROR'],
  sideEffects: ['Calls Stripe GET /v1/payment_intents/{id} in the sandbox'],
  request: { params: StripeDevTestsPaymentParams },
  responses: {
    200: { description: 'The PaymentIntent.', content: json(successEnvelope(StripeDevTestsPaymentData)) },
    404: error('Stripe has no such PaymentIntent in the sandbox (STRIPE_PAYMENT_NOT_FOUND).'),
    422: error('The id is not a PaymentIntent id (STRIPE_DEV_TESTS_INVALID_PAYMENT_INTENT).'),
    502: stripe502,
    503: unavailable503,
  },
})

export const sandboxPaymentSearchRoute = defineRoute({
  method: 'get',
  path: '/v1/payment-providers/sandbox-tests/payments',
  feature: FEATURE,
  summary: 'Searches sandbox PaymentIntents by KR metadata (invoice IVID, client ICID or client number), newest first, up to 20.',
  access: SUPER_ADMIN,
  errors: ['STRIPE_DEV_TESTS_INVALID_SEARCH_FIELD', 'STRIPE_DEV_TESTS_INVALID_REFERENCE', ...SANDBOX_CREDENTIAL_CODES, 'STRIPE_REQUEST_FAILED', 'STRIPE_NETWORK_ERROR'],
  sideEffects: ['Calls Stripe GET /v1/payment_intents/search in the sandbox'],
  request: { query: StripeDevTestsSearchQuery },
  responses: {
    200: { description: 'The matches.', content: json(successEnvelope(StripeDevTestsSearchData)) },
    422: error('The field or value is not allowed (STRIPE_DEV_TESTS_INVALID_SEARCH_FIELD, STRIPE_DEV_TESTS_INVALID_REFERENCE).'),
    502: stripe502,
    503: unavailable503,
  },
})

/** The payment encryption key text from the Worker's secrets (never logged). */
function kekValue(c: Context<AppEnv>): unknown {
  return (c.env as unknown as Record<string, unknown> | undefined)?.[PAYMENT_PROVIDER_KEK_SETTING]
}

/** Maps a payment-provider refusal to its reply; anything else is thrown on (500). */
function providerFailure(c: Context<AppEnv>, tag: string, caught: unknown) {
  const refused = asProviderError(caught)
  if (!refused) throw caught
  logLine(`PAYMENT_PROVIDERS:${tag}_failed`, c.get('requestId'), { code: refused.code, status: refused.status, stripeCode: refused.details?.stripeCode })
  return failure(c, refused.status, refused.code, refused.message, refused.details)
}

/**
 * The sandbox keys for the sandbox tests. Every credential failure answers 503, as in the old stripe-dev-tests route
 * (the old payment-providers route answered 502 for a key-mode mismatch or an unreadable secret; that route keeps it).
 */
async function sandboxCredentials(c: Context<AppEnv>, queries: PaymentProviderQueries) {
  try {
    return await readStripeCredentials(queries, kekValue(c), 'sandbox')
  } catch (caught) {
    const refused = asProviderError(caught)
    if (!refused) throw caught
    throw new PaymentProviderError(refused.code, refused.message, 503, refused.details)
  }
}

type Handler =(c: Context<AppEnv>, queries: PaymentProviderQueries, actor: PaymentProviderActor) => Promise<unknown>

/**
 * Registers one route. Typed loosely on purpose, as Teams' and Billing's: every route shares the shape (queries and
 * actor in, data out, refusals mapped by `providerFailure`).
 */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, run: Handler) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = paymentProviderQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'PAYMENT_PROVIDER_TABLE_MISSING', 'Payment configuration is not available right now.')
    const actor: PaymentProviderActor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') }
    try {
      const data = await run(c, queries, actor)
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (caught) {
      return providerFailure(c, tag, caught)
    }
  }) as any)
}

const valid = <T,>(c: Context<AppEnv>, target: 'json' | 'param' | 'query') => (c.req as any).valid(target) as T

export function registerPaymentProviders(app: OpenAPIHono<AppEnv>) {
  handle(app, paymentProvidersRoute, 'list', async (c, queries) => {
    const data = await listPaymentProviders(queries, kekValue(c))
    logLine('PAYMENT_PROVIDERS:list', c.get('requestId'), { providers: data.providers.length, kek: data.encryption.configured })
    return data
  })

  handle(app, savePaymentProviderRoute, 'save', async (c, queries, actor) => {
    const { environment } = valid<PaymentProviderEnvironmentParams>(c, 'param')
    const provider = await savePaymentProvider(queries, actor, kekValue(c), environment, valid<PaymentProviderSaveBody>(c, 'json'), new Date().toISOString())
    return { provider }
  })

  handle(app, deletePaymentProviderRoute, 'delete', async (c, queries, actor) => {
    const { environment, providerId } = valid<PaymentProviderParams>(c, 'param')
    await deletePaymentProvider(queries, actor, environment, providerId, valid<PaymentProviderDeleteBody>(c, 'json'))
    return { deleted: true as const }
  })

  handle(app, testPaymentProviderRoute, 'test', async (c, queries, actor) => {
    const { environment } = valid<PaymentProviderEnvironmentParams>(c, 'param')
    const connection = await testPaymentProviderConnection(queries, actor, kekValue(c), environment, new Date().toISOString())
    logLine('PAYMENT_PROVIDERS:test', actor.requestId, { environment, livemode: connection.livemode })
    return { connection }
  })

  handle(app, sandboxCardPaymentRoute, 'sandbox_card', async (c, queries, actor) => {
    const payment = checkCardPayment(valid<StripeDevTestsCardPaymentBody>(c, 'json'))
    const credentials = await sandboxCredentials(c, queries)
    return { result: await runSandboxCardPayment(credentials, payment, actor) }
  })

  handle(app, sandboxAchPaymentRoute, 'sandbox_ach', async (c, queries, actor) => {
    const payment = checkAchPayment(valid<StripeDevTestsAchPaymentBody>(c, 'json'))
    const credentials = await sandboxCredentials(c, queries)
    // Mandate: the tester accepted debit terms online; record their IP and browser as Stripe requires.
    const ipAddress = (c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0] || '127.0.0.1').trim()
    const userAgent = (c.req.header('user-agent') || 'KR Homebase Stripe Dev Tests').slice(0, 300)
    return { result: await runSandboxAchPayment(credentials, payment, actor, { ipAddress, userAgent }) }
  })

  handle(app, sandboxPaymentRoute, 'sandbox_lookup', async (c, queries, actor) => {
    const paymentIntentId = checkPaymentIntentId(valid<StripeDevTestsPaymentParams>(c, 'param').paymentIntentId)
    const credentials = await sandboxCredentials(c, queries)
    return { payment: await lookupSandboxPayment(credentials, paymentIntentId, actor.requestId) }
  })

  handle(app, sandboxPaymentSearchRoute, 'sandbox_search', async (c, queries, actor) => {
    const { field, value } = checkSearch(valid<StripeDevTestsSearchQuery>(c, 'query'))
    const credentials = await sandboxCredentials(c, queries)
    return { search: await searchSandboxPayments(credentials, field, value, actor.requestId) }
  })
}
