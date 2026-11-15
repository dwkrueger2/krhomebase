// file: workers/feedback-viewer/src/feedbackTypes.ts
/**
 * The shapes of the Homebase Feedback replies this tool reads, written by hand from the KR Homebase API reference
 * (the OpenAPI file, routes `GET /v1/homebase-feedback`, `GET`, `PATCH /v1/homebase-feedback/{number}` and
 * `POST /v1/homebase-feedback/{number}/notes`), the way an outside developer would.
 *
 * On purpose this file does not import `@krhomebase/contracts` or anything else from the KR Homebase code: this tool
 * is built as a test of the tool kit, using only what an outside developer receives (the kit and the API reference).
 * The words shown for each value (`*_LABELS`) are this tool's own.
 */

/** Feature (a change or addition), issue (something wrong) or question. */
export const FEEDBACK_KINDS = ['feature', 'issue', 'question'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/** Where a request stands. */
export const FEEDBACK_STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'done', 'will_not_do'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

/** How urgent a request is. */
export const FEEDBACK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]

export const KIND_LABELS: Record<FeedbackKind, string> = { feature: 'Feature', issue: 'Issue', question: 'Question' }
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  will_not_do: 'Will not do',
}
export const PRIORITY_LABELS: Record<FeedbackPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }

/** One row of the list. */
export interface FeedbackSummary {
  number: number
  /** `FB-0012`. */
  code: string
  kind: FeedbackKind
  title: string
  status: FeedbackStatus
  priority: FeedbackPriority
  submittedByUserId: string
  submittedByLabel: string
  sectionId: string | null
  markerCount: number
  noteCount: number
  createdAt: string
  updatedAt: string | null
}

/** Reply data of `GET /v1/homebase-feedback`. */
export interface FeedbackListData {
  items: FeedbackSummary[]
  nextCursor: string | null
  viewer: { userId: string; isDeveloper: boolean; canTriage: boolean }
}

/** The page a request was sent from, as captured. */
export interface FeedbackContext {
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
}

/** A marker the request text names, and where it was on the page when sent. */
export interface FeedbackMarker {
  attribute: 'data-kr-id' | 'data-kr-element'
  value: string
  pattern: string
  foundAtCapture: boolean
  box: { x: number; y: number; width: number; height: number } | null
}

/** A shape drawn on a screenshot, with the markers it points at (coordinates 0 to 1 of the image). */
export interface FeedbackShape {
  type: 'rectangle' | 'arrow' | 'text' | 'redact'
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  x1: number | null
  y1: number | null
  x2: number | null
  y2: number | null
  text: string | null
  nearMarkers: string[]
}

/** A ticket to read one image from this tool's own image script (`worker/imageWorker.ts`), from KR Homebase. */
export interface FeedbackImageTicket {
  value: string
  expiresAt: string
}

/** An annotated screenshot (stage F3). The PNG has the shapes and redactions drawn in. */
export interface FeedbackImage {
  id: string
  r2Key: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  createdAt: string
  shapes: FeedbackShape[]
  markerMapCount: number
  /** Null when KR Homebase has no ticket secret yet. */
  ticket: FeedbackImageTicket | null
}

/** Plain names of the shapes. */
export const SHAPE_LABELS: Record<FeedbackShape['type'], string> = { rectangle: 'Rectangle', arrow: 'Arrow', text: 'Text', redact: 'Redaction' }

/** The address of an image on this tool's own site: `/images/<key>?ticket=...` (served by `worker/imageWorker.ts`). */
export function imageAddress(image: Pick<FeedbackImage, 'r2Key' | 'ticket'>): string | null {
  if (!image.ticket) return null
  return `/images/${image.r2Key.split('/').map(encodeURIComponent).join('/')}?ticket=${encodeURIComponent(image.ticket.value)}`
}

/** A developer note, or the record of a status or priority change. */
export interface FeedbackNote {
  id: string
  noteType: 'note' | 'status_change' | 'priority_change'
  text: string | null
  fromValue: string | null
  toValue: string | null
  authorUserId: string
  authorLabel: string
  createdAt: string
}

/** One request with everything about it. */
export interface FeedbackDetail extends FeedbackSummary {
  body: string
  submitterRole: string | null
  context: FeedbackContext
  markers: FeedbackMarker[]
  images: FeedbackImage[]
  notes: FeedbackNote[]
}

/** Reply data of the one-request routes (read, change, note). */
export interface FeedbackSavedData {
  feedback: FeedbackDetail
}

/** Shown in place of a value this tool does not know (a newer API may add values). */
export function labelOf(labels: Record<string, string>, value: string | null | undefined): string {
  if (value == null) return ''
  return labels[value] ?? value
}

/** `FB-0012` for 12. */
export function feedbackCode(number: number): string {
  return `FB-${String(number).padStart(4, '0')}`
}

/** The words a developer pastes into Claude Code for a request (KR Homebase `AGENTS.md`, "Homebase Feedback: asking Claude"). */
export function copyForClaudeText(number: number): string {
  return `plan ${feedbackCode(number)}`
}
