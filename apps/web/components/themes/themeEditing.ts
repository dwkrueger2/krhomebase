// file: apps/web/components/themes/themeEditing.ts
/**
 * Pure helpers shared by the two theme editors: the firm theme editor (`features/themes`, Settings plan stage 4a) and
 * the person's own theme under Preferences (`features/preferences`, stage 2b). No API calls, no React. Moved here from
 * `features/themes/themeEditing.ts` when the second feature needed it (apps/web/AGENTS.md, folder rule 1).
 *
 * - **Drafts:** what an editor holds (`ThemeDraft`: name, description, light and dark values), made from a stored
 *   theme or empty for a new one, compared by content for "unsaved changes".
 * - **Values beneath:** the built-in values under a theme for light or dark (`builtInValues`), shown for settings the
 *   theme leaves alone and used by Theme in action and the readability check.
 * - **Files:** the download is a `.jsonc` file with a comment header and the versioned shape
 *   (`{ schemaVersion: 1, name, description, light, dark }`); an upload accepts that shape or the old editor's
 *   (`{ id, name, description, tokens: { camelCase: value } }`, light only). Comments are removed and every value is
 *   checked (`cleanThemeValues`, `themeValuesFromOldTokens`); unknown settings and invalid values are dropped.
 * - **Value helpers for the token ledger:** the old editor's font and title size choices, the title `clamp()` parts,
 *   padding shorthand to four px values, and the accent strip background (solid, gradient or none).
 *
 * Firm themes are rows of the `lookup` table (see the lookup table as described in Schema 8.0:
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table"); the API writes them.
 */

import { BUILT_IN_THEME, cleanThemeValues, themeValuesFromOldTokens, type FirmTheme, type ThemeValueMap } from '@krhomebase/contracts'

/** An editor's working copy of a theme. */
export interface ThemeDraft {
  name: string
  description: string
  light: ThemeValueMap
  dark: ThemeValueMap
}

/** Light or dark. */
export type ThemeMode = 'light' | 'dark'

/** An empty new theme (everything falls through to the built-in theme). */
export function emptyDraft(name = 'New Theme'): ThemeDraft {
  return { name, description: '', light: {}, dark: {} }
}

/** A stored theme as a draft. */
export function draftFromTheme(theme: FirmTheme): ThemeDraft {
  return { name: theme.name, description: theme.description, light: { ...theme.light }, dark: { ...theme.dark } }
}

/** True when two drafts hold the same name, description and values (order of keys ignored). */
export function sameDraft(a: ThemeDraft, b: ThemeDraft): boolean {
  const sorted = (values: ThemeValueMap) => JSON.stringify(Object.keys(values).sort().map((key) => [key, values[key]]))
  return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim() && sorted(a.light) === sorted(b.light) && sorted(a.dark) === sorted(b.dark)
}

/** The built-in values beneath a theme: light, or light with the dark changes. */
export function builtInValues(mode: ThemeMode): ThemeValueMap {
  return mode === 'light' ? { ...BUILT_IN_THEME.light } : { ...BUILT_IN_THEME.light, ...BUILT_IN_THEME.dark }
}

/** A file name for a download: the theme id, or the name made safe. */
export function themeFileName(themeId: string | null, name: string): string {
  const base = themeId ?? (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme')
  return `${base}.jsonc`
}

/** Where a downloaded file can be uploaded again, for its comment header. */
export type ThemeFileKind = 'firm' | 'personal'

/**
 * The download text: a comment header, then the versioned shape.
 *
 * @param draft - The theme as edited.
 * @param exportedAt - When (ISO time), written into the header.
 * @param kind - A firm theme (default) or a person's own colors.
 */
export function themeFileText(draft: ThemeDraft, exportedAt: string, kind: ThemeFileKind = 'firm'): string {
  const body = { schemaVersion: 1, name: draft.name.trim(), description: draft.description.trim(), light: draft.light, dark: draft.dark }
  const place = kind === 'firm' ? 'Application Settings > Other Configuration > Firm Themes' : 'Settings > User Settings > Preferences > Theme (your own colors)'
  return [
    `// KR Homebase ${kind === 'firm' ? 'firm theme' : 'personal theme'} (schemaVersion 1).`,
    `// Exported ${exportedAt}. Upload it in ${place}.`,
    '// Only --kr-theme-* settings with valid values are read; anything else is ignored.',
    JSON.stringify(body, null, 2),
    '',
  ].join('\n')
}

/** Starts a browser download of a theme file. */
export function downloadThemeFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

/** Removes `//` and `/* *\/` comments outside strings, so JSONC parses as JSON. */
export function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      out += char
      if (char === '\\') {
        out += next ?? ''
        index += 1
      } else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
      out += char
    } else if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      out += '\n'
    } else if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 1
    } else out += char
  }
  return out
}

/** The result of reading an uploaded theme file. */
export type ThemeFileResult = { ok: true; draft: ThemeDraft; shape: 'current' | 'old'; kept: number } | { ok: false; message: string }

/**
 * Reads an uploaded theme file (the versioned shape or the old editor's).
 *
 * @param text - The file text (JSON or JSONC).
 * @returns The draft and how many values were kept, or a sentence saying why it was not read.
 */
export function parseThemeFile(text: string): ThemeFileResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonComments(text))
  } catch {
    return { ok: false, message: 'The file could not be read. Check the JSON or JSONC syntax and try again.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, message: 'The file does not hold a theme.' }
  const stored = parsed as Record<string, unknown>
  const name = typeof stored.name === 'string' && stored.name.trim() ? stored.name.trim().slice(0, 60) : 'Uploaded Theme'
  const description = typeof stored.description === 'string' ? stored.description.trim().slice(0, 200) : ''
  if (stored.schemaVersion === 1) {
    const draft = { name, description, light: cleanThemeValues(stored.light), dark: cleanThemeValues(stored.dark) }
    return { ok: true, draft, shape: 'current', kept: Object.keys(draft.light).length + Object.keys(draft.dark).length }
  }
  if (stored.tokens && typeof stored.tokens === 'object') {
    const light = themeValuesFromOldTokens(stored.tokens)
    return { ok: true, draft: { name, description, light, dark: {} }, shape: 'old', kept: Object.keys(light).length }
  }
  return { ok: false, message: 'The file does not hold a theme (no schemaVersion 1 values and no old tokens).' }
}

/** The old editor's font choices (`KR_HOMEBASE_FONT_CHOICES`); each passes the `font` value check. */
export const THEME_FONT_CHOICES = [
  'Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'Georgia, "Times New Roman", serif',
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
] as const

/** The old editor's title size choices for the smallest and largest title (`KR_HOMEBASE_TITLE_FONT_SIZE_CHOICES`). */
export const THEME_TITLE_SIZE_CHOICES = ['12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px', '28px', '30px', '32px', '36px', '40px', '46px'] as const

/** The smallest and largest size of a stored title `clamp(min, 2.4vw, max)`. */
export function parseTitleClamp(value: string): { min: string; max: string } {
  const match = /clamp\(\s*([^,]+),\s*[^,]+,\s*([^)]+)\s*\)/i.exec(value)
  return match ? { min: match[1]!.trim(), max: match[2]!.trim() } : { min: '20px', max: '30px' }
}

/** The stored title size for a smallest and largest size. */
export function buildTitleClamp(min: string, max: string): string {
  return `clamp(${min}, 2.4vw, ${max})`
}

/** Padding shorthand (1 to 4 numbers, with or without px) as four px values, as the old editor did on leaving. */
export function normalizePadding(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => /^\d+(?:\.5)?(?:px)?$/.test(part))
    .map((part) => `${part.replace(/px$/, '')}px`)
  if (parts.length === 0) return '0px 0px 0px 0px'
  if (parts.length === 1) return `${parts[0]} ${parts[0]} ${parts[0]} ${parts[0]}`
  if (parts.length === 2) return `${parts[0]} ${parts[1]} ${parts[0]} ${parts[1]}`
  if (parts.length === 3) return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[1]}`
  return parts.slice(0, 4).join(' ')
}

/** The accent gradient made from the three accent colors (the old `buildKRHomebasePanelAccentGradient`). */
export function accentGradient(values: ThemeValueMap): string {
  return `linear-gradient(135deg, ${values['--kr-theme-panel-accent-solid'] ?? '#00305b'} 0%, ${values['--kr-theme-panel-accent-gradient-middle'] ?? '#0a4f9c'} 52%, ${values['--kr-theme-panel-accent-gradient-end'] ?? '#001e3a'} 100%)`
}

/** The accent strip's background: none, the solid color, or the gradient. */
export function accentStripBackground(values: ThemeValueMap): string {
  if (values['--kr-theme-panel-accent-strip'] === 'no') return 'transparent'
  return values['--kr-theme-panel-accent-style'] === 'gradient' ? accentGradient(values) : (values['--kr-theme-panel-accent-solid'] ?? 'transparent')
}
