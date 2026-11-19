'use client'
// file: apps/web/features/communications/components/WorkstreamEntryLoader.client.tsx
/**
 * Opens one WorkStream entry by its WSID, from any screen (web patch 571, "Following a code"; drawn by the code-link
 * host): reads the entry and the staff list, then shows `WorkstreamEntryDialog` with its full view, Edit note,
 * Reassign and (super admin) Delete entry, saving through this feature's calls. A screen that lists the entry shows the
 * change on its next load.
 *
 * While the entry loads nothing is drawn; a failure goes to `onFailed` with a plain sentence (the host says it).
 */

import type { WorkstreamActivity, WorkstreamAssignee } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { L } from '@/lib/KRUtilities'
import { deleteWorkstreamEntry, fetchWorkstreamAssignees, fetchWorkstreamEntry, updateWorkstreamEntry } from '../api.client'
import WorkstreamEntryDialog, { type WorkstreamSummaryUpdate } from './WorkstreamEntryDialog.client'

const NO_CONTACTS: readonly KRContactRecord[] = []

export interface WorkstreamEntryLoaderProps {
  wsid: string
  /** The signed-in person's role: a super admin may delete. */
  viewerRole?: string | null
  onClose: () => void
  /** The entry could not be read: the sentence to show. */
  onFailed: (message: string) => void
}

/** Reads the entry, then draws its dialog. */
export default function WorkstreamEntryLoader({ onClose, onFailed, viewerRole = null, wsid }: WorkstreamEntryLoaderProps) {
  const contacts = useOptionalDataStore()?.contacts ?? NO_CONTACTS
  const [activity, setActivity] = useState<WorkstreamActivity | null>(null)
  const [assignees, setAssignees] = useState<WorkstreamAssignee[]>([])

  useEffect(() => {
    let cancelled = false
    fetchWorkstreamEntry(wsid)
      .then(({ activity: entry }) => {
        if (!cancelled) setActivity(entry)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        L(`[WORKSTREAM_ENTRY_LOADER:42] entry failed wsid=${wsid}`)
        onFailed(error instanceof Error && error.message ? error.message : `WorkStream entry ${wsid} could not be read.`)
      })
    fetchWorkstreamAssignees()
      .then((data) => {
        if (!cancelled) setAssignees(data.users)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // onFailed is the host's; a new one must not read the entry again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsid])

  async function update(entryWsid: string, change: WorkstreamSummaryUpdate): Promise<void> {
    const { activity: saved, taskError } = await updateWorkstreamEntry(entryWsid, change)
    setActivity(saved)
    if (taskError) throw new Error(`The entry was saved, but its task on the Tasks screen was not (${taskError}). Save it again to try once more.`)
  }

  if (!activity) return null
  return (
    <WorkstreamEntryDialog
      activity={activity}
      assigneeOptions={assignees.map((user) => ({ id: user.id, label: user.label }))}
      canDelete={viewerRole === 'super_admin'}
      clientNumber={activity.clientNumber}
      contacts={contacts}
      onClose={onClose}
      onDelete={async (entryWsid) => {
        await deleteWorkstreamEntry(entryWsid)
      }}
      onReassigned={setActivity}
      onUpdate={update}
    />
  )
}
