// file: apps/api/src/features/themes/queries.ts
/**
 * The only file of the themes area that talks to D1 (`test/databaseAccess.test.ts` checks this). Firm themes are
 * settings rows of the `lookup` table (Settings plan, decision T3):
 *
 * // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
 *
 * - Category `kr_homebase_theme`: one active row per firm theme; `value` is the theme id, `label` its name, and
 *   `description` the theme JSON (the old editor's shape or the new versioned shape; `rules.ts` reads both).
 * - Category `kr_homebase_theme_default`: at most one row; its `value` is the id of the firm default theme
 *   (written by the stage 4 editor; absent until then, which means the built-in theme).
 *
 * Writes (stage 4a, super admin): a new theme row, a changed theme (name and JSON), a retired theme (`is_active = 0`;
 * rows are never deleted), and the firm default row (inserted or changed in place). Each write runs in one batch with
 * its `audit_log` row. A missing table answers `ThemesUnavailableError`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** Category of the firm theme rows in `lookup`. */
export const THEME_LOOKUP_CATEGORY = 'kr_homebase_theme'
/** Category of the row naming the firm default theme. */
export const THEME_DEFAULT_LOOKUP_CATEGORY = 'kr_homebase_theme_default'

/** One stored firm theme row. */
export interface ThemeRow {
  value: string
  label: string
  description: string | null
}

export class ThemesUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`THEMES_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ThemesUnavailableError'
  }
}

/** Fixed id of the firm default row. */
export const THEME_DEFAULT_LOOKUP_ID = 'lk_kr_homebase_theme_default'

/** The `lookup` row id for a theme id (`lk_kr_homebase_theme_<id with _>`, the old editor's rule). */
export function themeLookupId(themeId: string): string {
  return `lk_kr_homebase_theme_${themeId.replace(/-/g, '_')}`
}

export interface ThemeQueries {
  /** Active firm theme rows, by sort order then name. */
  themeRows(): Promise<ThemeRow[]>
  /** The firm default theme id, or null when none is set. */
  firmDefaultThemeId(): Promise<string | null>
  /** True when an active theme row has this id. */
  themeExists(themeId: string): Promise<boolean>
  /** Inserts a new theme row with its audit row. */
  insertTheme(row: { themeId: string; name: string; json: string; now: string }, audit: AuditEntry): Promise<void>
  /** Changes a theme row's name and JSON, with its audit row. */
  updateTheme(row: { themeId: string; name: string; json: string; now: string }, audit: AuditEntry): Promise<void>
  /** Retires a theme row (`is_active = 0`), with its audit row. */
  retireTheme(themeId: string, now: string, audit: AuditEntry): Promise<void>
  /** Sets the firm default to a theme id, or (null) switches the default row off; with its audit row. */
  setFirmDefault(themeId: string | null, now: string, audit: AuditEntry): Promise<void>
}

export function createThemeQueries(db: D1Database): ThemeQueries {
  /** Runs one write and its audit row together. */
  async function write(statement: D1PreparedStatement, audit: AuditEntry): Promise<void> {
    try {
      await db.batch([statement, auditStatement(db, audit)])
    } catch (error) {
      throw new ThemesUnavailableError(error)
    }
  }

  return {
    async themeRows() {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        const result = await db
          .prepare('SELECT value, label, description FROM lookup WHERE category = ?1 AND is_active = 1 ORDER BY sort_order, label')
          .bind(THEME_LOOKUP_CATEGORY)
          .all<ThemeRow>()
        return result.results ?? []
      } catch (error) {
        throw new ThemesUnavailableError(error)
      }
    },

    async firmDefaultThemeId() {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        const row = await db
          .prepare('SELECT value FROM lookup WHERE category = ?1 AND is_active = 1 ORDER BY sort_order LIMIT 1')
          .bind(THEME_DEFAULT_LOOKUP_CATEGORY)
          .first<{ value: string }>()
        return row?.value ?? null
      } catch (error) {
        throw new ThemesUnavailableError(error)
      }
    },

    async themeExists(themeId) {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        const row = await db.prepare('SELECT 1 AS found FROM lookup WHERE category = ?1 AND value = ?2 AND is_active = 1 LIMIT 1').bind(THEME_LOOKUP_CATEGORY, themeId).first<{ found: number }>()
        return Boolean(row)
      } catch (error) {
        throw new ThemesUnavailableError(error)
      }
    },

    async insertTheme(row, audit) {
      // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
      await write(
        db
          .prepare("INSERT INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 100, 1, ?6, ?6)")
          .bind(themeLookupId(row.themeId), THEME_LOOKUP_CATEGORY, row.themeId, row.name, row.json, row.now),
        audit,
      )
    },

    async updateTheme(row, audit) {
      // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
      await write(
        db.prepare('UPDATE lookup SET label = ?3, description = ?4, updated_at = ?5 WHERE category = ?1 AND value = ?2 AND is_active = 1').bind(THEME_LOOKUP_CATEGORY, row.themeId, row.name, row.json, row.now),
        audit,
      )
    },

    async retireTheme(themeId, now, audit) {
      // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
      await write(db.prepare('UPDATE lookup SET is_active = 0, updated_at = ?3 WHERE category = ?1 AND value = ?2 AND is_active = 1').bind(THEME_LOOKUP_CATEGORY, themeId, now), audit)
    },

    async setFirmDefault(themeId, now, audit) {
      // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
      // One row, changed in place: the chosen id in `value`, or switched off (`is_active = 0`) for the built-in theme.
      await write(
        db
          .prepare(
            `INSERT INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'Firm default theme', NULL, 0, ?4, ?5, ?5)
             ON CONFLICT (id) DO UPDATE SET value = CASE WHEN excluded.is_active = 1 THEN excluded.value ELSE lookup.value END, is_active = excluded.is_active, updated_at = excluded.updated_at`,
          )
          .bind(THEME_DEFAULT_LOOKUP_ID, THEME_DEFAULT_LOOKUP_CATEGORY, themeId ?? 'none', themeId ? 1 : 0, now),
        audit,
      )
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function themeQueriesFor(env: { krhomebase?: D1Database } | undefined): ThemeQueries | null {
  return env?.krhomebase ? createThemeQueries(env.krhomebase) : null
}
