// file: apps/web/features/communications/workstreamTags.test.tsx
/**
 * WorkStream tags (FB-0027, web patch 590): finding the tag being typed, the records each kind lists, the chip's saved
 * attributes surviving both note cleanups, a chip in a drawn note opening its record, and the tag list's words. Only
 * made-up names are used.
 *
 * Run: pnpm --dir apps/web exec vitest run features/communications/workstreamTags.test.tsx
 */
import { DEFAULT_WORKSTREAM_TAG_PREFIXES } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { onKRCodeOpen, type KRCodeTarget } from '@/components/ui/codeLinks'
import type { KRContactRecord } from '@/features/contacts/types'
import { sanitizeWorkstreamNoteHtml } from './communicationTypes'
import CommunicationComposer from './components/CommunicationComposer.client'
import WorkstreamTagList from './components/WorkstreamTagList.client'
import { findWorkstreamTagTrigger, followWorkstreamTag, workstreamComposerPrompt, workstreamTagCandidates, workstreamTagChipAttributes, workstreamTagTarget } from './workstreamTags'

const contact = (id: string, displayName: string, extra: Partial<KRContactRecord> = {}): KRContactRecord => ({
  id, kind: 'individual', typeLabel: 'Individual', displayName, titlePrefix: null, firstName: null, middleName: null, lastName: null, suffix: null,
  preferredName: null, dob: null, ssn: null, ssnLast4: null, isMinor: false, isAttorney: false, email: null, phone: null, addressLine1: '',
  addressLine2: '', city: '', state: '', postalCode: '', status: 'active', notes: null, isClient: false, clientId: null, clientNumber: null,
  clientStatus: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: null, relatedMatters: [], relatedContacts: [], ...extra,
})

const CONTACTS = [
  contact('c-ann', 'Ann Example', { isClient: true, clientId: 'cl-077', clientNumber: '077', relatedMatters: [{ id: 'm-1', matterNumber: '077.1', title: 'Deed', role: 'Primary client', status: 'Open' }] }),
  contact('c-zed', 'Zed Other', { isClient: true, clientId: 'cl-081', clientNumber: '081', relatedMatters: [{ id: 'm-9', matterNumber: '081.3', title: 'Lease', role: 'Primary client', status: 'Open' }] }),
  contact('c-bob', 'Bob Example', { isClient: true, clientId: 'cl-077', clientNumber: '077' }),
  contact('c-acme', 'Acme Widgets LLC', { kind: 'entity', ecid: 'E0012' }),
  contact('c-cal', 'Cal Sample', { icid: 'I0040' }),
  contact('c-dee', 'Dee Lead', { icid: 'I0041' }),
]
const LEADS = [{ id: 'lead-1', lcid: 'L007', individualId: 'c-dee', displayName: 'Dee Lead', email: null, phone: null }]
const MATTERS = [{ id: 'm-1', number: '077.1', label: 'Deed' }, { id: 'm-2', number: '077.2', label: 'Estate plan' }]
const SOURCES = { contacts: CONTACTS, matters: MATTERS, leads: LEADS, clientId: 'cl-077' }

describe('WorkStream tags (FB-0027)', () => {
  it('finds a doubled prefix at the start of a word only, and gives up after a line break', () => {
    const prefixes = DEFAULT_WORKSTREAM_TAG_PREFIXES
    expect(findWorkstreamTagTrigger('Called @@ann', prefixes)).toEqual({ kind: 'client', prefix: '@@', query: 'ann', start: 7 })
    expect(findWorkstreamTagTrigger('$$', prefixes)).toEqual({ kind: 'entity', prefix: '$$', query: '', start: 0 })
    expect(findWorkstreamTagTrigger('Met !!dee le', prefixes)?.kind).toBe('person')
    // Matters by number only (web patch 591): ## then digits and dots; a letter makes it ordinary text.
    expect(findWorkstreamTagTrigger('For ##077.1', prefixes)?.query).toBe('077.1')
    expect(findWorkstreamTagTrigger('For ##', prefixes)?.kind).toBe('matter')
    expect(findWorkstreamTagTrigger('For ##deed', prefixes)).toBeNull()
    // A single symbol, a prefix inside a word, a space after the prefix: ordinary text.
    expect(findWorkstreamTagTrigger('Call @ 5pm', prefixes)).toBeNull()
    expect(findWorkstreamTagTrigger('mail@@example', prefixes)).toBeNull()
    expect(findWorkstreamTagTrigger('Called @@ ann', prefixes)).toBeNull()
    // Own prefixes: the longer one wins at one place.
    expect(findWorkstreamTagTrigger('x @@ann', { client: '@', entity: '#', person: '!', matter: '$' })).toEqual({ kind: 'client', prefix: '@', query: '@ann', start: 2 })
  })

  it('lists one line per client account, businesses, leads and non-clients, and the chosen client\'s matters', () => {
    const clients = workstreamTagCandidates({ kind: 'client', query: 'ann' }, SOURCES)
    expect(clients.map((candidate) => candidate.label)).toEqual(['077 Ann Example'])
    expect(clients[0]!.target).toEqual({ kind: 'client', code: '077' })
    expect(workstreamTagCandidates({ kind: 'client', query: '' }, SOURCES)).toHaveLength(2)
    expect(workstreamTagCandidates({ kind: 'entity', query: 'acme' }, SOURCES)[0]!.target).toEqual({ kind: 'contact', code: 'E0012' })
    const people = workstreamTagCandidates({ kind: 'person', query: '' }, SOURCES)
    expect(people.map((candidate) => candidate.label).sort()).toEqual(['Cal Sample', 'L007 Dee Lead'])
    expect(people.find((candidate) => candidate.meta === 'Lead')!.target).toEqual({ kind: 'lead', code: 'L007' })
    // Every client's matters, by number; the chosen client's first; the chip is the number alone.
    const all = workstreamTagCandidates({ kind: 'matter', query: '' }, SOURCES)
    expect(all.map((candidate) => candidate.label)).toEqual(['077.1', '077.2', '081.3'])
    const other = workstreamTagCandidates({ kind: 'matter', query: '081' }, { ...SOURCES, matters: [], clientId: null })
    expect(other.map((candidate) => [candidate.label, candidate.meta, candidate.contact?.clientId])).toEqual([['081.3', 'Lease · Zed Other', 'cl-081']])
    expect(other[0]!.target).toEqual({ kind: 'matter', code: 'm-9', clientId: 'cl-081' })
    expect(workstreamTagCandidates({ kind: 'matter', query: '077.2' }, SOURCES)[0]!.target).toEqual({ kind: 'matter', code: 'm-2', clientId: 'cl-077' })
  })

  it('keeps the chip through both note cleanups and follows it to its record', () => {
    const [matter] = workstreamTagCandidates({ kind: 'matter', query: '077.1' }, SOURCES)
    const attributes = Object.entries(workstreamTagChipAttributes(matter!)).map(([name, value]) => `${name}="${value}"`).join(' ')
    const html = `Filed the <span ${attributes} contenteditable="false">077.1</span> today<script>bad()</script>`
    const cleaned = sanitizeWorkstreamNoteHtml(html)
    expect(cleaned).toContain('data-ws-tag="matter" data-ws-code="m-1" data-ws-client="cl-077" role="link" tabindex="0"')
    expect(cleaned).not.toContain('script')

    // A chip as the browser holds it, without a DOM: `closest` and `getAttribute` are all the lookup reads.
    const values: Record<string, string> = { 'data-ws-tag': 'matter', 'data-ws-code': 'm-1', 'data-ws-client': 'cl-077' }
    const chip = { closest: () => chip, getAttribute: (name: string) => values[name] ?? null } as unknown as Element
    expect(workstreamTagTarget(chip)).toEqual({ kind: 'matter', code: 'm-1', clientId: 'cl-077' })
    const opened: KRCodeTarget[] = []
    const stop = onKRCodeOpen((target) => opened.push(target))
    let stopped = false
    expect(followWorkstreamTag({ target: chip, type: 'click', preventDefault: () => {}, stopPropagation: () => { stopped = true } })).toBe(true)
    expect(followWorkstreamTag({ target: chip, type: 'keydown', key: 'a', preventDefault: () => {}, stopPropagation: () => {} })).toBe(false)
    stop()
    expect(opened).toEqual([{ kind: 'matter', code: 'm-1', clientId: 'cl-077' }])
    expect(stopped).toBe(true)
  })

  it('draws the tag list with its heading, or says what to do when nothing matches', () => {
    const candidates = workstreamTagCandidates({ kind: 'client', query: 'ann' }, SOURCES)
    const list = renderToStaticMarkup(<WorkstreamTagList candidates={candidates} highlighted={0} kind="client" onHighlight={() => {}} onPick={() => {}} prefix="@@" query="ann" />)
    expect(list).toContain('data-kr-element="workstream-tag-list"')
    expect(list).toContain('@@ Clients')
    expect(list).toContain('077 Ann Example')
    expect(list).toContain('aria-selected="true"')
    const empty = renderToStaticMarkup(<WorkstreamTagList candidates={[]} highlighted={0} kind="matter" onHighlight={() => {}} onPick={() => {}} prefix="##" query="" />)
    expect(empty).toContain('Type a matter number, for example 077.1.')
  })

  it('names the tags in the composer prompt and draws Auto AI greyed above Send (web patch 591)', () => {
    expect(workstreamComposerPrompt(DEFAULT_WORKSTREAM_TAG_PREFIXES)).toBe('Type a note. Tags: @@ client, ## matter no., !! lead, $$ business. Commands: /pc /email /n /t /sub: /help')
    const html = renderToStaticMarkup(
      <CommunicationComposer
        activityTypes={['PhoneCalls']}
        clientState="Internal"
        contacts={[]}
        currentUser={{ id: 'user-a', name: 'Ann Example', handle: 'ann', role: 'Staff', initials: 'AE', avatarTone: 'gold' }}
        onActivityTypesChange={() => {}}
        onClientStateChange={() => {}}
        onSubmit={async () => {}}
      />,
    )
    expect(html).toContain('data-placeholder="Type a note. Tags: @@ client, ## matter no., !! lead, $$ business.')
    expect(html).toMatch(/aria-checked="false"[^>]*data-kr-element="workstream-auto-ai-toggle" disabled=""/)
    expect(html.indexOf('workstream-auto-ai-toggle')).toBeLessThan(html.indexOf('communications-composer-send-button'))
  })
})
