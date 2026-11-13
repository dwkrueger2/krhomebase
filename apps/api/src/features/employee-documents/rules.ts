// file: apps/api/src/features/employee-documents/rules.ts
/**
 * Employee Documents rules (Settings plan, stage 5). Ported from the old `api/employee-documents/route.ts`,
 * `api/employee-documents/[documentId]/route.ts`, `hb-lib/employeeDocuments/employeeDocumentStorage.ts` and the
 * client-upload checks of `_server/krMediaUpload.ts`.
 *
 * Kept: whom a person may see is the scoped grant `employee_documents.<action>` — `own` (their own employee record),
 * `team` (members of a team they lead, both links in effect now) or `all`; the ten categories; the file types and the
 * 25 MB limit; the R2 key `employees/<employeeId>/hr/<category>/<documentId>/<safe name>`; the title falls back to the
 * file name; the file is shown inline with `Cache-Control: no-store`; no delete route (hard delete stays off).
 *
 * Changed from the old routes:
 * - The rows use the values the database allows: `media_asset.purpose = 'employee_file'`,
 *   `document_record.storage_type = 'r2_object'` and `source = 'employee'`. The old route wrote `employee_document`,
 *   `r2` and `employee_documents`, which the CHECK rules refuse, so its uploads could not be saved.
 * - The two rows and the audit row are one batch, written after the file is in R2; if the batch fails the file is
 *   removed. The old route wrote each row on its own and marked them failed afterwards.
 * - The list reads one employee's documents; the old route read every document and every file row and filtered them.
 * - The R2 binding replaces the old S3 client and its keys.
 */

import { EMPLOYEE_DOCUMENT_CATEGORIES, EMPLOYEE_DOCUMENT_CONTENT_TYPES, EMPLOYEE_DOCUMENT_MAX_BYTES, type EmployeeDocument, type EmployeeDocumentsData } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import { isCurrentWindow, scopedGrantAllows, type EffectivePermissions } from '../permissions/rules.ts'
import type { DocumentRow, EmployeeDocumentQueries } from './queries.ts'

export const EMPLOYEE_DOCUMENT_BUCKET = 'kr-homebase-employee-storage'

/** A refused request. */
export class EmployeeDocumentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 403 | 404 | 422,
  ) {
    super(message)
    this.name = 'EmployeeDocumentError'
  }
}

/** The R2 calls this area makes (a fake in tests). */
export interface DocumentStorage {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>
  delete(key: string): Promise<void>
}

export function storageFor(bucket: R2Bucket): DocumentStorage {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    async get(key) {
      const object = await bucket.get(key)
      return object ? { body: object.body, size: object.size } : null
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}

export interface DocumentViewer {
  userId: string
  permissions: EffectivePermissions
}

type Action = 'create' | 'read'

/** The employee ids the viewer may `read` or `create` for (old `allowedEmployeeIds`). */
export async function allowedEmployeeIds(queries: EmployeeDocumentQueries, viewer: DocumentViewer, action: Action, employees: Array<{ id: string; user_id: string }>): Promise<Set<string>> {
  const allows = (scope: 'own' | 'team' | 'all') => scopedGrantAllows(viewer.permissions, 'employee_documents', action, scope)
  if (allows('all')) return new Set(employees.map((row) => row.id))
  const result = new Set<string>()
  const own = employees.find((row) => row.user_id === viewer.userId)
  if (own && allows('own')) result.add(own.id)
  if (allows('team')) {
    const now = Date.now()
    for (const link of await queries.leadLinks(viewer.userId)) {
      if (isCurrentWindow(link.lead_starts_at, link.lead_ends_at, now) && isCurrentWindow(link.member_starts_at, link.member_ends_at, now)) result.add(link.employee_id)
    }
  }
  return result
}

function toDocument(row: DocumentRow): EmployeeDocument {
  return {
    id: row.id,
    employeeId: row.employee_id,
    title: row.title,
    category: row.document_type ?? 'other',
    storageStatus: row.storage_status,
    receivedDate: row.received_date,
    notes: row.notes,
    createdAt: row.created_at,
    fileName: row.original_filename,
    contentType: row.content_type,
    byteSize: row.byte_size,
    fileUrl: row.r2_key ? `/api/v1/employee-documents/${encodeURIComponent(row.id)}/file` : null,
  }
}

/** The employees the viewer may read, and one employee's documents. */
export async function listDocuments(queries: EmployeeDocumentQueries, viewer: DocumentViewer, employeeId: string | undefined): Promise<EmployeeDocumentsData> {
  const employees = await queries.employees()
  const [readable, creatable] = await Promise.all([allowedEmployeeIds(queries, viewer, 'read', employees), allowedEmployeeIds(queries, viewer, 'create', employees)])
  const visible = employees.filter((row) => readable.has(row.id))
  const chosen = employeeId ? (readable.has(employeeId) ? employeeId : null) : (visible[0]?.id ?? null)
  if (employeeId && !chosen) throw new EmployeeDocumentError('EMPLOYEE_DOCUMENTS_READ_NOT_AUTHORIZED', 'You may not see that employee’s documents.', 403)
  return {
    employees: visible.map((row) => ({ id: row.id, name: row.person_name.trim() || row.email, employeeNumber: row.employee_number, canCreate: creatable.has(row.id), isOwn: row.user_id === viewer.userId })),
    employeeId: chosen,
    documents: chosen ? (await queries.documents(chosen)).map(toDocument) : [],
  }
}

/** A file name safe for the R2 key (old `buildEmployeeDocumentR2Key` rule). */
export function safeFileName(name: string): string {
  return name.trim().split(/[\\/]/).pop()!.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
}

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface UploadInput {
  employeeId: string
  category: string
  title?: string | undefined
  receivedDate?: string | undefined
  notes?: string | undefined
  file: File
}

export interface UploadContext {
  queries: EmployeeDocumentQueries
  storage: DocumentStorage
  viewer: DocumentViewer
  audit: Omit<AuditEntry, 'action' | 'targetTable' | 'targetId' | 'newJson' | 'resource'>
  now: string
  newId?: () => string
}

/** Checks one upload, stores the file in R2, then the rows; removes the file again when the rows fail. */
export async function uploadDocument(context: UploadContext, input: UploadInput): Promise<EmployeeDocument> {
  const { queries, storage, viewer, now } = context
  if (!(EMPLOYEE_DOCUMENT_CATEGORIES as readonly string[]).includes(input.category)) throw new EmployeeDocumentError('VALIDATION_EMPLOYEE_DOCUMENT_CATEGORY_INVALID', 'Choose a category.', 422)
  const employees = await queries.employees()
  if (!(await allowedEmployeeIds(queries, viewer, 'create', employees)).has(input.employeeId)) {
    throw new EmployeeDocumentError('EMPLOYEE_DOCUMENT_CREATE_NOT_AUTHORIZED', 'You may not add documents for that employee.', 403)
  }
  const contentType = (input.file.type || 'application/octet-stream').toLowerCase()
  const typeExt = EMPLOYEE_DOCUMENT_CONTENT_TYPES[contentType]
  if (!typeExt) throw new EmployeeDocumentError('VALIDATION_EMPLOYEE_DOCUMENT_TYPE_UNSUPPORTED', 'Use a PDF, an image, a text or CSV file, or a Word or Excel file.', 422)
  if (input.file.size <= 0) throw new EmployeeDocumentError('VALIDATION_EMPLOYEE_DOCUMENT_EMPTY', 'The file is empty.', 422)
  if (input.file.size > EMPLOYEE_DOCUMENT_MAX_BYTES) throw new EmployeeDocumentError('VALIDATION_EMPLOYEE_DOCUMENT_TOO_LARGE', 'The file is larger than 25 MB.', 422)

  const id = context.newId ?? (() => crypto.randomUUID())
  const documentId = `doc_${id()}`
  const originalFilename = input.file.name || `document.${typeExt}`
  const nameExt = /\.([a-z0-9]{1,8})$/i.exec(originalFilename)?.[1]?.toLowerCase()
  const key = `employees/${input.employeeId}/hr/${input.category}/${documentId}/${safeFileName(originalFilename)}`
  const body = await input.file.arrayBuffer()
  const sha256 = await sha256Hex(body)
  await storage.put(key, body, contentType)
  const doc = {
    documentId,
    mediaId: `media_${id()}`,
    employeeId: input.employeeId,
    bucket: EMPLOYEE_DOCUMENT_BUCKET,
    key,
    contentType,
    byteSize: body.byteLength,
    originalFilename,
    fileExt: nameExt ?? typeExt,
    sha256,
    title: input.title?.trim() || originalFilename,
    category: input.category,
    receivedDate: input.receivedDate?.trim() || null,
    notes: input.notes?.trim() || null,
    userId: viewer.userId,
    now,
  }
  try {
    await queries.insertDocument(doc, { ...context.audit, resource: 'employee_documents', action: 'CREATE', targetTable: 'document_record', targetId: documentId, newJson: { employeeId: doc.employeeId, category: doc.category, byteSize: doc.byteSize, contentType } })
  } catch (error) {
    await storage.delete(key).catch(() => undefined)
    throw error
  }
  return toDocument({
    id: documentId,
    employee_id: doc.employeeId,
    title: doc.title,
    document_type: doc.category,
    storage_status: 'active',
    received_date: doc.receivedDate,
    notes: doc.notes,
    created_at: now,
    media_id: doc.mediaId,
    r2_bucket: doc.bucket,
    r2_key: key,
    content_type: contentType,
    byte_size: doc.byteSize,
    original_filename: originalFilename,
  })
}

/** The stored file of a document the viewer may read, with the headers to send it. */
export async function readDocumentFile(queries: EmployeeDocumentQueries, storage: DocumentStorage, viewer: DocumentViewer, documentId: string): Promise<{ body: ReadableStream; headers: Record<string, string> }> {
  const row = await queries.document(documentId)
  if (!row) throw new EmployeeDocumentError('EMPLOYEE_DOCUMENT_NOT_FOUND', 'That document does not exist.', 404)
  const employees = await queries.employees()
  if (!(await allowedEmployeeIds(queries, viewer, 'read', employees)).has(row.employee_id)) throw new EmployeeDocumentError('EMPLOYEE_DOCUMENTS_READ_NOT_AUTHORIZED', 'You may not see that document.', 403)
  const object = row.r2_key ? await storage.get(row.r2_key) : null
  if (!object) throw new EmployeeDocumentError('EMPLOYEE_DOCUMENT_FILE_MISSING', 'The file for that document is missing.', 404)
  const name = (row.original_filename ?? 'document').replace(/["\r\n]/g, '')
  return {
    body: object.body,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': row.content_type || 'application/octet-stream',
      'Content-Length': String(object.size),
      'Content-Disposition': `inline; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  }
}
