// file: apps/web/features/dashboard/dashboard.test.tsx
/**
 * Tests for the Dashboard widgets (Settings and Dashboard plan, stage 3): which widgets show and in what order, the
 * card frame's `data-kr-id`, the empty Dashboard, the User Settings → Dashboard list, and the clock widget's time.
 * Run: `pnpm --dir apps/web exec vitest run features/dashboard`.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { UserPreferencesData } from '@krhomebase/contracts'
import { defineWidget } from '@krhomebase/tool-sdk/manifest'
import DashboardPanel from '@/features/dashboard/components/DashboardPanel.client'
import { arrangeWidgets, visibleWidgets } from '@/features/dashboard/dashboardWidgets'
import DashboardPreferencesPage from '@/features/preferences/components/DashboardPreferencesPage.client'
import { PreferencesProvider } from '@/features/preferences/PreferencesProvider.client'
import { employeeClockInWidget } from '@/features/timekeeping/clockInWidget'
import EmployeeClockInWidget, { formatRunningTime } from '@/features/timekeeping/components/EmployeeClockInWidget.client'

const clock = { definition: employeeClockInWidget, element: <p>clock-body</p> }
const notes = { definition: defineWidget({ id: 'test-notes', title: 'Notes', description: 'Made-up widget.', size: 'wide', defaultEnabled: false, defaultOrder: 1 }), element: <p>notes-body</p> }

function withChoices(dashboardWidgets: UserPreferencesData['preferences']['dashboardWidgets']): UserPreferencesData {
  return { preferences: { theme: 'light', autoLogoutMinutes: 60, startingSection: 'dashboard', dashboardWidgets, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} } }, updatedAt: null }
}

describe('arranging widgets', () => {
  it("uses each widget's defaults until the person chooses", () => {
    expect(visibleWidgets([clock, notes], {}).map((w) => w.definition.id)).toEqual(['employee-clock-in'])
  })

  it("applies the person's choices and order, and ignores choices for widgets that no longer exist", () => {
    const choices = { 'test-notes': { enabled: true, order: 10 }, 'employee-clock-in': { enabled: true, order: 20 }, gone: { enabled: true, order: 0 } }
    expect(visibleWidgets([clock, notes], choices).map((w) => w.definition.id)).toEqual(['test-notes', 'employee-clock-in'])
    expect(arrangeWidgets([clock], { 'employee-clock-in': { enabled: false, order: 5 } })[0]).toMatchObject({ enabled: false })
  })
})

describe('Dashboard', () => {
  it('draws each shown widget in its card with data-kr-id="dashboard-widget-<id>"', () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={withChoices({})}>
        <DashboardPanel widgets={[clock, notes]} />
      </PreferencesProvider>,
    )
    expect(html).toContain('data-kr-id="dashboard-widget-employee-clock-in"')
    expect(html).toContain('Employee Time Entry')
    expect(html).toContain('clock-body')
    expect(html).not.toContain('notes-body')
  })

  it('says how to choose widgets when none is turned on', () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={withChoices({ 'employee-clock-in': { enabled: false, order: 5 } })}>
        <DashboardPanel widgets={[clock]} />
      </PreferencesProvider>,
    )
    expect(html).toContain('No Dashboard widgets are turned on.')
    expect(html).toContain('data-kr-action="open-dashboard-settings"')
  })
})

describe('User Settings → Dashboard', () => {
  it('lists every widget in Dashboard order with its checkbox', () => {
    const html = renderToStaticMarkup(
      <PreferencesProvider initial={withChoices({ 'test-notes': { enabled: true, order: 1 } })}>
        <DashboardPreferencesPage widgets={[clock.definition, notes.definition]} />
      </PreferencesProvider>,
    )
    const ids = [...html.matchAll(/data-kr-record-id="([^"]+)"/g)].map((match) => match[1])
    expect(ids).toEqual(['test-notes', 'employee-clock-in'])
    expect(html).toContain('Reset dashboard widgets')
  })
})

describe('clock widget', () => {
  it('draws before its first read without the missed clock-out dialog (it needs a real date)', () => {
    const html = renderToStaticMarkup(<EmployeeClockInWidget />)
    expect(html).toContain('data-kr-id="dashboard-employee-clock-in-controls"')
    expect(html).toContain('Working Time Today:')
  })

  it('shows working time as HH:MM', () => {
    expect(formatRunningTime(0)).toBe('00:00')
    expect(formatRunningTime(205.7)).toBe('03:25')
  })
})
