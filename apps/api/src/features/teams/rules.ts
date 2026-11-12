// file: apps/api/src/features/teams/rules.ts
/**
 * Teams and Scope (Settings plan, stage 4b). Ported from the old `GET`/`POST /krhomebase/api/admin/teams`:
 *
 * - The list shows the active teams with their active members (employees) and leads (users), every employee, and
 *   every active user, each with a display name (preferred name, else first and last name, else the email).
 * - A save sends the whole team: its name, description and the complete lists of members and leads. Anyone left out
 *   is taken off (the row is kept with `is_active = 0` and `ends_at`); anyone added who was on the team before gets
 *   that row back; anyone new gets a new row (`tm_<uuid>` or `tl_<uuid>`). New teams are `team_<uuid>`.
 *
 * Changed from the old route:
 * - The name is checked against every team row, active or not, because the database's UNIQUE rule covers them all
 *   (the old route checked active teams only, so a retired team's name failed as a server error).
 * - Changing a team needs an active team (404 otherwise), so a retired team is not brought back by accident.
 * - The whole save is one batch with one audit row (resource `teams`).
 */

import type { TeamBody, TeamsData, TeamSavedData } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { TeamChange, TeamPlaceRow, TeamQueries } from './queries.ts'

/** A refused team change. */
export class TeamError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404 | 409 | 422,
  ) {
    super(message)
    this.name = 'TeamError'
  }
}

/** The super admin making a change, from the session. */
export interface TeamActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

function personName(row: { preferred_name: string | null; first_name: string | null; last_name: string | null }): string {
  const preferred = row.preferred_name?.trim()
  if (preferred) return preferred
  return [row.first_name, row.last_name].map((part) => part?.trim()).filter(Boolean).join(' ')
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/** The Teams and Scope screen's data. */
export async function loadTeams(queries: TeamQueries): Promise<TeamsData> {
  const [teams, members, leads, employees, users] = await Promise.all([queries.teamRows(), queries.memberRows(), queries.leadRows(), queries.employeeRows(), queries.userRows()])
  const activeIds = (rows: TeamPlaceRow[], teamId: string) => rows.filter((row) => row.team_id === teamId && row.is_active === 1).map((row) => row.person_id)
  return {
    teams: teams
      .filter((team) => team.is_active === 1)
      .map((team) => ({ id: team.id, name: team.name, description: team.description, memberEmployeeIds: activeIds(members, team.id), leadUserIds: activeIds(leads, team.id) }))
      .sort(byName),
    employees: employees
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: personName(row) || row.email || row.employee_number || row.id,
        employeeNumber: row.employee_number,
        jobTitle: row.job_title,
        employmentStatus: row.employment_status,
      }))
      .sort(byName),
    users: users.map((row) => ({ id: row.id, name: personName(row) || row.email, email: row.email })).sort(byName),
  }
}

/** Off, back on and new rows for one list (members or leads). */
function placeChanges(current: TeamPlaceRow[], wanted: string[], prefix: 'tm' | 'tl', newId: () => string) {
  const off = current.filter((row) => row.is_active === 1 && !wanted.includes(row.person_id)).map((row) => row.id)
  const on: string[] = []
  const added: Array<{ rowId: string; personId: string }> = []
  for (const personId of wanted) {
    const rows = current.filter((row) => row.person_id === personId)
    if (rows.some((row) => row.is_active === 1)) continue
    // The person was on the team before: switch the latest earlier row back on, as the old route did.
    const earlier = rows.sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))[0]
    if (earlier) on.push(earlier.id)
    else added.push({ rowId: `${prefix}_${newId()}`, personId })
  }
  return { off, on, added }
}

/**
 * Creates a team (`teamId` null) or changes one, with its complete member and lead lists (super admin). The members
 * must be employees and the leads active users.
 */
export async function saveTeam(
  queries: TeamQueries,
  actor: TeamActor,
  teamId: string | null,
  body: TeamBody,
  now: string,
  newId: () => string = () => crypto.randomUUID(),
): Promise<TeamSavedData> {
  const name = body.name.trim()
  const description = body.description?.trim() || null
  const memberIds = Array.from(new Set(body.memberEmployeeIds.map((id) => id.trim())))
  const leadIds = Array.from(new Set(body.leadUserIds.map((id) => id.trim())))

  const [teams, members, leads, employees, users] = await Promise.all([queries.teamRows(), queries.memberRows(), queries.leadRows(), queries.employeeRows(), queries.userRows()])
  const existing = teamId ? teams.find((team) => team.id === teamId && team.is_active === 1) : undefined
  if (teamId && !existing) throw new TeamError('TEAM_NOT_FOUND', 'That team does not exist or is not active.', 404)
  const clash = teams.find((team) => team.id !== teamId && team.name.trim().toLowerCase() === name.toLowerCase())
  if (clash) {
    throw new TeamError('TEAM_NAME_IN_USE', clash.is_active === 1 ? 'Another team already has that name.' : 'A retired team already has that name.', 409)
  }
  const employeeIds = new Set(employees.map((row) => row.id))
  if (memberIds.some((id) => !employeeIds.has(id))) throw new TeamError('TEAM_EMPLOYEE_NOT_FOUND', 'A chosen member is not an employee.', 422)
  const userIds = new Set(users.map((row) => row.id))
  if (leadIds.some((id) => !userIds.has(id))) throw new TeamError('TEAM_LEAD_NOT_FOUND', 'A chosen lead is not an active user.', 422)

  const id = existing?.id ?? `team_${newId()}`
  const memberChange = placeChanges(members.filter((row) => row.team_id === id), memberIds, 'tm', newId)
  const leadChange = placeChanges(leads.filter((row) => row.team_id === id), leadIds, 'tl', newId)
  const change: TeamChange = {
    team: { id, name, description, isNew: !existing },
    memberRowsOff: memberChange.off,
    leadRowsOff: leadChange.off,
    memberRowsOn: memberChange.on,
    leadRowsOn: leadChange.on,
    newMembers: memberChange.added.map((row) => ({ rowId: row.rowId, employeeId: row.personId })),
    newLeads: leadChange.added.map((row) => ({ rowId: row.rowId, userId: row.personId })),
    actorUserId: actor.userId,
    now,
  }
  const audit: AuditEntry = {
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    resource: 'teams',
    action: existing ? 'UPDATE' : 'CREATE',
    targetTable: 'team',
    targetId: id,
    newJson: { name, memberEmployeeIds: memberIds, leadUserIds: leadIds },
  }
  await queries.saveTeam(change, audit)
  return { teamId: id, teams: await loadTeams(queries) }
}
