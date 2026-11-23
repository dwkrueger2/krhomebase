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
 * - Triage needs `developer_tools` update: status, priority and, since API patch 57, kind (`changeFeedback`) and
 *   notes (`addFeedbackNote`). A kind change is recorded as a plain note ("Kind changed from Bug to Usability."): the
 *   note table's `note_type` CHECK allows only note, status_change and priority_change, and a new type would mean
 *   rebuilding the table.
 *   `routes.ts` declares those two permissions on the routes; `viewerFor` answers both for the screen.
 *
 * Numbers: the next number is the highest plus one; when another request takes it first (the UNIQUE rule on
 * `number`), the next one is tried, eight times at most (409 `HOMEBASE_FEEDBACK_NUMBER_EXHAUSTED`).
 *
 * Markers: read again from the saved text with `findFeedbackMarkers` (contracts), so the browser cannot add a marker
 * the text does not name. The browser's list only says whether each was found on the page and where.
 *
 * Images (stage F3, `addFeedbackImage`): the sender of a request, or a developer, may add up to five annotated PNGs
 * (8 MB each). The API checks the PNG signature and reads its size from the file, checks the shapes and the marker map
 * against the contracts, and works out for each shape the markers it points at (`nearMarkersFor`). The PNG goes to R2
 * first, then the row and the audit row in one batch; when the batch fails the PNG is removed again. Each image in a
 * reply carries a ticket for the Feedback viewer (`FeedbackActor.imageTicket`, `src/platform/feedbackImages.ts`).
 *
 * Every write is one batch with its `audit_log` row (resource `homebase-feedback`; actions `CREATE`, `UPDATE`,
 * `NOTE`, `IMAGE`), which names the request and never carries its text.
 */

import {
  findFeedbackMarkers,
  formatFeedbackNumber,
  HOMEBASE_FEEDBACK_KIND_LABELS,
  HOMEBASE_FEEDBACK_KINDS,
  HOMEBASE_FEEDBACK_MAX_IMAGE_BYTES,
  HOMEBASE_FEEDBACK_MAX_IMAGES,
  HOMEBASE_FEEDBACK_STATUSES,
  HomebaseFeedbackMarkerMap,
  HomebaseFeedbackShape,
  HomebaseFeedbackShapeList,
  parseFeedbackNumber,
  type HomebaseFeedbackImageTicket,
  type HomebaseFeedbackMapEntry,
  type HomebaseFeedbackShapeInput,
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
import { z } from 'zod'
import { FeedbackStorageError, type FeedbackStorage } from '../../platform/feedbackImages.ts'
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
    readonly status: 404 | 409 | 422 | 503,
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
  /** Gives an image key its viewer ticket; null or left out when the API has no ticket secret. */
  imageTicket?: ((r2Key: string) => Promise<HomebaseFeedbackImageTicket>) | null
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
    submittedByDeveloper: Number(row.submitter_developer ?? 0) === 1,
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

/** The stored shapes of an image, or none when they cannot be read. */
function readShapes(json: string | null): HomebaseFeedbackDetail['images'][number]['shapes'] {
  if (!json) return []
  try {
    const parsed = z.array(HomebaseFeedbackShape).safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** How many entries a stored marker map has. */
function mapCount(json: string | null): number {
  if (!json) return 0
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? value.length : 0
  } catch {
    return 0
  }
}

/** The images as sent, each with its viewer ticket when the API can sign one. */
async function imagesOf(images: ImageRow[], actor: FeedbackActor): Promise<HomebaseFeedbackDetail['images']> {
  return Promise.all(
    images.map(async (image) => ({
      id: image.id,
      r2Key: image.r2_key,
      contentType: image.content_type,
      byteSize: Number(image.byte_size),
      width: image.width === null ? null : Number(image.width),
      height: image.height === null ? null : Number(image.height),
      createdAt: image.created_at,
      shapes: readShapes(image.shapes_json),
      markerMapCount: mapCount(image.marker_map_json),
      ticket: actor.imageTicket ? await actor.imageTicket(image.r2_key) : null,
    })),
  )
}

function detailOf(row: FeedbackRow, markers: MarkerRow[], images: HomebaseFeedbackDetail['images'], notes: NoteRow[]): HomebaseFeedbackDetail {
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
    images,
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
async function loadDetail(queries: HomebaseFeedbackQueries, row: FeedbackRow, actor: FeedbackActor, withNotes: boolean): Promise<HomebaseFeedbackDetail> {
  const [markers, images, notes] = await Promise.all([queries.markers(row.id), queries.images(row.id), withNotes ? queries.notes(row.id) : Promise.resolve([])])
  return detailOf(row, markers, await imagesOf(images, actor), notes)
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
  return { feedback: await loadDetail(queries, row, actor, actor.isDeveloper) }
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
      return { feedback: await loadDetail(queries, row, actor, actor.isDeveloper) }
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

/** A kind's words for a note ("Bug"); an unknown stored kind as it is. */
function kindLabel(kind: string): string {
  return (HOMEBASE_FEEDBACK_KIND_LABELS as Record<string, string>)[kind] ?? kind
}

/**
 * Changes a request's status, priority or kind (developers with `developer_tools` update). Each value that really
 * changes gets a note row recording it (status and priority: from, to; kind: a plain note with the words), with the
 * optional note text on the first. With no real change, a note is kept as a plain note, and without one nothing is
 * written.
 */
export async function changeFeedback(queries: HomebaseFeedbackQueries, actor: FeedbackActor, numberText: string, body: HomebaseFeedbackUpdateBody, now: string): Promise<HomebaseFeedbackSavedData> {
  const row = await requireRequest(queries, numberText)
  const status = body.status ?? row.status
  const priority = body.priority ?? row.priority
  const kind = body.kind ?? row.kind
  const note = body.note?.trim() || null
  const notes: Array<{ id: string; noteType: string; body: string | null; fromValue: string | null; toValue: string | null; authorUserId: string }> = []
  if (status !== row.status) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'status_change', body: null, fromValue: row.status, toValue: status, authorUserId: actor.userId })
  if (priority !== row.priority) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'priority_change', body: null, fromValue: row.priority, toValue: priority, authorUserId: actor.userId })
  // A kind change is a plain note with the words (see the header); the note text, when sent, follows them.
  const kindLine = kind !== row.kind ? `Kind changed from ${kindLabel(row.kind)} to ${kindLabel(kind)}.` : null
  if (kindLine) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'note', body: kindLine, fromValue: null, toValue: null, authorUserId: actor.userId })
  // A note sent with values that did not change is kept as a plain note.
  if (!notes.length && note) notes.push({ id: `hfn_${crypto.randomUUID()}`, noteType: 'note', body: note, fromValue: null, toValue: null, authorUserId: actor.userId })
  else if (note && notes[0]) notes[0].body = notes[0].body ? `${notes[0].body}\n${note}` : note
  if (notes.length) {
    await queries.change({ feedbackId: row.id, status, priority, kind, now, notes }, auditFor(actor, row, 'UPDATE', { status, priority, kind, noted: Boolean(note) }))
  }
  const fresh = (await queries.byNumber(Number(row.number))) ?? row
  return { feedback: await loadDetail(queries, fresh, actor, true) }
}

/** Adds a developer note (developers with `developer_tools` update). */
export async function addFeedbackNote(queries: HomebaseFeedbackQueries, actor: FeedbackActor, numberText: string, body: HomebaseFeedbackNoteBody, now: string): Promise<HomebaseFeedbackSavedData> {
  const row = await requireRequest(queries, numberText)
  const note = { id: `hfn_${crypto.randomUUID()}`, noteType: 'note', body: body.text.trim(), fromValue: null, toValue: null, authorUserId: actor.userId }
  await queries.change({ feedbackId: row.id, status: row.status, priority: row.priority, kind: row.kind, now, notes: [note] }, auditFor(actor, row, 'NOTE', { noteId: note.id }))
  const fresh = (await queries.byNumber(Number(row.number))) ?? row
  return { feedback: await loadDetail(queries, fresh, actor, true) }
}

// ---------------------------------------------------------------------------------------------------------------
// Images (stage F3)
// ---------------------------------------------------------------------------------------------------------------

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * The width and height of a PNG, read from its first chunk (IHDR), or null when the bytes are not a PNG.
 *
 * @param bytes - The file.
 * @returns The size in pixels, or null.
 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return null
  // Bytes 12 to 15 name the first chunk, which must be IHDR; its width and height follow, four bytes each.
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 && width <= 20_000 && height <= 20_000 ? { width, height } : null
}

type UnitBox = { x: number; y: number; width: number; height: number }
const area = (box: UnitBox) => Math.max(0, box.width) * Math.max(0, box.height)
const contains = (box: UnitBox, x: number, y: number) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
function overlap(a: UnitBox, b: UnitBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}
const patternOf = (entry: HomebaseFeedbackMapEntry) => `${entry.attribute}="${entry.value}"`

/** The most markers one shape names. */
const NEAR_LIMIT = 5
/** How much of an element must lie inside a rectangle for the rectangle to be "around" it. */
const INSIDE_SHARE = 0.6

/** Each pattern once, in order, at most `NEAR_LIMIT`. */
function firstPatterns(entries: HomebaseFeedbackMapEntry[]): string[] {
  return [...new Set(entries.map(patternOf))].slice(0, NEAR_LIMIT)
}

/** The elements under a point, innermost (smallest) first. */
function under(map: HomebaseFeedbackMapEntry[], x: number, y: number): string[] {
  return firstPatterns(map.filter((entry) => area(entry.box) > 0 && contains(entry.box, x, y)).sort((a, b) => area(a.box) - area(b.box)))
}

/**
 * The markers a shape points at, so a reader sees "a rectangle around data-kr-element=..." as data:
 * - a rectangle or redaction: the elements at least 60% inside it, largest first (what was drawn around); when none,
 *   the elements under its middle, innermost first;
 * - an arrow: the elements under its head, innermost first;
 * - a text: the elements under where it starts, innermost first.
 *
 * @param shape - One shape, coordinates 0 to 1.
 * @param map - The marker map of the same image.
 * @returns At most five patterns such as `data-kr-id="TopTitleBar"`.
 */
export function nearMarkersFor(shape: HomebaseFeedbackShapeInput, map: HomebaseFeedbackMapEntry[]): string[] {
  if (shape.type === 'arrow') return under(map, shape.x2, shape.y2)
  if (shape.type === 'text') return under(map, shape.x, shape.y)
  const inside = map
    .filter((entry) => area(entry.box) > 0 && overlap(entry.box, shape) / area(entry.box) >= INSIDE_SHARE)
    .sort((a, b) => area(b.box) - area(a.box))
  return inside.length ? firstPatterns(inside) : under(map, shape.x + shape.width / 2, shape.y + shape.height / 2)
}

/** A shape as kept: every field present (null where it does not apply), plus the markers it points at. */
export function storedShape(shape: HomebaseFeedbackShapeInput, map: HomebaseFeedbackMapEntry[]): HomebaseFeedbackShape {
  const empty = { x: null, y: null, width: null, height: null, x1: null, y1: null, x2: null, y2: null, text: null }
  const nearMarkers = nearMarkersFor(shape, map)
  if (shape.type === 'arrow') return { ...empty, type: 'arrow', x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, nearMarkers }
  if (shape.type === 'text') return { ...empty, type: 'text', x: shape.x, y: shape.y, text: shape.text, nearMarkers }
  return { ...empty, type: shape.type, x: shape.x, y: shape.y, width: shape.width, height: shape.height, nearMarkers }
}

/** Reads one JSON field of the upload form against its contract, or 422 `HOMEBASE_FEEDBACK_IMAGE_DATA_INVALID`. */
function readJsonField<T>(text: string, schema: z.ZodType<T>, what: string): T {
  let value: unknown
  try {
    value = JSON.parse(text || '[]')
  } catch {
    throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_IMAGE_DATA_INVALID', `The ${what} are not JSON.`, 422)
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_IMAGE_DATA_INVALID', `The ${what} are not in the expected shape.`, 422)
  return parsed.data
}

/** What the upload form carries. */
export interface FeedbackImageUpload {
  file: unknown
  shapes: string
  markerMap: string
}

/**
 * Adds an annotated screenshot to a request: its sender or a developer (anyone else 404, as for reading it).
 *
 * @param queries - The area queries.
 * @param storage - The feedback bucket.
 * @param actor - The signed-in person.
 * @param numberText - `FB-0012` or `12`.
 * @param upload - The PNG and the shapes and marker map as JSON text.
 * @param now - The time now (ISO).
 * @returns The request with its images.
 */
export async function addFeedbackImage(
  queries: HomebaseFeedbackQueries,
  storage: FeedbackStorage,
  actor: FeedbackActor,
  numberText: string,
  upload: FeedbackImageUpload,
  now: string,
): Promise<HomebaseFeedbackSavedData> {
  const row = await requireRequest(queries, numberText)
  if (!actor.isDeveloper && row.submitted_by_user_id !== actor.userId) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_NOT_FOUND', `No feedback request ${numberText}.`, 404)
  const file = upload.file
  if (!(file instanceof Blob)) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_IMAGE_REQUIRED', 'Attach the screenshot as a PNG.', 422)
  if (file.size > HOMEBASE_FEEDBACK_MAX_IMAGE_BYTES) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_IMAGE_TOO_LARGE', 'The screenshot is larger than 8 MB.', 422)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const size = pngSize(bytes)
  if (!size) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_IMAGE_NOT_PNG', 'The screenshot is not a PNG.', 422)
  const map = readJsonField(upload.markerMap, HomebaseFeedbackMarkerMap, 'marker map entries')
  const shapes = readJsonField(upload.shapes, HomebaseFeedbackShapeList, 'shapes').map((shape) => storedShape(shape, map))
  if ((await queries.imageCount(row.id)) >= HOMEBASE_FEEDBACK_MAX_IMAGES) {
    throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_IMAGE_LIMIT', `A request keeps at most ${HOMEBASE_FEEDBACK_MAX_IMAGES} images.`, 409)
  }

  const id = `hfi_${crypto.randomUUID()}`
  const code = formatFeedbackNumber(Number(row.number))
  const r2Key = `feedback/${code}/${id}.png`
  try {
    await storage.put(r2Key, bytes, 'image/png')
  } catch (error) {
    if (error instanceof FeedbackStorageError) throw new HomebaseFeedbackError('HOMEBASE_FEEDBACK_STORAGE_UNAVAILABLE', 'The screenshot could not be stored right now.', 503)
    throw error
  }
  try {
    await queries.insertImage(
      { id, feedbackId: row.id, r2Key, byteSize: bytes.byteLength, width: size.width, height: size.height, shapesJson: JSON.stringify(shapes), markerMapJson: JSON.stringify(map), createdByUserId: actor.userId, now },
      auditFor(actor, row, 'IMAGE', { imageId: id, shapes: shapes.length, redactions: shapes.filter((shape) => shape.type === 'redact').length, markerMap: map.length }),
    )
  } catch (error) {
    // The row was not saved: remove the PNG again, so no file is left without its row.
    await storage.delete(r2Key).catch(() => undefined)
    throw error
  }
  const fresh = (await queries.byNumber(Number(row.number))) ?? row
  return { feedback: await loadDetail(queries, fresh, actor, actor.isDeveloper) }
}
