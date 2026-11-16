// file: packages/documents/src/letterhead.ts
/**
 * Letterhead profiles for printed billing documents; every office with an address prints, the badge names the
 * leading office.
 *
 * Replaces the old `KR-Billing/Invoicing/firmProfiles.ts` (part 7a of `docs/API/Billing_Audit.md`, decision B5, the
 * requester, Nov 15, 2026). The old file wrote both offices, the tagline, website and licensing sentence into the
 * code, with one profile for each of two fixed offices (`TX` McKinney first, `KS` Pratt first). They now come from
 * the firm profile settings row (`lk_kr_firm_locations_profile`, `FirmProfile` in `@krhomebase/contracts`), so a new
 * or moved office needs no deploy.
 *
 * How the old letterhead maps onto the profile:
 *  - firm name, legal name, tagline, website, licensing sentence: the profile's `firmName`, `legalName`, `tagline`,
 *    `website`, `licensingSentence`;
 *  - the offices: every location with an address (a city or a first address line), the leading office first and the
 *    others in the profile's order (the old pair printed both, the badged office first);
 *  - the badge: the leading office's `badgeLabel`, else the full name of its state ("Texas");
 *  - the checks office: the leading office ("McKinney, TX"), as each old profile named its own office;
 *  - the leading office: the one the caller names (the print page's Letterhead choice), else the primary office.
 */

import type { FirmLocation, FirmProfile } from '@krhomebase/contracts'
import type { LetterheadOffice, LetterheadProfile } from './types.ts'

/** Full state names for the letterhead badge when an office has no `badgeLabel`. */
export const US_STATE_NAMES: Readonly<Record<string, string>> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

/** The badge text for an office: its own `badgeLabel`, else its state's full name, else the state as written. */
export function officeBadge(location: Pick<FirmLocation, 'badgeLabel' | 'state'>): string {
  const state = location.state.trim().toUpperCase()
  const rVal = location.badgeLabel.trim() || US_STATE_NAMES[state] || state
  return rVal
}

/** A ten-digit phone in the letterhead's dotted form ("972.688.6760"); anything else prints as typed. */
export function formatLetterheadPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  const rVal = ten.length === 10 ? `${ten.slice(0, 3)}.${ten.slice(3, 6)}.${ten.slice(6)}` : phone.trim()
  return rVal
}

/** True when a location has enough of an address to print on the letterhead. */
export function isLetterheadOffice(location: FirmLocation): boolean {
  const rVal = Boolean(location.city.trim() || location.addressLine1.trim())
  return rVal
}

/** One office line: "MCKINNEY, TX", the address on one line, the dotted phone. */
export function letterheadOffice(location: FirmLocation): LetterheadOffice {
  const city = location.city.trim()
  const state = location.state.trim().toUpperCase()
  const cityLine = [city ? `${city}, ${state}`.replace(/, $/, '') : state, location.postalCode.trim()].filter(Boolean).join(' ')
  const rVal: LetterheadOffice = {
    cityState: city ? [city.toUpperCase(), state].filter(Boolean).join(', ') : state,
    address: [location.addressLine1.trim(), location.addressLine2.trim(), cityLine].filter(Boolean).join(', '),
    phone: formatLetterheadPhone(location.phone),
  }
  return rVal
}

/** The office the letterhead leads with: the one asked for when it can print, else the primary, else the first that can print. */
export function leadingOffice(profile: FirmProfile, officeId?: string | null): FirmLocation | null {
  const printable = profile.locations.filter(isLetterheadOffice)
  const rVal =
    printable.find((location) => location.id === officeId) ??
    printable.find((location) => location.isPrimary) ??
    printable[0] ??
    profile.locations.find((location) => location.isPrimary) ??
    profile.locations[0] ??
    null
  return rVal
}

/** The Letterhead choices for the print page's toolbar: one per office that can print, labeled with its badge. */
export function letterheadChoices(profile: FirmProfile): Array<{ officeId: string; label: string }> {
  const rVal = profile.locations.filter(isLetterheadOffice).map((location) => ({ officeId: location.id, label: officeBadge(location) }))
  return rVal
}

/**
 * Builds the letterhead for a document from the firm profile.
 *
 * @param profile The firm profile (`GET /v1/firm/profile`, or the API's own read of the settings row).
 * @param officeId The office to lead with; left out or unknown, the primary office.
 * @returns The letterhead the templates print.
 */
export function buildLetterhead(profile: FirmProfile, officeId?: string | null): LetterheadProfile {
  const lead = leadingOffice(profile, officeId)
  const others = profile.locations.filter((location) => location !== lead && isLetterheadOffice(location))
  const offices = [...(lead && isLetterheadOffice(lead) ? [lead] : []), ...others].map(letterheadOffice)
  const leadCity = lead?.city.trim() ?? ''
  const leadState = lead?.state.trim().toUpperCase() ?? ''
  const rVal: LetterheadProfile = {
    officeId: lead?.id ?? '',
    state: leadState,
    stateName: lead ? officeBadge(lead) : '',
    firmName: profile.firmName,
    legalName: profile.legalName || profile.firmName,
    tagline: profile.tagline,
    offices,
    website: profile.website,
    checksOffice: [leadCity, leadState].filter(Boolean).join(', '),
    licensedIn: profile.licensingSentence,
  }
  return rVal
}
