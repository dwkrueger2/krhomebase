// file: apps/web/features/contacts/relatedContactRemove.test.tsx
/**
 * FB-0023 (web patch 585): removing a saved related person asks "Both sides (recommended)" or "Only <name>'s list",
 * with the real names, and a choice of "this list only" is sent as `relatedContactsRemovedHereOnly`.
 *
 * Run: pnpm --dir apps/web exec vitest run features/contacts/relatedContactRemove.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import RelatedContactRemoveDialog, { relatedRemovalWords } from './components/RelatedContactRemoveDialog.client'
import { draftsMatch } from './components/ContactEditDialog.client'
import type { KRContactDraft } from './types'

describe('RelatedContactRemoveDialog', () => {
  it('names both people in the question and in each choice', () => {
    const words = relatedRemovalWords('Bob Example', 'Ann Example')
    expect(words.title).toBe('Remove Ann Example?')
    expect(words.hereOnly).toBe("Only Bob Example's list")
    expect(words.hereOnlyDetail).toContain("leave Bob Example on Ann Example's list")
    const html = renderToStaticMarkup(
      <RelatedContactRemoveDialog currentName="Bob Example" related={{ id: 'ind-ann', displayName: 'Ann Example' } as never} onCancel={() => {}} onChoose={() => {}} />,
    )
    expect(html).toContain('Both sides (recommended)')
    expect(html).toContain('Only Bob Example&#x27;s list')
    expect(html).toContain('Cancel')
    expect(html).toContain('data-kr-element="related-contact-remove-choices"')
  })

  it('draws nothing while no removal is pending', () => {
    expect(renderToStaticMarkup(<RelatedContactRemoveDialog currentName="Bob" related={null} onCancel={() => {}} onChoose={() => {}} />)).toBe('')
  })
})

describe('the draft with a "this list only" removal', () => {
  it('counts as changed through its related list, not through the choice itself', () => {
    const base = { kind: 'individual', relatedContactIds: ['ind-ann'] } as unknown as KRContactDraft
    expect(draftsMatch(base, { ...base, relatedContactsRemovedHereOnly: [] })).toBe(true)
    expect(draftsMatch(base, { ...base, relatedContactIds: [], relatedContactsRemovedHereOnly: ['ind-ann'] })).toBe(false)
  })
})
