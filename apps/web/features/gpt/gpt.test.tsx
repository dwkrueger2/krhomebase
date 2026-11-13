// file: apps/web/features/gpt/gpt.test.tsx
/**
 * GPT Model Gateway (Settings plan, stage 7): the display helpers (ledger rows, defaults, credential words, editor
 * drafts, copy text), the browser client's error handling (the "cannot be reached" state, Worker codes), and first
 * draws rendered to text: the page with connections, the empty card, the loading state, the cannot-be-reached
 * notice, the Edit Model Connection dialog (add and edit) and both editors. Made-up values only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/gpt/gpt.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GptGatewayData, GptModelConnection } from '@krhomebase/contracts'
import { fetchGptGateway, GptApiError, gptErrorSentence, GPT_UNAVAILABLE_SENTENCE, saveGptCredential } from '@/features/gpt/api.client'
import GptConnectionDialog from '@/features/gpt/components/GptConnectionDialog.client'
import GptConnectionEditor from '@/features/gpt/components/GptConnectionEditor.client'
import type { GptEditorProps } from '@/features/gpt/components/GptEditorParts.client'
import GptGeminiEditor from '@/features/gpt/components/GptGeminiEditor.client'
import GptModelGatewayPage, { GptUnavailableNotice } from '@/features/gpt/components/GptModelGatewayPage.client'
import { credentialDraftFor, credentialStatusText, defaultSettings, modelFromConnection, modelRows, providerLabel, readinessCopyText, settingsFor } from '@/features/gpt/gptGatewayRows'

const connection = (id: string, type: GptModelConnection['connection'], provider: string, model: string, extra: Partial<GptModelConnection> = {}): GptModelConnection => ({
  id,
  krGptConnectionId: `kr-gpt-${id}`,
  connection: type,
  provider,
  model,
  credentialName: 'api-key',
  config1: null,
  config2: null,
  config3: null,
  state: 'unconfigured',
  enabled: true,
  ...extra,
})

const GATEWAY: GptGatewayData = {
  applicationId: 'krhomebase',
  connections: [
    connection('c-gem', 'gemini', 'Gemini', 'gemini-3.7-flash', { state: 'configured', credentialName: 'krhomebase-gemini-key', config1: 'project-id-1' }),
    connection('c-oai', 'openai', 'Open AI', 'gpt-4.1'),
    connection('c-other', 'other', 'Mistral', 'm-1'),
  ],
  credentials: [{ provider: 'gemini', llmModel: 'gemini-3.7-flash', credential: 'krhomebase-gemini-key', hasKey: true, isKeyEncrypted: true, keyFormat: 'current', config1: 'project-id-1', config2: 'krhomebase', config3: null }],
  savedSettings: { model: { provider: 'gemini', model: 'gemini-3.7-flash' }, settings: { maxOutputTokens: 4096, thinkingLevel: 'high' }, credentialMetadata: { keyName: 'krhomebase-gemini-key' } },
  usage: {
    applicationId: 'krhomebase',
    rows: [{ modelProvider: 'gemini', modelName: 'gemini-3.7-flash', krGptConnectionId: 'kr-gpt-c-gem', requestCount: 2, inputTokens: 40, cachedTokens: 0, outputTokens: 2, totalTokens: 42, totalCost: 0.0000375, lastRequestedAt: '2026-11-12T10:00:00Z' }],
    totals: { requestCount: 2, inputTokens: 40, cachedTokens: 0, outputTokens: 2, totalTokens: 42, totalCost: 0.0000375 },
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('display helpers', () => {
  it('lists only connections with an editor, sorted by name, with the old labels', () => {
    expect(modelFromConnection(GATEWAY.connections[2]!)).toBeNull()
    expect(modelRows(GATEWAY.connections).map((row) => [row.displayName, providerLabel(row.provider), row.state])).toEqual([
      ['Gemini 3.7 Flash', 'Gemini Direct', 'configured'],
      ['Open AI · gpt-4.1', 'OpenAI Direct', 'unconfigured'],
    ])
    expect(providerLabel('cloudflare-ai-gateway')).toBe('Cloudflare Gateway')
  })

  it('starts Gemini 3.7 Flash with its rates and 65,536 tokens, and reads saved settings for that model only', () => {
    const [gemini, openai] = modelRows(GATEWAY.connections)
    expect(defaultSettings(gemini!)).toMatchObject({ maxOutputTokens: 65536, inputRatePerMillion: 0.75, cachedRatePerMillion: 0.075, outputRatePerMillion: 3.75, approvedApiKey: 'gemini-primary' })
    expect(settingsFor(GATEWAY, gemini!)).toMatchObject({ saved: true, settings: { maxOutputTokens: 4096, thinkingLevel: 'high' } })
    expect(settingsFor(GATEWAY, openai!)).toMatchObject({ saved: false, settings: { maxOutputTokens: 1024, approvedApiKey: 'openai-primary' } })
  })

  it('fills the key fields from the connection, never with a key', () => {
    const [gemini, openai] = modelRows(GATEWAY.connections)
    expect(credentialDraftFor(GATEWAY, GATEWAY.connections[0], gemini!)).toEqual({ keyName: 'krhomebase-gemini-key', key: '', config1: 'project-id-1', config2: 'krhomebase', config3: '' })
    expect(credentialDraftFor(GATEWAY, GATEWAY.connections[1], openai!).keyName).toBe('api-key')
  })

  it('describes what is stored about a key', () => {
    const stored = GATEWAY.credentials[0]!
    expect(credentialStatusText(null)).toBe('not configured')
    expect(credentialStatusText(stored)).toBe('configured and Worker-encrypted')
    expect(credentialStatusText({ ...stored, keyFormat: 'legacy' })).toBe('configured with the old key form; save the key again')
    expect(credentialStatusText({ ...stored, isKeyEncrypted: false, keyFormat: 'plain' })).toBe('configured; plaintext legacy row')
  })

  it('copies the readiness status and reply', () => {
    const text = readinessCopyText('Readiness check succeeded.', { text: 'YES', provider: 'gemini', model: 'gemini-3.7-flash', latencyMs: 210, usage: { inputTokens: 20, cachedTokens: 0, outputTokens: 1, totalTokens: 21 }, cost: { input: 0, cached: 0, output: 0, total: 0.0000188 } })
    expect(text.split('\n')).toEqual(['Readiness check succeeded.', 'Response: YES', 'Provider: gemini', 'Model: gemini-3.7-flash', 'Latency: 210 ms', 'Total tokens: 21', 'Cost: $0.000019'])
  })
})

describe('browser client', () => {
  const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

  it('marks a missing Worker as the cannot-be-reached state', async () => {
    reply(503, { ok: false, error: { code: 'GPT_GATEWAY_UNAVAILABLE', message: 'x' }, requestId: 'r1' })
    const error = await fetchGptGateway().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GptApiError)
    expect((error as GptApiError).unavailable).toBe(true)
    expect((error as GptApiError).message).toBe(GPT_UNAVAILABLE_SENTENCE)
  })

  it("passes the Worker's code on, with a sentence when there is one", async () => {
    reply(502, { ok: false, error: { code: 'GPT_WORKER_REQUEST_FAILED', message: 'x', details: { workerError: 'CREDENTIAL_LEGACY_KEY_UNAVAILABLE' } }, requestId: 'r2' })
    const error = await saveGptCredential({ model: { provider: 'gemini', model: 'gemini-3.7-flash' }, credentialName: 'api-key', key: 'made-up-key' }).catch((caught: unknown) => caught)
    expect((error as GptApiError).unavailable).toBe(false)
    expect(gptErrorSentence(error, 'x')).toBe('This key was saved by the old Worker. Save the key again. (CREDENTIAL_LEGACY_KEY_UNAVAILABLE)')
    expect(gptErrorSentence(new GptApiError('GPT_WORKER_REQUEST_FAILED', 'm', 502, null, 'PROVIDER_HTTP_401'), 'x')).toBe('PROVIDER_HTTP_401')
  })
})

describe('first draws', () => {
  it('draws the panel: intro, transport, ledger, usage report, no editor until a row is chosen', () => {
    const html = renderToStaticMarkup(<GptModelGatewayPage initialData={GATEWAY} />)
    expect(html).toContain('data-kr-id="gpt-model-gateway-workspace"')
    expect(html).toContain('data-kr-id="gpt-models-panel"')
    expect(html).toContain('Model connections')
    expect(html).toContain('Service binding')
    expect(html).toContain('Models in use')
    expect(html).toContain('Gemini 3.7 Flash')
    expect(html).not.toContain('Mistral')
    expect(html).toContain('Usage report · krhomebase')
    expect(html).toContain('42 tokens · $0.000037')
    expect(html).toContain('border-l-4')
    expect(html).not.toContain('data-kr-element="gpt-model-editor"')
    expect(html).not.toContain('firm-settings-gpt-connection-dialog')
  })

  it('draws the empty card when nothing is saved, and the loading line before the first read', () => {
    const empty = renderToStaticMarkup(<GptModelGatewayPage initialData={{ ...GATEWAY, connections: [], credentials: [] }} />)
    expect(empty).toContain('data-kr-id="gpt-model-connections-empty"')
    expect(empty).toContain('Add Model Connection')
    expect(empty).toContain('No model connections saved yet.')
    expect(renderToStaticMarkup(<GptModelGatewayPage />)).toContain('Loading saved GPT model connections...')
  })

  it('draws the cannot-be-reached notice', () => {
    const html = renderToStaticMarkup(<GptUnavailableNotice detail="" onRetry={() => undefined} unavailable />)
    expect(html).toContain('GPT Model Gateway cannot be reached right now.')
    expect(html).toContain('Try again')
  })

  it('draws the Edit Model Connection dialog with its id, for adding and for editing', () => {
    const add = renderToStaticMarkup(<GptConnectionDialog editConnection={null} onClose={() => undefined} onDeleted={() => undefined} onSaved={() => undefined} />)
    expect(add).toContain('data-kr-id="firm-settings-gpt-connection-dialog"')
    expect(add).toContain('MODEL CONNECTION')
    expect(add).toContain('Add a model connection')
    expect(add).toContain('Saved as the connection type: Cloudflare AI Gateway.')
    expect(add).toContain('State: Unconfigured')
    expect(add).toContain('max-w-[520px]')
    expect(add).not.toContain('Delete model')
    const edit = renderToStaticMarkup(<GptConnectionDialog editConnection={GATEWAY.connections[0]!} onClose={() => undefined} onDeleted={() => undefined} onSaved={() => undefined} />)
    expect(edit).toContain('Edit model connection')
    expect(edit).toContain('Delete model')
    expect(edit).toContain('Save changes')
    expect(edit).toContain('value="gemini-3.7-flash"')
  })

  it('draws both editors with the old texts, never a key', () => {
    const [gemini, openai] = modelRows(GATEWAY.connections)
    const props = (row: NonNullable<typeof gemini>): GptEditorProps => ({
      model: row, settings: defaultSettings(row), credential: { keyName: 'api-key', key: '', config1: '', config2: 'krhomebase', config3: '' }, credentialStatus: GATEWAY.credentials[0]!, readiness: null, readinessStatus: '', busy: null, settingsSaved: false,
      updateSetting: () => undefined, updateModel: () => undefined, updateCredential: () => undefined, checkReadiness: () => undefined, saveCredential: () => undefined, saveSettings: () => undefined, loadUsageReport: () => undefined, copyReadiness: () => undefined, onDelete: () => undefined,
    })
    const geminiHtml = renderToStaticMarkup(<GptGeminiEditor {...props(gemini!)} />)
    expect(geminiHtml).toContain('Selected connection · Gemini Direct')
    expect(geminiHtml).toContain('kr-gpt-connection-id:')
    expect(geminiHtml).toContain('Credential status: configured and Worker-encrypted')
    expect(geminiHtml).toContain('Update API Credential')
    expect(geminiHtml).toContain('data-kr-id="gpt-model-editor-gemini-3.7-flash"')
    const openaiHtml = renderToStaticMarkup(<GptConnectionEditor {...props(openai!)} providerKind="openai" />)
    expect(openaiHtml).toContain('OpenAI Direct')
    expect(openaiHtml).toContain('Approved API key reference')
    expect(openaiHtml).toContain('Save Credential')
    expect(openaiHtml).toContain('data-kr-gpt-provider="openai"')
  })
})
