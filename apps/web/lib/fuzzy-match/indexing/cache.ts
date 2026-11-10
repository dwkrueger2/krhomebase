import { INDEX_TTL_MS } from '../config'
import type { IndexOptions, MatchIndex, MatchableRecord, RecordKind } from '../types'
import { buildMatchIndex } from './build'

interface CacheEntry {
  index: MatchIndex
  builtAtMs: number
}

const cache = new Map<RecordKind, CacheEntry>()

/**
 * Returns a module-cached index, rebuilding after TTL or corpus-version changes.
 *
 * @param kind - Corpus kind to cache independently.
 * @param corpusVersion - Caller-supplied D1 version stamp, or zero for TTL-only use.
 * @param loadCorpus - Async loader invoked only after a cache miss.
 * @param options - Optional builder controls.
 * @returns A cached or newly built index.
 * @example `const index = await getOrBuildIndex('PERSON', version, loadPeople)`
 */
export async function getOrBuildIndex(kind: RecordKind, corpusVersion: number, loadCorpus: () => Promise<MatchableRecord[]>, options: IndexOptions = {}): Promise<MatchIndex> {
  const now = Date.now()
  const cached = cache.get(kind)
  if (cached && cached.index.corpusVersion === corpusVersion && now - cached.builtAtMs < INDEX_TTL_MS) return cached.index
  const records = await loadCorpus()
  if (records.some((record) => record.kind !== kind)) throw new Error('MATCH_INDEX_MIXED_RECORD_KINDS')
  const index = buildMatchIndex(records, { ...options, kind, corpusVersion })
  const cachedIndex = { ...index, builtAtMs: now }
  cache.set(kind, { index: cachedIndex, builtAtMs: now })
  return cachedIndex
}

/** Clears the process-local index cache, primarily for tests and explicit refreshes. */
export function clearIndexCache(kind?: RecordKind): void {
  if (kind) cache.delete(kind)
  else cache.clear()
}
