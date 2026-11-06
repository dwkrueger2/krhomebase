/**
 * @fileoverview Table registry for the quarantined public inquiry D1 worker.
 * @module d1-workers/shared/pub-inquiry-table-registry
 *
 * This registry is intentionally separate from the KR Homebase operational
 * table-registry. Public inquiry routes must never gain table access to client,
 * matter, user, billing, session, or other operational KR Homebase tables.
 */

export type PubInquiryCrudAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH'

export type PubInquiryTablePolicy = {
  /** Physical D1 table name. */
  table: string
  /** Primary key column used by read/update operations. */
  pk: string
  /** All columns known to the public inquiry worker. */
  columns: readonly string[]
  /** Columns accepted during insert. */
  createColumns: readonly string[]
  /** Columns accepted during update. */
  updateColumns: readonly string[]
  /** Columns accepted as equality filters during search. */
  searchableColumns: readonly string[]
  /** Columns required when inserting a row. */
  requiredCreateColumns: readonly string[]
  /** Whether create is allowed for this table. */
  allowCreate: boolean
  /** Whether read is allowed for this table. */
  allowRead: boolean
  /** Whether update is allowed for this table. */
  allowUpdate: boolean
  /** Whether delete is allowed for this table. */
  allowDelete: boolean
  /** Whether search is allowed for this table. */
  allowSearch: boolean
}

/**
 * Returns the provided table policy with exact typing.
 *
 * @param opts - Public inquiry table policy.
 */
function policy(opts: PubInquiryTablePolicy): PubInquiryTablePolicy {
  return opts
}

export const PUB_INQUIRY_TABLE_REGISTRY = {
  public_inquiry: policy({
    table: 'public_inquiry',
    pk: 'id',
    columns: [
      'id',
      'submitted_at',
      'first_name',
      'last_name',
      'email',
      'phone',
      'preferred_contact_method',
      'matter_type',
      'state_of_residence',
      'county_or_city',
      'related_or_opposing_parties',
      'preferred_day',
      'preferred_time',
      'urgency',
      'deadline_or_hearing_note',
      'summary',
      'acknowledgement_no_attorney_client_relationship',
      'acknowledgement_no_confidential_info',
      'privacy_consent',
      'review_status',
      'lead_source',
      'lead_channel',
      'referring_url',
      'source_system',
      'source_record_id',
      'contact_permission_scope',
      'marketing_consent_status',
      'assigned_to',
      'expires_at',
      'reviewed_by',
      'reviewed_at',
      'promoted_to_contact_id',
      'promoted_to_matter_id',
      'rejection_reason',
      'created_at',
      'updated_at',
    ],
    createColumns: [
      'id',
      'submitted_at',
      'first_name',
      'last_name',
      'email',
      'phone',
      'preferred_contact_method',
      'matter_type',
      'state_of_residence',
      'county_or_city',
      'related_or_opposing_parties',
      'preferred_day',
      'preferred_time',
      'urgency',
      'deadline_or_hearing_note',
      'summary',
      'acknowledgement_no_attorney_client_relationship',
      'acknowledgement_no_confidential_info',
      'privacy_consent',
      'review_status',
      'lead_source',
      'lead_channel',
      'referring_url',
      'source_system',
      'source_record_id',
      'contact_permission_scope',
      'marketing_consent_status',
    ],
    updateColumns: ['review_status', 'lead_source', 'lead_channel', 'referring_url', 'source_system', 'source_record_id', 'contact_permission_scope', 'marketing_consent_status', 'assigned_to', 'expires_at', 'reviewed_by', 'reviewed_at', 'promoted_to_contact_id', 'promoted_to_matter_id', 'rejection_reason', 'updated_at'],
    searchableColumns: ['id', 'submitted_at', 'email', 'phone', 'review_status', 'assigned_to', 'state_of_residence', 'matter_type', 'lead_source', 'lead_channel', 'source_system', 'source_record_id'],
    requiredCreateColumns: ['id', 'submitted_at', 'first_name', 'last_name', 'email', 'phone', 'preferred_contact_method', 'matter_type', 'state_of_residence', 'urgency', 'summary'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: false,
    allowSearch: true,
  }),
  site_feedback: policy({
    table: 'site_feedback',
    pk: 'id',
    columns: [
      'id',
      'submitted_at',
      'app_context',
      'feedback_type',
      'severity',
      'message',
      'visitor_email',
      'route_path',
      'page_url',
      'referrer_url',
      'component_kr_id',
      'viewport_width',
      'viewport_height',
      'user_agent',
      'accept_language',
      'ip_hash',
      'ip_prefix',
      'rate_limit_key_hash',
      'turnstile_success',
      'turnstile_action',
      'turnstile_hostname',
      'turnstile_error_codes',
      'honeypot_triggered',
      'bot_decision',
      'form_started_at',
      'form_submitted_at',
      'created_by_user_id',
      'created_by_email',
      'review_status',
      'reviewed_at',
      'reviewed_by_user_id',
      'internal_notes',
      'created_at',
      'updated_at',
    ],
    createColumns: [
      'id',
      'submitted_at',
      'app_context',
      'feedback_type',
      'severity',
      'message',
      'visitor_email',
      'route_path',
      'page_url',
      'referrer_url',
      'component_kr_id',
      'viewport_width',
      'viewport_height',
      'user_agent',
      'accept_language',
      'ip_hash',
      'ip_prefix',
      'rate_limit_key_hash',
      'turnstile_success',
      'turnstile_action',
      'turnstile_hostname',
      'turnstile_error_codes',
      'honeypot_triggered',
      'bot_decision',
      'form_started_at',
      'form_submitted_at',
      'created_by_user_id',
      'created_by_email',
      'review_status',
    ],
    updateColumns: ['feedback_type', 'severity', 'review_status', 'reviewed_at', 'reviewed_by_user_id', 'internal_notes', 'updated_at'],
    searchableColumns: [
      'id',
      'submitted_at',
      'app_context',
      'feedback_type',
      'severity',
      'visitor_email',
      'route_path',
      'component_kr_id',
      'rate_limit_key_hash',
      'created_by_user_id',
      'created_by_email',
      'review_status',
    ],
    requiredCreateColumns: ['id', 'submitted_at', 'app_context', 'feedback_type', 'severity', 'message', 'review_status', 'bot_decision'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: true,
    allowSearch: true,
  }),
  public_inquiry_metadata: policy({
    table: 'public_inquiry_metadata',
    pk: 'inquiry_id',
    columns: [
      'inquiry_id',
      'submitted_at',
      'request_url',
      'referrer_url',
      'landing_page_url',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'msclkid',
      'ip_hash',
      'ip_prefix',
      'rate_limit_key_hash',
      'user_agent',
      'accept_language',
      'submission_status',
      'created_at',
    ],
    createColumns: [
      'inquiry_id',
      'submitted_at',
      'request_url',
      'referrer_url',
      'landing_page_url',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'msclkid',
      'ip_hash',
      'ip_prefix',
      'rate_limit_key_hash',
      'user_agent',
      'accept_language',
      'submission_status',
    ],
    updateColumns: ['submission_status'],
    searchableColumns: ['inquiry_id', 'submitted_at', 'rate_limit_key_hash', 'ip_hash', 'ip_prefix', 'submission_status'],
    requiredCreateColumns: ['inquiry_id', 'submitted_at'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_bot_signal: policy({
    table: 'public_inquiry_bot_signal',
    pk: 'inquiry_id',
    columns: [
      'inquiry_id',
      'submitted_at',
      'turnstile_success',
      'turnstile_action',
      'turnstile_hostname',
      'turnstile_error_codes',
      'honeypot_triggered',
      'bot_decision',
      'form_started_at',
      'form_submitted_at',
      'created_at',
    ],
    createColumns: [
      'inquiry_id',
      'submitted_at',
      'turnstile_success',
      'turnstile_action',
      'turnstile_hostname',
      'turnstile_error_codes',
      'honeypot_triggered',
      'bot_decision',
      'form_started_at',
      'form_submitted_at',
    ],
    updateColumns: [],
    searchableColumns: ['inquiry_id', 'submitted_at', 'turnstile_success', 'bot_decision', 'honeypot_triggered'],
    requiredCreateColumns: ['inquiry_id', 'submitted_at', 'bot_decision'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: false,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_event: policy({
    table: 'public_inquiry_event',
    pk: 'id',
    columns: ['id', 'inquiry_id', 'event_type', 'event_note', 'created_by', 'created_at'],
    createColumns: ['id', 'inquiry_id', 'event_type', 'event_note', 'created_by'],
    updateColumns: [],
    searchableColumns: ['id', 'inquiry_id', 'event_type', 'created_by', 'created_at'],
    requiredCreateColumns: ['id', 'inquiry_id', 'event_type'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: false,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_review_note: policy({
    table: 'public_inquiry_review_note',
    pk: 'id',
    columns: ['id', 'inquiry_id', 'note_text', 'created_by', 'created_at'],
    createColumns: ['id', 'inquiry_id', 'note_text', 'created_by'],
    updateColumns: [],
    searchableColumns: ['id', 'inquiry_id', 'created_by', 'created_at'],
    requiredCreateColumns: ['id', 'inquiry_id', 'note_text', 'created_by'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: false,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_promotion_log: policy({
    table: 'public_inquiry_promotion_log',
    pk: 'id',
    columns: ['id', 'inquiry_id', 'promoted_to_contact_id', 'promoted_to_matter_id', 'promoted_by', 'promoted_at', 'promotion_note'],
    createColumns: ['id', 'inquiry_id', 'promoted_to_contact_id', 'promoted_to_matter_id', 'promoted_by', 'promoted_at', 'promotion_note'],
    updateColumns: [],
    searchableColumns: ['id', 'inquiry_id', 'promoted_to_contact_id', 'promoted_to_matter_id', 'promoted_by', 'promoted_at'],
    requiredCreateColumns: ['id', 'inquiry_id', 'promoted_by', 'promoted_at'],
    allowCreate: true,
    allowRead: true,
    allowUpdate: false,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_intake_party: policy({
    table: 'public_inquiry_intake_party',
    pk: 'id',
    columns: [
      'id',
      'inquiry_id',
      'party_name',
      'party_role',
      'party_type',
      'contact_hint',
      'conflict_note',
      'created_at',
    ],
    createColumns: [
      'id',
      'inquiry_id',
      'party_name',
      'party_role',
      'party_type',
      'contact_hint',
      'conflict_note',
      'created_at',
    ],
    updateColumns: [
      'party_name',
      'party_role',
      'party_type',
      'contact_hint',
      'conflict_note',
    ],
    searchableColumns: [
      'id',
      'inquiry_id',
      'party_name',
      'party_role',
      'party_type',
      'created_at',
    ],
    requiredCreateColumns: [
      'id',
      'inquiry_id',
      'party_name',
    ],
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_stage_history: policy({
    table: 'public_inquiry_stage_history',
    pk: 'id',
    columns: [
      'id',
      'inquiry_id',
      'previous_status',
      'next_status',
      'event_note',
      'created_by',
      'created_at',
    ],
    createColumns: [
      'id',
      'inquiry_id',
      'previous_status',
      'next_status',
      'event_note',
      'created_by',
      'created_at',
    ],
    updateColumns: [
    ],
    searchableColumns: [
      'id',
      'inquiry_id',
      'previous_status',
      'next_status',
      'created_by',
      'created_at',
    ],
    requiredCreateColumns: [
      'id',
      'inquiry_id',
      'next_status',
      'created_by',
    ],
    allowCreate: true,
    allowRead: true,
    allowUpdate: false,
    allowDelete: false,
    allowSearch: true,
  }),
  public_inquiry_external_map: policy({
    table: 'public_inquiry_external_map',
    pk: 'id',
    columns: [
      'id',
      'inquiry_id',
      'external_system',
      'external_record_type',
      'external_record_id',
      'external_url',
      'sync_status',
      'last_sync_at',
      'created_at',
      'updated_at',
    ],
    createColumns: [
      'id',
      'inquiry_id',
      'external_system',
      'external_record_type',
      'external_record_id',
      'external_url',
      'sync_status',
      'last_sync_at',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'external_url',
      'sync_status',
      'last_sync_at',
      'updated_at',
    ],
    searchableColumns: [
      'id',
      'inquiry_id',
      'external_system',
      'external_record_type',
      'external_record_id',
      'sync_status',
    ],
    requiredCreateColumns: [
      'id',
      'inquiry_id',
      'external_system',
      'external_record_type',
      'external_record_id',
    ],
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: false,
    allowSearch: true,
  }),
} as const

export type PubInquiryTableName = keyof typeof PUB_INQUIRY_TABLE_REGISTRY

/**
 * Type guard for table names accepted by the public inquiry worker.
 *
 * @param table - Candidate table name.
 */
export function isAllowedPubInquiryTable(table: string): table is PubInquiryTableName {
  return table in PUB_INQUIRY_TABLE_REGISTRY
}

/**
 * Gets a public inquiry table policy by table name.
 *
 * @param table - Public inquiry table name.
 */
export function getPubInquiryTablePolicy(table: PubInquiryTableName): PubInquiryTablePolicy {
  return PUB_INQUIRY_TABLE_REGISTRY[table]
}

/**
 * Returns true when the table allows the requested CRUD action.
 *
 * @param table - Public inquiry table name.
 * @param action - CRUD action.
 */
export function isPubInquiryActionAllowed(table: PubInquiryTableName, action: PubInquiryCrudAction): boolean {
  const tablePolicy = getPubInquiryTablePolicy(table)
  if (action === 'CREATE') return tablePolicy.allowCreate
  if (action === 'READ') return tablePolicy.allowRead
  if (action === 'UPDATE') return tablePolicy.allowUpdate
  if (action === 'DELETE') return tablePolicy.allowDelete
  if (action === 'SEARCH') return tablePolicy.allowSearch
  return false
}

/**
 * Finds submitted columns that are not allowed for the requested action.
 *
 * @param table - Public inquiry table name.
 * @param action - CRUD action.
 * @param data - Submitted column/value object.
 */
export function findRejectedPubInquiryColumns(
  table: PubInquiryTableName,
  action: 'CREATE' | 'UPDATE' | 'SEARCH',
  data: Record<string, unknown>,
): string[] {
  const tablePolicy = getPubInquiryTablePolicy(table)
  const allowed = new Set(
    action === 'CREATE'
      ? tablePolicy.createColumns
      : action === 'UPDATE'
        ? tablePolicy.updateColumns
        : tablePolicy.searchableColumns,
  )

  return Object.keys(data).filter((column) => !allowed.has(column))
}

/**
 * Finds required create columns that are absent from an insert object.
 *
 * @param table - Public inquiry table name.
 * @param data - Submitted insert object.
 */
export function findMissingPubInquiryCreateColumns(table: PubInquiryTableName, data: Record<string, unknown>): string[] {
  const tablePolicy = getPubInquiryTablePolicy(table)
  return tablePolicy.requiredCreateColumns.filter((column) => !(column in data) || data[column] === undefined || data[column] === null || data[column] === '')
}

/**
 * Safely quotes a SQL identifier after checking conservative identifier syntax.
 *
 * @param identifier - SQL identifier to quote.
 */
export function quotePubInquiryIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe identifier: ${identifier}`)
  return `"${identifier}"`
}
