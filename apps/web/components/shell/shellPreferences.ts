// file: apps/web/components/shell/shellPreferences.ts
/**
 * The signed-in person's preferences as the frame needs them (Settings plan, stage 2): the theme it draws, the auto
 * logout time its idle monitor counts, and the section it opens first.
 *
 * The frame never imports a feature, so it reads them from this context. `features/preferences` provides it (from
 * the preferences the server read for the first draw, then from every save), and `app/page.tsx` places that provider
 * around the frame. Outside a provider (tests, a screen drawn on its own) the defaults apply: light, 60 minutes,
 * Dashboard.
 */

import { createContext, useContext } from 'react'
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from '@krhomebase/contracts'

export const ShellPreferencesContext = createContext<UserPreferences>(DEFAULT_USER_PREFERENCES)

/**
 * The style rule for the person's theme (stage 2b; `themeStyle.ts`), drawn by the frame and each pop-out window.
 * Empty: the built-in theme only.
 */
export const ShellThemeStyleContext = createContext<string>('')

/** The person's theme style rule. */
export function useShellThemeStyle(): string {
  return useContext(ShellThemeStyleContext)
}

/** The preferences in effect for the frame. */
export function useShellPreferences(): UserPreferences {
  return useContext(ShellPreferencesContext)
}
