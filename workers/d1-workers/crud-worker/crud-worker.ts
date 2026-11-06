/**
 * @fileoverview KR Legal — Generic CRUD Worker
 * @module d1-workers/crud-worker/crud-worker.ts
 * @see {@link https://docs.google.com/document/d/1Orte0336amgeFMoLFTwip2XHN0sXbZr7og2aRZXzu-E/edit?tab=t.moxmqk2g0tm#heading=h.lz72jnfiqoua see also 06.1 CRUD Workers}
 *
 * Purpose:
 *   Generic encrypted CRUD bridge for the KR Legal D1 database.
 *   The main flow is still table-agnostic:
 *
 * Security flow:
 *   1. Accept POST body containing JWT and encrypted CRUD payload.
 *   2. Verify JWT using env.PUBLIC_KEYS.
 *   3. Confirm trusted server JWT claims.
 *   4. Decrypt encrypted payload using env.CRUD_WORKER_PRIVATE_KEY.
 *   5. Validate table/action/columns against table-registry.ts.
 *   6. Execute safe D1 prepared statements.
 *   7. Write audit_log for valid decrypted operations, except audit_log itself.
 */

import { verifyJwt } from '../shared/jwt'
import { err } from '../shared/responses'
import { executeContactMaintenance } from './contact-maintenance'
import { runSearches, validateSearches, type SearchQuery } from './search-sql'
import type {
  CrudWorkerRequestBody,
  EncryptedCrudEnvelope,
  GenericCrudCommand,
  KRJwtPayload,
  WorkerEnv,
} from '../shared/types'
import {
  findMissingCreateColumns,
  findRejectedColumns,
  getTablePolicy,
  isActionAllowed,
  isAllowedTable,
  quoteIdentifier,
  type TableName,
} from '../shared/table-registry'

const TRUSTED_JWT_ISSUER = 'kr-website-api'
const TRUSTED_JWT_AUDIENCE = 'crud-worker'
const TRUSTED_JWT_SUBJECT = 'kr-website-api-server'
const TRUSTED_JWT_PURPOSE = 'crud-worker-request'

type ExtendedWorkerEnv = WorkerEnv & {
  CRUD_WORKER_PRIVATE_KEY: string
}

type JsonResponseBody = {
  ok: boolean
  [key: string]: unknown
}

type BuiltSql = {
  sql: string
  values: unknown[]
}

type MaintenanceGateState = {
  locked: boolean
  reason: string | null
}

const MUTATING_ACTIONS = new Set<GenericCrudCommand['action']>([
  'CREATE',
  'UPDATE',
  'DELETE',
  'CONTACT_MAINTENANCE',
])

type MaintenanceGateOperation = 'status' | 'lock' | 'unlock'

/**
 * Reads the single KR Homebase application-write gate.
 *
 * The table is deliberately outside the generic table registry: callers do
 * not get a generic CRUD route for changing the gate. Lock/unlock uses the
 * fixed-purpose Super Admin maintenance command; direct SQL remains available
 * in D1 Data Studio.
 *
 * A missing table is treated as unlocked so an older deployment does not
 * unexpectedly take the whole application offline before migration 0008 is
 * applied. Once the table exists, other D1 errors are surfaced to the caller.
 */
async function readMaintenanceGate(db: D1Database): Promise<MaintenanceGateState> {
  try {
    const row = await db
      .prepare("SELECT locked, reason FROM kr_maintenance_gate WHERE id = 'krhomebase' LIMIT 1")
      .first<{ locked?: number | string | null; reason?: string | null }>()

    return {
      locked: row?.locked === 1 || row?.locked === '1',
      reason: typeof row?.reason === 'string' && row.reason.trim() ? row.reason.trim() : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/no such table|does not exist/i.test(message)) {
      console.warn('[MAINTENANCE_GATE] kr_maintenance_gate is not installed; treating the application as unlocked')
      return { locked: false, reason: null }
    }
    throw error
  }
}

/** Blocks application writes while the D1-controlled gate is locked. */
async function enforceMaintenanceGate(db: D1Database, payload: GenericCrudCommand): Promise<Response | null> {
  if (!MUTATING_ACTIONS.has(payload.action)) return null
  if (payload.audit?.requestSource === 'contact-import') return null

  try {
    const gate = await readMaintenanceGate(db)
    if (!gate.locked) return null

    const reason = gate.reason ? ` reason=${gate.reason.replace(/[\r\n]+/g, ' ').slice(0, 160)}` : ''
    return err(`KRHOMEBASE_MAINTENANCE_LOCKED${reason}`, 423)
  } catch (error) {
    console.error('[MAINTENANCE_GATE] check failed', error)
    return err('KRHOMEBASE_MAINTENANCE_GATE_UNAVAILABLE', 503)
  }
}

/** Executes the only supported application control for kr_maintenance_gate. */
async function executeMaintenanceGate(db: D1Database, payload: GenericCrudCommand): Promise<Response> {
  const operation = String(payload.data?.operation ?? '') as MaintenanceGateOperation
  const reason = typeof payload.data?.reason === 'string' ? payload.data.reason.trim().slice(0, 240) : null
  const setBy = payload.audit?.requestedByEmail ?? payload.audit?.requestedByUserId ?? 'super_admin'

  try {
    if (operation === 'status') {
      const row = await db
        .prepare("SELECT id, locked, reason, set_by, set_at, updated_at FROM kr_maintenance_gate WHERE id = 'krhomebase' LIMIT 1")
        .first()
      await auditBestEffort(db, payload, true, null)
      return json({ ok: true, action: payload.action, table: payload.table, gate: row })
    }

    if (operation !== 'lock' && operation !== 'unlock') {
      return err('VALIDATION_MAINTENANCE_GATE_OPERATION_REQUIRED', 422)
    }

    const locked = operation === 'lock' ? 1 : 0
    const result = await db
      .prepare("UPDATE kr_maintenance_gate SET locked = ?, reason = ?, set_by = ?, set_at = datetime('now'), updated_at = datetime('now') WHERE id = 'krhomebase'")
      .bind(locked, locked ? reason || 'Contact import review' : null, setBy)
      .run()
    if (Number(result.meta.changes ?? 0) !== 1) return err('KRHOMEBASE_MAINTENANCE_GATE_NOT_FOUND', 404)

    const row = await db
      .prepare("SELECT id, locked, reason, set_by, set_at, updated_at FROM kr_maintenance_gate WHERE id = 'krhomebase' LIMIT 1")
      .first()
    await auditBestEffort(db, payload, true, null)
    return json({ ok: true, action: payload.action, table: payload.table, gate: row })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown D1 error'
    return err(`KRHOMEBASE_MAINTENANCE_GATE_FAILED: ${message}`, 500)
  }
}

const CLIENT_NUMBER_MIN_DIGITS = 3
const GENERAL_MATTER_TITLE = 'Client General Matters'
const GENERAL_MATTER_PRACTICE_AREA_LOOKUP_ID = 'lk_practice_area_miscellaneous'
const GENERAL_MATTER_STATUS_LOOKUP_ID = 'lk_matter_status_open'
const PRIMARY_CLIENT_PARTY_ROLE_LOOKUP_ID = 'lk_party_role_primary_client'

/**
 * Public record identifiers are deliberately short and opaque. They are
 * seven characters from the uppercase A-Z/0-9 alphabet, while each record's
 * UUID remains the internal relational key. Every generated value contains
 * at least one letter and one digit; D1 UNIQUE constraints remain the final
 * authority and the insert helpers retry rare collisions.
 */
const PUBLIC_RECORD_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const PUBLIC_RECORD_ID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const PUBLIC_RECORD_ID_DIGITS = '0123456789'
const PUBLIC_RECORD_ID_LENGTH = 7
const WORKSTREAM_ACTIVITY_WSID_MAX_ATTEMPTS = 8
const INDIVIDUAL_ICID_MAX_ATTEMPTS = 8
const ENTITY_ECID_MAX_ATTEMPTS = 8
const LEAD_LCID_MAX_ATTEMPTS = 8
const DOCUMENT_RECORD_NUMBER_MAX_ATTEMPTS = 8
/** time_entry.bcid / invoice.ivid: same alphabet and retry budget as document_number. */
const BILLING_PUBLIC_CODE_MAX_ATTEMPTS = 8

/**
 * Returns whether a JSON control value represents true.
 *
 * @param value - Worker command control value.
 * @returns True for supported boolean representations.
 */
function isTrueControl(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1'
}

/**
 * Removes non-persisted domain controls from a generic CRUD row.
 *
 * `client_id` on a Matter is deliberately a command control because the
 * canonical relationship remains in matter_party; `create_general_matter`
 * requests an atomic Client plus General Matter create.
 *
 * @param table - Target table.
 * @param data - Incoming row data.
 * @returns Data safe to pass to the table INSERT statement.
 */
function persistedCreateData(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const rVal = { ...data }
  if (table === 'matter') {
    delete rVal.client_id
    delete rVal.generate_matter_number
  }
  if (table === 'client') delete rVal.create_general_matter
  return rVal
}

/** Returns one unbiased random character from a short alphabet. */
function randomPublicRecordCharacter(alphabet: string): string {
  const unbiasedLimit = 256 - (256 % alphabet.length)
  while (true) {
    const bytes = new Uint8Array(1)
    crypto.getRandomValues(bytes)
    if (bytes[0] < unbiasedLimit) return alphabet[bytes[0] % alphabet.length]
  }
}

/** Returns one unbiased random index below the supplied exclusive maximum. */
function randomPublicRecordIndex(maxExclusive: number): number {
  const unbiasedLimit = 256 - (256 % maxExclusive)
  while (true) {
    const bytes = new Uint8Array(1)
    crypto.getRandomValues(bytes)
    if (bytes[0] < unbiasedLimit) return bytes[0] % maxExclusive
  }
}

/** Generates a mixed seven-character public identifier such as K7M2Q9A. */
function generateMixedPublicRecordId(): string {
  const characters = [
    randomPublicRecordCharacter(PUBLIC_RECORD_ID_LETTERS),
    randomPublicRecordCharacter(PUBLIC_RECORD_ID_DIGITS),
  ]
  while (characters.length < PUBLIC_RECORD_ID_LENGTH) {
    characters.push(randomPublicRecordCharacter(PUBLIC_RECORD_ID_ALPHABET))
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomPublicRecordIndex(index + 1)
    const current = characters[index]
    characters[index] = characters[swapIndex]
    characters[swapIndex] = current
  }

  return characters.join('')
}

/** Generates a mixed seven-character WorkStream Activity WSID candidate. */
function generateWorkstreamActivityWsid(): string {
  return generateMixedPublicRecordId()
}

/**
 * Returns whether an insert failure is the expected public WSID collision.
 *
 * @param error - D1 error raised by the attempted activity insert.
 * @returns True only for the WorkStream Activity WSID unique index conflict.
 */
function isWorkstreamActivityWsidConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('UNIQUE constraint failed: workstream_activity.wsid')
}

/** Returns whether D1 reported a generated public-code uniqueness collision. */
function isGeneratedPublicCodeConflict(error: unknown, table: string, column: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(`UNIQUE constraint failed: ${table}.${column}`)
    || message.includes(`${table}_${column}`)
}

/**
 * Normalizes a positive numeric Client Number with a minimum display width.
 *
 * @param value - Candidate Client Number.
 * @returns Canonical Client Number or null.
 */
function normalizeClientNumber(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) return null

  try {
    const numeric = BigInt(raw)
    if (numeric < 1n) return null
    return numeric.toString().padStart(CLIENT_NUMBER_MIN_DIGITS, '0')
  } catch {
    return null
  }
}

/**
 * Builds the next Matter Number for an existing Client.
 *
 * @param db - D1 database.
 * @param clientNumber - Canonical Client Number.
 * @returns Next available positive Matter sequence.
 */
async function nextMatterNumber(db: D1Database, clientNumber: string): Promise<string> {
  const rows = await db
    .prepare('SELECT matter_number FROM matter WHERE matter_number LIKE ?')
    .bind(`${clientNumber}.%`)
    .all<{ matter_number: string | null }>()
  let nextSequence = 1
  const prefix = `${clientNumber}.`

  for (const row of rows.results ?? []) {
    const matterNumber = row.matter_number ?? ''
    if (!matterNumber.startsWith(prefix)) continue
    const sequence = Number(matterNumber.slice(prefix.length))
    if (Number.isSafeInteger(sequence) && sequence >= 1) nextSequence = Math.max(nextSequence, sequence + 1)
  }

  return `${clientNumber}.${nextSequence}`
}

function json(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

function privatePemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '')

  return base64ToArrayBuffer(base64)
}

async function decryptCrudPayload(
    encryptedPayload: EncryptedCrudEnvelope,
    privateKeyPem: string,
): Promise<GenericCrudCommand> {
  if (encryptedPayload.alg !== 'RSA-OAEP-256+A256GCM') {
    throw new Error(`Unsupported encrypted payload algorithm: ${encryptedPayload.alg}`)
  }

  const privateKeyDer = privatePemToArrayBuffer(privateKeyPem)

  const rsaPrivateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyDer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      false,
      ['decrypt'],
  )

  const rawAesKey = await crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP',
      },
      rsaPrivateKey,
      base64ToArrayBuffer(encryptedPayload.wrappedKeyB64),
  )

  const aesKey = await crypto.subtle.importKey(
      'raw',
      rawAesKey,
      {
        name: 'AES-GCM',
      },
      false,
      ['decrypt'],
  )

  const clearText = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToArrayBuffer(encryptedPayload.ivB64),
      },
      aesKey,
      base64ToArrayBuffer(encryptedPayload.ciphertextB64),
  )

  return JSON.parse(new TextDecoder().decode(clearText)) as GenericCrudCommand
}

function validateTrustedServerJwt(jwt: KRJwtPayload): Response | null {
  if (jwt.iss !== TRUSTED_JWT_ISSUER) {
    return err(`AUTH_INVALID_ISSUER: expected ${TRUSTED_JWT_ISSUER}`, 401)
  }

  if (jwt.aud !== TRUSTED_JWT_AUDIENCE) {
    return err(`AUTH_INVALID_AUDIENCE: expected ${TRUSTED_JWT_AUDIENCE}`, 401)
  }

  if (jwt.sub !== TRUSTED_JWT_SUBJECT) {
    return err(`AUTH_INVALID_SUBJECT: expected ${TRUSTED_JWT_SUBJECT}`, 401)
  }

  if (jwt.purpose !== TRUSTED_JWT_PURPOSE) {
    return err(`AUTH_INVALID_PURPOSE: expected ${TRUSTED_JWT_PURPOSE}`, 401)
  }

  if (!jwt.action) {
    return err('AUTH_MISSING_ACTION', 401)
  }

  if (!jwt.resource) {
    return err('AUTH_MISSING_RESOURCE', 401)
  }

  return null
}

function validatePayloadAgainstJwt(payload: GenericCrudCommand, jwt: KRJwtPayload): Response | null {
  if (payload.action === 'CONTACT_MAINTENANCE' && (jwt.actorRole !== 'super_admin' || payload.audit?.requestedByRole !== jwt.actorRole)) {
    return err('CONTACT_MAINTENANCE_FORBIDDEN', 403)
  }
  if (payload.action === 'MAINTENANCE_GATE' && (jwt.actorRole !== 'super_admin' || payload.audit?.requestedByRole !== jwt.actorRole)) {
    return err('MAINTENANCE_GATE_FORBIDDEN', 403)
  }
  if (payload.action !== jwt.action) {
    return err(`PAYLOAD_ACTION_MISMATCH: JWT=${jwt.action}, payload=${payload.action}`, 400)
  }

  if (payload.table !== jwt.resource) {
    return err(`PAYLOAD_TABLE_RESOURCE_MISMATCH: JWT=${jwt.resource}, payload=${payload.table}`, 400)
  }

  return null
}

function validateCrudCommand(payload: GenericCrudCommand): Response | null {
  if (!payload.requestId) {
    return err('VALIDATION_MISSING_REQUEST_ID', 422)
  }

  if (!payload.action) {
    return err('VALIDATION_MISSING_ACTION', 422)
  }

  if (!payload.table) {
    return err('VALIDATION_MISSING_TABLE', 422)
  }

  // A distinct action makes older Workers fail closed instead of accidentally
  // interpreting privileged maintenance as an ordinary unguarded DELETE.
  if (payload.action === 'CONTACT_MAINTENANCE') {
    if (!isAllowedTable(payload.table)) return err(`VALIDATION_UNKNOWN_TABLE: ${payload.table}`, 422)
    if (!['individual', 'entity'].includes(payload.table) || !payload.targetId || !['removal_preflight', 'delete', 'inactivate'].includes(String(payload.data?.operation))) {
      return err('VALIDATION_MAINTENANCE_OPERATION_REQUIRED', 422)
    }
    return null
  }

  if (payload.action === 'MAINTENANCE_GATE') {
    if (payload.table !== 'kr_maintenance_gate' || !['status', 'lock', 'unlock'].includes(String(payload.data?.operation))) {
      return err('VALIDATION_MAINTENANCE_GATE_OPERATION_REQUIRED', 422)
    }
    return null
  }

  if (!isAllowedTable(payload.table)) {
    return err(`VALIDATION_UNKNOWN_TABLE: ${payload.table}`, 422)
  }

  if (!isActionAllowed(payload.table, payload.action)) {
    return err(`ACTION_NOT_ALLOWED: ${payload.action} ${payload.table}`, 403)
  }

  if (payload.createGuard) {
    if (payload.action !== 'CREATE') {
      return err('VALIDATION_CREATE_GUARD_REQUIRES_CREATE', 422)
    }
    if (!payload.createGuard.predicateSql.trim()) {
      return err('VALIDATION_CREATE_GUARD_PREDICATE_REQUIRED', 422)
    }
    if (/[;]|--|\/\*/.test(payload.createGuard.predicateSql)) {
      return err('VALIDATION_CREATE_GUARD_PREDICATE_REJECTED', 422)
    }
    if (payload.createGuard.values && !Array.isArray(payload.createGuard.values)) {
      return err('VALIDATION_CREATE_GUARD_VALUES_INVALID', 422)
    }
  }

  if ((payload.action === 'CREATE' || payload.action === 'UPDATE') && (!payload.data || !Object.keys(payload.data).length)) {
    return err(`VALIDATION_MISSING_DATA: ${payload.action} requires data`, 422)
  }

  if ((payload.action === 'READ' || payload.action === 'UPDATE' || payload.action === 'DELETE') && !payload.targetId) {
    return err(`VALIDATION_MISSING_TARGET_ID: ${payload.action} requires targetId`, 422)
  }

  if (payload.action === 'CREATE' && payload.data) {
    if (payload.table === 'client' && !isTrueControl(payload.data.create_general_matter)) {
      return err('VALIDATION_CLIENT_CREATE_REQUIRES_GENERAL_MATTER', 422)
    }

    if (payload.table === 'matter' && !String(payload.data.client_id ?? '').trim()) {
      return err('VALIDATION_MATTER_REQUIRES_CLIENT', 422)
    }

    // Public WorkStream Activity WSIDs are generated here, after the trusted
    // command reaches the CRUD Worker. See `generateWorkstreamActivityWsid`.
    if (payload.table === 'workstream_activity' && Object.prototype.hasOwnProperty.call(payload.data, 'wsid')) {
      return err('VALIDATION_WORKSTREAM_ACTIVITY_WSID_WORKER_GENERATED', 422)
    }

    if (payload.table === 'workstream_activity') {
      const hasClientOwner = Boolean(String(payload.data.client_id ?? '').trim())
      const hasLeadOwner = Boolean(String(payload.data.lead_id ?? '').trim())
      if (hasClientOwner === hasLeadOwner) return err('VALIDATION_WORKSTREAM_ACTIVITY_EXACTLY_ONE_OWNER', 422)
      if (payload.data.visibility !== undefined && payload.data.visibility !== 'internal') return err('VALIDATION_WORKSTREAM_ACTIVITY_VISIBILITY_INTERNAL_ONLY', 422)
    }

    if (payload.table === 'individual' && Object.prototype.hasOwnProperty.call(payload.data, 'icid')) {
      return err('VALIDATION_INDIVIDUAL_ICID_WORKER_GENERATED', 422)
    }

    if (payload.table === 'entity' && Object.prototype.hasOwnProperty.call(payload.data, 'ecid')) {
      return err('VALIDATION_ENTITY_ECID_WORKER_GENERATED', 422)
    }

    if (payload.table === 'lead' && Object.prototype.hasOwnProperty.call(payload.data, 'lcid')) {
      return err('VALIDATION_LEAD_LCID_WORKER_GENERATED', 422)
    }

    const data = persistedCreateData(payload.table, payload.data)
    const rejected = findRejectedColumns(payload.table, 'CREATE', data)

    if (rejected.length) {
      return err(`VALIDATION_REJECTED_CREATE_COLUMNS: ${rejected.join(', ')}`, 422)
    }

    const missing = findMissingCreateColumns(payload.table, data).filter((column) =>
      !(payload.table === 'matter' && column === 'matter_number' && isTrueControl(payload.data?.generate_matter_number)),
    )

    if (missing.length) {
      return err(`VALIDATION_MISSING_CREATE_COLUMNS: ${missing.join(', ')}`, 422)
    }
  }

  if (payload.action === 'UPDATE' && payload.data) {
    if (payload.table === 'client' && payload.data.client_number !== undefined && !normalizeClientNumber(payload.data.client_number)) {
      return err('VALIDATION_INVALID_CLIENT_NUMBER', 422)
    }
    if (payload.table === 'matter' && Object.prototype.hasOwnProperty.call(payload.data, 'matter_number')) {
      return err('VALIDATION_MATTER_NUMBER_READ_ONLY', 422)
    }
    const rejected = findRejectedColumns(payload.table, 'UPDATE', payload.data)

    if (rejected.length) {
      return err(`VALIDATION_REJECTED_UPDATE_COLUMNS: ${rejected.join(', ')}`, 422)
    }
  }

  if (payload.action === 'SEARCH') {
    const problem = validateSearches([searchQueryFromPayload(payload)])
    if (problem) return err(problem, problem.startsWith('ACTION_NOT_ALLOWED') ? 403 : 422)
  }

  if (payload.action === 'SEARCH_BATCH') {
    if (!Array.isArray(payload.queries) || payload.queries[0]?.table !== payload.table) {
      return err('VALIDATION_SEARCH_BATCH_TABLE_MISMATCH: table must equal queries[0].table', 422)
    }
    const problem = validateSearches(payload.queries as SearchQuery[])
    if (problem) return err(problem, problem.startsWith('ACTION_NOT_ALLOWED') ? 403 : 422)
  }

  return null
}

function buildInsertSql(table: TableName, data: Record<string, unknown>): BuiltSql {
  const policy = getTablePolicy(table)
  const allowed = new Set(policy.createColumns)
  const persisted = persistedCreateData(table, data)
  const columns = Object.keys(persisted).filter((column) => allowed.has(column))

  if (!columns.length) {
    throw new Error(`No insertable columns provided for ${table}`)
  }

  const tableSql = quoteIdentifier(policy.table)
  const columnSql = columns.map(quoteIdentifier).join(', ')
  const placeholders = columns.map(() => '?').join(', ')

  return {
    sql: `INSERT INTO ${tableSql} (${columnSql}) VALUES (${placeholders})`,
    values: columns.map((column) => persisted[column]),
  }
}

function buildGuardedInsertSql(payload: GenericCrudCommand): BuiltSql {
  if (!isAllowedTable(payload.table)) throw new Error('VALIDATION_UNKNOWN_TABLE')
  if (!payload.createGuard) return buildInsertSql(payload.table, payload.data ?? {})
  const policy = getTablePolicy(payload.table)
  const allowed = new Set(policy.createColumns)
  const data = persistedCreateData(payload.table, payload.data ?? {})
  const columns = Object.keys(data).filter((column) => allowed.has(column))

  if (!columns.length) {
    throw new Error(`No insertable columns provided for ${payload.table}`)
  }

  const tableSql = quoteIdentifier(policy.table)
  const columnSql = columns.map(quoteIdentifier).join(', ')
  const placeholders = columns.map(() => '?').join(', ')

  return {
    sql: `INSERT INTO ${tableSql} (${columnSql}) SELECT ${placeholders} WHERE ${payload.createGuard.predicateSql}`,
    values: [...columns.map((column) => data[column]), ...(payload.createGuard.values ?? [])],
  }
}

/**
 * Inserts a WorkStream Activity after assigning its public WSID in this
 * Worker. The retry is intentionally narrow: every other D1 error is allowed
 * to propagate to the normal CRUD error path. D1's UNIQUE constraint remains
 * the authoritative uniqueness guarantee.
 *
 * @param db - D1 database containing `workstream_activity`.
 * @param payload - Validated CREATE command.
 * @param data - Persisted activity fields, without a caller-selected WSID.
 * @returns The successful insert result and the data containing its WSID.
 */
async function insertWorkstreamActivityWithGeneratedWsid(
    db: D1Database,
    payload: GenericCrudCommand,
    data: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; result: D1Result<unknown> }> {
  for (let attempt = 1; attempt <= WORKSTREAM_ACTIVITY_WSID_MAX_ATTEMPTS; attempt += 1) {
    const candidateData = { ...data, wsid: generateWorkstreamActivityWsid() }
    const candidatePayload = { ...payload, data: candidateData }
    const built = payload.createGuard ? buildGuardedInsertSql(candidatePayload) : buildInsertSql('workstream_activity', candidateData)

    try {
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return { data: candidateData, result }
    } catch (error) {
      if (!isWorkstreamActivityWsidConflict(error) || attempt === WORKSTREAM_ACTIVITY_WSID_MAX_ATTEMPTS) throw error
    }
  }

  throw new Error('WORKSTREAM_ACTIVITY_WSID_GENERATION_FAILED')
}

/** Inserts an identity row after generating and collision-checking its public code. */
async function insertIdentityWithGeneratedCode(
  db: D1Database,
  payload: GenericCrudCommand,
  data: Record<string, unknown>,
  table: 'individual' | 'entity',
  column: 'icid' | 'ecid',
  maxAttempts: number,
): Promise<{ data: Record<string, unknown>; result: D1Result<unknown> }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidateData = { ...data, [column]: generateMixedPublicRecordId() }
    const candidatePayload = { ...payload, data: candidateData }
    const built = payload.createGuard ? buildGuardedInsertSql(candidatePayload) : buildInsertSql(table, candidateData)

    try {
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return { data: candidateData, result }
    } catch (error) {
      if (!isGeneratedPublicCodeConflict(error, table, column) || attempt === maxAttempts) throw error
    }
  }

  throw new Error(`GENERATED_${column.toUpperCase()}_FAILED`)
}

/**
 * Inserts a document_record after assigning its public seven-character
 * `document_number` (same mixed alphabet as WSID/ICID). A caller-supplied
 * `document_number` is kept as-is (imports); only a missing/blank one is
 * generated. `document_record.document_number` is UNIQUE in D1, which remains
 * the authoritative guarantee; collisions retry narrowly like the others.
 */
async function insertDocumentRecordWithGeneratedNumber(
  db: D1Database,
  payload: GenericCrudCommand,
  data: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; result: D1Result<unknown> }> {
  if (String(data.document_number ?? '').trim()) {
    const built = payload.createGuard ? buildGuardedInsertSql({ ...payload, data }) : buildInsertSql('document_record', data)
    const result = await db.prepare(built.sql).bind(...built.values).run()
    return { data, result }
  }
  for (let attempt = 1; attempt <= DOCUMENT_RECORD_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const candidateData = { ...data, document_number: generateMixedPublicRecordId() }
    const candidatePayload = { ...payload, data: candidateData }
    const built = payload.createGuard ? buildGuardedInsertSql(candidatePayload) : buildInsertSql('document_record', candidateData)

    try {
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return { data: candidateData, result }
    } catch (error) {
      if (!isGeneratedPublicCodeConflict(error, 'document_record', 'document_number') || attempt === DOCUMENT_RECORD_NUMBER_MAX_ATTEMPTS) throw error
    }
  }

  throw new Error('GENERATED_DOCUMENT_NUMBER_FAILED')
}

/**
 * Inserts a billing row (time_entry or invoice) after assigning its public
 * seven-character code — `bcid` (Billing Code ID) or `ivid` (Invoice ID).
 * A caller-supplied code is kept as-is; only a missing/blank one is generated.
 * The partial UNIQUE indexes idx_time_entry_bcid / idx_invoice_ivid (migration
 * 20260925_billing_public_ids.sql) are the authoritative guarantee; collisions
 * retry narrowly like the other public codes.
 */
async function insertBillingRowWithGeneratedCode(
  db: D1Database,
  payload: GenericCrudCommand,
  data: Record<string, unknown>,
  table: 'time_entry' | 'invoice',
  column: 'bcid' | 'ivid',
): Promise<{ data: Record<string, unknown>; result: D1Result<unknown> }> {
  if (String(data[column] ?? '').trim()) {
    const built = payload.createGuard ? buildGuardedInsertSql({ ...payload, data }) : buildInsertSql(table, data)
    const result = await db.prepare(built.sql).bind(...built.values).run()
    return { data, result }
  }
  for (let attempt = 1; attempt <= BILLING_PUBLIC_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidateData = { ...data, [column]: generateMixedPublicRecordId() }
    const candidatePayload = { ...payload, data: candidateData }
    const built = payload.createGuard ? buildGuardedInsertSql(candidatePayload) : buildInsertSql(table, candidateData)

    try {
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return { data: candidateData, result }
    } catch (error) {
      if (!isGeneratedPublicCodeConflict(error, table, column) || attempt === BILLING_PUBLIC_CODE_MAX_ATTEMPTS) throw error
    }
  }

  throw new Error(`GENERATED_${column.toUpperCase()}_FAILED`)
}

/** Inserts a lead after assigning the next human-friendly L001-style LCID. */
async function insertLeadWithGeneratedLcid(
  db: D1Database,
  payload: GenericCrudCommand,
  data: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; result: D1Result<unknown> }> {
  for (let attempt = 1; attempt <= LEAD_LCID_MAX_ATTEMPTS; attempt += 1) {
    const maxRow = await db.prepare("SELECT MAX(CAST(SUBSTR(lcid, 2) AS INTEGER)) AS max_number FROM lead WHERE lcid GLOB 'L[0-9]*'").first<{ max_number: number | null }>()
    const nextNumber = Number(maxRow?.max_number ?? 0) + 1
    const candidateData = { ...data, lcid: `L${String(nextNumber).padStart(3, '0')}` }
    const candidatePayload = { ...payload, data: candidateData }
    const built = payload.createGuard ? buildGuardedInsertSql(candidatePayload) : buildInsertSql('lead', candidateData)

    try {
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return { data: candidateData, result }
    } catch (error) {
      if (!isGeneratedPublicCodeConflict(error, 'lead', 'lcid') || attempt === LEAD_LCID_MAX_ATTEMPTS) throw error
    }
  }

  throw new Error('GENERATED_LCID_FAILED')
}

function buildReadSql(table: TableName, targetId: string): BuiltSql {
  const policy = getTablePolicy(table)
  const tableSql = quoteIdentifier(policy.table)
  const pkSql = quoteIdentifier(policy.pk)

  return {
    sql: `SELECT * FROM ${tableSql} WHERE ${pkSql} = ? LIMIT 1`,
    values: [targetId],
  }
}

function buildUpdateSql(table: TableName, targetId: string, data: Record<string, unknown>): BuiltSql {
  const policy = getTablePolicy(table)
  const allowed = new Set(policy.updateColumns)
  const columns = Object.keys(data).filter((column) => allowed.has(column))

  if (!columns.length) {
    throw new Error(`No updatable columns provided for ${table}`)
  }

  const tableSql = quoteIdentifier(policy.table)
  const pkSql = quoteIdentifier(policy.pk)
  const setClause = columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')

  return {
    sql: `UPDATE ${tableSql} SET ${setClause} WHERE ${pkSql} = ?`,
    values: [...columns.map((column) => data[column]), targetId],
  }
}

function buildDeleteSql(table: TableName, targetId: string): BuiltSql {
  const policy = getTablePolicy(table)
  const tableSql = quoteIdentifier(policy.table)
  const pkSql = quoteIdentifier(policy.pk)

  return {
    sql: `DELETE FROM ${tableSql} WHERE ${pkSql} = ?`,
    values: [targetId],
  }
}

/** The SEARCH payload as one search-sql query (same rules as each SEARCH_BATCH query). */
function searchQueryFromPayload(payload: GenericCrudCommand): SearchQuery {
  const rVal: SearchQuery = {
    table: payload.table,
    where: payload.where,
    orderBy: payload.orderBy,
    columns: payload.columns,
    aggregate: payload.aggregate,
    limit: payload.limit,
    offset: payload.offset,
  }
  return rVal
}

/**
 * Returns a previously written idempotent row for a replayed create request.
 *
 * The unique database index is the concurrency guard; this lookup turns the
 * resulting conflict into an idempotent success for ordinary network retries.
 *
 * @param db - D1 database containing the requested table.
 * @param payload - Validated CRUD command.
 * @returns Existing row or null.
 */
async function findIdempotentCreateRow(
    db: D1Database,
    payload: GenericCrudCommand,
): Promise<Record<string, unknown> | null> {
  if (payload.action !== 'CREATE' || !payload.idempotencyKey || payload.data?.idempotency_key !== payload.idempotencyKey) return null
  if (!isAllowedTable(payload.table)) return null
  const policy = getTablePolicy(payload.table)
  if (!policy.searchableColumns.includes('idempotency_key')) return null
  return db
      .prepare(`SELECT * FROM ${quoteIdentifier(policy.table)} WHERE ${quoteIdentifier('idempotency_key')} = ? LIMIT 1`)
      .bind(payload.idempotencyKey)
      .first<Record<string, unknown>>()
}

async function writeAuditLog(
    db: D1Database,
    payload: GenericCrudCommand,
    success: boolean,
    errorMessage: string | null,
): Promise<void> {
  if (!isAllowedTable(payload.table)) {
    return
  }

  const policy = getTablePolicy(payload.table)
  // A batch is audited once, when any of its tables is audited.
  const batchTables = payload.action === 'SEARCH_BATCH' ? [...new Set((payload.queries ?? []).map((query) => query.table))] : []
  const audited = payload.action === 'SEARCH_BATCH'
    ? batchTables.some((table) => isAllowedTable(table) && getTablePolicy(table).audit)
    : policy.audit

  if (!audited) {
    return
  }

  const targetId = payload.targetId ?? (payload.data?.id ? String(payload.data.id) : null)
  const maybeMatterId =
      payload.table === 'matter'
        ? targetId
        : payload.data?.matter_id
          ? String(payload.data.matter_id)
          : payload.where?.matter_id
            ? String(payload.where.matter_id)
            : null
  const maybeClientId =
      payload.table === 'client'
        ? targetId
        : payload.data?.client_id
          ? String(payload.data.client_id)
          : payload.data?.billed_to_client_id
            ? String(payload.data.billed_to_client_id)
            : payload.where?.client_id
              ? String(payload.where.client_id)
              : null
  const newJson =
      payload.action === 'CREATE' || payload.action === 'UPDATE'
        ? JSON.stringify(payload.data ?? {})
        : payload.action === 'SEARCH_BATCH'
          ? JSON.stringify({ tables: batchTables, queries: payload.queries?.length ?? 0 })
          : null

  await db
      .prepare(
          `
        INSERT INTO audit_log (
          id,
          request_id,
          actor_user_id,
          actor_email,
          actor_role,
          source,
          resource,
          action,
          target_table,
          target_id,
          matter_id,
          client_id,
          previous_json,
          new_json,
          idempotency_key,
          success,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      )
      .bind(
          crypto.randomUUID(),
          payload.requestId,
          payload.audit?.requestedByUserId ?? null,
          payload.audit?.requestedByEmail ?? null,
          payload.audit?.requestedByRole ?? null,
          payload.audit?.requestSource ?? 'crud-worker',
          payload.table,
          payload.action,
          payload.table,
          targetId,
          maybeMatterId,
          maybeClientId,
          null,
          newJson,
          payload.idempotencyKey ?? null,
          success ? 1 : 0,
          errorMessage,
      )
      .run()
}

async function auditBestEffort(
    db: D1Database,
    payload: GenericCrudCommand,
    success: boolean,
    errorMessage: string | null,
): Promise<void> {
  try {
    await writeAuditLog(db, payload, success, errorMessage)
  } catch {
    // Avoid hiding the primary CRUD result if audit logging fails.
  }
}

/**
 * Builds the canonical primary Client party row for a Matter create.
 *
 * @param matterId - Matter receiving the party.
 * @param clientId - Required Client owner.
 * @returns Prepared Matter party insert.
 */
function buildPrimaryClientPartySql(matterId: string, clientId: string): BuiltSql {
  return {
    sql: `
      INSERT INTO matter_party (
        id, matter_id, client_id, individual_id, entity_id,
        party_role_lookup_id, is_primary_client, is_responsible_party,
        receives_bill, signs_engagement, added_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    values: [
      `mpa_${crypto.randomUUID()}`,
      matterId,
      clientId,
      null,
      null,
      PRIMARY_CLIENT_PARTY_ROLE_LOOKUP_ID,
      1,
      1,
      1,
      1,
      new Date().toISOString().slice(0, 10),
      null,
    ],
  }
}

/**
 * Creates a Client, its reserved General Matter, and primary Client party
 * atomically. The control field is never persisted to the client table.
 *
 * @param db - D1 database.
 * @param payload - Validated Client create command.
 * @param clientInsert - Prepared Client insert.
 * @returns Worker response.
 */
async function executeClientCreateWithGeneralMatter(
  db: D1Database,
  payload: GenericCrudCommand,
  clientInsert: BuiltSql,
): Promise<Response> {
  const data = payload.data ?? {}
  const clientId = String(data.id ?? '')
  const clientNumber = normalizeClientNumber(data.client_number)
  const createdByUserId = String(payload.audit?.requestedByUserId ?? '')
  if (!clientId || !clientNumber || !createdByUserId) {
    return err('VALIDATION_CLIENT_GENERAL_MATTER_DATA_INCOMPLETE', 422)
  }

  const matterId = `mat_${crypto.randomUUID()}`
  const matterNumber = `${clientNumber}.0`
  const now = new Date().toISOString()
  const matterData = {
    id: matterId,
    matter_number: matterNumber,
    title: GENERAL_MATTER_TITLE,
    description: 'General Client work that has not been assigned to a specific Matter.',
    matter_type_label: 'Client General Matter',
    practice_area_lookup_id: GENERAL_MATTER_PRACTICE_AREA_LOOKUP_ID,
    status_lookup_id: GENERAL_MATTER_STATUS_LOOKUP_ID,
    opened_date: now.slice(0, 10),
    primary_attorney_user_id: createdByUserId,
    created_by_user_id: createdByUserId,
    created_at: now,
    updated_at: now,
  }
  const matterInsert = buildInsertSql('matter', matterData)
  const partyInsert = buildPrimaryClientPartySql(matterId, clientId)
  const result = await db.batch([
    db.prepare(clientInsert.sql).bind(...clientInsert.values),
    db.prepare(matterInsert.sql).bind(...matterInsert.values),
    db.prepare(partyInsert.sql).bind(...partyInsert.values),
  ])
  await auditBestEffort(db, payload, true, null)

  return json({
    ok: true,
    action: payload.action,
    table: payload.table,
    targetId: clientId,
    clientId,
    clientNumber,
    generalMatterId: matterId,
    generalMatterNumber: matterNumber,
    result,
  })
}

/**
 * Creates a Matter and its primary Client party atomically.
 *
 * @param db - D1 database.
 * @param payload - Validated Matter create command.
 * @param matterInsert - Prepared Matter insert.
 * @returns Worker response.
 */
async function executeMatterCreateForClient(
    db: D1Database,
    payload: GenericCrudCommand,
    matterInsert: BuiltSql,
): Promise<Response> {
  const data = payload.data ?? {}
  const matterId = String(data.id ?? '')
  const clientId = String(data.client_id ?? '')
  const client = await db
    .prepare('SELECT id, client_number FROM client WHERE id = ? LIMIT 1')
    .bind(clientId)
    .first<{ id: string; client_number: string | null }>()
  const clientNumber = normalizeClientNumber(client?.client_number)
  if (!client || !clientNumber) return err('VALIDATION_MATTER_CLIENT_NOT_FOUND_OR_INVALID_NUMBER', 422)

  const matterNumber = String(data.matter_number ?? '')
  const parsedMatterNumber = /^(\d+)\.(\d+)$/.exec(matterNumber)
  const parsedClientNumber = normalizeClientNumber(parsedMatterNumber?.[1])
  const sequence = Number(parsedMatterNumber?.[2])
  if (
    !parsedMatterNumber ||
    parsedClientNumber !== clientNumber ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    return err('VALIDATION_MATTER_NUMBER_MUST_MATCH_CLIENT_AND_START_AT_ONE', 422)
  }

  const partyInsert = buildPrimaryClientPartySql(matterId, clientId)
  const result = await db.batch([
    db.prepare(matterInsert.sql).bind(...matterInsert.values),
    db.prepare(partyInsert.sql).bind(...partyInsert.values),
  ])
  await auditBestEffort(db, payload, true, null)

  return json({
    ok: true,
    action: payload.action,
    table: payload.table,
    targetId: matterId,
    matterId,
    matterNumber,
    clientId,
    clientNumber,
    result,
  })
}

async function executeCrud(payload: GenericCrudCommand, env: ExtendedWorkerEnv): Promise<Response> {
  const db = env.CRUD_WORKER_ASSIGNED_D1 // assigned in crud-worker.jsonc
  if (payload.action === 'MAINTENANCE_GATE') return executeMaintenanceGate(db, payload)
  const gateError = await enforceMaintenanceGate(db, payload)
  if (gateError) return gateError

  if (payload.action === 'CONTACT_MAINTENANCE') {
    try {
      const maintenance = await executeContactMaintenance(db, payload)
      return json({ ok: true, maintenance })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CONTACT_MAINTENANCE_FAILED'
      // Keep stable application codes while exposing the sanitized D1/SQLite
      // reason needed to diagnose schema, relationship, or migration failures.
      // Do not return a stack trace, SQL values, tokens, or request contents.
      const detail = message.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
      const safeMessage = /^(CONTACT_MAINTENANCE_|VALIDATION_)/.test(message)
        ? message
        : `CONTACT_MAINTENANCE_FAILED operation=${String(payload.data?.operation ?? 'unknown')} reason=${detail || 'unknown_worker_error'}`
      const status = safeMessage.includes('FORBIDDEN') ? 403 : safeMessage.includes('NOT_FOUND') ? 404 : safeMessage.startsWith('VALIDATION_') ? 422 : safeMessage.includes('BLOCKED') || safeMessage.includes('CHANGED') || safeMessage.includes('ALREADY_RESOLVED') ? 409 : 500
      return err(safeMessage, status)
    }
  }
  if (!isAllowedTable(payload.table)) {
    return err(`VALIDATION_UNKNOWN_TABLE: ${payload.table}`, 422)
  }

  const table = payload.table
  const policy = getTablePolicy(table)
  const tableSql = quoteIdentifier(policy.table)
  const pkSql = quoteIdentifier(policy.pk)

  try {
    if (payload.action === 'CREATE') {
      const targetId = payload.data?.[policy.pk] ? String(payload.data[policy.pk]) : payload.targetId
      const replayedRow = await findIdempotentCreateRow(db, payload)

      if (replayedRow) {
        await auditBestEffort(db, payload, true, null)
        return json({
          ok: true,
          action: payload.action,
          table,
          targetId: String(replayedRow[policy.pk] ?? targetId ?? ''),
          idempotencyKey: payload.idempotencyKey,
          replayed: true,
          row: replayedRow,
        })
      }

      if (targetId) {
        const existing = await db
            .prepare(`SELECT ${pkSql} FROM ${tableSql} WHERE ${pkSql} = ? LIMIT 1`)
            .bind(targetId)
            .first()

        if (existing) {
          const message = `CREATE_CONFLICT: ${policy.table} already exists: ${targetId}`
          await auditBestEffort(db, payload, false, message)
          return err(message, 409)
        }
      }

      const data = { ...(payload.data ?? {}) }
      if (table === 'client') {
        const clientNumber = normalizeClientNumber(data.client_number)
        if (!clientNumber) return err('VALIDATION_INVALID_CLIENT_NUMBER', 422)
        data.client_number = clientNumber
      }
      if (table === 'matter' && isTrueControl(data.generate_matter_number)) {
        const clientId = String(data.client_id ?? '')
        const client = await db
          .prepare('SELECT client_number FROM client WHERE id = ? LIMIT 1')
          .bind(clientId)
          .first<{ client_number: string | null }>()
        const clientNumber = normalizeClientNumber(client?.client_number)
        if (!clientNumber) return err('VALIDATION_MATTER_CLIENT_NOT_FOUND_OR_INVALID_NUMBER', 422)
        data.matter_number = await nextMatterNumber(db, clientNumber)
      }

      const normalizedPayload = { ...payload, data }
      let built = payload.createGuard ? buildGuardedInsertSql(normalizedPayload) : buildInsertSql(table, data)

      if (table === 'client' && isTrueControl(data.create_general_matter)) {
        return executeClientCreateWithGeneralMatter(db, payload, built)
      }

      if (table === 'matter' && data.client_id) {
        return executeMatterCreateForClient(db, { ...payload, data }, built)
      }

      if (table === 'client_member' && isTrueControl(data.is_primary)) {
        const existingPrimary = await db
          .prepare('SELECT id FROM client_member WHERE client_id = ? AND is_primary = 1 LIMIT 1')
          .bind(data.client_id)
          .first()
        if (existingPrimary) return err('VALIDATION_CLIENT_HAS_ONE_PRIMARY_MEMBER', 409)
      }

      let insertedData = data
      let result: D1Result<unknown>
      if (table === 'workstream_activity') {
        // WSID generation and collision retry are deliberately kept in the
        // CRUD Worker; the API only supplies the activity data. See
        // `insertWorkstreamActivityWithGeneratedWsid`.
        const activityInsert = await insertWorkstreamActivityWithGeneratedWsid(db, normalizedPayload, data)
        insertedData = activityInsert.data
        built = payload.createGuard ? buildGuardedInsertSql({ ...normalizedPayload, data: insertedData }) : buildInsertSql(table, insertedData)
        result = activityInsert.result
      } else if (table === 'individual') {
        const identityInsert = await insertIdentityWithGeneratedCode(
          db,
          normalizedPayload,
          data,
          'individual',
          'icid',
          INDIVIDUAL_ICID_MAX_ATTEMPTS,
        )
        insertedData = identityInsert.data
        built = payload.createGuard
          ? buildGuardedInsertSql({ ...normalizedPayload, data: insertedData })
          : buildInsertSql(table, insertedData)
        result = identityInsert.result
      } else if (table === 'entity') {
        const identityInsert = await insertIdentityWithGeneratedCode(
          db,
          normalizedPayload,
          data,
          'entity',
          'ecid',
          ENTITY_ECID_MAX_ATTEMPTS,
        )
        insertedData = identityInsert.data
        built = payload.createGuard
          ? buildGuardedInsertSql({ ...normalizedPayload, data: insertedData })
          : buildInsertSql(table, insertedData)
        result = identityInsert.result
      } else if (table === 'lead') {
        const leadInsert = await insertLeadWithGeneratedLcid(db, normalizedPayload, data)
        insertedData = leadInsert.data
        built = payload.createGuard
          ? buildGuardedInsertSql({ ...normalizedPayload, data: insertedData })
          : buildInsertSql(table, insertedData)
        result = leadInsert.result
      } else if (table === 'time_entry' || table === 'invoice') {
        const billingInsert = await insertBillingRowWithGeneratedCode(db, normalizedPayload, data, table, table === 'time_entry' ? 'bcid' : 'ivid')
        insertedData = billingInsert.data
        built = payload.createGuard
          ? buildGuardedInsertSql({ ...normalizedPayload, data: insertedData })
          : buildInsertSql(table, insertedData)
        result = billingInsert.result
      } else if (table === 'document_record') {
        const documentInsert = await insertDocumentRecordWithGeneratedNumber(db, normalizedPayload, data)
        insertedData = documentInsert.data
        built = payload.createGuard
          ? buildGuardedInsertSql({ ...normalizedPayload, data: insertedData })
          : buildInsertSql(table, insertedData)
        result = documentInsert.result
      } else {
        result = await db.prepare(built.sql).bind(...built.values).run()
      }
      if (payload.createGuard && Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) !== 1) {
        const message = payload.createGuard.conflictMessage ?? 'CREATE_GUARD_CONFLICT'
        await auditBestEffort(db, payload, false, message)
        return err(message, 409)
      }
      await auditBestEffort(db, payload, true, null)

      return json({
        ok: true,
        action: payload.action,
        table,
        targetId: targetId ?? null,
        idempotencyKey: payload.idempotencyKey ?? null,
        ...(table === 'workstream_activity' ? { generatedWsid: String(insertedData.wsid) } : {}),
        ...(table === 'individual' ? { generatedIcid: String(insertedData.icid) } : {}),
        ...(table === 'entity' ? { generatedEcid: String(insertedData.ecid) } : {}),
        ...(table === 'lead' ? { generatedLcid: String(insertedData.lcid) } : {}),
        ...(table === 'document_record' ? { generatedDocumentNumber: String(insertedData.document_number) } : {}),
        ...(table === 'time_entry' ? { generatedBcid: String(insertedData.bcid) } : {}),
        ...(table === 'invoice' ? { generatedIvid: String(insertedData.ivid) } : {}),
        result,
      })
    }

    if (payload.action === 'READ') {
      const built = buildReadSql(table, payload.targetId ?? '')
      const row = await db.prepare(built.sql).bind(...built.values).first()
      await auditBestEffort(db, payload, true, null)

      return json({
        ok: true,
        action: payload.action,
        table,
        targetId: payload.targetId,
        row,
      })
    }

    if (payload.action === 'UPDATE') {
      const existing = await db
          .prepare(`SELECT ${pkSql}${table === 'client_member' ? ', client_id' : ''} FROM ${tableSql} WHERE ${pkSql} = ? LIMIT 1`)
          .bind(payload.targetId)
          .first()

      if (!existing) {
        const message = `UPDATE_NOT_FOUND: ${policy.table} not found: ${payload.targetId}`
        await auditBestEffort(db, payload, false, message)
        return err(message, 404)
      }

      const updateData = { ...(payload.data ?? {}) }
      if (table === 'client' && updateData.client_number !== undefined) {
        updateData.client_number = normalizeClientNumber(updateData.client_number)
      }
      if (table === 'client_member' && isTrueControl(updateData.is_primary)) {
        const memberClientId = updateData.client_id ?? (existing as { client_id?: unknown }).client_id
        const existingPrimary = await db
          .prepare('SELECT id FROM client_member WHERE client_id = ? AND is_primary = 1 AND id <> ? LIMIT 1')
          .bind(memberClientId, payload.targetId)
          .first()
        if (existingPrimary) return err('VALIDATION_CLIENT_HAS_ONE_PRIMARY_MEMBER', 409)
      }
      const built = buildUpdateSql(table, payload.targetId ?? '', updateData)
      const result = await db.prepare(built.sql).bind(...built.values).run()
      await auditBestEffort(db, payload, true, null)

      return json({
        ok: true,
        action: payload.action,
        table,
        targetId: payload.targetId,
        result,
      })
    }

    if (payload.action === 'DELETE') {
      const built = buildDeleteSql(table, payload.targetId ?? '')
      const result = await db.prepare(built.sql).bind(...built.values).run()
      await auditBestEffort(db, payload, true, null)

      return json({
        ok: true,
        action: payload.action,
        table,
        targetId: payload.targetId,
        result,
      })
    }

    if (payload.action === 'SEARCH') {
      const [result] = await runSearches(db, [searchQueryFromPayload(payload)])
      await auditBestEffort(db, payload, true, null)
      if (result.hasMore && Number(payload.limit ?? 0) > result.limit) {
        console.warn(`[CRUD_SEARCH:cap] table=${table} requested=${String(payload.limit)} returned=${result.rows.length} requestId=${payload.requestId}`)
      }

      return json({
        ok: true,
        action: payload.action,
        table,
        count: result.rows.length,
        rows: result.rows,
        hasMore: result.hasMore,
        limit: result.limit,
        offset: result.offset,
      })
    }

    if (payload.action === 'SEARCH_BATCH') {
      const results = await runSearches(db, (payload.queries ?? []) as SearchQuery[])
      await auditBestEffort(db, payload, true, null)

      return json({
        ok: true,
        action: payload.action,
        table,
        results: Object.fromEntries(results.map((result) => [result.key, { table: result.table, rows: result.rows, hasMore: result.hasMore, limit: result.limit, offset: result.offset }])),
      })
    }

    return err(`UNSUPPORTED_ACTION: ${String(payload.action)}`, 422)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown D1 error'
    await auditBestEffort(db, payload, false, message)
    return err(`D1_OPERATION_FAILED: ${message}`, 500)
  }
}

export default {
  async fetch(request: Request, env: ExtendedWorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (request.method !== 'POST') {
      return err('Method not allowed — use POST', 405)
    }

    let body: Partial<CrudWorkerRequestBody>

    try {
      body = await request.json()
    } catch {
      return err('REQUEST_PARSE_ERROR: invalid JSON body', 400)
    }

    if (!body.token) {
      return err('REQUEST_MISSING_TOKEN', 400)
    }

    if (!body.encryptedPayload) {
      return err('REQUEST_MISSING_ENCRYPTED_PAYLOAD', 400)
    }

    if (!env.PUBLIC_KEYS) {
      return err('CONFIG_MISSING_PUBLIC_KEYS: KV binding PUBLIC_KEYS is not configured in crud-worker.jsonc', 500)
    }

    if (!env.CRUD_WORKER_PRIVATE_KEY) {
      return err('CONFIG_MISSING_CRUD_WORKER_PRIVATE_KEY', 500)
    }

    let jwt: KRJwtPayload

    try {
      jwt = await verifyJwt<KRJwtPayload>(body.token, env.PUBLIC_KEYS)
    } catch (error) {
      return err(`AUTH_FAILED: ${error instanceof Error ? error.message : 'JWT_ERROR'}`, 401)
    }

    const trustedServerError = validateTrustedServerJwt(jwt)

    if (trustedServerError) {
      return trustedServerError
    }

    let payload: GenericCrudCommand

    try {
      payload = await decryptCrudPayload(body.encryptedPayload, env.CRUD_WORKER_PRIVATE_KEY)
    } catch (error) {
      return err(`PAYLOAD_DECRYPT_FAILED: ${error instanceof Error ? error.message : 'decrypt error'}`, 400)
    }

    const jwtValidationError = validatePayloadAgainstJwt(payload, jwt)

    if (jwtValidationError) {
      return jwtValidationError
    }

    const commandValidationError = validateCrudCommand(payload)

    if (commandValidationError) {
      return commandValidationError
    }

    return executeCrud(payload, env)
  },
}
