'use client'
// file: apps/web/features/gpt/components/GptEditorParts.client.tsx
/**
 * Pieces both GPT connection editors draw (the Gemini editor and the shared OpenAI / Cloudflare editor), moved out of
 * the old `M0_GeminiEditSettingsCard` and `GptSelectedConnectionCard`, which repeated them: the editor props, a
 * label-beside-field row, the connection id line with Copy, the credential status line, the Enabled switch, the action
 * row, and the readiness status, spinner and result well.
 *
 * Changed from the old editors: the readiness status line with Copy shows in both editors (the old shared card did
 * not show it); the copy button is the shared `KRCopyButton`.
 */

import type { ReactNode } from 'react'
import type { GptCredentialStatus, GptModelSettings, GptReadinessData } from '@krhomebase/contracts'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import GptInfoTip from '@/features/gpt/components/GptInfoTip.client'
import { LAYOUT_STYLES, STYLES } from '@/features/gpt/components/gptPanelStyles'
import { credentialStatusText, type GptCredentialDraft, type GptEditorBusy, type GptModelRow } from '@/features/gpt/gptGatewayRows'

/** What the page gives an editor (old `GptSelectedConnectionCardProps`). The page owns every value and handler. */
export interface GptEditorProps {
  model: GptModelRow
  settings: GptModelSettings
  credential: GptCredentialDraft
  credentialStatus: GptCredentialStatus | null
  readiness: GptReadinessData | null
  /** Safe readiness status text shown beneath the action row. */
  readinessStatus: string
  busy: GptEditorBusy
  /** True when the current non-secret settings match the last successful save. */
  settingsSaved: boolean
  updateSetting: <K extends keyof GptModelSettings>(key: K, value: GptModelSettings[K]) => void
  updateModel: (model: string) => void
  updateCredential: <K extends keyof GptCredentialDraft>(key: K, value: GptCredentialDraft[K]) => void
  checkReadiness: () => void
  saveCredential: () => void
  saveSettings: () => void
  loadUsageReport: () => void
  /** Copies the safe readiness status and response details. */
  copyReadiness: () => void
  onDelete: () => void
}

/** One label-beside-field row of an editor grid, with optional help text under the field and a help badge. */
export function GptField({ label, info, help, children, className = '', element }: { label: string; info?: string; help?: ReactNode; children: ReactNode; className?: string; element?: string }) {
  return (
    <label className={`${LAYOUT_STYLES.field} ${className}`} data-kr-element={element}>
      <span className={STYLES.fieldLabel}>
        {label}
        {info ? <GptInfoTip label={info} /> : null}
      </span>
      {children}
      {help ? <small className={`${LAYOUT_STYLES.helpSpan} ${STYLES.help}`}>{help}</small> : null}
    </label>
  )
}

/** The connection id line with Copy, and the credential status line (both editors' header). */
export function GptEditorIdLines({ model, credentialStatus }: Pick<GptEditorProps, 'model' | 'credentialStatus'>) {
  return (
    <>
      {model.krGptConnectionId ? (
        <div className={`${LAYOUT_STYLES.lineRow} ${STYLES.idLine}`} data-kr-element="kr-gpt-connection-id-display">
          <span>kr-gpt-connection-id:</span>
          <code className={STYLES.code}>{model.krGptConnectionId}</code>
          <KRCopyButton label="kr-gpt-connection-id" title="Copy kr-gpt-connection-id" value={model.krGptConnectionId} />
        </div>
      ) : null}
      <p className={STYLES.muted} data-kr-element="gpt-credential-status">Credential status: {credentialStatusText(credentialStatus)}</p>
    </>
  )
}

/** The "Enabled for application modules" switch (kept in the screen only, as before). */
export function GptEnabledSwitch({ settings, updateSetting }: Pick<GptEditorProps, 'settings' | 'updateSetting'>) {
  return (
    <label className={STYLES.switchField}>
      <input checked={settings.enabled} className={STYLES.check} onChange={(event) => updateSetting('enabled', event.target.checked)} type="checkbox" />
      <span>Enabled for application modules</span>
    </label>
  )
}

/** The action row. `gemini` uses the Gemini editor's words (Update Settings, Settings saved, Update API Credential). */
export function GptEditorActions(props: GptEditorProps & { variant: 'gemini' | 'shared' }) {
  const { busy, variant, settingsSaved, credential } = props
  const gemini = variant === 'gemini'
  const settingsLabel = gemini ? (busy === 'save' ? 'Updating...' : settingsSaved ? 'Settings saved' : 'Update Settings') : busy === 'save' ? 'Saving...' : 'Save Settings'
  const credentialLabel = gemini ? (busy === 'credential' ? 'Updating Credential...' : 'Update API Credential') : busy === 'credential' ? 'Saving Credential...' : 'Save Credential'
  return (
    <div className={LAYOUT_STYLES.actions} data-kr-element={gemini ? 'gemini-model-actions' : 'gpt-model-actions'}>
      <button className={`${STYLES.button} ${STYLES.primary}`} disabled={busy !== null} onClick={props.checkReadiness} type="button">{busy === 'readiness' ? 'Checking...' : 'Check GPT Readiness'}</button>
      <button
        className={`${STYLES.button} ${gemini && settingsSaved ? STYLES.saved : STYLES.secondary}`}
        disabled={busy !== null || (gemini && settingsSaved)}
        onClick={props.saveSettings}
        title={gemini ? 'Save non-secret Gemini settings such as key name, project metadata, token limit, endpoint, and usage rates.' : undefined}
        type="button"
      >
        {settingsLabel}
      </button>
      <button
        className={`${STYLES.button} ${STYLES.secondary}`}
        disabled={busy !== null || !credential.key}
        onClick={props.saveCredential}
        title={gemini ? 'Encrypt and save the Gemini API credential separately from model settings.' : 'Encrypt and save the credential separately from model settings.'}
        type="button"
      >
        {credentialLabel}
      </button>
      <button className={`${STYLES.button} ${STYLES.ghost}`} disabled={busy !== null} onClick={props.loadUsageReport} type="button">{busy === 'report' ? 'Refreshing...' : 'Refresh Usage Report'}</button>
      <button className={`${STYLES.button} ${STYLES.ghost}`} data-kr-action="delete-gpt-connection" disabled={busy !== null} onClick={props.onDelete} type="button">{busy === 'delete' ? 'Deleting...' : 'Delete Connection'}</button>
    </div>
  )
}

/** Readiness feedback: the status line with Copy, then the spinner while checking, or the result well afterwards. */
export function GptReadinessPanel({ busy, model, readiness, readinessStatus, copyReadiness }: Pick<GptEditorProps, 'busy' | 'model' | 'readiness' | 'readinessStatus' | 'copyReadiness'>) {
  return (
    <>
      {readinessStatus ? (
        <div aria-live="polite" className={`${LAYOUT_STYLES.readinessStatus} ${STYLES.readinessStatus}`} data-kr-element="gpt-readiness-status">
          <span>{readinessStatus}</span>
          <button className={STYLES.copyButton} onClick={copyReadiness} type="button">Copy</button>
        </div>
      ) : null}
      {/* Readiness feedback: show progress in the same result well that later receives the response. */}
      {busy === 'readiness' ? (
        <div aria-live="polite" className={`${LAYOUT_STYLES.result} ${STYLES.result}`} data-kr-element="gpt-readiness-spinner">
          <RainbowBusySpinner busy hideWhenIdle={false} label={`Checking ${model.displayName} readiness...`} size={18} />
        </div>
      ) : readiness ? (
        <div aria-live="polite" className={`${LAYOUT_STYLES.result} ${STYLES.result}`} data-kr-element="gpt-readiness-result">
          <strong className={STYLES.resultStrong}>Readiness response: {readiness.text || 'No text returned'}</strong>
          <span className={STYLES.resultLine}>
            {readiness.provider} · {readiness.model} · {readiness.latencyMs ?? '—'} ms · {readiness.usage.totalTokens ?? 0} total tokens · ${Number(readiness.cost.total || 0).toFixed(6)}
          </span>
        </div>
      ) : null}
    </>
  )
}
