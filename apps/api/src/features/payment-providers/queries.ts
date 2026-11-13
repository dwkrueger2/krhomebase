// file: apps/api/src/features/payment-providers/queries.ts
/**
 * The only file of the payment-providers area that talks to D1 (`test/databaseAccess.test.ts` checks this). It replaces
 * the old store's CRUD Worker calls (`crudSearch`, `crudCreate`, `crudUpdate`, `crudDelete` on `payment_provider`).
 *
 * Table `payment_provider` (Schema 8.0): one row per Stripe provider profile; `ppid` is UNIQUE over every row;
 * `environment` is `live` or `sandbox`; secrets are stored only as ciphertext (`v1:…`), a SHA-256 hash and, for the
 * secret key, its prefix. The pay Worker reads the enabled row of each environment.
 *
 * Reads select named columns only. The ciphertext columns are read so the rules can tell whether a key is stored and
 * decrypt it for a Stripe call; they never leave the API.
 *
 * Writes, each one `db.batch` with its `audit_log` row (resource `payment-providers`):
 * - `save`: when the profile is enabled, every other enabled profile of the same environment is disabled, then the
 *   profile is changed or inserted. All in one batch, so the environment is never left with no enabled profile by a
 *   half-finished save (old oddity 3: the old store disabled the others first, in separate calls). A new profile's
 *   `ppid` is worked out inside the insert (`MAX(ppid) + 1`), so two saves cannot pick the same number (old oddity 4).
 *   A secret column is changed only when a new value is given (`COALESCE`); the others always.
 * - `remove`: deletes the row (a hard delete, as before).
 * - `recordVerification`: the result of a connection test (`last_verified_at`, `last_verified_status`). It does not
 *   change `updated_at`, so the card's concurrency token stays valid after a test.
 *
 * A missing table answers `PaymentProvidersUnavailableError` (`PAYMENT_PROVIDER_TABLE_MISSING`).
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** The table is missing or the database refused the statement. */
export class PaymentProvidersUnavailableError extends Error {
  readonly code = 'PAYMENT_PROVIDER_TABLE_MISSING'
  constructor(cause: unknown) {
    super(`PAYMENT_PROVIDER_TABLE_MISSING: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'PaymentProvidersUnavailableError'
  }
}

/** One `payment_provider` row, as the rules read it. */
export interface PaymentProviderRow {
  id: string
  ppid: number
  environment: 'live' | 'sandbox'
  display_name: string | null
  is_enabled: number | null
  account_id: string | null
  account_email: string | null
  publishable_key: string | null
  secret_key_name: string | null
  secret_key_prefix: string | null
  secret_key_hash: string | null
  secret_key_ciphertext: string | null
  secret_key_set_at: string | null
  webhook_secret_name: string | null
  webhook_secret_hash: string | null
  webhook_secret_ciphertext: string | null
  webhook_secret_set_at: string | null
  api_version: string | null
  default_currency: string | null
  last_verified_at: string | null
  last_verified_status: string | null
  notes: string | null
  updated_at: string | null
}

/** Everything one save writes; `rules.ts` works it out. Secrets arrive already encrypted. */
export interface PaymentProviderWrite {
  id: string
  isNew: boolean
  environment: 'live' | 'sandbox'
  now: string
  actorUserId: string
  displayName: string | null
  isEnabled: boolean
  accountId: string | null
  accountEmail: string | null
  publishableKey: string | null
  secretKeyName: string | null
  webhookSecretName: string | null
  apiVersion: string | null
  defaultCurrency: string
  notes: string | null
  /** A new secret key (ciphertext, hash, prefix) checked with Stripe; null keeps the stored one. */
  secretKey: { ciphertext: string; hash: string; prefix: string | null } | null
  /** A new webhook secret; null keeps the stored one. */
  webhookSecret: { ciphertext: string; hash: string } | null
}

export interface PaymentProviderQueries {
  /** Every Stripe provider row, by `ppid`. */
  rows(): Promise<PaymentProviderRow[]>
  /** Saves one profile (and disables the others of its environment when it is enabled) with its audit row. */
  save(write: PaymentProviderWrite, audit: AuditEntry): Promise<void>
  /** Deletes one profile with its audit row. */
  remove(id: string, audit: AuditEntry): Promise<void>
  /** Records a connection test result with its audit row. */
  recordVerification(id: string, status: string, now: string, audit: AuditEntry): Promise<void>
}

const ROW_COLUMNS = `id, ppid, environment, display_name, is_enabled, account_id, account_email, publishable_key, secret_key_name,
  secret_key_prefix, secret_key_hash, secret_key_ciphertext, secret_key_set_at, webhook_secret_name, webhook_secret_hash,
  webhook_secret_ciphertext, webhook_secret_set_at, api_version, default_currency, last_verified_at, last_verified_status,
  notes, updated_at`

export function createPaymentProviderQueries(db: D1Database): PaymentProviderQueries {
  async function batch(statements: D1PreparedStatement[]): Promise<void> {
    try {
      await db.batch(statements)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/no such table|UNKNOWN_TABLE/i.test(message)) throw new PaymentProvidersUnavailableError(error)
      throw error
    }
  }

  return {
    async rows() {
      try {
        const result = await db.prepare(`SELECT ${ROW_COLUMNS} FROM payment_provider WHERE provider = 'stripe' ORDER BY ppid ASC LIMIT 100`).all<PaymentProviderRow>()
        return result.results ?? []
      } catch (error) {
        throw new PaymentProvidersUnavailableError(error)
      }
    },

    async save(write, audit) {
      const statements: D1PreparedStatement[] = []
      // One environment has one active connection. Selecting Enabled on a profile
      // turns the other profiles for that environment off in the same save.
      if (write.isEnabled) {
        statements.push(
          db
            .prepare(`UPDATE payment_provider SET is_enabled = 0, updated_by_user_id = ?3, updated_at = ?4 WHERE provider = 'stripe' AND environment = ?1 AND id <> ?2 AND is_enabled = 1`)
            .bind(write.environment, write.id, write.actorUserId, write.now),
        )
      }
      const secret = write.secretKey
      const webhook = write.webhookSecret
      const values = [
        write.id, // ?1
        write.environment, // ?2
        write.displayName, // ?3
        write.isEnabled ? 1 : 0, // ?4
        write.accountId, // ?5
        write.accountEmail, // ?6
        write.publishableKey, // ?7
        write.secretKeyName, // ?8
        write.webhookSecretName, // ?9
        write.apiVersion, // ?10
        write.defaultCurrency, // ?11
        write.notes, // ?12
        write.actorUserId, // ?13
        write.now, // ?14
        secret?.ciphertext ?? null, // ?15
        secret?.hash ?? null, // ?16
        secret?.prefix ?? null, // ?17
        secret ? write.now : null, // ?18 secret set at / last verified at
        secret ? write.actorUserId : null, // ?19
        secret ? 'ok' : null, // ?20 last verified status
        webhook?.ciphertext ?? null, // ?21
        webhook?.hash ?? null, // ?22
        webhook ? write.now : null, // ?23
        webhook ? write.actorUserId : null, // ?24
      ]
      statements.push(
        write.isNew
          ? db
              .prepare(
                `INSERT INTO payment_provider (id, ppid, provider, environment, display_name, is_enabled, account_id, account_email, publishable_key,
                   secret_key_name, webhook_secret_name, api_version, default_currency, notes, created_by_user_id, updated_by_user_id, created_at, updated_at,
                   secret_key_ciphertext, secret_key_hash, secret_key_prefix, secret_key_set_at, secret_key_set_by_user_id, last_verified_at, last_verified_status,
                   webhook_secret_ciphertext, webhook_secret_hash, webhook_secret_set_at, webhook_secret_set_by_user_id)
                 SELECT ?1, COALESCE(MAX(ppid), 0) + 1, 'stripe', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14, ?14,
                   ?15, ?16, ?17, ?18, ?19, ?18, ?20, ?21, ?22, ?23, ?24
                   FROM payment_provider`,
              )
              .bind(...values)
          : db
              .prepare(
                `UPDATE payment_provider SET display_name = ?3, is_enabled = ?4, account_id = ?5, account_email = ?6, publishable_key = ?7,
                   secret_key_name = ?8, webhook_secret_name = ?9, api_version = ?10, default_currency = ?11, notes = ?12,
                   updated_by_user_id = ?13, updated_at = ?14,
                   secret_key_ciphertext = COALESCE(?15, secret_key_ciphertext), secret_key_hash = COALESCE(?16, secret_key_hash),
                   secret_key_prefix = CASE WHEN ?15 IS NULL THEN secret_key_prefix ELSE ?17 END,
                   secret_key_set_at = COALESCE(?18, secret_key_set_at), secret_key_set_by_user_id = COALESCE(?19, secret_key_set_by_user_id),
                   last_verified_at = COALESCE(?18, last_verified_at), last_verified_status = COALESCE(?20, last_verified_status),
                   webhook_secret_ciphertext = COALESCE(?21, webhook_secret_ciphertext), webhook_secret_hash = COALESCE(?22, webhook_secret_hash),
                   webhook_secret_set_at = COALESCE(?23, webhook_secret_set_at), webhook_secret_set_by_user_id = COALESCE(?24, webhook_secret_set_by_user_id)
                 WHERE id = ?1 AND environment = ?2 AND provider = 'stripe'`,
              )
              .bind(...values),
      )
      statements.push(auditStatement(db, audit))
      await batch(statements)
    },

    async remove(id, audit) {
      await batch([db.prepare(`DELETE FROM payment_provider WHERE id = ?1 AND provider = 'stripe'`).bind(id), auditStatement(db, audit)])
    },

    async recordVerification(id, status, now, audit) {
      await batch([
        db.prepare(`UPDATE payment_provider SET last_verified_at = ?2, last_verified_status = ?3 WHERE id = ?1`).bind(id, now, status),
        auditStatement(db, audit),
      ])
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function paymentProviderQueriesFor(env: { krhomebase?: D1Database } | undefined): PaymentProviderQueries | null {
  return env?.krhomebase ? createPaymentProviderQueries(env.krhomebase) : null
}
