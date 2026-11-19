// file: apps/api/src/features/firm/queries.ts
/**
 * The only file of the firm area that talks to D1 (Settings plan, stage 5). Two settings rows of the `lookup` table
 * and the firm's `entity` row:
 *
 * // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
 *
 * - Firm Profile: id `lk_kr_firm_locations_profile`, category `kr_firm_locations`, value `firm_locations`, label
 *   `Firm Locations`, sort order 10; `description` holds the whole profile as JSON (schema `kr-firm-settings-v1`, the
 *   old shape, including `firmEntityId`). Saving also sets the firm entity's `legal_name` (`ent_krueger_richard_firm`),
 *   creating the entity as an active partnership when it does not exist, as the old route did.
 * - Employee Policies: id `lk_kr_employee_policies`, category `kr_employee_policies`, value `employee_policies`,
 *   label `Employee Policies`, sort order 20; `description` holds the policy JSON (schema `kr-employee-policies-v1`).
 *   Attendance reads the same row (`features/timekeeping/queries.ts`).
 * - Billing Rate Classes (FB-0008, repository patch 59): id `lk_kr_billing_rate_classes`, category
 *   `kr_billing_rate_classes`, value `billing_rate_classes`, label `Billing Rate Classes`, sort order 30; `description`
 *   holds `{ schema, classes, defaults }` (`packages/contracts/src/billingRates.ts`). The class save changes only
 *   `$.classes` and the Users save only one person's `$.defaults."<user id>"` (`billingRateDefaultStatement`, used by
 *   `features/users/queries.ts`), each with `json_set` in one statement, so the two never overwrite each other. Billing
 *   and Users read it with `readBillingRatesRow`.
 *
 * Each save is one batch with its `audit_log` row. A failure answers `FirmUnavailableError`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export const FIRM_PROFILE_LOOKUP_ID = 'lk_kr_firm_locations_profile'
export const EMPLOYEE_POLICIES_LOOKUP_ID = 'lk_kr_employee_policies'
export const BILLING_RATES_LOOKUP_ID = 'lk_kr_billing_rate_classes'
const BILLING_RATES_CATEGORY = 'kr_billing_rate_classes'
const BILLING_RATES_SCHEMA = 'kr-billing-rates-v1'

/** The stored JSON as an object, or `{}` when the row holds nothing readable (SQL, for `json_set`). */
const STORED_OR_EMPTY = "CASE WHEN json_valid(lookup.description) AND json_type(lookup.description) = 'object' THEN lookup.description ELSE '{}' END"

/**
 * The billing rates settings row's JSON (FB-0008), or null when there is no active row. Shared with Billing and Users.
 * See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
 */
export async function readBillingRatesRow(db: D1Database): Promise<SettingsRow | null> {
  const found = await db
    .prepare('SELECT description, updated_at, created_at FROM lookup WHERE id = ?1 AND category = ?2 AND is_active = 1 LIMIT 1')
    .bind(BILLING_RATES_LOOKUP_ID, BILLING_RATES_CATEGORY)
    .first<{ description: string | null; updated_at: string | null; created_at: string | null }>()
  return found ? { description: found.description, updatedAt: found.updated_at ?? found.created_at ?? null } : null
}

/**
 * One person's default billing rate class (FB-0008), as one statement for the Users save's batch: sets
 * `$.defaults."<user id>"` to the class id, or removes it when `classId` is null, and touches nothing else in the row.
 * Creates the row (without classes, so the built-in ones are read) when there is none. The user id is checked by the
 * caller to hold only letters, digits, `_` and `-`, so it is safe inside the JSON path.
 * See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
 */
export function billingRateDefaultStatement(db: D1Database, userId: string, classId: string | null, now: string): D1PreparedStatement {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(userId)) throw new Error('BILLING_RATE_DEFAULT_USER_ID_INVALID')
  const path = `$.defaults."${userId}"`
  return db
    .prepare(
      `INSERT INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at)
       VALUES (?1, ?2, 'billing_rate_classes', 'Billing Rate Classes',
               CASE WHEN ?4 IS NULL THEN json_object('schema', ?3, 'defaults', json_object())
                    ELSE json_object('schema', ?3, 'defaults', json_object(?5, ?4)) END, 30, 1, ?6, ?6)
       ON CONFLICT (id) DO UPDATE SET
         description = CASE WHEN ?4 IS NULL
           THEN json_remove(${STORED_OR_EMPTY}, ?7)
           ELSE json_set(json_set(${STORED_OR_EMPTY}, '$.defaults', json(COALESCE(json_extract(${STORED_OR_EMPTY}, '$.defaults'), '{}'))), ?7, ?4) END,
         is_active = 1, updated_at = ?6`,
    )
    .bind(BILLING_RATES_LOOKUP_ID, BILLING_RATES_CATEGORY, BILLING_RATES_SCHEMA, classId, userId, now, path)
}
export const FIRM_ENTITY_ID = 'ent_krueger_richard_firm'

export class FirmUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`FIRM_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'FirmUnavailableError'
  }
}

/** A settings row as stored: its JSON text and when it last changed. */
export interface SettingsRow {
  description: string | null
  updatedAt: string | null
}

export interface FirmQueries {
  /** The profile row, or null when there is no active row. */
  profileRow(): Promise<SettingsRow | null>
  /** The employee policy row, or null when there is no active row. */
  policiesRow(): Promise<SettingsRow | null>
  /** Saves the profile JSON and the firm entity's legal name, with the audit row. */
  saveProfile(json: string, firmName: string, now: string, audit: AuditEntry): Promise<void>
  /** Saves the employee policy JSON, with the audit row. */
  savePolicies(json: string, now: string, audit: AuditEntry): Promise<void>
  /** The billing rates row (FB-0008), or null when there is none. */
  billingRatesRow(): Promise<SettingsRow | null>
  /** Saves the billing rate classes (only `$.classes`; the people's defaults are kept), with the audit row. */
  saveBillingRateClasses(classesJson: string, now: string, audit: AuditEntry): Promise<void>
}

export function createFirmQueries(db: D1Database): FirmQueries {
  async function row(id: string, category: string): Promise<SettingsRow | null> {
    try {
      // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
      const found = await db
        .prepare('SELECT description, updated_at, created_at FROM lookup WHERE id = ?1 AND category = ?2 AND is_active = 1 LIMIT 1')
        .bind(id, category)
        .first<{ description: string | null; updated_at: string | null; created_at: string | null }>()
      return found ? { description: found.description, updatedAt: found.updated_at ?? found.created_at ?? null } : null
    } catch (error) {
      throw new FirmUnavailableError(error)
    }
  }

  // An existing sort order is kept, as the old route kept it.
  const upsert = (id: string, category: string, value: string, label: string, sortOrder: number, json: string, now: string) =>
    db
      .prepare(
        `INSERT INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)
         ON CONFLICT (id) DO UPDATE SET category = excluded.category, value = excluded.value, label = excluded.label,
           description = excluded.description, is_active = 1, updated_at = excluded.updated_at`,
      )
      .bind(id, category, value, label, json, sortOrder, now)

  return {
    profileRow: () => row(FIRM_PROFILE_LOOKUP_ID, 'kr_firm_locations'),
    policiesRow: () => row(EMPLOYEE_POLICIES_LOOKUP_ID, 'kr_employee_policies'),

    async saveProfile(json, firmName, now, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO entity (id, legal_name, entity_subtype_legacy, entity_subtype, entity_status, boi_status, created_at, updated_at)
               VALUES (?1, ?2, 'partnership', 'partnership', 'active', 'unknown', ?3, ?3)
               ON CONFLICT (id) DO UPDATE SET legal_name = excluded.legal_name, updated_at = excluded.updated_at`,
            )
            .bind(FIRM_ENTITY_ID, firmName, now),
          // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
          upsert(FIRM_PROFILE_LOOKUP_ID, 'kr_firm_locations', 'firm_locations', 'Firm Locations', 10, json, now),
          auditStatement(db, audit),
        ])
      } catch (error) {
        throw new FirmUnavailableError(error)
      }
    },

    async billingRatesRow() {
      try {
        return await readBillingRatesRow(db)
      } catch (error) {
        throw new FirmUnavailableError(error)
      }
    },

    async saveBillingRateClasses(classesJson, now, audit) {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        await db.batch([
          db
            .prepare(
              `INSERT INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at)
               VALUES (?1, ?2, 'billing_rate_classes', 'Billing Rate Classes', json_object('schema', ?3, 'classes', json(?4), 'defaults', json_object()), 30, 1, ?5, ?5)
               ON CONFLICT (id) DO UPDATE SET description = json_set(${STORED_OR_EMPTY}, '$.schema', ?3, '$.classes', json(?4)), is_active = 1, updated_at = ?5`,
            )
            .bind(BILLING_RATES_LOOKUP_ID, BILLING_RATES_CATEGORY, BILLING_RATES_SCHEMA, classesJson, now),
          auditStatement(db, audit),
        ])
      } catch (error) {
        throw new FirmUnavailableError(error)
      }
    },

    async savePolicies(json, now, audit) {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        await db.batch([upsert(EMPLOYEE_POLICIES_LOOKUP_ID, 'kr_employee_policies', 'employee_policies', 'Employee Policies', 20, json, now), auditStatement(db, audit)])
      } catch (error) {
        throw new FirmUnavailableError(error)
      }
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function firmQueriesFor(env: { krhomebase?: D1Database } | undefined): FirmQueries | null {
  return env?.krhomebase ? createFirmQueries(env.krhomebase) : null
}
