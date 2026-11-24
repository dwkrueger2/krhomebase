'use client'
// file: apps/web/features/tools/components/ToolRegistrationForm.client.tsx
/**
 * The form a super admin fills in to register or change an outside tool. Part of `OutsideToolsAdmin`.
 *
 * It owns only the values being typed. On save it turns them into the request body (`ToolCreateBody` for a
 * new tool, `ToolUpdateBody` for a change) and hands it to `onSave`; the parent makes the call, shows the
 * busy state and any error. Labels sit beside their fields to save height (apps/web/AGENTS.md); the
 * permission list is a grid of checkboxes.
 *
 * Added Nov 14, 2026 (web patch 544):
 *  - **Roles** are a grid of checkboxes limited to the roles a person's account can hold (`ToolRoleNames`); a person
 *    holding any one of the ticked roles sees the tool. Super admin is always ticked, greyed and locked: the API adds
 *    it to every list (the requester, Nov 14, 2026).
 *  - **The tool's own icon is not typed here** (the requester, Nov 14, 2026): the tool serves it at
 *    `<origin>/tool-icon.svg` (the kit's rules) and the API reads it on every save. The icon chosen in the first row is
 *    only the fallback (default `tool`, the orange diamond). The preview shows the icon last read, or the fallback.
 *  - **Check health** reads the tool's `/health-check` and `/tool-icon.svg` through the API (`checkToolAddressHealth`)
 *    and shows the result, the version and the icon found beside the address; **Details** opens
 *    `ToolHealthDetailDialog` with the raw answer as formatted JSON. It does not block saving: when a person opens a
 *    tool that fails, the frame shows a notice instead (`ExternalToolFrame`).
 *  - Thin rules separate the Roles, Permissions and Server access sections.
 *  - Spacing follows the Density Contract (DESIGN.md): 3px label gaps, 24px fields and buttons, 8px form padding.
 *
 * Added Nov 17, 2026 (web patch 564, the requester; migration 058): a **Shown** row under Roles with two options.
 * **Local development only** keeps the tool to KR Homebase under `pnpm dev` (the local app and the deployed app read
 * the same tool list, so a tool at a localhost address showed in the deployed menu too); a localhost address with the
 * box unticked gets a hint. **Developers only** shows the tool only to people who hold `developer_tools` read (the
 * Internal Developer role set), whatever their role. The API applies both (`toolRefusal`).
 *
 * Nov 23, 2026 (web patch 581): the Permissions hint has a **README First** button (`onShowReadme`) that opens the
 * super admin's help on what each permission hands over, in a dialog the parent owns. Web patch 582: that hint runs
 * across both columns (`fullWidthNote`) instead of wrapping in the 112px label column, which made the form too tall.
 *
 * Nov 23, 2026 (web patch 589, repository patch 80, the requester):
 *  - **Permitted users** offers the active KR Homebase accounts the API reads from the database
 *    (`fetchPermittedUserChoices`, `GET /v1/tools/permitted-user-choices`), by name and email, instead of a list in the
 *    contract (which outside developers receive). A new tool starts with the API's default (the accounts that hold
 *    developer_tools read) and, until the chips are changed, the form leaves the field out so the API applies it. A
 *    saved email that is no longer an active account is marked; the API refuses to save it.
 *  - **Sandbox only** in the Shown row: the tool may use the tool sandbox only; KR Homebase treats it as not there.
 */

import { useEffect, useState, type FormEvent } from 'react'
import {
  ToolIconNames,
  ToolRoleNames,
  ToolScopes,
  type ToolCreateBody,
  type ToolHealthData,
  type ToolPermittedUserChoice,
  type ToolRegistration,
  type ToolScope,
  type ToolUpdateBody,
} from '@krhomebase/contracts'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import ToolSvgIcon from '@/components/ui/ToolSvgIcon.client'
import { checkToolAddressHealth, fetchPermittedUserChoices } from '@/features/tools/api.client'
import ToolHealthDetailDialog from '@/features/tools/components/ToolHealthDetailDialog.client'

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
  /** Opens "Outside Tools: README First" (what each permission hands over); the parent owns the dialog. */
  onShowReadme?: () => void
}

type ToolRoleName = (typeof ToolRoleNames)[number]

/** Always on every tool's role list; shown ticked and locked. The API adds it as well. */
const LOCKED_ROLE: ToolRoleName = 'super_admin'

/** Permissions with an opened route; all remaining grants are unavailable until a route is approved. */
const OPEN_TOOL_SCOPES = new Set<ToolScope>([
  'contacts:read',
  'tool-registration:read',
  'contacts:write',
  'matters:read',
  'matters:write',
  'leads:read',
  'leads:write',
  'tasks:read',
  'tasks:write',
  'workstream:read',
  'workstream:write',
  'billing:read',
  'timekeeping:read',
  'timekeeping:write',
  'homebase-feedback:read',
  'homebase-feedback:write',
])

/** Words for each role in the role grid. */
const ROLE_LABELS: Record<ToolRoleName, string> = {
  super_admin: 'Super admin',
  attorney: 'Attorney',
  paralegal: 'Paralegal',
  staff: 'Staff',
  billing: 'Billing',
  client: 'Client',
  external_cpa: 'External CPA',
}

const LAYOUT_STYLES = {
  form: 'gap-[4px] p-[8px] flex flex-col',
  row: 'gap-x-[3px] gap-y-[2px] grid grid-cols-1 md:grid-cols-[112px_minmax(0,1fr)] items-center',
  rowTop: 'gap-x-[3px] gap-y-[2px] grid grid-cols-1 md:grid-cols-[112px_minmax(0,1fr)] items-start',
  labelRowControls: 'gap-[3px] grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_72px_172px]',
  addressControls: 'gap-[3px] grid grid-cols-[minmax(0,1fr)_auto] items-center',
  healthResult: 'gap-[4px] flex items-center',
  labelRowEnd: 'gap-[3px] flex items-center',
  section: 'pt-[4px] border-t',
  checks: 'gap-x-[10px] gap-y-[1px] grid grid-cols-2 lg:grid-cols-4',
  visibility: 'gap-x-[10px] gap-y-[1px] flex flex-wrap items-center',
  permittedUsers: 'gap-[4px] flex flex-wrap items-center',
  check: 'gap-[4px] flex items-center',
  actions: 'gap-[6px] pt-[2px] flex justify-end',
  // A note under a row's fields that runs across both columns, so it does not wrap in the narrow label column.
  fullWidthNote: 'm-0 md:col-span-2',
} as const

const STYLES = {
  form: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  heading: 'm-0 text-[13px] leading-tight font-semibold text-(color:--kr-theme-text)',
  label: 'text-[12px] leading-tight font-semibold text-(color:--kr-theme-text)',
  field: 'h-[24px] w-full px-[6px] py-[2px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text)',
  hint: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  checkRow: 'h-[19px] text-[12px] leading-tight text-(color:--kr-theme-text)',
  checkRowLocked: 'h-[19px] cursor-not-allowed text-[12px] leading-tight text-(color:--kr-theme-text-muted) opacity-65',
  userChip: 'gap-[3px] px-[5px] py-[2px] inline-flex items-center rounded-[2px] border border-(--kr-theme-line) text-[11px] leading-tight text-(color:--kr-theme-text)',
  // A saved email that is no longer an active account: the API refuses to save it until it is removed.
  userChipUnknown: 'gap-[3px] px-[5px] py-[2px] inline-flex items-center rounded-[2px] border border-(--kr-theme-danger) text-[11px] leading-tight text-(color:--kr-theme-danger)',
  removeUser: 'size-[16px] inline-flex items-center justify-center rounded-[2px] border-0 bg-transparent cursor-pointer text-[13px] leading-none text-(color:--kr-theme-text-muted) hover:text-(color:--kr-theme-danger)',
  ok: 'text-[12px] leading-tight font-semibold text-(color:--kr-theme-success)',
  bad: 'text-[12px] leading-tight text-(color:--kr-theme-danger)',
  error: 'm-0 text-[12px] leading-tight text-(color:--kr-theme-danger)',
  previewBox: 'size-[24px] flex shrink-0 items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text)',
  previewIcon: 'size-[18px]',
  section: 'border-(--kr-theme-line)',
  link: 'h-[20px] px-[6px] rounded-[2px] border cursor-pointer text-[11px] font-semibold leading-tight border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  button: 'h-[24px] px-[8px] rounded-[2px] border cursor-pointer text-[12px] font-semibold leading-tight whitespace-nowrap disabled:cursor-wait disabled:opacity-65',
  cancel: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  save: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** True for an address on this computer (`localhost`, `127.0.0.1`, `[::1]`), which a deployed app cannot load. */
export function isLocalToolAddress(address: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(address.trim()).hostname)
  } catch {
    return false
  }
}

/** Splits "a, b c" into ["a", "b", "c"], dropping blanks and repeats. */
function splitList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean))]
}

/** Adds or removes one value from a set, returning a new set (for checkbox grids). */
function toggled<T>(current: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/**
 * Renders the registration form.
 *
 * @param props - The tool to change (or null), busy and error state, and the save and cancel callbacks.
 * @returns A `<form data-kr-id="ToolRegistrationForm">`.
 */
export default function ToolRegistrationForm({ tool, busy, error, onSave, onCancel, onShowReadme }: ToolRegistrationFormProps) {
  const [label, setLabel] = useState(tool?.label ?? '')
  const [description, setDescription] = useState(tool?.description ?? '')
  const [icon, setIcon] = useState<string>(tool?.icon ?? 'tool')
  const [menuOrder, setMenuOrder] = useState(String(tool?.menuOrder ?? 100))
  const [entryUrl, setEntryUrl] = useState(tool?.entryUrl ?? '')
  const [roles, setRoles] = useState<ReadonlySet<ToolRoleName>>(
    new Set([LOCKED_ROLE, ...(tool?.allowedRoles ?? ['staff']).filter((role): role is ToolRoleName => (ToolRoleNames as readonly string[]).includes(role))]),
  )
  // Null for a new tool until the chips are changed: the API's default applies (the field is left out on save).
  const [chosenUsers, setChosenUsers] = useState<ReadonlySet<string> | null>(tool ? new Set(tool.permittedUsers) : null)
  const [permittedUserToAdd, setPermittedUserToAdd] = useState('')
  // The active accounts the API offers, and its default for a new tool; null while loading.
  const [userChoices, setUserChoices] = useState<ToolPermittedUserChoice[] | null>(null)
  const [defaultEmails, setDefaultEmails] = useState<string[]>([])
  const [choicesError, setChoicesError] = useState('')
  const [localOnly, setLocalOnly] = useState(tool?.localOnly ?? false)
  const [developersOnly, setDevelopersOnly] = useState(tool?.developersOnly ?? false)
  const [sandboxOnly, setSandboxOnly] = useState(tool?.sandboxOnly ?? false)
  const [scopes, setScopes] = useState<ReadonlySet<ToolScope>>(new Set(tool?.scopes ?? []))
  const [serverAccess, setServerAccess] = useState(tool?.serverAccessEnabled ?? false)
  const [ipList, setIpList] = useState((tool?.serverIpAllowlist ?? []).join(', '))
  const [status, setStatus] = useState(tool?.status ?? 'active')
  // The last health check of the address typed, or its failure message.
  const [health, setHealth] = useState<ToolHealthData | null>(null)
  const [healthBusy, setHealthBusy] = useState(false)
  const [healthError, setHealthError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)

  // Reads the accounts once. A reply after the form closed is ignored.
  useEffect(() => {
    let live = true
    void fetchPermittedUserChoices().then((result) => {
      if (!live) return
      if (result.ok) {
        setUserChoices(result.data.users)
        setDefaultEmails(result.data.defaultEmails)
      } else {
        setUserChoices([])
        setChoicesError(result.message)
      }
    })
    return () => {
      live = false
    }
  }, [])

  // The chips shown: the chosen list, or for a new tool not yet changed, the API's default.
  const permittedUsers: ReadonlySet<string> = chosenUsers ?? new Set(defaultEmails)
  const knownEmails = new Set((userChoices ?? []).map((choice) => choice.email))
  const nameOf = (email: string) => userChoices?.find((choice) => choice.email === email)?.name ?? email

  /** Changes the chips; from now on the form sends the list (a new tool stops using the API's default). */
  function changeUsers(change: (current: ReadonlySet<string>) => Set<string>): void {
    setChosenUsers(change(permittedUsers))
  }

  // The icon to preview: the one the last check found, else the one stored at the last save, else the fallback.
  const previewSvg = health?.icon ? health.icon.svg : (tool?.iconSvg ?? null)
  const canSave = !busy

  /** Reads the health route and the icon route of the address typed (`<origin>/health-check`, `/tool-icon.svg`), through the API. */
  async function runHealthCheck(): Promise<void> {
    setHealthBusy(true)
    setHealthError('')
    setHealth(null)
    const result = await checkToolAddressHealth(entryUrl.trim())
    setHealthBusy(false)
    if (result.ok) setHealth(result.data)
    else setHealthError(result.message)
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!canSave) return
    const body = {
      label: label.trim(),
      description: description.trim(),
      icon: icon as ToolCreateBody['icon'],
      menuOrder: Number.parseInt(menuOrder, 10) || 0,
      entryUrl: entryUrl.trim(),
      allowedRoles: ToolRoleNames.filter((role) => role === LOCKED_ROLE || roles.has(role)),
      // Left out for a new tool whose chips were not changed: the API gives it its default.
      ...(chosenUsers ? { permittedUsers: [...chosenUsers] } : {}),
      localOnly,
      developersOnly,
      sandboxOnly,
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
        <div className={LAYOUT_STYLES.labelRowControls}>
          <input id="tool-label" className={STYLES.field} value={label} maxLength={40} required onChange={(e) => setLabel(e.target.value)} />
          <input aria-label="Menu order" title="Menu order (lower comes first)" className={STYLES.field} type="number" min={0} max={9999} value={menuOrder} onChange={(e) => setMenuOrder(e.target.value)} />
          {/* Fallback icon and the menu preview: the tool's own icon (read from /tool-icon.svg) when it has one */}
          <span className={LAYOUT_STYLES.labelRowEnd}>
            <select aria-label="Fallback icon" title="Built-in icon shown when the tool serves no icon of its own at /tool-icon.svg (tool: the orange diamond)" className={STYLES.field} value={icon} onChange={(e) => setIcon(e.target.value)}>
              {ToolIconNames.map((name) => (
                <option key={name} value={name}>{name === 'tool' ? 'tool (default)' : name}</option>
              ))}
            </select>
            <span className={STYLES.previewBox} title={previewSvg ? 'The icon the tool serves (/tool-icon.svg)' : 'The fallback icon (the tool serves none, or it was not read yet)'} data-kr-element="tool-icon-preview">
              {previewSvg ? (
                <ToolSvgIcon svg={previewSvg} className={STYLES.previewIcon} />
              ) : (
                <KRHomebaseIcon name={icon as ToolCreateBody['icon']} className={STYLES.previewIcon} />
              )}
            </span>
          </span>
        </div>
      </div>

      <div className={LAYOUT_STYLES.row} data-kr-element="tool-description-row">
        <label className={STYLES.label} htmlFor="tool-description">Description</label>
        <input id="tool-description" className={STYLES.field} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {/* Where the tool is hosted: its origin is the only place the frame may load from */}
      <div className={LAYOUT_STYLES.row} data-kr-element="tool-entry-url-row">
        <label className={STYLES.label} htmlFor="tool-entry-url">Tool address</label>
        <div className={LAYOUT_STYLES.addressControls}>
          <input
            id="tool-entry-url"
            className={STYLES.field}
            type="url"
            placeholder="https://tool.example.com/app"
            value={entryUrl}
            required
            title="https only (http only for localhost). Must not be this site."
            onChange={(e) => {
              setEntryUrl(e.target.value)
              setHealth(null)
              setHealthError('')
            }}
          />
          <button
            type="button"
            className={`${STYLES.button} ${STYLES.cancel}`}
            disabled={healthBusy || !entryUrl.trim()}
            title="Reads <tool origin>/health-check and /tool-icon.svg, which every tool must serve (tool kit guide)"
            onClick={() => void runHealthCheck()}
            data-kr-element="tool-health-check"
          >
            Check health
          </button>
        </div>
      </div>

      {/* Health result, beside the address: only once a check was asked for */}
      {(healthBusy || health || healthError) && (
        <div className={LAYOUT_STYLES.row} data-kr-element="tool-health-row">
          <span className={STYLES.label}>Health</span>
          <div className={LAYOUT_STYLES.healthResult} role="status">
            {healthBusy && <RainbowBusySpinner busy hideWhenIdle={false} label="Checking..." size={14} />}
            {health?.state === 'ok' && <span className={STYLES.ok}>Answers, version {health.version}</span>}
            {health?.state === 'not_checked' && <span className={STYLES.hint}>Not checked: {health.problem}</span>}
            {health?.state === 'failed' && <span className={STYLES.bad}>{health.problem}</span>}
            {health?.icon && !health.icon.svg && <span className={STYLES.hint}>No own icon: the fallback is used.</span>}
            {health && (
              <button type="button" className={STYLES.link} onClick={() => setDetailOpen(true)} data-kr-element="tool-health-details">
                Details
              </button>
            )}
            {healthError && <span className={STYLES.bad}>{healthError}</span>}
          </div>
        </div>
      )}

      {/* Roles: the roles a person's account can hold; anyone holding any one of the ticked roles sees the tool */}
      <div className={`${LAYOUT_STYLES.rowTop} ${LAYOUT_STYLES.section} ${STYLES.section}`} data-kr-element="tool-roles-row">
        <span className={STYLES.label} title="A person holding any one of these roles sees the tool">Roles</span>
        <div>
          <div className={LAYOUT_STYLES.checks}>
            {ToolRoleNames.map((role) =>
              role === LOCKED_ROLE ? (
                <label key={role} className={`${LAYOUT_STYLES.check} ${STYLES.checkRowLocked}`} title="Always included: a super admin sees every active tool" data-kr-element="tool-role-locked">
                  <input type="checkbox" checked disabled readOnly />
                  {ROLE_LABELS[role]}
                </label>
              ) : (
                <label key={role} className={`${LAYOUT_STYLES.check} ${STYLES.checkRow}`}>
                  <input type="checkbox" checked={roles.has(role)} onChange={() => setRoles((current) => toggled(current, role))} />
                  {ROLE_LABELS[role]}
                </label>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Permitted users: active KR Homebase accounts read by the API, enforced for frame use and available to the tool server through its own grant. */}
      <div className={`${LAYOUT_STYLES.rowTop} ${LAYOUT_STYLES.section} ${STYLES.section}`} data-kr-element="tool-permitted-users-row">
        <label className={STYLES.label} htmlFor="tool-permitted-user-add" title="Only these exact sign-in emails may use this tool">Permitted users</label>
        <div className={LAYOUT_STYLES.permittedUsers}>
          {[...permittedUsers].map((email) => {
            // Marked only once the accounts are read: a saved email that is no longer an active account.
            const unknown = userChoices !== null && !choicesError && !knownEmails.has(email)
            return (
              <span
                key={email}
                className={unknown ? STYLES.userChipUnknown : STYLES.userChip}
                title={unknown ? `${email} is not an active KR Homebase account: remove it before saving.` : `${nameOf(email)} (${email})`}
                data-kr-element={unknown ? 'tool-permitted-user-chip-unknown' : 'tool-permitted-user-chip'}
              >
                {email}
                <button
                  type="button"
                  className={STYLES.removeUser}
                  aria-label={`Remove ${email}`}
                  title={`Remove ${email}`}
                  onClick={() => changeUsers((current) => toggled(current, email))}
                  data-kr-element="tool-permitted-user-remove"
                >×</button>
              </span>
            )
          })}
          {permittedUsers.size === 0 && (chosenUsers !== null || userChoices !== null) && <span className={STYLES.hint} data-kr-element="tool-no-permitted-users">No users selected; nobody can open this tool.</span>}
          <select
            id="tool-permitted-user-add"
            aria-label="Add permitted user"
            className={STYLES.field}
            value={permittedUserToAdd}
            disabled={!userChoices?.length}
            onChange={(event) => {
              const email = event.target.value
              if (email) changeUsers((current) => new Set([...current, email]))
              setPermittedUserToAdd('')
            }}
            data-kr-element="tool-permitted-user-add"
          >
            <option value="">{userChoices === null ? 'Reading accounts...' : 'Add a user...'}</option>
            {(userChoices ?? []).filter((choice) => !permittedUsers.has(choice.email)).map((choice) => (
              <option key={choice.email} value={choice.email}>{choice.name === choice.email ? choice.email : `${choice.name} (${choice.email})`}</option>
            ))}
          </select>
          {choicesError && <span className={STYLES.bad} data-kr-element="tool-permitted-users-error">The accounts could not be read: {choicesError}</span>}
        </div>
      </div>

      {/* Shown: three narrowing options (migrations 058 and 080); the API applies them to the menu, the health check and every call */}
      <div className={`${LAYOUT_STYLES.rowTop} ${LAYOUT_STYLES.section} ${STYLES.section}`} data-kr-element="tool-visibility-row">
        <span className={STYLES.label} title="Narrows who sees the tool beyond its roles">Shown</span>
        <div className={LAYOUT_STYLES.visibility}>
          <label className={`${LAYOUT_STYLES.check} ${STYLES.checkRow}`} title="Shown only while KR Homebase runs on a development computer (pnpm dev). The deployed app treats the tool as not there." data-kr-element="tool-local-only">
            <input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} />
            Local development only (pnpm dev)
          </label>
          <label className={`${LAYOUT_STYLES.check} ${STYLES.checkRow}`} title="Shown only to people who hold developer_tools read (the Internal Developer role set; Super Admin holds every permission)" data-kr-element="tool-developers-only">
            <input type="checkbox" checked={developersOnly} onChange={(e) => setDevelopersOnly(e.target.checked)} />
            Developers only (Internal Developer)
          </label>
          <label className={`${LAYOUT_STYLES.check} ${STYLES.checkRow}`} title="The tool may use the tool sandbox's made-up data only. KR Homebase treats it as not there for everyone, super admins included: no menu entry, no access token, every call refused (tool_sandbox_only). Its Sandbox secret still works." data-kr-element="tool-sandbox-only">
            <input type="checkbox" checked={sandboxOnly} onChange={(e) => setSandboxOnly(e.target.checked)} />
            Sandbox only
          </label>
          {!localOnly && isLocalToolAddress(entryUrl) && (
            <span className={STYLES.hint} data-kr-element="tool-local-address-hint">This address is on this computer, so the deployed app cannot load it: tick Local development only.</span>
          )}
        </div>
      </div>

      {/* Permissions: what the tool may read or change. A frame call is also limited by the person's role. */}
      <div className={`${LAYOUT_STYLES.rowTop} ${LAYOUT_STYLES.section} ${STYLES.section}`} data-kr-element="tool-scopes-row">
        <span className={STYLES.label}>Permissions</span>
        <div className={LAYOUT_STYLES.checks}>
          {ToolScopes.map((scope) => (
            <label key={scope} className={`${LAYOUT_STYLES.check} ${OPEN_TOOL_SCOPES.has(scope) ? STYLES.checkRow : STYLES.checkRowLocked}`} data-kr-element={`tool-scope-${scope.replace(':', '-')}`}>
              <input type="checkbox" checked={scopes.has(scope)} disabled={!OPEN_TOOL_SCOPES.has(scope)} onChange={() => setScopes((current) => toggled(current, scope))} />
              {scope}{OPEN_TOOL_SCOPES.has(scope) ? '' : ' — TBD'}
            </label>
          ))}
        </div>
        <p className={`${LAYOUT_STYLES.fullWidthNote} ${STYLES.hint}`} data-kr-element="tool-write-scopes-frame-only">
          Write permissions work only when the tool is open in the signed-in Homebase frame. Server calls remain read-only.
          {onShowReadme && (
            <>
              {' '}What each permission hands over:{' '}
              <button type="button" className={STYLES.link} onClick={onShowReadme} data-kr-element="tool-scopes-readme-first">README First</button>
            </>
          )}
        </p>
      </div>

      {/* Server path: the tool's own server may get access tokens with a client secret */}
      <div className={`${LAYOUT_STYLES.row} ${LAYOUT_STYLES.section} ${STYLES.section}`} data-kr-element="tool-server-row">
        <span className={STYLES.label}>Server access</span>
        <label className={`${LAYOUT_STYLES.check} ${STYLES.checkRow}`}>
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
        <button type="submit" className={`${STYLES.button} ${STYLES.save}`} disabled={!canSave}>{busy ? 'Saving...' : tool ? 'Save changes' : 'Register tool'}</button>
      </div>

      {/* Health check detail: the raw answer as formatted JSON, and the icon found */}
      <ToolHealthDetailDialog result={detailOpen ? health : null} onClose={() => setDetailOpen(false)} />
    </form>
  )
}
