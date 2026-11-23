'use client'
// file: apps/web/features/contacts/components/ContactPhotoDialog.client.tsx
/**
 * The **Contact photo** dialog (FB-0019, the requester's plan approved Nov 23, 2026, web patch 586): choose a
 * headshot (or a business's logo), then move the circle over it and size it with the slider; the preview shows the
 * circle as the card will. Opened from the camera button of the card's photo square (`ContactIdentityPhotoColumn`).
 *
 * - **A picked image** is shrunk in the browser to 1200 pixels on the longer side (`shrunkSize`) and sent as JPEG (a
 *   PNG stays PNG, so a logo keeps its clear background); the API stores it in `krhomebase-media-dev`.
 * - **An existing photo** opens with its circle; moving it saves only the three numbers (`cropContactPhoto`).
 * - **Remove photo** asks first (`U6ConfirmationDialog`); the card shows the initials again.
 * - **Unsaved Changes Standard:** Save Changes (Signal Orange, its place kept) shows only while the dialog differs from
 *   what is saved; Cancel or the backdrop then asks "Leave without saving?" (Leave, Stay).
 *
 * Drawn into `document.body` with `data-kr-theme-scope`, as the other contact dialogs are.
 */

import { contactPhotoPath, type ContactPhoto } from '@krhomebase/contracts'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import KRPhotoCircle from '@/components/ui/KRPhotoCircle.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { ContactApiError, cropContactPhoto, removeContactPhoto, uploadContactPhoto } from '../contactEdits.client'
import { circlesDiffer, clampCircle, shrunkSize, STARTING_CIRCLE, type PhotoCircle } from '../contactPhotoMath'
import type { KRContactRecord } from '../types'
import { contactInitials } from './ContactIdentityPhotoColumn.client'

/** The editing area's width in pixels; the image is fitted inside it. */
const STAGE = 300

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-[rgba(15,23,42,0.42)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(27,35,48,0.28)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  footer: 'border-t border-(--kr-theme-line)',
  title: 'm-0 text-[14px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  hint: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  label: 'text-[12px] font-[700] text-(color:--kr-theme-text)',
  stage: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  ring: 'rounded-full border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] cursor-move touch-none',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  button:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-[0.55]',
  removeButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-danger) bg-transparent text-[11px] font-[700] text-(color:--kr-theme-danger) cursor-pointer disabled:cursor-not-allowed disabled:opacity-[0.55]',
  // Unsaved Changes Standard: the brightest button, Signal Orange.
  saveButton:
    'min-h-[24px] px-[10px] py-[2px] rounded-[3px] border border-(--kr-theme-orange) bg-(--kr-theme-orange) text-[11px] font-[800] text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-[0.55]',
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
  backdrop: 'p-[10px] pt-[8vh] fixed inset-0 z-[1000] grid items-start justify-center overflow-y-auto',
  dialog: 'relative w-[480px] max-w-[calc(100vw-20px)]',
  header: 'px-[10px] py-[6px] gap-[8px] flex items-start justify-between',
  body: 'p-[10px] gap-[10px] grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]',
  stage: 'relative overflow-hidden flex items-center justify-center',
  stageImage: 'absolute max-w-none select-none pointer-events-none',
  ring: 'absolute',
  side: 'gap-[6px] flex flex-col items-start',
  sizeRow: 'gap-[3px] grid w-full',
  footer: 'px-[10px] py-[6px] gap-[6px] flex items-center justify-end',
  leftActions: 'mr-auto',
  hiddenInput: 'hidden',
} as const

/** The image being edited: a stored photo or a picked file (shrunk, not sent yet). */
interface PhotoSource {
  url: string
  width: number
  height: number
  /** The bytes to send; absent for the stored photo. */
  blob?: Blob
  filename?: string
}

export interface ContactPhotoDialogProps {
  contact: KRContactRecord
  open: boolean
  onClose: () => void
  /** The current photo after a save or removal (null: removed). */
  onSaved: (photo: ContactPhoto | null) => void | Promise<void>
}

/** Reads a picked file into an image, shrinks it to 1200 pixels on the longer side, and returns the new bytes. */
async function shrinkPicked(file: File): Promise<PhotoSource> {
  const original = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('unreadable'))
      element.src = original
    })
    const size = shrunkSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(image, 0, 0, size.width, size.height)
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((made) => (made ? resolve(made) : reject(new Error('unencoded'))), type, 0.9))
    return { url: URL.createObjectURL(blob), width: size.width, height: size.height, blob, filename: type === 'image/png' ? 'photo.png' : 'photo.jpg' }
  } finally {
    URL.revokeObjectURL(original)
  }
}

/** The dialog; the parent owns whether it is open. */
export default function ContactPhotoDialog({ contact, onClose, onSaved, open }: ContactPhotoDialogProps) {
  const stored = contact.photo ?? null
  const [source, setSource] = useState<PhotoSource | null>(null)
  const [circle, setCircle] = useState<PhotoCircle>(STARTING_CIRCLE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'leave' | 'remove' | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const drag = useRef<{ x: number; y: number; circle: PhotoCircle } | null>(null)

  // Opening: the stored photo with its circle, or nothing picked yet.
  useEffect(() => {
    if (!open) return
    setSource(stored ? { url: contactPhotoPath(contact.id, stored.assetId), width: stored.width, height: stored.height } : null)
    setCircle(stored ? { cropX: stored.cropX, cropY: stored.cropY, cropSize: stored.cropSize } : STARTING_CIRCLE)
    setError('')
    setConfirm(null)
    // Read again only when the dialog opens or the saved photo itself changes (not on every new record object).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, open, stored?.assetId, stored?.updatedAt])

  // A picked image's address is freed when it is replaced or the dialog closes.
  useEffect(() => () => {
    if (source?.blob) URL.revokeObjectURL(source.url)
  }, [source])

  if (!open || typeof document === 'undefined') return null

  const dirty = Boolean(source?.blob) || Boolean(stored && source && !source.blob && circlesDiffer(circle, stored))
  // The image fitted in the stage, and the circle drawn over it.
  const fit = source ? Math.min(STAGE / source.width, STAGE / source.height) : 1
  const shown = source ? { width: source.width * fit, height: source.height * fit } : { width: STAGE, height: STAGE }
  const diameter = source ? circle.cropSize * Math.min(source.width, source.height) * fit : 0
  const ringStyle = source
    ? { width: diameter, height: diameter, left: (STAGE - shown.width) / 2 + circle.cropX * shown.width - diameter / 2, top: (STAGE - shown.height) / 2 + circle.cropY * shown.height - diameter / 2 }
    : undefined

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return
    setError('')
    try {
      const picked = await shrinkPicked(file)
      setSource(picked)
      setCircle(clampCircle(STARTING_CIRCLE, picked.width, picked.height))
    } catch {
      setError('That file could not be read as an image. Use a JPEG, PNG or WebP image.')
    }
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, circle }
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!drag.current || !source) return
    const start = drag.current
    const next = { ...start.circle, cropX: start.circle.cropX + (event.clientX - start.x) / shown.width, cropY: start.circle.cropY + (event.clientY - start.y) / shown.height }
    setCircle(clampCircle(next, source.width, source.height))
  }

  async function save(): Promise<void> {
    if (!source || !dirty || saving) return
    setSaving(true)
    setError('')
    try {
      const saved = source.blob
        ? await uploadContactPhoto(contact.id, source.blob, { width: source.width, height: source.height, ...circle }, source.filename)
        : await cropContactPhoto(contact.id, circle)
      await onSaved(saved.photo)
      onClose()
    } catch (caught) {
      setError(caught instanceof ContactApiError ? caught.message : 'The photo was not saved.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(): Promise<void> {
    setSaving(true)
    setError('')
    try {
      await removeContactPhoto(contact.id)
      await onSaved(null)
      onClose()
    } catch (caught) {
      setConfirm(null)
      setError(caught instanceof ContactApiError ? caught.message : 'The photo was not removed.')
    } finally {
      setSaving(false)
    }
  }

  /** Cancel, Close or the backdrop: asks first while something is not saved. */
  function requestClose(): void {
    if (saving) return
    if (dirty) setConfirm('leave')
    else onClose()
  }

  const dialog = (
    <div
      aria-labelledby="contact-photo-dialog-title"
      aria-modal="true"
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-id="contact-photo-dialog"
      data-kr-theme-scope="krhomebase"
      role="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <section className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`}>
        {/* Header: whose photo */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <div>
            <h2 className={STYLES.title} id="contact-photo-dialog-title">Contact photo</h2>
            <p className={STYLES.hint}>{contact.displayName}</p>
          </div>
          <button className={STYLES.button} type="button" onClick={requestClose}>Close</button>
        </header>

        {/* Body: the image with the circle over it, then the preview, Choose, and the size slider */}
        <div className={LAYOUT_STYLES.body}>
          <div className={`${LAYOUT_STYLES.stage} ${STYLES.stage}`} data-kr-element="contact-photo-stage" style={{ width: STAGE, height: STAGE }}>
            {source ? (
              <>
                <img alt="" className={LAYOUT_STYLES.stageImage} draggable={false} src={source.url} style={{ ...shown, left: (STAGE - shown.width) / 2, top: (STAGE - shown.height) / 2 }} />
                <div
                  aria-label="Drag to center the circle"
                  className={`${LAYOUT_STYLES.ring} ${STYLES.ring}`}
                  data-kr-element="contact-photo-ring"
                  role="presentation"
                  style={ringStyle}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={() => {
                    drag.current = null
                  }}
                  onPointerCancel={() => {
                    drag.current = null
                  }}
                />
              </>
            ) : (
              <p className={STYLES.hint}>No photo yet. Choose a headshot or logo.</p>
            )}
          </div>
          <div className={LAYOUT_STYLES.side}>
            <span className={STYLES.label}>Preview</span>
            <KRPhotoCircle crop={source ? { width: source.width, height: source.height, ...circle } : null} initials={contactInitials(contact.displayName)} label={`Photo of ${contact.displayName}`} size={96} src={source?.url ?? null} />
            <button className={STYLES.button} data-kr-element="contact-photo-choose" disabled={saving} type="button" onClick={() => fileRef.current?.click()}>
              {source ? 'Choose another photo' : 'Choose a photo'}
            </button>
            <input ref={fileRef} accept="image/jpeg,image/png,image/webp" className={LAYOUT_STYLES.hiddenInput} type="file" onChange={(event) => void pick(event.target.files?.[0])} />
            {source ? (
              <label className={LAYOUT_STYLES.sizeRow} data-kr-element="contact-photo-size">
                <span className={STYLES.label}>Circle size</span>
                <input
                  max={1}
                  min={0.05}
                  step={0.01}
                  type="range"
                  value={circle.cropSize}
                  onChange={(event) => setCircle(clampCircle({ ...circle, cropSize: Number(event.target.value) }, source.width, source.height))}
                />
              </label>
            ) : null}
            <p className={STYLES.hint}>Drag the circle to center it. JPEG, PNG or WebP; large images are made smaller first.</p>
          </div>
        </div>

        {error ? <p className={`${LAYOUT_STYLES.footer} ${STYLES.error}`} role="alert">{error}</p> : null}
        {/* Footer: Remove on the left; Cancel and Save Changes (its place kept, shown only while dirty) on the right */}
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
          {stored ? (
            <div className={LAYOUT_STYLES.leftActions}>
              <button className={STYLES.removeButton} data-kr-element="contact-photo-remove" disabled={saving} type="button" onClick={() => setConfirm('remove')}>Remove photo</button>
            </div>
          ) : null}
          {saving ? <RainbowBusySpinner busy hideWhenIdle={false} label="Saving photo..." size={16} /> : null}
          <button className={STYLES.button} disabled={saving} type="button" onClick={requestClose}>Cancel</button>
          <button className={`${STYLES.saveButton} ${dirty ? '' : 'invisible'}`} data-kr-element="contact-photo-save" disabled={saving || !dirty} type="button" onClick={() => void save()}>
            Save Changes
          </button>
        </footer>
      </section>
      <U6ConfirmationDialog
        busy={saving}
        cancelLabel="Stay"
        confirmLabel={confirm === 'remove' ? 'Remove photo' : 'Leave'}
        description={confirm === 'remove' ? `The card shows ${contact.displayName}'s initials again. The image is kept in the firm's records.` : 'The photo changes are not saved.'}
        open={confirm !== null}
        title={confirm === 'remove' ? 'Remove photo?' : 'Leave without saving?'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'remove') void remove()
          else {
            setConfirm(null)
            onClose()
          }
        }}
      />
    </div>
  )
  return createPortal(dialog, document.body)
}
