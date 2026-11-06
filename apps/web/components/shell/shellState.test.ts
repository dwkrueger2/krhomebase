// file: apps/web/components/shell/shellState.test.ts
import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs, findNavItem, isShellSectionId, SHELL_NAV_ITEMS } from '@/components/shell/navigation'
import { createInitialShellState, shellReducer } from '@/components/shell/shellState'

/** Tests for the frame's state and menu helpers. Run: `pnpm --dir apps/web run test`. */
describe('createInitialShellState', () => {
  it('starts expanded on the Dashboard with no pop-out', () => {
    expect(createInitialShellState()).toEqual({
      collapsed: false,
      activeSectionId: 'dashboard',
      settingsExpanded: false,
      popoutSectionIds: [],
    })
  })

  it('opens the Settings group when the first section is a settings page', () => {
    expect(createInitialShellState('firm-settings').settingsExpanded).toBe(true)
  })
})

describe('shellReducer', () => {
  it('toggles the collapsed state without changing the open section', () => {
    const next = shellReducer(createInitialShellState('billing'), { type: 'toggleCollapsed' })
    expect(next.collapsed).toBe(true)
    expect(next.activeSectionId).toBe('billing')
    expect(shellReducer(next, { type: 'toggleCollapsed' }).collapsed).toBe(false)
  })

  it('opens the chosen section', () => {
    expect(shellReducer(createInitialShellState(), { type: 'selectSection', sectionId: 'leads' }).activeSectionId).toBe('leads')
  })

  it('flips the Settings group when the Settings row is chosen', () => {
    const first = shellReducer(createInitialShellState(), { type: 'selectSection', sectionId: 'settings' })
    expect(first.settingsExpanded).toBe(true)
    expect(shellReducer(first, { type: 'selectSection', sectionId: 'settings' }).settingsExpanded).toBe(false)
  })

  it('keeps the Settings group open when a child is chosen', () => {
    const next = shellReducer(createInitialShellState(), { type: 'selectSection', sectionId: 'user-settings' })
    expect(next.settingsExpanded).toBe(true)
  })

  it('leaves the Settings group alone when another section is chosen', () => {
    const open = shellReducer(createInitialShellState(), { type: 'toggleSettings' })
    expect(shellReducer(open, { type: 'selectSection', sectionId: 'tasks' }).settingsExpanded).toBe(true)
  })

  it('restores a section from the address bar the same way each time', () => {
    const once = shellReducer(createInitialShellState(), { type: 'restoreSection', sectionId: 'settings' })
    const twice = shellReducer(once, { type: 'restoreSection', sectionId: 'settings' })
    expect(once).toEqual(twice)
    expect(twice.settingsExpanded).toBe(true)
  })

  it('opens and closes the pop-out for a section', () => {
    const open = shellReducer(createInitialShellState(), { type: 'openPopout', sectionId: 'reports' })
    expect(open.popoutSectionIds).toEqual(['reports'])
    expect(shellReducer(open, { type: 'closePopout', sectionId: 'reports' }).popoutSectionIds).toEqual([])
  })

  it('keeps several pop-outs open at once and closes them one by one', () => {
    let state = createInitialShellState()
    state = shellReducer(state, { type: 'openPopout', sectionId: 'billing' })
    state = shellReducer(state, { type: 'openPopout', sectionId: 'tasks' })
    expect(state.popoutSectionIds).toEqual(['billing', 'tasks'])
    state = shellReducer(state, { type: 'closePopout', sectionId: 'billing' })
    expect(state.popoutSectionIds).toEqual(['tasks'])
  })

  it('ignores a second pop-out of a section that is already out', () => {
    const once = shellReducer(createInitialShellState(), { type: 'openPopout', sectionId: 'leads' })
    expect(shellReducer(once, { type: 'openPopout', sectionId: 'leads' })).toBe(once)
  })
})

describe('navigation helpers', () => {
  it('lists the thirteen menu rows, three of them under Settings', () => {
    expect(SHELL_NAV_ITEMS).toHaveLength(13)
    expect(SHELL_NAV_ITEMS.filter((item) => item.parentId === 'settings')).toHaveLength(3)
  })

  it('recognizes section ids and rejects other text', () => {
    expect(isShellSectionId('billing')).toBe(true)
    expect(isShellSectionId('nonsense')).toBe(false)
    expect(isShellSectionId(null)).toBe(false)
  })

  it('builds a two-step trail for a settings child and one step otherwise', () => {
    expect(buildBreadcrumbs('user-settings')).toEqual(['Settings', 'User Settings'])
    expect(buildBreadcrumbs('leads')).toEqual(['Leads'])
  })

  it('falls back to the Dashboard row for an unknown id', () => {
    expect(findNavItem('nope' as never).id).toBe('dashboard')
  })
})
