import { DEFAULT_MAX_CANDIDATES } from './config'
import { buildMatchIndex } from './indexing/indexing'
import { findMatches } from './match'
import type { DuplicateCheckResult, ImportOptions, ImportPlan, ImportResolution, MatchIndex, MatchableRecord } from './types'

/**
 * Runs the pre-insert duplicate gate for one incoming record.
 * @param incoming - Candidate record before insertion.
 * @param index - Existing single-kind index.
 * @param options - Optional thresholds and result cap.
 * @returns A non-blocking duplicate verdict with ranked evidence.
 * @example `const result = checkForDuplicate(candidate, personIndex)`
 */
export function checkForDuplicate(incoming: MatchableRecord, index: MatchIndex, options: ImportOptions = {}): DuplicateCheckResult {
  const matches = findMatches(incoming, index, { ...options, maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES })
  const bestMatch = matches[0] || null
  const verdict = !bestMatch || bestMatch.decision === 'NO_MATCH'
    ? 'CLEAR'
    : bestMatch.decision === 'AUTO'
      ? 'LIKELY_DUPLICATE'
      : 'POSSIBLE_DUPLICATE'
  return { verdict, bestMatch, matches }
}

/**
 * Resolves an import batch while adding accepted creates to a scratch index.
 * @param incoming - Rows in source-file order.
 * @param index - Existing canonical index, never mutated.
 * @param options - Optional thresholds and explicit auto-merge permission.
 * @returns Create, link, review, and ordered audit-plan buckets.
 * @example `const plan = resolveImportBatch(rows, personIndex, { allowAutoMerge: false })`
 */
export function resolveImportBatch(incoming: MatchableRecord[], index: MatchIndex, options: ImportOptions = {}): ImportPlan {
  let scratch = index
  const rows: ImportResolution[] = []
  incoming.forEach((record, rowIndex) => {
    const check = checkForDuplicate(record, scratch, options)
    const best = check.bestMatch
    let action: ImportResolution['action']
    const audit: string[] = []
    if (!best || best.decision === 'NO_MATCH') {
      action = 'create'
      audit.push('No existing or earlier-batch candidate met the review threshold.')
      scratch = addToScratchIndex(scratch, record)
    } else if (best.decision === 'AUTO' && options.allowAutoMerge) {
      action = 'link'
      audit.push(`Auto-linked to ${best.record.id} with score ${best.score.toFixed(4)}.`)
    } else if (best.decision === 'AUTO') {
      action = 'review'
      audit.push(`Automatic duplicate confidence reached for ${best.record.id}, but allowAutoMerge is false.`)
    } else {
      action = 'review'
      audit.push(`Candidate ${best.record.id} requires human review at score ${best.score.toFixed(4)}.`)
    }
    rows.push({ rowIndex, record, action, match: best, audit })
  })
  return { create: rows.filter((row) => row.action === 'create'), link: rows.filter((row) => row.action === 'link'), review: rows.filter((row) => row.action === 'review'), rows }
}

/** Adds a newly accepted create to a separate pure index for later batch rows. */
function addToScratchIndex(index: MatchIndex, record: MatchableRecord): MatchIndex {
  return buildMatchIndex([...index.records.map((item) => item.original), record], { kind: index.kind, corpusVersion: index.corpusVersion })
}
