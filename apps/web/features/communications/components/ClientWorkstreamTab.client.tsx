'use client'
// file: apps/web/features/communications/components/ClientWorkstreamTab.client.tsx
/**
 * The WorkStream tab of an open client (plan 10, stage 4): loads the client's entries and the staff list, and draws
 * `WorkstreamActivityLedger` with the selected entry's `WorkstreamSummaryCard`, Add activity and Email. Replaces the
 * adapter and handlers in the old `modules/contacts/components/ContactDetailWorkspace.client.tsx`
 * (`buildContactWorkstreamProps`, `createContactWorkstreamActivity`, `updateWorkstreamActivity`, ...).
 *
 * Calls (`../api.client.ts`): `GET /v1/workstream?clientId=` (50 a page, newest first; a type filter adds
 * `subgroup`), `GET /v1/workstream/assignees`, `POST /v1/workstream`, `PATCH` and `DELETE /v1/workstream/{wsid}`, the
 * move route through `WorkstreamReassignDialog`, and the email routes through `WorkstreamEmailDialog`.
 *
 * Changes from the old tab:
 *  - One list call instead of seven (one per type); entries arrive newest first with their own matter (D10, D12).
 *  - A saved, changed, reassigned or emailed entry is put into the list from the API's reply (the old screen built a
 *    stand-in row with "Just now" labels); a reassigned entry that left this client leaves the list.
 *  - Every staff role may add and change entries (D9); Delete entry is for a super admin; Email for a client account.
 *  - The contacts feature passes the client's matters (`useClientMatters`), so the matter choices need no request.
 *
 * Saves go to the live database, also under `pnpm dev`.
 *
 * Changed Nov 18, 2026 (FB-0016, FB-0017, web patch 570): a row's double-click opens its full view; an edit sends
 * every type chosen and, with Task, the task's people; a task the API could not make or reassign (`taskError`)
 * keeps the saved entry and says so.
 */

import type { Matter, WorkstreamActivity, WorkstreamAssignee } from '@krhomebase/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { L } from '@/lib/KRUtilities'
import { createWorkstreamEntry, deleteWorkstreamEntry, fetchWorkstream, fetchWorkstreamAssignees, fetchWorkstreamEntry, updateWorkstreamEntry } from '../api.client'
import type { CommunicationsViewer } from '../communicationTypes'
import { generalMatterNumber, ledgerRowFromActivity, mergeSavedActivity, type LedgerActivityFilter, type LedgerActivityRow, type LedgerRowPresentation } from '../workstreamLedgerRows'
import WorkstreamActivityAddDialog, { type WorkstreamActivityCreateInput } from './WorkstreamActivityAddDialog.client'
import WorkstreamActivityLedger from './WorkstreamActivityLedger.client'
import WorkstreamEmailDialog, { type WorkstreamEmailSentResult } from './WorkstreamEmailDialog.client'
import WorkstreamSummaryCard, { type WorkstreamSummaryUpdate } from './WorkstreamSummaryCard.client'

/** One page of the ledger (D10). */
export const CLIENT_WORKSTREAM_PAGE_SIZE = 50

const NO_CONTACTS: readonly KRContactRecord[] = []

export interface ClientWorkstreamTabProps {
  clientId: string
  clientNumber: string | null
  /** The client account's name, for the header and the email greeting. */
  displayName: string
  /** The client's matters (from `useClientMatters`); empty while they load. */
  matters: readonly Matter[]
  /** The signed-in person (`app/page.tsx`); without it the default assignee is the API's (the person saving). */
  viewer?: CommunicationsViewer | null
}

/** The matter's sequence after the point (`306.12` → 12), for `.0` first. */
function matterSequence(matter: Matter): number {
  const sequence = Number(matter.matterNumber.split('.').pop())
  return Number.isFinite(sequence) ? sequence : Number.MAX_SAFE_INTEGER
}

/** The error's own sentence (the API helpers give plain sentences), or a fallback. */
function reason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Spacing for the task notice above the ledger. */
const LAYOUT_STYLES = {
  notice: 'mb-[4px]',
} as const

/** The task notice: a short warning line in the danger color. */
const STYLES = {
  notice: 'text-[11px] font-[700] text-(color:--kr-theme-danger)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The sentence for a saved entry whose task could not be made or reassigned (FB-0017). */
export function taskProblemSentence(taskError: string): string {
  return `The entry was saved, but its task on the Tasks screen was not (${taskError}). Save it again to try once more.`
}

/** Renders a client's WorkStream tab. */
export default function ClientWorkstreamTab({ clientId, clientNumber, displayName, matters, viewer = null }: ClientWorkstreamTabProps) {
  const contacts = useOptionalDataStore()?.contacts ?? NO_CONTACTS
  const [filter, setFilter] = useState<LedgerActivityFilter>('all')
  const [activities, setActivities] = useState<WorkstreamActivity[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [assignees, setAssignees] = useState<WorkstreamAssignee[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [presentation, setPresentation] = useState<LedgerRowPresentation>('SingleLine')
  const [overrides, setOverrides] = useState<Record<string, LedgerRowPresentation>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  // A row's double-click: which entry's full view to open, counted so the same row can open it again (FB-0016).
  const [openRequest, setOpenRequest] = useState<{ id: string; count: number }>({ id: '', count: 0 })
  // A new entry saved without its task (FB-0017): said above the ledger until the next save.
  const [taskNotice, setTaskNotice] = useState<string | null>(null)
  const requestRef = useRef(0)

  const sortedMatters = useMemo(() => [...matters].sort((left, right) => matterSequence(left) - matterSequence(right)), [matters])
  const generalMatter = sortedMatters.find((matter) => matter.isGeneralMatter) ?? sortedMatters.find((matter) => matterSequence(matter) === 0) ?? null
  const subgroup = filter === 'all' ? null : filter

  // The first page, again whenever the client or the type filter changes (a later reply wins over an older one).
  useEffect(() => {
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    fetchWorkstream({ clientId, subgroup, limit: CLIENT_WORKSTREAM_PAGE_SIZE })
      .then((data) => {
        if (request !== requestRef.current) return
        setActivities(data.activities)
        setNextCursor(data.nextCursor)
      })
      .catch((caught: unknown) => {
        if (request !== requestRef.current) return
        L(`[CLIENT_WORKSTREAM:104] list failed clientId=${clientId} subgroup=${subgroup ?? 'all'}`)
        setActivities([])
        setNextCursor(null)
        setError(reason(caught, 'The WorkStream could not be read.'))
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false)
      })
  }, [clientId, reloadKey, subgroup])

  // The staff list for the assignee choices, once.
  useEffect(() => {
    let cancelled = false
    fetchWorkstreamAssignees()
      .then((data) => {
        if (!cancelled) setAssignees(data.users)
      })
      .catch(() => {
        L(`[CLIENT_WORKSTREAM:121] assignees failed clientId=${clientId}`)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const loadMore = useCallback(async () => {
    if (!nextCursor) return
    const request = requestRef.current
    setLoadingMore(true)
    try {
      const data = await fetchWorkstream({ clientId, subgroup, limit: CLIENT_WORKSTREAM_PAGE_SIZE, cursor: nextCursor })
      if (request !== requestRef.current) return
      setActivities((current) => [...current, ...data.activities.filter((activity) => !current.some((known) => known.wsid === activity.wsid))])
      setNextCursor(data.nextCursor)
    } catch (caught) {
      if (request === requestRef.current) setError(reason(caught, 'Older entries could not be read.'))
    } finally {
      setLoadingMore(false)
    }
  }, [clientId, nextCursor, subgroup])

  const rows = useMemo<LedgerActivityRow[]>(() => activities.map((activity) => ledgerRowFromActivity(activity, clientNumber)), [activities, clientNumber])
  const assigneeOptions = useMemo(() => assignees.map((user) => ({ id: user.id, label: user.label })), [assignees])

  /** Puts a saved entry into the list and selects it. */
  function keep(saved: WorkstreamActivity, select = true): void {
    setActivities((current) => mergeSavedActivity(current, saved, clientId))
    if (select && saved.clientId === clientId) setSelectedId(saved.wsid)
  }

  async function create(input: WorkstreamActivityCreateInput): Promise<void> {
    const { activity, taskError } = await createWorkstreamEntry({
      subgroup: input.subgroup,
      clientId,
      matterId: input.matterId ?? undefined,
      title: input.title,
      note: input.note,
      noteHtml: input.noteHtml,
      nextSteps: input.nextSteps,
      assigneeUserId: input.assigneeUserId,
      assigneeLabel: input.assigneeLabel,
    })
    keep(activity)
    setAddOpen(false)
    setTaskNotice(taskError ? taskProblemSentence(taskError) : null)
    if (taskError) L(`[CLIENT_WORKSTREAM:180] task not made wsid=${activity.wsid} code=${taskError}`)
  }

  async function update(wsid: string, change: WorkstreamSummaryUpdate): Promise<void> {
    const { activity, taskError } = await updateWorkstreamEntry(wsid, change)
    keep(activity)
    setTaskNotice(null)
    if (taskError) {
      L(`[CLIENT_WORKSTREAM:180] task not saved wsid=${wsid} code=${taskError}`)
      // The entry is saved; the editor shows the sentence and stays open for another try.
      throw new Error(taskProblemSentence(taskError))
    }
  }

  async function remove(wsid: string): Promise<void> {
    await deleteWorkstreamEntry(wsid)
    setActivities((current) => current.filter((activity) => activity.wsid !== wsid))
    setSelectedId((current) => (current === wsid ? null : current))
  }

  /** A sent email's Emails entry is read back from the API so the row shows what was saved. */
  function emailed(result: WorkstreamEmailSentResult): void {
    setEmailOpen(false)
    if (!result.wsid) return
    fetchWorkstreamEntry(result.wsid)
      .then(({ activity }) => keep(activity))
      .catch(() => setReloadKey((key) => key + 1))
  }

  const clientLabel = clientNumber ? `Client ${clientNumber}` : displayName
  const matterLine = sortedMatters.length ? sortedMatters.map((matter) => `Matter ${matter.matterNumber}`).join(' · ') : (generalMatterNumber(clientNumber) ? `Matter ${generalMatterNumber(clientNumber)}` : 'No matters attached')

  return (
    <div data-kr-id={`ClientWorkstreamTab-${clientNumber ?? clientId}`}>
      {/* A saved entry whose task was not made (FB-0017); Edit note and save it again to try once more. */}
      {taskNotice ? (
        <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-element="workstream-task-notice" role="alert">
          {taskNotice}
        </p>
      ) : null}
      <WorkstreamActivityLedger
        contextLabel={`${clientLabel} · ${matterLine}`}
        error={error}
        filter={filter}
        hasMore={Boolean(nextCursor)}
        loading={loading}
        loadingMore={loadingMore}
        presentation={presentation}
        presentationOverrides={overrides}
        renderDetail={(row) => (
          <WorkstreamSummaryCard
            assigneeOptions={assigneeOptions}
            canDelete={viewer?.role === 'super_admin'}
            contacts={contacts}
            row={row}
            onDelete={remove}
            onReassigned={(moved) => keep(moved, false)}
            onUpdate={update}
            openRequest={openRequest.id === row.id ? openRequest.count : 0}
          />
        )}
        rows={rows}
        selectedId={selectedId}
        subtitle="Client-level history for work, communications, documents, notes, and tasks."
        title={`${clientLabel} WorkStream`}
        onAdd={() => setAddOpen(true)}
        onEmail={() => setEmailOpen(true)}
        onFilterChange={(next) => {
          setFilter(next)
          setSelectedId(null)
        }}
        onLoadMore={() => void loadMore()}
        onOpen={(id) => {
          setSelectedId(id)
          setOpenRequest((current) => ({ id, count: current.count + 1 }))
        }}
        onPresentationChange={(next) => {
          setPresentation(next)
          setOverrides({})
        }}
        onRetry={() => setReloadKey((key) => key + 1)}
        onSelect={setSelectedId}
        onToggleRow={(row) =>
          setOverrides((current) => {
            const effective = current[row.id] ?? presentation
            return { ...current, [row.id]: effective === 'Expanded' ? 'SingleLine' : 'Expanded' }
          })
        }
      />
      {addOpen ? (
        <WorkstreamActivityAddDialog
          assigneeOptions={assigneeOptions}
          currentUserId={viewer?.userId ?? null}
          currentUserLabel={viewer?.displayName || 'You'}
          defaultMatterId={generalMatter?.id ?? null}
          matters={sortedMatters}
          onCancel={() => setAddOpen(false)}
          onSave={create}
        />
      ) : null}
      {emailOpen ? (
        <WorkstreamEmailDialog
          clientDisplayName={displayName}
          clientId={clientId}
          clientNumber={clientNumber}
          defaultMatterId={generalMatter?.id ?? null}
          matterOptions={sortedMatters.map((matter) => ({ matterId: matter.id, matterNumber: matter.matterNumber, title: matter.title }))}
          senderDisplayName={viewer?.displayName || 'Krueger & Richard'}
          onCancel={() => setEmailOpen(false)}
          onSent={emailed}
        />
      ) : null}
    </div>
  )
}
