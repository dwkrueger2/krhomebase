// file: packages/contracts/src/gpt.ts
/**
 * GPT Model Gateway (Settings and Dashboard plan, stage 7; Firm Settings → GPT Model Gateway, super admin only).
 * The provider connections, keys, settings and token usage live in the GPT usage database
 * (`docs/Schema_GPT_Usage_1.1`), reached only through the GPT models Worker
 * (`workers/gpt-workers/gpt-models-worker.ts`) over the API's service binding.
 *
 *   GET    /v1/gpt/gateway                               connections, key status, saved settings and usage (super admin)
 *   POST   /v1/gpt/connections                           add a model connection (super admin)
 *   PUT    /v1/gpt/connections/{connectionId}            change a model connection (super admin)
 *   DELETE /v1/gpt/connections/{connectionId}            delete a model connection and, when it was the last one for
 *                                                        that model, its stored keys (super admin)
 *   POST   /v1/gpt/readiness                             send the fixed readiness prompt to a model (super admin)
 *   PUT    /v1/gpt/settings                              save the approved application settings (super admin)
 *   PUT    /v1/gpt/credentials                           save a provider key; write-only (super admin)
 *   GET    /v1/gpt/usage                                 the token usage report (super admin)
 *
 * Kept from the old `GptGatewayTypes.ts`: the shapes, names, defaults and the Gemini 3.7 Flash rates. Changed: the old
 * single route chose its work by an `action` field; there is now one route per action. A provider key is accepted
 * by one route only and never appears in a reply. The readiness prompt is fixed by the API (the old route accepted
 * any prompt up to 4,000 characters, though the screen only ever sent the fixed one).
 */

import { z } from 'zod'

/** Provider adapters the Worker can call. */
export const GPT_PROVIDERS = ['cloudflare-ai-gateway', 'gemini', 'openai'] as const
/** Connection types the Edit Model Connection dialog offers, in the old dialog's order. */
export const GPT_CONNECTION_TYPES = ['cloudflare-ai-gateway', 'gemini', 'openai', 'anthropic-claude', 'other'] as const
/** The old dialog's labels for each connection type. */
export const GPT_CONNECTION_LABELS: Record<(typeof GPT_CONNECTION_TYPES)[number], string> = {
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  gemini: 'Gemini',
  openai: 'Open AI',
  'anthropic-claude': 'Anthropic-Claude',
  other: 'Other',
}
/** Gemini thinking levels (Minimal is sent as Low for Gemini 3 models). */
export const GPT_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const

export const GptProvider = z.enum(GPT_PROVIDERS).describe('Provider adapter: Cloudflare AI Gateway, Gemini or OpenAI.')
export type GptProvider = z.infer<typeof GptProvider>
export const GptConnectionType = z.enum(GPT_CONNECTION_TYPES).describe('Connection type: how the AI engine is reached.')
export type GptConnectionType = z.infer<typeof GptConnectionType>
export const GptConnectionState = z.enum(['unconfigured', 'configured']).describe('Unconfigured until a readiness check has succeeded.')
export type GptConnectionState = z.infer<typeof GptConnectionState>

const configValue = (which: string) => z.string().max(2000).nullable().optional().describe(`Provider-specific, non-secret ${which} value.`)

/** One saved model connection (no secret). */
export const GptModelConnection = z.object({
  id: z.string().describe('Row id in gpt_model_connection.'),
  krGptConnectionId: z.string().describe('Short stable connection id used by application modules and display surfaces.'),
  connection: GptConnectionType,
  provider: z.string().describe('Provider name (the connection label, or the typed name for Other).'),
  model: z.string().describe('Exact provider model identifier, for example gemini-3.7-flash.'),
  credentialName: z.string().describe('Name of the stored credential row this connection uses (non-secret).'),
  config1: z.string().nullable().describe('Provider-specific, non-secret value (Gemini: Google Cloud project id).'),
  config2: z.string().nullable().describe('Provider-specific, non-secret value (Gemini: Google Cloud project name).'),
  config3: z.string().nullable().describe('Provider-specific, non-secret value.'),
  state: GptConnectionState,
  enabled: z.boolean().describe('Whether the connection is offered to application modules (always true today).'),
})
export type GptModelConnection = z.infer<typeof GptModelConnection>

/** What is stored about one provider key; the key itself is never sent. */
export const GptCredentialStatus = z.object({
  provider: z.string().describe('Provider adapter the key belongs to.'),
  llmModel: z.string().describe('Provider model identifier the key belongs to.'),
  credential: z.string().describe('Credential name, for example api-key or gateway-auth-token.'),
  hasKey: z.boolean().describe('True when a key is stored.'),
  isKeyEncrypted: z.boolean().describe('True when the stored key is encrypted at rest.'),
  keyFormat: z.enum(['current', 'legacy', 'plain']).describe('current: sealed by the Worker; legacy: the old form, save the key again; plain: not encrypted.'),
  config1: z.string().nullable().describe('Non-secret value 1 stored with the key.'),
  config2: z.string().nullable().describe('Non-secret value 2 stored with the key.'),
  config3: z.string().nullable().describe('Non-secret value 3 stored with the key.'),
})
export type GptCredentialStatus = z.infer<typeof GptCredentialStatus>

/** Provider-neutral generation controls and cost rates (dollars per one million tokens). */
export const GptModelSettings = z.object({
  maxOutputTokens: z.number().int().min(1).max(65536).describe('Most tokens the model may write (readiness always uses 1,024).'),
  temperature: z.number().min(0).max(2).describe('Sampling temperature.'),
  topP: z.number().min(0).max(1).describe('Nucleus sampling value.'),
  topK: z.number().int().min(0).max(100).describe('Gemini top-k; ignored by providers that do not use it.'),
  systemInstruction: z.string().max(4000).describe('Optional provider-side system instruction.'),
  endpointUrl: z.string().max(500).describe('Gemini endpoint template ({model} is replaced); an https address or empty.'),
  thinkingLevel: z.enum(GPT_THINKING_LEVELS).describe('Gemini thinking level.'),
  inputRatePerMillion: z.number().min(0).max(100000).describe('Input token rate in dollars per one million tokens.'),
  cachedRatePerMillion: z.number().min(0).max(100000).describe('Cached input token rate in dollars per one million tokens.'),
  outputRatePerMillion: z.number().min(0).max(100000).describe('Output token rate in dollars per one million tokens.'),
  approvedApiKey: z.string().max(120).describe('Non-secret reference to the approved key, for example gemini-primary.'),
  enabled: z.boolean().describe('Whether the connection is enabled for application modules (kept in the screen only, as before).'),
  storePromptAndResponse: z.boolean().describe('Whether future content storage is allowed (not stored by the usage schema).'),
})
export type GptModelSettings = z.infer<typeof GptModelSettings>

/** The model a command is about. */
export const GptModelRef = z.object({
  provider: GptProvider,
  model: z.string().trim().min(1).max(160).describe('Exact provider model identifier.'),
  krGptConnectionId: z.string().trim().max(96).optional().describe('The connection id, so usage and settings are tied to the right connection.'),
  displayName: z.string().trim().max(160).optional().describe('Readable model label.'),
})
export type GptModelRef = z.infer<typeof GptModelRef>

/** Non-secret credential details sent with settings and readiness. */
export const GptCredentialMetadata = z.object({
  credentialName: z.string().trim().min(2).max(120).describe('Credential name (the old "Key Name"), for example api-key.'),
  config1: configValue('first'),
  config2: configValue('second'),
  config3: configValue('third'),
})
export type GptCredentialMetadata = z.infer<typeof GptCredentialMetadata>

/** The approved application settings saved last, as the Worker stored them. */
export const GptSavedSettings = z.object({
  model: GptModelRef.describe('The model the settings were saved for.'),
  settings: GptModelSettings.partial().describe('The saved generation settings and rates.'),
  credentialMetadata: z
    .object({
      keyName: z.string().optional().describe('Credential name saved with the settings.'),
      credential: z.string().optional().describe('Credential name (old duplicate of keyName).'),
      config1: z.string().optional().describe('Non-secret value 1.'),
      config2: z.string().optional().describe('Non-secret value 2.'),
      config3: z.string().optional().describe('Non-secret value 3.'),
    })
    .optional()
    .describe('Non-secret credential details saved with the settings.'),
})
export type GptSavedSettings = z.infer<typeof GptSavedSettings>

const tokenCount = (what: string) => z.number().int().min(0).describe(`${what} tokens.`)

/** One row of the usage report: one model and connection. */
export const GptUsageRow = z.object({
  modelProvider: z.string().describe('Provider adapter.'),
  modelName: z.string().describe('Provider model identifier.'),
  krGptConnectionId: z.string().nullable().describe('Connection id the usage was recorded for, when known.'),
  requestCount: z.number().int().min(0).describe('Number of requests.'),
  inputTokens: tokenCount('Input'),
  cachedTokens: tokenCount('Cached input'),
  outputTokens: tokenCount('Output'),
  totalTokens: tokenCount('Total'),
  totalCost: z.number().min(0).describe('Total cost in dollars.'),
  lastRequestedAt: z.string().nullable().describe('When the latest request was made (ISO time).'),
})
export type GptUsageRow = z.infer<typeof GptUsageRow>

export const GptUsageData = z.object({
  applicationId: z.string().describe('Application the usage belongs to (krhomebase).'),
  rows: z.array(GptUsageRow).describe('Usage by model, newest first.'),
  totals: z
    .object({
      requestCount: z.number().int().min(0).describe('Number of requests.'),
      inputTokens: tokenCount('Input'),
      cachedTokens: tokenCount('Cached input'),
      outputTokens: tokenCount('Output'),
      totalTokens: tokenCount('Total'),
      totalCost: z.number().min(0).describe('Total cost in dollars.'),
    })
    .describe('Sums over the rows.'),
})
export type GptUsageData = z.infer<typeof GptUsageData>

export const GptUsageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().describe('Most rows to return (default 50).'),
})
export type GptUsageQuery = z.infer<typeof GptUsageQuery>

/** Everything the GPT Model Gateway page draws first. */
export const GptGatewayData = z.object({
  applicationId: z.string().describe('Application the settings belong to (krhomebase).'),
  connections: z.array(GptModelConnection).describe('Saved model connections.'),
  credentials: z.array(GptCredentialStatus).describe('What is stored about each provider key (never the key).'),
  savedSettings: GptSavedSettings.nullable().describe('The approved application settings saved last, if any.'),
  usage: GptUsageData.describe('The token usage report (latest 50 rows).'),
})
export type GptGatewayData = z.infer<typeof GptGatewayData>

/** Add or change a model connection (the Edit Model Connection dialog). */
export const GptConnectionBody = z
  .object({
    connection: GptConnectionType,
    provider: z.string().trim().min(1).max(160).describe('Provider name; for Other, the typed name (at least 2 characters).'),
    model: z.string().trim().min(1).max(160).describe('Exact provider model identifier.'),
    credentialName: z.string().trim().min(1).max(120).optional().describe('Credential name to keep with the connection (default api-key).'),
    config1: configValue('first'),
    config2: configValue('second'),
    config3: configValue('third'),
  })
  .refine((body) => body.connection !== 'other' || body.provider.length >= 2, { message: 'Enter a provider name of at least 2 characters.', path: ['provider'] })
export type GptConnectionBody = z.infer<typeof GptConnectionBody>

export const GptConnectionParams = z.object({
  connectionId: z.string().min(1).max(160).describe('Row id of the model connection.'),
})
export type GptConnectionParams = z.infer<typeof GptConnectionParams>

export const GptConnectionSavedData = z.object({ connection: GptModelConnection.describe('The connection as saved (State: Unconfigured).') })
export type GptConnectionSavedData = z.infer<typeof GptConnectionSavedData>

export const GptConnectionDeletedData = z.object({
  connectionId: z.string().describe('Row id that was deleted.'),
  deleted: z.boolean().describe('True when a row was removed.'),
})
export type GptConnectionDeletedData = z.infer<typeof GptConnectionDeletedData>

/** Send the fixed readiness prompt. Max output tokens is always 1,024. */
export const GptReadinessBody = z.object({
  model: GptModelRef,
  settings: GptModelSettings.partial().optional().describe('Generation settings to use; missing values take the defaults.'),
  credential: GptCredentialMetadata.optional().describe('Which stored key to use, and its non-secret values (default api-key).'),
})
export type GptReadinessBody = z.infer<typeof GptReadinessBody>

export const GptReadinessData = z.object({
  text: z.string().describe("The model's reply."),
  provider: z.string().describe('Provider adapter that answered.'),
  model: z.string().describe('Provider model identifier that answered.'),
  latencyMs: z.number().min(0).describe('How long the provider took, in milliseconds.'),
  usage: z
    .object({ inputTokens: tokenCount('Input'), cachedTokens: tokenCount('Cached input'), outputTokens: tokenCount('Output'), totalTokens: tokenCount('Total') })
    .describe('Token counts reported by the provider.'),
  cost: z
    .object({
      input: z.number().min(0).describe('Input cost in dollars.'),
      cached: z.number().min(0).describe('Cached input cost in dollars.'),
      output: z.number().min(0).describe('Output cost in dollars.'),
      total: z.number().min(0).describe('Total cost in dollars.'),
    })
    .describe('Cost worked out from the saved rates.'),
})
export type GptReadinessData = z.infer<typeof GptReadinessData>

/** Save the approved application settings (no secret). */
export const GptSettingsBody = z.object({
  model: GptModelRef,
  settings: GptModelSettings.partial().describe('Generation settings and rates; missing values take the defaults.'),
  credential: GptCredentialMetadata.optional().describe('Non-secret credential details to keep on the connection.'),
})
export type GptSettingsBody = z.infer<typeof GptSettingsBody>

export const GptSettingsSavedData = z.object({
  applicationId: z.string().describe('Application the settings belong to.'),
  approvedApiKey: z.string().describe('Non-secret reference to the approved key.'),
  connection: GptModelConnection.nullable().describe('The connection after its non-secret values were updated, when one matched.'),
})
export type GptSettingsSavedData = z.infer<typeof GptSettingsSavedData>

/** Save a provider key. Write-only: the key is never returned, logged or kept in the browser after the save. */
export const GptCredentialBody = z.object({
  model: GptModelRef,
  credentialName: z.string().trim().min(2).max(120).describe('Credential name, for example api-key or gateway-auth-token.'),
  key: z.string().trim().min(2).max(16000).describe('The provider key. Sealed by the Worker before it is stored; never returned.'),
  config1: configValue('first'),
  config2: configValue('second'),
  config3: configValue('third'),
})
export type GptCredentialBody = z.infer<typeof GptCredentialBody>

export const GptCredentialSavedData = z.object({ credential: GptCredentialStatus.describe('What is now stored (never the key).') })
export type GptCredentialSavedData = z.infer<typeof GptCredentialSavedData>

/** Default generation controls for a new connection (old `GPT_DEFAULT_GENERATION_SETTINGS`). */
export const GPT_DEFAULT_GENERATION_SETTINGS = {
  maxOutputTokens: 1024,
  temperature: 0.2,
  topP: 0.95,
  topK: 40,
  systemInstruction: '',
  endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
  thinkingLevel: 'medium',
} as const satisfies Pick<GptModelSettings, 'maxOutputTokens' | 'temperature' | 'topP' | 'topK' | 'systemInstruction' | 'endpointUrl' | 'thinkingLevel'>

/** Default rate controls for a new connection (old `GPT_DEFAULT_RATE_SETTINGS`). */
export const GPT_DEFAULT_RATE_SETTINGS = { inputRatePerMillion: 0, cachedRatePerMillion: 0, outputRatePerMillion: 0 } as const

/** Introductory Standard paid rates for Gemini 3.7 Flash through 2026-12-31 (old `GPT_GEMINI_37_FLASH_RATE_SETTINGS`). */
export const GPT_GEMINI_37_FLASH_RATE_SETTINGS = { inputRatePerMillion: 0.75, cachedRatePerMillion: 0.075, outputRatePerMillion: 3.75 } as const

/** Output tokens a readiness check may use (the old screen forced it; the API now does). */
export const GPT_READINESS_MAX_OUTPUT_TOKENS = 1024
