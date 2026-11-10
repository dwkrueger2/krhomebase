// file: apps/web/features/contacts/api.client.ts
/**
 * The contacts area's calls to the API from the browser. They go to `/api/v1/contacts...` on this site;
 * `app/api/[...path]/route.ts` forwards them to the API Worker. Replies are checked against the shared contracts.
 *
 * Unlike the tools screen, these calls throw on failure: the data store (`DataStoreProvider`) records the
 * message for the sync indicator's tooltip, as the old `fetchKRModuleApi` did.
 */

import { ContactListData, ErrorEnvelope, successEnvelope, type ContactListData as ContactListDataShape } from '@krhomebase/contracts'

/** Sentences for the error codes the contacts routes return. Unknown codes show the API's own message. */
const ERROR_SENTENCES: Record<string, string> = {
  CONTACTS_UNAVAILABLE: 'Contacts are not available right now.',
  PERMISSION_REQUIRED: 'Your role does not include reading contacts.',
  PERMISSIONS_UNAVAILABLE: 'Permission checks are not available right now.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
}

const listEnvelope = successEnvelope(ContactListData)

/**
 * Loads the whole contact list, or with `since` only the contacts changed since then.
 *
 * @param since - The `generatedAt` of the last load, for a delta. Leave out for the whole list.
 * @returns The checked reply data (contacts never carry the full SSN or date of birth).
 */
export async function fetchContactList(since?: string): Promise<ContactListDataShape> {
  const query = since ? `?${new URLSearchParams({ mode: 'delta', since }).toString()}` : ''
  const response = await fetch(`/api/v1/contacts${query}`, { cache: 'no-store' })
  const body: unknown = await response.json().catch(() => null)
  const parsed = listEnvelope.safeParse(body)
  if (response.ok && parsed.success) return parsed.data.data
  const error = ErrorEnvelope.safeParse(body)
  if (error.success) throw new Error(ERROR_SENTENCES[error.data.error.code] ?? error.data.error.message)
  throw new Error(`Contacts could not be loaded (HTTP ${response.status}).`)
}
