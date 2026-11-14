'use client'
// file: apps/web/features/contacts/components/ContactLedger.client.tsx
/**
 * Dense contact ledger. Ported from the old `modules/contacts/components/ContactLedger.client.tsx`; columns,
 * search rules (3 digits = exact client number, NNN.N = matter number, otherwise text contains), hover card and
 * the "H" toggle are unchanged. The CSS module became Tailwind classes.
 *
 * `onEditContact` is optional: Contacts Manager passes it only when the person may edit contacts. Without it there
 * is no pencil, no Edit button in the hover card, and double-click opens the contact instead.
 */

import { useState, type ReactNode } from 'react'
import KRLedgerTable from '@/components/tables/KRLedgerTable.client'
import type { KRLedgerColumn } from '@/components/tables/ledgerTypes'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import type { KRContactRecord } from '../types'

const STYLES = {
  copyableValue: 'min-w-0 inline-flex max-w-full items-center',
  copyableText: 'min-w-0 truncate',
  summaryTitle: 'm-0 mb-[6px] gap-[4px] flex items-center text-[16px] leading-[1.1] font-extrabold text-(color:--kr-theme-text)',
  hoverTitleText: 'truncate',
  summaryLine: 'm-0 text-[12px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  hoverCopyLine: 'gap-[4px] flex items-center',
  hoverCopyValue: 'min-w-0 truncate',
  buttonRow: 'mt-[6px] gap-[6px] flex flex-wrap items-center justify-end',
  ghostButton:
    'min-h-[28px] px-[9px] py-[5px] inline-flex items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[12px] font-extrabold text-(color:--kr-theme-text) cursor-pointer',
  primaryButton:
    'min-h-[28px] px-[9px] py-[5px] inline-flex items-center justify-center rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background)',
  hoverToggle:
    'size-[16px] p-0 inline-flex items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[10px] font-extrabold text-(color:--kr-theme-text-muted) cursor-pointer',
  hoverToggleActive: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
} as const

/** Short date for the Updated column (MM/DD/YYYY). */
function formatShortDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const columns: Array<KRLedgerColumn<KRContactRecord>> = [
  { id: 'clientNumber', label: 'Client Num', accessor: 'clientNumber', sortable: true, width: '86px', render: (row) => row.clientNumber?.trim() || 'NC' },
  { id: 'displayName', label: 'Name', accessor: 'displayName', sortable: true, width: '220px', render: (row) => renderCopyableContactValue(row.displayName, 'name') },
  { id: 'typeLabel', label: 'Type', accessor: 'typeLabel', sortable: true, width: '112px' },
  { id: 'email', label: 'Email', accessor: 'email', sortable: true, width: '190px', render: (row) => renderCopyableContactValue(row.email ?? '', 'email') },
  { id: 'phone', label: 'Phone', accessor: 'phone', sortable: true, width: '130px', render: (row) => renderCopyableContactValue(row.phone ?? '', 'phone') },
  { id: 'city', label: 'City', accessor: 'city', sortable: true, width: '120px', hiddenByDefault: true },
  { id: 'state', label: 'State', accessor: 'state', sortable: true, width: '68px', hiddenByDefault: true },
  { id: 'status', label: 'Status', accessor: 'status', sortable: true, width: '130px', hiddenByDefault: true },
  { id: 'updatedAt', label: 'Updated', accessor: 'updatedAt', sortable: true, width: '104px', hiddenByDefault: true, render: (row) => formatShortDate(row.updatedAt ?? row.createdAt) },
]

function contactSearchText(row: KRContactRecord): string {
  return [
    row.clientNumber,
    row.displayName,
    row.typeLabel,
    row.email,
    row.phone,
    row.addressLine1,
    row.addressLine2,
    row.city,
    row.state,
    row.postalCode,
    row.status,
    row.notes,
  ].filter(Boolean).join(' ')
}

/**
 * Filters the contact ledger and places an exact client-number match first.
 * Three-digit client numbers and dotted matter numbers are identifier
 * searches, not fuzzy searches. This prevents a query such as 050 from
 * matching phone numbers, notes, or names that happen to contain 050.
 */
function searchContactRows(query: string, rows: KRContactRecord[]): KRContactRecord[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (/^\d{3}$/.test(normalizedQuery)) {
    return rows.filter((row) => row.clientNumber?.trim().toLowerCase() === normalizedQuery)
  }
  if (/^\d{3}\.\d+$/.test(normalizedQuery)) {
    return rows.filter((row) => row.relatedMatters.some((matter) => matter.matterNumber.trim().toLowerCase() === normalizedQuery))
  }
  return rows.filter((row) => contactSearchText(row).toLowerCase().includes(normalizedQuery))
}

function relatedMatterLabel(row: KRContactRecord): string {
  if (!row.relatedMatters.length) return 'None'
  return row.relatedMatters.map((matter) => matter.matterNumber).join(', ')
}

function renderCopyableContactValue(value: string, label: string): ReactNode {
  if (!value.trim()) return ''
  return (
    <span className={STYLES.copyableValue}>
      <span className={STYLES.copyableText}>{value}</span>
      <KRCopyButton value={value} label={label} />
    </span>
  )
}

export interface ContactLedgerRowHoverCardProps {
  row: KRContactRecord
  /** View button; left out, the card shows no View (the edit dialog's related contacts, Nov 13, 2026). */
  onSelectContact?: (contact: KRContactRecord) => void
  /** Optional until contact editing is ported. */
  onEditContact?: (contact: KRContactRecord) => void
}

function contactClientNumberLabel(row: KRContactRecord): string {
  const classification = [row.typeLabel, row.status, row.clientType, row.clientStatus]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (classification.includes('lead')) return 'Lead'
  return row.clientNumber?.trim() || 'NC'
}

function ContactHoverCopyLine({ label, value, emptyText }: { label: string; value: string | null; emptyText: string }) {
  const displayValue = value?.trim() || emptyText
  return (
    <p className={`${STYLES.summaryLine} ${STYLES.hoverCopyLine}`}>
      <strong>{label}:</strong>
      <span className={STYLES.hoverCopyValue}>{displayValue}</span>
      {value?.trim() ? <KRCopyButton value={value} label={label.toLowerCase()} /> : null}
    </p>
  )
}

/** Named row preview card for Contact Ledger hover interactions. */
export function ContactLedgerRowHoverCard({ row, onSelectContact, onEditContact }: ContactLedgerRowHoverCardProps) {
  return (
    <div data-kr-id="ContactLedgerRowHoverCard-content" data-kr-element="contact-ledger-row-hover-card-content">
      <h4 className={STYLES.summaryTitle}>
        <u className={STYLES.hoverTitleText}>{row.displayName}</u>
        <KRCopyButton value={row.displayName} label="name" />
      </h4>
      <p className={STYLES.summaryLine}><strong>Type:</strong> {row.typeLabel}</p>
      <p className={STYLES.summaryLine}><strong>ICID:</strong> {row.icid?.trim() || '—'}</p>
      <p className={STYLES.summaryLine}><strong>Client No:</strong> {contactClientNumberLabel(row)}</p>
      <ContactHoverCopyLine label="Email" value={row.email} emptyText="No email" />
      <ContactHoverCopyLine label="Phone" value={row.phone} emptyText="No phone" />
      <p className={STYLES.summaryLine}><strong>Related Matters:</strong> {relatedMatterLabel(row)}</p>
      {onSelectContact || onEditContact ? (
        <div className={STYLES.buttonRow}>
          {onSelectContact ? (
            <button className={STYLES.ghostButton} type="button" onClick={(event) => { event.stopPropagation(); onSelectContact(row) }}>View</button>
          ) : null}
          {onEditContact ? (
            <button className={STYLES.primaryButton} type="button" onClick={(event) => { event.stopPropagation(); onEditContact(row) }}>Edit</button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export interface ContactLedgerProps {
  rows: KRContactRecord[]
  canAddContact?: boolean
  /** Legacy prototype flag retained while bulk-contact creation is pending. */
  canBulkAddContacts?: boolean
  selectedContactId?: string | null
  onAddContact?: () => void
  /** Legacy prototype callback retained while bulk-contact creation is pending. */
  onBulkAddContacts?: () => void
  onSelectContact: (contact: KRContactRecord) => void
  /** Optional until contact editing is ported. */
  onEditContact?: (contact: KRContactRecord) => void
  settingsKey?: string
}

export default function ContactLedger({
  rows,
  canAddContact = false,
  selectedContactId,
  onAddContact,
  onSelectContact,
  onEditContact,
  settingsKey = 'kr_contacts_ledger_v3',
}: ContactLedgerProps) {
  const [rowHoverEnabled, setRowHoverEnabled] = useState(true)

  return (
    <KRLedgerTable
      actionsHeaderLabel="✎"
      actionsHeaderTitle="Click Pencil on Row to edit the contact information."
      caption="Contact Ledger"
      captionActions={(
        <button
          aria-label={rowHoverEnabled ? 'Disable contact row hover cards' : 'Enable contact row hover cards'}
          aria-pressed={rowHoverEnabled}
          className={`${STYLES.hoverToggle} ${rowHoverEnabled ? STYLES.hoverToggleActive : ''}`}
          title={rowHoverEnabled ? 'Disable contact row hover cards' : 'Enable contact row hover cards'}
          type="button"
          onClick={() => setRowHoverEnabled((current) => !current)}
        >
          H
        </button>
      )}
      columns={columns}
      defaultSort={{ columnId: 'displayName', direction: 'asc' }}
      description="Click a row to open Contact Detail. Double-click or use the pencil to edit where permitted."
      editRowLabel="Click Pencil on Row to edit the contact information."
      getRowHoverCardDataId={(row) => `ContactLedger-row-hover-card-${row.id}`}
      getSearchText={contactSearchText}
      searchRows={searchContactRows}
      krId="ContactLedger"
      rowHoverCard={rowHoverEnabled ? (row) => <ContactLedgerRowHoverCard row={row} onSelectContact={onSelectContact} onEditContact={onEditContact} /> : undefined}
      rowHoverCardOffsetColumnId="displayName"
      rows={rows}
      searchPlaceholder="Search contacts"
      selectedRowId={selectedContactId}
      settingsKey={settingsKey}
      toolbarActions={[
        {
          id: 'add-contact',
          label: 'Add contact',
          title: canAddContact ? 'Add a contact' : 'Your role cannot add contacts.',
          icon: '+',
          onClick: () => onAddContact?.(),
          hidden: !canAddContact,
        },
      ]}
      onRowDoubleClick={onEditContact ?? onSelectContact}
      onRowEdit={onEditContact}
      onRowSelect={onSelectContact}
      pagination
    />
  )
}
