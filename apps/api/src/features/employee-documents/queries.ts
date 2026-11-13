// file: apps/api/src/features/employee-documents/queries.ts
/**
 * The only file of the Employee Documents area that talks to D1 (Settings plan, stage 5). Tables (Schema 8.0):
 * `employee` (with `user` and `individual` for the name), `team`, `team_member` and `team_lead` (whom a lead may
 * see), `document_record` and `media_asset` (one document and its file).
 *
 * The file itself is in R2; `rules.ts` writes it first and calls `insertDocument`, which adds the media and document
 * rows with their `audit_log` row in one batch. A failure answers `EmployeeDocumentsUnavailableError`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class EmployeeDocumentsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`EMPLOYEE_DOCUMENTS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'EmployeeDocumentsUnavailableError'
  }
}

export interface DocumentEmployeeRow {
  id: string
  user_id: string
  employee_number: string | null
  person_name: string
  email: string
}

/** One team the viewer leads and one member of it, with both date windows. */
export interface LeadLinkRow {
  employee_id: string
  member_starts_at: string | null
  member_ends_at: string | null
  lead_starts_at: string | null
  lead_ends_at: string | null
}

export interface DocumentRow {
  id: string
  employee_id: string
  title: string
  document_type: string | null
  storage_status: string
  received_date: string | null
  notes: string | null
  created_at: string
  media_id: string | null
  r2_bucket: string | null
  r2_key: string | null
  content_type: string | null
  byte_size: number | null
  original_filename: string | null
}

/** What `rules.ts` decided to store for one upload. */
export interface NewDocument {
  documentId: string
  mediaId: string
  employeeId: string
  bucket: string
  key: string
  contentType: string
  byteSize: number
  originalFilename: string
  fileExt: string
  sha256: string
  title: string
  category: string
  receivedDate: string | null
  notes: string | null
  userId: string
  now: string
}

export interface EmployeeDocumentQueries {
  employees(): Promise<DocumentEmployeeRow[]>
  /** The members of the teams this user leads (active rows of active teams; the date windows are checked in rules). */
  leadLinks(userId: string): Promise<LeadLinkRow[]>
  documents(employeeId: string): Promise<DocumentRow[]>
  document(documentId: string): Promise<DocumentRow | null>
  insertDocument(document: NewDocument, audit: AuditEntry): Promise<void>
}

const DOCUMENT_SELECT = `
  SELECT d.id, d.employee_id, d.title, d.document_type, d.storage_status, d.received_date, d.notes, d.created_at,
         m.id AS media_id, m.r2_bucket, m.r2_key, m.content_type, m.byte_size, m.original_filename
    FROM document_record d LEFT JOIN media_asset m ON m.id = d.primary_media_asset_id AND m.status = 'active'`

export function createEmployeeDocumentQueries(db: D1Database): EmployeeDocumentQueries {
  async function all<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    try {
      return (await db.prepare(sql).bind(...values).all<T>()).results ?? []
    } catch (error) {
      throw new EmployeeDocumentsUnavailableError(error)
    }
  }

  return {
    employees: () =>
      all<DocumentEmployeeRow>(
        `SELECT e.id, e.user_id, e.employee_number, u.email,
                TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) AS person_name
           FROM employee e JOIN user u ON u.id = e.user_id LEFT JOIN individual i ON i.id = u.individual_id
          ORDER BY person_name COLLATE NOCASE, u.email LIMIT 1000`,
      ),

    leadLinks: (userId) =>
      all<LeadLinkRow>(
        `SELECT m.employee_id, m.starts_at AS member_starts_at, m.ends_at AS member_ends_at, l.starts_at AS lead_starts_at, l.ends_at AS lead_ends_at
           FROM team_lead l JOIN team t ON t.id = l.team_id JOIN team_member m ON m.team_id = l.team_id
          WHERE l.user_id = ?1 AND l.is_active = 1 AND m.is_active = 1 AND t.is_active = 1 LIMIT 5000`,
        userId,
      ),

    // Only the documents this area files (owner employee, source employee); archived and deleted ones are hidden.
    documents: (employeeId) =>
      all<DocumentRow>(
        `${DOCUMENT_SELECT}
          WHERE d.employee_id = ?1 AND d.owner_type = 'employee' AND d.source = 'employee' AND d.storage_status NOT IN ('archived', 'deleted')
          ORDER BY d.created_at DESC LIMIT 500`,
        employeeId,
      ),

    async document(documentId) {
      const rows = await all<DocumentRow>(
        `${DOCUMENT_SELECT}
          WHERE d.id = ?1 AND d.owner_type = 'employee' AND d.source = 'employee' AND d.storage_status NOT IN ('archived', 'deleted') LIMIT 1`,
        documentId,
      )
      return rows[0] ?? null
    },

    async insertDocument(doc, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO media_asset (id, r2_bucket, r2_key, owner_type, owner_id, purpose, content_type, byte_size, original_filename, file_ext, sha256,
                 visibility, status, uploaded_by_user_id, created_at, updated_at)
               VALUES (?1, ?2, ?3, 'employee', ?4, 'employee_file', ?5, ?6, ?7, ?8, ?9, 'private', 'active', ?10, ?11, ?11)`,
            )
            .bind(doc.mediaId, doc.bucket, doc.key, doc.employeeId, doc.contentType, doc.byteSize, doc.originalFilename, doc.fileExt, doc.sha256, doc.userId, doc.now),
          db
            .prepare(
              `INSERT INTO document_record (id, owner_type, owner_id, employee_id, title, document_type, storage_type, primary_media_asset_id, storage_status,
                 is_confidential, source, received_date, notes, created_by_user_id, created_at, updated_at)
               VALUES (?1, 'employee', ?2, ?2, ?3, ?4, 'r2_object', ?5, 'active', 1, 'employee', ?6, ?7, ?8, ?9, ?9)`,
            )
            .bind(doc.documentId, doc.employeeId, doc.title, doc.category, doc.mediaId, doc.receivedDate, doc.notes, doc.userId, doc.now),
          auditStatement(db, audit),
        ])
      } catch (error) {
        throw new EmployeeDocumentsUnavailableError(error)
      }
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function employeeDocumentQueriesFor(env: { krhomebase?: D1Database } | undefined): EmployeeDocumentQueries | null {
  return env?.krhomebase ? createEmployeeDocumentQueries(env.krhomebase) : null
}
