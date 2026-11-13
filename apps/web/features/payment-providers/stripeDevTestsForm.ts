// file: apps/web/features/payment-providers/stripeDevTestsForm.ts
/**
 * The sandbox tests' card form values and browser checks, moved unchanged out of the old
 * `StripeDevTestsWorkspace.client.tsx` (which grew past the 400-line limit here): the form state, its prepopulated
 * values, dollars to cents, the currency format, and `validateForm` with the old messages.
 */

import {
  findStripeDevTestScenarioByCardNumber,
  formatStripeDevTestCardNumber,
  isValidStripeDevTestReference,
  STRIPE_DEV_TEST_DEFAULT_SCENARIO,
  STRIPE_DEV_TEST_MAX_AMOUNT_CENTS,
  STRIPE_DEV_TEST_MIN_AMOUNT_CENTS,
} from '@krhomebase/contracts'

/** Editable form values. Card fields stay in the browser; only `scenarioId` is posted. */
export interface StripeDevTestsFormState {
  scenarioId: string
  cardNumber: string
  expiry: string
  cvc: string
  postalCode: string
  cardholderName: string
  email: string
  clientNumber: string
  icid: string
  ivid: string
  amount: string
  description: string
}

/** Field-keyed validation messages. */
export type StripeDevTestsFormErrors = Partial<Record<keyof StripeDevTestsFormState, string>>

/** Prepopulated values: Visa 4242 4242 4242 4242, Stripe's documented test expiry/CVC, and test KR references. */
export function createDefaultForm(): StripeDevTestsFormState {
  return {
    scenarioId: STRIPE_DEV_TEST_DEFAULT_SCENARIO.id,
    cardNumber: formatStripeDevTestCardNumber(STRIPE_DEV_TEST_DEFAULT_SCENARIO.cardNumber),
    expiry: '12/34',
    cvc: '123',
    postalCode: '75069',
    cardholderName: 'KR Sandbox Tester',
    email: 'sandbox-test@example.com',
    clientNumber: '999',
    icid: 'TSTC001',
    ivid: 'TSTI001',
    amount: '1.00',
    description: 'KR Homebase Stripe sandbox test',
  }
}

/** Converts a dollar string such as `12.50` to cents, or NaN. */
export function dollarsToCents(amount: string): number {
  const normalized = amount.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN
  return Math.round(Number(normalized) * 100)
}

/** Formats cents as a USD amount. */
export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

/**
 * Validates the form in the browser. The card number must be an allowlisted
 * Stripe test number; anything else is refused before any request is made.
 * KR references are optional but must have the right shape when present.
 *
 * @param now - The current time (for the expiry check); tests pass a fixed one.
 * @returns Field-keyed error messages; empty when the form can be submitted.
 */
export function validateForm(form: StripeDevTestsFormState, now: Date = new Date()): StripeDevTestsFormErrors {
  const errors: StripeDevTestsFormErrors = {}
  const scenario = findStripeDevTestScenarioByCardNumber(form.cardNumber)
  if (!scenario) errors.cardNumber = 'Card: only Stripe test card numbers are accepted. Never enter a real card.'

  const expiryMatch = form.expiry.trim().match(/^(\d{2})\s*\/\s*(\d{2})$/)
  if (!expiryMatch) {
    errors.expiry = 'Expiry: use MM/YY, e.g. 12/34.'
  } else {
    const month = Number(expiryMatch[1])
    const year = 2000 + Number(expiryMatch[2])
    const expired = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)
    if (month < 1 || month > 12 || expired) errors.expiry = 'Expiry: use any valid future date.'
  }

  const cvcLength = scenario?.cvcLength ?? 3
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(form.cvc.trim())) errors.cvc = `CVC: use any ${cvcLength}-digit CVC.`

  if (form.clientNumber.trim() && !isValidStripeDevTestReference('clientNumber', form.clientNumber.trim())) errors.clientNumber = 'Client No: digits only.'
  if (form.icid.trim() && !isValidStripeDevTestReference('icid', form.icid.trim())) errors.icid = 'ICID: 7 letters/digits, e.g. K7M2Q9A.'
  if (form.ivid.trim() && !isValidStripeDevTestReference('ivid', form.ivid.trim())) errors.ivid = 'IVID: 7 letters/digits, e.g. A1B2C3D.'

  const cents = dollarsToCents(form.amount)
  if (!Number.isFinite(cents) || cents < STRIPE_DEV_TEST_MIN_AMOUNT_CENTS || cents > STRIPE_DEV_TEST_MAX_AMOUNT_CENTS) {
    errors.amount = `Amount: between ${formatCents(STRIPE_DEV_TEST_MIN_AMOUNT_CENTS)} and ${formatCents(STRIPE_DEV_TEST_MAX_AMOUNT_CENTS)}.`
  }
  return errors
}
