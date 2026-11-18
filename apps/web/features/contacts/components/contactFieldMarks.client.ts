'use client'
// file: apps/web/features/contacts/components/contactFieldMarks.client.ts
/**
 * The red mark on a contact editor field that a save was refused for (FB-0015, the requester, Nov 17, 2026: "if there
 * is a validation error, there is no UI indication of the error ... a red box or red lettering ... should be added").
 *
 * `ContactEditCard` provides the problems (`ContactFieldMarksContext`, filled by `ContactEditDialog` from
 * `contactSaveProblems.ts`); each field asks `useContactFieldMarks()(field)` for its classes: a red border and tint on
 * the input, red words on the label, `aria-invalid`, and the sentence as the input's tooltip. The sentence also shows
 * in the line under the card. A field with no problem gets empty classes, so it looks as before.
 */

import { createContext, useContext } from 'react'
import type { ContactFieldProblems } from '../contactSaveProblems'

/** The problems of the open editor, by field of the save body. */
export const ContactFieldMarksContext = createContext<ContactFieldProblems>({})

/** The marks, added after a field's own classes. `!` wins over the field's own border and background. */
const STYLES = {
  input: 'border-(--kr-theme-danger)! bg-[color-mix(in_srgb,var(--kr-theme-danger)_7%,var(--kr-theme-card-surface))]!',
  label: 'text-(color:--kr-theme-danger)!',
} as const

/** What a field adds when it holds a problem. */
export interface ContactFieldMark {
  /** Added to the input's `className`. */
  input: string
  /** Added to the label's `className` (the label text turns red). */
  label: string
  /** Spread on the input: `aria-invalid` and the sentence as `title`. */
  props: { 'aria-invalid'?: true; title?: string }
}

const NO_MARK: ContactFieldMark = { input: '', label: '', props: {} }

/** The mark of one field, read from the problems directly (for the card itself, which provides the context). */
export function contactFieldMark(problems: ContactFieldProblems, field: keyof ContactFieldProblems): ContactFieldMark {
  const problem = problems[field]
  return problem ? { input: STYLES.input, label: STYLES.label, props: { 'aria-invalid': true, title: problem } } : NO_MARK
}

/** @returns A function giving the mark of one field of the save body, from the card's context. */
export function useContactFieldMarks(): (field: keyof ContactFieldProblems) => ContactFieldMark {
  const problems = useContext(ContactFieldMarksContext)
  return (field) => contactFieldMark(problems, field)
}
