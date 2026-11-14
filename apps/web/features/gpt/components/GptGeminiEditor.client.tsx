'use client'
// file: apps/web/features/gpt/components/GptGeminiEditor.client.tsx
/**
 * The Gemini Direct connection editor (old `M0_GeminiEditSettingsCard`), drawn under the models ledger for a selected
 * Gemini connection, inside the section with the orange left bar. The page owns every value and handler
 * (`GptEditorProps`); this component owns only the inline model-id edit, the hold-to-show key and the file upload.
 *
 * Kept: "Selected connection · Gemini Direct"; "Gemini Model:" with the pencil to edit the id for this session; the
 * connection id with Copy; the credential status; the Enabled switch; Thinking level; Max output tokens; Google Cloud
 * project name (config2) and ID (config1); Key Name; Gemini API key (hold to show, Upload .txt); the three rates in
 * dollars per million tokens; the disabled System instruction; Advanced / administrator settings with the endpoint URL
 * and the AI Studio key link; the actions; the readiness status, spinner and result. Every old text and `data-kr-*`.
 *
 * Exact old look, a stated exception (the requester, Nov 14, 2026: 'make exception for the style of this feature and
 * bring it over exactly as it is implemented in the old project'); see DESIGN.md Feature variations. Labels flow
 * before their fields as the old `.field` did, and the empty two-column cell before System instruction is kept, so
 * System instruction starts a row of its own as before.
 *
 * Changed from the old editor: the `✎` is `KRHomebaseIcons.Pencil` and the eye is `KRHomebaseIcons.Eye`; Upload .txt
 * is a button that opens the hidden file box (the old one was a label around it).
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { GptEditorActions, GptEditorIdLines, GptEnabledSwitch, GptField, GptReadinessPanel, type GptEditorProps } from '@/features/gpt/components/GptEditorParts.client'
import GptInfoTip from '@/features/gpt/components/GptInfoTip.client'
import { LAYOUT_STYLES, STYLES } from '@/features/gpt/components/gptPanelStyles'
import { numericInput } from '@/features/gpt/gptGatewayRows'

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'

/** One rate input with its $ sign (old `.currencyInput`). */
function RateInput({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className={STYLES.currency}>
      <span aria-hidden="true" className={STYLES.currencySign}>$</span>
      <input className={`${STYLES.input} ${STYLES.currencyInput}`} id={id} min={0} onChange={(event) => onChange(Number(event.target.value) || 0)} step={0.001} type="number" value={numericInput(value)} />
    </div>
  )
}

export default function GptGeminiEditor(props: GptEditorProps) {
  const { model, settings, credential, credentialStatus, updateCredential, updateModel, updateSetting } = props
  const [showApiKey, setShowApiKey] = useState(false)
  const [editingModel, setEditingModel] = useState(false)
  const [modelDraft, setModelDraft] = useState(model.model)
  const fileInput = useRef<HTMLInputElement>(null)

  /** Reads a .txt file in the browser and puts its text in the key field (never sent until Update API Credential). */
  function handleApiKeyFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void file.text().then((value) => updateCredential('key', value.trim()))
  }

  function commitModel(): void {
    const nextModel = modelDraft.trim()
    if (nextModel) updateModel(nextModel)
    else setModelDraft(model.model)
    setEditingModel(false)
  }

  const endpoint = settings.endpointUrl || GEMINI_ENDPOINT
  return (
    <section
      aria-label={`Configure ${model.displayName}`}
      className={`${LAYOUT_STYLES.section} ${STYLES.leftBar}`}
      data-kr-component="GptGeminiEditor"
      data-kr-element="gpt-model-editor"
      data-kr-gpt-connection-id={model.krGptConnectionId}
      data-kr-gpt-provider="gemini"
      data-kr-id={`gpt-model-editor-${model.model}`}
      data-kr-record-id={model.id}
    >
      {/* Editor header: model, connection id, credential status, Enabled switch */}
      <div className={LAYOUT_STYLES.sectionHeader}>
        <div>
          <p className={`${LAYOUT_STYLES.eyebrow} ${STYLES.eyebrow}`}>Selected connection · Gemini Direct</p>
          <h3 className={`${LAYOUT_STYLES.heading} ${STYLES.editorTitle}`}>{model.displayName}</h3>
          <div className={LAYOUT_STYLES.modelLine}>
            <span className={`${LAYOUT_STYLES.muted} ${STYLES.muted}`}>Gemini Model: </span>
            {editingModel ? (
              <input
                aria-label="Gemini model identifier"
                autoFocus
                className={STYLES.inlineModelInput}
                onBlur={commitModel}
                onChange={(event) => setModelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitModel()
                  if (event.key === 'Escape') {
                    setModelDraft(model.model)
                    setEditingModel(false)
                  }
                }}
                value={modelDraft}
              />
            ) : (
              <code>{model.model}</code>
            )}
            <button
              aria-label={editingModel ? 'Finish editing Gemini model identifier' : 'Edit Gemini model identifier'}
              className={STYLES.iconButton}
              onClick={() => { if (editingModel) commitModel(); else { setModelDraft(model.model); setEditingModel(true) } }}
              title={editingModel ? 'Finish editing model identifier' : 'Edit model identifier'}
              type="button"
            >
              <KRHomebaseIcons.Pencil className="h-[13px] w-[13px]" />
            </button>
          </div>
          <GptEditorIdLines credentialStatus={credentialStatus} model={model} />
        </div>
        <GptEnabledSwitch settings={settings} updateSetting={updateSetting} />
      </div>

      {/* Editor grid: generation, Google Cloud project, key, rates, instruction */}
      <div className={LAYOUT_STYLES.editorGrid}>
        <GptField element="gpt-thinking-level-row" info="Gemini 3.7 Flash uses low, medium, or high. Minimal is presented as an application option and is sent as low for this model." label="Thinking level">
          <select className={STYLES.input} onChange={(event) => updateSetting('thinkingLevel', event.target.value as 'low' | 'medium' | 'high')} value={settings.thinkingLevel || 'medium'}>
            <option value="low">Low</option>
            <option value="medium">Medium (default)</option>
            <option value="high">High</option>
          </select>
        </GptField>
        <GptField element="gpt-max-output-row" info="The current Gemini 3.7 Flash model maximum is 65,536 output tokens as of August 31, 2026. Readiness remains fixed at 1,024." label="Max output tokens">
          <input className={STYLES.input} max={65536} min={1} onChange={(event) => updateSetting('maxOutputTokens', Number(event.target.value) || 1)} type="number" value={numericInput(settings.maxOutputTokens || 65536)} />
        </GptField>
        <GptField element="gpt-project-name-row" label="Google Cloud project name">
          <input className={STYLES.input} onChange={(event) => updateCredential('config2', event.target.value)} placeholder="krhomebase" value={credential.config2 || 'krhomebase'} />
        </GptField>
        <GptField element="gpt-project-id-row" label="Google Cloud project ID">
          <input className={STYLES.input} onChange={(event) => updateCredential('config1', event.target.value)} placeholder="Project ID" value={credential.config1} />
        </GptField>

        <GptField className={LAYOUT_STYLES.wide} element="gpt-key-name-row" label="Key Name">
          <input className={`${STYLES.input} ${STYLES.inputFull}`} onChange={(event) => updateCredential('keyName', event.target.value)} placeholder="krhomebase-gemini-key" value={credential.keyName} />
        </GptField>
        <GptField className={LAYOUT_STYLES.wide} element="gpt-api-key-row" label="Gemini API key">
          <span className={LAYOUT_STYLES.secretRow}>
            <input
              autoComplete="new-password"
              className={`${STYLES.input} ${STYLES.inputSecret}`}
              onChange={(event) => updateCredential('key', event.target.value)}
              placeholder={credentialStatus?.hasKey ? 'Enter a replacement key to change it' : 'Enter or upload an API key'}
              type={showApiKey ? 'text' : 'password'}
              value={credential.key}
            />
            <button
              aria-label="Hold to show Gemini API key"
              className={STYLES.revealButton}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setShowApiKey(true) }}
              onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') setShowApiKey(false) }}
              onPointerCancel={() => setShowApiKey(false)}
              onPointerDown={() => setShowApiKey(true)}
              onPointerLeave={() => setShowApiKey(false)}
              onPointerUp={() => setShowApiKey(false)}
              title="Hold to show API key"
              type="button"
            >
              <KRHomebaseIcons.Eye className="h-[16px] w-[16px]" />
            </button>
          </span>
          {/* Upload row (old `.uploadRow`): the help text, then Upload .txt */}
          <span className={`${LAYOUT_STYLES.uploadRow} ${STYLES.uploadRow}`}>
            <small className={STYLES.help}>Key text is read in the browser and sent only through the encrypted save path.</small>
            {/* The file box is hidden; this button opens it (a label inside the field's label would be invalid). */}
            <button className={STYLES.fileButton} onClick={(event) => { event.preventDefault(); fileInput.current?.click() }} type="button">Upload .txt</button>
            <input accept=".txt,text/plain" className="hidden" onChange={handleApiKeyFile} ref={fileInput} type="file" />
          </span>
        </GptField>

        {/* Rates in dollars per one million tokens */}
        <div className={`${LAYOUT_STYLES.rates} ${LAYOUT_STYLES.wide}`} data-kr-element="gpt-rates-row">
          <label className={STYLES.fieldLabel} htmlFor="input-rate">Input rate / 1M tokens</label>
          <RateInput id="input-rate" onChange={(value) => updateSetting('inputRatePerMillion', value)} value={settings.inputRatePerMillion} />
          <label className={STYLES.fieldLabel} htmlFor="cached-input-rate">Cached input / 1M tokens</label>
          <RateInput id="cached-input-rate" onChange={(value) => updateSetting('cachedRatePerMillion', value)} value={settings.cachedRatePerMillion} />
          <label className={STYLES.fieldLabel} htmlFor="output-rate">Output / 1M tokens</label>
          <RateInput id="output-rate" onChange={(value) => updateSetting('outputRatePerMillion', value)} value={settings.outputRatePerMillion} />
        </div>
        {/* The old empty two-column cell: it fills the rates row so System instruction starts a row of its own. */}
        <span aria-hidden="true" className={`${LAYOUT_STYLES.field} ${LAYOUT_STYLES.wide}`} />
        <label className={`${LAYOUT_STYLES.fieldStack} ${LAYOUT_STYLES.wide}`} data-kr-element="gpt-system-instruction-row">
          <span className={STYLES.fieldLabel}>
            System instruction <GptInfoTip label="Sending instructions not implemented at this time." panel />
          </span>
          <textarea className={`${STYLES.input} ${STYLES.inputFull}`} disabled placeholder="Sending instructions not implemented at this time." rows={2} title="Sending instructions not implemented at this time." value={settings.systemInstruction} />
        </label>
      </div>

      {/* Advanced / administrator settings: endpoint URL and the AI Studio key page */}
      <details className={`${LAYOUT_STYLES.advanced} ${STYLES.advanced}`}>
        <summary className={STYLES.summary}>Advanced / administrator settings</summary>
        {/* Advanced content (old `.advancedContent`): a grid in which the endpoint field spans two columns, as before */}
        <div className={LAYOUT_STYLES.advancedContent}>
          <GptField className={LAYOUT_STYLES.wide} label="Gemini endpoint URL">
            <input className={STYLES.input} onChange={(event) => updateSetting('endpointUrl', event.target.value)} value={endpoint} />
          </GptField>
          <p className={`${LAYOUT_STYLES.muted} ${STYLES.muted}`}>
            Google AI Studio API keys:{' '}
            <a href="https://aistudio.google.com/api-keys?project=gen-lang-client-0110909039" rel="noreferrer" target="_blank">open key management</a>
          </p>
        </div>
      </details>

      {/* Actions, then readiness feedback */}
      <GptEditorActions {...props} variant="gemini" />
      <GptReadinessPanel busy={props.busy} copyReadiness={props.copyReadiness} model={model} readiness={props.readiness} readinessStatus={props.readinessStatus} />
    </section>
  )
}
