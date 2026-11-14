// file: workers/feedback-viewer/src/views.ts
/**
 * The tool's screens as HTML text: the list, one request, and a message. `main.ts` places the text in the page and
 * handles the buttons and forms through `data-action` attributes (no inline scripts, so the page's
 * Content-Security-Policy can forbid them; see `public/_headers`).
 *
 * Every value from KR Homebase is written through `escapeHtml`. The request text is shown as text
 * (`white-space: pre-wrap` in `viewer.css`), never as HTML. Styling is the class names in `viewer.css`, which use the
 * KR Homebase theme values the tool kit applies to the page (`--kr-theme-*`).
 */

import type { ListFilter } from './feedbackApi.ts'
import {
  copyForClaudeText,
  FEEDBACK_KINDS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  KIND_LABELS,
  labelOf,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type FeedbackDetail,
  type FeedbackListData,
  type FeedbackNote,
  type FeedbackPriority,
  type FeedbackStatus,
} from './feedbackTypes.ts'
import { detailHash, listHash } from './route.ts'

/** A line shown above the screen: a refusal (`bad`) or a saved change (`good`). */
export interface Notice {
  kind: 'bad' | 'good'
  text: string
}

/** A status and priority change waiting for the person to confirm it (tool kit guide, rule 3). */
export interface PendingChange {
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

function optionsHtml(values: readonly string[], labels: Record<string, string>, selected: string | undefined, allLabel?: string): string {
  const all = allLabel === undefined ? '' : `<option value=""${selected ? '' : ' selected'}>${escapeHtml(allLabel)}</option>`
  return all + values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(labels[value] ?? value)}</option>`).join('')
}

/** The list: status and kind filters, newest first, one page at a time. */
export function listView(data: FeedbackListData, filter: ListFilter, notice?: Notice): string {
  const rows = data.items
    .map(
      (item) => `<tr>
<td><a href="${escapeHtml(detailHash(item.code))}">${escapeHtml(item.code)}</a></td>
<td>${escapeHtml(labelOf(KIND_LABELS, item.kind))}</td>
<td><a href="${escapeHtml(detailHash(item.code))}">${escapeHtml(item.title)}</a></td>
<td>${escapeHtml(labelOf(STATUS_LABELS, item.status))}</td>
<td>${escapeHtml(labelOf(PRIORITY_LABELS, item.priority))}</td>
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

function changeWords(note: FeedbackNote): string {
  if (note.noteType === 'status_change') return `Status ${labelOf(STATUS_LABELS, note.fromValue)} to ${labelOf(STATUS_LABELS, note.toValue)}. `
  if (note.noteType === 'priority_change') return `Priority ${labelOf(PRIORITY_LABELS, note.fromValue)} to ${labelOf(PRIORITY_LABELS, note.toValue)}. `
  return ''
}

/** The confirmation shown before a status or priority change is saved: what changes, from what, to what. */
export function pendingChangeWords(item: Pick<FeedbackDetail, 'code' | 'status' | 'priority'>, change: PendingChange): string {
  const parts: string[] = []
  if (change.status !== item.status) parts.push(`status from ${labelOf(STATUS_LABELS, item.status)} to ${labelOf(STATUS_LABELS, change.status)}`)
  if (change.priority !== item.priority) parts.push(`priority from ${labelOf(PRIORITY_LABELS, item.priority)} to ${labelOf(PRIORITY_LABELS, change.priority)}`)
  const what = parts.length ? `Change ${item.code}: ${parts.join(' and ')}` : `Nothing changes on ${item.code}`
  return change.note.trim() ? `${what}, with the note below.` : `${what}.`
}

/**
 * One request: its text, markers, images, notes, the page it was sent from, the "Copy for Claude" box, and (for a
 * person who may triage) the status form and the note form.
 */
export function detailView(item: FeedbackDetail, options: { canTriage: boolean; pending?: PendingChange; notice?: Notice; listFilter: ListFilter }): string {
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
  const images = item.images.length
    ? `<ul>${item.images
        .map((image) => `<li>${escapeHtml(image.id)}: ${escapeHtml(image.contentType)}, ${image.byteSize} bytes${image.width && image.height ? `, ${image.width} x ${image.height}` : ''} (${when(image.createdAt)})</li>`)
        .join('')}</ul><p class="meta">Showing the images themselves comes with stage F3.</p>`
    : '<p class="meta">No images (screenshots come with stage F3).</p>'
  const notes = item.notes.length
    ? item.notes
        .map((note) => `<div class="note"><div class="meta">${escapeHtml(note.authorLabel)}, ${when(note.createdAt)}</div><div>${escapeHtml(changeWords(note))}${escapeHtml(note.text ?? '')}</div></div>`)
        .join('')
    : '<p class="meta">No notes yet.</p>'

  const pending = options.pending
  const changeForm = !options.canTriage
    ? '<p class="meta">You may read this request but not change it (you need developer_tools update).</p>'
    : pending
      ? `<div class="confirm" data-kr-element="feedback-viewer-confirm-change">
<p>${escapeHtml(pendingChangeWords(item, pending))}</p>
${pending.note.trim() ? `<div class="body">${escapeHtml(pending.note)}</div>` : ''}
<button type="button" data-action="confirm-change">Save change</button>
<button type="button" data-action="cancel-change">Cancel</button>
</div>`
      : `<form data-action="change" data-kr-element="feedback-viewer-change">
<div class="form-row"><label>Status <select name="status">${optionsHtml(FEEDBACK_STATUSES, STATUS_LABELS, item.status)}</select></label>
<label>Priority <select name="priority">${optionsHtml(FEEDBACK_PRIORITIES, PRIORITY_LABELS, item.priority)}</select></label></div>
<label class="block">Note (optional)<textarea name="note" maxlength="10000"></textarea></label>
<button type="submit">Review change</button>
</form>`
  const noteForm = options.canTriage
    ? `<h3>Add a note</h3>
<form data-action="note" data-kr-element="feedback-viewer-add-note">
<textarea name="text" maxlength="10000" required></textarea>
<button type="submit">Add note</button>
</form>`
    : ''

  return `<p><a href="${escapeHtml(listHash(options.listFilter))}">All requests</a></p>
${noticeHtml(options.notice)}
<h2>${escapeHtml(item.code)}: ${escapeHtml(item.title)}</h2>
<p class="meta">${escapeHtml(labelOf(KIND_LABELS, item.kind))} · ${escapeHtml(labelOf(STATUS_LABELS, item.status))} · ${escapeHtml(labelOf(PRIORITY_LABELS, item.priority))} · from ${escapeHtml(
    item.submittedByLabel,
  )} · sent ${when(item.createdAt)}${item.updatedAt ? ` · changed ${when(item.updatedAt)}` : ''}</p>
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
<h3>Status and priority</h3>
${changeForm}
${noteForm}
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
