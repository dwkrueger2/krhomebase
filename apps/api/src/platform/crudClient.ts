// file: apps/api/src/platform/crudClient.ts
/**
 * Client for the generic CRUD Worker (`krhomebase-crud-worker`).
 *
 * The CRUD Worker has no public address. This Worker reaches it through the service binding
 * `CRUD_WORKER`. Every call carries two things, exactly as the old Next.js server sent them:
 *
 *  1. A short-lived RS256 JWT, signed with the app private key (`KR_WORKER_JWT_PRIVATE_KEY`). The CRUD
 *     Worker checks it against the matching public key it finds in its KV store under the key id.
 *  2. The command itself, sealed: a random AES-256-GCM key encrypts the JSON command, and that AES key
 *     is wrapped with the CRUD Worker's RSA-OAEP (SHA-256) public key (`KR_CRUD_WORKER_PUBLIC_KEY`).
 *
 * The envelope shape is `{ token, encryptedPayload: { alg, wrappedKeyB64, ivB64, ciphertextB64 } }` and
 * matches `workers/d1-workers/crud-worker/crud-worker.ts` and `workers/d1-workers/shared/jwt.ts`.
 *
 * This file only builds and sends the envelope. What to ask for, and why, lives in the feature's
 * `queries.ts`. Never log the keys, the token or the sealed payload.
 */

import { pemToDer, toBase64, toBase64Url } from './crypto.ts'

/** Tables the sign-in code reads or writes through the CRUD Worker. Add a name here when a feature needs another. */
export type CrudTable =
  | 'user'
  | 'user_sso_identity'
  | 'user_invite'
  | 'individual'
  | 'individual_contact_method'
  | 'employee'
  | 'kr_session'
  | 'kr_homebase_initialization'

export type CrudAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH'

/** Who asked, for the CRUD Worker's audit log. */
export interface CrudAudit {
  requestedByUserId?: string
  requestedByEmail?: string
  requestedByRole?: string
  requestSource: 'api-route' | 'sso-google-callback' | 'system'
}

export interface CrudCommand {
  requestId: string
  action: CrudAction
  table: CrudTable
  targetId?: string
  data?: Record<string, unknown>
  where?: Record<string, unknown>
  limit?: number
  audit?: CrudAudit
}

/** The CRUD Worker's reply: `ok` plus the fields this API uses. */
export interface CrudReply {
  ok: boolean
  error?: string
  rows?: Record<string, unknown>[]
  row?: Record<string, unknown> | null
}

/** The keys and the service binding a client needs. */
export interface CrudClientConfig {
  fetcher: Fetcher
  /** PKCS#8 private key (PEM) used to sign the JWT. */
  jwtPrivateKeyPem: string
  /** Name of the matching public key in the CRUD Worker's KV store. */
  jwtKeyId: string
  /** SPKI public key (PEM) of the CRUD Worker, used to seal commands. */
  crudPublicKeyPem: string
}

const privateKeyCache = new Map<string, Promise<CryptoKey>>()
const publicKeyCache = new Map<string, Promise<CryptoKey>>()

function importJwtKey(pem: string): Promise<CryptoKey> {
  let key = privateKeyCache.get(pem)
  if (!key) {
    key = crypto.subtle.importKey('pkcs8', pemToDer(pem, 'private', 'KR_WORKER_JWT_PRIVATE_KEY'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    privateKeyCache.set(pem, key)
  }
  return key
}

function importSealKey(pem: string): Promise<CryptoKey> {
  let key = publicKeyCache.get(pem)
  if (!key) {
    key = crypto.subtle.importKey('spki', pemToDer(pem, 'public', 'KR_CRUD_WORKER_PUBLIC_KEY'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
    publicKeyCache.set(pem, key)
  }
  return key
}

/**
 * Signs the short-lived (60 seconds) JWT that proves the call came from this API.
 *
 * @param command - The command; its action, table, request id and audit details become claims.
 * @param config - Keys and binding.
 * @returns The signed token (`header.payload.signature`).
 */
export async function signCrudJwt(command: CrudCommand, config: Pick<CrudClientConfig, 'jwtPrivateKeyPem' | 'jwtKeyId'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid: config.jwtKeyId }
  // The issuer, audience, subject and purpose are fixed values the CRUD Worker requires.
  const payload = {
    iss: 'kr-website-api',
    aud: 'crud-worker',
    sub: 'kr-website-api-server',
    purpose: 'crud-worker-request',
    action: command.action,
    resource: command.table,
    requestId: command.requestId,
    actorUserId: command.audit?.requestedByUserId,
    actorEmail: command.audit?.requestedByEmail,
    actorRole: command.audit?.requestedByRole,
    source: command.audit?.requestSource ?? 'api-route',
    iat: now,
    exp: now + 60,
    keyId: config.jwtKeyId,
  }
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`
  const key = await importJwtKey(config.jwtPrivateKeyPem)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${toBase64Url(signature)}`
}

/**
 * Seals a command for the CRUD Worker (RSA-OAEP-256 wrapping an AES-256-GCM key).
 *
 * @returns The `encryptedPayload` object the CRUD Worker decrypts.
 */
export async function sealCrudCommand(command: CrudCommand, crudPublicKeyPem: string) {
  const aesKey = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])) as CryptoKey
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(JSON.stringify(command)))
  const rawAesKey = (await crypto.subtle.exportKey('raw', aesKey)) as ArrayBuffer
  const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, await importSealKey(crudPublicKeyPem), rawAesKey)
  return {
    alg: 'RSA-OAEP-256+A256GCM' as const,
    wrappedKeyB64: toBase64(wrappedKey as ArrayBuffer),
    ivB64: toBase64(iv),
    ciphertextB64: toBase64(ciphertext),
  }
}

/**
 * Sends one command to the CRUD Worker and returns its reply.
 *
 * @throws Error whose message is the CRUD Worker's error text (for example `AUTH_FAILED: ...`), or
 *   `KR_CRUD_WORKER_NON_JSON_RESPONSE_<status>` when the reply is not JSON.
 */
export async function callCrudWorker(config: CrudClientConfig, command: CrudCommand): Promise<CrudReply> {
  const token = await signCrudJwt(command, config)
  const encryptedPayload = await sealCrudCommand(command, config.crudPublicKeyPem)
  const response = await config.fetcher.fetch('https://crud-worker.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, encryptedPayload }),
  })
  const body = (await response.json().catch(() => null)) as CrudReply | null
  if (!body) throw new Error(`KR_CRUD_WORKER_NON_JSON_RESPONSE_${response.status}`)
  if (!response.ok || !body.ok) throw new Error(body.error || `KR_CRUD_WORKER_HTTP_${response.status}`)
  return body
}
