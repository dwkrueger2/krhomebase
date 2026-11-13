'use client'
// file: apps/web/features/firm/api.client.ts
/**
 * The firm area's calls to the API from the browser (Settings plan, stage 5):
 *
 *   GET /api/v1/firm/profile             the firm profile (anyone signed in)
 *   PUT /api/v1/firm/profile             save it (super admin)
 *   GET /api/v1/firm/employee-policies   the employee policies (anyone signed in)
 *   PUT /api/v1/firm/employee-policies   save them (super admin)
 *
 * This site forwards them to the API Worker. Both are `lookup` settings rows written only by the API (see the lookup
 * table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table").
 * Replies are checked against the shared contract; a failure throws `FirmApiError`, whose message is the API's
 * sentences for a refused save.
 */

import { EmployeePoliciesData, ErrorEnvelope, FirmProfileData, successEnvelope, type EmployeePolicies, type FirmProfile } from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed firm call. */
export class FirmApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'FirmApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  FIRM_UNAVAILABLE: 'Firm Settings cannot be read or saved right now. Try again in a moment.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only Super Admin can change Firm Settings.',
  VALIDATION_FAILED: 'Some values are not valid. Check the highlighted fields.',
}

async function send<T extends z.ZodTypeAny>(path: string, schema: T, method: 'GET' | 'PUT', body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(`/api/v1/firm/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[FIRM_API:48] network failure path=${path} method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new FirmApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  const problems = refusal.success ? (refusal.data.error.details as { problems?: unknown } | null | undefined)?.problems : undefined
  L(`[FIRM_API:58] refused path=${path} method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  const message = Array.isArray(problems) && problems.length ? problems.join(' ') : (ERROR_SENTENCES[code] ?? 'Firm Settings were not saved.')
  throw new FirmApiError(code, message, response.status, requestId)
}

/** Reads the firm profile (the built-in one until a profile is saved). */
export function fetchFirmProfile(): Promise<FirmProfileData> {
  return send('profile', FirmProfileData, 'GET')
}

/** Saves the firm profile (super admin). */
export function saveFirmProfile(profile: FirmProfile): Promise<FirmProfileData> {
  return send('profile', FirmProfileData, 'PUT', profile)
}

/** Reads the employee policies. */
export function fetchEmployeePolicies(): Promise<EmployeePoliciesData> {
  return send('employee-policies', EmployeePoliciesData, 'GET')
}

/** Saves the employee policies (super admin). */
export function saveEmployeePolicies(policies: EmployeePolicies): Promise<EmployeePoliciesData> {
  return send('employee-policies', EmployeePoliciesData, 'PUT', policies)
}
