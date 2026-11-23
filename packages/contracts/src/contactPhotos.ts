/**
 * Contact photos (FB-0019, the requester's plan approved Nov 23, 2026; API patch 58, migration 078): a person's
 * headshot or a business's logo, with the circle shown on the contact card. A user's picture is their linked
 * contact's photo.
 *
 *   PUT    /v1/contacts/{contactId}/photo            upload a new photo with its circle (multipart); the old one is kept, not current
 *   PATCH  /v1/contacts/{contactId}/photo            move or size the circle of the current photo
 *   DELETE /v1/contacts/{contactId}/photo            remove the current photo (initials show again)
 *   GET    /v1/contacts/{contactId}/photo/{assetId}  the image (cached: a new photo has a new id)
 *
 * Who: changing needs contacts.update, or the contact is your own; reading needs contacts.read, or your own.
 * The browser shrinks the image (1200 pixels on the longer side at most) before it is sent.
 */

import { z } from 'zod'
import { ContactPhoto } from './contacts.ts'

/** The image types accepted (checked by their first bytes, not the name). */
export const CONTACT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** The largest image accepted, in bytes (after the browser shrinks it). */
export const CONTACT_PHOTO_MAX_BYTES = 5 * 1024 * 1024
/** The longest side the browser sends, in pixels. */
export const CONTACT_PHOTO_MAX_SIDE = 1200

export const ContactPhotoParams = z.object({
  contactId: z.string().trim().min(1).max(80).describe('Id of an individual or an entity.'),
})
export type ContactPhotoParams = z.infer<typeof ContactPhotoParams>

export const ContactPhotoFileParams = ContactPhotoParams.extend({
  assetId: z.string().trim().min(1).max(80).describe('The image (`ContactPhoto.assetId`).'),
})
export type ContactPhotoFileParams = z.infer<typeof ContactPhotoFileParams>

const fraction = (what: string) => z.coerce.number().min(0).max(1).describe(what)
const cropFields = {
  cropX: fraction("The circle's center, as a fraction of the image width."),
  cropY: fraction("The circle's center, as a fraction of the image height."),
  cropSize: z.coerce.number().min(0.05).max(1).describe("The circle's diameter, as a fraction of the image's shorter side."),
}

export const ContactPhotoUploadForm = z.object({
  file: z.any().describe('The image (JPEG, PNG or WebP; 5 MB at most; 1200 pixels on the longer side at most).'),
  width: z.coerce.number().int().min(1).max(CONTACT_PHOTO_MAX_SIDE).describe('The image width in pixels.'),
  height: z.coerce.number().int().min(1).max(CONTACT_PHOTO_MAX_SIDE).describe('The image height in pixels.'),
  ...cropFields,
})
export type ContactPhotoUploadForm = z.infer<typeof ContactPhotoUploadForm>

export const ContactPhotoCropBody = z.object(cropFields).strict()
export type ContactPhotoCropBody = z.infer<typeof ContactPhotoCropBody>

export const ContactPhotoSavedData = z.object({
  contactId: z.string().describe('The contact.'),
  photo: ContactPhoto.nullable().describe('The current photo after the change; null after a removal.'),
})
export type ContactPhotoSavedData = z.infer<typeof ContactPhotoSavedData>

/** Where the image of a photo is read (the browser's address, through the web app's API door). */
export function contactPhotoPath(contactId: string, assetId: string): string {
  return `/api/v1/contacts/${encodeURIComponent(contactId)}/photo/${encodeURIComponent(assetId)}`
}
