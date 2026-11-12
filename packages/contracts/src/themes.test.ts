// file: packages/contracts/src/themes.test.ts
/**
 * Theme rules that the shapes alone do not show: which values are allowed, how the old editor's names are read, the
 * readability check and the layering. Run: pnpm --dir packages/contracts run test
 */

import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEME, cleanThemeValues, contrastRatio, layeredThemeValues, themeContrastProblems, themeValuesFromOldTokens } from './themes.ts'

describe('theme values', () => {
  it('keeps only known settings with safe values', () => {
    expect(
      cleanThemeValues({
        '--kr-theme-brand-primary': '#ABCDEF',
        '--kr-theme-text': 'red; background:url(x)',
        '--kr-theme-table-row-padding': '2px 8px 2px 8px',
        '--kr-theme-button-padding-regular': '-2px 8px 2px 8px',
        '--kr-theme-font-size-title': 'clamp(20px, 2.4vw, 30px)',
        '--kr-theme-font-body': 'Raleway, "Segoe UI", sans-serif',
        '--kr-theme-unknown': '#000000',
      }),
    ).toEqual({
      '--kr-theme-brand-primary': '#abcdef',
      '--kr-theme-table-row-padding': '2px 8px 2px 8px',
      '--kr-theme-font-size-title': 'clamp(20px, 2.4vw, 30px)',
      '--kr-theme-font-body': 'Raleway, "Segoe UI", sans-serif',
    })
  })

  it('drops settings a person may not change when asked for personal values only', () => {
    expect(cleanThemeValues({ '--kr-theme-text': '#111111', '--kr-theme-danger': '#00ff00', '--kr-theme-table-row-padding': '2px 8px 2px 8px' }, { personalOnly: true })).toEqual({ '--kr-theme-text': '#111111' })
  })

  it("reads the old editor's camelCase names", () => {
    expect(themeValuesFromOldTokens({ brandPrimary: '#112233', tableRowBackgroundOne: '#ffffff', widgetPadding8_10: '8px 10px 8px 10px', notAToken: '#000000' })).toEqual({
      '--kr-theme-brand-primary': '#112233',
      '--kr-theme-table-row-background-1': '#ffffff',
      '--kr-theme-widget-padding-8-10': '8px 10px 8px 10px',
    })
  })
})

describe('readability', () => {
  it('measures contrast as WCAG does', () => {
    expect(Math.round(contrastRatio('#000000', '#ffffff'))).toBe(21)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })

  it("reports only the pairs a person's change breaks", () => {
    const base = BUILT_IN_THEME.light
    expect(themeContrastProblems(base, { '--kr-theme-brand-primary': '#123456' })).toEqual([])
    const problems = themeContrastProblems(base, { '--kr-theme-card-surface': '#2a2a2a' })
    expect(problems.map((p) => `${p.text}|${p.background}`)).toContain('--kr-theme-text|--kr-theme-card-surface')
  })
})

describe('layering', () => {
  const firm = {
    firmDefaultThemeId: 'firm-blue',
    themes: [{ id: 'firm-blue', name: 'Blue', description: '', light: { '--kr-theme-brand-primary': '#0000aa' }, dark: {}, storedShape: 'current' as const }],
  }

  it('applies the firm default, then the text size, then the person\'s own colors', () => {
    expect(layeredThemeValues({ themeId: 'firm-default', density: 'comfortable', light: { '--kr-theme-text': '#101010' }, dark: {} }, firm, 'light')).toEqual({
      '--kr-theme-brand-primary': '#0000aa',
      '--kr-theme-font-size-base': '14px',
      '--kr-theme-font-size-small': '12px',
      '--kr-theme-text': '#101010',
    })
  })

  it('uses nothing from the firm for the built-in choice, and ignores a theme that no longer exists', () => {
    expect(layeredThemeValues({ themeId: 'built-in', density: 'compact', light: {}, dark: {} }, firm, 'light')).toEqual({})
    expect(layeredThemeValues({ themeId: 'gone', density: 'compact', light: {}, dark: {} }, firm, 'light')).toEqual({})
  })
})
