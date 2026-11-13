'use client'
// file: apps/web/features/contacts/components/ContactDetailWorkspace.client.tsx
/**
 * An open contact: Menu Style One with the contact's tabs above the chosen card. Ported from the old
 * `modules/contacts/components/ContactDetailWorkspace.client.tsx`; tab names, order and markers unchanged.
 *
 * Tabs, and when each gets its real screen:
 *  - Detail: `ContactDetailCard`, ported now (plan stage 1d-2).
 *  - WorkStream: the client's activity ledger. Holding card until Tasks and WorkStream are ported (phase D).
 *  - Projects & Matters: the client's matters. Holding card until the matters screens are ported (stage 3).
 *  - Documents: was already a "Coming soon" card in the old app.
 *  - Danger Zone (super admin only): contact maintenance, `ContactMaintenanceCard` (stage 1d-4).
 *
 * Choosing a matter in the Detail tab opens Projects & Matters, as before.
 */

import { useState } from 'react'
import MenuStyleOne, { type MenuStyleOneItem } from '@/components/ui/MenuStyleOne.client'
import type { KRContactRecord } from '../types'
import ContactDetailCard from './ContactDetailCard.client'
import ContactDetailPlaceholder from './ContactDetailPlaceholder.client'
import ContactMaintenanceCard from './ContactMaintenanceCard.client'

export interface ContactDetailWorkspaceProps {
  contact: KRContactRecord
  /** Opens the editor. Absent: no pencil (editing arrives in stage 1d-3). */
  onEdit?: () => void
  /** Closes this open contact. */
  onClose?: () => void
  /** Opens a related contact. */
  onOpenContact?: (contactId: string) => void
  /** Opens Billing for this client account. */
  onOpenBilling?: (clientId: string) => void
  /** Shows the Danger Zone tab (super admin). */
  canMaintain?: boolean
  /** Called after a merge, copy-and-inactivate, delete or inactivate of this contact. */
  onResolved?: () => void
}

const LAYOUT_STYLES = {
  workspace: 'w-full min-w-0 p-[8px]',
} as const

export default function ContactDetailWorkspace({ contact, onEdit, onClose, onOpenContact, onOpenBilling, canMaintain = false, onResolved }: ContactDetailWorkspaceProps) {
  const [activeMenuItemId, setActiveMenuItemId] = useState('detail')
  const menuItems: MenuStyleOneItem[] = [
    {
      id: 'detail',
      label: 'Detail',
      card: (
        <ContactDetailCard
          contact={contact}
          onClose={onClose}
          onEdit={onEdit}
          onOpenBilling={onOpenBilling}
          onOpenContact={onOpenContact}
          onOpenMatter={() => setActiveMenuItemId('projects-matters')}
        />
      ),
    },
    {
      id: 'workstream',
      label: 'WorkStream',
      card: <ContactDetailPlaceholder title="WorkStream" description="Client-level history for work, communications, documents, notes, and tasks. It is connected when Tasks and WorkStream are ported." />,
    },
    {
      id: 'projects-matters',
      label: 'Projects & Matters',
      card: <ContactDetailPlaceholder title="Projects & Matters" description="The client's matters are listed and edited here once the matters screens are ported, with Billing." />,
    },
    {
      id: 'documents',
      label: 'Documents',
      card: <ContactDetailPlaceholder title="Documents" description="Contact documents and document relationships will be connected here." />,
    },
    ...(canMaintain ? [{ id: 'danger-zone', label: 'Danger Zone', tone: 'orange' as const, card: <ContactMaintenanceCard contact={contact} onResolved={onResolved} /> }] : []),
  ]

  const workspaceLabel = `[${contact.clientNumber ?? 'NoNumber'}]-${contact.displayName}`
  return (
    <div className={LAYOUT_STYLES.workspace} data-kr-id={`ContactDetailWorkspace-${workspaceLabel}`}>
      <MenuStyleOne
        key={contact.id}
        props={{
          ariaLabel: `Contact Detail sections for ${contact.displayName}`,
          activeItemId: activeMenuItemId,
          idPrefix: `contact-detail-${contact.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
          items: menuItems,
          menuKrId: `Contact-Detail-Menu-${contact.clientNumber ?? contact.displayName}`,
          onActiveItemChange: setActiveMenuItemId,
        }}
      />
    </div>
  )
}
