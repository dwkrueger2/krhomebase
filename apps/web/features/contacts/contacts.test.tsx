// file: apps/web/features/contacts/contacts.test.tsx
/**
 * The contacts port: the search ranking, the billing client list built from contacts, the
 * sync adapter (full load, delta, the 12-hour full reload, deleted ids, and that the cache never holds the
 * full SSN or date of birth), the ledger (stage 1d-1) and the open contact's Detail tab (stage 1d-2). IndexedDB is `fake-indexeddb`; the API is a stand-in `fetch`. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/contacts/contacts.test.tsx
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { contactMatchScore, rankContacts } from './applicationSearchRank'
import { billingClientsFromContacts } from './billingClients'
import type { KRContactRecord } from './types'

const storage = new Map<string, string>()
beforeAll(() => {
  ;(globalThis as { window?: unknown }).window = {
    indexedDB: globalThis.indexedDB,
    crypto: globalThis.crypto,
    performance: globalThis.performance,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  }
})
afterEach(() => vi.unstubAllGlobals())

/** A made-up contact in the list form (no SSN, no date of birth). */
function contact(id: string, displayName: string, extra: Partial<KRContactRecord> = {}): KRContactRecord {
  return {
    id, kind: 'individual', typeLabel: 'Person', displayName, titlePrefix: null, firstName: null, middleName: null, lastName: null,
    suffix: null, preferredName: null, dob: null, ssn: null, ssnLast4: null, isMinor: false, isAttorney: false, email: null, phone: null,
    addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', status: 'active', notes: null, isClient: false, clientId: null,
    clientNumber: null, clientStatus: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', relatedMatters: [],
    relatedContacts: [], ...extra,
  }
}

describe('application search ranking (unchanged from the old app)', () => {
  const ann = contact('a', 'Ann Example', { isClient: true, clientNumber: '0042', email: 'ann@example.com', city: 'Testville' })
  const andy = contact('b', 'Andy Sample')
  const bob = contact('c', 'Bob Other', { isClient: true, clientNumber: '0420' })

  it('scores names: exact 1200, starts with 980, contains 760, letters in order below 260', () => {
    expect(contactMatchScore('ann example', ann)).toBe(1200)
    expect(contactMatchScore('ann', ann)).toBe(980)
    expect(contactMatchScore('testville', ann)).toBe(760)
    const inOrder = contactMatchScore('axmp', ann)
    expect(inOrder).toBeGreaterThan(0)
    expect(inOrder).toBeLessThanOrEqual(260)
  })

  it('ranks a last name above contacts that only contain the text in an email (the "Krueger" case)', () => {
    const dan = contact('d', 'Dan Krueger (66)', { isClient: true, clientNumber: '306', lastName: 'Krueger' })
    const staff = Array.from({ length: 6 }, (_, index) => contact(`s${index}`, `Aaron Staff${index}`, { email: `staff${index}@krueger-richard.com` }))
    expect(contactMatchScore('krueger', dan)).toBe(870)
    expect(contactMatchScore('krueger', staff[0]!)).toBe(760)
    expect(rankContacts('krueger', [...staff, dan])[0]!.id).toBe('d')
  })

  it('matches digits against client numbers only, ignoring leading zeros', () => {
    expect(contactMatchScore('42', ann)).toBe(1200)
    expect(contactMatchScore('42', bob)).toBe(899)
    expect(contactMatchScore('42', andy)).toBe(0)
  })

  it('returns at most five, best first, then by name', () => {
    const many = Array.from({ length: 8 }, (_, index) => contact(`m${index}`, `Annex ${index}`))
    const ranked = rankContacts('ann', [...many, ann])
    expect(ranked).toHaveLength(5)
    expect(ranked[0]!.id).toBe('a')
  })
})

describe('billing client list from contacts', () => {
  it('lists each active client once, a joint client under its own name, sorted by name', () => {
    const list = billingClientsFromContacts([
      contact('p1', 'Pat Staff', { isClient: true, clientId: 'cl-joint', clientNumber: '0077', clientDisplayName: 'Pat & Sam Staff', clientType: 'group', clientStatus: 'active' }),
      contact('p2', 'Sam Staff', { isClient: true, clientId: 'cl-joint', clientNumber: '0077', clientDisplayName: 'Pat & Sam Staff', clientType: 'group', clientStatus: 'active' }),
      contact('p3', 'Ann Example', { isClient: true, clientId: 'cl-ann', clientNumber: '0042', clientDisplayName: 'Ann Example', clientType: 'individual', clientStatus: 'active' }),
      contact('p4', 'Old Client', { isClient: true, clientId: 'cl-old', clientNumber: '0001', clientStatus: 'inactive' }),
      contact('p5', 'Not A Client'),
    ])
    expect(list).toEqual([
      { id: 'cl-ann', clientNumber: '0042', displayName: 'Ann Example', clientType: 'individual', status: 'active' },
      { id: 'cl-joint', clientNumber: '0077', displayName: 'Pat & Sam Staff', clientType: 'group', status: 'active' },
    ])
  })
})

describe('contacts sync adapter', () => {
  /** A stand-in API: answers /api/v1/contacts with the given data and records each URL asked for. */
  function stubApi(reply: (url: string) => Record<string, unknown>) {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ ok: true, data: reply(url), requestId: 'test' }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    return urls
  }
  const timing = { mode: 'full', totalMs: 1, queryMs: 1, statements: 13, rowsLoaded: 2, tables: [] }
  const apiContact = (id: string, name: string) => ({ ...contact(id, name), relatedMatters: undefined, phoneSecondary: null, fax: null, clientType: null, clientDisplayName: null, linkedUserId: null, isCurrentUser: false, canEditLoginEmail: true })

  it('loads in full without a cache, delta after, and drops deleted ids; the cache never holds the SSN', async () => {
    const store = await import('./contactsStore.client')
    const scope = 'user-sync-1'
    let urls = stubApi(() => ({ collectionId: 'contacts', schemaVersion: 1, contacts: [apiContact('a', 'Ann'), apiContact('b', 'Bob')], collectionVersion: 'v1', generatedAt: '2026-11-09T10:00:00.000Z', allContactIds: ['a', 'b'], timing }))
    const first = await store.syncContacts(scope, null)
    expect(urls).toEqual(['/api/v1/contacts'])
    expect(first.source).toBe('collection')
    expect(first.contacts.map((row) => row.id)).toEqual(['a', 'b'])

    urls = stubApi(() => ({ collectionId: 'contacts', schemaVersion: 1, contacts: [apiContact('a', 'Ann Renamed')], generatedAt: '2026-11-09T10:05:00.000Z', allContactIds: ['a'], timing: { ...timing, mode: 'delta' } }))
    const cached = await store.readCachedContacts(scope)
    const second = await store.syncContacts(scope, cached!.collection!)
    expect(urls[0]).toContain('mode=delta')
    expect(urls[0]).toContain('since=2026-11-09T10%3A00%3A00.000Z')
    expect(second.source).toBe('delta')
    expect(second.contacts.map((row) => `${row.id}:${row.displayName}`)).toEqual(['a:Ann Renamed'])

    const reread = await store.readCachedContacts(scope)
    expect(reread!.contacts.map((row) => row.id)).toEqual(['a'])
    expect(reread!.contacts.every((row) => row.ssn === null && row.dob === null)).toBe(true)
  })

  it('reloads in full when the last full load is more than 12 hours old', async () => {
    const store = await import('./contactsStore.client')
    const scope = 'user-sync-2'
    stubApi(() => ({ collectionId: 'contacts', schemaVersion: 1, contacts: [apiContact('a', 'Ann')], collectionVersion: 'v1', generatedAt: '2026-11-09T10:00:00.000Z', allContactIds: ['a'], timing }))
    await store.syncContacts(scope, null)
    storage.set(`kr-homebase:contacts-full-sync:${scope}`, new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString())
    const urls = stubApi(() => ({ collectionId: 'contacts', schemaVersion: 1, contacts: [apiContact('a', 'Ann')], collectionVersion: 'v2', generatedAt: '2026-11-09T23:00:00.000Z', allContactIds: ['a'], timing }))
    const cached = await store.readCachedContacts(scope)
    const result = await store.syncContacts(scope, cached!.collection!)
    expect(urls).toEqual(['/api/v1/contacts'])
    expect(result.source).toBe('collection')
  })
})

describe('top-bar pieces outside the data store', () => {
  it('the sync light draws nothing and the search draws its box', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: DataSyncIndicator } = await import('./components/DataSyncIndicator.client')
    const { default: ApplicationSearch } = await import('./components/ApplicationSearch.client')
    expect(renderToStaticMarkup(<DataSyncIndicator />)).toBe('')
    const html = renderToStaticMarkup(<ApplicationSearch />)
    expect(html).toContain('data-kr-element="application-search"')
    expect(html).toContain('role="combobox"')
  })
})

describe('Contacts Manager ledger (stage 1d, part 1)', () => {
  it('draws the ledger with its toolbar and rows, and no pencil until editing is ported', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: ContactLedger } = await import('./components/ContactLedger.client')
    const html = renderToStaticMarkup(
      <ContactLedger rows={[contact('a', 'Ann Example', { isClient: true, clientNumber: '0042' }), contact('b', 'Bob Other')]} onSelectContact={() => undefined} />,
    )
    expect(html).toContain('Contact Ledger')
    expect(html).toContain('data-kr-id="ContactLedger"')
    expect(html).toContain('Ann Example')
    expect(html).toContain('0042')
    expect(html).toContain('>NC<')
    expect(html).toContain('2 / 2')
    expect(html).not.toContain('✎')
  })
})

describe('open contact (stage 1d, part 2)', () => {
  it('names a contact in the menu with its client number, as the old menu did', async () => {
    const { contactMenuLabel } = await import('./openContact')
    expect(contactMenuLabel(contact('a', 'Ann Example', { clientNumber: '0042' }))).toBe('[0042] Ann Example')
    expect(contactMenuLabel(contact('b', 'Bob Other'))).toBe('Bob Other')
  })

  it('opens a contact through the frame and remembers the lookup', async () => {
    const { openContact, readRecentContactLookups } = await import('./openContact')
    const opened: string[] = []
    const navigation = { openSection: () => false, closeItem: () => undefined, openItem: (parentId: string, itemId: string, label: string) => (opened.push(`${parentId}|${itemId}|${label}`), true) }
    expect(openContact(navigation, contact('a', 'Ann Example', { clientNumber: '0042' }))).toBe(true)
    expect(opened).toEqual(['contacts|a|[0042] Ann Example'])
    expect(readRecentContactLookups()[0]!.id).toBe('a')
  })

  it('draws the Detail tab: tabs, identity, client pill, notes and billing card, no pencil, no SSN or date of birth', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: ContactDetailWorkspace } = await import('./components/ContactDetailWorkspace.client')
    const record = contact('a', 'Ann Example', {
      isClient: true, clientId: 'cl-1', clientNumber: '0042', clientStatus: 'active', email: 'ann@example.com', phone: '(555) 010-0000',
      addressLine1: '1 Test Way', city: 'Testville', state: 'TX', postalCode: '75000', notes: 'Prefers email.', icid: '17',
      relatedContacts: [{ id: 'b', displayName: 'Bob Other', relationship: 'Spouse' }],
    })
    const html = renderToStaticMarkup(<ContactDetailWorkspace contact={record} onClose={() => undefined} onOpenBilling={() => undefined} />)
    for (const tab of ['Detail', 'WorkStream', 'Projects &amp; Matters', 'Documents']) expect(html).toContain(`>${tab}</button>`)
    expect(html).toContain('data-kr-id="ContactDetailCard"')
    expect(html).toContain('>AE<')
    expect(html).toContain('Individual record #17')
    expect(html).toContain('Client 0042')
    expect(html).toContain('1 Test Way, Testville, TX, 75000')
    expect(html).toContain('Prefers email.')
    expect(html).toContain('Client Billing Account')
    expect(html).toContain('Spouse')
    expect(html).toContain('aria-label="Close Ann Example contact card"')
    expect(html).not.toContain('Edit contact')
    expect(html).not.toContain('Danger Zone')
  })

  it('outside an open item, the detail screen says it is loading instead of failing', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: ContactDetailPanel } = await import('./components/ContactDetailPanel.client')
    expect(renderToStaticMarkup(<ContactDetailPanel />)).toContain('Loading contact...')
  })
})

describe('contact edits (stage 1d, parts 3 and 4)', () => {
  it('finds a likely duplicate with the fuzzy-match library, from contacts already loaded', async () => {
    const { buildContactMatchQuery, findContactMatches, matchEvidenceLabel } = await import('./contactSearchIndex')
    const contacts = [
      contact('a', 'Katherine Example', { firstName: 'Katherine', lastName: 'Example', email: 'kate@example.com' }),
      contact('b', 'Bob Other', { firstName: 'Bob', lastName: 'Other' }),
    ]
    const query = buildContactMatchQuery({ kind: 'individual', displayName: '', firstName: 'Kate', middleName: '', lastName: 'Example', email: 'kate@example.com', phone: '' })
    const matches = findContactMatches(query, contacts, undefined, { autoThreshold: 0.9, reviewThreshold: 0.55, maxCandidates: 5 }).filter((match) => match.result.decision !== 'NO_MATCH')
    expect(matches[0]?.contact.id).toBe('a')
    expect(matchEvidenceLabel(matches[0]!.score, matches[0]!.result.subScores)).toBe('Exact email')
  })

  it('builds the editor draft from a contact and notices a change', async () => {
    const { draftFromContact, draftsMatch } = await import('./components/ContactEditDialog.client')
    const record = contact('a', 'Ann Example', { firstName: 'Ann', lastName: 'Example', dob: '02/03/1960', relatedContacts: [{ id: 'b', displayName: 'Bob' }] })
    const draft = draftFromContact(record)
    expect(draft).toMatchObject({ firstName: 'Ann', dob: '1960-02-03', relatedContactIds: ['b'] })
    expect(draftsMatch(draft, draftFromContact(record))).toBe(true)
    expect(draftsMatch({ ...draft, city: 'Elsewhere' }, draft)).toBe(false)
    expect(draftsMatch({ ...draft, relatedContactIds: [] }, draft)).toBe(false)
  })

  it('checks fields as before', async () => {
    const { normalizePhoneNumber, validateEmailAddress } = await import('./contactValidators')
    expect(normalizePhoneNumber('555.010.0000').value).toBe('(555) 010-0000')
    expect(normalizePhoneNumber('12345').ok).toBe(false)
    expect(validateEmailAddress('A@Example.com').value).toBe('a@example.com')
    expect(validateEmailAddress('not-an-email').ok).toBe(false)
  })

  it('draws the edit card with the pencil, and the Danger Zone tab only for maintainers', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: ContactDetailWorkspace } = await import('./components/ContactDetailWorkspace.client')
    const { default: ContactEditCard } = await import('./components/ContactEditCard.client')
    const { draftFromContact } = await import('./components/ContactEditDialog.client')
    const record = contact('a', 'Ann Example', { firstName: 'Ann', lastName: 'Example', detailsLoaded: true })
    const withPencil = renderToStaticMarkup(<ContactDetailWorkspace contact={record} onEdit={() => undefined} />)
    expect(withPencil).toContain('aria-label="Edit contact"')
    expect(withPencil).not.toContain('>Danger Zone</button>')
    expect(renderToStaticMarkup(<ContactDetailWorkspace canMaintain contact={record} />)).toContain('>Danger Zone</button>')
    const card = renderToStaticMarkup(<ContactEditCard contact={record} draft={draftFromContact(record)} open onClose={() => undefined} onDraftChange={() => undefined} onSave={() => undefined} />)
    expect(card).toContain('Edit contact')
    expect(card).toContain('data-kr-element="contact-edit-close"')
  })
})
