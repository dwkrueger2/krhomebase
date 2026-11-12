'use client'
// file: apps/web/features/settings/components/SettingsPagePlaceholder.client.tsx
/**
 * Stands in for a Settings page that is not built yet (plan `docs/08_Settings_Dashboard_Plan.md`, stage 1). It is a
 * small `KRModuleCard`: the page name as the title, the plan stage that builds it as the note, and one line about the
 * page. Each page's placeholder goes away when its stage replaces it.
 *
 * @param props - The page's name, its one-line description, the stage that builds it and the marker prefix.
 * @returns A module card (`data-kr-id="<krId>-KRModuleCard"`).
 */

import { KRModuleCard } from '@/components/ui/KRModuleCard.client'

const STYLES = {
  text: 'm-0 text-[13px] leading-[1.4] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface SettingsPagePlaceholderProps {
  label: string
  description: string
  /** The plan stage that builds the page, for example `stage 5`. */
  stage: string
  /** Prefix of the card's markers. */
  krId: string
}

export default function SettingsPagePlaceholder({ label, description, stage, krId }: SettingsPagePlaceholderProps) {
  return (
    <KRModuleCard component="SettingsPagePlaceholder" krId={krId} note={`Not built yet: Settings port, ${stage}.`} title={label}>
      {/* The page's purpose, until the page itself replaces this card */}
      <p className={STYLES.text}>{description}</p>
    </KRModuleCard>
  )
}
