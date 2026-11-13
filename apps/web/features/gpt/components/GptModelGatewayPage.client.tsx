'use client'
// file: apps/web/features/gpt/components/GptModelGatewayPage.client.tsx
/**
 * Firm Settings → GPT Model Gateway (Settings plan, stage 7; page id `gpt-model-gateway`; super admin only — the API
 * refuses everyone else). Port of the old `GptModelGatewayWorkspace` with `GptModelsPanel`
 * (`docs/API/Settings_AsIs_Reference.md` section 6). State and calls live in `useGptGateway.client.ts`.
 *
 * What it draws, in the old order:
 *  - **Loading:** "Loading saved GPT model connections…" (`gpt-model-connections-loading`).
 *  - **Cannot be reached** (new): when the API has no GPT Worker binding or secret, or the Worker is not deployed,
 *    "GPT Model Gateway cannot be reached right now" with Try again (`gpt-model-gateway-unavailable`).
 *  - **No connections:** the old card variant: "MODEL CONNECTIONS", "Add Model Connection", its description, Add
 *    connection and the empty Connection / Provider model / State table, then any error line.
 *  - **Connections:** the panel: intro (eyebrow, title, description, Add connection, transport badge), the "Models in
 *    use" ledger, the selected connection's editor (Gemini, or OpenAI / Cloudflare), the usage report (both with the
 *    orange left bar), and the status line.
 *  - The Edit Model Connection dialog (exact old look) and the Delete Connection question (`U6ConfirmationDialog`).
 *
 * Changed from the old page: the transport badge says "Service binding / API and gpt-models-worker" (the old text
 * "Signed + encrypted / Server ↔ gpt-models-worker" no longer describes the transport); the empty-state id is
 * `gpt-model-connections-empty` (the old `p29-` prefix was a prototype number, which the web guide forbids); the
 * old `apiBaseUrl` prop is gone (calls go to the same host); spacing follows the shared scale (see `gptPanelStyles.ts`).
 *
 * @param props.initialData - Gateway data for the first draw (tests); the page reads it itself when left out.
 * @returns The workspace (`data-kr-id="gpt-model-gateway-workspace"`).
 */

import type { GptGatewayData } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { GPT_UNAVAILABLE_SENTENCE } from '@/features/gpt/api.client'
import GptConnectionDialog from '@/features/gpt/components/GptConnectionDialog.client'
import GptConnectionEditor from '@/features/gpt/components/GptConnectionEditor.client'
import type { GptEditorProps } from '@/features/gpt/components/GptEditorParts.client'
import GptGeminiEditor from '@/features/gpt/components/GptGeminiEditor.client'
import GptModelsLedger from '@/features/gpt/components/GptModelsLedger.client'
import GptUsageReport from '@/features/gpt/components/GptUsageReport.client'
import { LAYOUT_STYLES, STYLES } from '@/features/gpt/components/gptPanelStyles'
import { useGptGateway, type GptGatewayState } from '@/features/gpt/useGptGateway.client'

/** The empty card's table (old `.table` of GptModelConnectionsCard), in the register's density. */
const EMPTY_TABLE = {
  table: 'w-full border-collapse text-[10pt] leading-tight',
  th: 'p-[1px] border-b border-[var(--kr-theme-table-border,#b8c3cd)] bg-[var(--kr-theme-table-header-background,#f4f6f8)] text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-[var(--kr-theme-text-muted,#526172)]',
  td: 'p-[1px] border-b border-[var(--kr-theme-table-border,#d7dee5)] text-[var(--kr-theme-text-muted,#526172)]',
} as const

/** The Add connection button (old trigger variant of `GptModelConnectionsCard`). */
function AddConnectionButton({ state }: { state: GptGatewayState }) {
  return (
    <button className={`${STYLES.button} ${STYLES.primary}`} data-kr-action="open-gpt-model-connection-dialog" data-kr-element="gpt-model-connections-add-button" onClick={() => state.setDialog({ connection: null })} type="button">
      Add connection
    </button>
  )
}

/** The status line (old `.status`, 3px left bar; orange when it reports a failure). */
function StatusLine({ state, element = 'gpt-models-status' }: { state: GptGatewayState; element?: string }) {
  return (
    <p aria-live="polite" className={`${LAYOUT_STYLES.status} ${STYLES.status} ${state.status.error ? STYLES.statusError : ''}`} data-kr-element={element}>
      {state.status.text}
    </p>
  )
}

/** The selected connection's editor: Gemini, or the shared OpenAI / Cloudflare editor (old panel's choice). */
function SelectedEditor({ state }: { state: GptGatewayState }) {
  const { selected, settings, credential } = state
  if (!selected || !settings || !credential) return null
  const props: GptEditorProps = {
    model: selected, settings, credential, credentialStatus: state.credentialStatus, readiness: state.readiness, readinessStatus: state.readinessStatus, busy: state.busy, settingsSaved: state.settingsSaved,
    updateSetting: state.updateSetting, updateModel: state.updateModel, updateCredential: state.updateCredential,
    checkReadiness: () => void state.checkReadiness(), saveCredential: () => void state.saveCredential(), saveSettings: () => void state.saveSettings(), loadUsageReport: () => void state.loadUsageReport(), copyReadiness: () => void state.copyReadiness(), onDelete: () => state.setConfirmDelete(true),
  }
  // Gemini model identifiers must use the Gemini editor even when an older row was saved with a provider label
  // instead of the normalized connection type.
  if (selected.provider === 'gemini' || selected.model === 'gemini-3.7-flash') return <GptGeminiEditor key={selected.id} {...props} />
  return <GptConnectionEditor key={selected.id} {...props} providerKind={selected.provider === 'openai' ? 'openai' : 'cloudflare-ai-gateway'} />
}

/**
 * The page when the gateway cannot be read (new). `unavailable`: no GPT Worker binding or secret in the API, or the
 * Worker is not deployed or cannot be reached; otherwise another refusal, whose sentence is `detail`.
 */
export function GptUnavailableNotice({ unavailable, detail, onRetry }: { unavailable: boolean; detail: string; onRetry: () => void }) {
  return (
    <section className={`${LAYOUT_STYLES.unavailable} ${STYLES.leftBar}`} data-kr-element="gpt-model-gateway-unavailable" data-kr-id="gpt-model-gateway-unavailable" role="alert">
      <p className={STYLES.eyebrow}>Super Admin · GPT Gateway</p>
      <h2 className={STYLES.editorTitle}>{unavailable ? GPT_UNAVAILABLE_SENTENCE : 'The GPT Model Gateway could not be loaded.'}</h2>
      <p className={STYLES.muted}>{unavailable ? 'The GPT models Worker is not deployed or not connected to the API yet. No connection, key or usage can be shown or changed until it is.' : detail}</p>
      <div className={LAYOUT_STYLES.actions}>
        <button className={`${STYLES.button} ${STYLES.ghost}`} onClick={onRetry} type="button">Try again</button>
      </div>
    </section>
  )
}

export function GptModelGatewayPage({ initialData }: { initialData?: GptGatewayData }) {
  const state = useGptGateway(initialData)
  const { gateway, loadState } = state

  let body
  if (loadState === 'loading') {
    body = (
      <section aria-label="GPT model connections loading" className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`} data-kr-component="GptModelsPanel" data-kr-id="gpt-model-connections-loading">
        <p className={`${LAYOUT_STYLES.status} ${STYLES.status}`}>Loading saved GPT model connections...</p>
      </section>
    )
  } else if (loadState === 'unavailable' || loadState === 'error' || !gateway) {
    // The gateway could not be read: no Worker, no binding, no network, or a refusal. Nothing else is drawn.
    body = <GptUnavailableNotice detail={state.status.text} onRetry={() => void state.load()} unavailable={loadState === 'unavailable'} />
  } else if (gateway.connections.length === 0) {
    // No saved connections: the old card variant of GptModelConnectionsCard.
    body = (
      <div className={LAYOUT_STYLES.workspace} data-kr-element="gpt-model-connections-empty-state" data-kr-id="gpt-model-connections-empty">
        <section className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`} data-kr-component="GptModelConnectionsCard" data-kr-element="gpt-model-connections-card">
          <header className={LAYOUT_STYLES.intro}>
            <div>
              <p className={STYLES.eyebrow}>MODEL CONNECTIONS</p>
              <h2 className={STYLES.title}>Add Model Connection</h2>
              <p className={STYLES.muted}>Save the connection company and exact provider model identifier. New rows remain unconfigured until a successful test response is obtained.</p>
            </div>
            <AddConnectionButton state={state} />
          </header>
          {/* The old card's table: Connection, Provider model, State (empty here by definition) */}
          <div className={`${LAYOUT_STYLES.ledgerBoundary} ${STYLES.card}`}>
            <table className={EMPTY_TABLE.table}>
              <thead>
                <tr>
                  <th className={EMPTY_TABLE.th}>Connection</th>
                  <th className={EMPTY_TABLE.th}>Provider model</th>
                  <th className={EMPTY_TABLE.th}>State</th>
                </tr>
              </thead>
              <tbody data-kr-element="rows-container">
                <tr>
                  <td className={EMPTY_TABLE.td} colSpan={3}>No model connections saved yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        {state.status.error ? <StatusLine element="gpt-model-connections-error" state={state} /> : null}
      </div>
    )
  } else {
    body = (
      <section aria-label="GPT model connections" className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`} data-kr-component="GptModelsPanel" data-kr-element="gpt-models-panel" data-kr-id="gpt-models-panel">
        {/* Intro: title and description, Add connection, transport badge */}
        <div className={LAYOUT_STYLES.intro} data-kr-element="gpt-models-intro">
          <div>
            <p className={STYLES.eyebrow}>Super Admin · GPT Gateway</p>
            <h2 className={STYLES.title}>Model connections</h2>
            <p className={STYLES.muted}>Select a provider connection, adjust its provider-neutral controls, save the approved application settings, or send the readiness prompt through the secure Worker boundary.</p>
          </div>
          <div className={LAYOUT_STYLES.introActions}>
            <AddConnectionButton state={state} />
            <div className={`${LAYOUT_STYLES.transportBadge} ${STYLES.transportBadge}`} data-kr-element="gpt-models-transport-badge">
              <span className={STYLES.transportSmall}>Transport</span>
              <strong className={STYLES.transportStrong}>Service binding</strong>
              <small className={STYLES.transportSmall}>API and gpt-models-worker</small>
            </div>
          </div>
        </div>

        {/* Models in use, then the selected connection's editor and the usage report (orange left bars) */}
        <GptModelsLedger
          onEdit={(row) => state.setDialog({ connection: gateway.connections.find((item) => item.id === row.id) ?? null })}
          onRowSelect={state.selectRow}
          rows={state.rows}
          selectedRowId={state.selected?.id ?? null}
        />
        <SelectedEditor state={state} />
        <GptUsageReport report={gateway.usage} />
        <StatusLine state={state} />
      </section>
    )
  }

  return (
    <section aria-label="GPT Model Gateway workspace" className={LAYOUT_STYLES.workspace} data-kr-id="gpt-model-gateway-workspace">
      {body}
      {/* Edit Model Connection dialog: mounted only while open, so each opening starts from its connection */}
      {state.dialog ? (
        <GptConnectionDialog
          editConnection={state.dialog.connection}
          key={state.dialog.connection?.id ?? 'new'}
          onClose={() => state.setDialog(null)}
          onDeleted={state.connectionDeleted}
          onSaved={state.connectionSaved}
        />
      ) : null}
      <U6ConfirmationDialog
        busy={state.busy === 'delete'}
        confirmLabel="Delete Connection"
        description={state.selected ? `Delete the ${state.selected.displayName} connection?` : ''}
        onCancel={() => state.setConfirmDelete(false)}
        onConfirm={() => void state.deleteSelected()}
        open={state.confirmDelete}
        title="Delete this connection?"
      />
    </section>
  )
}

export default GptModelGatewayPage
