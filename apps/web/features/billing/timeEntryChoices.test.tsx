// file: apps/web/features/billing/timeEntryChoices.test.tsx
// FB-0007 and FB-0008: the category list, the rate classes and the decimals, and how the time entry dialog starts.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_BILLING_RATE_CLASSES } from '@krhomebase/contracts'
import EditTimeAndFeeDialog from './components/EditTimeAndFeeDialog.client'
import {
  CATEGORY_PROBLEM,
  categoryChoiceOf,
  categoryProblem,
  categoryValue,
  CUSTOM_RATE,
  defaultRateClass,
  formatHours,
  formatRate,
  rateChoiceFor,
  startingStaff,
  TYPE_OWN_CATEGORY,
} from './timeEntryChoices'

const classes = BUILT_IN_BILLING_RATE_CLASSES
const staff = [
  { id: 'u-sam', label: 'SS - Sam Staffer', defaultRateClassId: 'ks_paralegal' },
  { id: 'u-amy', label: 'AA - Amy Attorney', defaultRateClassId: 'tx_attorney_sr' },
  { id: 'u-new', label: 'Nan New', defaultRateClassId: null },
]

describe('activity category', () => {
  it('opens a known category in the list and other words as "Type your own"', () => {
    expect(categoryChoiceOf('review')).toBe('Review')
    expect(categoryChoiceOf('Witness prep')).toBe(TYPE_OWN_CATEGORY)
    expect(categoryChoiceOf('  ')).toBe('')
  })

  it('needs a chosen category or typed words', () => {
    expect(categoryProblem('', '')).toBe(CATEGORY_PROBLEM)
    expect(categoryProblem(TYPE_OWN_CATEGORY, '   ')).toBe(CATEGORY_PROBLEM)
    expect(categoryProblem(TYPE_OWN_CATEGORY, 'Witness prep')).toBeNull()
    expect(categoryValue('Drafting', 'ignored')).toBe('Drafting')
    expect(categoryValue(TYPE_OWN_CATEGORY, ' Witness prep ')).toBe('Witness prep')
  })
})

describe('hours and rate', () => {
  it('write out their decimals', () => {
    expect(formatHours(2)).toBe('2.0')
    expect(formatHours(0)).toBe('')
    expect(formatRate(380)).toBe('380.00')
    expect(formatRate(Number.NaN)).toBe('0.00')
  })

  it('start a new entry with the signed-in person and their default class', () => {
    expect(startingStaff(staff, 'u-amy')?.id).toBe('u-amy')
    expect(startingStaff(staff, 'u-elsewhere')?.id).toBe('u-sam')
    expect(defaultRateClass('u-amy', staff, classes)?.rate).toBe(380)
    expect(defaultRateClass('u-new', staff, classes)).toBeNull()
  })

  it('show a saved rate as the staff member\'s class first, another class with that rate, or Custom rate', () => {
    expect(rateChoiceFor(380, 'u-amy', staff, classes)).toBe('tx_attorney_sr')
    expect(rateChoiceFor(380, 'u-sam', staff, classes)).toBe('ks_attorney_sr')
    expect(rateChoiceFor(275, 'u-amy', staff, classes)).toBe(CUSTOM_RATE)
  })
})

describe('EditTimeAndFeeDialog', () => {
  const render = (viewerUserId: string) =>
    renderToStaticMarkup(
      <EditTimeAndFeeDialog
        billingRates={{ classes, viewerUserId }}
        matterNumbers={['501.0']}
        staffOptions={staff}
        onCancel={() => {}}
        onSave={async () => {}}
      />,
    )

  it('starts a new entry with the signed-in person, their class and its rate, and Save Changes hidden', () => {
    const html = render('u-amy')
    expect(html).toMatch(/<option value="u-amy" selected="">AA - Amy Attorney<\/option>/)
    expect(html).toMatch(/<option value="tx_attorney_sr" selected="">TX Attorney Rate Sr · \$380\.00<\/option>/)
    expect(html).toContain('<option value="custom">Custom rate</option>')
    expect(html).toContain('<option value="type-own">Type your own</option>')
    expect(html).toContain('<option value="" selected="">Select a category</option>')
    expect(html).toMatch(/data-kr-action="edit-time-fee-save"[^>]*>Save Changes</)
    expect(html).toMatch(/class="[^"]*invisible[^"]*"[^>]*data-kr-action="edit-time-fee-save"/)
    // Nothing worked on yet: no red line.
    expect(html).not.toContain(CATEGORY_PROBLEM)
    expect(html).toContain('>Hours<')
    expect(html).toContain('Rate ($/hour)')
  })

  it('shows the rate box for a person without a default class', () => {
    expect(render('u-new')).toContain('data-kr-element="edit-time-fee-rate"')
  })
})
