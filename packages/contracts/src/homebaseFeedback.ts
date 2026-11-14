/**
 * Homebase Feedback (plan `docs/12_Homebase_Feedback_Plan.md`, stage F1; decisions in its section 7.1, Nov 13, 2026).
 * Numbered requests about KR Homebase itself (`FB-0012`), sent from the Feedback pop-out by anyone signed in. This is
 * not Web Site Feedback (`siteFeedback.ts`, feedback about the public website).
 *
 *   POST  /v1/homebase-feedback                  send a request (anyone signed in)
 *   GET   /v1/homebase-feedback/mine             the caller's own requests, newest first, with `viewer`
 *   GET   /v1/homebase-feedback                  every request, newest first (developers)
 *   GET   /v1/homebase-feedback/{number}         one request with its markers, images and notes (developers, or its sender)
 *   PATCH /v1/homebase-feedback/{number}         change the status or priority, with an optional note (developers)
 *   POST  /v1/homebase-feedback/{number}/notes   add a developer note (developers)
 *
 * The image upload route (`POST .../{number}/images`) comes with stage F3; `images` is always empty until then.
 *
 * Developers are people granted the permission resource `developer_tools` (`roleSets.ts`), normally through the
 * built-in role set "Internal Developer" (decision 2). `viewer.isDeveloper` says whether the caller is one.
 *
 * Markers: a request's text may name page elements as `data-kr-id="..."` or `data-kr-element="..."` (the full
 * pattern, as Dev View copies it). `findFeedbackMarkers` reads them; the screen shows each as a chip and the API keeps
 * one `homebase_feedback_marker` row per marker, read again from the saved text (the browser's list is only used for
 * whether each was found on the page and where).
 */

import { z } from 'zod'

/** What kind of request it is. */
export const HOMEBASE_FEEDBACK_KINDS = ['feature', 'issue', 'question'] as const
/** Where a request stands. */
export const HOMEBASE_FEEDBACK_STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'done', 'will_not_do'] as const
/** How urgent it is (set by a developer; Normal when sent). */
export const HOMEBASE_FEEDBACK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
/** The two marker attributes a request may name. */
export const HOMEBASE_FEEDBACK_MARKER_ATTRIBUTES = ['data-kr-id', 'data-kr-element'] as const

export const HomebaseFeedbackKind = z.enum(HOMEBASE_FEEDBACK_KINDS).describe('Feature (a change or addition), issue (something wrong) or question.')
export type HomebaseFeedbackKind = z.infer<typeof HomebaseFeedbackKind>
export const HomebaseFeedbackStatus = z.enum(HOMEBASE_FEEDBACK_STATUSES).describe('Where the request stands.')
export type HomebaseFeedbackStatus = z.infer<typeof HomebaseFeedbackStatus>
export const HomebaseFeedbackPriority = z.enum(HOMEBASE_FEEDBACK_PRIORITIES).describe('How urgent the request is.')
export type HomebaseFeedbackPriority = z.infer<typeof HomebaseFeedbackPriority>
export const HomebaseFeedbackMarkerAttribute = z.enum(HOMEBASE_FEEDBACK_MARKER_ATTRIBUTES).describe('The marker attribute named.')
export type HomebaseFeedbackMarkerAttribute = z.infer<typeof HomebaseFeedbackMarkerAttribute>

/** Plain labels for the screens and the script. */
export const HOMEBASE_FEEDBACK_KIND_LABELS: Record<HomebaseFeedbackKind, string> = { feature: 'Feature', issue: 'Issue', question: 'Question' }
export const HOMEBASE_FEEDBACK_STATUS_LABELS: Record<HomebaseFeedbackStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  will_not_do: 'Will not do',
}
export const HOMEBASE_FEEDBACK_PRIORITY_LABELS: Record<HomebaseFeedbackPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }

/** The most markers one request keeps. */
export const HOMEBASE_FEEDBACK_MAX_MARKERS = 50

/** `FB-0012` for 12: at least four digits (decision 6). */
export function formatFeedbackNumber(number: number): string {
  return `FB-${String(Math.max(0, Math.trunc(number))).padStart(4, '0')}`
}

/** Reads `FB-0012`, `fb-12` or `12` as 12; anything else as null. */
export function parseFeedbackNumber(text: string): number | null {
  const match = /^(?:FB-?)?0*(\d{1,9})$/i.exec(String(text ?? '').trim())
  if (!match) return null
  const value = Number(match[1])
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** One marker named in a text. */
export interface FeedbackMarkerReference {
  attribute: HomebaseFeedbackMarkerAttribute
  value: string
  /** The text as written, for example `data-kr-id="TopTitleBar"`. */
  pattern: string
}

/**
 * The markers named in a text as `data-kr-id="..."` or `data-kr-element="..."`: the full pattern with straight double
 * quotes, a value of 1 to 200 characters with no quote, space or angle bracket. Each marker once, in the order first
 * found, at most `HOMEBASE_FEEDBACK_MAX_MARKERS`.
 */
export function findFeedbackMarkers(text: string): FeedbackMarkerReference[] {
  const found: FeedbackMarkerReference[] = []
  const seen = new Set<string>()
  for (const match of String(text ?? '').matchAll(/(?<![A-Za-z0-9_-])data-kr-(id|element)="([^"\s<>]{1,200})"/g)) {
    const attribute = `data-kr-${match[1]}` as HomebaseFeedbackMarkerAttribute
    const value = match[2]!
    const key = `${attribute}=${value}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ attribute, value, pattern: `${attribute}="${value}"` })
    if (found.length >= HOMEBASE_FEEDBACK_MAX_MARKERS) break
  }
  return found
}

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number, what: string) => text(max).optional().describe(what)

/** Where a box sits on the page, in CSS pixels of the source window's viewport at capture time. */
export const HomebaseFeedbackBox = z.object({
  x: z.number().finite().describe('Left edge, in CSS pixels from the left of the window.'),
  y: z.number().finite().describe('Top edge, in CSS pixels from the top of the window.'),
  width: z.number().finite().min(0).describe('Width in CSS pixels.'),
  height: z.number().finite().min(0).describe('Height in CSS pixels.'),
})
export type HomebaseFeedbackBox = z.infer<typeof HomebaseFeedbackBox>

/** The page the request was sent from, captured from the source window (read-only on the screen). */
export const HomebaseFeedbackContext = z.object({
  pageAddress: optionalText(2000, 'The full address of the source window.'),
  sectionId: optionalText(200, 'The open section (`?section=`), for example `contacts`.'),
  openItem: optionalText(300, 'The open item, when one is open (`contact:<id>`, `billing:<clientId>`), with its label when known.'),
  pageTitle: optionalText(500, 'The page title and breadcrumb as shown in the top bar.'),
  webVersion: optionalText(200, 'The `kr-web-version` tag, for example `1.1.5 p542 (11-13)`.'),
  deploymentId: optionalText(200, 'The `kr-deployment-id` tag (`local` under `pnpm dev`).'),
  deploymentTime: optionalText(200, 'The `kr-deployment-time` tag (`local` under `pnpm dev`).'),
  windowWidth: z.number().int().min(0).max(100_000).optional().describe('Width of the source window, in CSS pixels.'),
  windowHeight: z.number().int().min(0).max(100_000).optional().describe('Height of the source window, in CSS pixels.'),
  theme: optionalText(40, 'The theme in use: `light` or `dark`.'),
})
export type HomebaseFeedbackContext = z.infer<typeof HomebaseFeedbackContext>

/** What the screen found on the page for one marker when the request was sent. */
export const HomebaseFeedbackMarkerCapture = z.object({
  attribute: HomebaseFeedbackMarkerAttribute,
  value: text(200).min(1).describe('The marker value.'),
  found: z.boolean().describe('True when the source window had an element with this marker.'),
  box: HomebaseFeedbackBox.nullable().optional().describe('Where the first such element was, when found.'),
})
export type HomebaseFeedbackMarkerCapture = z.infer<typeof HomebaseFeedbackMarkerCapture>

export const HomebaseFeedbackCreateBody = z.object({
  kind: HomebaseFeedbackKind,
  title: text(200).min(1, 'A title is required.').describe('A short title.'),
  body: text(20_000).min(1, 'Describe the request.').describe('The request. May name markers as `data-kr-id="..."` or `data-kr-element="..."`.'),
  context: HomebaseFeedbackContext.default({}).describe('The page the request was sent from.'),
  markers: z
    .array(HomebaseFeedbackMarkerCapture)
    .max(HOMEBASE_FEEDBACK_MAX_MARKERS)
    .default([])
    .describe('What the screen found for each marker in the text. Markers not in the text are ignored; a marker in the text but not here is saved as not found.'),
})
export type HomebaseFeedbackCreateBody = z.infer<typeof HomebaseFeedbackCreateBody>

export const HomebaseFeedbackParams = z.object({
  number: z
    .string()
    .regex(/^(?:FB-?)?\d{1,9}$/i, 'A request number is FB-0012 or 12.')
    .describe('The request number: `FB-0012` or `12`.'),
})
export type HomebaseFeedbackParams = z.infer<typeof HomebaseFeedbackParams>

export const HomebaseFeedbackListQuery = z.object({
  status: z.string().trim().max(200).optional().describe('Only these statuses, comma-separated (`new,triaged`).'),
  kind: HomebaseFeedbackKind.optional().describe('Only this kind.'),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe('Requests per page, 1 to 100 (50 when left out).'),
  cursor: z.string().max(40).optional().describe('The `nextCursor` of the previous page.'),
})
export type HomebaseFeedbackListQuery = z.infer<typeof HomebaseFeedbackListQuery>

export const HomebaseFeedbackMineQuery = HomebaseFeedbackListQuery.omit({ status: true, kind: true })
export type HomebaseFeedbackMineQuery = z.infer<typeof HomebaseFeedbackMineQuery>

export const HomebaseFeedbackUpdateBody = z
  .object({
    status: HomebaseFeedbackStatus.optional(),
    priority: HomebaseFeedbackPriority.optional(),
    note: text(10_000).optional().describe('An optional note saved with the change.'),
  })
  .refine((body) => body.status !== undefined || body.priority !== undefined, { message: 'Send a status or a priority to change.' })
export type HomebaseFeedbackUpdateBody = z.infer<typeof HomebaseFeedbackUpdateBody>

export const HomebaseFeedbackNoteBody = z.object({
  text: text(10_000).min(1, 'A note needs text.').describe('The note.'),
})
export type HomebaseFeedbackNoteBody = z.infer<typeof HomebaseFeedbackNoteBody>

/** What the signed-in person may do here. */
export const HomebaseFeedbackViewer = z.object({
  userId: z.string().describe('The signed-in person.'),
  isDeveloper: z.boolean().describe('Holds `developer_tools` read (normally the Internal Developer role set): sees every request and the developer tools.'),
  canTriage: z.boolean().describe('Holds `developer_tools` update: may change status and priority and add notes.'),
})
export type HomebaseFeedbackViewer = z.infer<typeof HomebaseFeedbackViewer>

/** One request in a list. */
export const HomebaseFeedbackSummary = z.object({
  number: z.number().int().describe('The request number (12 for FB-0012).'),
  code: z.string().describe('The request number as written, `FB-0012`.'),
  kind: HomebaseFeedbackKind,
  title: z.string().describe('The short title.'),
  status: HomebaseFeedbackStatus,
  priority: HomebaseFeedbackPriority,
  submittedByUserId: z.string().describe('Who sent it.'),
  submittedByLabel: z.string().describe("That person's name (preferred name, else first and last name, else email)."),
  sectionId: z.string().nullable().describe('The section it was sent from.'),
  markerCount: z.number().int().describe('How many markers the text names.'),
  noteCount: z.number().int().describe('How many developer notes it has.'),
  createdAt: z.string().describe('When it was sent (ISO time).'),
  updatedAt: z.string().nullable().describe('When it last changed (ISO time).'),
})
export type HomebaseFeedbackSummary = z.infer<typeof HomebaseFeedbackSummary>

export const HomebaseFeedbackMarker = z.object({
  attribute: HomebaseFeedbackMarkerAttribute,
  value: z.string().describe('The marker value.'),
  pattern: z.string().describe('The marker as written in the text, `data-kr-id="..."`.'),
  foundAtCapture: z.boolean().describe('True when the source window had it when the request was sent.'),
  box: HomebaseFeedbackBox.nullable().describe('Where it was, when found.'),
})
export type HomebaseFeedbackMarker = z.infer<typeof HomebaseFeedbackMarker>

/** An annotated screenshot (stage F3; none until then). */
export const HomebaseFeedbackImage = z.object({
  id: z.string().describe('Image id.'),
  r2Key: z.string().describe('Where the PNG is kept in the private feedback bucket.'),
  contentType: z.string().describe('The file type, `image/png`.'),
  byteSize: z.number().int().describe('Size in bytes.'),
  width: z.number().int().nullable().describe('Width in pixels.'),
  height: z.number().int().nullable().describe('Height in pixels.'),
  createdAt: z.string().describe('When it was added (ISO time).'),
})
export type HomebaseFeedbackImage = z.infer<typeof HomebaseFeedbackImage>

export const HomebaseFeedbackNote = z.object({
  id: z.string().describe('Note id.'),
  noteType: z.enum(['note', 'status_change', 'priority_change']).describe('A plain note, or the record of a status or priority change.'),
  text: z.string().nullable().describe('The note text.'),
  fromValue: z.string().nullable().describe('The value before the change (status or priority changes).'),
  toValue: z.string().nullable().describe('The value after the change.'),
  authorUserId: z.string().describe('Who wrote it.'),
  authorLabel: z.string().describe("That person's name."),
  createdAt: z.string().describe('When (ISO time).'),
})
export type HomebaseFeedbackNote = z.infer<typeof HomebaseFeedbackNote>

/** One request with everything kept about it. */
export const HomebaseFeedbackDetail = HomebaseFeedbackSummary.extend({
  body: z.string().describe('The request text.'),
  submitterRole: z.string().nullable().describe("The sender's role when it was sent."),
  context: z
    .object({
      pageAddress: z.string().nullable().describe('The full address of the source window.'),
      sectionId: z.string().nullable().describe('The open section.'),
      openItem: z.string().nullable().describe('The open item, when one was open.'),
      pageTitle: z.string().nullable().describe('The page title and breadcrumb.'),
      webVersion: z.string().nullable().describe('The `kr-web-version` tag.'),
      deploymentId: z.string().nullable().describe('The `kr-deployment-id` tag.'),
      deploymentTime: z.string().nullable().describe('The `kr-deployment-time` tag.'),
      windowWidth: z.number().int().nullable().describe('Width of the source window, in CSS pixels.'),
      windowHeight: z.number().int().nullable().describe('Height of the source window, in CSS pixels.'),
      theme: z.string().nullable().describe('The theme in use.'),
    })
    .describe('The page it was sent from, as captured.'),
  markers: z.array(HomebaseFeedbackMarker).describe('The markers the text names, in the order written.'),
  images: z.array(HomebaseFeedbackImage).describe('Annotated screenshots (stage F3; empty until then).'),
  notes: z.array(HomebaseFeedbackNote).describe('Developer notes and status changes, oldest first. Empty for a sender who is not a developer.'),
})
export type HomebaseFeedbackDetail = z.infer<typeof HomebaseFeedbackDetail>

export const HomebaseFeedbackListData = z.object({
  items: z.array(HomebaseFeedbackSummary).describe('Newest first.'),
  nextCursor: z.string().nullable().describe('Pass as `cursor` for the next page; null on the last page.'),
  viewer: HomebaseFeedbackViewer,
})
export type HomebaseFeedbackListData = z.infer<typeof HomebaseFeedbackListData>

export const HomebaseFeedbackSavedData = z.object({
  feedback: HomebaseFeedbackDetail.describe('The request after the save.'),
})
export type HomebaseFeedbackSavedData = z.infer<typeof HomebaseFeedbackSavedData>
