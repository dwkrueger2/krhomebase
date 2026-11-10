/**
 * Central configuration for the deterministic entity-resolution library.
 *
 * Numeric values belong here so tuning a threshold or score profile is a
 * deliberate, reviewable change rather than a hidden adjustment in a scorer.
 */

/** Current serialized index shape version. Increment when MatchIndex changes. */
export const MATCH_INDEX_SCHEMA_VERSION = 1

/** Maximum corpus size accepted by the pure index builder. */
export const MAX_INDEX_RECORDS = 50_000

/** Module-cache lifetime before a corpus is rebuilt. */
export const INDEX_TTL_MS = 60_000

/** Default number of ranked candidates returned to callers. */
export const DEFAULT_MAX_CANDIDATES = 5

/** Score at or above which a candidate is classified as AUTO. */
export const DEFAULT_AUTO_THRESHOLD = 0.93

/** Score at or above which a candidate is classified as REVIEW. */
export const DEFAULT_REVIEW_THRESHOLD = 0.72

/** Phonetic-only matches cannot exceed this decision band. */
export const PHONETIC_ONLY_MAX_SCORE = DEFAULT_REVIEW_THRESHOLD

/** Minimum score for a scoped trust result to carry a strong core reason. */
export const SCOPED_TRUST_STRONG_THRESHOLD = 0.55

/** AUTO threshold used by the deliberately broader person-scoped trust lookup. */
export const SCOPED_TRUST_AUTO_THRESHOLD = 0.85

/** REVIEW threshold used by the deliberately broader person-scoped trust lookup. */
export const SCOPED_TRUST_REVIEW_THRESHOLD = 0.45

/** Person score weights: names remain important, while exact email/phone identifiers carry stronger confidence. */
export const PERSON_WEIGHTS = {
  lastName: 0.20,
  firstName: 0.15,
  fullName: 0.10,
  dateOfBirth: 0.10,
  email: 0.27,
  phone: 0.18,
} as const

/** Organization score weights: legal core, DBAs, address, jurisdiction. */
export const ORGANIZATION_WEIGHTS = {
  legalName: 0.60,
  dba: 0.15,
  address: 0.15,
  jurisdiction: 0.10,
} as const

/** Trust score weights: core, execution date, grantor surname, descriptors. */
export const TRUST_WEIGHTS = {
  core: 0.65,
  executionDate: 0.20,
  grantorSurname: 0.10,
  descriptors: 0.05,
} as const

/** Jaro-Winkler prefix length used by the short-string comparator. */
export const JARO_WINKLER_PREFIX_LIMIT = 4

/** Jaro-Winkler prefix scaling factor. */
export const JARO_WINKLER_PREFIX_SCALING = 0.1

/** Minimum Jaro-Winkler score eligible for the prefix boost. */
export const JARO_WINKLER_BOOST_THRESHOLD = 0.7

/** Maximum character distance used by the Jaro matching window. */
export const JARO_MATCH_DISTANCE_DIVISOR = 2

/** Exact same-year date similarity. */
export const DATE_SAME_YEAR_SCORE = 0.5

/** Same year and month date similarity. */
export const DATE_SAME_MONTH_SCORE = 0.7

/** Single-digit/transposed-year typo date similarity. */
export const DATE_SINGLE_DIGIT_TYPO_SCORE = 0.6

/** Same local-part/different-domain email similarity. */
export const EMAIL_SAME_LOCAL_PART_SCORE = 0.6

/** Name score that permits the exact-email confirmer. */
export const EMAIL_CONFIRM_LAST_NAME_THRESHOLD = 0.8

/** Person score that identifies a phonetic-only result. */
export const PHONETIC_ONLY_TEXT_SCORE_THRESHOLD = 0.45

/** Maximum nickname score so a dictionary match does not equal exact text. */
export const NICKNAME_MAX_SCORE = 0.89

/** Minimum nickname score when the canonical roots match. */
export const NICKNAME_MIN_SCORE = 0.86

/** Bounded name score boost supplied by a phonetic match. */
export const PHONETIC_NAME_BOOST = 0.12

/** Maximum score after a non-exact phonetic name boost. */
export const PHONETIC_NAME_MAX_SCORE = 0.92

/** Jaro score treated as exact after four-decimal rounding. */
export const TEXT_EXACT_SCORE = 0.9999

/** Minimum address similarity when normalized ZIP codes match exactly. */
export const EXACT_POSTAL_ADDRESS_SCORE = 0.9

/** String used when an input has no usable searchable content. */
export const EMPTY_NORMALIZED_VALUE = ''
