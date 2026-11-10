'use client'
// file: apps/web/features/contacts/components/ContactIdentityPhotoColumn.client.tsx
/**
 * The left part of a contact's identity header: a square with the contact's initials (contacts have no photo yet),
 * and under it the contact type, the record number and whether it is a client account. Ported from the old
 * `modules/contacts/components/ContactIdentityPhotoColumn.tsx`; sizes unchanged (140 pixels, 96 on a phone). The old
 * CSS module became Tailwind classes reading the theme tokens.
 */

import type { KRContactRecord } from '../types'

const LAYOUT_STYLES = {
  column: 'flex w-[96px] md:w-[140px] flex-col',
  photo: 'flex size-[96px] md:size-[140px] items-center justify-center overflow-hidden',
  roleBar: 'mt-[8px] w-[96px] md:w-[140px] box-border flex flex-col gap-[1px] px-[6px] py-[5px] md:px-[10px] md:py-[6px]',
} as const

const STYLES = {
  photo: 'rounded-[2px] bg-(--kr-theme-button-primary-background) font-(family-name:--kr-theme-font-display) text-[30px] md:text-[44px] font-extrabold tracking-[0.02em] text-(color:--kr-theme-text-inverse)',
  initials: 'select-none',
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

export default function ContactIdentityPhotoColumn({ contact }: { contact: KRContactRecord }) {
  return (
    <div className={LAYOUT_STYLES.column} data-kr-element="contact-identity-photo-column">
      {/* Initials stand in for a photo */}
      <div className={`${LAYOUT_STYLES.photo} ${STYLES.photo}`} role="img" aria-label={`Photo placeholder for ${contact.displayName}`}>
        <span className={STYLES.initials}>{contactInitials(contact.displayName)}</span>
      </div>
      {/* Type, record number and account state */}
      <div className={`${LAYOUT_STYLES.roleBar} ${STYLES.roleBar}`} data-kr-element="contact-identity-photo-label" title="Contact type and account status">
        <span className={STYLES.roleBarType}>{contact.typeLabel}</span>
        <span className={STYLES.roleBarAccess}>
          {contact.kind === 'entity' ? `Entity record #${contact.ecid ?? 'pending'}` : `Individual record #${contact.icid ?? 'pending'}`}
        </span>
        <span className={STYLES.roleBarAccess}>{contact.isClient ? 'Client account' : 'Contact only'}</span>
      </div>
    </div>
  )
}
