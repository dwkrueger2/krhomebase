'use client'
// file: apps/web/features/matters/useClientMatters.client.ts
/**
 * Loads one client's matters for the Contact Detail workspace, which shares them between the Detail tab's
 * ASSOCIATED MATTERS box and the Projects & Matters tab (as the old `ContactDetailWorkspace` did). A reply that
 * arrives after the client changed is ignored. `replace` puts a saved or deleted matter into the list without a reload.
 */

import type { ClientMattersData, Matter } from '@krhomebase/contracts'
import { useCallback, useEffect, useState } from 'react'
import { L } from '@/lib/KRUtilities'
import { compareMatterNumbers } from './matterDisplay'
import { fetchClientMatters, MattersApiError } from './api.client'

export interface ClientMattersState {
  data: ClientMattersData | null
  loading: boolean
  error: string | null
  /** Loads the list again. */
  reload: () => void
  /** Puts a saved matter into the list (added or changed), kept in number order. */
  upsert: (matter: Matter) => void
  /** Takes a deleted matter out of the list. */
  remove: (matterId: string) => void
}

/** The client's matters; idle (no call) when the contact has no client account. */
export function useClientMatters(clientId: string | null | undefined): ClientMattersState {
  const [data, setData] = useState<ClientMattersData | null>(null)
  const [loading, setLoading] = useState(Boolean(clientId))
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    if (!clientId) {
      setLoading(false)
      return () => { cancelled = true }
    }
    setLoading(true)
    fetchClientMatters(clientId)
      .then((next) => { if (!cancelled) setData(next) })
      .catch((caught: unknown) => {
        if (cancelled) return
        L(`[MATTERS_LOAD:45] failed clientId=${clientId} code=${caught instanceof MattersApiError ? caught.code : 'unknown'}`)
        setError(caught instanceof MattersApiError ? caught.message : 'The matters could not be loaded.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId, generation])

  const reload = useCallback(() => setGeneration((value) => value + 1), [])
  const upsert = useCallback((matter: Matter) => {
    setData((current) => current && {
      ...current,
      matters: [...current.matters.filter((row) => row.id !== matter.id), matter].sort((left, right) => compareMatterNumbers(left.matterNumber, right.matterNumber)),
    })
  }, [])
  const remove = useCallback((matterId: string) => {
    setData((current) => current && { ...current, matters: current.matters.filter((row) => row.id !== matterId) })
  }, [])

  return { data, loading, error, reload, upsert, remove }
}
