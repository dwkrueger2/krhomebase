// file: workers/feedback-viewer/src/feedbackColors.test.ts
// The colors object: every status, priority and kind has a tone, and every tone has its three colors.
import { describe, expect, it } from 'vitest'
import { FEEDBACK_TONES, KIND_TONES, PRIORITY_TONES, STATUS_TONES, toneOf } from './feedbackColors.ts'
import { FEEDBACK_KINDS, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES } from './feedbackTypes.ts'

describe('feedback colors', () => {
  it('gives every value a known tone', () => {
    for (const status of FEEDBACK_STATUSES) expect(FEEDBACK_TONES[STATUS_TONES[status]]).toBeDefined()
    for (const priority of FEEDBACK_PRIORITIES) expect(FEEDBACK_TONES[PRIORITY_TONES[priority]]).toBeDefined()
    for (const kind of FEEDBACK_KINDS) expect(FEEDBACK_TONES[KIND_TONES[kind]]).toBeDefined()
  })

  it('writes every color as hex', () => {
    for (const tone of Object.values(FEEDBACK_TONES)) {
      for (const color of [tone.fill, tone.line, tone.text]) expect(color).toMatch(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/)
    }
  })

  it('falls back to grey for a value this tool does not know', () => {
    expect(toneOf(STATUS_TONES, 'archived')).toBe('grey')
    expect(toneOf(STATUS_TONES, null)).toBe('grey')
  })
})
