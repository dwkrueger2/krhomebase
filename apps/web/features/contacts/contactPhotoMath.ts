// file: apps/web/features/contacts/contactPhotoMath.ts
/**
 * The numbers behind the contact photo dialog (FB-0019, web patch 586): keeping the circle inside the image, and the
 * size a picked image is shrunk to before it is sent (1200 pixels on the longer side at most,
 * `CONTACT_PHOTO_MAX_SIDE`). Pure: no browser objects, so the tests can check them.
 */

import { CONTACT_PHOTO_MAX_SIDE } from '@krhomebase/contracts'

/** The circle: center as fractions of the width and height, diameter as a fraction of the shorter side. */
export interface PhotoCircle {
  cropX: number
  cropY: number
  cropSize: number
}

/** The smallest circle allowed (the contract's lower bound). */
export const MIN_CROP_SIZE = 0.05

/** A new photo's first circle: centered across, a little above the middle (where a face usually is), 80% wide. */
export const STARTING_CIRCLE: PhotoCircle = { cropX: 0.5, cropY: 0.42, cropSize: 0.8 }

/**
 * Keeps the circle whole inside the image: its size between 5% and 100% of the shorter side, its center far enough
 * from each edge.
 */
export function clampCircle(circle: PhotoCircle, width: number, height: number): PhotoCircle {
  const cropSize = Math.min(1, Math.max(MIN_CROP_SIZE, circle.cropSize))
  const radius = (cropSize * Math.min(width, height)) / 2
  const halfX = Math.min(0.5, radius / width)
  const halfY = Math.min(0.5, radius / height)
  const round = (value: number) => Math.round(value * 10000) / 10000
  return {
    cropX: round(Math.min(1 - halfX, Math.max(halfX, circle.cropX))),
    cropY: round(Math.min(1 - halfY, Math.max(halfY, circle.cropY))),
    cropSize: round(cropSize),
  }
}

/** The size a picked image is drawn at before it is sent: the longer side at most 1200 pixels, never enlarged. */
export function shrunkSize(width: number, height: number, maxSide: number = CONTACT_PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** True when two circles differ enough to be worth saving. */
export function circlesDiffer(left: PhotoCircle, right: PhotoCircle): boolean {
  return Math.abs(left.cropX - right.cropX) > 0.0005 || Math.abs(left.cropY - right.cropY) > 0.0005 || Math.abs(left.cropSize - right.cropSize) > 0.0005
}
