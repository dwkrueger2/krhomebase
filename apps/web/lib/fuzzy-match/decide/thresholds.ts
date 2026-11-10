import {
  DEFAULT_AUTO_THRESHOLD,
  DEFAULT_REVIEW_THRESHOLD,
  PHONETIC_ONLY_MAX_SCORE,
} from '../config'
import type { MatchOptions } from '../types'

/** Resolved decision thresholds for one matching operation. */
export interface ResolvedThresholds {
  /** Score at or above which the result is AUTO unless blocked. */
  autoThreshold: number
  /** Score at or above which the result is REVIEW unless blocked. */
  reviewThreshold: number
  /** Maximum score permitted for phonetic-only evidence. */
  phoneticOnlyMaxScore: number
}

/** Applies caller overrides while preserving the AUTO >= REVIEW invariant. */
export function resolveThresholds(options: MatchOptions = {}): ResolvedThresholds {
  const reviewThreshold = clamp(options.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD)
  const autoThreshold = Math.max(reviewThreshold, clamp(options.autoThreshold ?? DEFAULT_AUTO_THRESHOLD))
  return { autoThreshold, reviewThreshold, phoneticOnlyMaxScore: PHONETIC_ONLY_MAX_SCORE }
}

/** Clamps a threshold to the valid score range. */
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
