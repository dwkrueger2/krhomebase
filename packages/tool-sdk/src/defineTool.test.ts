// file: packages/tool-sdk/src/defineTool.test.ts
import { describe, expect, it } from 'vitest'
import { defineTool, healthDocument, registrationSheet, type ToolManifest } from './defineTool.ts'

const good: ToolManifest = {
  name: 'intake-helper',
  label: 'Intake Helper',
  description: 'Checks new intake forms.',
  icon: 'documents',
  version: '1.0.0',
  entryUrl: 'https://intake.example.com/app',
  hostOrigins: ['https://krhomebase.com'],
  scopes: ['contacts:read'],
  serverAccess: false,
}

describe('defineTool', () => {
  it('returns the values frozen and prints a sheet without secrets', () => {
    const tool = defineTool(good)
    expect(Object.isFrozen(tool)).toBe(true)
    expect(registrationSheet(tool)).toContain('Address (entry URL): https://intake.example.com/app')
  })

  it('names the first problem', () => {
    expect(() => defineTool({ ...good, entryUrl: 'http://intake.example.com' })).toThrow('entryUrl must be https')
    expect(() => defineTool({ ...good, scopes: ['contacts:delete' as 'contacts:read'] })).toThrow('unknown permission')
    expect(() => defineTool({ ...good, hostOrigins: [] })).toThrow('hostOrigins')
    expect(() => defineTool({ ...good, label: '' })).toThrow('label')
  })

  it('prints the version, the health and icon routes and the roles, and checks the version and roles', () => {
    const tool = defineTool({ ...good, roles: ['staff', 'super_admin', 'staff'] })
    expect(tool.roles).toEqual(['staff', 'super_admin'])
    const sheet = registrationSheet(tool)
    expect(sheet).toContain('Version: 1.0.0')
    expect(sheet).toContain('Health route: https://intake.example.com/health-check')
    expect(sheet).toContain('Icon route: https://intake.example.com/tool-icon.svg')
    expect(sheet).toContain('Roles (any one of them sees the tool): staff, super_admin')
    expect(registrationSheet(defineTool({ ...good, icon: undefined }))).toContain('Built-in fallback icon: tool (KR Homebase default)')
    expect(() => defineTool({ ...good, version: '' })).toThrow('version')
    expect(() => defineTool({ ...good, roles: ['owner' as 'staff'] })).toThrow('unknown role')
  })

  it('prints the Shown options the tool asks for', () => {
    expect(registrationSheet(defineTool(good))).toContain('Shown: everyone the roles allow')
    expect(registrationSheet(defineTool({ ...good, localOnly: true, developersOnly: true }))).toContain('Shown: Local development only, Developers only')
    expect(registrationSheet(defineTool({ ...good, developersOnly: true }))).toContain('Shown: Developers only')
    expect(registrationSheet(defineTool({ ...good, sandboxOnly: true }))).toContain('Shown: Sandbox only')
    expect(registrationSheet(defineTool({ ...good, developersOnly: true, sandboxOnly: true }))).toContain('Shown: Developers only, Sandbox only')
  })

  it('writes the health document', () => {
    expect(healthDocument(defineTool(good))).toEqual({ status: 'ok', version: '1.0.0', protocol: 1 })
  })
})
