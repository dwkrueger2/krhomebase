import { MAX_INDEX_RECORDS, MATCH_INDEX_SCHEMA_VERSION } from '../config'
import { normalizeOrganization } from '../normalize/organization'
import { normalizePerson } from '../normalize/person'
import { normalizeTrust } from '../normalize/trust'
import type { IndexOptions, MatchBuckets, MatchIndex, MatchableRecord, NormalizedRecord } from '../types'
import { blockingKeys } from './blocking'

/**
 * Builds an immutable, serializable normalized index for one record kind.
 *
 * @param records - Complete canonical records of one kind.
 * @param options - Optional corpus version, empty-index kind, and size limit.
 * @returns A deterministic index with normalized records and blocking buckets.
 * @example `const index = buildMatchIndex(people, { corpusVersion: 4 })`
 */
export function buildMatchIndex(records: MatchableRecord[], options: IndexOptions = {}): MatchIndex {
  const maxRecords = Math.min(options.maxRecords ?? MAX_INDEX_RECORDS, MAX_INDEX_RECORDS)
  if (records.length > maxRecords) throw new Error(`MATCH_INDEX_RECORD_LIMIT:${maxRecords}`)
  const kind = options.kind || records[0]?.kind
  if (!kind) throw new Error('MATCH_INDEX_KIND_REQUIRED_FOR_EMPTY_CORPUS')
  if (records.some((record) => !record.id)) throw new Error('MATCH_INDEX_RECORD_ID_REQUIRED')
  if (records.some((record) => record.kind !== kind)) throw new Error('MATCH_INDEX_MIXED_RECORD_KINDS')
  const normalized = records.map(normalizeRecord)
  const buckets: MatchBuckets = { phonetic: {}, firstLetter: {}, token: {} }
  normalized.forEach((record, position) => addRecordToBuckets(record, position, buckets))
  return {
    schemaVersion: MATCH_INDEX_SCHEMA_VERSION,
    kind,
    builtAtMs: 0,
    corpusVersion: options.corpusVersion ?? 0,
    recordCount: normalized.length,
    records: normalized,
    buckets,
  }
}

/** Normalizes a record according to its discriminated kind. */
export function normalizeRecord(record: MatchableRecord): NormalizedRecord {
  if (record.kind === 'PERSON') return normalizePerson(record)
  if (record.kind === 'ORGANIZATION') return normalizeOrganization(record)
  return normalizeTrust(record)
}

/** Inserts one record position into each applicable blocking bucket. */
function addRecordToBuckets(record: NormalizedRecord, position: number, buckets: MatchBuckets): void {
  const keys = blockingKeys(record)
  addKeys(keys.phonetic, position, buckets.phonetic)
  addKeys(keys.firstLetter, position, buckets.firstLetter)
  addKeys(keys.token, position, buckets.token)
}

/** Adds a position exactly once to each sorted bucket. */
function addKeys(keys: string[], position: number, buckets: Record<string, number[]>): void {
  for (const key of keys) {
    const positions = buckets[key] || (buckets[key] = [])
    positions.push(position)
  }
}
