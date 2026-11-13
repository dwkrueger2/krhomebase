'use client'
// file: apps/web/features/leads/components/LeadDetailCard.client.tsx
/**
 * The lead's Detail tab: the summary card ("L007 · Name") with its actions, and the Lead notes card.
 *
 * Ported from the `detail` block of the old `hb-components/KR-Leads/LeadsPanel.client.tsx` (the two `KRModuleCard`s,
 * their titles, notes and `krId`s, `data-kr-element="lead-summary"`, the name, "email · phone" and summary lines, and
 * Edit Lead shown to people who may change leads). It is a file of its own so the panel stays short.
 *
 * Changed:
 *  - The summary also lists the lead's status, urgency, source, practice area, assignee, ICID and the received and
 *    last-action dates, which the API now returns, as label-beside-value rows (Save height before width).
 *  - "Convert to client" is new (the requester's decision of Nov 13, 2026): shown when the viewer may create leads
 *    (`canCreate`, the contacts.create permission) and the lead is not converted. The panel asks first.
 *  - A converted lead says which client it became, with "Open client".
 *  - "Open contact" opens the person in Clients & Contacts (the create dialog already sends people to Edit Contact).
 *  - The Lead notes card holds the Add note box and the lead's Workstream notes (`LeadNotesFeed`).
 *  - Buttons are 26px (Density Contract); "—" stands for an empty value.
 */

import type { Lead, WorkstreamActivity } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { leadNumber, leadSourceLabel, leadStatusLabel, leadUrgencyLabel } from '../leadRows'
import LeadNotesFeed from './LeadNotesFeed.client'

const STYLES = {
  title: 'text-[14px] font-extrabold leading-tight text-(color:--kr-theme-text)',
  line: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  summary: 'text-[12px] leading-tight whitespace-pre-wrap [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  factLabel: 'text-[11px] font-extrabold text-(color:--kr-theme-text-muted)',
  factValue: 'min-w-0 truncate text-[12px] text-(color:--kr-theme-text)',
  converted: 'rounded-[2px] border border-(--kr-theme-success) text-[12px] text-(color:--kr-theme-success)',
  button: 'px-[10px] py-[3px] gap-[4px] min-h-[26px] inline-flex items-center rounded-[2px] border text-[11px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  primary: 'border-(--kr-theme-brand-primary-active) bg-(--kr-theme-brand-primary-active) text-(color:--kr-theme-text-inverse)',
  secondary: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  icon: 'size-[12px]',
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
  stack: 'gap-[8px] grid min-w-0',
  summaryCard: 'gap-[4px] grid min-w-0',
  text: 'm-0',
  facts: 'gap-x-[10px] gap-y-[2px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  fact: 'gap-[3px] grid min-w-0 grid-cols-[86px_minmax(0,1fr)] items-baseline',
  converted: 'm-0 px-[6px] py-[3px]',
  buttonRow: 'pt-[2px] gap-[4px] flex flex-wrap items-center',
} as const

/** "11/13/2026" for an ISO time, or "—". */
function shortDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

export interface LeadDetailCardProps {
  lead: Lead
  /** May change leads: Edit Lead and Add note. */
  canWrite: boolean
  /** May create leads and convert them: Convert to client. */
  canCreate: boolean
  onEdit: () => void
  onConvert: () => void
  /** Opens the person in Clients & Contacts; absent while the person is not in the data store. */
  onOpenContact?: () => void
  /** Reports a saved note to the panel's status line. */
  onNoteSaved?: (message: string) => void
  /** Starting notes for a first draw without the API (tests). */
  initialNotes?: WorkstreamActivity[]
}

/**
 * Renders the lead's summary and notes cards.
 *
 * @param props - The lead, the viewer's rights, and the panel's handlers for Edit Lead, Convert to client, Open
 *   contact (or Open client once converted) and a saved note.
 */
export default function LeadDetailCard({ canCreate, canWrite, initialNotes, lead, onConvert, onEdit, onNoteSaved, onOpenContact }: LeadDetailCardProps) {
  const code = leadNumber(lead)
  const converted = Boolean(lead.convertedClientId)
  const facts: Array<[string, string]> = [
    ['Status', leadStatusLabel(lead)],
    ['Urgency', leadUrgencyLabel(lead)],
    ['Source', leadSourceLabel(lead)],
    ['Practice area', lead.practiceArea || '—'],
    ['Assigned to', lead.assignedToLabel || 'Unassigned'],
    ['ICID', lead.icid || '—'],
    ['Received', shortDate(lead.receivedAt)],
    ['Last action', shortDate(lead.lastActionAt)],
  ]

  return (
    <div className={LAYOUT_STYLES.stack}>
      <KRModuleCard title={`${code} · ${lead.displayName}`} krId="LeadSummaryCard" note="Lead identity and process summary.">
        {/* Lead detail summary: editing is deliberately deferred to the custom dialog. */}
        <div className={LAYOUT_STYLES.summaryCard} data-kr-element="lead-summary">
          <h3 className={`${LAYOUT_STYLES.text} ${STYLES.title}`}>{lead.displayName}</h3>
          <p className={`${LAYOUT_STYLES.text} ${STYLES.line}`}>{lead.email || 'No email'} · {lead.phone || 'No phone'}</p>
          {lead.summary ? <p className={`${LAYOUT_STYLES.text} ${STYLES.summary}`}>{lead.summary}</p> : null}
          {/* Lead facts: label beside value, up to three to a row. */}
          <dl className={`${LAYOUT_STYLES.text} ${LAYOUT_STYLES.facts}`} data-kr-element="lead-summary-facts">
            {facts.map(([label, value]) => (
              <div className={LAYOUT_STYLES.fact} key={label}>
                <dt className={STYLES.factLabel}>{label}</dt>
                <dd className={`${LAYOUT_STYLES.text} ${STYLES.factValue}`} title={value}>{value}</dd>
              </div>
            ))}
          </dl>
          {converted ? <p className={`${LAYOUT_STYLES.converted} ${STYLES.converted}`} data-kr-element="lead-converted">Converted: client {lead.convertedClientNumber ?? ''}.</p> : null}
          {/* Lead actions: edit, convert, and open the person. */}
          <div className={LAYOUT_STYLES.buttonRow} data-kr-element="lead-summary-actions">
            {canWrite ? (
              <button className={`${STYLES.button} ${STYLES.primary}`} onClick={onEdit} type="button"><KRHomebaseIcons.Pencil className={STYLES.icon} />Edit Lead</button>
            ) : null}
            {canCreate && !converted ? (
              <button className={`${STYLES.button} ${STYLES.secondary}`} data-kr-action="convert-lead" onClick={onConvert} type="button">Convert to client</button>
            ) : null}
            {onOpenContact ? (
              <button className={`${STYLES.button} ${STYLES.secondary}`} onClick={onOpenContact} type="button"><KRHomebaseIcons.ExternalLink className={STYLES.icon} />{converted ? 'Open client' : 'Open contact'}</button>
            ) : null}
          </div>
        </div>
      </KRModuleCard>
      <KRModuleCard title="Lead notes" krId="LeadNotesCard" note="Internal notes are visible to authorized team members.">
        <LeadNotesFeed canWrite={canWrite} initialNotes={initialNotes} key={lead.id} leadId={lead.id} onSaved={onNoteSaved} />
      </KRModuleCard>
    </div>
  )
}
