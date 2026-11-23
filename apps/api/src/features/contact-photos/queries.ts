// file: apps/api/src/features/contact-photos/queries.ts
/**
 * The only file of the contact photos area that talks to D1 (`test/databaseAccess.test.ts` checks this). FB-0019,
 * API patch 58, migration 078. Tables:
 *
 * - `individual`, `entity`: whether the contact exists, and which kind it is.
 * - `contact_photo`: one row per photo a contact has had; `is_current = 1` for the one shown (a partial UNIQUE index
 *   allows one), with the circle (`crop_x`, `crop_y`, `crop_size`).
 * - `media_asset`: the image (purpose `profile_image`, owner the individual or entity, bucket `krhomebase-media-dev`).
 *
 * Writes are one batch with the `audit_log` row (resource `contacts`). A new photo ends the current one in the same
 * batch (`is_current = 0`, its asset `replaced`), so the UNIQUE index always holds. Before migration 078 every call
 * fails with "no such table", which `ContactPhotosUnavailableError` carries (503 CONTACT_PHOTOS_UNAVAILABLE).
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** The table is missing (migration 078 not applied) or D1 failed. */
export class ContactPhotosUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`CONTACT_PHOTOS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ContactPhotosUnavailableError'
  }
}

export type ContactKind = 'individual' | 'entity'

/** The current photo of a contact, with its image. */
export interface CurrentPhotoRow {
  id: string
  contact_kind: ContactKind
  contact_id: string
  media_asset_id: string
  crop_x: number
  crop_y: number
  crop_size: number
  width: number | null
  height: number | null
  r2_key: string
  created_at: string
  updated_at: string | null
}

/** One stored image of a contact (current or not). */
export interface PhotoAssetRow {
  id: string
  r2_key: string
  content_type: string
  status: string
}

/** A new photo, worked out by `rules.ts`. */
export interface PhotoInsert {
  photoId: string
  assetId: string
  kind: ContactKind
  contactId: string
  bucket: string
  key: string
  contentType: string
  byteSize: number
  originalFilename: string | null
  fileExt: string
  sha256: string
  width: number
  height: number
  cropX: number
  cropY: number
  cropSize: number
  userId: string
  now: string
}

export interface ContactPhotoQueries {
  /** Which table the contact is in, or null when it is in neither. */
  contactKind(contactId: string): Promise<ContactKind | null>
  current(contactId: string): Promise<CurrentPhotoRow | null>
  /** An image that belongs to this contact (any photo it has had). */
  asset(contactId: string, assetId: string): Promise<PhotoAssetRow | null>
  /** Saves a new current photo; the one before stops being current. */
  insert(row: PhotoInsert, previous: CurrentPhotoRow | null, audit: AuditEntry): Promise<void>
  /** Moves or sizes the circle of a photo. */
  crop(photoId: string, crop: { cropX: number; cropY: number; cropSize: number }, now: string, audit: AuditEntry): Promise<void>
  /** The photo stops being current; its asset is marked deleted (the file is kept). */
  remove(row: CurrentPhotoRow, now: string, audit: AuditEntry): Promise<void>
}

const CURRENT_SELECT = `SELECT p.id, p.contact_kind, p.contact_id, p.media_asset_id, p.crop_x, p.crop_y, p.crop_size, m.width, m.height, m.r2_key,
       p.created_at, p.updated_at
  FROM contact_photo p JOIN media_asset m ON m.id = p.media_asset_id`

export function createContactPhotoQueries(db: D1Database): ContactPhotoQueries {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      throw new ContactPhotosUnavailableError(error)
    }
  }

  return {
    contactKind: (contactId) =>
      run(async () => {
        const row = await db
          .prepare(`SELECT 'individual' AS kind FROM individual WHERE id = ?1 UNION ALL SELECT 'entity' AS kind FROM entity WHERE id = ?1 LIMIT 1`)
          .bind(contactId)
          .first<{ kind: ContactKind }>()
        return row?.kind ?? null
      }),

    current: (contactId) => run(() => db.prepare(`${CURRENT_SELECT} WHERE p.contact_id = ?1 AND p.is_current = 1 LIMIT 1`).bind(contactId).first<CurrentPhotoRow>()),

    asset: (contactId, assetId) =>
      run(() =>
        db
          .prepare(
            `SELECT m.id, m.r2_key, m.content_type, m.status FROM contact_photo p JOIN media_asset m ON m.id = p.media_asset_id
              WHERE p.contact_id = ?1 AND m.id = ?2 LIMIT 1`,
          )
          .bind(contactId, assetId)
          .first<PhotoAssetRow>(),
      ),

    async insert(row, previous, audit) {
      const statements: D1PreparedStatement[] = []
      if (previous) {
        statements.push(
          db.prepare('UPDATE contact_photo SET is_current = 0, updated_at = ?2 WHERE id = ?1').bind(previous.id, row.now),
          db.prepare("UPDATE media_asset SET status = 'replaced', updated_at = ?2 WHERE id = ?1").bind(previous.media_asset_id, row.now),
        )
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO media_asset (id, r2_bucket, r2_key, owner_type, owner_id, purpose, content_type, byte_size, original_filename, file_ext, sha256,
               width, height, visibility, status, uploaded_by_user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'profile_image', ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'private', 'active', ?13, ?14, ?14)`,
          )
          .bind(row.assetId, row.bucket, row.key, row.kind, row.contactId, row.contentType, row.byteSize, row.originalFilename, row.fileExt, row.sha256, row.width, row.height, row.userId, row.now),
        db
          .prepare(
            `INSERT INTO contact_photo (id, contact_kind, contact_id, media_asset_id, crop_x, crop_y, crop_size, is_current, created_by_user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?9)`,
          )
          .bind(row.photoId, row.kind, row.contactId, row.assetId, row.cropX, row.cropY, row.cropSize, row.userId, row.now),
        auditStatement(db, audit),
      )
      await run(() => db.batch(statements))
    },

    async crop(photoId, crop, now, audit) {
      await run(() =>
        db.batch([
          db.prepare('UPDATE contact_photo SET crop_x = ?2, crop_y = ?3, crop_size = ?4, updated_at = ?5 WHERE id = ?1').bind(photoId, crop.cropX, crop.cropY, crop.cropSize, now),
          auditStatement(db, audit),
        ]),
      )
    },

    async remove(row, now, audit) {
      await run(() =>
        db.batch([
          db.prepare('UPDATE contact_photo SET is_current = 0, updated_at = ?2 WHERE id = ?1').bind(row.id, now),
          db.prepare("UPDATE media_asset SET status = 'deleted', deleted_at = ?2, updated_at = ?2 WHERE id = ?1").bind(row.media_asset_id, now),
          auditStatement(db, audit),
        ]),
      )
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function contactPhotoQueriesFor(env: { krhomebase?: D1Database } | undefined): ContactPhotoQueries | null {
  return env?.krhomebase ? createContactPhotoQueries(env.krhomebase) : null
}
