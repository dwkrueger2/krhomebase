// file: apps/api/src/features/themes/routes.ts
/**
 * Theme routes (Settings plan, section 13). New: the old app's `GET /krhomebase/api/kr-api-v1/theme-settings` answered
 * only `super_admin` and `admin`, so nobody else could even see the firm themes (reference section 4.5).
 *
 *   GET /v1/themes   the firm themes (from `lookup`) and the firm default, for every signed-in person (stage 2b)
 *
 *   POST   /v1/themes                 create a firm theme (super admin; stage 4a)
 *   PUT    /v1/themes/firm-default    choose the firm default theme, or none (super admin; stage 4a)
 *   PUT    /v1/themes/{themeId}       change a firm theme (super admin; stage 4a)
 *   DELETE /v1/themes/{themeId}       retire a firm theme (super admin; stage 4a)
 *
 * Firm themes are `lookup` rows. // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html
 * (section "How KR Homebase uses this table"). Writes pass the write gate and are audited (resource `themes`).
 * Outside tools: closed.
 */

import { ErrorEnvelope, FirmDefaultThemeBody, FirmThemeBody, FirmThemeParams, FirmThemeSavedData, FirmThemesData, successEnvelope } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { ThemesUnavailableError, themeQueriesFor, type ThemeQueries } from './queries.ts'
import { createFirmTheme, loadFirmThemes, retireFirmTheme, setFirmDefaultTheme, ThemeError, updateFirmTheme, type ThemeActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })

export const firmThemesRoute = defineRoute({
  method: 'get',
  path: '/v1/themes',
  feature: 'themes',
  summary: 'The firm themes and the firm default theme, with every value checked, for the theme picker and the frame.',
  access: 'signed-in',
  errors: ['THEMES_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The firm themes.', content: json(successEnvelope(FirmThemesData)) },
    503: { description: 'The themes cannot be read right now (THEMES_UNAVAILABLE).', content: json(ErrorEnvelope) },
  },
})

const SUPER_ADMIN = { roles: ['super_admin'] } as const
const savedReply = { description: 'The theme as stored and every firm theme after the change.', content: json(successEnvelope(FirmThemeSavedData)) }
const notFound = { description: 'No active theme with that id (THEME_NOT_FOUND).', content: json(ErrorEnvelope) }
const unavailable503 = { description: 'The themes cannot be written right now (THEMES_UNAVAILABLE).', content: json(ErrorEnvelope) }
const WRITES = ['Writes lookup (category kr_homebase_theme or kr_homebase_theme_default)', 'Writes audit_log']

export const createThemeRoute = defineRoute({
  method: 'post',
  path: '/v1/themes',
  feature: 'themes',
  summary: 'Creates a firm theme from a name, a description and its light and dark values (every value checked).',
  access: SUPER_ADMIN,
  errors: ['THEMES_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { body: { content: json(FirmThemeBody), required: true } },
  responses: { 200: savedReply, 503: unavailable503 },
})

export const setFirmDefaultThemeRoute = defineRoute({
  method: 'put',
  path: '/v1/themes/firm-default',
  feature: 'themes',
  summary: 'Chooses the theme everyone gets until they choose one, or none for the built-in theme.',
  access: SUPER_ADMIN,
  errors: ['THEME_NOT_FOUND', 'THEMES_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { body: { content: json(FirmDefaultThemeBody), required: true } },
  responses: { 200: savedReply, 404: notFound, 503: unavailable503 },
})

export const updateThemeRoute = defineRoute({
  method: 'put',
  path: '/v1/themes/{themeId}',
  feature: 'themes',
  summary: "Changes a firm theme's name, description and values; a theme saved by the old editor is rewritten in the versioned shape.",
  access: SUPER_ADMIN,
  errors: ['THEME_NOT_FOUND', 'THEMES_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: FirmThemeParams, body: { content: json(FirmThemeBody), required: true } },
  responses: { 200: savedReply, 404: notFound, 503: unavailable503 },
})

export const retireThemeRoute = defineRoute({
  method: 'delete',
  path: '/v1/themes/{themeId}',
  feature: 'themes',
  summary: 'Retires a firm theme (kept in lookup with is_active 0); people who chose it get the firm default.',
  access: SUPER_ADMIN,
  errors: ['THEME_NOT_FOUND', 'THEMES_UNAVAILABLE'],
  sideEffects: WRITES,
  request: { params: FirmThemeParams },
  responses: { 200: savedReply, 404: notFound, 503: unavailable503 },
})

/**
 * Registers one theme write: finds the database and the person, runs `work`, answers `{ ok, data, requestId }` with
 * 200, and maps refusals and a missing table to their error replies. Typed loosely on purpose, as Billing's and
 * Attendance's: every write route shares the shape.
 */
function handleWrite(
  app: OpenAPIHono<AppEnv>,
  route: ReturnType<typeof defineRoute>,
  tag: string,
  work: (queries: ThemeQueries, actor: ThemeActor, now: string, c: Context<AppEnv>) => Promise<FirmThemeSavedData>,
) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = themeQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'THEMES_UNAVAILABLE', 'Themes are not available right now.')
    try {
      const actor: ThemeActor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') }
      const data = await work(queries, actor, new Date().toISOString(), c)
      logLine(`THEMES:${tag}`, c.get('requestId'), { themes: data.themes.themes.length })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof ThemeError) return failure(c, error.status, error.code, error.message)
      if (error instanceof ThemesUnavailableError) {
        console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'THEMES', message: error.message }))
        return failure(c, 503, 'THEMES_UNAVAILABLE', 'Themes are not available right now.')
      }
      throw error
    }
  }) as any)
}

// Valid input, read once the route has checked it (hono's `c.req.valid` is typed per route; the helper is shared).
const valid = <T,>(c: Context<AppEnv>, target: 'param' | 'json'): T => (c.req as any).valid(target) as T

export function registerThemes(app: OpenAPIHono<AppEnv>) {
  handleWrite(app, createThemeRoute, 'create', (q, actor, now, c) => createFirmTheme(q, actor, valid<FirmThemeBody>(c, 'json'), now))
  // Registered before /v1/themes/{themeId}, so "firm-default" is never read as a theme id.
  handleWrite(app, setFirmDefaultThemeRoute, 'firm_default', (q, actor, now, c) => setFirmDefaultTheme(q, actor, valid<FirmDefaultThemeBody>(c, 'json').themeId, now))
  handleWrite(app, updateThemeRoute, 'update', (q, actor, now, c) => updateFirmTheme(q, actor, valid<FirmThemeParams>(c, 'param').themeId, valid<FirmThemeBody>(c, 'json'), now))
  handleWrite(app, retireThemeRoute, 'retire', (q, actor, now, c) => retireFirmTheme(q, actor, valid<FirmThemeParams>(c, 'param').themeId, now))
  app.openapi(firmThemesRoute, async (c) => {
    const queries = themeQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'THEMES_UNAVAILABLE', 'Themes are not available right now.')
    try {
      const data = await loadFirmThemes(queries)
      logLine('THEMES:list', c.get('requestId'), { themes: data.themes.length, firmDefault: data.firmDefaultThemeId !== null })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof ThemesUnavailableError) {
        console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'THEMES', message: error.message }))
        return failure(c, 503, 'THEMES_UNAVAILABLE', 'Themes are not available right now.')
      }
      throw error
    }
  })
}
