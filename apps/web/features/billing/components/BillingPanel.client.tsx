'use client'
// file: apps/web/features/billing/components/BillingPanel.client.tsx
/**
 * Placeholder for the Billing screen (menu id `billing`).
 *
 * It shows the "Module [TBD]" card, with the name and purpose taken from the menu list in
 * `components/shell/navigation.ts`. Replace the body of this file with the real screen when the
 * Billing section is built. `app/page.tsx` already places this component in the workspace and in
 * the pop-out window, so nothing else needs to change.
 *
 * @returns The placeholder card.
 */

import { findNavItem } from '@/components/shell/navigation'
import ModulePlaceholder from '@/components/ui/ModulePlaceholder.client'

export default function BillingPanel() {
  const item = findNavItem('billing')

  return (
    <div data-kr-id="BillingPanel">
      {/* Billing placeholder: replace with the real screen */}
      <ModulePlaceholder sectionId={item.id} label={item.label} description={item.description} />
    </div>
  )
}
