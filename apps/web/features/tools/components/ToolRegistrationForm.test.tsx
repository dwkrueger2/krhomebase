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

  it('enables route-backed read and frame-only write scopes and marks the remaining permissions TBD', () => {
    const html = render(tool)
    expect(html).toMatch(/tool-scope-contacts-read"><input type="checkbox"\/>contacts:read/)
    expect(html).toMatch(/tool-scope-contacts-write"><input type="checkbox"\/>contacts:write/)
    expect(html).toMatch(/tool-scope-tool-registration-read"><input type="checkbox"\/>tool-registration:read/)
    expect(html).toMatch(/tool-scope-documents-read"><input type="checkbox" disabled=""\/>documents:read — TBD/)
    expect(html).toMatch(/tool-scope-documents-write"><input type="checkbox" disabled=""\/>documents:write — TBD/)
    expect(html).toMatch(/tool-scope-reports-read"><input type="checkbox" disabled=""\/>reports:read — TBD/)
    expect(html).toMatch(/tool-write-scopes-frame-only/)
    expect(html).not.toContain('communications:read')
  })
})

describe('ToolRegistrationForm permitted users row', () => {
  it('shows the fixed allowed accounts after Roles and explains that an empty list denies access', () => {
    const html = render(tool)
    expect(html.indexOf('tool-roles-row')).toBeLessThan(html.indexOf('tool-permitted-users-row'))
    expect(html).toContain('Permitted users')
    expect(html.match(/tool-permitted-user-chip/g)).toHaveLength(3)
    expect(render({ ...tool, permittedUsers: [] })).toContain('No users selected; nobody can open this tool.')
  })
})
