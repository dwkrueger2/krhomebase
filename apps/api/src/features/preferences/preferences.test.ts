// file: apps/api/src/features/preferences/preferences.test.ts
/**
 * User preferences (Settings plan, decision 1, stage 2) against an in-memory copy of Schema 8.0 plus the
 * `user_preference` migration. Made-up people only.
 *
 * Checks: defaults for a person who never saved anything; a change saved with its audit row and read back; only
 * changed fields written; a change to nothing writing nothing; each person sees only their own rows; unreadable or
 * no-longer-allowed stored values reading as defaults; an invalid body refused; and 503 PREFERENCES_UNAVAILABLE when
 * the table is missing.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/preferences/preferences.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, UserPreferencesData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { preferencesFromRows } from './rules.ts'

const app = createApp()

let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const count = (sql: string, ...values: string[]) => (env.sqlite.prepare(sql).get(...values) as { n: number }).n

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  run(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-ann', 'ann@example.com', 'x', 'staff'), ('u-bob', 'bob@example.com', 'x', 'attorney')`)
  clearSessionCache()
})

async function send(method: 'GET' | 'PUT', body?: unknown, userId = 'u-ann', database: D1Database = env.db) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request('/v1/me/preferences', init, signedInEnv('staff', { krhomebase: database }, userId))
}

async function preferencesOf(res: Response) {
  expect(res.status).toBe(200)
  return UserPreferencesData.parse(((await res.json()) as { data: unknown }).data)
}

const auditRows = () => count(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'preferences'`)

describe('GET /v1/me/preferences', () => {
  it('gives a person who never saved anything the defaults (light, 60 minutes, Dashboard) and no time', async () => {
    expect(await preferencesOf(await send('GET'))).toEqual({
      preferences: { theme: 'light', autoLogoutMinutes: 60, startingSection: 'dashboard', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} }, workstreamTypes: [] },
      updatedAt: null,
    })
  })

  it('reads an unreadable row, or a value no longer allowed, as the default', async () => {
    run(`INSERT INTO user_preference (user_id, preference_key, value_json, created_at, updated_at) VALUES
          ('u-ann', 'appearance', '{"theme":"purple"}', 't1', 't1'),
          ('u-ann', 'session', '{"autoLogoutMinutes":45}', 't1', 't2'),
          ('u-ann', 'navigation', '[]', 't1', 't1')`)
    const data = await preferencesOf(await send('GET'))
    expect(data.preferences).toEqual({ theme: 'light', autoLogoutMinutes: 60, startingSection: 'dashboard', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} }, workstreamTypes: [] })
    expect(data.updatedAt).toBe('t2')
    expect(auditRows()).toBe(0)
  })
})

describe('PUT /v1/me/preferences', () => {
  it('saves a change with its audit row and returns the whole set', async () => {
    const data = await preferencesOf(await send('PUT', { theme: 'dark', autoLogoutMinutes: 15 }))
    expect(data.preferences).toEqual({ theme: 'dark', autoLogoutMinutes: 15, startingSection: 'dashboard', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} }, workstreamTypes: [] })
    expect(data.updatedAt).not.toBeNull()
    expect(count(`SELECT COUNT(*) AS n FROM user_preference WHERE user_id = 'u-ann'`)).toBe(2)
    expect(auditRows()).toBe(2)
    const audit = env.sqlite.prepare(`SELECT actor_user_id, target_table, target_id, action FROM audit_log WHERE resource = 'preferences' ORDER BY target_id`).all()
    expect(audit).toEqual([
      { actor_user_id: 'u-ann', target_table: 'user_preference', target_id: 'u-ann:appearance', action: 'UPDATE' },
      { actor_user_id: 'u-ann', target_table: 'user_preference', target_id: 'u-ann:session', action: 'UPDATE' },
    ])
    expect(await preferencesOf(await send('GET'))).toEqual(data)
  })

  it('writes only the fields that change, and nothing for a change to the current value', async () => {
    await send('PUT', { theme: 'dark' })
    expect(auditRows()).toBe(1)
    await preferencesOf(await send('PUT', { theme: 'dark', startingSection: 'timekeeping' }))
    expect(auditRows()).toBe(2)
    await preferencesOf(await send('PUT', { theme: 'dark' }))
    await preferencesOf(await send('PUT', { autoLogoutMinutes: 60 }))
    expect(auditRows()).toBe(2)
    expect(count(`SELECT COUNT(*) AS n FROM user_preference WHERE user_id = 'u-ann'`)).toBe(2)
  })

  it("keeps each person's preferences apart", async () => {
    await send('PUT', { theme: 'dark' }, 'u-ann')
    expect((await preferencesOf(await send('GET', undefined, 'u-bob'))).preferences.theme).toBe('light')
    expect((await preferencesOf(await send('GET', undefined, 'u-ann'))).preferences.theme).toBe('dark')
  })

  it('refuses an empty change, an unknown field and a value that is not allowed (422 VALIDATION_FAILED)', async () => {
    for (const body of [{}, { fontSize: 14 }, { autoLogoutMinutes: 45 }, { startingSection: 'nowhere' }]) {
      const res = await send('PUT', body)
      expect(res.status).toBe(422)
      expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('VALIDATION_FAILED')
    }
    expect(auditRows()).toBe(0)
  })
})

describe('Dashboard widget choices (stage 3)', () => {
  it('saves them under the dashboard key and does not write the same set twice', async () => {
    const choices = { 'employee-clock-in': { enabled: false, order: 5 } }
    const data = await preferencesOf(await send('PUT', { dashboardWidgets: choices }))
    expect(data.preferences.dashboardWidgets).toEqual(choices)
    expect(count(`SELECT COUNT(*) AS n FROM user_preference WHERE user_id = 'u-ann' AND preference_key = 'dashboard'`)).toBe(1)
    await preferencesOf(await send('PUT', { dashboardWidgets: { 'employee-clock-in': { enabled: false, order: 5 } } }))
    expect(auditRows()).toBe(1)
  })
})

describe('personal theme (stage 2b)', () => {
  it('keeps only colors a person may change, under the theme key', async () => {
    const personalTheme = { themeId: 'built-in', density: 'comfortable', light: { '--kr-theme-brand-primary': '#123456', '--kr-theme-panel-background': '#00ff00' }, dark: {} }
    const data = await preferencesOf(await send('PUT', { personalTheme }))
    expect(data.preferences.personalTheme).toEqual({ themeId: 'built-in', density: 'comfortable', light: { '--kr-theme-brand-primary': '#123456' }, dark: {} })
    expect(count(`SELECT COUNT(*) AS n FROM user_preference WHERE user_id = 'u-ann' AND preference_key = 'theme'`)).toBe(1)
  })

  it('refuses colors that leave text hard to read (422 PERSONAL_THEME_LOW_CONTRAST) and saves nothing', async () => {
    const personalTheme = { themeId: 'built-in', density: 'compact', light: { '--kr-theme-card-surface': '#2a2a2a' }, dark: {} }
    const res = await send('PUT', { personalTheme })
    expect(res.status).toBe(422)
    const body = ErrorEnvelope.parse(await res.json())
    expect(body.error.code).toBe('PERSONAL_THEME_LOW_CONTRAST')
    expect(JSON.stringify(body.error.details)).toContain('--kr-theme-card-surface')
    expect(auditRows()).toBe(0)
  })
})

describe('without the table', () => {
  it('answers 503 PREFERENCES_UNAVAILABLE for a read and a change', async () => {
    const bare = createTestD1()
    for (const res of [await send('GET', undefined, 'u-ann', bare.db), await send('PUT', { theme: 'dark' }, 'u-ann', bare.db)]) {
      expect(res.status).toBe(503)
      expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('PREFERENCES_UNAVAILABLE')
    }
  })
})

describe('preferencesFromRows', () => {
  it('reports the newest row time and fills every field', () => {
    const data = preferencesFromRows([
      { key: 'navigation', valueJson: '{"startingSection":"billing"}', updatedAt: '2026-11-10T10:00:00.000Z' },
      { key: 'appearance', valueJson: 'not json', updatedAt: '2026-11-11T10:00:00.000Z' },
    ])
    expect(data).toEqual({ preferences: { theme: 'light', autoLogoutMinutes: 60, startingSection: 'billing', dashboardWidgets: {}, personalTheme: { themeId: 'firm-default', density: 'compact', light: {}, dark: {} }, workstreamTypes: [] }, updatedAt: '2026-11-11T10:00:00.000Z' })
  })
})
