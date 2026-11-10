// file: apps/web/features/contacts/contactEdits.client.ts
/**
 * The contact screens' write calls and the one-contact read, from the browser (plan stages 1d-3 and 1d-4). They go
 * to `/api/v1/...` on this site, which forwards them to the API Worker; replies are checked against the shared
 * contracts. Replaces the old `fetchKRModuleApi('/krhomebase/api/kr-api-v1/...')` calls.
 *
 * Failures throw `ContactApiError` with the API's error code, so a screen can react to a code (for example
 * `CONTACT_CONFLICT`) and show the sentence in `message`.
 */

import {
  ClientLookupData,
  ClientStatusData,
  ContactCreateData,
  ContactDetailData,
  ContactRemovalData,
  ContactRemovalPreflightData,
  ContactResolutionData,
  ContactResolutionPreflightData,
  ContactUpdateData,
  ErrorEnvelope,
  NextClientNumberData,
  successEnvelope,
  type ClientStatusBody,
  type ContactCreateBody,
  type ContactRemovalBody,
  type ContactResolutionBody,
  type ContactUpdateBody,
} from '@krhomebase/contracts'
import { z } from 'zod'
import { contactFromApiRow } from './contactsStore.client'
import type { KRContactRecord } from './types'

/** A refused or failed call, with the API's error code. */
export class ContactApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Sentences for codes a person may meet. Unknown codes show the API's own message. */
const ERROR_SENTENCES: Record<string, string> = {
  CONTACTS_UNAVAILABLE: 'Contacts are not available right now.',
  PERMISSION_REQUIRED: 'Your role does not allow this change.',
  FORBIDDEN: 'Your role does not allow this change.',
  MAINTENANCE_LOCKED: 'KR Homebase is in maintenance. Saving is paused.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  CONTACT_CONFLICT: 'Another person changed this contact. The latest data was loaded; review it before saving again.',
  VALIDATION_FAILED: 'Some fields are not in the expected form.',
}

async function call<T>(path: string, schema: z.ZodType<T>, init?: { method: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    cache: 'no-store',
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(body)
  if (response.ok && parsed.success) return parsed.data.data as T
  const error = ErrorEnvelope.safeParse(body)
  if (error.success) throw new ContactApiError(error.data.error.code, ERROR_SENTENCES[error.data.error.code] ?? error.data.error.message, response.status)
  throw new ContactApiError('HTTP_ERROR', `The request failed (HTTP ${response.status}).`, response.status)
}

// ---- capabilities

const Capabilities = z.object({ canCreate: z.boolean(), canUpdate: z.boolean(), canMaintain: z.boolean() })
export type ContactCapabilities = z.infer<typeof Capabilities>

let capabilitiesPromise: Promise<ContactCapabilities> | null = null

/** What the signed-in person may do: Add contact, the pencil, the Danger Zone. Asked once per page load. */
export function fetchContactCapabilities(): Promise<ContactCapabilities> {
  capabilitiesPromise ??= call('/v1/contact-capabilities', Capabilities).catch((error: unknown) => {
    capabilitiesPromise = null
    throw error
  })
  return capabilitiesPromise
}

// ---- contacts

/** One contact with the full SSN and date of birth (for the editor). Not cached anywhere. */
export async function fetchContactDetail(contactId: string): Promise<KRContactRecord> {
  const data = await call(`/v1/contacts/${encodeURIComponent(contactId)}`, ContactDetailData)
  const row = data.contacts[0]
  if (!row) throw new ContactApiError('CONTACT_NOT_FOUND', 'No such contact.', 404)
  return { ...contactFromApiRow(row as unknown as Record<string, unknown>, 0), detailsLoaded: true }
}

export function createContact(body: ContactCreateBody) {
  return call('/v1/contacts', ContactCreateData, { method: 'POST', body })
}

/** Saves the edit card. The reply carries the contact as saved (with SSN and date of birth). */
export async function updateContact(contactId: string, body: ContactUpdateBody) {
  const data = await call(`/v1/contacts/${encodeURIComponent(contactId)}`, ContactUpdateData, { method: 'PATCH', body })
  return { ...data, contact: data.contact ? { ...contactFromApiRow(data.contact as unknown as Record<string, unknown>, 0), detailsLoaded: true } : null }
}

// ---- client accounts

export function lookupClientNumber(clientNumber: string) {
  return call(`/v1/clients?${new URLSearchParams({ clientNumber }).toString()}`, ClientLookupData)
}

export function suggestClientNumber() {
  return call('/v1/clients/next-number', NextClientNumberData)
}

export function setClientStatus(body: ClientStatusBody) {
  return call('/v1/clients/status', ClientStatusData, { method: 'PATCH', body })
}

// ---- contact maintenance (super admin)

export function resolutionPreflight(body: ContactResolutionBody) {
  return call('/v1/contact-maintenance/resolution-preflight', ContactResolutionPreflightData, { method: 'POST', body })
}

export function resolveDuplicate(operation: 'merge' | 'copy_and_inactivate', body: ContactResolutionBody) {
  return call(`/v1/contact-maintenance/${operation === 'merge' ? 'merge' : 'copy-and-inactivate'}`, ContactResolutionData, { method: 'POST', body })
}

export function removalPreflight(body: ContactRemovalBody) {
  return call('/v1/contact-maintenance/removal-preflight', ContactRemovalPreflightData, { method: 'POST', body })
}

export function removeContact(operation: 'delete' | 'inactivate', body: ContactRemovalBody) {
  return call(`/v1/contact-maintenance/${operation}`, ContactRemovalData, { method: 'POST', body })
}
