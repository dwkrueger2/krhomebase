// file: apps/api/src/features/matters/rules.ts
/**
 * Business rules for Projects & Matters (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 1), ported from
 * the old `kr-api-v1/matters` route and the crud Worker's matter create. The numbering follows
 * `docs/help-docs/Client-and-Matter-Numbering.md`.
 *
 * Kept from the old route:
 * - A matter belongs to a client through `matter_party`; a new matter gets one primary-client party.
 * - The number is `<client number>.<n>`, n one more than the highest positive sequence the client has (`.0` is the
 *   Client General Matters, made with the client by `POST /v1/contacts`, never here).
 * - A `.0` matter is always titled "Client General Matters" and is never deleted.
 * - Initial Notes are a `matter_activity_log` note "Matter Initial Notes", on create and on change.
 * - The delete check lists the record tables that hold rows for the matter; only a super admin may delete, and only
 *   a matter with none.
 *
 * Changed (the requester's decisions of Nov 13, 2026, `docs/API/WorkStream_AsIs_Reference.md` section 8):
 * - No number-prefix fallback in the list (decision 5): only `matter_party` links count.
 * - The change also takes status and opened date (decision 6); create takes them too (old body fields).
 * - The delete needs the typed confirmation `Delete Matter <number>` on the server as well as the screen.
 * - Create, note and audit row are one batch (the old note and title fix were separate calls); the number is retried
 *   on a clash instead of failing. The blocking counts are real counts (the old ones stopped at 1).
 * - The matter's own audit rows leave `audit_log.matter_id` empty, so a new matter with no records stays deletable.
 * - Unknown status or practice-area ids are refused (the old route stored whatever it was sent).
 * - No caller-chosen id and no extra `parties[]` (the import path waits for Data Import).
 */

import {
  CLIENT_GENERAL_MATTER_TITLE,
  isClientGeneralMatterNumber,
  matterDeleteConfirmation,
  type ClientMattersData,
  type Matter,
  type MatterCreateBody,
  type MatterDeleteBody,
  type MatterDeleteCheckData,
  type MatterDeletedData,
  type MatterSavedData,
  type MatterUpdateBody,
} from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import { normalizeClientNumber } from '../contact-edits/rules.ts'
import { MATTER_RECORD_TABLES, type ChoiceRow, type MatterNote, type MatterQueries, type MatterRow } from './queries.ts'

// See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
// Defaults for a new matter: rows of the `matter_status` and `practice_area` choice lists.
export const DEFAULT_MATTER_STATUS = 'lk_matter_status_open'
export const DEFAULT_PRACTICE_AREA = 'lk_practice_area_miscellaneous'

/** Office roles that may write people and matter records (old `KR_API_V1_INTERNAL_WRITE_ROLES`). */
export const MATTER_WRITE_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee'] as const
/** Office roles that may read matters (old `KR_API_V1_INTERNAL_READ_ROLES`). */
export const MATTER_READ_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee', 'billing', 'front_end_author'] as const

/** How many times a create tries the next number when another save took it in between. */
const NUMBER_ATTEMPTS = 3

/** A refusal with its code and HTTP status. */
export class MatterError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'MatterError'
  }
}

/** The signed-in person, from the checked session. */
export interface MatterActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** The calendar date in Chicago (`YYYY-MM-DD`) for an ISO time. */
export function chicagoDate(now: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
}

/**
 * The next specific matter number for a client: one more than the highest positive whole sequence among the numbers
 * that start with `<clientNumber>.`, starting at 1 (the crud Worker's `nextMatterNumber`, unchanged).
 */
export function nextMatterNumber(clientNumber: string, existing: readonly string[]): string {
  const prefix = `${clientNumber}.`
  let next = 1
  for (const number of existing) {
    if (!number.startsWith(prefix)) continue
    const sequence = Number(number.slice(prefix.length))
    if (Number.isSafeInteger(sequence) && sequence >= 1) next = Math.max(next, sequence + 1)
  }
  return `${prefix}${next}`
}

/** Matter numbers compared as the old screen did (numeric parts as numbers). */
export function compareMatterNumbers(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true })
}

/** One database row as the wire shape. A `.0` matter always carries the General Matters title. */
export function serializeMatter(row: MatterRow): Matter {
  const isGeneralMatter = isClientGeneralMatterNumber(row.matter_number)
  return {
    id: row.id,
    matterNumber: row.matter_number,
    title: isGeneralMatter ? CLIENT_GENERAL_MATTER_TITLE : row.title,
    description: row.description,
    isGeneralMatter,
    practiceAreaLookupId: row.practice_area_lookup_id,
    practiceAreaLabel: row.practice_area_label,
    statusLookupId: row.status_lookup_id,
    statusLabel: row.status_label,
    openedDate: row.opened_date,
    closedDate: row.closed_date,
    primaryAttorneyUserId: row.primary_attorney_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const canWrite = (role: string | null) => (MATTER_WRITE_ROLES as readonly string[]).includes(role ?? '')
const isSuperAdmin = (role: string | null) => role === 'super_admin'

function choiceList(rows: ChoiceRow[], category: string) {
  return rows.filter((row) => row.category === category).map((row) => ({ id: row.id, label: row.label }))
}

function requireChoice(rows: ChoiceRow[], category: string, id: string, field: string): void {
  if (!rows.some((row) => row.category === category && row.id === id)) {
    throw new MatterError('MATTER_CHOICE_INVALID', 422, `${field} is not one of the choices.`, { field })
  }
}

function auditFor(actor: MatterActor, action: string, matterId: string, clientId: string | null, newJson: unknown): AuditEntry {
  // matterId is left out on purpose: audit_log is a blocking table for the delete check (queries.ts header).
  return {
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    resource: 'matters',
    action,
    targetTable: 'matter',
    targetId: matterId,
    clientId,
    newJson,
  }
}

function noteFor(actor: MatterActor, matterId: string, notes: string | undefined, now: string): MatterNote | null {
  const text = notes?.trim()
  if (!text) return null
  return { id: `mal_${crypto.randomUUID()}`, matterId, activityDate: chicagoDate(now), description: text, performedByUserId: actor.userId, now }
}

async function requireMatter(q: MatterQueries, matterId: string): Promise<MatterRow> {
  const row = await q.matter(matterId)
  if (!row) throw new MatterError('MATTER_NOT_FOUND', 404, 'No matter has that id.')
  return row
}

/** The client's matters in number order, the choice lists, and what the viewer may do. Writes nothing. */
export async function loadClientMatters(q: MatterQueries, actor: MatterActor, clientId: string): Promise<ClientMattersData> {
  const client = await q.client(clientId)
  if (!client) throw new MatterError('MATTER_CLIENT_NOT_FOUND', 404, 'No client account has that id.')
  const [rows, choices] = await Promise.all([q.clientMatters(clientId), q.choices()])
  return {
    clientId: client.id,
    clientNumber: normalizeClientNumber(client.client_number) ?? client.client_number,
    matters: rows.map(serializeMatter).sort((left, right) => compareMatterNumbers(left.matterNumber, right.matterNumber)),
    statuses: choiceList(choices, 'matter_status'),
    practiceAreas: choiceList(choices, 'practice_area'),
    viewer: { canWrite: canWrite(actor.role), canDelete: isSuperAdmin(actor.role) },
  }
}

/**
 * Creates the client's next numbered matter with its primary-client party, optional Initial Notes and audit row, in
 * one batch. The number is worked out again and retried when another save took it in between.
 */
export async function createMatter(q: MatterQueries, actor: MatterActor, clientId: string, body: MatterCreateBody, now: string): Promise<MatterSavedData> {
  const client = await q.client(clientId)
  if (!client) throw new MatterError('MATTER_CLIENT_NOT_FOUND', 404, 'No client account has that id.')
  const clientNumber = normalizeClientNumber(client.client_number)
  if (!clientNumber) throw new MatterError('MATTER_CLIENT_NUMBER_INVALID', 422, 'The client has no valid client number, so a matter number cannot be made.')

  const choices = await q.choices()
  const statusLookupId = body.statusLookupId ?? DEFAULT_MATTER_STATUS
  const practiceAreaLookupId = body.practiceAreaLookupId ?? DEFAULT_PRACTICE_AREA
  if (body.statusLookupId) requireChoice(choices, 'matter_status', statusLookupId, 'Status')
  if (body.practiceAreaLookupId) requireChoice(choices, 'practice_area', practiceAreaLookupId, 'Practice area')

  const matterId = `mat_${crypto.randomUUID()}`
  const openedDate = body.openedDate ?? chicagoDate(now)
  for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
    const matterNumber = nextMatterNumber(clientNumber, await q.matterNumbersFor(clientNumber))
    const saved = await q.insertMatter(
      {
        id: matterId,
        partyId: `mpa_${crypto.randomUUID()}`,
        clientId: client.id,
        matterNumber,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        practiceAreaLookupId,
        statusLookupId,
        openedDate,
        primaryAttorneyUserId: actor.userId,
        createdByUserId: actor.userId,
        now,
      },
      noteFor(actor, matterId, body.initialNotes, now),
      auditFor(actor, 'CREATE', matterId, client.id, { matterNumber, title: body.title.trim(), statusLookupId, practiceAreaLookupId, openedDate }),
    )
    if (saved) return { matter: serializeMatter(await requireMatter(q, matterId)) }
  }
  throw new MatterError('MATTER_NUMBER_IN_USE', 409, 'Another matter was created for this client at the same moment. Try again.')
}

/** Changes a matter's title (kept on `.0`), description, status and opened date, with optional Initial Notes. */
export async function updateMatter(q: MatterQueries, actor: MatterActor, matterId: string, body: MatterUpdateBody, now: string): Promise<MatterSavedData> {
  const current = await requireMatter(q, matterId)
  const statusLookupId = body.statusLookupId ?? current.status_lookup_id
  if (statusLookupId !== current.status_lookup_id) requireChoice(await q.choices(), 'matter_status', statusLookupId, 'Status')
  const title = isClientGeneralMatterNumber(current.matter_number) ? CLIENT_GENERAL_MATTER_TITLE : body.title.trim()
  const description = body.description === undefined ? current.description : body.description?.trim() || null
  const openedDate = body.openedDate === undefined ? current.opened_date : body.openedDate
  await q.updateMatter(
    { id: matterId, title, description, statusLookupId, openedDate, now },
    noteFor(actor, matterId, body.initialNotes, now),
    auditFor(actor, 'UPDATE', matterId, null, { matterNumber: current.matter_number, title, description, statusLookupId, openedDate, initialNotes: Boolean(body.initialNotes?.trim()) }),
  )
  return { matter: serializeMatter(await requireMatter(q, matterId)) }
}

const LABELS = new Map<string, string>(MATTER_RECORD_TABLES)

/** What blocks deleting a matter: the `.0` rule, or the record tables with rows for it. */
async function blockingItems(q: MatterQueries, row: MatterRow) {
  if (isClientGeneralMatterNumber(row.matter_number)) {
    return { protectedGeneralMatter: true, items: [{ table: 'client_general_matter', label: 'Client General Matters (.0)', count: 1 }] }
  }
  const counts = await q.recordCounts(row.id)
  return { protectedGeneralMatter: false, items: counts.map((item) => ({ table: item.table, label: LABELS.get(item.table) ?? item.table, count: item.count })) }
}

/** Whether the viewer may delete the matter now, and what blocks it. Writes nothing. */
export async function checkMatterDelete(q: MatterQueries, actor: MatterActor, matterId: string): Promise<MatterDeleteCheckData> {
  const row = await requireMatter(q, matterId)
  const { protectedGeneralMatter, items } = await blockingItems(q, row)
  return {
    matterId: row.id,
    matterNumber: row.matter_number,
    canDelete: isSuperAdmin(actor.role) && items.length === 0,
    requiresSuperAdmin: !isSuperAdmin(actor.role),
    protectedGeneralMatter,
    blockingItems: items,
  }
}

/** Deletes a matter that has no records, with its party, access and staff rows, after the typed confirmation. */
export async function deleteMatter(q: MatterQueries, actor: MatterActor, matterId: string, body: MatterDeleteBody): Promise<MatterDeletedData> {
  const row = await requireMatter(q, matterId)
  if (body.confirmation !== matterDeleteConfirmation(row.matter_number)) {
    throw new MatterError('MATTER_DELETE_CONFIRMATION_MISMATCH', 422, `Type exactly "${matterDeleteConfirmation(row.matter_number)}" to delete this matter.`)
  }
  const { protectedGeneralMatter, items } = await blockingItems(q, row)
  if (protectedGeneralMatter) throw new MatterError('MATTER_GENERAL_PROTECTED', 409, 'The Client General Matters (.0) is never deleted.')
  if (items.length) throw new MatterError('MATTER_HAS_RECORDS', 409, 'This matter has records attached, so it cannot be deleted.', { blockingItems: items })
  const deleted = await q.deleteMatter(matterId, auditFor(actor, 'DELETE', matterId, null, { matterNumber: row.matter_number, title: row.title }))
  if (!deleted) {
    const again = await blockingItems(q, row)
    throw new MatterError('MATTER_HAS_RECORDS', 409, 'A record was attached to this matter while it was being deleted, so nothing was deleted.', { blockingItems: again.items })
  }
  return { matterId, matterNumber: row.matter_number, deleted: true }
}
