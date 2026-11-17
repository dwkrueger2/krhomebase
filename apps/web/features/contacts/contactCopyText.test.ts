// file: apps/web/features/contacts/contactCopyText.test.ts
// The address copy texts (FB-0004): the street on one line, "City, ST, Zip" on the next, name and letter blocks.
import { describe, expect, it } from 'vitest'
import { contactAddressLines, contactCopyTexts } from './contactCopyText'

const contact = {
  displayName: 'Pat Sample',
  addressLine1: '100 Example Rd',
  addressLine2: '',
  city: 'McKinney',
  state: 'TX',
  postalCode: '75071',
  email: 'pat@example.com',
  phone: '(555) 010-0000',
  phoneSecondary: null,
}

describe('contact copy texts', () => {
  it('puts the city, state and zip on their own line', () => {
    expect(contactAddressLines(contact)).toEqual(['100 Example Rd', 'McKinney, TX, 75071'])
    expect(contactAddressLines({ ...contact, addressLine2: 'Suite 2' })).toEqual(['100 Example Rd', 'Suite 2', 'McKinney, TX, 75071'])
  })

  it('builds the three texts', () => {
    const texts = contactCopyTexts(contact)
    expect(texts.address).toBe('100 Example Rd\nMcKinney, TX, 75071')
    expect(texts.nameAndAddress).toBe('Pat Sample\n100 Example Rd\nMcKinney, TX, 75071')
    expect(texts.letterBlock).toBe('Pat Sample\n100 Example Rd\nMcKinney, TX, 75071\nvia email: pat@example.com\n(555) 010-0000')
  })

  it('uses the cell phone when there is no office phone, and leaves out what is missing', () => {
    expect(contactCopyTexts({ ...contact, phone: null, phoneSecondary: '(555) 010-1111', email: null }).letterBlock).toBe('Pat Sample\n100 Example Rd\nMcKinney, TX, 75071\n(555) 010-1111')
    expect(contactCopyTexts({ ...contact, addressLine1: '', city: '', state: '', postalCode: '' }).address).toBe('')
  })
})
