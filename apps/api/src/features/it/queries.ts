// file: apps/api/src/features/it/queries.ts
/**
 * The only file of the IT area that talks to D1 (binding `krhomebase`). Everything here reads; nothing is written.
 *
 *  - `readMigrations`: the migration log `kr_schema_migration` (migration 044; `AGENTS_06`, "The migration log").
 *  - `readSchemaObjects`: the names of the database's tables and the number of its indexes and views, from
 *    `sqlite_schema`.
 *  - `countRows`: `COUNT(*)` for every table.
 *
 * What D1 allows (checked read-only against the live database on Nov 18, 2026):
 *  - The size of the whole database comes back with every query as `meta.size_after` (bytes).
 *  - `PRAGMA page_count` is refused (`SQLITE_AUTH`) and the `dbstat` table does not exist, so a table's size in
 *    bytes cannot be read. Row counts are the per-table measure.
 *  - A compound SELECT (`UNION ALL`) is limited to a few terms, so the counts are scalar subqueries, 40 tables to a
 *    statement, sent as one batch (136 tables: four statements, about 12,000 rows read).
 *
 * Table names in `countRows` are the one place SQL is put together from values: a table name cannot be a bound
 * value. The names come only from this database's own `sqlite_schema` (never from a request), each must match
 * `TABLE_NAME` (letters, digits and underscores), and each is written in double quotes. A name that does not match
 * is not counted and is returned in `skipped`.
 *
 * Cloudflare's own tables (`_cf_KV`, `AGENTS_06`) and SQLite's (`sqlite_*`) are left out of the counts.
 */

/** One row of the migration log, as stored. */
export interface MigrationLogRow {
  id: string
  file_name: string
  applied_at: string | null
  recorded_at: string | null
  applied_by: string | null
  summary: string | null
}

/** The database's tables, indexes and views. */
export interface SchemaObjects {
  /** The firm's tables, by name. */
  tables: string[]
  indexCount: number
  viewCount: number
  /** The size of the database in bytes (`meta.size_after`), or null when D1 did not report it. */
  sizeBytes: number | null
}

/** The row counts of the tables asked for. */
export interface RowCounts {
  counts: { name: string; rows: number }[]
  /** Tables left out because their name is not plain letters, digits and underscores. */
  skipped: string[]
  /** The size of the database in bytes (`meta.size_after`), or null when D1 did not report it. */
  sizeBytes: number | null
}

/** Tables counted in one statement. D1 allowed 46 scalar subqueries in a statement; 40 leaves room. */
export const COUNT_CHUNK = 40

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
/** Cloudflare's and SQLite's own tables: not part of the firm's schema. */
const isInternalTable = (name: string) => /^(_cf_|sqlite_)/i.test(name)
const isMissingTable = (error: unknown) => /no such table|does not exist/i.test(error instanceof Error ? error.message : String(error))
const sizeOf = (meta: unknown): number | null => {
  const size = (meta as { size_after?: unknown } | null | undefined)?.size_after
  return typeof size === 'number' && Number.isFinite(size) ? size : null
}

export interface ItQueries {
  /** The migration log by id, or null when the table does not exist (a database before migration 044). */
  readMigrations(): Promise<MigrationLogRow[] | null>
  /** The table names (without Cloudflare's and SQLite's own), the index and view counts, and the database size. */
  readSchemaObjects(): Promise<SchemaObjects>
  /**
   * Counts the rows of each table.
   *
   * @param tables - Table names read from `readSchemaObjects`.
   */
  countRows(tables: readonly string[]): Promise<RowCounts>
}

export function createItQueries(db: D1Database): ItQueries {
  return {
    async readMigrations() {
      try {
        const { results } = await db.prepare('SELECT id, file_name, applied_at, recorded_at, applied_by, summary FROM kr_schema_migration ORDER BY id').all<MigrationLogRow>()
        return results ?? []
      } catch (error) {
        if (isMissingTable(error)) return null
        throw error
      }
    },

    async readSchemaObjects() {
      const { results, meta } = await db.prepare("SELECT type, name FROM sqlite_schema WHERE type IN ('table', 'index', 'view') ORDER BY name").all<{ type: string; name: string }>()
      const rows = results ?? []
      return {
        tables: rows.filter((row) => row.type === 'table' && !isInternalTable(row.name)).map((row) => row.name),
        indexCount: rows.filter((row) => row.type === 'index').length,
        viewCount: rows.filter((row) => row.type === 'view').length,
        sizeBytes: sizeOf(meta),
      }
    },

    async countRows(tables) {
      const countable = tables.filter((name) => TABLE_NAME.test(name))
      const skipped = tables.filter((name) => !TABLE_NAME.test(name))
      if (countable.length === 0) return { counts: [], skipped, sizeBytes: null }
      const statements: D1PreparedStatement[] = []
      for (let start = 0; start < countable.length; start += COUNT_CHUNK) {
        // Scalar subqueries: one result row whose columns are the table names (see the header on why not UNION ALL).
        const columns = countable.slice(start, start + COUNT_CHUNK).map((name) => `(SELECT COUNT(*) FROM "${name}") AS "${name}"`)
        statements.push(db.prepare(`SELECT ${columns.join(', ')}`))
      }
      const replies = await db.batch<Record<string, number>>(statements)
      const counts: { name: string; rows: number }[] = []
      let sizeBytes: number | null = null
      for (const reply of replies) {
        sizeBytes = sizeOf(reply.meta) ?? sizeBytes
        for (const [name, rows] of Object.entries(reply.results?.[0] ?? {})) counts.push({ name, rows: Number(rows) || 0 })
      }
      return { counts, skipped, sizeBytes }
    },
  }
}

export function itQueriesFor(env: { krhomebase?: D1Database } | undefined): ItQueries | null {
  return env?.krhomebase ? createItQueries(env.krhomebase) : null
}
