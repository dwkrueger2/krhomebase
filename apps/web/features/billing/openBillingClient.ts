// file: apps/web/features/billing/openBillingClient.ts
/**
 * Opening a client under Billing (plan stage 2, difference 4): each client is an open item of the frame,
 * `billing:<clientId>`, listed under the Billing row (five at most) and in the recently accessed menu. Its screen
 * is `BillingClientPanel`. The record load starts at once (`prefetchBilling`), so it overlaps the switch.
 *
 * Other areas open a client the same way without importing this file:
 * `useShellNavigation().openItem('billing', clientId, '[501] Pat Sample')` (Contact Detail's billing button does).
 */

import type { ShellNavigation } from '@/components/shell/shellNavigation'
import { prefetchBilling } from './api.client'
import type { BillingClient } from './types'

/** The menu words for a billing client: `[501] Pat Sample` (same form as an open contact). */
export function billingMenuLabel(client: Pick<BillingClient, 'clientNumber' | 'displayName'>): string {
  return `${client.clientNumber ? `[${client.clientNumber}] ` : ''}${client.displayName}`
}

/**
 * Opens a client's billing as an open item.
 *
 * @returns False when there is no frame (a screen drawn on its own).
 */
export function openBillingClient(navigation: ShellNavigation, client: Pick<BillingClient, 'id' | 'clientNumber' | 'displayName'>): boolean {
  prefetchBilling(client.id)
  return navigation.openItem('billing', client.id, billingMenuLabel(client))
}
