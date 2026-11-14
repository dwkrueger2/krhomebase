'use client'
// file: apps/web/features/homebase-feedback/components/FeedbackRequestForm.client.tsx
/**
 * The New request form of the Feedback pop-out (plan 12, stage F2): kind, title, the marker chips above the text box
 * (point 3), the text, the captured page read-only (point 4), then Send.
 *
 * - The text is scanned for markers on every change (`findFeedbackMarkers`, the same reader the API uses); each one
 *   becomes a chip. Whether each is on the source window's page is read again whenever that page changes
 *   (`useSourcePageWatch`), so chips turn grey or live as screens change. A chip click outlines its elements there.
 * - The captured page is read from the source window on the same changes and shown read-only. Send reads it once more,
 *   with where each marker is, and sends it all (`sendHomebaseFeedback`). The sender comes from the session (API).
 * - Clear asks first in `U6ConfirmationDialog` when there is text. A sent request shows its number (`FB-0012`) and
 *   the form starts again. `disabledReason` (the migration not applied yet) keeps Send off and says why.
 *
 * The parent (`HomebaseFeedbackPanel`) owns the source window and is told about each sent request.
 */

import { useMemo, useState } from 'react'
import {
  findFeedbackMarkers,
  HOMEBASE_FEEDBACK_KIND_LABELS,
  HOMEBASE_FEEDBACK_KINDS,
  type FeedbackMarkerReference,
  type HomebaseFeedbackDetail,
  type HomebaseFeedbackKind,
} from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { HomebaseFeedbackApiError, sendHomebaseFeedback } from '../api.client'
import { highlightMarkers } from '../markerHighlight'
import { captureSourceContext, markerCaptures, markerPresence } from '../sourcePage'
import { useSourcePageWatch } from '../useSourcePageWatch.client'
import CapturedContextCard from './CapturedContextCard.client'
import MarkerChipRow from './MarkerChipRow.client'

export interface FeedbackRequestFormProps {
  /** The window the pop-out was opened from: read for markers and the captured page. */
  sourceWindow: Window
  /** Why nothing can be sent right now (for example the migration is not applied); null when sending works. */
  disabledReason: string | null
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
export default function FeedbackRequestForm({ sourceWindow, disabledReason, onSent }: FeedbackRequestFormProps) {
  const [kind, setKind] = useState<HomebaseFeedbackKind>('issue')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sentCode, setSentCode] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  // Moves on after each settled change of the source page; the chips and the captured page are read again then.
  const pageVersion = useSourcePageWatch(sourceWindow)
  const markers = useMemo(() => findFeedbackMarkers(body), [body])
  const presence = useMemo(() => markerPresence(sourceWindow.document, markers), [sourceWindow, markers, pageVersion])
  const context = useMemo(() => captureSourceContext(sourceWindow), [sourceWindow, pageVersion])
  const canSend = !disabledReason && !sending && Boolean(title.trim()) && Boolean(body.trim())

  function highlight(chosen: readonly FeedbackMarkerReference[]): void {
    const count = highlightMarkers(sourceWindow, chosen)
    L(`[HOMEBASE_FEEDBACK_FORM:104] outlined markers=${chosen.length} elements=${count}`)
  }

  function startOver(): void {
    setTitle('')
    setBody('')
    setKind('issue')
    setError('')
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
      L(`[HOMEBASE_FEEDBACK_FORM:126] sent code=${saved.feedback.code} markers=${saved.feedback.markerCount}`)
      setSentCode(saved.feedback.code)
      startOver()
      onSent(saved.feedback)
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
        <MarkerChipRow markers={markers} presence={presence} onHighlight={highlight} emptyHint='None yet. Paste data-kr-id="..." or data-kr-element="..." into the text.' />

        {/* The request text: a tall field, so its label is the placeholder and the chips above */}
        <textarea
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
              disabled={sending || (!title && !body)}
              data-kr-action="clear-feedback"
              onClick={() => (body.trim() || title.trim() ? setClearOpen(true) : startOver())}
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

      {/* Clear asks first when there is text */}
      <U6ConfirmationDialog
        open={clearOpen}
        title="Clear this request?"
        description="The title and text you typed will be removed. Nothing has been sent."
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
