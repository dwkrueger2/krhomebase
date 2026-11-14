// file: workers/feedback-viewer/src/main.ts
/**
 * The Feedback Viewer tool page. Stages:
 *  1. Connect to the KR Homebase page around the frame with the tool kit (`connectToHost`). Opened on its own (not
 *     from the KR Homebase menu), the page shows only how to open it.
 *  2. Show the screen the address after `#` names (`route.ts`): the list, or one request.
 *  3. Handle the forms and buttons (`data-action` in `views.ts`): filter, review and confirm a status change, add a
 *     note, copy for Claude. Every call goes through the kit (`feedbackApi.ts`); KR Homebase checks the person and the
 *     tool on each one.
 *  4. Tell KR Homebase the pop-out title (`setTitle`) and whether unsaved text is waiting (`setDirty`).
 */

import { connectToHost, type ToolHost } from '@krhomebase/tool-sdk/frame'
import { feedbackApi, problemText, type FeedbackApi, type ListFilter } from './feedbackApi.ts'
import { FEEDBACK_PRIORITIES, FEEDBACK_STATUSES, type FeedbackDetail, type FeedbackPriority, type FeedbackStatus } from './feedbackTypes.ts'
import { listHash, parseRoute } from './route.ts'
import { tool } from './tool.ts'
import { busyHtml, detailView, listView, loadingView, messageView, type Notice, type PendingChange } from './views.ts'
import './viewer.css'

const app = document.getElementById('app') as HTMLElement

let host: ToolHost | null = null
let api: FeedbackApi | null = null
/** Whether the person may change requests; learned from the list reply's `viewer`. */
let canTriage: boolean | null = null
/** The request on screen, its change waiting for confirmation, and the list filter to go back to. */
let current: FeedbackDetail | null = null
let pending: PendingChange | undefined
let lastListFilter: ListFilter = {}
/** True while a save is on its way, so a second click does not send it twice. */
let busy = false

function show(html: string): void {
  app.innerHTML = html
}

/** Tells KR Homebase whether unsaved text is waiting (a typed note, or a change not yet confirmed). */
function updateDirty(): void {
  const typed = Array.from(app.querySelectorAll('textarea')).some((field) => field.value.trim() !== '')
  host?.setDirty(typed || pending !== undefined)
}

function showDetail(notice?: Notice): void {
  if (!current) return
  show(detailView(current, { canTriage: canTriage === true, pending, notice, listFilter: lastListFilter }))
  host?.setTitle(`${current.code} ${current.title}`)
  updateDirty()
}

/** Stage 2: draws the screen the address names. */
async function render(): Promise<void> {
  if (!api) return
  const route = parseRoute(location.hash)
  pending = undefined
  if (route.view === 'list') {
    lastListFilter = route.filter
    current = null
    show(loadingView('Requests'))
    const reply = await api.list(route.filter)
    if (!reply.ok) {
      show(messageView('Requests', problemText(reply.error, reply.requestId), false))
      return
    }
    canTriage = reply.data.viewer.canTriage
    show(listView(reply.data, route.filter))
    host?.setTitle('Homebase Feedback')
    updateDirty()
    return
  }
  show(loadingView('Request'))
  if (canTriage === null) {
    const who = await api.viewer()
    canTriage = who.ok ? who.data.viewer.canTriage : false
  }
  const reply = await api.get(route.number)
  if (!reply.ok) {
    current = null
    show(messageView('Request', problemText(reply.error, reply.requestId)))
    return
  }
  current = reply.data.feedback
  showDetail()
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

/** Sends a change or a note, then shows the request as KR Homebase saved it, or the refusal. */
async function save(send: (api: FeedbackApi, item: FeedbackDetail) => ReturnType<FeedbackApi['addNote']>, savedText: string): Promise<void> {
  if (!api || !current || busy) return
  busy = true
  for (const control of Array.from(app.querySelectorAll('button, textarea, select'))) (control as HTMLButtonElement).disabled = true
  // The rainbow ring beside the button that was pressed (or at the top), while the save is on its way.
  const place = app.querySelector('[data-action="confirm-change"], form[data-action="note"] button') ?? app.firstElementChild
  place?.insertAdjacentHTML('afterend', ` ${busyHtml('Saving...')}`)
  const reply = await send(api, current)
  busy = false
  if (reply.ok) {
    current = reply.data.feedback
    pending = undefined
    showDetail({ kind: 'good', text: savedText })
  } else {
    showDetail({ kind: 'bad', text: problemText(reply.error, reply.requestId) })
  }
}

/** Stage 3: forms. */
app.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement
  event.preventDefault()
  const data = new FormData(form)
  const action = form.dataset.action
  if (action === 'filter') {
    // parseRoute keeps only known values, so the address never carries anything else.
    const query = new URLSearchParams({ status: String(data.get('status') ?? ''), kind: String(data.get('kind') ?? '') })
    const route = parseRoute(`#/?${query.toString()}`)
    location.hash = route.view === 'list' ? listHash(route.filter) : '#/'
    return
  }
  if (action === 'change' && current) {
    const status = String(data.get('status') ?? '')
    const priority = String(data.get('priority') ?? '')
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(status) || !(FEEDBACK_PRIORITIES as readonly string[]).includes(priority)) return
    pending = { status: status as FeedbackStatus, priority: priority as FeedbackPriority, note: String(data.get('note') ?? '') }
    showDetail()
    return
  }
  if (action === 'note') {
    const text = String(data.get('text') ?? '').trim()
    if (!text) return
    void save((caller, item) => caller.addNote(item.number, text), 'Note added.')
  }
})

/** Stage 3: buttons. */
app.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null
  if (!button) return
  const action = button.dataset.action
  if (action === 'copy') void copyField(button)
  if (action === 'cancel-change') {
    pending = undefined
    showDetail()
  }
  if (action === 'confirm-change' && pending) {
    const change = pending
    void save((caller, item) => caller.change(item.number, change), 'Change saved.')
  }
})

app.addEventListener('input', () => updateDirty())
window.addEventListener('hashchange', () => void render())

/** Stage 1: connect, then draw. */
async function start(): Promise<void> {
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
