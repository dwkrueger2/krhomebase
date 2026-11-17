// file: apps/web/features/contacts/contactCopyText.ts
/**
 * The three texts the contact card's address copy buttons put on the clipboard (FB-0004, the requester, Nov 16, 2026),
 * each written as it goes on an envelope or a letter: the street on its own line, then "City, ST, Zip" on the next.
 *
 *   address        4512 Example Ridge Dr
 *                  McKinney, TX, 75071
 *   nameAndAddress the display name, then the address
 *   letterBlock    the name and address, then "via email: <email>" and the phone
 *
 * The on-screen address (a Google Maps link) stays on one line: `formatContactAddress` in ContactIdentityDetails.
 */

import type { KRContactRecord } from './types'

type AddressParts = Pick<KRContactRecord, 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'postalCode'>

/** The address as envelope lines: street, second line, then "City, ST, Zip"; empty parts left out. */
export function contactAddressLines(contact: AddressParts): string[] {
  const cityLine = [contact.city, contact.state, contact.postalCode].map((part) => (part ?? '').trim()).filter(Boolean).join(', ')
  return [contact.addressLine1, contact.addressLine2, cityLine].map((line) => (line ?? '').trim()).filter(Boolean)
}

/** The three copy texts (see the file comment); `address` is empty when the contact has no address. */
export function contactCopyTexts(contact: AddressParts & Pick<KRContactRecord, 'displayName' | 'email' | 'phone' | 'phoneSecondary'>): {
  address: string
  nameAndAddress: string
  letterBlock: string
} {
  const addressLines = contactAddressLines(contact)
  const name = contact.displayName.trim()
  const phone = (contact.phone || contact.phoneSecondary || '').trim()
  return {
    address: addressLines.join('\n'),
    nameAndAddress: [name, ...addressLines].filter(Boolean).join('\n'),
    letterBlock: [name, ...addressLines, contact.email ? `via email: ${contact.email}` : '', phone].filter(Boolean).join('\n'),
  }
}
