'use client'
// file: apps/web/features/payment-providers/components/PaymentProviderConfigPanel.client.tsx
/**
 * Settings → Stripe Payment Configuration: the Live and Sandbox cards with the encryption key status row. Ported from
 * the old `firm-settings/stripe-payment-configuration/PaymentProviderConfigPanel.client.tsx`; layout, classes, texts,
 * markers and behavior are the old ones.
 *
 * Changed from the old file:
 * - Loads `GET /api/v1/payment-providers` through `api.client.ts`.
 * - Friendly load errors: the `PAYMENT_PROVIDER_TABLE_MISSING` sentence no longer mentions a CRUD Worker deploy, and
 *   the CRUD Worker registry case (`VALIDATION_SEARCH_COLUMN_UNKNOWN…`) is gone: the API reads the table directly. The
 *   forbidden case still matches any code containing `FORBIDDEN` (the new API's code is `FORBIDDEN`).
 * - Styling only, same look in the light theme: the Refresh button's `rounded` became `rounded-[4px]` and `bg-white`
 *   the card surface token. The cards row keeps the old `xl:grid-cols-2` (Live beside Sandbox from 1280px) as the
 *   stated exception "ported exactly" in DESIGN.md "Feature variations"; the repository's widths are `md:` and `lg:`.
 */

import { useCallback, useEffect, useState } from 'react'
import { PAYMENT_PROVIDER_ENVIRONMENTS, type PaymentProviderConfig, type PaymentProviderListResult } from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { describeKrRequestError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { loadPaymentProviders } from '@/features/payment-providers/api.client'
import PaymentProviderConfigCard from '@/features/payment-providers/components/PaymentProviderConfigCard.client'

const STYLES = {
  muted: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  warning: 'text-[9pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  smallButton: 'px-1.5 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[8pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Layout: one status line, then Live (left) and Sandbox (right) side by side. */
const LAYOUT_STYLES = {
  panel: 'gap-1.5 grid',
  statusRow: 'gap-2 flex items-center',
  refresh: 'ml-auto',
  cardsRow: 'gap-2 grid grid-cols-1 xl:grid-cols-2 items-start',
} as const

/** Keeps the Live and Sandbox cards visible while the provider list is loading or unavailable. */
export const EMPTY_PROVIDER_LIST: PaymentProviderListResult = {
  providers: [],
  encryption: { configured: false, kekId: null, problem: null },
}

/** Friendly text for list-load failures. */
function friendlyListError(code: string): string | null {
  if (code === 'PAYMENT_PROVIDER_TABLE_MISSING') return 'The payment_provider table is not available yet (run the migration).'
  if (code === 'KR_API_V1_FORBIDDEN' || code.includes('FORBIDDEN')) return 'Only Super Admins can view payment configuration.'
  return null
}

/** The active sandbox profile: the first enabled sandbox row, else the first sandbox row, else null. */
export function activeSandbox(list: PaymentProviderListResult): PaymentProviderConfig | null {
  const sandboxProviders = list.providers.filter((provider) => provider.environment === 'sandbox')
  return sandboxProviders.find((provider) => provider.isEnabled) ?? sandboxProviders[0] ?? null
}

/**
 * Replaces or appends one saved provider profile in the list. When it is enabled, every other profile of the same
 * environment is shown as disabled (the server keeps one enabled profile per environment).
 */
export function mergeSavedProvider(current: PaymentProviderListResult, saved: PaymentProviderConfig): PaymentProviderListResult {
  const merged = current.providers.some((provider) => provider.id === saved.id)
    ? current.providers.map((provider) => provider.id === saved.id ? saved : provider)
    : [...current.providers, saved]
  const providers = saved.isEnabled
    ? merged.map((provider) => provider.id === saved.id || provider.environment !== saved.environment ? provider : { ...provider, configured: false, isEnabled: false, problems: provider.problems.includes('Configuration is disabled.') ? provider.problems : [...provider.problems, 'Configuration is disabled.'] })
    : merged
  return { ...current, providers }
}

/** Props for {@link PaymentProviderConfigPanel}. */
export interface PaymentProviderConfigPanelProps {
  /** Reports the active sandbox configuration (null until loaded): `configured` enables the test tabs; the publishable key feeds the ACH bank lookup. */
  onSandboxChange?: (sandbox: PaymentProviderConfig | null) => void
}

/**
 * Settings → Stripe Payment Configuration: the database-backed Stripe
 * profiles, grouped into **Live** on the left and **Sandbox** on the right
 * (stacked below `xl`).
 *
 * Loads `GET /api/v1/payment-providers` (Super Admin). The server
 * returns display-safe fields only: secret values are never sent to the
 * browser, only their key-type prefix and SHA-256 hash. A one-line status row
 * shows whether the server's payment encryption key (KEK) is available; when
 * it is not, secrets cannot be saved (the cards disable their secret inputs).
 *
 * @returns The configuration panel.
 */
export default function PaymentProviderConfigPanel({ onSandboxChange }: PaymentProviderConfigPanelProps) {
  const [list, setList] = useState<PaymentProviderListResult>(EMPTY_PROVIDER_LIST)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)

  /** Loads every provider profile without secret values. */
  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setList(await loadPaymentProviders())
    } catch (caught) {
      setError(describeKrRequestError(caught, 'KR_PAYMENT_PROVIDERS', 'list', friendlyListError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Tell the workspace about the active sandbox configuration (tests enabled, publishable key for the ACH lookup).
  useEffect(() => {
    onSandboxChange?.(activeSandbox(list))
  }, [list, onSandboxChange])

  /** Replaces or appends one saved provider profile in the list. */
  function handleSaved(saved: PaymentProviderConfig): void {
    setList((current) => mergeSavedProvider(current, saved))
  }

  /** Removes a deleted provider profile from the local list. */
  function handleDeleted(providerId: string): void {
    setList((current) => ({ ...current, providers: current.providers.filter((provider) => provider.id !== providerId) }))
  }

  const encryption = loading ? null : list.encryption

  return (
    <section className={LAYOUT_STYLES.panel} aria-label="Stripe payment configuration" data-kr-id="PaymentProviderConfigPanel" data-kr-component="PaymentProviderConfigPanel" data-kr-element="stripe-payment-configuration-status">
      {/* Status row: encryption key state, load errors, refresh. */}
      <div className={LAYOUT_STYLES.statusRow} data-kr-element="stripe-payment-configuration-status-row">
        {loading ? <span className={STYLES.muted}>Loading…</span> : null}
        {encryption ? (
          encryption.configured
            ? <span className={STYLES.muted}>Secrets are encrypted at rest (key {encryption.kekId ?? '—'}). Stored keys are never shown; compare by SHA-256.</span>
            : <span className={STYLES.warning}>Payment encryption key not configured{encryption.problem ? ` (${encryption.problem})` : ''}. Secrets cannot be saved.</span>
        ) : null}
        <KrRequestErrorNote dataKrElement="stripe-payment-configuration-load-error" error={error} />
        <button className={`${LAYOUT_STYLES.refresh} ${STYLES.smallButton}`} data-kr-action="stripe-payment-configuration-refresh" disabled={loading} onClick={() => void load()} type="button">Refresh</button>
      </div>

      {/* Cards row: Live left, Sandbox right. */}
      <div className={LAYOUT_STYLES.cardsRow} data-kr-element="stripe-payment-configuration-cards-row">
        {PAYMENT_PROVIDER_ENVIRONMENTS.map((environment) => {
          const configs = list.providers.filter((provider) => provider.environment === environment).sort((a, b) => (a.ppid ?? Number.MAX_SAFE_INTEGER) - (b.ppid ?? Number.MAX_SAFE_INTEGER))
          return <PaymentProviderConfigCard configs={configs} encryptionReady={Boolean(encryption?.configured)} environment={environment} key={environment} onDeleted={handleDeleted} onSaved={handleSaved} />
        })}
      </div>
    </section>
  )
}
