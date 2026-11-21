'use client'
// file: apps/web/features/tools/components/OutsideToolsAdmin.client.tsx
/**
 * The super admin's "Outside tools" screen, shown under Application Settings (`app/page.tsx` places it only
 * for a super admin; the API refuses everyone else regardless). Design and security model:
 * docs/05_Outside_Tools.md. The guide to send developers: packages/tool-sdk/README.md.
 *
 * Stages: (1) load the registered tools; (2) list them with their address, roles, permissions, status and
 * server access, and actions for each; (3) open the registration form for a new tool or a change; (4) after
 * a registration with server access, or a new secret, show the secret once (`ToolSecretNotice`); (5) ask with
 * `U6ConfirmationDialog` before removing a tool or replacing its secret; (6) show a tool's recent activity
 * (`ToolAuditList`).
 *
 * This component owns all the screen's state. Menu changes appear for other people when they next load KR
 * Homebase; the tool list in the menu is read once per page load.
 *
 * Tightened to the Density Contract (DESIGN.md, Nov 14, 2026, web patch 544): one-line header (the guide reference
 * moved into the title's tooltip), 8px card padding, register rows with 1px cell padding and 12px text, an uppercase
 * heading row, 20px row buttons. The Tool column shows the menu icon (the tool's own SVG icon when it has one).
 *
 * Nov 17, 2026 (web patch 564, migration 058): the Roles column adds a "local only" and a "developers only" tag for a
 * tool registered with those options (`ToolRegistrationForm`, Shown row).
 *
 * Nov 21, 2026 (web patch 577): the header links to the private GitHub repository, the source for the kit, guide and
 * changes, and shows the versioned archive stored in R2. GitHub decides who may open the repository; the download
 * button is also available from the developer-facing Feedback panel to people with `developer_tools`.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ToolAuditEntry, ToolCreateBody, ToolRegistration, ToolUpdateBody } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { createTool, deleteTool, fetchToolAudit, listTools, rotateToolSecret, updateTool } from '@/features/tools/api.client'
import ToolAuditList from '@/features/tools/components/ToolAuditList.client'
import ToolRegistrationForm from '@/features/tools/components/ToolRegistrationForm.client'
import ToolSecretNotice from '@/features/tools/components/ToolSecretNotice.client'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import ToolSvgIcon from '@/components/ui/ToolSvgIcon.client'
import ToolKitDownload from '@/features/tools/components/ToolKitDownload.client'

/**
 * The private GitHub repository that publishes the tool kit (the requester, Nov 20, 2026). Its front page names the
 * current release; `scripts/Release-ToolSdk.ps1 -PublishTo` fills its local clone. Change it here if the repository
 * moves (for example to a GitHub organization).
 */
const TOOL_SDK_REPOSITORY_URL = 'https://github.com/dwkrueger2/krhomebase-sdk'

/** A secret to show once. */
interface SecretToShow {
  label: string
  clientId: string
  clientSecret: string
  previousValidUntil: string | null
}

/** A change that waits for the super admin to confirm it. */
type PendingConfirm = { kind: 'delete'; tool: ToolRegistration } | { kind: 'rotate'; tool: ToolRegistration }

const LAYOUT_STYLES = {
  screen: 'mx-[8px] my-[6px] lg:mx-auto max-w-[1100px] gap-[6px] flex flex-col',
  head: 'gap-[6px] px-[8px] py-[4px] flex items-center justify-between',
  headTitle: 'gap-[10px] flex items-baseline',
  scroller: 'p-[8px] overflow-x-auto',
  cell: 'px-[6px] py-[1px]',
  headCell: 'px-[6px] py-[3px]',
  toolCell: 'gap-[6px] flex items-center',
  actions: 'gap-[3px] flex flex-wrap',
  overlap: 'mt-[6px] gap-[6px] flex items-center',
  tag: 'ml-[4px] inline-block',
} as const

const STYLES = {
  card: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  title: 'm-0 text-[14px] leading-tight font-semibold text-(color:--kr-theme-text)',
  text: 'm-0 text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] leading-tight text-(color:--kr-theme-danger)',
  table: 'w-full border-collapse text-[12px] leading-tight',
  th: 'text-left text-[10.5px] font-semibold uppercase tracking-[0.045em] text-(color:--kr-theme-text-muted) bg-(--kr-theme-table-heading-light) border-b border-(--kr-theme-line)',
  td: 'border-b border-(--kr-theme-line) align-middle',
  toolIcon: 'size-[18px] shrink-0 text-(color:--kr-theme-text)',
  mono: 'font-mono text-[11px]',
  badgeOn: 'px-[5px] rounded-[2px] bg-(--kr-theme-success)/15 text-[11px] text-(color:--kr-theme-success) font-semibold',
  badgeOff: 'px-[5px] rounded-[2px] bg-(--kr-theme-muted-surface) text-[11px] text-(color:--kr-theme-text-muted) font-semibold',
  headButton: 'h-[24px] px-[8px] rounded-[2px] border cursor-pointer text-[12px] font-semibold leading-tight disabled:cursor-wait disabled:opacity-65',
  button: 'h-[20px] px-[6px] rounded-[2px] border cursor-pointer text-[11px] font-semibold leading-tight disabled:cursor-wait disabled:opacity-65',
  plain: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  primary: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  danger: 'border-(--kr-theme-danger) bg-transparent text-(color:--kr-theme-danger)',
  field: 'px-[6px] py-[4px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  kitLink: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted) underline hover:text-(color:--kr-theme-orange)',
} as const

/**
 * Renders the outside-tools screen.
 *
 * @returns A `<section data-kr-id="OutsideToolsAdmin">`.
 */
export default function OutsideToolsAdmin() {
  const [tools, setTools] = useState<ToolRegistration[] | null>(null)
  const [loadError, setLoadError] = useState('')
  // The form: closed (undefined), new tool (null) or the tool being changed.
  const [editing, setEditing] = useState<ToolRegistration | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [secret, setSecret] = useState<SecretToShow | null>(null)
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [overlapHours, setOverlapHours] = useState(24)
  const [audit, setAudit] = useState<{ label: string; entries: ToolAuditEntry[] } | null>(null)

  // Stage 1: load the list.
  const reload = useCallback(async () => {
    const result = await listTools()
    if (result.ok) {
      setTools(result.data.tools)
      setLoadError('')
    } else {
      setLoadError(result.message)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Stage 3: saves the form, then shows the secret when one was made. */
  async function handleSave(body: ToolCreateBody | ToolUpdateBody): Promise<void> {
    setSaving(true)
    setFormError('')
    if (editing) {
      const result = await updateTool(editing.id, body as ToolUpdateBody)
      setSaving(false)
      if (!result.ok) return setFormError(result.message)
    } else {
      const result = await createTool(body as ToolCreateBody)
      setSaving(false)
      if (!result.ok) return setFormError(result.message)
      if (result.data.clientSecret) {
        setSecret({ label: result.data.tool.label, clientId: result.data.tool.clientId, clientSecret: result.data.clientSecret, previousValidUntil: null })
      }
    }
    setEditing(undefined)
    await reload()
  }

  /** Stage 5: runs the confirmed removal or secret replacement. */
  async function handleConfirm(): Promise<void> {
    if (!confirm) return
    setConfirmBusy(true)
    setConfirmError('')
    if (confirm.kind === 'delete') {
      const result = await deleteTool(confirm.tool.id)
      setConfirmBusy(false)
      if (!result.ok) return setConfirmError(result.message)
      // A removed tool can no longer be changed: close its registration form if it is open.
      if (editing?.id === confirm.tool.id) setEditing(undefined)
    } else {
      const result = await rotateToolSecret(confirm.tool.id, overlapHours)
      setConfirmBusy(false)
      if (!result.ok) return setConfirmError(result.message)
      setSecret({ label: confirm.tool.label, clientId: confirm.tool.clientId, clientSecret: result.data.clientSecret, previousValidUntil: result.data.previousSecretValidUntil })
    }
    setConfirm(null)
    await reload()
  }

  /** Stage 6: loads and shows a tool's recent activity. */
  async function showAudit(tool: ToolRegistration): Promise<void> {
    const result = await fetchToolAudit(tool.id)
    if (result.ok) setAudit({ label: tool.label, entries: result.data.entries })
    else setLoadError(result.message)
  }

  return (
    <section className={LAYOUT_STYLES.screen} data-kr-id="OutsideToolsAdmin">
      {/* Screen heading: what this is, where developers get the kit, and the registration action */}
      <div className={`${LAYOUT_STYLES.head} ${STYLES.card}`} data-kr-element="outside-tools-header">
        <div className={LAYOUT_STYLES.headTitle}>
          <h2 className={STYLES.title} title="The private GitHub repository contains the kit, developer guide and changes; access is granted to developer GitHub accounts there.">
            Outside tools
          </h2>
          {/* Private repository source and current versioned archive from R2. */}
          <a
            href={TOOL_SDK_REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={STYLES.kitLink}
            title="The private GitHub repository contains the kit, developer guide and changes. Give developers access through GitHub."
            data-kr-element="outside-tools-kit-link"
          >
            Private kit repository on GitHub
          </a>
          <ToolKitDownload />
        </div>
        <button type="button" className={`${STYLES.headButton} ${STYLES.primary}`} onClick={() => { setFormError(''); setEditing(null) }} disabled={editing !== undefined}>
          Register tool
        </button>
      </div>

      {loadError && <p className={STYLES.error} role="alert">{loadError}</p>}
      {secret && <ToolSecretNotice {...secret} onDone={() => setSecret(null)} />}
      {editing !== undefined && (
        <ToolRegistrationForm key={editing?.id ?? 'new'} tool={editing} busy={saving} error={formError} onSave={(body) => void handleSave(body)} onCancel={() => setEditing(undefined)} />
      )}
      {audit && <ToolAuditList label={audit.label} entries={audit.entries} onClose={() => setAudit(null)} />}

      {/* Registered tools: hidden while the registration form is open, so a tool cannot be removed or changed from the
          list while it is being edited (the requester, Nov 15, 2026) */}
      {editing === undefined && (
      <div className={`${STYLES.card} ${LAYOUT_STYLES.scroller}`} data-kr-id={'registered-outside-tool-list'}>
        {tools === null ? (
          loadError ? null : <RainbowBusySpinner busy hideWhenIdle={false} label="Loading tools..." size={18} />
        ) : tools.length === 0 ? (
          <p className={STYLES.text}>No outside tools are registered.</p>
        ) : (
          <table className={STYLES.table}>
            <thead>
              <tr>
                {['Tool', 'Address', 'Roles', 'Permissions', 'Status', 'Server', ''].map((name) => (
                  <th key={name || 'actions'} className={`${LAYOUT_STYLES.headCell} ${STYLES.th}`}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.id} data-kr-element="outside-tool-row">
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>
                    {/* Tool: its menu icon (own SVG, else built-in), label and client id */}
                    <div className={LAYOUT_STYLES.toolCell}>
                      {tool.iconSvg ? (
                        <ToolSvgIcon svg={tool.iconSvg} className={STYLES.toolIcon} fallback={<KRHomebaseIcon name={tool.icon} className={STYLES.toolIcon} />} />
                      ) : (
                        <KRHomebaseIcon name={tool.icon} className={STYLES.toolIcon} />
                      )}
                      <div>
                        <div className="font-semibold">{tool.label}</div>
                        <div className={STYLES.mono}>{tool.clientId}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td} ${STYLES.mono}`}>{tool.origin}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`} title="Anyone holding any one of these roles sees the tool">
                    {tool.allowedRoles.join(', ')}
                    {tool.localOnly && <span className={`${LAYOUT_STYLES.tag} ${STYLES.badgeOff}`} title="Shown only under pnpm dev" data-kr-element="tool-tag-local-only">local only</span>}
                    {tool.developersOnly && <span className={`${LAYOUT_STYLES.tag} ${STYLES.badgeOff}`} title="Shown only to people who hold developer_tools read" data-kr-element="tool-tag-developers-only">developers only</span>}
                  </td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{tool.scopes.length ? tool.scopes.join(', ') : 'none'}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>
                    <span className={tool.status === 'active' ? STYLES.badgeOn : STYLES.badgeOff}>{tool.status}</span>
                  </td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{tool.serverAccessEnabled ? (tool.hasSecret ? 'on' : 'on, no secret') : 'off'}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>
                    {/* Row actions */}
                    <div className={LAYOUT_STYLES.actions}>
                      <button type="button" className={`${STYLES.button} ${STYLES.plain}`} onClick={() => { setFormError(''); setEditing(tool) }}>Change</button>
                      <button type="button" className={`${STYLES.button} ${STYLES.plain}`} onClick={() => void showAudit(tool)}>Activity</button>
                      {tool.serverAccessEnabled && (
                        <button type="button" className={`${STYLES.button} ${STYLES.plain}`} onClick={() => { setConfirmError(''); setOverlapHours(24); setConfirm({ kind: 'rotate', tool }) }}>
                          {tool.hasSecret ? 'New secret' : 'Make secret'}
                        </button>
                      )}
                      <button type="button" className={`${STYLES.button} ${STYLES.danger}`} onClick={() => { setConfirmError(''); setConfirm({ kind: 'delete', tool }) }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* Confirmation for removing a tool or replacing its secret */}
      <U6ConfirmationDialog
        open={confirm !== null}
        title={confirm?.kind === 'delete' ? `Remove ${confirm.tool.label}?` : `New client secret for ${confirm?.tool.label ?? ''}?`}
        description={
          confirm?.kind === 'delete'
            ? 'The tool leaves the menu for everyone and its access tokens end now. Its activity record is kept.'
            : 'A new secret is made and shown once. Choose how long the current secret keeps working.'
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Remove tool' : 'Make new secret'}
        busy={confirmBusy}
        error={confirmError}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void handleConfirm()}
      >
        {confirm?.kind === 'rotate' && confirm.tool.hasSecret && (
          <label className={LAYOUT_STYLES.overlap}>
            <span>Current secret keeps working for</span>
            <select className={STYLES.field} value={overlapHours} onChange={(e) => setOverlapHours(Number(e.target.value))}>
              <option value={0}>0 hours (ends now, with its tokens)</option>
              <option value={24}>24 hours</option>
              <option value={72}>72 hours</option>
            </select>
          </label>
        )}
      </U6ConfirmationDialog>
    </section>
  )
}
