/**
 * Projects & Matters (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 1). A matter belongs to a client
 * through `matter_party` (the `matter` table has no client column). Numbers follow
 * `docs/help-docs/Client-and-Matter-Numbering.md`: `[Client Number].0` is the Client General Matters, made with the
 * client; specific matters are `.1`, `.2`, ... and the API assigns the next one.
 *
 *   GET    /v1/clients/{clientId}/matters   the client's matters, the status and practice-area choices, and what the viewer may do
 *   POST   /v1/clients/{clientId}/matters   create the next numbered matter (with optional Initial Notes)
 *   PATCH  /v1/matters/{matterId}           change title, description, status and opened date (and add Initial Notes)
 *   GET    /v1/matters/{matterId}/delete-check  whether the matter may be deleted, and what blocks it
 *   DELETE /v1/matters/{matterId}           delete a matter that has no records (super admin, typed confirmation)
 *
 * Old routes: `GET`, `POST`, `PATCH`, `DELETE /krhomebase/api/kr-api-v1/matters` (the delete check was
 * `GET ...?deleteCheck=true`). The as-is record is `docs/API/WorkStream_AsIs_Reference.md`, section 2.
 */

import { z } from 'zod'

/** The title every `.0` matter has, whatever is stored (numbering document). */
export const CLIENT_GENERAL_MATTER_TITLE = 'Client General Matters'

/** Whether a matter number is the reserved Client General Matters number (`[Client Number].0`). */
export function isClientGeneralMatterNumber(matterNumber: string | null | undefined): boolean {
  return typeof matterNumber === 'string' && /\.0$/.test(matterNumber.trim())
}

/** The words a person must type to delete a matter (the old screen's challenge). */
export function matterDeleteConfirmation(matterNumber: string): string {
  return `Delete Matter ${matterNumber}`
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')

export const MatterClientParams = z.object({
  clientId: z.string().trim().min(1).max(200).describe('The client account id (`client.id`).'),
})
export type MatterClientParams = z.infer<typeof MatterClientParams>

export const MatterParams = z.object({
  matterId: z.string().trim().min(1).max(200).describe('The matter id (`matter.id`).'),
})
export type MatterParams = z.infer<typeof MatterParams>

export const Matter = z.object({
  id: z.string().describe('Matter id (`mat_<uuid>`).'),
  matterNumber: z.string().describe('`[Client Number].[sequence]`; `.0` is the Client General Matters. Assigned by the API, read-only.'),
  title: z.string().describe('Matter title. Always "Client General Matters" on a `.0` matter.'),
  description: z.string().nullable().describe('Matter description.'),
  isGeneralMatter: z.boolean().describe('True for the `.0` Client General Matters (title locked, never deleted).'),
  practiceAreaLookupId: z.string().describe('Practice area: a `lookup` row of the `practice_area` list.'),
  practiceAreaLabel: z.string().nullable().describe('That row\'s label, when found.'),
  statusLookupId: z.string().describe('Status: a `lookup` row of the `matter_status` list.'),
  statusLabel: z.string().nullable().describe('That row\'s label, when found.'),
  openedDate: z.string().nullable().describe('Date opened, `YYYY-MM-DD`.'),
  closedDate: z.string().nullable().describe('Date closed, `YYYY-MM-DD`.'),
  primaryAttorneyUserId: z.string().nullable().describe('The primary attorney\'s user id (the creator by default).'),
  createdAt: z.string().describe('When the matter was created (ISO time).'),
  updatedAt: z.string().nullable().describe('When it last changed (ISO time).'),
})
export type Matter = z.infer<typeof Matter>

export const MatterChoice = z.object({
  id: z.string().describe('`lookup` row id.'),
  label: z.string().describe('Label shown in the list.'),
})
export type MatterChoice = z.infer<typeof MatterChoice>

export const ClientMattersData = z.object({
  clientId: z.string().describe('The client account id.'),
  clientNumber: z.string().nullable().describe('The client number (at least three digits).'),
  matters: z.array(Matter).describe('The client\'s matters, in matter-number order (numeric).'),
  statuses: z.array(MatterChoice).describe('The active `matter_status` choices, in list order.'),
  practiceAreas: z.array(MatterChoice).describe('The active `practice_area` choices, in list order.'),
  viewer: z
    .object({
      canWrite: z.boolean().describe('The viewer may add and change matters.'),
      canDelete: z.boolean().describe('The viewer may delete a matter that has no records (super admin).'),
    })
    .describe('What the signed-in person may do here.'),
})
export type ClientMattersData = z.infer<typeof ClientMattersData>

const title = z.string().trim().min(1, 'Matter Title is required.').max(200).describe('Matter title (ignored on a `.0` matter, which is always "Client General Matters").')
const description = z.string().trim().max(4000).nullable().optional().describe('Matter description; blank or null clears it.')
const initialNotes = z.string().trim().max(10000).optional().describe('Optional first note, saved as a `matter_activity_log` note "Matter Initial Notes".')
const statusLookupId = z.string().trim().min(1).max(200).describe('A `matter_status` choice id.')
const openedDate = isoDate.describe('Date opened, `YYYY-MM-DD`.')

export const MatterCreateBody = z.object({
  title,
  description,
  initialNotes,
  statusLookupId: statusLookupId.optional().describe('A `matter_status` choice id; Open when left out.'),
  openedDate: openedDate.optional().describe('Date opened, `YYYY-MM-DD`; today (Chicago) when left out.'),
  practiceAreaLookupId: z.string().trim().min(1).max(200).optional().describe('A `practice_area` choice id; Miscellaneous when left out.'),
})
export type MatterCreateBody = z.infer<typeof MatterCreateBody>

export const MatterUpdateBody = z.object({
  title,
  description,
  initialNotes,
  statusLookupId: statusLookupId.optional().describe('A `matter_status` choice id; left out keeps the current status.'),
  openedDate: openedDate.nullable().optional().describe('Date opened, `YYYY-MM-DD`; null clears it, left out keeps it.'),
})
export type MatterUpdateBody = z.infer<typeof MatterUpdateBody>

export const MatterSavedData = z.object({
  matter: Matter.describe('The matter after the save.'),
})
export type MatterSavedData = z.infer<typeof MatterSavedData>

export const MatterBlockingItem = z.object({
  table: z.string().describe('The table that holds records for this matter, or `client_general_matter` for a `.0` matter.'),
  label: z.string().describe('Plain name of those records.'),
  count: z.number().int().describe('How many records.'),
})
export type MatterBlockingItem = z.infer<typeof MatterBlockingItem>

export const MatterDeleteCheckData = z.object({
  matterId: z.string().describe('The matter id.'),
  matterNumber: z.string().describe('The matter number.'),
  canDelete: z.boolean().describe('True when the viewer is a super admin, the matter is not `.0`, and nothing blocks it.'),
  requiresSuperAdmin: z.boolean().describe('True when the viewer is not a super admin.'),
  protectedGeneralMatter: z.boolean().describe('True for a `.0` Client General Matters, which is never deleted.'),
  blockingItems: z.array(MatterBlockingItem).describe('What blocks the delete; empty when nothing does.'),
})
export type MatterDeleteCheckData = z.infer<typeof MatterDeleteCheckData>

export const MatterDeleteBody = z.object({
  confirmation: z.string().max(300).describe('Exactly `Delete Matter <matter number>`.'),
})
export type MatterDeleteBody = z.infer<typeof MatterDeleteBody>

export const MatterDeletedData = z.object({
  matterId: z.string().describe('The deleted matter id.'),
  matterNumber: z.string().describe('Its number.'),
  deleted: z.literal(true).describe('Always true.'),
})
export type MatterDeletedData = z.infer<typeof MatterDeletedData>
