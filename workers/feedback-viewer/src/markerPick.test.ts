// file: workers/feedback-viewer/src/markerPick.test.ts
// The marker a pick copies: the element marker first, the id marker otherwise, nothing for an unmarked element.
import { describe, expect, it } from 'vitest'
import { markerPattern } from './markerPick.ts'

/** A stand-in element with only the attributes the rule reads. */
function element(attributes: Record<string, string>): Element {
  return { getAttribute: (name: string) => attributes[name] ?? null } as unknown as Element
}

describe('markerPattern', () => {
  it('writes the marker as it is pasted into a request', () => {
    expect(markerPattern(element({ 'data-kr-element': 'feedback-viewer-save' }))).toBe('data-kr-element="feedback-viewer-save"')
    expect(markerPattern(element({ 'data-kr-id': 'Viewer' }))).toBe('data-kr-id="Viewer"')
  })

  it('prefers the element marker and skips unmarked elements', () => {
    expect(markerPattern(element({ 'data-kr-id': 'Viewer', 'data-kr-element': 'feedback-viewer-list' }))).toBe('data-kr-element="feedback-viewer-list"')
    expect(markerPattern(element({}))).toBeNull()
  })
})
