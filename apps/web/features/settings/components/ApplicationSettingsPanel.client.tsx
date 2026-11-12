'use client'
// file: apps/web/features/settings/components/ApplicationSettingsPanel.client.tsx
/**
 * Application Settings (menu id `application-settings`; plan `docs/08_Settings_Dashboard_Plan.md`, stage 1): who
 * may sign in to KR Homebase and with which roles. These are users (sign-in accounts), not employees. The whole area
 * is for super admins, as in the old app.
 *
 * Pages, in tab order (`APPLICATION_SETTINGS_PAGES`): Users and Invites, Role Sets, Teams and Scope, Outside Tools,
 * Other Configuration (themes and the article prompt) and Web Site Feedback. The address parameter is
 * `?applicationSettingsTab=`, with the old app's values. Stage 1 builds the frame; Outside Tools is the one finished
 * page, and the others show their placeholder until stage 4.
 *
 * `outsideTools` is the finished "Outside tools" screen from the tools feature, passed in by `app/page.tsx` for a
 * super admin only. This feature does not import it, which keeps the rule that a feature never imports another
 * feature's files. Anyone who is not a super admin sees a notice instead of the tabs (the old app did the same). The
 * API refuses the area's calls from anyone else; hiding it here is a convenience.
 *
 * @param props - Whether the signed-in person is a super admin, and the Outside Tools screen.
 * @returns The Application Settings area (`data-kr-id="ApplicationSettingsPanel"`), or the notice.
 */

import type { ReactNode } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SettingsAreaFrame from '@/features/settings/components/SettingsAreaFrame.client'
import { APPLICATION_SETTINGS_PAGES, type ApplicationSettingsPageId } from '@/features/settings/settingsAreas'

const LAYOUT_STYLES = {
  notice: 'p-[8px]',
} as const

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

export interface ApplicationSettingsPanelProps {
  /** True for a super admin. Anyone else sees the notice. */
  isSuperAdmin?: boolean
  /** The finished Outside Tools screen (super admin only). */
  outsideTools?: ReactNode
}

export default function ApplicationSettingsPanel({ isSuperAdmin = false, outsideTools }: ApplicationSettingsPanelProps) {
  if (!isSuperAdmin) {
    return (
      <div className={LAYOUT_STYLES.notice} data-kr-id="ApplicationSettingsPanel">
        {/* Not a super admin: the area is not available (the old app showed the same notice) */}
        <KRModuleCard component="ApplicationSettingsPanel" krId="application-settings-permission" title="Application Settings">
          <p className={STYLES.text} data-kr-element="application-settings-permission-placeholder">
            Application Settings require the Super Admin role.
          </p>
        </KRModuleCard>
      </div>
    )
  }

  const builtPages: Partial<Record<ApplicationSettingsPageId, ReactNode>> = outsideTools ? { 'outside-tools': outsideTools } : {}
  return (
    <SettingsAreaFrame
      ariaLabel="Application Settings pages"
      builtPages={builtPages}
      krId="ApplicationSettingsPanel"
      pages={APPLICATION_SETTINGS_PAGES}
    />
  )
}
