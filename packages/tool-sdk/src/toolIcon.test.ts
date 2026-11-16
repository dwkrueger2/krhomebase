// file: packages/tool-sdk/src/toolIcon.test.ts
// The "tool icon" rules: what is accepted, how it is written back, and what is refused (and why).
import { describe, expect, it } from 'vitest'
import { checkToolIcon } from './toolIcon.ts'
import { ICON_COLOR_SAMPLES, ICON_SAMPLES } from './toolIcon.testdata.ts'


describe('checkToolIcon', () => {
  it('accepts a stroke icon and writes it back in the standard form', () => {
    const result = checkToolIcon(ICON_SAMPLES[0]!)
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.svg).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h10"/><circle cx="17" cy="16" r="3"/></svg>',
      )
      expect(result.root.children.map((child) => child.tag)).toEqual(['path', 'circle'])
      // The standard form passes again, unchanged.
      expect(checkToolIcon(result.svg)).toMatchObject({ ok: true, svg: result.svg })
    }
  })

  it('drops width and height, and accepts groups and shapes written with a closing tag', () => {
    const result = checkToolIcon(ICON_SAMPLES[1]!)
    expect(result.ok && result.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></g></svg>',
    )
    expect(checkToolIcon(ICON_SAMPLES[2]!).ok).toBe(true)
  })

  it('refuses named colors, scripts, events, styles, images, text, other sizes and anything after the svg', () => {
    const refused = ICON_SAMPLES.slice(3).map((sample) => checkToolIcon(sample))
    for (const result of refused) expect(result.ok).toBe(false)
    expect(refused.map((result) => (result.ok ? '' : result.problem))).toEqual([
      'fill must be none, currentColor, a hex color (#e45e25) or a KR theme color (var(--kr-theme-orange)).',
      '<script> is not allowed. Use g, path, circle, ellipse, rect, line, polyline, polygon.',
      'The attribute onload is not allowed on <svg>.',
      'The attribute style is not allowed on <path>.',
      '<image> is not allowed. Use g, path, circle, ellipse, rect, line, polyline, polygon.',
      'The <svg> must have viewBox="0 0 24 24".',
      '<text> is not allowed. Use g, path, circle, ellipse, rect, line, polyline, polygon.',
      'Nothing may follow the closing </svg>.',
      'The icon may not contain declarations, entities (& ... ;) or an unclosed comment.',
      'The icon may not contain declarations, entities (& ... ;) or an unclosed comment.',
      'An element is not written as <name attribute="value" ...> with double quotes.',
      'The closing </svg> does not match an open element.',
      'The <svg> is empty.',
      'The value of d on <path> is not allowed.',
      'The icon is empty.',
    ])
  })

  it('accepts hex and theme colors, and removes comments from the stored icon', () => {
    for (const sample of ICON_COLOR_SAMPLES) expect(checkToolIcon(sample), sample).toMatchObject({ ok: true })
    const commented = checkToolIcon(ICON_COLOR_SAMPLES[0]!)
    expect(commented.ok && commented.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ec6a32"><path d="M4 6h16"/></svg>')
    expect(checkToolIcon('<!-- only a comment -->')).toEqual({ ok: false, problem: 'The icon is empty.' })
    for (const paint of ['red', '#12345', 'var(--other-color)', 'var(--kr-theme-orange, red)', 'url(#x)']) {
      expect(checkToolIcon(`<svg viewBox="0 0 24 24"><path d="M0 0" fill="${paint}"/></svg>`).ok, paint).toBe(false)
    }
  })
})
