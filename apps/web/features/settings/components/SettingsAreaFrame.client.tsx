'use client'
// file: apps/web/features/settings/components/SettingsAreaFrame.client.tsx
/**
 * The frame shared by the three Settings areas (User, Application and Firm Settings; plan stage 1): one Menu Style
 * One tab strip with the chosen page under it, so every area has the same strip (plan section 3).
 *
 * Which page is open is held by `useSectionSubPage` (`components/shell`): it reads and writes the area's second
 * address parameter (`?userSettingsSection=`, `?applicationSettingsTab=`, `?firmSettingsSection=`) and names the page
 * for the third breadcrumb step, for example `Settings / Firm Settings / Firm Profile`. The area panel decides which
 * pages this viewer sees; a page given in `builtPages` is drawn as given, and every other page shows
 * `SettingsPagePlaceholder` with the stage that builds it.
 *
 * @param props - The area's marker, accessible name, visible pages, old address aliases and its finished pages.
 * @returns The tab strip and the open page (`data-kr-id="<krId>"`).
 */

import type { ReactNode } from 'react'
import { useSectionSubPage } from '@/components/shell/useSectionSubPage.client'
import MenuStyleOne from '@/components/ui/MenuStyleOne.client'
import SettingsPagePlaceholder from '@/features/settings/components/SettingsPagePlaceholder.client'
import type { SettingsPageDefinition } from '@/features/settings/settingsAreas'

const LAYOUT_STYLES = {
  // The 36px right padding keeps the end of the tab strip clear of the workspace's pop-out button (as Contact Detail does).
  panel: 'p-[8px] pr-[36px] min-w-0',
} as const

export interface SettingsAreaFrameProps<T extends string> {
  /** The area's `data-kr-id`, for example `FirmSettingsPanel`. Also the prefix of the tab ids. */
  krId: string
  /** Accessible name of the tab strip, for example `Firm Settings pages`. */
  ariaLabel: string
  /** The pages this viewer sees, in tab order. */
  pages: readonly SettingsPageDefinition<T>[]
  /** Old address values that now mean another page. */
  aliases?: Readonly<Record<string, T>>
  /** Finished pages, by page id. A page missing here shows its placeholder. */
  builtPages?: Partial<Record<T, ReactNode>>
}

export default function SettingsAreaFrame<T extends string>({ krId, ariaLabel, pages, aliases, builtPages }: SettingsAreaFrameProps<T>) {
  const [activePageId, setActivePageId] = useSectionSubPage<T>({ pages, aliases })

  const items = pages.map((page) => ({
    id: page.id,
    label: page.label,
    card: builtPages?.[page.id] ?? (
      <SettingsPagePlaceholder description={page.description} krId={`${krId}-${page.id}`} label={page.label} stage={page.stage ?? 'a later stage'} />
    ),
  }))

  return (
    <div className={LAYOUT_STYLES.panel} data-kr-id={krId}>
      {/* Area pages: the shared tab strip, the open page under it */}
      <MenuStyleOne
        props={{
          items,
          activeItemId: activePageId,
          onActiveItemChange: (itemId) => setActivePageId(itemId as T),
          ariaLabel,
          idPrefix: krId,
          menuKrId: `${krId}-tabs`,
        }}
      />
    </div>
  )
}
