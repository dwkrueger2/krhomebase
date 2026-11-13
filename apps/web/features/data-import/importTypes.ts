// file: apps/web/features/data-import/importTypes.ts
/**
 * Shared types for KR Homebase bulk import staging.
 *
 * Ported from the old `src/hb-import/BulkImportTypes.ts` with its field comments. Kept: the contact record, the
 * issue, the duplicate candidate, the staged row and the run row.
 *
 * Changed from the old types:
 *  - Only the contact path is ported. The matter types (`BulkMatter*`, `BulkImportExistingMatter`) are left out:
 *    Matter import stays disabled, as it was in the old screen, and its code could not be reached there either.
 *  - A staged row may also be `not-importable`: a lead row, which waits for the Leads port and is never sent.
 */

/** Import workflow supported by the Data Management staging panel. Matters stay disabled. */
export type BulkImportKind = 'contacts' | 'matters'

/** Severity used by validator and importer review messages. */
export type BulkImportIssueSeverity = 'error' | 'warning' | 'info'

/** One human-readable validation or import issue. */
export interface BulkImportIssue {
  /** Stable-ish field path or row label for the reviewer. */
  path: string
  /** Issue severity. Errors block live import. */
  severity: BulkImportIssueSeverity
  /** Human-readable message suitable for the staging UI. */
  message: string
}

/** Minimal existing contact data used for duplicate scoring without loading full records. */
export interface BulkImportExistingContact {
  /** Existing individual or entity id. */
  id: string
  /** Database family for the existing contact. */
  kind: 'individual' | 'entity'
  /** Existing contact display name. */
  displayName: string
  /** Primary email when available. */
  email: string | null
  /** Primary phone when available. */
  phone: string | null
  /** Existing related matter summaries when the API/UI can provide them. */
  relatedMatters?: Array<{ matterNumber: string; title: string }>
}

/** Candidate duplicate or merge target shown in the staging review. */
export interface BulkImportDuplicateCandidate {
  /** Existing row id that may match the import row. */
  id: string
  /** Existing contact family, available for contact duplicate candidates. */
  kind?: 'individual' | 'entity'
  /** Existing row display label. */
  displayName: string
  /** Probability-like score from 0 to 1. */
  score: number
  /** Review evidence such as matching email, phone, or normalized name. */
  reasons: string[]
  /** Related matter labels that help a human decide whether to merge. */
  relatedMatterLabels: string[]
  /** Whether the candidate is an existing database row or another row in this import batch. */
  source?: 'existing' | 'import'
  /** Import key of the earlier staged row when source is import. */
  sourceImportKey?: string
}

/** Normalized contact row that can be sent to `POST /v1/contacts`. */
export interface BulkContactImportRecord {
  /** Stable import-only key used by matter imports to refer to a just-created contact. */
  importKey: string
  /** Contact family. Trusts are stored as entity rows with entitySubtype "trust". */
  kind: 'individual' | 'entity' | 'trust'
  /** Optional caller-supplied database id (read for review only; the API makes its own id). */
  id?: string
  /** Existing individual id used when a lead is attached to a deduplicated contact. */
  individualId?: string
  /** Natural-person name fields. */
  firstName?: string
  middleName?: string
  lastName?: string
  suffix?: string
  preferredName?: string
  /** Entity/trust legal fields. */
  legalName?: string
  entitySubtype?: string
  entityStatus?: string
  boiStatus?: string
  stateOfFormation?: string
  ein?: string
  /** Primary contact methods supported by the contact create route. */
  email?: string
  phone?: string
  /** Notes are preserved on the individual/entity row for newly created contacts. */
  notes?: string
  /** True when this row must also create or reuse an operational lead. */
  isLead?: boolean
  /** Lead status stored in lead.status. */
  leadStatus?: string
  /** Database-safe lead source stored in lead.source. */
  leadSource?: string
  /** Human source detail retained in the lead summary because lead has no source-text column. */
  leadSourceDetail?: string
  /** Lead urgency stored in lead.urgency. */
  leadUrgency?: string
  /** Lead summary stored in lead.summary. */
  leadSummary?: string
  /** Optional free-text practice area stored in lead.practice_area. */
  leadPracticeArea?: string
  /** Source row id retained for lead import traceability. */
  sourceRowId?: string
  /** Source label retained in the staging UI, result report, and lead source detail fallback. */
  sourceLabel?: string
}

/**
 * Planned import action. Duplicate candidates are merge-review until a merge API exists. Changed: lead rows are
 * `not-importable` until the Leads port.
 */
export type BulkContactAction = 'create' | 'merge-review' | 'blocked' | 'not-importable'

/** One staged contact row after JSONC parsing and duplicate review. */
export interface BulkContactStageRow {
  /** One-based row number within the normalized import set. */
  rowNumber: number
  /** Normalized import contact. */
  record: BulkContactImportRecord
  /** Issues specific to this row. */
  issues: BulkImportIssue[]
  /** Possible existing contacts that should be reviewed before creating. */
  duplicateCandidates: BulkImportDuplicateCandidate[]
  /** Planned import action. */
  action: BulkContactAction
}

/** Parsed contact import payload returned to the Data Management UI. */
export interface BulkContactValidationResult {
  kind: 'contacts'
  fileLabel: string
  rows: BulkContactStageRow[]
  issues: BulkImportIssue[]
}

/** Result for one live import attempt. */
export interface BulkImportRunRow {
  importKey: string
  label: string
  status: 'created' | 'skipped' | 'failed'
  message: string
  createdId?: string
}

/** Progress of a running contact import, shown in the review dialog. */
export interface ContactImportProgress {
  current: number
  total: number
  label: string
}
