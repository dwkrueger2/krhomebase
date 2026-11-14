// file: apps/api/src/features/homebase-feedback/rules.ts
/**
 * Homebase Feedback rules (plan `docs/12_Homebase_Feedback_Plan.md`, stage F1; decisions in section 7.1, Nov 13,
 * 2026). Requests about KR Homebase itself, numbered FB-0001 upwards (decision 6).
 *
 * Who (decisions 2 and 4):
 * - Anyone signed in may send a request and read their own (`createFeedback`, `listMyFeedback`, and `getFeedback` for
 *   a request they sent, without the developer notes).
 * - A developer holds `developer_tools` read (the built-in role set "Internal Developer"; the built-in Super Admin
 *   holds every permission): every request, each with its notes (`listFeedback`, `getFeedback`).
 * - Triage needs `developer_tools` update: status and priority (`changeFeedback`) and notes (`addFeedbackNote`).
 *   `routes.ts` declares those two permissions on the routes; `viewerFor` answers both for the screen.
 *
 * Numbers: the next number is the highest plus one; when another request takes it first (the UNIQUE rule on
 * `number`), the next one is tried, eight times at most (409 `HOMEBASE_FEEDBACK_NUMBER_EXHAUSTED`).
 *
 * Markers: read again from the saved text with `findFeedbackMarkers` (contracts), so the browser cannot add a marker
 * the text does not name. The browser's list only says whether each was found on the page and where.
 *
 * Every write is one batch with its `audit_log` row (resource `homebase-feedback`; actions `CREATE`, `UPDATE`,
 * `NOTE`), which names the request and never carries its text.
 */

import {
  findFeedbackMarkers,
  formatFeedbackNumber,
  HOMEBASE_FEEDBACK_KINDS,
  HOMEBASE_FEEDBACK_STATUSES,
  parseFeedbackNumber,
  type HomebaseFeedbackCreateBody,
  type HomebaseFeedbackDetail,
  type HomebaseFeedbackListData,
  type HomebaseFeedbackListQuery,
  type HomebaseFeedbackMineQuery,
  type HomebaseFeedbackNoteBody,
  type HomebaseFeedbackSavedData,
  type HomebaseFeedbackSummary,
  type HomebaseFeedbackUpdateBody,
  type HomebaseFeedbackViewer,
} from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { FeedbackRow, HomebaseFeedbackQueries, ImageRow, MarkerRow, NoteRow } from './queries.ts'

/** The `audit_log` resource of this area. */
export const FEEDBACK_AUDIT_RESOURCE = 'homebase-feedback'
/** The permission resource that makes a person an Internal Developer (decision 2). */
export const DEVELOPER_RESOURCE = 'developer_tools'
/** How many times a new request tries the next free number. */
const NUMBER_TRIES = 8

/** A refusal with its stable code and HTTP status. */
export class HomebaseFeedbackError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404 | 409 | 422,
  ) {
    super(message)
    this.name = 'HomebaseFeedbackError'
  }
}

/** The signed-in person, from the checked session, and what their permissions allow here. */
export interface FeedbackActor {
  userId: string
  email: string
  role: string
  requestId: string
  /** Holds `developer_tools` read. */
  isDeveloper: boolean
  /** Holds `developer_tools` update. */
  canTriage: boolean
}

export function viewerFor(actor: FeedbackActor): HomebaseFeedbackViewer {
  return { userId: actor.userId, isDeveloper: actor.isDeveloper, canTriage: actor.canTriage }
}

/** A person's name: preferred name, else first and last name, else email, else the id. */
function personLabel(parts: { email: string | null; preferred: string | null; first: string | null; last: string | null }, fallback: string): string {
  const preferred = parts.preferred?.trim()
  if (preferred) return preferred
  const full = [parts.first, parts.last].map((part) => part?.trim()).filter(Boolean).join(' ')
  return full || parts.email?.trim() || fallback
}

function summaryOf(row: FeedbackRow): HomebaseFeedbackSummary {
  return {
    number: Number(row.number),
    code: formatFeedbackNumber(Number(row.number)),
    kind: row.kind as HomebaseFeedbackSummary['kind'],
    title: row.title,
    status: row.status as HomebaseFeedbackSummary['status'],
    priority: row.priority as HomebaseFeedbackSummary['priority'],
    submittedByUserId: row.submitted_by_user_id,
    submittedByLabel: personLabel(
      { email: row.submitter_email, preferred: row.submitter_preferred_name, first: row.submitter_first_name, last: row.submitter_last_name },
      row.submitted_by_user_id,
    ),
    sectionId: row.section_id,
    markerCount: Number(row.marker_count ?? 0),
    noteCount: Number(row.note_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** A stored box, or null when there is none or it cannot be read. */
function readBox(json: string | null): HomebaseFeedbackDetail['markers'][number]['box'] {
  if (!json) return null
  try {
    const box = JSON.parse(json) as Record<string, unknown>
    const values = [box.x, box.y, box.width, box.height]
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
    return { x: box.x as number, y: box.y as number, width: box.width as number, height: box.height as number }
  } catch {
    return null
  }
}

function detailOf(row: FeedbackRow, markers: MarkerRow[], images: ImageRow[], notes: NoteRow[]): HomebaseFeedbackDetail {
  return {
    ...summaryOf(row),
    body: row.body,
    submitterRole: row.submitter_role,
    context: {
      pageAddress: row.page_address,
      sectionId: row.section_id,
      openItem: row.open_item,
      pageTitle: row.page_title,
      webVersion: row.web_version,
      deploymentId: row.deployment_id,
      deploymentTime: row.deployment_time,
      windowWidth: row.window_width === null ? null : Number(row.window_width),
      windowHeight: row.window_height === null ? null : Number(row.window_height),
      theme: row.theme,
    },
    markers: markers.map((marker) => ({
      attribute: marker.attribute as HomebaseFeedbackDetail['markers'][number]['attribute'],
      value: marker.value,
      pattern: `${marker.attribute}="${marker.value}"`,
      foundAtCapture: Number(marker.found_at_capture) === 1,
      box: readBox(marker.box_json),
    })),
    images: images.map((image) => ({
      id: image.id,
      r2Key: image.r2_key,
      contentType: image.content_type,
      byteSize: Number(image.byte_size),
      width: image.width === null ? null : Number(image.width),
      height: image.height === null ? null : Number(image.height),
      createdAt: image.created_at,
    })),
    notes: notes.map((note) => ({
      id: note.id,
      noteType: note.note_type as HomebaseFeedbackDetail['notes'][number]['noteType'],
      text: note.body,
      fromValue: note.from_value,
      toValue: note.to_value,
      authorUserId: note.author_user_id,
      authorLabel: personLabel({ email: note.author_email, preferred: note.author_preferred_name, first: note.author_first_name, last: note.author_last_name }, note.author_user_id),
      createdAt: note.created_at,
    })),
  }
}

/** Reads a request with its parts. Notes only for a developer (decision 4: the sender sees their text and context). */
async function loadDetail(queries: HomebaseFeedbackQueries, row: FeedbackRow, withNotes: boolean): Promise<HomebaseFeedbackDetail> {
  const [markers, images, notes] = await Promise.all([queries.markers(row.id), queries.images(row.id), withNotes ? queries.notes(row.id) : Promise.resolve([])])
  return detailOf(row, markers, images, notes)
}

/** The request with this number, or 404 `HOMEBASE_FEEDBACK_NOT_FOUND`. */
async function requireRequest(queries: HomebaseFeedbackQueries, numberText: string): Promise<FeedbackRow> {
  const number = parseFeedbackNumber(numberText)
  const row = number === null ? null : await queries.byNumber(number)
  if (!row) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_NOT_FOUND', `No feedback request ${numberText}.`, 404)
  return row
}

/** The page position after the last row: its number, as text. */
function readCursor(cursor: string | undefined): number | null {
  if (!cursor) return null
  const value = Number(cursor)
  if (!/^\d{1,9}$/.test(cursor) || !Number.isSafeInteger(value) || value < 1) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_CURSOR_INVALID', 'The page position is not valid.', 422)
  return value
}

function pageOf(rows: FeedbackRow[], limit: number, actor: FeedbackActor): HomebaseFeedbackListData {
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return { items: page.map(summaryOf), nextCursor: rows.length > limit && last ? String(last.number) : null, viewer: viewerFor(actor) }
}

/** The caller's own requests, newest first, one page; anyone signed in. */
export async function listMyFeedback(queries: HomebaseFeedbackQueries, actor: FeedbackActor, query: HomebaseFeedbackMineQuery): Promise<HomebaseFeedbackListData> {
  const rows = await queries.list({ submittedByUserId: actor.userId }, readCursor(query.cursor), query.limit)
  return pageOf(rows, query.limit, actor)
}

/** Every request, newest first, one page, by status and kind (developers; the route checks `developer_tools` read). */
export async function listFeedback(queries: HomebaseFeedbackQueries, actor: FeedbackActor, query: HomebaseFeedbackListQuery): Promise<HomebaseFeedbackListData> {
  const statuses = (query.status ?? '')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean)
  const unknown = statuses.filter((status) => !(HOMEBASE_FEEDBACK_STATUSES as readonly string[]).includes(status))
  if (unknown.length) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_STATUS_INVALID', `Not a feedback status: ${unknown.join(', ')}.`, 422)
  const rows = await queries.list({ statuses, kind: query.kind }, readCursor(query.cursor), query.limit)
  return pageOf(rows, query.limit, actor)
}

/**
 * One request. A developer sees any request with its notes; anyone else only a request they sent, without notes. A
 * request that is not theirs answers 404, as a missing one does, so numbers do not tell others what exists.
 */
export async function getFeedback(queries: HomebaseFeedbackQueries, actor: FeedbackActor, numberText: string): Promise<HomebaseFeedbackSavedData> {
  const row = await requireRequest(queries, numberText)
  if (!actor.isDeveloper && row.submitted_by_user_id !== actor.userId) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_NOT_FOUND', `No feedback request ${numberText}.`, 404)
  return { feedback: await loadDetail(queries, row, actor.isDeveloper) }
}

/** Trims a captured value to text or null. */
const textOrNull = (value: string | undefined) => (value && value.trim() ? value.trim() : null)

/**
 * Saves a new request with the next free number, its markers (read again from the text) and the captured page.
 * The sender comes from the session. Status starts New and priority Normal.
 */
export async function createFeedback(queries: HomebaseFeedbackQueries, actor: FeedbackActor, body: HomebaseFeedbackCreateBody, now: string): Promise<HomebaseFeedbackSavedData> {
  if (!(HOMEBASE_FEEDBACK_KINDS as readonly string[]).includes(body.kind)) throw new HomebaseFeedbackError('VALIDATION_FAILED', 'Not a feedback kind.', 422)
  const captured = new Map(body.markers.map((marker) => [`${marker.attribute}=${marker.value}`, marker]))
  const markers = findFeedbackMarkers(body.body).map((marker, index) => {
    const seen = captured.get(`${marker.attribute}=${marker.value}`)
    return {
      id: `hfm_${crypto.randomUUID()}`,
      attribute: marker.attribute,
      value: marker.value,
      found: seen?.found === true,
      boxJson: seen?.found && seen.box ? JSON.stringify(seen.box) : null,
      sortOrder: index,
    }
  })
  const context = body.context ?? {}
  const id = `hfb_${crypto.randomUUID()}`
  let number = (await queries.highestNumber()) + 1
  for (let attempt = 0; attempt < NUMBER_TRIES; attempt += 1, number += 1) {
    const audit: AuditEntry = {
      requestId: actor.requestId,
      actorUserId: actor.userId,
      actorEmail: actor.email || null,
      actorRole: actor.role || null,
      resource: FEEDBACK_AUDIT_RESOURCE,
      action: 'CREATE',
      targetTable: 'homebase_feedback',
      targetId: id,
      newJson: { number: formatFeedbackNumber(number), kind: body.kind, markers: markers.length, sectionId: textOrNull(context.sectionId) },
    }
    const saved = await queries.insert(
      {
        id,
        number,
        kind: body.kind,
        title: body.title.trim(),
        body: body.body.trim(),
        submittedByUserId: actor.userId,
        submitterRole: actor.role || null,
        pageAddress: textOrNull(context.pageAddress),
        sectionId: textOrNull(context.sectionId),
        openItem: textOrNull(context.openItem),
        pageTitle: textOrNull(context.pageTitle),
        webVersion: textOrNull(context.webVersion),
        deploymentId: textOrNull(context.deploymentId),
        deploymentTime: textOrNull(context.deploymentTime),
        windowWidth: context.windowWidth ?? null,
        windowHeight: context.windowHeight ?? null,
        theme: textOrNull(context.theme),
        now,
        markers,
      },
      audit,
    )
    if (saved) {
      const row = await queries.byNumber(number)
      if (!row) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_NOT_FOUND', `No feedback request ${formatFeedbackNumber(number)}.`, 404)
      return { feedback: await loadDetail(queries, row, actor.isDeveloper) }
    }
  }
  throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_NUMBER_EXHAUSTED', 'No free feedback number was found; send it again.', 409)
}

function auditFor(actor: FeedbackActor, row: FeedbackRow, action: string, newJson: unknown): AuditEntry {
  return {
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorEmail: actor.email || null,
    actorRole: actor.role || null,
    resource: FEEDBACK_AUDIT_RESOURCE,
    action,
    targetTable: 'homebase_feedback',
    targetId: row.id,
    newJson: { number: formatFeedbackNumber(Number(row.number)), ...(newJson as object) },
  }
}

/**
 * Changes a request's status or priority (developers with `developer_tools` update). Each value that really changes
 * gets a note row recording it (from, to), with the optional note text on the first. With no real change, a note is
 * kept as a plain note, and without one nothing is written.
 */
export async function changeFeedback(queries: HomebaseFeedbackQueries, actor: FeedbackActor, numberText: string, body: HomebaseFeedbackUpdateBody, now: string): Promise<HomebaseFeedbackSavedData> {
  const row = await requireRequest(queries, numberText)
  const status = body.status ?? row.status
  const priority = body.priority ?? row.priority
  const note = body.note?.trim() || null
  const notes: Array<{ id: string; noteType: string; body: string | null; fromValue: string | null; toValue: string | null; authorUserId: string }> = []
  if (status !== row.status) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'status_change', body: null, fromValue: row.status, toValue: status, authorUserId: actor.userId })
  if (priority !== row.priority) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'priority_change', body: null, fromValue: row.priority, toValue: priority, authorUserId: actor.userId })
  // A note sent with values that did not change is kept as a plain note.
  if (!notes.length && note) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'note', body: note, fromValue: null, toValue: null, authorUserId: actor.userId })
  else if (note && notes[0]) notes[0].body = note
  if (notes.length) {
    await queries.change({ feedbackId: row.id, status, priority, now, notes }, auditFor(actor, row, 'UPDATE', { status, priority, noted: Boolean(note) }))
  }
  const fresh = (await queries.byNumber(Number(row.number))) ?? row
  return { feedback: await loadDetail(queries, fresh, true) }
}

/** Adds a developer note (developers with `developer_tools` update). */
export async function addFeedbackNote(queries: HomebaseFeedbackQueries, actor: FeedbackActor, numberText: string, body: HomebaseFeedbackNoteBody, now: string): Promise<HomebaseFeedbackSavedData> {
  const row = await requireRequest(queries, numberText)
  const note = { id: `hfn_${crypto.randomUUID()}`, noteType: 'note', body: body.text.trim(), fromValue: null, toValue: null, authorUserId: actor.userId }
  await queries.change({ feedbackId: row.id, status: row.status, priority: row.priority, now, notes: [note] }, auditFor(actor, row, 'NOTE', { noteId: note.id }))
  const fresh = (await queries.byNumber(Number(row.number))) ?? row
  return { feedback: await loadDetail(queries, fresh, true) }
}
