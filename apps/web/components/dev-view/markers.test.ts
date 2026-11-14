// file: apps/web/components/dev-view/markers.test.ts
/**
 * Tests for the Dev View marker rules and the Pick helpers. The tests run without a browser, so they build
 * small stand-in elements (`fakeElement`) with only the fields the helpers read.
 *
 * Run: Set-Location D:\Repos\krhomebase; pnpm --dir apps/web exec vitest run components/dev-view
 */

import { describe, expect, it } from 'vitest'
import {
  findMarkedAncestor,
  isDialogMarker,
  isDialogScopeElement,
  isElementMarker,
  isIdMarker,
  isLedgerMarker,
  isWorkspaceCanvasElement,
  markerAttributesForElement,
  markerKeyFromLabel,
  markerLabel,
  pickLabelsForElement,
  pickOverlayId,
  pickLabelForElement,
  type MarkerElement,
} from './markers'

/** Builds a stand-in element with the given attributes, classes and parent. */
function fakeElement(attributes: Record<string, string>, parent: MarkerElement | null = null, classes: string[] = []): MarkerElement {
  return {
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    classList: { contains: (className: string) => classes.includes(className) },
    getAttribute: (name: string) => attributes[name] ?? null,
    parentElement: parent,
  }
}

describe('marker families', () => {
  it('sorts attributes into the id and element families and skips suppressed ones', () => {
    expect(isIdMarker('data-kr-id')).toBe(true)
    expect(isIdMarker('data-kr-id-row')).toBe(true)
    expect(isIdMarker('data-kr-id-suppress')).toBe(false)
    expect(isElementMarker('data-kr-element-cell')).toBe(true)
    expect(isElementMarker('data-kr-action')).toBe(false)
  })

  it('matches -ledger on data-kr-id only and -dialog on both families', () => {
    expect(isLedgerMarker('data-kr-id', 'time-and-fees-LEDGER')).toBe(true)
    expect(isLedgerMarker('data-kr-element', 'time-and-fees-ledger')).toBe(false)
    expect(isDialogMarker('data-kr-element', 'theme-save-dialog-backdrop')).toBe(true)
    expect(isDialogMarker('data-kr-action', 'open-dialog')).toBe(false)
    // Nov 13, 2026: "dialog" anywhere, in any case, so ContactDetailEditDialog matches too.
    expect(isDialogMarker('data-kr-id', 'ContactDetailEditDialog')).toBe(true)
    expect(isDialogMarker('data-kr-id', 'ContactEditCard-Dialog-KRModuleCard')).toBe(true)
  })

  it('counts an open dialog, its backdrop and its direct children as a Focus area', () => {
    const backdrop = fakeElement({ 'data-kr-theme-scope': 'krhomebase' })
    const dialog = fakeElement({ role: 'dialog', 'data-kr-id': 'ContactDetailEditDialog' }, backdrop)
    const card = fakeElement({ 'data-kr-id': 'ContactEditCard-Dialog-KRModuleCard' }, dialog)
    const deep = fakeElement({ 'data-kr-element': 'contact-save' }, card)
    const backdrops = new Set([backdrop])
    expect([dialog, card, backdrop].map((element) => isDialogScopeElement(element, backdrops))).toEqual([true, true, true])
    expect(isDialogScopeElement(deep, backdrops)).toBe(false)
    expect(isDialogScopeElement(fakeElement({ 'aria-modal': 'true' }), new Set())).toBe(true)
  })

  it('turns a key into a label and back', () => {
    const label = markerLabel({ attribute: 'data-kr-id', value: 'LeftPanel' })
    expect(label).toBe('data-kr-id="LeftPanel"')
    expect(markerKeyFromLabel(label)).toBe('data-kr-id=LeftPanel')
    expect(markerKeyFromLabel('not a label')).toBeNull()
  })
})

describe('markerAttributesForElement', () => {
  it('lists preferred attributes first and skips other data-kr attributes', () => {
    const element = fakeElement({ 'data-kr-collapsed': 'false', 'data-kr-id': 'krhomebase-application-shell', 'data-kr-theme-scope': 'krhomebase' })
    expect(markerAttributesForElement(element)).toEqual(['data-kr-id'])
  })

  it('includes every data-kr attribute when asked (Workspace Canvas scope)', () => {
    const element = fakeElement({ 'data-kr-id': 'KRH-Workspace', 'data-kr-section-id': 'dashboard', 'data-kr-custom': 'x' })
    expect(markerAttributesForElement(element, true)).toEqual(['data-kr-id', 'data-kr-section-id', 'data-kr-custom'])
  })

  it('falls back to the first data-kr attribute when no preferred one exists', () => {
    expect(markerAttributesForElement(fakeElement({ 'data-kr-custom': 'x', 'data-kr-other': 'y' }))).toEqual(['data-kr-custom'])
  })
})

describe('isWorkspaceCanvasElement', () => {
  it('recognizes the new KRH-Workspace and the old canvas names', () => {
    expect(isWorkspaceCanvasElement(fakeElement({ 'data-kr-id': 'KRH-Workspace' }))).toBe(true)
    expect(isWorkspaceCanvasElement(fakeElement({ 'data-kr-id': 'KRH-PopOutWindow' }))).toBe(true)
    expect(isWorkspaceCanvasElement(fakeElement({ 'data-kr-id': 'krhomebase-main-content' }))).toBe(true)
    expect(isWorkspaceCanvasElement(fakeElement({ 'data-kr-element': 'application-main-content' }))).toBe(true)
    expect(isWorkspaceCanvasElement(fakeElement({ 'data-kr-id': 'LeftPanel' }))).toBe(false)
  })
})

describe('Pick helpers', () => {
  const shell = fakeElement({ 'data-kr-id': 'krhomebase-application-shell' })
  const panel = fakeElement({ 'data-kr-id': 'LeftPanel' }, shell)
  const plainWrapper = fakeElement({ class: 'grid' }, panel)
  const icon = fakeElement({}, plainWrapper)

  it('highlights the nearest marked element, not the unmarked child under the pointer', () => {
    expect(findMarkedAncestor(icon)).toBe(panel)
    expect(findMarkedAncestor(panel)).toBe(panel)
  })

  it('climbs to the next marked ancestor from a parent', () => {
    expect(findMarkedAncestor(panel.parentElement)).toBe(shell)
    expect(findMarkedAncestor(shell.parentElement)).toBeNull()
  })

  it('ignores suppressed and empty markers', () => {
    const suppressed = fakeElement({ 'data-kr-id-suppress': 'row', 'data-kr-element': '' }, panel)
    expect(findMarkedAncestor(suppressed)).toBe(panel)
  })

  it('stops at Dev View itself', () => {
    const devRoot = fakeElement({ 'data-dev-view-root': '' })
    const devPanel = fakeElement({ 'data-kr-id': 'Dev-View-Marker-Controls' }, devRoot)
    const devButton = fakeElement({}, devPanel)
    expect(findMarkedAncestor(devButton)).toBe(devPanel)
    expect(findMarkedAncestor(fakeElement({}, devRoot))).toBeNull()
  })

  it('labels the highlight with the first marker', () => {
    expect(pickLabelForElement(fakeElement({ 'data-kr-element': 'logged-in-user-block', 'data-kr-id': 'LoggedInUserBlock' }))).toBe('data-kr-element="logged-in-user-block"')
  })

  it('lists every marker on a picked element, so the overlay names that one element in full', () => {
    const leadsButton = fakeElement({ 'data-kr-action': 'select-left-nav', 'data-kr-element': 'left-nav-item', 'data-kr-section-id': 'leads', 'data-kr-id-suppress': 'x' })
    expect(pickLabelsForElement(leadsButton)).toEqual([
      'data-kr-element="left-nav-item"',
      'data-kr-action="select-left-nav"',
      'data-kr-section-id="leads"',
    ])
  })

  it('gives each picked element its own stable overlay id', () => {
    const first = fakeElement({ 'data-kr-element': 'left-nav-item' })
    const second = fakeElement({ 'data-kr-element': 'left-nav-item' })
    expect(pickOverlayId(first)).toBe(pickOverlayId(first))
    expect(pickOverlayId(first)).not.toBe(pickOverlayId(second))
    expect(pickOverlayId(first)).toMatch(/^picked-\d+$/)
  })
})
