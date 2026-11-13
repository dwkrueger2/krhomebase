// file: apps/api/src/features/payment-providers/rules.ts
/**
 * Stripe Payment Configuration rules (Settings plan, stage 6; super admin only). Ported from the old
 * `_server/krPaymentProviderStore.ts` and `payment-providers/route.ts`:
 *
 * - `listPaymentProviders` → display-safe configs (never secret values) and the encryption key state.
 * - `savePaymentProvider` → validates, verifies a new secret key against
 *   Stripe (livemode must match the environment), encrypts it, stores the
 *   ciphertext + SHA-256 hash + prefix.
 * - `deletePaymentProvider` → removes one profile after the exact `DELETE KEY` phrase.
 * - `testPaymentProviderConnection` → decrypts and calls Stripe `GET /v1/balance`, and records the outcome.
 * - `readStripeCredentials` → decrypted credentials for the sandbox tests (`sandboxTests.ts`).
 *
 * Validation order, limits, codes, problem sentences and the `configured` rule are the old ones. Every write is one
 * batch with its audit row (`queries.ts`); the person comes from the session.
 *
 * Changed from the old store and route:
 * - A missing or broken KEK answers 503 `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` / `PAYMENT_PROVIDER_KEK_INVALID` (old
 *   oddity 1: the old code returned a long `CONFIG_ENV_MISSING:…` sentence with 502). The KEK is loaded before Stripe
 *   is called, so a key is not checked with Stripe when it could not be stored anyway.
 * - Disabling the other profiles of an environment and saving this one is one batch (old oddity 3), and a new `ppid`
 *   is worked out inside the insert (old oddity 4).
 * - `last_verified_status` is `ok` after a save that stored a key; the old `mode_mismatch` branch could never run
 *   (old oddity 2).
 * - `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY` and `STRIPE_REQUEST_FAILED` are plain codes; Stripe's own code moves to
 *   `details.stripeCode` (the old reply glued it to the code after a colon). The connection-test status still records
 *   `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY: <stripe code>` for the card's "Last test" line, as before.
 * - No 60-second credentials cache: every call reads the row, so a save is used at once in every isolate (old oddity 8).
 * - The environment is in the address and checked by its contract (`VALIDATION_FAILED`), so the old
 *   `VALIDATION_PAYMENT_PROVIDER_ENVIRONMENT`, `_ACTION` and `_ID` codes are not used.
 */

import { PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN, PAYMENT_PROVIDER_DELETE_PHRASE, PAYMENT_PROVIDER_KEY_PATTERNS } from '@krhomebase/contracts'
import type {
  PaymentProviderConfig,
  PaymentProviderConnection,
  PaymentProviderDeleteBody,
  PaymentProviderEnvironment,
  PaymentProviderSaveBody,
  PaymentProvidersData,
} from '@krhomebase/contracts'
import { logLine } from '../../platform/log.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import { callStripeApi, type StripeFetch } from '../../platform/stripeApi.ts'
import { decryptPaymentProviderSecret, encryptPaymentProviderSecret, kekStatus, loadKek, paymentProviderAad, PaymentProviderCryptoError, sha256Hex } from './crypto.ts'
import { PaymentProvidersUnavailableError, type PaymentProviderQueries, type PaymentProviderRow } from './queries.ts'

/** Provider handled by this area. */
const PROVIDER = 'stripe'

/** HTTP statuses a payment-provider refusal can carry. */
export type PaymentProviderStatus = 404 | 409 | 422 | 502 | 503

/** A refused or failed payment-provider call; `code` and `message` are safe to return. */
export class PaymentProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: PaymentProviderStatus,
    readonly details?: Record<string, string>,
  ) {
    super(message)
    this.name = 'PaymentProviderError'
  }
}

/** Maps a code to its HTTP status (the old route's `statusFor`, unchanged). */
export function statusFor(code: string): PaymentProviderStatus {
  // The sandbox tests' own refusals were 422 in the old stripe-dev-tests route.
  if (code.startsWith('VALIDATION_') || code.startsWith('STRIPE_DEV_TESTS_')) return 422
  if (code === 'PAYMENT_PROVIDER_CHANGED_ELSEWHERE') return 409
  if (code === 'PAYMENT_PROVIDER_NOT_FOUND' || code === 'STRIPE_PAYMENT_NOT_FOUND') return 404
  if (code === 'PAYMENT_PROVIDER_MODE_MISMATCH' || code.startsWith('PAYMENT_PROVIDER_STRIPE_REJECTED_KEY')) return 422
  if (code.startsWith('PAYMENT_PROVIDER_KEK') || code === 'PAYMENT_PROVIDER_TABLE_MISSING' || code.includes('NOT_CONFIGURED') || code.includes('DISABLED')) return 503
  return 502
}

/** Plain sentences for the codes that do not carry their own message. */
const MESSAGES: Record<string, string> = {
  PAYMENT_PROVIDER_KEK_NOT_CONFIGURED: 'The payment encryption key is not configured on the server.',
  PAYMENT_PROVIDER_KEK_INVALID: 'The payment encryption key on the server is not a 32-byte base64 key.',
  PAYMENT_PROVIDER_KEK_MISMATCH: 'The stored secret was saved with a different encryption key. Paste it again and save.',
  PAYMENT_PROVIDER_SECRET_UNREADABLE: 'The stored secret cannot be decrypted. Paste it again and save.',
  PAYMENT_PROVIDER_TABLE_MISSING: 'The payment_provider table is not available.',
  STRIPE_NETWORK_ERROR: 'Stripe could not be reached.',
}

/** Builds a refusal for a code, with its status and a plain sentence. */
export function providerError(code: string, message?: string, details?: Record<string, string>): PaymentProviderError {
  return new PaymentProviderError(code, message ?? MESSAGES[code] ?? 'The payment configuration request failed.', statusFor(code), details)
}

/** Turns a crypto, database or network failure into a `PaymentProviderError`; anything else is returned as null. */
export function asProviderError(error: unknown): PaymentProviderError | null {
  if (error instanceof PaymentProviderError) return error
  if (error instanceof PaymentProviderCryptoError) return providerError(error.code)
  if (error instanceof PaymentProvidersUnavailableError) return providerError('PAYMENT_PROVIDER_TABLE_MISSING')
  if (error instanceof Error && error.message === 'STRIPE_NETWORK_ERROR') return providerError('STRIPE_NETWORK_ERROR')
  return null
}

/** The super admin making a call, from the session. */
export interface PaymentProviderActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** Decrypted credentials for one environment (Worker memory only). */
export interface StripeEnvironmentCredentials {
  environment: PaymentProviderEnvironment
  secretKey: string
  publishableKey: string
  accountId: string | null
  apiVersion: string | null
  defaultCurrency: string
}

/** Trims a text field and caps its length. */
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Maps a row to the display-safe config (the old `toConfig`, unchanged). */
export function toConfig(environment: PaymentProviderEnvironment, row: PaymentProviderRow | undefined, kek: { configured: boolean; kekId: string | null }): PaymentProviderConfig {
  const problems: string[] = []
  const storedKekId = row?.secret_key_ciphertext?.split(':')[1] ?? null
  if (row?.secret_key_ciphertext && kek.configured && storedKekId !== kek.kekId) problems.push('The secret key was saved with a different encryption key. Paste the secret key again and save.')
  if (!row?.publishable_key) problems.push('Publishable key is missing.')
  if (!row?.secret_key_ciphertext) problems.push('Secret key is not stored.')
  if (row && !row.is_enabled) problems.push('Configuration is disabled.')
  const readable = Boolean(row?.secret_key_ciphertext) && kek.configured && storedKekId === kek.kekId
  return {
    environment,
    id: row?.id ?? null,
    ppid: row?.ppid ?? null,
    configured: Boolean(row && row.is_enabled && row.publishable_key && readable),
    isEnabled: row ? Boolean(row.is_enabled) : true,
    displayName: row?.display_name ?? (environment === 'live' ? 'Stripe live' : 'Stripe sandbox'),
    accountId: row?.account_id ?? '',
    accountEmail: row?.account_email ?? '',
    publishableKey: row?.publishable_key ?? '',
    secretKeyName: row?.secret_key_name ?? '',
    secretKeyPrefix: row?.secret_key_prefix ?? null,
    secretKeyHash: row?.secret_key_hash ?? null,
    secretKeySetAt: row?.secret_key_set_at ?? null,
    webhookSecretName: row?.webhook_secret_name ?? '',
    webhookSecretHash: row?.webhook_secret_hash ?? null,
    webhookSecretSetAt: row?.webhook_secret_set_at ?? null,
    apiVersion: row?.api_version ?? '',
    defaultCurrency: row?.default_currency ?? 'usd',
    lastVerifiedAt: row?.last_verified_at ?? null,
    lastVerifiedStatus: row?.last_verified_status ?? null,
    notes: row?.notes ?? '',
    updatedAt: row?.updated_at ?? null,
    problems,
  }
}

/** Every stored provider profile, live before sandbox then by `ppid`, without secret values; and the KEK state. */
export async function listPaymentProviders(queries: PaymentProviderQueries, kekValue: unknown): Promise<PaymentProvidersData> {
  const [rows, kek] = await Promise.all([queries.rows(), kekStatus(kekValue)])
  return {
    providers: [...rows].sort((a, b) => a.environment.localeCompare(b.environment) || a.ppid - b.ppid).map((row) => toConfig(row.environment, row, kek)),
    encryption: kek,
  }
}

/**
 * Calls Stripe `GET /v1/balance` with a key and checks its mode.
 *
 * @throws `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY` (Stripe's code in `details.stripeCode`), `PAYMENT_PROVIDER_MODE_MISMATCH`
 * or `STRIPE_NETWORK_ERROR`.
 */
export async function checkKeyWithStripe(environment: PaymentProviderEnvironment, secretKey: string, apiVersion: string | null, requestId: string, fetcher?: StripeFetch): Promise<PaymentProviderConnection> {
  const response = await callStripeApi<{ livemode?: boolean; available?: Array<{ amount: number; currency: string }>; pending?: Array<{ amount: number; currency: string }> }>(
    { secretKey, apiVersion },
    'GET',
    '/v1/balance',
    undefined,
    undefined,
    fetcher,
  )
  if (!response.ok || !response.body) {
    const stripeCode = String(response.error?.code ?? response.error?.type ?? response.status)
    logLine('PAYMENT_PROVIDERS:stripe_rejected_key', requestId, { environment, status: response.status, stripeCode })
    throw providerError('PAYMENT_PROVIDER_STRIPE_REJECTED_KEY', 'Stripe rejected the secret key.', { stripeCode })
  }
  const livemode = response.body.livemode === true
  if (livemode !== (environment === 'live')) throw providerError('PAYMENT_PROVIDER_MODE_MISMATCH', 'That key belongs to the other Stripe mode (test vs live).')
  return {
    environment,
    livemode,
    available: (response.body.available ?? []).map((row) => ({ amount: row.amount, currency: row.currency })),
    pending: (response.body.pending ?? []).map((row) => ({ amount: row.amount, currency: row.currency })),
  }
}

function audit(actor: PaymentProviderActor, action: string, targetId: string, newJson: unknown): AuditEntry {
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'payment-providers', action, targetTable: 'payment_provider', targetId, newJson }
}

/**
 * Saves one profile (`providerId` null or blank creates one). A new secret key (or webhook secret) is validated,
 * checked with Stripe (secret key only), encrypted and hashed; the plaintext is discarded when this returns.
 *
 * @throws `VALIDATION_PAYMENT_PROVIDER_*` (422), `PAYMENT_PROVIDER_NOT_FOUND` (404), `PAYMENT_PROVIDER_CHANGED_ELSEWHERE`
 * (409), `PAYMENT_PROVIDER_STRIPE_REJECTED_KEY` / `PAYMENT_PROVIDER_MODE_MISMATCH` (422), `PAYMENT_PROVIDER_KEK_*` (503),
 * `PAYMENT_PROVIDER_SAVE_READBACK_FAILED` (502).
 */
export async function savePaymentProvider(
  queries: PaymentProviderQueries,
  actor: PaymentProviderActor,
  kekValue: unknown,
  environment: PaymentProviderEnvironment,
  body: PaymentProviderSaveBody,
  now: string,
  fetcher?: StripeFetch,
  newId: () => string = () => crypto.randomUUID(),
): Promise<PaymentProviderConfig> {
  const fields = body.fields
  const patterns = PAYMENT_PROVIDER_KEY_PATTERNS[environment]
  const label = environment.toUpperCase()
  const publishableKey = clean(fields.publishableKey, 255)
  const accountId = clean(fields.accountId, 64)
  const accountEmail = clean(fields.accountEmail, 200)
  const apiVersion = clean(fields.apiVersion, 40)
  const defaultCurrency = (clean(fields.defaultCurrency, 3) || 'usd').toLowerCase()
  if (publishableKey && !patterns.publishable.test(publishableKey)) throw providerError(`VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY_${label}`, 'The publishable key does not match this environment.')
  if (accountId && !PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN.test(accountId)) throw providerError('VALIDATION_PAYMENT_PROVIDER_ACCOUNT_ID', 'The account id must look like acct_….')
  if (accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) throw providerError('VALIDATION_PAYMENT_PROVIDER_ACCOUNT_EMAIL', 'The login email is not an email address.')
  if (apiVersion && !/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(apiVersion)) throw providerError('VALIDATION_PAYMENT_PROVIDER_API_VERSION', 'The API version must be a date such as 2024-06-20.')
  if (!/^[a-z]{3}$/.test(defaultCurrency)) throw providerError('VALIDATION_PAYMENT_PROVIDER_CURRENCY', 'The currency must be three letters.')

  const secretKey = body.secretKey?.trim() ?? ''
  const webhookSecret = body.webhookSecret?.trim() ?? ''
  if (secretKey && !patterns.secret.test(secretKey)) throw providerError(`VALIDATION_PAYMENT_PROVIDER_SECRET_KEY_${label}`, 'The secret key does not match this environment.')
  if (webhookSecret && !patterns.webhook.test(webhookSecret)) throw providerError('VALIDATION_PAYMENT_PROVIDER_WEBHOOK_SECRET', 'The webhook secret must start with whsec_.')

  const providerId = body.providerId?.trim() || null
  const rows = await queries.rows()
  const current = providerId ? rows.find((row) => row.id === providerId && row.environment === environment) : undefined
  if (providerId && !current) throw providerError('PAYMENT_PROVIDER_NOT_FOUND', 'That provider profile no longer exists.')
  if (current && body.expectedUpdatedAt !== undefined && (body.expectedUpdatedAt ?? null) !== (current.updated_at ?? null)) {
    throw providerError('PAYMENT_PROVIDER_CHANGED_ELSEWHERE', 'This configuration was changed elsewhere.')
  }

  const kek = secretKey || webhookSecret ? await loadKek(kekValue) : null
  let secret: { ciphertext: string; hash: string; prefix: string | null } | null = null
  if (secretKey && kek) {
    await checkKeyWithStripe(environment, secretKey, apiVersion || null, actor.requestId, fetcher)
    secret = {
      ciphertext: await encryptPaymentProviderSecret(kek, secretKey, paymentProviderAad(PROVIDER, environment, 'secret_key')),
      hash: await sha256Hex(secretKey),
      prefix: secretKey.match(/^(sk|rk)_(test|live)_/)?.[0] ?? null,
    }
  }
  const webhook = webhookSecret && kek
    ? { ciphertext: await encryptPaymentProviderSecret(kek, webhookSecret, paymentProviderAad(PROVIDER, environment, 'webhook_secret')), hash: await sha256Hex(webhookSecret) }
    : null

  const id = current?.id ?? `ppv_${newId()}`
  await queries.save(
    {
      id,
      isNew: !current,
      environment,
      now,
      actorUserId: actor.userId,
      displayName: clean(fields.displayName, 80) || null,
      isEnabled: fields.isEnabled,
      accountId: accountId || null,
      accountEmail: accountEmail || null,
      publishableKey: publishableKey || null,
      secretKeyName: clean(fields.secretKeyName, 80) || null,
      webhookSecretName: clean(fields.webhookSecretName, 80) || null,
      apiVersion: apiVersion || null,
      defaultCurrency,
      notes: clean(fields.notes, 500) || null,
      secretKey: secret,
      webhookSecret: webhook,
    },
    audit(actor, current ? 'UPDATE' : 'CREATE', id, { environment, isEnabled: fields.isEnabled, secretKeyChanged: Boolean(secret), webhookSecretChanged: Boolean(webhook) }),
  )
  logLine('PAYMENT_PROVIDERS:saved', actor.requestId, { environment, providerId: id, created: !current, secretKeyChanged: Boolean(secret), webhookSecretChanged: Boolean(webhook) })

  const refreshed = await listPaymentProviders(queries, kekValue)
  const saved = refreshed.providers.find((provider) => provider.id === id)
  if (!saved) throw providerError('PAYMENT_PROVIDER_SAVE_READBACK_FAILED', 'The profile was saved but could not be read back. Refresh the page.')
  return saved
}

/**
 * Deletes one profile after the exact confirmation phrase.
 *
 * @throws `VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION` (422), `PAYMENT_PROVIDER_NOT_FOUND` (404),
 * `PAYMENT_PROVIDER_CHANGED_ELSEWHERE` (409).
 */
export async function deletePaymentProvider(queries: PaymentProviderQueries, actor: PaymentProviderActor, environment: PaymentProviderEnvironment, providerId: string, body: PaymentProviderDeleteBody): Promise<void> {
  if (body.confirmation !== PAYMENT_PROVIDER_DELETE_PHRASE) throw providerError('VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION', 'Type DELETE KEY exactly to confirm deletion.')
  const rows = await queries.rows()
  const current = rows.find((row) => row.id === providerId && row.environment === environment)
  if (!current) throw providerError('PAYMENT_PROVIDER_NOT_FOUND', 'That provider profile no longer exists.')
  if (body.expectedUpdatedAt !== undefined && (body.expectedUpdatedAt ?? null) !== (current.updated_at ?? null)) {
    throw providerError('PAYMENT_PROVIDER_CHANGED_ELSEWHERE', 'This configuration was changed elsewhere.')
  }
  await queries.remove(current.id, audit(actor, 'DELETE', current.id, { environment, ppid: current.ppid }))
  logLine('PAYMENT_PROVIDERS:deleted', actor.requestId, { environment, ppid: current.ppid })
}

/** Picks the environment's enabled row (else its first) and decrypts its secret key; the old `readSecret`. */
async function readSecret(queries: PaymentProviderQueries, kekValue: unknown, environment: PaymentProviderEnvironment): Promise<{ row: PaymentProviderRow; secretKey: string }> {
  const label = environment.toUpperCase()
  const environmentRows = (await queries.rows()).filter((candidate) => candidate.environment === environment)
  const row = environmentRows.find((candidate) => candidate.is_enabled) ?? environmentRows[0]
  if (!row || !row.secret_key_ciphertext || !row.publishable_key) throw providerError(`STRIPE_${label}_NOT_CONFIGURED`, `The ${environment} configuration has no keys yet.`)
  if (!row.is_enabled) throw providerError(`STRIPE_${label}_DISABLED`, `The ${environment} configuration is disabled.`)
  const kek = await loadKek(kekValue)
  const secretKey = await decryptPaymentProviderSecret(kek, row.secret_key_ciphertext, paymentProviderAad(PROVIDER, environment, 'secret_key'))
  // Sandbox must use test keys and live must use live keys (Save enforces this; checked again on every read).
  const patterns = PAYMENT_PROVIDER_KEY_PATTERNS[environment]
  if (!patterns.secret.test(secretKey) || !patterns.publishable.test(row.publishable_key)) throw providerError(`STRIPE_${label}_KEY_MODE_MISMATCH`, 'The stored keys do not match this environment.')
  return { row, secretKey }
}

/**
 * Decrypted credentials for one environment, read fresh on every call.
 *
 * @throws `STRIPE_<ENV>_NOT_CONFIGURED`, `STRIPE_<ENV>_DISABLED`, `STRIPE_<ENV>_KEY_MODE_MISMATCH`, `PAYMENT_PROVIDER_KEK_*`,
 * `PAYMENT_PROVIDER_SECRET_UNREADABLE`, `PAYMENT_PROVIDER_TABLE_MISSING`.
 */
export async function readStripeCredentials(queries: PaymentProviderQueries, kekValue: unknown, environment: PaymentProviderEnvironment): Promise<StripeEnvironmentCredentials> {
  const { row, secretKey } = await readSecret(queries, kekValue, environment)
  return { environment, secretKey, publishableKey: row.publishable_key ?? '', accountId: row.account_id, apiVersion: row.api_version, defaultCurrency: row.default_currency || 'usd' }
}

/**
 * Tests a stored configuration against Stripe and records the outcome (success `ok`, failure its code, up to 120
 * characters; a failure to record a failure is ignored, as before).
 */
export async function testPaymentProviderConnection(
  queries: PaymentProviderQueries,
  actor: PaymentProviderActor,
  kekValue: unknown,
  environment: PaymentProviderEnvironment,
  now: string,
  fetcher?: StripeFetch,
): Promise<PaymentProviderConnection> {
  const { row, secretKey } = await readSecret(queries, kekValue, environment)
  try {
    const result = await checkKeyWithStripe(environment, secretKey, row.api_version, actor.requestId, fetcher)
    await queries.recordVerification(row.id, 'ok', now, audit(actor, 'TEST_CONNECTION', row.id, { environment, status: 'ok' }))
    return result
  } catch (error) {
    const failed = asProviderError(error)
    const stripeCode = failed?.details?.stripeCode
    const status = (failed ? (stripeCode ? `${failed.code}: ${stripeCode}` : failed.code) : 'unknown').slice(0, 120)
    await queries.recordVerification(row.id, status, now, audit(actor, 'TEST_CONNECTION', row.id, { environment, status })).catch(() => undefined)
    throw error
  }
}
