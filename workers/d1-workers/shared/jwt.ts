/**
 * @fileoverview JWT sign/verify utilities using the Web Crypto API.
 * @module d1-workers/shared/jwt
 *
 * Uses RS256 (RSA-SHA256) asymmetric signing:
 *   - Private key  → held in process.env.JWT_PRIVATE_KEY (Next.js side)
 *                     and Worker secret JWT_PRIVATE_KEY (dev only)
 *   - Public key   → stored in Cloudflare KV under key `keyId`
 *                     (e.g. "kr-web-dev-dan")
 *
 * PRODUCTION NOTE:
 *   The private key must be moved from .env to a secure secrets store
 *   (Cloudflare Worker Secrets, Vault, etc.) before going to production.
 *   Never commit the private key to source control.
 *
 * Key generation (run once, store outputs appropriately):
 *   openssl genrsa -out private.pem 2048
 *   openssl rsa -in private.pem -pubout -out public.pem
 *   # Strip headers and newlines for env storage:
 *   cat private.pem | grep -v '^--' | tr -d '\n'   → JWT_PRIVATE_KEY
 *   cat public.pem  | grep -v '^--' | tr -d '\n'   → upload to KV
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base64url encode a Uint8Array */
function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Base64url decode to ArrayBuffer */
function b64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

/** Encode a JS object as a base64url JSON string */
function encodeSegment(obj: object): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)))
}

// ---------------------------------------------------------------------------
// Sign (Next.js side — runs in Node or Edge)
// ---------------------------------------------------------------------------

/**
 * Signs a JWT payload with an RSA-SHA256 private key (PKCS#8 PEM).
 *
 * @param payload - The claims object to sign
 * @param privatePem - Raw base64 private key string (no PEM headers/newlines)
 * @param keyId - KV key name for the matching public key (e.g. "kr-web-dev-dan")
 * @returns Signed JWT string
 */
export async function signJwt(
  payload: object,
  privatePem: string,
  keyId: string,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT', kid: keyId }
  const headerSeg = encodeSegment(header)
  const payloadSeg = encodeSegment(payload)
  const sigInput = `${headerSeg}.${payloadSeg}`

  // Import the private key
  const keyDer = b64urlDecode(
    privatePem.replace(/[\r\n]/g, '').replace(/-----[^-]+-----/g, ''),
  )
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput),
  )

  return `${sigInput}.${b64url(sigBuf)}`
}

// ---------------------------------------------------------------------------
// Verify (Worker side — Cloudflare edge)
// ---------------------------------------------------------------------------

/**
 * Verifies a JWT using the public key retrieved from Cloudflare KV.
 *
 * @param token - The JWT string to verify
 * @param kv - Cloudflare KV namespace containing public keys
 * @returns The decoded payload if valid, throws on failure
 *
 * @throws {Error} If token is malformed, expired, signature invalid, or key missing
 */
export async function verifyJwt<T extends object>(
  token: string,
  kv: KVNamespace,
): Promise<T> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('JWT_MALFORMED: expected 3 segments')

  const [headerSeg, payloadSeg, sigSeg] = parts

  // Decode header to get kid
  const header = JSON.parse(
    new TextDecoder().decode(b64urlDecode(headerSeg)),
  ) as { alg: string; kid: string }

  if (header.alg !== 'RS256') {
    throw new Error(`JWT_ALG_MISMATCH: expected RS256, got ${header.alg}`)
  }
  if (!header.kid) throw new Error('JWT_NO_KID: missing key id in header')

  // Retrieve public key from KV
  const publicPem = await kv.get(header.kid)
  if (!publicPem) {
    throw new Error(`JWT_KEY_NOT_FOUND: no KV entry for kid="${header.kid}"`)
  }

  // Import public key
  const keyDer = b64urlDecode(
    publicPem.replace(/[\r\n]/g, '').replace(/-----[^-]+-----/g, ''),
  )
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    keyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  // Verify signature
  const sigInput = `${headerSeg}.${payloadSeg}`
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlDecode(sigSeg),
    new TextEncoder().encode(sigInput),
  )
  if (!valid) throw new Error('JWT_INVALID_SIGNATURE')

  // Decode and check expiry
  const payload = JSON.parse(
    new TextDecoder().decode(b64urlDecode(payloadSeg)),
  ) as T & { exp?: number; iat?: number }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    throw new Error(`JWT_EXPIRED: token expired at ${new Date(payload.exp * 1000).toISOString()}`)
  }

  return payload as T
}

// ---------------------------------------------------------------------------
// Build a signed request token (Next.js API route helper)
// ---------------------------------------------------------------------------

import type { CrudAction, KRJwtPayload, ResourceType } from './types'

/**
 * Builds and signs a KR JWT for a CRUD operation.
 * Called from the Next.js API route before proxying to a worker.
 *
 * @param opts - Token parameters
 * @returns Signed JWT string
 */
export async function buildWorkerToken(opts: {
  sub: string
  email: string
  role: string
  action: CrudAction
  resource: ResourceType
  recordId?: string
  data?: Record<string, unknown>
  privateKey: string
  keyId: string
  ttlSeconds?: number
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: KRJwtPayload = {
    iss: 'kr-website-api',
    aud: 'crud-worker',
    sub: 'kr-website-api-server',
    purpose: 'crud-worker-request',
    action: opts.action,
    resource: opts.resource,
    requestId: opts.recordId,
    actorUserId: opts.sub,
    actorEmail: opts.email,
    actorRole: opts.role,
    iat: now,
    exp: now + (opts.ttlSeconds ?? 60), // default 60s - short-lived
    keyId: opts.keyId,
  }
  return signJwt(payload, opts.privateKey, opts.keyId)
}
