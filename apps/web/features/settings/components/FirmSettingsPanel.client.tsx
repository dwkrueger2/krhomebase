'use client'
// file: apps/web/features/settings/components/FirmSettingsPanel.client.tsx
/**
 * Placeholder for the Firm Settings screen (menu id `firm-settings`).
 *
 * It shows the "Module [TBD]" card, with the name and purpose taken from the menu list in
 * `components/shell/navigation.ts`. Replace the body of this file with the real screen when the
 * Firm Settings section is built. `app/page.tsx` already places this component in the workspace and in
 * the pop-out window, so nothing else needs to change.
 *
 * @returns The placeholder card.
 */

import { findNavItem } from '@/components/shell/navigation'
import ModulePlaceholder from '@/components/ui/ModulePlaceholder.client'

export default function FirmSettingsPanel() {
  const item = findNavItem('firm-settings')

  return (
    <div data-kr-id="FirmSettingsPanel">
      {/* Firm Settings placeholder: replace with the real screen */}
      <ModulePlaceholder sectionId={item.id} label={item.label} description={item.description} />
    </div>
  )
}
