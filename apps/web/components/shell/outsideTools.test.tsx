// file: apps/web/components/shell/outsideTools.test.tsx
/**
 * Tests for outside tools in the frame: the menu helpers, the host side of the bridge (with stand-in
 * windows), the sealed frame's markup, and the shell drawing a tool row. Only made-up tools are used.
 * Run: `pnpm --dir apps/web run test`.
 */
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ToolMenuItem } from '@krhomebase/contracts'
import ApplicationShell from '@/components/shell/ApplicationShell.client'
import ExternalToolFrame, { TOOL_FRAME_SANDBOX } from '@/components/shell/ExternalToolFrame.client'
import { attachToolHost, MAX_IN_FLIGHT } from '@/components/shell/toolHost'
import type { ToolRelayReply } from '@/lib/toolRelay'
import { buildBreadcrumbs, buildNavItems, findNavItem, isShellSectionId, isToolSectionId, SHELL_NAV_ITEMS, type ShellSectionId } from '@/components/shell/navigation'

const TOOL: ToolMenuItem = {
  clientId: 'krt_TestToolTestToolTest',
  label: 'Intake Helper',
  description: 'Checks intake forms.',
  icon: 'documents',
  menuOrder: 20,
  origin: 'https://intake.example.com',
  entryUrl: 'https://intake.example.com/app',
  scopes: ['contacts:read'],
}
const SECOND: ToolMenuItem = { ...TOOL, clientId: 'krt_SecondToolSecondTool', label: 'Another', menuOrder: 10 }

describe('menu with outside tools', () => {
  const items = buildNavItems([TOOL, SECOND])

  it('places the tools before Settings, in menu order', () => {
    const ids = items.map((item) => item.id)
    expect(ids.indexOf('tool:krt_SecondToolSecondTool')).toBeLessThan(ids.indexOf('tool:krt_TestToolTestToolTest'))
    expect(ids.indexOf('tool:krt_TestToolTestToolTest')).toBe(ids.indexOf('settings') - 1)
    expect(ids.indexOf('reports')).toBeLessThan(ids.indexOf('tool:krt_SecondToolSecondTool'))
    expect(items).toHaveLength(SHELL_NAV_ITEMS.length + 2)
  })

  it('knows tool ids only when the tool is in the menu', () => {
    expect(isShellSectionId('tool:krt_TestToolTestToolTest', items)).toBe(true)
    expect(isShellSectionId('tool:krt_TestToolTestToolTest')).toBe(false)
    expect(isToolSectionId('tool:x')).toBe(true)
    expect(isToolSectionId('billing')).toBe(false)
    expect(buildBreadcrumbs('tool:krt_TestToolTestToolTest', items)).toEqual(['Intake Helper'])
    expect(findNavItem('tool:krt_TestToolTestToolTest', items).outsideTool?.origin).toBe('https://intake.example.com')
  })
})

/** Stand-in windows: the host window collects listeners; the frame window records what the host posts to it. */
function windows() {
  const listeners = new Set<(event: MessageEvent) => void>()
  const posted: { message: Record<string, unknown>; origin: string }[] = []
  const frame = { postMessage: (message: Record<string, unknown>, origin: string) => posted.push({ message, origin }) } as unknown as Window
  const host = {
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.delete(fn),
  } as unknown as Window
  const send = (data: unknown, origin = TOOL.origin, source: unknown = frame) => {
    for (const fn of [...listeners]) fn({ data, origin, source } as MessageEvent)
  }
  return { frame, host, posted, listeners, send }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('attachToolHost', () => {
  function start(relay: () => Promise<ToolRelayReply> = async () => ({ status: 200, body: { ok: true, data: { n: 1 }, requestId: 'q' } })) {
    const w = windows()
    const dirty: boolean[] = []
    const relayed: unknown[] = []
    const stop = attachToolHost({
      hostWindow: w.host,
      frameWindow: () => w.frame,
      clientId: TOOL.clientId,
      origin: TOOL.origin,
      mode: 'popout',
      theme: () => ({ '--kr-theme-text': '#111' }),
      relay: async (request) => {
        relayed.push(request)
        return relay()
      },
      onDirty: (value) => dirty.push(value),
    })
    return { ...w, dirty, relayed, stop }
  }

  it('answers hello with init, sent only to the tool origin', () => {
    const t = start()
    t.send({ kind: 'krh:hello', protocol: 1 })
    expect(t.posted).toEqual([
      { message: { kind: 'krh:init', protocol: 1, clientId: TOOL.clientId, mode: 'popout', theme: { '--kr-theme-text': '#111' } }, origin: TOOL.origin },
    ])
  })

  it('ignores other origins, other windows and malformed messages', () => {
    const t = start()
    t.send({ kind: 'krh:hello', protocol: 1 }, 'https://evil.example')
    t.send({ kind: 'krh:hello', protocol: 1 }, TOOL.origin, {})
    t.send({ kind: 'krh:request', protocol: 1, id: 'r1', method: 'GET', path: '/auth/session' })
    expect(t.posted).toEqual([])
    expect(t.relayed).toEqual([])
  })

  it('relays a request with the tool id and returns the reply under the same id', async () => {
    const t = start()
    t.send({ kind: 'krh:request', protocol: 1, id: 'r7', method: 'POST', path: '/v1/things', body: { a: 1 } })
    await tick()
    expect(t.relayed).toEqual([{ clientId: TOOL.clientId, method: 'POST', path: '/v1/things', body: { a: 1 } }])
    expect(t.posted[0]).toEqual({ message: { kind: 'krh:response', protocol: 1, id: 'r7', status: 200, body: { ok: true, data: { n: 1 }, requestId: 'q' } }, origin: TOOL.origin })
  })

  it('refuses calls beyond the in-flight limit', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const t = start(async () => (await gate, { status: 200, body: {} }))
    for (let i = 0; i <= MAX_IN_FLIGHT; i += 1) t.send({ kind: 'krh:request', protocol: 1, id: `r${i}`, method: 'GET', path: '/v1/x' })
    expect(t.posted).toHaveLength(1)
    expect(t.posted[0]!.message).toMatchObject({ status: 429 })
    release()
    await tick()
  })

  it('passes unsaved-work reports on and stops listening when detached', () => {
    const t = start()
    t.send({ kind: 'krh:set-dirty', protocol: 1, dirty: true })
    expect(t.dirty).toEqual([true])
    t.stop()
    expect(t.listeners.size).toBe(0)
  })
})

describe('ExternalToolFrame', () => {
  it('draws a sandboxed frame of the registered address with its origin named', () => {
    const html = renderToStaticMarkup(<ExternalToolFrame clientId={TOOL.clientId} label={TOOL.label} origin={TOOL.origin} entryUrl={TOOL.entryUrl} mode="workspace" />)
    expect(html).toContain('data-kr-id="ExternalToolFrame"')
    expect(html).toContain(`src="${TOOL.entryUrl}"`)
    expect(html).toContain(`sandbox="${TOOL_FRAME_SANDBOX}"`)
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).toContain(TOOL.origin)
    expect(TOOL_FRAME_SANDBOX).not.toContain('allow-top-navigation')
    expect(TOOL_FRAME_SANDBOX).not.toContain('allow-modals')
  })
})

describe('ApplicationShell with outside tools', () => {
  const panels = Object.fromEntries(SHELL_NAV_ITEMS.map((item) => [item.id, <p key={item.id}>panel-{item.id}</p>])) as Record<ShellSectionId, ReactNode>

  it('shows each outside tool as a menu row', () => {
    const html = renderToStaticMarkup(<ApplicationShell user={{ displayName: 'T P', firmName: 'F', avatarInitials: 'TP' }} panels={panels} outsideTools={[TOOL]} versionLabel="v1" />)
    expect(html).toContain('data-kr-section-id="tool:krt_TestToolTestToolTest"')
    expect(html).toContain('Intake Helper')
  })
})
