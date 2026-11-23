// file: apps/web/features/contacts/relatedContactHover.test.tsx
/**
 * Related contacts in the identity header (the requester, Nov 16, 2026): a client's number comes before the name,
 * "107 · Client Name" (the requester changed it from "[107] Client Name" on Nov 17, 2026), and the hover card's stand-in record keeps the name and ICID when the contact is not in the
 * browser's list. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/contacts/relatedContactHover.test.tsx
 */

import { describe, expect, it } from 'vitest'
import { relatedContactHoverRow, relatedContactLabel } from './components/RelatedContactHover.client'

describe('related contacts', () => {
  it('puts a client number before the name', () => {
    expect(relatedContactLabel({ displayName: 'Pat Sample' }, { clientNumber: '107' })).toBe('107 · Pat Sample')
    expect(relatedContactLabel({ displayName: 'Pat Sample' }, { clientNumber: ' ' })).toBe('Pat Sample')
    expect(relatedContactLabel({ displayName: 'Pat Sample' }, undefined)).toBe('Pat Sample')
  })

  it('builds a stand-in record for the hover card from the relationship row', () => {
    expect(relatedContactHoverRow({ id: 'ind-1', displayName: 'Pat Sample', icid: 'ABC1234' })).toMatchObject({ id: 'ind-1', displayName: 'Pat Sample', icid: 'ABC1234', clientNumber: null })
  })
})
