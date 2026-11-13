'use client'
// file: apps/web/features/leads/components/LeadDetailWorkspace.client.tsx
/**
 * Places the selected Lead summary above WorkStream, Documents, Pipeline, and Contact-style Danger Zone items.
 *
 * Ported from the old `hb-components/KR-Leads/components/LeadDetailWorkspace.client.tsx`. Unchanged: Menu Style One
 * with the tabs Detail, WorkStream, Documents, Lead Pipeline and Danger Zone, in that order, Detail first, the tab
 * strip keyed by the lead, and the `data-kr-id` markers.
 *
 * Changed:
 *  - WorkStream mounts the Workstream screen (`CommunicationsPanel` from `features/communications`) with the lead as
 *    its fixed owner (`{ leadId, contextLabel: 'Lead L007' }`) and the signed-in `viewer`, so the lead's notes, calls
 *    and emails are listed and added there. The old "operational Lead" check is gone: every lead from the API has an
 *    id.
 *  - Documents and Lead Pipeline are holding cards drawn with the shared `KRModuleCard` (old:
 *    `ContactDetailPlaceholder` from the contacts module). Conversion, which the old Pipeline card promised, is now
 *    the "Convert to client" button on the Detail tab.
 *  - Danger Zone is shown only to a super admin (`canMaintain`), as in Contacts, with `ContactMaintenanceCard` for the
 *    lead's person from the data store (old: the tab was always listed and said "Your role cannot use Danger Zone
 *    actions." to others). While the person is not in the data store yet, the tab says so.
 */

import { useState, type ReactNode } from 'react'
import type { Lead } from '@krhomebase/contracts'
import MenuStyleOne, { type MenuStyleOneItem } from '@/components/ui/MenuStyleOne.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import CommunicationsPanel from '@/features/communications/components/CommunicationsPanel.client'
import ContactMaintenanceCard from '@/features/contacts/components/ContactMaintenanceCard.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { leadNumber } from '../leadRows'

/** The signed-in person, as `app/page.tsx` gives it (the Workstream screen's viewer). */
export interface LeadsViewer {
  userId: string
  displayName: string
  email: string
  role: string
}

export interface LeadDetailWorkspaceProps {
  lead: Lead
  /** The lead's person in the data store, when loaded. */
  contact: KRContactRecord | null
  /** The signed-in person for the WorkStream tab. */
  viewer?: LeadsViewer
  /** The Detail tab's card (summary and notes), built by the panel. */
  detail: ReactNode
  /** Shows the Danger Zone tab (super admin). */
  canMaintain?: boolean
  /** Called after the person is merged, deleted or made inactive in the Danger Zone. */
  onResolved?: () => void
}

const STYLES = {
  notice: 'text-[12px] text-(color:--kr-theme-text-muted)',
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
  workspace: 'min-w-0',
  notice: 'm-0',
  workstream: 'min-h-[420px] min-w-0',
} as const

/**
 * Renders the selected lead's tabs.
 *
 * @param props - The lead, its person, the viewer, the Detail card, whether the Danger Zone shows, and `onResolved`.
 */
export default function LeadDetailWorkspace({ canMaintain = false, contact, detail, lead, onResolved, viewer }: LeadDetailWorkspaceProps) {
  const [activeMenuItemId, setActiveMenuItemId] = useState('detail')
  const code = leadNumber(lead)
  const menuItems: MenuStyleOneItem[] = [
    { id: 'detail', label: 'Detail', card: detail },
    {
      id: 'workstream',
      label: 'WorkStream',
      card: (
        <div className={LAYOUT_STYLES.workstream} data-kr-element="lead-workstream">
          <CommunicationsPanel context={{ leadId: lead.id, contextLabel: `Lead ${code}` }} viewer={viewer} />
        </div>
      ),
    },
    {
      id: 'documents',
      label: 'Documents',
      card: (
        <KRModuleCard krId="LeadDocuments" title="Documents">
          <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`}>Lead documents and document relationships will be connected here.</p>
        </KRModuleCard>
      ),
    },
    {
      id: 'lead-pipeline',
      label: 'Lead Pipeline',
      card: (
        <KRModuleCard krId="LeadPipeline" title="Lead Pipeline">
          <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`}>Pipeline stages and forecasting will be connected here. To make this lead a client, use Convert to client on the Detail tab.</p>
        </KRModuleCard>
      ),
    },
    ...(canMaintain
      ? [{
          id: 'danger-zone',
          label: 'Danger Zone',
          tone: 'orange' as const,
          card: contact ? (
            <ContactMaintenanceCard contact={contact} onResolved={onResolved} />
          ) : (
            <KRModuleCard krId="LeadDangerZone" note="Danger Zone requires an authorized user and a hydrated Individual contact record." title="Danger Zone">
              <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`}>The selected Lead contact record is still loading.</p>
            </KRModuleCard>
          ),
        }]
      : []),
  ]

  return (
    <div className={LAYOUT_STYLES.workspace} data-kr-id={`LeadDetailWorkspace-${code}`}>
      <MenuStyleOne
        key={lead.id}
        props={{
          activeItemId: activeMenuItemId,
          ariaLabel: `Lead sections for ${lead.displayName}`,
          defaultActiveItemId: 'detail',
          idPrefix: `lead-detail-${lead.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
          items: menuItems,
          menuKrId: `Lead-Detail-Menu-${code}`,
          onActiveItemChange: setActiveMenuItemId,
        }}
      />
    </div>
  )
}
