// file: apps/web/features/contacts/contactEditRequests.ts
/**
 * "Open this contact in the editor": the ledger's pencil and Add contact's "Enter details" open a contact and ask
 * its screen to open the editor. The screen may not exist yet (the contact is just being opened), so the request
 * waits here until the screen takes it. Replaces the old `onRequestContactEdit` callback between the old panel and
 * shell. One request per contact; taking it clears it.
 */

const pending = new Set<string>()
const listeners = new Set<(contactId: string) => void>()

/** Asks the contact's screen to open the editor. */
export function requestContactEdit(contactId: string): void {
  pending.add(contactId)
  for (const listener of listeners) listener(contactId)
}

/** Takes a waiting request for this contact. True when there was one. */
export function takeContactEditRequest(contactId: string): boolean {
  return pending.delete(contactId)
}

/** Calls `listener` when a request arrives while the screen is showing. Returns the unsubscribe function. */
export function onContactEditRequest(listener: (contactId: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
