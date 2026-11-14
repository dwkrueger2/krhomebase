'use client'
// file: apps/web/features/homebase-feedback/components/FeedbackRequestList.client.tsx
/**
 * A list of Homebase Feedback requests with the chosen one's detail (plan 12, stage F2): "My requests" for anyone,
 * and "All requests" for Internal Developers (decision 4). Rows are dense register rows (number, kind, status, title,
 * sender, date), newest first, 50 a page with "Load more". Choosing a row loads the request
 * (`fetchHomebaseFeedback`) and shows its text, its marker chips (checked against the source window's page now, so a
 * click still outlines what is there), the captured page, and for developers the notes.
 *
 * Status and priority changes and notes are the viewer Worker's job (stage F5); this list only reads. The parent
 * chooses which list (`load`) and passes the source window for the chips.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  HOMEBASE_FEEDBACK_KIND_LABELS,
  HOMEBASE_FEEDBACK_PRIORITY_LABELS,
  HOMEBASE_FEEDBACK_STATUS_LABELS,
  type FeedbackMarkerReference,
  type HomebaseFeedbackDetail,
  type HomebaseFeedbackListData,
  type HomebaseFeedbackSummary,
} from '@krhomebase/contracts'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { fetchHomebaseFeedback, HomebaseFeedbackApiError } from '../api.client'
import { highlightMarkers } from '../markerHighlight'
import { markerPresence } from '../sourcePage'
import { useSourcePageWatch } from '../useSourcePageWatch.client'
import CapturedContextCard from './CapturedContextCard.client'
import MarkerChipRow from './MarkerChipRow.client'

export interface FeedbackRequestListProps {
  /** Loads one page (the cursor of the previous page, or null for the first). */
  load: (cursor: string | null) => Promise<HomebaseFeedbackListData>
  /** Changes when the list must be read again (a request was sent). */
  refreshKey: number
  /** The window the pop-out was opened from, for the chips. */
  sourceWindow: Window
  /** Show the sender column (the full list). */
  showSender: boolean
  /** Text when there is nothing to list. */
  emptyText: string
  /** `data-kr-id` of the list, for inspection. */
  markerId: string
}

const LAYOUT_STYLES = {
  root: 'p-[8px] gap-[6px] grid',
  // About twelve rows, then the rows scroll inside their card and the chosen request shows below.
  table: 'max-h-[260px] overflow-auto',
  cell: 'px-[4px] py-[1px]',
  more: 'mt-[3px] gap-[6px] flex items-center',
  detail: 'p-[6px] gap-[6px] grid content-start',
  detailHead: 'gap-[6px] flex items-center',
  notes: 'gap-[3px] grid',
  note: 'px-[4px] py-[2px]',
  body: 'm-0',
  copyButton: 'h-[20px] gap-[3px] px-[5px] inline-flex shrink-0 items-center',
  copyIcon: 'size-[11px]',
} as const

const STYLES = {
  table: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  grid: 'w-full border-collapse text-[10pt] leading-tight',
  head: 'sticky top-0 bg-(--kr-theme-table-heading-light) text-left text-[10px] font-semibold tracking-[.06em] uppercase text-(color:--kr-theme-text-muted)',
  row: 'border-b border-(--kr-theme-line) cursor-pointer hover:bg-(--kr-theme-table-row-hover)',
  rowSelected: 'bg-(--kr-theme-table-row-selected)',
  code: 'font-mono whitespace-nowrap',
  muted: 'whitespace-nowrap text-(color:--kr-theme-text-muted)',
  title: 'max-w-0 w-full truncate',
  empty: 'text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'text-[12px] text-(color:--kr-theme-danger)',
  button:
    'h-[24px] px-[8px] rounded-[3px] border border-(--kr-theme-line) bg-transparent text-[12px] font-semibold text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-table-row-hover) disabled:opacity-55',
  detail: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  detailTitle: 'min-w-0 flex-1 truncate text-[13px] font-semibold text-(color:--kr-theme-text)',
  body: 'whitespace-pre-wrap break-words font-[inherit] text-[12.5px] leading-[1.3] text-(color:--kr-theme-text)',
  sectionTitle: 'text-[11px] font-bold tracking-[.06em] uppercase text-(color:--kr-theme-text-muted)',
  note: 'rounded-[2px] bg-(--kr-theme-muted-surface) text-[12px] text-(color:--kr-theme-text)',
  noteMeta: 'text-[10px] text-(color:--kr-theme-text-muted)',
  copyButton:
    'rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[11px] font-semibold text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-table-row-hover) focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** `Nov 13, 2026` from an ISO time; the text as it is when it cannot be read. */
export function feedbackDate(iso: string): string {
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : iso
}

/** A note line: a status or priority change in words, or the note's text. */
export function noteText(note: HomebaseFeedbackDetail['notes'][number]): string {
  const label = (value: string | null) =>
    (value && (HOMEBASE_FEEDBACK_STATUS_LABELS as Record<string, string>)[value]) || (value && (HOMEBASE_FEEDBACK_PRIORITY_LABELS as Record<string, string>)[value]) || value || '-'
  const change = note.noteType === 'status_change' ? `Status ${label(note.fromValue)} to ${label(note.toValue)}` : note.noteType === 'priority_change' ? `Priority ${label(note.fromValue)} to ${label(note.toValue)}` : ''
  return [change, note.text].filter(Boolean).join(': ')
}

/**
 * Copies "plan FB-0012", the words that ask Claude Code for a plan (root `AGENTS.md`, "Homebase Feedback: asking
 * Claude"). It writes through the clipboard of the window the button is in (the pop-out), because the main window's
 * clipboard refuses while that window does not have the focus.
 */
function CopyForClaudeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className={`${LAYOUT_STYLES.copyButton} ${STYLES.copyButton}`}
      data-kr-action="copy-feedback-for-claude"
      title={`Copies "plan ${code}": paste it into a Claude Code chat to get a plan`}
      onClick={(event) => {
        const clipboard = event.currentTarget.ownerDocument.defaultView?.navigator.clipboard
        void clipboard?.writeText(`plan ${code}`).then(() => setCopied(true))
      }}
    >
      {copied ? <KRHomebaseIcons.Check className={LAYOUT_STYLES.copyIcon} /> : <KRHomebaseIcons.Copy className={LAYOUT_STYLES.copyIcon} />}
      {copied ? 'Copied' : 'Copy for Claude'}
    </button>
  )
}

/** The chosen request: text, chips, captured page and notes. */
function RequestDetail({ feedback, sourceWindow }: { feedback: HomebaseFeedbackDetail; sourceWindow: Window }) {
  const pageVersion = useSourcePageWatch(sourceWindow)
  const markers: FeedbackMarkerReference[] = useMemo(() => feedback.markers.map(({ attribute, value, pattern }) => ({ attribute, value, pattern })), [feedback])
  const presence = useMemo(() => markerPresence(sourceWindow.document, markers), [sourceWindow, markers, pageVersion])
  return (
    <section className={`${LAYOUT_STYLES.detail} ${STYLES.detail}`} data-kr-element="feedback-request-detail" aria-label={`${feedback.code} ${feedback.title}`}>
      {/* Detail header: number, title, kind, status and a copy of the Claude request */}
      <div className={LAYOUT_STYLES.detailHead}>
        <span className={STYLES.code}>{feedback.code}</span>
        <span className={STYLES.detailTitle}>{feedback.title}</span>
        <span className={STYLES.muted}>
          {HOMEBASE_FEEDBACK_KIND_LABELS[feedback.kind]} · {HOMEBASE_FEEDBACK_STATUS_LABELS[feedback.status]} · {HOMEBASE_FEEDBACK_PRIORITY_LABELS[feedback.priority]}
        </span>
        <CopyForClaudeButton code={feedback.code} />
      </div>
      {/* Marker chips of the saved text, checked against the page now */}
      <MarkerChipRow markers={markers} presence={presence} onHighlight={(chosen) => highlightMarkers(sourceWindow, chosen)} emptyHint="The text names no marker." />
      {/* The request text as sent */}
      <pre className={`${LAYOUT_STYLES.body} ${STYLES.body}`}>{feedback.body}</pre>
      {/* The page it was sent from */}
      <CapturedContextCard context={feedback.context} title={`Captured ${feedbackDate(feedback.createdAt)} by ${feedback.submittedByLabel}`} />
      {/* Developer notes (empty for a sender who is not a developer) */}
      {feedback.notes.length ? (
        <div className={LAYOUT_STYLES.notes} data-kr-element="feedback-request-notes">
          <div className={STYLES.sectionTitle}>Notes</div>
          {feedback.notes.map((note) => (
            <div key={note.id} className={`${LAYOUT_STYLES.note} ${STYLES.note}`}>
              <div className={STYLES.noteMeta}>
                {note.authorLabel}, {feedbackDate(note.createdAt)}
              </div>
              {noteText(note)}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * Renders a list of requests and the chosen one's detail.
 *
 * @param props - How to load a page, when to reload, the source window and the list's options.
 * @returns `<div data-kr-id={markerId}>`.
 */
export default function FeedbackRequestList({ load, refreshKey, sourceWindow, showSender, emptyText, markerId }: FeedbackRequestListProps) {
  const [items, setItems] = useState<HomebaseFeedbackSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [detail, setDetail] = useState<HomebaseFeedbackDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadPage = useCallback(
    async (cursor: string | null) => {
      setLoading(true)
      setError('')
      try {
        const page = await load(cursor)
        setItems((current) => (cursor ? [...current, ...page.items] : page.items))
        setNextCursor(page.nextCursor)
      } catch (caught) {
        setError(caught instanceof HomebaseFeedbackApiError ? caught.message : 'The requests could not be read.')
      } finally {
        setLoading(false)
      }
    },
    [load],
  )

  useEffect(() => {
    void loadPage(null)
  }, [loadPage, refreshKey])

  // The chosen request's detail; a reply for an earlier choice is ignored.
  useEffect(() => {
    if (!chosen) return undefined
    let cancelled = false
    setDetailLoading(true)
    fetchHomebaseFeedback(chosen)
      .then((saved) => {
        if (!cancelled) setDetail(saved.feedback)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof HomebaseFeedbackApiError ? caught.message : 'The request could not be read.')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [chosen])

  return (
    <div className={LAYOUT_STYLES.root} data-kr-id={markerId}>
      {/* Register rows: newest first, one page at a time */}
      <div className={`${LAYOUT_STYLES.table} ${STYLES.table}`} data-kr-element="rows-container">
        <table className={STYLES.grid}>
          <thead className={STYLES.head}>
            <tr>
              <th className={LAYOUT_STYLES.cell}>No.</th>
              <th className={LAYOUT_STYLES.cell}>Kind</th>
              <th className={LAYOUT_STYLES.cell}>Status</th>
              <th className={LAYOUT_STYLES.cell}>Title</th>
              {showSender ? <th className={LAYOUT_STYLES.cell}>Sent by</th> : null}
              <th className={LAYOUT_STYLES.cell}>Sent</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.code}
                className={`${STYLES.row} ${chosen === item.code ? STYLES.rowSelected : ''}`}
                data-kr-element="feedback-request-row"
                aria-selected={chosen === item.code}
                tabIndex={0}
                onClick={() => setChosen(item.code)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setChosen(item.code)
                  }
                }}
              >
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.code}`}>{item.code}</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.muted}`}>{HOMEBASE_FEEDBACK_KIND_LABELS[item.kind]}</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.muted}`}>{HOMEBASE_FEEDBACK_STATUS_LABELS[item.status]}</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.title}`} title={item.title}>
                  {item.title}
                </td>
                {showSender ? <td className={`${LAYOUT_STYLES.cell} ${STYLES.muted}`}>{item.submittedByLabel}</td> : null}
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.muted}`}>{feedbackDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Below the rows: busy, empty, failure or Load more */}
        <div className={`${LAYOUT_STYLES.more} ${LAYOUT_STYLES.cell}`}>
          {loading ? <RainbowBusySpinner busy label="Loading requests..." size={14} /> : null}
          {!loading && error ? <span className={STYLES.error}>{error}</span> : null}
          {!loading && !error && !items.length ? <span className={STYLES.empty}>{emptyText}</span> : null}
          {!loading && nextCursor ? (
            <button type="button" className={STYLES.button} data-kr-action="load-more-feedback" onClick={() => void loadPage(nextCursor)}>
              Load more
            </button>
          ) : null}
        </div>
      </div>

      {/* The chosen request */}
      {detailLoading ? (
        <RainbowBusySpinner busy label="Loading the request..." size={14} />
      ) : detail ? (
        <RequestDetail key={detail.code} feedback={detail} sourceWindow={sourceWindow} />
      ) : (
        <span className={STYLES.empty}>Choose a request to see it.</span>
      )}
    </div>
  )
}
