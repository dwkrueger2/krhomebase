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
 * for a super admin only, places the "Outside tools" screen as the Outside Tools page of Application Settings. The
 * API refuses that screen's calls from anyone else, so hiding it here is a convenience, not the protection.
 * For a super admin it also places Other Configuration's cards (the themes feature's `FirmThemeEditor`, given the firm
 * themes read here, and the publishing feature's `ArticlePromptCard`; stage 4a) and the teams feature's `TeamsCard` as
 * the Teams and Scope page (stage 4b), the role-sets feature's `RoleSetsCard` as Role Sets (stage 4c), the users feature's `UsersAndInvitesPage` as Users and Invites (stage 4d), and the feedback feature's `SiteFeedbackPage` as Web Site Feedback (stage 4e).
 * It reads the person's preferences (`features/preferences/preferences.server.ts`) and places `PreferencesProvider`
 * around the frame, so the first draw already has their theme, auto logout time and starting section, and passes the
 * Preferences page to User Settings.
 * The Settings panels are told whether the person is a super admin (the landing page's IT cards, the Firm Settings IT
 * pages and Application Settings are for super admins); this too only hides what the API would refuse.
 * It also names the screen for each kind of open item (`openItemPanels`: an open contact under Clients & Contacts
 * is drawn by `ContactDetailPanel`, an open client under Billing by `BillingClientPanel`), and passes the user id so
 * the frame saves the open items per person.
 * Keeping the list here, and not inside `components/shell`, is what lets the shell stay free of any
 * feature import (dependency rule in apps/web/AGENTS.md).
 */

import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import packageJson from '../package.json'
import type { BuiltInSectionId } from '@/components/shell/navigation'
import SignedInShell from '@/features/auth/components/SignedInShell.client'
import { fetchSession } from '@/features/auth/session.server'
import BillingClientPanel from '@/features/billing/components/BillingClientPanel.client'
import BillingPanel from '@/features/billing/components/BillingPanel.client'
import CommunicationsPanel from '@/features/communications/components/CommunicationsPanel.client'
import ApplicationSearch from '@/features/contacts/components/ApplicationSearch.client'
import ContactDetailPanel from '@/features/contacts/components/ContactDetailPanel.client'
import ContactsPanel from '@/features/contacts/components/ContactsPanel.client'
import DataSyncIndicator from '@/features/contacts/components/DataSyncIndicator.client'
import { DataStoreProvider } from '@/features/contacts/DataStoreProvider.client'
import DashboardPanel from '@/features/dashboard/components/DashboardPanel.client'
import LeadsPanel from '@/features/leads/components/LeadsPanel.client'
import DashboardPreferencesPage from '@/features/preferences/components/DashboardPreferencesPage.client'
import PreferencesPage from '@/features/preferences/components/PreferencesPage.client'
import { PreferencesProvider } from '@/features/preferences/PreferencesProvider.client'
import { fetchUserPreferences } from '@/features/preferences/preferences.server'
import FirmThemeEditor from '@/features/themes/components/FirmThemeEditor.client'
import { fetchFirmThemes } from '@/features/themes/themes.server'
import ArticlePromptCard from '@/features/publishing/components/ArticlePromptCard.client'
import TeamsCard from '@/features/teams/components/TeamsCard.client'
import RoleSetsCard from '@/features/role-sets/components/RoleSetsCard.client'
import UsersAndInvitesPage from '@/features/users/components/UsersAndInvitesPage.client'
import SiteFeedbackPage from '@/features/feedback/components/SiteFeedbackPage.client'
import FrontEndPublishingPanel from '@/features/publishing/components/FrontEndPublishingPanel.client'
import ReportsPanel from '@/features/reports/components/ReportsPanel.client'
import ApplicationSettingsPanel from '@/features/settings/components/ApplicationSettingsPanel.client'
import FirmSettingsPanel from '@/features/settings/components/FirmSettingsPanel.client'
import SettingsPanel from '@/features/settings/components/SettingsPanel.client'
import UserSettingsPanel from '@/features/settings/components/UserSettingsPanel.client'
import TasksPanel from '@/features/tasks/components/TasksPanel.client'
import { employeeClockInWidget } from '@/features/timekeeping/clockInWidget'
import AttendancePanel from '@/features/timekeeping/components/AttendancePanel.client'
import EmployeeClockInWidget from '@/features/timekeeping/components/EmployeeClockInWidget.client'
import OutsideToolsAdmin from '@/features/tools/components/OutsideToolsAdmin.client'
import { fetchToolMenu } from '@/features/tools/tools.server'

/**
 * The Dashboard widgets (Settings plan, stage 3): each feature defines its widget (`defineWidget`) and draws its body;
 * this list hands them to the Dashboard and to User Settings → Dashboard, so neither imports another feature.
 */
const DASHBOARD_WIDGETS = [{ definition: employeeClockInWidget, element: <EmployeeClockInWidget /> }]

/** One panel for each built-in menu section, keyed by the menu id. A missing key fails the typecheck. */
const PANELS: Record<BuiltInSectionId, ReactNode> = {
  dashboard: <DashboardPanel widgets={DASHBOARD_WIDGETS} />,
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
  const [outsideTools, preferences, firmThemes] = await Promise.all([fetchToolMenu(), fetchUserPreferences(), fetchFirmThemes()])
  const isSuperAdmin = session.role === 'super_admin'
  const panels: Record<BuiltInSectionId, ReactNode> = {
    ...PANELS,
    settings: <SettingsPanel isSuperAdmin={isSuperAdmin} />,
    'application-settings': (
      <ApplicationSettingsPanel
        isSuperAdmin={isSuperAdmin}
        outsideTools={isSuperAdmin ? <OutsideToolsAdmin /> : undefined}
        teams={isSuperAdmin ? <TeamsCard /> : undefined}
        roleSets={isSuperAdmin ? <RoleSetsCard /> : undefined}
        users={isSuperAdmin ? <UsersAndInvitesPage /> : undefined}
        siteFeedback={isSuperAdmin ? <SiteFeedbackPage /> : undefined}
        otherConfiguration={
          isSuperAdmin ? (
            <>
              <FirmThemeEditor initialThemes={firmThemes} />
              <ArticlePromptCard />
            </>
          ) : undefined
        }
      />
    ),
    'firm-settings': <FirmSettingsPanel isSuperAdmin={isSuperAdmin} />,
    'user-settings': (
      <UserSettingsPanel
        preferencesPage={<PreferencesPage />}
        dashboardPage={<DashboardPreferencesPage widgets={DASHBOARD_WIDGETS.map((widget) => widget.definition)} />}
      />
    ),
  }
  // The data store (contacts and the billing client list, cached encrypted in the browser) wraps the frame, so the
  // top-bar search, the sync light and every screen, pop-outs included, share one copy.
  return (
    <DataStoreProvider userId={session.userId}>
      <PreferencesProvider initial={preferences} firmThemes={firmThemes}>
      <SignedInShell
        user={user}
        panels={panels}
        outsideTools={outsideTools}
        versionLabel={VERSION_LABEL}
        topBarSearch={<ApplicationSearch />}
        topBarStatus={<DataSyncIndicator />}
        openItemPanels={{ contacts: <ContactDetailPanel />, billing: <BillingClientPanel /> }}
        storageScope={session.userId}
      />
      </PreferencesProvider>
    </DataStoreProvider>
  )
}
