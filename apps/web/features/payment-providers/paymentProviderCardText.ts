// file: apps/web/features/payment-providers/paymentProviderCardText.ts
/**
 * The Live / Sandbox card's text and draft helpers, moved unchanged out of the old `PaymentProviderConfigCard.client.tsx`
 * (which grew past the 400-line limit here): the field tips, the editable fields of a stored config, a new unsaved
 * profile, and the friendly sentences for error codes.
 *
 * Changed from the old file: the friendly sentence for `PAYMENT_PROVIDER_TABLE_MISSING` no longer mentions a CRUD
 * Worker deploy (the API reads the table directly now); `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY` is matched as a plain
 * code (the API no longer appends Stripe's code to it).
 */

import type { PaymentProviderConfig, PaymentProviderEditableFields, PaymentProviderEnvironment } from '@krhomebase/contracts'

/** Hover help for each field, shown by the info icon beside its label. */
export type PaymentProviderTipField = 'accountId' | 'accountEmail' | 'publishableKey' | 'secretKeyName' | 'secretKey' | 'webhookSecretName' | 'webhookSecret' | 'apiVersion' | 'defaultCurrency' | 'notes'

/** Tip text per field; the Account ID tip adds a sandbox-specific sentence. */
export function fieldTip(field: PaymentProviderTipField, environment: PaymentProviderEnvironment): string {
  const webhookUrl = `https://pay.krhomebase.com/stripe/webhook/${environment === 'live' ? 'live' : 'sandbox'}`
  const tips: Record<PaymentProviderTipField, string> = {
    accountId: `Stripe Dashboard → Settings (gear icon) → Business → Account details. The ID (acct_…) is listed there. Stripe moves this around, so you may also find it by clicking your account name in the top-left.${environment === 'sandbox' ? ' A sandbox has its own ID: switch into the sandbox first.' : ''} Optional; used only for Open in Stripe Dashboard links.`,
    accountEmail: 'The email you sign in to Stripe with. For reference only.',
    publishableKey: `Stripe Dashboard → Developers → API keys → Publishable key (${environment === 'live' ? 'pk_live_…' : 'pk_test_…'}). One per account or sandbox, public by design. Stripe.js uses it for card entry and the bank lookup.`,
    secretKeyName: 'The key name shown in Stripe → Developers → API keys. The standard key is called "Secret key"; a restricted key shows the name you gave it (e.g. krh-sandbox-secret-key). For reference, so you know which key to roll.',
    secretKey: `Paste the secret key (${environment === 'live' ? 'sk_live_' : 'sk_test_'}…) or a restricted key (${environment === 'live' ? 'rk_live_' : 'rk_test_'}…) from Developers → API keys. Stripe checks it on Save. It is stored encrypted and never shown again: only its prefix and SHA-256. To confirm which key is stored, paste it and press Check (compared in this browser, nothing is sent).`,
    webhookSecretName: `The Stripe Webhook name for this ${environment === 'live' ? 'Live' : 'Sandbox'} profile. The URL is ${webhookUrl}. For reference only.`,
    webhookSecret: `Signing secret (whsec_…) of the ${environment === 'live' ? 'Live' : 'Sandbox'} pay Worker event destination in Stripe → Workbench → Webhooks (${webhookUrl}, event payment_intent.succeeded). The pay Worker reads this profile's secret to verify events on that route. Stored encrypted, write-only.`,
    apiVersion: "Leave blank to use your Stripe account's default API version. Enter a dated version only to pin one.",
    defaultCurrency: 'Three-letter currency code for charges, lowercase (usd).',
    notes: 'Free text for Super Admins, e.g. where the key is kept in KeePass. Never put a key here.',
  }
  return tips[field]
}

/** Editable fields from a stored config. */
export function fieldsFrom(config: PaymentProviderConfig): PaymentProviderEditableFields {
  return {
    displayName: config.displayName,
    isEnabled: config.isEnabled,
    accountId: config.accountId,
    accountEmail: config.accountEmail,
    publishableKey: config.publishableKey,
    secretKeyName: config.secretKeyName,
    webhookSecretName: config.webhookSecretName,
    apiVersion: config.apiVersion,
    defaultCurrency: config.defaultCurrency,
    notes: config.notes,
  }
}

/** Account-level values a new profile carries forward from the selected (or first) one. */
export type PaymentProviderCreateDefaults = Pick<PaymentProviderConfig, 'accountId' | 'accountEmail' | 'defaultCurrency'>

/** Creates a new unsaved profile while carrying forward account-level values. */
export function newDraftConfig(environment: PaymentProviderEnvironment, defaults: PaymentProviderCreateDefaults): PaymentProviderConfig {
  return {
    environment,
    id: null,
    ppid: null,
    configured: false,
    isEnabled: true,
    displayName: '',
    accountId: defaults.accountId,
    accountEmail: defaults.accountEmail,
    publishableKey: '',
    secretKeyName: '',
    secretKeyPrefix: null,
    secretKeyHash: null,
    secretKeySetAt: null,
    webhookSecretName: '',
    webhookSecretHash: null,
    webhookSecretSetAt: null,
    apiVersion: '',
    defaultCurrency: defaults.defaultCurrency,
    lastVerifiedAt: null,
    lastVerifiedStatus: null,
    notes: '',
    updatedAt: null,
    problems: [],
  }
}

/** The account-level values of a profile, or empty ones (currency `usd`) when there is none. */
export function createDefaultsFrom(config: PaymentProviderConfig | undefined): PaymentProviderCreateDefaults {
  return { accountId: config?.accountId ?? '', accountEmail: config?.accountEmail ?? '', defaultCurrency: config?.defaultCurrency ?? 'usd' }
}

/** Friendly text for payment-provider error codes. */
export function friendlyProviderError(code: string): string | null {
  if (code === 'PAYMENT_PROVIDER_MODE_MISMATCH') return 'That key belongs to the other Stripe mode (test vs live).'
  if (code.startsWith('PAYMENT_PROVIDER_STRIPE_REJECTED_KEY')) return 'Stripe rejected the secret key.'
  if (code === 'PAYMENT_PROVIDER_CHANGED_ELSEWHERE') return 'This configuration was changed elsewhere. Reload and try again.'
  if (code === 'PAYMENT_PROVIDER_NOT_FOUND') return 'That provider profile no longer exists. Refresh the payment settings and try again.'
  if (code.startsWith('PAYMENT_PROVIDER_KEK')) return 'The payment encryption key is not configured on the server.'
  if (code === 'PAYMENT_PROVIDER_TABLE_MISSING') return 'The payment_provider table is not available (migration pending).'
  if (code.startsWith('VALIDATION_PAYMENT_PROVIDER_SECRET_KEY')) return 'The secret key does not match this environment (sk_/rk_ test vs live).'
  if (code.startsWith('VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY')) return 'The publishable key does not match this environment (pk_test_ vs pk_live_).'
  if (code === 'VALIDATION_PAYMENT_PROVIDER_WEBHOOK_SECRET') return 'The webhook secret must start with whsec_.'
  if (code === 'VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION') return 'Type DELETE KEY exactly to confirm deletion.'
  if (code === 'VALIDATION_PAYMENT_PROVIDER_ID') return 'Select a saved provider profile before deleting it.'
  return null
}
