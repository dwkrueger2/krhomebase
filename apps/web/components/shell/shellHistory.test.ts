// file: apps/web/components/shell/shellHistory.test.ts
import type { ToolMenuItem } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { buildNavItems, SHELL_NAV_ITEMS, type ShellOpenItem } from '@/components/shell/navigation'
import {
  noteShellHistoryEntry,
  readHistoryIndex,
  readShellAddress,
  resolvePoppedScreen,
  sectionAddress,
  sectionWriteMode,
  SHELL_HISTORY_INDEX_KEY,
  subPageWriteMode,
  writeShellHistory,
  addressLeavesSection,
  addressLeavesSubPage,
  addShellLeaveGuard,
  decideShellPopState,
  type ShellHistoryLike,
  type ShellLeaveGuard,
} from '@/components/shell/shellHistory'

/**
 * Tests for the Back and Forward rules of the application frame (`shellHistory.ts`): when an address change adds a
 * history entry and when it replaces one, and how the screen of an entry is read back. Run:
 * `pnpm --dir apps/web exec vitest run components/shell`.
 */

const BASE = 'https://homebase.example.com/'

const TOOL: ToolMenuItem = {
  clientId: 'krt_TestToolTestToolTest',
  label: 'Intake Helper',
  description: 'Checks intake forms.',
  icon: 'documents',
  menuOrder: 20,
  origin: 'https://intake.example.com',
  entryUrl: 'https://intake.example.com/app',
  scopes: ['contacts:read'],
}

/**
 * A stand-in for `window.history` and the address bar: a list of entries and a position, as a browser keeps them.
 * `pushState` drops the entries after the current one, as a browser does.
 */
class FakeHistory implements ShellHistoryLike {
  entries: { state: unknown; url: string }[]
  position = 0
  constructor(url: string, state: unknown = null) {
    this.entries = [{ state, url }]
  }
  get state(): unknown {
    return this.entries[this.position]!.state
  }
  get search(): string {
    return new URL(this.entries[this.position]!.url).search
  }
  get href(): string {
    return this.entries[this.position]!.url
  }
  pushState(state: unknown, _unused: string, url?: string | URL | null): void {
    this.entries = this.entries.slice(0, this.position + 1)
    this.entries.push({ state, url: String(url) })
    this.position += 1
  }
  replaceState(state: unknown, _unused: string, url?: string | URL | null): void {
    this.entries[this.position] = { state, url: String(url) }
  }
  /** Moves by `delta` entries and returns the state a `popstate` event would carry. */
  go(delta: number): unknown {
    this.goCalls.push(delta)
    this.position += delta
    return this.state
  }
  back(): void {
    this.go(-1)
  }
  /** Every `go` the code under test asked for, in order. */
  goCalls: number[] = []
  /** The `popstate` event a browser would fire for the entry now current (a new object each time, as browsers do). */
  popEvent(): { state: unknown } {
    return { state: this.state }
  }
}

/**
 * A page just loaded at `url`. The entry number lives in the module for the life of the page, so each test starts
 * from an entry numbered 0, as a newly loaded page does.
 */
function loadedPage(url: string): FakeHistory {
  const history = new FakeHistory(url, { [SHELL_HISTORY_INDEX_KEY]: 0 })
  noteShellHistoryEntry(history.state)
  return history
}

/** Writes the frame's address for a section the way the frame's address sync does. */
function syncSection(history: FakeHistory, sectionId: Parameters<typeof sectionAddress>[1]): void {
  const url = sectionAddress(history.href, sectionId)
  writeShellHistory(sectionWriteMode(history.search, url.search), url, history)
}

describe('readHistoryIndex', () => {
  it('reads the entry number the frame wrote', () => {
    expect(readHistoryIndex({ [SHELL_HISTORY_INDEX_KEY]: 3, __vinext_historyIndex: 9 })).toBe(3)
  })

  it('gives null for an entry the frame did not write', () => {
    expect(readHistoryIndex(null)).toBeNull()
    expect(readHistoryIndex({})).toBeNull()
    expect(readHistoryIndex({ [SHELL_HISTORY_INDEX_KEY]: -1 })).toBeNull()
    expect(readHistoryIndex({ [SHELL_HISTORY_INDEX_KEY]: '2' })).toBeNull()
  })
})

describe('sectionWriteMode', () => {
  it('writes nothing when the address already names the screen', () => {
    expect(sectionWriteMode('?section=contact:090', '?section=contact:090')).toBe('none')
  })

  it('adds an entry when another contact opens', () => {
    expect(sectionWriteMode('?section=contact:090', '?section=contact:306')).toBe('push')
  })

  it('adds an entry when another section opens', () => {
    expect(sectionWriteMode('?section=dashboard', '?section=contacts')).toBe('push')
  })

  it('replaces the entry when the address named no section yet (the first draw, a default)', () => {
    expect(sectionWriteMode('', '?section=dashboard')).toBe('replace')
    expect(sectionWriteMode('?contactId=ind_1', '?contactId=ind_1&section=contacts')).toBe('replace')
  })

  it('replaces the entry when only other parameters are tidied', () => {
    expect(sectionWriteMode('?section=contacts&firmSettingsSection=profile', '?section=contacts')).toBe('replace')
  })

  it('accepts a query with or without its question mark', () => {
    expect(sectionWriteMode('section=leads', '?section=leads')).toBe('none')
  })
})

describe('subPageWriteMode', () => {
  it('writes nothing when the address already shows the page', () => {
    expect(subPageWriteMode('profile', 'profile', 'profile', false)).toBe('none')
  })

  it('adds an entry when the person chooses another page', () => {
    expect(subPageWriteMode('profile', 'profile', 'stripe-payment-configuration', false)).toBe('push')
  })

  it('replaces the entry on the screen\'s first write', () => {
    expect(subPageWriteMode(null, null, 'profile', true)).toBe('replace')
    expect(subPageWriteMode('profile', 'profile', 'users', true)).toBe('replace')
  })

  it('replaces the entry when filling in the default page or reading an old alias', () => {
    expect(subPageWriteMode(null, null, 'profile', false)).toBe('replace')
    expect(subPageWriteMode('no-such-page', null, 'profile', false)).toBe('replace')
    expect(subPageWriteMode('stripe-dev-tests', 'stripe-payment-configuration', 'stripe-payment-configuration', false)).toBe('replace')
  })
})

describe('sectionAddress', () => {
  it('names the section, keeps its own page and unrelated parameters, and drops other sections\' pages', () => {
    const url = sectionAddress(`${BASE}?section=contacts&applicationSettingsTab=teams&firmSettingsSection=users&contactId=ind_1`, 'firm-settings')
    expect(url.searchParams.get('section')).toBe('firm-settings')
    expect(url.searchParams.get('firmSettingsSection')).toBe('users')
    expect(url.searchParams.get('contactId')).toBe('ind_1')
    expect(url.searchParams.has('applicationSettingsTab')).toBe(false)
  })
})

describe('readShellAddress', () => {
  const navItems = buildNavItems([TOOL])

  it('reads an open contact', () => {
    expect(readShellAddress('?section=contact:090', navItems)).toEqual({ sectionId: 'contact:090', item: { parentId: 'contacts', itemId: '090' } })
  })

  it('reads an open billing client', () => {
    expect(readShellAddress('?section=billing:501', navItems).item).toEqual({ parentId: 'billing', itemId: '501' })
  })

  it('reads a built-in section and an outside tool', () => {
    expect(readShellAddress('?section=firm-settings&firmSettingsSection=profile', navItems)).toEqual({ sectionId: 'firm-settings', item: null })
    expect(readShellAddress(`?section=tool:${TOOL.clientId}`, navItems).sectionId).toBe(`tool:${TOOL.clientId}`)
  })

  it('gives nulls for a missing or unknown section', () => {
    expect(readShellAddress('', SHELL_NAV_ITEMS)).toEqual({ sectionId: null, item: null })
    expect(readShellAddress('?section=nowhere', SHELL_NAV_ITEMS)).toEqual({ sectionId: null, item: null })
    expect(readShellAddress('?section=tool:krt_RemovedTool', SHELL_NAV_ITEMS)).toEqual({ sectionId: null, item: null })
  })
})

describe('resolvePoppedScreen', () => {
  const c090: ShellOpenItem = { parentId: 'contacts', itemId: '090', label: '[090] First Person' }
  const c306: ShellOpenItem = { parentId: 'contacts', itemId: '306', label: '[306] Dan Krueger' }

  it('shows an item that is still open', () => {
    const address = readShellAddress('?section=contact:090', SHELL_NAV_ITEMS)
    expect(resolvePoppedScreen(address, [c306, c090], [c306, c090], 'dashboard')).toEqual({ kind: 'section', sectionId: 'contact:090', tidy: false })
  })

  it('reopens an item closed since, with its label from the recent items', () => {
    const address = readShellAddress('?section=contact:090', SHELL_NAV_ITEMS)
    expect(resolvePoppedScreen(address, [c306], [c306, c090], 'dashboard')).toEqual({ kind: 'reopen', item: c090 })
  })

  it('reopens an item it has no label for under its id', () => {
    const address = readShellAddress('?section=billing:501', SHELL_NAV_ITEMS)
    expect(resolvePoppedScreen(address, [], [], 'dashboard')).toEqual({ kind: 'reopen', item: { parentId: 'billing', itemId: '501', label: '501' } })
  })

  it('opens a section the entry names', () => {
    const address = readShellAddress('?section=leads', SHELL_NAV_ITEMS)
    expect(resolvePoppedScreen(address, [], [], 'dashboard')).toEqual({ kind: 'section', sectionId: 'leads', tidy: false })
  })

  it('falls back to the starting section, and asks for a rewrite, when the entry names nothing usable', () => {
    const address = readShellAddress('?section=nowhere', SHELL_NAV_ITEMS)
    expect(resolvePoppedScreen(address, [], [], 'contacts')).toEqual({ kind: 'section', sectionId: 'contacts', tidy: true })
  })
})

describe('writeShellHistory and noteShellHistoryEntry', () => {
  it('numbers the first entry 0, adds one per push and keeps the number on a replace', () => {
    const history = loadedPage(`${BASE}`)
    expect(writeShellHistory('replace', `${BASE}?section=dashboard`, history)).toBe(0)
    expect(history.entries).toHaveLength(1)
    expect(writeShellHistory('push', `${BASE}?section=contacts`, history)).toBe(1)
    expect(writeShellHistory('replace', `${BASE}?section=contacts&contactId=ind_1`, history)).toBe(1)
    expect(writeShellHistory('none', `${BASE}?section=leads`, history)).toBe(1)
    expect(history.entries.map((entry) => readHistoryIndex(entry.state))).toEqual([0, 1])
    expect(history.href).toBe(`${BASE}?section=contacts&contactId=ind_1`)
  })

  it('keeps the old number after a refresh', () => {
    const history = new FakeHistory(`${BASE}?section=leads`, { [SHELL_HISTORY_INDEX_KEY]: 4 })
    noteShellHistoryEntry(history.state)
    expect(writeShellHistory('replace', `${BASE}?section=leads`, history)).toBe(4)
    expect(writeShellHistory('push', `${BASE}?section=tasks`, history)).toBe(5)
  })

  it('carries on from the last number when other code replaced the entry state with null', () => {
    const history = loadedPage(`${BASE}`)
    writeShellHistory('replace', `${BASE}?section=contacts`, history)
    writeShellHistory('push', `${BASE}?section=contact:090`, history)
    history.replaceState(null, '', `${BASE}?section=contact:090`)
    expect(writeShellHistory('push', `${BASE}?section=contact:306`, history)).toBe(2)
  })

  it('tells how far Back moved, and null when the entry has no number', () => {
    const history = loadedPage(`${BASE}`)
    writeShellHistory('replace', `${BASE}?section=dashboard`, history)
    writeShellHistory('push', `${BASE}?section=contacts`, history)
    writeShellHistory('push', `${BASE}?section=leads`, history)
    expect(noteShellHistoryEntry(history.go(-2))).toEqual({ from: 2, to: 0 })
    expect(noteShellHistoryEntry(null)).toEqual({ from: 0, to: null })
  })
})

describe('Back and Forward through the frame', () => {
  it('goes back from contact 306 to contact 090, and forward again (the report of Nov 13, 2026)', () => {
    const history = loadedPage(`${BASE}?section=contact:090`)
    // First draw: the entry the page loaded in is replaced, not added to.
    writeShellHistory('replace', sectionAddress(history.href, 'contact:090'), history)
    syncSection(history, 'contact:306')
    expect(history.entries.map((entry) => new URL(entry.url).searchParams.get('section'))).toEqual(['contact:090', 'contact:306'])

    noteShellHistoryEntry(history.go(-1))
    expect(readShellAddress(history.search, SHELL_NAV_ITEMS).sectionId).toBe('contact:090')
    // The frame then shows contact 090; its address sync finds the address already right and adds nothing.
    syncSection(history, 'contact:090')
    expect(history.entries).toHaveLength(2)

    noteShellHistoryEntry(history.go(1))
    expect(readShellAddress(history.search, SHELL_NAV_ITEMS).sectionId).toBe('contact:306')
  })

  it('leaves the app from the first screen: only one entry belongs to the app', () => {
    const history = loadedPage(`${BASE}`)
    writeShellHistory('replace', sectionAddress(history.href, 'dashboard'), history)
    syncSection(history, 'dashboard')
    expect(history.entries).toHaveLength(1)
  })

  it('adds an entry for a page inside a section only when the person chooses it', () => {
    const history = loadedPage(`${BASE}`)
    writeShellHistory('replace', sectionAddress(history.href, 'dashboard'), history)
    syncSection(history, 'firm-settings')
    // The screen fills in its default page over the section's entry.
    const first = new URL(history.href)
    first.searchParams.set('firmSettingsSection', 'profile')
    writeShellHistory(subPageWriteMode(null, null, 'profile', true), first, history)
    // The person opens the Users tab.
    const next = new URL(history.href)
    next.searchParams.set('firmSettingsSection', 'users')
    writeShellHistory(subPageWriteMode('profile', 'profile', 'users', false), next, history)
    expect(history.entries.map((entry) => new URL(entry.url).search)).toEqual([
      '?section=dashboard',
      '?section=firm-settings&firmSettingsSection=profile',
      '?section=firm-settings&firmSettingsSection=users',
    ])
  })
})

describe('addressLeavesSection and addressLeavesSubPage', () => {
  const navItems = buildNavItems([TOOL])
  const toolSection = `tool:${TOOL.clientId}` as const
  const resolvePage = (raw: string | null): string | null => (raw === 'old-users' ? 'users' : raw && ['profile', 'users'].includes(raw) ? raw : null)

  it('an outside tool is left only when the address names another section', () => {
    expect(addressLeavesSection(`?section=${toolSection}`, navItems, toolSection)).toBe(false)
    expect(addressLeavesSection('?section=contacts', navItems, toolSection)).toBe(true)
    expect(addressLeavesSection('?section=nowhere', navItems, toolSection)).toBe(true)
  })

  it('a page is left by another page of the section, or by another section', () => {
    expect(addressLeavesSubPage('?section=firm-settings&firmSettingsSection=users', 'firm-settings', 'firmSettingsSection', resolvePage, 'profile', 'users')).toBe(false)
    expect(addressLeavesSubPage('?section=firm-settings&firmSettingsSection=old-users', 'firm-settings', 'firmSettingsSection', resolvePage, 'profile', 'users')).toBe(false)
    expect(addressLeavesSubPage('?section=firm-settings&firmSettingsSection=profile', 'firm-settings', 'firmSettingsSection', resolvePage, 'profile', 'users')).toBe(true)
    expect(addressLeavesSubPage('?section=firm-settings', 'firm-settings', 'firmSettingsSection', resolvePage, 'profile', 'users')).toBe(true)
    expect(addressLeavesSubPage('?section=firm-settings', 'firm-settings', 'firmSettingsSection', resolvePage, 'profile', 'profile')).toBe(false)
    expect(addressLeavesSubPage('?section=contacts', 'firm-settings', 'firmSettingsSection', resolvePage, 'profile', 'users')).toBe(true)
  })
})

describe('decideShellPopState (decision D18: Back with unsaved changes)', () => {
  /** Firm Settings: Profile (entry 0), then Users (entry 1), where the person has a draft. */
  function settingsHistory(): FakeHistory {
    const history = loadedPage(`${BASE}`)
    writeShellHistory('replace', `${BASE}?section=firm-settings&firmSettingsSection=profile`, history)
    writeShellHistory('push', `${BASE}?section=firm-settings&firmSettingsSection=users`, history)
    return history
  }

  /** A guard like the one `useSectionSubPage` registers for the Users page; `asked` collects the pending moves. */
  function usersGuard(dirty: () => boolean, asked: (() => void)[]): ShellLeaveGuard {
    return {
      blocks: (search) => dirty() && addressLeavesSubPage(search, 'firm-settings', 'firmSettingsSection', (raw) => raw, 'profile', 'users'),
      ask: (proceed) => asked.push(proceed),
    }
  }

  it('lets Back through when no page has unsaved changes', () => {
    const history = settingsHistory()
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard(usersGuard(() => false, asked))
    try {
      history.go(-1)
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'proceed', from: 1, to: 0 })
      expect(asked).toHaveLength(0)
    } finally {
      remove()
    }
  })

  it('puts the browser back on the page, asks once, and Cancel keeps the page and the entry numbers', () => {
    const history = settingsHistory()
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard(usersGuard(() => true, asked))
    try {
      history.go(-1)
      const event = history.popEvent()
      expect(decideShellPopState(event, history.href, history)).toEqual({ kind: 'blocked' })
      // A second listener of the same event gets the same answer, and the person is asked only once.
      expect(decideShellPopState(event, history.href, history)).toEqual({ kind: 'blocked' })
      expect(asked).toHaveLength(1)
      // The browser was sent back one entry, to the Users page.
      expect(history.goCalls).toEqual([-1, 1])
      expect(history.href).toBe(`${BASE}?section=firm-settings&firmSettingsSection=users`)
      // That move is the frame's own: skipped by every listener.
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'skip' })
      // Cancel does nothing more; a later push still numbers from the Users entry.
      expect(writeShellHistory('push', `${BASE}?section=contacts`, history)).toBe(2)
    } finally {
      remove()
    }
  })

  it('Continue goes to the entry Back asked for, without asking again', () => {
    const history = settingsHistory()
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard(usersGuard(() => true, asked))
    try {
      history.go(-1)
      decideShellPopState(history.popEvent(), history.href, history)
      decideShellPopState(history.popEvent(), history.href, history)
      asked[0]!()
      expect(history.goCalls).toEqual([-1, 1, -1])
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'proceed', from: 1, to: 0 })
      expect(asked).toHaveLength(1)
      expect(history.href).toBe(`${BASE}?section=firm-settings&firmSettingsSection=profile`)
    } finally {
      remove()
    }
  })

  it('also asks when Back leaves the area for another section', () => {
    const history = loadedPage(`${BASE}`)
    writeShellHistory('replace', `${BASE}?section=contacts`, history)
    writeShellHistory('push', `${BASE}?section=firm-settings&firmSettingsSection=users`, history)
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard(usersGuard(() => true, asked))
    try {
      history.go(-1)
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'blocked' })
      expect(asked).toHaveLength(1)
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'skip' })
      asked[0]!()
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'proceed', from: 1, to: 0 })
      expect(history.href).toBe(`${BASE}?section=contacts`)
    } finally {
      remove()
    }
  })

  it('asks on Forward too, and moves the browser back the other way', () => {
    const history = settingsHistory()
    // The person went back to Profile earlier and now has a draft there; Forward would open Users.
    history.go(-1)
    decideShellPopState(history.popEvent(), history.href, history)
    history.goCalls = []
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard({
      blocks: (search) => addressLeavesSubPage(search, 'firm-settings', 'firmSettingsSection', (raw) => raw, 'profile', 'profile'),
      ask: (proceed) => asked.push(proceed),
    })
    try {
      history.go(1)
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'blocked' })
      expect(history.goCalls).toEqual([1, -1])
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'skip' })
      expect(history.href).toBe(`${BASE}?section=firm-settings&firmSettingsSection=profile`)
    } finally {
      remove()
    }
  })

  it('adds the page again when the entry reached carries no number, and Continue goes back to it', () => {
    const history = settingsHistory()
    // Other code replaced the Profile entry's state with null.
    history.entries[0] = { state: null, url: `${BASE}?section=firm-settings&firmSettingsSection=profile` }
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard(usersGuard(() => true, asked))
    try {
      history.go(-1)
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'blocked' })
      expect(history.entries.map((entry) => new URL(entry.url).search)).toEqual([
        '?section=firm-settings&firmSettingsSection=profile',
        '?section=firm-settings&firmSettingsSection=users',
      ])
      expect(history.href).toBe(`${BASE}?section=firm-settings&firmSettingsSection=users`)
      asked[0]!()
      expect(decideShellPopState(history.popEvent(), history.href, history)).toEqual({ kind: 'proceed', from: 2, to: null })
      expect(history.href).toBe(`${BASE}?section=firm-settings&firmSettingsSection=profile`)
    } finally {
      remove()
    }
  })

  it('stops guarding once the guard is removed (the page closed)', () => {
    const history = settingsHistory()
    const asked: (() => void)[] = []
    addShellLeaveGuard(usersGuard(() => true, asked))()
    history.go(-1)
    expect(decideShellPopState(history.popEvent(), history.href, history).kind).toBe('proceed')
    expect(asked).toHaveLength(0)
  })
})
