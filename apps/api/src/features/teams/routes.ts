// file: apps/api/src/features/teams/routes.ts
/**
 * Teams and Scope routes (Settings plan, stage 4b). Replace the old `GET`/`POST /krhomebase/api/admin/teams` (super
 * admin only, as before). The old single POST created or changed a team by `teamId`; here creating and changing are
 * separate routes.
 *
 *   GET  /v1/teams             the active teams, every employee and every active user
 *   POST /v1/teams             create a team with its members and leads
 *   PUT  /v1/teams/{teamId}    change a team's name, description, members and leads
 *
 * Rules: `rules.ts`. Writes pass the write gate and are audited (resource `teams`). Outside tools: closed.
 */

import { ErrorEnvelope, successEnvelope, TeamBody, TeamParams, TeamSavedData, TeamsData } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { TeamsUnavailableError, teamQueriesFor, type TeamQueries } from './queries.ts'
import { loadTeams, saveTeam, TeamError, type TeamActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const WRITES = ['Writes team, team_member and team_lead', 'Writes audit_log']
const savedReply = { description: 'The team id and every team after the change.', content: json(successEnvelope(TeamSavedData)) }
const conflict409 = { description: 'Another team, active or retired, has that name (TEAM_NAME_IN_USE).', content: json(ErrorEnvelope) }
const invalid422 = { description: 'A member is not an employee (TEAM_EMPLOYEE_NOT_FOUND) or a lead is not an active user (TEAM_LEAD_NOT_FOUND).', content: json(ErrorEnvelope) }
const unavailable503 = { description: 'Teams cannot be read or saved right now (TEAMS_UNAVAILABLE).', content: json(ErrorEnvelope) }

export const teamsRoute = defineRoute({
  method: 'get',
  path: '/v1/teams',
  feature: 'teams',
  summary: 'The active teams with their members and leads, every employee who may be a member and every active user who may lead.',
  access: SUPER_ADMIN,
  errors: ['TEAMS_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The teams.', content: json(successEnvelope(TeamsData)) }, 503: unavailable503 },
})

export const createTeamRoute = defineRoute({
  method: 'post',
  path: '/v1/teams',
  feature: 'teams',
  summary: 'Creates a team with its name, description, members (employees) and leads (users).',
  access: SUPER_ADMIN,
  errors: ['TEAM_NAME_IN_USE', 'TEAM_EMPLOYEE_NOT_FOUND', 'TEAM_LEAD_NOT_FOUND', 'TEAMS_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { body: { content: json(TeamBody), required: true } },
  responses: { 200: savedReply, 409: conflict409, 422: invalid422, 503: unavailable503 },
})

export const updateTeamRoute = defineRoute({
  method: 'put',
  path: '/v1/teams/{teamId}',
  feature: 'teams',
  summary: 'Changes a team; the member and lead lists replace the current ones (people left out are taken off, rows kept).',
  access: SUPER_ADMIN,
  errors: ['TEAM_NOT_FOUND', 'TEAM_NAME_IN_USE', 'TEAM_EMPLOYEE_NOT_FOUND', 'TEAM_LEAD_NOT_FOUND', 'TEAMS_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: TeamParams, body: { content: json(TeamBody), required: true } },
  responses: {
    200: savedReply,
    404: { description: 'No active team with that id (TEAM_NOT_FOUND).', content: json(ErrorEnvelope) },
    409: conflict409,
    422: invalid422,
    503: unavailable503,
  },
})

/** Maps a team refusal or a missing table to its reply; anything else is thrown on. */
function teamFailure(c: Context<AppEnv>, error: unknown) {
  if (error instanceof TeamError) return failure(c, error.status, error.code, error.message)
  if (error instanceof TeamsUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'TEAMS', message: error.message }))
    return failure(c, 503, 'TEAMS_UNAVAILABLE', 'Teams are not available right now.')
  }
  throw error
}

/**
 * Registers one team write. Typed loosely on purpose, as Billing's and Themes': every write route shares the shape.
 */
function handleWrite(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, teamIdOf: (c: Context<AppEnv>) => string | null) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries: TeamQueries | null = teamQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'TEAMS_UNAVAILABLE', 'Teams are not available right now.')
    try {
      const actor: TeamActor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') }
      const body = (c.req as any).valid('json') as TeamBody
      const data = await saveTeam(queries, actor, teamIdOf(c), body, new Date().toISOString())
      const team = data.teams.teams.find((row) => row.id === data.teamId)
      logLine(`TEAMS:${tag}`, c.get('requestId'), { teamId: data.teamId, members: team?.memberEmployeeIds.length ?? 0, leads: team?.leadUserIds.length ?? 0 })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return teamFailure(c, error)
    }
  }) as any)
}

export function registerTeams(app: OpenAPIHono<AppEnv>) {
  app.openapi(teamsRoute, async (c) => {
    const queries = teamQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'TEAMS_UNAVAILABLE', 'Teams are not available right now.')
    try {
      const data = await loadTeams(queries)
      logLine('TEAMS:list', c.get('requestId'), { teams: data.teams.length, employees: data.employees.length, users: data.users.length })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return teamFailure(c, error) as any
    }
  })
  handleWrite(app, createTeamRoute, 'create', () => null)
  handleWrite(app, updateTeamRoute, 'update', (c) => ((c.req as any).valid('param') as TeamParams).teamId)
}
