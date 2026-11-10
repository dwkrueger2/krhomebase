'use client'
// file: apps/web/features/billing/components/AccountingDatePicker.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/AccountingDatePicker.client.tsx) with Billing (plan stages 2 to 4); two `!`/`??` marks
// for this repository's stricter index checks.

import { useRef, type KeyboardEvent } from 'react'

/** Supported display format for Billing date fields. */
export type AccountingDateFormat = 'MM/DD/YYYY'

export interface AccountingDatePickerProps {
  value: string
  onChange: (value: string) => void
  onValidationChange?: (isValid: boolean) => void
  dataKrElement?: string
  id?: string
  name?: string
  className?: string
  disabled?: boolean
  format?: AccountingDateFormat
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

/** Formats a valid local date in the Billing tab's display format. */
export function formatAccountingDate(date: Date, format: AccountingDateFormat = 'MM/DD/YYYY'): string {
  if (format !== 'MM/DD/YYYY') throw new Error(`Unsupported accounting date format: ${format}`)
  return `${padDatePart(date.getMonth() + 1)}/${padDatePart(date.getDate())}/${date.getFullYear()}`
}

function makeValidDate(month: number, day: number, year: number): Date | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year) || year < 1000 || year > 9999) return null
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

/** Parses the flexible date forms accepted by the promoted accounting controls. */
export function parseAccountingDate(value: string, today = new Date()): Date | null {
  const raw = value.trim()
  if (!raw) return null
  const currentYear = today.getFullYear()
  const digits = raw.replace(/\D/g, '')
  let month: number
  let day: number
  let year: number
  if (/^\d{4}$/.test(digits) && !raw.includes('/')) {
    month = Number(digits.slice(0, 2)); day = Number(digits.slice(2, 4)); year = currentYear
  } else if (/^\d{6}$/.test(digits) && !raw.includes('/')) {
    month = Number(digits.slice(0, 2)); day = Number(digits.slice(2, 4)); year = Math.floor(currentYear / 100) * 100 + Number(digits.slice(4, 6))
  } else if (/^\d{8}$/.test(digits) && !raw.includes('/')) {
    month = Number(digits.slice(0, 2)); day = Number(digits.slice(2, 4)); year = Number(digits.slice(4, 8))
  } else {
    const parts = raw.split(/[/-]/).map((part) => part.trim())
    if (parts.length === 2) { month = Number(parts[0]); day = Number(parts[1]); year = currentYear }
    else if (parts.length === 3) { month = Number(parts[0]); day = Number(parts[1]); const suppliedYear = Number(parts[2]); year = parts[2]!.length === 2 ? Math.floor(currentYear / 100) * 100 + suppliedYear : suppliedYear }
    else return null
  }
  return makeValidDate(month, day, year)
}

function toNativeDateValue(date: Date | null): string {
  return date ? `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}` : ''
}

/** Reusable Billing date input with period shortcuts and a native calendar affordance. */
export default function AccountingDatePicker({ value, onChange, onValidationChange, dataKrElement, id, name, className, disabled = false, format = 'MM/DD/YYYY' }: AccountingDatePickerProps) {
  const nativePickerRef = useRef<HTMLInputElement>(null)

  function commitDate(date: Date): void {
    onChange(formatAccountingDate(date, format)); onValidationChange?.(true)
  }

  function handleTextChange(nextValue: string): void {
    const parsed = parseAccountingDate(nextValue)
    onChange(parsed ? formatAccountingDate(parsed, format) : nextValue); onValidationChange?.(Boolean(parsed))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const key = event.key.toLowerCase()
    if (!['m', 'h', 'y', 'r', 't'].includes(key)) return
    event.preventDefault()
    const today = new Date()
    if (key === 't') return commitDate(today)
    const anchor = parseAccountingDate(value) ?? today
    if (key === 'm') return commitDate(anchor.getDate() === 1 ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1) : new Date(anchor.getFullYear(), anchor.getMonth(), 1))
    if (key === 'h') { const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0); return commitDate(anchor.getDate() === monthEnd.getDate() ? new Date(anchor.getFullYear(), anchor.getMonth(), 0) : monthEnd) }
    if (key === 'y') return commitDate(anchor.getMonth() === 0 && anchor.getDate() === 1 ? new Date(anchor.getFullYear() - 1, 0, 1) : new Date(anchor.getFullYear(), 0, 1))
    const yearEnd = new Date(anchor.getFullYear(), 11, 31)
    return commitDate(anchor.getMonth() === 11 && anchor.getDate() === 31 ? new Date(anchor.getFullYear() - 1, 11, 31) : yearEnd)
  }

  function handleNativePickerChange(nextValue: string): void {
    const [year, month, day] = nextValue.split('-').map(Number)
    const parsed = makeValidDate(month ?? Number.NaN, day ?? Number.NaN, year ?? Number.NaN)
    if (parsed) commitDate(parsed)
  }

  return (
    <span className="relative flex min-w-0">
      <input className={`${className ?? ''} min-w-0 flex-1 pr-9`} data-kr-element={dataKrElement} disabled={disabled} id={id} inputMode="numeric" name={name} onBlur={() => { const parsed = parseAccountingDate(value); if (parsed) commitDate(parsed); else onValidationChange?.(false) }} onChange={(event) => handleTextChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={format} type="text" value={value} />
      <button aria-label="Open calendar" className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[11pt] text-[var(--kr-theme-text-muted,_#526172)] hover:bg-[var(--kr-theme-muted-surface,_#eef3f7)] disabled:opacity-50" disabled={disabled} onClick={() => (nativePickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null)?.showPicker?.()} type="button">▣</button>
      <input aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" onChange={(event) => handleNativePickerChange(event.target.value)} ref={nativePickerRef} tabIndex={-1} type="date" value={toNativeDateValue(parseAccountingDate(value))} />
    </span>
  )
}

