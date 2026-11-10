// file: apps/web/features/contacts/billingClients.ts
/**
 * The billing client list, built from the contact list (plan decision 3, docs/06_Contacts_Billing_Port_Plan.md).
 *
 * The old app loaded it separately from `clients?limit=100&status=active`, which stopped at 100 of about 200
 * active clients. Here it comes from the contacts already in the data store, so every active client is listed
 * and no extra request is made.
 *
 * Rule (the old `billingClientFromContact`, unchanged): a contact gives a billing client when it is a client,
 * has a client id, and the client's status is not inactive. A joint client (one client account, several
 * people) is listed once, under the client account's own name (`clientDisplayName`); a person who is a client
 * on their own is listed under their name. Sorted by name.
 *
 * Billing reads this list from the data store (`useDataStore().billingClients`).
 */

import type { KRContactRecord } from './types'

/** One client in the billing list. Same shape as the old `KR-Billing/types.ts` BillingClient. */
export interface BillingClient {
  id: string
  clientNumber: string
  displayName: string
  clientType: string
  status: string
}

/** The billing client a contact belongs to, or null (old rule, plus the client account's own name). */
export function billingClientFromContact(contact: KRContactRecord): BillingClient | null {
  if (!contact.isClient || !contact.clientId || contact.clientStatus === 'inactive') return null
  const rVal: BillingClient = {
    id: contact.clientId,
    clientNumber: contact.clientNumber ?? '',
    displayName: contact.clientDisplayName || contact.displayName,
    clientType: contact.clientType ?? (contact.kind === 'individual' ? 'individual' : 'entity'),
    status: contact.clientStatus ?? 'active',
  }
  return rVal
}

/** Every active client among the contacts, once each, sorted by name. */
export function billingClientsFromContacts(contacts: readonly KRContactRecord[]): BillingClient[] {
  const byId = new Map<string, BillingClient>()
  for (const contact of contacts) {
    const client = billingClientFromContact(contact)
    if (!client) continue
    const existing = byId.get(client.id)
    // Prefer an entry named from the client account itself, when one person's cache predates that field.
    if (!existing || (contact.clientDisplayName && existing.displayName !== contact.clientDisplayName)) byId.set(client.id, client)
  }
  const rVal = [...byId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName))
  return rVal
}
