// file: packages/tool-sdk/src/defineWidget.test.ts
import { describe, expect, it } from 'vitest'
import { defineWidget } from './defineWidget.ts'

const GOOD = { id: 'employee-clock-in', title: 'Employee Time Entry', description: 'Clock in or out.', size: 'medium', defaultEnabled: true, defaultOrder: 5 } as const

describe('defineWidget', () => {
  it('returns a valid widget frozen', () => {
    const widget = defineWidget({ ...GOOD, requires: { resource: 'attendance', action: 'read' }, refreshSeconds: 30 })
    expect(widget.id).toBe('employee-clock-in')
    expect(Object.isFrozen(widget)).toBe(true)
    expect(Object.isFrozen(widget.requires)).toBe(true)
  })

  it('names the first bad value', () => {
    expect(() => defineWidget({ ...GOOD, id: 'Clock In' })).toThrow(/id is lowercase/)
    expect(() => defineWidget({ ...GOOD, size: 'huge' as never })).toThrow(/size must be one of small, medium, wide/)
    expect(() => defineWidget({ ...GOOD, defaultOrder: 1.5 })).toThrow(/defaultOrder/)
    expect(() => defineWidget({ ...GOOD, requires: { resource: 'Attendance', action: 'read' } })).toThrow(/requires/)
    expect(() => defineWidget({ ...GOOD, refreshSeconds: 5 })).toThrow(/refreshSeconds/)
  })
})
