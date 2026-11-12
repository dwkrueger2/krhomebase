// file: apps/api/src/features/themes/themes.test.ts
/**
 * Firm themes read from the `lookup` table (Settings plan, section 13, stage 2b), against an in-memory Schema 8.0.
 * Made-up themes only. Checks: the old editor's shape and the new shape, values checked and unknown ones dropped,
 * inactive rows left out, the firm default kept only when its theme exists, and 503 without the table. Stage 4a
 * writes (super admin): create, change (an old-shape row rewritten in the versioned shape), retire, the firm default
 * (set, changed in place, switched off), refusals for other roles and unknown themes, and an audit row per write.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/themes/themes.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, FirmThemeSavedData, FirmThemesData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)

function addTheme(value: string, label: string, description: string, active = 1, sortOrder = 100) {
  run(`INSERT INTO lookup (id, category, value, label, description, sort_order, is_active) VALUES (?1, 'kr_homebase_theme', ?2, ?3, ?4, ?5, ?6)`,
    `lk_kr_homebase_theme_${value.replace(/-/g, '_')}`, value, label, description, sortOrder, active)
}

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
})

async function themes(database: D1Database = env.db) {
  return app.request('/v1/themes', { headers: SIGNED_IN_HEADERS }, signedInEnv('staff', { krhomebase: database }))
}

describe('GET /v1/themes', () => {
  it("reads the old editor's shape as light values and the new shape as light and dark, dropping what is not allowed", async () => {
    addTheme('old-one', 'Old One', JSON.stringify({ id: 'old-one', name: 'Old One', tokens: { brandPrimary: '#112233', textColor: 'red; x', notAToken: '#000000' } }), 1, 10)
    addTheme('new-one', 'New One', JSON.stringify({ schemaVersion: 1, description: 'Blue', light: { '--kr-theme-line': '#AABBCC' }, dark: { '--kr-theme-line': '#334455', '--kr-theme-danger': 'url(x)' } }), 1, 20)
    addTheme('retired', 'Retired', '{}', 0)
    const res = await themes()
    expect(res.status).toBe(200)
    const data = FirmThemesData.parse(((await res.json()) as { data: unknown }).data)
    expect(data).toEqual({
      firmDefaultThemeId: null,
      themes: [
        { id: 'old-one', name: 'Old One', description: '', light: { '--kr-theme-brand-primary': '#112233' }, dark: {}, storedShape: 'old' },
        { id: 'new-one', name: 'New One', description: 'Blue', light: { '--kr-theme-line': '#aabbcc' }, dark: { '--kr-theme-line': '#334455' }, storedShape: 'current' },
      ],
    })
  })

  it('names the firm default only when that theme exists', async () => {
    addTheme('firm-blue', 'Firm Blue', '{"schemaVersion":1,"light":{},"dark":{}}')
    run(`INSERT INTO lookup (id, category, value, label) VALUES ('lk_kr_homebase_theme_default', 'kr_homebase_theme_default', 'firm-blue', 'Firm default theme')`)
    expect(FirmThemesData.parse(((await (await themes()).json()) as { data: unknown }).data).firmDefaultThemeId).toBe('firm-blue')
    run(`UPDATE lookup SET value = 'gone' WHERE id = 'lk_kr_homebase_theme_default'`)
    expect(FirmThemesData.parse(((await (await themes()).json()) as { data: unknown }).data).firmDefaultThemeId).toBeNull()
  })

  it('answers 503 THEMES_UNAVAILABLE without the lookup table', async () => {
    const res = await themes(createTestD1().db)
    expect(res.status).toBe(503)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('THEMES_UNAVAILABLE')
  })
})

async function write(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, role = 'super_admin') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, 'u-admin'))
}

async function saved(res: Response) {
  expect(res.status).toBe(200)
  return FirmThemeSavedData.parse(((await res.json()) as { data: unknown }).data)
}

const auditActions = () => env.sqlite.prepare(`SELECT action, target_table, target_id, actor_user_id FROM audit_log WHERE resource = 'themes' ORDER BY rowid`).all()

describe('theme writes (stage 4a)', () => {
  beforeEach(() => {
    run(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-admin', 'admin@example.com', 'x', 'super_admin')`)
  })

  it('creates a theme in the versioned shape with checked values and an audit row', async () => {
    const data = await saved(await write('POST', '/v1/themes', { name: 'Harbor Blue', description: 'Calm', light: { '--kr-theme-line': '#AABBCC', '--kr-theme-danger': 'url(x)' }, dark: {} }))
    expect(data.theme).toMatchObject({ name: 'Harbor Blue', description: 'Calm', light: { '--kr-theme-line': '#aabbcc' }, dark: {}, storedShape: 'current' })
    const themeId = data.theme?.id ?? ''
    expect(themeId).toMatch(/^firm-harbor-blue-[0-9a-f]{4}$/)
    const row = env.sqlite.prepare(`SELECT id, category, description FROM lookup WHERE value = ?1`).get(themeId) as { id: string; category: string; description: string }
    expect(row.id).toBe(`lk_kr_homebase_theme_${themeId.replace(/-/g, '_')}`)
    expect(row.category).toBe('kr_homebase_theme')
    expect(JSON.parse(row.description)).toEqual({ schemaVersion: 1, description: 'Calm', light: { '--kr-theme-line': '#aabbcc' }, dark: {} })
    expect(auditActions()).toEqual([{ action: 'CREATE', target_table: 'lookup', target_id: themeId, actor_user_id: 'u-admin' }])
  })

  it('rewrites an old-shape theme in the versioned shape when it is changed', async () => {
    addTheme('old-one', 'Old One', JSON.stringify({ id: 'old-one', tokens: { brandPrimary: '#112233' } }))
    const data = await saved(await write('PUT', '/v1/themes/old-one', { name: 'Old One Renamed', description: '', light: { '--kr-theme-brand-primary': '#112233' }, dark: { '--kr-theme-line': '#000000' } }))
    expect(data.theme).toMatchObject({ id: 'old-one', name: 'Old One Renamed', storedShape: 'current', dark: { '--kr-theme-line': '#000000' } })
    expect(auditActions()).toHaveLength(1)
  })

  it('retires a theme (kept with is_active 0) and leaves it out of the list', async () => {
    addTheme('firm-blue', 'Firm Blue', '{"schemaVersion":1,"light":{},"dark":{}}')
    const data = await saved(await write('DELETE', '/v1/themes/firm-blue'))
    expect(data.theme).toBeNull()
    expect(data.themes.themes).toEqual([])
    expect(env.sqlite.prepare(`SELECT is_active FROM lookup WHERE value = 'firm-blue'`).get()).toEqual({ is_active: 0 })
    expect(auditActions()[0]).toMatchObject({ action: 'RETIRE', target_id: 'firm-blue' })
  })

  it('sets the firm default, changes it in place, and switches it off for the built-in theme', async () => {
    addTheme('firm-blue', 'Firm Blue', '{"schemaVersion":1,"light":{},"dark":{}}')
    addTheme('firm-green', 'Firm Green', '{"schemaVersion":1,"light":{},"dark":{}}')
    expect((await saved(await write('PUT', '/v1/themes/firm-default', { themeId: 'firm-blue' }))).themes.firmDefaultThemeId).toBe('firm-blue')
    expect((await saved(await write('PUT', '/v1/themes/firm-default', { themeId: 'firm-green' }))).themes.firmDefaultThemeId).toBe('firm-green')
    expect((await saved(await write('PUT', '/v1/themes/firm-default', { themeId: null }))).themes.firmDefaultThemeId).toBeNull()
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM lookup WHERE category = 'kr_homebase_theme_default'`).get()).toEqual({ n: 1 })
    expect(auditActions()).toHaveLength(3)
  })

  it('answers 404 THEME_NOT_FOUND for an unknown or retired theme and writes nothing', async () => {
    addTheme('retired', 'Retired', '{}', 0)
    const replies = [
      await write('PUT', '/v1/themes/retired', { name: 'X', description: '', light: {}, dark: {} }),
      await write('DELETE', '/v1/themes/nobody'),
      await write('PUT', '/v1/themes/firm-default', { themeId: 'retired' }),
    ]
    for (const res of replies) {
      expect(res.status).toBe(404)
      expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('THEME_NOT_FOUND')
    }
    expect(auditActions()).toEqual([])
  })

  it('refuses a person who is not a super admin (403)', async () => {
    const res = await write('POST', '/v1/themes', { name: 'Nope', description: '', light: {}, dark: {} }, 'admin')
    expect(res.status).toBe(403)
    expect(auditActions()).toEqual([])
  })
})
