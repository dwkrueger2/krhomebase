// file: apps/web/features/settings/settings.test.tsx
/**
 * Tests for the Settings frame (plan `docs/08_Settings_Dashboard_Plan.md`, stage 1): which pages and cards each
 * viewer sees, the breadcrumb trail with a third step, and the page chosen from the address bar.
 * Run: `pnpm --dir apps/web run test` (or `pnpm --dir apps/web exec vitest run features/settings`).
 *
 * The tests render to text with `react-dom/server`, so effects do not run; the address bar is read in the page
 * hook's first state, which these tests reach by giving the test a stand-in `window.location`.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { buildBreadcrumbTrail, SECTION_SUB_PAGE_PARAMS } from '@/components/shell/navigation'
import { SectionPlaceContext, type SectionPlace } from '@/components/shell/shellNavigation'
import ApplicationSettingsPanel from '@/features/settings/components/ApplicationSettingsPanel.client'
import FirmSettingsPanel from '@/features/settings/components/FirmSettingsPanel.client'
import SettingsPanel from '@/features/settings/components/SettingsPanel.client'
import UserSettingsPanel from '@/features/settings/components/UserSettingsPanel.client'
import {
  APPLICATION_SETTINGS_PAGES,
  FIRM_SETTINGS_ALIASES,
  FIRM_SETTINGS_PAGES,
  SETTINGS_IT_CARDS,
  USER_SETTINGS_PAGES,
  visibleSettingsPages,
} from '@/features/settings/settingsAreas'

/** Draws a panel as the frame would in the workspace, with `search` as the address bar's query. */
function renderInWorkspace(element: ReactElement, sectionId: SectionPlace['sectionId'], search = ''): string {
  const globals = globalThis as { window?: unknown }
  globals.window = { location: { search, href: `http://localhost/${search}` } }
  return renderToStaticMarkup(<SectionPlaceContext.Provider value={{ sectionId, place: 'workspace' }}>{element}</SectionPlaceContext.Provider>)
}

/** The ids of the tabs in a rendered tab strip, in order. */
function tabIds(html: string): string[] {
  return [...html.matchAll(/data-kr-element-menu-item="([^"]+)"/g)].map((match) => match[1]!)
}

/** The id of the selected tab. */
function selectedTab(html: string): string | undefined {
  return html.match(/aria-selected="true"[^>]*data-kr-element-menu-item="([^"]+)"/)?.[1]
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('Settings areas', () => {
  it('keeps the old address values for the pages the old app had', () => {
    expect(SECTION_SUB_PAGE_PARAMS).toEqual({
      'user-settings': 'userSettingsSection',
      'application-settings': 'applicationSettingsTab',
      'firm-settings': 'firmSettingsSection',
    })
    expect(USER_SETTINGS_PAGES.map((page) => page.id)).toEqual(['user-settings', 'dashboard-settings', 'time-card', 'employee-file'])
    for (const old of ['role-specifications', 'team-management', 'other-configuration', 'site-feedback']) {
      expect(APPLICATION_SETTINGS_PAGES.some((page) => page.id === old)).toBe(true)
    }
    // Users and Invites moved to Firm Settings → Users (Nov 12, 2026); its old tab name still opens it there.
    expect(FIRM_SETTINGS_ALIASES['user-management']).toBe('users')
    for (const old of ['profile', 'employee-policies', 'data-management', 'gpt-model-gateway', 'stripe-payment-configuration']) {
      expect(FIRM_SETTINGS_PAGES.some((page) => page.id === old)).toBe(true)
    }
    expect(FIRM_SETTINGS_ALIASES['stripe-dev-tests']).toBe('stripe-payment-configuration')
  })

  it('shows Users and the three IT pages of Firm Settings to a super admin only', () => {
    const superAdminPages = ['users', 'data-management', 'gpt-model-gateway', 'stripe-payment-configuration']
    expect(visibleSettingsPages(FIRM_SETTINGS_PAGES, false).map((page) => page.id)).toEqual(['profile', 'employee-policies', 'employee-documents'])
    expect(visibleSettingsPages(FIRM_SETTINGS_PAGES, true).map((page) => page.id).slice(3)).toEqual(superAdminPages)
  })

  it('keeps the old ids of the three IT cards', () => {
    expect(SETTINGS_IT_CARDS.map((card) => card.krId)).toEqual([
      'FirmSettingsMenu-option-data-management',
      'firm-settings-gpt-model-gateway-card',
      'firm-settings-stripe-payment-configuration-card',
    ])
  })
})

describe('buildBreadcrumbTrail', () => {
  it('adds the page inside a section as a third step, with the earlier steps opening their sections', () => {
    expect(buildBreadcrumbTrail('firm-settings', undefined, 'Firm Profile')).toEqual([
      { label: 'Settings', sectionId: 'settings' },
      { label: 'Firm Settings', sectionId: 'firm-settings' },
      { label: 'Firm Profile' },
    ])
    expect(buildBreadcrumbTrail('settings')).toEqual([{ label: 'Settings', sectionId: 'settings' }])
    expect(buildBreadcrumbTrail('leads', undefined, null)).toEqual([{ label: 'Leads', sectionId: 'leads' }])
  })
})

describe('Settings landing page', () => {
  it('shows User and Firm Settings, without Application Settings or the IT cards, to anyone but a super admin', () => {
    const html = renderToStaticMarkup(<SettingsPanel />)
    expect(html).toContain('data-kr-id="settings-choice-user-settings"')
    expect(html).toContain('data-kr-id="settings-choice-firm-settings"')
    expect(html).not.toContain('settings-choice-application-settings')
    expect(html).not.toContain('FirmSettingsMenu-option-data-management')
  })

  it('shows a super admin the Application Settings card and the three IT cards', () => {
    const html = renderToStaticMarkup(<SettingsPanel isSuperAdmin />)
    expect(html).toContain('data-kr-id="settings-choice-application-settings"')
    for (const card of SETTINGS_IT_CARDS) expect(html).toContain(`data-kr-id="${card.krId}"`)
    expect(html).toContain('data-kr-action="open-stripe-payment-configuration-workspace"')
  })
})

describe('Settings areas in the workspace', () => {
  it('opens the first page when the address names none, drawing the Preferences page it was given', () => {
    const html = renderInWorkspace(<UserSettingsPanel preferencesPage={<p data-kr-id="preferences-stand-in">prefs</p>} />, 'user-settings')
    expect(tabIds(html)).toEqual(['user-settings', 'dashboard-settings', 'time-card', 'employee-file'])
    expect(selectedTab(html)).toBe('user-settings')
    expect(html).toContain('data-kr-id="preferences-stand-in"')
  })

  it('shows the Employee File page it was given (a placeholder without one), and the Time Card button', () => {
    const employeeFile = renderInWorkspace(<UserSettingsPanel employeeFilePage={<p data-kr-id="employee-file-stand-in">file</p>} />, 'user-settings', '?userSettingsSection=employee-file')
    expect(employeeFile).toContain('data-kr-id="employee-file-stand-in"')
    expect(renderInWorkspace(<UserSettingsPanel />, 'user-settings', '?userSettingsSection=employee-file')).toContain('Not built yet: Settings port')
    const timeCard = renderInWorkspace(<UserSettingsPanel />, 'user-settings', '?userSettingsSection=time-card')
    expect(timeCard).toContain('data-kr-action="open-my-time-card"')
    expect(timeCard).toContain('Open my time card')
  })

  it('opens the page named in the address, reading the old Stripe alias', () => {
    const html = renderInWorkspace(<FirmSettingsPanel isSuperAdmin />, 'firm-settings', '?section=firm-settings&firmSettingsSection=stripe-dev-tests')
    expect(selectedTab(html)).toBe('stripe-payment-configuration')
  })

  it('falls back to the first page when the address names a page this person may not see', () => {
    const html = renderInWorkspace(<FirmSettingsPanel />, 'firm-settings', '?firmSettingsSection=stripe-payment-configuration')
    expect(tabIds(html)).toEqual(['profile', 'employee-policies', 'employee-documents'])
    expect(selectedTab(html)).toBe('profile')
  })

  it('draws the finished Outside Tools page for a super admin, and a notice for anyone else', () => {
    const html = renderInWorkspace(
      <ApplicationSettingsPanel isSuperAdmin outsideTools={<p data-kr-id="outside-tools-stand-in">tools</p>} />,
      'application-settings',
      '?applicationSettingsTab=outside-tools',
    )
    expect(selectedTab(html)).toBe('outside-tools')
    expect(html).toContain('data-kr-id="outside-tools-stand-in"')
    const notice = renderInWorkspace(<ApplicationSettingsPanel />, 'application-settings', '?applicationSettingsTab=outside-tools')
    expect(notice).toContain('Application Settings require the Super Admin role.')
    expect(notice).not.toContain('outside-tools-stand-in')
  })

  it('leaves the address alone in a pop-out: the first page opens whatever the address says', () => {
    const globals = globalThis as { window?: unknown }
    globals.window = { location: { search: '?firmSettingsSection=employee-policies', href: 'http://localhost/' } }
    const html = renderToStaticMarkup(
      <SectionPlaceContext.Provider value={{ sectionId: 'firm-settings', place: 'popout' }}>
        <FirmSettingsPanel />
      </SectionPlaceContext.Provider>,
    )
    expect(selectedTab(html)).toBe('profile')
  })
})
