// file: packages/contracts/src/employeeDocuments.ts
/**
 * Employee Documents (Settings and Dashboard plan, stage 5; moved from Application Settings to Firm Settings). Private
 * HR files for each employee, stored in the R2 bucket `kr-homebase-employee-storage`, listed in `document_record` with
 * the file in `media_asset`.
 *
 *   GET  /v1/employee-documents?employeeId=     the employees the viewer may see, and one employee's documents
 *   POST /v1/employee-documents                 upload one file (multipart: employeeId, category, title?, receivedDate?, notes?, file)
 *   GET  /v1/employee-documents/{documentId}/file   the file itself (shown in the browser)
 *
 * Who sees whom is the scoped grant `employee_documents.<action>.own|team|all` (Role Sets). There is no delete: hard
 * delete stays off until retention rules exist, as before.
 *
 * Old routes: `GET`/`POST /krhomebase/api/employee-documents` and `GET /krhomebase/api/employee-documents/{documentId}`.
 */

import { z } from 'zod'

/** The old categories, stored as `document_record.document_type`. */
export const EMPLOYEE_DOCUMENT_CATEGORIES = ['i9', 'w4', 'w9', 'offer-letter', 'handbook-acknowledgment', 'performance-review', 'new-hire', 'termination', 'payroll-support', 'other'] as const
export type EmployeeDocumentCategory = (typeof EMPLOYEE_DOCUMENT_CATEGORIES)[number]

/** Files accepted (the old client-upload list) and their extensions. */
export const EMPLOYEE_DOCUMENT_CONTENT_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

/** The largest file accepted (25 MB, the old limit). */
export const EMPLOYEE_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export const EmployeeDocumentEmployee = z.object({
  id: z.string().describe('Employee id.'),
  name: z.string().describe('Name, else the sign-in email.'),
  employeeNumber: z.string().nullable().describe('Employee number.'),
  canCreate: z.boolean().describe('The viewer may upload documents for this employee.'),
  isOwn: z.boolean().describe("The viewer's own employee record (User Settings → Employee File shows it)."),
})
export type EmployeeDocumentEmployee = z.infer<typeof EmployeeDocumentEmployee>

export const EmployeeDocument = z.object({
  id: z.string().describe('Document id (`doc_<uuid>`).'),
  employeeId: z.string().describe('The employee the document belongs to.'),
  title: z.string().describe('Title (the file name when none was given).'),
  category: z.string().describe('Category (one of the categories; older rows may hold another word).'),
  storageStatus: z.string().describe('active, superseded, draft or deleted.'),
  receivedDate: z.string().nullable().describe('When the firm received it (YYYY-MM-DD).'),
  notes: z.string().nullable().describe('Notes.'),
  createdAt: z.string().describe('When it was uploaded.'),
  fileName: z.string().nullable().describe('Original file name.'),
  contentType: z.string().nullable().describe('File type.'),
  byteSize: z.number().nullable().describe('File size in bytes.'),
  fileUrl: z.string().nullable().describe('Address of the file (this site), or empty when the file is missing.'),
})
export type EmployeeDocument = z.infer<typeof EmployeeDocument>

export const EmployeeDocumentsQuery = z.object({
  employeeId: z.string().trim().max(100).optional().describe('Whose documents to list; left out: the first employee the viewer may see.'),
})
export type EmployeeDocumentsQuery = z.infer<typeof EmployeeDocumentsQuery>

export const EmployeeDocumentsData = z.object({
  employees: z.array(EmployeeDocumentEmployee).describe('Employees whose documents the viewer may read, by name.'),
  employeeId: z.string().nullable().describe('The employee listed below (empty when the viewer may see none).'),
  documents: z.array(EmployeeDocument).describe("That employee's documents, newest first."),
})
export type EmployeeDocumentsData = z.infer<typeof EmployeeDocumentsData>

/** The multipart upload's text fields (the file is the `file` part). */
export const EmployeeDocumentUploadForm = z.object({
  employeeId: z.string().trim().min(1).max(100).describe('The employee.'),
  category: z.enum(EMPLOYEE_DOCUMENT_CATEGORIES).describe('Category.'),
  title: z.string().trim().max(200).optional().describe('Title; the file name when blank.'),
  receivedDate: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().describe('When the firm received it (YYYY-MM-DD).'),
  notes: z.string().trim().max(2000).optional().describe('Notes.'),
  file: z.any().describe('The file (PDF, image, text, CSV, Word or Excel; 25 MB at most).'),
})
export type EmployeeDocumentUploadForm = z.infer<typeof EmployeeDocumentUploadForm>

export const EmployeeDocumentUploadedData = z.object({
  document: EmployeeDocument.describe('The document as stored.'),
})
export type EmployeeDocumentUploadedData = z.infer<typeof EmployeeDocumentUploadedData>

export const EmployeeDocumentParams = z.object({ documentId: z.string().min(1).max(100).describe('Document id.') })
export type EmployeeDocumentParams = z.infer<typeof EmployeeDocumentParams>
