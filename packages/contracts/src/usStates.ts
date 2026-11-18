// file: packages/contracts/src/usStates.ts
/**
 * United States state codes (FB-0015, the requester, Nov 17, 2026).
 *
 * The contact save takes an address state (`state`) and a business's state of formation (`stateOfFormation`) as two
 * letters (`ContactUpdateBody` in `contactEdits.ts`). Contacts seeded from the old card details file hold full names
 * ("Texas", "Kansas") and one written as "[KS]", so every save of those contacts was refused with
 * `VALIDATION_FAILED`, whatever field the person changed. `usStateCode` reads those forms back as the two-letter code;
 * the contact editor uses it when it opens and before it saves, and migration 001 repairs the stored rows.
 *
 * The list is the 50 states, the District of Columbia and the five inhabited territories.
 */

/** The two-letter code and the full name of each state, the District of Columbia and the territories. */
export const US_STATES: ReadonlyArray<{ readonly code: string; readonly name: string }> = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'GU', name: 'Guam' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
]

/** Upper-case letters and single spaces only: "[KS]" and " texas " both become the plain words. */
function plainWords(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CODE_BY_WORDS = new Map<string, string>([
  ...US_STATES.map((state) => [state.code, state.code] as [string, string]),
  ...US_STATES.map((state) => [plainWords(state.name), state.code] as [string, string]),
  ['VIRGIN ISLANDS', 'VI'],
  ['US VIRGIN ISLANDS', 'VI'],
])

/**
 * Reads a stored or typed state as its two-letter code.
 *
 * @param value - A code in any case ("tx"), a full name ("Texas", "new york") or a bracketed code ("[KS]").
 * @returns The code ("TX"); `''` when the value is empty; `null` when it is not a state this list knows.
 */
export function usStateCode(value: string | null | undefined): string | null {
  const words = plainWords(value ?? '')
  if (!words) return (value ?? '').trim() ? null : ''
  return CODE_BY_WORDS.get(words) ?? null
}
