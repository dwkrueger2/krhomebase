// file: apps/web/features/contacts/photoAndEntities.test.tsx
/**
 * Web patch 586 (the requester's plans of Nov 23, 2026): a person's Related Entities on the contact card, a business's
 * point of contact and registered agent in its Related Contacts, the contact photo (FB-0019: the circle, the toggle,
 * the camera), the cache of both, and the WorkStream writers' photos. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/contacts/photoAndEntities.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import KRPhotoCircle, { photoPlacement } from '@/components/ui/KRPhotoCircle.client'
import { writerPhotosOf } from '@/features/communications/writerPhotos'
import ContactIdentityDetails, { relatedPeopleOf } from './components/ContactIdentityDetails.client'
import ContactIdentityPhotoColumn from './components/ContactIdentityPhotoColumn.client'
import { circlesDiffer, clampCircle, shrunkSize } from './contactPhotoMath'
import { cacheLacksNewFields, contactFromApiRow, fromClientContactElement, toClientContactElement } from './contactsStore.client'
import type { KRContactPhoto, KRContactRecord } from './types'

function contact(id: string, displayName: string, extra: Partial<KRContactRecord> = {}): KRContactRecord {
  return {
    id, kind: 'individual', typeLabel: 'Person', displayName, titlePrefix: null, firstName: null, middleName: null, lastName: null,
    suffix: null, preferredName: null, dob: null, ssn: null, ssnLast4: null, isMinor: false, isAttorney: false, email: null, phone: null,
    addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', status: 'active', notes: null, isClient: false, clientId: null,
    clientNumber: null, clientStatus: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', relatedMatters: [],
    relatedContacts: [], ...extra,
  }
}

const PHOTO: KRContactPhoto = { assetId: 'mda_1', width: 800, height: 1000, cropX: 0.5, cropY: 0.4, cropSize: 0.5, updatedAt: '2026-11-23T19:00:00.000Z' }

describe('Related Entities (web patch 586)', () => {
  const ann = contact('ind-ann', 'Ann Example', {
    relatedEntities: [
      { id: 'ent-acme', displayName: 'Acme Test LLC', ecid: 'EC1', clientNumber: '077', role: 'Point of contact' },
      { id: 'ent-zed', displayName: 'Zed Holdings LLC', ecid: 'EC2', clientNumber: null, role: 'Related contact' },
    ],
  })

  it('lists a person’s businesses with their role in their own box, the client number first', () => {
    const html = renderToStaticMarkup(<ContactIdentityDetails contact={ann} />)
    expect(html).toContain('data-kr-element="contact-related-entities"')
    expect(html).toContain('Related Entities')
    expect(html).toContain('077 · Acme Test LLC')
    expect(html).toContain('Point of contact')
    expect(html).toContain('Zed Holdings LLC')
  })

  it('says so when a person has none, and draws no box for a business', () => {
    expect(renderToStaticMarkup(<ContactIdentityDetails contact={contact('ind-bob', 'Bob Example')} />)).toContain('No related entities recorded.')
    expect(renderToStaticMarkup(<ContactIdentityDetails contact={contact('ent-acme', 'Acme Test LLC', { kind: 'entity' })} />)).not.toContain('contact-related-entities')
  })

  it('lists a business’s point of contact and registered agent with those roles in Related Contacts', () => {
    const acme = contact('ent-acme', 'Acme Test LLC', {
      kind: 'entity',
      pointOfContact: { id: 'ind-ann', displayName: 'Ann Example' },
      registeredAgent: { id: 'ind-reg', displayName: 'Reg Agent' },
      relatedContacts: [{ id: 'ind-bob', displayName: 'Bob Example', relationship: 'Related contact' }],
    })
    expect(relatedPeopleOf(acme).map((person) => `${person.displayName}: ${person.relationship}`)).toEqual([
      'Ann Example: Point of contact',
      'Reg Agent: Registered agent',
      'Bob Example: Related contact',
    ])
    expect(relatedPeopleOf(contact('ind-x', 'X', { relatedContacts: [{ id: 'y', displayName: 'Y' }] }))).toHaveLength(1)
  })
})

describe('the contact photo (FB-0019)', () => {
  it('places the image so the circle shows the chosen part', () => {
    // The circle is half the shorter side (400px of the image) drawn at 100px: the image is drawn at a quarter size.
    expect(photoPlacement(PHOTO, 100)).toEqual({ width: 200, height: 250, left: -50, top: -50 })
  })

  it('draws the circle, the whole photo, or the initials', () => {
    const circle = renderToStaticMarkup(<KRPhotoCircle crop={PHOTO} initials="AE" label="Photo of Ann" size={100} src="/api/v1/contacts/ind-ann/photo/mda_1" />)
    expect(circle).toContain('data-kr-element="photo-circle"')
    expect(circle).toContain('src="/api/v1/contacts/ind-ann/photo/mda_1"')
    expect(renderToStaticMarkup(<KRPhotoCircle crop={PHOTO} initials="AE" label="Photo of Ann" mode="full" size={100} src="/x" />)).toContain('data-kr-element="photo-full"')
    expect(renderToStaticMarkup(<KRPhotoCircle crop={null} initials="AE" label="Photo of Ann" size={100} src={null} />)).toContain('>AE<')
  })

  it('shows the toggle only with a photo, and the camera only to someone who may edit', () => {
    const withPhoto = renderToStaticMarkup(<ContactIdentityPhotoColumn canEditPhoto contact={contact('ind-ann', 'Ann Example', { photo: PHOTO })} />)
    expect(withPhoto).toContain('data-kr-element="contact-photo-toggle"')
    expect(withPhoto).toContain('data-kr-element="contact-photo-edit"')
    expect(withPhoto).toContain('/api/v1/contacts/ind-ann/photo/mda_1')
    const readOnly = renderToStaticMarkup(<ContactIdentityPhotoColumn contact={contact('ind-ann', 'Ann Example')} />)
    expect(readOnly).not.toContain('contact-photo-toggle')
    expect(readOnly).not.toContain('contact-photo-edit')
    expect(readOnly).toContain('>AE<')
  })

  it('keeps the circle inside the image and shrinks a large picked image', () => {
    expect(clampCircle({ cropX: 0, cropY: 1, cropSize: 2 }, 800, 1000)).toEqual({ cropX: 0.5, cropY: 0.6, cropSize: 1 })
    expect(clampCircle({ cropX: 0.5, cropY: 0.5, cropSize: 0.01 }, 800, 1000).cropSize).toBe(0.05)
    expect(shrunkSize(4000, 3000)).toEqual({ width: 1200, height: 900 })
    expect(shrunkSize(600, 400)).toEqual({ width: 600, height: 400 })
    expect(circlesDiffer({ cropX: 0.5, cropY: 0.5, cropSize: 0.5 }, { cropX: 0.5, cropY: 0.5, cropSize: 0.5 })).toBe(false)
  })
})

describe('the cache and the WorkStream (web patch 586)', () => {
  it('reads related entities and the photo from the API and keeps them in the cache', () => {
    const row = { id: 'ind-ann', kind: 'individual', displayName: 'Ann Example', relatedContacts: [], relatedEntities: [{ id: 'ent-acme', displayName: 'Acme Test LLC', ecid: 'EC1', clientNumber: '077', role: 'Point of contact' }], photo: PHOTO }
    const record = contactFromApiRow(row, 0)
    expect(record.relatedEntities).toHaveLength(1)
    expect(record.photo).toEqual(PHOTO)
    const back = fromClientContactElement(toClientContactElement(record))
    expect(back.relatedEntities?.[0]?.role).toBe('Point of contact')
    expect(back.photo?.assetId).toBe('mda_1')
  })

  it('reloads a cache written before (no related entities or photo) in full once', () => {
    const element = toClientContactElement(contact('ind-ann', 'Ann Example'))
    const { relatedEntities: _entities, photo: _photo, ...older } = element
    const collection = { collectionId: 'contacts' as const, schemaVersion: 1, collectionVersion: 'v1', fetchedAt: '2026-11-23T00:00:00.000Z', elements: [older] }
    expect(cacheLacksNewFields(collection as never)).toBe(true)
    expect(cacheLacksNewFields({ ...collection, elements: [element] } as never)).toBe(false)
  })

  it('finds a WorkStream writer’s photo through their linked contact', () => {
    const photos = writerPhotosOf([contact('ind-ann', 'Ann Example', { linkedUserId: 'user-ann', photo: PHOTO }), contact('ind-bob', 'Bob Example', { linkedUserId: 'user-bob' })])
    expect(photos.get('user-ann')?.src).toBe('/api/v1/contacts/ind-ann/photo/mda_1')
    expect(photos.has('user-bob')).toBe(false)
  })
})
