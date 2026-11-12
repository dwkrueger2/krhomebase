'use client'
// file: apps/web/features/preferences/PreferencesProvider.client.tsx
/**
 * Holds the signed-in person's preferences for every screen (Settings plan, stage 2).
 *
 * `app/page.tsx` places it around the frame with the preferences the server read for the first draw
 * (`preferences.server.ts`). It provides two things:
 * 1. `usePreferences()` for the Preferences page: the current preferences and `save(change)`, which sends the change
 *    to the API and, once it is accepted, uses the API's reply as the new state.
 * 2. `ShellPreferencesContext` (`components/shell/shellPreferences.ts`) for the frame: the theme, the auto logout time
 *    and the starting section. Because the frame reads it from here, a saved theme or auto logout time applies at once.
 * 3. `ShellThemeStyleContext` (stage 2b): the person's theme as one style rule (`buildThemeStyleCss`), layered from
 *    the chosen firm theme (`firmThemes`, read on the server by `features/themes/themes.server.ts`), their text size and
 *    their own colors. While the Preferences page edits colors it sets a preview (`setPreviewTheme`), which the rule
 *    shows until it is saved or put back.
 *
 * @param props - The preferences from the server and the frame.
 * @returns The providers around the children.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_USER_PREFERENCES,
  layeredThemeValues,
  type FirmThemesData,
  type PersonalTheme,
  type UpdateUserPreferencesBody,
  type UserPreferencesData,
} from '@krhomebase/contracts'
import { ShellPreferencesContext, ShellThemeStyleContext } from '@/components/shell/shellPreferences'
import { buildThemeStyleCss } from '@/components/shell/themeStyle'
import { saveUserPreferences } from '@/features/preferences/api.client'

export interface PreferencesState {
  /** The preferences in effect and when they were last changed. */
  data: UserPreferencesData
  /** Saves a change; resolves once the API accepted it, throws `PreferencesApiError` otherwise. */
  save: (change: UpdateUserPreferencesBody) => Promise<UserPreferencesData>
  /** The firm themes and the firm default (stage 2b). */
  firmThemes: FirmThemesData
  /** Shows a personal theme before it is saved; null goes back to the saved one. */
  setPreviewTheme: (theme: PersonalTheme | null) => void
}

const NO_FIRM_THEMES: FirmThemesData = { themes: [], firmDefaultThemeId: null }

const NO_PROVIDER: PreferencesState = {
  data: { preferences: DEFAULT_USER_PREFERENCES, updatedAt: null },
  save: async () => ({ preferences: DEFAULT_USER_PREFERENCES, updatedAt: null }),
  firmThemes: NO_FIRM_THEMES,
  setPreviewTheme: () => undefined,
}

const PreferencesContext = createContext<PreferencesState>(NO_PROVIDER)

/** The person's preferences and the save call (defaults, and a save that does nothing, outside the provider). */
export function usePreferences(): PreferencesState {
  return useContext(PreferencesContext)
}

export interface PreferencesProviderProps {
  /** The preferences the server read for the first draw. */
  initial: UserPreferencesData
  /** The firm themes read on the server (stage 2b). Absent: none. */
  firmThemes?: FirmThemesData
  children: ReactNode
}

export function PreferencesProvider({ initial, firmThemes = NO_FIRM_THEMES, children }: PreferencesProviderProps) {
  const [data, setData] = useState<UserPreferencesData>(initial)
  const [previewTheme, setPreviewTheme] = useState<PersonalTheme | null>(null)

  const save = useCallback(async (change: UpdateUserPreferencesBody) => {
    const saved = await saveUserPreferences(change)
    setData(saved)
    if (change.personalTheme) setPreviewTheme(null)
    return saved
  }, [])

  const value = useMemo<PreferencesState>(() => ({ data, save, firmThemes, setPreviewTheme }), [data, firmThemes, save])

  // The person's theme as one style rule: the preview while editing, otherwise the saved theme.
  const personalTheme = previewTheme ?? data.preferences.personalTheme
  const themeCss = useMemo(
    () => buildThemeStyleCss({ light: layeredThemeValues(personalTheme, firmThemes, 'light'), dark: layeredThemeValues(personalTheme, firmThemes, 'dark') }),
    [firmThemes, personalTheme],
  )

  return (
    <PreferencesContext.Provider value={value}>
      <ShellPreferencesContext.Provider value={data.preferences}>
        <ShellThemeStyleContext.Provider value={themeCss}>{children}</ShellThemeStyleContext.Provider>
      </ShellPreferencesContext.Provider>
    </PreferencesContext.Provider>
  )
}
