// file: apps/api/src/features/tasks/tasks.test.ts
/**
 * Tasks (plan 10, stage 5) against an in-memory Schema 8.0 with foreign keys on. Made-up people and records only.
 * Checks: the status and completion rules; the list (due date first, no due date last, then newest; paging; the
 * status, closed, assignee, client and matter filters; assignees with the old fallback; the viewer); create (the
 * defaults, the client from the matter, every refusal code); change (only the fields sent, clearing, the client and
 * matter check, `completedAt` set and cleared); the Task Settings default assignee (D20); the public id and no
 * WorkStream link column (D21); the assignee replace (remove, re-add and remove again without a
 * UNIQUE error, one row per user); roles (`client` refused, a staff role allowed).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/tasks/tasks.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, TasksData, TaskSavedData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createTaskQueries } from './queries.ts'
import { completedAtFor, listStatuses } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined
const all = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).all(...values) as Array<Record<string, unknown>>

function matter(id: string, number: string, clientId: string) {
  run(`INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id) VALUES (?, ?, ?, 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'u-staff')`, id, number, `Matter ${number}`)
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES (?, ?, ?, 'lk_party_role_primary_client', 1)`, `mp-${id}`, id, clientId)
}

function task(id: string, title: string, status: string, dueDate: string | null, createdAt: string, extra: { clientId?: string; matterId?: string; assignedTo?: string } = {}) {
  run(
    `INSERT INTO task (id, title, status, due_date, created_at, created_by_user_id, client_id, matter_id, assigned_to_user_id) VALUES (?, ?, ?, ?, ?, 'u-staff', ?, ?, ?)`,
    id,
    title,
    status,
    dueDate,
    createdAt,
    extra.clientId ?? null,
    extra.matterId ?? null,
    extra.assignedTo ?? null,
  )
}

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-staff', 'Sam', 'Staff', NULL), ('i-ann', 'Ann', 'Attorney', 'Annie'), ('i-cli', 'Cal', 'Client', NULL)`)
  run(
    `INSERT INTO user (id, individual_id, email, password_hash, role, is_active) VALUES
       ('u-staff', 'i-staff', 'sam@example.com', 'x', 'staff', 1), ('u-ann', 'i-ann', 'ann@example.com', 'x', 'attorney', 1),
       ('u-gone', NULL, 'gone@example.com', 'x', 'staff', 0), ('u-client', 'i-cli', 'cal@example.com', 'x', 'client', 1)`,
  )
  run(`INSERT INTO lookup (id, category, value, label) VALUES ('lk_matter_status_open', 'matter_status', 'open', 'Open'), ('lk_practice_area_miscellaneous', 'practice_area', 'misc', 'Misc'), ('lk_party_role_primary_client', 'party_role', 'pc', 'Primary Client')`)
  run(`INSERT INTO client (id, client_number, client_type, display_name) VALUES ('cl-100', '100', 'group', 'Hundred Family'), ('cl-200', '200', 'group', 'Two Hundred Trust')`)
  matter('m100-0', '100.0', 'cl-100')
  matter('m100-1', '100.1', 'cl-100')
  matter('m200-1', '200.1', 'cl-200')
  run(`INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id) VALUES ('m-orphan', '999.1', 'No party', 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'u-staff')`)
  run(`INSERT INTO workstream_activity (id, wsid, client_id, matter_id, subgroup, subject) VALUES ('wsa-1', 'AB12CD3', 'cl-100', 'm100-0', 'Tasks', 'Call the bank')`)
})

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown, role = 'staff', userId = 'u-staff') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, userId))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  if (res.status !== 200) throw new Error(`${res.status}: ${await res.text()}`)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

describe('task rules', () => {
  it('lists open statuses by default, every status when closed ones are asked for, and refuses an unknown status', () => {
    expect(listStatuses(undefined, false)).toEqual(['open', 'in_progress', 'waiting'])
    expect(listStatuses('', true)).toHaveLength(5)
    expect(listStatuses('waiting, completed,waiting', false)).toEqual(['waiting', 'completed'])
    expect(() => listStatuses('open,done', false)).toThrow(/done/)
  })

  it('sets the completion time when a task becomes completed, keeps it while it stays completed, and clears it otherwise', () => {
    expect(completedAtFor('completed', 'open', null, 'NOW')).toBe('NOW')
    expect(completedAtFor('completed', 'completed', 'THEN', 'NOW')).toBe('THEN')
    expect(completedAtFor('open', 'completed', 'THEN', 'NOW')).toBeNull()
  })
})

describe('GET /v1/tasks', () => {
  beforeEach(() => {
    task('TASKA01', 'Due later', 'open', '2026-12-01', '2026-11-01T00:00:00Z', { clientId: 'cl-100', matterId: 'm100-1' })
    task('TASKB01', 'Due first', 'waiting', '2026-11-20', '2026-11-01T00:00:00Z', { clientId: 'cl-200', matterId: 'm200-1' })
    task('TASKC01', 'No due, older', 'in_progress', null, '2026-11-02T00:00:00Z', { assignedTo: 'u-ann' })
    task('TASKD01', 'No due, newer', 'open', null, '2026-11-05T00:00:00Z', { clientId: 'cl-100' })
    task('TASKE01', 'Same due, newer', 'open', '2026-12-01', '2026-11-03T00:00:00Z')
    task('TASKDN1', 'Finished', 'completed', '2026-11-10', '2026-11-01T00:00:00Z')
    task('TASKOF1', 'Dropped', 'cancelled', null, '2026-11-01T00:00:00Z')
    run(`INSERT INTO task_assignee (id, task_id, user_id, assignment_role, assigned_at, is_current) VALUES ('tas-1', 'TASKA01', 'u-staff', 'assignee', '2026-11-01', 1), ('tas-2', 'TASKA01', 'u-ann', 'assignee', '2026-11-02', 1), ('tas-3', 'TASKB01', 'u-ann', 'assignee', '2026-11-01', 0)`)
    run(`UPDATE task SET assigned_to_user_id = 'u-ann' WHERE id = 'TASKA01'`)
  })

  it('orders by due date with no due date last, then newest recorded, and pages with the cursor', async () => {
    const result = await data(await call('GET', '/v1/tasks'), TasksData)
    expect(result.tasks.map((item) => item.id)).toEqual(['TASKB01', 'TASKE01', 'TASKA01', 'TASKD01', 'TASKC01'])
    expect(result.viewer).toEqual({ canWrite: true })
    expect(result.nextCursor).toBeNull()

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: TasksData = await data(await call('GET', `/v1/tasks?limit=2${cursor ? `&cursor=${cursor}` : ''}`), TasksData)
      expect(page.tasks.length).toBeLessThanOrEqual(2)
      seen.push(...page.tasks.map((item) => item.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(['TASKB01', 'TASKE01', 'TASKA01', 'TASKD01', 'TASKC01'])
    expect(await errorCode(await call('GET', '/v1/tasks?cursor=not-a-cursor'), 422)).toBe('TASK_CURSOR_INVALID')
  })

  it('shows names, the current assignees with the first assignee first, and the old single-assignee fallback', async () => {
    const tasks = (await data(await call('GET', '/v1/tasks'), TasksData)).tasks
    const a = tasks.find((item) => item.id === 'TASKA01')!
    expect(a).toMatchObject({ clientNumber: '100', clientDisplayName: 'Hundred Family', matterNumber: '100.1', matterTitle: 'Matter 100.1', createdByLabel: 'Sam Staff' })
    expect(a.assignees).toEqual([
      { userId: 'u-ann', label: 'Annie' },
      { userId: 'u-staff', label: 'Sam Staff' },
    ])
    expect(tasks.find((item) => item.id === 'TASKB01')!.assignees).toEqual([])
    expect(tasks.find((item) => item.id === 'TASKC01')!.assignees).toEqual([{ userId: 'u-ann', label: 'Annie' }])
  })

  it('lists closed tasks only when asked, and filters by status, assignee, client and matter', async () => {
    const ids = async (query: string) => (await data(await call('GET', `/v1/tasks${query}`), TasksData)).tasks.map((item) => item.id)
    expect(await ids('?includeClosed=true')).toEqual(['TASKDN1', 'TASKB01', 'TASKE01', 'TASKA01', 'TASKD01', 'TASKC01', 'TASKOF1'])
    expect(await ids('?status=completed,cancelled')).toEqual(['TASKDN1', 'TASKOF1'])
    expect(await ids('?status=waiting&includeClosed=false')).toEqual(['TASKB01'])
    expect(await ids('?assigneeUserId=u-ann')).toEqual(['TASKA01', 'TASKC01'])
    expect(await ids('?assigneeUserId=u-staff')).toEqual(['TASKA01'])
    expect(await ids('?clientId=cl-100')).toEqual(['TASKA01', 'TASKD01'])
    expect(await ids('?matterId=m200-1')).toEqual(['TASKB01'])
    expect(await errorCode(await call('GET', '/v1/tasks?status=open,done'), 422)).toBe('TASK_STATUS_INVALID')
  })

  it('reads one task, and answers TASK_NOT_FOUND for an unknown id', async () => {
    expect((await data(await call('GET', '/v1/tasks/TASKA01'), TaskSavedData)).task.title).toBe('Due later')
    expect(await errorCode(await call('GET', '/v1/tasks/NONE000'), 404)).toBe('TASK_NOT_FOUND')
  })
})

describe('POST /v1/tasks', () => {
  it('creates a task with the defaults: the API id, the caller as assignee, creator and assigner, and an audit row', async () => {
    const { task: saved } = await data(await call('POST', '/v1/tasks', { title: '  Draft the will  ' }), TaskSavedData)
    expect(saved.id).toMatch(/^[A-Z0-9]{7}$/)
    expect(saved).toMatchObject({ title: 'Draft the will', status: 'open', priority: 'normal', billingStatus: 'not_ready', clientId: null, matterId: null, completedAt: null, createdByUserId: 'u-staff', assignedByUserId: 'u-staff' })
    expect(saved.assignees).toEqual([{ userId: 'u-staff', label: 'Sam Staff' }])
    expect(one(`SELECT assigned_to_user_id FROM task WHERE id = ?`, saved.id)).toEqual({ assigned_to_user_id: 'u-staff' })
    expect(all(`SELECT id, user_id, is_current FROM task_assignee WHERE task_id = ?`, saved.id)).toEqual([expect.objectContaining({ user_id: 'u-staff', is_current: 1, id: expect.stringMatching(/^tas_/) })])
    expect(one(`SELECT resource, action, actor_user_id FROM audit_log WHERE target_id = ?`, saved.id)).toEqual({ resource: 'tasks', action: 'CREATE', actor_user_id: 'u-staff' })
  })

  it('saves every field, sets the client from a matter given alone, and sets completedAt for a completed task', async () => {
    const { task: saved } = await data(
      await call('POST', '/v1/tasks', {
        title: 'Fund the trust',
        description: 'Deeds and accounts',
        typeLabel: 'Funding',
        status: 'completed',
        priority: 'urgent',
        matterId: 'm100-1',
        assigneeUserIds: ['u-ann', 'u-staff', 'u-ann'],
        supervisorUserId: 'u-ann',
        billingValue: 250.5,
        billingStatus: 'ready',
        billingDescription: 'Trust funding',
        dueDate: '2026-12-15',
      }),
      TaskSavedData,
    )
    expect(saved).toMatchObject({ clientId: 'cl-100', matterNumber: '100.1', priority: 'urgent', supervisorUserId: 'u-ann', supervisorLabel: 'Annie', billingValue: 250.5, billingStatus: 'ready', dueDate: '2026-12-15' })
    expect(saved.completedAt).toEqual(expect.any(String))
    expect(saved.assignees.map((item) => item.userId)).toEqual(['u-ann', 'u-staff'])
    expect(one(`SELECT assigned_to_user_id FROM task WHERE id = ?`, saved.id)).toEqual({ assigned_to_user_id: 'u-ann' })
  })

  it('creates a task with nobody assigned when the list is empty', async () => {
    const { task: saved } = await data(await call('POST', '/v1/tasks', { title: 'Unassigned', assigneeUserIds: [] }), TaskSavedData)
    expect(saved.assignees).toEqual([])
  })

  it('follows the Task Settings preference when no assignees are given (D20)', async () => {
    run(`INSERT INTO user_preference (user_id, preference_key, value_json, created_at, updated_at) VALUES ('u-staff', 'tasks', '{"assignCreatorByDefault":false}', 't1', 't1')`)
    expect((await data(await call('POST', '/v1/tasks', { title: 'Nobody by default' }), TaskSavedData)).task.assignees).toEqual([])
    expect((await data(await call('POST', '/v1/tasks', { title: 'Named', assigneeUserIds: ['u-staff'] }), TaskSavedData)).task.assignees.map((item) => item.userId)).toEqual(['u-staff'])
    run(`UPDATE user_preference SET value_json = '{"assignCreatorByDefault":true}' WHERE user_id = 'u-staff'`)
    expect((await data(await call('POST', '/v1/tasks', { title: 'Creator again' }), TaskSavedData)).task.assignees.map((item) => item.userId)).toEqual(['u-staff'])
  })

  it('never uses the WorkStream link column, and a taken public id answers false so the caller tries again (D21)', async () => {
    const { task: saved } = await data(await call('POST', '/v1/tasks', { title: 'Linked in text: WS #AB12CD3' }), TaskSavedData)
    expect(one(`SELECT workstream_activity_wsid FROM task WHERE id = ?`, saved.id)).toEqual({ workstream_activity_wsid: null })
    expect(saved).not.toHaveProperty('workstreamWsid')
    const row = { title: 'Clash', description: null, typeLabel: null, status: 'open', priority: 'normal', clientId: null, matterId: null, supervisorUserId: null, billingValue: null, billingStatus: 'not_ready', billingDescription: null, dueDate: null, completedAt: null, now: 'now', createdByUserId: 'u-staff', assignees: [] }
    const audit = { requestId: 'r', actorUserId: 'u-staff', actorEmail: null, actorRole: 'staff', resource: 'tasks', action: 'CREATE', targetTable: 'task', targetId: saved.id }
    expect(await createTaskQueries(env.db).insert({ ...row, id: saved.id }, audit)).toBe(false)
    expect(one(`SELECT COUNT(*) AS n FROM task`)).toEqual({ n: 1 })
  })

  it('refuses every bad link and value with its code, and saves nothing', async () => {
    const refused = async (body: Record<string, unknown>, status: number) => errorCode(await call('POST', '/v1/tasks', { title: 'X', ...body }), status)
    expect(await refused({ clientId: 'cl-none' }, 404)).toBe('TASK_CLIENT_NOT_FOUND')
    expect(await refused({ matterId: 'm-none' }, 404)).toBe('TASK_MATTER_NOT_FOUND')
    expect(await refused({ clientId: 'cl-200', matterId: 'm100-1' }, 422)).toBe('TASK_MATTER_NOT_FOR_CLIENT')
    expect(await refused({ matterId: 'm-orphan' }, 422)).toBe('TASK_MATTER_NOT_FOR_CLIENT')
    expect(await refused({ assigneeUserIds: ['u-staff', 'u-gone'] }, 422)).toBe('TASK_ASSIGNEE_NOT_FOUND')
    expect(await refused({ assigneeUserIds: ['u-client'] }, 422)).toBe('TASK_ASSIGNEE_NOT_FOUND')
    expect(await refused({ supervisorUserId: 'u-none' }, 422)).toBe('TASK_SUPERVISOR_NOT_FOUND')
    expect(await refused({ status: 'done' }, 422)).toBe('VALIDATION_FAILED')
    expect(await refused({ priority: 'asap' }, 422)).toBe('VALIDATION_FAILED')
    expect(await refused({ billingStatus: 'billed' }, 422)).toBe('VALIDATION_FAILED')
    expect(await refused({ billingValue: -1 }, 422)).toBe('VALIDATION_FAILED')
    expect(await refused({ dueDate: '12/15/2026' }, 422)).toBe('VALIDATION_FAILED')
    expect(await errorCode(await call('POST', '/v1/tasks', { title: '   ' }), 422)).toBe('VALIDATION_FAILED')
    expect(await errorCode(await call('POST', '/v1/tasks', {}), 422)).toBe('VALIDATION_FAILED')
    expect(one(`SELECT COUNT(*) AS n FROM task`)).toEqual({ n: 0 })
  })
})

describe('PATCH /v1/tasks/{taskId}', () => {
  beforeEach(() => {
    task('TASK001', 'Original', 'open', '2026-12-01', '2026-11-01T00:00:00Z', { clientId: 'cl-100', matterId: 'm100-1' })
    run(`UPDATE task SET description = 'Keep me', billing_value = 100, lead_user_id = 'u-ann' WHERE id = 'TASK001'`)
  })

  it('changes only the fields sent, and clears with null', async () => {
    const { task: saved } = await data(await call('PATCH', '/v1/tasks/TASK001', { priority: 'high', dueDate: null, supervisorUserId: null }), TaskSavedData)
    expect(saved).toMatchObject({ title: 'Original', description: 'Keep me', billingValue: 100, priority: 'high', dueDate: null, supervisorUserId: null, status: 'open', clientId: 'cl-100', matterId: 'm100-1' })
    expect(one(`SELECT action FROM audit_log WHERE target_id = 'TASK001'`)).toEqual({ action: 'UPDATE' })
  })

  it('sets completedAt when completed and clears it when reopened', async () => {
    const done = (await data(await call('PATCH', '/v1/tasks/TASK001', { status: 'completed' }), TaskSavedData)).task
    expect(done.completedAt).toEqual(expect.any(String))
    const renamed = (await data(await call('PATCH', '/v1/tasks/TASK001', { title: 'Renamed' }), TaskSavedData)).task
    expect(renamed.completedAt).toBe(done.completedAt)
    const reopened = (await data(await call('PATCH', '/v1/tasks/TASK001', { status: 'in_progress' }), TaskSavedData)).task
    expect(reopened).toMatchObject({ status: 'in_progress', completedAt: null, title: 'Renamed' })
  })

  it('checks the client and matter together, and refuses an unknown task or an empty change', async () => {
    expect(await errorCode(await call('PATCH', '/v1/tasks/TASK001', { clientId: 'cl-200' }), 422)).toBe('TASK_MATTER_NOT_FOR_CLIENT')
    const moved = (await data(await call('PATCH', '/v1/tasks/TASK001', { clientId: 'cl-200', matterId: 'm200-1' }), TaskSavedData)).task
    expect(moved).toMatchObject({ clientId: 'cl-200', matterId: 'm200-1' })
    const cleared = (await data(await call('PATCH', '/v1/tasks/TASK001', { matterId: null }), TaskSavedData)).task
    expect(cleared).toMatchObject({ clientId: 'cl-200', matterId: null })
    expect(await errorCode(await call('PATCH', '/v1/tasks/NONE000', { title: 'X' }), 404)).toBe('TASK_NOT_FOUND')
    expect(await errorCode(await call('PATCH', '/v1/tasks/TASK001', {}), 422)).toBe('VALIDATION_FAILED')
    expect(await errorCode(await call('PATCH', '/v1/tasks/TASK001', { status: 'done' }), 422)).toBe('VALIDATION_FAILED')
  })
})

describe('PUT /v1/tasks/{taskId}/assignees', () => {
  beforeEach(() => task('TASK001', 'Assign me', 'open', null, '2026-11-01T00:00:00Z'))

  const rows = () => all(`SELECT user_id, is_current, ended_at IS NOT NULL AS ended FROM task_assignee WHERE task_id = 'TASK001' ORDER BY user_id`)
  const put = async (userIds: string[]) => (await data(await call('PUT', '/v1/tasks/TASK001/assignees', { userIds }), TaskSavedData)).task

  it('replaces the set, and survives remove, re-add and remove again without a UNIQUE error', async () => {
    expect((await put(['u-staff', 'u-ann'])).assignees.map((item) => item.userId)).toEqual(['u-staff', 'u-ann'])
    expect(one(`SELECT assigned_to_user_id FROM task WHERE id = 'TASK001'`)).toEqual({ assigned_to_user_id: 'u-staff' })

    expect((await put(['u-ann'])).assignees.map((item) => item.userId)).toEqual(['u-ann'])
    expect(rows()).toEqual([
      { user_id: 'u-ann', is_current: 1, ended: 0 },
      { user_id: 'u-staff', is_current: 0, ended: 1 },
    ])
    expect(one(`SELECT assigned_to_user_id FROM task WHERE id = 'TASK001'`)).toEqual({ assigned_to_user_id: 'u-ann' })

    expect((await put(['u-staff', 'u-ann'])).assignees.map((item) => item.userId)).toEqual(['u-staff', 'u-ann'])
    expect(rows()).toEqual([
      { user_id: 'u-ann', is_current: 1, ended: 0 },
      { user_id: 'u-staff', is_current: 1, ended: 0 },
    ])

    expect((await put(['u-ann'])).assignees.map((item) => item.userId)).toEqual(['u-ann'])
    expect((await put([])).assignees).toEqual([])
    expect(rows()).toEqual([
      { user_id: 'u-ann', is_current: 0, ended: 1 },
      { user_id: 'u-staff', is_current: 0, ended: 1 },
    ])
    expect(one(`SELECT assigned_to_user_id FROM task WHERE id = 'TASK001'`)).toEqual({ assigned_to_user_id: null })
    expect(one(`SELECT COUNT(*) AS n FROM audit_log WHERE target_id = 'TASK001' AND action = 'ASSIGN'`)).toEqual({ n: 5 })
  })

  it('ends a current row even when an older ended row of the same user is left from before', async () => {
    run(`INSERT INTO task_assignee (id, task_id, user_id, assignment_role, assigned_at, ended_at, is_current) VALUES ('old-ended', 'TASK001', 'u-ann', 'assignee', '2026-01-01', '2026-02-01', 0), ('old-current', 'TASK001', 'u-ann', 'assignee', '2026-03-01', NULL, 1)`)
    expect((await put([])).assignees).toEqual([])
    expect(all(`SELECT id, is_current FROM task_assignee WHERE task_id = 'TASK001'`)).toEqual([{ id: 'old-current', is_current: 0 }])
  })

  it('refuses an unknown task or an assignee who is not active staff, and changes nothing', async () => {
    expect(await errorCode(await call('PUT', '/v1/tasks/tsk_old/assignees', { userIds: [] }), 422)).toBe('VALIDATION_FAILED')
    expect(await errorCode(await call('PUT', '/v1/tasks/NONE000/assignees', { userIds: [] }), 404)).toBe('TASK_NOT_FOUND')
    expect(await errorCode(await call('PUT', '/v1/tasks/TASK001/assignees', { userIds: ['u-gone'] }), 422)).toBe('TASK_ASSIGNEE_NOT_FOUND')
    expect(rows()).toEqual([])
  })
})

describe('roles (D9)', () => {
  it('refuses a client account and allows a staff role', async () => {
    expect((await call('GET', '/v1/tasks', undefined, 'client', 'u-client')).status).toBe(403)
    expect((await call('POST', '/v1/tasks', { title: 'X' }, 'client', 'u-client')).status).toBe(403)
    expect((await call('GET', '/v1/tasks', undefined, 'external_cpa', 'u-client')).status).toBe(403)
    expect((await data(await call('GET', '/v1/tasks', undefined, 'attorney', 'u-ann'), TasksData)).viewer).toEqual({ canWrite: true })
    const { task: saved } = await data(await call('POST', '/v1/tasks', { title: 'By the attorney' }, 'attorney', 'u-ann'), TaskSavedData)
    expect(saved.assignees).toEqual([{ userId: 'u-ann', label: 'Annie' }])
  })
})
