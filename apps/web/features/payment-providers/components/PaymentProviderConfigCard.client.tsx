'use client'
// file: apps/web/features/payment-providers/components/PaymentProviderConfigCard.client.tsx
/**
 * One Stripe configuration card (Live or Sandbox). Ported from the old
 * `firm-settings/stripe-payment-configuration/PaymentProviderConfigCard.client.tsx`: layout, classes, texts, field
 * tips, `data-kr-*` markers and behavior are the old ones.
 *
 * Changed from the old file:
 * - Split to stay under 400 lines: the write-only secret cell is `SecretKeyField.client.tsx`, the three dialogs are
 *   `PaymentProviderCardDialogs.client.tsx`, and the tips, draft helpers and friendly error sentences are
 *   `paymentProviderCardText.ts`. Their code is unchanged.
 * - Calls go to the new routes through `api.client.ts`; shapes and key patterns come from `@krhomebase/contracts`.
 * - Styling only, same look in the light theme: `rounded` became `rounded-[4px]` (the old Tailwind 3 `rounded` was
 *   4px; Tailwind 4 renamed it) and `bg-white` became the card surface token with a white fallback, so the dark theme
 *   does not draw white cards and fields (DESIGN.md "Dark theme").
 */

import { useEffect, useRef, useState } from 'react'
import { PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN, PAYMENT_PROVIDER_KEY_PATTERNS, type PaymentProviderConfig, type PaymentProviderEditableFields, type PaymentProviderEnvironment } from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { describeKrRequestError, krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { deletePaymentProviderConfig, savePaymentProviderConfig, testPaymentProviderConfig } from '@/features/payment-providers/api.client'
import { createDefaultsFrom, fieldsFrom, fieldTip, friendlyProviderError, newDraftConfig } from '@/features/payment-providers/paymentProviderCardText'
import PaymentProviderCardDialogs from '@/features/payment-providers/components/PaymentProviderCardDialogs.client'
import SecretKeyField, { type SecretMismatch } from '@/features/payment-providers/components/SecretKeyField.client'

const STYLES = {
  card: 'rounded-[4px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#ffffff)]',
  cardLive: 'border-t-4 border-t-[var(--kr-theme-danger,#9d2c20)]',
  cardSandbox: 'border-t-4 border-t-[var(--kr-theme-orange,#e45e25)]',
  title: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  chipOk: 'px-1.5 rounded-[4px] text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-success,#2e7d5b)]',
  chipOff: 'px-1.5 rounded-[4px] text-[7pt] font-bold uppercase text-white bg-[var(--kr-theme-danger,#9d2c20)]',
  label: 'whitespace-nowrap text-[8pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  labelWithTip: 'inline-flex items-center gap-0.5',
  tipIcon: 'h-3 w-3 shrink-0 cursor-help',
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] text-[var(--kr-theme-text,#243142)]',
  profileSelect: 'px-1 py-0.5 max-w-[220px] rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[8pt] text-[var(--kr-theme-text,#243142)]',
  mono: 'font-mono',
  invalid: 'border-[var(--kr-theme-danger,#9d2c20)]',
  primaryButton: 'px-2 py-0.5 rounded-[4px] border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  secondaryButton: 'px-2 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  status: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  problem: 'text-[8pt] font-semibold text-[var(--kr-theme-warning,#b47a2a)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Compact layout: inline labels, two label/input pairs per row, minimal padding. */
const LAYOUT_STYLES = {
  card: 'px-2 py-1.5 gap-1 grid content-start',
  header: 'gap-2 flex items-center',
  headerSpacer: 'ml-auto gap-2 flex items-center',
  profileChooser: 'gap-1.5 flex items-center',
  pairRow: 'gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)_92px_minmax(0,1.6fr)] items-center',
  secretRow: 'gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)_92px_minmax(0,1.6fr)] items-start',
  singleRow: 'gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)] items-center',
  notesRow: 'gap-x-1.5 grid grid-cols-[92px_minmax(0,1fr)] items-center',
  actionsRow: 'pt-0.5 gap-2 flex items-start justify-between',
  actionGroup: 'gap-1.5 flex shrink-0 items-center',
  messages: 'gap-0.5 grid',
} as const

/** Props for {@link PaymentProviderConfigCard}. */
export interface PaymentProviderConfigCardProps {
  environment: PaymentProviderEnvironment
  /** All stored profiles for this Stripe environment, sorted by `ppid`. */
  configs: PaymentProviderConfig[]
  /** False when the server has no encryption key; secrets cannot be saved. */
  encryptionReady: boolean
  onSaved: (config: PaymentProviderConfig) => void
  onDeleted: (providerId: string) => void
}

/**
 * One Stripe configuration card (Live or Sandbox) in Settings → Stripe Payment
 * Configuration. Compact: inline labels, two fields per row.
 *
 * Rows: Account ID · Account email / Publishable key (full width) / Secret name ·
 * Secret key (write-only) / Webhook name · Webhook secret (write-only) /
 * API version · Currency / Notes. Actions: Delete key, Test connection, Save.
 *
 * Saving a live configuration that replaces the secret key, or disables it,
 * asks for confirmation first. After a save, the secret inputs are cleared.
 * Failed requests show `KrRequestErrorNote` next to the buttons (with code,
 * HTTP status, and request id in development).
 *
 * @returns The configuration card.
 */
export default function PaymentProviderConfigCard({ environment, configs, encryptionReady, onDeleted, onSaved }: PaymentProviderConfigCardProps) {
  const patterns = PAYMENT_PROVIDER_KEY_PATTERNS[environment]
  const initialProfile = configs.find((candidate) => candidate.isEnabled) ?? configs[0]
  const [selectedPpid, setSelectedPpid] = useState<number | null>(() => initialProfile?.ppid ?? null)
  const hasChosenProfile = useRef(false)
  const [createDefaults, setCreateDefaults] = useState(() => createDefaultsFrom(initialProfile))
  const selectedStoredConfig = selectedPpid === null ? undefined : configs.find((candidate) => candidate.ppid === selectedPpid)
  const config = selectedStoredConfig ?? newDraftConfig(environment, createDefaults)
  const [fields, setFields] = useState<PaymentProviderEditableFields>(() => fieldsFrom(config))
  const [hasSecretInput, setHasSecretInput] = useState(false)
  const [hasWebhookInput, setHasWebhookInput] = useState(false)
  const secretRef = useRef<HTMLInputElement | null>(null)
  const webhookRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const deleteInputRef = useRef<HTMLInputElement | null>(null)
  /** Set when Check finds a pasted secret that differs from the stored one; opens the replace prompt. */
  const [replacePrompt, setReplacePrompt] = useState<SecretMismatch | null>(null)

  // Keep the selected profile valid after a create or delete refreshes the list.
  useEffect(() => {
    const defaultProfile = configs.find((candidate) => candidate.isEnabled) ?? configs[0]
    const defaultPpid = defaultProfile?.ppid ?? null
    if (selectedPpid === null) {
      // The cards mount before the API response. Select the enabled profile
      // when it arrives, unless the user explicitly chose Create new.
      if (!hasChosenProfile.current && defaultPpid !== null) {
        setCreateDefaults(createDefaultsFrom(defaultProfile))
        setSelectedPpid(defaultPpid)
      }
      return
    }
    if (!configs.some((candidate) => candidate.ppid === selectedPpid)) {
      setCreateDefaults(createDefaultsFrom(defaultProfile))
      setSelectedPpid(defaultPpid)
    }
  }, [configs, selectedPpid])

  // Reload the form when the selected profile changes or a newer stored config arrives.
  const configIdentity = `${config.id ?? 'new'}:${config.updatedAt ?? ''}:${selectedPpid ?? 'new'}:${createDefaults.accountId}:${createDefaults.accountEmail}:${createDefaults.defaultCurrency}`
  useEffect(() => {
    setFields(fieldsFrom(config))
    setHasSecretInput(false)
    setHasWebhookInput(false)
    if (secretRef.current) secretRef.current.value = ''
    if (webhookRef.current) webhookRef.current.value = ''
  // configIdentity intentionally represents the selected server row or new-profile defaults.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configIdentity])

  // Focus the destructive confirmation input when the dialog opens.
  useEffect(() => { if (deleteOpen) deleteInputRef.current?.focus() }, [deleteOpen])

  const publishableInvalid = Boolean(fields.publishableKey) && !patterns.publishable.test(fields.publishableKey.trim())
  const accountInvalid = Boolean(fields.accountId) && !PAYMENT_PROVIDER_ACCOUNT_ID_PATTERN.test(fields.accountId.trim())
  const dirty = hasSecretInput || hasWebhookInput || JSON.stringify(fields) !== JSON.stringify(fieldsFrom(config))
  const title = environment === 'live' ? 'Live Configuration' : 'Sandbox Configuration'

  function selectProfile(value: string): void {
    hasChosenProfile.current = true
    if (value === 'new') {
      setCreateDefaults(createDefaultsFrom(selectedStoredConfig ?? configs[0]))
      setSelectedPpid(null)
    } else {
      setSelectedPpid(Number(value))
    }
    setError(null)
    setStatusText(null)
  }

  function update<K extends keyof PaymentProviderEditableFields>(key: K, value: PaymentProviderEditableFields[K]): void {
    setFields((current) => ({ ...current, [key]: value }))
    setStatusText(null)
  }

  /** Saves (after confirmation for sensitive live changes). */
  function requestSave(): void {
    if (publishableInvalid || accountInvalid) { setError(krLocalValidationError('Fix the highlighted fields first.')); return }
    const sensitiveLive = environment === 'live' && (hasSecretInput || (config.isEnabled && !fields.isEnabled))
    if (sensitiveLive) { setConfirmOpen(true); return }
    void save()
  }

  /** "Leave the old key": keep the stored secret and clear the pasted one. */
  function keepStoredSecret(): void {
    replacePrompt?.clearInput()
    setStatusText(replacePrompt ? `Kept the stored ${replacePrompt.label.toLowerCase()}; the pasted one was cleared.` : null)
    setReplacePrompt(null)
  }

  /** "Copy the new key": save now (this prompt is the confirmation, including for live); Save clears the field. */
  function confirmReplace(): void {
    setReplacePrompt(null)
    if (publishableInvalid || accountInvalid) { setError(krLocalValidationError('Fix the highlighted fields first.')); return }
    void save()
  }

  async function save(): Promise<void> {
    setConfirmOpen(false)
    setBusy('save')
    setError(null)
    setStatusText(null)
    try {
      const secretKey = secretRef.current?.value.trim() || undefined
      const webhookSecret = webhookRef.current?.value.trim() || undefined
      const saved = await savePaymentProviderConfig({ environment, providerId: config.id, fields, secretKey, webhookSecret, expectedUpdatedAt: config.updatedAt })
      // Drop the pasted secrets from the page as soon as they are stored.
      if (secretRef.current) secretRef.current.value = ''
      if (webhookRef.current) webhookRef.current.value = ''
      setHasSecretInput(false)
      setHasWebhookInput(false)
      setStatusText(secretKey ? 'Saved. Stripe accepted the new secret key.' : 'Saved.')
      if (saved.ppid !== null) setSelectedPpid(saved.ppid)
      onSaved(saved)
    } catch (caught) {
      setError(describeKrRequestError(caught, 'KR_PAYMENT_PROVIDERS', `save-${environment}`, friendlyProviderError))
    } finally {
      setBusy(null)
    }
  }

  async function testConnection(): Promise<void> {
    setBusy('test')
    setError(null)
    setStatusText(null)
    try {
      const result = await testPaymentProviderConfig(environment)
      const available = result.available.map((row) => `${(row.amount / 100).toFixed(2)} ${row.currency.toUpperCase()}`).join(', ') || '—'
      setStatusText(`Connected (${result.livemode ? 'live' : 'test'} mode). Available: ${available}.`)
    } catch (caught) {
      setError(describeKrRequestError(caught, 'KR_PAYMENT_PROVIDERS', `test-${environment}`, friendlyProviderError))
    } finally {
      setBusy(null)
    }
  }

  /** Opens the destructive confirmation dialog for the selected stored profile. */
  function requestDelete(): void {
    if (!config.id) return
    setDeleteConfirmation('')
    setDeleteError('')
    setDeleteOpen(true)
  }

  /** Deletes the selected profile only after the exact phrase is entered. */
  async function deleteProvider(): Promise<void> {
    if (!config.id) return
    if (deleteConfirmation !== 'DELETE KEY') {
      setDeleteError('Type DELETE KEY exactly to permanently delete this provider profile.')
      return
    }
    setBusy('delete')
    setDeleteError('')
    try {
      await deletePaymentProviderConfig({ environment, providerId: config.id, confirmation: 'DELETE KEY', expectedUpdatedAt: config.updatedAt })
      const deletedId = config.id
      const nextConfig = configs.filter((candidate) => candidate.id !== deletedId).find((candidate) => candidate.isEnabled) ?? configs.find((candidate) => candidate.id !== deletedId)
      setDeleteOpen(false)
      setDeleteConfirmation('')
      setSelectedPpid(nextConfig?.ppid ?? null)
      setStatusText(`Deleted provider profile ${config.ppid ?? '—'}.`)
      onDeleted(deletedId)
    } catch (caught) {
      setDeleteError(describeKrRequestError(caught, 'KR_PAYMENT_PROVIDERS', `delete-${environment}`, friendlyProviderError).message)
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null
  /** One label with its info icon; the icon's title is the field tip. */
  const tipLabel = (htmlFor: string, text: string, tip: Parameters<typeof fieldTip>[0]) => (
    <label className={`${STYLES.label} ${STYLES.labelWithTip}`} htmlFor={htmlFor}>{text}<KRHomebaseIcons.InfoDark className={STYLES.tipIcon} title={fieldTip(tip, environment)} /></label>
  )

  return (
    <section className={`${LAYOUT_STYLES.card} ${STYLES.card} ${environment === 'live' ? STYLES.cardLive : STYLES.cardSandbox}`} aria-label={title} data-kr-id={`payment-provider-${environment}-card`} data-kr-element={`stripe-payment-configuration-${environment}`}>
      {/* Card header: title, configured chip, profile selector, and enabled switch. */}
      <header className={LAYOUT_STYLES.header}>
        <h3 className={STYLES.title}>{title}</h3>
        <span className={config.configured ? STYLES.chipOk : STYLES.chipOff}>{config.configured ? 'Configured' : 'Not configured'}</span>
        <div className={LAYOUT_STYLES.headerSpacer}>
          <label className={`${LAYOUT_STYLES.profileChooser} ${STYLES.label}`} htmlFor={`pp-${environment}-profile`}>Connection
            <select aria-label={`${title} connection`} className={STYLES.profileSelect} disabled={disabled} id={`pp-${environment}-profile`} onChange={(event) => selectProfile(event.target.value)} value={selectedPpid === null ? 'new' : String(selectedPpid)}>
              <option value="new">Create new</option>
              {configs.map((candidate) => <option key={candidate.id ?? candidate.ppid} value={String(candidate.ppid)}>[CON {candidate.ppid}] {candidate.secretKeyName || 'Unnamed key'}</option>)}
            </select>
          </label>
          <label className={STYLES.label}><input checked={fields.isEnabled} disabled={disabled} onChange={(event) => update('isEnabled', event.target.checked)} type="checkbox" />Enabled</label>
        </div>
      </header>

      {/* Account row: account id and login email. */}
      <div className={LAYOUT_STYLES.pairRow} data-kr-element={`payment-provider-${environment}-account-row`}>
        {tipLabel(`pp-${environment}-account-id`, 'Account ID', 'accountId')}
        <input className={`${STYLES.field} ${STYLES.mono} ${accountInvalid ? STYLES.invalid : ''}`} disabled={disabled} id={`pp-${environment}-account-id`} onChange={(event) => update('accountId', event.target.value)} placeholder="acct_…" value={fields.accountId} />
        {tipLabel(`pp-${environment}-account-email`, 'Login email', 'accountEmail')}
        <input className={STYLES.field} disabled={disabled} autoComplete="off" data-1p-ignore="" data-lpignore="true" id={`pp-${environment}-account-email`} onChange={(event) => update('accountEmail', event.target.value)} type="email" value={fields.accountEmail} />
      </div>

      {/* Publishable key row: the account's single public key (Stripe does not let it be renamed, so no name field). */}
      <div className={LAYOUT_STYLES.singleRow} data-kr-element={`payment-provider-${environment}-publishable-row`}>
        {tipLabel(`pp-${environment}-pk`, 'Publishable', 'publishableKey')}
        <input className={`${STYLES.field} ${STYLES.mono} ${publishableInvalid ? STYLES.invalid : ''}`} disabled={disabled} id={`pp-${environment}-pk`} onChange={(event) => update('publishableKey', event.target.value.trim())} placeholder={environment === 'live' ? 'pk_live_…' : 'pk_test_…'} spellCheck={false} value={fields.publishableKey} />
      </div>

      {/* Secret key row: Stripe's key name and the write-only secret. */}
      <div className={LAYOUT_STYLES.secretRow} data-kr-element={`payment-provider-${environment}-secret-row`}>
        {tipLabel(`pp-${environment}-sk-name`, 'Secret name', 'secretKeyName')}
        <input className={STYLES.field} disabled={disabled} id={`pp-${environment}-sk-name`} onChange={(event) => update('secretKeyName', event.target.value)} placeholder="e.g. krh-sandbox-secret-key" value={fields.secretKeyName} />
        {tipLabel(`pp-${environment}-sk`, 'Secret key', 'secretKey')}
        <SecretKeyField disabled={disabled || !encryptionReady} id={`pp-${environment}-sk`} inputRef={secretRef} label="Secret key" onMismatch={setReplacePrompt} onPresenceChange={setHasSecretInput} pattern={patterns.secret} placeholder={`Paste ${environment === 'live' ? 'sk_live_/rk_live_' : 'sk_test_/rk_test_'} to replace`} storedAt={config.secretKeySetAt} storedHash={config.secretKeyHash} storedPrefix={config.secretKeyPrefix} />
      </div>

      {/* Webhook row: environment-specific event-destination name and write-only signing secret. */}
      <div className={LAYOUT_STYLES.secretRow} data-kr-element={`payment-provider-${environment}-webhook-row`}>
        {tipLabel(`pp-${environment}-wh-name`, 'Webhook name', 'webhookSecretName')}
        <input className={STYLES.field} disabled={disabled} id={`pp-${environment}-wh-name`} onChange={(event) => update('webhookSecretName', event.target.value)} value={fields.webhookSecretName} />
        {tipLabel(`pp-${environment}-wh`, 'Webhook secret', 'webhookSecret')}
        <SecretKeyField disabled={disabled || !encryptionReady} id={`pp-${environment}-wh`} inputRef={webhookRef} label="Webhook secret" onMismatch={setReplacePrompt} onPresenceChange={setHasWebhookInput} pattern={patterns.webhook} placeholder="Paste whsec_… to replace" storedAt={config.webhookSecretSetAt} storedHash={config.webhookSecretHash} storedPrefix={config.webhookSecretHash ? 'whsec_' : null} />
      </div>

      {/* API row: Stripe-Version override and currency. */}
      <div className={LAYOUT_STYLES.pairRow} data-kr-element={`payment-provider-${environment}-api-row`}>
        {tipLabel(`pp-${environment}-api-version`, 'API version', 'apiVersion')}
        <input className={`${STYLES.field} ${STYLES.mono}`} disabled={disabled} id={`pp-${environment}-api-version`} onChange={(event) => update('apiVersion', event.target.value.trim())} placeholder="account default" value={fields.apiVersion} />
        {tipLabel(`pp-${environment}-currency`, 'Currency', 'defaultCurrency')}
        <input className={`${STYLES.field} ${STYLES.mono}`} disabled={disabled} id={`pp-${environment}-currency`} maxLength={3} onChange={(event) => update('defaultCurrency', event.target.value.toLowerCase())} value={fields.defaultCurrency} />
      </div>

      {/* Notes row. */}
      <div className={LAYOUT_STYLES.notesRow} data-kr-element={`payment-provider-${environment}-notes-row`}>
        {tipLabel(`pp-${environment}-notes`, 'Notes', 'notes')}
        <input className={STYLES.field} disabled={disabled} id={`pp-${environment}-notes`} onChange={(event) => update('notes', event.target.value)} value={fields.notes} />
      </div>

      {/* Actions: status / problems / errors left; Test and Save right. */}
      <div className={LAYOUT_STYLES.actionsRow} data-kr-element={`payment-provider-${environment}-actions-row`}>
        <div className={LAYOUT_STYLES.messages}>
          <KrRequestErrorNote dataKrElement={`payment-provider-${environment}-error`} error={error} />
          {statusText ? <span className={STYLES.status}>{statusText}</span> : null}
          {!error && !statusText ? config.problems.slice(0, 2).map((problem) => <span className={STYLES.problem} key={problem}>{problem}</span>) : null}
          {!error && !statusText && config.lastVerifiedAt ? <span className={STYLES.status}>Last test {config.lastVerifiedAt.slice(0, 16).replace('T', ' ')} UTC · {config.lastVerifiedStatus ?? '—'}</span> : null}
        </div>
        <div className={LAYOUT_STYLES.actionGroup}>
          {config.id ? <button className={STYLES.secondaryButton} data-kr-action={`payment-provider-${environment}-delete`} disabled={disabled} onClick={requestDelete} type="button">Delete key</button> : null}
          <button className={STYLES.secondaryButton} data-kr-action={`payment-provider-${environment}-test`} disabled={disabled || !config.configured || dirty} onClick={() => void testConnection()} title={dirty ? 'Save first' : undefined} type="button">{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
          <button className={STYLES.primaryButton} data-kr-action={`payment-provider-${environment}-save`} disabled={disabled || !dirty} onClick={requestSave} type="button">{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {/* Dialogs: live change confirmation, different-key prompt, DELETE KEY confirmation. */}
      <PaymentProviderCardDialogs
        busy={busy}
        config={config}
        confirmOpen={confirmOpen}
        deleteConfirmation={deleteConfirmation}
        deleteError={deleteError}
        deleteInputRef={deleteInputRef}
        deleteOpen={deleteOpen}
        environment={environment}
        hasSecretInput={hasSecretInput}
        onCancelConfirm={() => setConfirmOpen(false)}
        onCancelDelete={() => { if (busy !== 'delete') { setDeleteOpen(false); setDeleteConfirmation(''); setDeleteError('') } }}
        onCancelReplace={() => setReplacePrompt(null)}
        onConfirmDelete={() => void deleteProvider()}
        onConfirmReplace={confirmReplace}
        onConfirmSave={() => void save()}
        onDeleteConfirmationChange={(value) => { setDeleteConfirmation(value); setDeleteError('') }}
        onKeepStored={keepStoredSecret}
        replacePrompt={replacePrompt}
      />
    </section>
  )
}
