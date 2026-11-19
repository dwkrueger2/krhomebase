// file: apps/web/features/billing/timeEntryChoices.ts
/**
 * The time entry dialog's choices, as pure functions (`EditTimeAndFeeDialog`, tests in `timeEntryChoices.test.ts`).
 *
 * - **Activity category (FB-0007, the requester, Nov 17, 2026).** A list, not a text box with suggestions: the browser's
 *   suggestions showed only entries matching what was already typed, so "Review" had to be deleted to see the others.
 *   The list ends with "Type your own", which opens a text box. A save needs a category from the list or typed words.
 *   A stored category that is not on the list opens as "Type your own" with its words.
 * - **Rate class (FB-0008).** The firm's billing rate classes (Firm Settings → Billing Rates) and "Custom rate". A new
 *   entry starts with its staff member's default class; changing the staff member moves to theirs until the person
 *   chooses a rate themselves. A saved entry keeps its rate: it shows the class with that rate (the staff member's
 *   default first), else Custom rate with the number.
 * - **Hours and rate show their decimals** once the field is left: 2 reads 2.0 hours, 380 reads 380.00 (FB-0007).
 */

import type { BillingRateClass } from '@krhomebase/contracts'

/** The activity categories offered, in order; "Type your own" follows them. */
export const ACTIVITY_CATEGORIES = ['Review', 'Drafting', 'Client communication', 'Accounting', 'Administration', 'General'] as const

/** The list value of "Type your own". */
export const TYPE_OWN_CATEGORY = 'type-own'

/** What the category list holds: nothing chosen, one of the categories, or "Type your own". */
export type CategoryChoice = '' | typeof TYPE_OWN_CATEGORY | (typeof ACTIVITY_CATEGORIES)[number]

/** The sentence shown in red while no category is chosen or typed. */
export const CATEGORY_PROBLEM = 'Select a category, or type your own.'

/** The list choice for a stored category: a known one (any letter case), "Type your own" for other words, else nothing. */
export function categoryChoiceOf(value: string): CategoryChoice {
  const text = value.trim()
  if (!text) return ''
  return ACTIVITY_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase()) ?? TYPE_OWN_CATEGORY
}

/** The category to save: the chosen one, the typed words for "Type your own", or empty. */
export function categoryValue(choice: CategoryChoice, ownWords: string): string {
  if (choice === TYPE_OWN_CATEGORY) return ownWords.trim()
  return choice
}

/** Why the category cannot be saved yet, or null when it can. */
export function categoryProblem(choice: CategoryChoice, ownWords: string): string | null {
  return categoryValue(choice, ownWords) ? null : CATEGORY_PROBLEM
}

/** Hours as shown once the field is left: one decimal (2 reads 2.0); nothing for zero. */
export function formatHours(hours: number): string {
  return Number.isFinite(hours) && hours > 0 ? hours.toFixed(1) : ''
}

/** A rate as shown once the field is left: two decimals (380 reads 380.00). */
export function formatRate(rate: number): string {
  return (Number.isFinite(rate) && rate >= 0 ? rate : 0).toFixed(2)
}

/** The list value of "Custom rate". */
export const CUSTOM_RATE = 'custom'

/** A staff choice as the dialog knows it. */
export interface RateStaffOption {
  id: string
  defaultRateClassId?: string | null
}

/** The staff member's default class, when it is one of the classes offered. */
export function defaultRateClass(staffId: string, staffOptions: readonly RateStaffOption[], classes: readonly BillingRateClass[]): BillingRateClass | null {
  const classId = staffOptions.find((option) => option.id === staffId)?.defaultRateClassId
  return (classId && classes.find((item) => item.id === classId)) || null
}

/**
 * The rate list's choice for a saved rate: the staff member's default class when its rate matches, else the first
 * class with that rate, else Custom rate.
 */
export function rateChoiceFor(rate: number, staffId: string, staffOptions: readonly RateStaffOption[], classes: readonly BillingRateClass[]): string {
  const own = defaultRateClass(staffId, staffOptions, classes)
  if (own && own.rate === rate) return own.id
  return classes.find((item) => item.rate === rate)?.id ?? CUSTOM_RATE
}

/** The staff member a new entry starts with: the signed-in person when they are on the list, else the first. */
export function startingStaff<T extends { id: string }>(staffOptions: readonly T[], viewerUserId: string | undefined): T | undefined {
  return staffOptions.find((option) => option.id === viewerUserId) ?? staffOptions[0]
}
