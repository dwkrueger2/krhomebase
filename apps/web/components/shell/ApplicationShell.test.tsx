// file: apps/web/components/shell/ApplicationShell.test.tsx
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ApplicationShell from '@/components/shell/ApplicationShell.client'
import LeftPanelCollapseButton from '@/components/shell/LeftPanelCollapseButton.client'
import LeftPanelFooter from '@/components/shell/LeftPanelFooter.client'
import LeftPanelHeader from '@/components/shell/LeftPanelHeader.client'
import LeftPanelNavList from '@/components/shell/LeftPanelNavList.client'
import PopOutWindow from '@/components/shell/PopOutWindow.client'
import TopTitleBar from '@/components/shell/TopTitleBar.client'
import { SHELL_NAV_ITEMS, type ShellSectionId } from '@/components/shell/navigation'

/**
 * Render tests for the application frame. They render to text with `react-dom/server`, so they check
 * structure, ids and wording but not clicks or layout. Layout was checked in a browser at 390, 768
 * and 1280 pixels. Run: `pnpm --filter @krhomebase/web test`.
 */
const USER = { displayName: 'Test Person', firmName: 'Test Firm', avatarInitials: 'TP' }

/** A panel for every id, each one a marker that names its id. */
const PANELS = Object.fromEntries(SHELL_NAV_ITEMS.map((item) => [item.id, <p key={item.id}>panel-{item.id}</p>])) as Record<ShellSectionId, ReactNode>

describe('ApplicationShell', () => {
  const html = renderToStaticMarkup(<ApplicationShell user={USER} panels={PANELS} versionLabel="v9.9.9 p999" />)

  it('carries the frame id and the theme scope', () => {
    expect(html).toContain('data-kr-id="krhomebase-application-shell"')
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
  })

  it('has the header row with both columns and the panels row with both columns', () => {
    expect(html).toContain('data-kr-id="HeaderBar"')
    expect(html).toContain('data-kr-id="LeftPanelHeader"')
    expect(html).toContain('data-kr-id="TopTitleBar"')
    expect(html).toContain('data-kr-id="ApplicationPanels"')
    expect(html).toContain('data-kr-id="LeftPanel"')
    expect(html).toContain('data-kr-id="LeftPanelNavList"')
    expect(html).toContain('data-kr-id="LeftPanelFooter"')
    expect(html).toContain('data-kr-id="KRH-Workspace"')
  })

  it('puts the header before the panels', () => {
    expect(html.indexOf('data-kr-id="HeaderBar"')).toBeLessThan(html.indexOf('data-kr-id="ApplicationPanels"'))
  })

  it('opens on the Dashboard panel only', () => {
    expect(html).toContain('panel-dashboard')
    expect(html).not.toContain('panel-leads')
    expect(html).toContain('data-kr-id="WorkingPanel-dashboard"')
  })

  it('shows the collapse button, the pop-out icon and the version', () => {
    expect(html).toContain('data-kr-element="left-panel-collapse-button"')
    expect(html).toContain('data-kr-element="workspace-popout-button"')
    expect(html).toContain('v9.9.9 p999')
  })

  it('opens with the left panel expanded and no pop-out window', () => {
    expect(html).toContain('data-kr-collapsed="false"')
    expect(html).not.toContain('KRH-PopOutWindow')
  })
})

describe('LeftPanelNavList', () => {
  const base = { items: SHELL_NAV_ITEMS, activeSectionId: 'dashboard' as ShellSectionId, onSelectSection: () => undefined }

  it('lists the ten top-level rows and hides the Settings children while the group is closed', () => {
    const html = renderToStaticMarkup(<LeftPanelNavList {...base} collapsed={false} settingsExpanded={false} />)
    expect((html.match(/data-kr-element="left-nav-item"/g) ?? []).length).toBe(10)
    expect(html).not.toContain('left-nav-subitem"')
  })

  it('lists the three Settings children while the group is open', () => {
    const html = renderToStaticMarkup(<LeftPanelNavList {...base} collapsed={false} settingsExpanded />)
    expect((html.match(/data-kr-element="left-nav-subitem"/g) ?? []).length).toBe(3)
    expect(html).toContain('aria-expanded="true"')
  })

  it('marks the open section as the current page', () => {
    const html = renderToStaticMarkup(<LeftPanelNavList {...base} activeSectionId="billing" collapsed={false} settingsExpanded={false} />)
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
  })

  it('highlights Settings while one of its children is open', () => {
    const html = renderToStaticMarkup(<LeftPanelNavList {...base} activeSectionId="firm-settings" collapsed={false} settingsExpanded />)
    expect(html).toContain('font-extrabold')
  })

  it('gives each row a tooltip with its label when collapsed', () => {
    const html = renderToStaticMarkup(<LeftPanelNavList {...base} collapsed settingsExpanded={false} />)
    expect(html).toContain('title="Clients &amp; Contacts"')
  })

  it('lists open contacts under Clients & Contacts with close buttons, and hides them when collapsed', () => {
    const openItems = [
      { parentId: 'contacts' as const, itemId: 'ind_1', label: '[001] Test Person' },
      { parentId: 'contacts' as const, itemId: 'ind_2', label: 'Other Person' },
    ]
    const html = renderToStaticMarkup(<LeftPanelNavList {...base} activeSectionId="contact:ind_1" openItems={openItems} collapsed={false} settingsExpanded={false} />)
    expect(html).toContain('Open contacts')
    expect((html.match(/data-kr-element="left-nav-open-item"/g) ?? []).length).toBe(2)
    expect((html.match(/data-kr-element="left-nav-open-item-close"/g) ?? []).length).toBe(2)
    expect(html).toContain('[001] Test Person')
    // The open contact is the current page; its parent row is highlighted but not marked current.
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
    const collapsed = renderToStaticMarkup(<LeftPanelNavList {...base} openItems={openItems} collapsed settingsExpanded={false} />)
    expect(collapsed).not.toContain('Open contacts')
  })
})

describe('TopTitleBar recently accessed', () => {
  it('draws the recently accessed button beside the bell', () => {
    const html = renderToStaticMarkup(<TopTitleBar title="Dashboard" breadcrumbItems={['Dashboard']} userDisplayName="Test User" recentItems={[]} />)
    expect(html).toContain('data-kr-element="homebase-recent-menu"')
    expect(html.indexOf('homebase-recent-menu')).toBeLessThan(html.indexOf('homebase-notification-menu'))
  })
})

describe('LeftPanelCollapseButton', () => {
  it('names the action it will take', () => {
    const open = renderToStaticMarkup(<LeftPanelCollapseButton collapsed={false} controlsId="x" onToggleCollapsed={() => undefined} />)
    const closed = renderToStaticMarkup(<LeftPanelCollapseButton collapsed controlsId="x" onToggleCollapsed={() => undefined} />)
    expect(open).toContain('Collapse KR Homebase navigation')
    expect(open).toContain('aria-expanded="true"')
    expect(closed).toContain('Expand KR Homebase navigation')
    expect(closed).toContain('aria-expanded="false"')
  })
})

describe('LeftPanelHeader and LeftPanelFooter', () => {
  it('reports the collapsed state for inspection', () => {
    expect(renderToStaticMarkup(<LeftPanelHeader collapsed versionLabel="v1" />)).toContain('data-kr-collapsed="true"')
  })

  it('shows the user and leaves out the log-out button when none is supplied', () => {
    const html = renderToStaticMarkup(<LeftPanelFooter user={USER} collapsed={false} />)
    expect(html).toContain('Test Person')
    expect(html).toContain('Test Firm')
    expect(html).not.toContain('Log out')
  })

  it('shows the log-out button when a handler is supplied', () => {
    expect(renderToStaticMarkup(<LeftPanelFooter user={USER} collapsed={false} onLogout={() => undefined} />)).toContain('Log out of KR Homebase')
  })
})

describe('PopOutWindow', () => {
  it('shows the title, a close button and the panel', () => {
    const html = renderToStaticMarkup(
      <PopOutWindow title="Billing" onClose={() => undefined}>
        <p>inside</p>
      </PopOutWindow>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Billing')
    expect(html).toContain('data-kr-element="popout-close-button"')
    expect(html).toContain('inside')
  })
})

describe('ApplicationShell top-bar slots', () => {
  it('shows the given search and status in the title bar, in place of the unconnected search box', () => {
    const html = renderToStaticMarkup(
      <ApplicationShell
        user={USER}
        panels={PANELS}
        versionLabel="v9.9.9 p999"
        topBarSearch={<div data-kr-element="application-search">given-search</div>}
        topBarStatus={<span>given-status</span>}
      />,
    )
    expect(html).toContain('given-search')
    expect(html).toContain('given-status')
    expect(html).not.toContain('placeholder="Search KR Homebase"')
    expect(html.indexOf('given-status')).toBeLessThan(html.indexOf('data-kr-element="homebase-notification-menu"'))
  })
})
