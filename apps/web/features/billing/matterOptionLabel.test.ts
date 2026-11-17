// file: apps/web/features/billing/matterOptionLabel.test.ts
// The time entry dialog's matter lists: "107.1 · Title", a long title shortened, the number alone without a title.
import { describe, expect, it } from 'vitest'
import { matterOptionLabel } from './components/EditTimeAndFeeDialog.client'

describe('matterOptionLabel', () => {
  it('names the matter after its number', () => {
    expect(matterOptionLabel('107.1', { '107.1': 'Estate plan' })).toBe('107.1 · Estate plan')
  })

  it('shortens a long title and keeps the number alone when there is no title', () => {
    const label = matterOptionLabel('107.2', { '107.2': 'A very long matter title that would widen the list past the dialog' })
    expect(label.startsWith('107.2 · A very long matter title')).toBe(true)
    expect(label.endsWith('...')).toBe(true)
    expect(label.length).toBeLessThanOrEqual('107.2 · '.length + 40)
    expect(matterOptionLabel('107.3', {})).toBe('107.3')
    expect(matterOptionLabel('107.3')).toBe('107.3')
  })
})
