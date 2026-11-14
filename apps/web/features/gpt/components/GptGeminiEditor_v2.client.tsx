'use client'
// file: apps/web/features/gpt/components/GptGeminiEditor_v2.client.tsx
/**
 * A proposed denser Gemini Direct connection editor (`_v2`; the requester, Nov 14, 2026: "propose an alternative
 * style ... keep [the original] exactly as is ... more vertically dense but still aesthetic"). The original
 * `GptGeminiEditor.client.tsx` (the old look, ported exactly) is untouched; `GptModelGatewayPage` draws this one
 * instead, and switching back is one import there.
 *
 * Same props, same behavior, every element and `data-kr-*` marker of the original: "Selected connection · Gemini
 * Direct", the title, "Gemini Model:" with the pencil, the connection id with Copy, the credential status, Enabled,
 * Thinking level, Max output tokens, the Google Cloud project name (config2) and ID (config1), Key Name, the Gemini API
 * key (hold to show, Upload .txt and its note), the three rates, the disabled System instruction, Advanced /
 * administrator settings (endpoint URL, AI Studio link), the five actions and the readiness feedback.
 *
 * Kept at the requester's direction: the 4px Signal Orange left bar and the orange "Selected connection" line. (The
 * Impeccable craft floor lists both an eyebrow and a colored left border as defaults to refuse; `DESIGN.md` marks the
 * eyebrow as intended and this feature's look as a stated exception, and the AGENTS files and `DESIGN.md` outrank
 * Impeccable, so they stay.)
 *
 * What makes it denser (the Density Contract in `DESIGN.md`; Operate mode, density 0.7):
 *  - The header is the original's (the requester, Nov 14, 2026, after seeing the two-line header): orange line, 20px
 *    title, then the Gemini Model, connection id and credential status lines, Enabled at the right. It uses the
 *    original's pieces (`GptEditorIdLines`, `GptEnabledSwitch`) and styles (`gptPanelStyles.ts`); the rest is denser.
 *  - Labels sit beside their fields in a ruled label column, two field pairs to a row from 1024px (one below).
 *  - The key's note and the info texts are tooltips (`GptInfoTip`) instead of lines of their own.
 *  - The three rates share one row; System instruction is one line (it is disabled: "not implemented at this time").
 *  - Fields 22px, buttons 24px, 8px card padding, 3px label-to-field gap, 6px between groups.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { GptEditorIdLines, GptEnabledSwitch, GptReadinessPanel, type GptEditorProps } from '@/features/gpt/components/GptEditorParts.client'
import GptInfoTip from '@/features/gpt/components/GptInfoTip.client'
import { LAYOUT_STYLES as HEADER_LAYOUT, STYLES as HEADER_STYLES } from '@/features/gpt/components/gptPanelStyles'
import { numericInput } from '@/features/gpt/gptGatewayRows'

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
const KEY_NOTE = 'Key text is read in the browser and sent only through the encrypted save path.'

const LAYOUT_STYLES = {
  /** The editor card: 8px padding, 6px between its groups. */
  section: 'p-[8px] gap-[6px] grid',
  /** Field pairs: label column and field column, twice from 1024px. */
  fieldGrid:
    'gap-x-[3px] gap-y-[3px] grid grid-cols-[max-content_minmax(0,1fr)] lg:grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)] items-center',
  /** A field pair spanning the whole grid width (label plus a field across the rest). */
  pairWide: 'lg:col-span-3',
  /** The second pair's label gets a little room after the first pair's field. */
  secondLabel: 'lg:pl-[10px]',
  label: 'pr-[4px] gap-[3px] inline-flex items-center',
  /** Key box, eye and Upload .txt on one line. */
  secretRow: 'gap-[3px] flex items-center',
  /** The three rates on one line. */
  ratesRow: 'gap-x-[10px] gap-y-[3px] flex flex-wrap items-center',
  rate: 'gap-[3px] inline-flex items-center',
  currency: 'relative inline-flex w-[76px] items-center',
  currencySign: 'absolute left-[5px]',
  /** Advanced settings: one line closed; endpoint and link when open. */
  advanced: 'pt-[4px]',
  advancedBody: 'mt-[4px] gap-x-[3px] gap-y-[3px] grid grid-cols-[max-content_minmax(0,1fr)] items-center',
  actions: 'gap-[4px] flex flex-wrap items-center',
  eye: 'size-[14px]',
} as const

const STYLES = {
  /** The bar on the left (kept), as the original's section. */
  section: 'border border-[var(--kr-theme-line,#d7dee5)] border-l-4 border-l-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-card-surface,#fff)] text-[var(--kr-theme-text,#1f3040)]',
  /** The ruled label column (rows of a register), 12px labels. */
  label: 'min-h-[22px] border-b border-[var(--kr-theme-line,#d7dee5)] text-[11px] font-[800] leading-[14px] whitespace-nowrap text-[var(--kr-theme-brand-primary,#21394f)]',
  input:
    'py-[2px] px-[4px] h-[22px] w-full min-w-0 rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] font-[inherit] text-[12px] leading-[16px] text-[var(--kr-theme-text,#1f3040)] focus:border-[var(--kr-theme-orange,#e45e25)] focus:outline-2 focus:outline-solid focus:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)] disabled:cursor-not-allowed disabled:bg-[var(--kr-theme-muted-surface,#eef3f7)] disabled:text-[var(--kr-theme-text-muted,#526172)] disabled:opacity-70',
  currencySign: 'pointer-events-none z-[1] text-[12px] text-[var(--kr-theme-text-muted,#526172)]',
  currencyInput: 'pl-[14px] tabular-nums text-right',
  revealButton:
    'h-[22px] w-[24px] p-0 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-brand-primary,#21394f)] hover:border-[var(--kr-theme-orange,#e45e25)] focus-visible:border-[var(--kr-theme-orange,#e45e25)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  fileButton:
    'h-[22px] px-[6px] shrink-0 cursor-pointer whitespace-nowrap rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)] hover:border-[var(--kr-theme-orange,#e45e25)]',
  /** A rate's short name: the label look without the ruled line. */
  rateLabel: 'text-[11px] font-[800] leading-[14px] whitespace-nowrap text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Figures right-aligned with even-width digits (DESIGN.md D4). */
  number: 'tabular-nums text-right',
  rateUnit: 'text-[10px] text-[var(--kr-theme-text-muted,#526172)]',
  advanced: 'border-t border-[var(--kr-theme-line,#d7dee5)]',
  summary: 'cursor-pointer text-[11px] font-[800] leading-[16px] text-[var(--kr-theme-brand-primary,#21394f)]',
  link: 'text-[11px] text-[var(--kr-theme-brand-primary-active,#0a4f9c)] underline underline-offset-2',
  /** 24px buttons; the same colors as the original's (orange primary, navy secondary, outlined ghost). */
  button:
    'py-[3px] px-[8px] h-[24px] cursor-pointer rounded-[2px] border font-[inherit] text-[11px] font-[800] leading-[16px] whitespace-nowrap hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-[.55]',
  primary: 'border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[var(--kr-theme-text-inverse,#fff)]',
  secondary: 'border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[var(--kr-theme-text-inverse,#fff)]',
  saved: 'cursor-default border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-text-muted,#526172)] hover:shadow-none disabled:cursor-default disabled:opacity-100',
  ghost: 'border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[var(--kr-theme-brand-primary,#21394f)]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** One label of the ruled label column, with an optional info tooltip. */
function FieldLabel({ htmlFor, text, info, className = '' }: { htmlFor?: string; text: string; info?: string; className?: string }) {
  return (
    <label className={`${LAYOUT_STYLES.label} ${className} ${STYLES.label}`} htmlFor={htmlFor}>
      {text}
      {info ? <GptInfoTip label={info} panel /> : null}
    </label>
  )
}

/** One rate: its short name, the $ box and "/ 1M". */
function Rate({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <span className={LAYOUT_STYLES.rate}>
      <label className={STYLES.rateLabel} htmlFor={id}>{label}</label>
      <span className={LAYOUT_STYLES.currency}>
        <span aria-hidden="true" className={`${LAYOUT_STYLES.currencySign} ${STYLES.currencySign}`}>$</span>
        <input className={`${STYLES.input} ${STYLES.currencyInput}`} id={id} min={0} onChange={(event) => onChange(Number(event.target.value) || 0)} step={0.001} type="number" value={numericInput(value)} />
      </span>
      <span className={STYLES.rateUnit}>/ 1M tokens</span>
    </span>
  )
}

/**
 * The denser Gemini Direct editor. The page owns every value and handler (`GptEditorProps`); this component owns only
 * the inline model-id edit, the hold-to-show key and the file upload, as the original does.
 *
 * @param props - The selected connection, its settings and credential draft, and the page's handlers.
 * @returns `<section data-kr-id="gpt-model-editor-<model>">` with the orange left bar.
 */
export default function GptGeminiEditorV2(props: GptEditorProps) {
  const { model, settings, credential, credentialStatus, updateCredential, updateModel, updateSetting, busy, settingsSaved } = props
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
  const settingsLabel = busy === 'save' ? 'Updating...' : settingsSaved ? 'Settings saved' : 'Update Settings'
  return (
    <section
      aria-label={`Configure ${model.displayName}`}
      className={`${LAYOUT_STYLES.section} ${STYLES.section}`}
      data-kr-component="GptGeminiEditorV2"
      data-kr-element="gpt-model-editor"
      data-kr-gpt-connection-id={model.krGptConnectionId}
      data-kr-gpt-provider="gemini"
      data-kr-id={`gpt-model-editor-${model.model}`}
      data-kr-record-id={model.id}
    >
      {/* Editor header, as the original (the requester, Nov 14, 2026: "move the top 3 lines identifying the model to
          how it looked in the original"): orange line, title, Gemini Model with the pencil, connection id with Copy,
          credential status, and the Enabled switch at the right. Drawn with the original's own pieces and styles. */}
      <div className={HEADER_LAYOUT.sectionHeader}>
        <div>
          <p className={`${HEADER_LAYOUT.eyebrow} ${HEADER_STYLES.eyebrow}`}>Selected connection · Gemini Direct</p>
          <h3 className={`${HEADER_LAYOUT.heading} ${HEADER_STYLES.editorTitle}`}>{model.displayName}</h3>
          <div className={HEADER_LAYOUT.modelLine}>
            <span className={`${HEADER_LAYOUT.muted} ${HEADER_STYLES.muted}`}>Gemini Model: </span>
            {editingModel ? (
              <input
                aria-label="Gemini model identifier"
                autoFocus
                className={HEADER_STYLES.inlineModelInput}
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
              className={HEADER_STYLES.iconButton}
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

      {/* Settings: label beside field, two pairs a row from 1024px */}
      <div className={LAYOUT_STYLES.fieldGrid} data-kr-element="gpt-editor-fields">
        <FieldLabel htmlFor="gpt-v2-thinking" info="Gemini 3.7 Flash uses low, medium, or high. Minimal is presented as an application option and is sent as low for this model." text="Thinking level" />
        <select className={STYLES.input} data-kr-element="gpt-thinking-level-row" id="gpt-v2-thinking" onChange={(event) => updateSetting('thinkingLevel', event.target.value as 'low' | 'medium' | 'high')} value={settings.thinkingLevel || 'medium'}>
          <option value="low">Low</option>
          <option value="medium">Medium (default)</option>
          <option value="high">High</option>
        </select>
        <FieldLabel className={LAYOUT_STYLES.secondLabel} htmlFor="gpt-v2-max-output" info="The current Gemini 3.7 Flash model maximum is 65,536 output tokens as of August 31, 2026. Readiness remains fixed at 1,024." text="Max output tokens" />
        <input className={`${STYLES.input} ${STYLES.number}`} data-kr-element="gpt-max-output-row" id="gpt-v2-max-output" max={65536} min={1} onChange={(event) => updateSetting('maxOutputTokens', Number(event.target.value) || 1)} type="number" value={numericInput(settings.maxOutputTokens || 65536)} />

        <FieldLabel htmlFor="gpt-v2-project-name" text="Google Cloud project name" />
        <input className={STYLES.input} data-kr-element="gpt-project-name-row" id="gpt-v2-project-name" onChange={(event) => updateCredential('config2', event.target.value)} placeholder="krhomebase" value={credential.config2 || 'krhomebase'} />
        <FieldLabel className={LAYOUT_STYLES.secondLabel} htmlFor="gpt-v2-project-id" text="Google Cloud project ID" />
        <input className={STYLES.input} data-kr-element="gpt-project-id-row" id="gpt-v2-project-id" onChange={(event) => updateCredential('config1', event.target.value)} placeholder="Project ID" value={credential.config1} />

        <FieldLabel htmlFor="gpt-v2-key-name" text="Key Name" />
        <input className={STYLES.input} data-kr-element="gpt-key-name-row" id="gpt-v2-key-name" onChange={(event) => updateCredential('keyName', event.target.value)} placeholder="krhomebase-gemini-key" value={credential.keyName} />
        <FieldLabel className={LAYOUT_STYLES.secondLabel} htmlFor="gpt-v2-api-key" info={KEY_NOTE} text="Gemini API key" />
        <span className={LAYOUT_STYLES.secretRow} data-kr-element="gpt-api-key-row">
          <input
            autoComplete="new-password"
            className={STYLES.input}
            id="gpt-v2-api-key"
            onChange={(event) => updateCredential('key', event.target.value)}
            placeholder={credentialStatus?.hasKey ? 'Enter a replacement key to change it' : 'Enter or upload an API key'}
            title={KEY_NOTE}
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
            <KRHomebaseIcons.Eye className={LAYOUT_STYLES.eye} />
          </button>
          {/* The file box is hidden; this button opens it. */}
          <button className={STYLES.fileButton} onClick={() => fileInput.current?.click()} title={KEY_NOTE} type="button">Upload .txt</button>
          <input accept=".txt,text/plain" className="hidden" onChange={handleApiKeyFile} ref={fileInput} type="file" />
        </span>

        {/* Rates in dollars per one million tokens, on one line */}
        <FieldLabel text="Rates" />
        <span className={`${LAYOUT_STYLES.ratesRow} ${LAYOUT_STYLES.pairWide}`} data-kr-element="gpt-rates-row">
          <Rate id="input-rate" label="Input" onChange={(value) => updateSetting('inputRatePerMillion', value)} value={settings.inputRatePerMillion} />
          <Rate id="cached-input-rate" label="Cached input" onChange={(value) => updateSetting('cachedRatePerMillion', value)} value={settings.cachedRatePerMillion} />
          <Rate id="output-rate" label="Output" onChange={(value) => updateSetting('outputRatePerMillion', value)} value={settings.outputRatePerMillion} />
        </span>

        {/* System instruction: disabled, so one line is enough */}
        <FieldLabel htmlFor="gpt-v2-system-instruction" info="Sending instructions not implemented at this time." text="System instruction" />
        <input
          className={`${STYLES.input} ${LAYOUT_STYLES.pairWide}`}
          data-kr-element="gpt-system-instruction-row"
          disabled
          id="gpt-v2-system-instruction"
          placeholder="Sending instructions not implemented at this time."
          title="Sending instructions not implemented at this time."
          value={settings.systemInstruction}
        />
      </div>

      {/* Advanced / administrator settings: endpoint URL and the AI Studio key page */}
      <details className={`${LAYOUT_STYLES.advanced} ${STYLES.advanced}`}>
        <summary className={STYLES.summary}>Advanced / administrator settings</summary>
        <div className={LAYOUT_STYLES.advancedBody}>
          <FieldLabel htmlFor="gpt-v2-endpoint" text="Gemini endpoint URL" />
          <input className={STYLES.input} id="gpt-v2-endpoint" onChange={(event) => updateSetting('endpointUrl', event.target.value)} value={endpoint} />
          <FieldLabel text="Google AI Studio API keys" />
          <a className={STYLES.link} href="https://aistudio.google.com/api-keys?project=gen-lang-client-0110909039" rel="noreferrer" target="_blank">open key management</a>
        </div>
      </details>

      {/* Actions: the original's five buttons and words, 24px tall */}
      <div className={LAYOUT_STYLES.actions} data-kr-element="gemini-model-actions">
        <button className={`${STYLES.button} ${STYLES.primary}`} disabled={busy !== null} onClick={props.checkReadiness} type="button">{busy === 'readiness' ? 'Checking...' : 'Check GPT Readiness'}</button>
        <button
          className={`${STYLES.button} ${settingsSaved ? STYLES.saved : STYLES.secondary}`}
          disabled={busy !== null || settingsSaved}
          onClick={props.saveSettings}
          title="Save non-secret Gemini settings such as key name, project metadata, token limit, endpoint, and usage rates."
          type="button"
        >
          {settingsLabel}
        </button>
        <button
          className={`${STYLES.button} ${STYLES.secondary}`}
          disabled={busy !== null || !credential.key}
          onClick={props.saveCredential}
          title="Encrypt and save the Gemini API credential separately from model settings."
          type="button"
        >
          {busy === 'credential' ? 'Updating Credential...' : 'Update API Credential'}
        </button>
        <button className={`${STYLES.button} ${STYLES.ghost}`} disabled={busy !== null} onClick={props.loadUsageReport} type="button">{busy === 'report' ? 'Refreshing...' : 'Refresh Usage Report'}</button>
        <button className={`${STYLES.button} ${STYLES.ghost}`} data-kr-action="delete-gpt-connection" disabled={busy !== null} onClick={props.onDelete} type="button">{busy === 'delete' ? 'Deleting...' : 'Delete Connection'}</button>
      </div>

      {/* Readiness feedback: the original's status line, spinner and orange result well */}
      <GptReadinessPanel busy={busy} copyReadiness={props.copyReadiness} model={model} readiness={props.readiness} readinessStatus={props.readinessStatus} />
    </section>
  )
}
