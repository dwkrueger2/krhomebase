// file: apps/web/features/communications/workstreamTags.ts
/**
 * WorkStream tags (FB-0027, web patch 590; the requester, Nov 23, 2026): typed at the start of a word in the WorkStream
 * editor, a tag prefix opens a short list of one kind of record, and the pick becomes a chip in the note that opens
 * the record when clicked.
 *
 * | Kind     | Default | Lists                                         | Opens (`openKRCode`)                     |
 * |----------|---------|-----------------------------------------------|------------------------------------------|
 * | `client` | `@@`    | client accounts (the browser's contact list)  | the client (`client`, its number)        |
 * | `entity` | `##`    | businesses, clients or not                    | the business (`contact`, its ECID)       |
 * | `person` | `!!`    | leads, and people who are not clients         | the lead (`lead`, LCID) or the contact   |
 * | `matter` | `$$`    | the chosen client's matters                   | the matter (`matter`, with its client)   |
 *
 * The prefixes are the person's own (User Settings → Preferences → WorkStream tags, `workstreamTagPrefixes`).
 *
 * **The chip in the saved note** is a `span` with `data-ws-tag` (the code kind), `data-ws-code`, and for a matter
 * `data-ws-client`, plus `role="link"`, `tabindex="0"` and a `title`. The API's note cleanup keeps these attributes
 * (it removes scripts, event handlers and `style`), and so does `sanitizeWorkstreamNoteHtml`. The screens that draw a
 * saved note style the chip by its attribute and follow it with `followWorkstreamTag`, which hands the code to
 * `openKRCode` (apps/web/AGENTS.md, "Following a code"). The attributes are `data-ws-*`, not `data-kr-*`, because
 * they are part of the stored note and are styled (AGENTS_05 keeps `data-kr-*` for inspection only).
 *
 * Pure functions only: the editor's half is `useWorkstreamTagging.client.ts`.
 */

import type { WorkstreamTagPrefixesPreference } from '@krhomebase/contracts'
import { openKRCode, type KRCodeKind, type KRCodeTarget } from '@/components/ui/codeLinks'
import type { KRContactRecord } from '@/features/contacts/types'
import { contactSearchText } from './workStreamContacts'

/** The four kinds of tag. */
export type WorkstreamTagKind = keyof WorkstreamTagPrefixesPreference

/** A tag being typed: its kind, the prefix, what follows it, and where the prefix starts in the text before the caret. */
export interface WorkstreamTagTrigger {
  kind: WorkstreamTagKind
  prefix: string
  query: string
  start: number
}

/** A matter the matter tag can offer (the composer's matter list). */
export interface WorkstreamTagMatter {
  id: string
  number: string
  label?: string
}

/** A lead the person tag can offer (read from the API once, `fetchLeads`). */
export interface WorkstreamTagLead {
  id: string
  lcid: string | null
  individualId: string
  displayName: string
  email: string | null
  phone: string | null
}

/** One line in the tag list. */
export interface WorkstreamTagCandidate {
  kind: WorkstreamTagKind
  /** Unique within the list. */
  key: string
  /** The chip's words ("077 Ann Example", "306.2 Deed", "L007 Ann Example", "Acme LLC"). */
  label: string
  /** The grey words after it in the list ("Client", "Lead", "Business · E0012"). */
  meta: string
  /** Where the chip leads. */
  target: KRCodeTarget
  /** The client contact picked (the first client tag sets where the entry is saved). */
  contact?: KRContactRecord
  /** The matter picked (sets the entry's matter when none is chosen). */
  matter?: WorkstreamTagMatter
}

/** The words a tag kind is called by in the list and the prompts. */
export const WORKSTREAM_TAG_KIND_LABELS: Record<WorkstreamTagKind, string> = {
  client: 'Clients',
  entity: 'Businesses',
  person: 'Leads and non-clients',
  matter: 'Matters',
}

/** The longest query a tag list follows; past it the words are ordinary text again. */
const MAX_QUERY = 40

/** At most this many lines in the list. */
const MAX_CANDIDATES = 6

/**
 * Finds the tag being typed just before the caret: a prefix at the start of the text or after a space, followed by
 * at most 40 characters on the same line. The nearest prefix wins; with two prefixes at one place, the longer one.
 *
 * @param textBeforeCaret - The caret's text node up to the caret (a chip is its own node, so it is never searched).
 * @returns The trigger, or null when no tag is being typed.
 */
export function findWorkstreamTagTrigger(textBeforeCaret: string, prefixes: WorkstreamTagPrefixesPreference): WorkstreamTagTrigger | null {
  const ordered = (Object.entries(prefixes) as Array<[WorkstreamTagKind, string]>).filter(([, prefix]) => prefix).sort((left, right) => right[1].length - left[1].length)
  const earliest = Math.max(0, textBeforeCaret.length - MAX_QUERY - 3)
  for (let start = textBeforeCaret.length - 1; start >= earliest; start -= 1) {
    if (start > 0 && !/\s/.test(textBeforeCaret[start - 1]!)) continue
    for (const [kind, prefix] of ordered) {
      if (!textBeforeCaret.startsWith(prefix, start)) continue
      const query = textBeforeCaret.slice(start + prefix.length)
      if (query.length > MAX_QUERY || /[\n\r]/.test(query) || /^\s/.test(query)) return null
      return { kind, prefix, query, start }
    }
  }
  return null
}

/** Scores a name against the query: the code exactly, the name exactly, the name's start, a word's start, anywhere. */
function score(query: string, label: string, code: string | null, searchText: string): number {
  if (!query) return 1
  if (code && code.toLowerCase() === query) return 1200
  const name = label.toLowerCase()
  if (name === query) return 1000
  if (name.startsWith(query) || (code && code.toLowerCase().startsWith(query))) return 900
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 800
  return searchText.includes(query) ? 600 : 0
}

/** The best lines for a tag being typed, at most six. */
export function workstreamTagCandidates(
  trigger: Pick<WorkstreamTagTrigger, 'kind' | 'query'>,
  sources: { contacts: readonly KRContactRecord[]; matters: readonly WorkstreamTagMatter[]; leads: readonly WorkstreamTagLead[]; clientId?: string | null },
): WorkstreamTagCandidate[] {
  const query = trigger.query.trim().toLowerCase()
  const scored: Array<{ candidate: WorkstreamTagCandidate; score: number }> = []
  const add = (candidate: WorkstreamTagCandidate, value: number) => { if (value > 0) scored.push({ candidate, score: value }) }

  if (trigger.kind === 'client') {
    // One line per client account (a joint client has two contacts).
    const seen = new Set<string>()
    for (const contact of sources.contacts) {
      if (!contact.isClient || !contact.clientId || seen.has(contact.clientId)) continue
      seen.add(contact.clientId)
      const name = contact.clientDisplayName?.trim() || contact.displayName
      add({
        kind: 'client',
        key: `client:${contact.clientId}`,
        label: [contact.clientNumber, name].filter(Boolean).join(' '),
        meta: 'Client',
        target: { kind: 'client', code: contact.clientNumber ?? contact.clientId },
        contact,
      }, score(query, name, contact.clientNumber, contactSearchText(contact)))
    }
  } else if (trigger.kind === 'entity') {
    for (const contact of sources.contacts) {
      if (contact.kind !== 'entity') continue
      const code = contact.ecid ?? null
      add({
        kind: 'entity',
        key: `entity:${contact.id}`,
        label: contact.displayName,
        meta: ['Business', contact.isClient && contact.clientNumber ? `Client ${contact.clientNumber}` : code].filter(Boolean).join(' · '),
        target: { kind: 'contact', code: code ?? contact.id },
      }, score(query, contact.displayName, code, `${contactSearchText(contact)} ${code ?? ''}`.toLowerCase()))
    }
  } else if (trigger.kind === 'person') {
    const leadByPerson = new Map(sources.leads.map((lead) => [lead.individualId, lead]))
    const listed = new Set<string>()
    for (const contact of sources.contacts) {
      if (contact.kind !== 'individual' || contact.isClient) continue
      const lead = leadByPerson.get(contact.id)
      if (lead) listed.add(lead.id)
      const code = lead?.lcid ?? contact.icid ?? null
      add({
        kind: 'person',
        key: `person:${contact.id}`,
        label: [lead?.lcid, contact.displayName].filter(Boolean).join(' '),
        meta: lead ? 'Lead' : ['Contact', contact.icid].filter(Boolean).join(' · '),
        target: lead?.lcid ? { kind: 'lead', code: lead.lcid } : { kind: 'contact', code: contact.icid ?? contact.id },
      }, score(query, contact.displayName, code, `${contactSearchText(contact)} ${code ?? ''}`.toLowerCase()))
    }
    // Leads whose person the browser's contact list does not hold.
    for (const lead of sources.leads) {
      if (listed.has(lead.id)) continue
      add({
        kind: 'person',
        key: `lead:${lead.id}`,
        label: [lead.lcid, lead.displayName].filter(Boolean).join(' '),
        meta: 'Lead',
        target: { kind: 'lead', code: lead.lcid ?? lead.id },
      }, score(query, lead.displayName, lead.lcid, [lead.displayName, lead.lcid, lead.email, lead.phone].filter(Boolean).join(' ').toLowerCase()))
    }
  } else {
    for (const matter of sources.matters) {
      const label = [matter.number, matter.label].filter(Boolean).join(' ')
      add({
        kind: 'matter',
        key: `matter:${matter.id}`,
        label,
        meta: 'Matter',
        target: { kind: 'matter', code: matter.id, clientId: sources.clientId ?? null },
        matter,
      }, score(query, matter.label ?? '', matter.number, label.toLowerCase()))
    }
  }

  return scored
    .sort((left, right) => right.score - left.score || left.candidate.label.localeCompare(right.candidate.label))
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.candidate)
}

/** The attributes of a chip in the saved note (see the file comment). */
export function workstreamTagChipAttributes(candidate: WorkstreamTagCandidate): Record<string, string> {
  const words: Record<KRCodeKind, string> = { client: 'client', contact: 'contact', lead: 'lead', matter: 'matter', task: 'task', workstream: 'WorkStream entry' }
  return {
    'data-ws-tag': candidate.target.kind,
    'data-ws-code': candidate.target.code,
    ...(candidate.target.clientId ? { 'data-ws-client': candidate.target.clientId } : {}),
    role: 'link',
    tabindex: '0',
    title: `Open ${words[candidate.target.kind]} ${candidate.label}`,
  }
}

const TAG_KINDS: readonly KRCodeKind[] = ['client', 'contact', 'lead', 'matter']

/** The code a chip in a saved note leads to, or null for anything else. */
export function workstreamTagTarget(element: Element | null): KRCodeTarget | null {
  const chip = element?.closest('[data-ws-tag]')
  if (!chip) return null
  const kind = chip.getAttribute('data-ws-tag') as KRCodeKind | null
  const code = chip.getAttribute('data-ws-code')?.trim()
  if (!kind || !TAG_KINDS.includes(kind) || !code) return null
  return { kind, code, clientId: chip.getAttribute('data-ws-client') }
}

/**
 * Follows a chip in a drawn note: a click, or Enter or Space on a focused chip. Pass the note's `onClick` and
 * `onKeyDown` events; anything else is left alone. The event stops here, so the row underneath does not also open.
 *
 * @returns True when a chip was followed.
 */
export function followWorkstreamTag(event: { target: EventTarget | null; type: string; key?: string; preventDefault: () => void; stopPropagation: () => void }): boolean {
  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return false
  // Read as an element only when it is one (a text node or the window has no `closest`).
  const node = event.target as Element | null
  const target = workstreamTagTarget(typeof node?.closest === 'function' ? node : null)
  if (!target) return false
  event.preventDefault()
  event.stopPropagation()
  openKRCode(target)
  return true
}

/**
 * The chip's look in a drawn note, by its attribute: a small boxed link in the Communication accent. Added to the
 * class of the element that holds the note's HTML (the thread, the entry dialog, the editor).
 */
export const WORKSTREAM_TAG_CHIP_STYLES = '[&_[data-ws-tag]]:px-[3px] [&_[data-ws-tag]]:cursor-pointer [&_[data-ws-tag]]:rounded-[3px] [&_[data-ws-tag]]:border [&_[data-ws-tag]]:border-(--kr-theme-communication-accent-strong) [&_[data-ws-tag]]:bg-[color-mix(in_srgb,var(--kr-theme-communication-accent-strong)_14%,transparent)] [&_[data-ws-tag]]:font-semibold [&_[data-ws-tag]]:text-(color:--kr-theme-communication-accent) [&_[data-ws-tag]]:whitespace-nowrap [&_[data-ws-tag]:hover]:underline'
