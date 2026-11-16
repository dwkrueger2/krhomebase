'use client'
// file: apps/web/features/homebase-feedback/components/FeedbackRequestForm.client.tsx
/**
 * The New request form of the Feedback pop-out (plan 12, stages F2 and F3): kind, title, the marker chips above the
 * text box (point 3), the text, the screenshot row (point 5, stage F3), the captured page read-only (point 4), then
 * Send.
 *
 * - The text is scanned for markers on every change (`findFeedbackMarkers`, the same reader the API uses); each one
 *   becomes a chip. Whether each is on the source window's page is read again whenever that page changes
 *   (`useSourcePageWatch`), so chips turn grey or live as screens change. A chip click selects it (an orange border)
 *   and keeps its elements outlined there until it is clicked again (`useMarkerSelection`).
 * - The captured page is read from the source window on the same changes and shown read-only. Send reads it once more,
 *   with where each marker is, and sends it all (`sendHomebaseFeedback`). The sender comes from the session (API).
 * - Screenshot (stage F3): "Take screenshot" draws the main window (`captureSourceScreenshot`); the annotation
 *   editor (`ScreenshotEditor`) opens at once over the pop-out. Send saves the request first, then uploads the PNG
 *   with the shapes drawn in (`flattenScreenshot`) and the marker map (`uploadHomebaseFeedbackImage`). When only the
 *   upload fails, the request stands and the footer says so with its number.
 * - Pick from page (stage F4, Internal Developers only): asks the main window's Dev View for one element
 *   (`kr-dev-view:command` `pick`); the picked element's marker comes back (`kr-dev-view:picked`) and is put into the
 *   text where the cursor was. Dev View itself is allowed by the panel once the API says the person is a developer.
 * - Clear asks first in `U6ConfirmationDialog` when there is text or a screenshot. A sent request shows its number (`FB-0012`) and
 *   the form starts again. `disabledReason` (the migration not applied yet) keeps Send off and says why.
 *
 * The parent (`HomebaseFeedbackPanel`) owns the source window and is told about each sent request.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  findFeedbackMarkers,
  HOMEBASE_FEEDBACK_KIND_LABELS,
  HOMEBASE_FEEDBACK_KINDS,
  type HomebaseFeedbackDetail,
  type HomebaseFeedbackKind,
  type HomebaseFeedbackShapeInput,
} from '@krhomebase/contracts'
import { DEV_VIEW_PICKED_EVENT, readDevViewPicked, sendDevViewCommand } from '@/components/dev-view/devViewRemote'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { annotationColor, flattenScreenshot } from '../annotation'
import { HomebaseFeedbackApiError, sendHomebaseFeedback, uploadHomebaseFeedbackImage } from '../api.client'
import { captureSourceScreenshot, type SourceScreenshot } from '../screenshot'
import { captureSourceContext, markerCaptures, markerPresence } from '../sourcePage'
import { useMarkerSelection } from '../useMarkerSelection.client'
import { useSourcePageWatch } from '../useSourcePageWatch.client'
import CapturedContextCard from './CapturedContextCard.client'
import FeedbackScreenshotRow from './FeedbackScreenshotRow.client'
import MarkerChipRow from './MarkerChipRow.client'
import ScreenshotEditor from './ScreenshotEditor.client'

export interface FeedbackRequestFormProps {
  /** The window the pop-out was opened from: read for markers and the captured page. */
  sourceWindow: Window
  /** Why nothing can be sent right now (for example the migration is not applied); null when sending works. */
  disabledReason: string | null
  /** An Internal Developer (the API's `viewer.isDeveloper`): shows Pick from page (stage F4). */
  isDeveloper: boolean
  /** Called with each request the API saved. */
  onSent: (feedback: HomebaseFeedbackDetail) => void
}

const LAYOUT_STYLES = {
  form: 'p-[8px] gap-[6px] grid',
  // Kind and title on one row: label left of each field.
  headRow: 'gap-x-[3px] gap-y-[3px] grid grid-cols-[auto_120px_auto_minmax(0,1fr)] items-center',
  headLabelGap: 'ml-[6px]',
  // A tall text box, so the whole form still fits a 720px pop-out with the captured page under it.
  text: 'h-[200px] w-full px-[6px] py-[4px]',
  footer: 'gap-[6px] flex items-center justify-between',
  footerActions: 'gap-[6px] flex items-center',
  buttonIcon: 'size-[12px]',
  pickRow: 'gap-[6px] flex items-center',
} as const

const STYLES = {
  label: 'text-[12px] font-semibold text-(color:--kr-theme-text)',
  field:
    'h-[24px] min-w-0 px-[4px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) focus:outline-2 focus:outline-(--kr-theme-brand-primary-active) disabled:opacity-60',
  text: 'resize-none rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-[inherit] text-[12.5px] leading-[1.3] text-(color:--kr-theme-text) focus:outline-2 focus:outline-(--kr-theme-brand-primary-active) disabled:opacity-60',
  status: 'min-w-0 truncate text-[12px] text-(color:--kr-theme-text-muted)',
  statusError: 'min-w-0 text-[12px] text-(color:--kr-theme-danger)',
  statusSent: 'min-w-0 truncate text-[12px] font-semibold text-(color:--kr-theme-success)',
  button:
    'h-[26px] gap-[4px] px-[10px] py-[2px] inline-flex items-center rounded-[3px] border text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  secondary: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text) hover:bg-(--kr-theme-table-row-hover)',
  primary: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  pickOn: 'border-(--kr-theme-orange) bg-(--kr-theme-orange) text-white',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const PLACEHOLDER = 'What should change, or what went wrong? To point at a part of the page, paste its marker, for example data-kr-id="TopTitleBar".'

/**
 * Renders the New request form.
 *
 * @param props - The source window, why sending is off (if it is) and the sent callback.
 * @returns `<form data-kr-element="feedback-request-form">` and the Clear confirmation.
 */
export default function FeedbackRequestForm({ sourceWindow, disabledReason, isDeveloper, onSent }: FeedbackRequestFormProps) {
  const [kind, setKind] = useState<HomebaseFeedbackKind>('issue')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sentCode, setSentCode] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  // The screenshot (stage F3): the picture, its shapes, whether the editor is open, and the capture state.
  const [screenshot, setScreenshot] = useState<SourceScreenshot | null>(null)
  const [shapes, setShapes] = useState<HomebaseFeedbackShapeInput[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState('')
  // Moves on after each settled change of the source page; the chips and the captured page are read again then.
  const pageVersion = useSourcePageWatch(sourceWindow)
  const markers = useMemo(() => findFeedbackMarkers(body), [body])
  const presence = useMemo(() => markerPresence(sourceWindow.document, markers), [sourceWindow, markers, pageVersion])
  const context = useMemo(() => captureSourceContext(sourceWindow), [sourceWindow, pageVersion])
  // Selected chips and their lasting outlines in the source window.
  const selection = useMarkerSelection(sourceWindow, markers, presence, pageVersion)
  const canSend = !disabledReason && !sending && !capturing && Boolean(title.trim()) && Boolean(body.trim())
  // Pick from page (stage F4): waiting for the main window's Dev View to send back a picked marker.
  const [picking, setPicking] = useState(false)
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  // Stage F4: a picked marker goes into the text at the cursor (or at the end), with a space on each side.
  useEffect(() => {
    if (!picking) return
    const onPicked = (event: Event) => {
      const picked = readDevViewPicked(event)
      if (!picked) return
      const field = textRef.current
      setBody((current) => {
        const at = field && field.selectionStart <= current.length ? field.selectionStart : current.length
        const before = current.slice(0, at)
        const after = current.slice(at)
        const lead = before && !/\s$/.test(before) ? ' ' : ''
        const tail = after && !/^\s/.test(after) ? ' ' : ''
        return `${before}${lead}${picked.label}${tail}${after}`
      })
      setSentCode('')
      setPicking(false)
      L(`[HOMEBASE_FEEDBACK_FORM:150] picked ${picked.label.slice(0, 80)}`)
    }
    sourceWindow.addEventListener(DEV_VIEW_PICKED_EVENT, onPicked)
    return () => sourceWindow.removeEventListener(DEV_VIEW_PICKED_EVENT, onPicked)
  }, [picking, sourceWindow])

  /** Asks the main window's Dev View for one element; a second click stops waiting. */
  function pickFromPage(): void {
    if (picking) return setPicking(false)
    setPicking(true)
    sendDevViewCommand(sourceWindow, { action: 'pick' })
  }

  function startOver(): void {
    setTitle('')
    setBody('')
    setKind('issue')
    setError('')
    setScreenshot(null)
    setShapes([])
    setCaptureError('')
  }

  /** Draws the main window and opens the editor on it. */
  async function takeScreenshot(): Promise<void> {
    setCapturing(true)
    setCaptureError('')
    try {
      const shot = await captureSourceScreenshot(sourceWindow)
      L(`[HOMEBASE_FEEDBACK_FORM:118] screenshot ${shot.width}x${shot.height} markers=${shot.markerMap.length}`)
      setScreenshot(shot)
      setShapes([])
      setEditorOpen(true)
    } catch (caught) {
      L(`[HOMEBASE_FEEDBACK_FORM:123] screenshot failed error=${caught instanceof Error ? caught.message.slice(0, 80) : 'unknown'}`)
      setCaptureError('The screenshot could not be taken in this browser. Describe the screen in the text instead.')
    } finally {
      setCapturing(false)
    }
  }

  async function send(): Promise<void> {
    if (!canSend) return
    setSending(true)
    setError('')
    setSentCode('')
    try {
      // The page is read once more at the moment of sending, with where each marker is now.
      const saved = await sendHomebaseFeedback({
        kind,
        title: title.trim(),
        body: body.trim(),
        context: captureSourceContext(sourceWindow),
        markers: markerCaptures(sourceWindow.document, findFeedbackMarkers(body)),
      })
      L(`[HOMEBASE_FEEDBACK_FORM:152] sent code=${saved.feedback.code} markers=${saved.feedback.markerCount}`)
      let feedback = saved.feedback
      let imageProblem = ''
      if (screenshot) {
        try {
          const png = await flattenScreenshot(screenshot.dataUrl, screenshot.width, screenshot.height, shapes, annotationColor(sourceWindow.document))
          feedback = (await uploadHomebaseFeedbackImage(feedback.code, png, shapes, screenshot.markerMap)).feedback
          L(`[HOMEBASE_FEEDBACK_FORM:159] screenshot saved code=${feedback.code} bytes=${png.size} shapes=${shapes.length}`)
        } catch (caught) {
          imageProblem = caught instanceof HomebaseFeedbackApiError ? caught.message : 'The screenshot could not be prepared.'
        }
      }
      setSentCode(feedback.code)
      startOver()
      // The request stands even when only its screenshot failed; say so with its number.
      if (imageProblem) setError(`Sent as ${feedback.code}, but the screenshot was not saved: ${imageProblem}`)
      onSent(feedback)
    } catch (caught) {
      setError(caught instanceof HomebaseFeedbackApiError ? caught.message : 'The request was not sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <form
        className={LAYOUT_STYLES.form}
        data-kr-element="feedback-request-form"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        {/* Kind and title: one row, labels beside their fields */}
        <div className={LAYOUT_STYLES.headRow} data-kr-element="feedback-kind-title-row">
          <label className={STYLES.label} htmlFor="homebase-feedback-kind">
            Kind
          </label>
          <select id="homebase-feedback-kind" className={STYLES.field} value={kind} disabled={sending} onChange={(event) => setKind(event.target.value as HomebaseFeedbackKind)}>
            {HOMEBASE_FEEDBACK_KINDS.map((value) => (
              <option key={value} value={value}>
                {HOMEBASE_FEEDBACK_KIND_LABELS[value]}
              </option>
            ))}
          </select>
          <label className={`${LAYOUT_STYLES.headLabelGap} ${STYLES.label}`} htmlFor="homebase-feedback-title">
            Title
          </label>
          <input
            id="homebase-feedback-title"
            className={STYLES.field}
            maxLength={200}
            placeholder="A short title"
            value={title}
            disabled={sending}
            onChange={(event) => {
              setTitle(event.target.value)
              setSentCode('')
            }}
          />
        </div>

        {/* Marker chips: one per marker the text names, live or grey by the source page */}
        <MarkerChipRow
          markers={markers}
          presence={presence}
          selected={selection.selected}
          onToggle={selection.toggle}
          onToggleAll={selection.toggleAll}
          emptyHint='None yet. Paste data-kr-id="..." or data-kr-element="..." into the text.'
        />

        {/* Pick from page (stage F4, Internal Developers): put a marker from the main window into the text */}
        {isDeveloper ? (
          <div className={LAYOUT_STYLES.pickRow} data-kr-element="feedback-pick-row">
            <button
              type="button"
              className={`${STYLES.button} ${picking ? STYLES.pickOn : STYLES.secondary}`}
              aria-pressed={picking}
              disabled={sending}
              data-kr-action="feedback-pick-from-page"
              title="Pick from page: click an element in the main window, and its marker goes into the text where the cursor is. Up and Down arrows climb to a parent; Escape stops."
              onClick={pickFromPage}
            >
              <KRHomebaseIcons.OutlineTarget className={LAYOUT_STYLES.buttonIcon} />
              Pick from page
            </button>
            <span className={STYLES.status}>{picking ? 'Click an element in the main window. Escape there stops.' : 'Internal Developers: Dev View and Pick work on the main window.'}</span>
          </div>
        ) : null}

        {/* The request text: a tall field, so its label is the placeholder and the chips above */}
        <textarea
          ref={textRef}
          aria-label="Request"
          className={`${LAYOUT_STYLES.text} ${STYLES.text}`}
          data-kr-element="feedback-request-text"
          maxLength={20000}
          placeholder={PLACEHOLDER}
          value={body}
          disabled={sending}
          onChange={(event) => {
            setBody(event.target.value)
            setSentCode('')
          }}
        />

        {/* The screenshot (stage F3): take, mark up, retake, remove */}
        <FeedbackScreenshotRow
          screenshot={screenshot}
          markCount={shapes.length}
          capturing={capturing}
          error={captureError}
          disabled={sending || Boolean(disabledReason)}
          onTake={() => void takeScreenshot()}
          onMarkUp={() => setEditorOpen(true)}
          onRemove={() => {
            setScreenshot(null)
            setShapes([])
          }}
        />

        {/* The captured page, read-only and live until Send */}
        <CapturedContextCard context={context} />

        {/* Footer: status line on the left, Clear and Send on the right */}
        <div className={LAYOUT_STYLES.footer} data-kr-element="feedback-request-footer">
          {sending ? (
            <RainbowBusySpinner busy label="Sending..." size={14} />
          ) : error ? (
            <span className={STYLES.statusError} role="alert">
              {error}
            </span>
          ) : sentCode ? (
            <span className={STYLES.statusSent} role="status" data-kr-element="feedback-sent-code">
              Sent as {sentCode}. Thank you.
            </span>
          ) : (
            <span className={disabledReason ? STYLES.statusError : STYLES.status}>{disabledReason ?? 'Everyone signed in may send feedback.'}</span>
          )}
          <div className={LAYOUT_STYLES.footerActions}>
            <button
              type="button"
              className={`${STYLES.button} ${STYLES.secondary}`}
              disabled={sending || (!title && !body && !screenshot)}
              data-kr-action="clear-feedback"
              onClick={() => (body.trim() || title.trim() || screenshot ? setClearOpen(true) : startOver())}
            >
              Clear
            </button>
            <button type="submit" className={`${STYLES.button} ${STYLES.primary}`} disabled={!canSend} data-kr-action="send-feedback">
              <KRHomebaseIcons.Send className={LAYOUT_STYLES.buttonIcon} />
              Send
            </button>
          </div>
        </div>
      </form>

      {/* The annotation editor, over the whole pop-out */}
      {editorOpen && screenshot ? (
        <ScreenshotEditor
          screenshot={screenshot}
          shapes={shapes}
          onCancel={() => setEditorOpen(false)}
          onDone={(next) => {
            setShapes(next)
            setEditorOpen(false)
          }}
        />
      ) : null}

      {/* Clear asks first when there is text */}
      <U6ConfirmationDialog
        open={clearOpen}
        title="Clear this request?"
        description="The title, the text and the screenshot will be removed. Nothing has been sent."
        confirmLabel="Clear"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          setClearOpen(false)
          startOver()
        }}
      />
    </>
  )
}
