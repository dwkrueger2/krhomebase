// file: workers/feedback-viewer/src/main.ts
/**
 * The Feedback Viewer tool page. Stages:
 *  1. Connect to the KR Homebase page around the frame with the tool kit (`connectToHost`). Opened on its own (not
 *     from the KR Homebase menu), the page shows only how to open it. The colors of `feedbackColors.ts` are written
 *     onto the page root.
 *  2. Show the screen the address after `#` names (`route.ts`): the list, or one request with arrows to the requests
 *     before and after it in the list it was opened from. The list (tool version 1.4.0) is two tables, Open Items and
 *     Completed Items, sorted and paged in the page (`listTables.ts`) from every request, loaded once
 *     (`feedbackApi.listAll`) and kept while the person sorts and pages; it is loaded again after a request was open,
 *     when the kind changes, and when the page is reloaded.
 *  3. Handle the forms and buttons (`data-action` in `views.ts`): filter, save a status, priority or note change, copy
 *     for Claude. Every call goes through the kit (`feedbackApi.ts`); KR Homebase checks the person and the tool on
 *     each one.
 *  4. Unsaved changes (root `AGENTS.md`, "Unsaved Changes Standard"): the change form is dirty while it differs from
 *     what is saved. Save Changes shows only then, with what it will change beside it. Leaving a dirty request (a link,
 *     an arrow, the browser's back button inside the frame) asks "Leave without saving?" in the tool's own dialog, and
 *     `setDirty` tells KR Homebase so it asks before the tool itself is closed or left.
 *  5. The Markers switch (`markerPick.ts`): outline this tool's markers and copy one for a feedback request, since
 *     KR Homebase's Dev View cannot see inside the frame.
 *  6. The screenshots' Magnify (a lens in three sizes) and Pop out (`magnifier.ts`).
 */

import { connectToHost, type ToolHost } from '@krhomebase/tool-sdk/frame'
import { applyFeedbackTheme, paintTones, PRIORITY_TONES, STATUS_TONES, toneOf } from './feedbackColors.ts'
import { feedbackApi, problemText, type FeedbackAll, type FeedbackApi } from './feedbackApi.ts'
import { FEEDBACK_PRIORITIES, FEEDBACK_STATUSES, type FeedbackDetail, type FeedbackKind, type FeedbackPriority, type FeedbackStatus } from './feedbackTypes.ts'
import { listOrder, PAGE_SIZES, TABLE_NAMES, type PageSize, type TableName } from './listTables.ts'
import { installMagnifier, syncMagnifierControls } from './magnifier.ts'
import { installMarkerPick } from './markerPick.ts'
import { listHash, parseRoute, tablesOf, type ListFilter } from './route.ts'
import { tool } from './tool.ts'
import { busyHtml, detailView, draftChangeWords, isDraftDirty, leaveDialogHtml, listView, loadingView, messageView, type DraftChange, type Neighbors, type Notice } from './views.ts'
import './viewer.css'

const app = document.getElementById('app') as HTMLElement

let host: ToolHost | null = null
let api: FeedbackApi | null = null
/** Whether the person may change requests; learned from the list reply's `viewer`. */
let canTriage: boolean | null = null
/** The request on screen and the list filter to go back to. */
let current: FeedbackDetail | null = null
let lastListFilter: ListFilter = {}
/** The request codes of the list last shown, in order, for the Previous and Next arrows. */
let listCodes: string[] = []
/** Every request of the kind last listed, kept while the person sorts and pages; null to load again. */
let listCache: { kind: FeedbackKind | undefined; data: FeedbackAll } | null = null
/** The address after `#` of the screen on show, to put back when the person chooses Stay. */
let shownHash = ''
/** True while the change form differs from what is saved. */
let dirty = false
/** True while a save is on its way, so a second click does not send it twice. */
let busy = false

function show(html: string): void {
  app.innerHTML = html
  paintTones(app)
  // The magnifier is one setting for the page: every screenshot's tool row shows it (magnifier.ts).
  syncMagnifierControls(app)
}

/** The change form's values as the person has set them, or null when the form is not on screen. */
function readDraft(): DraftChange | null {
  const form = app.querySelector<HTMLFormElement>('form[data-action="change"]')
  if (!form) return null
  const data = new FormData(form)
  const status = String(data.get('status') ?? '')
  const priority = String(data.get('priority') ?? '')
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status) || !(FEEDBACK_PRIORITIES as readonly string[]).includes(priority)) return null
  return { status: status as FeedbackStatus, priority: priority as FeedbackPriority, note: String(data.get('note') ?? '') }
}

/**
 * Stage 4: works out whether the form is dirty, shows or hides Save Changes (its place is kept), writes what will
 * change beside it, colors the two selects by their chosen values, and tells KR Homebase (`setDirty`).
 */
function refreshDirty(): void {
  const form = app.querySelector<HTMLFormElement>('form[data-action="change"]')
  const draft = readDraft()
  dirty = Boolean(current && draft && isDraftDirty(current, draft))
  if (form && current && draft) {
    form.classList.toggle('dirty', dirty)
    const words = form.querySelector('.change-words')
    if (words) words.textContent = dirty ? draftChangeWords(current, draft) : ''
    const status = form.querySelector<HTMLSelectElement>('select[name="status"]')
    const priority = form.querySelector<HTMLSelectElement>('select[name="priority"]')
    if (status) status.dataset.fbTone = toneOf(STATUS_TONES, draft.status)
    if (priority) priority.dataset.fbTone = toneOf(PRIORITY_TONES, draft.priority)
    paintTones(form)
  }
  host?.setDirty(dirty)
}

/** The requests before and after the open one in the list last shown. */
function neighborsOf(code: string): Neighbors {
  const index = listCodes.indexOf(code)
  if (index < 0) return {}
  return { previous: listCodes[index - 1], next: listCodes[index + 1] }
}

function showDetail(notice?: Notice): void {
  if (!current) return
  show(detailView(current, { canTriage: canTriage === true, notice, listFilter: lastListFilter, neighbors: neighborsOf(current.code) }))
  host?.setTitle(`${current.code} ${current.title}`)
  refreshDirty()
}

/** Every request of one kind (or all): the kept copy when it is of that kind, else loaded through the API. */
async function loadList(kind: FeedbackKind | undefined): Promise<{ ok: true; data: FeedbackAll } | { ok: false; text: string }> {
  if (listCache && listCache.kind === kind) return { ok: true, data: listCache.data }
  if (!api) return { ok: false, text: 'Not connected to KR Homebase.' }
  const reply = await api.listAll(kind)
  if (!reply.ok) return { ok: false, text: problemText(reply.error, reply.requestId) }
  listCache = { kind, data: reply.data }
  return { ok: true, data: reply.data }
}

/** Stage 2: draws the screen the address names. */
async function render(): Promise<void> {
  if (!api) return
  shownHash = location.hash
  const route = parseRoute(location.hash)
  if (route.view === 'list') {
    lastListFilter = route.filter
    current = null
    if (!listCache || listCache.kind !== route.filter.kind) show(loadingView('Requests'))
    const list = await loadList(route.filter.kind)
    if (!list.ok) {
      show(messageView('Requests', list.text, false))
      return
    }
    canTriage = list.data.viewer.canTriage
    listCodes = listOrder(list.data.items, tablesOf(route.filter))
    show(listView(list.data, route.filter))
    host?.setTitle('Homebase Feedback')
    refreshDirty()
    return
  }
  show(loadingView('Request'))
  if (canTriage === null || !listCodes.length) {
    // Opened straight on a request: the list gives what the person may do and the order for the arrows.
    const who = await loadList(lastListFilter.kind)
    canTriage = who.ok ? who.data.viewer.canTriage : false
    if (who.ok) listCodes = listOrder(who.data.items, tablesOf(lastListFilter))
  }
  // A request may change while it is open (here or elsewhere), so the list is read again on the way back.
  listCache = null
  const reply = await api.get(route.number)
  if (!reply.ok) {
    current = null
    show(messageView('Request', problemText(reply.error, reply.requestId)))
    refreshDirty()
    return
  }
  current = reply.data.feedback
  showDetail()
}

/**
 * Stage 4: the "Leave without saving?" dialog. Stay (the default, and Escape) keeps the request and its changes;
 * Leave throws the changes away and goes on to `onLeave`.
 */
function askToLeave(onLeave: () => void): void {
  if (document.querySelector('[data-kr-element="feedback-viewer-leave-dialog"]')) return
  const holder = document.createElement('div')
  holder.innerHTML = leaveDialogHtml(current?.code ?? 'this request')
  const dialog = holder.firstElementChild as HTMLElement
  document.body.appendChild(dialog)
  const close = () => {
    dialog.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }
  document.addEventListener('keydown', onKey, true)
  dialog.addEventListener('click', (event) => {
    const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dialog]')?.dataset.dialog
    if (choice === 'stay') close()
    if (choice === 'leave') {
      close()
      dirty = false
      host?.setDirty(false)
      onLeave()
    }
  })
  dialog.querySelector<HTMLButtonElement>('button[data-dialog="stay"]')?.focus()
}

/** Copies the "Copy for Claude" words. The frame may not use the clipboard; then the words are selected for Ctrl+C. */
async function copyField(button: HTMLButtonElement): Promise<void> {
  const field = document.getElementById(button.dataset.copyTarget ?? '') as HTMLInputElement | null
  if (!field) return
  let copied = false
  try {
    await navigator.clipboard.writeText(field.value)
    copied = true
  } catch {
    field.focus()
    field.select()
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }
  }
  button.textContent = copied ? 'Copied' : 'Press Ctrl+C'
  setTimeout(() => {
    button.textContent = 'Copy'
  }, 2000)
}

/**
 * Saves the change form in one step, then shows the request as KR Homebase saved it, or the refusal.
 *
 * @param draft - The form's values (with the status Completed for Save and Mark Complete).
 * @param savedText - The message shown when the save succeeds.
 */
async function saveDraft(draft: DraftChange, savedText = 'Changes saved.'): Promise<void> {
  if (!api || !current || busy) return
  busy = true
  for (const control of Array.from(app.querySelectorAll('button, textarea, select'))) (control as HTMLButtonElement).disabled = true
  // The rainbow ring beside Save Changes while the save is on its way.
  app.querySelector('.save')?.insertAdjacentHTML('afterend', ` ${busyHtml('Saving...')}`)
  const reply = await api.change(current.number, draft)
  busy = false
  if (reply.ok) {
    current = reply.data.feedback
    showDetail({ kind: 'good', text: savedText })
  } else {
    showDetail({ kind: 'bad', text: problemText(reply.error, reply.requestId) })
    // Keep what the person chose, so a refused save does not lose it.
    const form = app.querySelector<HTMLFormElement>('form[data-action="change"]')
    if (form) {
      ;(form.elements.namedItem('status') as HTMLSelectElement).value = draft.status
      ;(form.elements.namedItem('priority') as HTMLSelectElement).value = draft.priority
      ;(form.elements.namedItem('note') as HTMLTextAreaElement).value = draft.note
      refreshDirty()
    }
  }
}

/** Stage 3: forms. */
app.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement
  event.preventDefault()
  const data = new FormData(form)
  const action = form.dataset.action
  if (action === 'filter') {
    // parseRoute keeps only known values, so the address never carries anything else. A new kind keeps each table's
    // sort and rows a page, and starts both on their first page.
    const route = parseRoute(`#/?${new URLSearchParams({ kind: String(data.get('kind') ?? '') }).toString()}`)
    const tables = tablesOf(lastListFilter)
    const kind = route.view === 'list' ? route.filter.kind : undefined
    location.hash = listHash({ kind, open: { ...tables.open, page: 1 }, completed: { ...tables.completed, page: 1 } })
    return
  }
  if (action === 'change' && current) {
    const draft = readDraft()
    // Save and Mark Complete (FB-0013): the form's values with the status Completed, saved even when nothing else changed.
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null
    if (draft && submitter?.value === 'complete') void saveDraft({ ...draft, status: 'done' }, 'Saved and marked Completed.')
    else if (draft && isDraftDirty(current, draft)) void saveDraft(draft)
  }
})

/** Stage 3: buttons, and stage 4: links inside the tool while the form is dirty. */
app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const link = target.closest<HTMLAnchorElement>('a[href^="#"]')
  if (link && dirty) {
    event.preventDefault()
    const hash = link.getAttribute('href') ?? '#/'
    askToLeave(() => {
      location.hash = hash
    })
    return
  }
  const button = target.closest('button[data-action]') as HTMLButtonElement | null
  if (button?.dataset.action === 'copy') void copyField(button)
})

app.addEventListener('input', () => refreshDirty())
app.addEventListener('change', (event) => {
  // A table's rows a page (10, 25, 50, 100): kept in the address, back on the first page.
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-action="page-size"]')
  const name = select?.dataset.table as TableName | undefined
  const size = Number(select?.value) as PageSize
  if (select && name && (TABLE_NAMES as readonly string[]).includes(name) && (PAGE_SIZES as readonly number[]).includes(size)) {
    location.hash = listHash({ ...lastListFilter, [name]: { ...tablesOf(lastListFilter)[name], size, page: 1 } })
    return
  }
  refreshDirty()
})

/** Stage 4: the browser's back and forward buttons inside the frame change the address without a click. */
window.addEventListener('hashchange', () => {
  if (dirty && location.hash !== shownHash) {
    const wanted = location.hash
    // Put the open request's address back without drawing again, then ask.
    history.replaceState(null, '', shownHash || '#/')
    askToLeave(() => {
      location.hash = wanted
    })
    return
  }
  void render()
})

/** Stage 1: connect, then draw. */
async function start(): Promise<void> {
  applyFeedbackTheme(document.documentElement)
  // The Markers switch: pick a marker of this tool for a feedback request (markerPick.ts).
  installMarkerPick(document)
  // The screenshots' Magnify and Pop out (magnifier.ts).
  installMagnifier(app)
  try {
    host = await connectToHost({ hostOrigins: tool.hostOrigins })
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    show(
      text.startsWith('NOT_IN_FRAME')
        ? messageView('Feedback Viewer', 'This is a KR Homebase tool. Open it from the KR Homebase menu (Feedback Viewer).', false)
        : messageView('Feedback Viewer', `Could not connect to KR Homebase: ${text}`, false),
    )
    return
  }
  api = feedbackApi(host.api)
  await render()
}

void start()
