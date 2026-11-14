// file: packages/contracts/src/tasks.test.ts
/**
 * The text references between tasks and WorkStream entries (D21, Nov 13, 2026): `Task #ABC1234` and `WS #XYZ7890`.
 * The word may be in any case; the code is exactly seven capital letters and digits.
 */

import { describe, expect, it } from 'vitest'
import { findTaskReferences, findWorkstreamReferences, TASK_ID_PATTERN, TaskParams } from './tasks.ts'

describe('findTaskReferences', () => {
  it('finds each Task # code once, in order, with the word in any case', () => {
    expect(findTaskReferences('Task #345H3VK:Completed- Call to Paul Roberts')).toEqual(['345H3VK'])
    expect(findTaskReferences('see task #AB12CD3, TASK # ZZ99ZZ9 and Task#AB12CD3 again')).toEqual(['AB12CD3'])
    expect(findTaskReferences('task #AB12CD3 then Task  #QW34ER5')).toEqual(['AB12CD3', 'QW34ER5'])
  })

  it('refuses codes that are not exactly seven capital letters and digits, and words that only end in "task"', () => {
    expect(findTaskReferences('Task #345H3V: too short')).toEqual([])
    expect(findTaskReferences('Task #AB12CD34 too long')).toEqual([])
    expect(findTaskReferences('Task #ab12cd3 lower case code')).toEqual([])
    expect(findTaskReferences('Multitask #AB12CD3')).toEqual([])
    expect(findTaskReferences('WS #AB12CD3')).toEqual([])
    expect(findTaskReferences('')).toEqual([])
  })
})

describe('findWorkstreamReferences', () => {
  it('finds each WS # code once, in order, with the word in any case', () => {
    expect(findWorkstreamReferences('Follow-up of WS #XYZ7890 and ws #AB12CD3; ws#XYZ7890')).toEqual(['XYZ7890', 'AB12CD3'])
  })

  it('refuses other words and bad codes', () => {
    expect(findWorkstreamReferences('NEWS #XYZ7890')).toEqual([])
    expect(findWorkstreamReferences('WS #XYZ789')).toEqual([])
    expect(findWorkstreamReferences('Task #XYZ7890')).toEqual([])
  })
})

describe('task public id', () => {
  it('is seven capital letters and digits', () => {
    expect(TASK_ID_PATTERN.test('AB12CD3')).toBe(true)
    expect(TaskParams.safeParse({ taskId: 'tsk_123' }).success).toBe(false)
  })
})
