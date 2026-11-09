'use client'
// file: apps/web/features/tools/components/ToolRegistrationForm.client.tsx
/**
 * The form a super admin fills in to register or change an outside tool. Part of `OutsideToolsAdmin`.
 *
 * It owns only the values being typed. On save it turns them into the request body (`ToolCreateBody` for a
 * new tool, `ToolUpdateBody` for a change) and hands it to `onSave`; the parent makes the call, shows the
 * busy state and any error. Labels sit beside their fields to save height (apps/web/AGENTS.md); the
 * permission list is a grid of checkboxes.
 */

import { useState, type FormEvent } from 'react'
import { ToolIconNames, ToolScopes, type ToolCreateBody, type ToolRegistration, type ToolScope, type ToolUpdateBody } from '@krhomebase/contracts'

export interface ToolRegistrationFormProps {
  /** The tool being changed, or null to register a new one. */
  tool: ToolRegistration | null
  /** True while the parent's save call runs. */
  busy: boolean
  /** Message from the last failed save, shown above the buttons. */
  error: string
  /** Called with the request body. For a change, `status` is included. */
  onSave: (body: ToolCreateBody | ToolUpdateBody) => void
  onCancel: () => void
}

const LAYOUT_STYLES = {
  form: 'gap-[6px] p-[10px] flex flex-col',
  row: 'gap-[8px] grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)] items-center',
  rowTop: 'gap-[8px] grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)] items-start',
  pair: 'gap-[8px] grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_120px]',
  scopes: 'gap-x-[10px] gap-y-[4px] grid grid-cols-2 lg:grid-cols-4',
  check: 'gap-[4px] flex items-center',
  actions: 'gap-[6px] pt-[4px] flex justify-end',
} as const

const STYLES = {
  form: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  heading: 'm-0 text-[length:var(--kr-theme-font-size-bigger)] font-semibold',
  label: 'text-[length:var(--kr-theme-font-size-base)] font-semibold text-(color:--kr-theme-text)',
  field: 'w-full px-[6px] py-[6px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[length:var(--kr-theme-font-size-base)]',
  hint: 'text-[length:var(--kr-theme-font-size-small)] text-(color:--kr-theme-text-muted)',
  error: 'text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-danger)',
  button: 'px-[10px] py-[6px] rounded-[3px] border cursor-pointer text-[length:var(--kr-theme-font-size-base)] disabled:cursor-wait disabled:opacity-65',
  cancel: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  save: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
} as const

/** Splits "a, b c" into ["a", "b", "c"], dropping blanks and repeats. */
function splitList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean))]
}

/**
 * Renders the registration form.
 *
 * @param props - The tool to change (or null), busy and error state, and the save and cancel callbacks.
 * @returns A `<form data-kr-id="ToolRegistrationForm">`.
 */
export default function ToolRegistrationForm({ tool, busy, error, onSave, onCancel }: ToolRegistrationFormProps) {
  const [label, setLabel] = useState(tool?.label ?? '')
  const [description, setDescription] = useState(tool?.description ?? '')
  const [icon, setIcon] = useState<string>(tool?.icon ?? 'documents')
  const [menuOrder, setMenuOrder] = useState(String(tool?.menuOrder ?? 100))
  const [entryUrl, setEntryUrl] = useState(tool?.entryUrl ?? '')
  const [roles, setRoles] = useState((tool?.allowedRoles ?? ['staff']).join(', '))
  const [scopes, setScopes] = useState<ReadonlySet<ToolScope>>(new Set(tool?.scopes ?? []))
  const [serverAccess, setServerAccess] = useState(tool?.serverAccessEnabled ?? false)
  const [ipList, setIpList] = useState((tool?.serverIpAllowlist ?? []).join(', '))
  const [status, setStatus] = useState(tool?.status ?? 'active')

  function toggleScope(scope: ToolScope): void {
    setScopes((current) => {
      const next = new Set(current)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const body = {
      label: label.trim(),
      description: description.trim(),
      icon: icon as ToolCreateBody['icon'],
      menuOrder: Number.parseInt(menuOrder, 10) || 0,
      entryUrl: entryUrl.trim(),
      allowedRoles: splitList(roles),
      scopes: ToolScopes.filter((scope) => scopes.has(scope)),
      serverAccessEnabled: serverAccess,
      serverIpAllowlist: serverAccess ? splitList(ipList) : [],
    }
    onSave(tool ? { ...body, status } : body)
  }

  return (
    <form className={`${LAYOUT_STYLES.form} ${STYLES.form}`} onSubmit={handleSubmit} data-kr-id="ToolRegistrationForm">
      <h3 className={STYLES.heading}>{tool ? `Change ${tool.label}` : 'Register an outside tool'}</h3>

      {/* Menu text: label, order and icon on one row */}
      <div className={LAYOUT_STYLES.row} data-kr-element="tool-label-row">
        <label className={STYLES.label} htmlFor="tool-label">Menu label</label>
        <div className={LAYOUT_STYLES.pair}>
          <input id="tool-label" className={STYLES.field} value={label} maxLength={40} required onChange={(e) => setLabel(e.target.value)} />
          <input aria-label="Menu order" title="Menu order (lower comes first)" className={STYLES.field} type="number" min={0} max={9999} value={menuOrder} onChange={(e) => setMenuOrder(e.target.value)} />
          <select aria-label="Menu icon" className={STYLES.field} value={icon} onChange={(e) => setIcon(e.target.value)}>
            {ToolIconNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={LAYOUT_STYLES.row} data-kr-element="tool-description-row">
        <label className={STYLES.label} htmlFor="tool-description">Description</label>
        <input id="tool-description" className={STYLES.field} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {/* Where the tool is hosted: its origin is the only place the frame may load from */}
      <div className={LAYOUT_STYLES.row} data-kr-element="tool-entry-url-row">
        <label className={STYLES.label} htmlFor="tool-entry-url">Tool address</label>
        <input
          id="tool-entry-url"
          className={STYLES.field}
          type="url"
          placeholder="https://tool.example.com/app"
          value={entryUrl}
          required
          title="https only (http only for localhost). Must not be this site."
          onChange={(e) => setEntryUrl(e.target.value)}
        />
      </div>

      <div className={LAYOUT_STYLES.row} data-kr-element="tool-roles-row">
        <label className={STYLES.label} htmlFor="tool-roles">Roles</label>
        <input id="tool-roles" className={STYLES.field} value={roles} required title="Role names, separated by commas, for example staff, super_admin" onChange={(e) => setRoles(e.target.value)} />
      </div>

      {/* Permissions: what the tool may read or change. A frame call is also limited by the person's role. */}
      <div className={LAYOUT_STYLES.rowTop} data-kr-element="tool-scopes-row">
        <span className={STYLES.label}>Permissions</span>
        <div className={LAYOUT_STYLES.scopes}>
          {ToolScopes.map((scope) => (
            <label key={scope} className={`${LAYOUT_STYLES.check} ${STYLES.hint}`}>
              <input type="checkbox" checked={scopes.has(scope)} onChange={() => toggleScope(scope)} />
              {scope}
            </label>
          ))}
        </div>
      </div>

      {/* Server path: the tool's own server may get access tokens with a client secret */}
      <div className={LAYOUT_STYLES.row} data-kr-element="tool-server-row">
        <span className={STYLES.label}>Server access</span>
        <label className={`${LAYOUT_STYLES.check} ${STYLES.hint}`}>
          <input type="checkbox" checked={serverAccess} onChange={(e) => setServerAccess(e.target.checked)} />
          Let the tool's server call KR Homebase with a client secret (shown once)
        </label>
      </div>

      {serverAccess && (
        <div className={LAYOUT_STYLES.row} data-kr-element="tool-ip-row">
          <label className={STYLES.label} htmlFor="tool-ips">Server addresses</label>
          <input id="tool-ips" className={STYLES.field} value={ipList} placeholder="Optional. Empty allows any address." onChange={(e) => setIpList(e.target.value)} />
        </div>
      )}

      {tool && (
        <div className={LAYOUT_STYLES.row} data-kr-element="tool-status-row">
          <label className={STYLES.label} htmlFor="tool-status">Status</label>
          <select id="tool-status" className={STYLES.field} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}>
            <option value="active">active (shown, may call the API)</option>
            <option value="disabled">disabled (hidden, every call refused)</option>
          </select>
        </div>
      )}

      {error && <p className={STYLES.error} role="alert">{error}</p>}

      {/* Form actions */}
      <div className={LAYOUT_STYLES.actions}>
        <button type="button" className={`${STYLES.button} ${STYLES.cancel}`} disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="submit" className={`${STYLES.button} ${STYLES.save}`} disabled={busy}>{busy ? 'Saving...' : tool ? 'Save changes' : 'Register tool'}</button>
      </div>
    </form>
  )
}
