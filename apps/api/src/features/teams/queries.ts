// file: apps/api/src/features/teams/queries.ts
/**
 * The only file of the teams area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables (Schema 8.0):
 *
 * - `team`: `id`, `name` (UNIQUE over every row, active or not), `description`, `is_active`, `created_by_user_id`.
 * - `team_member`: one row per employee stint on a team (`employee_id`, `starts_at`, `ends_at`, `is_active`), UNIQUE
 *   on (`team_id`, `employee_id`, `starts_at`).
 * - `team_lead`: the same for users who lead the team (`user_id`).
 *
 * Reads: the active teams with their active members and leads, every employee (who may be a member) and every active
 * user (who may lead), with display names from `individual`. Only the columns the screen needs are read: the
 * `employee` row also holds pay and identity fields that never leave this file.
 *
 * Writes (`saveTeam`): the team row (inserted, or changed and marked active), members and leads taken off
 * (`is_active = 0`, `ends_at` set; rows are never deleted), earlier rows switched back on, and new rows, all in one
 * batch with the `audit_log` row, so a team is never left half saved. The old route made each change as its own
 * call. A missing table answers `TeamsUnavailableError`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class TeamsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`TEAMS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'TeamsUnavailableError'
  }
}

/** One `team` row. */
export interface TeamRow {
  id: string
  name: string
  description: string | null
  is_active: number
}

/** One `team_member` or `team_lead` row; `person_id` is the employee id or the user id. */
export interface TeamPlaceRow {
  id: string
  team_id: string
  person_id: string
  starts_at: string | null
  is_active: number
}

/** One employee, with the name pieces of its user. */
export interface TeamEmployeeRow {
  id: string
  user_id: string
  employee_number: string | null
  job_title: string | null
  employment_status: string | null
  email: string | null
  preferred_name: string | null
  first_name: string | null
  last_name: string | null
}

/** One active user, with the name pieces of its individual. */
export interface TeamUserRow {
  id: string
  email: string
  preferred_name: string | null
  first_name: string | null
  last_name: string | null
}

/** Everything one save changes; `rules.ts` works it out from the current rows. */
export interface TeamChange {
  team: { id: string; name: string; description: string | null; isNew: boolean }
  /** `team_member` / `team_lead` row ids to switch off. */
  memberRowsOff: string[]
  leadRowsOff: string[]
  /** Earlier rows to switch back on (their `starts_at` is kept, or set now when empty). */
  memberRowsOn: string[]
  leadRowsOn: string[]
  /** New rows: the employee ids and user ids, with the row id to use. */
  newMembers: Array<{ rowId: string; employeeId: string }>
  newLeads: Array<{ rowId: string; userId: string }>
  actorUserId: string | null
  now: string
}

export interface TeamQueries {
  /** Every `team` row (active or not), by name. */
  teamRows(): Promise<TeamRow[]>
  /** Every `team_member` row of the active teams (active or not). */
  memberRows(): Promise<TeamPlaceRow[]>
  /** Every `team_lead` row of the active teams (active or not). */
  leadRows(): Promise<TeamPlaceRow[]>
  /** Every employee, with its user's name. */
  employeeRows(): Promise<TeamEmployeeRow[]>
  /** Every active user, with its name. */
  userRows(): Promise<TeamUserRow[]>
  /** Writes one team save with its audit row. */
  saveTeam(change: TeamChange, audit: AuditEntry): Promise<void>
}

export function createTeamQueries(db: D1Database): TeamQueries {
  async function all<T>(sql: string): Promise<T[]> {
    try {
      const result = await db.prepare(sql).all<T>()
      return result.results ?? []
    } catch (error) {
      throw new TeamsUnavailableError(error)
    }
  }

  return {
    teamRows: () => all<TeamRow>('SELECT id, name, description, is_active FROM team ORDER BY name COLLATE NOCASE LIMIT 1000'),

    memberRows: () =>
      all<TeamPlaceRow>(
        `SELECT m.id, m.team_id, m.employee_id AS person_id, m.starts_at, m.is_active
           FROM team_member m JOIN team t ON t.id = m.team_id
          WHERE t.is_active = 1 LIMIT 10000`,
      ),

    leadRows: () =>
      all<TeamPlaceRow>(
        `SELECT l.id, l.team_id, l.user_id AS person_id, l.starts_at, l.is_active
           FROM team_lead l JOIN team t ON t.id = l.team_id
          WHERE t.is_active = 1 LIMIT 10000`,
      ),

    employeeRows: () =>
      all<TeamEmployeeRow>(
        `SELECT e.id, e.user_id, e.employee_number, e.job_title, e.employment_status,
                u.email, i.preferred_name, i.first_name, i.last_name
           FROM employee e
           LEFT JOIN user u ON u.id = e.user_id
           LEFT JOIN individual i ON i.id = u.individual_id
          LIMIT 2000`,
      ),

    userRows: () =>
      all<TeamUserRow>(
        `SELECT u.id, u.email, i.preferred_name, i.first_name, i.last_name
           FROM user u LEFT JOIN individual i ON i.id = u.individual_id
          WHERE u.is_active = 1 LIMIT 2000`,
      ),

    async saveTeam(change, audit) {
      const { team, now, actorUserId } = change
      const statements: D1PreparedStatement[] = [
        team.isNew
          ? db
              .prepare('INSERT INTO team (id, name, description, is_active, created_by_user_id, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?5)')
              .bind(team.id, team.name, team.description, actorUserId, now)
          : db.prepare('UPDATE team SET name = ?2, description = ?3, is_active = 1, updated_at = ?4 WHERE id = ?1').bind(team.id, team.name, team.description, now),
      ]
      for (const table of ['team_member', 'team_lead'] as const) {
        const off = table === 'team_member' ? change.memberRowsOff : change.leadRowsOff
        const on = table === 'team_member' ? change.memberRowsOn : change.leadRowsOn
        for (const rowId of off) {
          statements.push(db.prepare(`UPDATE ${table} SET is_active = 0, ends_at = ?2, updated_at = ?2 WHERE id = ?1`).bind(rowId, now))
        }
        for (const rowId of on) {
          statements.push(db.prepare(`UPDATE ${table} SET is_active = 1, starts_at = COALESCE(starts_at, ?2), ends_at = NULL, updated_at = ?2 WHERE id = ?1`).bind(rowId, now))
        }
      }
      for (const row of change.newMembers) {
        statements.push(
          db
            .prepare('INSERT INTO team_member (id, team_id, employee_id, starts_at, ends_at, is_active, created_by_user_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, 1, ?5, ?4, ?4)')
            .bind(row.rowId, team.id, row.employeeId, now, actorUserId),
        )
      }
      for (const row of change.newLeads) {
        statements.push(
          db
            .prepare('INSERT INTO team_lead (id, team_id, user_id, starts_at, ends_at, is_active, created_by_user_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, 1, ?5, ?4, ?4)')
            .bind(row.rowId, team.id, row.userId, now, actorUserId),
        )
      }
      statements.push(auditStatement(db, audit))
      try {
        await db.batch(statements)
      } catch (error) {
        throw new TeamsUnavailableError(error)
      }
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function teamQueriesFor(env: { krhomebase?: D1Database } | undefined): TeamQueries | null {
  return env?.krhomebase ? createTeamQueries(env.krhomebase) : null
}
