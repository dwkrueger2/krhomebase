'use client'
// file: apps/web/features/role-sets/api.client.ts
/**
 * The role-sets area's calls to the API from the browser (Settings plan, stage 4c; super admin only):
 *
 *   GET    /api/v1/role-sets                the active role sets with their grants and holder counts
 *   POST   /api/v1/role-sets                create a custom role set
 *   PUT    /api/v1/role-sets/{roleSetId}    change a custom role set; the grant lists replace the current ones
 *   DELETE /api/v1/role-sets/{roleSetId}    retire a custom role set and end its assignments
 *   GET    /api/v1/users                    the users, for the people who hold the chosen role set
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract; a failure throws
 * `RoleSetsApiError` with a plain sentence for the screen.
 */

import { ErrorEnvelope, RoleSetSavedData, RoleSetsData, successEnvelope, UsersData, type RoleSetBody, type UserAccount } from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed role sets call. */
export class RoleSetsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'RoleSetsApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  ROLE_SETS_UNAVAILABLE: 'Role sets cannot be read or saved right now. Try again in a moment.',
  ROLE_SET_NOT_FOUND: 'That role set no longer exists or is not active. Reload the page.',
  ROLE_SET_BUILT_IN: 'Built-in role sets cannot be changed.',
  ROLE_SET_NAME_IN_USE: 'Role Set Name in use.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may change role sets.',
  VALIDATION_FAILED: 'The name must hold 1 to 120 characters and the description up to 1,000.',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[ROLE_SETS_API:52] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new RoleSetsApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[ROLE_SETS_API:61] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new RoleSetsApiError(code, ERROR_SENTENCES[code] ?? 'The role set was not saved.', response.status, requestId)
}

/** Reads the active role sets. */
export function fetchRoleSets(): Promise<RoleSetsData> {
  return send(RoleSetsData, 'GET', '/api/v1/role-sets')
}

/**
 * Reads the users, for the list of people who hold the chosen role set (`GET /api/v1/users`, the same super admin
 * read as Users; each account carries its `roleSetIds`). Only the accounts are returned.
 */
export async function fetchRoleSetHolders(): Promise<UserAccount[]> {
  return (await send(UsersData, 'GET', '/api/v1/users')).users
}

/** Creates a custom role set (`roleSetId` null) or changes one. */
export function saveRoleSet(roleSetId: string | null, body: RoleSetBody): Promise<RoleSetSavedData> {
  return roleSetId
    ? send(RoleSetSavedData, 'PUT', `/api/v1/role-sets/${encodeURIComponent(roleSetId)}`, body)
    : send(RoleSetSavedData, 'POST', '/api/v1/role-sets', body)
}

/** Retires a custom role set and ends everyone's assignment to it. */
export function retireRoleSet(roleSetId: string): Promise<RoleSetSavedData> {
  return send(RoleSetSavedData, 'DELETE', `/api/v1/role-sets/${encodeURIComponent(roleSetId)}`)
}
