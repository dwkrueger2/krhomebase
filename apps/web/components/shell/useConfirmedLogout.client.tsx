'use client'
// file: apps/web/components/shell/useConfirmedLogout.client.tsx
/**
 * The Log out button's question (web patch 566, the requester, Nov 17, 2026: "Ask in-app first"). Logging out is the
 * person's own choice, so it follows the Unsaved Changes Standard: when any screen on the page (pop-outs included)
 * holds unsaved work (`hasUnsavedWork`, `components/ui/unsavedChanges.client.ts`), the frame asks
 * "Leave without saving?" with Leave and Stay before it signs out. Leave runs `onLogout`, which signs out as a forced
 * leave (`forcedLeave.ts`), so the browser's own "Leave site?" box does not ask a second time.
 *
 * The forced sign-outs (maintenance, idle limit) do not come here; they never ask.
 *
 * `ApplicationShell` calls the hook and draws the returned dialog inside the frame (the dialog reads the theme tokens).
 */

import { useState, type ReactNode } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { hasUnsavedWork } from '@/components/ui/unsavedChanges.client'
import { L } from '@/lib/KRUtilities'

/**
 * Wraps the frame's log-out handler with the unsaved-work question.
 *
 * @param onLogout - The sign-out (`SignedInShell`), or undefined when the frame has no Log out button.
 * @param unsaved - Reads whether anything is unsaved (the tests pass their own).
 * @returns `request` for the button (undefined when there is no `onLogout`) and the dialog to draw.
 */
export function useConfirmedLogout(onLogout: (() => void) | undefined, unsaved: () => boolean = hasUnsavedWork): { request: (() => void) | undefined; dialog: ReactNode } {
  const [asking, setAsking] = useState(false)

  const request = onLogout
    ? (): void => {
        if (!unsaved()) {
          onLogout()
          return
        }
        L('[CONFIRMED_LOGOUT:36] unsaved work on the page; asking before log out')
        setAsking(true)
      }
    : undefined

  const dialog = (
    // Log out with unsaved work: the Unsaved Changes Standard's question
    <U6ConfirmationDialog
      open={asking}
      title="Leave without saving?"
      description="Something on this page has changes that are not saved. If you log out now, those changes are lost."
      confirmLabel="Leave"
      cancelLabel="Stay"
      onCancel={() => setAsking(false)}
      onConfirm={() => {
        setAsking(false)
        onLogout?.()
      }}
    />
  )

  return { request, dialog }
}
