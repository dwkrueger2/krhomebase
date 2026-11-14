// file: apps/api/test/fakes.ts
/**
 * Stand-ins for the things outside this Worker, shared by the tests:
 *
 *  - `fakeSessionWorker(role)`: a Session Worker that accepts any cookie and returns a made-up person with
 *    the given role. Use it with `signedInEnv` and the `cookie` header from `SIGNED_IN_HEADERS`.
 *  - `createTestD1()`: a D1 database kept in memory, built on Node's own SQLite (`node:sqlite`, Node 22.13 or
 *    later). It runs the real migration file, so the tests check the SQL the requester will apply. With
 *    `{ fullSchema: true }` it also builds the whole Schema 8.0, so contact and permission queries run
 *    against the real tables.
 *
 * Only made-up people and values are used. No rows from `snapshots\` or the live databases.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))

/** The whole KR Homebase schema (124 tables), as D1 reports it. Read from the repository's schema folder. */
export const SCHEMA_8_0 = join(here, '..', '..', '..', 'docs', 'Schema_8.0', 'schema_d1_v8_0.sql')

/** The migration that creates the outside-tool tables. */
export const WORKSPACE_TOOLS_MIGRATION = join(here, '..', '..', '..', 'docs', 'patch-notes', 'repository', 'Migration_Patch016_11_09_workspace_tools.sql')
/** The user preference table (Settings plan, decision 1). It refers to `user`, so it is added only with the full schema. */
export const USER_PREFERENCE_MIGRATION = join(here, '..', '..', '..', 'docs', 'patch-notes', 'repository', 'Migration_Patch026_11_11_user_preference.sql')
/** The image license columns of `content_asset` (Front End Publishing, D25). Added only with the full schema. */
export const CONTENT_ASSET_LICENSE_MIGRATION = join(here, '..', '..', '..', 'docs', 'patch-notes', 'repository', 'Migration_Patch031_11_13_content_asset_license.sql')

/** Headers that make the sign-in middleware ask the Session Worker. */
export const SIGNED_IN_HEADERS = { cookie: 'kr_session=test-session-token' } as const

/** A Session Worker stand-in that answers "valid" with a made-up person of the given role. */
export function fakeSessionWorker(role: string, userId = 'user-test-1'): Fetcher {
  return {
    fetch: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            valid: true,
            session: {
              sessionId: `session-${role}`,
              userId,
              displayName: 'Test Person',
              email: 'test.person@example.com',
              role,
              firmName: 'Test Firm',
              avatarInitials: 'TP',
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              mfaVerified: true,
            },
          },
        }),
      ),
  } as unknown as Fetcher
}

/** Bindings for a signed-in call as `role`. Add `krhomebase` for routes that need the database. */
export function signedInEnv(role: string, extra: Record<string, unknown> = {}, userId = 'user-test-1') {
  return { SESSION_WORKER: fakeSessionWorker(role, userId), KR_SESSION_WORKER_SECRET: 'session-secret', ...extra } as unknown as Env
}

type Value = string | number | null

/** A prepared statement with D1's `bind`, `first`, `all` and `run`. */
class TestStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: Value[] = [],
  ) {}

  bind(...values: Value[]) {
    return new TestStatement(this.db, this.sql, values)
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.values) ?? null) as T | null
  }

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[], success: true, meta: {} }
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.values)
    return { success: true, meta: { changes: Number(info.changes) }, results: [] }
  }

  /** What D1's batch returns for this statement: rows for a read, a change count for a write. */
  async forBatch() {
    return /^\s*(SELECT|WITH)\b/i.test(this.sql) ? this.all() : this.run()
  }
}

/**
 * Makes an in-memory D1 database with the outside-tool tables, from the real migration file. With
 * `{ fullSchema: true }` it first builds every table of `docs/Schema_8.0/schema_d1_v8_0.sql`, then the
 * `user_preference` table and the `content_asset` license columns from their migration files. Pass
 * `withoutLicenseMigration: true` to leave the license columns out (a database before migration 031).
 *
 * @returns `db` (pass it as the `krhomebase` binding) and `sqlite` (to look at rows directly in a test).
 */
export function createTestD1(options: { fullSchema?: boolean; withoutLicenseMigration?: boolean } = {}) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  // fullSchema: every table of Schema 8.0, for areas that read the firm's records (contacts, permissions).
  if (options.fullSchema) sqlite.exec(readFileSync(SCHEMA_8_0, 'utf8'))
  if (options.fullSchema) sqlite.exec(readFileSync(USER_PREFERENCE_MIGRATION, 'utf8'))
  if (options.fullSchema && !options.withoutLicenseMigration) sqlite.exec(readFileSync(CONTENT_ASSET_LICENSE_MIGRATION, 'utf8'))
  sqlite.exec(readFileSync(WORKSPACE_TOOLS_MIGRATION, 'utf8'))
  const db = {
    prepare: (sql: string) => new TestStatement(sqlite, sql),
    batch: async (statements: TestStatement[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.forBatch())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { db: db as unknown as D1Database, sqlite }
}
