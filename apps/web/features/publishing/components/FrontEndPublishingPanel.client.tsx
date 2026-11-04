'use client'
// file: apps/web/features/publishing/components/FrontEndPublishingPanel.client.tsx
/**
 * Placeholder for the Front End Publishing screen (menu id `front-end-publishing`).
 *
 * It shows the "Module [TBD]" card, with the name and purpose taken from the menu list in
 * `components/shell/navigation.ts`. Replace the body of this file with the real screen when the
 * Front End Publishing section is built. `app/page.tsx` already places this component in the workspace and in
 * the pop-out window, so nothing else needs to change.
 *
 * @returns The placeholder card.
 */

import { findNavItem } from '@/components/shell/navigation'
import ModulePlaceholder from '@/components/ui/ModulePlaceholder.client'

export default function FrontEndPublishingPanel() {
  const item = findNavItem('front-end-publishing')

  return (
    <div data-kr-id="FrontEndPublishingPanel">
      {/* Front End Publishing placeholder: replace with the real screen */}
      <ModulePlaceholder sectionId={item.id} label={item.label} description={item.description} />
    </div>
  )
}
