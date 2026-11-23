'use client'
// file: apps/web/features/matters/components/MatterNotesList.client.tsx
/**
 * A matter's saved notes, newest first: the date and writer on one line, the note under it. FB-0022 (web patch 585):
 * the Initial Notes of Add and Edit Matter were saved (`matter_activity_log`) but never shown anywhere, so they looked
 * lost. The list is drawn on the Selected Matter Details card and, above the note box, in Edit Matter.
 *
 * Display only: the notes come with the matter from the API (`Matter.notes`), read-only.
 */

import type { MatterNote } from '@krhomebase/contracts'
import { displayDate } from '../matterDisplay'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  list: 'm-0 p-0 list-none',
  note: 'border-t border-(--kr-theme-line) first:border-t-0',
  meta: 'm-0 text-[10.5px] leading-[1.25] text-(color:--kr-theme-text-muted)',
  author: 'font-[700] text-(color:--kr-theme-text)',
  text: 'm-0 whitespace-pre-wrap text-[12px] leading-[1.3] text-(color:--kr-theme-text)',
  empty: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  list: 'grid',
  // A long history scrolls inside the list, so the card and the dialog keep their height.
  scroll: 'max-h-[160px] overflow-y-auto',
  note: 'py-[3px] gap-[1px] grid',
} as const

/** Props for the matter notes list. */
export interface MatterNotesListProps {
  notes: readonly MatterNote[]
  /** The words shown when there are no notes. */
  emptyText?: string
  /** Marker of the list (`data-kr-element`). */
  element: string
}

/** Draws the notes, newest first, or the empty line. */
export default function MatterNotesList({ element, emptyText = 'No notes yet.', notes }: MatterNotesListProps) {
  if (!notes.length) {
    return (
      <p className={STYLES.empty} data-kr-element={element}>
        {emptyText}
      </p>
    )
  }
  return (
    <ul className={`${LAYOUT_STYLES.list} ${LAYOUT_STYLES.scroll} ${STYLES.list}`} data-kr-element={element}>
      {notes.map((note) => (
        // One note: date and writer, then the text.
        <li className={`${LAYOUT_STYLES.note} ${STYLES.note}`} data-kr-element="matter-note" key={note.id}>
          <p className={STYLES.meta}>
            {displayDate(note.activityDate)} · <span className={STYLES.author}>{note.authorLabel}</span>
          </p>
          <p className={STYLES.text}>{note.text}</p>
        </li>
      ))}
    </ul>
  )
}
