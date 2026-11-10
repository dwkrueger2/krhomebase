/** One weighted field contribution before missing-field redistribution. */
export interface ScoreField {
  /** Stable field name used in subScores and explanations. */
  name: string
  /** Relative weight for this field. */
  weight: number
  /** Similarity in the inclusive range 0..1. */
  score: number
  /** Whether both sides supplied a value for this field. */
  available: boolean
}

/** Output shared by each record-kind scoring profile. */
export interface ScoreOutput {
  /** Blended score after available-weight redistribution. */
  score: number
  /** Per-field scores used for the blend. */
  subScores: Record<string, number>
  /** True when only phonetic name evidence supplied the text signal. */
  phoneticOnly: boolean
}

/** Redistributes configured weight across fields present on both records. */
export function redistributeWeightedScore(fields: ScoreField[]): ScoreOutput {
  const availableWeight = fields.filter((field) => field.available).reduce((sum, field) => sum + field.weight, 0)
  const subScores = Object.fromEntries(fields.map((field) => [field.name, roundScore(field.score)]))
  if (!availableWeight) return { score: 0, subScores, phoneticOnly: false }
  const score = fields
    .filter((field) => field.available)
    .reduce((sum, field) => sum + field.score * (field.weight / availableWeight), 0)
  return { score: roundScore(score), subScores, phoneticOnly: false }
}

/** Rounds a score to four decimal places for deterministic API results. */
export function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000
}
