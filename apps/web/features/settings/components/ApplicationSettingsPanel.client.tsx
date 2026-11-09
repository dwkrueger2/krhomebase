'use client'
// file: apps/web/features/settings/components/ApplicationSettingsPanel.client.tsx
/**
 * Placeholder for the Application Settings screen (menu id `application-settings`).
 *
 * It shows the "Module [TBD]" card, with the name and purpose taken from the menu list in
 * `components/shell/navigation.ts`. Replace the body of this file with the real screen when the
 * Application Settings section is built. `app/page.tsx` already places this component in the workspace and in
 * the pop-out window, so nothing else needs to change.
 *
 * `children` are finished sections from other features, placed below the card by `app/page.tsx` (today: the
 * super admin's "Outside tools" screen). This feature does not import them, which keeps the rule that a
 * feature never imports another feature's files.
 *
 * @param props - Optional sections to show below the placeholder.
 * @returns The placeholder card and any sections.
 */

import type { ReactNode } from 'react'
import { findNavItem } from '@/components/shell/navigation'
import ModulePlaceholder from '@/components/ui/ModulePlaceholder.client'

export default function ApplicationSettingsPanel({ children }: { children?: ReactNode }) {
  const item = findNavItem('application-settings')

  return (
    <div data-kr-id="ApplicationSettingsPanel">
      {/* Application Settings placeholder: replace with the real screen */}
      <ModulePlaceholder sectionId={item.id} label={item.label} description={item.description} />
      {/* Finished sections placed here by app/page.tsx */}
      {children}
    </div>
  )
}
