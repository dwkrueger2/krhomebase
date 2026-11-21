// file: apps/web/features/tools/components/ToolRegistrationForm.test.tsx
// The registration form's Shown row (web patch 564, migration 058): Local development only, Developers only, and the
// hint for a localhost address.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ToolRegistration } from '@krhomebase/contracts'
import ToolRegistrationForm, { isLocalToolAddress } from '@/features/tools/components/ToolRegistrationForm.client'

const tool: ToolRegistration = {
  id: 't1',
  clientId: 'krt_viewerviewerviewer12',
  label: 'FBV (Local)',
  description: '',
  icon: 'tool',
  iconSvg: null,
  menuOrder: 100,
  origin: 'http://localhost:5174',
  entryUrl: 'http://localhost:5174/',
  allowedRoles: ['super_admin'],
  permittedUsers: ['dankrueger@legaldrive.net', 'marcusrichard@legaldrive.net', 'davismcclellan@legaldrive.net'],
  localOnly: false,
  developersOnly: true,
  scopes: [],
  status: 'active',
  serverAccessEnabled: false,
  serverIpAllowlist: [],
  hasSecret: false,
  secretCreatedAt: null,
  previousSecretValidUntil: null,
  createdAt: '2026-11-17T00:00:00Z',
  updatedAt: '2026-11-17T00:00:00Z',
}

const render = (value: ToolRegistration) =>
  renderToStaticMarkup(<ToolRegistrationForm tool={value} busy={false} error="" onSave={() => {}} onCancel={() => {}} />)

describe('isLocalToolAddress', () => {
  it('knows the addresses on this computer', () => {
    expect(isLocalToolAddress('http://localhost:5174/')).toBe(true)
    expect(isLocalToolAddress(' http://127.0.0.1:5174/app ')).toBe(true)
    expect(isLocalToolAddress('https://krhomebase-feedback-viewer.example.workers.dev/')).toBe(false)
    expect(isLocalToolAddress('not an address')).toBe(false)
  })
})

describe('ToolRegistrationForm Shown row', () => {
  it('shows both options as saved, and the hint while a local address is not local only', () => {
    const html = render(tool)
    expect(html).toContain('data-kr-element="tool-visibility-row"')
    expect(html).toMatch(/data-kr-element="tool-developers-only"><input type="checkbox" checked=""/)
    expect(html).toMatch(/data-kr-element="tool-local-only"><input type="checkbox"\/>/)
    expect(html).toContain('data-kr-element="tool-local-address-hint"')
    expect(render({ ...tool, localOnly: true })).not.toContain('tool-local-address-hint')
  })
})
