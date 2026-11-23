// file: apps/web/features/homebase-feedback/markerInsert.ts
/**
 * Putting a picked marker (`data-kr-element="..."`) into the Feedback text box (Pick from page, stage F4).
 *
 * The requester (Nov 23, 2026, web patch 585): Ctrl+Z did nothing after a marker was put in, because the form wrote
 * the whole text through React state, which the browser's undo history does not see. `insertUndoably` now types the
 * marker the way a person would (`insertText` on the text box's own document), so the browser records one undo step
 * and the text box's normal change event updates the form. Where the browser refuses that, the form falls back to
 * `markerInserted` (the old way: no undo step).
 *
 * The rule is unchanged: the marker goes in at the cursor (or the end), with a space on each side where the text
 * around it has none.
 */

/** The marker with the spaces it needs between `before` and `after`. */
export function markerWithSpaces(before: string, after: string, label: string): string {
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const tail = after && !/^\s/.test(after) ? ' ' : ''
  return `${lead}${label}${tail}`
}

/** The text with the marker put in at `at` (the fallback, and the rule `insertUndoably` follows). */
export function markerInserted(text: string, at: number, label: string): string {
  const before = text.slice(0, at)
  const after = text.slice(at)
  return `${before}${markerWithSpaces(before, after, label)}${after}`
}

/**
 * Types the marker into the text box at its cursor as one undoable edit.
 *
 * @returns False when the browser did not insert it (the caller then sets the text itself).
 */
export function insertUndoably(field: HTMLTextAreaElement, label: string): boolean {
  const text = field.value
  const at = field.selectionStart <= text.length ? field.selectionStart : text.length
  const insertion = markerWithSpaces(text.slice(0, at), text.slice(at), label)
  try {
    field.focus()
    field.setSelectionRange(at, at)
    // `execCommand('insertText')` is the one way a page can add text that the browser's own undo (Ctrl+Z) can take
    // back; it fires the box's input event, so React's onChange sees the new text.
    const inserted = field.ownerDocument.execCommand('insertText', false, insertion)
    return inserted && field.value === `${text.slice(0, at)}${insertion}${text.slice(at)}`
  } catch {
    return false
  }
}
