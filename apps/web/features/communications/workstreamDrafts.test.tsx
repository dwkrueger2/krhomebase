// file: apps/web/features/communications/workstreamDrafts.test.tsx
/**
 * WorkStream drafts (FB-0026, web patch 588): the place a draft belongs to, when it is worth keeping, the encrypted
 * round trip through the browser store, and the composer's draft line. IndexedDB comes from `fake-indexeddb`; only
 * made-up text is used.
 *
 * Run: pnpm --dir apps/web exec vitest run features/communications/workstreamDrafts.test.tsx
 */
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import CommunicationComposer from './components/CommunicationComposer.client'
import type { WorkstreamDraft } from './workstreamDrafts.client'

// The store reads `window.indexedDB` and `window.crypto`; tests run in Node, so give it a window.
beforeAll(() => {
  ;(globalThis as { window?: unknown }).window = { indexedDB: globalThis.indexedDB, crypto: globalThis.crypto }
})

/** Loads the drafts module after `window` exists (the store opens the database on first use). */
const drafts = () => import('./workstreamDrafts.client')

const DRAFT: WorkstreamDraft = {
  body: 'Called Ann about the deed',
  html: 'Called Ann about the <b>deed</b>',
  activityTypes: ['PhoneCalls', 'Tasks'],
  clientState: 'Client',
  owner: { clientId: 'cl-1', clientNumber: '077', displayName: 'Ann Example' },
  matter: { id: 'm-1', number: '077.1', label: 'Deed' },
  assigneeUserIds: ['user-a'],
}

describe('WorkStream drafts (FB-0026)', () => {
  it('keeps one draft per place: the firm feed, a client (and matter), a lead', async () => {
    const { draftPlaceId } = await drafts()
    expect(draftPlaceId(null)).toBe('workstream:feed')
    expect(draftPlaceId({ clientId: 'cl-1' })).toBe('workstream:client:cl-1')
    expect(draftPlaceId({ clientId: 'cl-1', matterId: 'm-1' })).toBe('workstream:client:cl-1:m-1')
    expect(draftPlaceId({ leadId: 'ld-1' })).toBe('workstream:lead:ld-1')
  })

  it('keeps a draft with words or a link, drops one older than 30 days, and names the time', async () => {
    const { draftExpired, draftIsEmpty, draftTimeLabel } = await drafts()
    expect(draftIsEmpty({ body: '  \n', html: '<br>' })).toBe(true)
    expect(draftIsEmpty({ body: '', html: '<a href="https://example.com">x</a>' })).toBe(false)
    expect(draftIsEmpty({ body: 'Hi', html: 'Hi' })).toBe(false)
    const now = Date.parse('2026-11-23T20:00:00.000Z')
    expect(draftExpired('2026-11-20T20:00:00.000Z', now)).toBe(false)
    expect(draftExpired('2026-10-20T20:00:00.000Z', now)).toBe(true)
    const savedAt = new Date(2026, 10, 23, 20, 42).toISOString()
    expect(draftTimeLabel(savedAt, new Date(2026, 10, 23, 21, 0))).toBe('8:42pm')
    expect(draftTimeLabel(savedAt, new Date(2026, 10, 25, 9, 0))).toBe('Nov 23, 8:42pm')
  })

  it('saves, reads back and removes a draft per person and place; an emptied draft is removed', async () => {
    const { clearWorkstreamDraft, readWorkstreamDraft, saveWorkstreamDraft } = await drafts()
    const savedAt = await saveWorkstreamDraft('user-a', 'workstream:feed', DRAFT)
    expect(savedAt).toBeTruthy()
    const read = await readWorkstreamDraft('user-a', 'workstream:feed')
    expect(read?.draft).toEqual(DRAFT)
    expect(read?.savedAt).toBe(savedAt)
    // Another person, or another place, has no draft.
    expect(await readWorkstreamDraft('user-b', 'workstream:feed')).toBeNull()
    expect(await readWorkstreamDraft('user-a', 'workstream:client:cl-1')).toBeNull()
    // Emptied in the composer: removed.
    expect(await saveWorkstreamDraft('user-a', 'workstream:feed', { ...DRAFT, body: '', html: '' })).toBeNull()
    expect(await readWorkstreamDraft('user-a', 'workstream:feed')).toBeNull()
    await saveWorkstreamDraft('user-a', 'workstream:lead:ld-1', DRAFT)
    await clearWorkstreamDraft('user-a', 'workstream:lead:ld-1')
    expect(await readWorkstreamDraft('user-a', 'workstream:lead:ld-1')).toBeNull()
  })

  it('shows the draft line with Discard above the editor, and nothing without a draft', () => {
    const props = {
      activityTypes: ['PhoneCalls'] as const,
      clientState: 'Internal' as const,
      contacts: [],
      currentUser: { id: 'user-a', name: 'Ann Example', handle: 'ann', role: 'Staff', initials: 'AE', avatarTone: 'gold' as const },
      onActivityTypesChange: () => {},
      onClientStateChange: () => {},
      onSubmit: async () => {},
    }
    const withDraft = renderToStaticMarkup(<CommunicationComposer {...props} draftNotice={{ label: 'Draft saved 8:43pm · kept on this computer until sent', onDiscard: () => {} }} />)
    expect(withDraft).toContain('data-kr-element="communications-draft-notice"')
    expect(withDraft).toContain('Draft saved 8:43pm')
    expect(withDraft).toContain('data-kr-action="discard-workstream-draft"')
    expect(renderToStaticMarkup(<CommunicationComposer {...props} />)).not.toContain('communications-draft-notice')
  })
})
