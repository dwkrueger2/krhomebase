//file: apps/shared/d1-workers/session-worker/session-worker.ts
/**
 * KR Legal — Session Worker
 *
 * Purpose:
 *   Validates hashed KR Homebase session tokens against D1 table kr_session.
 *
 * Security model:
 *   1. Browser sends HttpOnly cookie only to Next.js.
 *   2. Next.js hashes the raw opaque token with SHA-256.
 *   3. Next.js calls this worker with only the hash, never the raw token.
 *   4. This worker requires a server-side shared bearer secret.
 *   5. This worker returns display-safe session/user metadata only.
 *
 * This worker is intentionally narrow. User creation/role editing should stay
 * in the admin/user worker path unless a later security review says otherwise.
 */

interface SessionWorkerEnv {
  SESSION_WORKER_ASSIGNED_D1: D1Database
  KR_SESSION_WORKER_SECRET: string
  /** Optional table-name override. Allowed values: kr_session or kr_sessions. */
  KR_SESSION_TABLE_NAME?: string
}

interface SessionValidationRequestBody {
  requestId?: string
  sessionTokenHash?: string
  userAgentHash?: string | null
  ipHash?: string | null
  touch?: boolean
}

interface SessionRow {
  session_id: string
  user_id: string
  created_at: string
  expires_at: string
  last_seen_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  mfa_verified: number
  email: string
  role: string
  is_active: number
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  preferred_name: string | null
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function err(error: string, status = 400, requestId?: string): Response {
  return json({ ok: false, error, requestId }, status)
}

function ok(data: Record<string, unknown>, requestId?: string): Response {
  return json({ ok: true, data, requestId })
}

function nowIso(): string {
  return new Date().toISOString()
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

async function secretFingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

function getSessionTableName(env: SessionWorkerEnv): 'kr_session' | 'kr_sessions' {
  return env.KR_SESSION_TABLE_NAME === 'kr_sessions' ? 'kr_sessions' : 'kr_session'
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) return null
  return header.slice('bearer '.length).trim()
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] || 'KR User'
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function initialsFromName(displayName: string): string {
  const pieces = displayName.split(/\s+/).filter(Boolean)
  if (!pieces.length) return 'KR'
  return pieces
    .slice(0, 3)
    .map((piece) => piece.charAt(0).toUpperCase())
    .join('')
}

function displayNameFromRow(row: SessionRow): string {
  const firstName = row.preferred_name?.trim() || row.first_name?.trim() || ''
  const middleName = row.middle_name?.trim() || ''
  const lastName = row.last_name?.trim() || ''
  const fromIndividual = [firstName, middleName, lastName].filter(Boolean).join(' ')

  return fromIndividual || displayNameFromEmail(row.email)
}

async function findSession(sessionTokenHash: string, env: SessionWorkerEnv): Promise<SessionRow | null> {
  const sessionTableName = getSessionTableName(env)

  return env.SESSION_WORKER_ASSIGNED_D1 // assigned in session-worker.jsonc
    .prepare(
      `SELECT
         s.id AS session_id,
         s.user_id AS user_id,
         s.created_at AS created_at,
         s.expires_at AS expires_at,
         s.last_seen_at AS last_seen_at,
         s.revoked_at AS revoked_at,
         s.revoked_reason AS revoked_reason,
         s.mfa_verified AS mfa_verified,
         u.email AS email,
         u.role AS role,
         u.is_active AS is_active,
         i.first_name AS first_name,
         i.middle_name AS middle_name,
         i.last_name AS last_name,
         i.preferred_name AS preferred_name
       FROM ${sessionTableName} s
       INNER JOIN "user" u ON u.id = s.user_id
       LEFT JOIN individual i ON i.id = u.individual_id
       WHERE s.session_token_hash = ?
       LIMIT 1`,
    )
    .bind(sessionTokenHash)
    .first<SessionRow>()
}

async function touchSession(sessionId: string, env: SessionWorkerEnv): Promise<void> {
  const now = nowIso()
  const sessionTableName = getSessionTableName(env)

  await env.SESSION_WORKER_ASSIGNED_D1
    .prepare(`UPDATE ${sessionTableName} SET last_seen_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, sessionId)
    .run()
}

async function validateSession(
  body: SessionValidationRequestBody,
  env: SessionWorkerEnv,
): Promise<Response> {
  const requestId = body.requestId ?? crypto.randomUUID()

  if (!body.sessionTokenHash) {
    return err('VALIDATION_MISSING_SESSION_TOKEN_HASH', 422, requestId)
  }

  if (!/^[a-f0-9]{64}$/i.test(body.sessionTokenHash)) {
    return err('VALIDATION_BAD_SESSION_TOKEN_HASH_FORMAT', 422, requestId)
  }

  const row = await findSession(body.sessionTokenHash, env)

  if (!row) {
    return ok({ valid: false, reason: 'session_not_found' }, requestId)
  }

  if (!row.is_active) {
    return ok({ valid: false, reason: 'user_inactive' }, requestId)
  }

  if (row.revoked_at) {
    return ok({ valid: false, reason: row.revoked_reason || 'session_revoked' }, requestId)
  }

  const expiresAt = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return ok({ valid: false, reason: 'session_expired' }, requestId)
  }

  if (body.touch !== false) {
    await touchSession(row.session_id, env)
  }

  const displayName = displayNameFromRow(row)

  return ok(
    {
      valid: true,
      session: {
        sessionId: row.session_id,
        userId: row.user_id,
        displayName,
        email: row.email,
        role: row.role,
        firmName: 'Krueger & Richard',
        avatarInitials: initialsFromName(displayName),
        expiresAt: row.expires_at,
        mfaVerified: row.mfa_verified === 1,
      },
    },
    requestId,
  )
}

export default {
  async fetch(request: Request, env: SessionWorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    if (request.method !== 'POST') {
      return err('METHOD_NOT_ALLOWED: use POST', 405)
    }

    const configuredSecret = env.KR_SESSION_WORKER_SECRET?.trim()
    if (!configuredSecret) {
      return err('CONFIG_MISSING_KR_SESSION_WORKER_SECRET', 500)
    }

    const bearerToken = getBearerToken(request)
    console.log(
      `[session-worker][TEMP] secret comparison configuredLength=${configuredSecret.length} configuredSha256Prefix=${await secretFingerprint(configuredSecret)} bearerLength=${bearerToken?.length ?? 0} bearerSha256Prefix=${bearerToken ? await secretFingerprint(bearerToken) : 'none'}`,
    )
    if (!bearerToken || !constantTimeEqual(bearerToken, configuredSecret)) {
      return err('AUTH_FAILED_SESSION_WORKER_SECRET', 401)
    }

    let body: SessionValidationRequestBody
    try {
      body = await request.json()
    } catch {
      return err('REQUEST_PARSE_ERROR: invalid JSON body', 400)
    }

    try {
      return await validateSession(body, env)
    } catch (error) {
      console.error('[session-worker] DB/session validation error:', error)
      return err(error instanceof Error ? `DB_ERROR: ${error.message}` : 'DB_ERROR: unknown', 500, body.requestId)
    }
  },
}
