// file: apps/web/features/code-links/codeLinks.test.tsx
/**
 * Following a code (web patch 571): `openKRCode` reaches the host's listener (and reports when none listens), the
 * link draws as a button with its kind and its words, and the host finds a contact by its client id or number, its
 * ICID or ECID (any case) or its id. Made-up contacts only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/code-links/codeLinks.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { codeLinkTitle, onKRCodeOpen, openKRCode, type KRCodeTarget } from '@/components/ui/codeLinks'
import KRCodeLink from '@/components/ui/KRCodeLink.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { contactForClientCode, contactForContactCode } from './CodeLinkHost.client'

const contact = (extra: Partial<KRContactRecord>): KRContactRecord => ({ id: 'ind_1', isClient: false, clientId: null, clientNumber: null, ...extra }) as KRContactRecord

describe('following a code', () => {
  it('hands a code to the listener, trimmed, and says when nobody listens', () => {
    expect(openKRCode({ kind: 'workstream', code: 'SHZ7GWE' })).toBe(false)
    const heard: KRCodeTarget[] = []
    const stop = onKRCodeOpen((target) => heard.push(target))
    expect(openKRCode({ kind: 'task', code: ' T4K9QWS ' })).toBe(true)
    expect(openKRCode({ kind: 'task', code: '   ' })).toBe(false)
    stop()
    expect(openKRCode({ kind: 'lead', code: 'L007' })).toBe(false)
    expect(heard).toEqual([{ kind: 'task', code: 'T4K9QWS', clientId: undefined }])
    expect(codeLinkTitle({ kind: 'workstream', code: 'SHZ7GWE' })).toBe('Open WorkStream entry SHZ7GWE')
  })

  it('draws a code link as a button with its kind and its words', () => {
    const html = renderToStaticMarkup(<KRCodeLink code="cli_090" kind="client">Client 090</KRCodeLink>)
    expect(html).toContain('data-kr-element="code-link"')
    expect(html).toContain('data-kr-code-kind="client"')
    expect(html).toContain('title="Open client cli_090"')
    expect(html).toContain('>Client 090</button>')
    expect(renderToStaticMarkup(<KRCodeLink code="SHZ7GWE" kind="workstream" />)).toContain('>SHZ7GWE</button>')
  })

  it('finds a client by its account id or number, preferring its own contact', () => {
    const member = contact({ id: 'ind_member', clientId: 'cli_090', clientNumber: '090', isClient: false })
    const own = contact({ id: 'ent_090', clientId: 'cli_090', clientNumber: '090', isClient: true })
    expect(contactForClientCode([member, own], 'cli_090')?.id).toBe('ent_090')
    expect(contactForClientCode([member, own], '090')?.id).toBe('ent_090')
    expect(contactForClientCode([member], '091')).toBeNull()
  })

  it('finds a contact by its ICID, its ECID (any case) or its id', () => {
    const person = contact({ id: 'ind_abc', icid: 'IC12345' })
    const firm = contact({ id: 'ent_xyz', ecid: 'EC67890' })
    expect(contactForContactCode([person, firm], 'ic12345')?.id).toBe('ind_abc')
    expect(contactForContactCode([person, firm], 'EC67890')?.id).toBe('ent_xyz')
    expect(contactForContactCode([person, firm], 'ENT_XYZ')?.id).toBe('ent_xyz')
    expect(contactForContactCode([person, firm], 'NOPE123')).toBeNull()
  })
})
