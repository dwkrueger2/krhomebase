// file: apps/api/src/features/preferences/routes.ts
/**
 * User preference routes (plan `docs/08_Settings_Dashboard_Plan.md`, decision 1, stage 2). New: the old app had no
 * route, because it kept these choices only in the browser.
 *
 *   GET /v1/me/preferences   the signed-in person's theme, auto logout time and starting page
 *   PUT /v1/me/preferences   change one or more of them
 *
 * Who may call: any signed-in person, for their own preferences only (`rules.ts`). Outside tools: closed (no
 * `toolAccess`). The PUT is a write: one batch with its `audit_log` rows, and it passes the write gate (feature
 * `preferences` is not exempt), so it is refused while the maintenance gate is locked.
 */

import { ErrorEnvelope, successEnvelope, UpdateUserPreferencesBody, UserPreferencesData } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { themeQueriesFor } from '../themes/queries.ts'
import { loadFirmThemes } from '../themes/rules.ts'
import { PreferencesUnavailableError, preferenceQueriesFor } from './queries.ts'
import { loadPreferences, PreferenceError, updatePreferences } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const UNAVAILABLE = 'PREFERENCES_UNAVAILABLE'
const unavailableBody = { description: 'The preferences cannot be read or saved right now (PREFERENCES_UNAVAILABLE).', content: json(ErrorEnvelope) }

export const getPreferencesRoute = defineRoute({
  method: 'get',
  path: '/v1/me/preferences',
  feature: 'preferences',
  summary: "The signed-in person's own preferences: theme, auto logout time and starting page, with defaults for any never saved.",
  access: 'signed-in',
  errors: [UNAVAILABLE],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The preferences in effect.', content: json(successEnvelope(UserPreferencesData)) },
    503: unavailableBody,
  },
})

export const updatePreferencesRoute = defineRoute({
  method: 'put',
  path: '/v1/me/preferences',
  feature: 'preferences',
  summary: "Changes one or more of the signed-in person's own preferences and returns the whole set; a personal theme that leaves text hard to read is refused.",
  access: 'signed-in',
  errors: [UNAVAILABLE, 'PERSONAL_THEME_LOW_CONTRAST', 'THEMES_UNAVAILABLE'],
  sideEffects: ['Writes user_preference (one row per changed key)', 'Writes audit_log (one row per changed key)'],
  request: { body: { content: json(UpdateUserPreferencesBody), required: true } },
  responses: {
    200: { description: 'The preferences after the change.', content: json(successEnvelope(UserPreferencesData)) },
    422: { description: 'A personal theme that leaves text hard to read (PERSONAL_THEME_LOW_CONTRAST), with the pairs in details.', content: json(ErrorEnvelope) },
    503: unavailableBody,
  },
})

/** 503 for a missing binding or table. */
function unavailable(c: Context<AppEnv>, error?: unknown) {
  if (error) console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'PREFERENCES', message: error instanceof Error ? error.message : String(error) }))
  return failure(c, 503, UNAVAILABLE, 'Preferences are not available right now.')
}

/** Registers the two routes. */
export function registerPreferences(app: OpenAPIHono<AppEnv>) {
  app.openapi(getPreferencesRoute, async (c) => {
    const queries = preferenceQueriesFor(c.env)
    const userId = c.get('session')?.userId
    if (!queries || !userId) return unavailable(c)
    try {
      const data = await loadPreferences(queries, userId)
      logLine('PREFERENCES:read', c.get('requestId'), { stored: data.updatedAt !== null })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof PreferencesUnavailableError) return unavailable(c, error)
      throw error
    }
  })

  app.openapi(updatePreferencesRoute, async (c) => {
    const queries = preferenceQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session?.userId) return unavailable(c)
    try {
      const actor = { userId: session.userId, email: session.email ?? null, role: session.role ?? null, requestId: c.get('requestId') }
      const themeQueries = themeQueriesFor(c.env)
      const firmThemes = async () => (themeQueries ? loadFirmThemes(themeQueries) : { themes: [], firmDefaultThemeId: null })
      const { data, written } = await updatePreferences(queries, actor, c.req.valid('json'), new Date().toISOString(), firmThemes)
      logLine('PREFERENCES:update', c.get('requestId'), { written })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof PreferencesUnavailableError) return unavailable(c, error)
      if (error instanceof PreferenceError) return failure(c, error.status, error.code, error.message, error.details)
      throw error
    }
  })
}
