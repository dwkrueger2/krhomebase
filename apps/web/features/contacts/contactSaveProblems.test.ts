// file: apps/web/features/contacts/contactSaveProblems.test.ts
// FB-0015: a refused contact save names its fields, and a stored "Texas" is shown and saved as TX.
import { describe, expect, it } from 'vitest'
import { contactSaveProblems, problemsFromApiDetails, problemSummary, stateForEditor } from './contactSaveProblems'

const body = { kind: 'individual' as const, displayName: 'Elisa Lee Krueger', state: 'TX', postalCode: '75071' }

describe('contactSaveProblems', () => {
  it('finds nothing in a body the API takes', () => {
    expect(contactSaveProblems(body)).toEqual({})
    expect(contactSaveProblems({ ...body, state: null, stateOfFormation: '' })).toEqual({})
  })

  it('names a full state name and an unknown code, for the address and the state of formation', () => {
    expect(contactSaveProblems({ ...body, state: 'Texas' })).toEqual({ state: 'Use the two-letter state code, for example TX.' })
    expect(contactSaveProblems({ ...body, state: 'ZZ' })).toEqual({ state: 'Use the two-letter state code, for example TX.' })
    expect(contactSaveProblems({ ...body, kind: 'entity', stateOfFormation: 'Texas' })).toEqual({ stateOfFormation: 'Use the two-letter state code, for example TX.' })
  })

  it('names a field that is too long for the contract', () => {
    expect(contactSaveProblems({ ...body, postalCode: '1'.repeat(21) })).toEqual({ postalCode: 'At most 20 characters.' })
  })
})

describe('problemsFromApiDetails', () => {
  it('reads the API issues by field and ignores what it does not know', () => {
    const details = [
      { code: 'too_big', maximum: 2, path: ['state'], message: 'Too big' },
      { code: 'too_big', maximum: 20, path: ['postalCode'], message: 'Too big' },
      { code: 'unrecognized_keys', path: [], message: 'Unknown key' },
      { code: 'custom', path: ['notAField'], message: 'x' },
    ]
    expect(problemsFromApiDetails(details)).toEqual({ state: 'Use the two-letter state code, for example TX.', postalCode: 'At most 20 characters.' })
    expect(problemsFromApiDetails(undefined)).toEqual({})
    expect(problemsFromApiDetails({ issues: [] })).toEqual({})
  })
})

describe('problemSummary and stateForEditor', () => {
  it('lists each label once, in order, with its sentence', () => {
    expect(problemSummary({ state: 'Use the code.', postalCode: 'At most 20 characters.' })).toBe('Check the fields marked in red. State: Use the code. ZIP: At most 20 characters.')
    expect(problemSummary({ pointOfContactId: 'A.', registeredAgentId: 'B.', registeredAgentName: 'C.' })).toBe('Check the fields marked in red. Point of contact: A. Registered agent: B.')
    expect(problemSummary({})).toBe('')
  })

  it('shows a stored state as its code, and keeps a value it cannot read', () => {
    expect(stateForEditor('Texas')).toBe('TX')
    expect(stateForEditor('[KS]')).toBe('KS')
    expect(stateForEditor('tx')).toBe('TX')
    expect(stateForEditor('')).toBe('')
    expect(stateForEditor(null)).toBe('')
    expect(stateForEditor('Texass')).toBe('Texass')
  })
})
