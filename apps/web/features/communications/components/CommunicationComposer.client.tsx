'use client'
// file: apps/web/features/communications/components/CommunicationComposer.client.tsx
/**
 * The WorkStream composer card: who is writing and what the next entry will be, the shared editor (`WorkStreamRTE`),
 * and the footer (the status line with its two help buttons, then the parser pills).
 *
 * Ported from the old `hb-components/KR-Communications/CommunicationComposer.client.tsx`, the part that was drawn
 * (lines 1 to 832 and the footer after the comment). Not ported: the legacy editor kept inside a comment from line 833,
 * the unused `ContextSuggestion`, and the composer's own copies of the draft logic (mentions, link editor, context
 * substitution with undo and redo), which the drawn screen never used because `WorkStreamRTE` owned the editor.
 *
 * Unchanged: the identity line ("Internal communication · WorkStream entry · New <types> entry"), the status line with
 * "?" (now an "i" icon) and HELP, the parser pills ("<type> selected" or "detected", "<cue> cue suggestions ready" or
 * "recognized", "none"), and the `data-kr-*` markers.
 *
 * Changed: the help dialogs are portals (`WorkStreamQuickEntryHelpDialog.client.tsx`); loading and saving show
 * `RainbowBusySpinner` beside the status; the parser pills use the type colors (they were blue or grey); 24px avatar,
 * 8px padding, 4px corners (Density Contract).
 *
 * Drafts (FB-0026, web patch 588): the panel keeps the unsent entry in the browser (`workstreamDrafts.client.ts`). This
 * card passes every change up (`onDraftChange`), starts the editor from a restored draft (`editorKey` and the
 * `initial*` props start a fresh editor), and shows the draft line under the identity ("Draft saved 8:43pm" with
 * Discard; `draftNotice`).
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { useState } from 'react'
import { DEFAULT_WORKSTREAM_TAG_PREFIXES } from '@krhomebase/contracts'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'
import { workstreamComposerPrompt } from '../workstreamTags'
import { COMMUNICATION_ACTIVITY_TYPE_TRIGGER_RULES } from '../communicationActivityTypeTriggers'
import type { CommunicationContextCueMatch } from '../communicationContextTriggers'
import { WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS, type CommunicationClientState, type CommunicationUser, type WorkstreamCommunicationActivityType } from '../communicationTypes'
import { ACTIVITY_TYPE_STYLES } from './CommunicationActivityIcon.client'
import WorkStreamQuickEntryHelpDialog, { CommunicationContextHelpDialog } from './WorkStreamQuickEntryHelpDialog.client'
import WorkStreamRTE, { type WorkStreamRTEAssigneeOption, type WorkStreamRTEDraftState, type WorkStreamRTEMatterOption } from './WorkStreamRTE.client'

interface CommunicationComposerProps {
  activityTypes: readonly WorkstreamCommunicationActivityType[]
  onActivityTypesChange: (activityTypes: WorkstreamCommunicationActivityType[]) => void
  clientState: CommunicationClientState
  onClientStateChange: (clientState: CommunicationClientState) => void
  /** `Cnt:050` once a client is chosen. */
  clientButtonLabel?: string | null
  leadButtonLabel?: string | null
  contextLocked?: boolean
  currentUser: CommunicationUser
  contacts: readonly KRContactRecord[]
  /** Staff choices shown by WorkStreamRTE when Task is selected. */
  assigneeOptions?: readonly WorkStreamRTEAssigneeOption[]
  matterOptions?: readonly WorkStreamRTEMatterOption[]
  selectedMatterNumber?: string | null
  onMatterChange?: (matter: WorkStreamRTEMatterOption | null) => void
  /** Promotes an accepted client lookup into the owning WorkStream context. */
  onContextContactSelected?: (contact: KRContactRecord) => void
  /** The client the entry is for, so a tagged matter opens the right contact (FB-0027). */
  tagClientId?: string | null
  /** Saves the draft; a rejection keeps the draft in the editor. */
  onSubmit: (body: string, activityTypes: readonly WorkstreamCommunicationActivityType[], noteHtml?: string, assigneeUserIds?: readonly string[]) => Promise<void>
  /** Whether sending is allowed; typing remains available when this is false. */
  canSubmit?: boolean
  statusMessage?: string
  /** Loading or saving: the spinner shows beside the status. */
  statusBusy?: boolean
  disabled?: boolean
  /** Every change to the draft (FB-0026: the panel keeps it in the browser). */
  onDraftChange?: (draft: WorkStreamRTEDraftState) => void
  /** A new value starts a fresh editor from the `initial*` values (a restored or discarded draft). */
  editorKey?: string | number
  initialBody?: string
  initialHtml?: string
  initialAssigneeUserIds?: readonly string[]
  /** The draft line under the identity: what was kept and when, with Discard. Null: no line. */
  draftNotice?: { label: string; onDiscard: () => void } | null
}

/** Reusable color, typography, border, and control treatments owned by this component. */
const STYLES = {
  composer: 'rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated) text-(color:--kr-theme-communication-text)',
  avatar: 'inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border-2 border-(--kr-theme-communication-line) text-[10px] font-black text-(color:--CommunicationAvatarText)',
  avatarGold: 'bg-(--CommunicationAvatarGold)',
  avatarBlue: 'bg-(--CommunicationAvatarBlue)',
  avatarTeal: 'bg-(--CommunicationAvatarTeal)',
  avatarRose: 'bg-(--CommunicationAvatarRose)',
  identityName: 'text-[12px] text-(color:--kr-theme-communication-text)',
  identityDescription: 'text-[11px] text-(color:--kr-theme-communication-text-subtle)',
  draftNotice: 'text-[11px] text-(color:--kr-theme-communication-text-subtle)',
  draftDiscard: 'px-[5px] h-[18px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-text-subtle) bg-transparent text-[10px] font-bold leading-none text-(color:--kr-theme-communication-text-subtle) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-accent-strong)',
  selectedActivity: 'text-[11px] text-(color:--kr-theme-communication-text-subtle)',
  selectedActivityStrong: 'text-(color:--kr-theme-communication-accent)',
  footer: 'text-[11px] text-(color:--kr-theme-communication-text-subtle)',
  statusHelpButton: 'p-0 h-[16px] w-[16px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-text-subtle) bg-transparent text-(color:--kr-theme-communication-text-subtle) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-accent-strong)',
  statusHelpIcon: 'h-[10px] w-[10px]',
  statusHelpButtonWide: 'px-[5px] h-[18px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-text-subtle) bg-transparent text-[9px] font-black leading-none text-(color:--kr-theme-communication-text-subtle) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-accent-strong)',
  parserDiagnosticRow: 'border-t border-dashed border-(--kr-theme-communication-line) text-[10px] text-(color:--kr-theme-communication-text-subtle)',
  parserDiagnosticPill: 'px-[6px] py-[1px] inline-flex items-center rounded-[3px] border font-bold',
  parserDiagnosticChanged: 'border-(--kr-theme-communication-accent-strong) bg-[color-mix(in_srgb,var(--kr-theme-communication-accent-strong)_12%,transparent)] text-(color:--kr-theme-communication-accent)',
  parserDiagnosticPending: 'border-(--kr-theme-communication-text-subtle) bg-(--kr-theme-communication-reaction-surface) text-(color:--kr-theme-communication-text-muted)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Structural spacing and alignment utilities kept separate from visual treatments. */
const LAYOUT_STYLES = {
  composer: 'p-[8px]',
  identity: 'mb-[4px] gap-[6px] flex items-center',
  identityCopy: 'gap-x-[6px] flex flex-wrap items-baseline',
  draftNotice: 'mb-[4px] gap-[6px] flex flex-wrap items-center',
  selectedActivity: 'm-0',
  footer: 'mt-[4px] gap-[3px] grid',
  status: 'gap-[4px] flex flex-wrap items-center',
  statusHelpButton: 'inline-flex items-center justify-center',
  parserDiagnosticRow: 'pt-[3px] gap-[4px] flex min-w-0 items-center',
  parserDiagnosticPills: 'gap-[3px] flex min-w-0 flex-wrap',
} as const

const AVATAR_TONE_STYLES: Record<CommunicationUser['avatarTone'], string> = {
  gold: STYLES.avatarGold,
  blue: STYLES.avatarBlue,
  teal: STYLES.avatarTeal,
  rose: STYLES.avatarRose,
}

/** The parser's findings for a draft: each detected type (once) and whether it is selected. */
export function detectedActivityRules(body: string) {
  return [...new Map(
    COMMUNICATION_ACTIVITY_TYPE_TRIGGER_RULES
      .filter((rule) => rule.pattern.test(body))
      .map((rule) => [rule.activityType, rule]),
  ).values()]
}

interface CommunicationParserDiagnosticsProps {
  activityTypes: readonly WorkstreamCommunicationActivityType[]
  body: string
  contextCue: CommunicationContextCueMatch | null
  contextMatchCount: number
}

/** Renders parser changes as compact pills so the composer exposes why its state changed. */
function CommunicationParserDiagnostics({ activityTypes, body, contextCue, contextMatchCount }: CommunicationParserDiagnosticsProps) {
  const detectedActivities = detectedActivityRules(body)
  const selectedActivityValues = new Set(activityTypes)

  return (
    <div className={`${LAYOUT_STYLES.parserDiagnosticRow} ${STYLES.parserDiagnosticRow}`} data-kr-element="communications-parser-diagnostics" role="status" aria-live="polite">
      <span title="The parser marks activity types it detected and shows whether each is selected. Context cues show when client or lead lookup suggestions are ready.">Parser:</span>
      <div className={LAYOUT_STYLES.parserDiagnosticPills}>
        {detectedActivities.map((rule) => {
          const selected = selectedActivityValues.has(rule.activityType)
          return (
            <span className={`${STYLES.parserDiagnosticPill} ${selected ? ACTIVITY_TYPE_STYLES[rule.activityType].active : STYLES.parserDiagnosticPending}`} data-kr-parser-diagnostic={rule.id} key={rule.id}>
              {rule.activityType} {selected ? 'selected' : 'detected'}
            </span>
          )
        })}
        {contextCue ? (
          <span className={`${STYLES.parserDiagnosticPill} ${STYLES.parserDiagnosticChanged}`} data-kr-parser-diagnostic="context-cue">
            {contextCue.label} cue {contextMatchCount ? 'suggestions ready' : 'recognized'}
          </span>
        ) : null}
        {!detectedActivities.length && !contextCue ? (
          <span className={`${STYLES.parserDiagnosticPill} ${STYLES.parserDiagnosticPending}`} data-kr-parser-diagnostic="none">none</span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Renders the reusable WorkStream communication composer. The editor owns the draft; this card mirrors it for the
 * parser pills and owns which help dialog is open. The parent (`CommunicationsPanel`) owns the activity types, the
 * context, the status and persistence, and converts the submitted body into WorkStream entries.
 */
export default function CommunicationComposer({
  activityTypes,
  assigneeOptions = [],
  canSubmit = true,
  clientButtonLabel,
  clientState,
  contacts,
  contextLocked,
  currentUser,
  disabled = false,
  draftNotice = null,
  editorKey,
  initialAssigneeUserIds,
  initialBody,
  initialHtml,
  leadButtonLabel,
  matterOptions,
  onActivityTypesChange,
  onClientStateChange,
  onContextContactSelected,
  tagClientId,
  onDraftChange,
  onMatterChange,
  onSubmit,
  selectedMatterNumber,
  statusBusy = false,
  statusMessage = 'URLs are clickable · Ctrl+Enter to send',
}: CommunicationComposerProps) {
  const [draft, setDraft] = useState<Pick<WorkStreamRTEDraftState, 'body' | 'contextCue' | 'contextMatchCount'>>({ body: '', contextCue: null, contextMatchCount: 0 })
  // The prompt names the person's own tag prefixes (web patch 591).
  const tagPrefixes = usePreferences().data.preferences.workstreamTagPrefixes ?? DEFAULT_WORKSTREAM_TAG_PREFIXES
  const [showStatusHelp, setShowStatusHelp] = useState(false)
  const [showCodeHelp, setShowCodeHelp] = useState(false)
  const selectedActivities = WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.filter((option) => activityTypes.includes(option.value))
  const selectedActivityLabel = selectedActivities.map((option) => option.label).join(' + ') || 'activity'

  return (
    <section className={`${LAYOUT_STYLES.composer} ${STYLES.composer}`} data-kr-id="communication-composer-card">
      {/* Composer identity: the active user remains visible above the entry field. */}
      <div className={LAYOUT_STYLES.identity}>
        <span className={`${STYLES.avatar} ${AVATAR_TONE_STYLES[currentUser.avatarTone]}`} aria-hidden="true">{currentUser.initials}</span>
        <div className={LAYOUT_STYLES.identityCopy}>
          <strong className={STYLES.identityName}>{currentUser.name}</strong>
          <span className={STYLES.identityDescription}>Internal communication · WorkStream entry ·</span>
          <p className={`${LAYOUT_STYLES.selectedActivity} ${STYLES.selectedActivity}`}>
            New <strong className={STYLES.selectedActivityStrong}>{selectedActivityLabel.toLowerCase()}</strong> entry
          </p>
        </div>
      </div>
      {/* Draft line (FB-0026): the unsent entry is kept in this browser; Discard asks first (the panel's dialog). */}
      {draftNotice ? (
        <div className={`${LAYOUT_STYLES.draftNotice} ${STYLES.draftNotice}`} data-kr-element="communications-draft-notice">
          <span role="status">{draftNotice.label}</span>
          <button type="button" className={STYLES.draftDiscard} data-kr-action="discard-workstream-draft" onClick={draftNotice.onDiscard}>
            Discard
          </button>
        </div>
      ) : null}
      {/* Shared WorkStreamRTE owns the selector, context suggestions, rich-text surface, and send interaction. */}
      <WorkStreamRTE
        key={editorKey}
        activityTypes={activityTypes}
        assigneeOptions={assigneeOptions}
        canSubmit={canSubmit}
        clientButtonLabel={clientButtonLabel}
        clientState={clientState}
        contextCandidates={contacts}
        contextLocked={contextLocked}
        currentUser={currentUser}
        disabled={disabled}
        editorAriaLabel="New communication entry"
        editorDataKrElement="communications-composer-input"
        initialAssigneeUserIds={initialAssigneeUserIds}
        initialBody={initialBody}
        initialHtml={initialHtml}
        leadButtonLabel={leadButtonLabel}
        matterOptions={matterOptions}
        onActivityTypesChange={onActivityTypesChange}
        onClientStateChange={onClientStateChange}
        onContextContactSelected={onContextContactSelected}
        tagClientId={tagClientId}
        onDraftChange={(next) => {
          setDraft({ body: next.body, contextCue: next.contextCue, contextMatchCount: next.contextMatchCount })
          onDraftChange?.(next)
        }}
        onMatterChange={onMatterChange}
        onSubmit={(next) => onSubmit(next.body, activityTypes, next.html, next.assigneeUserIds)}
        onHelpRequest={() => setShowCodeHelp(true)}
        placeholder={workstreamComposerPrompt(tagPrefixes)}
        selectedMatterNumber={selectedMatterNumber}
      />
      {/* Composer footer: persistence status and parser diagnostics remain separate rows for quick scanning. */}
      <div className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`} data-kr-element="communications-composer-footer">
        <div className={LAYOUT_STYLES.status} data-kr-element="communications-composer-status">
          {statusBusy ? <RainbowBusySpinner busy /> : null}
          <span data-kr-element="communications-persistence-status" role="status">{statusMessage}</span>
          <button type="button" className={`${LAYOUT_STYLES.statusHelpButton} ${STYLES.statusHelpButton}`} aria-label="Explain communication context" aria-haspopup="dialog" aria-expanded={showStatusHelp} onClick={() => setShowStatusHelp(true)}>
            <KRHomebaseIcons.InfoLetter className={STYLES.statusHelpIcon} />
          </button>
          <button type="button" className={STYLES.statusHelpButtonWide} aria-label="Open WorkStream quick-entry help" aria-haspopup="dialog" aria-expanded={showCodeHelp} onClick={() => setShowCodeHelp(true)}>
            HELP
          </button>
        </div>
        {showStatusHelp ? <CommunicationContextHelpDialog onClose={() => setShowStatusHelp(false)} /> : null}
        {showCodeHelp ? <WorkStreamQuickEntryHelpDialog onClose={() => setShowCodeHelp(false)} /> : null}
        <CommunicationParserDiagnostics activityTypes={activityTypes} body={draft.body} contextCue={draft.contextCue} contextMatchCount={draft.contextMatchCount} />
      </div>
    </section>
  )
}
