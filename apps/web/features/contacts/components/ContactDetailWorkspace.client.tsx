'use client'
// file: apps/web/features/contacts/components/ContactDetailWorkspace.client.tsx
/**
 * An open contact: Menu Style One with the contact's tabs above the chosen card. Ported from the old
 * `modules/contacts/components/ContactDetailWorkspace.client.tsx`; tab names, order and markers unchanged.
 *
 * Tabs, and when each gets its real screen:
 *  - Detail: `ContactDetailCard`, ported now (plan stage 1d-2).
 *  - WorkStream: the client's activity ledger. Holding card until Tasks and WorkStream are ported (phase D).
 *  - Projects & Matters: the client's matters, `ClientMattersCard` from `features/matters` (plan 10, stage 1). The
 *    workspace loads the matters once (`useClientMatters`) and shares them with the Detail tab's ASSOCIATED MATTERS
 *    box, as the old workspace did; a contact with no client account shows a holding card.
 *  - Documents: was already a "Coming soon" card in the old app.
 *  - Danger Zone (super admin only): contact maintenance, `ContactMaintenanceCard` (stage 1d-4).
 *
 * Choosing a matter in the Detail tab opens Projects & Matters with that matter selected, as before.
 */

import { useMemo, useState } from 'react'
import MenuStyleOne, { type MenuStyleOneItem } from '@/components/ui/MenuStyleOne.client'
import ClientMattersCard from '@/features/matters/components/ClientMattersCard.client'
import { useClientMatters } from '@/features/matters/useClientMatters.client'
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
  const [requestedMatterId, setRequestedMatterId] = useState<string | null>(null)
  const clientMatters = useClientMatters(contact.isClient ? contact.clientId : null)
  // The Detail tab reads the loaded matters as the contact's related matters (the contacts list carries none).
  const contactWithMatters = useMemo<KRContactRecord>(
    () =>
      clientMatters.data
        ? {
            ...contact,
            relatedMatters: clientMatters.data.matters.map((matter) => ({ id: matter.id, matterNumber: matter.matterNumber, title: matter.title, role: 'primary client', status: matter.statusLabel ?? matter.statusLookupId })),
          }
        : contact,
    [clientMatters.data, contact],
  )
  const menuItems: MenuStyleOneItem[] = [
    {
      id: 'detail',
      label: 'Detail',
      card: (
        <ContactDetailCard
          contact={contactWithMatters}
          onClose={onClose}
          onEdit={onEdit}
          onOpenBilling={onOpenBilling}
          onOpenContact={onOpenContact}
          onOpenMatter={(matterId) => {
            setRequestedMatterId(matterId)
            setActiveMenuItemId('projects-matters')
          }}
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
      card:
        contact.isClient && contact.clientId ? (
          <ClientMattersCard
            clientId={contact.clientId}
            clientNumber={clientMatters.data?.clientNumber ?? contact.clientNumber}
            displayName={contact.clientDisplayName || contact.displayName}
            requestedMatterId={requestedMatterId}
            state={clientMatters}
          />
        ) : (
          <ContactDetailPlaceholder title="Projects & Matters" description="This contact has no client account. Matters belong to a client; make the contact a client to add matters." />
        ),
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
