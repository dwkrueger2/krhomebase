// file: packages/tool-sdk/src/defineTool.test.ts
import { describe, expect, it } from 'vitest'
import { defineTool, registrationSheet, type ToolManifest } from './defineTool.ts'

const good: ToolManifest = {
  name: 'intake-helper',
  label: 'Intake Helper',
  description: 'Checks new intake forms.',
  icon: 'documents',
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
})
