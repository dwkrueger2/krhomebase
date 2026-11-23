'use client'
// file: apps/web/features/contacts/components/RelatedContactRemoveDialog.client.tsx
/**
 * Asks how to remove a related person from a contact's Related Contacts (FB-0023, the requester, Nov 23, 2026, web
 * patch 585). Two people share one relationship, shown on both lists, so the x on a saved related person asks:
 *
 * 1. **Both sides (recommended)**: Ann leaves Bob's list and Bob leaves Ann's (the relationship ends).
 * 2. **Only Bob's list**: Ann leaves Bob's list; Bob stays on Ann's (only Bob's direction is marked removed; it can be
 *    removed from Ann's list later).
 * 3. **Cancel**: nothing changes.
 *
 * The names are the real people's. The choice changes the editor's draft only; Save sends it. Drawn with the shared
 * `U6ConfirmationDialog` (the User-Response Dialog Standard).
 */

import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import type { KRRelatedContact } from '../types'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  list: 'm-0 pl-[16px] text-[12px] leading-[1.35] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  list: 'mt-[6px] gap-[3px] grid list-decimal',
} as const

/** Props for the related contact removal question. */
export interface RelatedContactRemoveDialogProps {
  /** The person being edited (whose list the x was pressed on). */
  currentName: string
  /** The related person being removed; null keeps the dialog closed. */
  related: KRRelatedContact | null
  onCancel: () => void
  /** `hereOnly` true: remove from the current person's list only. */
  onChoose: (hereOnly: boolean) => void
}

/** The words of the question, with the real names (shared with the tests). */
export function relatedRemovalWords(currentName: string, relatedName: string) {
  return {
    title: `Remove ${relatedName}?`,
    description: `${relatedName} and ${currentName} are listed on each other's Related Contacts.`,
    both: 'Both sides (recommended)',
    bothDetail: `Remove ${relatedName} from ${currentName}'s list, and ${currentName} from ${relatedName}'s list.`,
    hereOnly: `Only ${currentName}'s list`,
    hereOnlyDetail: `Remove ${relatedName} from ${currentName}'s list, but leave ${currentName} on ${relatedName}'s list (it can be removed there later).`,
  }
}

/** The removal question; the parent owns which person is being removed. */
export default function RelatedContactRemoveDialog({ currentName, onCancel, onChoose, related }: RelatedContactRemoveDialogProps) {
  const words = relatedRemovalWords(currentName, related?.displayName ?? '')
  return (
    <U6ConfirmationDialog
      cancelLabel="Cancel"
      confirmLabel={words.both}
      description={words.description}
      open={Boolean(related)}
      secondaryLabel={words.hereOnly}
      title={words.title}
      onCancel={onCancel}
      onConfirm={() => onChoose(false)}
      onSecondary={() => onChoose(true)}
    >
      {/* The two choices spelled out with the real names. */}
      <ol className={`${LAYOUT_STYLES.list} ${STYLES.list}`} data-kr-element="related-contact-remove-choices">
        <li>
          <strong>{words.both}</strong>: {words.bothDetail}
        </li>
        <li>
          <strong>{words.hereOnly}</strong>: {words.hereOnlyDetail}
        </li>
      </ol>
    </U6ConfirmationDialog>
  )
}
