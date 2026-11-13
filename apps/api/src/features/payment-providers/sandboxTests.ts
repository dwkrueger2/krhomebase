// file: apps/api/src/features/payment-providers/sandboxTests.ts
/**
 * Stripe sandbox tests (Settings → Stripe Payment Configuration → Sandbox tests; super admin only). Ported from the
 * old `/krhomebase/api/stripe-dev-tests/route.ts`: create and confirm a sandbox PaymentIntent with a Stripe test
 * PaymentMethod chosen from an allowlisted scenario (card or ACH), look one up, or search by KR metadata.
 *
 * Always the **sandbox** configuration (`readStripeCredentials(…, 'sandbox')`); there is no way to ask for live. The
 * Stripe form fields, metadata keys, idempotency keys, Dashboard links and result shapes are the old ones. No KR
 * database row is written.
 *
 * Changed from the old route:
 * - The body or query is checked before the sandbox keys are read, so a malformed request answers 422 even when the
 *   sandbox is not configured (old oddity 12).
 * - The search field is checked against the field list's own names only (old oddity 11: `in` accepted `toString`).
 * - Stripe's own error code travels in `details.stripeCode` with the plain code `STRIPE_REQUEST_FAILED`.
 * - Credentials are read on every call (no 60-second cache), so a sandbox key saved a moment ago is used at once.
 */

import {
  findStripeDevTestAchScenario,
  findStripeDevTestScenario,
  isStripeDevTestSearchField,
  isValidStripeDevTestReference,
  STRIPE_DEV_TEST_MAX_AMOUNT_CENTS,
  STRIPE_DEV_TEST_MIN_AMOUNT_CENTS,
  STRIPE_DEV_TEST_PAYMENT_INTENT_PATTERN,
  STRIPE_DEV_TEST_SEARCH_FIELDS,
  type StripeDevTestAchScenario,
  type StripeDevTestScenario,
  type StripeDevTestSearchField,
  type StripeDevTestsAchPaymentBody,
  type StripeDevTestsCardPaymentBody,
  type StripeDevTestsPaymentResult,
  type StripeDevTestsPaymentSummary,
  type StripeDevTestsSearchQuery,
  type StripeDevTestsSearchResult,
} from '@krhomebase/contracts'
import { logLine } from '../../platform/log.ts'
import { callStripeApi, type StripeApiResponse, type StripeFetch } from '../../platform/stripeApi.ts'
import { providerError, type StripeEnvironmentCredentials } from './rules.ts'

/** Metadata tag written on every sandbox PaymentIntent created here. */
const KR_STRIPE_DEV_TESTS_SOURCE = 'krhomebase-stripe-dev-tests'

/** Maximum PaymentIntents returned by one search. */
const KR_STRIPE_SEARCH_LIMIT = 20

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Who asked, for the PaymentIntent metadata and the idempotency key. */
export interface SandboxTestCaller {
  userId: string
  requestId: string
}

/** Reads one string metadata value from a Stripe object. */
function metadataValue(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : null
}

/** Trims a string field to a maximum length, or returns an empty string. */
function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

/**
 * Normalizes an optional KR reference from the request body.
 *
 * @returns The trimmed (ICID/IVID uppercased) value, '' when blank, or null when malformed.
 */
function cleanReference(field: StripeDevTestSearchField, value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  const normalized = field === 'clientNumber' ? raw : raw.toUpperCase()
  return isValidStripeDevTestReference(field, normalized) ? normalized : null
}

/** Builds the sandbox Dashboard link for a PaymentIntent. */
function dashboardUrl(paymentIntentId: string | null, accountId: string | null): string | null {
  if (!paymentIntentId) return null
  const accountSegment = accountId ? `${accountId}/` : ''
  return `https://dashboard.stripe.com/${accountSegment}test/payments/${paymentIntentId}`
}

/** Reads card brand (or ACH bank name) and last four from an expanded `latest_charge`. */
function readCardDetails(latestCharge: unknown): { brand: string | null; last4: string | null } {
  if (!latestCharge || typeof latestCharge !== 'object') return { brand: null, last4: null }
  const details = (latestCharge as { payment_method_details?: { card?: { brand?: string; last4?: string }; us_bank_account?: { bank_name?: string; last4?: string } } }).payment_method_details
  return {
    brand: details?.card?.brand ?? details?.us_bank_account?.bank_name ?? null,
    last4: details?.card?.last4 ?? details?.us_bank_account?.last4 ?? null,
  }
}

/**
 * Maps a Stripe PaymentIntent (with `latest_charge` expanded when available)
 * to the display-safe summary used by the lookup and search boxes.
 */
export function toPaymentSummary(intent: Record<string, unknown>, accountId: string | null): StripeDevTestsPaymentSummary {
  const id = typeof intent.id === 'string' ? intent.id : ''
  const card = readCardDetails(intent.latest_charge)
  const lastError = intent.last_payment_error && typeof intent.last_payment_error === 'object' ? (intent.last_payment_error as { code?: string; decline_code?: string }) : null
  return {
    paymentIntentId: id,
    status: typeof intent.status === 'string' ? intent.status : 'unknown',
    amountCents: typeof intent.amount === 'number' ? intent.amount : 0,
    amountReceivedCents: typeof intent.amount_received === 'number' ? intent.amount_received : 0,
    currency: typeof intent.currency === 'string' ? intent.currency : 'usd',
    createdIso: typeof intent.created === 'number' ? new Date(intent.created * 1000).toISOString() : '',
    description: typeof intent.description === 'string' ? intent.description : null,
    cardBrand: card.brand,
    cardLast4: card.last4,
    lastErrorCode: lastError?.code ?? null,
    lastDeclineCode: lastError?.decline_code ?? null,
    scenarioId: metadataValue(intent.metadata, 'kr_scenario'),
    clientNumber: metadataValue(intent.metadata, 'kr_client_number'),
    icid: metadataValue(intent.metadata, 'kr_icid'),
    ivid: metadataValue(intent.metadata, 'kr_ivid'),
    livemode: intent.livemode === true,
    dashboardUrl: dashboardUrl(id || null, accountId),
  }
}

/** The refusal for a Stripe reply that is not a success: Stripe's code goes in `details`, never its message. */
function stripeRequestFailed(response: StripeApiResponse<unknown>) {
  return providerError('STRIPE_REQUEST_FAILED', 'Stripe refused the request.', { stripeCode: String(response.error?.code ?? response.error?.type ?? response.status) })
}

/** Checks the amount and the three references shared by both payment kinds. */
function checkCommon(body: { amountCents: number; clientNumber?: string; icid?: string; ivid?: string }) {
  const amountCents = Math.round(body.amountCents)
  if (!Number.isFinite(amountCents) || amountCents < STRIPE_DEV_TEST_MIN_AMOUNT_CENTS || amountCents > STRIPE_DEV_TEST_MAX_AMOUNT_CENTS) {
    throw providerError('STRIPE_DEV_TESTS_INVALID_AMOUNT', 'Amount: between $0.50 and $1,000.00.')
  }
  const clientNumber = cleanReference('clientNumber', body.clientNumber)
  const icid = cleanReference('icid', body.icid)
  const ivid = cleanReference('ivid', body.ivid)
  if (clientNumber === null || icid === null || ivid === null) throw providerError('STRIPE_DEV_TESTS_INVALID_REFERENCE', 'Client No, ICID or IVID has the wrong shape.')
  return { amountCents, clientNumber, icid, ivid }
}

/** A card test payment, checked and ready to run. */
export interface CheckedCardPayment extends ReturnType<typeof checkCommon> {
  scenario: StripeDevTestScenario
  description: string
  cardholderName: string
  email: string
  postalCode: string
}

/** Checks a card test payment body (before any credentials are read). */
export function checkCardPayment(body: StripeDevTestsCardPaymentBody): CheckedCardPayment {
  const scenario = findStripeDevTestScenario(body.scenarioId)
  if (!scenario) throw providerError('STRIPE_DEV_TESTS_UNKNOWN_SCENARIO', 'That test card scenario is not on the list.')
  return {
    scenario,
    ...checkCommon(body),
    description: cleanText(body.description, 200) || 'KR Homebase Stripe sandbox test',
    cardholderName: cleanText(body.cardholderName, 100),
    email: cleanText(body.email, 200),
    postalCode: cleanText(body.postalCode, 20),
  }
}

/** An ACH test payment, checked and ready to run. */
export interface CheckedAchPayment extends ReturnType<typeof checkCommon> {
  scenario: StripeDevTestAchScenario
  description: string
  holderName: string
  email: string
}

/** Checks an ACH test payment body (before any credentials are read). */
export function checkAchPayment(body: StripeDevTestsAchPaymentBody): CheckedAchPayment {
  const scenario = findStripeDevTestAchScenario(body.scenarioId)
  if (!scenario) throw providerError('STRIPE_DEV_TESTS_UNKNOWN_SCENARIO', 'That test bank account scenario is not on the list.')
  const common = checkCommon(body)
  const holderName = cleanText(body.accountHolderName, 100)
  if (!holderName) throw providerError('STRIPE_DEV_TESTS_ACCOUNT_HOLDER_REQUIRED', 'Account holder name is required.')
  return { scenario, ...common, holderName, description: cleanText(body.description, 200) || 'KR Homebase Stripe sandbox ACH test', email: cleanText(body.email, 200) }
}

/** Checks a PaymentIntent id. */
export function checkPaymentIntentId(value: string): string {
  const id = value.trim()
  if (!STRIPE_DEV_TEST_PAYMENT_INTENT_PATTERN.test(id)) throw providerError('STRIPE_DEV_TESTS_INVALID_PAYMENT_INTENT', 'Enter a PaymentIntent id (pi_…).')
  return id
}

/** Checks a search: a known field and a value of its shape. */
export function checkSearch(query: StripeDevTestsSearchQuery): { field: StripeDevTestSearchField; value: string } {
  if (!isStripeDevTestSearchField(query.field)) throw providerError('STRIPE_DEV_TESTS_INVALID_SEARCH_FIELD', 'Search by ivid, icid or clientNumber.')
  const value = cleanReference(query.field, query.value)
  if (!value) throw providerError('STRIPE_DEV_TESTS_INVALID_REFERENCE', 'The search value has the wrong shape.')
  return { field: query.field, value }
}

/** Retrieves one PaymentIntent by id (box 1 on the workspace). */
export async function lookupSandboxPayment(credentials: StripeEnvironmentCredentials, paymentIntentId: string, requestId: string, fetcher?: StripeFetch): Promise<StripeDevTestsPaymentSummary> {
  const response = await callStripeApi<Record<string, unknown>>(credentials, 'GET', `/v1/payment_intents/${paymentIntentId}?expand[]=latest_charge`, undefined, undefined, fetcher)
  if (response.status === 404) throw providerError('STRIPE_PAYMENT_NOT_FOUND', 'Stripe has no PaymentIntent with that id in the sandbox.')
  if (!response.ok || !response.body) {
    logLine('STRIPE_DEV_TESTS:lookup_failed', requestId, { status: response.status, stripeCode: response.error?.code ?? response.error?.type ?? 'unknown' })
    throw stripeRequestFailed(response)
  }
  const payment = toPaymentSummary(response.body, credentials.accountId)
  logLine('STRIPE_DEV_TESTS:lookup', requestId, { paymentIntentId: payment.paymentIntentId, status: payment.status })
  return payment
}

/** Searches PaymentIntents by KR metadata (IVID, ICID or client number) with the Stripe Search API. */
export async function searchSandboxPayments(credentials: StripeEnvironmentCredentials, field: StripeDevTestSearchField, value: string, requestId: string, fetcher?: StripeFetch): Promise<StripeDevTestsSearchResult> {
  // The value passed the strict pattern check, so it cannot break out of the quoted query term.
  const query = `metadata['${STRIPE_DEV_TEST_SEARCH_FIELDS[field].metadataKey}']:'${value}'`
  const searchParams = new URLSearchParams({ query, limit: String(KR_STRIPE_SEARCH_LIMIT) })
  searchParams.append('expand[]', 'data.latest_charge')
  const response = await callStripeApi<{ data?: Array<Record<string, unknown>>; has_more?: boolean }>(credentials, 'GET', `/v1/payment_intents/search?${searchParams.toString()}`, undefined, undefined, fetcher)
  if (!response.ok || !response.body) {
    logLine('STRIPE_DEV_TESTS:search_failed', requestId, { field, status: response.status, stripeCode: response.error?.code ?? response.error?.type ?? 'unknown' })
    throw stripeRequestFailed(response)
  }
  const search: StripeDevTestsSearchResult = { field, value, payments: (response.body.data ?? []).map((intent) => toPaymentSummary(intent, credentials.accountId)), hasMore: response.body.has_more === true }
  logLine('STRIPE_DEV_TESTS:search', requestId, { field, matches: search.payments.length })
  return search
}

/** Metadata shared by both payment kinds. */
function setMetadata(form: URLSearchParams, scenarioId: string, caller: SandboxTestCaller, references: { clientNumber: string; icid: string; ivid: string }) {
  form.set('metadata[kr_source]', KR_STRIPE_DEV_TESTS_SOURCE)
  form.set('metadata[kr_scenario]', scenarioId)
  form.set('metadata[kr_request_id]', caller.requestId)
  form.set('metadata[kr_requested_by_user_id]', caller.userId)
  if (references.clientNumber) form.set('metadata[kr_client_number]', references.clientNumber)
  if (references.icid) form.set('metadata[kr_icid]', references.icid)
  if (references.ivid) form.set('metadata[kr_ivid]', references.ivid)
}

/**
 * Creates and confirms a sandbox card PaymentIntent. A `card_error` (decline, 3DS failure) is an expected test
 * outcome: it answers a result, not a failure. Any other Stripe error answers `STRIPE_REQUEST_FAILED` (its message is
 * not returned; messages can echo masked keys).
 */
export async function runSandboxCardPayment(credentials: StripeEnvironmentCredentials, payment: CheckedCardPayment, caller: SandboxTestCaller, fetcher?: StripeFetch): Promise<StripeDevTestsPaymentResult> {
  const { scenario } = payment
  const form = new URLSearchParams()
  form.set('amount', String(payment.amountCents))
  form.set('currency', credentials.defaultCurrency)
  form.set('payment_method', scenario.paymentMethodId)
  form.append('payment_method_types[]', 'card')
  form.set('confirm', 'true')
  form.set('description', payment.description)
  if (EMAIL.test(payment.email)) form.set('receipt_email', payment.email)
  setMetadata(form, scenario.id, caller, payment)
  if (payment.cardholderName) form.set('metadata[kr_cardholder_name]', payment.cardholderName)
  if (payment.postalCode) form.set('metadata[kr_postal_code]', payment.postalCode)
  form.append('expand[]', 'latest_charge')

  const response = await callStripeApi<Record<string, unknown>>(credentials, 'POST', '/v1/payment_intents', form, `kr-stripe-dev-tests-${caller.requestId}`, fetcher)
  const base = { method: 'card' as const, scenarioId: scenario.id, amountCents: payment.amountCents, currency: credentials.defaultCurrency, clientNumber: payment.clientNumber || null, icid: payment.icid || null, ivid: payment.ivid || null }
  if (response.ok && response.body) {
    const body = response.body
    const paymentIntentId = typeof body.id === 'string' ? body.id : null
    const card = readCardDetails(body.latest_charge)
    const result: StripeDevTestsPaymentResult = { ...base, paymentIntentId, status: typeof body.status === 'string' ? body.status : null, cardBrand: card.brand, cardLast4: card.last4, errorCode: null, declineCode: null, errorMessage: null, dashboardUrl: dashboardUrl(paymentIntentId, credentials.accountId), livemode: body.livemode === true }
    logLine('STRIPE_DEV_TESTS:card_ok', caller.requestId, { scenario: scenario.id, paymentIntentId, status: result.status, livemode: result.livemode })
    return result
  }
  // A card_error (decline, 3DS failure) is an expected test outcome, not a route failure.
  if (response.error?.type === 'card_error') {
    const intent = response.error.payment_intent ?? null
    const paymentIntentId = intent && typeof intent.id === 'string' ? intent.id : null
    const result: StripeDevTestsPaymentResult = { ...base, paymentIntentId, status: intent && typeof intent.status === 'string' ? intent.status : null, cardBrand: null, cardLast4: null, errorCode: response.error.code ?? null, declineCode: response.error.decline_code ?? null, errorMessage: response.error.message ?? null, dashboardUrl: dashboardUrl(paymentIntentId, credentials.accountId), livemode: intent?.livemode === true }
    logLine('STRIPE_DEV_TESTS:card_declined', caller.requestId, { scenario: scenario.id, paymentIntentId, code: result.errorCode, decline: result.declineCode })
    return result
  }
  // Other Stripe errors (bad key, invalid request): return only the code; messages can echo masked keys.
  logLine('STRIPE_DEV_TESTS:card_failed', caller.requestId, { status: response.status, type: response.error?.type ?? 'unknown', stripeCode: response.error?.code ?? 'none', stripeRequestId: response.stripeRequestId })
  throw stripeRequestFailed(response)
}

/**
 * Creates and confirms a sandbox ACH PaymentIntent with Stripe's test bank-account PaymentMethod and an online mandate
 * (the tester's IP and browser, as Stripe requires). The intent is read from a success or from any Stripe error.
 */
export async function runSandboxAchPayment(
  credentials: StripeEnvironmentCredentials,
  payment: CheckedAchPayment,
  caller: SandboxTestCaller,
  mandate: { ipAddress: string; userAgent: string },
  fetcher?: StripeFetch,
): Promise<StripeDevTestsPaymentResult> {
  const { scenario } = payment
  const form = new URLSearchParams()
  form.set('amount', String(payment.amountCents))
  form.set('currency', credentials.defaultCurrency)
  form.append('payment_method_types[]', 'us_bank_account')
  form.set('payment_method', scenario.paymentMethodId)
  form.set('confirm', 'true')
  form.set('mandate_data[customer_acceptance][type]', 'online')
  form.set('mandate_data[customer_acceptance][online][ip_address]', mandate.ipAddress)
  form.set('mandate_data[customer_acceptance][online][user_agent]', mandate.userAgent)
  form.set('description', payment.description)
  if (EMAIL.test(payment.email)) form.set('receipt_email', payment.email)
  setMetadata(form, scenario.id, caller, payment)
  form.set('metadata[kr_account_holder_name]', payment.holderName)
  form.append('expand[]', 'latest_charge')

  const response = await callStripeApi<Record<string, unknown>>(credentials, 'POST', '/v1/payment_intents', form, `kr-stripe-dev-tests-ach-${caller.requestId}`, fetcher)
  const intent = response.ok && response.body ? response.body : (response.error?.payment_intent ?? null)
  if (!intent) {
    logLine('STRIPE_DEV_TESTS:ach_failed', caller.requestId, { status: response.status, type: response.error?.type ?? 'unknown', stripeCode: response.error?.code ?? 'none' })
    throw stripeRequestFailed(response)
  }
  const paymentIntentId = typeof intent.id === 'string' ? intent.id : null
  const bank = readCardDetails(intent.latest_charge)
  const lastError = intent.last_payment_error && typeof intent.last_payment_error === 'object' ? (intent.last_payment_error as { code?: string; decline_code?: string; message?: string }) : null
  const result: StripeDevTestsPaymentResult = {
    method: 'ach',
    scenarioId: scenario.id,
    paymentIntentId,
    status: typeof intent.status === 'string' ? intent.status : null,
    amountCents: payment.amountCents,
    currency: credentials.defaultCurrency,
    cardBrand: bank.brand,
    cardLast4: bank.last4 ?? scenario.accountNumber.slice(-4),
    errorCode: response.error?.code ?? lastError?.code ?? null,
    declineCode: response.error?.decline_code ?? lastError?.decline_code ?? null,
    errorMessage: response.error?.message ?? lastError?.message ?? null,
    dashboardUrl: dashboardUrl(paymentIntentId, credentials.accountId),
    livemode: intent.livemode === true,
    clientNumber: payment.clientNumber || null,
    icid: payment.icid || null,
    ivid: payment.ivid || null,
  }
  logLine('STRIPE_DEV_TESTS:ach_ok', caller.requestId, { scenario: scenario.id, paymentIntentId, status: result.status })
  return result
}
