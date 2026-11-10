// file: apps/web/lib/fuzzy-match/fuzzyMatch.ts
/**
 * Public entry of the fuzzy-match library (old `hb-lib/hb-fuzzy-match/index.ts`, renamed because this repository
 * allows no `index.ts` files). Finds likely duplicate people, organizations and trusts in data already in the
 * browser; it never calls the API. See `Readme-fuzzy-match.md`.
 */
export * from './types'
export { buildMatchIndex, clearIndexCache, deserializeIndex, getOrBuildIndex, normalizeRecord, serializeIndex } from './indexing/indexing'
export { checkForDuplicate, resolveImportBatch } from './resolve'
export { findMatches, matchTrustsForPerson } from './match'
