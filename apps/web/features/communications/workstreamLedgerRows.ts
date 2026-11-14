// file: apps/web/features/communications/workstreamLedgerRows.ts
/**
 * Display helpers for the client WorkStream ledger (plan 10, stage 4): the Contact Detail WorkStream tab. Pure: no
 * requests, no React. Ported from the adapter in the old `modules/contacts/components/ContactDetailWorkspace.client.tsx`
 * (`workstreamActivityFromApiRow`, `CONTACT_WORKSTREAM_LABEL`) and the old `KR-WorkStream/WorkstreamActivity.types.ts`.
 *
 * Changes:
 *  - A row is built from the contract's `WorkstreamActivity` (camelCase, newest first from the API), not from raw
 *    snake_case rows, and keeps that activity so the detail card and its edits read the saved values.
 *  - The matter number is the entry's own (`matterNumber`); the old adapter showed every entry under the client's first
 *    matter (reference section 3.6, point 2). An older entry with no matter shows the client's `.0`.
 *  - The old "kind" names (`phone_call`, `work`) are gone: the filter uses the API's activity types (`subgroup`).
 */

import type { WorkstreamActivity, WorkstreamSubgroup } from '@krhomebase/contracts'
import { communicationDateLabel } from './communicationTypes'

/** The ledger's wording for each activity type (the old client ledger's labels, kept). */
export const LEDGER_ACTIVITY_LABELS: Record<WorkstreamSubgroup, string> = {
  PhoneCalls: 'Phone call',
  Emails: 'Email Note',
  Notes: 'Note',
  Tasks: 'Task',
  ReceivedFiles: 'Received files',
  SentFiles: 'Sent files',
  WIP: 'Work in progress',
}

/** The filter bar: "All activity", then one choice per type (old order and wording). */
export type LedgerActivityFilter = 'all' | WorkstreamSubgroup
export const LEDGER_FILTERS: readonly { value: LedgerActivityFilter; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'PhoneCalls', label: 'Phone calls' },
  { value: 'Emails', label: 'Email Notes' },
  { value: 'Notes', label: 'Notes' },
  { value: 'Tasks', label: 'Tasks' },
  { value: 'ReceivedFiles', label: 'Received files' },
  { value: 'SentFiles', label: 'Sent files' },
  { value: 'WIP', label: 'Work in progress' },
]

/** The add dialog's type choices (old order: Work in progress first, the old default). */
export const LEDGER_ADD_TYPE_OPTIONS: readonly { value: WorkstreamSubgroup; label: string }[] = [
  { value: 'WIP', label: 'Work in progress' },
  { value: 'Notes', label: 'Note' },
  { value: 'PhoneCalls', label: 'Phone call' },
  { value: 'Emails', label: 'Email Note' },
  { value: 'Tasks', label: 'Task' },
  { value: 'ReceivedFiles', label: 'Received files' },
  { value: 'SentFiles', label: 'Sent files' },
]

/** The two presentations of a ledger row (old names kept). */
export type LedgerRowPresentation = 'Expanded' | 'SingleLine'

/** One ledger row: what the row and the detail card show, and the saved entry behind it. */
export interface LedgerActivityRow {
  /** The public seven-character id (`wsid`): the row's key and the id every change uses. */
  id: string
  subgroup: WorkstreamSubgroup
  kindLabel: string
  matterNumber: string
  occurredLabel: string
  actorLabel: string
  title: string
  /** One-line preview (the plain note, or "No note entered."). */
  summary: string
  assigneeUserId: string | null
  activity: WorkstreamActivity
}

/** The `.0` matter number of a client, or null without a number. */
export function generalMatterNumber(clientNumber: string | null | undefined): string | null {
  const trimmed = (clientNumber ?? '').trim()
  return trimmed ? `${trimmed}.0` : null
}

/**
 * Builds the ledger row for one saved entry.
 *
 * @param activity - The entry as the API returns it.
 * @param clientNumber - The client's number, for an older entry that has no matter.
 */
export function ledgerRowFromActivity(activity: WorkstreamActivity, clientNumber: string | null | undefined): LedgerActivityRow {
  const note = activity.note.trim()
  return {
    id: activity.wsid,
    subgroup: activity.subgroup,
    kindLabel: LEDGER_ACTIVITY_LABELS[activity.subgroup],
    matterNumber: activity.matterNumber ?? generalMatterNumber(activity.clientNumber ?? clientNumber) ?? '—',
    occurredLabel: communicationDateLabel(activity.activityAt),
    actorLabel: activity.assigneeLabel || activity.performedByLabel || 'WorkStream user',
    title: activity.title,
    summary: note ? note.replace(/\s+/g, ' ') : 'No note entered.',
    assigneeUserId: activity.assigneeUserId,
    activity,
  }
}

/** "Client 306 · Matter 306.0 · Note · WSID AB12CD3", the detail card's context line (old wording). */
export function ledgerContextLine(row: LedgerActivityRow): string {
  const owner = row.activity.clientNumber ? `Client ${row.activity.clientNumber}` : (row.activity.clientDisplayName ?? 'Client')
  return `${owner} · Matter ${row.matterNumber} · ${row.kindLabel} · WSID ${row.id}`
}

/**
 * Puts a saved entry into the loaded list: replaced where it was, else first (it is the newest). An entry that no
 * longer belongs to this client (reassigned elsewhere) is taken out.
 */
export function mergeSavedActivity(list: readonly WorkstreamActivity[], saved: WorkstreamActivity, clientId: string): WorkstreamActivity[] {
  const rest = list.filter((activity) => activity.wsid !== saved.wsid)
  if (saved.clientId !== clientId) return rest
  const index = list.findIndex((activity) => activity.wsid === saved.wsid)
  if (index < 0) return [saved, ...rest]
  const copy = [...list]
  copy[index] = saved
  return copy
}

/** The first line of a note, trimmed to 160 characters: the subject when none is typed (old rule). */
export function titleFromNote(note: string): string {
  const firstLine = note.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, ' ') ?? ''
  return firstLine.slice(0, 160)
}

/** Next steps typed one per line, blanks dropped (old rule). */
export function nextStepsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((step) => step.trim())
    .filter(Boolean)
}
