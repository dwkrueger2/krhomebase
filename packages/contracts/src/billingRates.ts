// file: packages/contracts/src/billingRates.ts
/**
 * Billing rate classes (FB-0008, the requester, Nov 17, 2026; repository patch 59). The firm's list of hourly fee
 * classes, and each person's default class, which fills the rate of a new time entry.
 *
 *   GET /v1/firm/billing-rates   the classes (every signed-in person may read them)
 *   PUT /v1/firm/billing-rates   save the classes (super admin)
 *   PUT /v1/users/{userId}       `defaultRateClassId` sets a person's default (super admin; Users, Individual tab)
 *
 * Stored in one settings row of the `lookup` table, `lk_kr_billing_rate_classes` (category `kr_billing_rate_classes`;
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table"); no migration. Its `description` holds
 * `{ schema, classes, defaults }`, where `defaults` maps a user id to a class id. The classes and the defaults are
 * written by separate saves, each changing only its own part of the JSON (`json_set`), so neither overwrites the other.
 *
 * Six classes are built in: they always exist, may change name and rate, and may be turned off, but not removed. A
 * class's rate fills new entries only: every time entry keeps the rate it was saved with.
 */

import { z } from 'zod'

export const BILLING_RATES_SCHEMA_VERSION = 'kr-billing-rates-v1'

/** A class id: lower-case letters, digits and underscores. */
export const BillingRateClassId = z
  .string()
  .regex(/^[a-z0-9_]{1,40}$/, 'A class id is 1 to 40 lower-case letters, digits or underscores.')
  .describe('The class id, for example ks_attorney_sr.')

export const BillingRateClass = z.object({
  id: BillingRateClassId,
  label: z.string().trim().min(1).max(60).describe('The name shown in the lists, for example "KS Attorney Rate Sr".'),
  rate: z.number().min(0).max(100000).describe('Dollars an hour.'),
  active: z.boolean().describe('False: kept, but not offered for new entries.'),
  builtIn: z.boolean().describe('One of the six built-in classes: may be renamed, repriced and turned off, never removed.'),
})
export type BillingRateClass = z.infer<typeof BillingRateClass>

/** The six built-in classes (the requester, Nov 17, 2026). */
export const BUILT_IN_BILLING_RATE_CLASSES: readonly BillingRateClass[] = [
  { id: 'ks_attorney_sr', label: 'KS Attorney Rate Sr', rate: 380, active: true, builtIn: true },
  { id: 'ks_attorney_jr', label: 'KS Attorney Rate Jr', rate: 225, active: true, builtIn: true },
  { id: 'tx_attorney_sr', label: 'TX Attorney Rate Sr', rate: 380, active: true, builtIn: true },
  { id: 'tx_attorney_jr', label: 'TX Attorney Rate Jr', rate: 225, active: true, builtIn: true },
  { id: 'ks_paralegal', label: 'KS Paralegal Rate', rate: 100, active: true, builtIn: true },
  { id: 'tx_paralegal', label: 'TX Paralegal Rate', rate: 100, active: true, builtIn: true },
]

/** The most classes the firm keeps. */
export const BILLING_RATE_CLASSES_MAX = 40

export const BillingRatesData = z.object({
  classes: z.array(BillingRateClass).describe('Every class, built-in first, then the firm\'s own, as saved.'),
  saved: z.boolean().describe('False until the classes are saved once (the built-in classes are shown).'),
  updatedAt: z.string().nullable().describe('When the settings row last changed.'),
  canEdit: z.boolean().describe('The viewer may save (super admin).'),
})
export type BillingRatesData = z.infer<typeof BillingRatesData>

export const BillingRatesBody = z.object({
  classes: z.array(BillingRateClass).max(BILLING_RATE_CLASSES_MAX).describe('Every class. The built-in ones must all be there.'),
})
export type BillingRatesBody = z.infer<typeof BillingRatesBody>

/** What the settings row holds, read leniently. */
export interface BillingRateSchedule {
  classes: BillingRateClass[]
  /** User id to class id. */
  defaults: Record<string, string>
  /** True when the row held its own class list. */
  savedClasses: boolean
}

/**
 * Reads the settings row's JSON: the stored classes (any built-in class missing is added back, as built in), or the
 * built-in classes when none are stored; and the defaults. Anything unreadable is left out, never an error.
 */
export function readBillingRateSchedule(json: string | null | undefined): BillingRateSchedule {
  let parsed: unknown = null
  try {
    parsed = json ? JSON.parse(json) : null
  } catch {
    parsed = null
  }
  const stored = (parsed && typeof parsed === 'object' ? parsed : {}) as { classes?: unknown; defaults?: unknown }
  const savedClasses = Array.isArray(stored.classes)
  const classes: BillingRateClass[] = []
  for (const item of savedClasses ? (stored.classes as unknown[]) : []) {
    const one = BillingRateClass.safeParse(item)
    if (one.success && !classes.some((known) => known.id === one.data.id)) classes.push(one.data)
  }
  for (const builtIn of BUILT_IN_BILLING_RATE_CLASSES) {
    const found = classes.find((known) => known.id === builtIn.id)
    if (found) found.builtIn = true
    else classes.push({ ...builtIn })
  }
  // Built-in classes first, in their own order; then the firm's own, as saved.
  const order = (item: BillingRateClass) => {
    const index = BUILT_IN_BILLING_RATE_CLASSES.findIndex((builtIn) => builtIn.id === item.id)
    return index === -1 ? BUILT_IN_BILLING_RATE_CLASSES.length : index
  }
  const sorted = classes.map((item, index) => ({ item, index })).sort((a, b) => order(a.item) - order(b.item) || a.index - b.index).map(({ item }) => item)
  const defaults: Record<string, string> = {}
  if (stored.defaults && typeof stored.defaults === 'object' && !Array.isArray(stored.defaults)) {
    for (const [userId, classId] of Object.entries(stored.defaults as Record<string, unknown>)) {
      if (typeof classId === 'string' && sorted.some((item) => item.id === classId)) defaults[userId] = classId
    }
  }
  return { classes: sorted, defaults, savedClasses }
}

/**
 * Why a class list cannot be saved, in plain sentences (empty when it can). Shared by the screen and the API.
 */
export function billingRateProblems(classes: readonly Pick<BillingRateClass, 'id' | 'label' | 'rate'>[]): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  const labels = new Set<string>()
  for (const item of classes) {
    const label = item.label.trim()
    if (!label) problems.push('Every class needs a name.')
    else if (labels.has(label.toLowerCase())) problems.push(`Two classes are named "${label}".`)
    labels.add(label.toLowerCase())
    if (ids.has(item.id)) problems.push(`Two classes have the id "${item.id}".`)
    ids.add(item.id)
    if (!Number.isFinite(item.rate) || item.rate < 0) problems.push(`${label || 'A class'} needs a rate of $0 or more.`)
  }
  for (const builtIn of BUILT_IN_BILLING_RATE_CLASSES) {
    if (!ids.has(builtIn.id)) problems.push(`${builtIn.label} is built in and cannot be removed (turn it off instead).`)
  }
  if (classes.length > BILLING_RATE_CLASSES_MAX) problems.push(`At most ${BILLING_RATE_CLASSES_MAX} classes.`)
  return [...new Set(problems)]
}

/** A new class's id from its name: "Expert Witness Rate" becomes `expert_witness_rate` (with a number when taken). */
export function billingRateClassIdFor(label: string, taken: readonly string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34) || 'rate_class'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`
  return id
}

/** How a class reads in a list: "KS Attorney Rate Sr · $380.00". */
export function billingRateClassLabel(item: Pick<BillingRateClass, 'label' | 'rate'>): string {
  return `${item.label} · $${item.rate.toFixed(2)}`
}
