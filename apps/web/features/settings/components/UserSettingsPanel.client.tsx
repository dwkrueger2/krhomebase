'use client'
// file: apps/web/features/settings/components/UserSettingsPanel.client.tsx
/**
 * User Settings (menu id `user-settings`; plan `docs/08_Settings_Dashboard_Plan.md`, stages 1 and 2): what every
 * person may set for themselves. Pages, in tab order: Preferences, Dashboard, Time Card and Employee File
 * (`USER_SETTINGS_PAGES`). The address parameter is `?userSettingsSection=`, with the old app's values.
 *
 * Built: Preferences (stage 2) and Dashboard (stage 3), the preferences feature's pages passed in by `app/page.tsx`
 * as `preferencesPage` and `dashboardPage` (so this feature does not import another feature's files), and Time Card
 * (stage 2, `TimeCardPage`). Employee File shows its placeholder until after Employee Documents in stage 5.
 *
 * @param props - The Preferences and Dashboard pages from the preferences feature.
 * @returns The User Settings area (`data-kr-id="UserSettingsPanel"`).
 */

import type { ReactNode } from 'react'
import SettingsAreaFrame from '@/features/settings/components/SettingsAreaFrame.client'
import TimeCardPage from '@/features/settings/components/TimeCardPage.client'
import { USER_SETTINGS_PAGES, type UserSettingsPageId } from '@/features/settings/settingsAreas'

export interface UserSettingsPanelProps {
  /** The finished Preferences page (`features/preferences`). */
  preferencesPage?: ReactNode
  /** The finished Dashboard widgets page (`features/preferences`). */
  dashboardPage?: ReactNode
}

export default function UserSettingsPanel({ preferencesPage, dashboardPage }: UserSettingsPanelProps) {
  const builtPages: Partial<Record<UserSettingsPageId, ReactNode>> = {
    ...(preferencesPage ? { 'user-settings': preferencesPage } : {}),
    ...(dashboardPage ? { 'dashboard-settings': dashboardPage } : {}),
    'time-card': <TimeCardPage />,
  }
  return <SettingsAreaFrame ariaLabel="User Settings pages" builtPages={builtPages} krId="UserSettingsPanel" pages={USER_SETTINGS_PAGES} />
}
