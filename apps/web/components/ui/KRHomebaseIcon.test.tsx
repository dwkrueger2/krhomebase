// file: apps/web/components/ui/KRHomebaseIcon.test.tsx
// The icon registry: every name draws, every stored tool icon name exists, and each kind of icon keeps its drawing.
import { ToolIconNames } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import KRHomebaseIcon, { KR_HOMEBASE_ICON_NAMES, KRHomebaseIcons, type KRHomebaseIconName } from '@/components/ui/KRHomebaseIcon.client'

const draw = (name: string, title?: string) => renderToStaticMarkup(<KRHomebaseIcon name={name as KRHomebaseIconName} className="c" title={title} />)

describe('KRHomebaseIcon', () => {
  it('draws every registered name, never the missing-icon fallback', () => {
    for (const name of KR_HOMEBASE_ICON_NAMES) {
      const html = draw(name)
      expect(html.startsWith('<svg'), name).toBe(true)
      expect(html, name).not.toContain('not found')
    }
  })

  it('has an entry for every fallback icon name a tool registration may store', () => {
    for (const name of ToolIconNames) expect(KR_HOMEBASE_ICON_NAMES, name).toContain(name)
  })

  it('draws the KR monogram for an unknown runtime name', () => {
    expect(draw('no-such-icon')).toContain(`aria-label="icon file &#x27;no-such-icon&#x27; not found"`)
  })

  it('draws a line icon with the defaults, hidden unless it has a title', () => {
    const html = draw('dashboard')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('stroke-width="1.8"')
    expect(html).not.toContain(' width="')
    expect(draw('dashboard', 'Home')).toContain('role="img"')
    expect(draw('dashboard', 'Home')).toContain('<title>Home</title>')
  })

  it('keeps per-entry settings: size, stroke width and the orange tool diamond', () => {
    expect(draw('trash')).toContain('width="12"')
    expect(draw('trash')).toContain('stroke-width="2"')
    expect(draw('tool')).toContain('fill="var(--kr-theme-orange, #e45e25)"')
  })

  it('always names a badge and draws its mark', () => {
    const html = draw('warning-red')
    expect(html).toContain('aria-label="Red warning"')
    expect(html).toContain('>!</text>')
    expect(draw('info-dark')).toContain('<circle')
  })

  it('draws a disc in its tone on the 50 by 50 grid', () => {
    const html = draw('publication-published')
    expect(html).toContain('viewBox="0 0 50 50"')
    expect(html).toContain('fill-(--kr-theme-success)')
  })

  it('keeps the legacy shortcuts pointing at the same drawings', () => {
    expect(renderToStaticMarkup(<KRHomebaseIcons.Trash className="c" />)).toBe(draw('trash'))
    expect(renderToStaticMarkup(<KRHomebaseIcons.Check className="c" />)).toBe(draw('check-bold'))
    expect(renderToStaticMarkup(<KRHomebaseIcons.Send className="c" />)).toBe(draw('send-plane'))
  })
})
