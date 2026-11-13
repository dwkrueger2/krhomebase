'use client'
// file: apps/web/components/tables/PermissionMatrix.client.tsx
/**
 * The Resource · Scope · CRUD table. Ported from the old `hb-components/CurrentResourcePermissionsCard.tsx` and
 * `CurrentResourcePermissions.ts`, which the old Role Sets screen and the user editor's Roles tab both used; here it
 * serves Role Sets (stage 4c) and Users and Invites (stage 4d), so it lives in `components/`.
 *
 * - One row per resource; a scope-aware resource (Attendance, Employee Documents) has a row for Own, Team and All.
 *   The others have one All row and read the plain grants (`<resource>.<action>`); scope rows read the scoped ones
 *   (`<resource>.<action>.<scope>`).
 * - Editable: a check box per action; `isActionDisabled` greys out what may not be granted.
 *   Read-only: a filled square for a grant, an empty one for none.
 *
 * Changed from the old card: the rows follow the Density Contract's record row (the Client Accounting register:
 * 10pt, 1px padding, ruled columns) instead of 3px 6px cells, and the old yellow "Delete restricted" chip is small
 * muted text, because yellow means state here (`DESIGN.md`, The State Color Rule). The old CSS module is the
 * `STYLES` and `LAYOUT_STYLES` maps below. Resource is left-aligned; Scope and C, R, U, D are centered, headings
 * and cells (the requester, Nov 12, 2026).
 *
 * @returns The matrix (`data-kr-id` from `krId`, default `permission-matrix`).
 */

import { PERMISSION_RESOURCES, ROLE_SET_ACTIONS, ROLE_SET_SCOPES, type RoleSetAction, type RoleSetScope } from '@krhomebase/contracts'

const LAYOUT_STYLES = {
  header: 'px-[6px] py-[4px] gap-[6px] flex items-baseline justify-between',
  scroller: 'overflow-x-auto',
  cellCenter: 'text-center',
} as const

const STYLES = {
  root: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[12px] font-[850] leading-tight text-(color:--kr-theme-text)',
  description: 'm-0 text-[11px] leading-tight text-(color:--kr-theme-text-muted)',
  hint: 'shrink-0 whitespace-nowrap text-[10px] uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted)',
  table: 'w-full min-w-[460px] border-collapse text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  thResource: 'text-left',
  thAction: 'w-[44px] text-center',
  thScope: 'w-[56px] text-center',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0',
  resource: 'font-semibold',
  restricted: 'ml-[4px] text-[9pt] font-normal italic text-(color:--kr-theme-text-muted)',
  checkbox: 'm-0 align-middle accent-(--kr-theme-brand-primary) disabled:cursor-not-allowed',
  square: 'inline-block size-[11px] border border-(--kr-theme-line) align-middle',
  squareOn: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** One row of the matrix: a resource at one scope, with its four grants. */
export interface PermissionMatrixRow {
  resourceId: string
  resource: string
  description: string
  scope: RoleSetScope
  /** True when the row reads and writes scoped grants (`<resource>.<action>.<scope>`). */
  scoped: boolean
  deleteRestricted: boolean
  grants: Record<RoleSetAction, boolean>
}

const SCOPE_LABEL: Record<RoleSetScope, string> = { own: 'Own', team: 'Team', all: 'All' }

/** The key a row's action reads and writes. */
export function permissionKeyOf(row: PermissionMatrixRow, action: RoleSetAction): string {
  return row.scoped ? `${row.resourceId}.${action}.${row.scope}` : `${row.resourceId}.${action}`
}

/** Builds the rows from plain and scoped grant lists (the old `buildCurrentResourcePermissionRows`). */
export function permissionMatrixRows(permissions: readonly string[], scopedPermissions: readonly string[]): PermissionMatrixRow[] {
  const plain = new Set(permissions)
  const scoped = new Set(scopedPermissions)
  return PERMISSION_RESOURCES.flatMap((resource) => {
    const scopes: readonly RoleSetScope[] = resource.scopeAware ? ROLE_SET_SCOPES : ['all']
    return scopes.map((scope) => {
      const row: PermissionMatrixRow = {
        resourceId: resource.id,
        resource: resource.label,
        description: resource.description,
        scope,
        scoped: Boolean(resource.scopeAware),
        deleteRestricted: Boolean(resource.deleteRestricted),
        grants: { create: false, read: false, update: false, delete: false },
      }
      for (const action of ROLE_SET_ACTIONS) row.grants[action] = (row.scoped ? scoped : plain).has(permissionKeyOf(row, action))
      return row
    })
  })
}

export interface PermissionMatrixProps {
  rows: readonly PermissionMatrixRow[]
  editable?: boolean
  isActionDisabled?: (row: PermissionMatrixRow, action: RoleSetAction) => boolean
  onToggle?: (row: PermissionMatrixRow, action: RoleSetAction) => void
  title?: string
  description?: string
  krId?: string
}

export default function PermissionMatrix({ rows, editable = false, isActionDisabled, onToggle, title = 'Current Resource Permissions', description, krId = 'permission-matrix' }: PermissionMatrixProps) {
  return (
    <section aria-label={title} className={STYLES.root} data-kr-component="PermissionMatrix" data-kr-id={krId}>
      {/* Title, the optional note and the column hint */}
      <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
        <div>
          <h4 className={STYLES.title}>{title}</h4>
          {description ? <p className={STYLES.description}>{description}</p> : null}
        </div>
        <span className={STYLES.hint}>Resource · Scope · CRUD</span>
      </header>
      {/* The grid: Resource, Scope, then C R U D */}
      <div className={LAYOUT_STYLES.scroller}>
        <table className={STYLES.table}>
          <thead>
            <tr>
              <th className={`${STYLES.th} ${STYLES.thResource}`}>Resource</th>
              <th className={`${STYLES.th} ${STYLES.thScope}`}>Scope</th>
              {ROLE_SET_ACTIONS.map((action) => (
                <th className={`${STYLES.th} ${STYLES.thAction}`} key={action} title={action}>
                  {action.slice(0, 1).toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-kr-element="rows-container">
            {rows.map((row) => (
              <tr className={STYLES.row} data-kr-element="permission-matrix-row" key={`${row.resourceId}:${row.scope}`}>
                <td className={STYLES.td} title={row.description}>
                  <span className={STYLES.resource}>{row.resource}</span>
                  {row.deleteRestricted ? <span className={STYLES.restricted}>delete restricted</span> : null}
                </td>
                <td className={`${STYLES.td} ${LAYOUT_STYLES.cellCenter}`}>{SCOPE_LABEL[row.scope]}</td>
                {ROLE_SET_ACTIONS.map((action) => {
                  const label = `${row.resource} ${SCOPE_LABEL[row.scope]} ${action}`
                  return (
                    <td className={`${STYLES.td} ${LAYOUT_STYLES.cellCenter}`} key={action}>
                      {editable ? (
                        <input aria-label={label} checked={row.grants[action]} className={STYLES.checkbox} disabled={isActionDisabled?.(row, action) ?? false} onChange={() => onToggle?.(row, action)} type="checkbox" />
                      ) : (
                        <span aria-checked={row.grants[action]} aria-label={label} className={`${STYLES.square} ${row.grants[action] ? STYLES.squareOn : ''}`} role="checkbox" />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
