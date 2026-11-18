'use client'
// file: apps/web/features/contacts/components/ContactTaxIdLine.client.tsx
/**
 * The SSN (individual) or EIN (entity) row of a contact's identity summary (FB-0003, the requester, Nov 16, 2026:
 * "visible on the contact card, click to show, and a copy button; we need this often").
 *
 * The number shows masked (`•••-••-6789`, the last four digits the list already carries). The eye button shows it in
 * full and the struck-through eye hides it again; while shown, a copy button sits beside it. An EIN is in the contact
 * record already. A full SSN is not (the list and the browser cache leave it out on purpose, see
 * `packages/contracts/src/contacts.ts`), so the first show reads the one contact with `fetchContactDetail`, the same
 * read the contact editor makes, and keeps the number only in this row's state: it is never written to the data store.
 * Showing is not recorded (the requester, Nov 16, 2026: no audit for viewing).
 *
 * Read-only: nothing here writes.
 *
 * Changed Nov 17, 2026 (FB-0014): the browser cache now keeps the last four digits, so a contact read from it shows
 * the masked number instead of "No SSN recorded"; and a business read from the cache (which keeps no full EIN) shows
 * its EIN from the one-contact read, as a person's SSN is.
 */

import { useEffect, useState } from 'react'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { ContactApiError, fetchContactDetail } from '../contactEdits.client'
import { formatTaxId, maskTaxId } from '../taxIdFormat'
import type { KRContactRecord } from '../types'

const LAYOUT_STYLES = {
  // The same columns as a phone row in ContactIdentityDetails: icon, label, value with its buttons.
  line: 'gap-[6px] grid min-h-[18px] min-w-0 grid-cols-[15px_44px_minmax(0,1fr)] items-center',
  icon: 'inline-flex size-[15px] shrink-0 items-center justify-center',
  iconGlyph: 'size-[13px]',
  value: 'gap-[4px] inline-flex min-w-0 items-center',
  eyeButton: 'ml-[3px] size-[16px] p-0 inline-flex flex-none items-center justify-center',
} as const

const STYLES = {
  line: 'text-[12.5px] leading-[1.35] text-(color:--kr-theme-text)',
  icon: 'text-(color:--kr-theme-accent)',
  label: 'text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  number: 'tabular-nums tracking-[0.02em]',
  missing: 'text-(color:--kr-theme-text-muted)',
  eyeButton:
    'rounded-[2px] border border-transparent bg-transparent text-(color:--kr-theme-text-muted) cursor-pointer opacity-70 hover:opacity-100 hover:border-(--kr-theme-line) hover:text-(color:--kr-theme-accent) disabled:cursor-wait',
  eyeIcon: 'size-[12px]',
  problem: 'text-[11px] text-(color:--kr-theme-danger)',
} as const

/**
 * @param props - `contact`: the contact on show (its `kind`, `ssnLast4` or `ein`/`einLast4`, and `ssn` when it was
 *   loaded in full).
 * @returns `<div data-kr-element="contact-tax-id-row">`.
 */
export default function ContactTaxIdLine({ contact }: { contact: KRContactRecord }) {
  const isEntity = contact.kind === 'entity'
  const label = isEntity ? 'EIN' : 'SSN'
  const [shown, setShown] = useState(false)
  const [loadedNumber, setLoadedNumber] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')

  // Another contact in the same card: hide again and forget the number read for the last one.
  useEffect(() => {
    setShown(false)
    setLoadedNumber(null)
    setProblem('')
  }, [contact.id])

  const fullValue = (isEntity ? contact.ein : contact.ssn) || loadedNumber || ''
  const last4 = isEntity ? (contact.einLast4 ?? contact.ein?.replace(/\D/g, '').slice(-4)) : (contact.ssnLast4 ?? contact.ssn?.replace(/\D/g, '').slice(-4))
  const masked = maskTaxId(contact.kind, last4)
  const formatted = formatTaxId(contact.kind, fullValue)

  /** Shows the number, reading the full SSN or EIN once when the record does not carry it. */
  async function show(): Promise<void> {
    setProblem('')
    if (fullValue) {
      setShown(true)
      return
    }
    setLoading(true)
    try {
      const detail = await fetchContactDetail(contact.id)
      setLoadedNumber((isEntity ? detail.ein : detail.ssn) ?? '')
      setShown(true)
    } catch (error) {
      const code = error instanceof ContactApiError ? error.code : 'UNKNOWN'
      L(`[CONTACT_TAX_ID:86] could not read the number contactId=${contact.id} code=${code}`)
      setProblem(`The ${label} could not be read.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${LAYOUT_STYLES.line} ${STYLES.line}`} data-kr-element="contact-tax-id-row">
      <span className={`${LAYOUT_STYLES.icon} ${STYLES.icon}`} aria-hidden="true">
        <KRHomebaseIcon className={LAYOUT_STYLES.iconGlyph} name="lock" />
      </span>
      <span className={STYLES.label} title={isEntity ? 'Employer Identification Number' : 'Social Security or other taxpayer number'}>
        {label}
      </span>
      <span className={LAYOUT_STYLES.value}>
        {!masked && !fullValue ? (
          <span className={STYLES.missing}>No {label} recorded</span>
        ) : (
          <>
            <span className={STYLES.number} aria-label={shown ? label : `${label}, hidden`}>
              {shown ? formatted || `No ${label} recorded` : masked || '•••••••••'}
            </span>
            <button
              aria-label={shown ? `Hide ${label}` : `Show ${label}`}
              aria-pressed={shown}
              className={`${LAYOUT_STYLES.eyeButton} ${STYLES.eyeButton}`}
              data-kr-element="contact-tax-id-show"
              disabled={loading}
              title={shown ? `Hide ${label}` : `Show ${label}`}
              type="button"
              onClick={() => (shown ? setShown(false) : void show())}
            >
              <KRHomebaseIcon className={STYLES.eyeIcon} name={shown ? 'eye-off' : 'eye'} />
            </button>
            {shown && formatted ? <KRCopyButton value={formatted} label={label} /> : null}
            {loading ? <RainbowBusySpinner ariaLabel={`Reading the ${label}`} busy size={12} /> : null}
          </>
        )}
        {problem ? <span className={STYLES.problem}>{problem}</span> : null}
      </span>
    </div>
  )
}
