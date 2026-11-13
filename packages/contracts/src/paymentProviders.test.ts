// file: packages/contracts/src/paymentProviders.test.ts
/**
 * Stripe Payment Configuration (stage 6): the rules the schemas alone do not show. The key patterns are bound to their
 * environment (a test key never fits live and the other way round); the sandbox-test allowlists find scenarios by id,
 * by card number with spaces or dashes, and by account number; the search field check refuses inherited names such
 * as `toString` (old oddity 11); and the reference shapes are the old ones.
 *
 * Run: pnpm --dir packages/contracts exec vitest run src/paymentProviders.test.ts
 */

import { describe, expect, it } from 'vitest'
import { PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN, PAYMENT_PROVIDER_KEY_PATTERNS, PaymentProviderDeleteBody, PaymentProviderSaveBody } from './paymentProviders.ts'
import {
  findStripeDevTestAchScenarioByAccountNumber,
  findStripeDevTestScenarioByCardNumber,
  formatStripeDevTestCardNumber,
  isStripeDevTestSearchField,
  isValidStripeDevTestReference,
  STRIPE_DEV_TEST_DEFAULT_SCENARIO,
} from './stripeDevTests.ts'

const fake = (prefix: string) => `${prefix}${'A1b2C3d4E5'.repeat(2)}`

describe('payment provider key patterns', () => {
  it('accepts each environment only its own keys', () => {
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.sandbox.secret.test(fake('sk_test_'))).toBe(true)
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.sandbox.secret.test(fake('rk_test_'))).toBe(true)
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.sandbox.secret.test(fake('sk_live_'))).toBe(false)
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.live.secret.test(fake('rk_live_'))).toBe(true)
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.live.publishable.test(fake('pk_test_'))).toBe(false)
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.live.webhook.test(fake('whsec_'))).toBe(true)
    expect(PAYMENT_PROVIDER_KEY_PATTERNS.sandbox.secret.test('sk_test_short')).toBe(false)
    expect(PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN.test('acct_123abc')).toBe(true)
    expect(PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN.test('acct_12')).toBe(false)
  })

  it('needs the editable fields to save and a confirmation to delete', () => {
    expect(PaymentProviderSaveBody.safeParse({}).success).toBe(false)
    expect(PaymentProviderDeleteBody.safeParse({ confirmation: 'DELETE KEY' }).success).toBe(true)
    expect(PaymentProviderDeleteBody.safeParse({}).success).toBe(false)
  })
})

describe('sandbox test allowlists', () => {
  it('finds a card by its number with spaces or dashes, and formats Amex 4-6-5', () => {
    expect(findStripeDevTestScenarioByCardNumber('4242 4242-4242 4242')?.id).toBe('visa-success')
    expect(findStripeDevTestScenarioByCardNumber('4111 1111 1111 1111')).toBeNull()
    expect(formatStripeDevTestCardNumber('378282246310005')).toBe('3782 822463 10005')
    expect(formatStripeDevTestCardNumber(STRIPE_DEV_TEST_DEFAULT_SCENARIO.cardNumber)).toBe('4242 4242 4242 4242')
    expect(findStripeDevTestAchScenarioByAccountNumber('000222222227')?.id).toBe('ach-insufficient-funds')
  })

  it('refuses inherited names as search fields and checks reference shapes', () => {
    expect(isStripeDevTestSearchField('ivid')).toBe(true)
    expect(isStripeDevTestSearchField('toString')).toBe(false)
    expect(isStripeDevTestSearchField('constructor')).toBe(false)
    expect(isValidStripeDevTestReference('clientNumber', '999')).toBe(true)
    expect(isValidStripeDevTestReference('clientNumber', '1234567')).toBe(false)
    expect(isValidStripeDevTestReference('icid', 'TSTC001')).toBe(true)
    expect(isValidStripeDevTestReference('ivid', 'tsti001')).toBe(false)
  })
})
