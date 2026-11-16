// file: apps/web/features/billing/trustInstructions.test.tsx
/**
 * C3 (web patch 561): the Trust tab's [i] button, and the instructions it opens (the trust account is its own ledger;
 * how an invoice is paid from trust; returning funds).
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TrustInstructionsDialog from './components/TrustInstructionsDialog.client'
import TrustTab from './components/TrustTab.client'

const noop = () => undefined

describe('Trust instructions', () => {
  it('puts the [i] button on the Trust tab, for readers too', () => {
    const html = renderToStaticMarkup(<TrustTab clientDisplayName="Pat Sample" clientNumber="501" entries={[]} matterNumbers={['501.0']} />)
    expect(html).toContain('data-kr-action="trust-instructions-open"')
    expect(html).toContain('aria-label="How the trust account works"')
  })

  it('draws nothing while closed, and the instructions when open', () => {
    expect(renderToStaticMarkup(<TrustInstructionsDialog open={false} onClose={noop} />)).toBe('')
    const html = renderToStaticMarkup(<TrustInstructionsDialog open onClose={noop} />)
    expect(html).toContain('data-kr-id="trust-instructions-dialog"')
    expect(html).toContain('never mixed into the client&#x27;s billing balance on the Billing Overview')
    expect(html).toContain('Paying an invoice from trust')
    expect(html).toContain('Record Trust Disbursement')
    expect(html).toContain('Payments → Post Payment')
  })
})
