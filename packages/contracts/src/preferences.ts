// file: packages/contracts/src/preferences.ts
/**
 * User preferences: the choices every person makes for themselves in Settings → User Settings → Preferences
 * (plan `docs/08_Settings_Dashboard_Plan.md`, decisions 1 to 3, stage 2).
 *
 *   GET /v1/me/preferences   the signed-in person's preferences, each missing or unreadable one replaced by its default
 *   PUT /v1/me/preferences   change one or more of them; the reply is the whole set after the change
 *
 * The old app kept these only in the browser (`localStorage` key `kr_homebase_user_settings_v1`), so they did not
 * follow a person to another computer. They now live in the table `user_preference` (one row per person and key,
 * JSON value; migration `docs/patch-notes/repository/Migration_Patch026_11_11_user_preference.sql`). On the wire they
 * are one flat object; the API stores them under these keys:
 *
 *   appearance   {"theme": "light" | "dark"}
 *   session      {"autoLogoutMinutes": 15 | 30 | 60 | 120 | 480}
 *   navigation   {"startingSection": "<menu id>"}
 *   dashboard    {"dashboardWidgets": {"<widget id>": {"enabled": true, "order": 5}, ...}}   (stage 3)
 *   workstream   {"workstreamTypes": ["PhoneCalls", "Notes"]}   (plan 10, Nov 13, 2026; empty means All)
 *   tasks        {"assignCreatorByDefault": true}   (plan 10, stage 5, decision D20 of Nov 13, 2026)
 *   theme        {"personalTheme": {"themeId": "firm-default", "density": "compact", "light": {...}, "dark": {...}}}   (stage 2b, themes.ts)
 *
 * Changes from the old Preferences card: the theme is light or dark (the old list of administrator themes stays with
 * Application Settings → Other Configuration); the starting page is now used when the app opens; the feedback button
 * is not ported until the feedback feature is (decision 8).
 */

import { z } from 'zod'
import { DEFAULT_PERSONAL_THEME, PersonalTheme } from './themes.ts'
import { WorkstreamSubgroup } from './workstream.ts'

/** The two themes (decision 2). */
export const ThemeName = z.enum(['light', 'dark']).describe('Color theme: light (the standard look) or dark.')
export type ThemeName = z.infer<typeof ThemeName>

/** The auto logout choices, in minutes, as in the old app (decision 3). */
export const AUTO_LOGOUT_MINUTE_CHOICES = [15, 30, 60, 120, 480] as const

export const AutoLogoutMinutes = z
  .union([z.literal(15), z.literal(30), z.literal(60), z.literal(120), z.literal(480)])
  .describe('Minutes without activity before KR Homebase signs the person out: 15, 30, 60, 120 or 480. A warning shows 5 minutes before.')
export type AutoLogoutMinutes = z.infer<typeof AutoLogoutMinutes>

/** Menu sections a person may choose to open first. Ids are the menu's section ids. */
export const STARTING_SECTION_IDS = [
  'dashboard',
  'contacts',
  'leads',
  'communications',
  'tasks',
  'timekeeping',
  'billing',
  'reports',
  'settings',
] as const

export const StartingSection = z.enum(STARTING_SECTION_IDS).describe('Menu section opened when KR Homebase opens without a section in the address.')
export type StartingSection = z.infer<typeof StartingSection>

/** One person's choice for one Dashboard widget (stage 3; the old `kr_homebase_dashboard_widgets_v1` record). */
export const DashboardWidgetChoice = z.object({
  enabled: z.boolean().describe('True to show the widget on the Dashboard.'),
  order: z.number().int().min(0).max(1000).describe('Place on the Dashboard; lower comes first.'),
})
export type DashboardWidgetChoice = z.infer<typeof DashboardWidgetChoice>

/**
 * The person's Dashboard widget choices, by widget id. A widget missing here uses its own defaults
 * (`defaultEnabled`, `defaultOrder`); a choice for a widget that no longer exists is ignored.
 */
export const DashboardWidgetChoices = z
  .record(z.string().regex(/^[a-z][a-z0-9-]{1,47}$/), DashboardWidgetChoice)
  .refine((choices) => Object.keys(choices).length <= 50, { message: 'At most 50 widget choices.' })
  .describe('Dashboard widget choices by widget id: shown or hidden, and order.')
export type DashboardWidgetChoices = z.infer<typeof DashboardWidgetChoices>

/** The activity types WorkStream lists show when they open (the requester, Nov 13, 2026). Empty means All. */
export const WorkstreamTypesPreference = z
  .array(WorkstreamSubgroup)
  .max(7)
  .describe('Activity types WorkStream shows when it opens; an empty list shows All.')
export type WorkstreamTypesPreference = z.infer<typeof WorkstreamTypesPreference>

/**
 * Task Settings (D20, the requester, Nov 13, 2026): whether a new task is assigned to the person creating it when no
 * assignees are given (`POST /v1/tasks` without `assigneeUserIds`). Default true, the old route's rule.
 */
export const AssignCreatorByDefaultPreference = z
  .boolean()
  .describe('A new task with no assignees given is assigned to the person creating it (true) or to nobody (false).')
export type AssignCreatorByDefaultPreference = z.infer<typeof AssignCreatorByDefaultPreference>

/** One person's preferences, every field filled. */
export const UserPreferences = z.object({
  theme: ThemeName,
  autoLogoutMinutes: AutoLogoutMinutes,
  startingSection: StartingSection,
  dashboardWidgets: DashboardWidgetChoices,
  personalTheme: PersonalTheme.describe('The theme the person uses, their text size and their own color changes (stage 2b).'),
  workstreamTypes: WorkstreamTypesPreference,
  assignCreatorByDefault: AssignCreatorByDefaultPreference,
})
export type UserPreferences = z.infer<typeof UserPreferences>

/** What a person has before they choose anything (the old app's defaults: light, 60 minutes, Dashboard, each widget's own default). */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'light',
  autoLogoutMinutes: 60,
  startingSection: 'dashboard',
  dashboardWidgets: {},
  personalTheme: DEFAULT_PERSONAL_THEME,
  workstreamTypes: [],
  assignCreatorByDefault: true,
}

/** Reply of both routes. */
export const UserPreferencesData = z.object({
  preferences: UserPreferences.describe('The preferences now in effect. Fields never saved, or saved with a value no longer allowed, show their default.'),
  updatedAt: z.string().nullable().describe('When the person last changed any preference (ISO time), or null when they never have.'),
})
export type UserPreferencesData = z.infer<typeof UserPreferencesData>

/** Body of PUT: one or more fields to change. Fields left out keep their current value. */
export const UpdateUserPreferencesBody = UserPreferences.partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one preference to change.' })
  .describe('The preferences to change. At least one field; fields left out are not changed.')
export type UpdateUserPreferencesBody = z.infer<typeof UpdateUserPreferencesBody>
