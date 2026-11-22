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
 *   POST  /v1/homebase-feedback/{number}/images  add an annotated screenshot (its sender, or a developer; stage F3)
 *
 * Images (stage F3): the Feedback pop-out draws the source window's page to a PNG, the person draws rectangles,
 * arrows, text and redactions over it, and the flattened PNG is uploaded with the shapes as data (coordinates 0 to 1
 * of the image) and the marker map (every `data-kr-*` element in the shot, with its box, also 0 to 1). The API keeps
 * the PNG in the private R2 bucket `kr-homebase-feedback` and works out, for each shape, the markers it points at
 * (`nearMarkers`), so a reader sees "a rectangle around data-kr-element=..." as data. Each image in a reply carries a
 * short-lived ticket (`HOMEBASE_FEEDBACK_IMAGE_TICKET_*`): the Feedback viewer's own Worker checks it and serves the
 * PNG from its own binding to the same bucket.
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

/**
 * What kind of request it is. `usability` was added by migration 057 (FB-0006, Nov 16, 2026); the stored values `issue`
 * and `feature` keep their names and are shown as "Bug" and "Feature request".
 */
export const HOMEBASE_FEEDBACK_KINDS = ['issue', 'usability', 'feature', 'question'] as const
/** Where a request stands, in the order a request usually moves. `reopened` and `needs_info` were added by migration 057. */
export const HOMEBASE_FEEDBACK_STATUSES = ['new', 'reopened', 'triaged', 'needs_info', 'planned', 'in_progress', 'done', 'will_not_do'] as const
/** How urgent it is (set by a developer; Normal when sent). */
export const HOMEBASE_FEEDBACK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
/** The two marker attributes a request may name. */
export const HOMEBASE_FEEDBACK_MARKER_ATTRIBUTES = ['data-kr-id', 'data-kr-element'] as const

export const HomebaseFeedbackKind = z
  .enum(HOMEBASE_FEEDBACK_KINDS)
  .describe('Issue (a bug: something wrong), usability (works, but is hard to use), feature (a change or addition) or question.')
export type HomebaseFeedbackKind = z.infer<typeof HomebaseFeedbackKind>
export const HomebaseFeedbackStatus = z.enum(HOMEBASE_FEEDBACK_STATUSES).describe('Where the request stands.')
export type HomebaseFeedbackStatus = z.infer<typeof HomebaseFeedbackStatus>
export const HomebaseFeedbackPriority = z.enum(HOMEBASE_FEEDBACK_PRIORITIES).describe('How urgent the request is.')
export type HomebaseFeedbackPriority = z.infer<typeof HomebaseFeedbackPriority>
export const HomebaseFeedbackMarkerAttribute = z.enum(HOMEBASE_FEEDBACK_MARKER_ATTRIBUTES).describe('The marker attribute named.')
export type HomebaseFeedbackMarkerAttribute = z.infer<typeof HomebaseFeedbackMarkerAttribute>

/** Plain labels for the screens and the script. */
export const HOMEBASE_FEEDBACK_KIND_LABELS: Record<HomebaseFeedbackKind, string> = { issue: 'Bug', usability: 'Usability', feature: 'Feature request', question: 'Question' }
export const HOMEBASE_FEEDBACK_STATUS_LABELS: Record<HomebaseFeedbackStatus, string> = {
  new: 'New',
  reopened: 'Reopened',
  triaged: 'Triaged',
  needs_info: 'Needs info',
  planned: 'Planned',
  in_progress: 'In progress',
  // Shown as Completed (the requester, Nov 17, 2026, repository patch 58); the stored value stays `done`.
  done: 'Completed',
  will_not_do: 'Will not do',
}
/** Priority as number and words (FB-0006): P1 is the most urgent. */
export const HOMEBASE_FEEDBACK_PRIORITY_LABELS: Record<HomebaseFeedbackPriority, string> = { low: 'P4 Low', normal: 'P3 Normal', high: 'P2 High', urgent: 'P1 Urgent' }

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
    // Written without the `i` flag (it matches the same text: `FB`, `fb`, `Fb`, `fB`), because the API reference
    // writer copies the flag into the pattern text as `.../i` (tool kit 1.1.0, repository patch 67).
    .regex(/^(?:[Ff][Bb]-?)?\d{1,9}$/, 'A request number is FB-0012 or 12.')
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
  submittedByDeveloper: z.boolean().optional().describe('The sender holds the Internal Developer or Super Admin role set now: their requests come first (the requester, Nov 17, 2026).'),
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

// ---------------------------------------------------------------------------------------------------------------
// Images (stage F3)
// ---------------------------------------------------------------------------------------------------------------

/** The kinds of shape the annotation editor draws. A redaction is solid black and burned into the PNG. */
export const HOMEBASE_FEEDBACK_SHAPE_TYPES = ['rectangle', 'arrow', 'text', 'redact'] as const
/** The most images one request keeps. */
export const HOMEBASE_FEEDBACK_MAX_IMAGES = 5
/** The largest PNG accepted, in bytes (8 MB). */
export const HOMEBASE_FEEDBACK_MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** The most shapes one image keeps. */
export const HOMEBASE_FEEDBACK_MAX_SHAPES = 100
/** The most marker map entries one image keeps. */
export const HOMEBASE_FEEDBACK_MAX_MAP_ENTRIES = 400
/** How long an image ticket lasts, in seconds (10 minutes). */
export const HOMEBASE_FEEDBACK_IMAGE_TICKET_SECONDS = 600
/**
 * What an image ticket signs: `homebase-feedback-image|<r2 key>|<expiry, Unix seconds>`, HMAC-SHA256 with the secret
 * `KR_FEEDBACK_IMAGE_TICKET_SECRET` (held by the API and the Feedback viewer Worker, nobody else). The ticket text is
 * `<expiry>.<signature as base64url>`. The viewer Worker (`workers/feedback-viewer/worker/imageTicket.ts`) writes the
 * same rule out itself, because an outside tool cannot import this package; a test keeps the two equal.
 */
export const HOMEBASE_FEEDBACK_IMAGE_TICKET_PURPOSE = 'homebase-feedback-image'

/** The text an image ticket signs. */
export function feedbackImageTicketMessage(r2Key: string, expiresAt: number): string {
  return `${HOMEBASE_FEEDBACK_IMAGE_TICKET_PURPOSE}|${r2Key}|${expiresAt}`
}

/** The R2 key of a feedback image: `feedback/FB-0012/<image id>.png`. */
export const HOMEBASE_FEEDBACK_IMAGE_KEY_PATTERN = /^feedback\/FB-\d{4,9}\/hfi_[0-9a-f-]{36}\.png$/

export const HomebaseFeedbackShapeType = z.enum(HOMEBASE_FEEDBACK_SHAPE_TYPES).describe('Rectangle, arrow, text or redaction (solid black, burned into the PNG).')
export type HomebaseFeedbackShapeType = z.infer<typeof HomebaseFeedbackShapeType>
export const HOMEBASE_FEEDBACK_SHAPE_LABELS: Record<HomebaseFeedbackShapeType, string> = { rectangle: 'Rectangle', arrow: 'Arrow', text: 'Text', redact: 'Redaction' }

/** A position along one side of the image: 0 is the left or top edge, 1 the right or bottom edge. */
const unit = (what: string) => z.number().finite().min(0).max(1).describe(what)

/** A box on the image, every value 0 to 1 of the image width or height. */
export const HomebaseFeedbackUnitBox = z.object({
  x: unit('Left edge, 0 to 1 of the image width.'),
  y: unit('Top edge, 0 to 1 of the image height.'),
  width: unit('Width, 0 to 1 of the image width.'),
  height: unit('Height, 0 to 1 of the image height.'),
})
export type HomebaseFeedbackUnitBox = z.infer<typeof HomebaseFeedbackUnitBox>

/**
 * One shape as the editor sends it. Rectangles and redactions are boxes; an arrow runs from its tail (x1, y1) to its
 * head (x2, y2); a text starts at (x, y).
 */
export const HomebaseFeedbackShapeInput = z.discriminatedUnion('type', [
  HomebaseFeedbackUnitBox.extend({ type: z.literal('rectangle') }),
  HomebaseFeedbackUnitBox.extend({ type: z.literal('redact') }),
  z.object({
    type: z.literal('arrow'),
    x1: unit('Tail, 0 to 1 of the image width.'),
    y1: unit('Tail, 0 to 1 of the image height.'),
    x2: unit('Head, 0 to 1 of the image width.'),
    y2: unit('Head, 0 to 1 of the image height.'),
  }),
  z.object({
    type: z.literal('text'),
    x: unit('Where the text starts, 0 to 1 of the image width.'),
    y: unit('Where the text starts, 0 to 1 of the image height.'),
    text: z.string().trim().min(1).max(300).describe('The words written on the image.'),
  }),
])
export type HomebaseFeedbackShapeInput = z.infer<typeof HomebaseFeedbackShapeInput>

/** One `data-kr-*` element seen in the shot. */
export const HomebaseFeedbackMapEntry = z.object({
  attribute: HomebaseFeedbackMarkerAttribute,
  value: z.string().trim().min(1).max(200).describe('The marker value.'),
  box: HomebaseFeedbackUnitBox.describe('Where it was on the image.'),
})
export type HomebaseFeedbackMapEntry = z.infer<typeof HomebaseFeedbackMapEntry>

/** The shapes of one image. */
export const HomebaseFeedbackShapeList = z.array(HomebaseFeedbackShapeInput).max(HOMEBASE_FEEDBACK_MAX_SHAPES)
/** The marker map of one image. */
export const HomebaseFeedbackMarkerMap = z.array(HomebaseFeedbackMapEntry).max(HOMEBASE_FEEDBACK_MAX_MAP_ENTRIES)

/** The upload form (multipart): the flattened PNG and the shapes and marker map as JSON text. The API reads the size from the PNG. */
export const HomebaseFeedbackImageUploadForm = z.object({
  file: z.any().describe('The annotated screenshot: a PNG of at most 8 MB, with the shapes and redactions already drawn in.'),
  shapes: z.string().max(200_000).default('[]').describe('The shapes as JSON (`HomebaseFeedbackShapeInput[]`, at most 100).'),
  markerMap: z.string().max(400_000).default('[]').describe('The marker map as JSON (`HomebaseFeedbackMapEntry[]`, at most 400).'),
})
export type HomebaseFeedbackImageUploadForm = z.infer<typeof HomebaseFeedbackImageUploadForm>

/** A shape as kept and sent back: what was drawn, plus the markers it points at. */
export const HomebaseFeedbackShape = z.object({
  type: HomebaseFeedbackShapeType,
  x: z.number().nullable().describe('Left edge (rectangle, redaction) or where a text starts, 0 to 1; null for an arrow.'),
  y: z.number().nullable().describe('Top edge, or where a text starts, 0 to 1; null for an arrow.'),
  width: z.number().nullable().describe('Width, 0 to 1 (rectangle, redaction).'),
  height: z.number().nullable().describe('Height, 0 to 1 (rectangle, redaction).'),
  x1: z.number().nullable().describe('Arrow tail, 0 to 1.'),
  y1: z.number().nullable().describe('Arrow tail, 0 to 1.'),
  x2: z.number().nullable().describe('Arrow head, 0 to 1.'),
  y2: z.number().nullable().describe('Arrow head, 0 to 1.'),
  text: z.string().nullable().describe('The words (text shapes).'),
  nearMarkers: z
    .array(z.string())
    .describe(
      'The markers the shape points at, as `data-kr-id="..."`, at most five: for a rectangle or redaction the largest elements inside it first; for an arrow head or a text the innermost element under it first.',
    ),
})
export type HomebaseFeedbackShape = z.infer<typeof HomebaseFeedbackShape>

/** A ticket to read one image from the Feedback viewer Worker. */
export const HomebaseFeedbackImageTicket = z.object({
  value: z.string().describe('`<expiry>.<signature>`, sent as `?ticket=` with the image key.'),
  expiresAt: z.string().describe('When it stops working (ISO time).'),
})
export type HomebaseFeedbackImageTicket = z.infer<typeof HomebaseFeedbackImageTicket>

/** An annotated screenshot (stage F3). */
export const HomebaseFeedbackImage = z.object({
  id: z.string().describe('Image id.'),
  r2Key: z.string().describe('Where the PNG is kept in the private feedback bucket.'),
  contentType: z.string().describe('The file type, `image/png`.'),
  byteSize: z.number().int().describe('Size in bytes.'),
  width: z.number().int().nullable().describe('Width in pixels.'),
  height: z.number().int().nullable().describe('Height in pixels.'),
  createdAt: z.string().describe('When it was added (ISO time).'),
  shapes: z.array(HomebaseFeedbackShape).describe('The shapes drawn on it, with the markers each points at.'),
  markerMapCount: z.number().int().describe('How many `data-kr-*` elements were seen in the shot.'),
  ticket: HomebaseFeedbackImageTicket.nullable().describe('A short-lived ticket for the Feedback viewer to show the image; null when the API has no ticket secret.'),
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
  images: z.array(HomebaseFeedbackImage).describe('Annotated screenshots, oldest first.'),
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
