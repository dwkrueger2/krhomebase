'use client'
// file: apps/web/features/matters/api.client.ts
/**
 * The matters area's calls to the API from the browser (plan 10, stage 1):
 *
 *   GET    /api/v1/clients/{clientId}/matters       the client's matters, choices and the viewer's rights
 *   POST   /api/v1/clients/{clientId}/matters       create the next numbered matter
 *   PATCH  /api/v1/matters/{matterId}               change a matter (and add Initial Notes)
 *   GET    /api/v1/matters/{matterId}/delete-check  what blocks deleting it
 *   DELETE /api/v1/matters/{matterId}               delete it (super admin, typed confirmation)
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract; a failure throws
 * `MattersApiError` with a plain sentence for the screen (the old screen showed the raw code).
 */

import {
  ClientMattersData,
  ErrorEnvelope,
  MatterDeleteCheckData,
  MatterDeletedData,
  MatterSavedData,
  successEnvelope,
  type MatterCreateBody,
  type MatterUpdateBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed matters call. `details` carries the API's details (for example the blocking items). */
export class MattersApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'MattersApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  MATTERS_UNAVAILABLE: 'Matters cannot be read or saved right now. Try again in a moment.',
  MATTER_NOT_FOUND: 'That matter no longer exists. Reload the client.',
  MATTER_CLIENT_NOT_FOUND: 'This contact has no client account, so it has no matters.',
  MATTER_CLIENT_NUMBER_INVALID: 'The client number is not a plain number, so a matter number cannot be assigned. Fix the client number first.',
  MATTER_CHOICE_INVALID: 'The chosen status is no longer offered. Reload the client.',
  MATTER_NUMBER_IN_USE: 'Another matter was created for this client at the same moment. Save again.',
  MATTER_GENERAL_PROTECTED: 'The Client General Matters (.0) is never deleted.',
  MATTER_HAS_RECORDS: 'This matter has records attached, so it cannot be deleted.',
  MATTER_DELETE_CONFIRMATION_MISMATCH: 'The confirmation text does not match.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'You may not do this.',
  VALIDATION_FAILED: 'Matter Title is required (up to 200 characters); dates are YYYY-MM-DD.',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[MATTERS_API:64] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new MattersApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[MATTERS_API:73] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new MattersApiError(code, ERROR_SENTENCES[code] ?? 'The matter was not saved.', response.status, requestId, refusal.success ? refusal.data.error.details : undefined)
}

const clientPath = (clientId: string) => `/api/v1/clients/${encodeURIComponent(clientId)}/matters`
const matterPath = (matterId: string) => `/api/v1/matters/${encodeURIComponent(matterId)}`

/** Reads a client's matters, the status and practice-area choices, and what the viewer may do. */
export function fetchClientMatters(clientId: string): Promise<ClientMattersData> {
  return send(ClientMattersData, 'GET', clientPath(clientId))
}

/** Creates the client's next numbered matter. */
export function createMatter(clientId: string, body: MatterCreateBody): Promise<MatterSavedData> {
  return send(MatterSavedData, 'POST', clientPath(clientId), body)
}

/** Changes a matter. */
export function updateMatter(matterId: string, body: MatterUpdateBody): Promise<MatterSavedData> {
  return send(MatterSavedData, 'PATCH', matterPath(matterId), body)
}

/** Reads whether a matter may be deleted and what blocks it. */
export function fetchMatterDeleteCheck(matterId: string): Promise<MatterDeleteCheckData> {
  return send(MatterDeleteCheckData, 'GET', `${matterPath(matterId)}/delete-check`)
}

/** Deletes a matter with no records; `confirmation` is `Delete Matter <number>`. */
export function deleteMatter(matterId: string, confirmation: string): Promise<MatterDeletedData> {
  return send(MatterDeletedData, 'DELETE', matterPath(matterId), { confirmation })
}
