// file: apps/web/lib/client-data-store/browserStore.test.ts
/**
 * Tests for the encrypted browser store (ported from the old repository, where it had no tests).
 * IndexedDB comes from `fake-indexeddb` (a test-only stand-in); encryption uses Node's real Web Crypto.
 * Only made-up records are used. Run: `pnpm --dir apps/web run test`.
 */
import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ClientClientElement } from './types'

// The store reads `window.indexedDB` and `window.crypto`; tests run in Node, so give it a window.
beforeAll(() => {
  ;(globalThis as { window?: unknown }).window = { indexedDB: globalThis.indexedDB, crypto: globalThis.crypto }
})

/** Loads the store after `window` exists (the module opens the database on first use). */
const store = () => import('./browserStore.client')

const client = (id: string, name: string, updatedAt = '2026-11-01T00:00:00.000Z'): ClientClientElement => ({
  id,
  updatedAt,
  kind: 'client',
  displayName: name,
  clientNumber: id.toUpperCase(),
  clientType: 'individual',
  clientStatus: 'active',
  individualIds: [],
  entityIds: [],
})

describe('browserStore', () => {
  it('returns null before a collection is written', async () => {
    const { readClientDataCollection } = await store()
    expect(await readClientDataCollection('user-empty', 'clients')).toBeNull()
  })

  it('writes and reads a collection, and the stored bytes are not plain text', async () => {
    const { readClientDataCollection, writeClientDataCollection } = await store()
    await writeClientDataCollection('user-a', { collectionId: 'clients', schemaVersion: 1, collectionVersion: 'v1', fetchedAt: '2026-11-09T10:00:00.000Z', elements: [client('c1', 'Test Alpha'), client('c2', 'Test Beta')] })
    const read = await readClientDataCollection<ClientClientElement>('user-a', 'clients')
    expect(read?.collectionVersion).toBe('v1')
    expect(read?.elements.map((e) => e.displayName).sort()).toEqual(['Test Alpha', 'Test Beta'])

    const raw = await new Promise<unknown[]>((resolve) => {
      const open = indexedDB.open('kr_homebase_client_data')
      open.onsuccess = () => {
        const request = open.result.transaction('elements').objectStore('elements').getAll()
        request.onsuccess = () => resolve(request.result)
      }
    })
    const text = JSON.stringify(raw.map((row) => new TextDecoder().decode((row as { ciphertext: ArrayBuffer }).ciphertext)))
    expect(text).not.toContain('Test Alpha')
  })

  it('keeps each user scope separate', async () => {
    const { readClientDataCollection, writeClientDataCollection } = await store()
    await writeClientDataCollection('user-b', { collectionId: 'clients', schemaVersion: 1, collectionVersion: 'v1', fetchedAt: 'x', elements: [client('c9', 'Only B')] })
    expect((await readClientDataCollection<ClientClientElement>('user-a', 'clients'))?.elements.some((e) => e.id === 'c9')).toBe(false)
  })

  it('applies a delta: changes, adds and deletes only the named elements', async () => {
    const { applyClientDataDelta, readClientDataCollection } = await store()
    await applyClientDataDelta('user-a', { collectionId: 'clients', collectionVersion: 'v2', upserts: [client('c2', 'Test Beta Renamed', '2026-11-02T00:00:00.000Z'), client('c3', 'Test Gamma')], deletedIds: ['c1'] }, '2026-11-09T11:00:00.000Z')
    const read = await readClientDataCollection<ClientClientElement>('user-a', 'clients')
    expect(read?.collectionVersion).toBe('v2')
    expect(read?.elements.map((e) => e.displayName).sort()).toEqual(['Test Beta Renamed', 'Test Gamma'])
  })

  it('upserts and deletes one element', async () => {
    const { deleteClientDataElement, readClientDataCollection, upsertClientDataElement } = await store()
    await upsertClientDataElement('user-a', 'clients', client('c4', 'Test Delta'), 'v3')
    await deleteClientDataElement('user-a', 'clients', 'c3', 'v4')
    const read = await readClientDataCollection<ClientClientElement>('user-a', 'clients')
    expect(read?.elements.map((e) => e.id).sort()).toEqual(['c2', 'c4'])
  })

  it('clears one scope and its key', async () => {
    const { clearClientDataScope, readClientDataCollection } = await store()
    await clearClientDataScope('user-a')
    expect(await readClientDataCollection('user-a', 'clients')).toBeNull()
    expect(await readClientDataCollection('user-b', 'clients')).not.toBeNull()
  })
})
