// file: apps/web/components/dialogs/SendEmailDialog.test.tsx
/**
 * The shared send-email dialog (plan 10, stage 4): the address helpers (parse, check, seed), where the hover preview
 * opens, and first draws rendered to text (theme scope, markers, chips, the loading and empty states, the caller's
 * controls, the Preview button, the footer note, and no portal without a document).
 *
 * Run: pnpm --dir apps/web exec vitest run components/dialogs/SendEmailDialog.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SendEmailDialog, { findInvalidEmailAddresses, parseEmailAddressList, previewPopoverPosition, seedRecipientList, type SendEmailDialogProps } from './SendEmailDialog.client'

const base: SendEmailDialogProps = {
  title: 'Email Invoice #3391',
  subtitle: 'Margaret Ellison · Client 120',
  suggestions: [],
  defaultSubject: 'Invoice #3391',
  defaultMessage: 'Dear Margaret,',
  onSend: vi.fn(async () => ({ ok: true, detail: 'Sent.' })),
  onCancel: vi.fn(),
  inline: true,
}

describe('address helpers', () => {
  it('splits on commas and semicolons, trims, lower-cases and drops duplicates', () => {
    expect(parseEmailAddressList(' A@Example.com; b@example.com ,a@example.com,, ')).toEqual(['a@example.com', 'b@example.com'])
    expect(parseEmailAddressList('')).toEqual([])
  })

  it('finds the entries that are not addresses', () => {
    expect(findInvalidEmailAddresses(['a@example.com', 'nobody', 'x@y'])).toEqual(['nobody', 'x@y'])
  })

  it('seeds To with the primaries, else the only suggestion, else nothing', () => {
    expect(seedRecipientList([{ email: 'a@x.com', label: 'A', primary: true }, { email: 'b@x.com', label: 'B' }, { email: 'c@x.com', label: 'C', primary: true }])).toEqual(['a@x.com', 'c@x.com'])
    expect(seedRecipientList([{ email: 'b@x.com', label: 'B' }])).toEqual(['b@x.com'])
    expect(seedRecipientList([{ email: 'a@x.com', label: 'A' }, { email: 'b@x.com', label: 'B' }])).toEqual([])
    expect(seedRecipientList([])).toEqual([])
  })
})

describe('previewPopoverPosition', () => {
  it('opens to the right of the dialog when there is room', () => {
    expect(previewPopoverPosition({ top: 100, right: 700 }, 1920)).toEqual({ top: 100, left: 712 })
  })

  it('stays inside the window when there is no room, and keeps 8px from the top', () => {
    expect(previewPopoverPosition({ top: 2, right: 976 }, 1280)).toEqual({ top: 8, left: 1280 - 560 - 16 })
    expect(previewPopoverPosition({ top: 50, right: 380 }, 390).left).toBe(16)
  })
})

describe('SendEmailDialog', () => {
  it('draws nothing without a document unless it is drawn inline', () => {
    expect(renderToStaticMarkup(<SendEmailDialog {...base} inline={false} />)).toBe('')
  })

  it('draws a themed modal dialog with its markers, title and fields', () => {
    const html = renderToStaticMarkup(<SendEmailDialog {...base} />)
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
    expect(html).toContain('z-[1000]')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-kr-id="send-email-dialog"')
    expect(html).toContain('Email Invoice #3391')
    expect(html).toContain('Margaret Ellison · Client 120')
    for (const marker of ['send-email-to-row', 'send-email-cc-row', 'send-email-subject-row', 'send-email-message-row']) expect(html).toContain(`data-kr-element="${marker}"`)
    expect(html).toContain('value="Invoice #3391"')
    expect(html).toContain('Dear Margaret,')
    expect(html).toContain('>Cancel<')
    expect(html).toContain('>Send<')
    expect(html).not.toContain('bg-white')
    expect(html).not.toContain('…')
  })

  it('uses the caller\'s automation id', () => {
    expect(renderToStaticMarkup(<SendEmailDialog {...base} dataKrId="invoice-email-dialog" />)).toContain('data-kr-id="invoice-email-dialog"')
  })

  it('shows the spinner while the addresses load', () => {
    const html = renderToStaticMarkup(<SendEmailDialog {...base} suggestionsLoading />)
    expect(html).toContain('Looking up the client&#x27;s email addresses...')
  })

  it('says when no address is on file, and says so differently when the lookup failed', () => {
    expect(renderToStaticMarkup(<SendEmailDialog {...base} />)).toContain('No email address is on file for this client.')
    const failed = renderToStaticMarkup(<SendEmailDialog {...base} suggestionsError="KR Homebase could not be reached." />)
    expect(failed).toContain('KR Homebase could not be reached. Type an address above.')
    expect(failed).not.toContain('No email address is on file')
  })

  it('seeds To from the primary suggestion on the first draw and marks its chip chosen', () => {
    const html = renderToStaticMarkup(
      <SendEmailDialog {...base} suggestions={[{ email: 'Margaret@Example.com', label: 'Margaret · Home', primary: true }, { email: 'office@example.com', label: 'Office' }]} />,
    )
    expect(html).toContain('value="Margaret@Example.com"')
    expect(html.match(/data-kr-action="send-email-toggle-recipient"/g)).toHaveLength(2)
    expect(html).toContain('title="Margaret · Home"')
    expect(html).toContain('bg-(--kr-theme-brand-primary)')
  })

  it('draws the caller\'s controls, the attachment line and the footer note', () => {
    const html = renderToStaticMarkup(
      <SendEmailDialog {...base} attachmentSummary="Invoice #3391" beforeSubject={<div data-kr-element="caller-row">Matter</div>} footerNote="From billing." />,
    )
    expect(html).toContain('data-kr-element="caller-row"')
    expect(html.indexOf('send-email-cc-row')).toBeLessThan(html.indexOf('caller-row'))
    expect(html.indexOf('caller-row')).toBeLessThan(html.indexOf('send-email-subject-row'))
    expect(html).toContain('Includes: Invoice #3391')
    expect(html).toContain('From billing.')
    expect(renderToStaticMarkup(<SendEmailDialog {...base} />)).toContain('Sent from the firm’s Google Workspace mailbox.')
  })

  it('shows Preview only when the caller can render one', () => {
    expect(renderToStaticMarkup(<SendEmailDialog {...base} />)).not.toContain('send-email-preview')
    expect(renderToStaticMarkup(<SendEmailDialog {...base} renderPreview={vi.fn()} />)).toContain('data-kr-action="send-email-preview"')
  })

  it('keeps Send disabled until there is a valid recipient', () => {
    expect(renderToStaticMarkup(<SendEmailDialog {...base} />)).toMatch(/disabled=""[^>]*data-kr-action="send-email-send"|data-kr-action="send-email-send"[^>]*disabled=""/)
    const ready = renderToStaticMarkup(<SendEmailDialog {...base} suggestions={[{ email: 'a@example.com', label: 'A', primary: true }]} />)
    expect(ready).not.toMatch(/disabled=""[^>]*data-kr-action="send-email-send"|data-kr-action="send-email-send"[^>]*disabled=""/)
  })
})
