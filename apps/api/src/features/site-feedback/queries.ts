// file: apps/api/src/features/site-feedback/queries.ts
/**
 * The only file of the site feedback area that reaches stored data (`test/databaseAccess.test.ts` checks the D1 side).
 *
 * - **Feedback rows** live in table `site_feedback` of the quarantined public inquiry database, reached only through
 *   the public inquiry CRUD Worker (`platform/publicInquiryClient.ts`, binding `PUBLIC_INQUIRY_WORKER`). Columns are
 *   named in `docs/Schema_Public_Inquiry_v2.0`; the Worker's own list of allowed columns is
 *   `workers/d1-workers/shared/pub-inquiry-table-registry.ts`.
 * - **The audit row** of each change is written to this API's own `audit_log` in `krhomebase` after the Worker has
 *   answered (the two databases cannot share one batch). The Worker keeps no audit table.
 *
 * A missing binding or key, or any Worker failure, answers `SiteFeedbackUnavailableError`; the Worker's error text
 * is logged by the route, never sent to the browser.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'
import { callPublicInquiryWorker, publicInquiryConfigFrom, type PublicInquiryBindings, type PublicInquiryClientConfig, type PublicInquiryCommand } from '../../platform/publicInquiryClient.ts'

export class SiteFeedbackUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`SITE_FEEDBACK_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'SiteFeedbackUnavailableError'
  }
}

/** One `site_feedback` row as the Worker returns it (only the columns this area reads are named). */
export interface SiteFeedbackRow {
  id: string
  submitted_at?: string | null
  app_context?: string | null
  feedback_type?: string | null
  severity?: string | null
  message?: string | null
  visitor_email?: string | null
  route_path?: string | null
  page_url?: string | null
  component_kr_id?: string | null
  created_by_email?: string | null
  review_status?: string | null
  reviewed_by_user_id?: string | null
  reviewed_at?: string | null
  internal_notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface SiteFeedbackQueries {
  /** The newest rows (at most `limit`, up to 100), filtered by exact column values. */
  search(where: Record<string, string>, limit: number, requestId: string): Promise<SiteFeedbackRow[]>
  /** One row, or null. */
  read(feedbackId: string, requestId: string): Promise<SiteFeedbackRow | null>
  /** Changes columns of one row (only the Worker's `updateColumns`). */
  update(feedbackId: string, data: Record<string, unknown>, requestId: string): Promise<void>
  /** Deletes one row for good. */
  remove(feedbackId: string, requestId: string): Promise<void>
  /** Writes one `audit_log` row in `krhomebase`; a failure is logged, never thrown (the change already happened). */
  audit(entry: AuditEntry): Promise<void>
}

export function createSiteFeedbackQueries(config: PublicInquiryClientConfig, db: D1Database | undefined): SiteFeedbackQueries {
  async function call(command: Omit<PublicInquiryCommand, 'table' | 'audit'>) {
    try {
      return await callPublicInquiryWorker(config, { ...command, table: 'site_feedback', audit: { requestSource: 'krhomebase-site-feedback-api' } })
    } catch (error) {
      throw new SiteFeedbackUnavailableError(error)
    }
  }

  return {
    async search(where, limit, requestId) {
      const reply = await call({ requestId, action: 'SEARCH', where: Object.keys(where).length ? where : undefined, limit })
      return (reply.rows ?? []) as unknown as SiteFeedbackRow[]
    },
    async read(feedbackId, requestId) {
      const reply = await call({ requestId, action: 'READ', targetId: feedbackId })
      return (reply.row ?? null) as unknown as SiteFeedbackRow | null
    },
    async update(feedbackId, data, requestId) {
      await call({ requestId, action: 'UPDATE', targetId: feedbackId, data })
    },
    async remove(feedbackId, requestId) {
      await call({ requestId, action: 'DELETE', targetId: feedbackId })
    },
    async audit(entry) {
      if (!db) return
      try {
        await auditStatement(db, entry).run()
      } catch (error) {
        console.error(JSON.stringify({ requestId: entry.requestId, area: 'SITE_FEEDBACK', message: `audit row not written: ${error instanceof Error ? error.message : String(error)}` }))
      }
    },
  }
}

/** The queries for this request, or null when the Worker binding or a key is missing. */
export function siteFeedbackQueriesFor(env: (PublicInquiryBindings & { krhomebase?: D1Database }) | undefined): SiteFeedbackQueries | null {
  const config = publicInquiryConfigFrom(env)
  return config ? createSiteFeedbackQueries(config, env?.krhomebase) : null
}
