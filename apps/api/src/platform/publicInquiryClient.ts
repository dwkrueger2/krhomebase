// file: apps/api/src/platform/publicInquiryClient.ts
/**
 * Client for the public inquiry CRUD Worker (`krhomebase-crud-worker-pub-inquiry`, folder
 * `workers/d1-workers/crud-worker-pub-inquiry`). That Worker is the only door to the quarantined public inquiry
 * database (`kr_public_inquiry_06_2026`; schema `docs/Schema_Public_Inquiry_v2.0`), which holds untrusted public
 * submissions and the `site_feedback` table. The KR Homebase database is never bound to it.
 *
 * Port of the old `hb-lib/public-inquiries/publicInquiryWorkerClient.ts`. The old Next.js server called the Worker by
 * its address; this API reaches it through the service binding `PUBLIC_INQUIRY_WORKER` (declared in
 * `kr-api-wrangler.jsonc`), so the Worker needs no public address.
 *
 * Every call carries the same two things as a CRUD Worker call (`crudClient.ts`):
 *  1. A 60-second RS256 JWT signed with the app private key (`KR_WORKER_JWT_PRIVATE_KEY`, key id
 *     `KR_WORKER_JWT_KEY_ID`). The issuer, audience, subject and purpose below are fixed values the Worker requires.
 *  2. The command sealed with the Worker's public key: `KR_PUBLIC_INQUIRY_WORKER_PUBLIC_KEY` when set (a future key
 *     rotation), otherwise `KR_CRUD_WORKER_PUBLIC_KEY`, as the old client did.
 *
 * This file only builds and sends the envelope. Never log the keys, the token or the sealed payload.
 */

import { importJwtKey, sealCrudCommand } from './crudClient.ts'
import { toBase64Url } from './crypto.ts'

/** Tables of the public inquiry database this API asks for. Add a name here when a feature needs another. */
export type PublicInquiryTable = 'site_feedback'

export type PublicInquiryAction = 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH'

/** The Worker's own audit marker (it accepts any text; the old app's names are kept). */
export type PublicInquirySource = 'krhomebase-site-feedback-api'

export interface PublicInquiryCommand {
  requestId: string
  action: PublicInquiryAction
  table: PublicInquiryTable
  targetId?: string
  data?: Record<string, unknown>
  where?: Record<string, unknown>
  /** 1 to 100; the Worker caps it at 100. */
  limit?: number
  offset?: number
  audit?: { requestSource: PublicInquirySource }
}

/** The Worker's reply: `ok` plus the fields this API uses. */
export interface PublicInquiryReply {
  ok: boolean
  error?: string
  row?: Record<string, unknown> | null
  rows?: Record<string, unknown>[]
  count?: number
}

export interface PublicInquiryClientConfig {
  fetcher: Fetcher
  jwtPrivateKeyPem: string
  jwtKeyId: string
  workerPublicKeyPem: string
}

/** Settings this client reads; all optional so a missing one is reported, not a crash. */
export interface PublicInquiryBindings {
  /** Service binding to `krhomebase-crud-worker-pub-inquiry`. */
  PUBLIC_INQUIRY_WORKER?: Fetcher
  KR_WORKER_JWT_PRIVATE_KEY?: string
  KR_WORKER_JWT_KEY_ID?: string
  KR_CRUD_WORKER_PUBLIC_KEY?: string
  KR_PUBLIC_INQUIRY_WORKER_PUBLIC_KEY?: string
}

const DEFAULT_JWT_KEY_ID = 'public-dev-dan-2.pem'

/** The client settings, or null when the binding or a key is missing (the caller answers 503). */
export function publicInquiryConfigFrom(env: PublicInquiryBindings | undefined): PublicInquiryClientConfig | null {
  const jwtPrivateKeyPem = env?.KR_WORKER_JWT_PRIVATE_KEY?.trim()
  const workerPublicKeyPem = (env?.KR_PUBLIC_INQUIRY_WORKER_PUBLIC_KEY ?? env?.KR_CRUD_WORKER_PUBLIC_KEY)?.trim()
  if (!env?.PUBLIC_INQUIRY_WORKER || !jwtPrivateKeyPem || !workerPublicKeyPem) return null
  return { fetcher: env.PUBLIC_INQUIRY_WORKER, jwtPrivateKeyPem, jwtKeyId: env.KR_WORKER_JWT_KEY_ID?.trim() || DEFAULT_JWT_KEY_ID, workerPublicKeyPem }
}

/** Signs the short-lived JWT the public inquiry Worker accepts (`validateTrustedServerJwt` in the Worker). */
export async function signPublicInquiryJwt(command: PublicInquiryCommand, config: Pick<PublicInquiryClientConfig, 'jwtPrivateKeyPem' | 'jwtKeyId'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid: config.jwtKeyId }
  const payload = {
    iss: 'kr-website-api',
    aud: 'crud-worker-pub-inquiry',
    sub: 'kr-website-api-server',
    purpose: 'crud-worker-pub-inquiry-request',
    action: command.action,
    resource: command.table,
    requestId: command.requestId,
    source: command.audit?.requestSource ?? 'krhomebase-site-feedback-api',
    iat: now,
    exp: now + 60,
    keyId: config.jwtKeyId,
  }
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importJwtKey(config.jwtPrivateKeyPem), new TextEncoder().encode(signingInput))
  return `${signingInput}.${toBase64Url(signature)}`
}

/**
 * Sends one command to the public inquiry Worker and returns its reply.
 *
 * @throws Error whose message is the Worker's error text, or `KR_PUBLIC_INQUIRY_WORKER_NON_JSON_RESPONSE_<status>`.
 */
export async function callPublicInquiryWorker(config: PublicInquiryClientConfig, command: PublicInquiryCommand): Promise<PublicInquiryReply> {
  const token = await signPublicInquiryJwt(command, config)
  const encryptedPayload = await sealCrudCommand(command, config.workerPublicKeyPem)
  const response = await config.fetcher.fetch('https://crud-worker-pub-inquiry.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, encryptedPayload }),
  })
  const body = (await response.json().catch(() => null)) as PublicInquiryReply | null
  if (!body) throw new Error(`KR_PUBLIC_INQUIRY_WORKER_NON_JSON_RESPONSE_${response.status}`)
  if (!response.ok || !body.ok) throw new Error(body.error || `KR_PUBLIC_INQUIRY_WORKER_HTTP_${response.status}`)
  return body
}
