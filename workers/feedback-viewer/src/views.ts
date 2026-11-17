// file: workers/feedback-viewer/src/views.ts
/**
 * The tool's screens as HTML text: the list, one request, and a message. `main.ts` places the text in the page and
 * handles the buttons and forms through `data-action` attributes (no inline scripts, so the page's
 * Content-Security-Policy can forbid them; see `public/_headers`).
 *
 * Every value from KR Homebase is written through `escapeHtml`. The request text is shown as text
 * (`white-space: pre-wrap` in `viewer.css`), never as HTML. Styling is the class names in `viewer.css`, which use the
 * KR Homebase theme values the tool kit applies to the page (`--kr-theme-*`). Kind, status and priority colors come
 * from `feedbackColors.ts`: an element names its tone with `data-fb-tone` (`toneAttr`) and `main.ts` paints it.
 */

import type { ListFilter } from './feedbackApi.ts'
import { KIND_TONES, PRIORITY_TONES, STATUS_TONES, toneOf, type FeedbackToneName } from './feedbackColors.ts'
import { LENS_SIZES } from './magnifier.ts'
import {
  copyForClaudeText,
  FEEDBACK_KINDS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  imageAddress,
  KIND_LABELS,
  labelOf,
  PRIORITY_LABELS,
  SHAPE_LABELS,
  STATUS_LABELS,
  type FeedbackDetail,
  type FeedbackImage,
  type FeedbackListData,
  type FeedbackNote,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackSummary,
} from './feedbackTypes.ts'
import { detailHash, listHash } from './route.ts'

/** A line shown above the screen: a refusal (`bad`) or a saved change (`good`). */
export interface Notice {
  kind: 'bad' | 'good'
  text: string
}

/** The change form's values as the person has set them (status, priority, note), not yet saved. */
export interface DraftChange {
  status: FeedbackStatus
  priority: FeedbackPriority
  note: string
}

/** Makes text safe to place in HTML, including inside attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** An ISO time as `2026-11-14 09:30Z` (the API sends UTC). */
function when(iso: string | null): string {
  if (!iso) return ''
  return escapeHtml(iso.replace('T', ' ').replace(/:\d\d(?:\.\d+)?Z$/, 'Z'))
}

function noticeHtml(notice: Notice | undefined): string {
  if (!notice) return ''
  return `<div class="notice ${notice.kind}" role="${notice.kind === 'bad' ? 'alert' : 'status'}">${escapeHtml(notice.text)}</div>`
}

/** The attribute that names an element's color set (`feedbackColors.ts`), painted by `main.ts`. */
export function toneAttr(tone: FeedbackToneName): string {
  return `data-fb-tone="${tone}"`
}

/** A colored pill: a kind, a status or a priority. */
export function pillHtml(tone: FeedbackToneName, label: string): string {
  return `<span class="pill" ${toneAttr(tone)}>${escapeHtml(label)}</span>`
}

/** The three pills of a request: kind, status, priority. */
function pillsHtml(item: Pick<FeedbackSummary, 'kind' | 'status' | 'priority'>): string {
  return [
    pillHtml(toneOf(KIND_TONES, item.kind), labelOf(KIND_LABELS, item.kind)),
    pillHtml(toneOf(STATUS_TONES, item.status), labelOf(STATUS_LABELS, item.status)),
    pillHtml(toneOf(PRIORITY_TONES, item.priority), labelOf(PRIORITY_LABELS, item.priority)),
  ].join(' ')
}

/**
 * The options of a select. With `tones`, each option names its color set (`data-fb-tone`), so the open list shows every
 * status or priority in its own color (the requester, Nov 16, 2026).
 */
function optionsHtml(values: readonly string[], labels: Record<string, string>, selected: string | undefined, allLabel?: string, tones?: Record<string, FeedbackToneName>): string {
  const all = allLabel === undefined ? '' : `<option value=""${selected ? '' : ' selected'}>${escapeHtml(allLabel)}</option>`
  return (
    all +
    values
      .map((value) => `<option value="${escapeHtml(value)}"${tones ? ` ${toneAttr(toneOf(tones, value))}` : ''}${value === selected ? ' selected' : ''}>${escapeHtml(labels[value] ?? value)}</option>`)
      .join('')
  )
}

/** The list: status and kind filters, newest first, one page at a time. */
export function listView(data: FeedbackListData, filter: ListFilter, notice?: Notice): string {
  const rows = data.items
    .map(
      // Each row is tinted by its status (the requester, Nov 16, 2026), with a left bar in the status color.
      (item) => `<tr ${toneAttr(toneOf(STATUS_TONES, item.status))}>
<td><a href="${escapeHtml(detailHash(item.code))}">${escapeHtml(item.code)}</a></td>
<td>${pillHtml(toneOf(KIND_TONES, item.kind), labelOf(KIND_LABELS, item.kind))}</td>
<td><a href="${escapeHtml(detailHash(item.code))}">${escapeHtml(item.title)}</a></td>
<td>${pillHtml(toneOf(STATUS_TONES, item.status), labelOf(STATUS_LABELS, item.status))}</td>
<td>${pillHtml(toneOf(PRIORITY_TONES, item.priority), labelOf(PRIORITY_LABELS, item.priority))}</td>
<td>${escapeHtml(item.submittedByLabel)}</td>
<td>${escapeHtml(item.sectionId ?? '')}</td>
<td class="num">${item.markerCount}</td>
<td class="num">${item.noteCount}</td>
<td>${when(item.createdAt)}</td>
</tr>`,
    )
    .join('\n')
  const table = data.items.length
    ? `<table data-kr-element="feedback-viewer-list">
<thead><tr><th>Number</th><th>Kind</th><th>Title</th><th>Status</th><th>Priority</th><th>From</th><th>Section</th><th>Markers</th><th>Notes</th><th>Sent (UTC)</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
    : '<p class="meta">No requests match.</p>'
  const first = filter.cursor ? `<a href="${escapeHtml(listHash({ ...filter, cursor: undefined }))}">First page</a>` : ''
  const next = data.nextCursor ? `<a href="${escapeHtml(listHash({ ...filter, cursor: data.nextCursor }))}">Next page</a>` : ''
  const paging = first || next ? `<p class="paging">${[first, next].filter(Boolean).join(' · ')}</p>` : ''
  const readOnly = data.viewer.canTriage ? '' : '<p class="meta">You may read requests but not change them (you need developer_tools update).</p>'
  return `${noticeHtml(notice)}
<h2>Requests</h2>
<form class="inline" data-action="filter" data-kr-element="feedback-viewer-filter">
<label>Status <select name="status">${optionsHtml(FEEDBACK_STATUSES, STATUS_LABELS, filter.status, 'All')}</select></label>
<label>Kind <select name="kind">${optionsHtml(FEEDBACK_KINDS, KIND_LABELS, filter.kind, 'All')}</select></label>
<button type="submit">Show</button>
</form>
${readOnly}
${table}
${paging}`
}

/** One shape in words: what it is, and the markers it points at. */
export function shapeWords(shape: FeedbackImage['shapes'][number]): string {
  const what = shape.type === 'text' ? `Text "${shape.text ?? ''}"` : labelOf(SHAPE_LABELS, shape.type)
  const where = shape.type === 'arrow' ? 'pointing at' : shape.type === 'text' ? 'on' : 'around'
  return shape.nearMarkers.length ? `${what} ${where} ${shape.nearMarkers.join(', ')}` : `${what} (no marker under it)`
}

/**
 * A screenshot's tool row, in its upper right (`magnifier.ts`): Magnify (on or off, for every screenshot), the lens
 * size, and Pop out (the image alone in its own window). `main.ts` shows the page's magnifier state on it after drawing.
 */
export function imageToolsHtml(address: string): string {
  const sizes = Object.entries(LENS_SIZES)
    .map(([value, size]) => `<option value="${value}"${value === 'medium' ? ' selected' : ''}>${escapeHtml(size.label)}</option>`)
    .join('')
  return `<div class="shot-tools" data-kr-element="feedback-viewer-image-tools">
<button type="button" class="magnify-button" data-action="magnify" aria-pressed="false" title="Magnify: point at a screenshot to enlarge that part (Escape stops)">Magnify</button>
<select data-action="magnify-size" aria-label="Magnifier size" title="Magnifier size">${sizes}</select>
<button type="button" data-action="pop-image" data-src="${escapeHtml(address)}" title="Open this screenshot in its own window">Pop out</button>
</div>`
}

/** One screenshot: the image (from this tool's own image script) with its tool row, and its shapes in words. */
function imageHtml(item: Pick<FeedbackDetail, 'code'>, image: FeedbackImage, index: number): string {
  const address = imageAddress(image)
  const size = image.width && image.height ? `${image.width} x ${image.height}, ` : ''
  const picture = address
    ? `<div class="shot-frame">${imageToolsHtml(address)}<img src="${escapeHtml(address)}" alt="${escapeHtml(`Screenshot ${index + 1} of ${item.code}`)}" loading="lazy"></div>`
    : '<p class="meta">This image cannot be shown: KR Homebase has no image ticket secret yet (README.md, go-live steps).</p>'
  const shapes = image.shapes.length ? `<ul class="shapes">${image.shapes.map((shape) => `<li>${escapeHtml(shapeWords(shape))}</li>`).join('')}</ul>` : '<p class="meta">Nothing drawn on it.</p>'
  return `<figure class="shot" data-kr-element="feedback-viewer-image">
${picture}
<figcaption class="meta">${escapeHtml(`${size}${Math.round(image.byteSize / 1024)} KB, ${image.markerMapCount} markers in the shot, added `)}${when(image.createdAt)}</figcaption>
${shapes}
</figure>`
}

function changeWords(note: FeedbackNote): string {
  if (note.noteType === 'status_change') return `Status ${labelOf(STATUS_LABELS, note.fromValue)} to ${labelOf(STATUS_LABELS, note.toValue)}. `
  if (note.noteType === 'priority_change') return `Priority ${labelOf(PRIORITY_LABELS, note.fromValue)} to ${labelOf(PRIORITY_LABELS, note.toValue)}. `
  return ''
}

/**
 * Whether the change form differs from what is saved (root `AGENTS.md`, "Unsaved Changes Standard": dirty means
 * different from the saved values, so setting a value back makes the form clean again).
 */
export function isDraftDirty(item: Pick<FeedbackDetail, 'status' | 'priority'>, draft: DraftChange): boolean {
  return draft.status !== item.status || draft.priority !== item.priority || draft.note.trim() !== ''
}

/**
 * What Save Changes will change, shown beside the button while the form is dirty (tool kit guide, rule 4: show the
 * person what the tool will change before it changes it). Empty when nothing would change.
 */
export function draftChangeWords(item: Pick<FeedbackDetail, 'status' | 'priority'>, draft: DraftChange): string {
  const parts: string[] = []
  if (draft.status !== item.status) parts.push(`Status ${labelOf(STATUS_LABELS, item.status)} → ${labelOf(STATUS_LABELS, draft.status)}`)
  if (draft.priority !== item.priority) parts.push(`Priority ${labelOf(PRIORITY_LABELS, item.priority)} → ${labelOf(PRIORITY_LABELS, draft.priority)}`)
  if (draft.note.trim()) parts.push(parts.length ? 'with the note' : 'Add the note')
  return parts.join(', ')
}

/** The requests before and after the open one in the list it was opened from (`FB-0011`), for the arrows. */
export interface Neighbors {
  previous?: string
  next?: string
}

/** The arrows and the way back to the list, above a request. */
function detailNavHtml(listFilter: ListFilter, neighbors: Neighbors): string {
  const arrow = (code: string | undefined, label: string, title: string, rel: 'prev' | 'next') =>
    code
      ? `<a class="nav-arrow" href="${escapeHtml(detailHash(code))}" rel="${rel}" title="${escapeHtml(`${title}: ${code}`)}" data-kr-element="feedback-viewer-${rel}">${label}</a>`
      : `<span class="nav-arrow off" aria-disabled="true" title="${escapeHtml(`No ${title.toLowerCase()} in this list`)}">${label}</span>`
  return `<nav class="detail-nav" data-kr-element="feedback-viewer-detail-nav">
${arrow(neighbors.previous, '‹ Previous', 'Previous request', 'prev')}
${arrow(neighbors.next, 'Next ›', 'Next request', 'next')}
<a href="${escapeHtml(listHash(listFilter))}">All requests</a>
</nav>`
}

/**
 * The "Leave without saving?" dialog (root `AGENTS.md`, "Unsaved Changes Standard"): the tool's own dialog, never the
 * browser's `confirm` (the frame forbids it). `main.ts` places it outside the screen and wires the two buttons.
 */
export function leaveDialogHtml(code: string): string {
  return `<div class="dialog-backdrop" data-kr-element="feedback-viewer-leave-dialog">
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-text">
<h2 id="leave-title">Leave without saving?</h2>
<p id="leave-text">Your changes to ${escapeHtml(code)} are not saved. Leave throws them away.</p>
<div class="dialog-buttons">
<button type="button" data-dialog="stay">Stay</button>
<button type="button" class="danger" data-dialog="leave">Leave</button>
</div>
</div>
</div>`
}

/**
 * One request: its text, markers, images, notes, the page it was sent from, the "Copy for Claude" box, and (for a
 * person who may triage) the status form and the note form.
 */
export function detailView(item: FeedbackDetail, options: { canTriage: boolean; notice?: Notice; listFilter: ListFilter; neighbors?: Neighbors }): string {
  const context = item.context
  const contextRows: Array<[string, string]> = [
    ['Address', context.pageAddress ?? ''],
    ['Section', context.sectionId ?? ''],
    ['Open item', context.openItem ?? ''],
    ['Page title', context.pageTitle ?? ''],
    ['Web version', context.webVersion ?? ''],
    ['Deployment id', context.deploymentId ?? ''],
    ['Deployment time', context.deploymentTime ?? ''],
    ['Window', context.windowWidth != null && context.windowHeight != null ? `${context.windowWidth} x ${context.windowHeight}` : ''],
    ['Theme', context.theme ?? ''],
    ['Sender role', item.submitterRole ?? ''],
  ]
  const markers = item.markers.length
    ? `<table data-kr-element="feedback-viewer-markers"><thead><tr><th>Marker</th><th>On the page when sent</th><th>Box (x, y, w, h)</th></tr></thead><tbody>${item.markers
        .map(
          (marker) =>
            `<tr><td><code>${escapeHtml(marker.pattern)}</code></td><td>${marker.foundAtCapture ? 'Yes' : 'No'}</td><td>${
              marker.box ? escapeHtml(`${Math.round(marker.box.x)}, ${Math.round(marker.box.y)}, ${Math.round(marker.box.width)}, ${Math.round(marker.box.height)}`) : ''
            }</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="meta">The text names no markers.</p>'
  const images = item.images.length ? item.images.map((image, index) => imageHtml(item, image, index)).join('\n') : '<p class="meta">No screenshots.</p>'
  const notes = item.notes.length
    ? item.notes
        .map((note) => `<div class="note"><div class="meta">${escapeHtml(note.authorLabel)}, ${when(note.createdAt)}</div><div>${escapeHtml(changeWords(note))}${escapeHtml(note.text ?? '')}</div></div>`)
        .join('')
    : '<p class="meta">No notes yet.</p>'

  // One form saves the status, the priority and a note together (the API keeps a note sent with no other change as a
  // plain note). Save Changes keeps its place but shows only while the form differs from what is saved; `main.ts`
  // sets `dirty` on the form and writes what will change beside the button (root AGENTS.md, Unsaved Changes Standard).
  const changeForm = !options.canTriage
    ? '<p class="meta">You may read this request but not change it (you need developer_tools update).</p>'
    : `<form data-action="change" data-kr-element="feedback-viewer-change">
<div class="form-row"><label>Status <select name="status" ${toneAttr(toneOf(STATUS_TONES, item.status))}>${optionsHtml(FEEDBACK_STATUSES, STATUS_LABELS, item.status, undefined, STATUS_TONES)}</select></label>
<label>Priority <select name="priority" ${toneAttr(toneOf(PRIORITY_TONES, item.priority))}>${optionsHtml(FEEDBACK_PRIORITIES, PRIORITY_LABELS, item.priority, undefined, PRIORITY_TONES)}</select></label></div>
<label class="block">Note (optional)<textarea name="note" maxlength="10000"></textarea></label>
<div class="save-row"><button type="submit" class="save" data-kr-element="feedback-viewer-save">Save Changes</button><span class="change-words meta" aria-live="polite"></span></div>
</form>`

  return `${detailNavHtml(options.listFilter, options.neighbors ?? {})}
${noticeHtml(options.notice)}
<header class="detail-head" data-kr-element="feedback-viewer-detail-head">
<h2>${escapeHtml(item.code)}: ${escapeHtml(item.title)}</h2>
<div class="pills">${pillsHtml(item)}</div>
<p class="meta">From ${escapeHtml(item.submittedByLabel)} · sent ${when(item.createdAt)}${item.updatedAt ? ` · changed ${when(item.updatedAt)}` : ''}</p>
</header>
<div class="copy" data-kr-element="feedback-viewer-copy-for-claude">
<label for="copy-for-claude">Copy for Claude</label>
<input id="copy-for-claude" type="text" readonly value="${escapeHtml(copyForClaudeText(item.number))}">
<button type="button" data-action="copy" data-copy-target="copy-for-claude">Copy</button>
</div>
<div class="grid">
<section>
<h3>Request</h3>
<div class="body" data-kr-element="feedback-viewer-body">${escapeHtml(item.body)}</div>
<h3>Markers</h3>
${markers}
<h3>Images</h3>
${images}
<h3>Notes</h3>
<div data-kr-element="feedback-viewer-notes">${notes}</div>
</section>
<section>
<h3>Status, priority and notes</h3>
${changeForm}
<h3>Page it was sent from</h3>
<table data-kr-element="feedback-viewer-context"><tbody>${contextRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>
</section>
</div>`
}

/** A plain message in place of a screen (not connected, refused). */
export function messageView(title: string, text: string, withListLink = true): string {
  return `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${withListLink ? `<p><a href="#/">All requests</a></p>` : ''}`
}

/**
 * The busy signal: the rainbow ring KR Homebase uses for loading and saving (its `RainbowBusySpinner`, drawn here
 * with this tool's own CSS, `.busy` in `viewer.css`), with the words beside it for screen readers too.
 */
export function busyHtml(text: string): string {
  return `<span class="busy" role="status" aria-live="polite"><span class="busy-ring" aria-hidden="true"></span><span>${escapeHtml(text)}</span></span>`
}

/** A screen that is loading: its title and the busy signal. */
export function loadingView(title: string): string {
  return `<h2>${escapeHtml(title)}</h2><p>${busyHtml('Loading...')}</p>`
}
