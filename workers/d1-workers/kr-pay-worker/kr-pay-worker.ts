//file: apps/shared/d1-workers/kr-pay-worker/kr-pay-worker.ts
/**
 * KR Pay Worker — public pay-link pages for KR Homebase invoices
 * (pay.krhomebase.com/p/<token>).
 *
 * Every invoice email (and receipt with a balance left) carries a link, and a
 * printed invoice carries its own (`link_source` 'email' | 'print'; both stay
 * payable and pay toward the same account). A link
 * pays toward the client's whole account: the page lists the open invoices
 * (number, IVID, due date, balance — no matter titles or services), the client
 * enters an amount ($0.50 up to the balance), and the payment is applied to the
 * oldest invoice first when KR Homebase posts it. The client's name is shortened
 * ("D. Krueger") so a forwarded link reveals as little as possible. The card fields are Stripe
 * Elements (iframes served by Stripe), so the card number goes from the
 * client's browser straight to Stripe; this Worker never sees it and nothing is
 * kept on file. On submit the Worker creates the PaymentIntent (amount from D1),
 * Stripe.js confirms it (3-D Secure when the bank asks), the Worker re-reads it
 * from Stripe, marks the request `paid`, and the page shows "Payment approved"
 * with the Stripe payment ID (pi_…).
 *
 * Routes
 *   GET  /p/<token>            Open invoices + amount + card form (or the paid / expired / not-active message).
 *   POST /p/<token>/intent     { name, email, amount } → { clientSecret, paymentIntentId, amount } (creates or reuses the PaymentIntent).
 *   POST /p/<token>/confirm    { paymentIntentId } → re-reads the PaymentIntent from Stripe; { status: 'paid', paymentId, … }.
 *   GET  /assets/pay.js        Page script (no inline script; CSP script-src 'self' + js.stripe.com).
 *   POST /stripe/webhook/sandbox payment_intent.succeeded backup for Stripe Sandbox. Signature-verified.
 *   POST /stripe/webhook/live    payment_intent.succeeded backup for Stripe Live. Signature-verified.
 *   GET  /health                 { ok, environment: 'dual', stripe: { sandbox, live } } — never a key.
 *
 * Security model
 *   1. The token is 32 random bytes (base64url); D1 stores only its SHA-256.
 *      The token never goes to Stripe (PaymentIntent metadata carries prid / ids).
 *   2. The amount the client types is checked against D1 at intent time: at
 *      least $0.50 and at most the account balance (open invoices' balance_due
 *      minus the client's other paid-but-not-posted requests).
 *   3. Card data: Stripe Elements only. The Worker handles client secrets and
 *      PaymentIntent ids, never card numbers.
 *   4. The Worker never writes the ledger: fixed prepared statements on
 *      payment_request (views, intent, paid) plus reads of invoice / lines / client /
 *      matter. KR Homebase posts paid requests after re-verifying with Stripe.
 *   5. Single use: status moves forward only (WHERE clauses); UNIQUE
 *      stripe_payment_intent_id; one non-voided payment per PaymentIntent in D1.
 *   6. Webhooks: HMAC-SHA256 over `${t}.${rawBody}`, constant-time compare,
 *      5-minute tolerance, livemode must match.
 *   8. After a link is marked paid (/confirm, /intent finishing a succeeded
 *      PaymentIntent, or the Stripe webhook), the Worker tells KR Homebase
 *      (POST KR_HOMEBASE_PAY_WEBHOOK_URL, in waitUntil) so the payment posts and
 *      the receipt is emailed at once. Signed like a Stripe webhook
 *      (`X-KR-Pay-Signature: t=…,v1=…`) with a key derived from the KEK
 *      (HMAC(KEK, PAY_LINK_WEBHOOK_KEY_LABEL)); the body carries only ids. Not
 *      configured or failed → logged; KR Homebase posts it on the next Billing load.
 *   7. Stripe keys come from D1 `payment_provider` (Settings → Stripe Payment
 *      Configuration), the row for the payment request's environment. Secret key and webhook secret are AES-256-GCM
 *      ciphertext; the Worker decrypts them with the KEK (Worker secret
 *      KR_PAYMENT_PROVIDER_KEK, same value as KR Homebase uses for that
 *      database). Key prefixes must match the environment (sandbox: sk_/rk_test_,
 *      pk_test_; live: sk_/rk_live_, pk_live_) or the Worker refuses to charge.
 *      Changing keys in Settings takes effect on the next request; no deploy.
 *
 * Log tags: [KR_PAY:*]  (`wrangler tail`)
 */

interface PayWorkerEnv {
  KR_PAY_D1: D1Database
  /** Base64 key-encryption key for payment_provider secrets (same value KR Homebase uses for this database). Worker secret. */
  KR_PAYMENT_PROVIDER_KEK: string
  /** Deployment label retained for Wrangler compatibility; request and webhook routes select the actual environment. */
  KR_PAY_ENVIRONMENT: string
  /**
   * Optional Worker secret: KR Homebase pay-link webhook URL
   * (https://<homebase>/krhomebase/api/kr-api-v1/billing/pay-link-paid). Unset → no notice;
   * paid links post when staff open Billing.
   */
  KR_HOMEBASE_PAY_WEBHOOK_URL?: string
}

/** Stripe settings for one payment environment, decrypted from payment_provider. Server memory only. */
interface StripeConfig {
  environment: 'sandbox' | 'live'
  secretKey: string
  publishableKey: string
  webhookSecret: string | null
  apiVersion: string | null
}

interface PaymentProviderRow {
  is_enabled: number
  publishable_key: string | null
  secret_key_ciphertext: string | null
  webhook_secret_ciphertext: string | null
  api_version: string | null
  updated_at: string | null
}

type PayEnvironment = 'sandbox' | 'live'

/** payment_request joined with the invoice, client, and matter fields the page needs. */
interface PayRequestRow {
  id: string
  prid: string
  invoice_id: string
  invoice_ivid: string
  invoice_number: string
  client_id: string
  client_number: string
  environment: string
  status: string
  expires_at: string
  intent_attempts: number
  stripe_payment_intent_id: string | null
  payer_email: string | null
  paid_amount: number | null
  paid_at: string | null
  /** 'email' | 'print' (migration 20260929). */
  link_source: string
  invoice_status: string
  invoice_date: string
  invoice_due_date: string | null
  invoice_subtotal: number
  invoice_discount: number
  invoice_tax: number
  invoice_total: number
  invoice_amount_paid: number
  invoice_balance_due: number
  matter_id: string
  matter_number: string | null
  matter_title: string | null
  client_display_name: string
}

/** An open invoice on the client's account (the pay page shows no services or matter titles). */
interface OpenInvoiceRow {
  id: string
  invoice_number: string
  ivid: string | null
  invoice_date: string
  due_date: string | null
  balance_due: number
}

/** One invoice's share of an amount (oldest invoice date first). */
interface AllocationLine {
  invoice: OpenInvoiceRow
  cents: number
}

/** The account as the pay page sees it. */
interface AccountState {
  invoices: OpenInvoiceRow[]
  /** Other paid-but-not-posted requests for this client (dollars). */
  pending: number
  /** Account balance less pending (dollars). */
  due: number
}

interface StripeResult<T> {
  ok: boolean
  status: number
  body: T | null
  errorCode: string | null
}

interface PaymentIntent {
  id: string
  status?: string
  amount?: number
  amount_received?: number
  client_secret?: string
  livemode?: boolean
  metadata?: Record<string, string> | null
  latest_charge?: string | { payment_method_details?: { card?: { brand?: string; last4?: string } } } | null
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const PRID_PATTERN = /^[A-Z0-9]{7}$/
const INTENT_PATTERN = /^pi_[A-Za-z0-9]{8,64}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STRIPE_API = 'https://api.stripe.com'
const KR_STRIPE_BILLING_SOURCE = 'krhomebase-billing'
const WEBHOOK_TOLERANCE_SECONDS = 300

/** Label mixed with the KEK for the KR Homebase webhook signing key. Must match krPaymentProviderCrypto.ts. */
const PAY_LINK_WEBHOOK_KEY_LABEL = 'kr-pay-link-webhook:v1'

/** How long the Worker waits for KR Homebase to post and send the receipt (waitUntil allows 30 s). */
const HOMEBASE_NOTICE_TIMEOUT_MS = 25_000
const MIN_CHARGE_CENTS = 50
/** PaymentIntent states that can still be confirmed (reused instead of creating another). */
const REUSABLE_INTENT_STATES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action'])
/** Key prefixes allowed per environment (same rule as Settings → Stripe Payment Configuration). */
const KEY_PATTERNS: Record<'sandbox' | 'live', { secret: RegExp; publishable: RegExp }> = {
  sandbox: { secret: /^(sk|rk)_test_[A-Za-z0-9]{10,}$/, publishable: /^pk_test_[A-Za-z0-9]{10,}$/ },
  live: { secret: /^(sk|rk)_live_[A-Za-z0-9]{10,}$/, publishable: /^pk_live_[A-Za-z0-9]{10,}$/ },
}

const FIRM = {
  name: 'Krueger & Richard',
  legalName: 'Krueger & Richard, PLLC',
  offices: [
    { city: 'McKinney, TX', phone: '972.688.6760' },
    { city: 'Pratt, KS', phone: '620.979.9077' },
  ],
} as const

// ───────────────────────────── helpers ─────────────────────────────

function log(tag: string, message: string): void {
  console.log(`[KR_PAY:${tag}] ${message}`)
}

function nowIso(): string {
  return new Date().toISOString()
}

function environmentOf(env: PayWorkerEnv): PayEnvironment {
  const rVal: PayEnvironment = env.KR_PAY_ENVIRONMENT === 'live' ? 'live' : 'sandbox'
  return rVal
}

/** Converts a stored payment-request environment to the only two supported Stripe modes. */
function environmentOfRequest(request: PayRequestRow): PayEnvironment | null {
  if (request.environment === 'sandbox' || request.environment === 'live') return request.environment
  return null
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const rVal = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return rVal
}

function escapeHtml(value: string): string {
  const rVal = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return rVal
}

function money(amount: number): string {
  const rVal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  return rVal
}

/** "2026-09-30" or an ISO timestamp → "September 30, 2026" (no timezone shift). */
function longDate(value: string | null): string {
  const match = (value ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return value ?? ''
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const rVal = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return rVal
}

function toCents(amount: number): number {
  const rVal = Math.round(amount * 100)
  return rVal
}

/** Headers for every page: no caching, no framing, no referrer (the URL carries the token), Stripe.js allowed. */
function pageHeaders(status = 200): ResponseInit {
  const rVal: ResponseInit = {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': [
        "default-src 'none'",
        "script-src 'self' https://js.stripe.com https://*.js.stripe.com",
        "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
        "connect-src 'self' https://api.stripe.com https://*.stripe.com https://m.stripe.network",
        "style-src 'unsafe-inline'",
        "img-src data: https://*.stripe.com",
        "form-action 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
      ].join('; '),
    },
  }
  return rVal
}

function jsonResponse(body: unknown, status = 200): Response {
  const rVal = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  return rVal
}

// ───────────────────────────── D1 (fixed statements only) ─────────────────────────────

const SELECT_REQUEST = `
  SELECT r.id, r.prid, r.invoice_id, r.invoice_ivid, r.invoice_number, r.client_id, r.client_number,
         r.environment, r.status, r.expires_at, r.intent_attempts, r.stripe_payment_intent_id,
         r.payer_email, r.paid_amount, r.paid_at, r.link_source,
         i.status AS invoice_status, i.invoice_date, i.due_date AS invoice_due_date,
         i.subtotal_amount AS invoice_subtotal, i.discount_amount AS invoice_discount, i.tax_amount AS invoice_tax,
         i.total_amount AS invoice_total, i.amount_paid AS invoice_amount_paid, i.balance_due AS invoice_balance_due,
         i.matter_id, m.matter_number, m.title AS matter_title,
         c.display_name AS client_display_name
    FROM payment_request r
    JOIN invoice i ON i.id = r.invoice_id
    JOIN client c ON c.id = r.client_id
    LEFT JOIN matter m ON m.id = i.matter_id`

async function findByTokenHash(env: PayWorkerEnv, tokenHash: string): Promise<PayRequestRow | null> {
  const rVal = await env.KR_PAY_D1.prepare(`${SELECT_REQUEST} WHERE r.token_hash = ?1`).bind(tokenHash).first<PayRequestRow>()
  return rVal ?? null
}

async function findByPrid(env: PayWorkerEnv, prid: string): Promise<PayRequestRow | null> {
  const rVal = await env.KR_PAY_D1.prepare(`${SELECT_REQUEST} WHERE r.prid = ?1`).bind(prid).first<PayRequestRow>()
  return rVal ?? null
}

/** The client's open invoices, oldest invoice date first (the order payments are applied in). */
async function openInvoices(env: PayWorkerEnv, clientId: string): Promise<OpenInvoiceRow[]> {
  const result = await env.KR_PAY_D1.prepare(
    `SELECT id, invoice_number, ivid, invoice_date, due_date, balance_due
       FROM invoice
      WHERE billed_to_client_id = ?1 AND status IN ('sent', 'partially_paid', 'overdue') AND balance_due > 0.004
      ORDER BY invoice_date, CAST(invoice_number AS INTEGER), invoice_number`,
  ).bind(clientId).all<OpenInvoiceRow>()
  const rVal = result.results ?? []
  return rVal
}

/**
 * Spreads `cents` over the invoices oldest first, after skipping `skipCents`
 * (money already paid online but not yet posted, which is applied first).
 */
function allocateOldestFirst(invoices: readonly OpenInvoiceRow[], skipCents: number, cents: number): AllocationLine[] {
  let skip = Math.max(0, skipCents)
  let left = Math.max(0, cents)
  const rVal: AllocationLine[] = []
  for (const invoice of invoices) {
    let balance = toCents(Number(invoice.balance_due))
    const skipped = Math.min(skip, balance)
    skip -= skipped
    balance -= skipped
    const share = Math.min(left, balance)
    if (share > 0) {
      rVal.push({ invoice, cents: share })
      left -= share
    }
    if (left <= 0) break
  }
  return rVal
}

/** "Invoice #3 $120.00 · Invoice #4 $280.00" */
function allocationText(lines: readonly AllocationLine[]): string {
  const rVal = lines.map((line) => `Invoice #${line.invoice.invoice_number} ${money(line.cents / 100)}`).join(' · ')
  return rVal
}

/** The client's other requests that are paid but not yet posted (invoice balances do not show them yet). */
async function pendingPaidAmount(env: PayWorkerEnv, request: PayRequestRow): Promise<number> {
  const row = await env.KR_PAY_D1.prepare(`SELECT COALESCE(SUM(paid_amount), 0) AS pending FROM payment_request WHERE client_id = ?1 AND status = 'paid' AND id <> ?2`).bind(request.client_id, request.id).first<{ pending: number }>()
  const rVal = Number(row?.pending ?? 0)
  return rVal
}

async function recordView(env: PayWorkerEnv, request: PayRequestRow): Promise<void> {
  const now = nowIso()
  await env.KR_PAY_D1.prepare(`UPDATE payment_request SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, ?2), last_viewed_at = ?2 WHERE id = ?1`).bind(request.id, now).run()
}

/** open → expired once expires_at has passed. */
async function expireIfDue(env: PayWorkerEnv, request: PayRequestRow): Promise<boolean> {
  if (request.status !== 'open' || request.expires_at > nowIso()) return false
  await env.KR_PAY_D1.prepare(`UPDATE payment_request SET status = 'expired', updated_at = ?2 WHERE id = ?1 AND status = 'open'`).bind(request.id, nowIso()).run()
  log('expire', `prid=${request.prid} invoice=${request.invoice_number}`)
  return true
}

/** This request's own payment while it is paid but not yet posted (after posting, the invoice balance already includes it). */
function unpostedOwnPayment(request: PayRequestRow): number {
  const rVal = request.paid_at && request.status === 'paid' ? Number(request.paid_amount ?? 0) : 0
  return rVal
}

/** Balance still owed after this request's own payment. */
async function remainingAfterPayment(env: PayWorkerEnv, request: PayRequestRow): Promise<number> {
  const rVal = Math.max(0, Math.round(((await amountDueFor(env, request)) - unpostedOwnPayment(request)) * 100) / 100)
  return rVal
}

/**
 * Parses the amount the client typed ("345.33", "$1,200", 25) into cents.
 *
 * @returns Cents, or null when it is not a plain money amount.
 */
function parseAmountCents(value: unknown): number | null {
  const text = typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value.replace(/[$,\s]/g, '') : ''
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null
  const rVal = Math.round(Number(text) * 100)
  return rVal
}

/** Open invoices, pending online payments, and the amount still payable on the account. */
async function accountFor(env: PayWorkerEnv, request: PayRequestRow): Promise<AccountState> {
  const [invoices, pending] = await Promise.all([openInvoices(env, request.client_id), pendingPaidAmount(env, request)])
  const balance = invoices.reduce((sum, invoice) => sum + toCents(Number(invoice.balance_due)), 0) / 100
  const rVal: AccountState = { invoices, pending, due: Math.max(0, Math.round((balance - pending) * 100) / 100) }
  return rVal
}

async function amountDueFor(env: PayWorkerEnv, request: PayRequestRow): Promise<number> {
  const rVal = (await accountFor(env, request)).due
  return rVal
}

/** Where this request's own unposted payment goes (empty once posted: the balances already include it). */
async function ownAllocation(env: PayWorkerEnv, request: PayRequestRow): Promise<AllocationLine[]> {
  const own = unpostedOwnPayment(request)
  if (!own) return []
  const account = await accountFor(env, request)
  const rVal = allocateOldestFirst(account.invoices, toCents(account.pending), toCents(own))
  return rVal
}

/**
 * Short form of the client's name for the page ("Dan Krueger" / "Krueger, Dan"
 * → "D. Krueger"); organizations keep their first word ("Acme …").
 */
function shortName(displayName: string): string {
  const name = displayName.replace(/\s*\(\d+\)\s*$/, '').trim()
  if (!name) return ''
  if (/\b(llc|pllc|inc|corp|corporation|company|co\.?|lp|llp|trust|estate|foundation|partnership)\b/i.test(name)) return `${name.split(/\s+/)[0]} …`
  const [last, first] = name.includes(',') ? name.split(',').map((part) => part.trim()) : [name.split(/\s+/).slice(-1)[0] ?? '', name.split(/\s+/)[0] ?? '']
  const rVal = first && last && first !== last ? `${first.charAt(0).toUpperCase()}. ${last}` : name
  return rVal
}

// ───────────────────────────── Stripe keys (payment_provider + KEK) ─────────────────────────────

let kekCache: { text: string; key: CryptoKey; kekId: string } | null = null
let configCache: { environment: PayEnvironment; stamp: string; config: StripeConfig } | null = null

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) view[index] = binary.charCodeAt(index)
  return buffer
}

/** Imports the KEK (32 bytes, base64). kekId = first 8 hex of SHA-256(text), as in krPaymentProviderCrypto.ts. */
async function loadKek(env: PayWorkerEnv): Promise<{ key: CryptoKey; kekId: string }> {
  const text = (env.KR_PAYMENT_PROVIDER_KEK ?? '').replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('PAYMENT_PROVIDER_KEK_NOT_CONFIGURED')
  if (kekCache?.text === text) return kekCache
  let raw: ArrayBuffer
  try {
    raw = fromBase64(text)
  } catch {
    throw new Error('PAYMENT_PROVIDER_KEK_INVALID')
  }
  if (raw.byteLength !== 32) throw new Error('PAYMENT_PROVIDER_KEK_INVALID')
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
  kekCache = { text, key, kekId: (await sha256Hex(text)).slice(0, 8) }
  return kekCache
}

/** Decrypts `v1:<kekId>:<iv>:<ciphertext>` with the row/column AAD (payment_provider:stripe:<env>:<field>). */
async function decryptSecret(env: PayWorkerEnv, stored: string, aad: string): Promise<string> {
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('PAYMENT_PROVIDER_SECRET_UNREADABLE')
  const kek = await loadKek(env)
  if (parts[1] !== kek.kekId) throw new Error('PAYMENT_PROVIDER_KEK_MISMATCH')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parts[2]!), additionalData: new TextEncoder().encode(aad) }, kek.key, fromBase64(parts[3]!))
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('PAYMENT_PROVIDER_SECRET_UNREADABLE')
  }
}

/**
 * Stripe settings for one payment environment from payment_provider. Re-read
 * every request (one small query) so a key saved in Settings applies at once;
 * decryption is cached until the row changes.
 *
 * @throws STRIPE_<ENV>_NOT_CONFIGURED / _DISABLED / _KEY_MODE_MISMATCH, PAYMENT_PROVIDER_KEK_*, PAYMENT_PROVIDER_SECRET_UNREADABLE.
 */
async function loadStripeConfig(env: PayWorkerEnv, requestedEnvironment = environmentOf(env)): Promise<StripeConfig> {
  const environment = requestedEnvironment
  const label = environment.toUpperCase()
  const row = await env.KR_PAY_D1.prepare(
    `SELECT is_enabled, publishable_key, secret_key_ciphertext, webhook_secret_ciphertext, api_version, updated_at
       FROM payment_provider WHERE provider = 'stripe' AND environment = ?1 AND is_enabled = 1
       ORDER BY ppid ASC LIMIT 1`,
  ).bind(environment).first<PaymentProviderRow>()
  if (!row || !row.secret_key_ciphertext || !row.publishable_key) throw new Error(`STRIPE_${label}_NOT_CONFIGURED`)
  if (!row.is_enabled) throw new Error(`STRIPE_${label}_DISABLED`)
  const stamp = [row.updated_at, row.secret_key_ciphertext, row.webhook_secret_ciphertext, row.publishable_key, row.api_version].join('|')
  if (configCache?.environment === environment && configCache.stamp === stamp) return configCache.config
  const secretKey = await decryptSecret(env, row.secret_key_ciphertext, `payment_provider:stripe:${environment}:secret_key`)
  const webhookSecret = row.webhook_secret_ciphertext ? await decryptSecret(env, row.webhook_secret_ciphertext, `payment_provider:stripe:${environment}:webhook_secret`) : null
  if (!KEY_PATTERNS[environment].secret.test(secretKey) || !KEY_PATTERNS[environment].publishable.test(row.publishable_key)) throw new Error(`STRIPE_${label}_KEY_MODE_MISMATCH`)
  const config: StripeConfig = { environment, secretKey, publishableKey: row.publishable_key, webhookSecret, apiVersion: row.api_version }
  configCache = { environment, stamp, config }
  return config
}

/** Loads the Stripe config or logs why it is unavailable (null). */
async function stripeConfigOrNull(env: PayWorkerEnv, requestedEnvironment = environmentOf(env)): Promise<StripeConfig | null> {
  try {
    return await loadStripeConfig(env, requestedEnvironment)
  } catch (caught) {
    log('stripe-config', `unavailable: ${caught instanceof Error ? caught.message : String(caught)}`)
    return null
  }
}

const PAYMENTS_UNAVAILABLE = 'Online card payment is temporarily unavailable. Please try again later or call our office to pay by phone.'

// ───────────────────────────── Stripe API ─────────────────────────────

async function stripe<T>(config: StripeConfig, method: 'GET' | 'POST', path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<StripeResult<T>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${config.secretKey}` }
  if (config.apiVersion) headers['Stripe-Version'] = config.apiVersion
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const response = await fetch(`${STRIPE_API}${path}`, { method, headers, body: form ? form.toString() : undefined })
  const json = (await response.json().catch(() => null)) as (T & { error?: { code?: string; type?: string } }) | null
  const rVal: StripeResult<T> = {
    ok: response.ok,
    status: response.status,
    body: response.ok ? json : null,
    errorCode: response.ok ? null : json?.error?.code ?? json?.error?.type ?? `http_${response.status}`,
  }
  if (!response.ok) log('stripe', `${method} ${path.split('?')[0]} failed status=${response.status} code=${rVal.errorCode}`)
  return rVal
}

async function retrieveIntent(config: StripeConfig, paymentIntentId: string): Promise<PaymentIntent | null> {
  const result = await stripe<PaymentIntent>(config, 'GET', `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`)
  return result.body
}

/** Card brand and last 4 from an expanded PaymentIntent (for the approval message). */
function cardOf(intent: PaymentIntent): string | null {
  const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  const card = charge?.payment_method_details?.card
  const rVal = card?.brand ? `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} •••• ${card.last4 ?? ''}`.trim() : null
  return rVal
}

/**
 * Marks a request paid from a succeeded PaymentIntent. Every fact is checked
 * against the request first; one conditional UPDATE; a repeat is a no-op.
 *
 * The call that moves the row to paid also notifies KR Homebase (waitUntil).
 *
 * @returns 'paid' (this call or earlier), 'mismatch' (logged, nothing written), or 'not_paid'.
 */
async function markPaid(env: PayWorkerEnv, ctx: ExecutionContext, request: PayRequestRow, intent: PaymentIntent, eventId: string | null): Promise<'paid' | 'mismatch' | 'not_paid'> {
  if (intent.status !== 'succeeded') return 'not_paid'
  const environment = environmentOfRequest(request)
  const problems: string[] = []
  if (intent.id !== request.stripe_payment_intent_id) problems.push('intent')
  if (intent.metadata?.kr_payment_request_id !== request.id || intent.metadata?.kr_prid !== request.prid) problems.push('request')
  if (intent.metadata?.kr_invoice_id !== request.invoice_id || intent.metadata?.kr_source !== KR_STRIPE_BILLING_SOURCE) problems.push('invoice')
  if (!environment || Boolean(intent.livemode) !== (environment === 'live')) problems.push('environment')
  if (problems.length) {
    log('paid-mismatch', `prid=${request.prid} pi=${intent.id} problems=${problems.join(',')}`)
    return 'mismatch'
  }
  if (request.paid_at) return 'paid'
  const paidAmount = (intent.amount_received ?? 0) / 100
  const now = nowIso()
  // From open, expired (lapsed while the client was paying) or revoked (money was still taken). paid/posted are terminal.
  const result = await env.KR_PAY_D1.prepare(
    `UPDATE payment_request SET status = 'paid', paid_amount = ?3, paid_at = ?4, stripe_event_id = ?5, updated_at = ?4
      WHERE id = ?1 AND stripe_payment_intent_id = ?2 AND paid_at IS NULL AND status IN ('open', 'expired', 'revoked')`,
  ).bind(request.id, intent.id, paidAmount, now, eventId).run()
  if (result.meta.changes === 1) {
    log('paid', `prid=${request.prid} source=${request.link_source} invoice=${request.invoice_number} ivid=${request.invoice_ivid} pi=${intent.id} amount=${paidAmount} from=${request.status}`)
    ctx.waitUntil(notifyHomebase(env, request))
    return 'paid'
  }
  const current = await findByPrid(env, request.prid)
  if (current?.paid_at && current.stripe_payment_intent_id === intent.id) return 'paid'
  log('paid-conflict', `prid=${request.prid} pi=${intent.id} status=${current?.status ?? 'missing'}`)
  return 'mismatch'
}

// ───────────────────────────── KR Homebase notice (receipt webhook) ─────────────────────────────

/** HMAC-SHA256 hex of `<timestamp>.<body>` with the key HMAC(KEK bytes, PAY_LINK_WEBHOOK_KEY_LABEL). */
async function signHomebaseNotice(env: PayWorkerEnv, timestamp: string, body: string): Promise<string> {
  const text = (env.KR_PAYMENT_PROVIDER_KEK ?? '').replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('PAYMENT_PROVIDER_KEK_NOT_CONFIGURED')
  const raw = fromBase64(text)
  if (raw.byteLength !== 32) throw new Error('PAYMENT_PROVIDER_KEK_INVALID')
  const kekKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', kekKey, new TextEncoder().encode(PAY_LINK_WEBHOOK_KEY_LABEL))
  const signingKey = await crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(`${timestamp}.${body}`))
  const rVal = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return rVal
}

/**
 * Tells KR Homebase a link was just paid so it posts the payment and emails the
 * receipt now. Ids only (no amounts, names, or emails). Never throws: a missing
 * URL, a timeout, or an error is logged and the next Billing load posts it.
 */
async function notifyHomebase(env: PayWorkerEnv, request: PayRequestRow): Promise<void> {
  const url = (env.KR_HOMEBASE_PAY_WEBHOOK_URL ?? '').trim()
  if (!/^https:\/\/[^\s]+$/.test(url)) {
    log('homebase-notice', `skipped prid=${request.prid}: KR_HOMEBASE_PAY_WEBHOOK_URL not set; posts on the next Billing load`)
    return
  }
  try {
    const body = JSON.stringify({ event: 'pay_link.paid', paymentRequestId: request.id, prid: request.prid })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = await signHomebaseNotice(env, timestamp, body)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KR-Pay-Signature': `t=${timestamp},v1=${signature}` },
      body,
      signal: AbortSignal.timeout(HOMEBASE_NOTICE_TIMEOUT_MS),
    })
    const reply = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { paymentNumber?: string | null } } | null
    log('homebase-notice', `prid=${request.prid} status=${response.status} ${response.ok ? `posted payment=${reply?.data?.paymentNumber ?? ''}` : `error=${reply?.error ?? 'unknown'}`}`)
  } catch (caught) {
    log('homebase-notice', `prid=${request.prid} failed ${caught instanceof Error ? caught.message : String(caught)}; posts on the next Billing load`)
  }
}

// ───────────────────────────── sandbox test cards ─────────────────────────────

/**
 * Sandbox only: Stripe's published test cards, shown in the "Payment scenario"
 * list. The page confirms with the matching test PaymentMethod id; live keys
 * reject these ids, and the list is never rendered on the live Worker.
 * Mirrors STRIPE_DEV_TEST_SCENARIOS (card entries) in kr-homebase
 * stripeDevTests.types.ts — keep the two in step.
 */
const SANDBOX_TEST_CARDS: ReadonlyArray<{ paymentMethodId: string; label: string; cardNumber: string; cvc: string }> = [
  { paymentMethodId: 'pm_card_visa', label: 'Visa · payment succeeds', cardNumber: '4242 4242 4242 4242', cvc: '123' },
  { paymentMethodId: 'pm_card_visa_debit', label: 'Visa debit · payment succeeds', cardNumber: '4000 0566 5566 5556', cvc: '123' },
  { paymentMethodId: 'pm_card_mastercard', label: 'Mastercard · payment succeeds', cardNumber: '5555 5555 5555 4444', cvc: '123' },
  { paymentMethodId: 'pm_card_amex', label: 'American Express · payment succeeds', cardNumber: '3782 822463 10005', cvc: '1234' },
  { paymentMethodId: 'pm_card_visa_chargeDeclined', label: 'Declined · generic decline', cardNumber: '4000 0000 0000 0002', cvc: '123' },
  { paymentMethodId: 'pm_card_visa_chargeDeclinedInsufficientFunds', label: 'Declined · insufficient funds', cardNumber: '4000 0000 0000 9995', cvc: '123' },
  { paymentMethodId: 'pm_card_authenticationRequired', label: '3D Secure · authentication required', cardNumber: '4000 0027 6000 3184', cvc: '123' },
]

/** Sandbox prefill: test expiry and ZIP (same as Billing → Payments sandbox). */
const SANDBOX_TEST_EXPIRY = '12/34'
const SANDBOX_TEST_ZIP = '75070'

/**
 * Sandbox only: first recipient of the invoice email this link was sent in
 * (document_record.notes.to), for prefilling the Email field.
 */
async function sandboxPrefillEmail(env: PayWorkerEnv, request: PayRequestRow): Promise<string> {
  try {
    const row = await env.KR_PAY_D1.prepare(
      `SELECT d.notes FROM payment_request r JOIN document_record d ON d.document_number = r.sent_document_number WHERE r.id = ?1`,
    ).bind(request.id).first<{ notes: string | null }>()
    const notes = row?.notes ? (JSON.parse(row.notes) as { to?: unknown }) : null
    const first = Array.isArray(notes?.to) ? notes.to.find((value): value is string => typeof value === 'string') : undefined
    return first ?? request.payer_email ?? ''
  } catch {
    return request.payer_email ?? ''
  }
}

// ───────────────────────────── page rendering ─────────────────────────────

const NAVY = '#374657'
const CREAM = '#f1eadf'
const MUTED = '#736a62'
const TEXT = '#1b2330'
const LINE = '#eee7dc'

const PAGE_CSS = `
  *{box-sizing:border-box}
  body{margin:0;background:#f3f0ea;color:${TEXT};font-family:Arial,Helvetica,sans-serif;line-height:1.4}
  .wrap{max-width:680px;margin:0 auto;padding:12px}
  .card{background:#fff;border:1px solid #d8cec0;border-radius:12px;overflow:hidden}
  .banner{background:${NAVY};color:${CREAM};padding:12px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .firm{font-size:17px;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
  .firm span{color:#95b8d0}
  .tag{font-size:12px;font-style:italic;color:#95b8d0}
  .doc{border:1px solid ${CREAM};padding:3px 8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase}
  .test{background:#fff4d6;border-bottom:1px solid #d9a400;color:#6b5200;font-weight:700;font-size:12px;padding:5px 20px}
  .content{padding:12px 20px 14px}
  .head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px}
  h1{font-size:19px;letter-spacing:.04em;text-transform:uppercase;color:${NAVY};margin:0}
  .ivid{font-family:Consolas,Menlo,monospace;font-size:12px;letter-spacing:0;text-transform:none;color:${MUTED};font-weight:400}
  .who{font-size:14px;font-weight:700;color:${MUTED}}
  .inv td{font-size:14px}
  h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#8a715c;margin:12px 0 6px;border-bottom:1px solid #8a715c;padding-bottom:3px}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:2px 16px;font-size:13px}
  .facts div span{color:${MUTED};display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{text-align:left;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${NAVY};background:${CREAM};padding:5px 8px}
  td{padding:5px 8px;border-bottom:1px solid ${LINE};vertical-align:top}
  .num{text-align:right;white-space:nowrap}
  .muted{color:${MUTED};font-size:12px}
  .totals td{border:0;padding:2px 8px}
  .totals .due td{font-weight:700;font-size:16px;border-top:2px solid ${NAVY};padding-top:5px}
  .sum{margin-top:8px}
  .row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid ${LINE};font-size:15px}
  .row span:first-child{color:${MUTED}}
  label{display:block;font-size:11px;font-weight:700;color:${MUTED};margin:6px 0 2px}
  input{width:100%;padding:6px 8px;border:1px solid #c9bfb2;border-radius:6px;font-size:15px}
  .cardbox{padding:8px;border:1px solid #c9bfb2;border-radius:6px;background:#fff}
  .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px}
  .cardrow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 10px}
  .amountrow{display:flex;align-items:center;gap:8px}
  .amountrow input{max-width:160px;font-weight:700}
  .amountrow .muted{flex:1}
  .linkbtn{width:auto;margin:0;padding:0;background:none;color:#174d73;font-size:13px;font-weight:700;border:0;cursor:pointer}
  .payhead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:12px 0 4px;border-bottom:1px solid #8a715c;padding-bottom:3px}
  .payhead h2{margin:0;border:0;padding:0}
  .payhead select{width:auto;max-width:62%;padding:3px 6px;border:1px solid #c9bfb2;border-radius:6px;font-size:12px;background:#fff}
  input[readonly]{background:#f6f3ee;color:${MUTED}}
  .error{color:#9d2c20;font-size:14px;min-height:18px;margin-top:4px}
  button{width:100%;margin-top:4px;padding:10px;border:0;border-radius:8px;background:${NAVY};color:#fff;font-size:16px;font-weight:700;cursor:pointer}
  button:disabled{opacity:.6;cursor:wait}
  .approved{border:2px solid #2f7d4f;border-radius:10px;padding:12px 14px;background:#f1faf4}
  .approved h1{color:#2f7d4f;margin-bottom:4px}
  .pid{font-family:Consolas,Menlo,monospace;font-size:14px;word-break:break-all}
  p{margin:0 0 10px}
  .note{font-size:12px;color:${MUTED}}
  .foot{padding:10px 20px;background:#f8f5ef;border-top:2px solid ${CREAM};font-size:12px;color:${MUTED}}
  .foot .offices{display:flex;gap:4px 16px;flex-wrap:wrap}
  @media (max-width:520px){.grid2{grid-template-columns:1fr}.content{padding:10px 14px 12px}.banner{padding:10px 14px}}`

const REMAINING_NOTE = 'This link is now used. For the remaining balance, use the new link in your receipt email, or call our office.'

const PRIVACY_NOTE = 'Payments are processed securely by Stripe. Your card details go directly to Stripe; Krueger & Richard does not see or keep them, and nothing is saved on file.'

/** Full HTML page with the firm letterhead. `scripts` adds Stripe.js + /assets/pay.js. */
function renderPage(env: PayWorkerEnv, input: { title: string; body: string; status?: number; scripts?: boolean; environment?: PayEnvironment }): Response {
  const sandbox = (input.environment ?? environmentOf(env)) === 'sandbox'
  const offices = `<div class="offices">${FIRM.offices.map((office) => `<span><strong>${escapeHtml(office.city)}</strong> · ${escapeHtml(office.phone)}</span>`).join('')}</div>`
  const scripts = input.scripts ? '<script src="https://js.stripe.com/v3/"></script><script src="/assets/pay.js" defer></script>' : ''
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(input.title)} · ${escapeHtml(FIRM.name)}</title>
<style>${PAGE_CSS}</style>
${scripts}
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="banner"><div><div class="firm">Krueger <span>&amp;</span> Richard</div><div class="tag">Attorneys at Law</div></div><div class="doc">Invoice payment</div></div>
    ${sandbox ? '<div class="test">TEST MODE — Stripe sandbox. No real money is charged.</div>' : ''}
    <div class="content">${input.body}</div>
    <div class="foot">${offices}<div style="margin-top:4px">${escapeHtml(PRIVACY_NOTE)}</div></div>
  </div>
</div>
</body>
</html>`
  const rVal = new Response(html, pageHeaders(input.status ?? 200))
  return rVal
}

/** One-message page (invalid link, expired, not active …). */
function messagePage(env: PayWorkerEnv, title: string, paragraphs: string[], status = 200): Response {
  const phones = FIRM.offices.map((office) => office.phone).join(' or ')
  const body = `<h1>${escapeHtml(title)}</h1>${paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}<p class="note">Questions? Call our office at ${escapeHtml(phones)}.</p>`
  const rVal = renderPage(env, { title, body, status })
  return rVal
}

function invalidLinkPage(env: PayWorkerEnv): Response {
  const rVal = messagePage(env, 'Link not valid', ['This payment link is not valid. Please use the link from your most recent invoice email, or contact our office.'], 404)
  return rVal
}

/** "Payment approved" page for a paid request (refresh after paying, or reopening the link). */
function paidPage(env: PayWorkerEnv, request: PayRequestRow, remaining: number, applied: readonly AllocationLine[]): Response {
  const body = `<div class="approved"><h1>Payment approved</h1>
    <div class="row"><span>Amount</span><span>${money(Number(request.paid_amount ?? 0))}</span></div>
    ${applied.length ? `<div class="row"><span>Applied to</span><span>${escapeHtml(allocationText(applied))}</span></div>` : ''}
    ${remaining > 0 ? `<div class="row"><span>Remaining balance</span><span>${money(remaining)}</span></div>` : ''}
    <div class="row"><span>Date</span><span>${escapeHtml(longDate(request.paid_at))}</span></div>
    <div class="row"><span>Stripe payment ID</span><span class="pid">${escapeHtml(request.stripe_payment_intent_id ?? '')}</span></div></div>
    <p class="note" style="margin-top:10px">Keep the Stripe payment ID for your records.${remaining > 0 ? ` ${REMAINING_NOTE}` : ''}</p>`
  const rVal = renderPage(env, { title: 'Payment approved', body, environment: environmentOfRequest(request) ?? environmentOf(env) })
  return rVal
}

/** Open invoices table ending in "Balance due" (number, IVID, due date, balance — nothing else). */
function openInvoicesTable(account: AccountState): string {
  const rows = account.invoices.map((invoice) => `<tr><td>Invoice #${escapeHtml(invoice.invoice_number)}${invoice.ivid ? ` <span class="ivid">(#${escapeHtml(invoice.ivid)})</span>` : ''}</td><td class="muted">Due ${escapeHtml(invoice.due_date ? longDate(invoice.due_date) : 'on receipt')}</td><td class="num">${money(Number(invoice.balance_due))}</td></tr>`).join('')
  const pending = account.pending ? `<tr><td colspan="2" class="muted">Online payments processing</td><td class="num">${money(-account.pending)}</td></tr>` : ''
  const rVal = `<table class="inv"><tbody>${rows}${pending}</tbody><tbody class="totals"><tr class="due"><td colspan="2">Balance due</td><td class="num">${money(account.due)}</td></tr></tbody></table>`
  return rVal
}

/** Payment page: short name, open invoices, amount, card form. */
function invoicePage(env: PayWorkerEnv, config: StripeConfig, request: PayRequestRow, account: AccountState, sandboxEmail: string): Response {
  const sandbox = config.environment === 'sandbox'
  // Sandbox: prefilled test values and the Payment scenario list (never on the live Worker).
  const prefill = sandbox ? { name: request.client_display_name, email: sandboxEmail, zip: SANDBOX_TEST_ZIP } : { name: '', email: '', zip: '' }
  const firstCard = SANDBOX_TEST_CARDS[0]!
  const scenarioSelect = sandbox
    ? `<select id="pay-scenario" aria-label="Payment scenario (test mode)">${SANDBOX_TEST_CARDS.map((card) => `<option value="${escapeHtml(card.paymentMethodId)}" data-number="${escapeHtml(card.cardNumber)}" data-cvc="${escapeHtml(card.cvc)}">${escapeHtml(`${card.cardNumber} · ${card.label}`)}</option>`).join('')}<option value="manual">Type a card in the Stripe fields</option></select>`
    : ''
  const testCardRows = sandbox
    ? `<div id="card-test">
        <label for="test-number">Card number</label><input id="test-number" readonly value="${escapeHtml(firstCard.cardNumber)}">
        <div class="cardrow">
          <div><label for="test-expiry">Expiry (MM/YY)</label><input id="test-expiry" readonly value="${SANDBOX_TEST_EXPIRY}"></div>
          <div><label for="test-cvc">CVC</label><input id="test-cvc" readonly value="${escapeHtml(firstCard.cvc)}"></div>
          <div><label for="test-zip">Billing ZIP</label><input id="test-zip" readonly value="${SANDBOX_TEST_ZIP}"></div>
        </div>
      </div>`
    : ''
  const dueCents = toCents(account.due)
  // [invoice number, balance in cents] oldest first, for the "Applies to" line.
  const invoiceData = JSON.stringify(account.invoices.map((invoice) => [invoice.invoice_number, toCents(Number(invoice.balance_due))]))
  const phone = FIRM.offices[0]?.phone ?? ''
  const body = `<div class="head"><h1>Online payment</h1><span class="who">${escapeHtml(shortName(request.client_display_name))}</span></div>
    ${openInvoicesTable(account)}
    ${account.invoices.length > 1 ? '<p class="note" style="margin:4px 0 0">Payments are applied to the oldest invoice first.</p>' : ''}
    <div class="payhead"><h2>Pay by card</h2>${scenarioSelect}</div>
    <form id="pay-form" data-pk="${escapeHtml(config.publishableKey)}" data-due-cents="${dueCents}" data-min-cents="${MIN_CHARGE_CENTS}" data-skip-cents="${toCents(account.pending)}" data-invoices="${escapeHtml(invoiceData)}" novalidate>
      <div class="grid2">
        <div><label for="pay-name">Name on card</label><input id="pay-name" autocomplete="cc-name" maxlength="100" required value="${escapeHtml(prefill.name)}"></div>
        <div><label for="pay-email">Email</label><input id="pay-email" type="email" autocomplete="email" maxlength="200" required value="${escapeHtml(prefill.email)}"></div>
      </div>
      ${testCardRows}
      <div id="card-live"${sandbox ? ' hidden' : ''}>
        <label for="card-number">Card number</label><div id="card-number" class="cardbox"></div>
        <div class="cardrow">
          <div><label for="card-expiry">Expiry (MM/YY)</label><div id="card-expiry" class="cardbox"></div></div>
          <div><label for="card-cvc">CVC</label><div id="card-cvc" class="cardbox"></div></div>
          <div><label for="pay-zip">Billing ZIP</label><input id="pay-zip" autocomplete="postal-code" maxlength="10" required value="${escapeHtml(prefill.zip)}"></div>
        </div>
      </div>
      <label for="pay-amount">Amount to pay</label>
      <div class="amountrow">
        <input id="pay-amount" inputmode="decimal" autocomplete="off" maxlength="14" value="${money(account.due)}" aria-describedby="pay-amount-hint">
        <span id="pay-amount-hint" class="muted">Up to ${money(account.due)} · minimum ${money(MIN_CHARGE_CENTS / 100)}</span>
        <button id="pay-full" class="linkbtn" type="button" hidden>Pay in full</button>
      </div>
      <div id="pay-applies" class="muted" aria-live="polite"></div>
      <div id="pay-error" class="error" role="alert"></div>
      <button id="pay-button" type="submit">Pay ${money(account.due)}</button>
      <p class="note" style="margin:6px 0 0">This link expires ${escapeHtml(longDate(request.expires_at))}. Need a copy of your invoice? Reply to your invoice email or call our office${phone ? ` at ${escapeHtml(phone)}` : ''}.</p>
    </form>
    <div id="pay-result" hidden></div>
    <noscript><p class="error">Card payment needs JavaScript. Please enable it, or call our office to pay by phone.</p></noscript>`
  const rVal = renderPage(env, { title: 'Online payment', body, scripts: true, environment: config.environment })
  return rVal
}

// ───────────────────────────── page script (/assets/pay.js) ─────────────────────────────

/**
 * Browser script for the pay page: mounts the Stripe card Element, asks the
 * Worker for the PaymentIntent, confirms it with Stripe.js (3-D Secure when
 * needed), asks the Worker to verify, then shows "Payment approved" with the
 * Stripe payment ID. Text is set with textContent (no HTML injection).
 */
const PAY_SCRIPT = `(function () {
  var form = document.getElementById('pay-form');
  if (!form || typeof Stripe !== 'function') return;
  var stripe = Stripe(form.getAttribute('data-pk'));
  // Separate Card number / Expiry / CVC fields (all visible up front); ZIP is our own input.
  // disableLink: no Stripe Link "Autofill link" wallet on this page (nothing kept on file).
  var elements = stripe.elements();
  var fieldStyle = { base: { fontSize: '16px', color: '#1b2330' } };
  var card = elements.create('cardNumber', { style: fieldStyle, showIcon: true, disableLink: true });
  var expiry = elements.create('cardExpiry', { style: fieldStyle });
  var cvc = elements.create('cardCvc', { style: fieldStyle });
  card.mount('#card-number');
  expiry.mount('#card-expiry');
  cvc.mount('#card-cvc');
  var button = document.getElementById('pay-button');
  var errorBox = document.getElementById('pay-error');
  // Amount: $0.50 up to the balance due; the Pay button shows the amount.
  var amountInput = document.getElementById('pay-amount');
  var dueCents = Number(form.getAttribute('data-due-cents'));
  var minCents = Number(form.getAttribute('data-min-cents'));
  function amountCents() {
    var text = amountInput.value.replace(/[$,\\s]/g, '');
    if (!/^\\d{1,7}(\\.\\d{1,2})?$/.test(text)) return null;
    return Math.round(Number(text) * 100);
  }
  function dollars(cents) { return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var label = button.textContent;
  // "Applies to" preview: oldest invoice first, after online payments still processing.
  var fullButton = document.getElementById('pay-full');
  var appliesBox = document.getElementById('pay-applies');
  var invoices = [];
  try { invoices = JSON.parse(form.getAttribute('data-invoices') || '[]'); } catch (e) { invoices = []; }
  var skipCents = Number(form.getAttribute('data-skip-cents')) || 0;
  function allocation(cents) {
    var skip = skipCents, left = cents, out = [];
    for (var i = 0; i < invoices.length && left > 0; i++) {
      var balance = invoices[i][1], skipped = Math.min(skip, balance);
      skip -= skipped; balance -= skipped;
      var share = Math.min(left, balance);
      if (share > 0) { out.push('Invoice #' + invoices[i][0] + ' ' + dollars(share)); left -= share; }
    }
    return out;
  }
  function syncAmount() {
    var cents = amountCents();
    var valid = cents !== null && cents >= minCents && cents <= dueCents;
    label = valid ? 'Pay ' + dollars(cents) : 'Pay';
    if (!button.disabled) button.textContent = label;
    appliesBox.textContent = valid && invoices.length > 1 ? 'Applies to ' + allocation(cents).join(' · ') : '';
  }
  amountInput.addEventListener('input', syncAmount);
  // Leaving the field: show it as currency, and offer "Pay in full" when the amount is less than the balance.
  amountInput.addEventListener('blur', function () {
    var cents = amountCents();
    if (cents !== null) amountInput.value = dollars(cents);
    fullButton.hidden = !(cents !== null && cents < dueCents);
    syncAmount();
  });
  fullButton.addEventListener('click', function () { amountInput.value = dollars(dueCents); fullButton.hidden = true; syncAmount(); show(''); });
  syncAmount();
  var base = window.location.pathname.replace(/\\/+$/, '');
  function show(message) { errorBox.textContent = message || ''; }
  function reset() { button.disabled = false; button.textContent = label; }
  var fieldErrors = {};
  function fieldChange(key) {
    return function (event) {
      fieldErrors[key] = event.error ? event.error.message : '';
      show(fieldErrors.card || fieldErrors.expiry || fieldErrors.cvc || '');
    };
  }
  card.on('change', fieldChange('card'));
  // Sandbox only: Payment scenario list (absent on the live page).
  var scenario = document.getElementById('pay-scenario');
  var testBox = document.getElementById('card-test');
  var liveBox = document.getElementById('card-live');
  function testPaymentMethod() { return scenario && scenario.value !== 'manual' ? scenario.value : ''; }
  function applyScenario() {
    if (!scenario) return;
    var manual = scenario.value === 'manual';
    var option = scenario.options[scenario.selectedIndex];
    testBox.hidden = manual; liveBox.hidden = !manual;
    if (!manual) {
      document.getElementById('test-number').value = option.getAttribute('data-number') || '';
      document.getElementById('test-cvc').value = option.getAttribute('data-cvc') || '';
    }
    fieldErrors = {}; show('');
  }
  if (scenario) { scenario.addEventListener('change', applyScenario); applyScenario(); }
  expiry.on('change', fieldChange('expiry'));
  cvc.on('change', fieldChange('cvc'));
  function post(path, body) {
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (response) { return response.json().catch(function () { return { status: 'error', message: 'Unexpected response.' }; }); });
  }
  function line(parent, name, value, mono) {
    var row = document.createElement('div'); row.className = 'row';
    var a = document.createElement('span'); a.textContent = name;
    var b = document.createElement('span'); b.textContent = value; if (mono) b.className = 'pid';
    row.appendChild(a); row.appendChild(b); parent.appendChild(row);
  }
  function approved(result) {
    var box = document.getElementById('pay-result');
    box.innerHTML = '';
    var panel = document.createElement('div'); panel.className = 'approved';
    var h = document.createElement('h1'); h.textContent = 'Payment approved'; panel.appendChild(h);
    line(panel, 'Amount', result.amount);
    if (result.appliedTo) line(panel, 'Applied to', result.appliedTo);
    if (result.remaining) line(panel, 'Remaining balance', result.remaining);
    if (result.card) line(panel, 'Card', result.card);
    line(panel, 'Date', result.paidAt);
    line(panel, 'Stripe payment ID', result.paymentId, true);
    box.appendChild(panel);
    var note = document.createElement('p'); note.className = 'note'; note.style.marginTop = '14px';
    note.textContent = 'Keep the Stripe payment ID for your records.' + (result.remainingNote ? ' ' + result.remainingNote : '');
    box.appendChild(note);
    form.hidden = true; box.hidden = false; box.scrollIntoView({ behavior: 'smooth' });
  }
  function outcome(result) {
    if (result.status === 'paid') { approved(result); return; }
    show(result.message || 'The payment could not be completed.'); reset();
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var name = document.getElementById('pay-name').value.trim();
    var email = document.getElementById('pay-email').value.trim();
    var zip = document.getElementById('pay-zip').value.trim();
    if (!name) { show('Enter the name on the card.'); return; }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { show('Enter a valid email address.'); return; }
    var cents = amountCents();
    if (cents === null || cents < minCents || cents > dueCents) { show('Enter an amount from ' + dollars(minCents) + ' to ' + dollars(dueCents) + '.'); return; }
    var testMethod = testPaymentMethod();
    if (!testMethod && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(zip)) { show('Enter the billing ZIP code for the card.'); return; }
    show(''); button.disabled = true; button.textContent = 'Processing…';
    post('/intent', { name: name, email: email, amount: (cents / 100).toFixed(2) }).then(function (intent) {
      if (intent.status !== 'requires_payment') { outcome(intent); return; }
      // Sandbox scenario: confirm with the Stripe test PaymentMethod id; otherwise with the card fields.
      var paymentMethod = testMethod || { card: card, billing_details: { name: name, email: email, address: { postal_code: zip } } };
      return stripe.confirmCardPayment(intent.clientSecret, { payment_method: paymentMethod })
        .then(function (result) {
          if (result.error) { show(result.error.message); reset(); return; }
          return post('/confirm', { paymentIntentId: result.paymentIntent.id }).then(outcome);
        });
    }).catch(function () { show('The payment could not be completed. Please try again.'); reset(); });
  });
})();
`

// ───────────────────────────── handlers ─────────────────────────────

/** Resolves a token to its request (null → "not valid"). */
async function loadByToken(env: PayWorkerEnv, token: string): Promise<PayRequestRow | null> {
  if (!TOKEN_PATTERN.test(token)) return null
  const request = await findByTokenHash(env, await sha256Hex(token))
  if (!request || !environmentOfRequest(request)) return null
  return request
}

/** Why a request cannot take a payment now (title + message), or null when it can. */
async function blockedReason(env: PayWorkerEnv, request: PayRequestRow, amountDue: number): Promise<[string, string] | null> {
  if (request.status === 'revoked') return ['Link no longer active', 'This payment link is no longer active. Please use the link in the most recent email from our office, or contact us.']
  if (request.status === 'expired' || (await expireIfDue(env, request))) return ['Link expired', 'This payment link has expired. Please contact our office and we will send you a new one.']
  if (toCents(amountDue) < MIN_CHARGE_CENTS) return ['Nothing due', 'Your account has no balance due. Thank you.']
  return null
}

/** JSON for a paid request (approval panel). */
function paidJson(request: PayRequestRow, card: string | null, remaining: number, applied: readonly AllocationLine[]): Record<string, unknown> {
  const rVal = {
    status: 'paid',
    paymentId: request.stripe_payment_intent_id,
    amount: money(Number(request.paid_amount ?? 0)),
    remaining: remaining > 0 ? money(remaining) : null,
    remainingNote: remaining > 0 ? REMAINING_NOTE : null,
    appliedTo: applied.length ? allocationText(applied) : null,
    paidAt: longDate(request.paid_at),
    card,
  }
  return rVal
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const rVal = (await request.json().catch(() => ({}))) as Record<string, unknown>
  return rVal && typeof rVal === 'object' ? rVal : {}
}

async function handlePayPage(env: PayWorkerEnv, token: string): Promise<Response> {
  const request = await loadByToken(env, token)
  if (!request) return invalidLinkPage(env)
  await recordView(env, request)
  if (request.paid_at) return paidPage(env, request, await remainingAfterPayment(env, request), await ownAllocation(env, request))
  const account = await accountFor(env, request)
  const amountDue = account.due
  const blocked = await blockedReason(env, request, amountDue)
  if (blocked) return messagePage(env, blocked[0], [blocked[1]])
  const environment = environmentOfRequest(request)
  const config = environment ? await stripeConfigOrNull(env, environment) : null
  if (!config) return messagePage(env, 'Payments unavailable', [PAYMENTS_UNAVAILABLE], 503)
  log('view', `prid=${request.prid} client=${request.client_number} invoices=${account.invoices.length} due=${amountDue}`)
  const sandboxEmail = environment === 'sandbox' ? await sandboxPrefillEmail(env, request) : ''
  return invoicePage(env, config, request, account, sandboxEmail)
}

/** Creates (or reuses) the PaymentIntent for the current balance and returns its client secret. */
async function handleIntent(env: PayWorkerEnv, ctx: ExecutionContext, token: string, httpRequest: Request): Promise<Response> {
  const request = await loadByToken(env, token)
  if (!request) return jsonResponse({ status: 'error', message: 'This payment link is not valid.' }, 404)
  if (request.paid_at) return jsonResponse(paidJson(request, null, await remainingAfterPayment(env, request), await ownAllocation(env, request)))
  const input = await readJson(httpRequest)
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 100) : ''
  const email = typeof input.email === 'string' ? input.email.trim().slice(0, 200) : ''
  if (!name || !EMAIL_PATTERN.test(email)) return jsonResponse({ status: 'error', message: 'Enter the name on the card and a valid email address.' }, 422)
  const amountDue = await amountDueFor(env, request)
  const blocked = await blockedReason(env, request, amountDue)
  if (blocked) return jsonResponse({ status: 'error', message: blocked[1] }, 409)
  // Amount: what the client typed (full balance when omitted), $0.50 up to the balance due.
  const dueCents = toCents(amountDue)
  const cents = input.amount === undefined ? dueCents : parseAmountCents(input.amount)
  if (cents === null || cents < MIN_CHARGE_CENTS || cents > dueCents) return jsonResponse({ status: 'error', message: `Enter an amount from ${money(MIN_CHARGE_CENTS / 100)} to ${money(amountDue)}.` }, 422)
  const partial = cents < dueCents
  const environment = environmentOfRequest(request)
  const config = environment ? await stripeConfigOrNull(env, environment) : null
  if (!config) return jsonResponse({ status: 'error', message: PAYMENTS_UNAVAILABLE }, 503)

  // Reuse an unfinished PaymentIntent for the same amount; finish a succeeded one; replace one for an old amount.
  if (request.stripe_payment_intent_id) {
    const existing = await retrieveIntent(config, request.stripe_payment_intent_id)
    if (existing?.status === 'succeeded') {
      const outcome = await markPaid(env, ctx, request, existing, null)
      const current = await findByPrid(env, request.prid)
      return outcome === 'paid' && current ? jsonResponse(paidJson(current, cardOf(existing), await remainingAfterPayment(env, current), await ownAllocation(env, current))) : jsonResponse({ status: 'error', message: 'This payment needs review by our office. Please do not pay again; we will contact you.' }, 409)
    }
    if (existing?.status === 'processing') return jsonResponse({ status: 'processing', message: 'A payment on this link is already processing. Please do not pay again.' }, 409)
    if (existing && REUSABLE_INTENT_STATES.has(existing.status ?? '') && existing.amount === cents && existing.client_secret) {
      await env.KR_PAY_D1.prepare(`UPDATE payment_request SET payer_email = ?2, updated_at = ?3 WHERE id = ?1 AND paid_at IS NULL`).bind(request.id, email, nowIso()).run()
      return jsonResponse({ status: 'requires_payment', clientSecret: existing.client_secret, paymentIntentId: existing.id, amount: money(cents / 100) })
    }
    if (existing && REUSABLE_INTENT_STATES.has(existing.status ?? '')) await stripe(config, 'POST', `/v1/payment_intents/${encodeURIComponent(existing.id)}/cancel`)
  }

  const attempt = Number(request.intent_attempts) + 1
  const form = new URLSearchParams()
  form.set('amount', String(cents))
  form.set('currency', 'usd')
  form.append('payment_method_types[]', 'card')
  form.set('description', `${FIRM.name} account ${request.client_number} · pay link ${request.prid}${partial ? ' · partial payment' : ''}`)
  const metadata: Record<string, string> = {
    kr_source: KR_STRIPE_BILLING_SOURCE,
    kr_channel: 'pay_link',
    kr_payment_request_id: request.id,
    kr_prid: request.prid,
    kr_invoice_id: request.invoice_id,
    kr_invoice_number: request.invoice_number,
    kr_ivid: request.invoice_ivid,
    kr_client_id: request.client_id,
    kr_client_number: request.client_number,
    kr_matter_id: request.matter_id,
    kr_cardholder_name: name,
    kr_scope: 'account',
    kr_payment_kind: partial ? 'partial' : 'full',
    kr_balance_due_cents: String(dueCents),
    kr_link_source: request.link_source === 'print' ? 'print' : 'email',
  }
  for (const [key, value] of Object.entries(metadata)) form.set(`metadata[${key}]`, value)
  const created = await stripe<PaymentIntent>(config, 'POST', '/v1/payment_intents', form, `kr-pay-${request.id}-${attempt}`)
  if (!created.body?.id || !created.body.client_secret) return jsonResponse({ status: 'error', message: 'We could not start the payment just now. Please try again in a few minutes.' }, 502)
  const now = nowIso()
  const saved = await env.KR_PAY_D1.prepare(
    `UPDATE payment_request SET stripe_payment_intent_id = ?2, intent_created_at = ?3, intent_attempts = ?4, payer_email = ?5, updated_at = ?3
      WHERE id = ?1 AND status = 'open' AND paid_at IS NULL AND intent_attempts = ?6`,
  ).bind(request.id, created.body.id, now, attempt, email, request.intent_attempts).run()
  if (saved.meta.changes !== 1) {
    const current = await findByPrid(env, request.prid)
    if (current?.stripe_payment_intent_id !== created.body.id) {
      // Another tab created a newer PaymentIntent (or the link changed state): drop this one.
      await stripe(config, 'POST', `/v1/payment_intents/${encodeURIComponent(created.body.id)}/cancel`)
      log('intent-race', `prid=${request.prid} pi=${created.body.id} current=${current?.stripe_payment_intent_id ?? 'none'} status=${current?.status ?? 'missing'}`)
      return jsonResponse({ status: 'error', message: 'This payment link changed while the page was open. Please reload the page.' }, 409)
    }
  }
  log('intent', `prid=${request.prid} source=${request.link_source} invoice=${request.invoice_number} pi=${created.body.id} cents=${cents} attempt=${attempt}`)
  return jsonResponse({ status: 'requires_payment', clientSecret: created.body.client_secret, paymentIntentId: created.body.id, amount: money(cents / 100) })
}

/** After Stripe.js confirms: re-reads the PaymentIntent from Stripe and marks the request paid. */
async function handleConfirm(env: PayWorkerEnv, ctx: ExecutionContext, token: string, httpRequest: Request): Promise<Response> {
  const request = await loadByToken(env, token)
  if (!request) return jsonResponse({ status: 'error', message: 'This payment link is not valid.' }, 404)
  const input = await readJson(httpRequest)
  const paymentIntentId = typeof input.paymentIntentId === 'string' ? input.paymentIntentId : ''
  if (!INTENT_PATTERN.test(paymentIntentId) || paymentIntentId !== request.stripe_payment_intent_id) return jsonResponse({ status: 'error', message: 'This payment does not belong to this link.' }, 409)
  const environment = environmentOfRequest(request)
  const config = environment ? await stripeConfigOrNull(env, environment) : null
  if (!config) return jsonResponse({ status: 'error', message: `${PAYMENTS_UNAVAILABLE} If your card was charged, it will appear on your account; please do not pay again.` }, 503)
  const intent = await retrieveIntent(config, paymentIntentId)
  if (!intent) return jsonResponse({ status: 'error', message: 'We could not confirm the payment with Stripe yet. If your card was charged, it will appear on your account shortly. Please do not pay again.' }, 502)
  if (intent.status === 'processing') return jsonResponse({ status: 'processing', message: 'Your payment is processing. Please do not pay again.' })
  const outcome = await markPaid(env, ctx, request, intent, null)
  if (outcome === 'paid') {
    const current = (await findByPrid(env, request.prid)) ?? request
    return jsonResponse(paidJson(current, cardOf(intent), await remainingAfterPayment(env, current), await ownAllocation(env, current)))
  }
  if (outcome === 'mismatch') return jsonResponse({ status: 'error', message: 'Stripe reports a payment, but our office must review it before it is applied. Please do not pay again; we will contact you.' }, 409)
  return jsonResponse({ status: 'not_paid', message: 'The payment was not completed. You can try again.' })
}

// ───────────────────────────── webhook ─────────────────────────────

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

/** Verifies the Stripe-Signature header (t=…,v1=…) over the raw body. */
async function verifyStripeSignature(secret: string, header: string | null, rawBody: string): Promise<boolean> {
  if (!header || !secret) return false
  const parts = header.split(',').map((part) => part.trim().split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '')
  if (!Number.isFinite(timestamp) || !signatures.length) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const expected = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const rVal = signatures.some((signature) => timingSafeEqualHex(signature, expected))
  return rVal
}

/** Best-effort event log (external_webhook_event; unique per provider + event id). */
async function logWebhookEvent(env: PayWorkerEnv, event: { id: string; type: string }, resourceId: string | null, status: 'processed' | 'ignored' | 'failed', error: string | null): Promise<void> {
  try {
    const now = nowIso()
    await env.KR_PAY_D1.prepare(
      `INSERT OR IGNORE INTO external_webhook_event (id, provider, external_event_id, event_type, resource_type, resource_id, received_at, processed_at, processing_status, error_message)
       VALUES (?1, 'stripe', ?2, ?3, 'payment_intent', ?4, ?5, ?5, ?6, ?7)`,
    ).bind(`whe_${crypto.randomUUID()}`, event.id, event.type, resourceId, now, status, error).run()
  } catch (caught) {
    log('webhook-log', `could not log event ${event.id}: ${caught instanceof Error ? caught.message : String(caught)}`)
  }
}

/** payment_intent.succeeded for a pay link whose browser never reached /confirm. */
async function handleWebhook(env: PayWorkerEnv, ctx: ExecutionContext, request: Request, environment: PayEnvironment): Promise<Response> {
  const rawBody = await request.text()
  const config = await stripeConfigOrNull(env, environment)
  if (!config?.webhookSecret) {
    log('webhook', 'no webhook secret in Settings → Stripe Payment Configuration; Stripe will retry')
    return jsonResponse({ error: 'webhook secret not configured' }, 503)
  }
  if (!(await verifyStripeSignature(config.webhookSecret, request.headers.get('Stripe-Signature'), rawBody))) {
    log('webhook', 'signature rejected')
    return jsonResponse({ error: 'invalid signature' }, 400)
  }
  const event = JSON.parse(rawBody) as { id: string; type: string; livemode?: boolean; data?: { object?: PaymentIntent } }
  if (Boolean(event.livemode) !== (environment === 'live')) {
    log('webhook', `ignored ${event.type} ${event.id}: livemode does not match ${environment}`)
    return jsonResponse({ received: true, ignored: 'environment' })
  }
  const object = event.data?.object
  const prid = object?.metadata?.kr_prid ?? ''
  if (event.type !== 'payment_intent.succeeded' || !object?.id || object.metadata?.kr_channel !== 'pay_link' || !PRID_PATTERN.test(prid)) {
    // Other events, and staff card payments from KR Homebase (no kr_prid), are not ours.
    await logWebhookEvent(env, event, object?.id ?? null, 'ignored', null)
    return jsonResponse({ received: true, ignored: event.type })
  }
  const payRequest = await findByPrid(env, prid)
  if (!payRequest) {
    await logWebhookEvent(env, event, object.id, 'failed', 'no payment_request for kr_prid')
    return jsonResponse({ received: true, ignored: 'unknown pay link' })
  }
  if (environmentOfRequest(payRequest) !== environment) {
    await logWebhookEvent(env, event, object.id, 'ignored', 'payment_request environment does not match webhook route')
    log('webhook', `ignored ${event.type} ${event.id}: payment request environment does not match ${environment}`)
    return jsonResponse({ received: true, ignored: 'environment' })
  }
  // Fresh read from Stripe instead of trusting the event snapshot.
  const intent = await retrieveIntent(config, object.id)
  if (!intent) return jsonResponse({ error: 'stripe unavailable' }, 500) // Stripe retries
  const outcome = await markPaid(env, ctx, payRequest, intent, event.id)
  await logWebhookEvent(env, event, object.id, outcome === 'mismatch' ? 'failed' : 'processed', outcome === 'paid' ? null : outcome)
  log('webhook', `${event.type} ${event.id} prid=${prid} outcome=${outcome}`)
  return jsonResponse({ received: true, outcome })
}

// ───────────────────────────── router ─────────────────────────────

export default {
  async fetch(request: Request, env: PayWorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (request.method === 'GET' && path === '/health') {
        // Reports both provider profiles (error codes only, never keys).
        const stripe: Record<PayEnvironment, string> = { sandbox: 'ready', live: 'ready' }
        for (const environment of ['sandbox', 'live'] as const) {
          try {
            await loadStripeConfig(env, environment)
          } catch (caught) {
            stripe[environment] = caught instanceof Error ? caught.message : 'unavailable'
          }
        }
        return jsonResponse({ ok: stripe.sandbox === 'ready' && stripe.live === 'ready', environment: 'dual', stripe })
      }
      if (request.method === 'GET' && path === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } })
      if (request.method === 'GET' && path === '/assets/pay.js') return new Response(PAY_SCRIPT, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
      const webhookEnvironment = path === '/stripe/webhook/sandbox' ? 'sandbox' : path === '/stripe/webhook/live' ? 'live' : null
      if (request.method === 'POST' && webhookEnvironment) return await handleWebhook(env, ctx, request, webhookEnvironment)
      const pay = path.match(/^\/p\/([^/]+)(?:\/(intent|confirm))?$/)
      if (pay && request.method === 'GET' && !pay[2]) return await handlePayPage(env, pay[1])
      if (pay && request.method === 'POST' && pay[2] === 'intent') return await handleIntent(env, ctx, pay[1], request)
      if (pay && request.method === 'POST' && pay[2] === 'confirm') return await handleConfirm(env, ctx, pay[1], request)
      return messagePage(env, 'Page not found', ['There is nothing at this address. Please use the payment link from your invoice email.'], 404)
    } catch (caught) {
      // Never log the token: /p/<token> is masked.
      log('error', `${request.method} ${path.replace(/^\/p\/[^/]+/, '/p/<token>')} ${caught instanceof Error ? caught.message : String(caught)}`)
      if (path.startsWith('/stripe/webhook/') || request.method === 'POST') return jsonResponse({ status: 'error', message: 'Something went wrong. Please try again in a few minutes.' }, 500)
      return messagePage(env, 'Something went wrong', ['We could not load this page. Please try again in a few minutes.'], 500)
    }
  },
} satisfies ExportedHandler<PayWorkerEnv>
