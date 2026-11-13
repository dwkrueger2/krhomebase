// file: apps/web/features/communications/communicationTypes.ts
/**
 * Production-facing data contracts shared by the communications components.
 *
 * Ported from the old `hb-components/KR-Communications/CommunicationTypes.ts`, plus the small helpers that sat at the
 * top of the old `CommunicationsPanel.client.tsx` (the user from the session, initials, the date label, the subject
 * from the first line). Unchanged: `sanitizeWorkstreamNoteHtml`, `parseWorkstreamSlashCommands`, the option labels
 * and their order, the Client / Lead / Internal states.
 *
 * Changed:
 * - The activity type is the contract's `WorkstreamSubgroup` (`@krhomebase/contracts`), the same seven values.
 * - Each option names an icon (`CommunicationActivityIconName`, drawn by `CommunicationActivityIcon`) instead of a
 *   text glyph (☎ ✉ ▤ ✓ ⇩ ⇧ ◌), which the icon rule no longer allows (apps/web/AGENTS.md, "Icons live in one place").
 * - `CommunicationEntry` drops the reactions and quotes, which the API has never stored, and gains `subject`,
 *   `attachments` (the entry's linked document) and `assigneeLabel`, which the API returns.
 * - `communicationEntryFromActivity` reads the new API's camelCase `WorkstreamActivity` instead of the old raw row,
 *   names the author from `performedByLabel`, and labels each entry with its client, matter or lead (the firm feed
 *   mixes every client).
 */

import type { WorkstreamActivity, WorkstreamSubgroup } from '@krhomebase/contracts'

export type WorkstreamCommunicationActivityType = WorkstreamSubgroup
export type CommunicationClientState = 'Client' | 'Lead' | 'Internal'

/** The icon drawn beside an activity type (see `components/CommunicationActivityIcon.client.tsx`). */
export type CommunicationActivityIconName = 'phone' | 'mail' | 'note' | 'check' | 'download' | 'upload' | 'progress'

export interface ParsedWorkstreamSlashCommands {
  body: string
  activityType: WorkstreamCommunicationActivityType
  activityCommand: string | null
  subject: string | null
}

/** Keeps persisted rich notes safe when the communication feed renders them. */
export function sanitizeWorkstreamNoteHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|input|button)\b[^>]*>/gi, '')
    .replace(/\s+(?:on[a-z]+|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*("|')\s*(?:javascript|vbscript|data):[\s\S]*?\1/gi, '')
    .replace(/(?:javascript|vbscript|data)\s*:/gi, '')
}

/** Interprets the compact commands supported by the WorkStream composer. */
export function parseWorkstreamSlashCommands(
  input: string,
  fallbackActivityType: WorkstreamCommunicationActivityType,
): ParsedWorkstreamSlashCommands {
  let body = input.trim()
  let activityType = fallbackActivityType
  let activityCommand: string | null = null
  let subject: string | null = null
  const subjectMatch = body.match(/^\/sub:\s*(?:\[([^\]]+)\]|([^\n]+))\s*/i)
  if (subjectMatch) {
    subject = (subjectMatch[1] ?? subjectMatch[2] ?? '').trim().slice(0, 160) || null
    body = body.slice(subjectMatch[0].length).trim()
  }
  const commandMatch = body.match(/^\/(email|pc|phonecall|note|n|t|task|received|sent|wip)\b\s*/i)
  if (commandMatch) {
    const command = commandMatch[1]!.toLowerCase()
    activityCommand = command
    activityType = command === 'email' ? 'Emails'
      : command === 'pc' || command === 'phonecall' ? 'PhoneCalls'
        : command === 't' || command === 'task' ? 'Tasks'
          : command === 'received' ? 'ReceivedFiles'
            : command === 'sent' ? 'SentFiles'
              : command === 'wip' ? 'WIP' : 'Notes'
    body = body.slice(commandMatch[0].length).trim()
  }
  return { body, activityType, activityCommand, subject }
}

/**
 * The saved subject: the `/sub:` subject when one was typed, otherwise the first line of the note (spaces folded),
 * otherwise "<type label> communication"; never longer than 160 characters. Moved unchanged from the old panel.
 */
export function subjectFromBody(body: string, activityType: WorkstreamCommunicationActivityType, explicitSubject?: string | null): string {
  if (explicitSubject) return explicitSubject
  const label = WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.find((option) => option.value === activityType)?.label ?? 'Communication'
  const firstLine = body.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, ' ')
  return (firstLine || `${label} communication`).slice(0, 160)
}

export interface CommunicationUser {
  id: string
  name: string
  handle: string
  role: string
  initials: string
  avatarTone: 'gold' | 'blue' | 'teal' | 'rose'
}

/** A linked document shown under an entry (new: from the API's `documentUrl` and `documentLabel`). */
export interface CommunicationAttachment {
  label: string
  url: string
}

export interface CommunicationEntry {
  wsid: string
  author: CommunicationUser
  createdAt?: string
  createdLabel: string
  edited?: boolean
  direction: 'inbound' | 'outbound' | 'internal'
  activityType: WorkstreamCommunicationActivityType
  /** The saved subject line (new; the old thread did not show it). */
  subject: string
  body: string
  bodyHtml?: string
  attachments: CommunicationAttachment[]
  /** Who a task is assigned to, as the API shows it (new). */
  assigneeLabel?: string
  sourceLabel: string
}

/** The signed-in person as `app/page.tsx` hands it over from the session. */
export interface CommunicationsViewer {
  userId: string
  displayName: string
  email: string
  role: string
}

/** Shared activity choices mirror WorkstreamActivityLedger's filter vocabulary. */
export const WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS: readonly { value: WorkstreamCommunicationActivityType; label: string; icon: CommunicationActivityIconName }[] = [
  { value: 'PhoneCalls', label: 'Phone Call', icon: 'phone' },
  { value: 'Emails', label: 'Email Note', icon: 'mail' },
  { value: 'Notes', label: 'Note', icon: 'note' },
  { value: 'Tasks', label: 'Task', icon: 'check' },
  { value: 'ReceivedFiles', label: 'Received files', icon: 'download' },
  { value: 'SentFiles', label: 'Sent files', icon: 'upload' },
  { value: 'WIP', label: 'Work in progress', icon: 'progress' },
]

export const COMMUNICATION_CLIENT_STATE_OPTIONS: readonly CommunicationClientState[] = [
  'Client',
  'Lead',
  'Internal',
]

/** The firm's own client account and matter that "Internal" entries are saved to. */
export const INTERNAL_CLIENT_NUMBER = '050'
export const INTERNAL_MATTER_NUMBER = '050.1'

/** Converts the authenticated session into the reusable communication user shape. */
export function communicationUserFromViewer(viewer: CommunicationsViewer | null | undefined): CommunicationUser {
  const name = normalizeCommunicationDisplayName(viewer?.displayName || viewer?.email || '') || 'KR User'
  return {
    id: viewer?.userId ?? '',
    name,
    handle: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    role: viewer?.role ?? '',
    initials: communicationInitials(name, viewer?.email ?? ''),
    avatarTone: 'teal',
  }
}

/** Removes adjacent duplicate name parts from an upstream session display value. */
export function normalizeCommunicationDisplayName(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean)
  return words.filter((word, index) => index === 0 || word.toLocaleLowerCase() !== words[index - 1]?.toLocaleLowerCase()).join(' ')
}

/** Derives compact two-letter communication initials from the normalized name. */
export function communicationInitials(displayName: string, email: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0]![0] ?? ''}${words.at(-1)?.[0] ?? ''}`.toUpperCase()
  const fallback = words[0] || email.split('@')[0] || 'KR'
  return fallback.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'KR'
}

/** "Nov 13, 2026, 9:30 AM", the raw text when it is not a date, or "Just now" when there is none. */
export function communicationDateLabel(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Just now'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16).replace('T', ' ')
  return `${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** Where an entry belongs, for the line above its bubble: "Matter 050.1 · Name", "Client 050 · Name" or "Lead L421". */
export function communicationOwnerLabel(activity: Pick<WorkstreamActivity, 'clientNumber' | 'clientDisplayName' | 'matterNumber' | 'lcid' | 'leadId'>): string {
  const name = activity.clientDisplayName ? ` · ${activity.clientDisplayName}` : ''
  if (activity.matterNumber) return `Matter ${activity.matterNumber}${name}`
  if (activity.clientNumber) return `Client ${activity.clientNumber}${name}`
  if (activity.lcid || activity.leadId) return `Lead ${activity.lcid ?? activity.leadId}`
  return 'WorkStream activity'
}

/**
 * Turns one API entry into the thread's entry. The viewer's own entries carry the viewer's name and tone; other
 * people's entries are named from `performedByLabel` (the old code showed "WorkStream user" for everyone else).
 */
export function communicationEntryFromActivity(activity: WorkstreamActivity, currentUser: CommunicationUser): CommunicationEntry {
  const isMine = Boolean(currentUser.id) && activity.performedByUserId === currentUser.id
  const otherName = normalizeCommunicationDisplayName(activity.performedByLabel ?? '') || 'WorkStream user'
  const author: CommunicationUser = isMine
    ? currentUser
    : { id: activity.performedByUserId ?? 'workstream-user', name: otherName, handle: otherName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), role: 'WorkStream', initials: communicationInitials(otherName, ''), avatarTone: 'blue' }
  const bodyHtml = activity.noteHtml?.trim() ? activity.noteHtml : undefined
  return {
    wsid: activity.wsid,
    author,
    createdAt: activity.activityAt,
    createdLabel: communicationDateLabel(activity.activityAt),
    edited: Boolean(activity.updatedAt),
    direction: 'internal',
    activityType: activity.subgroup,
    subject: activity.title,
    body: bodyHtml ? activity.note : activity.note || activity.title,
    bodyHtml,
    attachments: activity.documentUrl ? [{ label: activity.documentLabel || 'Linked document', url: activity.documentUrl }] : [],
    assigneeLabel: activity.subgroup === 'Tasks' && activity.assigneeLabel ? activity.assigneeLabel : undefined,
    sourceLabel: communicationOwnerLabel(activity),
  }
}

/** Whether the subject adds something the note's first line does not already say (then the thread shows it). */
export function subjectIsDistinct(entry: Pick<CommunicationEntry, 'subject' | 'body'>): boolean {
  const subject = entry.subject.trim().replace(/\s+/g, ' ')
  if (!subject) return false
  const firstLine = (entry.body.split(/\r?\n/, 1)[0] ?? '').trim().replace(/\s+/g, ' ')
  return !firstLine.startsWith(subject)
}
