// file: apps/api/src/features/tasks/queries.ts
/**
 * The only file of the tasks area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables (Schema 8.0):
 *
 * - `task`: one row per task; `id` is the seven-character public id (D21), a clash answers false so the caller tries
 *   again; `status`, `priority` and `billing_status` CHECK lists; `billing_value` 0 or more; `lead_user_id` is the
 *   supervising **user** (not a sales lead); `assigned_to_user_id` is the first current assignee, kept for the old
 *   screens and as the fallback for tasks without `task_assignee` rows. `workstream_activity_wsid` is not read or
 *   written (null on insert): it is a foreign key that would keep the WorkStream entry from being deleted; tasks and
 *   entries refer to each other in text only (`Task #ABC1234`, `WS #XYZ7890`).
 * - `task_assignee`: the assignees, UNIQUE `(task_id, user_id, assignment_role, is_current)`, so a task may hold at
 *   most one current and one ended row per user and role. This area writes only `assignment_role = 'assignee'` and
 *   keeps one row per user: a removed user's row is ended, a returning user's row is made current again.
 * - `client`, `matter`, `matter_party` (`is_primary_client = 1`): the client and matter checks and names.
 * - `user`, `individual`: the names of assignees, supervisor and creator.
 *
 * Lists are ordered by due date (no due date last), then newest recorded, then id; paged with a cursor of
 * `(COALESCE(due_date, '9999-12-31'), created_at, id)`. The current assignees of a whole page are read in one query
 * (`json_each` over the task ids). Writes are one batch with the `audit_log` row (resource `tasks`).
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

/** The due-date key used for a task without a due date, so it sorts last. */
export const NO_DUE_DATE = '9999-12-31'

export class TasksUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`TASKS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'TasksUnavailableError'
  }
}

export interface TaskRow {
  id: string
  title: string
  description: string | null
  type_label: string | null
  status: string
  priority: string
  client_id: string | null
  matter_id: string | null
  assigned_to_user_id: string | null
  assigned_by_user_id: string | null
  lead_user_id: string | null
  billing_value: number | null
  billing_status: string
  billing_description: string | null
  due_date: string | null
  completed_at: string | null
  created_by_user_id: string
  created_at: string
  updated_at: string | null
  /** `COALESCE(due_date, '9999-12-31')`, the first part of the page position. */
  due_key: string
  client_number: string | null
  client_display_name: string | null
  matter_number: string | null
  matter_title: string | null
  assigned_to_email: string | null
  assigned_to_preferred_name: string | null
  assigned_to_first_name: string | null
  assigned_to_last_name: string | null
  supervisor_email: string | null
  supervisor_preferred_name: string | null
  supervisor_first_name: string | null
  supervisor_last_name: string | null
  created_by_email: string | null
  created_by_preferred_name: string | null
  created_by_first_name: string | null
  created_by_last_name: string | null
}

/** One current `task_assignee` row with the user's name parts. */
export interface AssigneeRow {
  task_id: string
  user_id: string
  email: string | null
  preferred_name: string | null
  first_name: string | null
  last_name: string | null
}

/** The page position: the last row's due-date key, recorded time and id. */
export interface TaskCursor {
  dueKey: string
  createdAt: string
  id: string
}

export interface TaskListFilter {
  statuses: string[]
  assigneeUserId?: string
  clientId?: string
  matterId?: string
}

/** Every stored column of a task this area writes (`project_identifier` is left as it is). */
export interface TaskWrite {
  id: string
  title: string
  description: string | null
  typeLabel: string | null
  status: string
  priority: string
  clientId: string | null
  matterId: string | null
  supervisorUserId: string | null
  billingValue: number | null
  billingStatus: string
  billingDescription: string | null
  dueDate: string | null
  completedAt: string | null
  now: string
}

export interface TaskInsert extends TaskWrite {
  createdByUserId: string
  /** The new assignees, the first one first, each with the id its new row gets. */
  assignees: Array<{ id: string; userId: string }>
}

export interface TaskQueries {
  /** Up to `limit + 1` tasks after the cursor, in list order. */
  list(filter: TaskListFilter, cursor: TaskCursor | null, limit: number): Promise<TaskRow[]>
  task(taskId: string): Promise<TaskRow | null>
  /** The current assignee rows of these tasks, oldest assignment first. One query for the whole list. */
  currentAssignees(taskIds: string[]): Promise<AssigneeRow[]>
  clientExists(clientId: string): Promise<boolean>
  /** The matter and its first primary client, or null when there is no such matter. */
  matter(matterId: string): Promise<{ id: string; primary_client_id: string | null } | null>
  /** True when the matter is a primary-client matter of the client. */
  isPrimaryClientMatter(clientId: string, matterId: string): Promise<boolean>
  /** Which of these ids are active staff users (not `client` or `external_cpa`). */
  activeStaffUsers(userIds: string[]): Promise<string[]>
  /** Saves a new task with its assignee rows; false when its public id was taken in between. */
  insert(row: TaskInsert, audit: AuditEntry): Promise<boolean>
  /** Saves every column of `TaskWrite` on an existing task. */
  update(row: TaskWrite, audit: AuditEntry): Promise<void>
  /** Replaces the current assignees (`assignees` the whole new set, the first one first). */
  replaceAssignees(taskId: string, assignees: Array<{ id: string; userId: string }>, byUserId: string, now: string, audit: AuditEntry): Promise<void>
}

const TASK_SELECT = `SELECT t.id, t.title, t.description, t.type_label, t.status, t.priority, t.client_id, t.matter_id,
       t.assigned_to_user_id, t.assigned_by_user_id, t.lead_user_id, t.billing_value, t.billing_status,
       t.billing_description, t.due_date, t.completed_at, t.created_by_user_id, t.created_at, t.updated_at,
       COALESCE(t.due_date, '${NO_DUE_DATE}') AS due_key,
       c.client_number, c.display_name AS client_display_name, m.matter_number, m.title AS matter_title,
       au.email AS assigned_to_email, ai.preferred_name AS assigned_to_preferred_name, ai.first_name AS assigned_to_first_name, ai.last_name AS assigned_to_last_name,
       su.email AS supervisor_email, si.preferred_name AS supervisor_preferred_name, si.first_name AS supervisor_first_name, si.last_name AS supervisor_last_name,
       cu.email AS created_by_email, ci.preferred_name AS created_by_preferred_name, ci.first_name AS created_by_first_name, ci.last_name AS created_by_last_name
  FROM task t
  LEFT JOIN client c ON c.id = t.client_id
  LEFT JOIN matter m ON m.id = t.matter_id
  LEFT JOIN user au ON au.id = t.assigned_to_user_id
  LEFT JOIN individual ai ON ai.id = au.individual_id
  LEFT JOIN user su ON su.id = t.lead_user_id
  LEFT JOIN individual si ON si.id = su.individual_id
  LEFT JOIN user cu ON cu.id = t.created_by_user_id
  LEFT JOIN individual ci ON ci.id = cu.individual_id`

/** The columns `update` writes, in bind order ?2 to ?15 (?1 is the id). */
function writeValues(row: TaskWrite): Array<string | number | null> {
  return [
    row.title,
    row.description,
    row.typeLabel,
    row.status,
    row.priority,
    row.clientId,
    row.matterId,
    row.supervisorUserId,
    row.billingValue,
    row.billingStatus,
    row.billingDescription,
    row.dueDate,
    row.completedAt,
    row.now,
  ]
}

export function createTaskQueries(db: D1Database): TaskQueries {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      throw new TasksUnavailableError(error)
    }
  }

  /**
   * The statements that make `assignees` the current set, safe under the UNIQUE rule, in this order:
   * 1. a user being removed who also has an older ended row (only rows from before this API) loses that older row,
   *    so ending the current one cannot make a second ended row;
   * 2. users left out have their current row ended (`is_current = 0`, `ended_at` set);
   * 3. a returning user's ended row is made current again (`ended_at` cleared, assigned again now);
   * 4. users with no row get a new one;
   * 5. `task.assigned_to_user_id` becomes the first assignee, or null.
   */
  function assigneeStatements(taskId: string, assignees: Array<{ id: string; userId: string }>, byUserId: string, now: string): D1PreparedStatement[] {
    const userIds = JSON.stringify(assignees.map((entry) => entry.userId))
    const entries = JSON.stringify(assignees)
    return [
      db
        .prepare(
          `DELETE FROM task_assignee
            WHERE task_id = ?1 AND assignment_role = 'assignee' AND is_current = 0
              AND user_id NOT IN (SELECT value FROM json_each(?2))
              AND user_id IN (SELECT ta.user_id FROM task_assignee ta WHERE ta.task_id = ?1 AND ta.assignment_role = 'assignee' AND ta.is_current = 1)`,
        )
        .bind(taskId, userIds),
      db
        .prepare(
          `UPDATE task_assignee SET is_current = 0, ended_at = ?3
            WHERE task_id = ?1 AND assignment_role = 'assignee' AND is_current = 1 AND user_id NOT IN (SELECT value FROM json_each(?2))`,
        )
        .bind(taskId, userIds, now),
      db
        .prepare(
          `UPDATE task_assignee SET is_current = 1, ended_at = NULL, assigned_at = ?3, assigned_by_user_id = ?4
            WHERE task_id = ?1 AND assignment_role = 'assignee' AND is_current = 0 AND user_id IN (SELECT value FROM json_each(?2))
              AND NOT EXISTS (SELECT 1 FROM task_assignee cur WHERE cur.task_id = ?1 AND cur.user_id = task_assignee.user_id
                                AND cur.assignment_role = 'assignee' AND cur.is_current = 1)`,
        )
        .bind(taskId, userIds, now, byUserId),
      db
        .prepare(
          `INSERT INTO task_assignee (id, task_id, user_id, assignment_role, assigned_by_user_id, assigned_at, ended_at, is_current)
           SELECT json_extract(e.value, '$.id'), ?1, json_extract(e.value, '$.userId'), 'assignee', ?4, ?3, NULL, 1
             FROM json_each(?2) e
            WHERE NOT EXISTS (SELECT 1 FROM task_assignee ta WHERE ta.task_id = ?1 AND ta.user_id = json_extract(e.value, '$.userId')
                                AND ta.assignment_role = 'assignee')`,
        )
        .bind(taskId, entries, now, byUserId),
      db.prepare('UPDATE task SET assigned_to_user_id = ?2, assigned_by_user_id = ?3, updated_at = ?4 WHERE id = ?1').bind(taskId, assignees[0]?.userId ?? null, byUserId, now),
    ]
  }

  return {
    list: (filter, cursor, limit) =>
      run(async () => {
        const where: string[] = []
        const values: Array<string | number> = []
        const bind = (value: string | number) => {
          values.push(value)
          return `?${values.length}`
        }
        where.push(`t.status IN (SELECT value FROM json_each(${bind(JSON.stringify(filter.statuses))}))`)
        if (filter.clientId) where.push(`t.client_id = ${bind(filter.clientId)}`)
        if (filter.matterId) where.push(`t.matter_id = ${bind(filter.matterId)}`)
        if (filter.assigneeUserId) {
          // A current assignee row, or (for a task with none) the single assigned_to_user_id, as the reply shows it.
          const user = bind(filter.assigneeUserId)
          where.push(
            `(EXISTS (SELECT 1 FROM task_assignee ta WHERE ta.task_id = t.id AND ta.user_id = ${user} AND ta.assignment_role = 'assignee' AND ta.is_current = 1)
              OR (t.assigned_to_user_id = ${user} AND NOT EXISTS (SELECT 1 FROM task_assignee tb WHERE tb.task_id = t.id AND tb.assignment_role = 'assignee' AND tb.is_current = 1)))`,
          )
        }
        if (cursor) {
          const due = bind(cursor.dueKey)
          const at = bind(cursor.createdAt)
          where.push(`(COALESCE(t.due_date, '${NO_DUE_DATE}') > ${due} OR (COALESCE(t.due_date, '${NO_DUE_DATE}') = ${due} AND (t.created_at < ${at} OR (t.created_at = ${at} AND t.id < ${bind(cursor.id)}))))`)
        }
        const sql = `${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY COALESCE(t.due_date, '${NO_DUE_DATE}') ASC, t.created_at DESC, t.id DESC LIMIT ${bind(limit + 1)}`
        return (await db.prepare(sql).bind(...values).all<TaskRow>()).results ?? []
      }),

    task: (taskId) => run(() => db.prepare(`${TASK_SELECT} WHERE t.id = ?1 LIMIT 1`).bind(taskId).first<TaskRow>()),

    currentAssignees: (taskIds) =>
      run(async () => {
        if (!taskIds.length) return []
        const sql = `SELECT ta.task_id, ta.user_id, u.email, i.preferred_name, i.first_name, i.last_name
                       FROM task_assignee ta
                       LEFT JOIN user u ON u.id = ta.user_id
                       LEFT JOIN individual i ON i.id = u.individual_id
                      WHERE ta.task_id IN (SELECT value FROM json_each(?1)) AND ta.assignment_role = 'assignee' AND ta.is_current = 1
                      ORDER BY ta.assigned_at, ta.id`
        return (await db.prepare(sql).bind(JSON.stringify(taskIds)).all<AssigneeRow>()).results ?? []
      }),

    clientExists: (clientId) => run(async () => Boolean(await db.prepare('SELECT 1 AS found FROM client WHERE id = ?1 LIMIT 1').bind(clientId).first())),

    matter: (matterId) =>
      run(() =>
        db
          .prepare(
            `SELECT m.id,
                    (SELECT mp.client_id FROM matter_party mp WHERE mp.matter_id = m.id AND mp.is_primary_client = 1 AND mp.client_id IS NOT NULL
                      ORDER BY mp.added_date, mp.id LIMIT 1) AS primary_client_id
               FROM matter m WHERE m.id = ?1 LIMIT 1`,
          )
          .bind(matterId)
          .first<{ id: string; primary_client_id: string | null }>(),
      ),

    isPrimaryClientMatter: (clientId, matterId) =>
      run(async () =>
        Boolean(await db.prepare('SELECT 1 AS found FROM matter_party mp WHERE mp.matter_id = ?2 AND mp.client_id = ?1 AND mp.is_primary_client = 1 LIMIT 1').bind(clientId, matterId).first()),
      ),

    activeStaffUsers: (userIds) =>
      run(async () => {
        if (!userIds.length) return []
        const rows = await db
          .prepare("SELECT u.id FROM user u WHERE u.id IN (SELECT value FROM json_each(?1)) AND u.is_active = 1 AND COALESCE(u.role, '') NOT IN ('client', 'external_cpa')")
          .bind(JSON.stringify(userIds))
          .all<{ id: string }>()
        return (rows.results ?? []).map((row) => row.id)
      }),

    async insert(row, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO task (id, title, description, type_label, status, priority, client_id, matter_id, lead_user_id,
                 billing_value, billing_status, billing_description, due_date, completed_at, created_at, updated_at,
                 assigned_to_user_id, assigned_by_user_id, created_by_user_id, workstream_activity_wsid, project_identifier)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, NULL, ?16, ?16, NULL, NULL)`,
            )
            .bind(row.id, ...writeValues(row), row.createdByUserId),
          ...assigneeStatements(row.id, row.assignees, row.createdByUserId, row.now),
          auditStatement(db, audit),
        ])
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/UNIQUE constraint failed: task\.id\b/i.test(message)) return false
        throw new TasksUnavailableError(error)
      }
    },

    async update(row, audit) {
      await run(() =>
        db.batch([
          db
            .prepare(
              `UPDATE task SET title = ?2, description = ?3, type_label = ?4, status = ?5, priority = ?6, client_id = ?7, matter_id = ?8,
                 lead_user_id = ?9, billing_value = ?10, billing_status = ?11, billing_description = ?12,
                 due_date = ?13, completed_at = ?14, updated_at = ?15
               WHERE id = ?1`,
            )
            .bind(row.id, ...writeValues(row)),
          auditStatement(db, audit),
        ]),
      )
    },

    async replaceAssignees(taskId, assignees, byUserId, now, audit) {
      await run(() => db.batch([...assigneeStatements(taskId, assignees, byUserId, now), auditStatement(db, audit)]))
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function taskQueriesFor(env: { krhomebase?: D1Database } | undefined): TaskQueries | null {
  return env?.krhomebase ? createTaskQueries(env.krhomebase) : null
}
