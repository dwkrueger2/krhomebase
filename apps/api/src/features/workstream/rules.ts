// file: apps/api/src/features/workstream/rules.ts
/**
 * Business rules for Communications / WorkStream (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 2),
 * ported from the old `api/workstream/_server/krWorkstreamApi.ts`, `api/workstream/assignees/route.ts`,
 * `_server/krEmailRecipients.ts` and `kr-api-v1/workstream/send-email/route.ts`.
 *
 * Kept from the old code: the seven activity types; a client or a lead owns each entry (never both); a lead entry has
 * no matter; a matter on a client entry must be one of that client's primary-client matters; the default assignee is
 * the person recording it; a user and a contact assignee together are refused; `noteHtml` is cleaned before it is
 * stored (the regex cleaner, kept) and stored as `html`; the seven-character `wsid` (crud Worker rule, retried on a
 * clash); the email subject tag `[KR <matter>]` and the `X-KR-*` headers; after a sent email an `Emails` entry is
 * recorded, and a failure to record it does not undo the email.
 *
 * Changed (the requester's decisions of Nov 13, 2026, `docs/API/WorkStream_AsIs_Reference.md` section 8.1):
 * - D12: a client entry always gets a matter: the chosen one, else the client's `.0` (a move lands on the target's
 *   `.0`; the old move cleared the matter). Filtering by a `.0` matter also shows the client's older entries without one.
 * - D10: lists are newest first and paged (the old ones had no order and stopped at 100); one call for every type.
 * - D9: every staff role may read and write; deleting stays super admin.
 * - A change sets only the fields sent (the old one blanked a note or next steps left out).
 * - The audit row has no note text (the old crud Worker copied notes into the audit log, and audited every read).
 * - The email logo travels inside the message (`platform/firmEmail.ts`); an email names a matter by id.
 *
 * Changed Nov 18, 2026 (FB-0016, FB-0017; API 1.2.0 patch 1):
 * - One entry may have several activity types (`subgroups`): the main one stays in `subgroup`, the others are
 *   `workstream_activity_type` rows written in the entry's own batch (`activityTypes`). The screens used to save one
 *   entry per type, each with its own WSID.
 * - An entry with the Task type gets a real task on the Tasks screen, made through the Tasks area's own rules (the
 *   `WorkstreamTaskPort` that `routes.ts` hands in, so the client, matter and assignee checks are the Tasks ones),
 *   titled with the subject, described `WS #<wsid>`, and kept in `task_id`. `assigneeUserIds` are its assignees (the
 *   first is also the entry's assignee); a change sends the whole set to the task. Taking the Task type away leaves
 *   the task as it is. The entry is saved first: a task that cannot be made or reassigned is reported in `taskError`
 *   and the entry stands, as a sent email stands when its entry cannot be recorded.
 */

import {
  tagEmailSubject,
  WORKSTREAM_SUBGROUPS,
  type WorkstreamActivity,
  type WorkstreamAssigneesData,
  type WorkstreamCreateBody,
  type WorkstreamDeletedData,
  type WorkstreamEmailBody,
  type WorkstreamEmailPreviewData,
  type WorkstreamEmailRecipientsData,
  type WorkstreamEmailSentData,
  type WorkstreamFeedQuery,
  type WorkstreamListData,
  type WorkstreamListQuery,
  type WorkstreamSavedData,
  type WorkstreamSubgroup,
  type WorkstreamUpdateBody,
} from '@krhomebase/contracts'
import { buildFirmEmail, previewHtml } from '../../platform/firmEmail.ts'
import type { Mailer } from '../../platform/googleWorkspaceMailer.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import { generatePublicCode } from '../contact-edits/rules.ts'
import type { ActivityCursor, ActivityRow, ClientRow, MatterRow, PersonRow, WorkstreamQueries } from './queries.ts'

/** Staff roles that may read and write WorkStream (D9: every staff user; no client or outside accountant accounts). */
export const WORKSTREAM_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'office_manager', 'front_end_author'] as const
/** Roles that may send client email (old send-email route, the billing write roles). */
export const WORKSTREAM_EMAIL_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'office_manager'] as const

const WSID_ATTEMPTS = 8

/**
 * What WorkStream needs from the Tasks area (FB-0017), handed in by `routes.ts` so the two rule files do not import
 * each other. Each call runs the Tasks rules with the same person and writes its own audit row.
 */
export interface WorkstreamTaskPort {
  /** Makes the task for an entry's Task type; answers the task's public id. */
  create(input: { title: string; description: string; clientId: string | null; matterId: string | null; assigneeUserIds: string[] }): Promise<string>
  /** Replaces the task's current assignees (the whole set, the first first). */
  assign(taskId: string, assigneeUserIds: string[]): Promise<void>
}

/**
 * The entry's activity types, the main one first and each once (FB-0016). `main` is put first when the list leaves it
 * out; with no list, the main type alone.
 */
export function activityTypes(main: WorkstreamSubgroup, list: readonly WorkstreamSubgroup[] | undefined): WorkstreamSubgroup[] {
  return Array.from(new Set([main, ...(list ?? [])]))
}

/** The other types in the order of the type buttons (`WORKSTREAM_SUBGROUPS`), without the main one. */
function otherTypes(types: readonly WorkstreamSubgroup[]): WorkstreamSubgroup[] {
  return WORKSTREAM_SUBGROUPS.filter((type) => type !== types[0] && types.includes(type))
}

function jsonStrings(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A refusal with its code and HTTP status. */
export class WorkstreamError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422 | 502 | 503,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'WorkstreamError'
  }
}

/** The signed-in person, from the checked session. */
export interface WorkstreamActor {
  userId: string
  email: string | null
  role: string | null
  displayName: string
  requestId: string
}

/** Conservative cleanup before HTML is stored; the screens clean it again before showing it (old rule, unchanged). */
export function sanitizeNoteHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|input|button)\b[^>]*>/gi, '')
    .replace(/\s+(?:on[a-z]+|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*("|')\s*(?:javascript|vbscript|data):[\s\S]*?\1/gi, '')
    .replace(/(?:javascript|vbscript|data)\s*:/gi, '')
}

/** Plain text of an HTML note: block ends become line breaks, tags go, common entities are decoded. */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function nextStepsFrom(json: string | null): string[] {
  if (!json) return []
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? value.filter((step): step is string => typeof step === 'string') : []
  } catch {
    return []
  }
}

const cleanSteps = (steps: readonly string[] | undefined) => (steps ?? []).map((step) => step.trim()).filter(Boolean).slice(0, 50)

/** A person's name as the old assignee list showed it: preferred name, else first, middle and last (a surname repeated in the first name is dropped). */
export function personName(person: Pick<PersonRow, 'preferred_name' | 'first_name' | 'middle_name' | 'last_name'> | null, fallback: string): string {
  if (!person) return fallback
  const preferred = person.preferred_name?.trim()
  if (preferred) return preferred
  const firstWords = (person.first_name ?? '').trim().split(/\s+/).filter(Boolean)
  const lastName = (person.last_name ?? '').trim()
  if (lastName && firstWords.at(-1)?.toLocaleLowerCase() === lastName.toLocaleLowerCase()) firstWords.pop()
  return [...firstWords, (person.middle_name ?? '').trim(), lastName].filter(Boolean).join(' ') || fallback
}

/** One row as the wire shape. */
export function serializeActivity(row: ActivityRow): WorkstreamActivity {
  const isHtml = row.note_format === 'html'
  const body = row.note_body ?? ''
  const main: WorkstreamSubgroup = (WORKSTREAM_SUBGROUPS as readonly string[]).includes(row.subgroup) ? (row.subgroup as WorkstreamSubgroup) : 'Notes'
  const extras = jsonStrings(row.extra_subgroups_json).filter((type): type is WorkstreamSubgroup => (WORKSTREAM_SUBGROUPS as readonly string[]).includes(type))
  // The task's assignees when the entry has a task (FB-0017), else the entry's own assignee.
  const assigneeUserIds = row.task_id ? jsonStrings(row.task_assignee_ids_json) : row.assignee_user_id ? [row.assignee_user_id] : []
  return {
    id: row.id,
    wsid: row.wsid,
    subgroup: main,
    subgroups: [main, ...otherTypes([main, ...extras])],
    clientId: row.client_id,
    clientNumber: row.client_number,
    clientDisplayName: row.client_display_name,
    leadId: row.lead_id,
    lcid: row.lcid,
    matterId: row.matter_id,
    matterNumber: row.matter_number,
    matterTitle: row.matter_title,
    activityAt: row.activity_at,
    title: row.subject,
    note: isHtml ? plainTextFromHtml(body) : body,
    noteHtml: isHtml ? body : null,
    nextSteps: nextStepsFrom(row.next_steps_json),
    documentRecordId: row.document_record_id,
    documentUrl: row.document_url,
    documentLabel: row.document_label,
    taskId: row.task_id,
    assigneeUserId: row.assignee_user_id,
    assigneeUserIds,
    assigneeContactId: row.assignee_contact_id,
    assigneeLabel: row.assignee_label,
    performedByUserId: row.performed_by_user_id,
    performedByLabel: row.performed_by_user_id
      ? personName({ preferred_name: row.performer_preferred_name, first_name: row.performer_first_name, middle_name: null, last_name: row.performer_last_name }, row.performer_email ?? row.performed_by_user_id)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The opaque page position: base64url of the last row's activity time, recorded time and id. */
export function encodeCursor(row: Pick<ActivityRow, 'activity_at' | 'created_at' | 'id'>): string {
  return btoa(JSON.stringify([row.activity_at, row.created_at, row.id])).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function decodeCursor(value: string | undefined): ActivityCursor | null {
  if (!value) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const parsed: unknown = JSON.parse(atob(padded))
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((part) => typeof part === 'string')) {
      return { activityAt: parsed[0] as string, createdAt: parsed[1] as string, id: parsed[2] as string }
    }
  } catch {
    // fall through
  }
  throw new WorkstreamError('WORKSTREAM_CURSOR_INVALID', 422, 'That page position is not valid. Load the list again.')
}

/** The `subgroups` list (`PhoneCalls,Notes`), checked against the seven types; empty or left out means every type. */
export function parseSubgroups(value: string | undefined): WorkstreamSubgroup[] {
  const parts = (value ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  const bad = parts.filter((part) => !(WORKSTREAM_SUBGROUPS as readonly string[]).includes(part))
  if (bad.length) throw new WorkstreamError('WORKSTREAM_SUBGROUP_INVALID', 422, `Not an activity type: ${bad.join(', ')}.`)
  return Array.from(new Set(parts)) as WorkstreamSubgroup[]
}

function page(rows: ActivityRow[], limit: number): WorkstreamListData {
  const pageRows = rows.slice(0, limit)
  const last = pageRows.at(-1)
  return { activities: pageRows.map(serializeActivity), nextCursor: rows.length > limit && last ? encodeCursor(last) : null }
}

async function requireClient(q: WorkstreamQueries, clientId: string): Promise<ClientRow> {
  const client = await q.client(clientId)
  if (!client) throw new WorkstreamError('WORKSTREAM_CLIENT_NOT_FOUND', 404, 'No client account has that id.')
  return client
}

async function requireLead(q: WorkstreamQueries, leadId: string): Promise<void> {
  if (!(await q.leadExists(leadId))) throw new WorkstreamError('WORKSTREAM_LEAD_NOT_FOUND', 404, 'No lead has that id.')
}

async function requireClientMatter(q: WorkstreamQueries, clientId: string, matterId: string): Promise<MatterRow> {
  const matter = await q.clientMatter(clientId, matterId)
  if (!matter) throw new WorkstreamError('WORKSTREAM_MATTER_NOT_FOR_CLIENT', 422, 'That matter does not belong to this client.')
  return matter
}

/** D12: the chosen matter of the client, else the client's `.0` matter. */
async function matterForClient(q: WorkstreamQueries, clientId: string, matterId: string | undefined): Promise<MatterRow> {
  if (matterId) return requireClientMatter(q, clientId, matterId)
  const general = await q.generalMatter(clientId)
  if (!general) throw new WorkstreamError('WORKSTREAM_GENERAL_MATTER_MISSING', 422, 'This client has no .0 Client General Matters, so the entry has no matter to go to.')
  return general
}

async function requireActivity(q: WorkstreamQueries, wsid: string): Promise<ActivityRow> {
  const row = await q.byWsid(wsid)
  if (!row) throw new WorkstreamError('WORKSTREAM_NOT_FOUND', 404, 'No WorkStream entry has that id.')
  return row
}

function auditFor(actor: WorkstreamActor, action: string, row: { id: string; clientId: string | null }, newJson: unknown): AuditEntry {
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'workstream', action, targetTable: 'workstream_activity', targetId: row.id, clientId: row.clientId, newJson }
}

/** A client's or a lead's entries, newest first, one page. Writes nothing. */
export async function listActivities(q: WorkstreamQueries, query: WorkstreamListQuery): Promise<WorkstreamListData> {
  if (Boolean(query.clientId) === Boolean(query.leadId)) throw new WorkstreamError('WORKSTREAM_OWNER_REQUIRED', 422, 'Give a clientId or a leadId, not both.')
  const cursor = decodeCursor(query.cursor)
  const common = { subgroup: query.subgroup, subgroups: parseSubgroups(query.subgroups), assigneeUserId: query.assigneeUserId }
  if (query.leadId) {
    if (query.matterId) throw new WorkstreamError('WORKSTREAM_LEAD_HAS_NO_MATTER', 422, 'A lead\'s entries have no matter.')
    await requireLead(q, query.leadId)
    return page(await q.list({ leadId: query.leadId, ...common }, cursor, query.limit), query.limit)
  }
  const clientId = query.clientId!
  await requireClient(q, clientId)
  const matter = query.matterId ? await requireClientMatter(q, clientId, query.matterId) : null
  const rows = await q.list({ clientId, matterId: matter?.id, includeNoMatter: Boolean(matter?.matter_number.endsWith('.0')), ...common }, cursor, query.limit)
  return page(rows, query.limit)
}

/** Every entry, newest first, one page (the Communications section). Writes nothing. */
export async function feedActivities(q: WorkstreamQueries, query: WorkstreamFeedQuery): Promise<WorkstreamListData> {
  return page(await q.list({ subgroup: query.subgroup, subgroups: parseSubgroups(query.subgroups), assigneeUserId: query.assigneeUserId }, decodeCursor(query.cursor), query.limit), query.limit)
}

export async function getActivity(q: WorkstreamQueries, wsid: string): Promise<WorkstreamSavedData> {
  return { activity: serializeActivity(await requireActivity(q, wsid)) }
}

/** The staff users given for a task, each once, in order; refused when one is not an active staff user (422 `WORKSTREAM_ASSIGNEE_NOT_FOUND`). */
async function checkedTaskAssignees(q: WorkstreamQueries, userIds: readonly string[]): Promise<string[]> {
  const unique = Array.from(new Set(userIds.map((userId) => userId.trim()).filter(Boolean)))
  if (!unique.length) return []
  const staff = new Set((await q.staffUsers()).map((person) => person.id))
  const missing = unique.filter((userId) => !staff.has(userId))
  if (missing.length) throw new WorkstreamError('WORKSTREAM_ASSIGNEE_NOT_FOUND', 422, `Not an active staff user: ${missing.join(', ')}.`)
  return unique
}

/** The entry's assignee name: the person saving, or the user's own name. */
async function assigneeName(q: WorkstreamQueries, actor: WorkstreamActor, userId: string): Promise<string> {
  return userId === actor.userId ? actor.displayName : personName(await q.person(userId), userId)
}

/** The error code of a task that could not be made or reassigned (the entry is already saved). */
function taskErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code ? code : 'WORKSTREAM_TASK_UNAVAILABLE'
}

/**
 * Makes the task for an entry with the Task type and keeps its id on the entry (FB-0017). Answers the error code when
 * it could not, else null.
 */
async function makeTask(
  q: WorkstreamQueries,
  tasks: WorkstreamTaskPort | undefined,
  actor: WorkstreamActor,
  entry: { id: string; wsid: string; subject: string; clientId: string | null; matterId: string | null },
  assigneeUserIds: string[],
  now: string,
): Promise<string | null> {
  if (!tasks) return 'WORKSTREAM_TASK_UNAVAILABLE'
  try {
    const taskId = await tasks.create({ title: entry.subject, description: `From WorkStream entry WS #${entry.wsid}.`, clientId: entry.clientId, matterId: entry.matterId, assigneeUserIds })
    await q.linkTask(entry.id, taskId, now, auditFor(actor, 'LINK_TASK', { id: entry.id, clientId: entry.clientId }, { wsid: entry.wsid, taskId }))
    return null
  } catch (error) {
    console.error(JSON.stringify({ requestId: actor.requestId, area: 'WORKSTREAM:task', wsid: entry.wsid, code: taskErrorCode(error) }))
    return taskErrorCode(error)
  }
}

/**
 * Creates one entry with every activity type given; the `wsid` is made here and tried again on a clash. With the
 * Task type, the task is made after the entry is saved (`makeTask`; a failure is `taskError`, the entry stands).
 */
export async function createActivity(q: WorkstreamQueries, actor: WorkstreamActor, body: WorkstreamCreateBody, now: string, tasks?: WorkstreamTaskPort): Promise<WorkstreamSavedData> {
  let clientId: string | null = null
  let leadId: string | null = null
  let matterId: string | null = null
  if (body.leadId) {
    if (body.matterId) throw new WorkstreamError('WORKSTREAM_LEAD_HAS_NO_MATTER', 422, 'A lead\'s entries have no matter.')
    await requireLead(q, body.leadId)
    leadId = body.leadId
  } else {
    clientId = (await requireClient(q, body.clientId!)).id
    matterId = (await matterForClient(q, clientId, body.matterId)).id
  }
  if ((body.assigneeUserId || body.assigneeUserIds?.length) && body.assigneeContactId) throw new WorkstreamError('WORKSTREAM_ASSIGNEE_CONFLICT', 422, 'Assign the entry to a user or to a contact, not both.')
  const types = activityTypes(body.subgroup, body.subgroups)
  const wantsTask = types.includes('Tasks')
  const listed = wantsTask && body.assigneeUserIds !== undefined ? await checkedTaskAssignees(q, body.assigneeUserIds) : null
  const noOtherAssignee = !body.assigneeContactId && !body.assigneeLabel?.trim()
  // A task's assignee list names the entry's assignee too (its first); otherwise the old rule: the one given, else the person saving.
  const assigneeUserId = listed ? (listed[0] ?? null) : (body.assigneeUserId ?? (noOtherAssignee ? actor.userId : null))
  const assigneeLabel = (listed ? null : body.assigneeLabel?.trim()) || (assigneeUserId ? await assigneeName(q, actor, assigneeUserId) : null)
  const taskAssignees = listed ?? (wantsTask ? await checkedTaskAssignees(q, assigneeUserId ? [assigneeUserId] : []) : [])
  const html = body.noteHtml?.trim() ? sanitizeNoteHtml(body.noteHtml.trim()) : null
  const id = `wsa_${crypto.randomUUID()}`
  for (let attempt = 0; attempt < WSID_ATTEMPTS; attempt += 1) {
    const wsid = generatePublicCode()
    const saved = await q.insert(
      {
        id,
        wsid,
        clientId,
        leadId,
        matterId,
        subgroup: types[0]!,
        extraSubgroups: otherTypes(types),
        activityAt: body.activityAt ?? now,
        subject: body.title.trim(),
        noteBody: html ?? (body.note?.trim() || null),
        noteFormat: html ? 'html' : 'plain',
        nextStepsJson: JSON.stringify(cleanSteps(body.nextSteps)),
        documentRecordId: body.documentRecordId ?? null,
        documentUrl: body.documentUrl?.trim() || null,
        documentLabel: body.documentLabel?.trim() || null,
        assigneeUserId,
        assigneeContactId: body.assigneeContactId ?? null,
        assigneeLabel,
        performedByUserId: actor.userId,
        now,
      },
      auditFor(actor, 'CREATE', { id, clientId }, { wsid, subgroup: types[0], subgroups: types, subject: body.title.trim(), leadId, matterId }),
    )
    if (!saved) continue
    if (!wantsTask) return getActivity(q, wsid)
    const taskError = await makeTask(q, tasks, actor, { id, wsid, subject: body.title.trim(), clientId, matterId }, taskAssignees, now)
    return { ...(await getActivity(q, wsid)), taskError }
  }
  throw new WorkstreamError('WORKSTREAM_WSID_EXHAUSTED', 409, 'A WorkStream id could not be assigned. Try again.')
}

/**
 * The types after a change (FB-0016). `subgroups` is the whole new set: the main type stays when it is in the set (or
 * `subgroup` when that is), else the set's first. `subgroup` alone replaces the main type and keeps the others.
 * Answers null when the types do not change.
 */
export function changedTypes(current: readonly WorkstreamSubgroup[], body: Pick<WorkstreamUpdateBody, 'subgroup' | 'subgroups'>): WorkstreamSubgroup[] | null {
  let next: WorkstreamSubgroup[]
  if (body.subgroups) {
    const set = Array.from(new Set(body.subgroups))
    const main = body.subgroup && set.includes(body.subgroup) ? body.subgroup : current[0] && set.includes(current[0]) ? current[0] : set[0]!
    next = [main, ...otherTypes([main, ...set])]
  } else if (body.subgroup) {
    next = [body.subgroup, ...otherTypes([body.subgroup, ...current.slice(1)])]
  } else return null
  return next.join(',') === [current[0], ...otherTypes(current)].join(',') ? null : next
}

/**
 * Changes only the fields sent. With the Task type, an entry without a task gets one, and `assigneeUserIds` go to
 * the task (FB-0017); a failure there is `taskError`, and the entry's change stands.
 */
export async function updateActivity(q: WorkstreamQueries, actor: WorkstreamActor, wsid: string, body: WorkstreamUpdateBody, now: string, tasks?: WorkstreamTaskPort): Promise<WorkstreamSavedData> {
  const current = await requireActivity(q, wsid)
  const currentTypes = serializeActivity(current).subgroups
  const nextTypes = changedTypes(currentTypes, body)
  const types = nextTypes ?? currentTypes
  const wantsTask = types.includes('Tasks')
  if (body.assigneeUserIds !== undefined && !wantsTask) throw new WorkstreamError('WORKSTREAM_TASK_TYPE_REQUIRED', 422, 'Only an entry with the Task type has task assignees.')
  const listed = body.assigneeUserIds !== undefined ? await checkedTaskAssignees(q, body.assigneeUserIds) : null
  let matterId = current.matter_id
  if (body.matterId !== undefined && body.matterId !== current.matter_id) {
    if (!current.client_id) throw new WorkstreamError('WORKSTREAM_LEAD_HAS_NO_MATTER', 422, 'A lead\'s entries have no matter.')
    matterId = (await requireClientMatter(q, current.client_id, body.matterId)).id
  }
  let noteBody = current.note_body
  let noteFormat: 'plain' | 'html' = current.note_format === 'html' ? 'html' : 'plain'
  if (typeof body.noteHtml === 'string' && body.noteHtml.trim()) {
    noteBody = sanitizeNoteHtml(body.noteHtml.trim())
    noteFormat = 'html'
  } else if (body.noteHtml !== undefined || body.note !== undefined) {
    noteBody = body.note?.trim() || null
    noteFormat = 'plain'
  }
  let assignee = { userId: current.assignee_user_id, contactId: current.assignee_contact_id, label: current.assignee_label }
  const assigneeChange = listed ? (listed[0] ?? null) : body.assigneeUserId
  if (assigneeChange !== undefined) {
    assignee = assigneeChange ? { userId: assigneeChange, contactId: null, label: await assigneeName(q, actor, assigneeChange) } : { userId: null, contactId: null, label: null }
  }
  const subgroup = types[0]!
  const subject = body.title?.trim() || current.subject
  await q.update(
    {
      id: current.id,
      clientId: current.client_id,
      leadId: current.lead_id,
      matterId,
      subgroup,
      extraSubgroups: nextTypes ? otherTypes(nextTypes) : null,
      activityAt: body.activityAt ?? current.activity_at,
      subject,
      noteBody,
      noteFormat,
      nextStepsJson: body.nextSteps !== undefined ? JSON.stringify(cleanSteps(body.nextSteps)) : (current.next_steps_json ?? '[]'),
      assigneeUserId: assignee.userId,
      assigneeContactId: assignee.contactId,
      assigneeLabel: assignee.label,
      now,
    },
    auditFor(actor, 'UPDATE', { id: current.id, clientId: current.client_id }, { wsid, subgroup, subgroups: types, subject, matterId, fields: Object.keys(body) }),
  )
  // FB-0017: a Task type with no task yet gets one; the assignees sent go to the task.
  if (!wantsTask || (current.task_id && !listed)) return getActivity(q, wsid)
  let taskError: string | null = null
  if (!current.task_id) {
    taskError = await makeTask(q, tasks, actor, { id: current.id, wsid, subject, clientId: current.client_id, matterId }, listed ?? (assignee.userId ? [assignee.userId] : []), now)
  } else if (!tasks) {
    taskError = 'WORKSTREAM_TASK_UNAVAILABLE'
  } else {
    try {
      await tasks.assign(current.task_id, listed!)
    } catch (error) {
      taskError = taskErrorCode(error)
      console.error(JSON.stringify({ requestId: actor.requestId, area: 'WORKSTREAM:task-assign', wsid, code: taskError }))
    }
  }
  return { ...(await getActivity(q, wsid)), taskError }
}

/**
 * Moves (reassigns) an entry to a client's matter: the chosen one, else the client's `.0` (D12); the entry leaves any
 * lead. D16: an entry saved on Internal (client 050, matter 050.1) is reassigned this way to the right client and matter.
 */
export async function moveActivity(q: WorkstreamQueries, actor: WorkstreamActor, wsid: string, clientId: string, now: string, matterId?: string): Promise<WorkstreamSavedData> {
  const current = await requireActivity(q, wsid)
  const client = await requireClient(q, clientId)
  const matter = await matterForClient(q, client.id, matterId)
  await q.update(
    {
      id: current.id,
      clientId: client.id,
      leadId: null,
      matterId: matter.id,
      subgroup: current.subgroup,
      extraSubgroups: null,
      activityAt: current.activity_at,
      subject: current.subject,
      noteBody: current.note_body,
      noteFormat: current.note_format === 'html' ? 'html' : 'plain',
      nextStepsJson: current.next_steps_json ?? '[]',
      assigneeUserId: current.assignee_user_id,
      assigneeContactId: current.assignee_contact_id,
      assigneeLabel: current.assignee_label,
      now,
    },
    auditFor(actor, 'MOVE', { id: current.id, clientId: client.id }, { wsid, fromClientId: current.client_id, fromLeadId: current.lead_id, toClientId: client.id, toMatterId: matter.id }),
  )
  return getActivity(q, wsid)
}

/** Deletes an entry (the route allows only a super admin). */
export async function deleteActivity(q: WorkstreamQueries, actor: WorkstreamActor, wsid: string): Promise<WorkstreamDeletedData> {
  const current = await requireActivity(q, wsid)
  await q.remove(current.id, auditFor(actor, 'DELETE', { id: current.id, clientId: current.client_id }, { wsid, subgroup: current.subgroup, subject: current.subject }))
  return { wsid, deleted: true }
}

/** Active staff users, labeled `<staff code> - <name>` as before, in name order. */
export async function listAssignees(q: WorkstreamQueries): Promise<WorkstreamAssigneesData> {
  const users = (await q.staffUsers()).map((person) => {
    const displayName = personName(person, person.email)
    return { id: person.id, label: `${person.staff_code?.trim() || person.id} - ${displayName}`, displayName, staffCode: person.staff_code?.trim() || null }
  })
  return { users: users.sort((left, right) => left.displayName.localeCompare(right.displayName)) }
}

/** A client's current email addresses (its own, or each active member's for a group), primary first. */
export async function emailRecipients(q: WorkstreamQueries, clientId: string): Promise<WorkstreamEmailRecipientsData> {
  const client = await requireClient(q, clientId)
  const seen = new Set<string>()
  const recipients = (await q.clientEmailMethods(client))
    .map((row) => ({
      email: row.value.trim().toLowerCase(),
      label: row.owner_kind === 'entity' ? row.legal_name?.trim() || client.display_name || 'Entity' : personName({ preferred_name: row.preferred_name, first_name: row.first_name, middle_name: null, last_name: row.last_name }, client.display_name || 'Client'),
      primary: Number(row.is_primary) === 1,
    }))
    .filter((row) => EMAIL_ADDRESS.test(row.email))
    .sort((left, right) => Number(right.primary) - Number(left.primary))
    .filter((row) => (seen.has(row.email) ? false : (seen.add(row.email), true)))
  return { clientId: client.id, clientNumber: client.client_number, clientDisplayName: client.display_name, recipients }
}

/** Cleans a list of addresses; null when any is not an address. */
export function cleanAddresses(values: readonly string[] | undefined): string[] | null {
  const cleaned = (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean)
  return cleaned.some((value) => !EMAIL_ADDRESS.test(value)) ? null : Array.from(new Set(cleaned))
}

async function emailMatter(q: WorkstreamQueries, body: WorkstreamEmailBody): Promise<{ client: ClientRow; matter: MatterRow }> {
  const client = await requireClient(q, body.clientId)
  return { client, matter: await matterForClient(q, client.id, body.matterId) }
}

/** The email as it will look, with its tagged subject. Sends and records nothing. */
export async function previewEmail(q: WorkstreamQueries, actor: WorkstreamActor, body: WorkstreamEmailBody): Promise<WorkstreamEmailPreviewData> {
  const { matter } = await emailMatter(q, body)
  const email = buildFirmEmail({ message: body.message.trim() || '(your message)', senderDisplayName: actor.displayName })
  return { subject: tagEmailSubject(body.subject, matter.matter_number), html: previewHtml(email) }
}

/**
 * Sends the email from the firm mailbox and records an `Emails` entry on its matter. A failure to record the entry
 * is reported in `workstreamError`, not thrown: the email has already gone.
 */
export async function sendEmail(q: WorkstreamQueries, mailer: Mailer, actor: WorkstreamActor, body: WorkstreamEmailBody, now: string): Promise<WorkstreamEmailSentData> {
  const to = cleanAddresses(body.to)
  if (!to?.length) throw new WorkstreamError('WORKSTREAM_EMAIL_INVALID_RECIPIENT', 422, 'Give at least one valid recipient address.')
  const cc = cleanAddresses(body.cc)
  if (!cc) throw new WorkstreamError('WORKSTREAM_EMAIL_INVALID_CC', 422, 'A copy address is not valid.')
  if (!body.subject.trim()) throw new WorkstreamError('WORKSTREAM_EMAIL_SUBJECT_REQUIRED', 422, 'The email needs a subject.')
  const message = body.message.trim()
  if (!message) throw new WorkstreamError('WORKSTREAM_EMAIL_MESSAGE_REQUIRED', 422, 'The email needs a message.')
  const { client, matter } = await emailMatter(q, body)
  const subject = tagEmailSubject(body.subject, matter.matter_number)
  const email = buildFirmEmail({ message, senderDisplayName: actor.displayName })
  const result = await mailer.sendEmail({
    sender: 'firm',
    to,
    cc,
    subject,
    html: email.html,
    text: email.text,
    inlineImages: email.inlineImages,
    headers: { 'X-KR-Doc': 'workstream', 'X-KR-Client': client.client_number ?? '', 'X-KR-Matter': matter.matter_number },
    requestId: `${actor.requestId}:email`,
  })
  if (!result.sent) {
    if (result.provider === 'not_configured') throw new WorkstreamError('WORKSTREAM_EMAIL_NOT_CONFIGURED', 503, 'The firm mailbox is not set up on this server.')
    throw new WorkstreamError('WORKSTREAM_EMAIL_FAILED', 502, 'Gmail did not accept the email.', { reason: result.reason ?? null })
  }
  let workstreamWsid: string | null = null
  let workstreamError: string | null = null
  try {
    const saved = await createActivity(
      q,
      actor,
      {
        subgroup: 'Emails',
        clientId: client.id,
        matterId: matter.id,
        title: `Email to ${to.join(', ')}: ${subject}`,
        note: [`Sent by ${actor.displayName} via KR Homebase.`, cc.length ? `Cc: ${cc.join(', ')}` : '', '', message, '', result.messageId ? `Gmail message id: ${result.messageId}` : ''].join('\n').trim(),
      },
      now,
    )
    workstreamWsid = saved.activity.wsid
  } catch (error) {
    workstreamError = error instanceof WorkstreamError ? error.code : 'WORKSTREAM_UNAVAILABLE'
  }
  return { sent: true, messageId: result.messageId ?? null, to, cc, subject, matterNumber: matter.matter_number, workstreamWsid, workstreamError }
}
