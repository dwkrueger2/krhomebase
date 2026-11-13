// file: apps/api/src/features/employee-documents/routes.ts
/**
 * Employee Documents (Settings plan, stage 5). Replaces the old `GET`/`POST /krhomebase/api/employee-documents` and
 * `GET /krhomebase/api/employee-documents/{documentId}`.
 *
 *   GET  /v1/employee-documents?employeeId=        the employees the viewer may see, and one employee's documents
 *   POST /v1/employee-documents                    upload one file (multipart form)
 *   GET  /v1/employee-documents/{documentId}/file  the file, shown in the browser
 *
 * Anyone signed in may call them; the scoped grant `employee_documents.read|create` (own, team, all) decides whose
 * documents (`rules.ts`). Files live in the R2 bucket bound as `EMPLOYEE_STORAGE` (`kr-homebase-employee-storage`).
 * Outside tools: closed.
 */

import {
  EmployeeDocumentParams,
  EmployeeDocumentsData,
  EmployeeDocumentsQuery,
  EmployeeDocumentUploadedData,
  EmployeeDocumentUploadForm,
  ErrorEnvelope,
  successEnvelope,
} from '@krhomebase/contracts'
import type { Context } from 'hono'
import { z } from 'zod'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { resolveEffectivePermissions } from '../permissions/rules.ts'
import { EmployeeDocumentsUnavailableError, employeeDocumentQueriesFor } from './queries.ts'
import { EmployeeDocumentError, listDocuments, readDocumentFile, storageFor, uploadDocument, type DocumentViewer } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const err = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'Employee Documents cannot be reached right now (EMPLOYEE_DOCUMENTS_UNAVAILABLE).'

export const employeeDocumentsRoute = defineRoute({
  method: 'get',
  path: '/v1/employee-documents',
  feature: 'employee-documents',
  summary: 'The employees whose documents the viewer may read, and one employee’s documents.',
  access: 'signed-in',
  errors: ['EMPLOYEE_DOCUMENTS_READ_NOT_AUTHORIZED', 'EMPLOYEE_DOCUMENTS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: EmployeeDocumentsQuery },
  responses: { 200: { description: 'The employees and documents.', content: json(successEnvelope(EmployeeDocumentsData)) }, 403: err('Not allowed to see that employee.'), 503: err(UNAVAILABLE) },
})

export const uploadEmployeeDocumentRoute = defineRoute({
  method: 'post',
  path: '/v1/employee-documents',
  feature: 'employee-documents',
  summary: 'Uploads one private HR file for an employee.',
  access: 'signed-in',
  errors: [
    'VALIDATION_EMPLOYEE_DOCUMENT_CATEGORY_INVALID',
    'VALIDATION_EMPLOYEE_DOCUMENT_TYPE_UNSUPPORTED',
    'VALIDATION_EMPLOYEE_DOCUMENT_EMPTY',
    'VALIDATION_EMPLOYEE_DOCUMENT_TOO_LARGE',
    'VALIDATION_EMPLOYEE_DOCUMENT_FILE_REQUIRED',
    'EMPLOYEE_DOCUMENT_CREATE_NOT_AUTHORIZED',
    'EMPLOYEE_DOCUMENTS_UNAVAILABLE',
  ],
  sideEffects: ['Writes the file to R2 (kr-homebase-employee-storage)', 'Writes media_asset and document_record', 'Writes audit_log'],
  request: { body: { required: true, content: { 'multipart/form-data': { schema: EmployeeDocumentUploadForm } } } },
  responses: {
    201: { description: 'Stored.', content: json(successEnvelope(EmployeeDocumentUploadedData)) },
    403: err('Not allowed to add documents for that employee.'),
    422: err('A field, the file type or the file size (25 MB at most) is not accepted.'),
    503: err(UNAVAILABLE),
  },
})

export const employeeDocumentFileRoute = defineRoute({
  method: 'get',
  path: '/v1/employee-documents/{documentId}/file',
  feature: 'employee-documents',
  summary: 'The stored file of one employee document, shown inline (not cached).',
  access: 'signed-in',
  errors: ['EMPLOYEE_DOCUMENT_NOT_FOUND', 'EMPLOYEE_DOCUMENT_FILE_MISSING', 'EMPLOYEE_DOCUMENTS_READ_NOT_AUTHORIZED', 'EMPLOYEE_DOCUMENTS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: EmployeeDocumentParams },
  responses: {
    200: { description: 'The file.', content: { 'application/octet-stream': { schema: z.string().describe('The file bytes.') } } },
    403: err('Not allowed to see that document.'),
    404: err('No such document, or its file is missing.'),
    503: err(UNAVAILABLE),
  },
})

async function viewerOf(c: Context<AppEnv>): Promise<DocumentViewer | null> {
  const session = c.get('session')
  const permissionQueries = permissionQueriesFor(c.env)
  if (!session || !permissionQueries) return null
  return { userId: session.userId, permissions: await resolveEffectivePermissions(permissionQueries, session.userId) }
}

function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof EmployeeDocumentError) {
    logLine('EMPLOYEE_DOCUMENTS:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message)
  }
  if (error instanceof EmployeeDocumentsUnavailableError) return failure(c, 503, 'EMPLOYEE_DOCUMENTS_UNAVAILABLE', 'Employee Documents are not available right now.')
  throw error
}

export function registerEmployeeDocuments(app: OpenAPIHono<AppEnv>) {
  app.openapi(employeeDocumentsRoute, async (c) => {
    const queries = employeeDocumentQueriesFor(c.env)
    const viewer = queries ? await viewerOf(c) : null
    if (!queries || !viewer) return failure(c, 503, 'EMPLOYEE_DOCUMENTS_UNAVAILABLE', 'Employee Documents are not available right now.')
    try {
      const data = await listDocuments(queries, viewer, c.req.valid('query').employeeId || undefined)
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error) as never
    }
  })

  app.openapi(uploadEmployeeDocumentRoute, async (c) => {
    const queries = employeeDocumentQueriesFor(c.env)
    const bucket = (c.env as { EMPLOYEE_STORAGE?: R2Bucket } | undefined)?.EMPLOYEE_STORAGE
    const viewer = queries && bucket ? await viewerOf(c) : null
    const session = c.get('session')
    if (!queries || !bucket || !viewer || !session) return failure(c, 503, 'EMPLOYEE_DOCUMENTS_UNAVAILABLE', 'Employee Documents are not available right now.')
    try {
      const form = c.req.valid('form')
      const file = form.file
      if (!(file instanceof File)) return failure(c, 422, 'VALIDATION_EMPLOYEE_DOCUMENT_FILE_REQUIRED', 'Choose a file to upload.')
      const document = await uploadDocument(
        {
          queries,
          storage: storageFor(bucket),
          viewer,
          now: new Date().toISOString(),
          audit: { requestId: c.get('requestId'), actorUserId: session.userId, actorEmail: session.email ?? null, actorRole: session.role ?? null },
        },
        { employeeId: form.employeeId, category: form.category, title: form.title, receivedDate: form.receivedDate, notes: form.notes, file },
      )
      logLine('EMPLOYEE_DOCUMENTS:uploaded', c.get('requestId'), { documentId: document.id, category: document.category, bytes: document.byteSize ?? 0 })
      return c.json({ ok: true as const, data: { document }, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return refused(c, error) as never
    }
  })

  app.openapi(employeeDocumentFileRoute, async (c) => {
    const queries = employeeDocumentQueriesFor(c.env)
    const bucket = (c.env as { EMPLOYEE_STORAGE?: R2Bucket } | undefined)?.EMPLOYEE_STORAGE
    const viewer = queries && bucket ? await viewerOf(c) : null
    if (!queries || !bucket || !viewer) return failure(c, 503, 'EMPLOYEE_DOCUMENTS_UNAVAILABLE', 'Employee Documents are not available right now.')
    try {
      const file = await readDocumentFile(queries, storageFor(bucket), viewer, c.req.valid('param').documentId)
      return new Response(file.body, { status: 200, headers: file.headers }) as never
    } catch (error) {
      return refused(c, error) as never
    }
  })
}
