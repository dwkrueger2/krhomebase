// file: packages/contracts/src/themes.ts
/**
 * Themes: firm themes and each person's own theme (Settings and Dashboard plan, section 13, stage 2b).
 *
 *   GET    /v1/themes                 the firm themes (from the `lookup` table) and the firm default, for every signed-in person
 *   POST   /v1/themes                 create a firm theme (super admin; stage 4a)
 *   PUT    /v1/themes/{themeId}       change a firm theme's name, description and values (super admin; stage 4a)
 *   DELETE /v1/themes/{themeId}       retire a firm theme (`is_active = 0`; super admin; stage 4a)
 *   PUT    /v1/themes/firm-default    choose the firm default theme, or none (super admin; stage 4a)
 *
 * Layers (decision T1): the built-in theme (`apps/web/styles/theme.css`, copied below as `BUILT_IN_THEME`) → a firm
 * theme a super admin made (or the firm default) → the person's own color changes. Each layer holds only the settings
 * it changes, separately for the light and the dark theme, so a setting added later never breaks a stored theme.
 *
 * Firm themes live in the `lookup` table, category `kr_homebase_theme` (decision T3; see the lookup table as described
 * in Schema 8.0: docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table"). Two stored shapes are
 * read: the old editor's `{ id, name, description, tokens: { brandPrimary: '#00305b', ... } }` (camelCase names, light
 * values only; `oldKey` below maps them) and the new `{ schemaVersion: 1, light: {...}, dark: {...} }` keyed by
 * `--kr-theme-*` names.
 *
 * Safety: every value is checked against its kind before it is used (`isValidThemeValue`); unknown names and invalid
 * values are dropped (`cleanThemeValues`). The browser writes these values into a style rule, so the checks allow
 * nothing that could leave a CSS value: six-digit hex colors, listed sizes, four px paddings, plain font names.
 *
 * Who may change what (decision T2): `personal: true` settings (colors: brand, accent, surfaces, text, lines, tables,
 * buttons) may be changed by anyone for themselves, checked for readability (`themeContrastProblems`); the rest
 * (fonts, sizes, paddings, state colors, Communications colors) only in firm themes. Text size is a density choice.
 */

import { z } from 'zod'

/** Kinds of theme setting, each with its own value check. */
export type ThemeTokenKind = 'color' | 'font' | 'font-size-base' | 'font-size-small' | 'title-size' | 'padding' | 'select-strip' | 'select-style'

/** One theme setting: its CSS name, the old editor's name, its group and label, its kind, and who may change it. */
export interface ThemeTokenDefinition {
  /** The CSS custom property, for example `--kr-theme-brand-primary`. */
  name: `--kr-theme-${string}`
  /** The old editor's camelCase key, or null for settings the old editor did not have. */
  oldKey: string | null
  group: string
  label: string
  kind: ThemeTokenKind
  /** True when anyone may change it for themselves (colors only). */
  personal: boolean
}

const t = (name: ThemeTokenDefinition['name'], oldKey: string | null, group: string, label: string, kind: ThemeTokenKind, personal = false): ThemeTokenDefinition => ({
  name,
  oldKey,
  group,
  label,
  kind,
  personal,
})

/** Every theme setting a theme may change, in editor order (the old editor's groups). */
export const THEME_TOKEN_DEFINITIONS: readonly ThemeTokenDefinition[] = [
  t('--kr-theme-font-body', 'bodyFontFamily', 'Fonts', 'Body font', 'font'),
  t('--kr-theme-font-display', 'displayFontFamily', 'Fonts', 'Display font', 'font'),
  t('--kr-theme-font-size-base', 'baseFontSize', 'Font Sizes', 'Base font size', 'font-size-base'),
  t('--kr-theme-font-size-small', 'smallFontSize', 'Font Sizes', 'Small font size', 'font-size-small'),
  t('--kr-theme-font-size-title', 'titleFontSize', 'Font Sizes', 'Title font size', 'title-size'),
  t('--kr-theme-brand-primary', 'brandPrimary', 'Core Colors', 'Title bar (brand primary)', 'color', true),
  t('--kr-theme-brand-secondary', 'brandSecondary', 'Core Colors', 'Left menu (brand secondary)', 'color', true),
  t('--kr-theme-brand-primary-active', 'brandPrimaryActive', 'Core Colors', 'Selected menu row', 'color', true),
  t('--kr-theme-line', 'lineColor', 'Core Colors', 'Lines and borders', 'color', true),
  t('--kr-theme-shell-surface', 'shellSurface', 'Surfaces', 'Workspace background', 'color', true),
  t('--kr-theme-card-surface', 'cardSurface', 'Surfaces', 'Cards and fields', 'color', true),
  t('--kr-theme-muted-surface', 'mutedSurface', 'Surfaces', 'Card headers and toolbars', 'color', true),
  t('--kr-theme-text', 'textColor', 'Text Colors', 'Text', 'color', true),
  t('--kr-theme-text-muted', 'mutedTextColor', 'Text Colors', 'Muted text', 'color', true),
  t('--kr-theme-text-inverse', 'textInverse', 'Text Colors', 'Text on dark fills', 'color', true),
  t('--kr-theme-accent', 'accentColor', 'Action Colors', 'Accent (active tab, eyebrow)', 'color', true),
  t('--kr-theme-accent-dark', null, 'Action Colors', 'Accent, darker', 'color', true),
  // Teal, Orange, Danger and Success became personal on Nov 13, 2026 (the requester), so User Settings shows the
  // Action Colors too. The State Color Rule (DESIGN.md) still governs where they are used, not their shade.
  t('--kr-theme-teal', 'tealColor', 'Action Colors', 'Teal', 'color', true),
  t('--kr-theme-orange', 'orangeColor', 'Action Colors', 'Orange (attention)', 'color', true),
  t('--kr-theme-danger', 'dangerColor', 'Action Colors', 'Danger (red state)', 'color', true),
  t('--kr-theme-success', 'successColor', 'Action Colors', 'Success (green state)', 'color', true),
  t('--kr-theme-table-heading-dark', 'tableHeadingDark', 'Table Colors', 'Ledger heading row', 'color', true),
  t('--kr-theme-table-heading-light', 'tableHeadingLight', 'Table Colors', 'Light heading', 'color', true),
  t('--kr-theme-table-row-background-1', 'tableRowBackgroundOne', 'Table Colors', 'Row background 1', 'color', true),
  t('--kr-theme-table-row-background-2', 'tableRowBackgroundTwo', 'Table Colors', 'Row background 2', 'color', true),
  t('--kr-theme-table-row-hover', 'tableRowHover', 'Table Colors', 'Row hover', 'color', true),
  t('--kr-theme-table-row-selected', 'tableRowSelected', 'Table Colors', 'Row selected', 'color', true),
  t('--kr-theme-button-primary-background', 'primaryButtonBackground', 'Buttons', 'Primary button', 'color', true),
  t('--kr-theme-button-primary-hover-background', 'primaryButtonHoverBackground', 'Buttons', 'Primary button hover', 'color', true),
  t('--kr-theme-button-secondary-background', 'secondaryButtonBackground', 'Buttons', 'Secondary button', 'color', true),
  t('--kr-theme-panel-background', 'panelBackground', 'Panel', 'Panel background', 'color'),
  t('--kr-theme-panel-accent-strip', 'panelAccentStrip', 'Panel', 'Use accent strip', 'select-strip'),
  t('--kr-theme-panel-accent-style', 'panelAccentStyle', 'Panel', 'Accent strip style', 'select-style'),
  t('--kr-theme-panel-accent-solid', 'panelAccentSolid', 'Panel', 'Solid accent / gradient start', 'color'),
  t('--kr-theme-panel-accent-gradient-middle', 'panelAccentGradientMiddle', 'Panel', 'Gradient middle', 'color'),
  t('--kr-theme-panel-accent-gradient-end', 'panelAccentGradientEnd', 'Panel', 'Gradient end', 'color'),
  t('--kr-theme-communication-surface', 'communicationSurface', 'Communication Colors', 'Communication surface', 'color'),
  t('--kr-theme-communication-surface-elevated', 'communicationSurfaceElevated', 'Communication Colors', 'Surface elevated', 'color'),
  t('--kr-theme-communication-surface-raised', 'communicationSurfaceRaised', 'Communication Colors', 'Surface raised', 'color'),
  t('--kr-theme-communication-line', 'communicationLine', 'Communication Colors', 'Line', 'color'),
  t('--kr-theme-communication-text', 'communicationText', 'Communication Colors', 'Text', 'color'),
  t('--kr-theme-communication-text-muted', 'communicationTextMuted', 'Communication Colors', 'Text muted', 'color'),
  t('--kr-theme-communication-text-subtle', 'communicationTextSubtle', 'Communication Colors', 'Text subtle', 'color'),
  t('--kr-theme-communication-accent', 'communicationAccent', 'Communication Colors', 'Accent', 'color'),
  t('--kr-theme-communication-accent-strong', 'communicationAccentStrong', 'Communication Colors', 'Accent strong', 'color'),
  t('--kr-theme-communication-mention-background', 'communicationMentionBackground', 'Communication Colors', 'Mention background', 'color'),
  t('--kr-theme-communication-reaction-surface', 'communicationReactionSurface', 'Communication Colors', 'Reaction surface', 'color'),
  t('--kr-theme-communication-reaction-active', 'communicationReactionActive', 'Communication Colors', 'Reaction active', 'color'),
  t('--kr-theme-communication-composer-surface', 'communicationComposerSurface', 'Communication Colors', 'Composer surface', 'color'),
  t('--kr-theme-table-head-padding', 'tableHeadPadding', 'Padding', 'Ledger heading padding', 'padding'),
  t('--kr-theme-table-row-padding', 'tableRowPadding', 'Padding', 'Ledger row padding', 'padding'),
  t('--kr-theme-button-padding-regular', 'buttonPaddingRegular', 'Padding', 'Button padding', 'padding'),
  t('--kr-theme-widget-padding-8-10', 'widgetPadding8_10', 'Padding', 'Widget grid padding', 'padding'),
  t('--kr-theme-tab-strip-padding', null, 'Padding', 'Tab strip padding', 'padding'),
  t('--kr-theme-tab-button-padding', null, 'Padding', 'Tab button padding', 'padding'),
  t('--kr-theme-menu-panel-padding', null, 'Padding', 'Tab panel padding', 'padding'),
]

export type ThemeTokenName = ThemeTokenDefinition['name']

const BY_NAME = new Map<string, ThemeTokenDefinition>(THEME_TOKEN_DEFINITIONS.map((definition) => [definition.name, definition]))
const BY_OLD_KEY = new Map<string, ThemeTokenDefinition>(THEME_TOKEN_DEFINITIONS.filter((d) => d.oldKey).map((definition) => [definition.oldKey!, definition]))

/** The definition of a setting, or undefined for an unknown name. */
export function themeTokenDefinition(name: string): ThemeTokenDefinition | undefined {
  return BY_NAME.get(name)
}

/** The fixed choices of the settings that are picked from a list (the firm theme editor's drop-downs; stage 4a). */
export const THEME_VALUE_CHOICES: Readonly<Partial<Record<ThemeTokenKind, readonly string[]>>> = {
  'font-size-base': ['13px', '14px', '15px', '16px', '20px'],
  'font-size-small': ['11px', '12px', '13px', '14px', '16px'],
  'select-strip': ['yes', 'no'],
  'select-style': ['solid', 'gradient'],
}

const FONT_SIZE_BASE = new Set(THEME_VALUE_CHOICES['font-size-base'])
const FONT_SIZE_SMALL = new Set(THEME_VALUE_CHOICES['font-size-small'])
const PX = '(?:[0-9]|[1-3][0-9]|40)(?:\\.5)?px'
const PADDING = new RegExp(`^${PX} ${PX} ${PX} ${PX}$`)

/**
 * True when a value is allowed for a setting. The rules keep every value a plain CSS value: no `;`, braces, quotes
 * beyond font names, parentheses (except the fixed title clamp) or `url(...)`.
 */
export function isValidThemeValue(definition: ThemeTokenDefinition, value: unknown): value is string {
  if (typeof value !== 'string') return false
  switch (definition.kind) {
    case 'color':
      return /^#[0-9a-fA-F]{6}$/.test(value)
    case 'font':
      return value.length <= 200 && /^[A-Za-z0-9 ,"'-]+$/.test(value)
    case 'font-size-base':
      return FONT_SIZE_BASE.has(value)
    case 'font-size-small':
      return FONT_SIZE_SMALL.has(value)
    case 'title-size': {
      const match = /^clamp\((\d{2})px, 2\.4vw, (\d{2})px\)$/.exec(value)
      return Boolean(match) && Number(match![1]) >= 12 && Number(match![2]) <= 46 && Number(match![1]) <= Number(match![2])
    }
    case 'padding':
      return PADDING.test(value)
    case 'select-strip':
      return value === 'yes' || value === 'no'
    case 'select-style':
      return value === 'solid' || value === 'gradient'
  }
}

/** A set of theme values keyed by `--kr-theme-*` name (only names in `THEME_TOKEN_DEFINITIONS` after cleaning). */
export type ThemeValueMap = Record<string, string>

/**
 * Keeps only known settings with valid values (lowercasing hex colors).
 *
 * @param input - Any object (stored JSON, a request body).
 * @param options - `personalOnly`: drop settings a person may not change.
 * @returns The clean map; everything else is dropped silently.
 */
export function cleanThemeValues(input: unknown, options: { personalOnly?: boolean } = {}): ThemeValueMap {
  const clean: ThemeValueMap = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return clean
  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    const definition = BY_NAME.get(name)
    if (!definition || (options.personalOnly && !definition.personal) || !isValidThemeValue(definition, value)) continue
    clean[definition.name] = definition.kind === 'color' ? value.toLowerCase() : value
  }
  return clean
}

/** Converts the old editor's camelCase `tokens` object to a clean map (unknown and invalid entries dropped). */
export function themeValuesFromOldTokens(tokens: unknown): ThemeValueMap {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return {}
  const renamed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(tokens as Record<string, unknown>)) {
    const definition = BY_OLD_KEY.get(key)
    if (definition) renamed[definition.name] = value
  }
  return cleanThemeValues(renamed)
}

/**
 * The built-in theme: the values in `apps/web/styles/theme.css` (light), and the dark set's changes. A web test
 * compares these with the file, so the two cannot drift apart. Used for readability checks; the page itself reads
 * `theme.css`.
 */
export const BUILT_IN_THEME: { light: ThemeValueMap; dark: ThemeValueMap } = {
  light: {
    '--kr-theme-font-size-base': '13px',
    '--kr-theme-font-size-small': '11px',
    '--kr-theme-brand-primary': '#00305b',
    '--kr-theme-brand-secondary': '#001e3a',
    '--kr-theme-brand-primary-active': '#0a4f9c',
    '--kr-theme-shell-surface': '#f7f9fb',
    '--kr-theme-card-surface': '#ffffff',
    '--kr-theme-muted-surface': '#eef3f7',
    '--kr-theme-text': '#243142',
    '--kr-theme-text-muted': '#5a6775',
    '--kr-theme-text-inverse': '#f7f9fb',
    '--kr-theme-line': '#d7dee5',
    '--kr-theme-accent': '#8a715c',
    '--kr-theme-accent-dark': '#6d5948',
    '--kr-theme-table-heading-dark': '#21394f',
    '--kr-theme-table-heading-light': '#eef3f7',
    '--kr-theme-table-row-background-1': '#ffffff',
    '--kr-theme-table-row-background-2': '#f7f9fb',
    '--kr-theme-table-row-hover': '#f0f6fb',
    '--kr-theme-table-row-selected': '#e3edf7',
    '--kr-theme-button-primary-background': '#21394f',
    '--kr-theme-button-primary-hover-background': '#2d4a66',
    '--kr-theme-button-secondary-background': '#eef3f7',
    // Added Nov 12, 2026: the rest of theme.css, so the theme editors show every built-in value and Theme in action
    // draws the built-in accent strip (they read this copy; the page itself reads theme.css).
    '--kr-theme-font-body': 'Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--kr-theme-font-display': 'Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--kr-theme-font-size-title': 'clamp(20px, 2.4vw, 30px)',
    '--kr-theme-teal': '#4e998a',
    '--kr-theme-orange': '#e45e25',
    '--kr-theme-danger': '#9d2c20',
    '--kr-theme-success': '#246b45',
    '--kr-theme-panel-background': '#ffffff',
    '--kr-theme-panel-accent-strip': 'yes',
    '--kr-theme-panel-accent-style': 'gradient',
    '--kr-theme-panel-accent-solid': '#00305b',
    '--kr-theme-panel-accent-gradient-middle': '#0f766e',
    '--kr-theme-panel-accent-gradient-end': '#21394f',
    '--kr-theme-communication-surface': '#0f1011',
    '--kr-theme-communication-surface-elevated': '#202124',
    '--kr-theme-communication-surface-raised': '#2b2c2f',
    '--kr-theme-communication-line': '#3c4043',
    '--kr-theme-communication-text': '#e8eaed',
    '--kr-theme-communication-text-muted': '#bdc1c6',
    '--kr-theme-communication-text-subtle': '#9aa0a6',
    '--kr-theme-communication-accent': '#a8c7fa',
    '--kr-theme-communication-accent-strong': '#8ab4f8',
    '--kr-theme-communication-mention-background': '#3c4043',
    '--kr-theme-communication-reaction-surface': '#303134',
    '--kr-theme-communication-reaction-active': '#41331c',
    '--kr-theme-communication-composer-surface': '#202124',
    '--kr-theme-table-head-padding': '6px 8px 6px 8px',
    '--kr-theme-table-row-padding': '2px 8px 2px 8px',
    '--kr-theme-button-padding-regular': '8px 10px 8px 10px',
    '--kr-theme-widget-padding-8-10': '8px 10px 8px 10px',
    '--kr-theme-tab-strip-padding': '0 10px 0 10px',
    '--kr-theme-tab-button-padding': '0 10px 0 10px',
    '--kr-theme-menu-panel-padding': '10px 0 0 0',
  },
  dark: {
    '--kr-theme-brand-primary': '#0b2744',
    '--kr-theme-brand-secondary': '#06182b',
    '--kr-theme-brand-primary-active': '#3f7fc4',
    '--kr-theme-shell-surface': '#10161d',
    '--kr-theme-card-surface': '#18212b',
    '--kr-theme-muted-surface': '#1f2a36',
    '--kr-theme-text': '#e3e9ef',
    '--kr-theme-text-muted': '#a3b0be',
    '--kr-theme-text-inverse': '#f7f9fb',
    '--kr-theme-line': '#2f3d4c',
    '--kr-theme-accent': '#c0a68c',
    '--kr-theme-accent-dark': '#a88d73',
    '--kr-theme-table-heading-dark': '#2a4560',
    '--kr-theme-table-heading-light': '#1f2a36',
    '--kr-theme-table-row-background-1': '#18212b',
    '--kr-theme-table-row-background-2': '#1c2631',
    '--kr-theme-table-row-hover': '#243243',
    '--kr-theme-table-row-selected': '#29405a',
    '--kr-theme-button-primary-background': '#2d4a66',
    '--kr-theme-button-primary-hover-background': '#3a5c7e',
    '--kr-theme-button-secondary-background': '#1f2a36',
    '--kr-theme-teal': '#66b8a8',
    '--kr-theme-orange': '#ec6a32',
    '--kr-theme-danger': '#e2735f',
    '--kr-theme-success': '#5cbf86',
    '--kr-theme-panel-background': '#18212b',
    '--kr-theme-panel-accent-solid': '#2d4a66',
  },
}

/** Relative luminance of a six-digit hex color (WCAG 2). */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio of two six-digit hex colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Text and background pairs that must stay readable, with the least contrast each needs. */
export const THEME_CONTRAST_PAIRS: ReadonlyArray<{ text: ThemeTokenName; background: ThemeTokenName; minimum: number }> = [
  { text: '--kr-theme-text', background: '--kr-theme-card-surface', minimum: 4.5 },
  { text: '--kr-theme-text', background: '--kr-theme-shell-surface', minimum: 4.5 },
  { text: '--kr-theme-text', background: '--kr-theme-muted-surface', minimum: 4.5 },
  { text: '--kr-theme-text', background: '--kr-theme-table-row-background-1', minimum: 4.5 },
  { text: '--kr-theme-text', background: '--kr-theme-table-row-background-2', minimum: 4.5 },
  { text: '--kr-theme-text-muted', background: '--kr-theme-card-surface', minimum: 3 },
  { text: '--kr-theme-text-inverse', background: '--kr-theme-brand-primary', minimum: 4.5 },
  { text: '--kr-theme-text-inverse', background: '--kr-theme-brand-secondary', minimum: 4.5 },
  { text: '--kr-theme-text-inverse', background: '--kr-theme-button-primary-background', minimum: 4.5 },
  { text: '--kr-theme-text-inverse', background: '--kr-theme-table-heading-dark', minimum: 4.5 },
]

/** One readability problem: which pair, its contrast, and the least it needs. */
export interface ThemeContrastProblem {
  text: ThemeTokenName
  background: ThemeTokenName
  ratio: number
  minimum: number
}

/**
 * The readability problems a person's changes cause.
 *
 * @param base - The values beneath the person's changes (built-in, then the firm theme), for one mode.
 * @param changes - The person's own changes for that mode.
 * @returns Each pair below its minimum that involves at least one changed setting (problems already in the firm
 *   theme are not the person's to fix).
 */
export function themeContrastProblems(base: ThemeValueMap, changes: ThemeValueMap): ThemeContrastProblem[] {
  const effective = { ...base, ...changes }
  const problems: ThemeContrastProblem[] = []
  for (const pair of THEME_CONTRAST_PAIRS) {
    if (changes[pair.text] === undefined && changes[pair.background] === undefined) continue
    const text = effective[pair.text]
    const background = effective[pair.background]
    if (!text || !background) continue
    const ratio = contrastRatio(text, background)
    if (ratio < pair.minimum) problems.push({ ...pair, ratio: Math.round(ratio * 100) / 100 })
  }
  return problems
}

const themeValueRecord = z
  .record(z.string(), z.string())
  .describe('Theme values keyed by --kr-theme-* name; unknown names and invalid values are dropped by the reader.')

/** One firm theme, as the API returns it (already cleaned). */
export const FirmTheme = z.object({
  id: z.string().describe('Theme id (the lookup row value), for example krhomebase-user-theme-1.'),
  name: z.string().describe('Name shown in the theme list.'),
  description: z.string().describe('One line about the theme (may be empty).'),
  light: themeValueRecord.describe('Values the theme changes in the light theme.'),
  dark: themeValueRecord.describe('Values the theme changes in the dark theme (the old editor stored none).'),
  storedShape: z.enum(['old', 'current']).describe('old: saved by the old editor (light values only); current: saved in the versioned shape.'),
})
export type FirmTheme = z.infer<typeof FirmTheme>

export const FirmThemesData = z.object({
  themes: z.array(FirmTheme).describe('Active firm themes, by sort order then name.'),
  firmDefaultThemeId: z.string().nullable().describe('The theme everyone gets until they choose one, or null for the built-in theme.'),
})
export type FirmThemesData = z.infer<typeof FirmThemesData>

/** Text size choices (decision T2). The standard is the app's own 13/11, which the old editor called Compact. */
export const TEXT_DENSITIES = {
  compact: { label: 'Compact 13/11 (standard)', base: '13px', small: '11px' },
  comfortable: { label: 'Comfortable 14/12', base: '14px', small: '12px' },
  large: { label: 'Large 15/13', base: '15px', small: '13px' },
} as const
export const TextDensity = z.enum(['compact', 'comfortable', 'large']).describe('Text size: compact (13/11, the standard), comfortable (14/12) or large (15/13).')
export type TextDensity = z.infer<typeof TextDensity>

/** Which theme a person uses: the firm default, the built-in theme, or one firm theme by id. */
export const ThemeChoiceId = z
  .string()
  .regex(/^(firm-default|built-in|[a-z0-9][a-z0-9_-]{0,79})$/)
  .describe('firm-default, built-in, or a firm theme id.')

/** A person's own theme: the theme they use, their text size, and their own color changes per mode. */
export const PersonalTheme = z.object({
  themeId: ThemeChoiceId,
  density: TextDensity,
  light: themeValueRecord.describe('The person\'s own color changes in the light theme (colors a person may change only).'),
  dark: themeValueRecord.describe('The person\'s own color changes in the dark theme.'),
})
export type PersonalTheme = z.infer<typeof PersonalTheme>

export const DEFAULT_PERSONAL_THEME: PersonalTheme = { themeId: 'firm-default', density: 'compact', light: {}, dark: {} }

/**
 * The values a person's theme changes, for one mode: the chosen firm theme, then the text size, then their own colors.
 * The built-in values (`theme.css`) lie beneath and are not repeated.
 *
 * @param personal - The person's theme.
 * @param firm - The firm themes and default.
 * @param mode - light or dark.
 * @returns The values to apply above the built-in theme.
 */
export function layeredThemeValues(personal: PersonalTheme, firm: FirmThemesData, mode: 'light' | 'dark'): ThemeValueMap {
  const themeId = personal.themeId === 'firm-default' ? firm.firmDefaultThemeId : personal.themeId === 'built-in' ? null : personal.themeId
  const theme = themeId ? firm.themes.find((candidate) => candidate.id === themeId) : undefined
  const density = TEXT_DENSITIES[personal.density]
  return {
    ...cleanThemeValues(theme?.[mode]),
    ...(personal.density === 'compact' ? {} : { '--kr-theme-font-size-base': density.base, '--kr-theme-font-size-small': density.small }),
    ...cleanThemeValues(personal[mode], { personalOnly: true }),
  }
}

/** Body of POST /v1/themes and PUT /v1/themes/{themeId} (stage 4a). Values are checked and cleaned by the API. */
export const FirmThemeBody = z.object({
  name: z.string().trim().min(1).max(60).describe('Theme name shown in the pickers.'),
  description: z.string().trim().max(200).describe('One line about the theme (may be empty).'),
  light: themeValueRecord.describe('Values the theme changes in the light theme (any setting, checked by kind).'),
  dark: themeValueRecord.describe('Values the theme changes in the dark theme.'),
})
export type FirmThemeBody = z.infer<typeof FirmThemeBody>

export const FirmThemeParams = z.object({
  themeId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/).describe('Theme id (the lookup row value).'),
})
export type FirmThemeParams = z.infer<typeof FirmThemeParams>

/** Reply of a theme write: the theme as stored (cleaned), and the themes and default after the change. */
export const FirmThemeSavedData = z.object({
  theme: FirmTheme.nullable().describe('The theme written, or null after a retire.'),
  themes: FirmThemesData.describe('Every firm theme and the firm default after the change.'),
})
export type FirmThemeSavedData = z.infer<typeof FirmThemeSavedData>

export const FirmDefaultThemeBody = z.object({
  themeId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/).nullable().describe('The theme everyone gets until they choose one, or null for the built-in theme.'),
})
export type FirmDefaultThemeBody = z.infer<typeof FirmDefaultThemeBody>
