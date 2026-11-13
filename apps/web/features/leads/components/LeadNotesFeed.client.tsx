'use client'
// file: apps/web/features/leads/components/LeadNotesFeed.client.tsx
/**
 * Lead notes feed, with the "Add note" box above it.
 *
 * Ported from the old `hb-components/KR-Leads/components/LeadNotesFeed.client.tsx` (author · date, the note, and the
 * empty sentence "No notes have been added to this lead yet." are kept).
 *
 * Changed (the requester's decision of Nov 13, 2026): lead notes are Workstream `Notes` entries on the lead. The old
 * "Add note" sent `noteText` to the leads route, which appended it to the person's contact notes, and the feed read a
 * `notes` list the route never returned, so a saved note never showed. Now:
 *  - The feed reads the lead's Workstream `Notes` entries, newest first, 20 at a time (`fetchWorkstream` with
 *    `leadId` and `subgroup: 'Notes'`), with "Load older notes" and a line when older notes exist (D10). The whole
 *    Workstream of the lead is on the WorkStream tab.
 *  - "Add note" (moved here from the Edit Lead dialog) saves a `Notes` entry with `createWorkstreamEntry`: the subject
 *    is the note's first line (160 characters at most), the note is the whole text. The saved entry goes to the top.
 *  - Loading and saving show `RainbowBusySpinner`; diagnostics use `L` with `[LEAD_NOTES:line]`.
 */

import { useEffect, useState } from 'react'
import type { WorkstreamActivity } from '@krhomebase/contracts'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { createWorkstreamEntry, fetchWorkstream } from '@/features/communications/api.client'
import { L } from '@/lib/KRUtilities'
import { noteTitle } from '../leadRows'

const NOTES_PAGE = 20

const STYLES = {
  textarea: 'px-[6px] py-[2px] min-h-[48px] w-full resize-y rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  button: 'px-[10px] py-[3px] min-h-[26px] rounded-[2px] border text-[11px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  primary: 'border-(--kr-theme-brand-primary-active) bg-(--kr-theme-brand-primary-active) text-(color:--kr-theme-text-inverse)',
  secondary: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  item: 'border-b border-(--kr-theme-line) text-[12px] leading-tight last:border-b-0',
  itemHead: 'text-[11px] font-extrabold text-(color:--kr-theme-text)',
  itemText: 'whitespace-pre-wrap [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  statusLine: 'text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'text-[11px] text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  root: 'gap-[6px] grid min-w-0',
  composer: 'gap-[3px] grid',
  composerActions: 'gap-[4px] flex items-center justify-end',
  list: 'grid min-w-0',
  item: 'py-[3px] gap-[1px] grid',
  text: 'm-0',
  more: 'gap-[6px] flex items-center',
} as const

/** "Nov 13, 2026" for an ISO time (the old `formatShortDate`). */
function formatShortDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Props for LeadNotesFeed. */
export interface LeadNotesFeedProps {
  leadId: string
  /** Shows the Add note box (the viewer may change leads). */
  canWrite: boolean
  /** Starting entries for a first draw without the API (tests). When given, nothing is loaded. */
  initialNotes?: WorkstreamActivity[]
  /** Reports a saved note to the panel's status line. */
  onSaved?: (message: string) => void
}

/**
 * Renders a compact lead notes feed: the Add note box, then the lead's Workstream notes, newest first.
 *
 * @param props - The lead, whether the viewer may add notes, optional starting entries, and `onSaved`.
 */
export default function LeadNotesFeed({ canWrite, initialNotes, leadId, onSaved }: LeadNotesFeedProps) {
  const [notes, setNotes] = useState<WorkstreamActivity[]>(initialNotes ?? [])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(!initialNotes)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [error, setError] = useState('')

  // The newest page of notes for this lead.
  useEffect(() => {
    if (initialNotes) return
    let live = true
    setLoading(true)
    setError('')
    fetchWorkstream({ leadId, subgroup: 'Notes', limit: NOTES_PAGE })
      .then((data) => {
        if (!live) return
        setNotes(data.activities)
        setNextCursor(data.nextCursor)
      })
      .catch((caught: unknown) => {
        L(`[LEAD_NOTES:112] load failed leadId=${leadId} error=${caught instanceof Error ? caught.message : 'unknown'}`)
        if (live) setError(caught instanceof Error ? caught.message : 'The lead notes could not be loaded.')
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [initialNotes, leadId])

  async function loadOlder(): Promise<void> {
    if (!nextCursor) return
    setLoading(true)
    try {
      const data = await fetchWorkstream({ leadId, subgroup: 'Notes', limit: NOTES_PAGE, cursor: nextCursor })
      setNotes((current) => [...current, ...data.activities.filter((entry) => !current.some((item) => item.id === entry.id))])
      setNextCursor(data.nextCursor)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Older notes could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function addNote(): Promise<void> {
    const note = noteText.trim()
    if (!note || saving) return
    setSaving(true)
    setError('')
    try {
      L(`[LEAD_NOTES:141] add note start leadId=${leadId} characters=${note.length}`)
      const saved = await createWorkstreamEntry({ subgroup: 'Notes', leadId, title: noteTitle(note), note })
      setNotes((current) => [saved.activity, ...current])
      setNoteText('')
      onSaved?.('Lead note saved.')
    } catch (caught) {
      L(`[LEAD_NOTES:147] add note failed leadId=${leadId} error=${caught instanceof Error ? caught.message : 'unknown'}`)
      setError(caught instanceof Error ? caught.message : 'Could not save the Lead note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={LAYOUT_STYLES.root} data-kr-component="LeadNotesFeed">
      {/* Add note: saved as a Workstream Notes entry on this lead. */}
      {canWrite ? (
        <div className={LAYOUT_STYLES.composer} data-kr-element="lead-notes-composer">
          <label className="sr-only" htmlFor={`lead-note-${leadId}`}>New note</label>
          <textarea className={STYLES.textarea} disabled={saving} id={`lead-note-${leadId}`} placeholder="New note (saved to the lead's WorkStream as a Note)" value={noteText} onChange={(event) => setNoteText(event.target.value)} />
          <div className={LAYOUT_STYLES.composerActions}>
            {saving ? <RainbowBusySpinner busy label="Saving note..." size={14} /> : null}
            <button className={`${STYLES.button} ${STYLES.primary}`} disabled={saving || !noteText.trim()} onClick={() => void addNote()} type="button">Add note</button>
          </div>
        </div>
      ) : null}

      {error ? <p className={`${LAYOUT_STYLES.text} ${STYLES.error}`} role="alert">{error}</p> : null}

      {/* Notes list: newest first, author and date over the note. */}
      {loading && !notes.length ? (
        <RainbowBusySpinner busy label="Loading notes..." size={14} />
      ) : notes.length ? (
        <div className={LAYOUT_STYLES.list} data-kr-element="lead-notes-list">
          {notes.map((note) => (
            <article className={`${LAYOUT_STYLES.item} ${STYLES.item}`} key={note.id}>
              <strong className={STYLES.itemHead}>{note.performedByLabel ?? 'KR Homebase'} · {formatShortDate(note.activityAt)}</strong>
              <p className={`${LAYOUT_STYLES.text} ${STYLES.itemText}`}>{note.note || note.title}</p>
            </article>
          ))}
        </div>
      ) : !error ? (
        <p className={`${LAYOUT_STYLES.text} ${STYLES.statusLine}`}>No notes have been added to this lead yet.</p>
      ) : null}

      {/* Older notes (D10): a button and a line while more exist on the server. */}
      {nextCursor ? (
        <div className={LAYOUT_STYLES.more}>
          <button className={`${STYLES.button} ${STYLES.secondary}`} disabled={loading} onClick={() => void loadOlder()} type="button">Load older notes</button>
          <span className={STYLES.statusLine}>Older notes exist.</span>
          {loading ? <RainbowBusySpinner busy size={14} /> : null}
        </div>
      ) : null}
    </div>
  )
}
