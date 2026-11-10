'use client'
// file: apps/web/components/ui/U6CurrencyInput.client.tsx
// Ported unchanged from the old app (hb-components/U6-Controls/U6CurrencyInput.client.tsx) with Billing.
/**
 * U6CurrencyInput — a plain, editable money field.
 *
 * - Unfocused: shows the amount formatted as US currency ($1,234.56).
 * - Focus: selects the whole value, so typing replaces it; the text is the bare
 *   number (1234.56) while editing.
 * - Typing: only digits and one decimal point are accepted (up to two decimals);
 *   anything else is ignored. No caret tricks, no digit shifting.
 * - Blur: the text is parsed, the parent gets the number, and the field
 *   re-formats as currency. `onChange` also fires on every valid keystroke.
 *
 * Controlled: the parent owns `value` (dollars as a number) and receives
 * `onChange(dollars)`.
 */

import { useEffect, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react'

/** Formats dollars as US currency. */
export function formatCurrencyValue(dollars: number): string {
  const rVal = (Number.isFinite(dollars) ? dollars : 0).toLocaleString('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  })
  return rVal
}

/** Keeps digits and a single decimal point with at most two decimals; strips everything else. */
export function sanitizeCurrencyText(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  const whole = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot)
  const fraction = firstDot === -1 ? '' : cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
  const rVal = firstDot === -1 ? whole : `${whole}.${fraction}`
  return rVal
}

/** Parses sanitized text to dollars (0 for blank or a lone "."). */
export function parseCurrencyText(text: string): number {
  const parsed = Number(sanitizeCurrencyText(text))
  const rVal = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0
  return rVal
}

export interface U6CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** Amount in dollars. */
  value: number
  /** Receives the new amount in dollars as the user types and on blur. */
  onChange: (dollars: number) => void
  /**
   * Shows the unfocused amount as a negative (e.g. a write-off, "-$25.00").
   * `value` stays the positive magnitude; the caller stores the sign.
   */
  displayNegative?: boolean
}

/** Renders the currency input; `className` styles the underlying `<input>`. */
export default function U6CurrencyInput({ value, onChange, onFocus, onBlur, displayNegative = false, ...rest }: U6CurrencyInputProps) {
  const [editing, setEditing] = useState(false)
  /** Unfocused display text: currency, with a leading minus for `displayNegative` amounts above zero. */
  const display = (dollars: number): string => (displayNegative && dollars > 0 ? `-${formatCurrencyValue(dollars)}` : formatCurrencyValue(dollars))
  const [text, setText] = useState(() => display(value))

  // Outside changes (parent resets the value) show up while the field is not being edited.
  useEffect(() => {
    if (!editing) setText(display(value))
    // display() depends only on displayNegative, which is part of the render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, value, displayNegative])

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    onFocus?.(event)
    setEditing(true)
    const bare = value ? String(Math.round(value * 100) / 100) : ''
    setText(bare)
    // Select everything so typing replaces the current amount.
    window.requestAnimationFrame(() => event.target.select())
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = sanitizeCurrencyText(event.target.value)
    setText(next)
    onChange(parseCurrencyText(next))
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>): void {
    onBlur?.(event)
    const dollars = parseCurrencyText(text)
    onChange(dollars)
    setEditing(false)
    setText(display(dollars))
  }

  return (
    <input
      {...rest}
      autoComplete="off"
      data-kr-component="U6CurrencyInput"
      inputMode="decimal"
      type="text"
      value={text}
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
    />
  )
}
