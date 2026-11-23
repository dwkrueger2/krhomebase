// file: apps/web/features/communications/writerPhotos.ts
/**
 * The WorkStream writers' photos (FB-0019, Davis McClellan's request; web patch 586): a user's picture is their linked
 * contact's photo, found in the browser's contact list by `linkedUserId`, so no WorkStream call changes.
 */

import { contactPhotoPath } from '@krhomebase/contracts'
import type { KRPhotoCrop } from '@/components/ui/KRPhotoCircle.client'
import type { KRContactRecord } from '@/features/contacts/types'

/** A writer's photo: where the image is read and its circle. */
export interface WriterPhoto {
  src: string
  crop: KRPhotoCrop
}

/** Each user id with a linked contact that has a photo, and that photo. */
export function writerPhotosOf(contacts: readonly KRContactRecord[]): Map<string, WriterPhoto> {
  const rVal = new Map<string, WriterPhoto>()
  for (const contact of contacts) {
    if (!contact.linkedUserId || !contact.photo) continue
    rVal.set(contact.linkedUserId, { src: contactPhotoPath(contact.id, contact.photo.assetId), crop: contact.photo })
  }
  return rVal
}
