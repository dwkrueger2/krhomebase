// file: apps/web/components/shell/shellState.test.ts
import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs, findNavItem, isShellSectionId, openItemSectionId, parseOpenItemSectionId, SHELL_NAV_ITEMS, type ShellOpenItem } from '@/components/shell/navigation'
import { readSavedShellItems, writeSavedShellItems } from '@/components/shell/openItemsStorage'
import { createInitialShellState, shellReducer } from '@/components/shell/shellState'

/** Tests for the frame's state and menu helpers. Run: `pnpm --dir apps/web run test`. */
describe('createInitialShellState', () => {
  it('starts expanded on the Dashboard with no pop-out', () => {
    expect(createInitialShellState()).toEqual({
      collapsed: false,
      activeSectionId: 'dashboard',
      settingsExpanded: false,
      popoutSectionIds: [],
      openItems: [],
      recentItems: [],
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

/** Open items (plan decisions 6 and 7). Ids and names are made up. */
describe('open items', () => {
  const contact = (n: number): ShellOpenItem => ({ parentId: 'contacts', itemId: `ind_${n}`, label: `[00${n}] Test Person ${n}` })
  const openAll = (count: number) =>
    Array.from({ length: count }, (_, index) => contact(index + 1)).reduce((state, item) => shellReducer(state, { type: 'openItem', item }), createInitialShellState())

  it('reads and builds open-item section ids', () => {
    expect(openItemSectionId('contacts', 'ind_1')).toBe('contact:ind_1')
    expect(openItemSectionId('billing', 'cli_1')).toBe('billing:cli_1')
    expect(parseOpenItemSectionId('contact:ind_1')).toEqual({ parentId: 'contacts', itemId: 'ind_1' })
    expect(parseOpenItemSectionId('contacts')).toBeNull()
    expect(parseOpenItemSectionId('tool:abc')).toBeNull()
    expect(parseOpenItemSectionId('contact:')).toBeNull()
    expect(findNavItem('contact:ind_1').id).toBe('contacts')
  })

  it('opens an item, shows it, and lists it first in both lists', () => {
    const state = shellReducer(openAll(2), { type: 'openItem', item: contact(1) })
    expect(state.activeSectionId).toBe('contact:ind_1')
    expect(state.openItems.map((item) => item.itemId)).toEqual(['ind_1', 'ind_2'])
    expect(state.recentItems.map((item) => item.itemId)).toEqual(['ind_1', 'ind_2'])
  })

  it('keeps at most five per parent, dropping the oldest and its pop-out', () => {
    const five = shellReducer(openAll(5), { type: 'openPopout', sectionId: 'contact:ind_1' })
    const six = shellReducer(five, { type: 'openItem', item: contact(6) })
    expect(six.openItems.map((item) => item.itemId)).toEqual(['ind_6', 'ind_5', 'ind_4', 'ind_3', 'ind_2'])
    expect(six.popoutSectionIds).toEqual([])
    expect(six.recentItems).toHaveLength(5)
  })

  it('does not count another parent toward the five', () => {
    const withBilling = shellReducer(openAll(5), { type: 'openItem', item: { parentId: 'billing', itemId: 'cli_1', label: 'Client' } })
    expect(withBilling.openItems).toHaveLength(6)
  })

  it('closing a showing item opens its parent row and keeps it in recently accessed', () => {
    const closed = shellReducer(openAll(2), { type: 'closeItem', parentId: 'contacts', itemId: 'ind_2' })
    expect(closed.activeSectionId).toBe('contacts')
    expect(closed.openItems.map((item) => item.itemId)).toEqual(['ind_1'])
    expect(closed.recentItems.map((item) => item.itemId)).toEqual(['ind_2', 'ind_1'])
  })

  it('closing an item pop-out closes the item (decision 6)', () => {
    const out = shellReducer(openAll(2), { type: 'openPopout', sectionId: 'contact:ind_1' })
    const closed = shellReducer(out, { type: 'closePopout', sectionId: 'contact:ind_1' })
    expect(closed.popoutSectionIds).toEqual([])
    expect(closed.openItems.map((item) => item.itemId)).toEqual(['ind_2'])
  })

  it('relabels an item in both lists, and returns the same state when nothing changes', () => {
    const state = openAll(1)
    const renamed = shellReducer(state, { type: 'setItemLabel', parentId: 'contacts', itemId: 'ind_1', label: 'New name' })
    expect(renamed.openItems[0]!.label).toBe('New name')
    expect(renamed.recentItems[0]!.label).toBe('New name')
    expect(shellReducer(renamed, { type: 'setItemLabel', parentId: 'contacts', itemId: 'ind_1', label: 'New name' })).toBe(renamed)
  })

  it('saves and reads the lists per person, and ignores damaged values', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
    const state = openAll(2)
    writeSavedShellItems('user_a', { openItems: [...state.openItems], recentItems: [...state.recentItems] }, storage)
    expect(readSavedShellItems('user_a', storage).openItems.map((item) => item.itemId)).toEqual(['ind_2', 'ind_1'])
    expect(readSavedShellItems('user_b', storage).openItems).toEqual([])
    expect(readSavedShellItems('', storage).openItems).toEqual([])
    store.set('kr-homebase:open-items:user_c', '{not json')
    expect(readSavedShellItems('user_c', storage).openItems).toEqual([])
    store.set('kr-homebase:open-items:user_d', JSON.stringify({ version: 1, openItems: [{ parentId: 'nope', itemId: 'x' }, { parentId: 'contacts', itemId: 'ind_9' }], recentItems: 'bad' }))
    expect(readSavedShellItems('user_d', storage)).toEqual({ openItems: [{ parentId: 'contacts', itemId: 'ind_9', label: 'ind_9' }], recentItems: [] })
  })
})
