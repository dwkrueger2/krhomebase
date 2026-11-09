// file: apps/web/components/dev-view/DevView.test.tsx
/**
 * Tests for the Dev View components that do not need a browser: the first render of `DevView` (the button only),
 * the panel's controls, the label placement rule and the corner helpers.
 *
 * Run: Set-Location D:\Repos\krhomebase; pnpm --dir apps/web exec vitest run components/dev-view
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CORNER_LAYOUT_STYLES, DEV_VIEW_CORNERS, isDevViewCorner, readStoredCorner } from './corner'
import { labelPlacement } from './DevOverlay.client'
import DevView from './DevView.client'
import DevViewPanel, { type DevViewPanelProps } from './DevViewPanel.client'
import type { MarkerEntry } from './markers'

const noop = vi.fn()

function panelProps(overrides: Partial<DevViewPanelProps> = {}): DevViewPanelProps {
  const entries: MarkerEntry[] = [
    { attribute: 'data-kr-id', value: 'KRH-Workspace', count: 1, isBorderedMarker: false, isFocusMarker: true, isOverlayMarker: true, key: 'data-kr-id=KRH-Workspace', order: 0 },
  ]
  return {
    activeFilters: new Set(['focus']),
    copiedKey: null,
    corner: 'bottom-right',
    hoveredMetadata: null,
    pickedCount: 0,
    picking: false,
    search: '',
    selectedKeys: new Set(['data-kr-id=KRH-Workspace']),
    sortMode: 'page',
    totalCount: 5,
    visibleEntries: entries,
    onClearVisible: noop,
    onClose: noop,
    onCopy: noop,
    onCornerChange: noop,
    onFilterClick: noop,
    onMarkerHover: noop,
    onMarkerLeave: noop,
    onSearchChange: noop,
    onSelectVisible: noop,
    onSortChange: noop,
    onToggleBordered: noop,
    onToggleMarker: noop,
    onTogglePicking: noop,
    ...overrides,
  }
}

describe('DevView', () => {
  // Runs with no `window` (vitest's node environment), which also proves the first render never touches the window.
  it('first renders only the Dev View button, inside the Dev View root, at bottom right', () => {
    const html = renderToStaticMarkup(<DevView />)
    expect(html).toContain('data-dev-view-root=""')
    expect(html).toContain('>Dev View</button>')
    expect(html).toContain('md:right-[119px]')
    expect(html).not.toContain('Dev-View-Marker-Controls')
  })
})

describe('DevViewPanel', () => {
  it('shows the counts, all eight filter buttons and the marker list', () => {
    const html = renderToStaticMarkup(<DevViewPanel {...panelProps()} />)
    expect(html).toContain('data-kr-id="Dev-View-Marker-Controls"')
    expect(html).toContain('1 selected · 1 shown · 5 total')
    for (const label of ['Focus', 'Overlay', '-kr-id', '-kr-element', '-ledger', '-dialog', 'All markers', 'Bordered']) {
      expect(html).toContain(`>${label}</button>`)
    }
    expect(html).toContain('data-kr-id=&quot;KRH-Workspace&quot;')
  })

  it('adds the picked count only when something is picked', () => {
    expect(renderToStaticMarkup(<DevViewPanel {...panelProps({ pickedCount: 2 })} />)).toContain('1 selected · 2 picked · 1 shown · 5 total')
  })

  it('offers four corner buttons and marks the current one', () => {
    const html = renderToStaticMarkup(<DevViewPanel {...panelProps({ corner: 'top-left' })} />)
    expect(html.match(/aria-label="Move Dev View to the/g)).toHaveLength(4)
    expect(html).toContain('aria-label="Move Dev View to the top left corner" aria-pressed="true"')
    expect(html).toContain(CORNER_LAYOUT_STYLES['top-left'].panel)
  })

  it('shows the Pick button, and its hint only while picking', () => {
    expect(renderToStaticMarkup(<DevViewPanel {...panelProps()} />)).toContain('>Pick</button>')
    const picking = renderToStaticMarkup(<DevViewPanel {...panelProps({ picking: true })} />)
    expect(picking).toContain('>Picking…</button>')
    expect(picking).toContain('Esc stops')
  })
})

describe('labelPlacement', () => {
  it('centers a top label on the top edge and keeps the slide offset', () => {
    const placement = labelPlacement(true, false, 12)
    expect(placement.label).toContain('left-1/2')
    expect(placement.style.transform).toBe('translateX(calc(-50% + 12px))')
  })

  it('aligns a label left near the left edge', () => {
    expect(labelPlacement(false, true, 0).overlay).toContain('justify-start')
    expect(labelPlacement(true, true, 4).style.transform).toBe('translateX(4px)')
  })
})

describe('corner', () => {
  it('accepts the four corners only', () => {
    expect(DEV_VIEW_CORNERS.every(isDevViewCorner)).toBe(true)
    expect(isDevViewCorner('middle')).toBe(false)
  })

  it('falls back to bottom right when storage is unavailable', () => {
    expect(readStoredCorner()).toBe('bottom-right')
  })
})
