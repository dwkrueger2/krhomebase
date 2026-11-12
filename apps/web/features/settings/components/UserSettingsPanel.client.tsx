'use client'
// file: apps/web/features/settings/components/UserSettingsPanel.client.tsx
/**
 * User Settings (menu id `user-settings`; plan `docs/08_Settings_Dashboard_Plan.md`, stage 1): what every person may
 * set for themselves. Pages, in tab order: Preferences, Dashboard, Time Card and Employee File
 * (`USER_SETTINGS_PAGES`). The address parameter is `?userSettingsSection=`, with the old app's values.
 *
 * Stage 1 builds the frame only; each page shows its placeholder until its stage (Preferences and Time Card in
 * stage 2, Dashboard in stage 3, Employee File after Employee Documents in stage 5).
 *
 * @returns The User Settings area (`data-kr-id="UserSettingsPanel"`).
 */

import SettingsAreaFrame from '@/features/settings/components/SettingsAreaFrame.client'
import { USER_SETTINGS_PAGES } from '@/features/settings/settingsAreas'

export default function UserSettingsPanel() {
  return <SettingsAreaFrame ariaLabel="User Settings pages" krId="UserSettingsPanel" pages={USER_SETTINGS_PAGES} />
}
