'use client'
// file: apps/web/features/communications/workstreamDrafts.client.ts
/**
 * WorkStream drafts (FB-0026, web patch 588; the requester, Nov 23, 2026): what a person has typed in the WorkStream
 * composer but not sent, kept in this browser so that a click elsewhere, a closed tab or a sign-out does not lose it.
 *
 * - **Where:** the encrypted browser store (`lib/client-data-store`, collection `drafts`) under the signed-in person's
 *   scope, the same store and key as the contact cache. A draft may hold client details, so never `localStorage`.
 * - **One draft per place:** the firm feed, each client, each client matter and each lead (`draftPlaceId`).
 * - **Kept:** until it is sent, discarded or emptied; a draft left untouched for 30 days is dropped when read
 *   (`DRAFT_KEEP_DAYS`).
 * - **This computer only:** drafts never reach the API, so they do not follow the person to another computer.
 *
 * Every call here fails quietly (a log line and no draft): a browser without IndexedDB or Web Crypto still writes and
 * sends entries, it just keeps no drafts.
 */

import { L } from '@/lib/KRUtilities'
import { deleteClientDataElement, readClientDataCollection, upsertClientDataElement } from '@/lib/client-data-store/browserStore.client'
import type { ClientDraftElement } from '@/lib/client-data-store/types'
import type { CommunicationsContext } from './communicationSaveTarget'

/** The collection version written with each draft (drafts are never synchronized, so it never changes). */
const DRAFTS_VERSION = 'local-1'

/** A draft untouched for longer than this is dropped when the drafts are read. */
export const DRAFT_KEEP_DAYS = 30

/** A draft as the composer uses it (the stored element without its storage fields). */
export type WorkstreamDraft = Omit<ClientDraftElement, 'id' | 'updatedAt' | 'kind'>

/** A draft read back, with when it was last saved. */
export interface SavedWorkstreamDraft {
  draft: WorkstreamDraft
  savedAt: string
}

/**
 * The place a draft belongs to: the lead, the client (and matter) the panel was opened for, or the firm feed. A client
 * picked inside the firm feed's composer is part of the draft, not of its place.
 */
export function draftPlaceId(context: CommunicationsContext | null | undefined): string {
  if (context?.leadId) return `workstream:lead:${context.leadId}`
  if (context?.clientId) return `workstream:client:${context.clientId}${context.matterId ? `:${context.matterId}` : ''}`
  return 'workstream:feed'
}

/** True when the draft holds no words, link or picture: nothing worth keeping. */
export function draftIsEmpty(draft: Pick<WorkstreamDraft, 'body' | 'html'>): boolean {
  return !draft.body.trim() && !/<(a|img)\b/i.test(draft.html)
}

/** True when a draft saved at `savedAt` is older than `DRAFT_KEEP_DAYS` at `now`. */
export function draftExpired(savedAt: string, now = Date.now()): boolean {
  const saved = Date.parse(savedAt)
  return !Number.isFinite(saved) || now - saved > DRAFT_KEEP_DAYS * 24 * 60 * 60 * 1000
}

/** "8:42pm" for a draft saved today, "Nov 21, 8:42pm" for an older one. */
export function draftTimeLabel(savedAt: string, now = new Date()): string {
  const saved = new Date(savedAt)
  if (Number.isNaN(saved.getTime())) return ''
  const time = saved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  return saved.toDateString() === now.toDateString() ? time : `${saved.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

/**
 * Reads the person's draft for one place, or null. An expired draft is removed and not returned.
 *
 * @param scope - The signed-in person's id (the store's scope).
 * @param placeId - From `draftPlaceId`.
 */
export async function readWorkstreamDraft(scope: string, placeId: string): Promise<SavedWorkstreamDraft | null> {
  try {
    const collection = await readClientDataCollection<ClientDraftElement>(scope, 'drafts')
    const element = collection?.elements.find((candidate) => candidate.id === placeId)
    if (!element?.updatedAt) return null
    if (draftExpired(element.updatedAt)) {
      await deleteClientDataElement(scope, 'drafts', placeId, DRAFTS_VERSION)
      return null
    }
    const { id: _id, updatedAt, kind: _kind, ...draft } = element
    return { draft, savedAt: updatedAt }
  } catch (error) {
    L(`[WORKSTREAM_DRAFTS:83] read failed code=${(error as { code?: string })?.code ?? 'unknown'}`)
    return null
  }
}

/**
 * Saves (or, when it is empty, removes) the person's draft for one place.
 *
 * @returns When it was saved, or null when it was removed or could not be saved.
 */
export async function saveWorkstreamDraft(scope: string, placeId: string, draft: WorkstreamDraft): Promise<string | null> {
  if (draftIsEmpty(draft)) {
    await clearWorkstreamDraft(scope, placeId)
    return null
  }
  const savedAt = new Date().toISOString()
  try {
    await upsertClientDataElement<ClientDraftElement>(scope, 'drafts', { id: placeId, updatedAt: savedAt, kind: 'workstream-draft', ...draft }, DRAFTS_VERSION)
    return savedAt
  } catch (error) {
    L(`[WORKSTREAM_DRAFTS:102] save failed code=${(error as { code?: string })?.code ?? 'unknown'}`)
    return null
  }
}

/** Removes the person's draft for one place (after it was sent or discarded). */
export async function clearWorkstreamDraft(scope: string, placeId: string): Promise<void> {
  try {
    await deleteClientDataElement(scope, 'drafts', placeId, DRAFTS_VERSION)
  } catch (error) {
    L(`[WORKSTREAM_DRAFTS:112] clear failed code=${(error as { code?: string })?.code ?? 'unknown'}`)
  }
}
