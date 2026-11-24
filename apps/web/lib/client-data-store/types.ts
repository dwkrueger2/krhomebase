// file: apps/web/lib/client-data-store/types.ts
// Ported from the old repository (apps/kr-homebase/src/hb-lib/hb-client-data-store/types.ts). Changes, marked
// below: the optional `clientDisplayName` on ClientContactElement (Nov 9, 2026), its optional `ssnLast4` and
// `einLast4` (Nov 17, 2026, FB-0014), and the `drafts` collection (Nov 23, 2026, FB-0026, web patch 588).
// Design notes: lib/client-data-store/Readme-client-data-store.md.
/** Type contract for the encrypted data store owned by the client browser. */

/** JSON-compatible scalar that may be held by a browser client-data element. */
export type ClientDataPrimitive = string | number | boolean | null

/** JSON-compatible value allowed inside an encrypted client-data element. */
export type ClientDataValue = ClientDataPrimitive | ClientDataValue[] | { [key: string]: ClientDataValue }

/** Common identity and freshness fields required on every stored element. */
export interface ClientDataElement {
  /** Stable server identifier for the element. */
  readonly id: string
  /** Server-authoritative element revision timestamp. */
  readonly updatedAt: string | null
}

/** Named collections currently approved for the browser client-data store. */
// `drafts` added Nov 23, 2026 (FB-0026, web patch 588): the person's unsent WorkStream entries, approved by the requester.
export type ClientDataCollectionId = 'individuals' | 'entities' | 'clients' | 'contacts' | 'drafts'

/** Refresh behavior supported by a collection or its individual elements. */
export type ClientDataRefreshMode = 'collection' | 'element'

/** Persistence classification for one field in a browser client-data element. */
export type ClientDataFieldClass = 'search' | 'detail' | 'never'

/** Field-level storage policy used to keep the local projection intentional. */
export interface ClientDataFieldPolicy {
  /** Property name in the element type. */
  readonly key: string
  /** Whether this field is persisted, and for which local use. */
  readonly storageClass: ClientDataFieldClass
  /** Whether the field contains sensitive information requiring explicit approval. */
  readonly sensitive: boolean
  /** Whether the field may participate in local search or fuzzy indexing. */
  readonly searchable: boolean
}

/** Collection metadata describing initial loading, element refresh, and relationships. */
export interface ClientDataCollectionDefinition<TElement extends ClientDataElement = ClientDataElement> {
  /** Stable collection identifier. */
  readonly collectionId: ClientDataCollectionId
  /** Human-readable collection label. */
  readonly label: string
  /** Type name used in documentation and diagnostics. */
  readonly elementType: string
  /** Initial synchronization loads the collection as a complete authorized set. */
  readonly initialLoadMode: 'collection'
  /** Whether one element can be refreshed without reloading the collection. */
  readonly elementRefreshable: boolean
  /** Other collections that may need related-element refresh after a mutation. */
  readonly refreshesCollections: readonly ClientDataCollectionId[]
  /** Fields approved for local persistence and search. */
  readonly fields: readonly ClientDataFieldPolicy[]
  /** Type-safe keys used to construct the local search projection. */
  readonly searchableKeys: readonly (keyof TElement & string)[]
}

/** Versioned collection envelope persisted by the browser client-data store. */
export interface ClientDataCollection<TElement extends ClientDataElement> {
  /** Stable collection identifier. */
  readonly collectionId: ClientDataCollectionId
  /** Schema version for the collection envelope. */
  readonly schemaVersion: number
  /** Server-issued collection revision or synchronization cursor. */
  readonly collectionVersion: string
  /** Timestamp when this collection was received by the browser. */
  readonly fetchedAt: string
  /** Complete set of authorized elements currently held for this collection. */
  readonly elements: readonly TElement[]
}

/** Minimal local individual projection used by contact search and relationships. */
export interface ClientIndividualElement extends ClientDataElement {
  /** Element discriminator. */
  readonly kind: 'individual'
  /** Display name used in search results. */
  readonly displayName: string
  /** Given name, when available. */
  readonly firstName: string | null
  /** Family name, when available. */
  readonly lastName: string | null
  /** Primary email, when approved for local search. */
  readonly email: string | null
  /** Primary phone, when approved for local search. */
  readonly phone: string | null
  /** Locality fields used by the contact ledger. */
  readonly city: string | null
  readonly state: string | null
  readonly postalCode: string | null
  /** Related client identifiers. */
  readonly clientIds: readonly string[]
}

/** Minimal local organization or trust projection used by contact search. */
export interface ClientEntityElement extends ClientDataElement {
  /** Element discriminator. */
  readonly kind: 'entity'
  /** Legal or display name used in search results. */
  readonly displayName: string
  /** Human-readable entity or trust type. */
  readonly typeLabel: string
  /** Primary contact values approved for local search. */
  readonly email: string | null
  readonly phone: string | null
  readonly city: string | null
  readonly state: string | null
  readonly postalCode: string | null
  /** Related client identifiers. */
  readonly clientIds: readonly string[]
}

/** Minimal local client-account projection linking clients to people and entities. */
export interface ClientClientElement extends ClientDataElement {
  /** Element discriminator. */
  readonly kind: 'client'
  /** Display name of the linked individual or entity. */
  readonly displayName: string
  /** Firm-facing client number. */
  readonly clientNumber: string
  /** Client type and status labels. */
  readonly clientType: string | null
  readonly clientStatus: string | null
  /** Related individual and entity element identifiers. */
  readonly individualIds: readonly string[]
  readonly entityIds: readonly string[]
}

/** Materialized contact-ledger projection derived from individual/entity/client collections. */
export interface ClientContactElement extends ClientDataElement {
  /** Element discriminator matching the source identity collection. */
  readonly kind: 'individual' | 'entity'
  /** Display name and type shown by the Contacts Manager ledger. */
  readonly displayName: string
  readonly typeLabel: string
  readonly icid?: string | null
  readonly ecid?: string | null
  /** Non-secret name fields needed to reconstruct the cached contact card. */
  readonly titlePrefix: string | null
  readonly firstName: string | null
  readonly middleName: string | null
  readonly lastName: string | null
  readonly suffix: string | null
  readonly preferredName: string | null
  /** Searchable contact values. */
  readonly email: string | null
  readonly phone: string | null
  readonly phoneSecondary?: string | null
  readonly fax?: string | null
  readonly addressLine1: string
  readonly addressLine2: string
  readonly city: string | null
  readonly state: string | null
  readonly postalCode: string | null
  readonly status: string
  readonly isMinor: boolean
  readonly isAttorney: boolean
  /**
   * Changed (Nov 17, 2026, FB-0014): the last four digits of the SSN or EIN, for the masked row of the identity
   * summary (`•••-••-6789`). The full numbers are still never cached. Absent in caches written before; the contacts
   * sync reloads such a cache in full once (`contactsStore.client.ts`).
   */
  readonly ssnLast4?: string | null
  readonly einLast4?: string | null
  readonly createdAt: string
  /** Client relationship values shown in the ledger. */
  readonly isClient: boolean
  readonly clientId: string | null
  readonly clientNumber: string | null
  /** The client account's own name, for the billing client list. New in this repository (Nov 9, 2026); absent in older caches. */
  readonly clientDisplayName?: string | null
  readonly clientType: string | null
  readonly clientStatus: string | null
  readonly pointOfContact?: { id: string; displayName: string; icid?: string | null; relationship?: string | null } | null
  readonly registeredAgent?: { id: string; displayName: string; icid?: string | null; relationship?: string | null } | null
  readonly relatedContacts?: Array<{ id: string; displayName: string; icid?: string | null; relationship?: string | null }>
  /**
   * Changed (Nov 23, 2026, web patch 586): a person's businesses (Related Entities) and the contact's photo (its image
   * id and circle, never the image). Absent in caches written before; the contacts sync reloads such a cache in full
   * once (`cacheLacksNewFields`).
   */
  readonly relatedEntities?: Array<{ id: string; displayName: string; ecid: string | null; clientNumber: string | null; role: string }>
  readonly photo?: { assetId: string; width: number; height: number; cropX: number; cropY: number; cropSize: number; updatedAt: string } | null
}

/**
 * One unsent WorkStream entry (FB-0026, web patch 588; the requester, Nov 23, 2026). Written only by this browser for
 * the signed-in person, never sent to the API; it may hold client details, which is why it lives in the encrypted
 * store and not in `localStorage`. `id` names the place it was typed (`workstream:feed`, `workstream:client:<id>`,
 * `workstream:lead:<id>`); `updatedAt` is when it was last saved.
 */
export interface ClientDraftElement extends ClientDataElement {
  readonly kind: 'workstream-draft'
  /** The text as typed (what the parser reads). */
  readonly body: string
  /** The editor's HTML (bold, links); cleaned again before it is shown. */
  readonly html: string
  readonly activityTypes: string[]
  /** Client, Lead or Internal, as chosen in the composer. */
  readonly clientState: string
  /** The client picked in the composer (the firm feed only). */
  readonly owner: { clientId: string; clientNumber: string | null; displayName: string } | null
  readonly matter: { id: string; number: string; label: string } | null
  readonly assigneeUserIds: string[]
}

/** Union of element types approved for the first client-data-store implementation. */
export type ApprovedClientDataElement = ClientIndividualElement | ClientEntityElement | ClientClientElement | ClientContactElement | ClientDraftElement

/** Type map connecting each approved collection to its element type. */
export interface ClientDataCollections {
  /** Complete authorized individual collection. */
  readonly individuals: ClientDataCollection<ClientIndividualElement>
  /** Complete authorized entity and trust collection. */
  readonly entities: ClientDataCollection<ClientEntityElement>
  /** Complete authorized client-account collection. */
  readonly clients: ClientDataCollection<ClientClientElement>
  /** Materialized contact-ledger collection. */
  readonly contacts: ClientDataCollection<ClientContactElement>
  /** The person's unsent WorkStream entries (FB-0026). */
  readonly drafts: ClientDataCollection<ClientDraftElement>
}

/** Request to refresh one collection or one element and its declared relationships. */
export interface ClientDataRefreshRequest {
  /** Collection that owns the requested refresh. */
  readonly collectionId: ClientDataCollectionId
  /** Element identifier for an element refresh; omitted for collection refresh. */
  readonly elementId?: string
  /** Expected collection or element version used for optimistic concurrency. */
  readonly expectedVersion?: string
  /** Safe diagnostic reason for the refresh. */
  readonly reason: 'initial-load' | 'stale-cache' | 'after-save' | 'periodic-sync' | 'conflict-recovery'
}

/** Server delta used to update individual encrypted elements without replacing a collection. */
export interface ClientDataDelta<TElement extends ClientDataElement> {
  /** Collection receiving the delta. */
  readonly collectionId: ClientDataCollectionId
  /** New server cursor after applying this delta. */
  readonly collectionVersion: string
  /** Added or changed elements. */
  readonly upserts: readonly TElement[]
  /** Element identifiers removed from the server collection. */
  readonly deletedIds: readonly string[]
}

/**
 * Collection metadata for the first browser client-data-store release.
 * Full SSNs, raw session credentials, and unrestricted notes are intentionally absent.
 */
export const CLIENT_DATA_COLLECTION_DEFINITIONS = {
  individuals: {
    collectionId: 'individuals',
    label: 'Individuals',
    elementType: 'ClientIndividualElement',
    initialLoadMode: 'collection',
    elementRefreshable: true,
    refreshesCollections: ['contacts', 'clients'],
    fields: [
      { key: 'displayName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'firstName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'lastName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'email', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'phone', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'city', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'state', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'postalCode', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'clientIds', storageClass: 'detail', sensitive: false, searchable: false },
    ],
    searchableKeys: ['displayName', 'firstName', 'lastName', 'email', 'phone', 'city', 'state', 'postalCode'],
  } satisfies ClientDataCollectionDefinition<ClientIndividualElement>,
  entities: {
    collectionId: 'entities',
    label: 'Entities and Trusts',
    elementType: 'ClientEntityElement',
    initialLoadMode: 'collection',
    elementRefreshable: true,
    refreshesCollections: ['contacts', 'clients'],
    fields: [
      { key: 'displayName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'typeLabel', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'email', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'phone', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'city', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'state', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'postalCode', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'clientIds', storageClass: 'detail', sensitive: false, searchable: false },
    ],
    searchableKeys: ['displayName', 'typeLabel', 'email', 'phone', 'city', 'state', 'postalCode'],
  } satisfies ClientDataCollectionDefinition<ClientEntityElement>,
  clients: {
    collectionId: 'clients',
    label: 'Clients',
    elementType: 'ClientClientElement',
    initialLoadMode: 'collection',
    elementRefreshable: true,
    refreshesCollections: ['individuals', 'entities', 'contacts'],
    fields: [
      { key: 'displayName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'clientNumber', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'clientType', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'clientStatus', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'individualIds', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'entityIds', storageClass: 'detail', sensitive: true, searchable: false },
    ],
    searchableKeys: ['displayName', 'clientNumber', 'clientType', 'clientStatus'],
  } satisfies ClientDataCollectionDefinition<ClientClientElement>,
  contacts: {
    collectionId: 'contacts',
    label: 'Contacts',
    elementType: 'ClientContactElement',
    initialLoadMode: 'collection',
    elementRefreshable: true,
    refreshesCollections: ['individuals', 'entities', 'clients'],
    fields: [
      { key: 'displayName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'typeLabel', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'titlePrefix', storageClass: 'detail', sensitive: false, searchable: false },
      { key: 'firstName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'middleName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'lastName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'suffix', storageClass: 'detail', sensitive: false, searchable: false },
      { key: 'preferredName', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'email', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'phone', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'addressLine1', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'addressLine2', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'city', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'state', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'postalCode', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'status', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'isClient', storageClass: 'detail', sensitive: false, searchable: false },
      { key: 'isMinor', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'isAttorney', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'ssnLast4', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'einLast4', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'clientId', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'clientNumber', storageClass: 'search', sensitive: true, searchable: true },
      { key: 'clientType', storageClass: 'search', sensitive: false, searchable: true },
      { key: 'clientStatus', storageClass: 'search', sensitive: false, searchable: true },
    ],
    searchableKeys: ['displayName', 'typeLabel', 'firstName', 'middleName', 'lastName', 'preferredName', 'email', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'status', 'clientNumber', 'clientType', 'clientStatus'],
  } satisfies ClientDataCollectionDefinition<ClientContactElement>,
  // FB-0026 (web patch 588): written and read only by this browser; never searched.
  drafts: {
    collectionId: 'drafts',
    label: 'WorkStream drafts',
    elementType: 'ClientDraftElement',
    initialLoadMode: 'collection',
    elementRefreshable: true,
    refreshesCollections: [],
    fields: [
      { key: 'body', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'html', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'activityTypes', storageClass: 'detail', sensitive: false, searchable: false },
      { key: 'clientState', storageClass: 'detail', sensitive: false, searchable: false },
      { key: 'owner', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'matter', storageClass: 'detail', sensitive: true, searchable: false },
      { key: 'assigneeUserIds', storageClass: 'detail', sensitive: false, searchable: false },
    ],
    searchableKeys: [],
  } satisfies ClientDataCollectionDefinition<ClientDraftElement>,
} as const
