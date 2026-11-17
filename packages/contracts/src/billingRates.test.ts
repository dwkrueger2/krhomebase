// file: packages/contracts/src/billingRates.test.ts
// FB-0008: reading the billing rates settings row leniently, the shared save checks, and new class ids.
import { describe, expect, it } from 'vitest'
import { billingRateClassIdFor, billingRateClassLabel, billingRateProblems, BUILT_IN_BILLING_RATE_CLASSES, readBillingRateSchedule } from './billingRates.ts'

describe('readBillingRateSchedule', () => {
  it('gives the built-in classes when nothing is stored', () => {
    const schedule = readBillingRateSchedule(null)
    expect(schedule.classes.map((item) => item.id)).toEqual(BUILT_IN_BILLING_RATE_CLASSES.map((item) => item.id))
    expect(schedule).toMatchObject({ defaults: {}, savedClasses: false })
    expect(readBillingRateSchedule('not json').classes).toHaveLength(6)
  })

  it('keeps stored changes, adds back a missing built-in class, and drops defaults to unknown classes', () => {
    const schedule = readBillingRateSchedule(
      JSON.stringify({
        classes: [
          { id: 'expert', label: 'Expert Witness', rate: 450, active: true, builtIn: false },
          { id: 'ks_attorney_sr', label: 'KS Sr', rate: 400, active: false, builtIn: false },
          { id: 'broken', label: '', rate: -1 },
        ],
        defaults: { 'u-1': 'expert', 'u-2': 'gone', 'u-3': 7 },
      }),
    )
    expect(schedule.savedClasses).toBe(true)
    expect(schedule.classes[0]).toEqual({ id: 'ks_attorney_sr', label: 'KS Sr', rate: 400, active: false, builtIn: true })
    expect(schedule.classes.map((item) => item.id)).toEqual(['ks_attorney_sr', 'ks_attorney_jr', 'tx_attorney_sr', 'tx_attorney_jr', 'ks_paralegal', 'tx_paralegal', 'expert'])
    expect(schedule.defaults).toEqual({ 'u-1': 'expert' })
  })
})

describe('billingRateProblems and ids', () => {
  it('refuses a missing built-in class, a repeated or empty name', () => {
    expect(billingRateProblems(BUILT_IN_BILLING_RATE_CLASSES)).toEqual([])
    expect(billingRateProblems(BUILT_IN_BILLING_RATE_CLASSES.slice(1))).toEqual(['KS Attorney Rate Sr is built in and cannot be removed (turn it off instead).'])
    expect(billingRateProblems([...BUILT_IN_BILLING_RATE_CLASSES, { id: 'x', label: ' ', rate: 1 }])).toEqual(['Every class needs a name.'])
    expect(billingRateProblems([...BUILT_IN_BILLING_RATE_CLASSES, { id: 'x', label: 'tx paralegal rate', rate: 1 }])).toEqual(['Two classes are named "tx paralegal rate".'])
  })

  it('makes an id from the name, clear of the others, and a list label', () => {
    expect(billingRateClassIdFor('Expert Witness Rate', [])).toBe('expert_witness_rate')
    expect(billingRateClassIdFor('Expert Witness Rate', ['expert_witness_rate'])).toBe('expert_witness_rate_2')
    expect(billingRateClassIdFor('!!!', [])).toBe('rate_class')
    expect(billingRateClassLabel({ label: 'KS Paralegal Rate', rate: 100 })).toBe('KS Paralegal Rate · $100.00')
  })
})
