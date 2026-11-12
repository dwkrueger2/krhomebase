// file: packages/contracts/src/preferences.test.ts
/**
 * The preference rules that the schema alone does not make obvious: a change must name at least one preference and
 * no unknown one, and only the old auto logout choices are allowed.
 * Run: pnpm --dir packages/contracts run test
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_USER_PREFERENCES, UpdateUserPreferencesBody, UserPreferences } from './preferences.ts'

describe('user preferences', () => {
  it('has defaults that pass their own schema (light, 60 minutes, Dashboard)', () => {
    expect(UserPreferences.parse(DEFAULT_USER_PREFERENCES)).toEqual({ theme: 'light', autoLogoutMinutes: 60, startingSection: 'dashboard', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} } })
  })

  it('accepts a change of one preference', () => {
    expect(UpdateUserPreferencesBody.safeParse({ theme: 'dark' }).success).toBe(true)
  })

  it('refuses an empty change, an unknown field and an auto logout value that is not one of the choices', () => {
    expect(UpdateUserPreferencesBody.safeParse({}).success).toBe(false)
    expect(UpdateUserPreferencesBody.safeParse({ theme: 'dark', fontSize: 14 }).success).toBe(false)
    expect(UpdateUserPreferencesBody.safeParse({ autoLogoutMinutes: 45 }).success).toBe(false)
  })

  it('accepts Dashboard widget choices and refuses a bad widget id or order', () => {
    expect(UpdateUserPreferencesBody.safeParse({ dashboardWidgets: { 'employee-clock-in': { enabled: false, order: 5 } } }).success).toBe(true)
    expect(UpdateUserPreferencesBody.safeParse({ dashboardWidgets: { 'Clock In': { enabled: true, order: 5 } } }).success).toBe(false)
    expect(UpdateUserPreferencesBody.safeParse({ dashboardWidgets: { 'employee-clock-in': { enabled: true, order: -1 } } }).success).toBe(false)
  })
})
