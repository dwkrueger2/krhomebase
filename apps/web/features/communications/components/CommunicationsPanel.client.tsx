'use client'
// file: apps/web/features/communications/components/CommunicationsPanel.client.tsx
/**
 * The Communications section (menu id `communications`): the WorkStream firm feed, or one client's or lead's entries,
 * with the activity filters and the composer. It replaces the "Module [TBD]" placeholder.
 *
 * Ported from the old `hb-components/KR-Communications/CommunicationsPanel.client.tsx` (plan 10, stage 2). Unchanged:
 * the dark chat look on the `--kr-theme-communication-*` tokens, the sticky filter row, Collapsed view, the thread
 * beside a 300px attribution panel on desktop (removed in web patch 590), the composer's activity types (Phone Call by default), slash commands
 * and natural-language cues, one draft saved once for each chosen type, the subject taken from `/sub:` or the first
 * line (160 characters at most), stored HTML kept only when no slash command had to be removed, the firm feed when no
 * owner is chosen, a chosen client becoming the list's owner, and the status line's sentences.
 *
 * Changed:
 * - Calls go through `../api.client.ts` (`fetchWorkstream`, `createWorkstreamEntry`, `fetchWorkstreamAssignees`) and
 *   `useCommunicationsFeed`; the old code used `fetchKRModuleApi` against `/krhomebase/api/workstream/{subgroup}`.
 * - Newest first, 50 at a time, with "Load older entries" and a sentence when more exist (D10). The composer sits
 *   above the thread, next to the newest entries (it sat below the oldest-first list, which scrolled to the bottom).
 * - A type filter reloads from the API with that type (it filtered the loaded entries).
 * - The context holds ids only (`clientId`, `leadId`, `matterId`); numbers are looked up for labels. Saving sends the
 *   ids (`communicationSaveTarget.ts`): the chosen matter, or none so the API uses the client's `.0` matter (D12);
 *   Internal saves to client 050, matter 050.1; a lead only with a fixed lead context (no lead lookup yet).
 * - Contacts come from the browser's data store (`useOptionalDataStore`), not a contacts request; the matter picker
 *   lists the chosen client's matters (`fetchClientMatters`).
 * - The viewer comes from `app/page.tsx` as `viewer` (it was the old session object `user`).
 * - Loading and saving show `RainbowBusySpinner`; diagnostics use `L` with `[COMMUNICATIONS_PANEL:line]`.
 * - Nov 18, 2026 (FB-0016, FB-0017, web patch 570): a draft is saved once, as one entry with every chosen type
 *   (it was saved once for each type, one entry and one WSID each). With Task chosen, the "Assignees" menu's people
 *   become the task's assignees on the Tasks screen (only the first was sent before, and no task was made).
 * - Nov 23, 2026 (FB-0026, web patch 588): the unsent entry is kept as a draft in this browser for this place (the
 *   feed, the client or the lead) and restored when the panel opens again (`useWorkstreamDraft`); a sent entry removes
 *   it, and Discard asks first.
 * - Nov 24, 2026 (web patch 590, the requester): the attribution panel beside the thread ("Awaiting selection", "Coming
 *   soon") is removed; it served no purpose. The composer and the thread take the whole width.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { fetchClientMatters } from '@/features/matters/api.client'
import { L } from '@/lib/KRUtilities'
import { createWorkstreamEntry, fetchWorkstreamAssignees, WorkstreamApiError } from '../api.client'
import { resolveCommunicationSaveTarget, saveTargetBlockReason, type CommunicationComposerOwner, type CommunicationsContext } from '../communicationSaveTarget'
import { communicationEntryFromActivity, WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS, communicationUserFromViewer, parseWorkstreamSlashCommands, subjectFromBody, type CommunicationClientState, type CommunicationEntry, type CommunicationsViewer, type WorkstreamCommunicationActivityType } from '../communicationTypes'
import { useCommunicationsFeed } from '../useCommunicationsFeed.client'
import { useWorkstreamDraft } from '../useWorkstreamDraft.client'
import { draftPlaceId, type WorkstreamDraft } from '../workstreamDrafts.client'
import { writerPhotosOf } from '../writerPhotos'
import CommunicationActivityFilters from './CommunicationActivityFilters.client'
import CommunicationComposer from './CommunicationComposer.client'
import CommunicationThread from './CommunicationThread.client'
import WorkstreamReassignDialog from './WorkstreamReassignDialog.client'
import type { WorkStreamRTEAssigneeOption, WorkStreamRTEMatterOption } from './WorkStreamRTE.client'
// Read, not only imported: a CSS module imported for its side effect is left out of the production build (web patch 554).
import communicationColors from './Communications.module.css'

export type { CommunicationsContext } from '../communicationSaveTarget'

interface CommunicationsPanelProps {
  /** The signed-in person (from the session in `app/page.tsx`). Optional so the module-level panel list type-checks. */
  viewer?: CommunicationsViewer
  /** Optional client, lead, or matter ownership. Without it this is the firm feed. */
  context?: CommunicationsContext | null
}

const NO_CONTACTS: readonly KRContactRecord[] = []

/** Structural layout: the scrolling section, the one column (the attribution panel was removed in web patch 590), and its stack. */
const LAYOUT_STYLES = {
  panel: 'flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto',
  columns: 'p-[6px] gap-[6px] grid min-w-0 flex-1 items-start',
  main: 'gap-[6px] flex min-w-0 flex-col',
} as const

/** The dark chat surface and its text color. */
const STYLES = {
  panel: 'bg-(--kr-theme-communication-surface) text-(color:--kr-theme-communication-text)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The first client contact of a client account (for its number and name), or null. */
function contactForClient(contacts: readonly KRContactRecord[], clientId: string | null | undefined): KRContactRecord | null {
  return clientId ? contacts.find((contact) => contact.clientId === clientId) ?? null : null
}

/** The composer's starting types. */
const DEFAULT_COMPOSER_TYPES: WorkstreamCommunicationActivityType[] = ['PhoneCalls']
const ACTIVITY_TYPE_VALUES = new Set<string>(WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.map((option) => option.value))
const CLIENT_STATES = new Set<string>(['Client', 'Lead', 'Internal'])

function errorSentence(error: unknown): string {
  return error instanceof WorkstreamApiError || error instanceof Error ? error.message : 'Unknown save error.'
}

/**
 * Renders the production communications panel. It loads the unified WorkStream activity ledger for the supplied
 * client/lead/matter context (or the firm feed), keeps the composer above the newest entries, and saves through
 * `POST /api/v1/workstream`.
 *
 * State it owns: the type filter and collapsed view, the selected entry, the composer's types, client state, chosen
 * client and matter, the status sentence and the saving flag. The feed hook owns the entries and paging; the editor
 * owns the draft.
 *
 * @param props.viewer - The signed-in person; their entries carry their name and initials.
 * @param props.context - A fixed owner, for the client and lead views that come later.
 */
export default function CommunicationsPanel({ context, viewer }: CommunicationsPanelProps) {
  const currentUser = useMemo(() => communicationUserFromViewer(viewer), [viewer])
  const contacts = useOptionalDataStore()?.contacts ?? NO_CONTACTS
  // FB-0019 (web patch 586): each writer's photo, from their linked contact.
  const writerPhotos = useMemo(() => writerPhotosOf(contacts), [contacts])
  const fixedContext = Boolean(context?.clientId || context?.leadId)
  // The types shown: the person's WorkStream view setting at first (User Settings → Preferences), then the filter row.
  const savedTypes = usePreferences().data.preferences.workstreamTypes
  const [threadFilterTypes, setThreadFilterTypes] = useState<WorkstreamCommunicationActivityType[]>(() => [...savedTypes])
  const [reassignWsid, setReassignWsid] = useState<string | null>(null)
  const [collapsedView, setCollapsedView] = useState(false)
  const [composerActivityTypes, setComposerActivityTypes] = useState<WorkstreamCommunicationActivityType[]>(DEFAULT_COMPOSER_TYPES)
  const [selectedWsid, setSelectedWsid] = useState<string | null>(null)
  const [statusOverride, setStatusOverride] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [composerClientState, setComposerClientState] = useState<CommunicationClientState>(context?.leadId ? 'Lead' : context?.clientId ? 'Client' : 'Internal')
  const [composerOwner, setComposerOwner] = useState<CommunicationComposerOwner | null>(null)
  const [composerMatter, setComposerMatter] = useState<WorkStreamRTEMatterOption | null>(null)
  const [assigneeOptions, setAssigneeOptions] = useState<WorkStreamRTEAssigneeOption[]>([])
  const [matterOptions, setMatterOptions] = useState<WorkStreamRTEMatterOption[]>([])

  // FB-0026: the unsent entry, kept in this browser for this place and restored when the panel opens again.
  const restoreComposer = useCallback((draft: WorkstreamDraft | null): void => {
    const types = (draft?.activityTypes ?? []).filter((type): type is WorkstreamCommunicationActivityType => ACTIVITY_TYPE_VALUES.has(type))
    setComposerActivityTypes(types.length ? types : DEFAULT_COMPOSER_TYPES)
    if (context?.leadId) return
    if (!context?.clientId) {
      const state = draft && CLIENT_STATES.has(draft.clientState) ? draft.clientState as CommunicationClientState : 'Internal'
      setComposerClientState(state)
      setComposerOwner(state === 'Client' ? draft?.owner ?? null : null)
      setComposerMatter(state === 'Client' ? draft?.matter ?? null : null)
      return
    }
    setComposerMatter(draft?.matter ?? null)
  }, [context?.clientId, context?.leadId])
  const workstreamDraft = useWorkstreamDraft({
    scope: viewer?.userId ?? null,
    placeId: draftPlaceId(context),
    choices: { activityTypes: composerActivityTypes, clientState: composerClientState, owner: composerOwner, matter: composerMatter },
    restore: restoreComposer,
  })

  // The list's owner: the fixed context, else the client chosen in the composer, else the firm feed.
  const listClientId = context?.clientId ?? (!context?.leadId && composerClientState === 'Client' ? composerOwner?.clientId ?? null : null)
  const feed = useCommunicationsFeed({
    clientId: listClientId,
    leadId: context?.leadId ?? null,
    matterId: context?.matterId ?? null,
    subgroups: threadFilterTypes,
    currentUser,
  })

  // Labels: the context's own, else the client's number from the contact list.
  const fixedClientContact = contactForClient(contacts, context?.clientId)
  const ownerClientId = context?.clientId ?? (composerClientState === 'Client' ? composerOwner?.clientId ?? null : null)
  const ownerClientNumber = context?.clientId ? fixedClientContact?.clientNumber ?? null : composerOwner?.clientNumber ?? null
  const contextLabel = context?.contextLabel
    || (context?.clientId ? `Client ${fixedClientContact?.clientNumber ?? context.clientId}` : null)
    || (context?.leadId ? `Lead ${context.leadId}` : null)
    || (listClientId && composerOwner ? `Client ${composerOwner.clientNumber ?? composerOwner.displayName} · ${composerOwner.displayName}` : null)
    || 'Firm WorkStream feed'
  const selectedMatterNumber = composerMatter?.number ?? (context?.matterId ? matterOptions.find((option) => option.id === context.matterId)?.number ?? null : null)
  const blockReason = saveTargetBlockReason({ context, clientState: composerClientState, composerOwner, composerMatterId: composerMatter?.id ?? null, contacts })

  useEffect(() => {
    let cancelled = false
    fetchWorkstreamAssignees()
      .then((data) => { if (!cancelled) setAssigneeOptions(data.users.map((candidate) => ({ id: candidate.id, label: candidate.label || candidate.displayName || candidate.id }))) })
      .catch((error: unknown) => {
        if (cancelled) return
        setAssigneeOptions([])
        L(`[COMMUNICATIONS_PANEL:132] assignees failed code=${error instanceof WorkstreamApiError ? error.code : 'unknown'}`)
      })
    return () => { cancelled = true }
  }, [])

  // The matter picker lists the owning client's matters (D12: "No matter" means the client's .0 matter).
  useEffect(() => {
    setMatterOptions([])
    if (!ownerClientId) return
    let cancelled = false
    fetchClientMatters(ownerClientId)
      .then((data) => { if (!cancelled) setMatterOptions(data.matters.map((matter) => ({ id: matter.id, number: matter.matterNumber, label: matter.title }))) })
      .catch((error: unknown) => {
        if (!cancelled) L(`[COMMUNICATIONS_PANEL:145] matters failed error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
      })
    return () => { cancelled = true }
  }, [ownerClientId])

  // A new list selects its newest entry, and the status line returns to the load summary.
  useEffect(() => {
    setSelectedWsid(feed.entries[0]?.wsid ?? null)
    setStatusOverride(null)
    // Only a finished first-page load should move the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.loadCount])

  const statusMessage = statusOverride
    ?? (feed.loading ? 'Loading communications...'
      : feed.error ? `Unable to load communications: ${feed.error}`
        : `${feed.entries.length} communication${feed.entries.length === 1 ? '' : 's'} loaded for ${contextLabel}.${blockReason ? ` ${blockReason}` : ''}`)

  /** Turns an accepted composer lookup into the owner context used for loading and saving. */
  const handleComposerContextSelected = useCallback((contact: KRContactRecord): void => {
    if (fixedContext || !contact.isClient || !contact.clientId) return
    setComposerClientState('Client')
    setComposerOwner({ clientId: contact.clientId, clientNumber: contact.clientNumber, displayName: contact.clientDisplayName || contact.displayName })
    setComposerMatter(null)
  }, [fixedContext])

  /** Selecting another client state also removes a composer-only client owner and its matter. */
  function handleComposerClientStateChange(nextState: CommunicationClientState): void {
    if (nextState !== 'Client' && !fixedContext) {
      setComposerOwner(null)
      setComposerMatter(null)
    }
    setComposerClientState(nextState)
  }

  /** Saves one draft as one WorkStream entry with every selected activity type and puts it at the top. */
  async function handleDraftSubmit(body: string, activityTypes: readonly WorkstreamCommunicationActivityType[], noteHtml?: string, assigneeUserIds?: readonly string[]): Promise<void> {
    const parsed = parseWorkstreamSlashCommands(body, activityTypes[0] ?? 'PhoneCalls')
    const selectedActivityTypes = [...new Set(activityTypes)]
    const savedActivityTypes = parsed.activityCommand ? [...new Set([...selectedActivityTypes, parsed.activityType])] : selectedActivityTypes
    const mainType = savedActivityTypes[0]
    if (!mainType) throw new Error('At least one WorkStream activity type is required.')
    setSaving(true)
    setStatusOverride('Saving communication...')
    try {
      const target = await resolveCommunicationSaveTarget({ context, clientState: composerClientState, composerOwner, composerMatterId: composerMatter?.id ?? null, contacts }, fetchClientMatters)
      L(`[COMMUNICATIONS_PANEL:205] save start types=${savedActivityTypes.join(',')} owner=${target.leadId ? 'lead' : 'client'}`)
      const { activity, taskError } = await createWorkstreamEntry({
        subgroup: mainType,
        subgroups: savedActivityTypes,
        ...(target.leadId ? { leadId: target.leadId } : { clientId: target.clientId, ...(target.matterId ? { matterId: target.matterId } : {}) }),
        title: subjectFromBody(parsed.body, mainType, parsed.subject),
        note: parsed.body,
        // Slash commands are normalized from the plain body. Preserve rich
        // HTML when no command prefix needs to be removed from it.
        noteHtml: noteHtml && parsed.body === body.trim() ? noteHtml : undefined,
        // FB-0017: the Assignees menu's people are the task's (all of them); other entries keep the API's default.
        ...(savedActivityTypes.includes('Tasks') && assigneeUserIds ? { assigneeUserIds: [...assigneeUserIds] } : {}),
      })
      workstreamDraft.onSent()
      const entry: CommunicationEntry = communicationEntryFromActivity(activity, currentUser)
      const belongsToList = (threadFilterTypes.length === 0 || entry.activityTypes.some((type) => threadFilterTypes.includes(type))) && (!context?.matterId || activity.matterId === context.matterId)
      if (belongsToList) feed.prepend([entry])
      setSelectedWsid(activity.wsid)
      setStatusOverride(
        taskError
          ? `Saved ${activity.wsid} to ${target.label}, but its task on the Tasks screen was not made (${taskError}); edit the entry to try again.`
          : `Saved ${activity.wsid} to ${target.label}${activity.taskId ? ` with Task #${activity.taskId}` : ''}.`,
      )
      L(`[COMMUNICATIONS_PANEL:228] save done wsid=${activity.wsid} task=${activity.taskId ?? '-'}${taskError ? ` taskError=${taskError}` : ''}`)
    } catch (error) {
      setStatusOverride(`Communication was not saved: ${errorSentence(error)}`)
      L(`[COMMUNICATIONS_PANEL:231] save failed code=${error instanceof WorkstreamApiError ? `${error.code} requestId=${error.requestId ?? '-'}` : 'local'}`)
      throw error
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`${LAYOUT_STYLES.panel} ${STYLES.panel} ${communicationColors.panelColors}`} data-kr-id="communications-module-panel">
      {/* Activity filters: this control owns thread filtering and is independent from the composer selector. */}
      <CommunicationActivityFilters collapsedView={collapsedView} onChangeActivityTypes={setThreadFilterTypes} onToggleCollapsedView={() => setCollapsedView((current) => !current)} selectedActivityTypes={threadFilterTypes} />
      <div className={LAYOUT_STYLES.columns}>
        <div className={LAYOUT_STYLES.main}>
          {/* Composer: above the newest entries (newest first, D10). */}
          <CommunicationComposer
            activityTypes={composerActivityTypes}
            assigneeOptions={assigneeOptions}
            canSubmit={!blockReason && !saving}
            clientButtonLabel={ownerClientNumber ? `Cnt:${ownerClientNumber}` : null}
            clientState={composerClientState}
            contacts={contacts}
            contextLocked={fixedContext}
            currentUser={currentUser}
            disabled={saving}
            draftNotice={workstreamDraft.notice}
            editorKey={workstreamDraft.editor.key}
            initialAssigneeUserIds={workstreamDraft.editor.assigneeUserIds}
            initialBody={workstreamDraft.editor.body}
            initialHtml={workstreamDraft.editor.html}
            leadButtonLabel={context?.leadId ? `Lead:${context.contextLabel || context.leadId}` : null}
            matterOptions={matterOptions}
            onActivityTypesChange={setComposerActivityTypes}
            onClientStateChange={handleComposerClientStateChange}
            onContextContactSelected={handleComposerContextSelected}
            tagClientId={ownerClientId}
            onDraftChange={workstreamDraft.onDraftChange}
            onMatterChange={setComposerMatter}
            onSubmit={handleDraftSubmit}
            selectedMatterNumber={selectedMatterNumber}
            statusBusy={feed.loading || saving}
            statusMessage={statusMessage}
          />
          {/* Communication log: newest activity at the top; older pages load at the bottom. */}
          <CommunicationThread
            collapsedView={collapsedView}
            contextLabel={contextLabel}
            hasOlder={feed.hasOlder}
            loading={feed.loading}
            loadingOlder={feed.loadingOlder}
            messages={feed.entries}
            onLoadOlder={feed.loadOlder}
            onReassign={setReassignWsid}
            onSelectMessage={setSelectedWsid}
            photoOf={(userId) => writerPhotos.get(userId) ?? null}
            selectedWsid={selectedWsid}
          />
        </div>
      </div>
      {/* Reassign (D16): moves an entry, typically an Internal one on 050.1, to a client's matter */}
      <WorkstreamReassignDialog
        contacts={contacts}
        currentLabel={(() => { const entry = feed.entries.find((row) => row.wsid === reassignWsid); return entry ? `${entry.subject} · ${entry.sourceLabel}` : '' })()}
        wsid={reassignWsid}
        onCancel={() => setReassignWsid(null)}
        onReassigned={(activity) => {
          // Stays in a firm feed (with its new labels); leaves a list fixed to another client or matter.
          const stillBelongs = (!listClientId || activity.clientId === listClientId) && (!context?.matterId || activity.matterId === context.matterId) && !context?.leadId
          feed.replace(communicationEntryFromActivity(activity, currentUser), stillBelongs)
          setStatusOverride(`Reassigned ${activity.wsid} to ${activity.matterNumber ?? 'the client'}.`)
          setReassignWsid(null)
        }}
      />
      {/* Discard draft (FB-0026): the unsent entry is thrown away, so ask first */}
      <U6ConfirmationDialog
        cancelLabel="Keep"
        confirmLabel="Discard"
        description="The unsent entry kept on this computer is removed and the composer is emptied. This cannot be undone."
        onCancel={workstreamDraft.discardDialog.onCancel}
        onConfirm={workstreamDraft.discardDialog.onConfirm}
        open={workstreamDraft.discardDialog.open}
        title="Discard this draft?"
      />
    </section>
  )
}
