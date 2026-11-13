// file: apps/web/features/preferences/preferences.test.tsx
/**
 * Tests for the preferences area (Settings plan, stage 2): the Preferences page draws the person's saved choices,
 * the frame takes its theme and first section from the provider, and the idle logout's timing rules.
 * Run: `pnpm --dir apps/web exec vitest run features/preferences`.
 *
 * Rendering is to text with `react-dom/server`, so effects and saves do not run here; the API side of a save is
 * tested in `apps/api/src/features/preferences/preferences.test.ts`.
 */

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { UserPreferencesData } from '@krhomebase/contracts'
import ApplicationShell from '@/components/shell/ApplicationShell.client'
import { idleStatus } from '@/components/shell/IdleLogoutMonitor.client'
import { SHELL_NAV_ITEMS, type ShellSectionId } from '@/components/shell/navigation'
import PreferencesPage from '@/features/preferences/components/PreferencesPage.client'
import { PreferencesProvider } from '@/features/preferences/PreferencesProvider.client'
import { AUTH_ERROR_MESSAGES, AUTH_NOTICE_CODES } from '@/features/auth/authErrors'

const SAVED: UserPreferencesData = { preferences: { theme: 'dark', autoLogoutMinutes: 15, startingSection: 'timekeeping', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} }, workstreamTypes: [] }, updatedAt: '2026-11-11T20:00:00.000Z' }
const USER = { displayName: 'Test Person', firmName: 'Test Firm', avatarInitials: 'TP' }
const PANELS = Object.fromEntries(SHELL_NAV_ITEMS.map((item) => [item.id, <p key={item.id}>panel-{item.id}</p>])) as Record<ShellSectionId, ReactNode>

/** The value shown by a `<select>` in rendered text: the option marked selected. */
function selected(html: string, id: string): string | undefined {
  const select = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>(.*?)</select>`))?.[1] ?? ''
  return select.match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1]
}

describe('Preferences page', () => {
  it("draws the person's saved theme, starting page and auto logout time, with no actions until something changes", () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={SAVED}>
        <PreferencesPage />
      </PreferencesProvider>,
    )
    expect(selected(html, 'user-preferences-theme')).toBe('Dark')
    expect(selected(html, 'user-preferences-starting-page')).toBe('Attendance')
    expect(selected(html, 'user-preferences-auto-logout')).toBe('15 minutes')
    expect(html).not.toContain('Save changes')
    expect(html).toContain('data-kr-element="user-preferences-auto-logout-row"')
  })
})

describe('the frame with preferences', () => {
  it('draws the dark theme and opens on the starting section', () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={SAVED}>
        <ApplicationShell user={USER} panels={PANELS} versionLabel="v9.9.9 p999" />
      </PreferencesProvider>,
    )
    expect(html).toContain('data-kr-theme="dark"')
    expect(html).toContain('panel-timekeeping')
  })

  it('uses the light theme and the Dashboard without a provider', () => {
    const html = renderToStaticMarkup(<ApplicationShell user={USER} panels={PANELS} versionLabel="v9.9.9 p999" />)
    expect(html).toContain('data-kr-theme="light"')
    expect(html).toContain('panel-dashboard')
  })
})

describe('idle logout timing', () => {
  const minute = 60_000
  it('stays quiet until 5 minutes before the limit, then counts down the whole minutes left', () => {
    expect(idleStatus(54 * minute, 60)).toEqual({ state: 'active' })
    expect(idleStatus(55 * minute, 60)).toEqual({ state: 'warning', minutesLeft: 5 })
    expect(idleStatus(59.5 * minute, 60)).toEqual({ state: 'warning', minutesLeft: 1 })
    expect(idleStatus(60 * minute, 60)).toEqual({ state: 'timeout' })
  })

  it('warns at 10 minutes for the 15-minute choice, as the old app did', () => {
    expect(idleStatus(9 * minute, 15)).toEqual({ state: 'active' })
    expect(idleStatus(10 * minute, 15)).toEqual({ state: 'warning', minutesLeft: 5 })
  })

  it('sends the person to a login notice that says why', () => {
    expect(AUTH_NOTICE_CODES).toContain('idle_timeout')
    expect(AUTH_ERROR_MESSAGES.idle_timeout).toMatch(/without activity/)
  })
})

describe('WorkStream view preference (Nov 13, 2026)', () => {
  it('ticking All or unticking the last type means All; types keep the standard order', async () => {
    const { nextWorkstreamTypes } = await import('@/features/preferences/components/WorkstreamPreferencesCard.client')
    expect(nextWorkstreamTypes([], 'Notes', true)).toEqual(['Notes'])
    expect(nextWorkstreamTypes(['Notes'], 'PhoneCalls', true)).toEqual(['PhoneCalls', 'Notes'])
    expect(nextWorkstreamTypes(['Notes'], 'Notes', false)).toEqual([])
    expect(nextWorkstreamTypes(['Notes', 'WIP'], 'all', true)).toEqual([])
  })
})
