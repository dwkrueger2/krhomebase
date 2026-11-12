// file: apps/api/src/features/preferences/queries.ts
/**
 * The only file of the preferences area that talks to D1 (`test/databaseAccess.test.ts` checks this). It reads and
 * writes the table `user_preference` (one row per person and preference key; migration
 * `docs/patch-notes/repository/Migration_Patch026_11_11_user_preference.sql`), and maps its snake_case columns to
 * camelCase.
 *
 * A save is one `db.batch`: the upsert of each changed key with its `audit_log` row (`auditStatement`), so a change
 * and its audit entry are saved together or not at all.
 *
 * When the table does not exist yet (the migration not applied), every call throws `PreferencesUnavailableError`, and
 * the routes answer 503 `PREFERENCES_UNAVAILABLE`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** One stored preference row. */
export interface PreferenceRow {
  key: string
  valueJson: string
  updatedAt: string
}

/** One key to save, with the audit entry that goes with it. */
export interface PreferenceWrite {
  key: string
  valueJson: string
  audit: AuditEntry
}

/** Thrown when the `user_preference` table cannot be read or written (missing table, database unreachable). */
export class PreferencesUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`PREFERENCES_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'PreferencesUnavailableError'
  }
}

export interface PreferenceQueries {
  /** Every stored preference of one person. */
  readAll(userId: string): Promise<PreferenceRow[]>
  /** Saves the given keys for one person (insert or replace), each with its audit row, in one batch. */
  saveAll(userId: string, writes: readonly PreferenceWrite[], now: string): Promise<void>
}

/** Builds the queries over one D1 database. */
export function createPreferenceQueries(db: D1Database): PreferenceQueries {
  return {
    async readAll(userId) {
      try {
        const result = await db
          .prepare('SELECT preference_key, value_json, updated_at FROM user_preference WHERE user_id = ?1')
          .bind(userId)
          .all<{ preference_key: string; value_json: string; updated_at: string }>()
        return (result.results ?? []).map((row) => ({ key: row.preference_key, valueJson: row.value_json, updatedAt: row.updated_at }))
      } catch (error) {
        throw new PreferencesUnavailableError(error)
      }
    },

    async saveAll(userId, writes, now) {
      if (!writes.length) return
      const statements = writes.flatMap((write) => [
        db
          .prepare(
            `INSERT INTO user_preference (user_id, preference_key, value_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT (user_id, preference_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
          )
          .bind(userId, write.key, write.valueJson, now),
        auditStatement(db, write.audit),
      ])
      try {
        await db.batch(statements)
      } catch (error) {
        throw new PreferencesUnavailableError(error)
      }
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function preferenceQueriesFor(env: { krhomebase?: D1Database } | undefined): PreferenceQueries | null {
  return env?.krhomebase ? createPreferenceQueries(env.krhomebase) : null
}
