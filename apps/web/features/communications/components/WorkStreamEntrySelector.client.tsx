'use client'
// file: apps/web/features/communications/components/WorkStreamEntrySelector.client.tsx
/**
 * The bar above the WorkStream editor: "Log as one or more" activity buttons, the Client / Lead / Internal switch, the
 * matter button, and the three small menus they open (client lookup, matter list, task assignees).
 *
 * Split out of the old `hb-components/KR-Communications/WorkStreamRTE.client.tsx` (the file was over 500 lines).
 * Unchanged: the button order and labels, the hints on hover, at least one type always selected, the orange outline
 * on the chosen state, `Cnt:<number>` on the Client button once a client is chosen, `Matter:<number>` on the matter
 * button, the lookup popover with a search box and Close, "Assignees: <count>" with None and the current user first.
 *
 * Changed:
 * - The menus' open state lives here instead of in the editor; the editor still owns the chosen assignees.
 * - The client lookup searches the contacts the browser holds (client contacts with a client account only), not the
 *   old contacts request. Lead shows a sentence instead of a search: there is no lead lookup until the Leads screen.
 * - With a fixed context (the section opened for one client or lead) the switch does not open a lookup.
 * - The matter button shows for Client only (a lead has no matters, D12); its list comes from the parent.
 * - Type colors from `ACTIVITY_TYPE_STYLES`, SVG icons for the glyphs, 24px buttons with 11px text and 3px corners
 *   (Density Contract; they were about 22px with 10px text and 5px corners); popovers 4px corners, 6px padding.
 */

import { useState } from 'react'
import type { KRContactRecord } from '@/features/contacts/types'
import { COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS } from '../communicationActivityTypeTriggers'
import { COMMUNICATION_CLIENT_STATE_OPTIONS, WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS, type CommunicationClientState, type WorkstreamCommunicationActivityType } from '../communicationTypes'
import { contextCandidateLabel, filterClientContacts } from '../workStreamContacts'
import CommunicationActivityIcon, { ACTIVITY_TYPE_STYLES } from './CommunicationActivityIcon.client'

/** A staff member available for task assignment in the shared editor. */
export interface WorkStreamRTEAssigneeOption {
  id: string
  label: string
}

/** A matter option associated with the selected client. */
export interface WorkStreamRTEMatterOption {
  id: string
  number: string
  label?: string
}

interface WorkStreamEntrySelectorProps {
  activityTypes: readonly WorkstreamCommunicationActivityType[]
  onToggleActivityType: (activityType: WorkstreamCommunicationActivityType) => void
  clientState: CommunicationClientState
  onSelectClientState: (clientState: CommunicationClientState) => void
  /** `Cnt:050` once a client is chosen; the Client button shows it while Client is the state. */
  clientButtonLabel?: string | null
  /** `Lead:<name>` when a lead context is fixed. */
  leadButtonLabel?: string | null
  /** A fixed context: the switch changes the state only and opens no lookup. */
  contextLocked?: boolean
  /** Contacts for the client lookup. */
  contacts: readonly KRContactRecord[]
  onAcceptContact: (contact: KRContactRecord) => void
  matterOptions: readonly WorkStreamRTEMatterOption[]
  selectedMatterNumber?: string | null
  onSelectMatter: (matter: WorkStreamRTEMatterOption | null) => void
  assignmentOptions: readonly WorkStreamRTEAssigneeOption[]
  assigneeIds: readonly string[]
  onAssigneeIdsChange: (userIds: string[]) => void
  showActivityTypes: boolean
  showContextControls: boolean
  showAssigneeMenu: boolean
  showMatterMenu: boolean
  disabled: boolean
}

/** Reusable visual treatments for the selector bar and its menus. */
const STYLES = {
  bar: 'border-b border-dashed border-(--kr-theme-communication-line)',
  label: 'text-[11px] font-extrabold text-(color:--kr-theme-communication-text-subtle)',
  /** Size and shape only; the colors come from `neutral`, `clientActive` or the activity type's treatment, so they never compete. */
  button: 'px-[6px] h-[24px] cursor-pointer rounded-[3px] border text-[11px] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-50',
  neutral: 'border-(--kr-theme-communication-line) bg-transparent text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:bg-(--kr-theme-communication-reaction-surface) hover:text-(color:--kr-theme-communication-text)',
  activeRing: 'shadow-[0_0_0_1px_var(--kr-theme-communication-accent-strong)]',
  clientActive: 'border-(--kr-theme-orange) bg-(--kr-theme-communication-reaction-surface) font-black text-(color:--kr-theme-communication-text)',
  divider: 'h-[16px] w-px bg-(--kr-theme-communication-line)',
  popover: 'rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised) shadow-[0_4px_12px_rgba(0,30,58,.25)]',
  popoverInput: 'px-[6px] h-[24px] min-w-0 flex-1 rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-composer-surface) text-[12px] text-(color:--kr-theme-communication-text) outline-none focus:border-(--kr-theme-communication-accent-strong)',
  popoverNote: 'text-[11px] text-(color:--kr-theme-communication-text-muted)',
  suggestion: 'px-[4px] min-h-[20px] cursor-pointer border-0 bg-transparent text-left text-[11px] leading-tight text-(color:--kr-theme-communication-text) hover:bg-(--kr-theme-communication-reaction-surface)',
  suggestionPrimary: 'min-w-0 truncate font-bold text-(color:--kr-theme-communication-text)',
  suggestionMeta: 'shrink-0 text-[10px] leading-tight text-(color:--kr-theme-communication-text-subtle)',
  assignmentHeader: 'text-[11px] font-bold text-(color:--kr-theme-communication-text)',
  assignmentOption: 'text-[11px] text-(color:--kr-theme-communication-text-muted)',
  assignmentLabel: 'font-bold text-(color:--kr-theme-communication-text)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Structural spacing for the bar, the button groups and the menus. */
const LAYOUT_STYLES = {
  bar: 'mb-[4px] pb-[4px] gap-[3px] flex flex-wrap items-center',
  label: 'mr-[3px]',
  button: 'gap-[3px] inline-flex items-center',
  contextGroup: 'gap-[3px] flex flex-wrap items-center',
  divider: 'mx-[3px]',
  popover: 'mb-[4px] p-[6px] gap-[3px] grid',
  popoverRow: 'gap-[3px] flex items-center',
  suggestion: 'gap-[4px] flex min-w-0 items-center',
  assigneeMenu: 'mb-[4px]',
  assignmentOption: 'min-h-[18px] gap-[4px] flex items-center',
} as const

/**
 * Renders the activity and context bar and its menus.
 *
 * The parent (`WorkStreamRTE`, and above it the panel) owns every chosen value; this component owns only which menu is
 * open and the lookup's search text.
 */
export default function WorkStreamEntrySelector({
  activityTypes,
  assigneeIds,
  assignmentOptions,
  clientButtonLabel,
  clientState,
  contacts,
  contextLocked = false,
  disabled,
  leadButtonLabel,
  matterOptions,
  onAcceptContact,
  onAssigneeIdsChange,
  onSelectClientState,
  onSelectMatter,
  onToggleActivityType,
  selectedMatterNumber,
  showActivityTypes,
  showAssigneeMenu,
  showContextControls,
  showMatterMenu,
}: WorkStreamEntrySelectorProps) {
  const [contextEditKind, setContextEditKind] = useState<CommunicationClientState | null>(null)
  const [contextEditQuery, setContextEditQuery] = useState('')
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false)
  const [matterMenuOpen, setMatterMenuOpen] = useState(false)
  const contextEditMatches = contextEditKind === 'Client' ? filterClientContacts(contacts, contextEditQuery) : []
  const selectedActivityIsTask = activityTypes.includes('Tasks')

  /** Changes the state; Client and Lead also open their lookup unless the context is fixed. */
  function selectClientState(nextState: CommunicationClientState): void {
    onSelectClientState(nextState)
    setMatterMenuOpen(false)
    if (nextState === 'Internal' || contextLocked) {
      setContextEditKind(null)
      return
    }
    setContextEditKind(nextState)
    setContextEditQuery('')
  }

  function acceptContact(contact: KRContactRecord): void {
    onAcceptContact(contact)
    setContextEditKind(null)
    setContextEditQuery('')
  }

  function toggleAssignee(id: string): void {
    onAssigneeIdsChange(assigneeIds.includes(id) ? assigneeIds.filter((value) => value !== id) : [...assigneeIds, id])
  }

  return (
    <>
      {/* WorkStream entry selector: activity, client/lead/internal context, and matter controls share one bar. */}
      {showActivityTypes || showContextControls ? (
        <div className={`${LAYOUT_STYLES.bar} ${STYLES.bar}`} data-kr-id="communication-entry-type-selector" aria-label="Select the WorkStream activity type and context">
          {showActivityTypes ? <span className={`${LAYOUT_STYLES.label} ${STYLES.label}`}>Log as one or more</span> : null}
          {showActivityTypes ? WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.map((option) => {
            const selected = activityTypes.includes(option.value)
            return <button aria-label={`${option.label}. ${COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS[option.value]}`} aria-pressed={selected} className={`${LAYOUT_STYLES.button} ${STYLES.button} ${selected ? `${ACTIVITY_TYPE_STYLES[option.value].active} ${STYLES.activeRing}` : ACTIVITY_TYPE_STYLES[option.value].idle}`} data-kr-element="workstream-activity-type" data-kr-workstream-activity-type={option.value} disabled={disabled} key={option.value} onClick={() => onToggleActivityType(option.value)} title={COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS[option.value]} type="button"><CommunicationActivityIcon name={option.icon} />{option.label}</button>
          }) : null}
          {showContextControls ? <>
            <span className={`${LAYOUT_STYLES.divider} ${STYLES.divider}`} aria-hidden="true" />
            <div className={LAYOUT_STYLES.contextGroup} data-kr-element="workstream-context-selector" role="group" aria-label="Select the WorkStream record context">
              {COMMUNICATION_CLIENT_STATE_OPTIONS.map((option) => {
                const selected = clientState === option
                const label = selected && option === 'Client' && clientButtonLabel ? clientButtonLabel : selected && option === 'Lead' && leadButtonLabel ? leadButtonLabel : option
                return <button aria-pressed={selected} className={`${LAYOUT_STYLES.button} ${STYLES.button} ${selected ? STYLES.clientActive : STYLES.neutral}`} data-kr-client-state={option} data-kr-element="workstream-client-state" disabled={disabled} key={option} onClick={() => selectClientState(option)} type="button">{label}</button>
              })}
              {showMatterMenu && clientState === 'Client' ? <button aria-expanded={matterMenuOpen} className={`${LAYOUT_STYLES.button} ${STYLES.button} ${selectedMatterNumber ? STYLES.clientActive : STYLES.neutral}`} data-kr-element="workstream-matter-selector" disabled={disabled} onClick={() => { setMatterMenuOpen((open) => !open); setContextEditKind(null) }} type="button">{selectedMatterNumber ? `Matter:${selectedMatterNumber}` : 'Matter'}</button> : null}
            </div>
          </> : null}
        </div>
      ) : null}
      {/* Client or lead lookup: opened by the Client or Lead button */}
      {contextEditKind && contextEditKind !== 'Internal' ? <div className={`${LAYOUT_STYLES.popover} ${STYLES.popover}`} data-kr-element="workstream-context-edit-menu" role="dialog" aria-label={`Edit ${contextEditKind.toLowerCase()} context`}>
        <div className={LAYOUT_STYLES.popoverRow}>
          {contextEditKind === 'Client'
            ? <input autoFocus aria-label="Search client context" className={STYLES.popoverInput} onChange={(event) => setContextEditQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setContextEditKind(null) }} placeholder="Search client" value={contextEditQuery} />
            : <span className={STYLES.popoverNote}>Lead lookup comes with the Leads screen. Open a lead there to write to it.</span>}
          <button className={`${LAYOUT_STYLES.button} ${STYLES.button} ${STYLES.neutral}`} onClick={() => setContextEditKind(null)} type="button">Close</button>
        </div>
        {contextEditMatches.map((candidate) => <button className={`${LAYOUT_STYLES.suggestion} ${STYLES.suggestion}`} key={candidate.id} onClick={() => acceptContact(candidate)} type="button"><span className={STYLES.suggestionPrimary}>{contextCandidateLabel(candidate)}</span><small className={STYLES.suggestionMeta}>| {candidate.typeLabel} - ({candidate.icid ?? candidate.ecid ?? candidate.id})</small></button>)}
        {contextEditKind === 'Client' && !contextEditMatches.length ? <span className={STYLES.popoverNote}>{contacts.length ? 'No client matches yet; keep typing.' : 'The contact list is still loading...'}</span> : null}
      </div> : null}
      {/* Task assignees: shown while Task is one of the chosen types */}
      {showAssigneeMenu && selectedActivityIsTask ? <div className={LAYOUT_STYLES.assigneeMenu} data-kr-element="workstream-assignee-context-menu">
        <button aria-expanded={assigneeMenuOpen} aria-label="Click to assign other users" className={`${LAYOUT_STYLES.button} ${STYLES.button} ${STYLES.neutral}`} disabled={disabled} onClick={() => setAssigneeMenuOpen((open) => !open)} title="Click to assign other users" type="button">Assignees: {assigneeIds.length ? assigneeIds.length : 'None'}</button>
        {assigneeMenuOpen ? <div className={`${LAYOUT_STYLES.popover} ${STYLES.popover}`} role="group" aria-label="Select task assignees"><span className={STYLES.assignmentHeader}>Task assignees</span><label className={`${LAYOUT_STYLES.assignmentOption} ${STYLES.assignmentOption}`}><input checked={!assigneeIds.length} onChange={() => onAssigneeIdsChange([])} type="checkbox" /> None</label>{assignmentOptions.map((option) => <label className={`${LAYOUT_STYLES.assignmentOption} ${STYLES.assignmentOption}`} key={option.id}><input checked={assigneeIds.includes(option.id)} onChange={() => toggleAssignee(option.id)} type="checkbox" /><span className={STYLES.assignmentLabel}>{option.label}</span></label>)}</div> : null}
      </div> : null}
      {/* Matter list: the chosen client's matters; "No matter" saves to the client's .0 matter (D12) */}
      {matterMenuOpen && clientState === 'Client' ? <div className={`${LAYOUT_STYLES.popover} ${STYLES.popover}`} data-kr-element="workstream-matter-context-menu" role="listbox" aria-label="Select matter">
        <button className={`${LAYOUT_STYLES.suggestion} ${STYLES.suggestion}`} onClick={() => { onSelectMatter(null); setMatterMenuOpen(false) }} type="button">No matter (the client&apos;s .0 matter)</button>
        {matterOptions.map((option) => <button className={`${LAYOUT_STYLES.suggestion} ${STYLES.suggestion}`} key={option.id} onClick={() => { onSelectMatter(option); setMatterMenuOpen(false) }} type="button"><strong>{option.number}</strong><small className={STYLES.suggestionMeta}>{option.label ?? 'Matter'}</small></button>)}
        {!matterOptions.length ? <span className={STYLES.popoverNote}>{clientButtonLabel ? 'This client has no other matters listed.' : 'Choose a client first.'}</span> : null}
      </div> : null}
    </>
  )
}
