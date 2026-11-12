// file: apps/web/features/themes/themes.test.tsx
/**
 * The firm theme editor (Settings plan, stage 4a, rebuilt Nov 12, 2026 on the shared theme parts): the file helpers
 * (`components/themes/themeEditing.ts`: JSONC comments, the new and old file shapes, values checked, drafts compared by
 * content, the download text reading back, padding and title helpers), a first draw of `FirmThemeEditor`, and the
 * shared `ThemeTokenLedger` (no group column, × only on the theme's own values, gradient rows only for a gradient
 * strip, a purpose for every setting). Made-up themes only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/themes/themes.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { THEME_TOKEN_DEFINITIONS, type FirmThemesData } from '@krhomebase/contracts'
import FirmThemeEditor from '@/features/themes/components/FirmThemeEditor.client'
import ThemeTokenLedger, { normalizeHexColor } from '@/components/themes/ThemeTokenLedger.client'
import { THEME_TOKEN_PURPOSES } from '@/components/themes/themeTokenPurposes'
import { accentStripBackground, buildTitleClamp, builtInValues, emptyDraft, normalizePadding, parseThemeFile, parseTitleClamp, sameDraft, stripJsonComments, themeFileName, themeFileText } from '@/components/themes/themeEditing'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))

const THEMES: FirmThemesData = {
  firmDefaultThemeId: 'firm-blue',
  themes: [
    { id: 'firm-blue', name: 'Firm Blue', description: 'Calm', light: { '--kr-theme-line': '#aabbcc' }, dark: {}, storedShape: 'current' },
    { id: 'old-one', name: 'Old One', description: '', light: { '--kr-theme-brand-primary': '#112233' }, dark: {}, storedShape: 'old' },
  ],
}

describe('theme files', () => {
  it('removes comments outside strings only', () => {
    expect(stripJsonComments('// head\n{"a": "x//y", /* note */ "b": 1}')).toBe('\n{"a": "x//y",  "b": 1}')
  })

  it('reads the new shape, keeping only allowed values', () => {
    const result = parseThemeFile('// c\n{"schemaVersion":1,"name":"Harbor","description":"d","light":{"--kr-theme-line":"#AABBCC","--kr-theme-danger":"url(x)"},"dark":{"--nope":"#000000"}}')
    expect(result).toEqual({ ok: true, shape: 'current', kept: 1, draft: { name: 'Harbor', description: 'd', light: { '--kr-theme-line': '#aabbcc' }, dark: {} } })
  })

  it("reads the old editor's file as light values", () => {
    const result = parseThemeFile('{"id":"x","name":"Old","tokens":{"brandPrimary":"#112233","textColor":"red; x"}}')
    expect(result).toEqual({ ok: true, shape: 'old', kept: 1, draft: { name: 'Old', description: '', light: { '--kr-theme-brand-primary': '#112233' }, dark: {} } })
  })

  it('refuses text that is not a theme', () => {
    expect(parseThemeFile('{ nope').ok).toBe(false)
    expect(parseThemeFile('[1,2]').ok).toBe(false)
    expect(parseThemeFile('{"name":"x"}').ok).toBe(false)
  })

  it('writes a download that reads back the same', () => {
    const draft = { name: 'Harbor', description: 'Calm', light: { '--kr-theme-line': '#aabbcc' }, dark: { '--kr-theme-text': '#ffffff' } }
    const result = parseThemeFile(themeFileText(draft, '2026-11-11T00:00:00.000Z'))
    expect(result.ok && result.draft).toEqual(draft)
    expect(themeFileName(null, 'Harbor Blue!')).toBe('harbor-blue.jsonc')
    expect(themeFileName('firm-blue', 'x')).toBe('firm-blue.jsonc')
  })

  it('compares drafts by content and gives dark the built-in light values beneath', () => {
    expect(sameDraft({ ...emptyDraft('A'), light: { a: '1', b: '2' } }, { ...emptyDraft('A '), light: { b: '2', a: '1' } })).toBe(true)
    expect(sameDraft(emptyDraft('A'), emptyDraft('B'))).toBe(false)
    expect(Object.keys(builtInValues('dark')).length).toBeGreaterThanOrEqual(Object.keys(builtInValues('light')).length)
  })
})

describe('ledger value helpers', () => {
  it('fills out padding, reads and builds the title clamp, normalizes hex, and makes the strip background', () => {
    expect(normalizePadding('4')).toBe('4px 4px 4px 4px')
    expect(normalizePadding('2px 8')).toBe('2px 8px 2px 8px')
    expect(normalizePadding('1 2 3')).toBe('1px 2px 3px 2px')
    expect(parseTitleClamp('clamp(20px, 2.4vw, 30px)')).toEqual({ min: '20px', max: '30px' })
    expect(buildTitleClamp('18px', '28px')).toBe('clamp(18px, 2.4vw, 28px)')
    expect(normalizeHexColor(' ABC')).toBe('#aabbcc')
    expect(accentStripBackground({ '--kr-theme-panel-accent-strip': 'no' })).toBe('transparent')
    expect(accentStripBackground({ '--kr-theme-panel-accent-style': 'solid', '--kr-theme-panel-accent-solid': '#112233' })).toBe('#112233')
    expect(accentStripBackground({ '--kr-theme-panel-accent-style': 'gradient', '--kr-theme-panel-accent-solid': '#000000', '--kr-theme-panel-accent-gradient-middle': '#111111', '--kr-theme-panel-accent-gradient-end': '#222222' })).toBe('linear-gradient(135deg, #000000 0%, #111111 52%, #222222 100%)')
  })

  it('has a purpose for every setting', () => {
    expect(THEME_TOKEN_DEFINITIONS.filter((definition) => !THEME_TOKEN_PURPOSES[definition.name]).map((definition) => definition.name)).toEqual([])
  })
})

describe('FirmThemeEditor', () => {
  it('opens on the first theme with the selector, Theme in action and the ledger, and marks the firm default', () => {
    const html = renderToStaticMarkup(<FirmThemeEditor initialThemes={THEMES} />)
    expect(html).toContain('data-kr-element="firm-themes-workspace"')
    expect(html).toContain('data-kr-id="ThemeSelector"')
    expect(html).toContain('data-kr-id="ThemeInAction"')
    expect(html).toContain('data-kr-id="ThemeTokenLedger"')
    expect(html).toContain('Firm Blue (firm default)')
    expect(html).toContain('New theme…')
    expect(html).toContain('--kr-theme-line:#aabbcc')
    expect(html).toContain('aria-label="Retire Firm Blue"')
  })

  it('starts on a new theme when there are none, with no wastebasket', () => {
    const html = renderToStaticMarkup(<FirmThemeEditor initialThemes={{ themes: [], firmDefaultThemeId: null }} />)
    expect(html).toContain('New Theme (not saved)')
    expect(html).not.toContain('aria-label="Retire')
  })
})

describe('ThemeTokenLedger', () => {
  const beneath = builtInValues('light')
  const draw = (values: Record<string, string>) => renderToStaticMarkup(<ThemeTokenLedger beneath={beneath} definitions={THEME_TOKEN_DEFINITIONS} onChange={() => undefined} values={values} />)

  it('has no group column, names each group once in its banner row, and offers × only on own values', () => {
    const html = draw({ '--kr-theme-line': '#aabbcc' })
    expect(html).not.toContain('>Group</th>')
    expect(html.match(/<th /g)).toHaveLength(3)
    expect(html.match(/<strong>Communication Colors<\/strong>/g)).toHaveLength(1)
    expect(html).toContain('Use the value beneath for Lines and borders')
    expect(html).not.toContain('Use the value beneath for Text<')
  })

  it('shows the gradient rows and the generated gradient only for a gradient strip', () => {
    expect(draw({ '--kr-theme-panel-accent-style': 'solid' })).not.toContain('data-kr-record-id="generated-gradient"')
    const gradient = draw({ '--kr-theme-panel-accent-style': 'gradient' })
    expect(gradient).toContain('data-kr-record-id="--kr-theme-panel-accent-gradient-end"')
    expect(gradient).toContain('data-kr-record-id="generated-gradient"')
  })
})
