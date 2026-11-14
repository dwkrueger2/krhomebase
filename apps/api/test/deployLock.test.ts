// file: apps/api/test/deployLock.test.ts
/**
 * The deploy lock and the server status (repository patch 34): `GET /v1/health` reports green, warning or
 * maintenance from the deploy window on the maintenance gate row (migration 034); while it is maintenance every
 * declared route answers 503 `MAINTENANCE_IN_PROGRESS` except health, the login settings and log-out; a window that ran
 * out is green; no table reads green; the window is cached for 10 seconds.
 *
 * Run: pnpm --dir apps/api exec vitest run test/deployLock.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, HealthData, successEnvelope } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.ts'
import { clearDeployWindowCache, DEPLOY_WINDOW_CACHE_MS } from '../src/platform/deployLock.ts'
import { clearSessionCache } from '../src/platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from './fakes.ts'

const app = createApp()
const MINUTE = 60_000
let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearDeployWindowCache()
  clearSessionCache()
})

afterEach(() => vi.restoreAllMocks())

/** Writes a deploy window whose sign-out is `logoutInMs` from now and whose end is `expiresInMs` from now. */
function setWindow(logoutInMs: number, expiresInMs: number, estimateMinutes = 3) {
  const now = Date.now()
  env.sqlite
    .prepare(
      `INSERT INTO kr_maintenance_gate (id, locked, updated_at, deploy_notice_at, deploy_logout_at, deploy_expires_at, deploy_estimate_minutes, deploy_set_by)
       VALUES ('krhomebase', 0, ?1, ?1, ?2, ?3, ?4, 'deploy-script')
       ON CONFLICT (id) DO UPDATE SET deploy_notice_at = excluded.deploy_notice_at, deploy_logout_at = excluded.deploy_logout_at,
         deploy_expires_at = excluded.deploy_expires_at, deploy_estimate_minutes = excluded.deploy_estimate_minutes`,
    )
    .run(new Date(now).toISOString(), new Date(now + logoutInMs).toISOString(), new Date(now + expiresInMs).toISOString(), estimateMinutes)
}

async function health(database: D1Database = env.db) {
  const res = await app.request('/v1/health', {}, { krhomebase: database })
  expect(res.status).toBe(200)
  return successEnvelope(HealthData).parse(await res.json()).data.maintenance
}

async function call(method: string, path: string) {
  clearSessionCache()
  return app.request(path, { method, headers: SIGNED_IN_HEADERS }, signedInEnv('super_admin', { krhomebase: env.db }))
}

async function codeOf(res: Response) {
  return ErrorEnvelope.safeParse(await res.json()).data?.error.code ?? null
}

describe('server status and the deploy lock', () => {
  it('is green without a window, and signed-in routes pass', async () => {
    expect((await health()).status).toBe('green')
    expect(await codeOf(await call('GET', '/v1/maintenance-gate'))).toBeNull()
  })

  it('warns before the sign-out time without closing anything', async () => {
    setWindow(5 * MINUTE, 23 * MINUTE)
    const status = await health()
    expect(status.status).toBe('warning')
    expect(status.estimateMinutes).toBe(3)
    expect(Date.parse(status.expectedBackBy ?? '') - Date.parse(status.logoutAt ?? '')).toBe(3 * MINUTE)
    expect((await call('GET', '/v1/maintenance-gate')).status).toBe(200)
  })

  it('closes every declared route but health, the login settings and log-out while in maintenance', async () => {
    setWindow(-MINUTE, 17 * MINUTE)
    expect((await health()).status).toBe('maintenance')
    for (const [method, path] of [
      ['GET', '/v1/maintenance-gate'],
      ['GET', '/v1/auth/session'],
      ['GET', '/v1/auth/google/start'],
      ['POST', '/v1/auth/turnstile/verify'],
      ['PUT', '/v1/maintenance-gate'],
    ] as const) {
      const res = await call(method, path)
      expect(res.status, `${method} ${path}`).toBe(503)
      expect(await codeOf(res)).toBe('MAINTENANCE_IN_PROGRESS')
    }
    expect(await codeOf(await call('GET', '/v1/auth/config'))).not.toBe('MAINTENANCE_IN_PROGRESS')
    expect(await codeOf(await call('DELETE', '/v1/auth/session'))).not.toBe('MAINTENANCE_IN_PROGRESS')
    // An undeclared path is still a plain 404.
    expect((await call('GET', '/v1/no-such-route')).status).toBe(404)
  })

  it('opens again on its own once the window runs out', async () => {
    setWindow(-20 * MINUTE, -MINUTE)
    expect((await health()).status).toBe('green')
    expect((await call('GET', '/v1/maintenance-gate')).status).toBe(200)
  })

  it('reads green when the table does not exist', async () => {
    expect((await health(createTestD1().db)).status).toBe('green')
  })

  it('reuses one read for the cache time, then sees a new window', async () => {
    const start = Date.now()
    expect((await health()).status).toBe('green')
    setWindow(-MINUTE, 17 * MINUTE)
    expect((await health()).status).toBe('green')
    vi.spyOn(Date, 'now').mockReturnValue(start + DEPLOY_WINDOW_CACHE_MS + 1)
    expect((await health()).status).toBe('maintenance')
  })
})
