// file: apps/web/features/billing/types.ts
/**
 * Billing's shapes for the screens. The record and its rows come from `@krhomebase/contracts` (`billing.ts`); the
 * screens add `isEmpty` to draw the grey "Sample Row - No Entries Found" placeholder (old `KR-Billing/types.ts`).
 */

import type {
  BillingInvoice as ContractInvoice,
  BillingLedgerEntry as ContractLedgerEntry,
  BillingRecord,
  BillingTimeEntry as ContractTimeEntry,
} from '@krhomebase/contracts'

export type {
  BillingEntryKind,
  BillingInvoiceStatus,
  BillingPayment,
  BillingPaymentRefund,
  BillingPaymentType,
  BillingRecord,
  BillingStatus,
  BillingTrustEntry,
} from '@krhomebase/contracts'

/** A time or flat-fee entry. `isEmpty` marks the placeholder row. */
export type BillingTimeEntry = Omit<ContractTimeEntry, 'staffCode' | 'internalTimeTracked' | 'bcid'> & {
  staffCode?: string | null
  internalTimeTracked?: boolean
  bcid?: string | null
  isEmpty?: boolean
}

/** An invoice. A new one, not yet saved, has an id starting `new_` and no `ivid`. */
export type BillingInvoice = Omit<ContractInvoice, 'ivid'> & { ivid?: string | null }

/** A register row. `isEmpty` marks the placeholder row. */
export type ClientAccountingLedgerEntry = ContractLedgerEntry & { isEmpty?: boolean }

/** One of the client's matters. */
export type BillingMatter = BillingRecord['matters'][number]

/** A person who can be chosen as the staff on an entry. */
export type BillingStaffOption = BillingRecord['staffOptions'][number]

/** One client in the Billing search list (built from the contacts; see `features/contacts/billingClients.ts`). */
export interface BillingClient {
  id: string
  clientNumber: string
  displayName: string
  clientType: string
  status: string
}
