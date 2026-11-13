'use client'
// file: apps/web/features/communications/useCommunicationsFeed.client.ts
/**
 * Loads the WorkStream entries the Communications thread shows: one owner's entries (a client, optionally one matter,
 * or a lead) or the firm feed when no owner is given, newest first, 50 at a time, with "load older" paging.
 *
 * New in this repository; it replaces the load effect of the old `CommunicationsPanel.client.tsx`. The old panel made
 * seven requests per load (one per activity type), merged them and sorted oldest first, with no limit. The API now
 * returns every type in one reply, newest first, in pages (the requester's decision D10), so this hook keeps the
 * `nextCursor` and appends older pages. A chosen activity type is sent to the API (`subgroup`), so the filter is
 * correct beyond the first page. A reply that arrives after the person changed the owner or the filter is ignored.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { L } from '@/lib/KRUtilities'
import { fetchWorkstream, WorkstreamApiError } from './api.client'
import { communicationEntryFromActivity, type CommunicationEntry, type CommunicationUser, type WorkstreamCommunicationActivityType } from './communicationTypes'

/** Entries per page (D10). */
export const COMMUNICATIONS_PAGE_SIZE = 50

/** Which entries to load. With neither `clientId` nor `leadId` the firm feed is loaded. */
export interface CommunicationsFeedRequest {
  clientId?: string | null
  leadId?: string | null
  matterId?: string | null
  /** The types to show; empty means every type (Nov 13, 2026: several at once). */
  subgroups?: readonly WorkstreamCommunicationActivityType[]
  currentUser: CommunicationUser
}

export interface CommunicationsFeedState {
  /** Newest first. */
  entries: CommunicationEntry[]
  /** More entries exist on the server (the API's `nextCursor` is set). */
  hasOlder: boolean
  loading: boolean
  loadingOlder: boolean
  /** A plain sentence when the last load failed, else null. */
  error: string | null
  /** Counts finished first-page loads, so the panel can react once per load (it selects the newest entry). */
  loadCount: number
  loadOlder: () => void
  /** Puts newly saved entries at the top. */
  prepend: (entries: readonly CommunicationEntry[]) => void
  /** Puts a changed entry in place, or takes it out (`stillBelongs` false). */
  replace: (entry: CommunicationEntry, stillBelongs: boolean) => void
}

function failureSentence(error: unknown): string {
  return error instanceof WorkstreamApiError ? error.message : 'WorkStream cannot be read right now. Try again in a moment.'
}

/**
 * Loads the first page whenever the owner or the type changes, and the next page on `loadOlder`.
 *
 * @returns The entries, the paging state and the two actions; see `CommunicationsFeedState`.
 */
export function useCommunicationsFeed(request: CommunicationsFeedRequest): CommunicationsFeedState {
  const { clientId = null, currentUser, leadId = null, matterId = null } = request
  const subgroups = (request.subgroups ?? []).join(',') || null
  const [entries, setEntries] = useState<CommunicationEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadCount, setLoadCount] = useState(0)
  const requestKey = [clientId, leadId, matterId, subgroups].join('|')
  const activeKeyRef = useRef(requestKey)
  const userRef = useRef(currentUser)
  userRef.current = currentUser

  useEffect(() => {
    activeKeyRef.current = requestKey
    let cancelled = false
    setLoading(true)
    setLoadingOlder(false)
    setError(null)
    setEntries([])
    setNextCursor(null)
    L(`[COMMUNICATIONS_FEED:69] load start owner=${clientId ? 'client' : leadId ? 'lead' : 'feed'} subgroups=${subgroups ?? 'all'}`)
    fetchWorkstream({ clientId, leadId, matterId, subgroups, limit: COMMUNICATIONS_PAGE_SIZE })
      .then((data) => {
        if (cancelled) return
        setEntries(data.activities.map((activity) => communicationEntryFromActivity(activity, userRef.current)))
        setNextCursor(data.nextCursor)
        L(`[COMMUNICATIONS_FEED:75] load done count=${data.activities.length} more=${data.nextCursor ? 'yes' : 'no'}`)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(failureSentence(caught))
        L(`[COMMUNICATIONS_FEED:80] load failed code=${caught instanceof WorkstreamApiError ? caught.code : 'unknown'}`)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setLoadCount((count) => count + 1)
      })
    return () => { cancelled = true }
  }, [clientId, leadId, matterId, requestKey, subgroups])

  const loadOlder = useCallback(() => {
    if (!nextCursor || loadingOlder) return
    const keyAtStart = activeKeyRef.current
    setLoadingOlder(true)
    fetchWorkstream({ clientId, leadId, matterId, subgroups, limit: COMMUNICATIONS_PAGE_SIZE, cursor: nextCursor })
      .then((data) => {
        if (activeKeyRef.current !== keyAtStart) return
        setEntries((current) => {
          const known = new Set(current.map((entry) => entry.wsid))
          return [...current, ...data.activities.filter((activity) => !known.has(activity.wsid)).map((activity) => communicationEntryFromActivity(activity, userRef.current))]
        })
        setNextCursor(data.nextCursor)
      })
      .catch((caught: unknown) => {
        if (activeKeyRef.current !== keyAtStart) return
        setError(failureSentence(caught))
        L(`[COMMUNICATIONS_FEED:104] older page failed code=${caught instanceof WorkstreamApiError ? caught.code : 'unknown'}`)
      })
      .finally(() => {
        if (activeKeyRef.current === keyAtStart) setLoadingOlder(false)
      })
  }, [clientId, leadId, loadingOlder, matterId, nextCursor, subgroups])

  const prepend = useCallback((added: readonly CommunicationEntry[]) => {
    setEntries((current) => {
      const addedIds = new Set(added.map((entry) => entry.wsid))
      return [...added, ...current.filter((entry) => !addedIds.has(entry.wsid))]
    })
  }, [])

  /** Puts a changed entry in place (a reassignment, D16), or removes it when it no longer belongs to this list. */
  const replace = useCallback((entry: CommunicationEntry, stillBelongs: boolean) => {
    setEntries((current) => (stillBelongs ? current.map((row) => (row.wsid === entry.wsid ? entry : row)) : current.filter((row) => row.wsid !== entry.wsid)))
  }, [])

  return { entries, hasOlder: Boolean(nextCursor), loading, loadingOlder, error, loadCount, loadOlder, prepend, replace }
}
