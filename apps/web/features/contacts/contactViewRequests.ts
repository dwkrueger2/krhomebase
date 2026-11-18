// file: apps/web/features/contacts/contactViewRequests.ts
/**
 * A request to show an open contact at one tab, and one matter there (web patch 571, "Following a code": a followed
 * matter number opens the client at Projects & Matters with that matter selected). The code-link host files the
 * request and opens the contact; the contact's workspace takes it when it appears, or at once when it is showing.
 * A request is taken once, so returning to the contact later shows it as it was.
 */

import { useEffect, useRef } from 'react'

/** Where to show the contact: the Projects & Matters tab, with this matter selected when given. */
export interface ContactViewRequest {
  contactId: string
  tab: 'projects-matters'
  matterId: string | null
}

let pending: ContactViewRequest | null = null
const listeners = new Set<() => void>()

/** Files a request for this contact (the latest one wins) and tells a workspace already showing it. */
export function requestContactView(request: ContactViewRequest): void {
  pending = request
  for (const listener of listeners) listener()
}

/**
 * Takes this contact's request, now and whenever a new one is filed, and hands it to `onRequest`.
 *
 * @param contactId - The contact the workspace shows.
 * @param onRequest - What the workspace does with it (choose the tab and the matter).
 */
export function useContactViewRequest(contactId: string, onRequest: (request: ContactViewRequest) => void): void {
  const handler = useRef(onRequest)
  handler.current = onRequest
  useEffect(() => {
    function take(): void {
      if (!pending || pending.contactId !== contactId) return
      const request = pending
      pending = null
      handler.current(request)
    }
    take()
    listeners.add(take)
    return () => {
      listeners.delete(take)
    }
  }, [contactId])
}
