// file: apps/web/features/gpt/gptGatewayRows.ts
/**
 * Display helpers for the GPT Model Gateway page (Settings plan, stage 7), moved out of the old `GptModelsPanel`
 * (`modelFromConnection`, `defaultSettings`, `defaultCredential`, `providerLabel`, the credential lookup and the
 * readiness copy text). No API calls and no rules: the API and the Worker decide everything.
 *
 * Changed from the old panel: the ledger State shows the connection's own word (configured or unconfigured) instead
 * of "prototype"; the credential editor no longer keeps a second copy of the key name (`credential`), only `keyName`;
 * a key saved in the old form is described as such (new `keyFormat`).
 */

import {
  GPT_CONNECTION_LABELS,
  GPT_DEFAULT_GENERATION_SETTINGS,
  GPT_DEFAULT_RATE_SETTINGS,
  GPT_GEMINI_37_FLASH_RATE_SETTINGS,
  type GptConnectionType,
  type GptCredentialStatus,
  type GptGatewayData,
  type GptModelConnection,
  type GptModelSettings,
  type GptProvider,
  type GptReadinessData,
} from '@krhomebase/contracts'

/** A row of the "Models in use" ledger: a saved connection whose type has an editor. */
export interface GptModelRow {
  /** The connection's row id. */
  id: string
  krGptConnectionId: string
  provider: GptProvider
  model: string
  displayName: string
  state: 'configured' | 'unconfigured'
  enabled: boolean
}

/** The credential fields the editors hold; `key` is sent once by Update API Credential and then cleared. */
export interface GptCredentialDraft {
  keyName: string
  key: string
  config1: string
  config2: string
  config3: string
}

/** Busy states shared by the editors (old `GptSelectedConnectionBusy`). */
export type GptEditorBusy = 'readiness' | 'save' | 'credential' | 'report' | 'delete' | null

/** The old ledger's Connection column. */
export function providerLabel(provider: string): string {
  if (provider === 'cloudflare-ai-gateway') return 'Cloudflare Gateway'
  if (provider === 'openai') return 'OpenAI Direct'
  return 'Gemini Direct'
}

/** The old dialog's label for a connection type. */
export const connectionLabel = (value: GptConnectionType): string => GPT_CONNECTION_LABELS[value] ?? value

/** The old display name: "Gemini 3.7 Flash" for that model, otherwise "{provider} · {model}". */
export function modelDisplayName(provider: string, model: string): string {
  return model === 'gemini-3.7-flash' ? 'Gemini 3.7 Flash' : `${provider} · ${model}`
}

/** One saved connection as a ledger row, or null for Anthropic-Claude and Other (no editor yet). */
export function modelFromConnection(connection: GptModelConnection): GptModelRow | null {
  const type = connection.connection
  if (type !== 'gemini' && type !== 'openai' && type !== 'cloudflare-ai-gateway') return null
  return {
    id: connection.id,
    krGptConnectionId: connection.krGptConnectionId || connection.id,
    provider: type,
    model: connection.model,
    displayName: modelDisplayName(connection.provider, connection.model),
    state: connection.state,
    enabled: connection.enabled,
  }
}

/** The ledger rows, sorted by display name (the old default sort). */
export function modelRows(connections: GptModelConnection[]): GptModelRow[] {
  return connections
    .map(modelFromConnection)
    .filter((row): row is GptModelRow => row !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** A complete editor state for one model (old `defaultSettings`). */
export function defaultSettings(model: Pick<GptModelRow, 'provider' | 'model' | 'enabled'>): GptModelSettings {
  return {
    ...GPT_DEFAULT_GENERATION_SETTINGS,
    ...(model.provider === 'gemini' ? { maxOutputTokens: 65536, thinkingLevel: 'medium' as const } : {}),
    ...(model.model === 'gemini-3.7-flash' ? GPT_GEMINI_37_FLASH_RATE_SETTINGS : GPT_DEFAULT_RATE_SETTINGS),
    approvedApiKey: `${model.provider}-primary`,
    enabled: model.enabled,
    storePromptAndResponse: false,
  }
}

/** The stored key that belongs to a row and key name (old lookup: the name first, then any key for the model). */
export function credentialStatusFor(gateway: Pick<GptGatewayData, 'credentials'> | null, row: Pick<GptModelRow, 'provider' | 'model'>, keyName: string | undefined): GptCredentialStatus | null {
  const forModel = (gateway?.credentials ?? []).filter((item) => item.provider === row.provider && item.llmModel === row.model)
  return forModel.find((item) => !keyName || item.credential === keyName) ?? forModel[0] ?? null
}

/** The editor's credential fields from the saved connection, the saved settings and the stored key (old load). */
export function credentialDraftFor(gateway: GptGatewayData | null, connection: GptModelConnection | undefined, row: GptModelRow): GptCredentialDraft {
  const saved = gateway?.savedSettings
  const metadata = saved && saved.model.provider === row.provider && saved.model.model === row.model ? saved.credentialMetadata : undefined
  const stored = credentialStatusFor(gateway, row, connection?.credentialName)
  const keyName = connection?.credentialName || metadata?.keyName || metadata?.credential || stored?.credential || 'api-key'
  return {
    keyName,
    key: '',
    config1: connection?.config1 || metadata?.config1 || stored?.config1 || '',
    config2: connection?.config2 || metadata?.config2 || stored?.config2 || 'krhomebase',
    config3: connection?.config3 || metadata?.config3 || stored?.config3 || '',
  }
}

/** The editor's settings for a row: defaults, then the saved settings when they were saved for this model. */
export function settingsFor(gateway: GptGatewayData | null, row: GptModelRow): { settings: GptModelSettings; saved: boolean } {
  const saved = gateway?.savedSettings
  const defaults = defaultSettings(row)
  if (!saved || saved.model.provider !== row.provider || saved.model.model !== row.model) return { settings: defaults, saved: false }
  return { settings: { ...defaults, ...saved.settings }, saved: true }
}

/** The old "Credential status" words. */
export function credentialStatusText(status: GptCredentialStatus | null): string {
  if (!status?.hasKey) return 'not configured'
  if (!status.isKeyEncrypted) return 'configured; plaintext legacy row'
  if (status.keyFormat === 'legacy') return 'configured with the old key form; save the key again'
  return 'configured and Worker-encrypted'
}

/** The text Copy puts on the clipboard (old `copyReadiness`; never a key). */
export function readinessCopyText(status: string, readiness: GptReadinessData | null): string {
  const lines = [status]
  if (readiness) {
    lines.push(
      `Response: ${readiness.text || 'No text returned'}`,
      `Provider: ${readiness.provider || '—'}`,
      `Model: ${readiness.model || '—'}`,
      `Latency: ${readiness.latencyMs ?? '—'} ms`,
      `Total tokens: ${readiness.usage.totalTokens ?? 0}`,
      `Cost: $${Number(readiness.cost.total || 0).toFixed(6)}`,
    )
  }
  return lines.filter(Boolean).join('\n')
}

/** A number as an input's value ('' when not a number). */
export function numericInput(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}
