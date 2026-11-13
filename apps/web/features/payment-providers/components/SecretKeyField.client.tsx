'use client'
// file: apps/web/features/payment-providers/components/SecretKeyField.client.tsx
/**
 * The write-only secret cell of the Live / Sandbox card, moved unchanged out of the old
 * `PaymentProviderConfigCard.client.tsx` (the card grew past the 400-line limit here). Its classes are the card's,
 * value for value; only the keys it uses are copied into its own maps (`AGENTS_05`: maps live with their JSX).
 *
 * Changed from the old file (styling only, same look in the light theme): `rounded` became `rounded-[4px]` (the old
 * Tailwind 3 `rounded` was 4px; Tailwind 4 renamed it) and `bg-white` became the card surface token with a white
 * fallback, so the dark theme does not draw white fields (DESIGN.md "Dark theme").
 */

import { useEffect, useState, type RefObject } from 'react'
import { formatKeyHash, sha256HexInBrowser } from '@/features/payment-providers/paymentProviderDisplay'

const STYLES = {
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] text-[var(--kr-theme-text,#243142)]',
  mono: 'font-mono',
  /** Masks typed characters without type="password", so browsers and password managers never treat the field as a login password. */
  masked: '[-webkit-text-security:disc]',
  secretMeta: 'truncate font-mono text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  smallButton: 'px-1.5 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[8pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  match: 'text-[8pt] font-semibold text-[var(--kr-theme-success,#2e7d5b)]',
  noMatch: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The secret cell's layout (the card's `secretCell`, `secretInputRow` and `mismatchRow`). */
const LAYOUT_STYLES = {
  secretCell: 'gap-0.5 grid',
  secretInputRow: 'gap-1 grid grid-cols-[minmax(0,1fr)_auto] items-center',
  mismatchRow: 'gap-1 flex items-center',
} as const

/** A pasted secret that does not match the stored one (hashes only; never the value). */
export interface SecretMismatch {
  label: string
  storedHash: string
  candidateHash: string
  /** Empties the input ("Leave the old key"); the value is never copied anywhere. */
  clearInput: () => void
}

/** Props for {@link SecretKeyField}. */
export interface SecretKeyFieldProps {
  id: string
  label: string
  /** Prefix of the stored key (e.g. `sk_test_`), or null when none. */
  storedPrefix: string | null
  storedHash: string | null
  storedAt: string | null
  placeholder: string
  pattern: RegExp
  disabled: boolean
  /** Ref to the uncontrolled input; its value is read only on Save or Check. */
  inputRef: RefObject<HTMLInputElement | null>
  onPresenceChange: (hasValue: boolean) => void
  /** Called when Check finds a valid pasted value that differs from the stored one; the card asks what to do. */
  onMismatch: (mismatch: SecretMismatch) => void
}

/**
 * Write-only secret input with hash check.
 *
 * The input is uncontrolled (the value lives only in the DOM until Save). It
 * is deliberately NOT `type="password"`: browsers offer to save any password
 * field (and pair it with the nearby email as a "login"). It is a text field
 * masked with CSS (`-webkit-text-security: disc`), autocomplete off, and the
 * ignore attributes of the common password managers (1Password, LastPass,
 * Bitwarden, Dashlane). The stored key is shown only as its prefix and a
 * shortened SHA-256. **Check** hashes the pasted value in the browser and
 * compares it with the stored hash; nothing is sent to the server. Pasting a
 * value of the right type runs Check automatically (typing does not).
 * - Same key → the field is cleared, so the card is not dirty (nothing to save).
 * - Different key → `onMismatch`; the card asks Cancel / Leave the old key /
 *   Copy the new key. The message also offers **Replace…** to reopen it.
 *
 * @returns The secret cell (stored summary, input, check result).
 */
export default function SecretKeyField({ id, label, storedPrefix, storedHash, storedAt, placeholder, pattern, disabled, inputRef, onPresenceChange, onMismatch }: SecretKeyFieldProps) {
  const [checkResult, setCheckResult] = useState<'match' | 'no-match' | 'invalid' | null>(null)
  const [candidateHash, setCandidateHash] = useState<string | null>(null)

  // A newly stored key (or a reload) makes the previous check result stale.
  useEffect(() => { setCheckResult(null); setCandidateHash(null) }, [storedHash])

  /** Empties the input and reports "no pasted value" so the card is not dirty. */
  function clearInput(): void {
    if (inputRef.current) inputRef.current.value = ''
    onPresenceChange(false)
    setCandidateHash(null)
  }

  async function checkHash(): Promise<void> {
    const candidate = inputRef.current?.value.trim() ?? ''
    if (!candidate || !pattern.test(candidate)) { setCheckResult('invalid'); return }
    const hash = await sha256HexInBrowser(candidate)
    const matches = Boolean(storedHash) && hash === storedHash
    setCandidateHash(hash)
    setCheckResult(matches ? 'match' : 'no-match')
    // Identical key: nothing to save, so drop it from the field (the card stays clean).
    if (matches) { clearInput(); return }
    if (storedHash) onMismatch({ label, storedHash, candidateHash: hash, clearInput: () => { clearInput(); setCheckResult(null) } })
  }

  /** Paste runs Check once the pasted text is in the field (only when a key is stored and the value has the right shape). */
  function checkAfterPaste(): void {
    window.setTimeout(() => {
      const value = inputRef.current?.value.trim() ?? ''
      if (storedHash && pattern.test(value)) void checkHash()
    }, 0)
  }

  return (
    <div className={LAYOUT_STYLES.secretCell} data-kr-element={`${id}-secret-cell`}>
      {/* Stored key summary: prefix, shortened hash, date. Never the key. */}
      <span className={STYLES.secretMeta} title={storedHash ?? undefined}>{storedHash ? `${storedPrefix ?? ''}… · SHA-256 ${formatKeyHash(storedHash)}${storedAt ? ` · ${storedAt.slice(0, 10)}` : ''}` : `No ${label.toLowerCase()} stored`}</span>
      {/* Write-only input and local hash check. */}
      <div className={LAYOUT_STYLES.secretInputRow}>
        <input
          aria-label={`${label} (write-only)`}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={`${STYLES.field} ${STYLES.mono} ${STYLES.masked}`}
          data-1p-ignore=""
          data-bwignore=""
          data-form-type="other"
          data-lpignore="true"
          disabled={disabled}
          id={id}
          onInput={(event) => { setCheckResult(null); onPresenceChange(Boolean(event.currentTarget.value.trim())) }}
          onPaste={checkAfterPaste}
          placeholder={placeholder}
          ref={inputRef}
          spellCheck={false}
          type="text"
        />
        <button className={STYLES.smallButton} disabled={disabled || !storedHash} onClick={() => void checkHash()} title="Hashes the pasted value in this browser and compares it with the stored hash" type="button">Check</button>
      </div>
      {checkResult === 'match' ? <span className={STYLES.match}>Matches the stored key. Nothing to save; the field was cleared.</span> : null}
      {checkResult === 'no-match' ? (
        <span className={`${LAYOUT_STYLES.mismatchRow} ${STYLES.noMatch}`}>
          Does not match the stored key.
          <button className={STYLES.smallButton} data-kr-action={`${id}-replace-prompt`} disabled={disabled || !storedHash || !candidateHash} onClick={() => { if (storedHash && candidateHash) onMismatch({ label, storedHash, candidateHash, clearInput: () => { clearInput(); setCheckResult(null) } }) }} type="button">Replace…</button>
        </span>
      ) : null}
      {checkResult === 'invalid' ? <span className={STYLES.noMatch}>Paste a {label.toLowerCase()} of the right type first.</span> : null}
    </div>
  )
}
