'use client'
// file: apps/web/features/billing/components/BillingPanel.client.tsx
/**
 * The Billing section (menu id `billing`, plan stage 2): the place to find a client. Port of the "no client chosen"
 * half of the old `KR-Billing/BillingPanel.client.tsx`.
 *
 *  - The client list is the data store's billing client list (plan decision 3: active clients, built from the
 *    contacts; `useOptionalDataStore()` from `features/contacts/DataStoreProvider.client.tsx`, the store every screen
 *    shares). No request is made here.
 *  - Choosing a client opens it as its own item, `billing:<clientId>`, under the Billing row (`openBillingClient`);
 *    its screen is `BillingClientPanel`. Resting the pointer on a result starts loading it.
 *
 * @returns The client search with its instructions.
 */

import { useShellNavigation } from '@/components/shell/shellNavigation'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import { prefetchBilling } from '../api.client'
import { openBillingClient } from '../openBillingClient'
import BillingSearch from './BillingSearch.client'

const STYLES = {
  shell: 'p-3 gap-2 grid grid-cols-[minmax(0,1fr)] text-[var(--kr-theme-text,#243142)]',
  message: 'p-3 border border-[var(--kr-theme-line,#d7dee5)] bg-white text-[10pt] text-[var(--kr-theme-text-muted,#526172)]',
  error: 'p-3 border border-red-300 bg-red-50 text-[10pt] text-red-800',
} as const

export default function BillingPanel() {
  const navigation = useShellNavigation()
  const dataStore = useOptionalDataStore()
  const clients = dataStore?.billingClients ?? []
  const loading = !dataStore || (dataStore.syncState === 'updating' && clients.length === 0)
  const syncError = dataStore?.syncError ?? ''

  function open(clientId: string): void {
    const client = clients.find((candidate) => candidate.id === clientId)
    if (client) openBillingClient(navigation, client)
  }

  return (
    <section className={STYLES.shell} aria-label="Billing" data-kr-id="BillingPanel">
      {syncError && !clients.length ? (
        <p className={STYLES.error} role="alert">
          Billing could not load the client list: {syncError}
        </p>
      ) : null}
      {loading ? (
        <div className={STYLES.message} data-kr-element="billing-clients-loading" role="status">
          <RainbowBusySpinner busy hideWhenIdle={false} label="Loading billing clients" size={18} />
        </div>
      ) : null}
      {!loading && !clients.length && !syncError ? <p className={STYLES.message}>No client accounts are available to this session.</p> : null}
      {!loading && clients.length ? (
        <>
          <p className={STYLES.message}>Start typing in the search box below. Press Enter to open the top row, or click the client you want.</p>
          <BillingSearch clients={clients} onOpenClient={open} onPreviewClient={prefetchBilling} />
        </>
      ) : null}
    </section>
  )
}
