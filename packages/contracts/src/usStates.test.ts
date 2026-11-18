// file: packages/contracts/src/usStates.test.ts
// FB-0015: stored and typed states read back as the two-letter code the contact save takes.
import { describe, expect, it } from 'vitest'
import { US_STATES, usStateCode } from './usStates.ts'

describe('usStateCode', () => {
  it('reads every code and every full name', () => {
    for (const state of US_STATES) {
      expect(usStateCode(state.code)).toBe(state.code)
      expect(usStateCode(state.name)).toBe(state.code)
    }
    expect(new Set(US_STATES.map((state) => state.code)).size).toBe(US_STATES.length)
  })

  it('reads the forms found in the live addresses', () => {
    expect(usStateCode('Texas')).toBe('TX')
    expect(usStateCode('Kansas')).toBe('KS')
    expect(usStateCode('[KS]')).toBe('KS')
    expect(usStateCode(' oklahoma ')).toBe('OK')
    expect(usStateCode('tx')).toBe('TX')
    expect(usStateCode('new  york')).toBe('NY')
  })

  it("gives '' for an empty state and null for one it does not know", () => {
    expect(usStateCode('')).toBe('')
    expect(usStateCode('   ')).toBe('')
    expect(usStateCode(null)).toBe('')
    expect(usStateCode(undefined)).toBe('')
    expect(usStateCode('Texass')).toBeNull()
    expect(usStateCode('ZZ')).toBeNull()
    expect(usStateCode('[]')).toBeNull()
  })
})
