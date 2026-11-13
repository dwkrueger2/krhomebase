'use client'
// file: apps/web/features/data-import/api.client.ts
/**
 * The Data Import page's calls to the API from the browser (Settings plan, stage 8; super admin only):
 *
 *   GET  /api/v1/maintenance-gate   whether application writes are locked
 *   PUT  /api/v1/maintenance-gate   lock (`{ locked: true }`) or unlock (`{ locked: false }`) writes
 *   POST /api/v1/contacts           create one imported person or entity with its email and phone
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract; a failure throws
 * `DataImportApiError` with a plain sentence for the screen.
 *
 * Changed from the old panel: the gate is `PUT { locked }` instead of `POST { operation }`, and contacts go to the one
 * contact create route (no `?mode=contact-import`). Leads are not sent (there is no leads API yet).
 */

import { ContactCreateData, ErrorEnvelope, MaintenanceGateData, successEnvelope, type ContactCreateBody } from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed Data Import call. */
export class DataImportApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'DataImportApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  MAINTENANCE_GATE_UNAVAILABLE: 'The maintenance gate cannot be read or changed right now. Try again in a moment.',
  MAINTENANCE_LOCKED: 'Application writes are locked. Unlock the maintenance gate before importing contacts.',
  CONTACTS_UNAVAILABLE: 'Contacts cannot be saved right now. Try again in a moment.',
  VALIDATION_MISSING_FIRST_NAME: 'First name is required.',
  VALIDATION_MISSING_LAST_NAME: 'Last name is required.',
  VALIDATION_MISSING_LEGAL_NAME: 'Legal name is required.',
  VALIDATION_FAILED: 'A value is too long or not allowed for a contact.',
  PERMISSION_REQUIRED: 'Your role sets do not allow creating contacts.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may use Data Import.',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[DATA_IMPORT_API:56] network failure method=${method} path=${path} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new DataImportApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[DATA_IMPORT_API:65] refused method=${method} path=${path} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new DataImportApiError(code, ERROR_SENTENCES[code] ?? `The request failed (${code}).`, response.status, requestId)
}

/** Reads the maintenance gate. */
export const fetchMaintenanceGate = (): Promise<MaintenanceGateData> => send(MaintenanceGateData, 'GET', '/api/v1/maintenance-gate')

/** Locks (`true`) or unlocks (`false`) application writes; returns the gate as saved. */
export const saveMaintenanceGate = (locked: boolean): Promise<MaintenanceGateData> => send(MaintenanceGateData, 'PUT', '/api/v1/maintenance-gate', { locked })

/** Creates one imported contact (identity row plus primary email and phone, one batch on the API). */
export const createImportedContact = (body: ContactCreateBody): Promise<ContactCreateData> => send(ContactCreateData, 'POST', '/api/v1/contacts', body)
