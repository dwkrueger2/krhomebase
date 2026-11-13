'use client'
// file: apps/web/features/gpt/components/GptConnectionDialog.client.tsx
/**
 * The Edit Model Connection dialog of the GPT Model Gateway (old `dialog` constant of `GptModelConnectionsCard`;
 * reference `docs/API/Settings_AsIs_Reference.md` section 6.3). One dialog serves **Add a model connection** (from
 * Add connection) and **Edit model connection** (from a ledger row's pencil). The requester asked to keep its look
 * exactly (`docs/08_Settings_Dashboard_Plan.md` sections 1 and 4), so the old CSS values are repeated value for value
 * as Tailwind maps below, outside the Density Contract (a stated variation: DESIGN.md "Feature variations", Settings
 * IT cards). It now carries `data-kr-id="firm-settings-gpt-connection-dialog"`.
 *
 * The parent owns whether it is open and which connection it edits; this dialog owns its fields, its busy state and
 * its error, calls the API itself (as the old card did) and reports a saved or deleted connection to the parent.
 *
 * Changed from the old dialog:
 *  - The two native `window.confirm` questions (changing the connection type, Delete model) are asked in
 *    `U6ConfirmationDialog`, with the old sentences.
 *  - The close `×` and the help `i` are icons (`KRHomebaseIcons.Close`, `GptInfoTip`).
 *  - White surfaces read `--kr-theme-card-surface` (white in the light theme) so the dark theme works.
 *  - Calls go to `/api/v1/gpt/connections` (`api.client.ts`).
 *
 * @returns The dialog, or nothing while closed.
 */

import { useState, type FormEvent } from 'react'
import { GPT_CONNECTION_TYPES, type GptConnectionType, type GptModelConnection } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { deleteGptConnection, gptErrorSentence, saveGptConnection } from '@/features/gpt/api.client'
import GptInfoTip from '@/features/gpt/components/GptInfoTip.client'
import { connectionLabel } from '@/features/gpt/gptGatewayRows'

/** Old `.backdrop`, `.dialog`, `.dialogHeader`, `.form`, `.field`, `.dialogActions` (layout values kept exactly). */
const LAYOUT_STYLES = {
  backdrop: 'p-[16px] fixed inset-0 z-[100] flex items-center justify-center',
  dialog: 'p-[18px] gap-[14px] grid w-full max-w-[520px]',
  header: 'flex items-start justify-between',
  form: 'gap-[11px] grid',
  field: 'gap-[4px] grid',
  fieldLabel: 'gap-[6px] flex items-center',
  actions: 'gap-[8px] flex justify-end',
} as const

/** Old dialog CSS, value for value (`docs/API/Settings_AsIs_Reference.md` section 6.3). */
const STYLES = {
  backdrop: 'bg-[rgb(20_32_45/55%)]',
  dialog: 'border border-[var(--kr-theme-line,#d7dee5)] border-t-4 border-t-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-card-surface,#fff)] shadow-[0_18px_45px_rgb(20_32_45/25%)]',
  eyebrow: 'mt-0 mx-0 mb-[3px] text-[10px] font-[900] uppercase tracking-[.08em] text-[var(--kr-theme-orange,#e45e25)]',
  title: 'm-0 font-[family-name:var(--kr-theme-font-display,Georgia,serif)] text-[20px] text-[var(--kr-theme-brand-primary,#21394f)]',
  closeButton: 'py-0 px-[2px] cursor-pointer border-0 bg-transparent text-[22px] leading-none text-[var(--kr-theme-brand-primary,#21394f)]',
  fieldLabel: 'text-[11px] font-[850] text-[var(--kr-theme-brand-primary,#21394f)]',
  input:
    'p-[7px] w-full rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] font-[inherit] text-[12px] text-[var(--kr-theme-text,#1f3040)] focus:border-[var(--kr-theme-orange,#e45e25)] focus:outline-2 focus:outline-solid focus:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  help: 'text-[10px] leading-[1.3] text-[var(--kr-theme-text-muted,#526172)]',
  warning: 'm-0 py-[7px] px-[8px] border-l-[3px] border-l-[var(--kr-theme-orange,#e45e25)] bg-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_10%,var(--kr-theme-card-surface,#fff))] text-[12px] leading-[1.4] text-[var(--kr-theme-orange,#a9431b)]',
  error: 'm-0 py-[5px] px-[8px] border-l-[3px] border-l-[var(--kr-theme-orange,#e45e25)] text-[12px] leading-[1.45] text-[var(--kr-theme-orange,#a9431b)]',
  button:
    'py-[7px] px-[10px] cursor-pointer rounded-[2px] border font-[inherit] text-[12px] font-[850] outline-none hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)]',
  primary: 'border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[var(--kr-theme-text-inverse,#fff)] disabled:cursor-wait disabled:opacity-[.55]',
  secondary: 'border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[var(--kr-theme-brand-primary,#21394f)]',
  danger:
    'mr-auto py-[7px] px-[10px] cursor-pointer rounded-[2px] border border-[var(--kr-theme-error,var(--kr-theme-danger,#b42318))] bg-[var(--kr-theme-error,var(--kr-theme-danger,#b42318))] font-[inherit] text-[12px] font-[850] text-[var(--kr-theme-text-inverse,#fff)] outline-none hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-error,var(--kr-theme-danger,#b42318))_22%,transparent)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-error,var(--kr-theme-danger,#b42318))_22%,transparent)] disabled:cursor-wait disabled:opacity-[.55]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface GptConnectionDialogProps {
  /** The connection being edited, or null to add one. */
  editConnection: GptModelConnection | null
  /** Called after a save, with the saved row. */
  onSaved: (connection: GptModelConnection, edited: boolean) => void
  /** Called after a delete. */
  onDeleted: (connection: GptModelConnection) => void
  /** Called when the dialog closes (Cancel, ×, the backdrop, or after a save or delete). */
  onClose: () => void
}

/**
 * The open dialog. Mount it only while open, with `key` set to the edited connection's id (or "new"), so its fields
 * start from that connection each time (the old `useEffect` on `editConnection` did the same).
 */
export default function GptConnectionDialog({ editConnection, onClose, onDeleted, onSaved }: GptConnectionDialogProps) {
  const [connection, setConnection] = useState<GptConnectionType>(editConnection?.connection ?? 'cloudflare-ai-gateway')
  const [provider, setProvider] = useState(editConnection?.provider ?? 'Cloudflare AI Gateway')
  const [model, setModel] = useState(editConnection?.model ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ask, setAsk] = useState<'type-change' | 'delete' | null>(null)
  const connectionChanged = Boolean(editConnection && editConnection.connection !== connection)

  const close = () => {
    if (!saving) onClose()
  }
  /** Choosing a type other than Other sets Provider to that type's label (old behavior). */
  const changeConnection = (value: GptConnectionType) => {
    setConnection(value)
    if (value !== 'other') setProvider(connectionLabel(value))
  }

  async function save(): Promise<void> {
    setAsk(null)
    setSaving(true)
    setError('')
    try {
      // A changed type discards the previous connection settings (the warning's promise); otherwise they are kept.
      const keep = editConnection && !connectionChanged ? editConnection : null
      const { connection: saved } = await saveGptConnection(
        { connection, provider: provider.trim(), model: model.trim(), credentialName: keep?.credentialName, config1: keep?.config1 ?? null, config2: keep?.config2 ?? null, config3: keep?.config3 ?? null },
        editConnection?.id,
      )
      setSaving(false)
      onSaved(saved, Boolean(editConnection))
      onClose()
    } catch (requestError) {
      setError(gptErrorSentence(requestError, 'Connection save failed'))
      setSaving(false)
    }
  }

  async function remove(): Promise<void> {
    if (!editConnection) return
    setAsk(null)
    setSaving(true)
    setError('')
    try {
      await deleteGptConnection(editConnection.id)
      setSaving(false)
      onDeleted(editConnection)
      onClose()
    } catch (requestError) {
      setError(gptErrorSentence(requestError, 'Connection delete failed'))
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!provider.trim() || !model.trim()) {
      setError('Provider and exact provider model are required.')
      return
    }
    if (connectionChanged) setAsk('type-change')
    else void save()
  }

  return (
    <>
      {/* Backdrop: a press on the backdrop itself closes the dialog, unless it is saving (old behavior). */}
      <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
        <section aria-labelledby="gpt-connection-dialog-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-component="GptConnectionDialog" data-kr-id="firm-settings-gpt-connection-dialog" role="dialog">
          {/* Dialog header: eyebrow, title, close */}
          <header className={LAYOUT_STYLES.header}>
            <div>
              <p className={STYLES.eyebrow}>MODEL CONNECTION</p>
              <h3 className={STYLES.title} id="gpt-connection-dialog-title">{editConnection ? 'Edit model connection' : 'Add a model connection'}</h3>
            </div>
            <button aria-label="Close dialog" className={STYLES.closeButton} data-kr-element="gpt-connection-dialog-close" onClick={close} type="button">
              <KRHomebaseIcons.Close className="h-[22px] w-[22px]" />
            </button>
          </header>

          {/* Connection form: type, provider (Other only), exact model id, state */}
          <form className={LAYOUT_STYLES.form} onSubmit={submit}>
            <label className={LAYOUT_STYLES.field} data-kr-element="gpt-connection-type-row">
              <span className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.fieldLabel}`}>
                Connection <GptInfoTip label="This is the Connection Company source. How is the AI engine contacting the database." />
              </span>
              <select className={STYLES.input} onChange={(event) => changeConnection(event.target.value as GptConnectionType)} value={connection}>
                {GPT_CONNECTION_TYPES.map((value) => (
                  <option key={value} value={value}>{connectionLabel(value)}</option>
                ))}
              </select>
              <small className={STYLES.help}>Saved as the connection type: {connectionLabel(connection)}.</small>
            </label>
            {connection === 'other' ? (
              <label className={LAYOUT_STYLES.field} data-kr-element="gpt-connection-provider-row">
                <span className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.fieldLabel}`}>
                  Provider <GptInfoTip label="This is the descriptive model name" />
                </span>
                <input className={STYLES.input} onChange={(event) => setProvider(event.target.value)} placeholder="Enter provider name" required value={provider} />
              </label>
            ) : null}
            <label className={LAYOUT_STYLES.field} data-kr-element="gpt-connection-model-row">
              <span className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.fieldLabel}`}>Provider model</span>
              <input className={STYLES.input} onChange={(event) => setModel(event.target.value)} placeholder="Example: gemini-3.7-flash" required value={model} />
              <small className={STYLES.help}>Enter the exact provider model identifier from the API documentation.</small>
            </label>
            <div className={LAYOUT_STYLES.field} data-kr-element="gpt-connection-state-row">
              <span className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.fieldLabel}`}>
                State: Unconfigured <GptInfoTip label="Connection is considered to have a state as unconfigured until a successful test response is obtained" />
              </span>
            </div>
            {connectionChanged ? <p className={STYLES.warning} role="status">Changing the connection type will discard the previous connection settings when saved.</p> : null}
            {error ? <p className={STYLES.error} data-kr-element="gpt-connection-dialog-error">{error}</p> : null}

            {/* Dialog actions: Delete model (edit only, at the left), Cancel, Save */}
            <div className={LAYOUT_STYLES.actions}>
              {editConnection ? (
                <button className={STYLES.danger} data-kr-action="delete-gpt-model-connection" disabled={saving} onClick={() => setAsk('delete')} type="button">Delete model</button>
              ) : null}
              <button className={`${STYLES.button} ${STYLES.secondary}`} disabled={saving} onClick={close} type="button">Cancel</button>
              <button className={`${STYLES.button} ${STYLES.primary}`} data-kr-action="save-gpt-model-connection" disabled={saving} type="submit">{saving ? 'Saving...' : editConnection ? 'Save changes' : 'Add connection'}</button>
            </div>
          </form>
        </section>
      </div>

      {/* The two questions the old dialog asked with window.confirm */}
      <U6ConfirmationDialog
        busy={saving}
        confirmLabel="Save new type"
        description="Changing the connection type will discard the previous connection settings. Save the new connection type?"
        onCancel={() => setAsk(null)}
        onConfirm={() => void save()}
        open={ask === 'type-change'}
        title="Change the connection type?"
      />
      <U6ConfirmationDialog
        busy={saving}
        confirmLabel="Delete model"
        description={editConnection ? `Delete the ${editConnection.provider} · ${editConnection.model} connection?` : ''}
        onCancel={() => setAsk(null)}
        onConfirm={() => void remove()}
        open={ask === 'delete'}
        title="Delete this model connection?"
      />
    </>
  )
}
