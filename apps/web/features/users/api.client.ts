'use client'
// file: apps/web/features/users/api.client.ts
/**
 * The users area's calls to the API from the browser (Settings plan, stage 4d; super admin only):
 *
 *   GET    /api/v1/users                              users, invitations not accepted, role sets
 *   POST   /api/v1/users                              create a user (invited or active at once)
 *   PUT    /api/v1/users/{userId}                     status, staff code and role sets in one save
 *   POST   /api/v1/users/{userId}/employee            enroll as an employee
 *   POST   /api/v1/user-invites/{inviteId}/resend     send a new invitation in place of this one
 *   POST   /api/v1/user-invites/{inviteId}/cancel     cancel a pending invitation
 *   DELETE /api/v1/user-invites/{inviteId}            delete an invitation that is no longer pending
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract; a failure throws
 * `UsersApiError` with a plain sentence for the screen (the old screen's sentences where it had them).
 */

import { ErrorEnvelope, successEnvelope, UserSavedData, UsersData, type CreateUserBody, type UpdateUserBody } from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed users call. */
export class UsersApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'UsersApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  USERS_UNAVAILABLE: 'Users cannot be read or saved right now. Try again in a moment.',
  PENDING_INVITE_ALREADY_EXISTS: 'Invitation is still pending for this email address.',
  USER_EMAIL_ALREADY_EXISTS: 'A user with this email already exists.',
  USER_SSO_EMAIL_ALREADY_EXISTS: 'A Google sign-in already uses this email.',
  USER_ROLE_SET_REQUIRED: 'Choose a role set to activate the account now.',
  ROLE_SET_NOT_ASSIGNABLE: 'A chosen role set cannot be given to anyone. Reload the page.',
  USER_NOT_FOUND: 'That user no longer exists. Reload the page.',
  SUPER_ADMIN_OR_SELF_STATUS_CHANGE_BLOCKED: "Your own status and a Super Admin's status cannot be changed here.",
  SELF_SUPER_ADMIN_DEMOTION_BLOCKED: 'You cannot take the Super Admin role set from yourself.',
  PRIMARY_ROLE_SET_INVALID: 'The primary role set must be one of the ticked role sets.',
  STAFF_CODE_REQUIRED: 'Staff Code is required for Staff users.',
  USER_NOT_EMPLOYEE: 'Only an employee has a staff code. Enroll the user as an employee first.',
  STAFF_CODE_IN_USE: 'Another employee already has that staff code.',
  USER_ALREADY_EMPLOYEE: 'This user is already an employee.',
  INVITE_NOT_FOUND: 'That invitation no longer exists. Reload the page.',
  INVITE_ALREADY_ACCEPTED: 'That invitation was already accepted.',
  INVITE_NOT_PENDING: 'Only a pending invitation can be cancelled.',
  INVITE_STILL_PENDING: 'Cancel the invitation before deleting it.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may manage users.',
  VALIDATION_FAILED: 'Check the fields: first and last name, a valid email, and 1 to 30 days.',
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
    L(`[USERS_API:64] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new UsersApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[USERS_API:73] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new UsersApiError(code, ERROR_SENTENCES[code] ?? 'The change was not saved.', response.status, requestId)
}

export const fetchUsers = (): Promise<UsersData> => send(UsersData, 'GET', '/api/v1/users')
export const createUser = (body: CreateUserBody): Promise<UserSavedData> => send(UserSavedData, 'POST', '/api/v1/users', body)
export const updateUser = (userId: string, body: UpdateUserBody): Promise<UserSavedData> => send(UserSavedData, 'PUT', `/api/v1/users/${encodeURIComponent(userId)}`, body)
export const enrollEmployee = (userId: string): Promise<UserSavedData> => send(UserSavedData, 'POST', `/api/v1/users/${encodeURIComponent(userId)}/employee`)
export const resendInvite = (inviteId: string, expirationDays: number): Promise<UserSavedData> =>
  send(UserSavedData, 'POST', `/api/v1/user-invites/${encodeURIComponent(inviteId)}/resend`, { expirationDays })
export const cancelInvite = (inviteId: string): Promise<UserSavedData> => send(UserSavedData, 'POST', `/api/v1/user-invites/${encodeURIComponent(inviteId)}/cancel`)
export const deleteInvite = (inviteId: string): Promise<UserSavedData> => send(UserSavedData, 'DELETE', `/api/v1/user-invites/${encodeURIComponent(inviteId)}`)
