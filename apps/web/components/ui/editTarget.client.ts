'use client'
// file: apps/web/components/ui/editTarget.client.ts
/**
 * Two small contexts that let screens from different features work together without importing each other (the
 * requester's decision D7 of Nov 12, 2026: Firm Settings → Users opens a person in an "Edit Employee" / "Edit User"
 * tab). `app/page.tsx` is a server component and can pass only elements, not functions, so the links travel here:
 *
 * - `EditTargetContext`: which record an area has open for editing, and how to open or close it. Firm Settings
 *   provides it; the Users list opens a row with it, and the Edit page reads which row and closes the tab with it.
 * - `PersonSlotContext`: whose person record and employee record a slot shows. The Edit page provides it around the
 *   slots it was given (the contact summary card, the employee documents), and those read the ids from it.
 *
 * Shared because several features use it; it knows nothing about any feature.
 */

import { createContext, useContext } from 'react'

/** A record open for editing: its key and the words on its tab. */
export interface EditTarget {
  key: string
  label: string
}

export interface EditTargetControls {
  target: EditTarget | null
  open: (target: EditTarget) => void
  close: () => void
}

export const EditTargetContext = createContext<EditTargetControls | null>(null)

/** The nearest area's edit target and controls, or null outside one. */
export function useEditTarget(): EditTargetControls | null {
  return useContext(EditTargetContext)
}

/** Whose records a slot shows. */
export interface PersonSlot {
  individualId: string | null
  employeeId: string | null
}

export const PersonSlotContext = createContext<PersonSlot | null>(null)

/** The ids the surrounding screen gave this slot, or null outside one. */
export function usePersonSlot(): PersonSlot | null {
  return useContext(PersonSlotContext)
}
