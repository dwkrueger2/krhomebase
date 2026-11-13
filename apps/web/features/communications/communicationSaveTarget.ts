// file: apps/web/features/communications/communicationSaveTarget.ts
/**
 * Where the composer's draft is saved: a lead, a client (with a chosen matter, or none so the API uses the client's
 * `.0` matter, D12), or "Internal" (client 050, matter 050.1).
 *
 * New in this repository. The old panel sent `clientNumber` and `matterNumber` from whichever context it held and
 * refused to save from the firm feed; its Internal choice never reached the save. The new API takes ids only, so this
 * file turns the composer's choices into ids:
 * - a fixed context (the section opened for one client or lead) always wins;
 * - Client uses the client chosen in the composer (and its chosen matter);
 * - Internal finds client 050 in the browser's contact list and its matter 050.1 from the API;
 * - Lead without a fixed lead context, and Client without a chosen client, are blocked with a plain sentence.
 *
 * The matter read is passed in (`loadMatters`), so the rules can be tested without the network.
 */

import type { ClientMattersData } from '@krhomebase/contracts'
import type { KRContactRecord } from '@/features/contacts/types'
import { INTERNAL_CLIENT_NUMBER, INTERNAL_MATTER_NUMBER, type CommunicationClientState } from './communicationTypes'
import { findInternalClientContact } from './workStreamContacts'

/** The owner given to the panel by the screen that places it (a client or lead view later; nothing in the firm feed). */
export interface CommunicationsContext {
  clientId?: string | null
  leadId?: string | null
  matterId?: string | null
  contextLabel?: string | null
}

/** A client chosen in the composer's lookup. */
export interface CommunicationComposerOwner {
  clientId: string
  clientNumber: string | null
  displayName: string
}

export interface CommunicationSaveTargetInput {
  context: CommunicationsContext | null | undefined
  clientState: CommunicationClientState
  composerOwner: CommunicationComposerOwner | null
  /** The matter chosen with the Matter button, if any. */
  composerMatterId: string | null
  contacts: readonly KRContactRecord[]
}

/** The ids sent with `POST /v1/workstream`, and a label for the status line. */
export type CommunicationSaveTarget =
  | { clientId: string; matterId?: string; leadId?: undefined; label: string }
  | { leadId: string; clientId?: undefined; matterId?: undefined; label: string }

/** Why nothing can be saved with these choices, or null when a save may be tried. Checked before the send button is enabled. */
export function saveTargetBlockReason(input: CommunicationSaveTargetInput): string | null {
  if (input.context?.leadId || input.context?.clientId) return null
  if (input.clientState === 'Client') return input.composerOwner ? null : 'Choose a client (or Internal) before sending a communication.'
  if (input.clientState === 'Lead') return 'A lead\'s entries are written from the lead\'s own screen, which comes with the Leads port. Choose a client or Internal.'
  return null
}

/**
 * Resolves the choices to ids.
 *
 * @param input - The composer's choices and the contact list.
 * @param loadMatters - Reads a client's matters (`fetchClientMatters`); used for Internal only.
 * @returns The target. Throws an `Error` whose message is a plain sentence when nothing can be saved.
 */
export async function resolveCommunicationSaveTarget(input: CommunicationSaveTargetInput, loadMatters: (clientId: string) => Promise<ClientMattersData>): Promise<CommunicationSaveTarget> {
  const { context } = input
  if (context?.leadId) return { leadId: context.leadId, label: context.contextLabel || 'this lead' }
  if (context?.clientId) {
    const matterId = input.composerMatterId ?? context.matterId ?? undefined
    return { clientId: context.clientId, ...(matterId ? { matterId } : {}), label: context.contextLabel || 'this client' }
  }
  const blocked = saveTargetBlockReason(input)
  if (blocked) throw new Error(blocked)
  if (input.clientState === 'Client' && input.composerOwner) {
    const owner = input.composerOwner
    return { clientId: owner.clientId, ...(input.composerMatterId ? { matterId: input.composerMatterId } : {}), label: `Client ${owner.clientNumber ?? owner.displayName}` }
  }
  const internal = findInternalClientContact(input.contacts)
  if (!internal?.clientId) throw new Error(`Client ${INTERNAL_CLIENT_NUMBER} (Internal) is not in the contact list yet. Wait for the contacts to load, or choose a client.`)
  const matters = await loadMatters(internal.clientId)
  const matter = matters.matters.find((candidate) => candidate.matterNumber === INTERNAL_MATTER_NUMBER)
  if (!matter) throw new Error(`Client ${INTERNAL_CLIENT_NUMBER} has no matter ${INTERNAL_MATTER_NUMBER}, so Internal entries have nowhere to go. Add that matter first, or choose a client.`)
  return { clientId: internal.clientId, matterId: matter.id, label: `Internal (Matter ${INTERNAL_MATTER_NUMBER})` }
}
