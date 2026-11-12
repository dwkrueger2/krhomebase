'use client'
// file: apps/web/features/settings/components/FirmSettingsPanel.client.tsx
/**
 * Firm Settings (menu id `firm-settings`; plan `docs/08_Settings_Dashboard_Plan.md`, stage 1): the firm itself.
 * Pages, in tab order (`FIRM_SETTINGS_PAGES`): Firm Profile, Employee Policies and Employee Documents (moved here
 * from Application Settings) for everyone, then the three IT pages for a super admin only: Data Import, GPT Model
 * Gateway and Stripe Payment Configuration. The address parameter is `?firmSettingsSection=`, with the old app's
 * values; the old `stripe-dev-tests` still opens the Stripe page.
 *
 * Stage 1 builds the frame only; each page shows its placeholder until its stage (5 for the ordinary pages, then 6
 * Stripe, 7 GPT, 8 Data Import). `isSuperAdmin` comes from the session in `app/page.tsx` and only hides the IT pages.
 *
 * @param props - Whether the signed-in person is a super admin.
 * @returns The Firm Settings area (`data-kr-id="FirmSettingsPanel"`).
 */

import SettingsAreaFrame from '@/features/settings/components/SettingsAreaFrame.client'
import { FIRM_SETTINGS_ALIASES, FIRM_SETTINGS_PAGES, visibleSettingsPages } from '@/features/settings/settingsAreas'

export interface FirmSettingsPanelProps {
  /** True for a super admin: shows the three IT pages. */
  isSuperAdmin?: boolean
}

export default function FirmSettingsPanel({ isSuperAdmin = false }: FirmSettingsPanelProps) {
  const pages = visibleSettingsPages(FIRM_SETTINGS_PAGES, isSuperAdmin)
  return <SettingsAreaFrame aliases={FIRM_SETTINGS_ALIASES} ariaLabel="Firm Settings pages" krId="FirmSettingsPanel" pages={pages} />
}
