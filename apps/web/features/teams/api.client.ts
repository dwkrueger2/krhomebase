'use client'
// file: apps/web/features/teams/api.client.ts
/**
 * The teams area's calls to the API from the browser (Settings plan, stage 4b; super admin only):
 *
 *   GET  /api/v1/teams             the active teams, every employee and every active user
 *   POST /api/v1/teams             create a team with its members and leads
 *   PUT  /api/v1/teams/{teamId}    change a team; the lists replace the current ones
 *
 * This site forwards them to the API Worker. Replies are checked against the shared contract; a failure throws
 * `TeamsApiError` with a plain sentence for the screen.
 */

import { ErrorEnvelope, successEnvelope, TeamSavedData, TeamsData, type TeamBody } from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed teams call. */
export class TeamsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'TeamsApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  TEAMS_UNAVAILABLE: 'Teams cannot be read or saved right now. Try again in a moment.',
  TEAM_NOT_FOUND: 'That team no longer exists or is not active. Reload the page.',
  TEAM_NAME_IN_USE: 'Another team, active or retired, already has that name.',
  TEAM_EMPLOYEE_NOT_FOUND: 'A chosen member is no longer an employee. Reload the page.',
  TEAM_LEAD_NOT_FOUND: 'A chosen lead is no longer an active user. Reload the page.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may change teams.',
  VALIDATION_FAILED: 'The team name must hold 1 to 120 characters and the description up to 1,000.',
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
    L(`[TEAMS_API:50] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new TeamsApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[TEAMS_API:59] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new TeamsApiError(code, ERROR_SENTENCES[code] ?? 'The team was not saved.', response.status, requestId)
}

/** Reads the teams, the employees who may be members and the users who may lead. */
export function fetchTeams(): Promise<TeamsData> {
  return send(TeamsData, 'GET', '/api/v1/teams')
}

/** Creates a team (`teamId` null) or changes one. */
export function saveTeam(teamId: string | null, body: TeamBody): Promise<TeamSavedData> {
  return teamId ? send(TeamSavedData, 'PUT', `/api/v1/teams/${encodeURIComponent(teamId)}`, body) : send(TeamSavedData, 'POST', '/api/v1/teams', body)
}
