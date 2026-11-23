// file: apps/api/src/features/contact-photos/rules.ts
/**
 * Contact photos (FB-0019, the requester's plan approved Nov 23, 2026; API patch 58, migration 078): a person's
 * headshot or a business's logo, and the circle the card shows. Routes: `routes.ts`; shapes:
 * `packages/contracts/src/contactPhotos.ts`.
 *
 * - **The image** is checked by its first bytes (JPEG, PNG or WebP), 5 MB at most. The browser shrinks it to 1200
 *   pixels on the longer side first and sends its size; the size is not read back from the bytes.
 * - **Storage:** R2 bucket `krhomebase-media-dev` (binding `DOCUMENTS`, `platform/documentStorage.ts`), key
 *   `contacts/<kind>/<contact id>/photo/<asset id>.<ext>`. The file goes first, then the rows in one batch with the
 *   audit row; a failed batch removes the file.
 * - **The circle** is three numbers (`crop_x`, `crop_y`, `crop_size`); moving it changes only them.
 * - **A new photo** ends the current one (kept, asset `replaced`); **removing** ends it (asset `deleted`, file kept).
 * - **Reading** an image answers it with a year-long private cache: a new photo has a new asset id, so its address
 *   changes.
 * - Who may (checked in `routes.ts`): changing needs contacts.update or one's own contact; reading needs contacts.read
 *   or one's own contact.
 */

import { CONTACT_PHOTO_MAX_BYTES, type ContactPhoto, type ContactPhotoCropBody, type ContactPhotoSavedData } from '@krhomebase/contracts'
import type { DocumentStorage } from '../../platform/documentStorage.ts'
import { keySegment, sha256Hex } from '../../platform/documentStorage.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { ContactPhotoQueries, CurrentPhotoRow } from './queries.ts'

/** A refusal with its code and HTTP status. */
export class ContactPhotoError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 422,
    message: string,
  ) {
    super(message)
    this.name = 'ContactPhotoError'
  }
}

/** The signed-in person, from the checked session. */
export interface PhotoActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** The image type from its first bytes, or null (JPEG `FF D8 FF`, PNG signature, WebP `RIFF....WEBP`). */
export function imageTypeOf(bytes: Uint8Array): { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: 'image/jpeg', ext: 'jpg' }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return { contentType: 'image/png', ext: 'png' }
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return { contentType: 'image/webp', ext: 'webp' }
  return null
}

/** A current photo row in the wire shape. */
export function photoOf(row: CurrentPhotoRow): ContactPhoto {
  return {
    assetId: row.media_asset_id,
    width: Number(row.width ?? 1),
    height: Number(row.height ?? 1),
    cropX: Number(row.crop_x),
    cropY: Number(row.crop_y),
    cropSize: Number(row.crop_size),
    updatedAt: row.updated_at ?? row.created_at,
  }
}

function auditFor(actor: PhotoActor, action: string, targetId: string, newJson: unknown): AuditEntry {
  return {
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    resource: 'contacts',
    action,
    targetTable: 'contact_photo',
    targetId,
    newJson,
  }
}

async function requireContact(q: ContactPhotoQueries, contactId: string) {
  const kind = await q.contactKind(contactId)
  if (!kind) throw new ContactPhotoError('CONTACT_NOT_FOUND', 404, 'No such contact.')
  return kind
}

async function requireCurrent(q: ContactPhotoQueries, contactId: string): Promise<CurrentPhotoRow> {
  await requireContact(q, contactId)
  const row = await q.current(contactId)
  if (!row) throw new ContactPhotoError('CONTACT_PHOTO_NOT_FOUND', 404, 'This contact has no photo.')
  return row
}

/** The upload: the file and the numbers the browser sends with it. */
export interface PhotoUpload {
  file: File
  width: number
  height: number
  cropX: number
  cropY: number
  cropSize: number
}

/** Stores a new photo for a contact and makes it the current one. */
export async function uploadPhoto(q: ContactPhotoQueries, storage: DocumentStorage, actor: PhotoActor, contactId: string, upload: PhotoUpload, now: string): Promise<ContactPhotoSavedData> {
  const kind = await requireContact(q, contactId)
  const bytes = new Uint8Array(await upload.file.arrayBuffer())
  if (!bytes.length) throw new ContactPhotoError('VALIDATION_CONTACT_PHOTO_EMPTY', 422, 'The file is empty.')
  if (bytes.length > CONTACT_PHOTO_MAX_BYTES) throw new ContactPhotoError('VALIDATION_CONTACT_PHOTO_TOO_LARGE', 422, 'The photo is larger than 5 MB.')
  const type = imageTypeOf(bytes)
  if (!type) throw new ContactPhotoError('VALIDATION_CONTACT_PHOTO_TYPE_UNSUPPORTED', 422, 'Use a JPEG, PNG or WebP image.')

  const previous = await q.current(contactId)
  const assetId = `mda_${crypto.randomUUID()}`
  const key = ['contacts', kind, keySegment(contactId), 'photo', `${assetId}.${type.ext}`].join('/')
  await storage.put(key, bytes, type.contentType)
  try {
    await q.insert(
      {
        photoId: `cph_${crypto.randomUUID()}`,
        assetId,
        kind,
        contactId,
        bucket: storage.bucketName,
        key,
        contentType: type.contentType,
        byteSize: bytes.length,
        originalFilename: upload.file.name ? upload.file.name.slice(0, 200) : null,
        fileExt: type.ext,
        sha256: await sha256Hex(bytes),
        width: upload.width,
        height: upload.height,
        cropX: upload.cropX,
        cropY: upload.cropY,
        cropSize: upload.cropSize,
        userId: actor.userId,
        now,
      },
      previous,
      auditFor(actor, 'PHOTO', contactId, { assetId, kind, replaced: previous?.media_asset_id ?? null }),
    )
  } catch (error) {
    await storage.delete(key).catch(() => undefined)
    throw error
  }
  const current = await q.current(contactId)
  return { contactId, photo: current ? photoOf(current) : null }
}

/** Moves or sizes the circle of the current photo. */
export async function cropPhoto(q: ContactPhotoQueries, actor: PhotoActor, contactId: string, body: ContactPhotoCropBody, now: string): Promise<ContactPhotoSavedData> {
  const row = await requireCurrent(q, contactId)
  await q.crop(row.id, body, now, auditFor(actor, 'PHOTO_CROP', contactId, { assetId: row.media_asset_id, ...body }))
  const current = await q.current(contactId)
  return { contactId, photo: current ? photoOf(current) : null }
}

/** Removes the current photo; the card shows the initials again. */
export async function removePhoto(q: ContactPhotoQueries, actor: PhotoActor, contactId: string, now: string): Promise<ContactPhotoSavedData> {
  const row = await requireCurrent(q, contactId)
  await q.remove(row, now, auditFor(actor, 'PHOTO_REMOVE', contactId, { assetId: row.media_asset_id }))
  return { contactId, photo: null }
}

/** One image of a contact, with the headers it is answered with. */
export async function readPhotoFile(q: ContactPhotoQueries, storage: DocumentStorage, contactId: string, assetId: string): Promise<{ body: ArrayBuffer; headers: Record<string, string> }> {
  const asset = await q.asset(contactId, assetId)
  if (!asset) throw new ContactPhotoError('CONTACT_PHOTO_NOT_FOUND', 404, 'No such photo.')
  const object = await storage.get(asset.r2_key)
  if (!object) throw new ContactPhotoError('CONTACT_PHOTO_NOT_FOUND', 404, 'The photo file is missing.')
  return {
    body: object.body,
    headers: {
      'content-type': asset.content_type,
      // A new photo has a new asset id, so this address never shows different bytes.
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  }
}
