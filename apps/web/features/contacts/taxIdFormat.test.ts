// file: apps/web/features/contacts/taxIdFormat.test.ts
// The SSN and EIN display rules (FB-0003): hyphens for nine digits, anything else left as typed, the masked form.
import { describe, expect, it } from 'vitest'
import { formatTaxId, maskTaxId } from './taxIdFormat'

describe('formatTaxId', () => {
  it('writes nine digits with the hyphens of an SSN or an EIN', () => {
    expect(formatTaxId('individual', '123456789')).toBe('123-45-6789')
    expect(formatTaxId('individual', ' 123 45 6789 ')).toBe('123-45-6789')
    expect(formatTaxId('entity', '123456789')).toBe('12-3456789')
    expect(formatTaxId('entity', '12-3456789')).toBe('12-3456789')
  })

  it('leaves other text as it was typed', () => {
    expect(formatTaxId('individual', '12345')).toBe('12345')
    expect(formatTaxId('individual', 'pending 123456789')).toBe('pending 123456789')
    expect(formatTaxId('individual', null)).toBe('')
  })
})

describe('maskTaxId', () => {
  it('shows only the last four digits', () => {
    expect(maskTaxId('individual', '6789')).toBe('•••-••-6789')
    expect(maskTaxId('entity', '6789')).toBe('••-•••6789')
    expect(maskTaxId('individual', null)).toBe('')
  })
})
