'use client'
// file: apps/web/features/contacts/components/ContactIdentityPhotoColumn.client.tsx
/**
 * The left part of a contact's identity header: a square with the contact's initials (contacts have no photo yet),
 * and under it the contact type, the record number and whether it is a client account. Ported from the old
 * `modules/contacts/components/ContactIdentityPhotoColumn.tsx`; sizes unchanged (140 pixels, 96 on a phone). The old
 * CSS module became Tailwind classes reading the theme tokens.
 *
 * Nov 23, 2026 (FB-0019, the requester's plan, web patch 586): the square shows the contact's photo (a person's
 * headshot, a business's logo) as its circle (`KRPhotoCircle`); without one, the initials as before. Two small
 * buttons sit in the square's lower corner: switch between the circle and the whole photo (shown only with a
 * photo), and, for a person who may edit the contact (`canEditPhoto`), the camera that opens the **Contact photo**
 * dialog (`ContactPhotoDialog`). A saved photo goes into the data store at once, so every screen showing this
 * contact (Users, the WorkStream) shows it.
 */

import { contactPhotoPath, type ContactPhoto } from '@krhomebase/contracts'
import { useState } from 'react'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import KRPhotoCircle from '@/components/ui/KRPhotoCircle.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import type { KRContactRecord } from '../types'
import ContactPhotoDialog from './ContactPhotoDialog.client'

const LAYOUT_STYLES = {
  column: 'flex w-[96px] md:w-[140px] flex-col',
  photo: 'flex size-[96px] md:size-[140px] items-center justify-center overflow-hidden',
  // The photo area: the square (or circle) with the two buttons over its lower right corner.
  photoArea: 'relative size-[96px] md:size-[140px]',
  phoneOnly: 'md:hidden',
  tabletUp: 'hidden md:block',
  photoButtons: 'absolute bottom-[3px] right-[3px] gap-[3px] flex',
  photoButton: 'size-[20px] p-0 inline-flex items-center justify-center',
  roleBar: 'mt-[8px] w-[96px] md:w-[140px] box-border flex flex-col gap-[1px] px-[6px] py-[5px] md:px-[10px] md:py-[6px]',
} as const

const STYLES = {
  photo: 'rounded-[2px] bg-(--kr-theme-button-primary-background) font-(family-name:--kr-theme-font-display) text-[30px] md:text-[44px] font-extrabold tracking-[0.02em] text-(color:--kr-theme-text-inverse)',
  initials: 'select-none',
  photoButton:
    'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)/90 text-(color:--kr-theme-text-muted) cursor-pointer hover:border-(--kr-theme-accent) hover:text-(color:--kr-theme-text)',
  photoIcon: 'size-[12px]',
  roleBar: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-shell-surface) leading-[1.3]',
  roleBarType: 'text-[11px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-accent)',
  roleBarAccess: 'text-[11px] text-(color:--kr-theme-text-muted)',
} as const

/** Two letters for the square: first and last word, or the first two letters of a single word (unchanged). */
export function contactInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'C'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase()
}

export interface ContactIdentityPhotoColumnProps {
  contact: KRContactRecord
  /** The camera button: the viewer may edit this contact (contacts.update, or their own contact). */
  canEditPhoto?: boolean
}

export default function ContactIdentityPhotoColumn({ canEditPhoto = false, contact }: ContactIdentityPhotoColumnProps) {
  const dataStore = useOptionalDataStore()
  const [mode, setMode] = useState<'circle' | 'full'>('circle')
  const [dialogOpen, setDialogOpen] = useState(false)
  const photo = contact.photo ?? null
  const src = photo ? contactPhotoPath(contact.id, photo.assetId) : null
  const initials = contactInitials(contact.displayName)

  /** A saved or removed photo goes into the data store, so every screen with this contact shows it. */
  async function keepSaved(saved: ContactPhoto | null): Promise<void> {
    await dataStore?.upsertContact({ ...contact, photo: saved, ssn: null, dob: null, detailsLoaded: false })
  }

  const circle = (size: number) => (
    <KRPhotoCircle crop={photo} initials={initials} label={`Photo of ${contact.displayName}`} mode={mode} size={size} src={src} />
  )

  return (
    <div className={LAYOUT_STYLES.column} data-kr-element="contact-identity-photo-column">
      <div className={LAYOUT_STYLES.photoArea} data-kr-element="contact-identity-photo">
        {photo ? (
          // The photo: its circle, or the whole photo (the toggle below)
          <>
            <div className={LAYOUT_STYLES.phoneOnly}>{circle(96)}</div>
            <div className={LAYOUT_STYLES.tabletUp}>{circle(140)}</div>
          </>
        ) : (
          // Initials stand in for a photo
          <div className={`${LAYOUT_STYLES.photo} ${STYLES.photo}`} role="img" aria-label={`Photo placeholder for ${contact.displayName}`}>
            <span className={STYLES.initials}>{initials}</span>
          </div>
        )}
        {/* Photo buttons: circle or whole photo, and the camera (Contact photo dialog) */}
        <div className={LAYOUT_STYLES.photoButtons}>
          {photo ? (
            <button
              aria-label={mode === 'circle' ? 'Show the whole photo' : 'Show the photo as a circle'}
              aria-pressed={mode === 'full'}
              className={`${LAYOUT_STYLES.photoButton} ${STYLES.photoButton}`}
              data-kr-element="contact-photo-toggle"
              title={mode === 'circle' ? 'Show the whole photo' : 'Show the photo as a circle'}
              type="button"
              onClick={() => setMode(mode === 'circle' ? 'full' : 'circle')}
            >
              <KRHomebaseIcon className={STYLES.photoIcon} name={mode === 'circle' ? 'preview' : 'outline-target'} />
            </button>
          ) : null}
          {canEditPhoto ? (
            <button
              aria-label={photo ? 'Change the photo' : 'Add a photo'}
              className={`${LAYOUT_STYLES.photoButton} ${STYLES.photoButton}`}
              data-kr-element="contact-photo-edit"
              title={photo ? 'Change the photo or its circle' : 'Add a photo'}
              type="button"
              onClick={() => setDialogOpen(true)}
            >
              <KRHomebaseIcon className={STYLES.photoIcon} name="camera" />
            </button>
          ) : null}
        </div>
      </div>
      {/* Type, record number and account state */}
      <div className={`${LAYOUT_STYLES.roleBar} ${STYLES.roleBar}`} data-kr-element="contact-identity-photo-label" title="Contact type and account status">
        <span className={STYLES.roleBarType}>{contact.typeLabel}</span>
        <span className={STYLES.roleBarAccess}>
          {contact.kind === 'entity' ? `Entity record #${contact.ecid ?? 'pending'}` : `Individual record #${contact.icid ?? 'pending'}`}
        </span>
        <span className={STYLES.roleBarAccess}>{contact.isClient ? 'Client account' : 'Contact only'}</span>
      </div>
      {canEditPhoto ? <ContactPhotoDialog contact={contact} open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={keepSaved} /> : null}
    </div>
  )
}
