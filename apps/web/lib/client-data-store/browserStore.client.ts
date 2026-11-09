'use client'
// file: apps/web/lib/client-data-store/browserStore.client.ts
// Ported from the old repository (apps/kr-homebase/src/hb-lib/hb-client-data-store/browserStore.client.ts).
// One type-only change for TypeScript 6, marked at `additionalData`.

/** IndexedDB and Web Crypto persistence for the browser-owned client-data store. */

import type { ClientDataCollection, ClientDataCollectionId, ClientDataDelta, ClientDataElement } from './types'

const DATABASE_NAME = 'kr_homebase_client_data'
const DATABASE_VERSION = 1
const KEY_STORE_NAME = 'encryption_keys'
const COLLECTION_STORE_NAME = 'collections'
const ELEMENT_STORE_NAME = 'elements'
const AES_GCM_IV_BYTES = 12

interface StoredEncryptionKey {
  key: string
  scope: string
  keyVersion: number
  cryptoKey: CryptoKey
  createdAt: string
}

interface StoredCollectionMetadata {
  key: string
  scope: string
  collectionId: ClientDataCollectionId
  schemaVersion: number
  collectionVersion: string
  fetchedAt: string
  elementIds: string[]
}

interface StoredEncryptedElement {
  key: string
  scope: string
  collectionId: ClientDataCollectionId
  id: string
  updatedAt: string | null
  keyVersion: number
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
}

let databasePromise: Promise<IDBDatabase> | null = null

/** Error raised when browser persistence or cryptography is unavailable. */
export class ClientDataStoreError extends Error {
  /** Stable error classification used by UI fallback and diagnostics. */
  readonly code: string

  /**
   * Creates a browser client-data-store error.
   * @param code - Stable error classification.
   * @param message - Human-readable diagnostic message.
   */
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ClientDataStoreError'
    this.code = code
  }
}

/** Verifies that the current execution context can use browser storage APIs. */
function assertBrowserStorage(): void {
  if (typeof window === 'undefined' || !window.indexedDB) throw new ClientDataStoreError('INDEXED_DB_UNAVAILABLE', 'IndexedDB is unavailable in this browser.')
  if (!window.crypto?.subtle) throw new ClientDataStoreError('WEB_CRYPTO_UNAVAILABLE', 'Web Crypto is unavailable in this browser.')
}

/** Opens the versioned IndexedDB database and creates its stores on first use. */
function openDatabase(): Promise<IDBDatabase> {
  assertBrowserStorage()
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(KEY_STORE_NAME)) database.createObjectStore(KEY_STORE_NAME, { keyPath: 'key' })
      if (!database.objectStoreNames.contains(COLLECTION_STORE_NAME)) {
        const store = database.createObjectStore(COLLECTION_STORE_NAME, { keyPath: 'key' })
        store.createIndex('by_scope', 'scope', { unique: false })
      }
      if (!database.objectStoreNames.contains(ELEMENT_STORE_NAME)) {
        const store = database.createObjectStore(ELEMENT_STORE_NAME, { keyPath: 'key' })
        store.createIndex('by_scope_collection', ['scope', 'collectionId'], { unique: false })
        store.createIndex('by_scope', 'scope', { unique: false })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = null
      reject(new ClientDataStoreError('INDEXED_DB_OPEN_FAILED', request.error?.message ?? 'IndexedDB could not be opened.'))
    }
  })
  return databasePromise
}

/** Converts an IndexedDB request into a promise. */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new ClientDataStoreError('INDEXED_DB_REQUEST_FAILED', request.error?.message ?? 'IndexedDB request failed.'))
  })
}

/** Waits for an IndexedDB transaction to commit or fail. */
function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(new ClientDataStoreError('INDEXED_DB_TRANSACTION_ABORTED', transaction.error?.message ?? 'IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(new ClientDataStoreError('INDEXED_DB_TRANSACTION_FAILED', transaction.error?.message ?? 'IndexedDB transaction failed.'))
  })
}

/** Builds a scope-qualified key for a collection metadata record. */
function collectionKey(scope: string, collectionId: ClientDataCollectionId): string {
  return `${scope}:collection:${collectionId}`
}

/** Builds a scope-qualified key for an encrypted element record. */
function elementKey(scope: string, collectionId: ClientDataCollectionId, id: string): string {
  return `${scope}:element:${collectionId}:${id}`
}

/** Builds the authenticated additional-data value for an element ciphertext. */
// Return type narrowed to Uint8Array<ArrayBuffer> for TypeScript 6 (the only change from the old file); behavior is the same.
function additionalData(scope: string, collectionId: ClientDataCollectionId, id: string, keyVersion: number, updatedAt: string | null): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode([scope, collectionId, id, String(keyVersion), updatedAt ?? ''].join('|'))
}

/** Loads or creates the non-extractable AES-GCM key for one authenticated user scope. */
async function getEncryptionKey(scope: string): Promise<StoredEncryptionKey> {
  const database = await openDatabase()
  const keyId = `${scope}:key`
  const readTransaction = database.transaction(KEY_STORE_NAME, 'readonly')
  const readComplete = transactionResult(readTransaction)
  const existing = await requestResult(readTransaction.objectStore(KEY_STORE_NAME).get(keyId)) as StoredEncryptionKey | undefined
  await readComplete
  if (existing) return existing

  const cryptoKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const created: StoredEncryptionKey = { key: keyId, scope, keyVersion: 1, cryptoKey, createdAt: new Date().toISOString() }
  const writeTransaction = database.transaction(KEY_STORE_NAME, 'readwrite')
  writeTransaction.objectStore(KEY_STORE_NAME).put(created)
  await transactionResult(writeTransaction)
  return created
}

/** Encrypts one element before it is written to IndexedDB. */
async function encryptElement<TElement extends ClientDataElement>(scope: string, collectionId: ClientDataCollectionId, element: TElement, keyRecord: StoredEncryptionKey): Promise<StoredEncryptedElement> {
  const iv = window.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(element))
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(scope, collectionId, element.id, keyRecord.keyVersion, element.updatedAt) }, keyRecord.cryptoKey, plaintext)
  return {
    key: elementKey(scope, collectionId, element.id),
    scope,
    collectionId,
    id: element.id,
    updatedAt: element.updatedAt,
    keyVersion: keyRecord.keyVersion,
    iv: iv.buffer,
    ciphertext,
  }
}

/** Decrypts one IndexedDB element and verifies its authenticated metadata. */
async function decryptElement<TElement extends ClientDataElement>(scope: string, stored: StoredEncryptedElement, keyRecord: StoredEncryptionKey): Promise<TElement> {
  if (stored.keyVersion !== keyRecord.keyVersion) throw new ClientDataStoreError('CLIENT_DATA_KEY_VERSION_MISMATCH', 'Stored client data uses an unsupported encryption-key version.')
  try {
    const plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: stored.iv, additionalData: additionalData(scope, stored.collectionId, stored.id, stored.keyVersion, stored.updatedAt) }, keyRecord.cryptoKey, stored.ciphertext)
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as TElement
    if (!parsed || parsed.id !== stored.id || parsed.updatedAt !== stored.updatedAt) throw new Error('Element metadata mismatch.')
    return parsed
  } catch (error) {
    if (error instanceof ClientDataStoreError) throw error
    throw new ClientDataStoreError('CLIENT_DATA_DECRYPT_FAILED', error instanceof Error ? error.message : 'Stored client data could not be decrypted.')
  }
}

/** Reads one encrypted collection and decrypts its elements. */
export async function readClientDataCollection<TElement extends ClientDataElement>(scope: string, collectionId: ClientDataCollectionId): Promise<ClientDataCollection<TElement> | null> {
  const database = await openDatabase()
  const transaction = database.transaction([COLLECTION_STORE_NAME, ELEMENT_STORE_NAME], 'readonly')
  const readComplete = transactionResult(transaction)
  const metadataRequest = transaction.objectStore(COLLECTION_STORE_NAME).get(collectionKey(scope, collectionId))
  const elementsRequest = transaction.objectStore(ELEMENT_STORE_NAME).index('by_scope_collection').getAll(IDBKeyRange.only([scope, collectionId]))
  const metadata = await requestResult(metadataRequest) as StoredCollectionMetadata | undefined
  const storedElements = await requestResult(elementsRequest) as StoredEncryptedElement[]
  await readComplete
  if (!metadata) return null
  const keyRecord = await getEncryptionKey(scope)
  const elements = await Promise.all(storedElements.map((element) => decryptElement<TElement>(scope, element, keyRecord)))
  return {
    collectionId: metadata.collectionId,
    schemaVersion: metadata.schemaVersion,
    collectionVersion: metadata.collectionVersion,
    fetchedAt: metadata.fetchedAt,
    elements,
  }
}

/** Replaces a complete typed collection atomically after encrypting each element. */
export async function writeClientDataCollection<TElement extends ClientDataElement>(scope: string, collection: ClientDataCollection<TElement>): Promise<void> {
  const database = await openDatabase()
  const keyRecord = await getEncryptionKey(scope)
  const encryptedElements = await Promise.all(collection.elements.map((element) => encryptElement(scope, collection.collectionId, element, keyRecord)))
  const metadataKey = collectionKey(scope, collection.collectionId)
  const existingTransaction = database.transaction(COLLECTION_STORE_NAME, 'readonly')
  const existingReadComplete = transactionResult(existingTransaction)
  const existing = await requestResult(existingTransaction.objectStore(COLLECTION_STORE_NAME).get(metadataKey)) as StoredCollectionMetadata | undefined
  await existingReadComplete
  const nextIds = new Set(collection.elements.map((element) => element.id))
  const transaction = database.transaction([COLLECTION_STORE_NAME, ELEMENT_STORE_NAME], 'readwrite')
  const elementStore = transaction.objectStore(ELEMENT_STORE_NAME)
  for (const oldId of existing?.elementIds ?? []) {
    if (!nextIds.has(oldId)) elementStore.delete(elementKey(scope, collection.collectionId, oldId))
  }
  for (const element of encryptedElements) elementStore.put(element)
  transaction.objectStore(COLLECTION_STORE_NAME).put({
    key: metadataKey,
    scope,
    collectionId: collection.collectionId,
    schemaVersion: collection.schemaVersion,
    collectionVersion: collection.collectionVersion,
    fetchedAt: collection.fetchedAt,
    elementIds: [...nextIds],
  } satisfies StoredCollectionMetadata)
  await transactionResult(transaction)
}

/** Applies only changed and deleted elements while advancing collection metadata. */
export async function applyClientDataDelta<TElement extends ClientDataElement>(
  scope: string,
  delta: ClientDataDelta<TElement>,
  fetchedAt: string,
  schemaVersion = 1,
): Promise<void> {
  const database = await openDatabase()
  const keyRecord = await getEncryptionKey(scope)
  const encryptedUpserts = await Promise.all(delta.upserts.map((element) => encryptElement(scope, delta.collectionId, element, keyRecord)))
  const metadataKey = collectionKey(scope, delta.collectionId)
  const existingTransaction = database.transaction(COLLECTION_STORE_NAME, 'readonly')
  const existingReadComplete = transactionResult(existingTransaction)
  const existing = await requestResult(existingTransaction.objectStore(COLLECTION_STORE_NAME).get(metadataKey)) as StoredCollectionMetadata | undefined
  await existingReadComplete
  const ids = new Set(existing?.elementIds ?? [])
  for (const id of delta.deletedIds) ids.delete(id)
  for (const element of delta.upserts) ids.add(element.id)
  const transaction = database.transaction([COLLECTION_STORE_NAME, ELEMENT_STORE_NAME], 'readwrite')
  const elementStore = transaction.objectStore(ELEMENT_STORE_NAME)
  for (const id of delta.deletedIds) elementStore.delete(elementKey(scope, delta.collectionId, id))
  for (const element of encryptedUpserts) elementStore.put(element)
  transaction.objectStore(COLLECTION_STORE_NAME).put({
    key: metadataKey,
    scope,
    collectionId: delta.collectionId,
    schemaVersion: existing?.schemaVersion ?? schemaVersion,
    collectionVersion: delta.collectionVersion,
    fetchedAt,
    elementIds: [...ids],
  } satisfies StoredCollectionMetadata)
  await transactionResult(transaction)
}

/** Upserts one encrypted element without replacing unrelated collection elements. */
export async function upsertClientDataElement<TElement extends ClientDataElement>(scope: string, collectionId: ClientDataCollectionId, element: TElement, collectionVersion: string, schemaVersion = 1): Promise<void> {
  const database = await openDatabase()
  const keyRecord = await getEncryptionKey(scope)
  const encryptedElement = await encryptElement(scope, collectionId, element, keyRecord)
  const metadataKey = collectionKey(scope, collectionId)
  const existingTransaction = database.transaction(COLLECTION_STORE_NAME, 'readonly')
  const existingReadComplete = transactionResult(existingTransaction)
  const existing = await requestResult(existingTransaction.objectStore(COLLECTION_STORE_NAME).get(metadataKey)) as StoredCollectionMetadata | undefined
  await existingReadComplete
  const transaction = database.transaction([COLLECTION_STORE_NAME, ELEMENT_STORE_NAME], 'readwrite')
  transaction.objectStore(ELEMENT_STORE_NAME).put(encryptedElement)
  const ids = new Set(existing?.elementIds ?? [])
  ids.add(element.id)
  transaction.objectStore(COLLECTION_STORE_NAME).put({
    key: metadataKey,
    scope,
    collectionId,
    schemaVersion: existing?.schemaVersion ?? schemaVersion,
    collectionVersion,
    fetchedAt: new Date().toISOString(),
    elementIds: [...ids],
  } satisfies StoredCollectionMetadata)
  await transactionResult(transaction)
}

/** Removes one element and leaves the rest of its encrypted collection intact. */
export async function deleteClientDataElement(scope: string, collectionId: ClientDataCollectionId, id: string, collectionVersion: string): Promise<void> {
  const database = await openDatabase()
  const metadataKey = collectionKey(scope, collectionId)
  const readTransaction = database.transaction(COLLECTION_STORE_NAME, 'readonly')
  const readComplete = transactionResult(readTransaction)
  const existing = await requestResult(readTransaction.objectStore(COLLECTION_STORE_NAME).get(metadataKey)) as StoredCollectionMetadata | undefined
  await readComplete
  if (!existing) return
  const transaction = database.transaction([COLLECTION_STORE_NAME, ELEMENT_STORE_NAME], 'readwrite')
  transaction.objectStore(ELEMENT_STORE_NAME).delete(elementKey(scope, collectionId, id))
  transaction.objectStore(COLLECTION_STORE_NAME).put({
    ...existing,
    collectionVersion,
    fetchedAt: new Date().toISOString(),
    elementIds: existing.elementIds.filter((elementId) => elementId !== id),
  } satisfies StoredCollectionMetadata)
  await transactionResult(transaction)
}

/** Clears all browser client-data collections and keys for one authenticated user scope. */
export async function clearClientDataScope(scope: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction([KEY_STORE_NAME, COLLECTION_STORE_NAME, ELEMENT_STORE_NAME], 'readwrite')
  const collections = await requestResult(transaction.objectStore(COLLECTION_STORE_NAME).getAll()) as StoredCollectionMetadata[]
  const elements = await requestResult(transaction.objectStore(ELEMENT_STORE_NAME).getAll()) as StoredEncryptedElement[]
  for (const collection of collections) if (collection.scope === scope) transaction.objectStore(COLLECTION_STORE_NAME).delete(collection.key)
  for (const element of elements) if (element.scope === scope) transaction.objectStore(ELEMENT_STORE_NAME).delete(element.key)
  transaction.objectStore(KEY_STORE_NAME).delete(`${scope}:key`)
  await transactionResult(transaction)
}

/** Returns non-sensitive browser storage estimates for the client-data diagnostics panel. */
export async function getClientDataStorageEstimate(): Promise<{ usage: number | null; quota: number | null }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { usage: null, quota: null }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? null, quota: estimate.quota ?? null }
}
