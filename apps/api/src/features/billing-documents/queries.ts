// file: apps/api/src/features/billing-documents/queries.ts
/**
 * The only file of the billing documents area that talks to D1 (Billing part 7c, `docs/API/Billing_Audit.md`).
 *
 * Tables: `invoice` (read; `sent_at` and status stamped after an invoice email), `client` and `individual` (the names
 * for file names), `document_record` and `media_asset` (the stored copies, the old app's columns and values:
 * `owner_type`, `storage_type 'r2_object'`, `source 'firm'`, `purpose 'document_original'` for the PDF and `'preview'`
 * for the email HTML) and `audit_log` (resource `billing`). Every write is one batch with its audit row. The audit rows
 * carry the client and no `matter_id`, so they never block a matter delete (as the WorkStream and Tasks rows).
 *
 * The seven-character `document_number` is made by the caller (`generatePublicCode`, the crud Worker's rule the old
 * app used) and the insert is tried again on the rare clash of its UNIQUE rule (`isDocumentNumberClash`).
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export type InvoiceRow = { id: string; matter_id: string | null; billed_to_client_id: string; invoice_number: string; status: string; sent_at: string | null }
export type ClientNamesRow = { id: string; client_number: string; display_name: string; first_name: string | null; last_name: string | null }
export type DocumentRow = {
  id: string
  document_number: string | null
  client_id: string | null
  matter_id: string | null
  title: string
  document_type: string | null
  document_date: string | null
  primary_media_asset_id: string | null
  storage_status: string
  notes: string | null
  created_at: string
}
export type MediaRow = { id: string; r2_bucket: string; r2_key: string; purpose: string; content_type: string; byte_size: number; original_filename: string | null; status: string }

/** One stored file's row (the object is already in R2). */
export interface NewMedia {
  id: string
  bucket: string
  key: string
  purpose: 'document_original' | 'preview'
  contentType: string
  byteSize: number
  filename: string
  sha256: string
}

/** The document row to insert. */
export interface NewDocument {
  id: string
  documentNumber: string
  ownerType: 'client' | 'matter'
  ownerId: string
  clientId: string
  matterId: string | null
  title: string
  documentType: string
  documentDate: string
  primaryMediaId: string
  notes: string
  createdByUserId: string
}

export interface BillingDocumentQueries {
  invoice(invoiceId: string): Promise<InvoiceRow | null>
  clientNames(clientId: string): Promise<ClientNamesRow | null>
  /** Inserts the media rows, the document row and the audit row in one batch. */
  storeDocument(media: readonly NewMedia[], document: NewDocument, audit: AuditEntry, now: string): Promise<void>
  /** A document whose email did not go: `storage_status 'superseded'` and a new title, with its audit row. */
  supersedeDocument(documentId: string, title: string, audit: AuditEntry, now: string): Promise<void>
  /** Stamps an emailed invoice: `sent_at`, and status `sent` when it was a draft (that locks it), with its audit row. */
  markInvoiceSent(invoiceId: string, sentAt: string, audit: AuditEntry): Promise<void>
  /** The client's stored documents of one type, newest first. */
  documentsOfType(clientId: string, documentType: string): Promise<DocumentRow[]>
  /** One stored document of the client, by its number or id. */
  findDocument(clientId: string, numberOrId: string): Promise<DocumentRow | null>
  /** The active files of a document (its primary file and the files its notes list). */
  documentFiles(mediaIds: readonly string[]): Promise<MediaRow[]>
}

/** Raised when the database cannot be reached or a table is missing. */
export class BillingDocumentsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`BILLING_DOCUMENTS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'BillingDocumentsUnavailableError'
  }
}

/** True when an insert failed on the UNIQUE `document_number` (try again with a new number). */
export function isDocumentNumberClash(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE/i.test(message) && /document_number/i.test(message)
}

const DOCUMENT_COLUMNS = 'id, document_number, client_id, matter_id, title, document_type, document_date, primary_media_asset_id, storage_status, notes, created_at'

export function createBillingDocumentQueries(db: D1Database): BillingDocumentQueries {
  const read = async <T,>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      throw new BillingDocumentsUnavailableError(error)
    }
  }

  return {
    invoice: (invoiceId) =>
      read(() => db.prepare('SELECT id, matter_id, billed_to_client_id, invoice_number, status, sent_at FROM invoice WHERE id = ?1').bind(invoiceId).first<InvoiceRow>()),

    clientNames: (clientId) =>
      read(() =>
        db
          .prepare(
            `SELECT c.id, c.client_number, c.display_name, i.first_name, i.last_name
             FROM client c LEFT JOIN individual i ON i.id = c.individual_id AND c.client_type = 'individual'
             WHERE c.id = ?1`,
          )
          .bind(clientId)
          .first<ClientNamesRow>(),
      ),

    async storeDocument(media, document, audit, now) {
      const statements = media.map((file) =>
        db
          .prepare(
            `INSERT INTO media_asset (id, r2_bucket, r2_key, owner_type, owner_id, purpose, content_type, byte_size, original_filename, file_ext,
               sha256, visibility, status, uploaded_by_user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'private', 'active', ?12, ?13, ?13)`,
          )
          .bind(file.id, file.bucket, file.key, document.ownerType, document.ownerId, file.purpose, file.contentType, file.byteSize, file.filename, file.filename.split('.').pop()?.toLowerCase() ?? null, file.sha256, document.createdByUserId, now),
      )
      statements.push(
        db
          .prepare(
            `INSERT INTO document_record (id, document_number, owner_type, owner_id, client_id, matter_id, title, document_type, document_date,
               storage_type, primary_media_asset_id, storage_status, is_confidential, source, notes, created_by_user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'r2_object', ?10, 'active', 1, 'firm', ?11, ?12, ?13, ?13)`,
          )
          .bind(document.id, document.documentNumber, document.ownerType, document.ownerId, document.clientId, document.matterId, document.title, document.documentType, document.documentDate, document.primaryMediaId, document.notes, document.createdByUserId, now),
      )
      statements.push(auditStatement(db, audit))
      await db.batch(statements)
    },

    async supersedeDocument(documentId, title, audit, now) {
      await db.batch([
        db.prepare(`UPDATE document_record SET storage_status = 'superseded', title = ?2, updated_at = ?3 WHERE id = ?1`).bind(documentId, title, now),
        auditStatement(db, audit),
      ])
    },

    async markInvoiceSent(invoiceId, sentAt, audit) {
      await db.batch([
        db
          .prepare(`UPDATE invoice SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = ?2, updated_at = ?2 WHERE id = ?1`)
          .bind(invoiceId, sentAt),
        auditStatement(db, audit),
      ])
    },

    documentsOfType: (clientId, documentType) =>
      read(async () => {
        const result = await db
          .prepare(
            `SELECT ${DOCUMENT_COLUMNS} FROM document_record
             WHERE client_id = ?1 AND document_type = ?2 AND storage_status NOT IN ('deleted', 'archived')
             ORDER BY COALESCE(document_date, created_at) DESC LIMIT 200`,
          )
          .bind(clientId, documentType)
          .all<DocumentRow>()
        return result.results ?? []
      }),

    findDocument: (clientId, numberOrId) =>
      read(() =>
        db
          .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM document_record WHERE client_id = ?1 AND (document_number = UPPER(?2) OR id = ?2) LIMIT 1`)
          .bind(clientId, numberOrId.trim())
          .first<DocumentRow>(),
      ),

    documentFiles: (mediaIds) =>
      read(async () => {
        if (!mediaIds.length) return []
        const result = await db
          .prepare(
            `SELECT id, r2_bucket, r2_key, purpose, content_type, byte_size, original_filename, status FROM media_asset
             WHERE id IN (SELECT value FROM json_each(?1)) AND status = 'active'`,
          )
          .bind(JSON.stringify(mediaIds))
          .all<MediaRow>()
        return result.results ?? []
      }),
  }
}

export function billingDocumentQueriesFor(env: { krhomebase?: D1Database } | undefined): BillingDocumentQueries | null {
  return env?.krhomebase ? createBillingDocumentQueries(env.krhomebase) : null
}
