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
 */

import { useCallback, useEffect, useState } from 'react'
import type { ToolAuditEntry, ToolCreateBody, ToolRegistration, ToolUpdateBody } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { createTool, deleteTool, fetchToolAudit, listTools, rotateToolSecret, updateTool } from '@/features/tools/api.client'
import ToolAuditList from '@/features/tools/components/ToolAuditList.client'
import ToolRegistrationForm from '@/features/tools/components/ToolRegistrationForm.client'
import ToolSecretNotice from '@/features/tools/components/ToolSecretNotice.client'

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
  screen: 'mx-[8px] my-[12px] lg:mx-auto md:my-[16px] max-w-[1100px] gap-[8px] flex flex-col',
  head: 'gap-[8px] flex flex-wrap items-center justify-between',
  scroller: 'overflow-x-auto',
  cell: 'px-[6px] py-[5px]',
  actions: 'gap-[4px] flex flex-wrap',
  overlap: 'mt-[6px] gap-[6px] flex items-center',
} as const

const STYLES = {
  card: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) p-[10px]',
  title: 'm-0 text-[length:var(--kr-theme-font-size-bigger)] font-semibold text-(color:--kr-theme-text)',
  text: 'm-0 text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-danger)',
  table: 'w-full border-collapse text-[12.5px]',
  th: 'text-left font-semibold bg-(--kr-theme-table-heading-light) border-b border-(--kr-theme-line)',
  td: 'border-b border-(--kr-theme-line) align-top',
  mono: 'font-mono text-[11.5px]',
  badgeOn: 'px-[6px] py-[1px] rounded-[2px] bg-(--kr-theme-success)/15 text-(color:--kr-theme-success) font-semibold',
  badgeOff: 'px-[6px] py-[1px] rounded-[2px] bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text-muted) font-semibold',
  button: 'px-[8px] py-[4px] rounded-[3px] border cursor-pointer text-[12px] disabled:cursor-wait disabled:opacity-65',
  plain: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  primary: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  danger: 'border-(--kr-theme-danger) bg-transparent text-(color:--kr-theme-danger)',
  field: 'px-[6px] py-[4px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
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
      {/* Screen heading: what this is, where the developer guide is, and the register button */}
      <div className={`${LAYOUT_STYLES.head} ${STYLES.card}`}>
        <div>
          <h2 className={STYLES.title}>Outside tools</h2>
          <p className={STYLES.text}>Tools other developers build for the left menu. Send developers the tool kit file and its guide (packages/tool-sdk/README.md).</p>
        </div>
        <button type="button" className={`${STYLES.button} ${STYLES.primary}`} onClick={() => { setFormError(''); setEditing(null) }} disabled={editing !== undefined}>
          Register tool
        </button>
      </div>

      {loadError && <p className={STYLES.error} role="alert">{loadError}</p>}
      {secret && <ToolSecretNotice {...secret} onDone={() => setSecret(null)} />}
      {editing !== undefined && (
        <ToolRegistrationForm key={editing?.id ?? 'new'} tool={editing} busy={saving} error={formError} onSave={(body) => void handleSave(body)} onCancel={() => setEditing(undefined)} />
      )}
      {audit && <ToolAuditList label={audit.label} entries={audit.entries} onClose={() => setAudit(null)} />}

      {/* Registered tools */}
      <div className={`${STYLES.card} ${LAYOUT_STYLES.scroller}`}>
        {tools === null ? (
          loadError ? null : <RainbowBusySpinner busy hideWhenIdle={false} label="Loading tools..." size={18} />
        ) : tools.length === 0 ? (
          <p className={STYLES.text}>No outside tools are registered.</p>
        ) : (
          <table className={STYLES.table}>
            <thead>
              <tr>
                {['Tool', 'Address', 'Roles', 'Permissions', 'Status', 'Server', ''].map((name) => (
                  <th key={name || 'actions'} className={`${LAYOUT_STYLES.cell} ${STYLES.th}`}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.id} data-kr-element="outside-tool-row">
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>
                    <div className="font-semibold">{tool.label}</div>
                    <div className={STYLES.mono}>{tool.clientId}</div>
                  </td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td} ${STYLES.mono}`}>{tool.origin}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{tool.allowedRoles.join(', ')}</td>
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
