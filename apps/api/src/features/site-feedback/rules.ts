// file: apps/api/src/features/site-feedback/rules.ts
/**
 * Web Site Feedback review (Settings plan, stage 4e). Ported from the old `kr-api-v1/site-feedback/route.ts`:
 *
 * - **Assignee and votes** have no columns in `site_feedback`, so, as before, they are JSON after the marker line
 *   `--- KRH_FEEDBACK_REVIEW_META ---` at the end of `internal_notes` (`parseReviewNotes`, `composeReviewNotes`).
 *   The same marker is kept so rows written by the old app read the same.
 * - **A review change** sets `reviewed_at`, `reviewed_by_user_id` and `updated_at`; only the fields sent change.
 * - **A vote** adds one; anyone but a super admin may vote once per row (their user id is kept in the JSON).
 *
 * Changed from the old route:
 * - Bulk update and bulk delete report the ids that were not found instead of counting them as done.
 * - Each change writes an `audit_log` row in `krhomebase` (resource `site-feedback`); the old route wrote none.
 * - With empty notes, the old app stored the marker at the very start and then could not read its own votes or
 *   assignee back; the reader now finds the marker there too (`MARKER_PATTERN`).
 * - The list never carries the bot-check and network columns (`ip_hash`, `user_agent` and the like).
 */

import type { SiteFeedbackBulkUpdateBody, SiteFeedbackCountData, SiteFeedbackData, SiteFeedbackItem, SiteFeedbackQuery, SiteFeedbackReviewBody, SiteFeedbackVoteData } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { SiteFeedbackQueries, SiteFeedbackRow } from './queries.ts'

/** The marker between the visible notes and the review JSON, as the old app wrote it. */
export const REVIEW_META_MARKER = '\n\n--- KRH_FEEDBACK_REVIEW_META ---\n'

/** The Worker returns at most 100 rows per search. */
export const SITE_FEEDBACK_LIST_LIMIT = 100

/** A refused feedback change. */
export class SiteFeedbackError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404,
  ) {
    super(message)
    this.name = 'SiteFeedbackError'
  }
}

/** The person making a change, from the session. */
export interface SiteFeedbackActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

interface ReviewMeta {
  assignedTo?: string
  voteCount?: number
  voterIds?: string[]
}

/**
 * The marker as it is found: after the notes, or at the very start when the notes were empty (the old app's compose
 * trimmed the whole text, so the marker's blank lines were lost and its own reader then missed the votes; fixed here).
 */
const MARKER_PATTERN = /(?:^|\n\n)--- KRH_FEEDBACK_REVIEW_META ---\n/

/** Splits `internal_notes` into the visible notes and the review JSON. */
export function parseReviewNotes(raw: unknown): { notes: string; meta: ReviewMeta } {
  const text = typeof raw === 'string' ? raw : ''
  const match = MARKER_PATTERN.exec(text)
  if (!match) return { notes: text.trim(), meta: {} }
  const notes = text.slice(0, match.index).trim()
  try {
    const parsed = JSON.parse(text.slice(match.index + match[0].length).trim()) as ReviewMeta
    return {
      notes,
      meta: {
        assignedTo: typeof parsed.assignedTo === 'string' ? parsed.assignedTo : undefined,
        voteCount: Number.isFinite(Number(parsed.voteCount)) ? Number(parsed.voteCount) : 0,
        voterIds: Array.isArray(parsed.voterIds) ? parsed.voterIds.map(String) : [],
      },
    }
  } catch {
    return { notes: text.trim(), meta: {} }
  }
}

/** Joins visible notes and the review JSON back into `internal_notes`. */
export function composeReviewNotes(notes: string, meta: ReviewMeta): string {
  const clean: ReviewMeta = {
    assignedTo: meta.assignedTo?.trim() || undefined,
    voteCount: Math.max(0, Number(meta.voteCount ?? 0)),
    voterIds: Array.from(new Set(meta.voterIds ?? [])).slice(0, 500),
  }
  return `${notes.trim()}${REVIEW_META_MARKER}${JSON.stringify(clean)}`.trim()
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value))

/** One stored row as the screen sees it. */
export function feedbackItem(row: SiteFeedbackRow): SiteFeedbackItem {
  const { notes, meta } = parseReviewNotes(row.internal_notes)
  return {
    id: text(row.id),
    submittedAt: text(row.submitted_at ?? row.created_at),
    appContext: text(row.app_context),
    classification: text(row.feedback_type) || 'general',
    priority: text(row.severity) || 'normal',
    status: text(row.review_status) || 'new',
    message: text(row.message),
    visitorEmail: text(row.visitor_email),
    routePath: text(row.route_path),
    pageUrl: text(row.page_url),
    componentKrId: text(row.component_kr_id),
    createdByEmail: text(row.created_by_email),
    reviewedByUserId: text(row.reviewed_by_user_id),
    reviewedAt: text(row.reviewed_at),
    assignedTo: meta.assignedTo ?? '',
    notes,
    voteCount: meta.voteCount ?? 0,
    updatedAt: text(row.updated_at),
  }
}

/** The newest feedback, filtered by status and app context. */
export async function listFeedback(queries: SiteFeedbackQueries, query: SiteFeedbackQuery, requestId: string): Promise<SiteFeedbackData> {
  const where: Record<string, string> = {}
  if (query.status) where.review_status = query.status
  if (query.appContext) where.app_context = query.appContext
  const rows = await queries.search(where, SITE_FEEDBACK_LIST_LIMIT, requestId)
  return { feedback: rows.map(feedbackItem), limitReached: rows.length >= SITE_FEEDBACK_LIST_LIMIT }
}

/** The columns a review change writes (the Worker allows only these). */
function reviewData(existing: SiteFeedbackRow, body: SiteFeedbackReviewBody, reviewerUserId: string, now: string): Record<string, unknown> {
  const data: Record<string, unknown> = { reviewed_at: now, reviewed_by_user_id: reviewerUserId, updated_at: now }
  if (body.classification) data.feedback_type = body.classification
  if (body.priority) data.severity = body.priority
  if (body.status) data.review_status = body.status
  if (body.assignedTo !== undefined || body.notes !== undefined) {
    const parsed = parseReviewNotes(existing.internal_notes)
    data.internal_notes = composeReviewNotes(body.notes ?? parsed.notes, { ...parsed.meta, assignedTo: body.assignedTo ?? parsed.meta.assignedTo })
  }
  return data
}

const audit = (actor: SiteFeedbackActor, action: string, targetId: string, newJson?: unknown): AuditEntry => ({
  requestId: actor.requestId,
  actorUserId: actor.userId,
  actorEmail: actor.email,
  actorRole: actor.role,
  resource: 'site-feedback',
  action,
  targetTable: 'site_feedback',
  targetId,
  newJson,
})

const notFound = () => new SiteFeedbackError('SITE_FEEDBACK_NOT_FOUND', 'That feedback no longer exists.', 404)
const unique = (ids: string[]) => Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))

/** Changes one row's review (super admin). */
export async function reviewFeedback(queries: SiteFeedbackQueries, actor: SiteFeedbackActor, feedbackId: string, body: SiteFeedbackReviewBody, now: string): Promise<SiteFeedbackItem> {
  const existing = await queries.read(feedbackId, actor.requestId)
  if (!existing) throw notFound()
  const data = reviewData(existing, body, actor.userId, now)
  await queries.update(feedbackId, data, actor.requestId)
  await queries.audit(audit(actor, 'UPDATE', feedbackId, { status: body.status, classification: body.classification, priority: body.priority, assignedTo: body.assignedTo, notesChanged: body.notes !== undefined }))
  const updated = await queries.read(feedbackId, actor.requestId)
  return feedbackItem(updated ?? { ...existing, ...data })
}

/** The same review change for several rows (super admin). */
export async function bulkReviewFeedback(queries: SiteFeedbackQueries, actor: SiteFeedbackActor, body: SiteFeedbackBulkUpdateBody, now: string): Promise<SiteFeedbackCountData> {
  const missing: string[] = []
  let count = 0
  for (const feedbackId of unique(body.feedbackIds)) {
    const existing = await queries.read(feedbackId, actor.requestId)
    if (!existing) {
      missing.push(feedbackId)
      continue
    }
    await queries.update(feedbackId, reviewData(existing, body, actor.userId, now), actor.requestId)
    count += 1
  }
  await queries.audit(audit(actor, 'BULK_UPDATE', `${count} rows`, { feedbackIds: unique(body.feedbackIds), status: body.status, classification: body.classification, priority: body.priority, assignedTo: body.assignedTo, missing }))
  return { count, missing }
}

/** Deletes rows for good (super admin). */
export async function deleteFeedback(queries: SiteFeedbackQueries, actor: SiteFeedbackActor, feedbackIds: string[]): Promise<SiteFeedbackCountData> {
  const missing: string[] = []
  let count = 0
  for (const feedbackId of unique(feedbackIds)) {
    const existing = await queries.read(feedbackId, actor.requestId)
    if (!existing) {
      missing.push(feedbackId)
      continue
    }
    await queries.remove(feedbackId, actor.requestId)
    await queries.audit(audit(actor, 'DELETE', feedbackId, { appContext: existing.app_context ?? null, submittedAt: existing.submitted_at ?? null }))
    count += 1
  }
  return { count, missing }
}

/** Adds a vote; anyone but a super admin votes once per row. */
export async function voteFeedback(queries: SiteFeedbackQueries, actor: SiteFeedbackActor, feedbackId: string, now: string): Promise<SiteFeedbackVoteData> {
  const existing = await queries.read(feedbackId, actor.requestId)
  if (!existing) throw notFound()
  const parsed = parseReviewNotes(existing.internal_notes)
  const voterIds = parsed.meta.voterIds ?? []
  const superAdmin = actor.role === 'super_admin'
  if (!superAdmin && voterIds.includes(actor.userId)) return { feedback: feedbackItem(existing), voted: false }
  const internalNotes = composeReviewNotes(parsed.notes, { ...parsed.meta, voteCount: (parsed.meta.voteCount ?? 0) + 1, voterIds: superAdmin ? voterIds : [...voterIds, actor.userId] })
  await queries.update(feedbackId, { internal_notes: internalNotes, updated_at: now }, actor.requestId)
  await queries.audit(audit(actor, 'VOTE', feedbackId))
  const updated = await queries.read(feedbackId, actor.requestId)
  return { feedback: feedbackItem(updated ?? { ...existing, internal_notes: internalNotes, updated_at: now }), voted: true }
}
