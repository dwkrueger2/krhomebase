'use client'
// file: apps/web/features/contacts/DataStoreProvider.client.tsx
/**
 * Provides the authenticated Homebase search projections and their encrypted
 * browser-cache lifecycle to the shell and all descendant search controls.
 * Contacts use the existing delta-aware contacts adapter; Billing receives a
 * deliberately small client-account projection rather than full billing data.
 *
 * Ported from the old `hb-components/data-store/DataStoreProvider.client.tsx`. Unchanged: one provider per
 * user, cache shown first, then contacts and billing clients refreshed side by side (`Promise.allSettled`),
 * the in-flight guard, the 5-minute interval, focus and visibility refreshes at most once a minute, "Refresh
 * Data" (`refreshFull`), and `upsertContact` keeping the billing list in step.
 *
 * Changed (plan decision 3), marked "Changed:": the billing client list is built from the synchronized
 * contacts (`billingClientsFromContacts`) instead of the old `loadBillingClients()` request, which stopped at
 * 100 clients. It is still cached on its own (collection `clients`) so it shows at once on the next load.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { readClientDataCollection, writeClientDataCollection } from '@/lib/client-data-store/browserStore.client'
import { recordClientDataMetric } from '@/lib/client-data-store/metrics.client'
import type { ClientClientElement } from '@/lib/client-data-store/types'
import { billingClientsFromContacts, type BillingClient } from './billingClients'
import { readCachedContacts, syncContacts, syncFullContacts, upsertCachedContact } from './contactsStore.client'
import type { KRContactRecord } from './types'

const CLIENT_COLLECTION_SCHEMA_VERSION = 1

/** Public synchronization states rendered by the shell indicator. */
export type DataStoreSyncState = 'updating' | 'current' | 'stale' | 'error'

/** Data and mutation operations exposed to authenticated Homebase descendants. */
export interface DataStoreContextValue {
  /** Search-ready contact projection. */
  readonly contacts: readonly KRContactRecord[]
  /** Search-ready active Billing client projection. */
  readonly billingClients: readonly BillingClient[]
  /** Current cache/network lifecycle state. */
  readonly syncState: DataStoreSyncState
  /** Most recent successful combined data refresh timestamp. */
  readonly lastSyncedAt: string | null
  /** Safe diagnostic error suitable for a status tooltip or support panel. */
  readonly syncError: string
  /** Whether the initial contact projection is still being loaded. */
  readonly contactsLoading: boolean
  /** Requests a cache-aware contact and Billing client refresh. */
  readonly refresh: () => Promise<void>
  /** Requests a complete network refresh of the contacts and Billing projections. */
  readonly refreshFull: () => Promise<void>
  /** Applies one canonical contact save to memory and encrypted cache. */
  readonly upsertContact: (contact: KRContactRecord) => Promise<void>
}

const DataStoreContext = createContext<DataStoreContextValue | null>(null)

function billingClientToElement(client: BillingClient, updatedAt: string): ClientClientElement {
  return {
    id: client.id,
    updatedAt,
    kind: 'client',
    displayName: client.displayName,
    clientNumber: client.clientNumber,
    clientType: client.clientType || null,
    clientStatus: client.status || null,
    individualIds: [],
    entityIds: [],
  }
}

function billingClientFromElement(element: ClientClientElement): BillingClient {
  return {
    id: element.id,
    clientNumber: element.clientNumber,
    displayName: element.displayName || element.clientNumber || 'Unnamed client',
    clientType: element.clientType || '',
    status: element.clientStatus || '',
  }
}

function billingClientsFromCachedElements(elements: readonly ClientClientElement[]): BillingClient[] {
  return elements.map(billingClientFromElement)
}

/**
 * Reads the encrypted Billing client projection without contacting the server.
 * The projection is intentionally separate from full invoices, payments, and
 * ledger records, which remain detail-on-demand API data.
 */
async function readCachedBillingClients(scope: string): Promise<BillingClient[] | null> {
  const collection = await readClientDataCollection<ClientClientElement>(scope, 'clients')
  return collection ? billingClientsFromCachedElements(collection.elements) : null
}

/** Writes the current Billing search projection through the encrypted store. */
async function writeCachedBillingClients(scope: string, clients: readonly BillingClient[]): Promise<void> {
  const fetchedAt = new Date().toISOString()
  await writeClientDataCollection(scope, {
    collectionId: 'clients',
    schemaVersion: CLIENT_COLLECTION_SCHEMA_VERSION,
    collectionVersion: fetchedAt,
    fetchedAt,
    elements: clients.map((client) => billingClientToElement(client, fetchedAt)),
  })
}

/**
 * Focus / tab-visible refreshes are skipped when the last refresh started less
 * than this long ago. Clicking back into the window used to start a full
 * contacts sync every time.
 */
const FOCUS_REFRESH_MIN_INTERVAL_MS = 60_000

/** Loads, caches, and synchronizes the shared Homebase data projections. */
export function DataStoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [contacts, setContacts] = useState<KRContactRecord[]>([])
  const [billingClients, setBillingClients] = useState<BillingClient[]>([])
  const [syncState, setSyncState] = useState<DataStoreSyncState>('updating')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncError, setSyncError] = useState('')
  const inFlightRef = useRef(false)
  const hasUsableDataRef = useRef(false)
  const lastRefreshStartedRef = useRef(0)

  const refresh = useCallback(async (forceFull = false): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    lastRefreshStartedRef.current = Date.now()
    setSyncState('updating')
    setSyncError('')

    let hadUsableData = hasUsableDataRef.current
    let contactCache: Awaited<ReturnType<typeof readCachedContacts>> = null
    let billingCache: BillingClient[] | null = null
    const errors: string[] = []

    if (!forceFull) {
      try {
        contactCache = await readCachedContacts(userId)
        if (contactCache) {
          setContacts(contactCache.contacts)
          setLastSyncedAt(contactCache.fetchedAt)
          hadUsableData = true
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Contact cache could not be read.')
      }

      try {
        billingCache = await readCachedBillingClients(userId)
        if (billingCache) {
          setBillingClients(billingCache)
          hadUsableData = true
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Billing client cache could not be read.')
      }
    }

    // Changed: one request. The billing client list is built from the synchronized contacts below.
    const contactsSync = forceFull ? syncFullContacts(userId) : syncContacts(userId, contactCache?.collection ?? null)
    const [contactsResult, billingResult] = await Promise.allSettled([
      contactsSync,
      contactsSync.then((result) => billingClientsFromContacts(result.contacts)),
    ])

    if (contactsResult.status === 'fulfilled') {
      setContacts(contactsResult.value.contacts)
      setLastSyncedAt(contactsResult.value.fetchedAt)
      hadUsableData = true
    } else {
      errors.push(contactsResult.reason instanceof Error ? contactsResult.reason.message : 'Contacts could not be synchronized.')
      recordClientDataMetric({ collectionId: 'contacts', operation: 'sync', durationMs: 0, failed: true })
    }

    if (billingResult.status === 'fulfilled') {
      const nextBillingClients = billingResult.value
      setBillingClients(nextBillingClients)
      hadUsableData = true
      try {
        await writeCachedBillingClients(userId, nextBillingClients)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Billing client cache could not be written.')
        recordClientDataMetric({ collectionId: 'clients', operation: 'collection-write', durationMs: 0, failed: true })
      }
    } else {
      errors.push(billingResult.reason instanceof Error ? billingResult.reason.message : 'Billing clients could not be synchronized.')
      recordClientDataMetric({ collectionId: 'clients', operation: 'sync', durationMs: 0, failed: true })
    }

    hasUsableDataRef.current = hadUsableData
    if (errors.length) {
      setSyncState(hadUsableData ? 'stale' : 'error')
      setSyncError(errors.join(' '))
    } else {
      setSyncState('current')
      setLastSyncedAt(new Date().toISOString())
    }
    inFlightRef.current = false
  }, [userId])

  /** Performs a complete network refresh, replacing the cached projections atomically. */
  const refreshFull = useCallback(async (): Promise<void> => {
    await refresh(true)
  }, [refresh])

  useEffect(() => {
    hasUsableDataRef.current = false
    setContacts([])
    setBillingClients([])
    setLastSyncedAt(null)
    setSyncState('updating')
    void refresh()
  }, [refresh])

  useEffect(() => {
    const interval = window.setInterval(() => { void refresh() }, 5 * 60 * 1000)
    const refreshIfDue = (): void => {
      if (Date.now() - lastRefreshStartedRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) return
      void refresh()
    }
    const handleFocus = (): void => { refreshIfDue() }
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refreshIfDue()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  const upsertContact = useCallback(async (contact: KRContactRecord): Promise<void> => {
    // Changed: the billing list is rebuilt from the updated contacts, so a joint client stays listed while
    // another member still belongs to it (the old code removed the saved person's client entry first).
    const nextContacts = [contact, ...contacts.filter((candidate) => candidate.id !== contact.id)]
    const nextBillingClients = billingClientsFromContacts(nextContacts)

    setContacts(nextContacts)
    setBillingClients(nextBillingClients)
    hasUsableDataRef.current = true
    try {
      await Promise.all([
        upsertCachedContact(userId, contact, contact.updatedAt ?? new Date().toISOString()),
        writeCachedBillingClients(userId, nextBillingClients),
      ])
    } catch (error) {
      setSyncState('stale')
      setSyncError('The server save succeeded, but the encrypted browser cache needs a refresh.')
      throw error
    }
  }, [contacts, userId])

  const contextValue = useMemo<DataStoreContextValue>(() => ({
    contacts,
    billingClients,
    syncState,
    lastSyncedAt,
    syncError,
    contactsLoading: syncState === 'updating' && contacts.length === 0,
    refresh,
    refreshFull,
    upsertContact,
  }), [billingClients, contacts, lastSyncedAt, refresh, refreshFull, syncError, syncState, upsertContact])

  return <DataStoreContext.Provider value={contextValue}>{children}</DataStoreContext.Provider>
}

/** Returns the shared data store when the component is rendered inside Homebase. */
export function useOptionalDataStore(): DataStoreContextValue | null {
  return useContext(DataStoreContext)
}

/** Returns the shared data store and fails loudly when the provider is missing. */
export function useDataStore(): DataStoreContextValue {
  const value = useOptionalDataStore()
  if (!value) throw new Error('useDataStore must be used within DataStoreProvider')
  return value
}

export default DataStoreProvider
