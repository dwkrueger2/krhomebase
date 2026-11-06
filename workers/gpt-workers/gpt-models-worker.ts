/**
 * @fileoverview Secure KR Homebase GPT provider and usage Worker.
 * @module gpt-workers/gpt-models-worker
 *
 * The Worker is deliberately the only component that stores provider
 * credentials for runtime use and accesses the GPT usage database. The
 * Homebase server sends a signed JWT beside a hybrid-encrypted command. After
 * the command is authenticated and decrypted, this Worker calls the selected
 * provider, persists normalized usage, and returns a hybrid-encrypted response
 * signed by the Worker key.
 */

const REQUEST_ALGORITHM = 'RSA-OAEP-256+A256GCM' as const
const REQUEST_ISSUER = 'kr-homebase-gpt-server'
const REQUEST_AUDIENCE = 'gpt-models-worker'
const REQUEST_SUBJECT = 'kr-homebase-gpt-server'
const REQUEST_PURPOSE = 'gpt-models-worker-request'
const RESPONSE_ISSUER = 'gpt-models-worker'
const RESPONSE_AUDIENCE = 'kr-homebase-gpt-server'
const RESPONSE_SUBJECT = 'gpt-models-worker'
const RESPONSE_PURPOSE = 'gpt-models-worker-response'
const DEFAULT_APPLICATION_ID = 'krhomebase'
const DEFAULT_MAX_OUTPUT_TOKENS = 1024
const DEFAULT_READINESS_PROMPT = 'This is a test request to see if the model is listening. Respond with only a "YES" if you have received this'

/** Provider adapters supported by this prototype Worker. */
type GptProvider = 'cloudflare-ai-gateway' | 'gemini' | 'openai'
type GptConnectionType = GptProvider | 'anthropic-claude' | 'other'

/** Provider-neutral generation settings sent by the Homebase API. */
type GptGenerationSettings = {
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  systemInstruction?: string
  endpointUrl?: string
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
}

/** Model selection sent by the Homebase API. */
type GptModelDefinition = {
  provider: GptProvider
  model: string
  displayName?: string
  krGptConnectionId?: string
}

/** Normalized model cost rates in dollars per one million tokens. */
type GptRateSettings = {
  inputRatePerMillion?: number
  cachedRatePerMillion?: number
  outputRatePerMillion?: number
}

/** Signed and encrypted command understood by this Worker. */
type GptWorkerCommand = {
  requestId: string
  action: 'READINESS' | 'SAVE_SETTINGS' | 'SAVE_CREDENTIAL' | 'REPORT_USAGE' | 'SAVE_MODEL_CONNECTION' | 'DELETE_MODEL_CONNECTION'
  applicationId?: string
  approvedApiKey?: string
  moduleName: string
  model?: GptModelDefinition
  modelConnection?: {
    id?: string
    krGptConnectionId?: string
    connection: GptConnectionType
    provider: string
    model: string
    credentialName?: string
    config1?: string | null
    config2?: string | null
    config3?: string | null
  }
  settings?: GptGenerationSettings & GptRateSettings
  credential?: {
    provider: GptProvider
    llmModel: string
    credential: string
    encryptedKey?: string
    isKeyEncrypted?: boolean
    config1?: string
    config2?: string
    config3?: string
  }
  prompt?: string
  requestedBy?: {
    userId?: string
    email?: string
  }
  limit?: number
}

/** Short-lived request JWT claims signed by the Homebase server. */
type GptRequestJwt = {
  iss: string
  aud: string
  sub: string
  purpose: string
  action: GptWorkerCommand['action']
  resource: string
  requestId: string
  keyId: string
  iat: number
  exp: number
}

/** Encrypted hybrid payload shared with the Homebase server. */
type EncryptedEnvelope = {
  alg: typeof REQUEST_ALGORITHM
  wrappedKeyB64: string
  ivB64: string
  ciphertextB64: string
}

/** Request body accepted at the Worker boundary. */
type GptWorkerRequestBody = {
  token: string
  encryptedPayload: EncryptedEnvelope
}

/** Normalized token counters from a provider response. */
type GptUsageCounters = {
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  totalTokens: number
}

/** Provider response normalized for the API and usage writer. */
type GptProviderResult = {
  text: string
  usage: GptUsageCounters
  provider: GptProvider
  model: string
  latencyMs: number
}

/** D1-backed usage row values calculated by the Worker. */
type GptUsageRecord = GptUsageCounters & {
  id: string
  requestId: string
  applicationId: string
  modelProvider: GptProvider
  modelName: string
  krGptConnectionId: string | null
  inputRatePerMillion: number
  cachedRatePerMillion: number
  outputRatePerMillion: number
  inputCost: number
  cachedCost: number
  outputCost: number
  totalCost: number
  requestedAt: string
  moduleName: string
  requestedByUserId: string | null
  requestedByEmail: string | null
  requestKind: string
  responseStatus: string
}

/** Bindings and secrets configured by gpt-models-worker.jsonc. */
type GptWorkerEnv = {
  GPT_USAGE_DB: D1Database
  GPT_WORKER_PRIVATE_KEY: string
  GPT_SERVER_PUBLIC_KEY: string
  GPT_APPLICATION_ID?: string
  GPT_SERVER_KEY_ID?: string
  GPT_WORKER_KEY_ID?: string
  GPT_OPENAI_ENDPOINT?: string
  GPT_GEMINI_ENDPOINT?: string
  GPT_GEMINI_PROJECT_ID?: string
  GPT_CLOUDFLARE_GATEWAY_URL?: string
  GPT_CLOUDFLARE_GATEWAY_AUTH_TOKEN?: string
}

/** Generic JSON object used at provider boundaries. */
type JsonObject = Record<string, unknown>

/** Worker JSON response body. */
type JsonResponseBody = {
  ok: boolean
  error?: string
  [key: string]: unknown
}

/** Returns an HTTP JSON response with no-store caching. */
function json(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

/** Converts standard or URL-safe base64 to bytes. */
function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Converts bytes to standard base64. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Converts bytes or text to URL-safe base64 without padding. */
function base64Url(value: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Converts a PEM key into DER bytes for WebCrypto. */
function pemToDer(pem: string, kind: 'private' | 'public'): ArrayBuffer {
  const begin = kind === 'private' ? '-----BEGIN PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----'
  const end = kind === 'private' ? '-----END PRIVATE KEY-----' : '-----END PUBLIC KEY-----'
  const value = pem.replace(begin, '').replace(end, '').replace(/\s+/g, '')
  if (!value) throw new Error(`CONFIG_INVALID_${kind.toUpperCase()}_KEY`)
  return base64ToBytes(value).buffer
}

/** Parses a JSON value from a base64url JWT segment. */
function parseJwtSegment<T>(segment: string): T {
  const text = new TextDecoder().decode(base64ToBytes(segment))
  return JSON.parse(text) as T
}

/** Imports the server public key used to verify request JWTs. */
async function importServerPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    pemToDer(pem, 'public'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
}

/** Imports the Worker private key used to decrypt requests and sign responses. */
async function importWorkerPrivateKey(pem: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const algorithm = usages.includes('decrypt')
    ? { name: 'RSA-OAEP', hash: 'SHA-256' }
    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem, 'private'),
    algorithm,
    false,
    usages,
  )
}

/** Imports the Homebase public key used to encrypt Worker responses. */
async function importHomebasePublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    pemToDer(pem, 'public'),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
}

/** Verifies and parses a Homebase server JWT. */
async function verifyRequestToken(token: string, env: GptWorkerEnv): Promise<GptRequestJwt> {
  const segments = token.split('.')
  if (segments.length !== 3) throw new Error('AUTH_INVALID_TOKEN_FORMAT')

  const [encodedHeader, encodedPayload, encodedSignature] = segments
  const header = parseJwtSegment<{ alg?: string; typ?: string }>(encodedHeader)
  const payload = parseJwtSegment<GptRequestJwt>(encodedPayload)
  if (header.alg !== 'RS256' || header.typ !== 'JWT') throw new Error('AUTH_UNSUPPORTED_TOKEN_ALGORITHM')

  const signature = base64ToBytes(encodedSignature)
  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  const publicKey = await importServerPublicKey(env.GPT_SERVER_PUBLIC_KEY)
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    signature,
    signingInput,
  )
  if (!valid) throw new Error('AUTH_INVALID_TOKEN_SIGNATURE')

  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== REQUEST_ISSUER) throw new Error('AUTH_INVALID_ISSUER')
  if (payload.aud !== REQUEST_AUDIENCE) throw new Error('AUTH_INVALID_AUDIENCE')
  if (payload.sub !== REQUEST_SUBJECT) throw new Error('AUTH_INVALID_SUBJECT')
  if (payload.purpose !== REQUEST_PURPOSE) throw new Error('AUTH_INVALID_PURPOSE')
  if (!payload.requestId || !payload.keyId) throw new Error('AUTH_MISSING_REQUEST_ID_OR_KEY_ID')
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.exp <= now || payload.iat > now + 30) {
    throw new Error('AUTH_TOKEN_EXPIRED_OR_NOT_YET_VALID')
  }

  return payload
}

/** Decrypts a Worker-encrypted JSON payload with the Worker private key. */
async function decryptPayload<T>(envelope: EncryptedEnvelope, env: GptWorkerEnv): Promise<T> {
  if (envelope.alg !== REQUEST_ALGORITHM) throw new Error('ENCRYPTION_UNSUPPORTED_ALGORITHM')
  const privateKey = await importWorkerPrivateKey(env.GPT_WORKER_PRIVATE_KEY, ['decrypt'])
  const rawAesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToBytes(envelope.wrappedKeyB64),
  )
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.ivB64) },
    aesKey,
    base64ToBytes(envelope.ciphertextB64),
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

/** Decrypts the Homebase command with the Worker private key. */
async function decryptCommand(envelope: EncryptedEnvelope, env: GptWorkerEnv): Promise<GptWorkerCommand> {
  return decryptPayload<GptWorkerCommand>(envelope, env)
}

/** Decrypts a credential value stored in the database with the Worker private key. */
async function decryptStoredCredentialKey(encryptedKey: string, env: GptWorkerEnv): Promise<string> {
  let envelope: EncryptedEnvelope
  try {
    envelope = JSON.parse(encryptedKey) as EncryptedEnvelope
  } catch {
    throw new Error('CREDENTIAL_ENVELOPE_INVALID')
  }
  const payload = await decryptPayload<{ value?: unknown }>(envelope, env)
  if (typeof payload.value !== 'string' || !payload.value) throw new Error('CREDENTIAL_VALUE_INVALID')
  return payload.value
}

/** Encrypts a JSON response for the Homebase server public key. */
async function encryptResponse(payload: JsonObject, env: GptWorkerEnv): Promise<EncryptedEnvelope> {
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const serverPublicKey = await importHomebasePublicKey(env.GPT_SERVER_PUBLIC_KEY)
  const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, serverPublicKey, rawAesKey)

  return {
    alg: REQUEST_ALGORITHM,
    wrappedKeyB64: bytesToBase64(new Uint8Array(wrappedKey)),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

/** Signs the response metadata with the Worker private key. */
async function signResponseToken(requestId: string, action: GptWorkerCommand['action'], env: GptWorkerEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid: env.GPT_WORKER_KEY_ID || 'gpt-worker-key1.pub' }
  const payload = {
    iss: RESPONSE_ISSUER,
    aud: RESPONSE_AUDIENCE,
    sub: RESPONSE_SUBJECT,
    purpose: RESPONSE_PURPOSE,
    action,
    resource: 'gpt-models-worker',
    requestId,
    keyId: header.kid,
    iat: now,
    exp: now + 60,
  }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const privateKey = await importWorkerPrivateKey(env.GPT_WORKER_PRIVATE_KEY, ['sign'])
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64Url(signature)}`
}

/** Produces an authenticated response envelope after the request is trusted. */
async function secureResponse(
  payload: JsonObject,
  requestId: string,
  action: GptWorkerCommand['action'],
  env: GptWorkerEnv,
): Promise<Response> {
  const token = await signResponseToken(requestId, action, env)
  const encryptedPayload = await encryptResponse(payload, env)
  return json({ ok: true, token, encryptedPayload })
}

/** Returns whether an unknown value is a non-array object. */
function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** Validates the command identity against the signed request claims. */
function validateCommand(command: GptWorkerCommand, token: GptRequestJwt): void {
  if (!command.requestId || command.requestId !== token.requestId) throw new Error('PAYLOAD_REQUEST_ID_MISMATCH')
  if (command.action !== token.action) throw new Error('PAYLOAD_ACTION_MISMATCH')
  if (!['READINESS', 'SAVE_SETTINGS', 'SAVE_CREDENTIAL', 'REPORT_USAGE', 'SAVE_MODEL_CONNECTION', 'DELETE_MODEL_CONNECTION'].includes(command.action)) throw new Error('VALIDATION_ACTION_NOT_ALLOWED')
  if (token.resource !== 'gpt-models-worker') throw new Error('AUTH_INVALID_RESOURCE')
  if (typeof command.moduleName !== 'string' || !command.moduleName.trim() || command.moduleName.length > 120) throw new Error('VALIDATION_INVALID_MODULE_NAME')
  if (command.action === 'SAVE_MODEL_CONNECTION' || command.action === 'DELETE_MODEL_CONNECTION') {
    const connection = command.modelConnection
    if (!connection || !connection.connection || !connection.provider || !connection.model) throw new Error('VALIDATION_MODEL_CONNECTION_REQUIRED')
    if (!['cloudflare-ai-gateway', 'gemini', 'openai', 'anthropic-claude', 'other'].includes(connection.connection)) throw new Error('VALIDATION_CONNECTION_NOT_ALLOWED')
    if (connection.provider.length > 160 || connection.model.length > 160) throw new Error('VALIDATION_MODEL_CONNECTION_TOO_LONG')
    if (connection.krGptConnectionId && connection.krGptConnectionId.length > 96) throw new Error('VALIDATION_KR_GPT_CONNECTION_ID_TOO_LONG')
    if (connection.credentialName && connection.credentialName.length > 120) throw new Error('VALIDATION_CREDENTIAL_NAME_TOO_LONG')
    if (connection.connection === 'other' && connection.provider.trim().length < 2) throw new Error('VALIDATION_OTHER_PROVIDER_REQUIRED')
  } else if (command.action !== 'REPORT_USAGE') {
    if (!command.model || !command.model.model || !command.model.provider) throw new Error('VALIDATION_MODEL_REQUIRED')
    if (!['cloudflare-ai-gateway', 'gemini', 'openai'].includes(command.model.provider)) throw new Error('VALIDATION_PROVIDER_NOT_ALLOWED')
    if (command.model.model.length > 160) throw new Error('VALIDATION_MODEL_NAME_TOO_LONG')
    if (command.model.krGptConnectionId && command.model.krGptConnectionId.length > 96) throw new Error('VALIDATION_KR_GPT_CONNECTION_ID_TOO_LONG')
  }
  if (command.action === 'SAVE_CREDENTIAL') {
    const credential = command.credential
    if (!credential || credential.provider !== command.model?.provider || credential.llmModel !== command.model?.model) throw new Error('VALIDATION_CREDENTIAL_MODEL_MISMATCH')
    if (!credential.credential || credential.credential.length > 120) throw new Error('VALIDATION_CREDENTIAL_TYPE_INVALID')
    if (!credential.encryptedKey || credential.isKeyEncrypted !== true) throw new Error('VALIDATION_CREDENTIAL_MUST_BE_ENCRYPTED')
  }
}

/** Clamps a numeric setting to a safe provider-neutral range. */
function clampSetting(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, numeric))
}

/** Normalizes generation and rate settings before provider execution/storage. */
function normalizeSettings(settings: GptWorkerCommand['settings']): Required<GptGenerationSettings & GptRateSettings> {
  return {
    maxOutputTokens: Math.round(clampSetting(settings?.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 1, 65536)),
    temperature: clampSetting(settings?.temperature, 0.2, 0, 2),
    topP: clampSetting(settings?.topP, 0.95, 0, 1),
    topK: Math.round(clampSetting(settings?.topK, 40, 0, 100)),
    systemInstruction: typeof settings?.systemInstruction === 'string' ? settings.systemInstruction.slice(0, 4000) : '',
    endpointUrl: typeof settings?.endpointUrl === 'string' && settings.endpointUrl.startsWith('https://') ? settings.endpointUrl.slice(0, 500) : '',
    thinkingLevel: settings?.thinkingLevel === 'minimal' || settings?.thinkingLevel === 'low' || settings?.thinkingLevel === 'high' ? settings.thinkingLevel : 'medium',
    inputRatePerMillion: clampSetting(settings?.inputRatePerMillion, 0, 0, 100000),
    cachedRatePerMillion: clampSetting(settings?.cachedRatePerMillion, 0, 0, 100000),
    outputRatePerMillion: clampSetting(settings?.outputRatePerMillion, 0, 0, 100000),
  }
}

/** Calculates one dollar cost from a token count and a one-million-token rate. */
function tokenCost(tokens: number, ratePerMillion: number): number {
  return Number(((Math.max(0, tokens) / 1_000_000) * Math.max(0, ratePerMillion)).toFixed(8))
}

/** Converts an unknown provider usage value into a non-negative integer. */
function nonNegativeInteger(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}

/** Converts model/provider text into a short readable connection-id segment. */
function connectionIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52) || 'connection'
}

/** Generates a short stable business-facing connection id without exposing the row UUID. */
function generateKrGptConnectionId(connection: NonNullable<GptWorkerCommand['modelConnection']>): string {
  const random = new Uint8Array(4)
  crypto.getRandomValues(random)
  const suffix = Array.from(random, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 8)
  return `kr-gpt-${connectionIdSegment(`${connection.connection}-${connection.model}`)}-${suffix}`.slice(0, 96)
}

/** Normalizes optional text values before storing display-safe connection metadata. */
function nullableConfigValue(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 2000) : null
}

/** Lets a command-supplied metadata field override stored credential metadata, even when blank. */
function credentialConfigValue(
  credential: GptWorkerCommand['credential'],
  key: 'config1' | 'config2' | 'config3',
  fallback: unknown,
): string | null {
  if (credential && Object.prototype.hasOwnProperty.call(credential, key)) {
    return nullableConfigValue(credential[key])
  }
  return typeof fallback === 'string' ? fallback : null
}

/** Safe runtime view of one stored LLM credential; the key is never returned. */
type StoredGptCredential = {
  key: string
  isKeyEncrypted: boolean
  config1: string | null
  config2: string | null
  config3: string | null
}

/** Reads and, when necessary, decrypts one provider credential from D1. */
async function loadCredential(
  command: GptWorkerCommand,
  env: GptWorkerEnv,
  credentialName = command.credential?.credential || 'api-key',
  required = true,
): Promise<StoredGptCredential | null> {
  const model = command.model
  if (!model) throw new Error('VALIDATION_MODEL_REQUIRED')
  const row = await env.GPT_USAGE_DB.prepare(`
    SELECT
      "key" AS credentialKey,
      is_key_encrypted AS isKeyEncrypted,
      config1,
      config2,
      config3
    FROM gpt_llm_credential
    WHERE provider = ? AND llm_model = ? AND credential = ?
    LIMIT 1
  `).bind(model.provider, model.model, credentialName).first()
  if (!isRecord(row) || typeof row.credentialKey !== 'string' || !row.credentialKey.trim()) {
    if (!required) return null
    throw new Error('CONFIG_MISSING_GPT_LLM_CREDENTIAL')
  }

  const isKeyEncrypted = row.isKeyEncrypted === 1 || row.isKeyEncrypted === true
  const key = isKeyEncrypted
    ? await decryptStoredCredentialKey(row.credentialKey, env)
    : row.credentialKey
  if (!key) throw new Error('CREDENTIAL_VALUE_INVALID')
  return {
    key,
    isKeyEncrypted,
    config1: credentialConfigValue(command.credential, 'config1', row.config1),
    config2: credentialConfigValue(command.credential, 'config2', row.config2),
    config3: credentialConfigValue(command.credential, 'config3', row.config3),
  }
}

/** Reads a JSON provider response while keeping error text out of the API. */
async function fetchJson(url: string, init: RequestInit): Promise<JsonObject> {
  const response = await fetch(url, init)
  const raw = await response.text()
  let body: unknown = null
  try {
    body = raw ? JSON.parse(raw) : null
  } catch {
    body = null
  }
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`)
  if (!isRecord(body)) throw new Error('PROVIDER_INVALID_JSON_RESPONSE')
  return body
}

/** Builds the OpenAI-compatible request shared by direct OpenAI and AI Gateway. */
function openAiRequestBody(command: GptWorkerCommand, settings: Required<GptGenerationSettings & GptRateSettings>): JsonObject {
  const messages: Array<JsonObject> = []
  if (settings.systemInstruction) messages.push({ role: 'system', content: settings.systemInstruction })
  messages.push({ role: 'user', content: command.prompt || DEFAULT_READINESS_PROMPT })
  return {
    model: command.model?.model,
    messages,
    max_tokens: settings.maxOutputTokens,
    temperature: settings.temperature,
    top_p: settings.topP,
  }
}

/** Executes an OpenAI-compatible request and normalizes its response usage. */
async function callOpenAiCompatible(command: GptWorkerCommand, env: GptWorkerEnv, settings: Required<GptGenerationSettings & GptRateSettings>, provider: 'openai' | 'cloudflare-ai-gateway'): Promise<GptProviderResult> {
  const apiCredential = await loadCredential(command, env)
  if (!apiCredential) throw new Error('CONFIG_MISSING_GPT_LLM_CREDENTIAL')

  const endpoint = provider === 'openai'
    ? env.GPT_OPENAI_ENDPOINT || 'https://api.openai.com/v1/chat/completions'
    : env.GPT_CLOUDFLARE_GATEWAY_URL
  if (!endpoint) throw new Error('CONFIG_MISSING_GPT_CLOUDFLARE_GATEWAY_URL')

  const startedAt = Date.now()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiCredential.key}`,
    'Content-Type': 'application/json',
  }
  const gatewayAuthCredential = provider === 'cloudflare-ai-gateway'
    ? await loadCredential(command, env, 'gateway-auth-token', false)
    : null
  if (gatewayAuthCredential?.key) {
    headers['cf-aig-authorization'] = `Bearer ${gatewayAuthCredential.key}`
  }
  const body = await fetchJson(endpoint, { method: 'POST', headers, body: JSON.stringify(openAiRequestBody(command, settings)) })
  const choices = Array.isArray(body.choices) ? body.choices : []
  const firstChoice = isRecord(choices[0]) ? choices[0] : {}
  const message = isRecord(firstChoice.message) ? firstChoice.message : {}
  const text = typeof message.content === 'string' ? message.content : ''
  const usage = isRecord(body.usage) ? body.usage : {}
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {}
  const inputTokens = nonNegativeInteger(usage.prompt_tokens)
  const cachedTokens = nonNegativeInteger(promptDetails.cached_tokens)
  const outputTokens = nonNegativeInteger(usage.completion_tokens)
  const totalTokens = nonNegativeInteger(usage.total_tokens) || inputTokens + outputTokens
  return {
    text,
    usage: { inputTokens, cachedTokens, outputTokens, totalTokens },
    provider,
    model: command.model?.model || '',
    latencyMs: Date.now() - startedAt,
  }
}

/** Executes a Gemini Generative Language API request tied to the configured Google project key. */
async function callGemini(command: GptWorkerCommand, env: GptWorkerEnv, settings: Required<GptGenerationSettings & GptRateSettings>): Promise<GptProviderResult> {
  const apiCredential = await loadCredential(command, env)
  if (!apiCredential) throw new Error('CONFIG_MISSING_GPT_LLM_CREDENTIAL')
  const model = command.model?.model || ''
  const template = settings.endpointUrl || env.GPT_GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
  const baseUrl = template.replace('{model}', encodeURIComponent(model))
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiCredential.key)}`
  const contents = [{ role: 'user', parts: [{ text: command.prompt || DEFAULT_READINESS_PROMPT }] }]
  const generationConfig: JsonObject = {
    maxOutputTokens: settings.maxOutputTokens,
  }
  // Gemini 3.7 Flash rejects the legacy sampling controls. Its thinking level
  // is controlled separately by the model/API defaults, so do not send
  // temperature, topP, or topK for this model.
  if (model !== 'gemini-3.7-flash') {
    generationConfig.temperature = settings.temperature
    generationConfig.topP = settings.topP
    generationConfig.topK = settings.topK
  }
  if (model.startsWith('gemini-3')) generationConfig.thinkingConfig = { thinkingLevel: settings.thinkingLevel === 'minimal' ? 'low' : settings.thinkingLevel }
  const body: JsonObject = { contents, generationConfig }
  if (settings.systemInstruction) body.systemInstruction = { parts: [{ text: settings.systemInstruction }] }

  const startedAt = Date.now()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiCredential.config1 || env.GPT_GEMINI_PROJECT_ID) headers['x-goog-user-project'] = apiCredential.config1 || env.GPT_GEMINI_PROJECT_ID || ''
  const responseBody = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const candidates = Array.isArray(responseBody.candidates) ? responseBody.candidates : []
  const firstCandidate = isRecord(candidates[0]) ? candidates[0] : {}
  const content = isRecord(firstCandidate.content) ? firstCandidate.content : {}
  const parts = Array.isArray(content.parts) ? content.parts : []
  const text = parts.map((part) => isRecord(part) && typeof part.text === 'string' ? part.text : '').join('')
  const metadata = isRecord(responseBody.usageMetadata) ? responseBody.usageMetadata : {}
  const inputTokens = nonNegativeInteger(metadata.promptTokenCount)
  const cachedTokens = nonNegativeInteger(metadata.cachedContentTokenCount)
  const outputTokens = nonNegativeInteger(metadata.candidatesTokenCount)
  const totalTokens = nonNegativeInteger(metadata.totalTokenCount) || inputTokens + outputTokens
  return {
    text,
    usage: { inputTokens, cachedTokens, outputTokens, totalTokens },
    provider: 'gemini',
    model,
    latencyMs: Date.now() - startedAt,
  }
}

/** Dispatches one validated request to the selected provider adapter. */
async function executeProvider(command: GptWorkerCommand, env: GptWorkerEnv): Promise<GptProviderResult> {
  const settings = normalizeSettings(command.settings)
  if (command.model?.provider === 'gemini') return callGemini(command, env, settings)
  if (command.model?.provider === 'openai') return callOpenAiCompatible(command, env, settings, 'openai')
  return callOpenAiCompatible(command, env, settings, 'cloudflare-ai-gateway')
}

/** Writes one usage record after the provider response is available. */
async function writeUsageRecord(command: GptWorkerCommand, providerResult: GptProviderResult, env: GptWorkerEnv): Promise<GptUsageRecord> {
  const settings = normalizeSettings(command.settings)
  const usage = providerResult.usage
  const record: GptUsageRecord = {
    ...usage,
    id: `gptu_${crypto.randomUUID()}`,
    requestId: command.requestId,
    applicationId: command.applicationId || env.GPT_APPLICATION_ID || DEFAULT_APPLICATION_ID,
    modelProvider: providerResult.provider,
    modelName: providerResult.model,
    krGptConnectionId: command.model?.krGptConnectionId || null,
    inputRatePerMillion: settings.inputRatePerMillion,
    cachedRatePerMillion: settings.cachedRatePerMillion,
    outputRatePerMillion: settings.outputRatePerMillion,
    inputCost: tokenCost(Math.max(0, usage.inputTokens - usage.cachedTokens), settings.inputRatePerMillion),
    cachedCost: tokenCost(usage.cachedTokens, settings.cachedRatePerMillion),
    outputCost: tokenCost(usage.outputTokens, settings.outputRatePerMillion),
    totalCost: tokenCost(Math.max(0, usage.inputTokens - usage.cachedTokens), settings.inputRatePerMillion)
      + tokenCost(usage.cachedTokens, settings.cachedRatePerMillion)
      + tokenCost(usage.outputTokens, settings.outputRatePerMillion),
    requestedAt: new Date().toISOString(),
    moduleName: command.moduleName,
    requestedByUserId: command.requestedBy?.userId || null,
    requestedByEmail: command.requestedBy?.email || null,
    requestKind: 'readiness',
    responseStatus: 'success',
  }

  await env.GPT_USAGE_DB.prepare(`
    INSERT INTO gpt_usage (
      id, request_id, application_id, model_provider, model_name, kr_gpt_connection_id,
      input_tokens, cached_tokens, output_tokens, total_tokens,
      input_rate_per_million, cached_rate_per_million, output_rate_per_million,
      input_cost, cached_cost, output_cost, total_cost,
      requested_at, module_name, requested_by_user_id, requested_by_email,
      request_kind, response_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    record.requestId,
    record.applicationId,
    record.modelProvider,
    record.modelName,
    record.krGptConnectionId,
    record.inputTokens,
    record.cachedTokens,
    record.outputTokens,
    record.totalTokens,
    record.inputRatePerMillion,
    record.cachedRatePerMillion,
    record.outputRatePerMillion,
    record.inputCost,
    record.cachedCost,
    record.outputCost,
    record.totalCost,
    record.requestedAt,
    record.moduleName,
    record.requestedByUserId,
    record.requestedByEmail,
    record.requestKind,
    record.responseStatus,
  ).run()

  await env.GPT_USAGE_DB.prepare(`
    UPDATE gpt_model_connection
    SET state = 'configured', updated_at = ?
    WHERE application_id = ?
      AND (
        kr_gpt_connection_id = ?
        OR (? IS NULL AND connection_type = ? AND llm_model = ?)
      )
  `).bind(record.requestedAt, record.applicationId, record.krGptConnectionId, record.krGptConnectionId, record.modelProvider, record.modelName).run()
  await env.GPT_USAGE_DB.prepare(`
    UPDATE gpt_approved_application
    SET state = 'configured', updated_at = ?
    WHERE application_id = ?
  `).bind(record.requestedAt, record.applicationId).run()

  return record
}

/** Stores one Worker-public-key-encrypted LLM credential in the GPT D1 database. */
async function saveLlmCredential(command: GptWorkerCommand, env: GptWorkerEnv): Promise<JsonObject> {
  const credential = command.credential
  if (!credential || !credential.encryptedKey || !credential.llmModel) {
    throw new Error('VALIDATION_CREDENTIAL_REQUIRED')
  }
  await decryptStoredCredentialKey(credential.encryptedKey, env)
  const configValue = (value: string | undefined): string | null => typeof value === 'string' && value.trim() ? value.trim().slice(0, 2000) : null
  const now = new Date().toISOString()
  await env.GPT_USAGE_DB.prepare(`
    INSERT INTO gpt_llm_credential (
      provider, llm_model, credential, "key", is_key_encrypted,
      config1, config2, config3, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(provider, llm_model, credential) DO UPDATE SET
      "key" = excluded."key",
      is_key_encrypted = excluded.is_key_encrypted,
      config1 = excluded.config1,
      config2 = excluded.config2,
      config3 = excluded.config3,
      updated_at = excluded.updated_at
  `).bind(
    credential.provider,
    credential.llmModel,
    credential.credential,
    credential.encryptedKey,
    configValue(credential.config1),
    configValue(credential.config2),
    configValue(credential.config3),
    now,
  ).run()
  return {
    provider: credential.provider,
    llmModel: credential.llmModel,
    credential: credential.credential,
    hasKey: true,
    isKeyEncrypted: true,
    config1: configValue(credential.config1),
    config2: configValue(credential.config2),
    config3: configValue(credential.config3),
  }
}

/** Converts one D1 connection row into the display-safe API shape. */
function modelConnectionRow(row: JsonObject): JsonObject {
  return {
    id: row.id,
    krGptConnectionId: row.krGptConnectionId || row.id,
    connection: row.connection,
    provider: row.provider,
    model: row.model,
    credentialName: typeof row.credentialName === 'string' ? row.credentialName : 'api-key',
    config1: typeof row.config1 === 'string' ? row.config1 : null,
    config2: typeof row.config2 === 'string' ? row.config2 : null,
    config3: typeof row.config3 === 'string' ? row.config3 : null,
    state: row.state === 'configured' ? 'configured' : 'unconfigured',
    enabled: true,
  }
}

/** Updates non-secret metadata on the selected model connection. */
async function updateModelConnectionMetadata(command: GptWorkerCommand, env: GptWorkerEnv, now: string): Promise<JsonObject | null> {
  if (!command.model || !command.credential) return null
  const applicationId = command.applicationId || env.GPT_APPLICATION_ID || DEFAULT_APPLICATION_ID
  const credentialName = command.credential.credential.trim().slice(0, 120) || 'api-key'
  await env.GPT_USAGE_DB.prepare(`
    UPDATE gpt_model_connection
    SET
      credential_name = ?,
      config1 = ?,
      config2 = ?,
      config3 = ?,
      updated_by_user_id = ?,
      updated_by_email = ?,
      updated_at = ?
    WHERE application_id = ?
      AND (
        kr_gpt_connection_id = ?
        OR (? IS NULL AND connection_type = ? AND llm_model = ?)
      )
  `).bind(
    credentialName,
    nullableConfigValue(command.credential.config1),
    nullableConfigValue(command.credential.config2),
    nullableConfigValue(command.credential.config3),
    command.requestedBy?.userId || null,
    command.requestedBy?.email || null,
    now,
    applicationId,
    command.model.krGptConnectionId || null,
    command.model.krGptConnectionId || null,
    command.model.provider,
    command.model.model,
  ).run()

  const row = await env.GPT_USAGE_DB.prepare(`
    SELECT
      id,
      kr_gpt_connection_id AS krGptConnectionId,
      connection_type AS connection,
      provider,
      llm_model AS model,
      credential_name AS credentialName,
      config1,
      config2,
      config3,
      state
    FROM gpt_model_connection
    WHERE application_id = ?
      AND (
        kr_gpt_connection_id = ?
        OR (? IS NULL AND connection_type = ? AND llm_model = ?)
      )
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(
    applicationId,
    command.model.krGptConnectionId || null,
    command.model.krGptConnectionId || null,
    command.model.provider,
    command.model.model,
  ).first<JsonObject>()

  return row ? modelConnectionRow(row) : null
}

/** Saves the approved application/model settings without storing provider secrets. */
async function saveApprovedSettings(command: GptWorkerCommand, env: GptWorkerEnv): Promise<JsonObject> {
  if (!command.model) throw new Error('VALIDATION_MODEL_REQUIRED')
  const applicationId = command.applicationId || env.GPT_APPLICATION_ID || DEFAULT_APPLICATION_ID
  const approvedApiKey = command.approvedApiKey || `${command.model.provider}-primary`
  const now = new Date().toISOString()
  const connection = await updateModelConnectionMetadata(command, env, now)
  const credentialMetadata = command.credential ? {
    keyName: command.credential.credential,
    credential: command.credential.credential,
    config1: nullableConfigValue(command.credential.config1) || '',
    config2: nullableConfigValue(command.credential.config2) || '',
    config3: nullableConfigValue(command.credential.config3) || '',
  } : undefined
  const settingsJson = JSON.stringify({ model: command.model, settings: normalizeSettings(command.settings), credentialMetadata })
  await env.GPT_USAGE_DB.prepare(`
    INSERT INTO gpt_approved_application (
      application_id, approved_api_key, settings_json,
      updated_by_user_id, updated_by_email, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(application_id) DO UPDATE SET
      approved_api_key = excluded.approved_api_key,
      settings_json = excluded.settings_json,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_by_email = excluded.updated_by_email,
      updated_at = excluded.updated_at
  `).bind(
    applicationId,
    approvedApiKey.slice(0, 120),
    settingsJson,
    command.requestedBy?.userId || null,
    command.requestedBy?.email || null,
    now,
  ).run()
  return { applicationId, approvedApiKey, settings: JSON.parse(settingsJson), connection }
}

/** Saves one display-safe model connection; readiness changes its state later. */
async function saveModelConnection(command: GptWorkerCommand, env: GptWorkerEnv): Promise<JsonObject> {
  const connection = command.modelConnection
  if (!connection) throw new Error('VALIDATION_MODEL_CONNECTION_REQUIRED')
  const applicationId = command.applicationId || env.GPT_APPLICATION_ID || DEFAULT_APPLICATION_ID
  const now = new Date().toISOString()
  const provider = connection.provider.trim().slice(0, 160)
  const model = connection.model.trim().slice(0, 160)
  const credentialName = connection.credentialName?.trim().slice(0, 120) || 'api-key'
  const existingRowSelector = connection.id || connection.krGptConnectionId

  if (existingRowSelector) {
    const updated = await env.GPT_USAGE_DB.prepare(`
      UPDATE gpt_model_connection
      SET
        connection_type = ?,
        provider = ?,
        llm_model = ?,
        credential_name = ?,
        config1 = ?,
        config2 = ?,
        config3 = ?,
        state = 'unconfigured',
        updated_by_user_id = ?,
        updated_by_email = ?,
        updated_at = ?
      WHERE application_id = ?
        AND (
          id = ?
          OR kr_gpt_connection_id = ?
        )
    `).bind(
      connection.connection,
      provider,
      model,
      credentialName,
      nullableConfigValue(connection.config1),
      nullableConfigValue(connection.config2),
      nullableConfigValue(connection.config3),
      command.requestedBy?.userId || null,
      command.requestedBy?.email || null,
      now,
      applicationId,
      connection.id || null,
      connection.krGptConnectionId || null,
    ).run()

    if (Number(updated.meta?.changes || 0) > 0) {
      const row = await env.GPT_USAGE_DB.prepare(`
        SELECT
          id,
          kr_gpt_connection_id AS krGptConnectionId,
          connection_type AS connection,
          provider,
          llm_model AS model,
          credential_name AS credentialName,
          config1,
          config2,
          config3,
          state
        FROM gpt_model_connection
        WHERE application_id = ?
          AND (
            id = ?
            OR kr_gpt_connection_id = ?
          )
        LIMIT 1
      `).bind(applicationId, connection.id || null, connection.krGptConnectionId || null).first<JsonObject>()
      if (row) return { connection: modelConnectionRow(row) }
    }
  }

  const id = `gptmc_${crypto.randomUUID()}`
  const krGptConnectionId = connection.krGptConnectionId?.trim().slice(0, 96) || generateKrGptConnectionId(connection)
  await env.GPT_USAGE_DB.prepare(`
    INSERT INTO gpt_model_connection (
      id, kr_gpt_connection_id, application_id, connection_type, provider, llm_model,
      credential_name, config1, config2, config3, state,
      created_by_user_id, created_by_email, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unconfigured', ?, ?, ?)
  `).bind(
    id,
    krGptConnectionId,
    applicationId,
    connection.connection,
    provider,
    model,
    credentialName,
    nullableConfigValue(connection.config1),
    nullableConfigValue(connection.config2),
    nullableConfigValue(connection.config3),
    command.requestedBy?.userId || null,
    command.requestedBy?.email || null,
    now,
  ).run()
  const row = await env.GPT_USAGE_DB.prepare(`
    SELECT
      id,
      kr_gpt_connection_id AS krGptConnectionId,
      connection_type AS connection,
      provider,
      llm_model AS model,
      credential_name AS credentialName,
      config1,
      config2,
      config3,
      state
    FROM gpt_model_connection
    WHERE application_id = ? AND kr_gpt_connection_id = ?
    LIMIT 1
  `).bind(applicationId, krGptConnectionId).first<JsonObject>()
  return { connection: row ? modelConnectionRow(row) : { id, krGptConnectionId, connection: connection.connection, provider, model, credentialName, config1: nullableConfigValue(connection.config1), config2: nullableConfigValue(connection.config2), config3: nullableConfigValue(connection.config3), state: 'unconfigured', enabled: true } }
}

/** Deletes one model connection and its matching credential records. */
async function deleteModelConnection(command: GptWorkerCommand, env: GptWorkerEnv): Promise<JsonObject> {
  const connection = command.modelConnection
  if (!connection) throw new Error('VALIDATION_MODEL_CONNECTION_REQUIRED')
  const applicationId = command.applicationId || env.GPT_APPLICATION_ID || DEFAULT_APPLICATION_ID
  const provider = connection.provider.trim().slice(0, 160)
  const model = connection.model.trim().slice(0, 160)
  const deleted = await env.GPT_USAGE_DB.prepare(`
    DELETE FROM gpt_model_connection
    WHERE application_id = ?
      AND (
        id = ?
        OR kr_gpt_connection_id = ?
        OR (? IS NULL AND ? IS NULL AND connection_type = ? AND provider = ? AND llm_model = ?)
      )
  `).bind(applicationId, connection.id || null, connection.krGptConnectionId || null, connection.id || null, connection.krGptConnectionId || null, connection.connection, provider, model).run()
  const credentialProvider = connection.connection === 'gemini' ? 'gemini' : connection.connection === 'openai' ? 'openai' : 'cloudflare-ai-gateway'
  const remaining = await env.GPT_USAGE_DB.prepare('SELECT 1 AS present FROM gpt_model_connection WHERE connection_type = ? AND llm_model = ? LIMIT 1').bind(connection.connection, model).first()
  if (!remaining) await env.GPT_USAGE_DB.prepare('DELETE FROM gpt_llm_credential WHERE provider = ? AND llm_model = ?').bind(credentialProvider, model).run()
  return { deleted: Number(deleted.meta?.changes || 0) > 0, provider, model }
}

/** Builds an aggregate usage report for the Homebase reporting panel. */
async function reportUsage(command: GptWorkerCommand, env: GptWorkerEnv): Promise<JsonObject> {
  const limit = Math.min(Math.max(Math.round(command.limit || 50), 1), 200)
  const applicationId = command.applicationId || env.GPT_APPLICATION_ID || DEFAULT_APPLICATION_ID
  const rowsResult = await env.GPT_USAGE_DB.prepare(`
    SELECT
      model_provider AS modelProvider,
      model_name AS modelName,
      kr_gpt_connection_id AS krGptConnectionId,
      COUNT(*) AS requestCount,
      SUM(input_tokens) AS inputTokens,
      SUM(cached_tokens) AS cachedTokens,
      SUM(output_tokens) AS outputTokens,
      SUM(total_tokens) AS totalTokens,
      SUM(total_cost) AS totalCost,
      MAX(requested_at) AS lastRequestedAt
    FROM gpt_usage
    WHERE application_id = ?
    GROUP BY model_provider, model_name, kr_gpt_connection_id
    ORDER BY lastRequestedAt DESC
    LIMIT ?
  `).bind(applicationId, limit).all()
  const rows = (rowsResult.results || []) as Array<JsonObject>
  const totals = rows.reduce<{ requestCount: number; inputTokens: number; cachedTokens: number; outputTokens: number; totalTokens: number; totalCost: number }>((summary, row) => ({
    requestCount: summary.requestCount + nonNegativeInteger(row.requestCount),
    inputTokens: summary.inputTokens + nonNegativeInteger(row.inputTokens),
    cachedTokens: summary.cachedTokens + nonNegativeInteger(row.cachedTokens),
    outputTokens: summary.outputTokens + nonNegativeInteger(row.outputTokens),
    totalTokens: summary.totalTokens + nonNegativeInteger(row.totalTokens),
    totalCost: summary.totalCost + Number(row.totalCost || 0),
  }), { requestCount: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0 })
  const savedRow = await env.GPT_USAGE_DB.prepare(`
    SELECT settings_json AS settingsJson
    FROM gpt_approved_application
    WHERE application_id = ?
    LIMIT 1
  `).bind(applicationId).first()
  let savedSettings: unknown = null
  if (isRecord(savedRow) && typeof savedRow.settingsJson === 'string') {
    try {
      savedSettings = JSON.parse(savedRow.settingsJson)
    } catch {
      savedSettings = null
    }
  }
  const credentialResult = await env.GPT_USAGE_DB.prepare(`
    SELECT
      provider,
      llm_model AS llmModel,
      credential,
      CASE WHEN length(trim("key")) > 0 THEN 1 ELSE 0 END AS hasKey,
      is_key_encrypted AS isKeyEncrypted,
      config1,
      config2,
      config3
    FROM gpt_llm_credential
    ORDER BY provider, llm_model, credential
  `).all()
  const credentials = (credentialResult.results || []).map((row) => ({
    provider: row.provider,
    llmModel: row.llmModel,
    credential: row.credential,
    hasKey: row.hasKey === 1,
    isKeyEncrypted: row.isKeyEncrypted === 1,
    config1: typeof row.config1 === 'string' ? row.config1 : null,
    config2: typeof row.config2 === 'string' ? row.config2 : null,
    config3: typeof row.config3 === 'string' ? row.config3 : null,
  }))
  const connectionsResult = await env.GPT_USAGE_DB.prepare(`
    SELECT
      id,
      kr_gpt_connection_id AS krGptConnectionId,
      connection_type AS connection,
      provider,
      llm_model AS model,
      credential_name AS credentialName,
      config1,
      config2,
      config3,
      state
    FROM gpt_model_connection
    WHERE application_id = ?
    ORDER BY provider, llm_model
  `).bind(applicationId).all()
  const connections = (connectionsResult.results || []).map((row) => modelConnectionRow(row as JsonObject))
  return { applicationId, rows, totals, credentials, savedSettings, connections }
}

/** Executes a decrypted command and writes usage when a provider was called. */
async function executeCommand(command: GptWorkerCommand, env: GptWorkerEnv): Promise<JsonObject> {
  if (command.action === 'REPORT_USAGE') return reportUsage(command, env)
  if (command.action === 'SAVE_SETTINGS') return saveApprovedSettings(command, env)
  if (command.action === 'SAVE_CREDENTIAL') return saveLlmCredential(command, env)
  if (command.action === 'SAVE_MODEL_CONNECTION') return saveModelConnection(command, env)
  if (command.action === 'DELETE_MODEL_CONNECTION') return deleteModelConnection(command, env)

  const providerResult = await executeProvider(command, env)
  const usageRecord = await writeUsageRecord(command, providerResult, env)
  return {
    text: providerResult.text,
    provider: providerResult.provider,
    model: providerResult.model,
    latencyMs: providerResult.latencyMs,
    usage: providerResult.usage,
    cost: {
      input: usageRecord.inputCost,
      cached: usageRecord.cachedCost,
      output: usageRecord.outputCost,
      total: usageRecord.totalCost,
    },
  }
}

/** Handles Worker health, authentication, provider execution, and reporting. */
async function handleRequest(request: Request, env: GptWorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname.endsWith('/health')) {
    return json({ ok: true, worker: 'gpt-models-worker', schema: 'Schema_GPT_Usage_1.1' })
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

  let body: Partial<GptWorkerRequestBody>
  try {
    body = await request.json() as Partial<GptWorkerRequestBody>
  } catch {
    return json({ ok: false, error: 'REQUEST_PARSE_ERROR' }, 400)
  }
  if (typeof body.token !== 'string' || !isRecord(body.encryptedPayload)) {
    return json({ ok: false, error: 'REQUEST_ENVELOPE_INVALID' }, 400)
  }

  let token: GptRequestJwt
  try {
    token = await verifyRequestToken(body.token, env)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'AUTH_FAILED' }, 401)
  }

  let command: GptWorkerCommand
  try {
    command = await decryptCommand(body.encryptedPayload as EncryptedEnvelope, env)
    validateCommand(command, token)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'PAYLOAD_INVALID' }, 400)
  }

  try {
    const data = await executeCommand(command, env)
    return secureResponse({ ok: true, requestId: command.requestId, action: command.action, data }, command.requestId, command.action, env)
  } catch (error) {
    return secureResponse(
      {
        ok: false,
        requestId: command.requestId,
        action: command.action,
        error: error instanceof Error ? error.message : 'GPT_PROVIDER_REQUEST_FAILED',
      },
      command.requestId,
      command.action,
      env,
    )
  }
}

export default {
  /** Routes health checks and encrypted GPT Gateway requests. */
  async fetch(request: Request, env: GptWorkerEnv): Promise<Response> {
    return handleRequest(request, env)
  },
}
