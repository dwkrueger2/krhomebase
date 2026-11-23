// file: apps/web/features/homebase-feedback/markerInsert.test.ts
/**
 * The picked-marker insertion rule (web patch 585): at the cursor, a space on each side where needed; and the undoable
 * path falls back when the browser refuses it.
 *
 * Run: pnpm --dir apps/web exec vitest run features/homebase-feedback/markerInsert.test.ts
 */

import { describe, expect, it } from 'vitest'
import { insertUndoably, markerInserted, markerWithSpaces } from './markerInsert'

const MARKER = 'data-kr-element="dashboard-widget-grid"'

describe('markerInserted', () => {
  it('adds a space on each side only where the text has none', () => {
    expect(markerInserted('see here', 3, MARKER)).toBe(`see ${MARKER} here`)
    expect(markerInserted('see ', 4, MARKER)).toBe(`see ${MARKER}`)
    expect(markerInserted('', 0, MARKER)).toBe(MARKER)
    expect(markerWithSpaces('a\n', ' b', MARKER)).toBe(MARKER)
  })
})

describe('insertUndoably', () => {
  it('reports false when the browser does not insert, so the form sets the text itself', () => {
    const field = {
      value: 'Problem: ',
      selectionStart: 9,
      focus() {},
      setSelectionRange() {},
      ownerDocument: { execCommand: () => false },
    } as unknown as HTMLTextAreaElement
    expect(insertUndoably(field, MARKER)).toBe(false)
  })

  it('reports true when the browser typed the marker in', () => {
    const field = {
      value: 'Problem:',
      selectionStart: 8,
      focus() {},
      setSelectionRange() {},
      ownerDocument: {
        execCommand(_command: string, _ui: boolean, text: string) {
          field.value += text
          return true
        },
      },
    } as unknown as HTMLTextAreaElement & { value: string }
    expect(insertUndoably(field, MARKER)).toBe(true)
    expect(field.value).toBe(`Problem: ${MARKER}`)
  })
})
