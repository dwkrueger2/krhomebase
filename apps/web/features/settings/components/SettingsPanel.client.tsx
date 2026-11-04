'use client'
// file: apps/web/features/settings/components/SettingsPanel.client.tsx
/**
 * Placeholder for the Settings screen (menu id `settings`).
 *
 * It shows the "Module [TBD]" card, with the name and purpose taken from the menu list in
 * `components/shell/navigation.ts`. Replace the body of this file with the real screen when the
 * Settings section is built. `app/page.tsx` already places this component in the workspace and in
 * the pop-out window, so nothing else needs to change.
 *
 * @returns The placeholder card.
 */

import { findNavItem } from '@/components/shell/navigation'
import ModulePlaceholder from '@/components/ui/ModulePlaceholder.client'

export default function SettingsPanel() {
  const item = findNavItem('settings')

  return (
    <div data-kr-id="SettingsPanel">
      {/* Settings placeholder: replace with the real screen */}
      <ModulePlaceholder sectionId={item.id} label={item.label} description={item.description} />
    </div>
  )
}
