// file: apps/api/src/features/maintenance/maintenance.test.ts
/**
 * The maintenance gate routes (Settings plan, stage 8; super admin only) against an in-memory Schema 8.0. Checks:
 * a missing row reads as unlocked, lock creates the row with the old reason and the person from the session, the
 * audit row, other writes refused while locked (423), unlock while locked (needs `maintenance` in the write gate's
 * exempt list), 403 for anyone else, 422 for the old body, and a missing table (unlocked read, 503 on a write).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/maintenance/maintenance.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, MaintenanceGateData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { registerMaintenance } from './routes.ts'

const app = createApp()
// Until src/app.ts calls registerMaintenance, the test adds the routes itself (once).
if (!app.routes.some((route) => route.path === '/v1/maintenance-gate')) registerMaintenance(app)

let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  // audit_log.actor_user_id refers to user(id); the fake session's person is user-test-1.
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'test.person@example.com', 'x', 'super_admin')`).run()
  clearSessionCache()
})

async function send(method: 'GET' | 'PUT', body?: unknown, role = 'super_admin', database: D1Database = env.db, path = '/v1/maintenance-gate') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: database }))
}

async function gateOf(res: Response) {
  expect(res.status).toBe(200)
  return MaintenanceGateData.parse(((await res.json()) as { data: unknown }).data)
}

const audits = () => env.sqlite.prepare(`SELECT action, target_table, target_id FROM audit_log WHERE resource = 'maintenance' ORDER BY created_at`).all()

describe('maintenance gate', () => {
  it('reads a missing row as unlocked and not installed', async () => {
    expect(await gateOf(await send('GET'))).toEqual({ locked: false, reason: null, setBy: null, setAt: null, updatedAt: null, installed: false })
  })

  it('locks with the old reason and the person from the session, with an audit row', async () => {
    const gate = await gateOf(await send('PUT', { locked: true }))
    expect(gate).toMatchObject({ locked: true, reason: 'Contact import review', setBy: 'test.person@example.com', installed: true })
    expect(gate.setAt).toBe(gate.updatedAt)
    expect((await gateOf(await send('GET'))).locked).toBe(true)
    expect(audits()).toEqual([{ action: 'LOCK', target_table: 'kr_maintenance_gate', target_id: 'krhomebase' }])
  })

  it('refuses other writes while locked (423 MAINTENANCE_LOCKED)', async () => {
    await gateOf(await send('PUT', { locked: true }))
    const res = await send('PUT', { prompt: 'Blocked prompt' }, 'super_admin', env.db, '/v1/publishing/article-prompt')
    expect(res.status).toBe(423)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('MAINTENANCE_LOCKED')
  })

  it('unlocks while locked and clears the reason (needs `maintenance` in GATE_EXEMPT_FEATURES)', async () => {
    await gateOf(await send('PUT', { locked: true }))
    const gate = await gateOf(await send('PUT', { locked: false }))
    expect(gate).toMatchObject({ locked: false, reason: null, setBy: 'test.person@example.com', installed: true })
    expect(audits().map((row) => (row as { action: string }).action)).toEqual(['LOCK', 'UNLOCK'])
  })

  it('refuses anyone but a super admin (403) and the old operation body (422)', async () => {
    expect((await send('GET', undefined, 'admin')).status).toBe(403)
    expect((await send('PUT', { locked: true }, 'admin')).status).toBe(403)
    expect((await send('PUT', { operation: 'lock' })).status).toBe(422)
    expect(audits()).toEqual([])
  })

  it('reads a missing table as unlocked, and answers 503 MAINTENANCE_GATE_UNAVAILABLE to a write without it', async () => {
    const bare = createTestD1().db
    expect((await gateOf(await send('GET', undefined, 'super_admin', bare))).installed).toBe(false)
    const res = await send('PUT', { locked: true }, 'super_admin', bare)
    expect(res.status).toBe(503)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('MAINTENANCE_GATE_UNAVAILABLE')
  })
})
