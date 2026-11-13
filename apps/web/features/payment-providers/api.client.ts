'use client'
// file: apps/web/features/payment-providers/api.client.ts
/**
 * The payment-providers area's calls to the API from the browser (Settings plan, stage 6; super admin only). Ported
 * from the old `paymentProvidersApi.client.ts` and `stripeDevTestsApi.client.ts`:
 *
 *   GET    /api/v1/payment-providers                                     both environments' profiles (no secret values)
 *   PUT    /api/v1/payment-providers/{environment}                       save one profile
 *   DELETE /api/v1/payment-providers/{environment}/{providerId}          delete one profile (`DELETE KEY`)
 *   POST   /api/v1/payment-providers/{environment}/test-connection       check the stored key with Stripe
 *   POST   /api/v1/payment-providers/sandbox-tests/card-payments         sandbox card test payment
 *   POST   /api/v1/payment-providers/sandbox-tests/ach-payments          sandbox ACH test payment
 *   GET    /api/v1/payment-providers/sandbox-tests/payments/{id}         PaymentIntent lookup
 *   GET    /api/v1/payment-providers/sandbox-tests/payments?field=&value= search by KR metadata
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contracts. A failure throws
 * `PaymentProvidersApiError` (code, HTTP status, request id, and the API's `details`) so callers can show it with
 * `describeKrRequestError` / `KrRequestErrorNote`, as the old `KRModuleApiError` was shown.
 *
 * Changed from the old helpers:
 * - The sandbox test calls throw on failure instead of returning `{ ok: false, … }` envelopes; `stripeDevTestsFailure`
 *   now takes the thrown error. A network failure is still `NETWORK_UNREACHABLE` with status 0.
 * - `STRIPE_REQUEST_FAILED` carries Stripe's code in `details.stripeCode` (the old code had it after a colon), and the
 *   friendly sentence reads it from there.
 * - Secret values are sent only in the save body and never logged.
 */

import {
  ErrorEnvelope,
  PaymentProviderConnectionData,
  PaymentProviderDeletedData,
  PaymentProviderSavedData,
  PaymentProvidersData,
  StripeDevTestsPaymentData,
  StripeDevTestsResultData,
  StripeDevTestsSearchData,
  successEnvelope,
  type PaymentProviderConfig,
  type PaymentProviderConnection,
  type PaymentProviderEditableFields,
  type PaymentProviderEnvironment,
  type PaymentProviderListResult,
  type StripeDevTestsAchPaymentBody,
  type StripeDevTestsCardPaymentBody,
  type StripeDevTestSearchField,
  type StripeDevTestsPaymentResult,
  type StripeDevTestsPaymentSummary,
  type StripeDevTestsSearchResult,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'
import { describeKrRequestError, type KrRequestErrorInfo } from '@/lib/krRequestError'

/** Route path (through this site's `/api` bridge). */
const PAYMENT_PROVIDERS_API_PATH = '/api/v1/payment-providers'

/** A refused or failed payment-providers call. */
export class PaymentProvidersApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly details: Record<string, unknown> | null,
  ) {
    super(code)
    this.name = 'PaymentProvidersApiError'
  }
}

/**
 * Sends one call and returns the reply's `data`, checked against `schema`.
 *
 * @throws `PaymentProvidersApiError` with the API's code, or `NETWORK_UNREACHABLE` (status 0), or `UNEXPECTED_REPLY`.
 */
async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[PAYMENT_PROVIDERS_API:79] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new PaymentProvidersApiError('NETWORK_UNREACHABLE', 0, null, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : response.ok ? 'UNEXPECTED_REPLY' : `HTTP_${response.status}`
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  const details = refusal.success && refusal.data.error.details && typeof refusal.data.error.details === 'object' ? (refusal.data.error.details as Record<string, unknown>) : null
  L(`[PAYMENT_PROVIDERS_API:89] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new PaymentProvidersApiError(code, response.status, requestId, details)
}

/** Loads both configurations (no secret values). */
export function loadPaymentProviders(): Promise<PaymentProviderListResult> {
  return send(PaymentProvidersData, 'GET', PAYMENT_PROVIDERS_API_PATH)
}

/**
 * Saves one configuration. `secretKey` / `webhookSecret` are sent only when
 * the user pasted a new value; they are never returned.
 */
export async function savePaymentProviderConfig(input: {
  environment: PaymentProviderEnvironment
  providerId?: string | null
  fields: PaymentProviderEditableFields
  secretKey?: string
  webhookSecret?: string
  expectedUpdatedAt: string | null
}): Promise<PaymentProviderConfig> {
  const { environment, ...body } = input
  const result = await send(PaymentProviderSavedData, 'PUT', `${PAYMENT_PROVIDERS_API_PATH}/${environment}`, body)
  return result.provider
}

/** Deletes one stored provider profile after the server validates the exact confirmation phrase. */
export async function deletePaymentProviderConfig(input: { environment: PaymentProviderEnvironment; providerId: string; confirmation: 'DELETE KEY'; expectedUpdatedAt: string | null }): Promise<void> {
  await send(PaymentProviderDeletedData, 'DELETE', `${PAYMENT_PROVIDERS_API_PATH}/${input.environment}/${encodeURIComponent(input.providerId)}`, { confirmation: input.confirmation, expectedUpdatedAt: input.expectedUpdatedAt })
}

/** Tests the stored key for one environment against Stripe. */
export async function testPaymentProviderConfig(environment: PaymentProviderEnvironment): Promise<PaymentProviderConnection> {
  const result = await send(PaymentProviderConnectionData, 'POST', `${PAYMENT_PROVIDERS_API_PATH}/${environment}/test-connection`)
  return result.connection
}

/** Runs a sandbox card test payment. Only the scenario id is sent, never the card number. */
export async function runStripeDevTestCardPayment(body: StripeDevTestsCardPaymentBody): Promise<StripeDevTestsPaymentResult> {
  return (await send(StripeDevTestsResultData, 'POST', `${PAYMENT_PROVIDERS_API_PATH}/sandbox-tests/card-payments`, body)).result
}

/** Runs a sandbox ACH test payment. Routing and account numbers are never sent. */
export async function runStripeDevTestAchPayment(body: StripeDevTestsAchPaymentBody): Promise<StripeDevTestsPaymentResult> {
  return (await send(StripeDevTestsResultData, 'POST', `${PAYMENT_PROVIDERS_API_PATH}/sandbox-tests/ach-payments`, body)).result
}

/** Retrieves one sandbox PaymentIntent by id. */
export async function getStripeDevTestPayment(paymentIntentId: string): Promise<StripeDevTestsPaymentSummary> {
  return (await send(StripeDevTestsPaymentData, 'GET', `${PAYMENT_PROVIDERS_API_PATH}/sandbox-tests/payments/${encodeURIComponent(paymentIntentId)}`)).payment
}

/** Searches sandbox PaymentIntents by one KR reference field. */
export async function searchStripeDevTestPayments(field: StripeDevTestSearchField, value: string): Promise<StripeDevTestsSearchResult> {
  const query = new URLSearchParams({ field, value })
  return (await send(StripeDevTestsSearchData, 'GET', `${PAYMENT_PROVIDERS_API_PATH}/sandbox-tests/payments?${query.toString()}`)).search
}

/** Friendly text for Stripe Dev Tests error codes (old `friendlyStripeDevTestsError`). */
function friendlyStripeDevTestsError(code: string, stripeCode: string | null): string | null {
  if (code === 'STRIPE_SANDBOX_NOT_CONFIGURED') return 'The Sandbox configuration has no keys yet. Fill in the Sandbox card above and Save.'
  if (code === 'STRIPE_SANDBOX_DISABLED') return 'The Sandbox configuration is disabled. Enable it above.'
  if (code.startsWith('PAYMENT_PROVIDER_KEK')) return 'The payment encryption key is not configured on the server.'
  if (code === 'PAYMENT_PROVIDER_SECRET_UNREADABLE') return 'The stored sandbox secret cannot be decrypted. Paste the key again and Save.'
  if (code === 'PAYMENT_PROVIDER_TABLE_MISSING') return 'The payment_provider table is not available (migration pending).'
  if (code === 'NETWORK_UNREACHABLE') return 'Could not reach KR Homebase.'
  if (code === 'STRIPE_REQUEST_FAILED') return `Stripe refused the request (${stripeCode ?? 'no code'}).`
  return null
}

/**
 * Converts a failed sandbox test call into display info and logs it (area
 * `KR_STRIPE_DEV_TESTS`). Development builds show code · status · request id.
 *
 * @param caught - What the call threw.
 * @param action - What was attempted, e.g. `create-test-payment`.
 */
export function stripeDevTestsFailure(caught: unknown, action: string): KrRequestErrorInfo {
  const stripeCode = caught instanceof PaymentProvidersApiError && typeof caught.details?.stripeCode === 'string' ? caught.details.stripeCode : null
  return describeKrRequestError(caught, 'KR_STRIPE_DEV_TESTS', action, (code) => friendlyStripeDevTestsError(code, stripeCode))
}
