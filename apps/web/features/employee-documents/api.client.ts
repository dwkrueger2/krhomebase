'use client'
// file: apps/web/features/employee-documents/api.client.ts
/**
 * The Employee Documents area's calls to the API from the browser (Settings plan, stage 5):
 *
 *   GET  /api/v1/employee-documents?employeeId=   the employees the viewer may see, and one employee's documents
 *   POST /api/v1/employee-documents               upload one file (multipart form)
 *
 * A document's file opens at its `fileUrl` (`/api/v1/employee-documents/{id}/file`) in a new tab; this site forwards
 * all three to the API Worker. Replies are checked against the shared contract; a failure throws
 * `EmployeeDocumentsApiError`.
 */

import { EmployeeDocumentsData, EmployeeDocumentUploadedData, ErrorEnvelope, successEnvelope, type EmployeeDocument } from '@krhomebase/contracts'
import { L } from '@/lib/KRUtilities'

/** A refused or failed Employee Documents call. */
export class EmployeeDocumentsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'EmployeeDocumentsApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  EMPLOYEE_DOCUMENTS_UNAVAILABLE: 'Employee Documents cannot be reached right now. Try again in a moment.',
  EMPLOYEE_DOCUMENTS_READ_NOT_AUTHORIZED: 'You may not see that employee’s documents.',
  EMPLOYEE_DOCUMENT_CREATE_NOT_AUTHORIZED: 'You may not add documents for that employee.',
  VALIDATION_EMPLOYEE_DOCUMENT_CATEGORY_INVALID: 'Choose a category.',
  VALIDATION_EMPLOYEE_DOCUMENT_TYPE_UNSUPPORTED: 'Use a PDF, an image, a text or CSV file, or a Word or Excel file.',
  VALIDATION_EMPLOYEE_DOCUMENT_EMPTY: 'The file is empty.',
  VALIDATION_EMPLOYEE_DOCUMENT_TOO_LARGE: 'The file is larger than 25 MB.',
  VALIDATION_EMPLOYEE_DOCUMENT_FILE_REQUIRED: 'Select an employee and a document file.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  VALIDATION_FAILED: 'Some values are not valid.',
}

async function refusal(response: Response, reply: unknown, what: string): Promise<never> {
  const parsed = ErrorEnvelope.safeParse(reply)
  const code = parsed.success ? parsed.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = parsed.success ? (parsed.data.requestId ?? null) : null
  L(`[EMPLOYEE_DOCUMENTS_API:45] refused ${what} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new EmployeeDocumentsApiError(code, ERROR_SENTENCES[code] ?? 'The request did not finish.', response.status, requestId)
}

async function reach(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'same-origin', ...init })
  } catch (error) {
    L(`[EMPLOYEE_DOCUMENTS_API:53] network failure ${what} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new EmployeeDocumentsApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
}

/** The employees the viewer may see, and one employee's documents (the first employee when none is named). */
export async function fetchEmployeeDocuments(employeeId?: string): Promise<EmployeeDocumentsData> {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : ''
  const response = await reach(`/api/v1/employee-documents${query}`, { method: 'GET' }, 'list')
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(EmployeeDocumentsData).safeParse(reply)
  if (response.ok && parsed.success) return parsed.data.data
  return refusal(response, reply, 'list')
}

/** The fields of one upload. */
export interface EmployeeDocumentUpload {
  employeeId: string
  category: string
  title: string
  receivedDate: string
  file: File
}

/** Uploads one file to private storage. */
export async function uploadEmployeeDocument(upload: EmployeeDocumentUpload): Promise<EmployeeDocument> {
  const form = new FormData()
  form.set('employeeId', upload.employeeId)
  form.set('category', upload.category)
  if (upload.title.trim()) form.set('title', upload.title.trim())
  if (upload.receivedDate) form.set('receivedDate', upload.receivedDate)
  form.set('file', upload.file)
  const response = await reach('/api/v1/employee-documents', { method: 'POST', body: form }, 'upload')
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(EmployeeDocumentUploadedData).safeParse(reply)
  if (response.ok && parsed.success) return parsed.data.data.document
  return refusal(response, reply, 'upload')
}
