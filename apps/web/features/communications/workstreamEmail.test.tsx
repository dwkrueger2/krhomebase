// file: apps/web/features/communications/workstreamEmail.test.tsx
/**
 * The WorkStream email dialog (plan 10, stage 4): the default message, the matter choices (the `.0` always offered),
 * the starting matter, the subject tag hint (the contracts' `tagEmailSubject`, the same one the API uses), the request
 * body (`matterId` left out for the API's `.0`), the sent sentence, and first draws rendered to text.
 *
 * Run: pnpm --dir apps/web exec vitest run features/communications/workstreamEmail.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import WorkstreamEmailDialog, {
  buildWorkstreamEmailBody,
  workstreamEmailDefaultMessage,
  workstreamEmailInitialMatter,
  workstreamEmailMatterChoices,
  workstreamEmailSentDetail,
  workstreamEmailTagHint,
  type WorkstreamEmailDialogProps,
  type WorkstreamEmailMatterOption,
} from './components/WorkstreamEmailDialog.client'

const matters: WorkstreamEmailMatterOption[] = [
  { matterId: 'm0', matterNumber: '120.0', title: 'Client General Matters' },
  { matterId: 'm1', matterNumber: '120.1', title: 'Estate Plan' },
]

const props: WorkstreamEmailDialogProps = {
  clientId: 'c120',
  clientNumber: '120',
  clientDisplayName: 'Margaret Ellison',
  matterOptions: matters,
  senderDisplayName: 'Dan Krueger',
  onCancel: vi.fn(),
  onSent: vi.fn(),
  inline: true,
}

describe('WorkStream email helpers', () => {
  it('writes the old default cover message', () => {
    expect(workstreamEmailDefaultMessage('Margaret Ellison', 'Dan Krueger')).toBe('Dear Margaret Ellison,\n\n\n\nKind regards,\nDan Krueger\nKrueger & Richard, PLLC')
  })

  it('keeps the matters in order when the .0 is among them', () => {
    expect(workstreamEmailMatterChoices(matters, '120')).toEqual([
      { value: 'm0', matterNumber: '120.0', label: '120.0 · Client General Matters' },
      { value: 'm1', matterNumber: '120.1', label: '120.1 · Estate Plan' },
    ])
  })

  it('offers the general matter first, with no id, when the .0 is missing', () => {
    const choices = workstreamEmailMatterChoices(matters.slice(1), '120')
    expect(choices[0]).toEqual({ value: '', matterNumber: '120.0', label: '120.0 · General' })
    expect(choices).toHaveLength(2)
    expect(workstreamEmailMatterChoices([], '')).toEqual([{ value: '', matterNumber: '', label: 'General (.0)' }])
  })

  it('drops options with no id or number', () => {
    expect(workstreamEmailMatterChoices([{ matterId: '', matterNumber: '120.4' }, { matterId: 'm5', matterNumber: ' ' }, ...matters], '120')).toHaveLength(2)
  })

  it('starts on the default matter when it is offered, else the first choice', () => {
    const choices = workstreamEmailMatterChoices(matters, '120')
    expect(workstreamEmailInitialMatter(choices, 'm1')).toBe('m1')
    expect(workstreamEmailInitialMatter(choices, 'other')).toBe('m0')
    expect(workstreamEmailInitialMatter(choices, null)).toBe('m0')
    expect(workstreamEmailInitialMatter([], null)).toBe('')
  })

  it('names the same tag the API adds', () => {
    expect(workstreamEmailTagHint('120.1')).toBe('[KR 120.1] is added to the end of the subject so replies sort by matter in Gmail.')
    expect(workstreamEmailTagHint('')).toContain('The [KR matter] tag')
  })

  it('sends matterId only for a chosen matter', () => {
    const draft = { to: ['a@example.com'], cc: [], subject: 'Hello', message: 'Body' }
    expect(buildWorkstreamEmailBody('c120', 'm1', draft)).toEqual({ clientId: 'c120', matterId: 'm1', to: ['a@example.com'], cc: [], subject: 'Hello', message: 'Body' })
    expect(buildWorkstreamEmailBody('c120', '', draft)).not.toHaveProperty('matterId')
  })

  it('says whether the Workstream entry was recorded', () => {
    const base = { to: ['a@example.com'], subject: 'Hello [KR 120.1]' }
    expect(workstreamEmailSentDetail({ ...base, workstreamWsid: 'WS-9', workstreamError: null })).toBe('Emailed a@example.com as “Hello [KR 120.1]”. Recorded in the Workstream (WS-9).')
    expect(workstreamEmailSentDetail({ ...base, workstreamWsid: null, workstreamError: 'busy' })).toContain('the Workstream entry failed: busy.')
    expect(workstreamEmailSentDetail({ ...base, workstreamWsid: null, workstreamError: null })).toBe('Emailed a@example.com as “Hello [KR 120.1]”.')
  })
})

describe('WorkstreamEmailDialog', () => {
  it('draws the shared dialog with the old markers, title and subtitle', () => {
    const html = renderToStaticMarkup(<WorkstreamEmailDialog {...props} />)
    expect(html).toContain('data-kr-id="workstream-email-dialog"')
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
    expect(html).toContain('data-kr-element="workstream-email-matter-row"')
    expect(html).toContain('data-kr-element="workstream-email-matter"')
    expect(html).toContain('Email the client')
    expect(html).toContain('[120] Margaret Ellison')
    expect(html).toContain('Dear Margaret Ellison,')
    expect(html).toContain('a copy is recorded on this client’s Workstream.')
    expect(html).toContain('data-kr-action="send-email-preview"')
  })

  it('lists the matters and hints the tag of the chosen one', () => {
    const html = renderToStaticMarkup(<WorkstreamEmailDialog {...props} defaultMatterId="m1" />)
    expect(html).toContain('120.0 · Client General Matters')
    expect(html).toMatch(/<option value="m1" selected="">120.1 · Estate Plan<\/option>/)
    expect(html).toContain('[KR 120.1] is added to the end of the subject')
  })

  it('looks up the addresses on open (the spinner shows until they arrive)', () => {
    expect(renderToStaticMarkup(<WorkstreamEmailDialog {...props} />)).toContain('Looking up the client&#x27;s email addresses...')
  })

  it('offers the general matter when the client number is not known yet', () => {
    const html = renderToStaticMarkup(<WorkstreamEmailDialog {...props} clientNumber={null} matterOptions={[]} />)
    expect(html).toContain('General (.0)')
    expect(html).toContain('The [KR matter] tag is added')
    expect(html).not.toContain('[120]')
  })
})
