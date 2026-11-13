'use client'
// file: apps/web/features/gpt/components/GptConnectionEditor.client.tsx
/**
 * The OpenAI Direct and Cloudflare AI Gateway connection editor (old `GptSelectedConnectionCard`, which the old
 * `M2_OpenAIEditSettingsCard` and `M1_CloudflareGatewayEditSettingsCard` wrapped with a provider label and kind; those
 * two wrappers are the `providerKind` prop now). Drawn under the models ledger, inside the section with the orange left
 * bar. The page owns every value and handler (`GptEditorProps`).
 *
 * Kept: "Selected connection", the provider line with the model id, the connection id with Copy, the credential
 * status, the Enabled switch; Approved API key reference, Credential type, Credential key or value (never returned),
 * Max output tokens, Temperature, Top P, Top K (disabled for Gemini 3.7 Flash), the three rates, System instruction,
 * Config 1 to 3, the future content storage switch; the actions; the readiness spinner and result. Old texts and
 * `data-kr-*` kept.
 *
 * Changed from the old card: labels sit beside their fields (Density Contract); the readiness status line with Copy
 * shows here too; "Credential type" edits the key name the page keeps (the old card kept two copies of it).
 */

import { GptEditorActions, GptEditorIdLines, GptEnabledSwitch, GptField, GptReadinessPanel, type GptEditorProps } from '@/features/gpt/components/GptEditorParts.client'
import { LAYOUT_STYLES, STYLES } from '@/features/gpt/components/gptPanelStyles'
import { numericInput } from '@/features/gpt/gptGatewayRows'

export interface GptConnectionEditorProps extends GptEditorProps {
  /** Which provider this editor configures (old M1 / M2 wrappers). */
  providerKind: 'openai' | 'cloudflare-ai-gateway'
}

/** The old wrappers' provider labels. */
const PROVIDER_LABELS = { openai: 'OpenAI Direct', 'cloudflare-ai-gateway': 'Cloudflare AI Gateway' } as const

export default function GptConnectionEditor(props: GptConnectionEditorProps) {
  const { model, settings, credential, credentialStatus, providerKind, updateCredential, updateSetting } = props
  const isGemini37Flash = model.model === 'gemini-3.7-flash'
  const numberSetting = (key: 'maxOutputTokens' | 'temperature' | 'topP' | 'topK' | 'inputRatePerMillion' | 'cachedRatePerMillion' | 'outputRatePerMillion', fallback: number) => (event: { target: { value: string } }) =>
    updateSetting(key, Number(event.target.value) || fallback)

  return (
    <section
      aria-label={`Configure ${model.displayName}`}
      className={`${LAYOUT_STYLES.section} ${STYLES.leftBar}`}
      data-kr-component="GptConnectionEditor"
      data-kr-element="gpt-model-editor"
      data-kr-gpt-connection-id={model.krGptConnectionId}
      data-kr-gpt-provider={providerKind}
      data-kr-id={`gpt-model-editor-${model.model}`}
      data-kr-record-id={model.id}
    >
      {/* Editor header: model, provider, connection id, credential status, Enabled switch */}
      <div className={LAYOUT_STYLES.sectionHeader}>
        <div>
          <p className={STYLES.eyebrow}>Selected connection</p>
          <h3 className={STYLES.editorTitle}>{model.displayName}</h3>
          <p className={STYLES.muted}>
            {PROVIDER_LABELS[providerKind]} · <code className={STYLES.code}>{model.model}</code>
          </p>
          <GptEditorIdLines credentialStatus={credentialStatus} model={model} />
        </div>
        <GptEnabledSwitch settings={settings} updateSetting={updateSetting} />
      </div>

      {/* Editor grid: key reference and value, generation controls, rates, instruction, provider values */}
      <div className={LAYOUT_STYLES.editorGrid}>
        <GptField help="Reference only; the credential value is encrypted before Worker storage." label="Approved API key reference">
          <input className={STYLES.input} onChange={(event) => updateSetting('approvedApiKey', event.target.value)} placeholder="gemini-primary" value={settings.approvedApiKey} />
        </GptField>
        <GptField help="Examples: api-key, account-id, project-id, gateway-auth-token." label="Credential type">
          <input className={STYLES.input} onChange={(event) => updateCredential('keyName', event.target.value)} placeholder="api-key" value={credential.keyName} />
        </GptField>
        <GptField help="Never returned after save. Save it separately from model settings." label="Credential key or value">
          <input autoComplete="new-password" className={STYLES.input} onChange={(event) => updateCredential('key', event.target.value)} placeholder="Enter a new credential value" type="password" value={credential.key} />
        </GptField>
        <GptField help="Readiness uses 1024 tokens." label="Max output tokens">
          <input className={STYLES.input} max={8192} min={1} onChange={numberSetting('maxOutputTokens', 1)} type="number" value={numericInput(settings.maxOutputTokens)} />
        </GptField>
        <GptField label="Temperature">
          <input className={STYLES.input} disabled={isGemini37Flash} max={2} min={0} onChange={numberSetting('temperature', 0)} step={0.1} type="number" value={numericInput(settings.temperature)} />
        </GptField>
        <GptField label="Top P">
          <input className={STYLES.input} disabled={isGemini37Flash} max={1} min={0} onChange={numberSetting('topP', 0)} step={0.05} type="number" value={numericInput(settings.topP)} />
        </GptField>
        <GptField help={isGemini37Flash ? 'Not sent to Gemini 3.7 Flash; retained as a neutral setting for other providers.' : 'Used by Gemini; retained as a neutral setting for other providers.'} label="Top K">
          <input className={STYLES.input} disabled={isGemini37Flash} max={100} min={0} onChange={numberSetting('topK', 0)} step={1} type="number" value={numericInput(settings.topK)} />
        </GptField>
        <GptField label="Input rate / 1M tokens">
          <input className={STYLES.input} min={0} onChange={numberSetting('inputRatePerMillion', 0)} step={0.01} type="number" value={numericInput(settings.inputRatePerMillion)} />
        </GptField>
        <GptField label="Cached rate / 1M tokens">
          <input className={STYLES.input} min={0} onChange={numberSetting('cachedRatePerMillion', 0)} step={0.01} type="number" value={numericInput(settings.cachedRatePerMillion)} />
        </GptField>
        <GptField label="Output rate / 1M tokens">
          <input className={STYLES.input} min={0} onChange={numberSetting('outputRatePerMillion', 0)} step={0.01} type="number" value={numericInput(settings.outputRatePerMillion)} />
        </GptField>
        <label className={`${LAYOUT_STYLES.fieldStack} ${LAYOUT_STYLES.wide}`} data-kr-element="gpt-system-instruction-row">
          <span className={STYLES.fieldLabel}>System instruction</span>
          <textarea className={STYLES.input} onChange={(event) => updateSetting('systemInstruction', event.target.value)} placeholder="Optional provider-side instruction" rows={3} value={settings.systemInstruction} />
        </label>
        <GptField label="Config 1">
          <input className={STYLES.input} onChange={(event) => updateCredential('config1', event.target.value)} placeholder="Gemini Google Cloud project ID" value={credential.config1} />
        </GptField>
        <GptField label="Config 2">
          <input className={STYLES.input} onChange={(event) => updateCredential('config2', event.target.value)} placeholder="Optional provider setting" value={credential.config2} />
        </GptField>
        <GptField label="Config 3">
          <input className={STYLES.input} onChange={(event) => updateCredential('config3', event.target.value)} placeholder="Optional provider setting" value={credential.config3} />
        </GptField>
        <label className={`${STYLES.switchField} ${LAYOUT_STYLES.full}`}>
          <input checked={settings.storePromptAndResponse} className={STYLES.check} onChange={(event) => updateSetting('storePromptAndResponse', event.target.checked)} type="checkbox" />
          <span>Allow future prompt/response content storage (not enabled by the usage schema)</span>
        </label>
      </div>

      {/* Actions, then readiness feedback */}
      <GptEditorActions {...props} variant="shared" />
      <GptReadinessPanel busy={props.busy} copyReadiness={props.copyReadiness} model={model} readiness={props.readiness} readinessStatus={props.readinessStatus} />
    </section>
  )
}
