'use client'
// file: apps/web/features/leads/components/LeadIndividualConfirmDialog.client.tsx
/**
 * The confirmation shown before an existing Individual becomes a Lead ("Add Individual ... to the Lead List?").
 *
 * Ported from the old `hb-components/KR-Leads/LeadIndividualConfirmDialog.client.tsx`. Unchanged: the title,
 * question, the known details (name, address, email, phone), the ICID line, Cancel and "Add to Lead List", and the
 * markers. It stays its own `role="dialog"` (the root guide allows a specialized dialog) because it shows a details
 * block that `U6ConfirmationDialog` does not.
 *
 * Changed: the portal carries `data-kr-theme-scope="krhomebase"` so the theme tokens apply; the visual classes moved
 * to `STYLES` and the spacing to `LAYOUT_STYLES` (the old file kept both in `STYLES`); colors read the tokens without
 * fixed fallbacks; Escape cancels.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { KRContactRecord } from '@/features/contacts/types'

/** Props for the confirmation shown before an existing Individual becomes a Lead. */
export interface LeadIndividualConfirmDialogProps {
  open: boolean
  contact: KRContactRecord | null
  onCancel: () => void
  onConfirm: () => void
}

const STYLES = {
  backdrop: 'bg-[rgba(0,30,58,0.34)]',
  dialog: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_12px_32px_rgba(0,30,58,0.28)]',
  header: 'border-b border-(--kr-theme-line)',
  eyebrow: 'text-[10px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  title: 'text-[16px] font-extrabold leading-tight text-(color:--kr-theme-text)',
  identifier: 'text-[10px] text-(color:--kr-theme-text-muted)',
  question: 'text-[12px] leading-[1.3] text-(color:--kr-theme-text)',
  details: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  detail: 'text-[11px] leading-[1.3]',
  detailLabel: 'font-extrabold text-(color:--kr-theme-text-muted)',
  detailValue: 'min-w-0 break-words text-(color:--kr-theme-text)',
  footer: 'border-t border-(--kr-theme-line)',
  cancel: 'px-[10px] py-[4px] min-h-[28px] rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[11px] font-extrabold text-(color:--kr-theme-text) cursor-pointer',
  confirm: 'px-[10px] py-[4px] min-h-[28px] rounded-[2px] border border-(--kr-theme-brand-primary-active) bg-(--kr-theme-brand-primary-active) text-[11px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  backdrop: 'p-(--kr-theme-padding-2-6) fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto',
  viewport: 'flex min-h-full items-start justify-center',
  dialog: 'p-[10px] w-full max-w-[460px]',
  header: 'pb-[6px]',
  text: 'm-0',
  title: 'mt-[2px] mb-0',
  identifier: 'mt-[2px] mb-0',
  body: 'py-[8px] gap-[6px] grid',
  details: 'p-[6px] gap-[3px] grid',
  detail: 'gap-[6px] grid grid-cols-[64px_minmax(0,1fr)]',
  footer: 'pt-[6px] gap-[4px] flex flex-wrap justify-end',
} as const

function addressLabel(contact: KRContactRecord): string {
  return [contact.addressLine1, contact.addressLine2, [contact.city, contact.state, contact.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(', ') || 'No address recorded'
}

/**
 * Confirms adding an existing Individual to the operational Lead List.
 *
 * @param props - `open`, the Individual, and the Cancel and confirm handlers (the panel then opens Create Lead for
 *   that person). Nothing is drawn while closed or without a contact.
 */
export default function LeadIndividualConfirmDialog({ contact, onCancel, onConfirm, open }: LeadIndividualConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    function cancelOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => window.removeEventListener('keydown', cancelOnEscape)
  }, [onCancel, open])

  if (!open || !contact || typeof document === 'undefined') return null

  return createPortal(
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" role="presentation">
      <div className={LAYOUT_STYLES.viewport}>
        <section aria-labelledby="lead-individual-confirm-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="LeadIndividualConfirmDialog" role="dialog">
          {/* Individual-to-Lead confirmation header: keeps the ICID visible but visually secondary. */}
          <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
            <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Leads</p>
            <h2 className={`${LAYOUT_STYLES.title} ${STYLES.title}`} id="lead-individual-confirm-title">Add Individual {contact.displayName} to the Lead List?</h2>
            <p className={`${LAYOUT_STYLES.identifier} ${STYLES.identifier}`}>ICID {contact.icid ?? 'not available'}</p>
          </header>

          {/* Known Individual details: provide enough context to prevent selecting the wrong person. */}
          <div className={LAYOUT_STYLES.body}>
            <p className={`${LAYOUT_STYLES.text} ${STYLES.question}`}>This Individual is not currently a Lead or Client. Review the known details before creating the Lead record.</p>
            <div aria-label="Known Individual details" className={`${LAYOUT_STYLES.details} ${STYLES.details}`} data-kr-element="lead-individual-known-details">
              <div className={`${LAYOUT_STYLES.detail} ${STYLES.detail}`}><span className={STYLES.detailLabel}>Name</span><span className={STYLES.detailValue}>{contact.displayName}</span></div>
              <div className={`${LAYOUT_STYLES.detail} ${STYLES.detail}`}><span className={STYLES.detailLabel}>Address</span><span className={STYLES.detailValue}>{addressLabel(contact)}</span></div>
              <div className={`${LAYOUT_STYLES.detail} ${STYLES.detail}`}><span className={STYLES.detailLabel}>Email</span><span className={STYLES.detailValue}>{contact.email || 'No email recorded'}</span></div>
              <div className={`${LAYOUT_STYLES.detail} ${STYLES.detail}`}><span className={STYLES.detailLabel}>Phone</span><span className={STYLES.detailValue}>{contact.phone || 'No phone recorded'}</span></div>
            </div>
          </div>

          {/* Confirmation actions: explicit cancel and create choices use the project dialog standard. */}
          <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
            <button className={STYLES.cancel} onClick={onCancel} type="button">Cancel</button>
            <button className={STYLES.confirm} onClick={onConfirm} type="button">Add to Lead List</button>
          </footer>
        </section>
      </div>
    </div>,
    document.body,
  )
}
