/**
 * @fileoverview Shared response helpers and RBAC permission guard for D1 workers.
 * @module d1-workers/shared/responses
 */

import type { CrudAction, WorkerResponse } from './types'

// ---------------------------------------------------------------------------
// JSON response factory
// ---------------------------------------------------------------------------

/**
 * Returns a JSON Response with standard envelope and CORS headers.
 *
 * @param body - WorkerResponse payload
 * @param status - HTTP status code (default 200)
 */
export function jsonResponse<T>(
  body: WorkerResponse<T>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Restrict to your Next.js origin in production
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

/** Convenience: success response */
export function ok<T>(data: T): Response {
  return jsonResponse<T>({ ok: true, data }, 200)
}

/** Convenience: error response */
export function err(message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: message, code: status }, status)
}

// ---------------------------------------------------------------------------
// Role-based access control
// ---------------------------------------------------------------------------

/**
 * Role hierarchy — higher index = more permissive.
 * Workers check that the requesting user's role satisfies the minimum
 * required for the attempted action.
 */
const ROLE_RANK: Record<string, number> = {
  billing: 1,
  staff: 2,
  paralegal: 3,
  attorney: 4,
  admin: 5,
}

/** Minimum role required per CRUD action */
const ACTION_MIN_ROLE: Record<CrudAction, string> = {
  SEARCH: 'staff',
  SEARCH_BATCH: 'staff',
  READ: 'staff',
  CREATE: 'paralegal',
  UPDATE: 'paralegal',
  DELETE: 'attorney', // deletes require attorney or above
}

/**
 * Returns true if the given role is permitted to perform the action.
 *
 * @param role - Role string from the JWT payload
 * @param action - CRUD action being attempted
 */
export function isAuthorized(role: string, action: CrudAction): boolean {
  const userRank = ROLE_RANK[role] ?? 0
  const minRole = ACTION_MIN_ROLE[action]
  const minRank = ROLE_RANK[minRole] ?? 99
  return userRank >= minRank
}

// ---------------------------------------------------------------------------
// UUID generator (Cloudflare Workers compatible)
// ---------------------------------------------------------------------------

/** Generates a v4 UUID using the Web Crypto API */
export function newUuid(): string {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Timestamp helper
// ---------------------------------------------------------------------------

/** Returns current UTC timestamp as ISO-8601 string */
export function nowIso(): string {
  return new Date().toISOString()
}
