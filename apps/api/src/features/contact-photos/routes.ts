// file: apps/api/src/features/contact-photos/routes.ts
/**
 * Contact photos (FB-0019, API patch 58, migration 078; rules in `rules.ts`, shapes in
 * `packages/contracts/src/contactPhotos.ts`):
 *
 *   PUT    /v1/contacts/{contactId}/photo            upload a new photo with its circle (multipart)
 *   PATCH  /v1/contacts/{contactId}/photo            move or size the circle
 *   DELETE /v1/contacts/{contactId}/photo            remove the current photo
 *   GET    /v1/contacts/{contactId}/photo/{assetId}  the image
 *
 * Who: changing needs contacts.update, or the contact is the caller's own (the contact edit's rule); reading needs
 * contacts.read, or the caller's own. Checked here, so the summaries say so. Outside tools: closed.
 */

import {
  ContactPhotoCropBody,
  ContactPhotoFileParams,
  ContactPhotoParams,
  ContactPhotoSavedData,
  ContactPhotoUploadForm,
  ErrorEnvelope,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { defineRoute } from '../../platform/defineRoute.ts'
import { documentStorageFor } from '../../platform/documentStorage.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { contactQueriesFor } from '../contacts/queries.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { isAuthorized } from '../permissions/rules.ts'
import { contactPhotoQueriesFor, ContactPhotosUnavailableError } from './queries.ts'
import { ContactPhotoError, cropPhoto, readPhotoFile, removePhoto, uploadPhoto, type PhotoActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const err = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'Contact photos cannot be reached right now: the database, the bucket, or migration 078 (CONTACT_PHOTOS_UNAVAILABLE).'
const CHANGE_ERRORS = ['PERMISSION_REQUIRED', 'CONTACT_NOT_FOUND', 'CONTACT_PHOTO_NOT_FOUND', 'CONTACT_PHOTOS_UNAVAILABLE'] as const

export const uploadContactPhotoRoute = defineRoute({
  method: 'put',
  path: '/v1/contacts/{contactId}/photo',
  feature: 'contacts',
  summary: 'Upload a new photo for a contact, with its circle; the old one stops being current. Needs contacts.update, or the contact must be your own.',
  access: 'signed-in',
  errors: [...CHANGE_ERRORS, 'VALIDATION_CONTACT_PHOTO_FILE_REQUIRED', 'VALIDATION_CONTACT_PHOTO_EMPTY', 'VALIDATION_CONTACT_PHOTO_TOO_LARGE', 'VALIDATION_CONTACT_PHOTO_TYPE_UNSUPPORTED'],
  sideEffects: ['Writes the image to R2 (krhomebase-media-dev)', 'Writes media_asset and contact_photo', 'Writes audit_log'],
  request: { params: ContactPhotoParams, body: { required: true, content: { 'multipart/form-data': { schema: ContactPhotoUploadForm } } } },
  responses: {
    200: { description: 'The current photo.', content: json(successEnvelope(ContactPhotoSavedData)) },
    403: err('No contacts.update and not your own contact (PERMISSION_REQUIRED).'),
    404: err('No such contact (CONTACT_NOT_FOUND).'),
    422: err('No file, an empty file, over 5 MB, or not a JPEG, PNG or WebP image.'),
    503: err(UNAVAILABLE),
  },
})

export const cropContactPhotoRoute = defineRoute({
  method: 'patch',
  path: '/v1/contacts/{contactId}/photo',
  feature: 'contacts',
  summary: 'Move or size the circle of a contact’s current photo. Needs contacts.update, or the contact must be your own.',
  access: 'signed-in',
  errors: [...CHANGE_ERRORS],
  sideEffects: ['Writes contact_photo', 'Writes audit_log'],
  request: { params: ContactPhotoParams, body: { required: true, content: json(ContactPhotoCropBody) } },
  responses: {
    200: { description: 'The current photo.', content: json(successEnvelope(ContactPhotoSavedData)) },
    403: err('No contacts.update and not your own contact (PERMISSION_REQUIRED).'),
    404: err('No such contact, or it has no photo.'),
    503: err(UNAVAILABLE),
  },
})

export const removeContactPhotoRoute = defineRoute({
  method: 'delete',
  path: '/v1/contacts/{contactId}/photo',
  feature: 'contacts',
  summary: 'Remove a contact’s current photo (the file is kept). Needs contacts.update, or the contact must be your own.',
  access: 'signed-in',
  errors: [...CHANGE_ERRORS],
  sideEffects: ['Writes contact_photo and media_asset', 'Writes audit_log'],
  request: { params: ContactPhotoParams },
  responses: {
    200: { description: 'No current photo now.', content: json(successEnvelope(ContactPhotoSavedData)) },
    403: err('No contacts.update and not your own contact (PERMISSION_REQUIRED).'),
    404: err('No such contact, or it has no photo.'),
    503: err(UNAVAILABLE),
  },
})

export const contactPhotoFileRoute = defineRoute({
  method: 'get',
  path: '/v1/contacts/{contactId}/photo/{assetId}',
  feature: 'contacts',
  summary: 'The image of one of a contact’s photos (cached privately: a new photo has a new id). Needs contacts.read, or the contact must be your own.',
  access: 'signed-in',
  errors: ['PERMISSION_REQUIRED', 'CONTACT_PHOTO_NOT_FOUND', 'CONTACT_PHOTOS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: ContactPhotoFileParams },
  responses: {
    200: { description: 'The image.', content: { 'image/jpeg': { schema: z.string().describe('The image bytes (JPEG, PNG or WebP).') } } },
    403: err('No contacts.read and not your own contact (PERMISSION_REQUIRED).'),
    404: err('No such photo (CONTACT_PHOTO_NOT_FOUND).'),
    503: err(UNAVAILABLE),
  },
})

function actorOf(c: Context<AppEnv>): PhotoActor {
  const session = c.get('session')
  return { userId: session?.userId ?? '', email: session?.email ?? null, role: session?.role ?? null, requestId: c.get('requestId') }
}

/** contacts.<action>, or the contact is linked to the caller's own login. */
async function mayAct(c: Context<AppEnv>, contactId: string, action: 'read' | 'update'): Promise<boolean> {
  const permissions = permissionQueriesFor(c.env)
  const contacts = contactQueriesFor(c.env)
  const userId = c.get('session')?.userId
  if (!permissions || !contacts || !userId) return false
  if (await isAuthorized(permissions, userId, 'contacts', action)) return true
  return (await contacts.linkedUserIdsFor(contactId)).includes(userId)
}

const unavailable = (c: Context<AppEnv>) => failure(c, 503, 'CONTACT_PHOTOS_UNAVAILABLE', 'Contact photos are not available right now.')
const forbidden = (c: Context<AppEnv>, action: 'read' | 'update') =>
  failure(c, 403, 'PERMISSION_REQUIRED', `You need the contacts.${action} permission.`, { permission: `contacts.${action}` })

function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof ContactPhotoError) {
    logLine('CONTACT_PHOTOS:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message)
  }
  if (error instanceof ContactPhotosUnavailableError) {
    logLine('CONTACT_PHOTOS:unavailable', c.get('requestId'), { error: error.message.slice(0, 200) })
    return unavailable(c)
  }
  throw error
}

export function registerContactPhotos(app: OpenAPIHono<AppEnv>) {
  app.openapi(uploadContactPhotoRoute, async (c) => {
    const queries = contactPhotoQueriesFor(c.env)
    const storage = documentStorageFor(c.env as { DOCUMENTS?: R2Bucket })
    if (!queries || !storage) return unavailable(c)
    const { contactId } = c.req.valid('param')
    if (!(await mayAct(c, contactId, 'update'))) return forbidden(c, 'update')
    try {
      const form = c.req.valid('form')
      if (!(form.file instanceof File)) return failure(c, 422, 'VALIDATION_CONTACT_PHOTO_FILE_REQUIRED', 'Choose a photo to upload.')
      const data = await uploadPhoto(queries, storage, actorOf(c), contactId, { file: form.file, width: form.width, height: form.height, cropX: form.cropX, cropY: form.cropY, cropSize: form.cropSize }, new Date().toISOString())
      logLine('CONTACT_PHOTOS:uploaded', c.get('requestId'), { assetId: data.photo?.assetId ?? null })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error) as never
    }
  })

  app.openapi(cropContactPhotoRoute, async (c) => {
    const queries = contactPhotoQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { contactId } = c.req.valid('param')
    if (!(await mayAct(c, contactId, 'update'))) return forbidden(c, 'update')
    try {
      const data = await cropPhoto(queries, actorOf(c), contactId, c.req.valid('json'), new Date().toISOString())
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error) as never
    }
  })

  app.openapi(removeContactPhotoRoute, async (c) => {
    const queries = contactPhotoQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { contactId } = c.req.valid('param')
    if (!(await mayAct(c, contactId, 'update'))) return forbidden(c, 'update')
    try {
      const data = await removePhoto(queries, actorOf(c), contactId, new Date().toISOString())
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error) as never
    }
  })

  app.openapi(contactPhotoFileRoute, async (c) => {
    const queries = contactPhotoQueriesFor(c.env)
    const storage = documentStorageFor(c.env as { DOCUMENTS?: R2Bucket })
    if (!queries || !storage) return unavailable(c)
    const { assetId, contactId } = c.req.valid('param')
    if (!(await mayAct(c, contactId, 'read'))) return forbidden(c, 'read')
    try {
      const file = await readPhotoFile(queries, storage, contactId, assetId)
      return new Response(file.body, { status: 200, headers: file.headers }) as never
    } catch (error) {
      return refused(c, error) as never
    }
  })
}
