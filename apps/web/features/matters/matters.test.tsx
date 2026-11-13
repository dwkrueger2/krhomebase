// file: apps/web/features/matters/matters.test.tsx
/**
 * Projects & Matters screens (plan 10, stage 1): the display helpers, and first draws rendered to text of the
 * workspace (number order kept from the API, the `ClientMattersCard-<client number>` marker, Add and Edit only for a
 * writer, the "—" metrics), the Add Matter dialog (Status and Opened rows, no Delete) and the Edit dialog of a `.0`
 * matter (locked title, Delete for a super admin).
 *
 * Run: pnpm --dir apps/web exec vitest run features/matters/matters.test.tsx
 */

import type { ClientMattersData, Matter } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ClientMattersCard from '@/features/matters/components/ClientMattersCard.client'
import MatterEditCard from '@/features/matters/components/MatterEditCard.client'
import { clientTreeLabel, compareMatterNumbers, displayDate } from '@/features/matters/matterDisplay'
import type { ClientMattersState } from '@/features/matters/useClientMatters.client'

const matter = (id: string, matterNumber: string, title: string, extra: Partial<Matter> = {}): Matter => ({
  id,
  matterNumber,
  title,
  description: null,
  isGeneralMatter: matterNumber.endsWith('.0'),
  practiceAreaLookupId: 'lk_practice_area_miscellaneous',
  practiceAreaLabel: 'Miscellaneous',
  statusLookupId: 'lk_matter_status_open',
  statusLabel: 'Open',
  openedDate: '2026-11-01',
  closedDate: null,
  primaryAttorneyUserId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: null,
  ...extra,
})

const DATA: ClientMattersData = {
  clientId: 'cl-55',
  clientNumber: '055',
  matters: [matter('m0', '055.0', 'Client General Matters'), matter('m2', '055.2', 'Estate plan', { description: 'Wills and trust' }), matter('m10', '055.10', 'Probate')],
  statuses: [{ id: 'lk_matter_status_open', label: 'Open' }, { id: 'lk_matter_status_closed', label: 'Closed' }],
  practiceAreas: [{ id: 'lk_practice_area_miscellaneous', label: 'Miscellaneous' }],
  viewer: { canWrite: true, canDelete: false },
}

const state = (data: ClientMattersData | null, extra: Partial<ClientMattersState> = {}): ClientMattersState => ({
  data,
  loading: false,
  error: null,
  reload: () => {},
  upsert: () => {},
  remove: () => {},
  ...extra,
})

describe('matter display helpers', () => {
  it('orders numbers numerically, shows dates as MM/DD/YYYY and labels the client', () => {
    expect(['055.10', '055.2', '055.0'].sort(compareMatterNumbers)).toEqual(['055.0', '055.2', '055.10'])
    expect(displayDate('2026-11-03')).toBe('11/03/2026')
    expect(displayDate(null)).toBe('')
    expect(clientTreeLabel('055', 'Example Family')).toBe('[055] Example Family')
    expect(clientTreeLabel(null, ' ')).toBe('[No Client #] No Display Name')
  })
})

describe('ClientMattersCard', () => {
  it('draws the selector, the summary with "—" metrics and the requested matter, with Add and Edit for a writer', () => {
    const html = renderToStaticMarkup(<ClientMattersCard clientId="cl-55" clientNumber="055" displayName="Example Family" requestedMatterId="m2" state={state(DATA)} />)
    expect(html).toContain('data-kr-id="ClientMattersCard-055"')
    expect(html).toContain('[055] Example Family')
    expect(html.indexOf('055.2')).toBeLessThan(html.indexOf('055.10'))
    expect(html).toContain('Add Matter')
    expect(html).toContain('Edit Matter')
    expect(html).toContain('Wills and trust')
    expect(html).toContain('—')
  })

  it('hides Add and Edit from a read-only viewer, and shows loading and failures', () => {
    const readOnly = renderToStaticMarkup(<ClientMattersCard clientId="cl-55" clientNumber="055" displayName="X" state={state({ ...DATA, viewer: { canWrite: false, canDelete: false } })} />)
    expect(readOnly).not.toContain('Add Matter')
    expect(readOnly).not.toContain('Edit Matter')
    expect(renderToStaticMarkup(<ClientMattersCard clientId="cl-55" clientNumber="055" displayName="X" state={state(null, { loading: true })} />)).toContain('Loading matters...')
    const failed = renderToStaticMarkup(<ClientMattersCard clientId="cl-55" clientNumber="055" displayName="X" state={state(null, { error: 'Matters cannot be read or saved right now.' })} />)
    expect(failed).toContain('Try again')
  })
})

describe('MatterEditCard', () => {
  const noop = () => {}
  it('adds a matter with Status and Opened on one row and no Delete', () => {
    const html = renderToStaticMarkup(<MatterEditCard canDelete inline clientId="cl-55" clientNumber="055" matter={null} open statuses={DATA.statuses} onClose={noop} onDeleted={noop} onSaved={noop} />)
    expect(html).toContain('Add Matter')
    expect(html).toContain('data-kr-element="matter-edit-status-row"')
    expect(html).toContain('Opened')
    expect(html).not.toContain('Delete Matter')
  })

  it('locks the .0 title and offers Delete to a super admin', () => {
    const html = renderToStaticMarkup(<MatterEditCard canDelete inline clientId="cl-55" clientNumber="055" matter={DATA.matters[0]!} open statuses={DATA.statuses} onClose={noop} onDeleted={noop} onSaved={noop} />)
    expect(html).toContain('The .0 matter is always named Client General Matters.')
    expect(html).toContain('Delete Matter')
    expect(html).toMatch(/id="matter-edit-title"[^>]*disabled|disabled[^>]*id="matter-edit-title"/)
  })
})
