// file: packages/contracts/src/teamStatus.ts
/**
 * Dashboard Team Status: an authorized viewer's selected employees, their official clock state, and an optional
 * short note and location tied to the current clock-in shift.
 */

import { z } from 'zod'

/** The employee ids selected for this refresh. The API filters them through the viewer's Attendance access. */
export const TeamStatusQuery = z.object({
  employeeIds: z.array(z.string().trim().min(1).max(120)).max(50).default([]).describe('Selected employee ids to include, subject to the viewer\'s Attendance scope.'),
})
export type TeamStatusQuery = z.infer<typeof TeamStatusQuery>

/** One authorized employee in the Team Status widget. */
export const TeamStatusRow = z.object({
  employeeId: z.string().describe('Employee id.'),
  name: z.string().describe('Employee name, or login email when no name is recorded.'),
  isClockedIn: z.boolean().describe('Whether the official timekeeping system has an open clock-in for this employee.'),
  needsClockReview: z.boolean().describe('Whether an open clock-in is old enough to need an Attendance repair.'),
  clockedInAt: z.string().nullable().describe('The current shift clock-in instant, or null when clocked out.'),
  statusNote: z.string().nullable().describe('Short status note for the current shift, cleared at clock-out.'),
  location: z.string().nullable().describe('Optional location for the current shift, cleared at clock-out.'),
  canUpdate: z.boolean().describe('Whether this viewer may update the current shift status.'),
})
export type TeamStatusRow = z.infer<typeof TeamStatusRow>

/** The Team Status widget rows. */
export const TeamStatusData = z.object({
  rows: z.array(TeamStatusRow).describe('Employees from the requested roster that the viewer is authorized to see.'),
})
export type TeamStatusData = z.infer<typeof TeamStatusData>

/** A status update for one employee's current shift. */
export const SaveTeamStatusBody = z.object({
  employeeId: z.string().trim().min(1).max(120).describe('The employee whose current shift status is being updated.'),
  statusNote: z.string().trim().max(160).describe('Short free-text status for this shift; an empty string clears it.'),
  location: z.string().trim().max(100).nullable().optional().describe('Optional location for this shift; null or an empty string clears it.'),
})
export type SaveTeamStatusBody = z.infer<typeof SaveTeamStatusBody>

/** The saved shift status. */
export const SaveTeamStatusData = z.object({
  employeeId: z.string().describe('The employee whose current shift status was updated.'),
  updatedAt: z.string().describe('When the status change was saved.'),
})
export type SaveTeamStatusData = z.infer<typeof SaveTeamStatusData>
