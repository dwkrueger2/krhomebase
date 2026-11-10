import { MATCH_INDEX_SCHEMA_VERSION } from '../config'
import type { MatchIndex } from '../types'

/**
 * Serializes a normalized index with stable JSON property order.
 * @param index - Index to serialize.
 * @returns JSON text suitable for a server-side cache or fixture.
 * @example `const payload = serializeIndex(index)`
 */
export function serializeIndex(index: MatchIndex): string {
  return JSON.stringify(index)
}

/**
 * Deserializes an index only when its shape version is supported.
 * @param value - JSON payload previously produced by serializeIndex.
 * @returns The index, or null when malformed or version-incompatible.
 * @example `const index = deserializeIndex(payload)`
 */
export function deserializeIndex(value: string): MatchIndex | null {
  try {
    const parsed = JSON.parse(value) as Partial<MatchIndex>
    if (parsed.schemaVersion !== MATCH_INDEX_SCHEMA_VERSION) return null
    if (!parsed.kind || !Array.isArray(parsed.records) || !parsed.buckets) return null
    if (parsed.recordCount !== parsed.records.length) return null
    return parsed as MatchIndex
  } catch {
    return null
  }
}
