/** Public domain and result types for the fuzzy entity-resolution library. */

/** The three scoring profiles supported by the library. */
export type RecordKind = 'PERSON' | 'ORGANIZATION' | 'TRUST'

/** Roles are observations on a person, never match gates. */
export type PersonRole = 'CLIENT' | 'EMPLOYEE' | 'CONTACT' | 'REFERRAL' | 'VENDOR' | 'OTHER'

/** Address fields accepted by the normalizer and assembled by callers. */
export interface AddressFields {
  /** Street line one. */
  street1?: string
  /** Street line two. */
  street2?: string
  /** Optional separate street number. */
  streetNumber?: string
  /** Optional separate street name. */
  streetName?: string
  /** City or locality. */
  city?: string
  /** State, province, or region. */
  state?: string
  /** Postal or ZIP code. */
  postalCode?: string
  /** Country code or name. */
  country?: string
}

/** Common identity fields shared by all matchable records. */
export interface MatchableBase {
  /** Stable database or import identifier. */
  id: string
  /** One scoring kind; indexes never mix kinds. */
  kind: RecordKind
}

/** A human identity assembled from the individual/user/employee schema. */
export interface PersonRecord extends MatchableBase {
  /** Person profile discriminator. */
  kind: 'PERSON'
  /** Given name. */
  firstName?: string
  /** Middle name or initial. */
  middleName?: string
  /** Family name. */
  lastName?: string
  /** Name suffix such as Jr or III. */
  suffix?: string
  /** Prior family name. */
  maidenName?: string
  /** Nicknames or alternate names. */
  aliases?: string[]
  /** Non-gating role observations. */
  roles?: PersonRole[]
  /** Email address assembled from contact methods. */
  email?: string
  /** Phone number assembled from contact methods. */
  phone?: string
  /** Primary address assembled from address relations. */
  address?: AddressFields
  /** ISO date of birth. */
  dateOfBirth?: string
  /** Last four digits of an SSN; never use a full SSN for matching. */
  ssnLast4?: string
  /** Optional display/status observation supplied by the caller. */
  status?: string
  /** Optional archived marker surfaced in explanations. */
  archived?: boolean
}

/** A business, LLC, nonprofit, partnership, or other organization. */
export interface OrganizationRecord extends MatchableBase {
  /** Organization scoring discriminator. */
  kind: 'ORGANIZATION'
  /** Canonical legal name. */
  legalName: string
  /** Doing-business-as aliases. */
  dba?: string[]
  /** Stored entity subtype such as LLC or corporation. */
  entityType?: string
  /** Formation jurisdiction. */
  jurisdiction?: string
  /** Employer identification number. */
  ein?: string
  /** Primary address assembled from address relations. */
  address?: AddressFields
  /** Primary email assembled from contact methods. */
  email?: string
  /** Primary phone assembled from contact methods. */
  phone?: string
  /** Optional display/status observation supplied by the caller. */
  status?: string
  /** Optional archived marker surfaced in explanations. */
  archived?: boolean
}

/** A trust represented by an entity row with trust-specific metadata. */
export interface TrustRecord extends MatchableBase {
  /** Trust scoring discriminator. */
  kind: 'TRUST'
  /** Raw legal trust name. */
  legalName: string
  /** Parsed execution date, normally ISO YYYY-MM-DD. */
  executionDate?: string
  /** Trust subtype such as revocable or irrevocable. */
  trustType?: string
  /** Employer identification number when the trust entity has one. */
  ein?: string
  /** Person ids linked as grantors/settlor roles by the caller. */
  grantorIds?: string[]
  /** Person ids linked as trustee roles by the caller. */
  trusteeIds?: string[]
  /** Resolved grantor surname used by the trust scorer. */
  grantorSurname?: string
  /** Optional address assembled from address relations. */
  address?: AddressFields
  /** Optional display/status observation supplied by the caller. */
  status?: string
  /** Optional archived marker surfaced in explanations. */
  archived?: boolean
}

/** Any record accepted by the index builder. */
export type MatchableRecord = PersonRecord | OrganizationRecord | TrustRecord

/** Normalized person fields retained in the serializable index. */
export interface NormalizedPerson {
  /** Original structured record. */
  original: PersonRecord
  /** Normalized given name. */
  firstName: string
  /** Normalized middle name. */
  middleName: string
  /** Normalized family name. */
  lastName: string
  /** Normalized suffix, excluded from primary score. */
  suffix: string
  /** Full-name comparison variant. */
  fullName: string
  /** Token-sorted transposition variant. */
  transposedName: string
  /** Canonical nickname roots for first name and aliases. */
  canonicalFirstNames: string[]
  /** Normalized alternate family names. */
  alternateLastNames: string[]
  /** Name phonetic keys. */
  phoneticKeys: string[]
  /** Normalized email. */
  email: string
  /** Normalized phone digits. */
  phone: string
  /** Normalized ISO date. */
  dateOfBirth: string
  /** SSN last four digits. */
  ssnLast4: string
  /** Normalized address. */
  address: string
}

/** Normalized organization fields retained in the serializable index. */
export interface NormalizedOrganization {
  /** Original structured record. */
  original: OrganizationRecord
  /** Entity core with suffixes/articles removed. */
  legalNameCore: string
  /** Normalized DBA aliases. */
  dba: string[]
  /** Extracted entity suffix. */
  entitySuffix: string
  /** Normalized jurisdiction. */
  jurisdiction: string
  /** Normalized EIN. */
  ein: string
  /** Normalized email. */
  email: string
  /** Normalized phone digits. */
  phone: string
  /** Normalized address. */
  address: string
  /** Organization phonetic keys. */
  phoneticKeys: string[]
}

/** Normalized trust fields retained in the serializable index. */
export interface NormalizedTrust {
  /** Original structured record. */
  original: TrustRecord
  /** Boilerplate-stripped trust core. */
  core: string
  /** Parsed execution date. */
  executionDate: string
  /** Removed descriptors retained as weak signal. */
  descriptors: string[]
  /** Normalized trust type. */
  trustType: string
  /** Normalized EIN. */
  ein: string
  /** Normalized grantor surname. */
  grantorSurname: string
  /** Trust phonetic keys. */
  phoneticKeys: string[]
}

/** Normalized record union stored in MatchIndex.records. */
export type NormalizedRecord = NormalizedPerson | NormalizedOrganization | NormalizedTrust

/** Optional controls for index construction. */
export interface IndexOptions {
  /** Corpus version supplied by the caller; defaults to zero. */
  corpusVersion?: number
  /** Optional maximum override, never allowed above MAX_INDEX_RECORDS. */
  maxRecords?: number
  /** Required only when building an intentionally empty index. */
  kind?: RecordKind
}

/** Serializable blocking buckets containing record positions. */
export interface MatchBuckets {
  /** Phonetic key to record positions. */
  phonetic: Record<string, number[]>
  /** First-letter key to record positions. */
  firstLetter: Record<string, number[]>
  /** Token key to record positions. */
  token: Record<string, number[]>
}

/** Serializable normalized index for one record kind. */
export interface MatchIndex {
  /** Shape version checked by deserializeIndex. */
  schemaVersion: number
  /** One kind per index. */
  kind: RecordKind
  /** Cache timestamp; pure builders set this to zero. */
  builtAtMs: number
  /** Caller-supplied corpus version, or zero for TTL-only operation. */
  corpusVersion: number
  /** Number of normalized records. */
  recordCount: number
  /** Normalized records parallel to bucket positions. */
  records: NormalizedRecord[]
  /** Candidate blocking structures. */
  buckets: MatchBuckets
}

/** Match decision band. */
export type MatchDecision = 'AUTO' | 'REVIEW' | 'NO_MATCH'

/** Explanation category used by the review UI. */
export type MatchReasonKind = 'STRONG' | 'WEAK' | 'CONFLICT'

/** One deterministic, human-readable explanation. */
export interface MatchReason {
  /** Explanation strength/category. */
  kind: MatchReasonKind
  /** Compared field. */
  field: string
  /** Templated human-readable message. */
  message: string
}

/** Ranked candidate result returned by Lane B. */
export interface MatchResult {
  /** Existing canonical record. */
  record: MatchableRecord
  /** Blended score rounded to four decimals. */
  score: number
  /** Decision after blockers and confirmers. */
  decision: MatchDecision
  /** Per-field scores used to calculate the blend. */
  subScores: Record<string, number>
  /** Deterministic explanation list. */
  reasons: MatchReason[]
  /** Confirmers that influenced or were considered for the result. */
  confirmers: string[]
  /** Blockers that influenced or were considered for the result. */
  blockers: string[]
  /** Raw string query when the caller used free text. */
  queryRaw?: string
}

/** Options shared by general and duplicate matching. */
export interface MatchOptions {
  /** AUTO threshold override. */
  autoThreshold?: number
  /** REVIEW threshold override. */
  reviewThreshold?: number
  /** Maximum ranked candidates override. */
  maxCandidates?: number
}

/** Duplicate verdict returned by the pre-insert gate. */
export type DuplicateVerdict = 'CLEAR' | 'POSSIBLE_DUPLICATE' | 'LIKELY_DUPLICATE'

/** Result of a pre-insert duplicate check. */
export interface DuplicateCheckResult {
  /** Caller-facing verdict. */
  verdict: DuplicateVerdict
  /** Best ranked candidate, when one exists. */
  bestMatch: MatchResult | null
  /** Ranked candidates retained for review. */
  matches: MatchResult[]
}

/** Controls for bulk import resolution. */
export interface ImportOptions extends MatchOptions {
  /** Explicitly permits AUTO rows to become links. */
  allowAutoMerge?: boolean
}

/** One bulk import row resolution and audit trail. */
export interface ImportResolution {
  /** Zero-based incoming row position. */
  rowIndex: number
  /** Incoming record. */
  record: MatchableRecord
  /** Planned action. */
  action: 'create' | 'link' | 'review'
  /** Best existing or earlier-batch match. */
  match: MatchResult | null
  /** Stable audit messages explaining the action. */
  audit: string[]
}

/** Bulk import plan split into create, link, review, and complete row order. */
export interface ImportPlan {
  /** Rows that may be created as new records. */
  create: ImportResolution[]
  /** Rows explicitly linked to an existing record. */
  link: ImportResolution[]
  /** Rows requiring human review. */
  review: ImportResolution[]
  /** All rows in incoming order. */
  rows: ImportResolution[]
}
