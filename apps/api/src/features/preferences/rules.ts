// file: apps/api/src/features/preferences/rules.ts
/**
 * The rules for user preferences (plan `docs/08_Settings_Dashboard_Plan.md`, decisions 1 to 3, stage 2).
 *
 * - **Whose:** always the signed-in person's own preferences. The person comes from the checked session, never from
 *   the request; there is no way to read or change anyone else's.
 * - **Storage:** each field is stored under a key as a small JSON object (`PREFERENCE_FIELDS`): `appearance` holds
 *   `theme`, `session` holds `autoLogoutMinutes`, `navigation` holds `startingSection`, `dashboard` holds
 *   `dashboardWidgets` (stage 3: each widget's shown-or-hidden and order), `theme` holds `personalTheme` (stage 2b:
 *   the theme the person uses, their text size and their own color changes).
 * - **Personal theme (decision T2):** only colors a person may change are kept, and a change that leaves text
 *   hard to read (`themeContrastProblems`, checked against the built-in values and the chosen firm theme) is refused
 *   with 422 `PERSONAL_THEME_LOW_CONTRAST`, its `details` listing each pair.
 * - **Reading:** a field never saved, a row that is not valid JSON, or a value no longer allowed (for example an old
 *   auto logout value) reads as the field's default (`DEFAULT_USER_PREFERENCES`). Reading never writes.
 * - **Changing:** only fields whose value actually changes are written, each with its own `audit_log` row (resource
 *   `preferences`, action `UPDATE`, target `user_preference` `<userId>:<key>`). A change to nothing writes nothing.
 *   The reply is the whole set after the change.
 */

import {
  AutoLogoutMinutes,
  BUILT_IN_THEME,
  cleanThemeValues,
  DashboardWidgetChoices,
  layeredThemeValues,
  PersonalTheme,
  themeContrastProblems,
  type FirmThemesData,
  type ThemeContrastProblem,
  DEFAULT_USER_PREFERENCES,
  StartingSection,
  WorkstreamTypesPreference,
  ThemeName,
  type UpdateUserPreferencesBody,
  type UserPreferences,
  type UserPreferencesData,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import type { PreferenceQueries, PreferenceRow, PreferenceWrite } from './queries.ts'

/** A refused change: the code, the HTTP status and the details for the screen. */
export class PreferenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 422,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'PreferenceError'
  }
}

/**
 * Cleans a person's theme and checks it for readability.
 *
 * @param theme - The theme from the request (shape already checked).
 * @param firm - The firm themes (for the chosen theme's values).
 * @returns The theme with only allowed colors kept.
 * @throws PreferenceError PERSONAL_THEME_LOW_CONTRAST when a change leaves text hard to read.
 */
export function checkedPersonalTheme(theme: PersonalTheme, firm: FirmThemesData): PersonalTheme {
  const cleaned: PersonalTheme = {
    ...theme,
    light: cleanThemeValues(theme.light, { personalOnly: true }),
    dark: cleanThemeValues(theme.dark, { personalOnly: true }),
  }
  const problems: Array<ThemeContrastProblem & { mode: 'light' | 'dark' }> = []
  for (const mode of ['light', 'dark'] as const) {
    const builtIn = mode === 'light' ? BUILT_IN_THEME.light : { ...BUILT_IN_THEME.light, ...BUILT_IN_THEME.dark }
    const beneath = { ...builtIn, ...layeredThemeValues({ ...cleaned, light: {}, dark: {} }, firm, mode) }
    for (const problem of themeContrastProblems(beneath, cleaned[mode])) problems.push({ ...problem, mode })
  }
  if (problems.length) {
    throw new PreferenceError('PERSONAL_THEME_LOW_CONTRAST', 'Some colors make text hard to read. Choose colors with more contrast.', 422, { problems })
  }
  return cleaned
}

/** The person making a change, from the checked session. */
export interface PreferenceActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

type Field = keyof UserPreferences

/** Where each field is stored: the row key, and the zod check for its value. */
export const PREFERENCE_FIELDS: { readonly [F in Field]: { key: string; schema: z.ZodType<UserPreferences[F]> } } = {
  theme: { key: 'appearance', schema: ThemeName },
  autoLogoutMinutes: { key: 'session', schema: AutoLogoutMinutes },
  startingSection: { key: 'navigation', schema: StartingSection },
  dashboardWidgets: { key: 'dashboard', schema: DashboardWidgetChoices },
  personalTheme: { key: 'theme', schema: PersonalTheme },
  workstreamTypes: { key: 'workstream', schema: WorkstreamTypesPreference },
}

const FIELDS = Object.keys(PREFERENCE_FIELDS) as Field[]

/** Parses a stored JSON object, or returns null when it is not one. */
function parseObject(valueJson: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(valueJson)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Turns stored rows into the reply: every field filled, unreadable values replaced by defaults.
 *
 * @param rows - The person's stored rows.
 * @returns The preferences in effect and the time of the newest row (null when there is none).
 */
export function preferencesFromRows(rows: readonly PreferenceRow[]): UserPreferencesData {
  const byKey = new Map(rows.map((row) => [row.key, parseObject(row.valueJson)]))
  const preferences = { ...DEFAULT_USER_PREFERENCES } as Record<Field, unknown>
  for (const field of FIELDS) {
    const { key, schema } = PREFERENCE_FIELDS[field]
    const checked = schema.safeParse(byKey.get(key)?.[field])
    if (checked.success) preferences[field] = checked.data
  }
  const updatedAt = rows.reduce<string | null>((latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest), null)
  return { preferences: preferences as UserPreferences, updatedAt }
}

/** Reads the signed-in person's preferences. */
export async function loadPreferences(queries: PreferenceQueries, userId: string): Promise<UserPreferencesData> {
  return preferencesFromRows(await queries.readAll(userId))
}

/**
 * Changes some of the signed-in person's preferences.
 *
 * @param queries - The area's database calls.
 * @param actor - The person, from the session.
 * @param body - The fields to change (already checked against `UpdateUserPreferencesBody`).
 * @param now - The time to record (ISO).
 * @param firmThemes - Reads the firm themes, only when a personal theme is being changed.
 * @returns The preferences after the change, and the number of keys written.
 */
export async function updatePreferences(
  queries: PreferenceQueries,
  actor: PreferenceActor,
  body: UpdateUserPreferencesBody,
  now: string,
  firmThemes: () => Promise<FirmThemesData>,
): Promise<{ data: UserPreferencesData; written: number }> {
  const current = await loadPreferences(queries, actor.userId)
  // A personal theme is cleaned and checked before anything is compared or saved.
  if (body.personalTheme) body = { ...body, personalTheme: checkedPersonalTheme(body.personalTheme, await firmThemes()) }
  const writes: PreferenceWrite[] = []
  for (const field of FIELDS) {
    const value = body[field]
    // Values are compared by content: the Dashboard choices are an object, and an unchanged set is not written again.
    if (value === undefined || JSON.stringify(value) === JSON.stringify(current.preferences[field])) continue
    const { key } = PREFERENCE_FIELDS[field]
    const stored = { [field]: value }
    writes.push({
      key,
      valueJson: JSON.stringify(stored),
      audit: {
        requestId: actor.requestId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        resource: 'preferences',
        action: 'UPDATE',
        targetTable: 'user_preference',
        targetId: `${actor.userId}:${key}`,
        newJson: stored,
      },
    })
  }
  if (!writes.length) return { data: current, written: 0 }
  await queries.saveAll(actor.userId, writes, now)
  return { data: await loadPreferences(queries, actor.userId), written: writes.length }
}
