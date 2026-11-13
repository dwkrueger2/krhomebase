// file: packages/contracts/src/stripeDevTests.ts
/**
 * Shared, display-safe contract for Settings → Stripe Payment Configuration → Sandbox tests (super admin only).
 * Ported from the old `stripe-payment-configuration/stripeDevTests.types.ts` (constants, allowlists and helpers
 * unchanged) and the old POST route `/krhomebase/api/stripe-dev-tests` (one POST with an `action`), now four routes:
 *
 *   POST /v1/payment-providers/sandbox-tests/card-payments              old `create-test-payment`
 *   POST /v1/payment-providers/sandbox-tests/ach-payments               old `create-test-ach-payment`
 *   GET  /v1/payment-providers/sandbox-tests/payments/{paymentIntentId} old `get-payment`
 *   GET  /v1/payment-providers/sandbox-tests/payments?field=&value=     old `search-payments`
 *
 * This module is used by both the browser workspace and the API. Nothing here is secret: every card number and
 * PaymentMethod id below is a public Stripe test fixture documented at https://docs.stripe.com/testing.
 *
 * Security model (why the card number never leaves the browser):
 * - The workspace shows a prefilled card form so the test feels like a real
 *   checkout, but it only submits a `scenarioId`.
 * - The server maps that id to one of Stripe's predefined test PaymentMethods
 *   (`pm_card_visa`, …). Stripe recommends this over sending card numbers in
 *   API calls, even in a sandbox, so the code stays PCI-safe when it goes live.
 * - A number that is not in this allowlist is rejected in the browser and is
 *   never transmitted to KR Homebase or to Stripe.
 */

import { z } from 'zod'

/** Outcome Stripe documents for a test scenario. */
export type StripeDevTestExpectedOutcome = 'succeeded' | 'declined' | 'requires_action'

/** One allowlisted Stripe sandbox card scenario. */
export interface StripeDevTestScenario {
  /** Stable id sent from the browser to the API route. */
  id: string
  /** Label shown in the scenario selector. */
  label: string
  /** Card brand label shown beside the card number. */
  brand: string
  /** Public Stripe test card number, digits only. */
  cardNumber: string
  /** CVC length the card brand expects (American Express uses four digits). */
  cvcLength: 3 | 4
  /** Stripe predefined test PaymentMethod used server-side instead of the number. */
  paymentMethodId: string
  /** What Stripe documents will happen when this card is charged. */
  expectedOutcome: StripeDevTestExpectedOutcome
  /** One-line explanation shown under the form. */
  note: string
}

/**
 * Allowlisted Stripe sandbox scenarios. The first entry (Visa 4242) is the
 * default the workspace prepopulates.
 *
 * Source: https://docs.stripe.com/testing (card numbers, PaymentMethods, and
 * declined-payment tables).
 */
export const STRIPE_DEV_TEST_SCENARIOS: readonly StripeDevTestScenario[] = [
  { id: 'visa-success', label: 'Visa · payment succeeds', brand: 'Visa', cardNumber: '4242424242424242', cvcLength: 3, paymentMethodId: 'pm_card_visa', expectedOutcome: 'succeeded', note: 'Standard Visa test card. The PaymentIntent should finish as succeeded.' },
  { id: 'visa-debit-success', label: 'Visa debit · payment succeeds', brand: 'Visa (debit)', cardNumber: '4000056655665556', cvcLength: 3, paymentMethodId: 'pm_card_visa_debit', expectedOutcome: 'succeeded', note: 'Visa debit test card. The PaymentIntent should finish as succeeded.' },
  { id: 'mastercard-success', label: 'Mastercard · payment succeeds', brand: 'Mastercard', cardNumber: '5555555555554444', cvcLength: 3, paymentMethodId: 'pm_card_mastercard', expectedOutcome: 'succeeded', note: 'Mastercard test card. The PaymentIntent should finish as succeeded.' },
  { id: 'amex-success', label: 'American Express · payment succeeds', brand: 'American Express', cardNumber: '378282246310005', cvcLength: 4, paymentMethodId: 'pm_card_amex', expectedOutcome: 'succeeded', note: 'American Express test card (four-digit CVC). The PaymentIntent should finish as succeeded.' },
  { id: 'generic-decline', label: 'Declined · generic decline', brand: 'Visa', cardNumber: '4000000000000002', cvcLength: 3, paymentMethodId: 'pm_card_visa_chargeDeclined', expectedOutcome: 'declined', note: 'Stripe returns card_declined / generic_decline.' },
  { id: 'insufficient-funds', label: 'Declined · insufficient funds', brand: 'Visa', cardNumber: '4000000000009995', cvcLength: 3, paymentMethodId: 'pm_card_visa_chargeDeclinedInsufficientFunds', expectedOutcome: 'declined', note: 'Stripe returns card_declined / insufficient_funds.' },
  { id: 'authentication-required', label: '3D Secure · authentication required', brand: 'Visa', cardNumber: '4000002760003184', cvcLength: 3, paymentMethodId: 'pm_card_authenticationRequired', expectedOutcome: 'requires_action', note: 'Always requires 3D Secure. Without Stripe.js the PaymentIntent stops at requires_action.' },
] as const

/** Default scenario used to prepopulate the form (Visa 4242 4242 4242 4242). */
export const STRIPE_DEV_TEST_DEFAULT_SCENARIO: StripeDevTestScenario = STRIPE_DEV_TEST_SCENARIOS[0]!

/** Smallest USD charge Stripe accepts, in cents ($0.50). */
export const STRIPE_DEV_TEST_MIN_AMOUNT_CENTS = 50

/** Upper guard for sandbox test charges, in cents ($1,000.00). */
export const STRIPE_DEV_TEST_MAX_AMOUNT_CENTS = 100_000

/** Finds an allowlisted scenario by id; null when the id is unknown. */
export function findStripeDevTestScenario(scenarioId: unknown): StripeDevTestScenario | null {
  if (typeof scenarioId !== 'string') return null
  return STRIPE_DEV_TEST_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? null
}

/** Finds an allowlisted scenario from a typed card number (spaces and dashes ignored); null for any other number. */
export function findStripeDevTestScenarioByCardNumber(cardNumber: string): StripeDevTestScenario | null {
  const digits = cardNumber.replace(/[\s-]/g, '')
  return STRIPE_DEV_TEST_SCENARIOS.find((scenario) => scenario.cardNumber === digits) ?? null
}

/** Formats a card number in groups for display (4-4-4-4, or 4-6-5 for Amex), e.g. `4242 4242 4242 4242`. */
export function formatStripeDevTestCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '')
  if (digits.length === 15) return `${digits.slice(0, 4)} ${digits.slice(4, 10)} ${digits.slice(10)}`
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Outcome Stripe documents for an ACH test bank account. */
export type StripeDevTestAchOutcome = 'succeeds' | 'fails' | 'disputed' | 'stays_processing'

/** One allowlisted Stripe sandbox ACH (US bank account) scenario. */
export interface StripeDevTestAchScenario {
  id: string
  label: string
  /** Public Stripe test account number (routing is always 110000000). */
  accountNumber: string
  /** Stripe predefined test PaymentMethod used server-side instead of the numbers. */
  paymentMethodId: string
  expectedOutcome: StripeDevTestAchOutcome
  note: string
}

/** Stripe's test routing number for every ACH scenario. */
export const STRIPE_DEV_TEST_ACH_ROUTING = '110000000'

/**
 * Allowlisted Stripe sandbox ACH scenarios (first is the default).
 * Source: https://docs.stripe.com/payments/ach-direct-debit/accept-a-payment (Test account numbers).
 */
export const STRIPE_DEV_TEST_ACH_SCENARIOS: readonly StripeDevTestAchScenario[] = [
  { id: 'ach-success', label: 'ACH · payment succeeds', accountNumber: '000123456789', paymentMethodId: 'pm_usBankAccount_success', expectedOutcome: 'succeeds', note: 'Starts as processing, then succeeds (sandbox settles quickly; use Look up to see it change).' },
  { id: 'ach-insufficient-funds', label: 'ACH · insufficient funds', accountNumber: '000222222227', paymentMethodId: 'pm_usBankAccount_insufficientFunds', expectedOutcome: 'fails', note: 'Fails with insufficient funds (the status moves to requires_payment_method).' },
  { id: 'ach-account-closed', label: 'ACH · account closed', accountNumber: '000111111113', paymentMethodId: 'pm_usBankAccount_accountClosed', expectedOutcome: 'fails', note: 'Fails because the account is closed.' },
  { id: 'ach-no-account', label: 'ACH · no account found', accountNumber: '000111111116', paymentMethodId: 'pm_usBankAccount_noAccount', expectedOutcome: 'fails', note: 'Fails because no account is found.' },
  { id: 'ach-debit-not-authorized', label: 'ACH · debit not authorized', accountNumber: '000333333335', paymentMethodId: 'pm_usBankAccount_debitNotAuthorized', expectedOutcome: 'fails', note: 'Fails because debits are not authorized.' },
  { id: 'ach-dispute', label: 'ACH · succeeds, then disputed', accountNumber: '000555555559', paymentMethodId: 'pm_usBankAccount_dispute', expectedOutcome: 'disputed', note: 'Succeeds, then a dispute is opened (watch for it in the Dashboard).' },
  { id: 'ach-processing', label: 'ACH · stays processing', accountNumber: '000000000009', paymentMethodId: 'pm_usBankAccount_processing', expectedOutcome: 'stays_processing', note: 'Stays processing indefinitely; useful for testing status checks and cancellation.' },
] as const

/** Default ACH scenario. */
export const STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO: StripeDevTestAchScenario = STRIPE_DEV_TEST_ACH_SCENARIOS[0]!

/** Finds an ACH scenario by id. */
export function findStripeDevTestAchScenario(scenarioId: unknown): StripeDevTestAchScenario | null {
  if (typeof scenarioId !== 'string') return null
  return STRIPE_DEV_TEST_ACH_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? null
}

/** Finds an ACH scenario from a typed account number. */
export function findStripeDevTestAchScenarioByAccountNumber(accountNumber: string): StripeDevTestAchScenario | null {
  const digits = accountNumber.replace(/\D/g, '')
  return STRIPE_DEV_TEST_ACH_SCENARIOS.find((scenario) => scenario.accountNumber === digits) ?? null
}

/** KR public record id shape (ICID, IVID): seven uppercase letters/digits, e.g. K7M2Q9A. */
export const STRIPE_DEV_TEST_PUBLIC_ID_PATTERN = /^[A-Z0-9]{7}$/

/** KR client number: digits only (3 today, 4 later); up to 6 allowed for headroom. */
export const STRIPE_DEV_TEST_CLIENT_NUMBER_PATTERN = /^\d{1,6}$/

/** Stripe PaymentIntent id, e.g. `pi_3Q…`. */
export const STRIPE_DEV_TEST_PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]{8,64}$/

/**
 * KR reference fields a payment can be searched by. Each maps to one Stripe
 * PaymentIntent metadata key written by the card and ACH test payments.
 */
export const STRIPE_DEV_TEST_SEARCH_FIELDS = {
  ivid: { label: 'Invoice (IVID)', metadataKey: 'kr_ivid' },
  icid: { label: 'Client (ICID)', metadataKey: 'kr_icid' },
  clientNumber: { label: 'Client No', metadataKey: 'kr_client_number' },
} as const

/** Searchable KR reference field id. */
export type StripeDevTestSearchField = keyof typeof STRIPE_DEV_TEST_SEARCH_FIELDS

/** True when `field` is one of the searchable fields (own keys only, so `toString` and the like are refused). */
export function isStripeDevTestSearchField(field: unknown): field is StripeDevTestSearchField {
  return typeof field === 'string' && Object.prototype.hasOwnProperty.call(STRIPE_DEV_TEST_SEARCH_FIELDS, field)
}

/**
 * Validates one KR reference value for its field. `value` is trimmed; ICID/IVID are expected uppercase.
 *
 * @returns True when the value has the right shape (safe to place in a Stripe search query).
 */
export function isValidStripeDevTestReference(field: StripeDevTestSearchField, value: string): boolean {
  return field === 'clientNumber' ? STRIPE_DEV_TEST_CLIENT_NUMBER_PATTERN.test(value) : STRIPE_DEV_TEST_PUBLIC_ID_PATTERN.test(value)
}

const optionalText = (what: string) => z.string().max(1000).optional().describe(what)
const reference = (what: string) => z.string().max(100).optional().describe(`${what}; blank for none. A value of the wrong shape answers STRIPE_DEV_TESTS_INVALID_REFERENCE.`)

export const StripeDevTestsCardPaymentBody = z.object({
  scenarioId: z.string().max(100).describe('Allowlisted card scenario id; the card number itself is never sent.'),
  amountCents: z.number().describe('Charge amount in cents, 50 to 100,000 (rounded).'),
  description: optionalText('PaymentIntent description shown in the Stripe Dashboard (200 characters; blank uses the default).'),
  cardholderName: optionalText('Cardholder name, stored as PaymentIntent metadata (100 characters).'),
  email: optionalText('Optional receipt email (Stripe sends no receipts in a sandbox).'),
  postalCode: optionalText('Billing postal code, stored as PaymentIntent metadata (20 characters).'),
  clientNumber: reference('KR client number → metadata `kr_client_number`'),
  icid: reference('KR client ICID → metadata `kr_icid`'),
  ivid: reference('KR invoice IVID → metadata `kr_ivid`'),
})
export type StripeDevTestsCardPaymentBody = z.infer<typeof StripeDevTestsCardPaymentBody>

export const StripeDevTestsAchPaymentBody = z.object({
  scenarioId: z.string().max(100).describe('Allowlisted ACH scenario id; routing and account numbers are never sent.'),
  amountCents: z.number().describe('Charge amount in cents, 50 to 100,000 (rounded).'),
  description: optionalText('PaymentIntent description (200 characters; blank uses the default).'),
  accountHolderName: optionalText('Account holder name (required by Stripe for US bank accounts; 100 characters).'),
  email: optionalText('Optional receipt email.'),
  clientNumber: reference('KR client number → metadata `kr_client_number`'),
  icid: reference('KR client ICID → metadata `kr_icid`'),
  ivid: reference('KR invoice IVID → metadata `kr_ivid`'),
})
export type StripeDevTestsAchPaymentBody = z.infer<typeof StripeDevTestsAchPaymentBody>

export const StripeDevTestsPaymentResult = z.object({
  method: z.enum(['card', 'ach']).describe('`card` or `ach`.'),
  scenarioId: z.string().describe('Scenario that was run.'),
  paymentIntentId: z.string().nullable().describe('PaymentIntent id (`pi_…`) when Stripe created one.'),
  status: z.string().nullable().describe('PaymentIntent status such as `succeeded`, `processing`, `requires_action` or `requires_payment_method`.'),
  amountCents: z.number().int().describe('Amount in cents.'),
  currency: z.string().describe('Currency code.'),
  cardBrand: z.string().nullable().describe('Card brand (or bank name for ACH) reported by Stripe on the charge.'),
  cardLast4: z.string().nullable().describe('Card (or bank account) last four.'),
  errorCode: z.string().nullable().describe('Stripe error code on a decline, e.g. `card_declined`.'),
  declineCode: z.string().nullable().describe('Stripe decline code, e.g. `insufficient_funds`.'),
  errorMessage: z.string().nullable().describe("Stripe's own message on a decline."),
  dashboardUrl: z.string().nullable().describe('Stripe Dashboard link to the PaymentIntent (test view).'),
  livemode: z.boolean().describe("Stripe's livemode flag; false for every sandbox payment."),
  clientNumber: z.string().nullable().describe('KR client number sent as metadata, or null.'),
  icid: z.string().nullable().describe('KR client ICID sent as metadata, or null.'),
  ivid: z.string().nullable().describe('KR invoice IVID sent as metadata, or null.'),
})
export type StripeDevTestsPaymentResult = z.infer<typeof StripeDevTestsPaymentResult>

export const StripeDevTestsResultData = z.object({
  result: StripeDevTestsPaymentResult.describe('The test payment, succeeded or declined (a decline is an expected outcome, not a failure).'),
})
export type StripeDevTestsResultData = z.infer<typeof StripeDevTestsResultData>

export const StripeDevTestsPaymentSummary = z.object({
  paymentIntentId: z.string().describe('PaymentIntent id (`pi_…`).'),
  status: z.string().describe('Stripe status (`unknown` when Stripe sent none).'),
  amountCents: z.number().int().describe('Amount requested, in cents.'),
  amountReceivedCents: z.number().int().describe('Amount actually received, in cents.'),
  currency: z.string().describe('Currency code.'),
  createdIso: z.string().describe('Creation time as an ISO string (empty when unknown).'),
  description: z.string().nullable().describe('PaymentIntent description.'),
  cardBrand: z.string().nullable().describe('Card brand (or bank name) from the latest charge.'),
  cardLast4: z.string().nullable().describe('Card (or bank account) last four from the latest charge.'),
  lastErrorCode: z.string().nullable().describe('Last payment error code, if any.'),
  lastDeclineCode: z.string().nullable().describe('Last decline code, if any.'),
  scenarioId: z.string().nullable().describe('KR metadata: test scenario id.'),
  clientNumber: z.string().nullable().describe('KR metadata: client number.'),
  icid: z.string().nullable().describe('KR metadata: client ICID.'),
  ivid: z.string().nullable().describe('KR metadata: invoice IVID.'),
  livemode: z.boolean().describe("Stripe's livemode flag."),
  dashboardUrl: z.string().nullable().describe('Sandbox Dashboard link.'),
})
export type StripeDevTestsPaymentSummary = z.infer<typeof StripeDevTestsPaymentSummary>

export const StripeDevTestsPaymentParams = z.object({
  paymentIntentId: z.string().min(1).max(100).describe('PaymentIntent id (`pi_` and 8 to 64 letters or digits); another shape answers STRIPE_DEV_TESTS_INVALID_PAYMENT_INTENT.'),
})
export type StripeDevTestsPaymentParams = z.infer<typeof StripeDevTestsPaymentParams>

export const StripeDevTestsPaymentData = z.object({
  payment: StripeDevTestsPaymentSummary.describe('The PaymentIntent as Stripe has it now.'),
})
export type StripeDevTestsPaymentData = z.infer<typeof StripeDevTestsPaymentData>

export const StripeDevTestsSearchQuery = z.object({
  field: z.string().max(40).describe('`ivid`, `icid` or `clientNumber`; another value answers STRIPE_DEV_TESTS_INVALID_SEARCH_FIELD.'),
  value: z.string().max(100).describe('Value to match exactly (ICID and IVID are uppercased); a wrong shape answers STRIPE_DEV_TESTS_INVALID_REFERENCE.'),
})
export type StripeDevTestsSearchQuery = z.infer<typeof StripeDevTestsSearchQuery>

export const StripeDevTestsSearchResult = z.object({
  field: z.enum(['ivid', 'icid', 'clientNumber']).describe('The field searched.'),
  value: z.string().describe('The value searched, as cleaned by the API.'),
  payments: z.array(StripeDevTestsPaymentSummary).describe('Newest first, up to 20.'),
  hasMore: z.boolean().describe('True when Stripe has more matches than returned.'),
})
export type StripeDevTestsSearchResult = z.infer<typeof StripeDevTestsSearchResult>

export const StripeDevTestsSearchData = z.object({
  search: StripeDevTestsSearchResult.describe('The search and its matches. Stripe search can lag a new payment by about a minute.'),
})
export type StripeDevTestsSearchData = z.infer<typeof StripeDevTestsSearchData>
