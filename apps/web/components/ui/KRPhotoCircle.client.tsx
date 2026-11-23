'use client'
// file: apps/web/components/ui/KRPhotoCircle.client.tsx
/**
 * A photo drawn as a circle, or whole (FB-0019, the requester's plan approved Nov 23, 2026, web patch 586): the one
 * way KR Homebase draws a contact's or a user's picture (the contact card, Users, the WorkStream).
 *
 * The circle is cut by the browser from the stored image and three numbers (`cropX`, `cropY` the center as fractions
 * of the width and height, `cropSize` the diameter as a fraction of the shorter side), so moving the circle never
 * writes a new file. `mode="full"` shows the whole image inside the square instead. Without a photo, or when the image
 * cannot be read (for example a viewer without contacts.read), the initials show.
 *
 * Kept in `components/` because contacts, Users and the WorkStream draw it; it knows no feature (the caller gives the
 * address and the numbers).
 */

import { useState } from 'react'

/** The numbers that place the circle; the same as the contracts' `ContactPhoto` without its id. */
export interface KRPhotoCrop {
  width: number
  height: number
  cropX: number
  cropY: number
  cropSize: number
}

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  circle: 'rounded-full bg-(--kr-theme-button-primary-background)',
  square: 'rounded-[2px] bg-(--kr-theme-muted-surface)',
  initials: 'select-none font-(family-name:--kr-theme-font-display) font-extrabold tracking-[0.02em] text-(color:--kr-theme-text-inverse)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  frame: 'relative shrink-0 overflow-hidden flex items-center justify-center',
  cropped: 'absolute max-w-none',
  full: 'size-full object-contain',
} as const

/**
 * Where the image goes so the circle shows the chosen part: its drawn size and its offset in a `size` square.
 *
 * @returns Pixels: width, height, left and top of the image.
 */
export function photoPlacement(crop: KRPhotoCrop, size: number): { width: number; height: number; left: number; top: number } {
  const side = Math.max(1, crop.cropSize * Math.min(crop.width, crop.height))
  const scale = size / side
  const width = crop.width * scale
  const height = crop.height * scale
  return { width, height, left: size / 2 - crop.cropX * width, top: size / 2 - crop.cropY * height }
}

export interface KRPhotoCircleProps {
  /** The image address; null shows the initials. */
  src: string | null
  crop: KRPhotoCrop | null
  /** The square's side in pixels. */
  size: number
  initials: string
  /** Screen-reader words ("Photo of Ann Example"). */
  label: string
  /** `full`: the whole image in the square; `circle` (the default): the chosen circle. */
  mode?: 'circle' | 'full'
  /** The initials' size in pixels (about 0.32 of `size` by default). */
  initialsSize?: number
}

/** Draws the photo's circle, the whole photo, or the initials. */
export default function KRPhotoCircle({ crop, initials, initialsSize, label, mode = 'circle', size, src }: KRPhotoCircleProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const usable = Boolean(src && crop && failed !== src)
  const frameStyle = { width: size, height: size }

  if (!usable) {
    return (
      <div aria-label={label} className={`${LAYOUT_STYLES.frame} ${STYLES.circle}`} data-kr-element="photo-initials" role="img" style={frameStyle}>
        <span className={STYLES.initials} style={{ fontSize: initialsSize ?? Math.round(size * 0.32) }}>
          {initials}
        </span>
      </div>
    )
  }

  if (mode === 'full') {
    return (
      <div className={`${LAYOUT_STYLES.frame} ${STYLES.square}`} data-kr-element="photo-full" style={frameStyle}>
        <img alt={label} className={LAYOUT_STYLES.full} src={src!} onError={() => setFailed(src)} />
      </div>
    )
  }

  const placement = photoPlacement(crop!, size)
  return (
    <div className={`${LAYOUT_STYLES.frame} ${STYLES.circle}`} data-kr-element="photo-circle" style={frameStyle}>
      <img alt={label} className={LAYOUT_STYLES.cropped} src={src!} style={placement} onError={() => setFailed(src)} />
    </div>
  )
}
