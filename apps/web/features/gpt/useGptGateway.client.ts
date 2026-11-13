'use client'
// file: apps/web/features/gpt/useGptGateway.client.ts
/**
 * The state and actions of the GPT Model Gateway page, moved out of the old `GptModelsPanel` component so the page
 * file stays short. It loads the gateway once, keeps per-connection editor drafts (settings, key name and non-secret
 * values, the one-time key), the busy state, the status line, the readiness result and the dialogs, and calls the API
 * through `api.client.ts`. `GptModelGatewayPage` draws what it returns.
 *
 * Kept from the old panel: the status sentences, the readiness, settings, credential, report and delete flows, the
 * "Settings saved" state, the in-session model id edit, the copy text, and clearing the key after it is saved.
 *
 * Changed from the old panel:
 *  - A gateway that cannot be reached (no Worker, no binding, no network) becomes the `unavailable` state, which the
 *    page shows as "GPT Model Gateway cannot be reached right now" with Try again; the old panel showed an error line.
 *  - Delete Connection asks first in `U6ConfirmationDialog` (old `window.confirm`), and deletes by row id.
 *  - After a successful readiness check the gateway is read again quietly, so the State column and the usage report
 *    show the new state (the old panel did not refresh them).
 *  - Saving a connection in the dialog clears that connection's editor drafts, so they start from the saved row.
 *  - The Worker set-up list ("Worker setup still needs: …") is gone; the API no longer reports missing settings.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GptGatewayData, GptModelConnection, GptModelSettings, GptReadinessData } from '@krhomebase/contracts'
import { checkGptReadiness, deleteGptConnection, fetchGptGateway, fetchGptUsage, GptApiError, gptErrorSentence, saveGptCredential, saveGptSettings } from '@/features/gpt/api.client'
import { credentialDraftFor, credentialStatusFor, modelFromConnection, modelRows, readinessCopyText, settingsFor, type GptCredentialDraft, type GptEditorBusy, type GptModelRow } from '@/features/gpt/gptGatewayRows'

export type GptLoadState = 'loading' | 'ready' | 'unavailable' | 'error'
export interface GptStatus {
  text: string
  error: boolean
}
/** The Edit Model Connection dialog: closed (null), adding (connection null) or editing. */
export type GptDialogState = { connection: GptModelConnection | null } | null

const upsert = (rows: GptModelConnection[], row: GptModelConnection) => [...rows.filter((item) => item.id !== row.id && item.krGptConnectionId !== row.krGptConnectionId), row]

/**
 * @param initialData - Gateway data for the first draw (tests); when left out the hook reads it from the API.
 */
export function useGptGateway(initialData?: GptGatewayData) {
  const [gateway, setGateway] = useState<GptGatewayData | null>(initialData ?? null)
  const [loadState, setLoadState] = useState<GptLoadState>(initialData ? 'ready' : 'loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({})
  const [settingsById, setSettingsById] = useState<Record<string, GptModelSettings>>({})
  const [credentialsById, setCredentialsById] = useState<Record<string, GptCredentialDraft>>({})
  const [savedById, setSavedById] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<GptEditorBusy>(null)
  const [status, setStatus] = useState<GptStatus>({ text: initialData ? 'Saved connections loaded. Select a model to configure its connection.' : 'Loading GPT Gateway catalog...', error: false })
  const [readiness, setReadiness] = useState<GptReadinessData | null>(null)
  const [readinessStatus, setReadinessStatus] = useState('')
  const [dialog, setDialog] = useState<GptDialogState>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const say = (text: string, error = false) => setStatus({ text, error })

  /** Reads the gateway. `quiet` keeps the page drawn (used after readiness). */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoadState('loading')
    try {
      const data = await fetchGptGateway()
      setGateway(data)
      setLoadState('ready')
      if (!quiet) setStatus({ text: data.connections.length ? 'Saved connections loaded. Select a model to configure its connection.' : 'No saved connections found. Add a model connection to begin.', error: false })
    } catch (error) {
      if (quiet) return
      setLoadState(error instanceof GptApiError && error.unavailable ? 'unavailable' : 'error')
      setStatus({ text: gptErrorSentence(error, 'Unable to retrieve saved GPT model connections.'), error: true })
    }
  }, [])

  useEffect(() => {
    if (!initialData) void load()
  }, [initialData, load])

  // Ledger rows, with the in-session model id edits of the Gemini editor applied.
  const rows = useMemo(
    () =>
      modelRows(gateway?.connections ?? []).map((row) => {
        const model = modelOverrides[row.id]
        return model ? { ...row, model, displayName: model === 'gemini-3.7-flash' ? 'Gemini 3.7 Flash' : `Gemini · ${model}` } : row
      }),
    [gateway, modelOverrides],
  )
  const selected = rows.find((row) => row.id === selectedId) ?? null
  const selectedConnection = gateway?.connections.find((item) => item.id === selectedId)
  const settings = selected ? (settingsById[selected.id] ?? settingsFor(gateway, selected).settings) : null
  const credential = selected ? (credentialsById[selected.id] ?? credentialDraftFor(gateway, selectedConnection, selected)) : null
  const settingsSaved = selected ? (savedById[selected.id] ?? settingsFor(gateway, selected).saved) : false
  const credentialStatus = selected ? credentialStatusFor(gateway, selected, credential?.keyName) : null

  const modelRef = (row: GptModelRow) => ({ provider: row.provider, model: row.model, krGptConnectionId: row.krGptConnectionId, displayName: row.displayName })
  const credentialMeta = (draft: GptCredentialDraft) => ({ credentialName: draft.keyName.trim() || 'api-key', config1: draft.config1, config2: draft.config2, config3: draft.config3 })

  function selectRow(row: GptModelRow): void {
    setSelectedId(row.id)
    setReadiness(null)
    setReadinessStatus('')
    say(`Editing ${row.displayName}.`)
  }

  function updateSetting<K extends keyof GptModelSettings>(key: K, value: GptModelSettings[K]): void {
    if (!selected || !settings) return
    setSettingsById((current) => ({ ...current, [selected.id]: { ...settings, [key]: value } }))
    setSavedById((current) => ({ ...current, [selected.id]: false }))
  }

  function updateModel(nextModel: string): void {
    if (!selected) return
    const normalized = nextModel.trim().slice(0, 160)
    if (!normalized) return
    setModelOverrides((current) => ({ ...current, [selected.id]: normalized }))
    setSavedById((current) => ({ ...current, [selected.id]: false }))
  }

  function updateCredential<K extends keyof GptCredentialDraft>(key: K, value: GptCredentialDraft[K]): void {
    if (!selected || !credential) return
    setCredentialsById((current) => ({ ...current, [selected.id]: { ...credential, [key]: value } }))
    if (selected.provider === 'gemini' && (key === 'keyName' || key === 'config1' || key === 'config2')) setSavedById((current) => ({ ...current, [selected.id]: false }))
  }

  /** Runs the exact readiness prompt through the selected provider. */
  async function checkReadiness(): Promise<void> {
    if (!selected || !settings || !credential) return
    setBusy('readiness')
    setReadiness(null)
    setReadinessStatus(`Checking ${selected.displayName}...`)
    say(`Checking ${selected.displayName}...`)
    try {
      const result = await checkGptReadiness({ model: modelRef(selected), settings, credential: credentialMeta(credential) })
      setReadiness(result)
      setReadinessStatus('Readiness check succeeded. The Worker returned a response and recorded usage.')
      say('Readiness response returned and usage was recorded by the Worker.')
      void load(true)
    } catch (error) {
      const message = gptErrorSentence(error, 'GPT readiness check failed.')
      setReadinessStatus(`Readiness check failed: ${message}`)
      say(message, true)
    } finally {
      setBusy(null)
    }
  }

  /** Copies the latest safe readiness status and response details without exposing credentials. */
  async function copyReadiness(): Promise<void> {
    const text = readinessCopyText(readinessStatus, readiness)
    if (!text) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.')
      await navigator.clipboard.writeText(text)
      setReadinessStatus('Readiness status and response copied to the clipboard.')
    } catch (error) {
      setReadinessStatus(`Unable to copy readiness status: ${error instanceof Error ? error.message : 'clipboard access was denied.'}`)
    }
  }

  /** Saves the typed key (sealed by the Worker); the field is cleared after the save. */
  async function saveCredential(): Promise<void> {
    if (!selected || !credential?.key) {
      say('Enter a credential key before saving it.', true)
      return
    }
    setBusy('credential')
    say(`Saving ${selected.displayName} credential...`)
    try {
      const meta = credentialMeta(credential)
      const { credential: stored } = await saveGptCredential({ model: modelRef(selected), credentialName: meta.credentialName, key: credential.key, config1: meta.config1, config2: meta.config2 || 'krhomebase', config3: meta.config3 })
      setCredentialsById((current) => ({ ...current, [selected.id]: { ...credential, keyName: meta.credentialName, key: '' } }))
      setGateway((current) => (current ? { ...current, credentials: [...current.credentials.filter((item) => !(item.provider === stored.provider && item.llmModel === stored.llmModel && item.credential === stored.credential)), stored] } : current))
      say(stored.hasKey ? 'Credential saved encrypted in the GPT usage database.' : 'Credential save completed.')
    } catch (error) {
      say(gptErrorSentence(error, 'GPT credential save failed.'), true)
    } finally {
      setBusy(null)
    }
  }

  /** Saves non-secret model settings under the krhomebase application record. */
  async function saveSettings(): Promise<void> {
    if (!selected || !settings || !credential) return
    setBusy('save')
    say(`Saving ${selected.displayName} settings...`)
    try {
      const saved = await saveGptSettings({ model: modelRef(selected), settings, credential: credentialMeta(credential) })
      if (saved.connection) setGateway((current) => (current ? { ...current, connections: upsert(current.connections, saved.connection!) } : current))
      setSavedById((current) => ({ ...current, [selected.id]: true }))
      say(`Settings and non-secret connection metadata saved for application ${saved.applicationId}.`)
    } catch (error) {
      say(gptErrorSentence(error, 'GPT settings save failed.'), true)
    } finally {
      setBusy(null)
    }
  }

  /** Requests the Worker's usage report. */
  async function loadUsageReport(): Promise<void> {
    setBusy('report')
    say('Loading GPT usage report...')
    try {
      const usage = await fetchGptUsage(50)
      setGateway((current) => (current ? { ...current, usage } : current))
      say('Usage report refreshed from gpt_usage.')
    } catch (error) {
      say(gptErrorSentence(error, 'GPT usage report failed.'), true)
    } finally {
      setBusy(null)
    }
  }

  /** Deletes the selected connection (asked first in the confirmation dialog). */
  async function deleteSelected(): Promise<void> {
    if (!selected) return
    setBusy('delete')
    say(`Deleting ${selected.displayName}...`)
    try {
      await deleteGptConnection(selected.id)
      setGateway((current) => (current ? { ...current, connections: current.connections.filter((item) => item.id !== selected.id) } : current))
      setSelectedId(null)
      setReadiness(null)
      setConfirmDelete(false)
      say('Connection deleted.')
    } catch (error) {
      setConfirmDelete(false)
      say(gptErrorSentence(error, 'GPT connection delete failed.'), true)
    } finally {
      setBusy(null)
    }
  }

  /** The dialog saved a connection: keep it, open its editor, or say it has no editor yet. */
  function connectionSaved(connection: GptModelConnection, edited: boolean): void {
    setGateway((current) => (current ? { ...current, connections: upsert(current.connections, connection) } : current))
    const drop = <T,>(current: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(current).filter(([id]) => id !== connection.id))
    setSettingsById(drop)
    setCredentialsById(drop)
    setSavedById(drop)
    setModelOverrides(drop)
    if (!modelFromConnection(connection)) {
      say(`The saved ${connection.connection} connection does not yet have a supported editor.`, true)
      return
    }
    setSelectedId(connection.id)
    setReadiness(null)
    setReadinessStatus('')
    say(edited ? 'Model connection updated with State: Unconfigured.' : 'Connection saved with State: Unconfigured.')
  }

  /** The dialog deleted a connection. */
  function connectionDeleted(connection: GptModelConnection): void {
    setGateway((current) => (current ? { ...current, connections: current.connections.filter((item) => item.id !== connection.id) } : current))
    if (connection.id === selectedId) setSelectedId(null)
    setReadiness(null)
    say('Model connection deleted.')
  }

  return {
    gateway, loadState, load, rows, selected, settings, credential, settingsSaved, credentialStatus, busy, status, readiness, readinessStatus,
    dialog, setDialog, confirmDelete, setConfirmDelete,
    selectRow, updateSetting, updateModel, updateCredential, checkReadiness, copyReadiness, saveCredential, saveSettings, loadUsageReport, deleteSelected, connectionSaved, connectionDeleted,
  }
}

export type GptGatewayState = ReturnType<typeof useGptGateway>
