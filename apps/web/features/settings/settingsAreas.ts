// file: apps/web/features/settings/settingsAreas.ts
/**
 * What the Settings tab is made of (plan `docs/08_Settings_Dashboard_Plan.md`, section 3, stage 1): the three areas,
 * the pages (tabs) in each, who sees each page, the cards on the Settings landing page, and the three IT cards.
 *
 * The split is by who may change what:
 * - **User Settings:** everyone; their own choices.
 * - **Application Settings:** super admin; who may sign in (users, not employees).
 * - **Firm Settings:** the firm itself; the three IT pages (Data Import, GPT Model Gateway, Stripe Payment
 *   Configuration) are super admin only.
 *
 * Page ids are the values of each area's second address parameter. They keep the old app's values where the old
 * app had the page (`?firmSettingsSection=profile`, `?applicationSettingsTab=user-management`), so old links still
 * open the right page; reference: `docs/API/Settings_AsIs_Reference.md` section 3.1 ("URL parameters").
 *
 * Who sees what is decided here from the role in the session, as the old app did, only to hide what a person cannot
 * use. The API decides who may read or change anything (each route's permission check, from stage 2 on).
 *
 * This file has no React; the screens and the tests read it.
 */

/** Pages of User Settings (`?userSettingsSection=`). */
export type UserSettingsPageId = 'user-settings' | 'dashboard-settings' | 'time-card' | 'employee-file'

/** Pages of Application Settings (`?applicationSettingsTab=`). */
export type ApplicationSettingsPageId =
  | 'role-specifications'
  | 'team-management'
  | 'outside-tools'
  | 'other-configuration'
  | 'site-feedback'

/** Pages of Firm Settings (`?firmSettingsSection=`). */
export type FirmSettingsPageId =
  | 'profile'
  | 'employee-policies'
  | 'employee-documents'
  | 'users'
  | 'edit-user'
  | 'data-management'
  | 'gpt-model-gateway'
  | 'stripe-payment-configuration'

/** One page of an area: its tab, and what its placeholder says until it is built. */
export interface SettingsPageDefinition<T extends string = string> {
  /** Address value and tab id. */
  id: T
  /** Words on the tab and in the third breadcrumb step. */
  label: string
  /** One line about the page, shown on its placeholder. */
  description: string
  /** The plan stage that builds the page, shown on its placeholder. Null when the page is built. */
  stage: string | null
  /** True when only a super admin sees the page. */
  superAdminOnly?: boolean
}

/** User Settings pages, in tab order (plan section 3). */
export const USER_SETTINGS_PAGES: readonly SettingsPageDefinition<UserSettingsPageId>[] = [
  { id: 'user-settings', label: 'Preferences', description: 'Theme (light or dark), starting page and auto logout.', stage: null },
  { id: 'dashboard-settings', label: 'Dashboard', description: 'Which widgets show on your Dashboard, and in what order.', stage: null },
  { id: 'time-card', label: 'Time Card', description: 'Opens Attendance on your own time card for the current pay period.', stage: null },
  { id: 'employee-file', label: 'Employee File', description: 'Your own employee documents.', stage: null },
]

/**
 * Application Settings pages, in tab order. The whole area is for super admins. Users and Invites moved to Firm
 * Settings → Users on Nov 12, 2026 (the requester, D7).
 */
export const APPLICATION_SETTINGS_PAGES: readonly SettingsPageDefinition<ApplicationSettingsPageId>[] = [
  { id: 'role-specifications', label: 'Role Sets', description: 'Role sets and the permissions each one grants.', stage: null },
  { id: 'team-management', label: 'Teams and Scope', description: 'Team leads and members; team-scoped permissions follow them.', stage: null },
  { id: 'outside-tools', label: 'Outside Tools', description: 'Outside tool servers registered with KR Homebase.', stage: null },
  { id: 'other-configuration', label: 'Other Configuration', description: 'Firm themes and the Upload Article GPT helper prompt.', stage: null },
  { id: 'site-feedback', label: 'Web Site Feedback', description: 'Review feedback sent from the public site and from KR Homebase.', stage: null },
]

/** Firm Settings pages, in tab order: the ordinary pages first, then the three IT pages (super admin). */
export const FIRM_SETTINGS_PAGES: readonly SettingsPageDefinition<FirmSettingsPageId>[] = [
  { id: 'profile', label: 'Firm Profile', description: 'Firm identity, contact details, offices and matter numbering.', stage: null },
  { id: 'employee-policies', label: 'Employee Policies', description: 'Clock edit windows, PTO accrual, holiday pay and the holiday calendar.', stage: null },
  { id: 'employee-documents', label: 'Employee Documents', description: 'Private HR files for each employee (moved here from Application Settings).', stage: null },
  { id: 'users', label: 'Users', description: 'Who may sign in, their status, role sets, invitations and employee files (moved here from Application Settings).', stage: null, superAdminOnly: true },
  { id: 'data-management', label: 'Data Import', description: 'Controlled data preparation and bulk contact staging.', stage: null, superAdminOnly: true },
  { id: 'gpt-model-gateway', label: 'GPT Model Gateway', description: 'Provider connections, readiness checks and token-usage reporting.', stage: null, superAdminOnly: true },
  { id: 'stripe-payment-configuration', label: 'Stripe Payment Configuration', description: 'Live and Sandbox Stripe keys (stored encrypted, write-only) and sandbox card/ACH tests.', stage: null, superAdminOnly: true },
]

/**
 * The Firm Settings tab that opens beside Users when a user's pencil is clicked; its label is "Edit Employee" or
 * "Edit User" (`FirmSettingsPanel` adds it while one is open).
 */
export const EDIT_USER_PAGE: SettingsPageDefinition<FirmSettingsPageId> = { id: 'edit-user', label: 'Edit User', description: 'One user or employee.', stage: null, superAdminOnly: true }

/** Old Firm Settings address values that now mean another page. */
export const FIRM_SETTINGS_ALIASES: Readonly<Record<string, FirmSettingsPageId>> = {
  // The old app's earlier name for the Stripe page.
  'stripe-dev-tests': 'stripe-payment-configuration',
  // Application Settings' old Users and Invites tab name.
  'user-management': 'users',
}

/**
 * The pages one viewer sees.
 *
 * @param pages - An area's pages.
 * @param isSuperAdmin - True for a super admin.
 * @returns The pages without the super-admin-only ones for anyone else, in the same order.
 */
export function visibleSettingsPages<T extends string>(pages: readonly SettingsPageDefinition<T>[], isSuperAdmin: boolean): SettingsPageDefinition<T>[] {
  return pages.filter((page) => isSuperAdmin || !page.superAdminOnly)
}

/** How a choice card is drawn: the plain card, or one of the two orange IT card styles of the old Firm Settings menu. */
export type SettingsChoiceCardVariant = 'plain' | 'it-outline' | 'it-solid'

/** One card on the Settings landing page. */
export interface SettingsChoiceDefinition {
  /** The card's `data-kr-id`. The IT cards keep the old app's ids. */
  krId: string
  /** One character in the square badge (the old app's glyphs). */
  icon: string
  title: string
  description: string
  variant: SettingsChoiceCardVariant
  /** Section the card opens. */
  sectionId: 'user-settings' | 'application-settings' | 'firm-settings'
  /** Page inside that section, when the card opens a particular page. */
  subPage?: FirmSettingsPageId
  /** The card's `data-kr-action`, when the old card had one. */
  action?: string
  /** True when only a super admin sees the card. */
  superAdminOnly?: boolean
}

/** The three area cards, in landing order. */
export const SETTINGS_AREA_CARDS: readonly SettingsChoiceDefinition[] = [
  {
    krId: 'settings-choice-user-settings',
    icon: '◉',
    title: 'User Settings',
    description: 'Your own choices: theme, starting page, auto logout, dashboard and your time card.',
    variant: 'plain',
    sectionId: 'user-settings',
  },
  {
    krId: 'settings-choice-application-settings',
    icon: '▦',
    title: 'Application Settings',
    description: 'Who may sign in to KR Homebase, their role sets and teams.',
    variant: 'plain',
    sectionId: 'application-settings',
    superAdminOnly: true,
  },
  {
    krId: 'settings-choice-firm-settings',
    icon: '⌂',
    title: 'Firm Settings',
    description: 'Firm profile, employee policies and employee documents.',
    variant: 'plain',
    sectionId: 'firm-settings',
  },
]

/**
 * The three IT cards (super admin), in the old Firm Settings menu order, with the old ids and card styles:
 * Data Import has the orange outline and badge; GPT Model Gateway and Stripe Payment Configuration are solid orange.
 * Old texts kept, except the GPT card, which no longer says "implemented" (it is not ported yet).
 */
export const SETTINGS_IT_CARDS: readonly SettingsChoiceDefinition[] = [
  {
    krId: 'FirmSettingsMenu-option-data-management',
    icon: 'D',
    title: 'Data Import',
    description: 'Super Admin tools for controlled data preparation and bulk contact staging.',
    variant: 'it-outline',
    sectionId: 'firm-settings',
    subPage: 'data-management',
    superAdminOnly: true,
  },
  {
    krId: 'firm-settings-gpt-model-gateway-card',
    icon: 'G',
    title: 'GPT Model Gateway',
    description: 'The workspace for provider connections, readiness checks, and token-usage reporting.',
    variant: 'it-solid',
    sectionId: 'firm-settings',
    subPage: 'gpt-model-gateway',
    superAdminOnly: true,
  },
  {
    krId: 'firm-settings-stripe-payment-configuration-card',
    icon: '$',
    title: 'Stripe Payment Configuration',
    description: 'Live and Sandbox Stripe keys (stored encrypted, write-only) and sandbox card/ACH tests.',
    variant: 'it-solid',
    sectionId: 'firm-settings',
    subPage: 'stripe-payment-configuration',
    action: 'open-stripe-payment-configuration-workspace',
    superAdminOnly: true,
  },
]
