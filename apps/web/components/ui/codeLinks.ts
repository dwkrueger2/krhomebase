// file: apps/web/components/ui/codeLinks.ts
/**
 * Following a code (the requester, Nov 18, 2026, web patch 571): one rule for every short code KR Homebase shows, so
 * no screen writes its own link. A screen draws the code with `KRCodeLink` (or calls `openKRCode`); the one listener,
 * `features/code-links/CodeLinkHost.client.tsx` (drawn once inside the frame), opens the target:
 *
 * | Kind        | The code                                   | Opens                                                        |
 * |-------------|--------------------------------------------|--------------------------------------------------------------|
 * | `workstream`| a WSID (`SHZ7GWE`)                         | that WorkStream entry's dialog, over the screen              |
 * | `task`      | a task id (`T4K9QWS`)                      | that task's dialog, over the screen                          |
 * | `client`    | a client account id or client number (`090`) | the client's contact in Clients & Contacts                 |
 * | `matter`    | a matter id (with its client)              | the client's contact at Projects & Matters, that matter open |
 * | `lead`      | an LCID (`L007`) or a lead id              | Leads, with that lead open                                   |
 * | `contact`   | an ICID (individual), an ECID (entity) or a contact id | the contact in Clients & Contacts                  |
 *
 * Kept in `components/` because every feature draws codes; it imports no feature (the host listens instead). The
 * listeners live in this module, so a code in a pop-out reaches the host in the main window too.
 */

/** What a code points at. */
export type KRCodeKind = 'workstream' | 'task' | 'client' | 'matter' | 'lead' | 'contact'

/** One code to follow. `clientId` goes with a `matter` (the client whose contact opens). */
export interface KRCodeTarget {
  kind: KRCodeKind
  code: string
  clientId?: string | null
}

type KRCodeListener = (target: KRCodeTarget) => void

const listeners = new Set<KRCodeListener>()

/**
 * Follows a code: hands it to the host.
 *
 * @returns False when no host is listening (a test, or outside the frame), so the caller can do nothing.
 */
export function openKRCode(target: KRCodeTarget): boolean {
  const code = target.code.trim()
  if (!code || !listeners.size) return false
  for (const listener of listeners) listener({ ...target, code })
  return true
}

/** The host's subscription; returns the function that ends it. */
export function onKRCodeOpen(listener: KRCodeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The words a code link gives a screen reader and its tooltip ("Open WorkStream entry SHZ7GWE"); a link may give better ones. */
export function codeLinkTitle(target: KRCodeTarget): string {
  const what: Record<KRCodeKind, string> = {
    workstream: 'WorkStream entry',
    task: 'task',
    client: 'client',
    matter: 'matter',
    lead: 'lead',
    contact: 'contact',
  }
  return `Open ${what[target.kind]} ${target.code}`
}
