'use client'
// file: apps/web/features/role-sets/components/RoleSetsCard.client.tsx
/**
 * Application Settings → Role Sets (Settings plan, stage 4c; super admin only). Ported from the old Role Sets tab of
 * `ApplicationSettingsSection.client.tsx`: the list of role sets, and for the chosen one its name, description and
 * Resource · Scope · CRUD grants. Built-in role sets are read-only; custom ones are edited here and given to people
 * from Users and Invites.
 *
 * Kept from the old tab: New Custom Role Set, Copy Existing Role Set (merges the chosen role sets' grants into the
 * draft; nothing is saved until Save), the "Role Set Name in use." warning beside the name, protected grants greyed
 * out (Role Sets, Firm Details, Data Management, and deleting users, invoices, payments and writeoffs), and the
 * role set id under the grid.
 *
 * Changed from the old tab:
 * - New Custom Role Set starts an unsaved draft; the old button saved a "New Custom Role Set" row at once.
 * - Leaving a changed draft asks in `U6ConfirmationDialog` (the old tab used `window.confirm`), and Revert puts back
 *   the saved role set.
 * - Retire role set (custom only) asks first, naming how many people lose it; the old API could retire, the old
 *   screen had no button.
 * - The list shows how many people hold each role set, and is drawn in the Density Contract's record rows
 *   (`data-kr-id="roles-set-definitions"`): a pencil in the first column for each custom role set, so it is never
 *   scrolled out of reach, and Grants and People centered (the requester, Nov 12, 2026).
 * - Under the list, the people who hold the chosen role set (name, email, status; read from `GET /v1/users`).
 *
 * @returns The Role Sets card (`data-kr-id="role-sets-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import { isProtectedPermission, type RoleSet, type RoleSetAction, type UserAccount } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import PermissionMatrix, { permissionKeyOf, permissionMatrixRows, type PermissionMatrixRow } from '@/components/tables/PermissionMatrix.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { fetchRoleSetHolders, fetchRoleSets, retireRoleSet, saveRoleSet } from '@/features/role-sets/api.client'

const LAYOUT_STYLES = {
  body: 'gap-[8px] grid grid-cols-1 lg:grid-cols-[minmax(280px,400px)_minmax(0,1fr)] items-start',
  leftColumn: 'gap-[6px] grid grid-cols-[minmax(0,1fr)] min-w-0',
  listScroller: 'max-h-[560px] overflow-auto',
  holdersScroller: 'max-h-[300px] overflow-auto',
  holdersHead: 'px-[3px] py-[1px] gap-[6px] flex items-baseline justify-between',
  editor: 'gap-[6px] grid min-w-0',
  fieldRow: 'gap-x-[3px] gap-y-[2px] grid grid-cols-1 md:grid-cols-[84px_minmax(0,1fr)] items-center',
  nameRow: 'gap-[3px] flex flex-wrap items-center',
  footer: 'gap-[6px] flex flex-wrap items-center justify-between',
  actions: 'gap-[6px] flex flex-wrap items-center',
  copyList: 'mt-[6px] max-h-[260px] overflow-y-auto',
  copyOption: 'px-[4px] py-[1px] gap-[4px] flex items-center',
} as const

const STYLES = {
  list: 'rounded-[2px] border border-(--kr-theme-line)',
  table: 'w-full border-collapse text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  thText: 'text-left',
  thNumber: 'text-center',
  thEdit: 'w-[22px]',
  row: 'cursor-pointer border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  rowSelected: 'bg-(--kr-theme-table-row-selected) font-semibold',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0',
  tdNumber: 'text-center tabular-nums',
  tdEdit: 'w-[22px] text-center',
  editButton:
    'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent align-middle text-(color:--kr-theme-brand-primary) hover:bg-(--kr-theme-muted-surface)',
  holdersHead: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  holdersTitle: 'm-0 text-[11px] font-extrabold uppercase tracking-[.06em] text-(color:--kr-theme-text-muted)',
  holdersCount: 'text-[11px] text-(color:--kr-theme-text-muted)',
  holderCell: 'max-w-[160px] truncate',
  empty: 'm-0 p-[3px] text-[12px] text-(color:--kr-theme-text-muted)',
  kind: 'text-(color:--kr-theme-text-muted)',
  label: 'whitespace-nowrap text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  nameField: 'w-[260px] max-w-full',
  fieldConflict: 'border-(--kr-theme-danger)',
  description: 'w-full resize-y',
  builtInName: 'text-[13px] font-[850] text-(color:--kr-theme-text)',
  readOnly: 'text-[12px] text-(color:--kr-theme-text-muted)',
  warning: 'text-[12px] font-semibold text-(color:--kr-theme-danger)',
  ghostButton:
    'gap-1 inline-flex min-h-[24px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary) hover:enabled:bg-(--kr-theme-brand-primary) hover:enabled:text-(color:--kr-theme-text-inverse)',
  dangerButton:
    'inline-flex min-h-[24px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-danger) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  footerText: 'text-[11px] text-(color:--kr-theme-text-muted)',
  code: 'font-mono text-[11px] text-(color:--kr-theme-text)',
  status: 'm-0 text-[12px] text-(color:--kr-theme-success)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  copyOption: 'cursor-pointer text-[13px] text-(color:--kr-theme-text)',
  copyKind: 'text-[11px] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const NEW = '__new__'

/** What the editor holds for one role set; grant lists are kept sorted. */
export interface RoleSetDraft {
  name: string
  description: string
  permissions: string[]
  scopedPermissions: string[]
}

export const EMPTY_ROLE_SET_DRAFT: RoleSetDraft = { name: '', description: '', permissions: [], scopedPermissions: [] }

/** The editor's values for a saved role set. */
export function draftFromRoleSet(roleSet: RoleSet | undefined): RoleSetDraft {
  return roleSet
    ? { name: roleSet.label, description: roleSet.description ?? '', permissions: [...roleSet.permissions].sort(), scopedPermissions: [...roleSet.scopedPermissions].sort() }
    : EMPTY_ROLE_SET_DRAFT
}

/** True when two drafts would save the same role set (text trimmed). */
export function sameRoleSetDraft(a: RoleSetDraft, b: RoleSetDraft): boolean {
  const sameList = (x: string[], y: string[]) => x.length === y.length && x.every((key, index) => key === y[index])
  return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim() && sameList(a.permissions, b.permissions) && sameList(a.scopedPermissions, b.scopedPermissions)
}

/** A grant key is allowed in a custom role set unless it is protected. */
const allowedKey = (key: string) => {
  const [resource = '', action = ''] = key.split('.')
  return !isProtectedPermission(resource, action)
}

/** Adds the chosen role sets' grants to a draft, dropping protected ones (the old "Copy to Current Role Set"). */
export function mergeRoleSetGrants(draft: RoleSetDraft, sources: readonly RoleSet[]): RoleSetDraft {
  const merge = (current: string[], extra: string[]) => Array.from(new Set([...current, ...extra.filter(allowedKey)])).sort()
  return {
    ...draft,
    permissions: merge(draft.permissions, sources.flatMap((source) => source.permissions)),
    scopedPermissions: merge(draft.scopedPermissions, sources.flatMap((source) => source.scopedPermissions)),
  }
}

/** True when another active role set already has the name (case ignored), as the old warning checked. */
export function roleSetNameInUse(roleSets: readonly RoleSet[], name: string, exceptId: string | null): boolean {
  const key = name.trim().toLocaleLowerCase()
  return Boolean(key) && roleSets.some((roleSet) => roleSet.id !== exceptId && roleSet.label.trim().toLocaleLowerCase() === key)
}

/** The people who hold a role set now, by name. */
export function roleSetHolders(users: readonly UserAccount[], roleSetId: string): UserAccount[] {
  return users.filter((user) => user.roleSetIds.includes(roleSetId)).sort((a, b) => a.name.localeCompare(b.name))
}

const ACCOUNT_STATUS_LABEL: Record<UserAccount['accountStatus'], string> = { active: 'Active', pending: 'Pending', deactivated: 'Deactivated' }

export interface RoleSetsCardProps {
  /** Role sets for the first draw (tests); the card reads them itself when left out. */
  initialRoleSets?: RoleSet[]
  /** Users for the first draw of the holders list (tests); the card reads them itself when left out. */
  initialUsers?: UserAccount[]
}

export default function RoleSetsCard({ initialRoleSets, initialUsers }: RoleSetsCardProps) {
  const [roleSets, setRoleSets] = useState<RoleSet[] | null>(initialRoleSets ?? null)
  const [users, setUsers] = useState<UserAccount[] | null>(initialUsers ?? null)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>(initialRoleSets?.[0]?.id ?? NEW)
  const [draft, setDraft] = useState<RoleSetDraft>(draftFromRoleSet(initialRoleSets?.[0]))
  const [busy, setBusy] = useState(false)
  const [pendingChoice, setPendingChoice] = useState<string | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyChoice, setCopyChoice] = useState<string[]>([])
  const [retireOpen, setRetireOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Shows the reply's role sets and selects one (or the first). */
  function show(next: RoleSet[], roleSetId?: string) {
    const roleSet = next.find((row) => row.id === roleSetId) ?? next[0]
    setRoleSets(next)
    setSelectedId(roleSet?.id ?? NEW)
    setDraft(draftFromRoleSet(roleSet))
  }

  // Read the role sets once, unless the first draw was given them.
  useEffect(() => {
    if (initialRoleSets) return
    let live = true
    fetchRoleSets()
      .then((next) => live && show(next.roleSets))
      .catch((caught: unknown) => live && setError(caught instanceof Error ? caught.message : 'The role sets could not be read.'))
    return () => {
      live = false
    }
  }, [initialRoleSets])

  /** Reads the users again, for the holders list (after a save or a retire changes who holds what). */
  function loadUsers(): () => void {
    let live = true
    setUsersError(null)
    fetchRoleSetHolders()
      .then((next) => live && setUsers(next))
      .catch((caught: unknown) => live && setUsersError(caught instanceof Error ? caught.message : 'The people could not be read.'))
    return () => {
      live = false
    }
  }

  // Read the users once, for the holders list, unless the first draw was given them.
  useEffect(() => (initialUsers ? undefined : loadUsers()), [initialUsers])

  const saved = roleSets?.find((row) => row.id === selectedId)
  const isNew = selectedId === NEW
  const editable = isNew || saved?.isSystem === false
  const savedDraft = useMemo(() => draftFromRoleSet(saved), [saved])
  const dirty = editable && !sameRoleSetDraft(savedDraft, draft)
  const nameInUse = editable && roleSetNameInUse(roleSets ?? [], draft.name, saved?.id ?? null)
  const nameOk = draft.name.trim().length > 0 && draft.name.trim().length <= 120 && draft.description.trim().length <= 1000
  const canSave = roleSets !== null && dirty && nameOk && !nameInUse && !busy
  const rows = useMemo(() => permissionMatrixRows(draft.permissions, draft.scopedPermissions), [draft.permissions, draft.scopedPermissions])
  const holders = useMemo(() => (users && saved ? roleSetHolders(users, saved.id) : []), [users, saved])

  function choose(roleSetId: string) {
    setSelectedId(roleSetId)
    setDraft(draftFromRoleSet(roleSets?.find((row) => row.id === roleSetId)))
    setPendingChoice(null)
    setStatus(null)
    setError(null)
  }

  /** Switches at once, or asks first when the draft has changes. */
  function requestChoice(roleSetId: string) {
    if (roleSetId === selectedId && roleSetId !== NEW) return
    if (dirty) setPendingChoice(roleSetId)
    else choose(roleSetId)
  }

  function toggle(row: PermissionMatrixRow, action: RoleSetAction) {
    const key = permissionKeyOf(row, action)
    const list = row.scoped ? 'scopedPermissions' : 'permissions'
    setDraft((current) => ({ ...current, [list]: (current[list].includes(key) ? current[list].filter((value) => value !== key) : [...current[list], key]).sort() }))
    setStatus(null)
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const reply = await saveRoleSet(saved ? saved.id : null, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        permissions: draft.permissions,
        scopedPermissions: draft.scopedPermissions,
      })
      show(reply.roleSets, reply.roleSetId)
      setStatus(`Saved custom role set "${draft.name.trim()}".`)
      loadUsers()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The role set was not saved.')
    } finally {
      setBusy(false)
    }
  }

  async function retire(): Promise<void> {
    if (!saved) return
    setBusy(true)
    setError(null)
    try {
      const reply = await retireRoleSet(saved.id)
      show(reply.roleSets)
      setRetireOpen(false)
      loadUsers()
      setStatus(`Retired "${saved.label}". ${reply.assignmentsEnded === 1 ? 'One person no longer holds it.' : `${reply.assignmentsEnded} people no longer hold it.`}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The role set was not retired.')
    } finally {
      setBusy(false)
    }
  }

  function applyCopy() {
    setDraft((current) => mergeRoleSetGrants(current, (roleSets ?? []).filter((row) => copyChoice.includes(row.id))))
    setCopyOpen(false)
    setCopyChoice([])
  }

  const actions = (
    <div className={LAYOUT_STYLES.actions}>
      <button className={STYLES.ghostButton} data-kr-action="new-custom-role-set" disabled={busy || roleSets === null} onClick={() => requestChoice(NEW)} type="button">
        New custom role set
      </button>
      {dirty && saved ? (
        <button className={STYLES.ghostButton} data-kr-action="revert-role-set" disabled={busy} onClick={() => choose(saved.id)} type="button">
          Revert
        </button>
      ) : null}
      {editable ? (
        <SaveButton dataKrElement="save-role-set" disabledText="Save role set" onClick={() => void save()} state={busy ? 'Saving' : canSave ? 'Can Save' : 'Disabled'} text="Save role set" updatingText="Saving..." />
      ) : null}
    </div>
  )

  return (
    <KRModuleCard
      actions={actions}
      component="RoleSetsCard"
      krId="role-sets"
      note="Built-in role sets are read-only. Custom role sets may be given to one or more people from Users and Invites."
      title="Role Sets"
    >
      <div className={LAYOUT_STYLES.body} data-kr-element="role-sets-workspace">
        {/* Left column: the role set list, then the people who hold the chosen one */}
        <div className={LAYOUT_STYLES.leftColumn} data-kr-element="role-sets-left-column">
          {/* Role set list: edit pencil, name, kind, grant count and holders */}
          <div className={`${LAYOUT_STYLES.listScroller} ${STYLES.list}`} data-kr-element="role-set-list">
            <table className={STYLES.table} data-kr-id="roles-set-definitions">
              <thead>
                <tr>
                  <th aria-label="Edit" className={`${STYLES.th} ${STYLES.thEdit}`} />
                  <th className={`${STYLES.th} ${STYLES.thText}`}>Role set</th>
                  <th className={`${STYLES.th} ${STYLES.thText}`}>Kind</th>
                  <th className={`${STYLES.th} ${STYLES.thNumber}`} title="Grants">
                    Grants
                  </th>
                  <th className={`${STYLES.th} ${STYLES.thNumber}`} title="People who hold it">
                    People
                  </th>
                </tr>
              </thead>
              <tbody data-kr-element="rows-container">
                {(roleSets ?? []).map((roleSet) => (
                  <tr
                    aria-selected={roleSet.id === selectedId}
                    className={`${STYLES.row} ${roleSet.id === selectedId ? STYLES.rowSelected : ''}`}
                    data-kr-element="role-set-row"
                    data-kr-record-id={roleSet.id}
                    key={roleSet.id}
                    onClick={() => requestChoice(roleSet.id)}
                  >
                    <td className={`${STYLES.td} ${STYLES.tdEdit}`}>
                      {roleSet.isSystem ? null : (
                        <button
                          aria-label={`Edit role set: ${roleSet.label}`}
                          className={STYLES.editButton}
                          data-kr-action="edit-role-set"
                          onClick={(event) => {
                            event.stopPropagation()
                            requestChoice(roleSet.id)
                          }}
                          title="Edit role set"
                          type="button"
                        >
                          <KRHomebaseIcons.Pencil />
                        </button>
                      )}
                    </td>
                    <td className={STYLES.td}>{roleSet.label}</td>
                    <td className={`${STYLES.td} ${STYLES.kind}`}>{roleSet.isSystem ? 'Built in' : 'Custom'}</td>
                    <td className={`${STYLES.td} ${STYLES.tdNumber}`}>{roleSet.permissions.length + roleSet.scopedPermissions.length}</td>
                    <td className={`${STYLES.td} ${STYLES.tdNumber}`}>{roleSet.holderCount}</td>
                  </tr>
                ))}
                {isNew && roleSets ? (
                  <tr aria-selected className={`${STYLES.row} ${STYLES.rowSelected}`} data-kr-element="role-set-row-new">
                    <td className={`${STYLES.td} ${STYLES.tdEdit}`} />
                    <td className={STYLES.td}>{draft.name.trim() || 'New custom role set'} (not saved)</td>
                    <td className={`${STYLES.td} ${STYLES.kind}`}>Custom</td>
                    <td className={`${STYLES.td} ${STYLES.tdNumber}`}>{draft.permissions.length + draft.scopedPermissions.length}</td>
                    <td className={`${STYLES.td} ${STYLES.tdNumber}`}>0</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* The people who hold the chosen role set */}
          <section aria-label="People with this role set" className={STYLES.list} data-kr-id="role-set-holders">
            <div className={`${LAYOUT_STYLES.holdersHead} ${STYLES.holdersHead}`}>
              <h4 className={STYLES.holdersTitle}>People with {saved ? saved.label : 'this role set'}</h4>
              {users && saved ? <span className={STYLES.holdersCount}>{holders.length}</span> : null}
            </div>
            {usersError ? (
              <p className={STYLES.error}>{usersError}</p>
            ) : !saved ? (
              <p className={STYLES.empty}>Nobody yet: save the role set, then give it to people from Users.</p>
            ) : users === null ? (
              <div className={STYLES.empty}>
                <RainbowBusySpinner busy hideWhenIdle={false} label="Loading people..." size={16} />
              </div>
            ) : holders.length === 0 ? (
              <p className={STYLES.empty}>Nobody holds this role set.</p>
            ) : (
              <div className={LAYOUT_STYLES.holdersScroller}>
                <table className={STYLES.table} data-kr-element="role-set-holders-table">
                  <thead>
                    <tr>
                      <th className={`${STYLES.th} ${STYLES.thText}`}>Name</th>
                      <th className={`${STYLES.th} ${STYLES.thText}`}>Email</th>
                      <th className={`${STYLES.th} ${STYLES.thText}`}>Status</th>
                    </tr>
                  </thead>
                  <tbody data-kr-element="rows-container">
                    {holders.map((user) => (
                      <tr className={STYLES.row} data-kr-element="role-set-holder-row" data-kr-record-id={user.id} key={user.id}>
                        <td className={`${STYLES.td} ${STYLES.holderCell}`} title={user.name}>
                          {user.name}
                          {user.primaryRoleSetId === saved.id ? <span className={STYLES.kind}> (primary)</span> : null}
                        </td>
                        <td className={`${STYLES.td} ${STYLES.holderCell}`} title={user.email}>
                          {user.email}
                        </td>
                        <td className={`${STYLES.td} ${STYLES.kind}`}>{ACCOUNT_STATUS_LABEL[user.accountStatus]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* The chosen role set: name, description, grants and its id */}
        <section aria-label={editable ? 'Selected custom role set editor' : 'Selected built-in role permissions'} className={LAYOUT_STYLES.editor} data-kr-element="selected-role-card" data-kr-id="role-set-selected-card" data-kr-record-id={saved?.id ?? 'new'}>
          {editable ? (
            <>
              <div className={LAYOUT_STYLES.fieldRow} data-kr-element="role-set-name-row">
                <label className={STYLES.label} htmlFor="role-set-name">
                  Name
                </label>
                <span className={LAYOUT_STYLES.nameRow}>
                  <input
                    aria-describedby={nameInUse ? 'role-set-name-warning' : undefined}
                    aria-invalid={nameInUse}
                    aria-label="Custom role set name"
                    id="role-set-name"
                    className={`${STYLES.field} ${STYLES.nameField} ${nameInUse ? STYLES.fieldConflict : ''}`}
                    disabled={busy}
                    maxLength={120}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="New custom role set"
                    value={draft.name}
                  />
                  <button className={STYLES.ghostButton} data-kr-id="copy-existing-role-set-button" disabled={busy || !roleSets?.length} onClick={() => setCopyOpen(true)} type="button">
                    Copy existing role set
                  </button>
                  {nameInUse ? (
                    <span className={STYLES.warning} id="role-set-name-warning">
                      Role Set Name in use.
                    </span>
                  ) : null}
                </span>
              </div>
              <label className={LAYOUT_STYLES.fieldRow} data-kr-element="role-set-description-row">
                <span className={STYLES.label}>Description</span>
                <textarea
                  aria-label="Custom role set description"
                  className={`${STYLES.field} ${STYLES.description}`}
                  disabled={busy}
                  maxLength={1000}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What this role set is for"
                  rows={2}
                  value={draft.description}
                />
              </label>
            </>
          ) : saved ? (
            <div className={LAYOUT_STYLES.nameRow} data-kr-element="role-set-built-in-name">
              <span className={STYLES.builtInName}>{saved.label}</span>
              <span className={STYLES.readOnly}>· Built in, read-only{saved.description ? ` · ${saved.description}` : ''}</span>
            </div>
          ) : null}

          <PermissionMatrix
            description={editable ? 'Greyed-out grants are kept for the built-in Super Admin.' : 'Built-in role sets are read-only.'}
            editable={editable}
            isActionDisabled={(row, action) => busy || isProtectedPermission(row.resourceId, action)}
            krId="role-set-current-resource-permissions"
            onToggle={toggle}
            rows={rows}
          />

          {/* Id, holders and Retire */}
          <div className={LAYOUT_STYLES.footer}>
            <span className={STYLES.footerText}>
              {saved ? (
                <>
                  Role set id: <code className={STYLES.code}>{saved.id}</code> · {saved.holderCount === 1 ? '1 person holds it' : `${saved.holderCount} people hold it`}
                </>
              ) : (
                'Not saved yet. Custom role sets may create, read and update users, but cannot delete users or manage protected administration.'
              )}
            </span>
            {saved && !saved.isSystem ? (
              <button className={STYLES.dangerButton} data-kr-action="retire-role-set" disabled={busy} onClick={() => setRetireOpen(true)} type="button">
                Retire role set
              </button>
            ) : null}
          </div>
          {status ? <p className={STYLES.status}>{status}</p> : null}
          {error ? <p className={STYLES.error}>{error}</p> : null}
        </section>
      </div>

      {/* Leaving a changed draft */}
      <U6ConfirmationDialog
        confirmLabel="Discard changes"
        description="This custom role set has changes that are not saved. Discard them and view another role set?"
        onCancel={() => setPendingChoice(null)}
        onConfirm={() => pendingChoice && choose(pendingChoice)}
        open={pendingChoice !== null}
        title="Discard changes?"
      />

      {/* Copy Existing Role Set: merge grants into the draft */}
      <U6ConfirmationDialog
        confirmLabel="Copy to current role set"
        description="Choose one or more role sets. Their grants are added to this role set and are not saved until you click Save role set. Protected grants are left out."
        onCancel={() => {
          setCopyOpen(false)
          setCopyChoice([])
        }}
        onConfirm={() => (copyChoice.length ? applyCopy() : undefined)}
        open={copyOpen}
        title="Copy Existing Role Set"
      >
        <div className={LAYOUT_STYLES.copyList} data-kr-element="copy-role-set-options">
          {(roleSets ?? [])
            .filter((row) => row.id !== saved?.id)
            .map((row) => (
              <label className={`${LAYOUT_STYLES.copyOption} ${STYLES.copyOption}`} key={row.id}>
                <input
                  checked={copyChoice.includes(row.id)}
                  onChange={() => setCopyChoice((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]))}
                  type="checkbox"
                />
                <span>{row.label}</span>
                <span className={STYLES.copyKind}>{row.isSystem ? 'Built in' : 'Custom'}</span>
              </label>
            ))}
        </div>
      </U6ConfirmationDialog>

      {/* Retire a custom role set */}
      <U6ConfirmationDialog
        busy={busy}
        busyLabel="Retiring..."
        confirmLabel="Retire role set"
        description={
          saved
            ? `Retire "${saved.label}"? ${saved.holderCount === 0 ? 'Nobody holds it now.' : saved.holderCount === 1 ? 'One person holds it and loses its access at once.' : `${saved.holderCount} people hold it and lose its access at once.`} The role set and its rows are kept, but it can no longer be given to anyone.`
            : ''
        }
        error={retireOpen && error ? error : ''}
        onCancel={() => setRetireOpen(false)}
        onConfirm={() => void retire()}
        open={retireOpen}
        title="Retire role set?"
      />
    </KRModuleCard>
  )
}
