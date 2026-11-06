/**
 * @fileoverview Shared types for KR Legal D1 Workers
 * @module d1-workers/shared/types
 */

// ---------------------------------------------------------------------------
// Cloudflare Worker environment bindings
// ---------------------------------------------------------------------------

/** Cloudflare Worker environment — bound in wrangler.json / wrangler.jsonc */
export interface WorkerEnv {
  /** D1 database binding */
  CRUD_WORKER_ASSIGNED_D1: D1Database

  /** KV namespace holding public keys for application worker JWT verification */
  KR_KEYS?: KVNamespace

  /** KV namespace holding public keys for T1/T2 diagnostics and CRUD worker verification */
  PUBLIC_KEYS?: KVNamespace

  /** RSA private key — dev only; use secrets manager in production */
  JWT_PRIVATE_KEY?: string

  /** Worker JWT private key path or value, depending on runtime */
  JWT_WORKER_PRIVATE_KEY?: string

  /** KV key name for the matching worker public key */
  JWT_WORKER_KEY_ID?: string

  /** CRUD Worker private key stored as a Cloudflare Secret */
  CRUD_WORKER_PRIVATE_KEY?: string
}

// ---------------------------------------------------------------------------
// CRUD domains and resources
// ---------------------------------------------------------------------------

export type CrudDomain = 'identity' | 'matter' | 'asset' | 'compliance' | 'admin'

/** SEARCH_BATCH: several read-only searches (any readable tables) run in one D1 batch. */
export type CrudAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'SEARCH_BATCH'
export type PrivilegedCrudAction = 'CONTACT_MAINTENANCE' | 'MAINTENANCE_GATE'

/**
 * D1 table/resource name accepted by the generic CRUD Worker. Runtime table
 * authorization is controlled by table-registry.ts so the registry remains
 * the source of truth as schema v4.1 evolves.
 */
export type ResourceType = string

// ---------------------------------------------------------------------------
// JWT payload
// ---------------------------------------------------------------------------

/**
 * Standard JWT payload embedded in worker requests.
 *
 * For the CRUD Worker Option B design:
 *   - `sub` identifies the trusted API server, not the human user.
 *   - human/admin user information belongs in optional actor fields.
 *   - the Worker validates `iss`, `aud`, `sub`, `purpose`, `action`, and
 *     `resource` before decrypting or executing the CRUD payload.
 */
export interface KRJwtPayload {
  /** Expected: 'kr-website-api' */
  iss: string

  /** Expected: 'crud-worker' */
  aud: string

  /** Expected: 'kr-website-api-server' */
  sub: string

  /** Expected: 'crud-worker-request' */
  purpose: string

  /** CRUD or privileged contact-maintenance operation being requested. */
  action: CrudAction | PrivilegedCrudAction

  /** Target table/resource */
  resource: ResourceType

  /** Issued-at timestamp, Unix seconds */
  iat: number

  /** Expiration timestamp, Unix seconds */
  exp: number

  /** KV key name for the matching public key */
  keyId: string

  /** Request correlation id for audit logging and debugging */
  requestId?: string

  /** Optional Payload/Admin user id for audit logging */
  actorUserId?: string

  /** Optional human or service actor email for audit logging */
  actorEmail?: string

  /** Optional actor role captured at request time for audit logging */
  actorRole?: string

  /** Optional source system for audit logging */
  source?: string
}

// ---------------------------------------------------------------------------
// Encrypted CRUD request payloads
// ---------------------------------------------------------------------------

export interface EncryptedCrudEnvelope {
  alg: 'RSA-OAEP-256+A256GCM'
  wrappedKeyB64: string
  ivB64: string
  ciphertextB64: string
}

export interface CrudAuditMetadata {
  requestedByUserId?: string
  requestedByEmail?: string
  requestedByRole?: string
  requestSource: 'payload-admin' | 'api-route' | 'crud-worker' | 'system' | 'migration' | 'manual' | 'contact-import'
}

export interface CrudCreateGuard {
  /** SQL predicate appended to INSERT ... SELECT ... WHERE for one-statement conditional creates. */
  predicateSql: string
  /** Bound values used by the predicate; callers must never interpolate user input into predicateSql. */
  values?: unknown[]
  /** Optional caller-owned conflict message returned when the guard prevents the insert. */
  conflictMessage?: string
}

export interface GenericCrudCommand<TData = Record<string, unknown>> {
  requestId: string
  action: CrudAction | PrivilegedCrudAction
  table: ResourceType
  targetId?: string
  idempotencyKey?: string
  /** Optional single-statement predicate for caller-defined conditional creates. */
  createGuard?: CrudCreateGuard
  data?: TData
  /** SEARCH filters: value (=), null (IS NULL), array (IN), or { gte, gt, lte, lt, ne, in, isNull } — see crud-worker/search-sql.ts. */
  where?: Record<string, unknown>
  /** SEARCH sort; the primary key is appended for a stable order. */
  orderBy?: Array<{ column: string; direction?: 'asc' | 'desc' }>
  /** SEARCH projection (the primary key is always included). */
  columns?: string[]
  /** SEARCH totals: GROUP BY columns and SUM/COUNT/MIN/MAX measures. */
  aggregate?: { groupBy?: string[]; measures: Array<{ fn: 'sum' | 'count' | 'min' | 'max'; column?: string; as: string }> }
  limit?: number
  offset?: number
  /** SEARCH_BATCH: the searches to run together (`table` must equal queries[0].table for the JWT check). */
  queries?: Array<{
    key?: string
    table: string
    where?: Record<string, unknown>
    orderBy?: Array<{ column: string; direction?: 'asc' | 'desc' }>
    columns?: string[]
    aggregate?: { groupBy?: string[]; measures: Array<{ fn: 'sum' | 'count' | 'min' | 'max'; column?: string; as: string }> }
    limit?: number
    offset?: number
  }>
  audit?: CrudAuditMetadata
}

export interface CrudWorkerRequestBody {
  token: string
  encryptedPayload: EncryptedCrudEnvelope
}

// ---------------------------------------------------------------------------
// Standard worker response envelope
// ---------------------------------------------------------------------------

export interface WorkerResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  code?: number
  requestId?: string
}

// ---------------------------------------------------------------------------
// Common database row shapes
// ---------------------------------------------------------------------------

export interface DbAuditLog {
  id: string
  request_id: string
  actor_user_id: string | null
  actor_email: string | null
  actor_role: string | null
  source: string
  resource: string
  action: string
  target_id: string | null
  idempotency_key: string | null
  success: number
  error_message: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Legacy/plain worker request body
// ---------------------------------------------------------------------------

/**
 * Legacy/plain worker request body.
 *
 * The CRUD Worker should use `CrudWorkerRequestBody` instead because its body
 * includes both the JWT and encrypted payload envelope.
 */
export interface WorkerRequestBody {
  token: string
}

// ---------------------------------------------------------------------------
// Worker domain routing map
// ---------------------------------------------------------------------------

export const RESOURCE_TO_DOMAIN: Record<ResourceType, CrudDomain> = {
  lookup: 'admin',
  user: 'admin',
  user_sso_identity: 'admin',
  kr_session: 'admin',
  kr_homebase_initialization: 'admin',
  client: 'identity',
  lead: 'identity',
  individual: 'identity',
  individual_contact_method: 'identity',
  entity: 'identity',
  entity_contact: 'identity',
  client_address: 'identity',
  client_contact: 'identity',
  matter: 'matter',
  matter_party: 'matter',
  matter_activity_log: 'matter',
  task: 'matter',
  task_assignee: 'matter',
  workstream_activity: 'matter',
  workstream_activity_comment: 'matter',
  event: 'matter',
  time_entry: 'matter',
  invoice: 'matter',
  ledger_entry: 'matter',
  conflict_check: 'matter',
  employee: 'identity',
  employee_time_card: 'identity',
  employee_time_punch: 'identity',
  employee_time_event: 'identity',
  employee_pto_ledger: 'identity',
  pay_period: 'identity',
  media_asset: 'asset',
  media_variant: 'asset',
  document_record: 'asset',
  asset: 'asset',
  asset_ownership: 'asset',
  asset_valuation: 'asset',
  beneficiary_designation: 'asset',
  risk_flag: 'asset',
  funding_action: 'asset',
  action_review_stamp: 'asset',
  requested_document: 'asset',
  asset_detail_bank: 'asset',
  asset_detail_retirement: 'asset',
  asset_detail_real_estate: 'asset',
  asset_detail_insurance: 'asset',
  asset_detail_vehicle: 'asset',
  asset_detail_entity: 'asset',
  asset_detail_tangible: 'asset',
  asset_detail_digital: 'asset',
  entity_dba: 'compliance',
  entity_registration: 'compliance',
  compliance_filing: 'compliance',
  entity_event: 'compliance',
  repository: 'compliance',
  audit_log: 'admin',
}
