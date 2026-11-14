// file: packages/contracts/src/homebaseFeedback.test.ts
/**
 * Homebase Feedback (plan 12, stage F1): the `FB-0012` numbers (decision 6) and the marker patterns the text may name
 * (`data-kr-id="..."`, `data-kr-element="..."`), which the screen turns into chips and the API saves.
 */

import { describe, expect, it } from 'vitest'
import { findFeedbackMarkers, formatFeedbackNumber, HOMEBASE_FEEDBACK_MAX_MARKERS, HomebaseFeedbackParams, HomebaseFeedbackUpdateBody, parseFeedbackNumber } from './homebaseFeedback.ts'

describe('feedback numbers', () => {
  it('writes at least four digits', () => {
    expect(formatFeedbackNumber(1)).toBe('FB-0001')
    expect(formatFeedbackNumber(12)).toBe('FB-0012')
    expect(formatFeedbackNumber(12345)).toBe('FB-12345')
  })

  it('reads FB-0012, fb-12 and 12 alike, and refuses anything else', () => {
    expect(parseFeedbackNumber('FB-0012')).toBe(12)
    expect(parseFeedbackNumber('fb-12')).toBe(12)
    expect(parseFeedbackNumber('FB12')).toBe(12)
    expect(parseFeedbackNumber('12')).toBe(12)
    expect(parseFeedbackNumber('0')).toBeNull()
    expect(parseFeedbackNumber('FB-')).toBeNull()
    expect(parseFeedbackNumber('Task #12')).toBeNull()
  })

  it('accepts both forms in the address', () => {
    expect(HomebaseFeedbackParams.safeParse({ number: 'FB-0012' }).success).toBe(true)
    expect(HomebaseFeedbackParams.safeParse({ number: '12' }).success).toBe(true)
    expect(HomebaseFeedbackParams.safeParse({ number: 'test-id' }).success).toBe(false)
  })
})

describe('findFeedbackMarkers', () => {
  it('finds each full marker pattern once, in the order written', () => {
    const text = 'The list in data-kr-element="related-contacts-list" is too tall; see data-kr-id="ContactEditCard" and data-kr-element="related-contacts-list" again.'
    expect(findFeedbackMarkers(text)).toEqual([
      { attribute: 'data-kr-element', value: 'related-contacts-list', pattern: 'data-kr-element="related-contacts-list"' },
      { attribute: 'data-kr-id', value: 'ContactEditCard', pattern: 'data-kr-id="ContactEditCard"' },
    ])
  })

  it('keeps the same value under both attributes apart', () => {
    expect(findFeedbackMarkers('data-kr-id="X" data-kr-element="X"').map((marker) => marker.attribute)).toEqual(['data-kr-id', 'data-kr-element'])
  })

  it('ignores half patterns, single quotes, spaces in the value and other attributes', () => {
    expect(findFeedbackMarkers("data-kr-id=TopTitleBar data-kr-id='TopTitleBar' data-kr-id=\"two words\" data-kr-action=\"save\" xdata-kr-id=\"Y\" data-kr-id=\"\"")).toEqual([])
  })

  it('stops at the most markers one request keeps', () => {
    const many = Array.from({ length: HOMEBASE_FEEDBACK_MAX_MARKERS + 5 }, (_, index) => `data-kr-id="m${index}"`).join(' ')
    expect(findFeedbackMarkers(many)).toHaveLength(HOMEBASE_FEEDBACK_MAX_MARKERS)
  })
})

describe('HomebaseFeedbackUpdateBody', () => {
  it('needs a status or a priority', () => {
    expect(HomebaseFeedbackUpdateBody.safeParse({ note: 'only a note' }).success).toBe(false)
    expect(HomebaseFeedbackUpdateBody.safeParse({ status: 'planned' }).success).toBe(true)
    expect(HomebaseFeedbackUpdateBody.safeParse({ priority: 'high', note: 'why' }).success).toBe(true)
  })
})
