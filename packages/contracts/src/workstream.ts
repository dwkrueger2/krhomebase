/**
 * Communications / WorkStream (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 2). One table,
 * `workstream_activity`: each entry has an activity type (`subgroup`) and belongs to a client or a lead.
 *
 * The requester's decisions (Nov 13, 2026; `docs/API/WorkStream_AsIs_Reference.md` section 8):
 * - D12: a client entry always belongs to a matter. The client is implied by the matter; with no matter chosen the
 *   entry goes to the client's `[Client Number].0`. A lead entry has no matter.
 * - D9: every staff user may read and write WorkStream for now (Favorites Lists to filter come later).
 * - D10: lists are newest first and paged; a list that has more says so (`nextCursor`).
 * - D13: email goes through the firm's Gmail mailer.
 *
 *   GET    /v1/workstream                    entries of a client (and matter) or a lead, newest first, paged
 *   GET    /v1/workstream/feed               every entry, newest first, paged (the Communications section)
 *   GET    /v1/workstream/assignees          staff users who may be assigned
 *   GET    /v1/workstream/{wsid}             one entry
 *   POST   /v1/workstream                    create one entry
 *   PATCH  /v1/workstream/{wsid}             change one entry (only the fields sent)
 *   POST   /v1/workstream/{wsid}/move        move an entry to another client (its .0 matter)
 *   DELETE /v1/workstream/{wsid}             delete an entry (super admin)
 *   GET    /v1/workstream/email/recipients   a client's email addresses
 *   POST   /v1/workstream/email/preview      the email as it will look; nothing is sent
 *   POST   /v1/workstream/email              send it and record an Emails entry
 *
 * Old routes: `/krhomebase/api/workstream/{subgroup}` (GET list, POST), `/{subgroup}/{wsid}` (GET, PATCH, DELETE),
 * `/workstream/assignees`, `/kr-api-v1/workstream/send-email` (GET recipients, POST preview and send).
 */

import { z } from 'zod'

/** The seven activity types (Schema 8.0 CHECK on `workstream_activity.subgroup`). */
export const WORKSTREAM_SUBGROUPS = ['PhoneCalls', 'Emails', 'Notes', 'Tasks', 'ReceivedFiles', 'SentFiles', 'WIP'] as const
export const WorkstreamSubgroup = z.enum(WORKSTREAM_SUBGROUPS).describe('Activity type.')
export type WorkstreamSubgroup = z.infer<typeof WorkstreamSubgroup>

/** Plain labels for the activity types (old screens). */
export const WORKSTREAM_SUBGROUP_LABELS: Record<WorkstreamSubgroup, string> = {
  PhoneCalls: 'Phone Call',
  Emails: 'Email',
  Notes: 'Note',
  Tasks: 'Task',
  ReceivedFiles: 'Received File',
  SentFiles: 'Sent File',
  WIP: 'WIP',
}

/** A public WorkStream id: seven characters A to Z and 0 to 9. */
export const WSID_PATTERN = /^[A-Z0-9]{7}$/

const wsid = z.string().regex(WSID_PATTERN, 'A WorkStream id is seven letters and digits.')
const id = (what: string) => z.string().trim().min(1).max(200).describe(what)

export const WorkstreamActivity = z.object({
  id: z.string().describe('Row id (`wsa_<uuid>`).'),
  wsid: z.string().describe('Public seven-character id.'),
  subgroup: WorkstreamSubgroup,
  clientId: z.string().nullable().describe('Owning client account, or null for a lead entry.'),
  clientNumber: z.string().nullable().describe('That client\'s number.'),
  clientDisplayName: z.string().nullable().describe('That client\'s name.'),
  leadId: z.string().nullable().describe('Owning lead, or null for a client entry.'),
  lcid: z.string().nullable().describe('That lead\'s code.'),
  matterId: z.string().nullable().describe('The matter (always set on entries made here; older entries may lack it).'),
  matterNumber: z.string().nullable().describe('That matter\'s number.'),
  matterTitle: z.string().nullable().describe('That matter\'s title.'),
  activityAt: z.string().describe('When the activity happened (ISO time).'),
  title: z.string().describe('Subject line.'),
  note: z.string().describe('The note as plain text (tags removed from an HTML note).'),
  noteHtml: z.string().nullable().describe('The note as cleaned HTML, when it was written in the editor.'),
  nextSteps: z.array(z.string()).describe('Next steps, in order.'),
  documentRecordId: z.string().nullable().describe('A stored document this entry is about.'),
  documentUrl: z.string().nullable().describe('Link to that document.'),
  documentLabel: z.string().nullable().describe('Its label.'),
  taskId: z.string().nullable().describe('Linked task (not used yet).'),
  assigneeUserId: z.string().nullable().describe('Assigned staff user.'),
  assigneeContactId: z.string().nullable().describe('Assigned contact (instead of a user).'),
  assigneeLabel: z.string().nullable().describe('Assignee as shown.'),
  performedByUserId: z.string().nullable().describe('Who recorded it.'),
  performedByLabel: z.string().nullable().describe('Their name.'),
  createdAt: z.string().describe('When it was recorded (ISO time).'),
  updatedAt: z.string().nullable().describe('When it last changed (ISO time).'),
})
export type WorkstreamActivity = z.infer<typeof WorkstreamActivity>

/** Several activity types at once, comma-separated (`PhoneCalls,Notes`); checked by the API (WORKSTREAM_SUBGROUP_INVALID). */
const subgroupList = z.string().max(200).optional().describe('Only these activity types, comma-separated (for example `PhoneCalls,Notes`).')

const limit = z.coerce.number().int().min(1).max(100).default(50).describe('Entries per page, 1 to 100 (50 when left out).')
const cursor = z.string().max(500).optional().describe('The `nextCursor` of the previous page.')

/** Exactly one of `clientId` and `leadId` (checked by the API: WORKSTREAM_OWNER_REQUIRED). */
export const WorkstreamListQuery = z.object({
  clientId: id('Client account id (or give leadId).').optional(),
  leadId: id('Lead id (or give clientId).').optional(),
  matterId: id('Only entries of this matter (a `.0` matter also shows the client\'s older entries that have no matter).').optional(),
  subgroup: WorkstreamSubgroup.optional().describe('Only this activity type.'),
  subgroups: subgroupList,
  assigneeUserId: id('Only entries assigned to this user.').optional(),
  limit,
  cursor,
})
export type WorkstreamListQuery = z.infer<typeof WorkstreamListQuery>

export const WorkstreamFeedQuery = z.object({
  subgroup: WorkstreamSubgroup.optional().describe('Only this activity type.'),
  subgroups: subgroupList,
  assigneeUserId: id('Only entries assigned to this user.').optional(),
  limit,
  cursor,
})
export type WorkstreamFeedQuery = z.infer<typeof WorkstreamFeedQuery>

export const WorkstreamListData = z.object({
  activities: z.array(WorkstreamActivity).describe('Newest first (activity time, then recorded time).'),
  nextCursor: z.string().nullable().describe('Pass as `cursor` for the next page; null when this is the last page.'),
})
export type WorkstreamListData = z.infer<typeof WorkstreamListData>

export const WorkstreamParams = z.object({ wsid: wsid.describe('Public seven-character id.') })
export type WorkstreamParams = z.infer<typeof WorkstreamParams>

const title = z.string().trim().min(1, 'A subject is required.').max(300).describe('Subject line.')
const note = z.string().max(50000).optional().describe('The note as plain text.')
const noteHtml = z.string().max(100000).optional().describe('The note as HTML from the editor; cleaned before it is stored.')
const nextSteps = z.array(z.string().trim().max(500)).max(50).optional().describe('Next steps (blank ones are dropped).')
const activityAt = z.string().datetime({ offset: true }).optional().describe('When it happened (ISO time); now when left out.')

export const WorkstreamCreateBody = z
  .object({
    subgroup: WorkstreamSubgroup,
    clientId: id('Owning client account (or give leadId).').optional(),
    leadId: id('Owning lead (or give clientId).').optional(),
    matterId: id('The client\'s matter; the client\'s `.0` matter when left out (D12). Not allowed on a lead entry.').optional(),
    title,
    note,
    noteHtml,
    nextSteps,
    activityAt,
    assigneeUserId: id('Assigned staff user; the person recording it when no assignee is given.').optional(),
    assigneeContactId: id('Assigned contact instead of a user.').optional(),
    assigneeLabel: z.string().trim().max(200).optional().describe('Assignee as shown (for "Other").'),
    documentRecordId: id('A stored document this entry is about.').optional(),
    documentUrl: z.string().trim().max(2000).optional().describe('Link to that document.'),
    documentLabel: z.string().trim().max(300).optional().describe('Its label.'),
  })
  .refine((value) => Boolean(value.clientId) !== Boolean(value.leadId), { message: 'Give a clientId or a leadId, not both.' })
export type WorkstreamCreateBody = z.infer<typeof WorkstreamCreateBody>

export const WorkstreamUpdateBody = z.object({
  subgroup: WorkstreamSubgroup.optional(),
  matterId: id('Another matter of the same client.').optional(),
  title: title.optional(),
  note,
  noteHtml: z.string().max(100000).nullable().optional().describe('HTML note; null turns the note back to plain text.'),
  nextSteps,
  activityAt,
  assigneeUserId: id('Assigned staff user; null clears it.').nullable().optional(),
})
export type WorkstreamUpdateBody = z.infer<typeof WorkstreamUpdateBody>

export const WorkstreamMoveBody = z.object({
  clientId: id('The client account the entry moves to.'),
  matterId: id('One of that client\'s matters; the client\'s `.0` matter when left out (D12). D16: an Internal entry on 050.1 is reassigned this way.').optional(),
})
export type WorkstreamMoveBody = z.infer<typeof WorkstreamMoveBody>

export const WorkstreamSavedData = z.object({ activity: WorkstreamActivity.describe('The entry after the save.') })
export type WorkstreamSavedData = z.infer<typeof WorkstreamSavedData>

export const WorkstreamDeletedData = z.object({
  wsid: z.string().describe('The deleted entry\'s id.'),
  deleted: z.literal(true).describe('Always true.'),
})
export type WorkstreamDeletedData = z.infer<typeof WorkstreamDeletedData>

export const WorkstreamAssignee = z.object({
  id: z.string().describe('User id.'),
  label: z.string().describe('`<staff code> - <name>` (old label).'),
  displayName: z.string().describe('Name.'),
  staffCode: z.string().nullable().describe('Staff code, when the user is an employee.'),
})
export type WorkstreamAssignee = z.infer<typeof WorkstreamAssignee>

export const WorkstreamAssigneesData = z.object({ users: z.array(WorkstreamAssignee).describe('Active staff users, by name.') })
export type WorkstreamAssigneesData = z.infer<typeof WorkstreamAssigneesData>

export const WorkstreamEmailRecipientsQuery = z.object({ clientId: id('Client account id.') })
export type WorkstreamEmailRecipientsQuery = z.infer<typeof WorkstreamEmailRecipientsQuery>

export const WorkstreamEmailRecipient = z.object({
  email: z.string().describe('Address.'),
  label: z.string().describe('Whose address it is.'),
  primary: z.boolean().describe('The person\'s primary address.'),
})
export type WorkstreamEmailRecipient = z.infer<typeof WorkstreamEmailRecipient>

export const WorkstreamEmailRecipientsData = z.object({
  clientId: z.string().describe('Client account id.'),
  clientNumber: z.string().nullable().describe('Client number.'),
  clientDisplayName: z.string().nullable().describe('Client name.'),
  recipients: z.array(WorkstreamEmailRecipient).describe('Current addresses, primary first.'),
})
export type WorkstreamEmailRecipientsData = z.infer<typeof WorkstreamEmailRecipientsData>

const addresses = z.array(z.string().trim().max(320)).max(50)

export const WorkstreamEmailBody = z.object({
  clientId: id('Client account id.'),
  matterId: id('The matter the email is about; the client\'s `.0` matter when left out.').optional(),
  to: addresses.describe('Recipients (at least one to send).'),
  cc: addresses.optional().describe('Copies.'),
  subject: z.string().trim().max(300).describe('Subject; the `[KR <matter number>]` tag is added at the end.'),
  message: z.string().max(50000).describe('The message; blank lines separate paragraphs.'),
})
export type WorkstreamEmailBody = z.infer<typeof WorkstreamEmailBody>

export const WorkstreamEmailPreviewData = z.object({
  subject: z.string().describe('The subject with its tag.'),
  html: z.string().describe('The email body as it will be sent (the logo inline as a data address, for the screen only).'),
})
export type WorkstreamEmailPreviewData = z.infer<typeof WorkstreamEmailPreviewData>

export const WorkstreamEmailSentData = z.object({
  sent: z.literal(true).describe('Always true.'),
  messageId: z.string().nullable().describe('Gmail message id.'),
  to: z.array(z.string()).describe('Recipients.'),
  cc: z.array(z.string()).describe('Copies.'),
  subject: z.string().describe('The subject with its tag.'),
  matterNumber: z.string().describe('The matter it was recorded on.'),
  workstreamWsid: z.string().nullable().describe('The Emails entry, or null if recording it failed.'),
  workstreamError: z.string().nullable().describe('Why the entry was not recorded (the email was still sent).'),
})
export type WorkstreamEmailSentData = z.infer<typeof WorkstreamEmailSentData>

/** The subject with the authoritative `[KR <matter>]` tag at the end; any KR or LN tag already there is removed. */
export function tagEmailSubject(subject: string, matterNumber: string): string {
  const stripped = subject.replace(/\s*\[(?:KR|LN)\s+[A-Za-z0-9][A-Za-z0-9.-]*\]/gi, '').replace(/\s{2,}/g, ' ').trim()
  return stripped ? `${stripped} [KR ${matterNumber}]` : `[KR ${matterNumber}]`
}
