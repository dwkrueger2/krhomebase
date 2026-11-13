'use client'
// file: apps/web/features/leads/components/LeadLedger.client.tsx
/**
 * Dense Individuals/Leads directory for the Leads workspace.
 *
 * Ported from the old `hb-components/KR-Leads/components/LeadLedger.client.tsx` on the shared `KRLedgerTable` (the
 * one Contacts uses). Unchanged: the caption, description, empty message, row titles, the five columns (Lead Num,
 * Name with its copy button, Email, Phone, Status), click and double-click open the row, the Add Lead toolbar
 * action hidden from people who may not create leads, and the `settingsKey`.
 *
 * Changed:
 *  - The Add Lead icon is `KRHomebaseIcons.Add` (old: the text glyph "+").
 *  - Four more columns, hidden at first (Urgency, Source, Assigned, Received), from the lead the API now returns.
 *  - The Leads list is sorted by Received, newest first, as the API pages it ("Load more" adds older leads, D10); the
 *    Individuals list stays sorted by name. The panel remounts the ledger when the filter changes so the sort resets.
 *  - The footer with paging is shown (old: `hideFooter`), because the ledger shows only one page of rows at a time
 *    and the old screen silently hid the rest.
 *  - An empty Lead Num shows "—" as before; Status reads the plain labels (`directoryStatusLabel`), and a converted
 *    lead shows its client number.
 */

import KRLedgerTable from '@/components/tables/KRLedgerTable.client'
import type { KRLedgerColumn, KRLedgerSortState } from '@/components/tables/ledgerTypes'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { directoryStatusLabel, type KRLeadContact } from '../leadRows'

const STYLES = {
  nameCell: 'gap-[3px] inline-flex min-w-0 items-center',
  nameText: 'min-w-0 truncate',
  addIcon: 'size-[12px]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Short date for the Received column (MM/DD/YYYY). */
function formatShortDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const leadColumns: Array<KRLedgerColumn<KRLeadContact>> = [
  { id: 'leadNumber', label: 'Lead Num', accessor: 'leadNumber', sortable: true, width: '92px', render: (row) => row.leadNumber ?? '—' },
  { id: 'displayName', label: 'Name', accessor: 'displayName', sortable: true, width: '210px', render: (row) => <span className={STYLES.nameCell}><span className={STYLES.nameText}>{row.displayName}</span>{row.displayName ? <KRCopyButton value={row.displayName} label="name" /> : null}</span> },
  { id: 'email', label: 'Email', accessor: 'email', sortable: true, width: '190px' },
  { id: 'phone', label: 'Phone', accessor: 'phone', sortable: true, width: '130px' },
  { id: 'leadStatus', label: 'Status', accessor: 'leadStatus', sortable: true, width: '110px', render: directoryStatusLabel },
  { id: 'urgency', label: 'Urgency', accessor: (row) => row.lead?.urgency ?? '', sortable: true, width: '80px', hiddenByDefault: true },
  { id: 'source', label: 'Source', accessor: (row) => row.source ?? '', sortable: true, width: '100px', hiddenByDefault: true },
  { id: 'assignedTo', label: 'Assigned', accessor: (row) => row.lead?.assignedToLabel ?? '', sortable: true, width: '130px', hiddenByDefault: true },
  { id: 'receivedAt', label: 'Received', accessor: (row) => row.lead?.receivedAt ?? '', sortable: true, width: '96px', hiddenByDefault: true, render: (row) => formatShortDate(row.lead?.receivedAt) },
]

const LEADS_SORT: KRLedgerSortState = { columnId: 'receivedAt', direction: 'desc' }
const INDIVIDUALS_SORT: KRLedgerSortState = { columnId: 'displayName', direction: 'asc' }

/** Props for the Leads directory ledger. */
export interface LeadLedgerProps {
  rows: KRLeadContact[]
  /** Which list the rows are: leads sort newest first, individuals by name. */
  filter: 'individuals' | 'leads'
  canAddLead?: boolean
  selectedRowId?: string | null
  onAddLead?: () => void
  onSelectRow: (row: KRLeadContact) => void
}

/**
 * Renders the full-width Individuals/Leads directory and opens detail on row selection.
 *
 * @param props - The rows of the active filter, the filter, whether Add Lead shows, and the row and Add Lead handlers.
 */
export default function LeadLedger({ canAddLead = false, filter, onAddLead, rows, selectedRowId, onSelectRow }: LeadLedgerProps) {
  return (
    <KRLedgerTable
      caption="Lead directory"
      columns={leadColumns}
      defaultSort={filter === 'leads' ? LEADS_SORT : INDIVIDUALS_SORT}
      description="Search existing individuals or operational leads. Entities are not eligible to become Leads."
      emptyMessage="No matching Individuals or Leads."
      getRowTitle={(row) => row.recordKind === 'lead' ? `${row.leadNumber ?? 'Lead'}: ${row.displayName}` : `${row.displayName}: non-lead individual`}
      krId="LeadLedger"
      onRowDoubleClick={onSelectRow}
      onRowSelect={onSelectRow}
      pagination
      rows={rows}
      searchPlaceholder="Search the directory"
      selectedRowId={selectedRowId}
      settingsKey="kr_leads_directory_v1"
      toolbarActions={[
        {
          id: 'add-lead',
          label: 'Add Lead',
          title: canAddLead ? 'Create a Lead for an Individual' : 'Your role cannot create Leads.',
          icon: <KRHomebaseIcons.Add className={STYLES.addIcon} />,
          onClick: () => onAddLead?.(),
          hidden: !canAddLead,
        },
      ]}
    />
  )
}
