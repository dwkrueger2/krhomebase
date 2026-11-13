// file: apps/web/features/preferences/theme.test.tsx
/**
 * Tests for the person's theme (Settings plan, section 13, stage 2b): the style rule (only checked values, screen only,
 * light and dark apart), the frame drawing it, the Theme card, and that the contract's copy of the built-in values
 * still matches styles/theme.css.
 * Run: pnpm --dir apps/web exec vitest run features/preferences/theme.test.tsx
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEME, type FirmThemesData, type UserPreferencesData } from '@krhomebase/contracts'
import ApplicationShell from '@/components/shell/ApplicationShell.client'
import { SHELL_NAV_ITEMS, type ShellSectionId } from '@/components/shell/navigation'
import { buildThemeStyleCss } from '@/components/shell/themeStyle'
import PreferencesPage from '@/features/preferences/components/PreferencesPage.client'
import { PreferencesProvider } from '@/features/preferences/PreferencesProvider.client'

const FIRM: FirmThemesData = {
  firmDefaultThemeId: 'firm-blue',
  themes: [{ id: 'firm-blue', name: 'Firm Blue', description: '', light: { '--kr-theme-brand-primary': '#0000aa' }, dark: {}, storedShape: 'current' }],
}
const SAVED: UserPreferencesData = {
  preferences: { theme: 'light', autoLogoutMinutes: 60, startingSection: 'dashboard', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'comfortable', light: { '--kr-theme-text': '#101010' }, dark: {} }, workstreamTypes: [] },
  updatedAt: null,
}
const USER = { displayName: 'Test Person', firmName: 'Test Firm', avatarInitials: 'TP' }
const PANELS = Object.fromEntries(SHELL_NAV_ITEMS.map((item) => [item.id, <p key={item.id}>panel-{item.id}</p>])) as Record<ShellSectionId, ReactNode>

describe('theme style rule', () => {
  it('writes only checked values, for the screen only, with light and dark apart', () => {
    const css = buildThemeStyleCss({ light: { '--kr-theme-text': '#101010', '--kr-theme-line': 'red}body{x' }, dark: { '--kr-theme-text': '#eeeeee' } })
    expect(css.startsWith('@media screen {')).toBe(true)
    expect(css).toContain('--kr-theme-text: #101010;')
    expect(css).toContain(':root[data-kr-theme="dark"] [data-kr-theme-scope="krhomebase"][data-kr-theme-scope]')
    expect(css).not.toContain('red}body')
    expect(buildThemeStyleCss({ light: {}, dark: {} })).toBe('')
  })
})

describe('the frame with a personal theme', () => {
  it('draws the firm default, the text size and the own color in one style element', () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={SAVED} firmThemes={FIRM}>
        <ApplicationShell user={USER} panels={PANELS} versionLabel="v9.9.9 p999" />
      </PreferencesProvider>,
    )
    expect(html).toContain('data-kr-element="user-theme-style"')
    expect(html).toContain('--kr-theme-brand-primary: #0000aa;')
    expect(html).toContain('--kr-theme-font-size-base: 14px;')
    expect(html).toContain('--kr-theme-text: #101010;')
  })
})

describe('Theme card', () => {
  it('draws the selector, Theme in action and the token ledger, names the firm default and marks the own color', () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={SAVED} firmThemes={FIRM}>
        <PreferencesPage />
      </PreferencesProvider>,
    )
    expect(html).toContain('Firm default (Firm Blue)')
    expect(html).toContain('data-kr-id="ThemeSelector"')
    expect(html).toContain('data-kr-id="ThemeInAction"')
    expect(html).toContain('data-kr-id="ThemeTokenLedger"')
    expect(html).not.toContain('user-theme-KRModuleCard')
    expect(html).toContain('data-kr-record-id="--kr-theme-text"')
    expect(html).toContain('#101010')
    // The redundant group column is gone: the ledger has three heading cells.
    expect(html).toContain('>Setting Name</th>')
    expect(html).not.toContain('>Group</th>')
  })
})

describe('built-in values', () => {
  it("match styles/theme.css (the contract's copy is used for readability checks)", () => {
    const css = readFileSync(fileURLToPath(new URL('../../styles/theme.css', import.meta.url)), 'utf8')
    const darkStart = css.indexOf('@media screen')
    const read = (part: string, name: string) => part.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim()
    for (const [name, value] of Object.entries(BUILT_IN_THEME.light)) expect([name, read(css.slice(0, darkStart), name)]).toEqual([name, value])
    for (const [name, value] of Object.entries(BUILT_IN_THEME.dark)) expect([name, read(css.slice(darkStart), name)]).toEqual([name, value])
  })
})
