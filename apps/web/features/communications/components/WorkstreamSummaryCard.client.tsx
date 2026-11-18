'use client'
// file: apps/web/features/communications/components/WorkstreamSummaryCard.client.tsx
/**
 * The detail card beside the client WorkStream ledger (plan 10, stage 4), and its full view: the selected entry's
 * title, context, note, next steps and document link, with Open full view and Edit note; the full view (dark
 * Communication Colors) adds Reassign and, for a super admin, Delete entry. Ported from the default export of the old
 * `hb-components/KR-WorkStream/WorkstreamSummaryCard.client.tsx`.
 *
 * Unchanged: the card follows the ledger's selection; Escape or a press on the backdrop closes the full view; Edit
 * note opens the full view in edit mode with the type buttons; Delete asks first in `U6ConfirmationDialog`.
 *
 * Changes:
 *  - "Move client" is now Reassign (`WorkstreamReassignDialog`, decision D16): a client and one of its matters,
 *    `.0` first. The old move took a client only and dropped the matter.
 *  - The History section and its Add comment are not ported: comments were kept in the screen only and lost on
 *    reload (`workstream_activity_comment` has no route; reference section 3.2).
 *  - "Copy note link" copied an address no screen opened (`?activity=`); the card copies the WSID instead.
 *  - The status pill showed a fixed "Open"; it now shows the matter (`306.1 · Estate plan`).
 *  - The "updated" line says who recorded the entry and when, and when it last changed.
 *  - Saves go through the parent (`onUpdate`, `onDelete`), which calls the API and replaces the row.
 *  - Density Contract: 8px card padding, 12px note text, 24px buttons, 4px corners; the full view is drawn into
 *    `document.body` with `data-kr-theme-scope` (AGENTS: portals).
 *  - Nov 18, 2026 (FB-0016, FB-0017, web patch 570): the full view opens on a row's double-click (`openRequest`); its
 *    type buttons have their colors (it is drawn outside the WorkStream panel, so it carries the panel's color class
 *    from `Communications.module.css`); Edit note keeps every type chosen and, while Task is one, the task's people
 *    (several), as the composer does. A task named on the entry shows as "Task #<id>".
 *  - Nov 18, 2026 (web patch 571): the full view is `WorkstreamEntryDialog` (also used to add an entry and to open a
 *    followed WSID); the context line is `WorkstreamContextLine` (the client and the task are links, the types colored).
 */

import type { WorkstreamActivity } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import type { KRContactRecord } from '@/features/contacts/types'
import type { LedgerActivityRow } from '../workstreamLedgerRows'
import WorkstreamContextLine from './WorkstreamContextLine.client'
import type { WorkstreamEditorAssigneeOption } from './WorkstreamEditor.client'
import WorkstreamEntryDialog, { matterLabel, NoteBody, updatedLine, type WorkstreamSummaryUpdate } from './WorkstreamEntryDialog.client'

export type { WorkstreamSummaryUpdate } from './WorkstreamEntryDialog.client'

export interface WorkstreamSummaryCardProps {
  row: LedgerActivityRow
  assigneeOptions: readonly WorkstreamEditorAssigneeOption[]
  /** Shows Delete entry (super admin). */
  canDelete: boolean
  /** Contacts for the Reassign client search (the browser's data store). */
  contacts: readonly KRContactRecord[]
  /** Saves an edit; rejects with a plain sentence. */
  onUpdate: (wsid: string, update: WorkstreamSummaryUpdate) => Promise<void>
  /** Deletes the entry; rejects with a plain sentence. */
  onDelete: (wsid: string) => Promise<void>
  /** The entry after a reassign (it may now belong to another client). */
  onReassigned: (activity: WorkstreamActivity) => void
  /** Grows each time this entry's row is double-clicked: the full view opens (FB-0016). 0 or left out: never. */
  openRequest?: number
}

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  card: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  eyebrow: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-text-muted)',
  date: 'text-[10.5px] font-[700] text-(color:--kr-theme-text-muted)',
  title: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-brand-primary)',
  context: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  pill: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[10.5px] font-[800] text-(color:--kr-theme-brand-primary)',
  note: 'm-0 border-l-[3px] border-l-(--kr-theme-teal) text-[12px] leading-[1.35] whitespace-pre-line [overflow-wrap:anywhere] [&_a]:text-(color:--kr-theme-accent-dark) [&_a]:underline',
  label: 'm-0 text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-text-muted)',
  list: 'text-[11.5px] leading-[1.3]',
  link: 'text-[11px] font-[700] text-(color:--kr-theme-accent-dark) underline-offset-2 hover:underline',
  updated: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  muted: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  action:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[800] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active)',
  primaryAction:
    'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
} as const

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  card: 'p-[8px] gap-[4px] grid',
  header: 'gap-[6px] flex items-center justify-between',
  headerTools: 'gap-[6px] flex items-center',
  pill: 'px-[6px] py-[1px] inline-block justify-self-start',
  note: 'pl-[8px]',
  list: 'm-0 pl-[16px]',
  links: 'gap-x-[10px] gap-y-[4px] flex flex-wrap',
  actions: 'mt-[2px] gap-[6px] flex flex-wrap',
} as const

/** Renders the selected entry's card and, when asked, its dialog. */
export default function WorkstreamSummaryCard({ assigneeOptions, canDelete, contacts, onDelete, onReassigned, onUpdate, openRequest = 0, row }: WorkstreamSummaryCardProps) {
  const { activity } = row
  // Which dialog is open: none, the full view, or the full view in Edit.
  const [dialog, setDialog] = useState<'closed' | 'view' | 'edit'>('closed')

  // One card is reused as the selection changes: start each entry closed.
  useEffect(() => {
    setDialog('closed')
  }, [row.id])

  // A double-click on this entry's row opens the full view (after the reset above, which runs first).
  useEffect(() => {
    if (openRequest > 0) setDialog('view')
  }, [openRequest])

  const nextSteps = activity.nextSteps.length ? (
    <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
      {activity.nextSteps.map((step, index) => (
        <li key={`${index}-${step}`}>{step}</li>
      ))}
    </ul>
  ) : null

  return (
    <>
      <article className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="workstream-summary-card" data-kr-id={`kr-workstream-summary-card-${row.id}`} data-kr-record-id={row.id}>
        {/* The entry's identity: its type, id and date. */}
        <div className={LAYOUT_STYLES.header}>
          <p className={STYLES.eyebrow}>WorkStream note</p>
          <div className={LAYOUT_STYLES.headerTools}>
            <KRCopyButton label={`Copy WSID ${row.id}`} title="Copy this entry's WSID" value={row.id} />
            <time className={STYLES.date} dateTime={activity.activityAt}>
              {row.occurredLabel}
            </time>
          </div>
        </div>
        <h2 className={STYLES.title}>{activity.title}</h2>
        <WorkstreamContextLine className={STYLES.context} row={row} />
        <span className={`${LAYOUT_STYLES.pill} ${STYLES.pill}`}>{matterLabel(activity, row.matterNumber)}</span>

        {/* The narrative and what comes next. */}
        <NoteBody activity={activity} className={`${LAYOUT_STYLES.note} ${STYLES.note}`} />
        <p className={STYLES.label}>Next things to do</p>
        {nextSteps ?? <p className={STYLES.muted}>None recorded.</p>}
        {activity.documentUrl ? (
          <div aria-label="WorkStream files and folders" className={LAYOUT_STYLES.links}>
            <a className={STYLES.link} href={activity.documentUrl} rel="noopener noreferrer" target="_blank">
              {activity.documentLabel || activity.documentUrl}
            </a>
          </div>
        ) : null}
        <span className={STYLES.updated}>{updatedLine(activity)}</span>
        <div className={LAYOUT_STYLES.actions}>
          <button className={STYLES.action} data-kr-element="workstream-open-full-view" type="button" onClick={() => setDialog('view')}>
            Open full view
          </button>
          <button className={STYLES.primaryAction} data-kr-element="workstream-edit-note" type="button" onClick={() => setDialog('edit')}>
            Edit note
          </button>
        </div>
      </article>
      {dialog !== 'closed' ? (
        <WorkstreamEntryDialog
          key={`${row.id}-${dialog}`}
          activity={activity}
          assigneeOptions={assigneeOptions}
          canDelete={canDelete}
          clientNumber={activity.clientNumber}
          contacts={contacts}
          startEditing={dialog === 'edit'}
          onClose={() => setDialog('closed')}
          onDelete={onDelete}
          onReassigned={onReassigned}
          onUpdate={onUpdate}
        />
      ) : null}
    </>
  )
}
