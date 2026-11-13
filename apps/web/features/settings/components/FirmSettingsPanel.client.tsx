'use client'
// file: apps/web/features/settings/components/FirmSettingsPanel.client.tsx
/**
 * Firm Settings (menu id `firm-settings`; plan `docs/08_Settings_Dashboard_Plan.md`, stage 1): the firm itself.
 * Pages, in tab order (`FIRM_SETTINGS_PAGES`): Firm Profile, Employee Policies and Employee Documents (moved here
 * from Application Settings) for everyone, then the three IT pages for a super admin only: Data Import, GPT Model
 * Gateway and Stripe Payment Configuration. The address parameter is `?firmSettingsSection=`, with the old app's
 * values; the old `stripe-dev-tests` still opens the Stripe page.
 *
 * Stage 1 built the frame; a page shows its placeholder until its stage builds it. `app/page.tsx` passes the built
 * pages: Firm Profile and Employee Policies (stage 5, the firm feature), Employee Documents (stage 5, the
 * employee-documents feature) Stripe Payment Configuration (stage 6, the
 * payment-providers feature), GPT Model Gateway (stage 7, the gpt feature) and Data Import (stage 8, the data-import
 * feature). `isSuperAdmin` comes from the session and
 * only hides the IT pages.
 *
 * Users (the requester, Nov 12, 2026, D7; moved here from Application Settings): the `users` page opens one user
 * through `EditTargetContext` (`components/ui/editTarget.client.ts`); that adds an "Edit Employee" or "Edit User"
 * tab beside Users (`EDIT_USER_PAGE`), drawn by the `userEdit` page, and shows it. Closing it removes the tab and
 * returns to Users. The open user is remembered for this browser tab (`sessionStorage`), so a refresh keeps the tab.
 *
 * @param props - Whether the signed-in person is a super admin, and the built pages.
 * @returns The Firm Settings area (`data-kr-id="FirmSettingsPanel"`).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EditTargetContext, type EditTargetControls } from '@/components/ui/editTarget.client'
import SettingsAreaFrame from '@/features/settings/components/SettingsAreaFrame.client'
import { EDIT_USER_PAGE, FIRM_SETTINGS_ALIASES, FIRM_SETTINGS_PAGES, visibleSettingsPages, type FirmSettingsPageId } from '@/features/settings/settingsAreas'

/** The user open in the Edit tab: the list row's key (user id, or `invite:<id>`) and the tab's words. */
export interface EditUserTarget {
  key: string
  label: 'Edit Employee' | 'Edit User'
}

const EDIT_TARGET_STORAGE_KEY = 'kr-homebase:firm-settings-edit-user'

function readStoredTarget(): EditUserTarget | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(EDIT_TARGET_STORAGE_KEY) ?? 'null') as EditUserTarget | null
    return parsed && typeof parsed.key === 'string' && (parsed.label === 'Edit Employee' || parsed.label === 'Edit User') ? parsed : null
  } catch {
    return null
  }
}

function storeTarget(target: EditUserTarget | null) {
  try {
    if (target) window.sessionStorage.setItem(EDIT_TARGET_STORAGE_KEY, JSON.stringify(target))
    else window.sessionStorage.removeItem(EDIT_TARGET_STORAGE_KEY)
  } catch {
    // Storage unavailable: the Edit tab is simply not kept across a refresh.
  }
}

export interface FirmSettingsPanelProps {
  /** True for a super admin: shows Users and the three IT pages. */
  isSuperAdmin?: boolean
  /** The Firm Profile page (stage 5). */
  profile?: ReactNode
  /** The Employee Policies page (stage 5). */
  employeePolicies?: ReactNode
  /** The Employee Documents page (stage 5). */
  employeeDocuments?: ReactNode
  /** The Users page (super admin); it opens a user through `EditTargetContext`. */
  users?: ReactNode
  /** The Edit Employee / Edit User page; it reads the open user from `EditTargetContext`. */
  userEdit?: ReactNode
  /** The Data Import page (stage 8; super admin). */
  dataManagement?: ReactNode
  /** The GPT Model Gateway page (stage 7; super admin). */
  gptModelGateway?: ReactNode
  /** The Stripe Payment Configuration page (stage 6; super admin). */
  stripePaymentConfiguration?: ReactNode
}

export default function FirmSettingsPanel({
  isSuperAdmin = false,
  profile,
  employeePolicies,
  employeeDocuments,
  users,
  userEdit,
  dataManagement,
  gptModelGateway,
  stripePaymentConfiguration,
}: FirmSettingsPanelProps) {
  const [editTarget, setEditTarget] = useState<EditUserTarget | null>(null)
  const [focusPage, setFocusPage] = useState<{ id: FirmSettingsPageId; nonce: number } | null>(null)

  // A refresh keeps the Edit tab that was open in this browser tab.
  useEffect(() => {
    if (!isSuperAdmin || !userEdit) return
    const stored = readStoredTarget()
    setEditTarget(stored)
    if (stored && new URLSearchParams(window.location.search).get('firmSettingsSection') === 'edit-user') setFocusPage({ id: 'edit-user', nonce: Date.now() })
    // Only on the first draw: `userEdit` is a new element on every draw of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin])

  const pages = useMemo(() => {
    const visible = visibleSettingsPages(FIRM_SETTINGS_PAGES, isSuperAdmin)
    if (!editTarget || !userEdit) return visible
    const at = visible.findIndex((page) => page.id === 'users')
    const editPage = { ...EDIT_USER_PAGE, label: editTarget.label }
    return [...visible.slice(0, at + 1), editPage, ...visible.slice(at + 1)]
    // `userEdit` only matters as present or absent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget, isSuperAdmin, Boolean(userEdit)])

  const controls = useMemo<EditTargetControls>(
    () => ({
      target: editTarget,
      open: (target) => {
        const next: EditUserTarget = { key: target.key, label: target.label === 'Edit Employee' ? 'Edit Employee' : 'Edit User' }
        setEditTarget(next)
        storeTarget(next)
        setFocusPage({ id: 'edit-user', nonce: Date.now() })
      },
      close: () => {
        setEditTarget(null)
        storeTarget(null)
        setFocusPage({ id: 'users', nonce: Date.now() })
      },
    }),
    [editTarget],
  )

  const builtPages: Partial<Record<FirmSettingsPageId, ReactNode>> = {}
  if (profile) builtPages.profile = profile
  if (employeePolicies) builtPages['employee-policies'] = employeePolicies
  if (employeeDocuments) builtPages['employee-documents'] = employeeDocuments
  if (users) builtPages.users = users
  if (editTarget && userEdit) builtPages['edit-user'] = userEdit
  if (dataManagement) builtPages['data-management'] = dataManagement
  if (gptModelGateway) builtPages['gpt-model-gateway'] = gptModelGateway
  if (stripePaymentConfiguration) builtPages['stripe-payment-configuration'] = stripePaymentConfiguration
  return (
    <EditTargetContext.Provider value={controls}>
      <SettingsAreaFrame aliases={FIRM_SETTINGS_ALIASES} ariaLabel="Firm Settings pages" builtPages={builtPages} focusPage={focusPage} krId="FirmSettingsPanel" pages={pages} />
    </EditTargetContext.Provider>
  )
}
