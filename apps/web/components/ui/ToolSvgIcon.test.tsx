// file: apps/web/components/ui/ToolSvgIcon.test.tsx
// An outside tool's own icon is drawn from the checked elements only; anything else falls back to the built-in icon.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ToolSvgIcon from '@/components/ui/ToolSvgIcon.client'

describe('ToolSvgIcon', () => {
  it('draws the checked shapes with React attribute names, in the menu color', () => {
    const html = renderToStaticMarkup(
      <ToolSvgIcon svg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><g><path d="M4 6h16"/><circle cx="17" cy="16" r="3"/></g></svg>' className="size-[20px]" />,
    )
    expect(html).toContain('viewBox="0 0 24 24"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('stroke-width="1.8"')
    expect(html).toContain('<g><path d="M4 6h16"></path><circle cx="17" cy="16" r="3"></circle></g>')
    expect(html).toContain('aria-hidden="true"')
  })

  it('draws the fallback for an icon that breaks the rules', () => {
    const fallback = <span>built-in</span>
    expect(renderToStaticMarkup(<ToolSvgIcon svg='<svg viewBox="0 0 24 24" onload="alert(1)"><path d="M0 0"/></svg>' fallback={fallback} />)).toBe('<span>built-in</span>')
    expect(renderToStaticMarkup(<ToolSvgIcon svg='<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>' fallback={fallback} />)).toBe('<span>built-in</span>')
  })
})
