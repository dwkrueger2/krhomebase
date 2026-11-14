// file: apps/api/src/features/homebase-feedback/queries.ts
/**
 * The only file of the Homebase Feedback area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables
 * (migration `docs/patch-notes/repository/Migration_Patch033_11_13_homebase_feedback.sql`, plan 12 section 4.1):
 *
 * - `homebase_feedback`: one row per request; `number` is UNIQUE (12 is FB-0012), so a save that loses a race for the
 *   next number answers false and the caller tries the next one.
 * - `homebase_feedback_marker`: the markers the text names, UNIQUE `(feedback_id, attribute, value)`.
 * - `homebase_feedback_image`: annotated screenshots (stage F3 writes them; read here so the reply shape is final).
 * - `homebase_feedback_note`: developer notes and status or priority changes.
 * - `user`, `individual`: the names of senders and note authors.
 *
 * Before the migration is applied every statement fails with "no such table: homebase_feedback..."; that becomes
 * `HomebaseFeedbackMigrationRequiredError` (503 `HOMEBASE_FEEDBACK_MIGRATION_REQUIRED`). Any other failure becomes
 * `HomebaseFeedbackUnavailableError` (503 `HOMEBASE_FEEDBACK_UNAVAILABLE`).
 *
 * Lists are newest first by `number` and paged by number (the cursor is the last number shown). Writes are one batch
 * with the `audit_log` row (resource `homebase-feedback`).
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class HomebaseFeedbackUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`HOMEBASE_FEEDBACK_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'HomebaseFeedbackUnavailableError'
  }
}

export class HomebaseFeedbackMigrationRequiredError extends Error {
  constructor(cause: unknown) {
    super(`HOMEBASE_FEEDBACK_MIGRATION_REQUIRED: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'HomebaseFeedbackMigrationRequiredError'
  }
}

/** The error for a failed statement: a missing feedback table means the migration is not applied yet. */
function failureFor(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table:\s*(main\.)?homebase_feedback/i.test(message) ? new HomebaseFeedbackMigrationRequiredError(error) : new HomebaseFeedbackUnavailableError(error)
}

/** One `homebase_feedback` row with the sender's name parts and the marker and note counts. */
export interface FeedbackRow {
  id: string
  number: number
  kind: string
  title: string
  body: string
  status: string
  priority: string
  submitted_by_user_id: string
  submitter_role: string | null
  page_address: string | null
  section_id: string | null
  open_item: string | null
  page_title: string | null
  web_version: string | null
  deployment_id: string | null
  deployment_time: string | null
  window_width: number | null
  window_height: number | null
  theme: string | null
  created_at: string
  updated_at: string | null
  submitter_email: string | null
  submitter_preferred_name: string | null
  submitter_first_name: string | null
  submitter_last_name: string | null
  marker_count: number
  note_count: number
}

export interface MarkerRow {
  attribute: string
  value: string
  found_at_capture: number
  box_json: string | null
}

export interface ImageRow {
  id: string
  r2_key: string
  content_type: string
  byte_size: number
  width: number | null
  height: number | null
  created_at: string
}

export interface NoteRow {
  id: string
  note_type: string
  body: string | null
  from_value: string | null
  to_value: string | null
  author_user_id: string
  created_at: string
  author_email: string | null
  author_preferred_name: string | null
  author_first_name: string | null
  author_last_name: string | null
}

export interface FeedbackListFilter {
  /** Only this sender's requests (My requests). */
  submittedByUserId?: string
  statuses?: string[]
  kind?: string
}

/** A new request, its markers and the captured page. */
export interface FeedbackInsert {
  id: string
  number: number
  kind: string
  title: string
  body: string
  submittedByUserId: string
  submitterRole: string | null
  pageAddress: string | null
  sectionId: string | null
  openItem: string | null
  pageTitle: string | null
  webVersion: string | null
  deploymentId: string | null
  deploymentTime: string | null
  windowWidth: number | null
  windowHeight: number | null
  theme: string | null
  now: string
  markers: Array<{ id: string; attribute: string; value: string; found: boolean; boxJson: string | null; sortOrder: number }>
}

/** A developer's change: the new values and the note rows that record it. */
export interface FeedbackChange {
  feedbackId: string
  status: string
  priority: string
  now: string
  notes: Array<{ id: string; noteType: string; body: string | null; fromValue: string | null; toValue: string | null; authorUserId: string }>
}

export interface HomebaseFeedbackQueries {
  /** The highest number used so far (0 when there is none). */
  highestNumber(): Promise<number>
  /** Up to `limit + 1` requests with a number below `beforeNumber` (all when null), newest first. */
  list(filter: FeedbackListFilter, beforeNumber: number | null, limit: number): Promise<FeedbackRow[]>
  byNumber(number: number): Promise<FeedbackRow | null>
  markers(feedbackId: string): Promise<MarkerRow[]>
  images(feedbackId: string): Promise<ImageRow[]>
  notes(feedbackId: string): Promise<NoteRow[]>
  /** Saves a request with its markers; false when its number was taken in between. */
  insert(row: FeedbackInsert, audit: AuditEntry): Promise<boolean>
  /** Saves a status or priority change and its note rows. */
  change(change: FeedbackChange, audit: AuditEntry): Promise<void>
}

const NAME_PARTS = (alias: string, prefix: string) =>
  `${alias}u.email AS ${prefix}_email, ${alias}i.preferred_name AS ${prefix}_preferred_name, ${alias}i.first_name AS ${prefix}_first_name, ${alias}i.last_name AS ${prefix}_last_name`

const FEEDBACK_SELECT = `SELECT f.id, f.number, f.kind, f.title, f.body, f.status, f.priority, f.submitted_by_user_id, f.submitter_role,
       f.page_address, f.section_id, f.open_item, f.page_title, f.web_version, f.deployment_id, f.deployment_time,
       f.window_width, f.window_height, f.theme, f.created_at, f.updated_at,
       ${NAME_PARTS('s', 'submitter')},
       (SELECT COUNT(*) FROM homebase_feedback_marker m WHERE m.feedback_id = f.id) AS marker_count,
       (SELECT COUNT(*) FROM homebase_feedback_note n WHERE n.feedback_id = f.id) AS note_count
  FROM homebase_feedback f
  LEFT JOIN user su ON su.id = f.submitted_by_user_id
  LEFT JOIN individual si ON si.id = su.individual_id`

export function createHomebaseFeedbackQueries(db: D1Database): HomebaseFeedbackQueries {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      throw failureFor(error)
    }
  }

  return {
    highestNumber: () =>
      run(async () => Number((await db.prepare('SELECT COALESCE(MAX(number), 0) AS highest FROM homebase_feedback').first<{ highest: number }>())?.highest ?? 0)),

    list: (filter, beforeNumber, limit) =>
      run(async () => {
        const where: string[] = ['1 = 1']
        const values: Array<string | number> = []
        const bind = (value: string | number) => {
          values.push(value)
          return `?${values.length}`
        }
        if (filter.submittedByUserId) where.push(`f.submitted_by_user_id = ${bind(filter.submittedByUserId)}`)
        if (filter.statuses?.length) where.push(`f.status IN (SELECT value FROM json_each(${bind(JSON.stringify(filter.statuses))}))`)
        if (filter.kind) where.push(`f.kind = ${bind(filter.kind)}`)
        if (beforeNumber !== null) where.push(`f.number < ${bind(beforeNumber)}`)
        const sql = `${FEEDBACK_SELECT} WHERE ${where.join(' AND ')} ORDER BY f.number DESC LIMIT ${bind(limit + 1)}`
        return (await db.prepare(sql).bind(...values).all<FeedbackRow>()).results ?? []
      }),

    byNumber: (number) => run(() => db.prepare(`${FEEDBACK_SELECT} WHERE f.number = ?1 LIMIT 1`).bind(number).first<FeedbackRow>()),

    markers: (feedbackId) =>
      run(async () => {
        const sql = 'SELECT attribute, value, found_at_capture, box_json FROM homebase_feedback_marker WHERE feedback_id = ?1 ORDER BY sort_order, id'
        return (await db.prepare(sql).bind(feedbackId).all<MarkerRow>()).results ?? []
      }),

    images: (feedbackId) =>
      run(async () => {
        const sql = 'SELECT id, r2_key, content_type, byte_size, width, height, created_at FROM homebase_feedback_image WHERE feedback_id = ?1 ORDER BY created_at, id'
        return (await db.prepare(sql).bind(feedbackId).all<ImageRow>()).results ?? []
      }),

    notes: (feedbackId) =>
      run(async () => {
        const sql = `SELECT n.id, n.note_type, n.body, n.from_value, n.to_value, n.author_user_id, n.created_at, ${NAME_PARTS('a', 'author')}
                       FROM homebase_feedback_note n
                       LEFT JOIN user au ON au.id = n.author_user_id
                       LEFT JOIN individual ai ON ai.id = au.individual_id
                      WHERE n.feedback_id = ?1
                      ORDER BY n.created_at, n.rowid`
        return (await db.prepare(sql).bind(feedbackId).all<NoteRow>()).results ?? []
      }),

    async insert(row, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO homebase_feedback (id, number, kind, title, body, status, priority, submitted_by_user_id, submitter_role,
                 page_address, section_id, open_item, page_title, web_version, deployment_id, deployment_time,
                 window_width, window_height, theme, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, 'new', 'normal', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, NULL)`,
            )
            .bind(
              row.id,
              row.number,
              row.kind,
              row.title,
              row.body,
              row.submittedByUserId,
              row.submitterRole,
              row.pageAddress,
              row.sectionId,
              row.openItem,
              row.pageTitle,
              row.webVersion,
              row.deploymentId,
              row.deploymentTime,
              row.windowWidth,
              row.windowHeight,
              row.theme,
              row.now,
            ),
          // Every marker in one statement (D1 allows at most 100 bound values), from one JSON value.
          db
            .prepare(
              `INSERT INTO homebase_feedback_marker (id, feedback_id, attribute, value, found_at_capture, box_json, sort_order, created_at)
               SELECT json_extract(e.value, '$.id'), ?1, json_extract(e.value, '$.attribute'), json_extract(e.value, '$.value'),
                      json_extract(e.value, '$.found'), json_extract(e.value, '$.boxJson'), json_extract(e.value, '$.sortOrder'), ?3
                 FROM json_each(?2) e`,
            )
            .bind(row.id, JSON.stringify(row.markers.map((marker) => ({ ...marker, found: marker.found ? 1 : 0 }))), row.now),
          auditStatement(db, audit),
        ])
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/UNIQUE constraint failed: homebase_feedback\.number\b/i.test(message)) return false
        throw failureFor(error)
      }
    },

    async change(change, audit) {
      await run(() =>
        db.batch([
          db.prepare('UPDATE homebase_feedback SET status = ?2, priority = ?3, updated_at = ?4 WHERE id = ?1').bind(change.feedbackId, change.status, change.priority, change.now),
          ...change.notes.map((note) =>
            db
              .prepare(
                `INSERT INTO homebase_feedback_note (id, feedback_id, note_type, body, from_value, to_value, author_user_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
              )
              .bind(note.id, change.feedbackId, note.noteType, note.body, note.fromValue, note.toValue, note.authorUserId, change.now),
          ),
          auditStatement(db, audit),
        ]),
      )
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function homebaseFeedbackQueriesFor(env: { krhomebase?: D1Database } | undefined): HomebaseFeedbackQueries | null {
  return env?.krhomebase ? createHomebaseFeedbackQueries(env.krhomebase) : null
}
