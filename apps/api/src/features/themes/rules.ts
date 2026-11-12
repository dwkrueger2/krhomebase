// file: apps/api/src/features/themes/rules.ts
/**
 * Reading firm themes (Settings plan, section 13, stage 2b). Firm themes are rows of the `lookup` table, category
 * `kr_homebase_theme` (see the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html, section
 * "How KR Homebase uses this table").
 *
 * Each row's `description` is read in one of two shapes:
 * - **current:** `{ schemaVersion: 1, name?, description?, light: { "--kr-theme-...": value }, dark: {...} }`;
 * - **old** (the old editor, `hb-components/theme/KRHomebaseTheme.ts`): `{ id, name, description, tokens: { brandPrimary:
 *   value, ... } }`, light values only; the camelCase names are mapped with the old editor's own table
 *   (`themeValuesFromOldTokens`).
 *
 * Every value is checked (`cleanThemeValues`): unknown names and invalid values are dropped, never passed on. A row
 * that is not JSON, or has no values left, is still listed (it then looks like the built-in theme), so a person who
 * chose it is not surprised by it disappearing.
 *
 * The firm default is the id named by the `kr_homebase_theme_default` row, kept only when that theme exists.
 */

import { cleanThemeValues, themeValuesFromOldTokens, type FirmTheme, type FirmThemeBody, type FirmThemeSavedData, type FirmThemesData } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { ThemeQueries, ThemeRow } from './queries.ts'

/** A refused theme change. */
export class ThemeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404,
  ) {
    super(message)
    this.name = 'ThemeError'
  }
}

/** The super admin making a change, from the session. */
export interface ThemeActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

const audit = (actor: ThemeActor, action: string, targetId: string, newJson?: unknown): AuditEntry => ({
  requestId: actor.requestId,
  actorUserId: actor.userId,
  actorEmail: actor.email,
  actorRole: actor.role,
  resource: 'themes',
  action,
  targetTable: 'lookup',
  targetId,
  newJson,
})

/** The JSON stored for a theme (the versioned shape), with its values checked. */
function storedJson(body: FirmThemeBody): { json: string; light: Record<string, string>; dark: Record<string, string> } {
  const light = cleanThemeValues(body.light)
  const dark = cleanThemeValues(body.dark)
  return { json: JSON.stringify({ schemaVersion: 1, description: body.description, light, dark }), light, dark }
}

/** A new theme id from its name: `firm-<slug>-<4 hex>`, so it never clashes with an old or a reserved id. */
export function newThemeId(name: string, random: () => string = () => crypto.randomUUID().slice(0, 4)): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'theme'
  return `firm-${slug}-${random()}`
}

/** Creates a firm theme in the versioned shape (super admin). */
export async function createFirmTheme(queries: ThemeQueries, actor: ThemeActor, body: FirmThemeBody, now: string): Promise<FirmThemeSavedData> {
  const themeId = newThemeId(body.name)
  const { json } = storedJson(body)
  await queries.insertTheme({ themeId, name: body.name, json, now }, audit(actor, 'CREATE', themeId, { name: body.name }))
  const themes = await loadFirmThemes(queries)
  return { theme: themes.themes.find((theme) => theme.id === themeId) ?? null, themes }
}

/** Changes a firm theme; an old-shape row is rewritten in the versioned shape (super admin). */
export async function updateFirmTheme(queries: ThemeQueries, actor: ThemeActor, themeId: string, body: FirmThemeBody, now: string): Promise<FirmThemeSavedData> {
  if (!(await queries.themeExists(themeId))) throw new ThemeError('THEME_NOT_FOUND', 'That theme does not exist or was retired.', 404)
  const { json } = storedJson(body)
  await queries.updateTheme({ themeId, name: body.name, json, now }, audit(actor, 'UPDATE', themeId, { name: body.name }))
  const themes = await loadFirmThemes(queries)
  return { theme: themes.themes.find((theme) => theme.id === themeId) ?? null, themes }
}

/** Retires a firm theme (super admin). A person who chose it then gets the firm default. */
export async function retireFirmTheme(queries: ThemeQueries, actor: ThemeActor, themeId: string, now: string): Promise<FirmThemeSavedData> {
  if (!(await queries.themeExists(themeId))) throw new ThemeError('THEME_NOT_FOUND', 'That theme does not exist or was retired.', 404)
  await queries.retireTheme(themeId, now, audit(actor, 'RETIRE', themeId))
  return { theme: null, themes: await loadFirmThemes(queries) }
}

/** Chooses the firm default theme, or (null) the built-in theme (super admin). */
export async function setFirmDefaultTheme(queries: ThemeQueries, actor: ThemeActor, themeId: string | null, now: string): Promise<FirmThemeSavedData> {
  if (themeId && !(await queries.themeExists(themeId))) throw new ThemeError('THEME_NOT_FOUND', 'That theme does not exist or was retired.', 404)
  await queries.setFirmDefault(themeId, now, audit(actor, 'UPDATE', 'lk_kr_homebase_theme_default', { themeId }))
  return { theme: null, themes: await loadFirmThemes(queries) }
}

/** Parses a stored JSON object, or returns null. */
function parseObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * One stored row as a firm theme.
 *
 * @param row - The `lookup` row.
 * @returns The theme with its checked light and dark values.
 */
export function firmThemeFromRow(row: ThemeRow): FirmTheme {
  const stored = parseObject(row.description)
  const description = typeof stored?.description === 'string' ? stored.description.slice(0, 200) : ''
  if (stored && stored.schemaVersion === 1) {
    return { id: row.value, name: row.label, description, light: cleanThemeValues(stored.light), dark: cleanThemeValues(stored.dark), storedShape: 'current' }
  }
  return { id: row.value, name: row.label, description, light: themeValuesFromOldTokens(stored?.tokens), dark: {}, storedShape: 'old' }
}

/** The firm themes and the firm default, for every signed-in person. */
export async function loadFirmThemes(queries: ThemeQueries): Promise<FirmThemesData> {
  const [rows, defaultId] = await Promise.all([queries.themeRows(), queries.firmDefaultThemeId()])
  const themes = rows.map(firmThemeFromRow)
  return { themes, firmDefaultThemeId: defaultId && themes.some((theme) => theme.id === defaultId) ? defaultId : null }
}
