'use client'
// file: apps/web/features/tasks/components/TaskClientPicker.client.tsx
/**
 * The Client and Matter fields of the task dialog (plan 10, stage 5), drawn as two label-beside-field rows that sit
 * side by side in the dialog's grid.
 *
 * Client: a search box over the client contacts the browser already holds (the data store, `useOptionalDataStore()`,
 * filtered by `filterClientContacts`: clients only, eight at most), with Clear. Nothing is sent to the API while
 * typing. Matter: the chosen client's matters (`fetchClientMatters`), `.0` first, or "No matter"; optional. Choosing
 * another client clears the matter.
 *
 * New code; the old screen had no client or matter fields for a task. The dialog owns the values; this component
 * reports changes through `onChange` and loads the matter choices itself.
 */

import type { Matter } from '@krhomebase/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { filterClientContacts } from '@/features/communications/workStreamContacts'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { fetchClientMatters } from '@/features/matters/api.client'
import { L } from '@/lib/KRUtilities'
import { matterChoices } from '../taskRows'

const NO_CONTACTS: readonly KRContactRecord[] = []

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  label: 'text-[11px] font-[700] text-(color:--kr-theme-text-muted)',
  input:
    'px-[6px] py-[2px] min-h-[24px] w-full min-w-0 rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  clearButton: 'p-0 size-[20px] inline-flex shrink-0 items-center justify-center rounded-[3px] border border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text-muted) cursor-pointer hover:text-(color:--kr-theme-text) disabled:opacity-50',
  clearIcon: 'size-[10px]',
  list: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_6px_18px_rgba(16,42,58,0.18)]',
  option: 'px-[6px] py-[2px] w-full cursor-pointer border-0 bg-transparent text-left text-[12px] leading-tight text-(color:--kr-theme-text) hover:bg-(--kr-theme-table-row-hover)',
  optionNumber: 'text-[10.5px] tabular-nums text-(color:--kr-theme-text-muted)',
  none: 'px-[6px] py-[2px] text-[11px] text-(color:--kr-theme-text-muted)',
  hint: 'text-[10.5px] text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  fieldRow: 'gap-x-[3px] grid grid-cols-1 items-center md:grid-cols-[84px_minmax(0,1fr)]',
  control: 'relative gap-[3px] flex min-w-0 items-center',
  list: 'mt-[2px] py-[2px] absolute top-full right-0 left-0 z-10 grid max-h-[180px] overflow-y-auto',
  option: 'gap-[4px] flex items-baseline',
  matterControl: 'gap-[3px] flex min-w-0 items-center',
} as const

/** The client and matter as the dialog holds them. */
export interface TaskClientValue {
  clientId: string | null
  /** "306 Ann Example", or "". */
  clientLabel: string
  matterId: string | null
}

export interface TaskClientPickerProps {
  value: TaskClientValue
  onChange: (value: TaskClientValue) => void
  /** The saved matter's label ("306.1 · Estate plan"), shown until the client's matters arrive. */
  savedMatter?: { id: string; label: string } | null
  disabled?: boolean
}

/** "306 Ann Example" for a client contact. */
function clientLabelOf(contact: KRContactRecord): string {
  return [contact.clientNumber, contact.displayName].filter(Boolean).join(' ')
}

/**
 * Renders the Client search and the Matter choice.
 *
 * @param props - The current client and matter, the change handler, the saved matter's label and whether saving.
 */
export default function TaskClientPicker({ disabled = false, onChange, savedMatter = null, value }: TaskClientPickerProps) {
  const contacts = useOptionalDataStore()?.contacts ?? NO_CONTACTS
  const [query, setQuery] = useState(value.clientLabel)
  const [open, setOpen] = useState(false)
  const [matters, setMatters] = useState<Matter[] | null>(null)
  const [mattersLoading, setMattersLoading] = useState(false)
  const [mattersError, setMattersError] = useState('')
  const requestRef = useRef(0)

  const matches = useMemo(() => (open ? filterClientContacts(contacts, query === value.clientLabel ? '' : query) : []), [contacts, open, query, value.clientLabel])

  // The chosen client's matters, again whenever the client changes (a later reply wins over an older one).
  useEffect(() => {
    const request = ++requestRef.current
    setMatters(null)
    setMattersError('')
    if (!value.clientId) return
    const clientId = value.clientId
    setMattersLoading(true)
    fetchClientMatters(clientId)
      .then((data) => {
        if (request === requestRef.current) setMatters(data.matters)
      })
      .catch((caught: unknown) => {
        L(`[TASK_CLIENT_PICKER:112] matters failed clientId=${clientId} error=${caught instanceof Error ? caught.message.slice(0, 80) : 'unknown'}`)
        if (request === requestRef.current) setMattersError(caught instanceof Error ? caught.message : 'The matters could not be read.')
      })
      .finally(() => {
        if (request === requestRef.current) setMattersLoading(false)
      })
  }, [value.clientId])

  const choices = matters ? matterChoices(matters) : []
  // The saved matter stays choosable while the list loads, or when it could not be read.
  const missing = value.matterId && !choices.some((choice) => choice.id === value.matterId) ? (savedMatter && savedMatter.id === value.matterId ? savedMatter : { id: value.matterId, label: 'The saved matter' }) : null

  function choose(contact: KRContactRecord): void {
    const label = clientLabelOf(contact)
    setQuery(label)
    setOpen(false)
    if (contact.clientId !== value.clientId) onChange({ clientId: contact.clientId, clientLabel: label, matterId: null })
  }

  function clear(): void {
    setQuery('')
    setOpen(false)
    onChange({ clientId: null, clientLabel: '', matterId: null })
  }

  return (
    <>
      {/* Client row: search the browser's client contacts; Clear makes it a firm task. */}
      <div className={LAYOUT_STYLES.fieldRow} data-kr-element="task-edit-client-row">
        <label className={STYLES.label} htmlFor="task-edit-client">Client</label>
        <div className={LAYOUT_STYLES.control}>
          <input
            aria-autocomplete="list"
            aria-expanded={open}
            autoComplete="off"
            className={STYLES.input}
            disabled={disabled}
            id="task-edit-client"
            placeholder="Search clients (none: a firm task)"
            role="combobox"
            value={query}
            onBlur={() => {
              setOpen(false)
              setQuery(value.clientLabel)
            }}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                // Close the list only; the dialog's own Escape (which skips a handled press) waits for the next one.
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
                setQuery(value.clientLabel)
              }
              if (event.key === 'Enter' && open && matches[0]) {
                event.preventDefault()
                choose(matches[0])
              }
            }}
          />
          {value.clientId ? (
            <button aria-label="Clear the client" className={STYLES.clearButton} disabled={disabled} title="Clear the client and matter" type="button" onClick={clear}>
              <KRHomebaseIcons.Close className={STYLES.clearIcon} />
            </button>
          ) : null}
          {/* Client suggestions: a press picks before the box loses focus. */}
          {open ? (
            <div className={`${LAYOUT_STYLES.list} ${STYLES.list}`} data-kr-element="task-edit-client-results" role="listbox">
              {matches.length ? (
                matches.map((contact) => (
                  <button
                    aria-selected={contact.clientId === value.clientId}
                    className={`${LAYOUT_STYLES.option} ${STYLES.option}`}
                    key={contact.id}
                    role="option"
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      choose(contact)
                    }}
                  >
                    <span className={STYLES.optionNumber}>{contact.clientNumber ?? 'NC'}</span>
                    <span>{contact.displayName}</span>
                  </button>
                ))
              ) : (
                <span className={STYLES.none}>{contacts.length ? 'No client matches.' : 'The client list is not loaded yet.'}</span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Matter row: the chosen client's matters, .0 first; optional. */}
      <div className={LAYOUT_STYLES.fieldRow} data-kr-element="task-edit-matter-row">
        <label className={STYLES.label} htmlFor="task-edit-matter">Matter</label>
        <div className={LAYOUT_STYLES.matterControl}>
          <select
            className={STYLES.input}
            disabled={disabled || !value.clientId}
            id="task-edit-matter"
            title={mattersError || undefined}
            value={value.matterId ?? ''}
            onChange={(event) => onChange({ ...value, matterId: event.target.value || null })}
          >
            <option value="">{value.clientId ? 'No matter' : 'Choose a client first'}</option>
            {missing ? <option value={missing.id}>{missing.label}</option> : null}
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
          {mattersLoading ? <RainbowBusySpinner ariaLabel="Loading matters" busy size={12} /> : null}
          {mattersError ? <span className={STYLES.hint} role="alert">Not loaded</span> : null}
        </div>
      </div>
    </>
  )
}
