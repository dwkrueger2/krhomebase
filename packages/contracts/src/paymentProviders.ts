// file: packages/contracts/src/paymentProviders.ts
/**
 * Stripe Payment Configuration (Settings and Dashboard plan, stage 6; super admin only). Ported from the old
 * browser contract `stripe-payment-configuration/paymentProvider.types.ts` and the one old route
 * `/krhomebase/api/payment-providers` (GET plus a POST with an `action`).
 *
 *   GET    /v1/payment-providers                                    every provider profile and the encryption key state
 *   PUT    /v1/payment-providers/{environment}                      save one profile (`providerId` null creates one)
 *   DELETE /v1/payment-providers/{environment}/{providerId}         delete one profile (typed `DELETE KEY` confirmation)
 *   POST   /v1/payment-providers/{environment}/test-connection      check the stored key with Stripe (`GET /v1/balance`)
 *
 * There are two Stripe environments, **live** and **sandbox**. Each may hold several provider profiles identified by
 * `ppid`; one per environment is enabled. Secret values (the secret or restricted key, the webhook signing secret) are
 * write-only: the browser may send a new value once, on Save, and never receives one back. It receives only the
 * key-type prefix and the SHA-256 hash, which lets a super admin confirm which key is stored by hashing a candidate in
 * the browser without the server ever returning the secret.
 *
 * Kept from the old contract: every field name, the key patterns, the `DELETE KEY` phrase and `expectedUpdatedAt`
 * (optimistic concurrency). Changed: the environment is in the address instead of the body, and each action is its own
 * route.
 */

import { z } from 'zod'

/** Display order: live on the left, sandbox on the right. */
export const PAYMENT_PROVIDER_ENVIRONMENTS = ['live', 'sandbox'] as const

export const PaymentProviderEnvironment = z.enum(PAYMENT_PROVIDER_ENVIRONMENTS).describe('Stripe environment: `live` or `sandbox` (Stripe test mode).')
export type PaymentProviderEnvironment = z.infer<typeof PaymentProviderEnvironment>

/** Expected key shapes per environment (old `PAYMENT_PROVIDER_KEY_PATTERNS`, unchanged). The pay Worker checks the same. */
export const PAYMENT_PROVIDER_KEY_PATTERNS: Record<PaymentProviderEnvironment, { secret: RegExp; publishable: RegExp; webhook: RegExp }> = {
  sandbox: { secret: /^(sk|rk)_test_[A-Za-z0-9]{10,}$/, publishable: /^pk_test_[A-Za-z0-9]{10,}$/, webhook: /^whsec_[A-Za-z0-9]{10,}$/ },
  live: { secret: /^(sk|rk)_live_[A-Za-z0-9]{10,}$/, publishable: /^pk_live_[A-Za-z0-9]{10,}$/, webhook: /^whsec_[A-Za-z0-9]{10,}$/ },
}

/** Stripe account id shape (`acct_…`), checked by the card and the API. */
export const PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{6,}$/

/** The exact phrase a super admin types to delete a provider profile. */
export const PAYMENT_PROVIDER_DELETE_PHRASE = 'DELETE KEY'

export const PaymentProviderConfig = z.object({
  environment: PaymentProviderEnvironment,
  id: z.string().nullable().describe('Row id (`ppv_<uuid>`), or null for a new draft in the browser.'),
  ppid: z.number().int().nullable().describe('Human-facing sequential provider-profile number, unique over every row; null for a new draft.'),
  configured: z.boolean().describe('True when enabled and both the publishable key and a readable secret key are present.'),
  isEnabled: z.boolean().describe('True for the one profile of its environment that payments use.'),
  displayName: z.string().describe('Display name (default `Stripe live` / `Stripe sandbox`). The card has no field for it; it is sent back unchanged.'),
  accountId: z.string().describe('Stripe account id (`acct_…`), used only for Open in Stripe Dashboard links; empty when not set.'),
  accountEmail: z.string().describe('The email used to sign in to Stripe, for reference; empty when not set.'),
  publishableKey: z.string().describe('Publishable key (`pk_live_…` / `pk_test_…`), public by design; empty when not set.'),
  secretKeyName: z.string().describe('Name given to the secret or restricted key in Stripe, for reference; empty when not set.'),
  secretKeyPrefix: z.string().nullable().describe('Key-type prefix only, for example `sk_test_` or `rk_live_`; null when no key is stored.'),
  secretKeyHash: z.string().nullable().describe('SHA-256 (lowercase hex) of the stored secret key; null when none is stored. Never the key.'),
  secretKeySetAt: z.string().nullable().describe('When the secret key was last stored (ISO time).'),
  webhookSecretName: z.string().describe('Name of the Stripe webhook (event destination) for this profile, for reference.'),
  webhookSecretHash: z.string().nullable().describe('SHA-256 (lowercase hex) of the stored webhook signing secret; null when none is stored.'),
  webhookSecretSetAt: z.string().nullable().describe('When the webhook secret was last stored (ISO time).'),
  apiVersion: z.string().describe('Pinned Stripe API version (`YYYY-MM-DD`); empty uses the account default.'),
  defaultCurrency: z.string().describe('Three-letter lowercase currency for charges (default `usd`).'),
  lastVerifiedAt: z.string().nullable().describe('When the key was last checked with Stripe (ISO time).'),
  lastVerifiedStatus: z.string().nullable().describe('`ok`, or the error code from the last connection test.'),
  notes: z.string().describe('Free text for super admins (never a key).'),
  updatedAt: z.string().nullable().describe('Last change (ISO time); sent back as `expectedUpdatedAt` so a change made elsewhere is noticed.'),
  problems: z.array(z.string()).describe('Display-safe problems, in order (for example "Publishable key is missing.").'),
})
export type PaymentProviderConfig = z.infer<typeof PaymentProviderConfig>

export const PaymentProviderEncryption = z.object({
  configured: z.boolean().describe('True when the API has a usable payment encryption key (Worker secret `KR_PAYMENT_PROVIDER_KEK`).'),
  kekId: z.string().nullable().describe('First 8 hex characters of the SHA-256 of the key text; identifies the key without revealing it.'),
  problem: z.string().nullable().describe('Why the key is not usable: `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` or `PAYMENT_PROVIDER_KEK_INVALID`; null when it is.'),
})
export type PaymentProviderEncryption = z.infer<typeof PaymentProviderEncryption>

export const PaymentProvidersData = z.object({
  providers: z.array(PaymentProviderConfig).describe('Every stored Stripe profile, live before sandbox, then by `ppid`. No secret values.'),
  encryption: PaymentProviderEncryption.describe('Encryption key state; secrets cannot be saved or used without it.'),
})
export type PaymentProviderListResult = z.infer<typeof PaymentProvidersData>
export type PaymentProvidersData = z.infer<typeof PaymentProvidersData>

const text = (max: number, what: string) => z.string().max(max).describe(`${what} Trimmed by the API.`)

export const PaymentProviderEditableFields = z.object({
  displayName: text(1000, 'Display name, kept to 80 characters.'),
  isEnabled: z.boolean().describe('Enabled. Saving an enabled profile disables the other profiles of the same environment in the same save.'),
  accountId: text(1000, 'Stripe account id (`acct_` and at least 6 letters or digits), or empty.'),
  accountEmail: text(1000, 'Stripe sign-in email, or empty.'),
  publishableKey: text(1000, 'Publishable key of this environment (`pk_live_…` or `pk_test_…`), or empty.'),
  secretKeyName: text(1000, 'Name of the secret key in Stripe, kept to 80 characters.'),
  webhookSecretName: text(1000, 'Name of the webhook in Stripe, kept to 80 characters.'),
  apiVersion: text(1000, 'Pinned API version `YYYY-MM-DD` (optionally `.name`), or empty for the account default.'),
  defaultCurrency: text(1000, 'Three-letter currency, lowercased; empty means `usd`.'),
  notes: text(5000, 'Notes, kept to 500 characters. Never put a key here.'),
})
export type PaymentProviderEditableFields = z.infer<typeof PaymentProviderEditableFields>

export const PaymentProviderEnvironmentParams = z.object({
  environment: PaymentProviderEnvironment,
})
export type PaymentProviderEnvironmentParams = z.infer<typeof PaymentProviderEnvironmentParams>

export const PaymentProviderParams = z.object({
  environment: PaymentProviderEnvironment,
  providerId: z.string().min(1).max(200).describe('Provider profile row id (`ppv_<uuid>`).'),
})
export type PaymentProviderParams = z.infer<typeof PaymentProviderParams>

const expectedUpdatedAt = z
  .string()
  .max(100)
  .nullable()
  .optional()
  .describe('The `updatedAt` the editor loaded. Left out, no check is made; when it differs from the stored row the change is refused (`PAYMENT_PROVIDER_CHANGED_ELSEWHERE`).')

export const PaymentProviderSaveBody = z.object({
  providerId: z.string().max(200).nullable().optional().describe('Row id to change; null or left out creates a new profile.'),
  fields: PaymentProviderEditableFields.describe('The editable, non-secret fields.'),
  secretKey: z
    .string()
    .max(1000)
    .optional()
    .describe('New secret or restricted key of this environment; left out keeps the stored one. Checked with Stripe, stored encrypted, never returned or logged.'),
  webhookSecret: z
    .string()
    .max(1000)
    .optional()
    .describe('New webhook signing secret (`whsec_…`); left out keeps the stored one. Stored encrypted, never returned or logged.'),
  expectedUpdatedAt,
})
export type PaymentProviderSaveBody = z.infer<typeof PaymentProviderSaveBody>

export const PaymentProviderSavedData = z.object({
  provider: PaymentProviderConfig.describe('The saved profile, read back after the save.'),
})
export type PaymentProviderSavedData = z.infer<typeof PaymentProviderSavedData>

export const PaymentProviderDeleteBody = z.object({
  confirmation: z.string().max(100).describe('Must be exactly `DELETE KEY` (case-sensitive).'),
  expectedUpdatedAt,
})
export type PaymentProviderDeleteBody = z.infer<typeof PaymentProviderDeleteBody>

export const PaymentProviderDeletedData = z.object({
  deleted: z.literal(true).describe('Always true: the profile row was removed.'),
})
export type PaymentProviderDeletedData = z.infer<typeof PaymentProviderDeletedData>

export const PaymentProviderBalance = z.object({
  amount: z.number().int().describe('Amount in the smallest currency unit (cents).'),
  currency: z.string().describe('Lowercase currency code.'),
})
export type PaymentProviderBalance = z.infer<typeof PaymentProviderBalance>

export const PaymentProviderConnection = z.object({
  environment: PaymentProviderEnvironment,
  livemode: z.boolean().describe("Stripe's livemode flag for the key; always true for live and false for sandbox, or the test fails."),
  available: z.array(PaymentProviderBalance).describe('Available balance per currency.'),
  pending: z.array(PaymentProviderBalance).describe('Pending balance per currency.'),
})
export type PaymentProviderConnectionResult = z.infer<typeof PaymentProviderConnection>
export type PaymentProviderConnection = z.infer<typeof PaymentProviderConnection>

export const PaymentProviderConnectionData = z.object({
  connection: PaymentProviderConnection.describe('The Stripe balance seen with the stored key.'),
})
export type PaymentProviderConnectionData = z.infer<typeof PaymentProviderConnectionData>
