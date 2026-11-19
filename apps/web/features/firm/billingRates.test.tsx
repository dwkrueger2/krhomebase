// file: apps/web/features/firm/billingRates.test.tsx
// FB-0008: Firm Settings → Billing Rates. New classes get an id from their name when saved; the card loads first.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_BILLING_RATE_CLASSES } from '@krhomebase/contracts'
import BillingRatesCard, { classesToSave } from '@/features/firm/components/BillingRatesCard.client'

describe('classesToSave', () => {
  it('keeps stored ids and gives new rows an id from their name, clear of the others', () => {
    const rows = [
      ...BUILT_IN_BILLING_RATE_CLASSES.map((item) => ({ ...item, key: item.id, isNew: false })),
      { key: 'new-1', id: '', label: ' Expert Witness ', rate: 450, active: true, builtIn: false, isNew: true },
      { key: 'new-2', id: '', label: 'Expert Witness', rate: 500, active: true, builtIn: false, isNew: true },
    ]
    const saved = classesToSave(rows)
    expect(saved.slice(0, 6).map((item) => item.id)).toEqual(BUILT_IN_BILLING_RATE_CLASSES.map((item) => item.id))
    expect(saved.slice(6)).toEqual([
      { id: 'expert_witness', label: 'Expert Witness', rate: 450, active: true, builtIn: false },
      { id: 'expert_witness_2', label: 'Expert Witness', rate: 500, active: true, builtIn: false },
    ])
    expect(saved[6]).not.toHaveProperty('key')
  })
})

describe('BillingRatesCard', () => {
  it('shows the busy ring while the classes load', () => {
    const html = renderToStaticMarkup(<BillingRatesCard />)
    expect(html).toContain('data-kr-id="billing-rates-KRModuleCard"')
    expect(html).toContain('Loading billing rates...')
  })
})
