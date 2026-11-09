// file: apps/web/app/page.tsx
/**
 * Home route: the KR Homebase application frame.
 *
 * This file only places screens. It first asks the API who is signed in; with no live session it sends the
 * visitor to `/login`. It then builds one panel for each menu section and hands them to `SignedInShell`
 * (the application frame with log-out wired), which shows the open one in the KRH-Workspace and in the
 * pop-out window.
 * Each panel is its own file under `features/<area>/components/`; most are placeholders today.
 * It also reads the outside tools this person may use (`features/tools/tools.server.ts`) for the menu, and,
 * for a super admin only, places the "Outside tools" screen under Application Settings. The API refuses that
 * screen's calls from anyone else, so hiding it here is a convenience, not the protection.
 * Keeping the list here, and not inside `components/shell`, is what lets the shell stay free of any
 * feature import (dependency rule in apps/web/AGENTS.md).
 */

import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import packageJson from '../package.json'
import type { BuiltInSectionId } from '@/components/shell/navigation'
import SignedInShell from '@/features/auth/components/SignedInShell.client'
import { fetchSession } from '@/features/auth/session.server'
import BillingPanel from '@/features/billing/components/BillingPanel.client'
import CommunicationsPanel from '@/features/communications/components/CommunicationsPanel.client'
import ContactsPanel from '@/features/contacts/components/ContactsPanel.client'
import DashboardPanel from '@/features/dashboard/components/DashboardPanel.client'
import LeadsPanel from '@/features/leads/components/LeadsPanel.client'
import FrontEndPublishingPanel from '@/features/publishing/components/FrontEndPublishingPanel.client'
import ReportsPanel from '@/features/reports/components/ReportsPanel.client'
import ApplicationSettingsPanel from '@/features/settings/components/ApplicationSettingsPanel.client'
import FirmSettingsPanel from '@/features/settings/components/FirmSettingsPanel.client'
import SettingsPanel from '@/features/settings/components/SettingsPanel.client'
import UserSettingsPanel from '@/features/settings/components/UserSettingsPanel.client'
import TasksPanel from '@/features/tasks/components/TasksPanel.client'
import AttendancePanel from '@/features/timekeeping/components/AttendancePanel.client'
import OutsideToolsAdmin from '@/features/tools/components/OutsideToolsAdmin.client'
import { fetchToolMenu } from '@/features/tools/tools.server'

/** One panel for each built-in menu section, keyed by the menu id. A missing key fails the typecheck. */
const PANELS: Record<BuiltInSectionId, ReactNode> = {
  dashboard: <DashboardPanel />,
  contacts: <ContactsPanel />,
  leads: <LeadsPanel />,
  communications: <CommunicationsPanel />,
  tasks: <TasksPanel />,
  timekeeping: <AttendancePanel />,
  billing: <BillingPanel />,
  'front-end-publishing': <FrontEndPublishingPanel />,
  reports: <ReportsPanel />,
  settings: <SettingsPanel />,
  'user-settings': <UserSettingsPanel />,
  'application-settings': <ApplicationSettingsPanel />,
  'firm-settings': <FirmSettingsPanel />,
}

/** Version text under the product name, read from apps/web/package.json (for example `v1.1.5 p501`). */
const VERSION_LABEL = `v${packageJson.version} p${packageJson.patchNum}`

export const dynamic = 'force-dynamic'

/**
 * Renders the application frame for the signed-in person.
 *
 * @returns The frame with the panels, the outside tools and the person from the session, or a redirect to `/login`.
 */
export default async function HomePage() {
  const state = await fetchSession()
  if (!state.signedIn) redirect(`/login?auth_error=${encodeURIComponent(state.reason)}`)
  const { session } = state
  const user = { displayName: session.displayName, firmName: session.firmName, avatarInitials: session.avatarInitials }
  const outsideTools = await fetchToolMenu()
  const panels: Record<BuiltInSectionId, ReactNode> =
    session.role === 'super_admin'
      ? { ...PANELS, 'application-settings': <ApplicationSettingsPanel><OutsideToolsAdmin /></ApplicationSettingsPanel> }
      : PANELS
  return <SignedInShell user={user} panels={panels} outsideTools={outsideTools} versionLabel={VERSION_LABEL} />
}
