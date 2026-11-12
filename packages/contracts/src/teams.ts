// file: packages/contracts/src/teams.ts
/**
 * Teams and Scope (Settings and Dashboard plan, stage 4b). A team has employee members (`team_member`) and user leads
 * (`team_lead`). A team-scoped permission applies only when the signed-in user leads the employee's active team; the
 * Attendance team view reads the same rows.
 *
 *   GET  /v1/teams             the active teams, the employees who may be members and the users who may lead (super admin)
 *   POST /v1/teams             create a team with its members and leads (super admin)
 *   PUT  /v1/teams/{teamId}    change a team's name, description, members and leads (super admin)
 *
 * Old route: `GET`/`POST /krhomebase/api/admin/teams` (one POST for create and change, chosen by `teamId`).
 */

import { z } from 'zod'

const ids = (what: string) =>
  z
    .array(z.string().trim().min(1).max(200))
    .max(500)
    .describe(`The ${what}; repeats are ignored. The whole list is sent: anyone left out is taken off the team.`)

export const Team = z.object({
  id: z.string().describe('Team id (`team_<uuid>` for teams made here or by the old app).'),
  name: z.string().describe('Team name, unique across every team row.'),
  description: z.string().nullable().describe('Optional description.'),
  memberEmployeeIds: z.array(z.string()).describe('Employee ids of the active members.'),
  leadUserIds: z.array(z.string()).describe('User ids of the active leads.'),
})
export type Team = z.infer<typeof Team>

export const TeamEmployeeOption = z.object({
  id: z.string().describe('Employee id.'),
  userId: z.string().describe("The employee's user id."),
  name: z.string().describe("Display name: the preferred name, else first and last name, else the user's email, else the employee number."),
  employeeNumber: z.string().nullable().describe('Employee number, when set.'),
  jobTitle: z.string().nullable().describe('Job title, when set.'),
  employmentStatus: z.string().nullable().describe('Employment status as stored, when set.'),
})
export type TeamEmployeeOption = z.infer<typeof TeamEmployeeOption>

export const TeamUserOption = z.object({
  id: z.string().describe('User id.'),
  name: z.string().describe('Display name: the preferred name, else first and last name, else the email.'),
  email: z.string().describe('Sign-in email.'),
})
export type TeamUserOption = z.infer<typeof TeamUserOption>

export const TeamsData = z.object({
  teams: z.array(Team).describe('Active teams, by name.'),
  employees: z.array(TeamEmployeeOption).describe('Every employee row, by name: who may be a member.'),
  users: z.array(TeamUserOption).describe('Every active user, by name: who may be a lead.'),
})
export type TeamsData = z.infer<typeof TeamsData>

export const TeamBody = z.object({
  name: z.string().trim().min(1).max(120).describe('Team name, 1 to 120 characters (the old limit).'),
  description: z.string().trim().max(1000).nullable().describe('Optional description, up to 1,000 characters; empty means none.'),
  memberEmployeeIds: ids('employee ids of the members'),
  leadUserIds: ids('user ids of the leads'),
})
export type TeamBody = z.infer<typeof TeamBody>

export const TeamParams = z.object({
  teamId: z.string().min(1).max(200).describe('Team id.'),
})
export type TeamParams = z.infer<typeof TeamParams>

export const TeamSavedData = z.object({
  teamId: z.string().describe('The id of the team just saved.'),
  teams: TeamsData.describe('Every team, employee and user after the change, so the screen redraws from one reply.'),
})
export type TeamSavedData = z.infer<typeof TeamSavedData>
