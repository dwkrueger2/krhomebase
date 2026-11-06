/**
 * @fileoverview KR Legal — Public Inquiry CRUD Worker
 * @module d1-workers/crud-worker-pub-inquiry/crud-worker-pub-inquiry
 *
 * Purpose:
 *   Dedicated encrypted CRUD bridge for the quarantined public inquiry D1
 *   database. This worker intentionally does not import or use the KR Homebase
 *   operational table registry.
 *
 * Security flow:
 *   1. Accept POST body containing JWT and encrypted public-inquiry payload.
 *   2. Verify JWT using env.PUBLIC_KEYS.
 *   3. Confirm trusted server JWT claims for crud-worker-pub-inquiry only.
 *   4. Decrypt encrypted payload using env.CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY.
 *   5. Validate table/action/columns against pub-inquiry-table-registry.ts.
 *   6. Execute safe D1 prepared statements only against PUBLIC_INQUIRY_DB.
 */

import { verifyJwt } from '../shared/jwt'
import { err } from '../shared/responses'
import {
  findMissingPubInquiryCreateColumns,
  findRejectedPubInquiryColumns,
  getPubInquiryTablePolicy,
  isAllowedPubInquiryTable,
  isPubInquiryActionAllowed,
  quotePubInquiryIdentifier,
  type PubInquiryTableName,
} from '../shared/pub-inquiry-table-registry'

const TRUSTED_JWT_ISSUER = 'kr-website-api'
const TRUSTED_JWT_AUDIENCE = 'crud-worker-pub-inquiry'
const TRUSTED_JWT_SUBJECT = 'kr-website-api-server'
const TRUSTED_JWT_PURPOSE = 'crud-worker-pub-inquiry-request'

type PubInquiryWorkerEnv = {
  /** Public inquiry D1 database binding. */
  PUBLIC_INQUIRY_DB: D1Database
  /** KV namespace that stores public keys for trusted server JWT verification. */
  PUBLIC_KEYS?: KVNamespace
  /** Cloudflare Worker secret containing the private key used to decrypt payloads. */
  CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY: string
}

type PubInquiryWorkerAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'CREATE_SUBMISSION'

type PubInquiryJwtPayload = {
  /** Expected issuer: kr-website-api. */
  iss: string
  /** Expected audience: crud-worker-pub-inquiry. */
  aud: string
  /** Expected subject: kr-website-api-server. */
  sub: string
  /** Expected purpose: crud-worker-pub-inquiry-request. */
  purpose: string
  /** Worker action being requested. */
  action: PubInquiryWorkerAction
  /** Worker table/resource being requested. */
  resource: string
  /** Issued-at Unix timestamp. */
  iat: number
  /** Expiration Unix timestamp. */
  exp: number
  /** PUBLIC_KEYS KV key name. */
  keyId: string
  /** Request correlation id. */
  requestId?: string
  /** Source system recorded by the trusted server. */
  source?: string
}

type EncryptedPubInquiryEnvelope = {
  /** Hybrid encryption algorithm expected by this worker. */
  alg: 'RSA-OAEP-256+A256GCM'
  /** RSA-wrapped AES key encoded as base64. */
  wrappedKeyB64: string
  /** AES-GCM IV encoded as base64. */
  ivB64: string
  /** AES-GCM ciphertext plus auth tag encoded as base64. */
  ciphertextB64: string
}

type PubInquiryWorkerRequestBody = {
  /** Trusted server JWT. */
  token: string
  /** Encrypted public-inquiry command. */
  encryptedPayload: EncryptedPubInquiryEnvelope
}

type PubInquiryCommand<TData = Record<string, unknown>> = {
  /** Request correlation id that must match the JWT requestId. */
  requestId: string
  /** Requested CRUD or submission action. */
  action: PubInquiryWorkerAction
  /** Public inquiry table/resource name. */
  table: string
  /** Primary key for read/update/delete. */
  targetId?: string
  /** Insert/update data or CREATE_SUBMISSION bundle. */
  data?: TData
  /** Equality filters for SEARCH. */
  where?: Record<string, unknown>
  /** Search limit. */
  limit?: number
  /** Search offset. */
  offset?: number
}

type BuiltSql = {
  /** Prepared SQL text. */
  sql: string
  /** Values bound to the prepared SQL text. */
  values: unknown[]
}

type JsonResponseBody = {
  /** Whether the worker request succeeded. */
  ok: boolean
  /** Additional response fields. */
  [key: string]: unknown
}

/**
 * Returns a JSON response without exposing browser cacheable content.
 *
 * @param body - Response body.
 * @param status - HTTP status code.
 */
function json(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Converts base64 text to an ArrayBuffer for WebCrypto APIs.
 *
 * @param value - Base64-encoded value.
 */
function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * Converts a PEM private key into DER bytes for WebCrypto import.
 *
 * @param pem - PKCS#8 private key PEM.
 */
function privatePemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  return base64ToArrayBuffer(base64)
}

/**
 * Decrypts the public inquiry command using the worker private key secret.
 *
 * @param encryptedPayload - Hybrid RSA/AES encrypted payload.
 * @param privateKeyPem - Worker private key secret.
 */
async function decryptPubInquiryPayload(
  encryptedPayload: EncryptedPubInquiryEnvelope,
  privateKeyPem: string,
): Promise<PubInquiryCommand> {
  if (encryptedPayload.alg !== 'RSA-OAEP-256+A256GCM') {
    throw new Error(`Unsupported encrypted payload algorithm: ${encryptedPayload.alg}`)
  }

  const privateKeyDer = privatePemToArrayBuffer(privateKeyPem)
  const rsaPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  )
  const rawAesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    rsaPrivateKey,
    base64ToArrayBuffer(encryptedPayload.wrappedKeyB64),
  )
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt'])
  const clearText = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(encryptedPayload.ivB64) },
    aesKey,
    base64ToArrayBuffer(encryptedPayload.ciphertextB64),
  )

  return JSON.parse(new TextDecoder().decode(clearText)) as PubInquiryCommand
}

/**
 * Validates the trusted server JWT claims for this worker only.
 *
 * @param jwt - Verified JWT payload.
 */
function validateTrustedServerJwt(jwt: PubInquiryJwtPayload): Response | null {
  if (jwt.iss !== TRUSTED_JWT_ISSUER) return err(`AUTH_INVALID_ISSUER: expected ${TRUSTED_JWT_ISSUER}`, 401)
  if (jwt.aud !== TRUSTED_JWT_AUDIENCE) return err(`AUTH_INVALID_AUDIENCE: expected ${TRUSTED_JWT_AUDIENCE}`, 401)
  if (jwt.sub !== TRUSTED_JWT_SUBJECT) return err(`AUTH_INVALID_SUBJECT: expected ${TRUSTED_JWT_SUBJECT}`, 401)
  if (jwt.purpose !== TRUSTED_JWT_PURPOSE) return err(`AUTH_INVALID_PURPOSE: expected ${TRUSTED_JWT_PURPOSE}`, 401)
  if (!jwt.action) return err('AUTH_MISSING_ACTION', 401)
  if (!jwt.resource) return err('AUTH_MISSING_RESOURCE', 401)
  return null
}

/**
 * Confirms that encrypted payload identity matches the signed JWT claims.
 *
 * @param payload - Decrypted public inquiry command.
 * @param jwt - Verified JWT payload.
 */
function validatePayloadAgainstJwt(payload: PubInquiryCommand, jwt: PubInquiryJwtPayload): Response | null {
  if (payload.action !== jwt.action) return err(`PAYLOAD_ACTION_MISMATCH: JWT=${jwt.action}, payload=${payload.action}`, 400)
  if (payload.table !== jwt.resource) return err(`PAYLOAD_TABLE_RESOURCE_MISMATCH: JWT=${jwt.resource}, payload=${payload.table}`, 400)
  if (payload.requestId !== jwt.requestId) return err('PAYLOAD_REQUEST_ID_MISMATCH', 400)
  return null
}

/**
 * Checks whether a value is a plain record suitable for SQL insert data.
 *
 * @param value - Candidate value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/**
 * Validates create data against the public inquiry table registry.
 *
 * @param table - Public inquiry table name.
 * @param data - Data to insert.
 */
function validateCreateData(table: PubInquiryTableName, data: Record<string, unknown>): Response | null {
  const rejected = findRejectedPubInquiryColumns(table, 'CREATE', data)
  if (rejected.length) return err(`VALIDATION_REJECTED_CREATE_COLUMNS: ${rejected.join(', ')}`, 422)

  const missing = findMissingPubInquiryCreateColumns(table, data)
  if (missing.length) return err(`VALIDATION_MISSING_CREATE_COLUMNS: ${missing.join(', ')}`, 422)

  return null
}

/**
 * Validates a full CREATE_SUBMISSION bundle before any D1 write.
 *
 * @param payload - Decrypted CREATE_SUBMISSION command.
 */
function validateSubmissionBundle(payload: PubInquiryCommand): Response | null {
  if (payload.action !== 'CREATE_SUBMISSION') return null
  if (payload.table !== 'public_inquiry') return err('VALIDATION_CREATE_SUBMISSION_TABLE_MUST_BE_PUBLIC_INQUIRY', 422)
  if (!isRecord(payload.data)) return err('VALIDATION_CREATE_SUBMISSION_MISSING_DATA', 422)

  const requiredTables: PubInquiryTableName[] = [
    'public_inquiry',
    'public_inquiry_metadata',
    'public_inquiry_bot_signal',
    'public_inquiry_event',
  ]

  for (const table of requiredTables) {
    const row = payload.data[table]
    if (!isRecord(row)) return err(`VALIDATION_CREATE_SUBMISSION_MISSING_${table}`, 422)
    const validationError = validateCreateData(table, row)
    if (validationError) return validationError
  }

  const optionalTables: PubInquiryTableName[] = [
    'public_inquiry_intake_party',
    'public_inquiry_stage_history',
    'public_inquiry_external_map',
  ]

  for (const table of optionalTables) {
    const rowOrRows = payload.data[table]
    if (rowOrRows === undefined) continue
    const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
    for (const row of rows) {
      if (!isRecord(row)) return err(`VALIDATION_CREATE_SUBMISSION_INVALID_${table}`, 422)
      const validationError = validateCreateData(table, row)
      if (validationError) return validationError
    }
  }

  return null
}

/**
 * Validates a decrypted public inquiry command before execution.
 *
 * @param payload - Decrypted public inquiry command.
 */
function validatePubInquiryCommand(payload: PubInquiryCommand): Response | null {
  if (!payload.requestId) return err('VALIDATION_MISSING_REQUEST_ID', 422)
  if (!payload.action) return err('VALIDATION_MISSING_ACTION', 422)
  if (!payload.table) return err('VALIDATION_MISSING_TABLE', 422)

  if (payload.action === 'CREATE_SUBMISSION') return validateSubmissionBundle(payload)
  if (!isAllowedPubInquiryTable(payload.table)) return err(`VALIDATION_UNKNOWN_TABLE: ${payload.table}`, 422)
  if (!isPubInquiryActionAllowed(payload.table, payload.action)) return err(`ACTION_NOT_ALLOWED: ${payload.action} ${payload.table}`, 403)

  if ((payload.action === 'CREATE' || payload.action === 'UPDATE') && (!isRecord(payload.data) || !Object.keys(payload.data).length)) {
    return err(`VALIDATION_MISSING_DATA: ${payload.action} requires data`, 422)
  }

  if ((payload.action === 'READ' || payload.action === 'UPDATE' || payload.action === 'DELETE') && !payload.targetId) {
    return err(`VALIDATION_MISSING_TARGET_ID: ${payload.action} requires targetId`, 422)
  }

  if (payload.action === 'CREATE' && isRecord(payload.data)) {
    const validationError = validateCreateData(payload.table, payload.data)
    if (validationError) return validationError
  }

  if (payload.action === 'UPDATE' && isRecord(payload.data)) {
    const rejected = findRejectedPubInquiryColumns(payload.table, 'UPDATE', payload.data)
    if (rejected.length) return err(`VALIDATION_REJECTED_UPDATE_COLUMNS: ${rejected.join(', ')}`, 422)
  }

  if (payload.action === 'SEARCH' && payload.where) {
    const rejected = findRejectedPubInquiryColumns(payload.table, 'SEARCH', payload.where)
    if (rejected.length) return err(`VALIDATION_REJECTED_SEARCH_COLUMNS: ${rejected.join(', ')}`, 422)
  }

  return null
}

/**
 * Builds an INSERT statement from allowed registry columns.
 *
 * @param table - Public inquiry table name.
 * @param data - Insert data.
 */
function buildInsertSql(table: PubInquiryTableName, data: Record<string, unknown>): BuiltSql {
  const tablePolicy = getPubInquiryTablePolicy(table)
  const allowed = new Set(tablePolicy.createColumns)
  const columns = Object.keys(data).filter((column) => allowed.has(column))
  if (!columns.length) throw new Error(`No insertable columns provided for ${table}`)

  return {
    sql: `INSERT INTO ${quotePubInquiryIdentifier(tablePolicy.table)} (${columns.map(quotePubInquiryIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values: columns.map((column) => data[column]),
  }
}

/**
 * Builds a READ statement by primary key.
 *
 * @param table - Public inquiry table name.
 * @param targetId - Primary key value.
 */
function buildReadSql(table: PubInquiryTableName, targetId: string): BuiltSql {
  const tablePolicy = getPubInquiryTablePolicy(table)
  return {
    sql: `SELECT * FROM ${quotePubInquiryIdentifier(tablePolicy.table)} WHERE ${quotePubInquiryIdentifier(tablePolicy.pk)} = ? LIMIT 1`,
    values: [targetId],
  }
}

/**
 * Builds an UPDATE statement from allowed registry columns.
 *
 * @param table - Public inquiry table name.
 * @param targetId - Primary key value.
 * @param data - Update data.
 */
function buildUpdateSql(table: PubInquiryTableName, targetId: string, data: Record<string, unknown>): BuiltSql {
  const tablePolicy = getPubInquiryTablePolicy(table)
  const allowed = new Set(tablePolicy.updateColumns)
  const columns = Object.keys(data).filter((column) => allowed.has(column))
  if (!columns.length) throw new Error(`No updatable columns provided for ${table}`)

  return {
    sql: `UPDATE ${quotePubInquiryIdentifier(tablePolicy.table)} SET ${columns.map((column) => `${quotePubInquiryIdentifier(column)} = ?`).join(', ')} WHERE ${quotePubInquiryIdentifier(tablePolicy.pk)} = ?`,
    values: [...columns.map((column) => data[column]), targetId],
  }
}


/**
 * Builds a DELETE statement by primary key.
 *
 * @param table - Public inquiry table name.
 * @param targetId - Primary key value.
 */
function buildDeleteSql(table: PubInquiryTableName, targetId: string): BuiltSql {
  const tablePolicy = getPubInquiryTablePolicy(table)
  return {
    sql: `DELETE FROM ${quotePubInquiryIdentifier(tablePolicy.table)} WHERE ${quotePubInquiryIdentifier(tablePolicy.pk)} = ?`,
    values: [targetId],
  }
}

/**
 * Builds a SEARCH statement with equality filters only.
 *
 * @param payload - Validated SEARCH command.
 */
function buildSearchSql(payload: PubInquiryCommand): BuiltSql {
  if (!isAllowedPubInquiryTable(payload.table)) throw new Error(`Unknown table: ${payload.table}`)

  const tablePolicy = getPubInquiryTablePolicy(payload.table)
  const where = payload.where ?? {}
  const whereColumns = Object.keys(where)
  const limit = Math.min(Math.max(Number(payload.limit ?? 25), 1), 100)
  const offset = Math.max(Number(payload.offset ?? 0), 0)

  const orderClause = tablePolicy.columns.includes('submitted_at') ? ` ORDER BY ${quotePubInquiryIdentifier('submitted_at')} DESC` : ''

  if (!whereColumns.length) {
    return {
      sql: `SELECT * FROM ${quotePubInquiryIdentifier(tablePolicy.table)}${orderClause} LIMIT ? OFFSET ?`,
      values: [limit, offset],
    }
  }

  return {
    sql: `SELECT * FROM ${quotePubInquiryIdentifier(tablePolicy.table)} WHERE ${whereColumns.map((column) => `${quotePubInquiryIdentifier(column)} = ?`).join(' AND ')}${orderClause} LIMIT ? OFFSET ?`,
    values: [...whereColumns.map((column) => where[column]), limit, offset],
  }
}

/**
 * Executes CREATE_SUBMISSION as a single public inquiry database batch.
 *
 * @param payload - Validated CREATE_SUBMISSION command.
 * @param env - Worker environment bindings.
 */
async function executeCreateSubmission(payload: PubInquiryCommand, env: PubInquiryWorkerEnv): Promise<Response> {
  if (!isRecord(payload.data)) return err('VALIDATION_CREATE_SUBMISSION_MISSING_DATA', 422)

  const tableOrder: PubInquiryTableName[] = [
    'public_inquiry',
    'public_inquiry_metadata',
    'public_inquiry_bot_signal',
    'public_inquiry_event',
  ]
  const statements = tableOrder.map((table) => {
    const row = payload.data?.[table]
    if (!isRecord(row)) throw new Error(`Missing submission row for ${table}`)
    const built = buildInsertSql(table, row)
    return env.PUBLIC_INQUIRY_DB.prepare(built.sql).bind(...built.values)
  })

  const optionalTables: PubInquiryTableName[] = [
    'public_inquiry_intake_party',
    'public_inquiry_stage_history',
    'public_inquiry_external_map',
  ]
  for (const table of optionalTables) {
    const rowOrRows = payload.data?.[table]
    if (rowOrRows === undefined) continue
    const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
    for (const row of rows) {
      if (!isRecord(row)) throw new Error(`Invalid optional submission row for ${table}`)
      const built = buildInsertSql(table, row)
      statements.push(env.PUBLIC_INQUIRY_DB.prepare(built.sql).bind(...built.values))
    }
  }

  const result = await env.PUBLIC_INQUIRY_DB.batch(statements)
  const targetId = isRecord(payload.data.public_inquiry) ? String(payload.data.public_inquiry.id || '') : null

  return json({
    ok: true,
    action: payload.action,
    table: payload.table,
    targetId,
    result,
  })
}

/**
 * Executes one validated public inquiry CRUD command.
 *
 * @param payload - Validated public inquiry command.
 * @param env - Worker environment bindings.
 */
async function executePubInquiryCommand(payload: PubInquiryCommand, env: PubInquiryWorkerEnv): Promise<Response> {
  if (payload.action === 'CREATE_SUBMISSION') return executeCreateSubmission(payload, env)
  if (!isAllowedPubInquiryTable(payload.table)) return err(`VALIDATION_UNKNOWN_TABLE: ${payload.table}`, 422)

  const db = env.PUBLIC_INQUIRY_DB
  const table = payload.table

  try {
    if (payload.action === 'CREATE') {
      if (!isRecord(payload.data)) return err('VALIDATION_MISSING_DATA: CREATE requires data', 422)
      const built = buildInsertSql(table, payload.data)
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return json({ ok: true, action: payload.action, table, targetId: payload.data[getPubInquiryTablePolicy(table).pk] ?? null, result })
    }

    if (payload.action === 'READ') {
      const built = buildReadSql(table, payload.targetId ?? '')
      const row = await db.prepare(built.sql).bind(...built.values).first()
      return json({ ok: true, action: payload.action, table, targetId: payload.targetId, row })
    }

    if (payload.action === 'UPDATE') {
      if (!isRecord(payload.data)) return err('VALIDATION_MISSING_DATA: UPDATE requires data', 422)
      const built = buildUpdateSql(table, payload.targetId ?? '', payload.data)
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return json({ ok: true, action: payload.action, table, targetId: payload.targetId, result })
    }

    if (payload.action === 'DELETE') {
      const built = buildDeleteSql(table, payload.targetId ?? '')
      const result = await db.prepare(built.sql).bind(...built.values).run()
      return json({ ok: true, action: payload.action, table, targetId: payload.targetId, result })
    }

    if (payload.action === 'SEARCH') {
      const built = buildSearchSql(payload)
      const result = await db.prepare(built.sql).bind(...built.values).all()
      return json({ ok: true, action: payload.action, table, count: result.results?.length ?? 0, rows: result.results ?? [] })
    }

    return err(`UNSUPPORTED_ACTION: ${String(payload.action)}`, 422)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown D1 error'
    return err(`D1_OPERATION_FAILED: ${message}`, 500)
  }
}

export default {
  /**
   * Handles trusted server-to-worker requests for public inquiry D1 access.
   *
   * @param request - Incoming Worker request.
   * @param env - Cloudflare Worker bindings and secrets.
   */
  async fetch(request: Request, env: PubInquiryWorkerEnv): Promise<Response> {
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

    if (request.method !== 'POST') return err('Method not allowed — use POST', 405)

    let body: Partial<PubInquiryWorkerRequestBody>
    try {
      body = await request.json()
    } catch {
      return err('REQUEST_PARSE_ERROR: invalid JSON body', 400)
    }

    if (!body.token) return err('REQUEST_MISSING_TOKEN', 400)
    if (!body.encryptedPayload) return err('REQUEST_MISSING_ENCRYPTED_PAYLOAD', 400)
    if (!env.PUBLIC_KEYS) return err('CONFIG_MISSING_PUBLIC_KEYS: KV binding PUBLIC_KEYS is not configured', 500)
    if (!env.PUBLIC_INQUIRY_DB) return err('CONFIG_MISSING_PUBLIC_INQUIRY_DB', 500)
    if (!env.CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY) return err('CONFIG_MISSING_CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY', 500)

    let jwt: PubInquiryJwtPayload
    try {
      jwt = await verifyJwt<PubInquiryJwtPayload>(body.token, env.PUBLIC_KEYS)
    } catch (error) {
      return err(`AUTH_FAILED: ${error instanceof Error ? error.message : 'JWT_ERROR'}`, 401)
    }

    const trustedServerError = validateTrustedServerJwt(jwt)
    if (trustedServerError) return trustedServerError

    let payload: PubInquiryCommand
    try {
      payload = await decryptPubInquiryPayload(body.encryptedPayload, env.CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY)
    } catch (error) {
      return err(`PAYLOAD_DECRYPT_FAILED: ${error instanceof Error ? error.message : 'decrypt error'}`, 400)
    }

    const jwtValidationError = validatePayloadAgainstJwt(payload, jwt)
    if (jwtValidationError) return jwtValidationError

    const commandValidationError = validatePubInquiryCommand(payload)
    if (commandValidationError) return commandValidationError

    return executePubInquiryCommand(payload, env)
  },
}
