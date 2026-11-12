// file: apps/api/src/features/teams/teams.test.ts
/**
 * Teams and Scope (Settings plan, stage 4b) against an in-memory Schema 8.0. Made-up people only. Checks: the list
 * (active teams, active members and leads, display names, no pay or identity fields), create, change (people taken
 * off keep their row, people put back get their old row, new people get new rows), the name rule over every team row,
 * unknown members and leads, an unknown team, other roles refused, an audit row per save, and 503 without the tables.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/teams/teams.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, TeamSavedData, TeamsData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-admin', 'Ada', 'Admin', NULL), ('i-sam', 'Samuel', 'Staff', 'Sam'), ('i-lee', 'Lee', 'Lead', NULL)`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('u-admin', 'i-admin', 'admin@example.com', 'x', 'super_admin'), ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff'), ('u-lee', 'i-lee', 'lee@example.com', 'x', 'staff'), ('u-none', NULL, 'none@example.com', 'x', 'staff')`)
  run(`INSERT INTO user (id, email, password_hash, role, is_active) VALUES ('u-gone', 'gone@example.com', 'x', 'staff', 0)`)
  run(`INSERT INTO employee (id, user_id, employee_number, job_title, ssn) VALUES ('emp-sam', 'u-sam', 'E-1', 'Paralegal', '123-45-6789'), ('emp-none', 'u-none', 'E-2', NULL, NULL)`)
})

async function call(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, role = 'super_admin', database: D1Database = env.db) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: database }, 'u-admin'))
}

async function saved(res: Response) {
  expect(res.status).toBe(200)
  return TeamSavedData.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

const memberRows = () => env.sqlite.prepare(`SELECT id, employee_id, is_active, ends_at IS NOT NULL AS ended FROM team_member ORDER BY created_at, id`).all()

describe('GET /v1/teams', () => {
  it('lists active teams with active members and leads, and names everyone without pay or identity fields', async () => {
    run(`INSERT INTO team (id, name, description) VALUES ('team-1', 'Probate', 'Estates'), ('team-old', 'Old', NULL)`)
    run(`UPDATE team SET is_active = 0 WHERE id = 'team-old'`)
    run(`INSERT INTO team_member (id, team_id, employee_id, is_active) VALUES ('tm-1', 'team-1', 'emp-sam', 1), ('tm-2', 'team-1', 'emp-none', 0)`)
    run(`INSERT INTO team_lead (id, team_id, user_id) VALUES ('tl-1', 'team-1', 'u-lee')`)
    const res = await call('GET', '/v1/teams')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('123-45-6789')
    const data = TeamsData.parse((JSON.parse(text) as { data: unknown }).data)
    expect(data.teams).toEqual([{ id: 'team-1', name: 'Probate', description: 'Estates', memberEmployeeIds: ['emp-sam'], leadUserIds: ['u-lee'] }])
    expect(data.employees.map((row) => [row.id, row.name])).toEqual([['emp-none', 'none@example.com'], ['emp-sam', 'Sam']])
    expect(data.users.map((row) => row.name)).toEqual(['Ada Admin', 'Lee Lead', 'none@example.com', 'Sam'])
  })

  it('refuses other roles and answers 503 without the tables', async () => {
    expect(await errorCode(await call('GET', '/v1/teams', undefined, 'staff'), 403)).toBeTruthy()
    expect(await errorCode(await call('GET', '/v1/teams', undefined, 'super_admin', createTestD1().db), 503)).toBe('TEAMS_UNAVAILABLE')
  })
})

describe('team saves', () => {
  it('creates a team with members, leads and one audit row', async () => {
    const data = await saved(await call('POST', '/v1/teams', { name: ' Probate ', description: '  ', memberEmployeeIds: ['emp-sam', 'emp-sam'], leadUserIds: ['u-lee'] }))
    expect(data.teamId).toMatch(/^team_[0-9a-f-]{36}$/)
    expect(data.teams.teams).toEqual([{ id: data.teamId, name: 'Probate', description: null, memberEmployeeIds: ['emp-sam'], leadUserIds: ['u-lee'] }])
    expect(env.sqlite.prepare(`SELECT created_by_user_id FROM team`).get()).toEqual({ created_by_user_id: 'u-admin' })
    expect((memberRows() as Array<{ id: string }>)[0]?.id).toMatch(/^tm_/)
    expect(env.sqlite.prepare(`SELECT action, target_table, target_id FROM audit_log WHERE resource = 'teams'`).all()).toEqual([{ action: 'CREATE', target_table: 'team', target_id: data.teamId }])
  })

  it('takes people off by keeping their row, and gives a returning member the old row back', async () => {
    const { teamId } = await saved(await call('POST', '/v1/teams', { name: 'Probate', description: null, memberEmployeeIds: ['emp-sam'], leadUserIds: ['u-lee'] }))
    const off = await saved(await call('PUT', `/v1/teams/${teamId}`, { name: 'Probate', description: 'Estates', memberEmployeeIds: ['emp-none'], leadUserIds: [] }))
    expect(off.teams.teams[0]).toMatchObject({ description: 'Estates', memberEmployeeIds: ['emp-none'], leadUserIds: [] })
    expect(memberRows()).toEqual([
      { id: expect.any(String), employee_id: 'emp-sam', is_active: 0, ended: 1 },
      { id: expect.any(String), employee_id: 'emp-none', is_active: 1, ended: 0 },
    ])
    await saved(await call('PUT', `/v1/teams/${teamId}`, { name: 'Probate', description: 'Estates', memberEmployeeIds: ['emp-none', 'emp-sam'], leadUserIds: ['u-lee'] }))
    expect(memberRows()).toEqual([
      { id: expect.any(String), employee_id: 'emp-sam', is_active: 1, ended: 0 },
      { id: expect.any(String), employee_id: 'emp-none', is_active: 1, ended: 0 },
    ])
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM team_lead`).get()).toEqual({ n: 1 })
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'teams' AND action = 'UPDATE'`).get()).toEqual({ n: 2 })
  })

  it("refuses a name held by any team row, people who cannot be members or leads, and an unknown team", async () => {
    run(`INSERT INTO team (id, name, is_active) VALUES ('team-old', 'Retired Team', 0)`)
    const body = { description: null, memberEmployeeIds: [], leadUserIds: [] }
    expect(await errorCode(await call('POST', '/v1/teams', { ...body, name: 'retired team' }), 409)).toBe('TEAM_NAME_IN_USE')
    expect(await errorCode(await call('POST', '/v1/teams', { ...body, name: 'X', memberEmployeeIds: ['u-sam'] }), 422)).toBe('TEAM_EMPLOYEE_NOT_FOUND')
    expect(await errorCode(await call('POST', '/v1/teams', { ...body, name: 'X', leadUserIds: ['u-gone'] }), 422)).toBe('TEAM_LEAD_NOT_FOUND')
    expect(await errorCode(await call('PUT', '/v1/teams/team-old', { ...body, name: 'Retired Team' }), 404)).toBe('TEAM_NOT_FOUND')
    expect(await errorCode(await call('POST', '/v1/teams', { ...body, name: 'X' }, 'attorney'), 403)).toBeTruthy()
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM team`).get()).toEqual({ n: 1 })
  })
})
