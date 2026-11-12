'use client'
// file: apps/web/features/users/components/CreateUserCard.client.tsx
/**
 * Users and Invites → Add user (Settings plan, stage 4d). Ported from the old `CreateUserCard` and
 * `CreateUserDialog` (`ApplicationSettingsSection.client.tsx`): first and last name, email, phone, role set, user
 * type, activation (Send invitation or Activate now) and the invitation's days, then "Create User?" in a dialog.
 *
 * Kept: the fields and their defaults (Employee, Send invitation, 7 days), "Do Not Assign a Role" offered only for an
 * invitation, the phone formatted as (NNN) NNN-NNNN when the field is left, and the old result sentences.
 *
 * Changed from the old card:
 * - The role choice lists the active role sets from the database (custom ones too), not the code's eleven.
 * - Labels sit beside their fields on two rows (the Density Contract) instead of a stacked column.
 * - The confirmation is `U6ConfirmationDialog`; when the email was not sent, the invitation link is shown with a Copy
 *   button so it can be passed on by hand (the API returns it only then).
 *
 * @returns The card (`data-kr-element="create-user-card"`).
 */

import { useState } from 'react'
import type { CreateUserBody, RoleSet, UserSavedData } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import { createUser } from '@/features/users/api.client'

const LAYOUT_STYLES = {
  card: 'p-[6px] gap-[6px] grid',
  head: 'gap-[6px] flex flex-wrap items-center justify-between',
  grid: 'gap-x-[8px] gap-y-[4px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  field: 'gap-x-[3px] grid grid-cols-[86px_minmax(0,1fr)] items-center',
  radios: 'gap-[8px] flex flex-wrap items-center',
  radio: 'gap-[3px] inline-flex items-center',
  actions: 'gap-[6px] flex flex-wrap items-center',
  link: 'gap-[3px] flex items-center',
} as const

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-card-surface)',
  title: 'm-0 text-[13px] font-[850] text-(color:--kr-theme-text)',
  hint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  label: 'whitespace-nowrap text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:opacity-60',
  required: 'border-(--kr-theme-orange)',
  radio: 'cursor-pointer text-[12px] text-(color:--kr-theme-text)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  primaryButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  status: 'm-0 text-[12px] text-(color:--kr-theme-success)',
  code: 'min-w-0 truncate font-mono text-[11px] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const UNASSIGNED = ''

interface CreateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  roleSetId: string
  workerClassification: CreateUserBody['workerClassification']
  activation: CreateUserBody['activation']
  days: string
}

/** The old defaults: Staff, Employee, Send invitation, 7 days. */
export function emptyCreateForm(roleSets: readonly RoleSet[]): CreateForm {
  return { firstName: '', lastName: '', email: '', phone: '', roleSetId: roleSets.find((row) => row.id === 'role_staff')?.id ?? '', workerClassification: 'employee', activation: 'invite', days: '7' }
}

/** (NNN) NNN-NNNN for a 10-digit number (or 11 starting with 1); anything else is left as typed. */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : value.trim()
}

/** The body the API needs, or the first problem the old card would have named. */
export function createBody(form: CreateForm): { body: CreateUserBody } | { problem: string } {
  const days = Number(form.days)
  if (!form.firstName.trim()) return { problem: 'First name is required.' }
  if (!form.lastName.trim()) return { problem: 'Last name is required.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return { problem: 'Enter a valid email address.' }
  if (form.activation === 'activate' && form.roleSetId === UNASSIGNED) return { problem: 'Choose a role set to activate the account now.' }
  if (form.activation === 'invite' && !(Number.isInteger(days) && days >= 1 && days <= 30)) return { problem: 'Choose 1–30 days. The default is 7 days.' }
  return {
    body: {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      roleSetId: form.roleSetId || null,
      workerClassification: form.workerClassification,
      activation: form.activation,
      inviteExpirationDays: form.activation === 'invite' ? days : 7,
    },
  }
}

export interface CreateUserCardProps {
  roleSets: readonly RoleSet[]
  onCreated: (reply: UserSavedData) => void
  onClose: () => void
}

export default function CreateUserCard({ roleSets, onCreated, onClose }: CreateUserCardProps) {
  const [form, setForm] = useState<CreateForm>(() => emptyCreateForm(roleSets))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<UserSavedData | null>(null)
  const assignable = roleSets.filter((row) => row.isAssignable)
  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => setForm((current) => ({ ...current, [key]: value }))

  function requestCreate() {
    const checked = createBody(form)
    if ('problem' in checked) setProblem(checked.problem)
    else {
      setProblem(null)
      setConfirming(true)
    }
  }

  async function confirmCreate(): Promise<void> {
    const checked = createBody(form)
    if ('problem' in checked) return
    setBusy(true)
    setProblem(null)
    try {
      const reply = await createUser(checked.body)
      setConfirming(false)
      setResult(reply)
      onCreated(reply)
    } catch (caught) {
      setProblem(`Creation failed: ${caught instanceof Error ? caught.message : 'the user was not created.'}`)
    } finally {
      setBusy(false)
    }
  }

  const invitation = result?.invitation ?? null
  return (
    <section aria-label="Create user" className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="create-user-card">
      {/* Title and the two commands */}
      <div className={LAYOUT_STYLES.head}>
        <h4 className={STYLES.title}>Add user</h4>
        <span className={STYLES.hint}>Fill the highlighted fields, choose an activation mode, then create the account.</span>
        <div className={LAYOUT_STYLES.actions}>
          <button className={STYLES.ghostButton} disabled={busy} onClick={onClose} type="button">
            {result ? 'Close' : 'Discard'}
          </button>
          {!result ? (
            <button className={STYLES.primaryButton} data-kr-action="create-user" disabled={busy} onClick={requestCreate} type="button">
              Create user
            </button>
          ) : null}
        </div>
      </div>

      {/* The fields: labels beside them, four to a row at desktop width */}
      <div className={LAYOUT_STYLES.grid} data-kr-element="create-user-fields">
        <label className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>First name</span>
          <input className={`${STYLES.field} ${form.firstName.trim() ? '' : STYLES.required}`} disabled={busy || !!result} maxLength={100} onChange={(event) => set('firstName', event.target.value)} value={form.firstName} />
        </label>
        <label className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>Last name</span>
          <input className={`${STYLES.field} ${form.lastName.trim() ? '' : STYLES.required}`} disabled={busy || !!result} maxLength={100} onChange={(event) => set('lastName', event.target.value)} value={form.lastName} />
        </label>
        <label className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>Email</span>
          <input className={`${STYLES.field} ${form.email.trim() ? '' : STYLES.required}`} disabled={busy || !!result} maxLength={254} onChange={(event) => set('email', event.target.value)} type="email" value={form.email} />
        </label>
        <label className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>Phone</span>
          <input
            className={STYLES.field}
            disabled={busy || !!result}
            maxLength={40}
            onBlur={() => set('phone', formatPhone(form.phone))}
            onChange={(event) => set('phone', event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && set('phone', formatPhone(form.phone))}
            value={form.phone}
          />
        </label>
        <label className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>Role set</span>
          <select className={STYLES.field} disabled={busy || !!result} onChange={(event) => set('roleSetId', event.target.value)} value={form.roleSetId}>
            {assignable.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
                {row.isSystem ? '' : ' (custom)'}
              </option>
            ))}
            {form.activation === 'invite' ? <option value={UNASSIGNED}>Do Not Assign a Role</option> : null}
          </select>
        </label>
        <label className={LAYOUT_STYLES.field} title="Employee and Vendor create an employee file; Unspecified does not.">
          <span className={STYLES.label}>User type</span>
          <select className={STYLES.field} disabled={busy || !!result} onChange={(event) => set('workerClassification', event.target.value as CreateForm['workerClassification'])} value={form.workerClassification}>
            <option value="employee">Employee</option>
            <option value="vendor">Vendor (1099)</option>
            <option value="unspecified">Unspecified user</option>
          </select>
        </label>
        <div className={LAYOUT_STYLES.field}>
          <span className={STYLES.label}>Activation</span>
          <span className={LAYOUT_STYLES.radios}>
            <label className={`${LAYOUT_STYLES.radio} ${STYLES.radio}`} title="Create the user and send a login invitation email.">
              <input checked={form.activation === 'invite'} disabled={busy || !!result} name="create-user-activation" onChange={() => set('activation', 'invite')} type="radio" />
              Send invitation
            </label>
            <label className={`${LAYOUT_STYLES.radio} ${STYLES.radio}`} title="Activate without sending invitation">
              <input
                checked={form.activation === 'activate'}
                disabled={busy || !!result}
                name="create-user-activation"
                onChange={() => setForm((current) => ({ ...current, activation: 'activate', roleSetId: current.roleSetId || (assignable.find((row) => row.id === 'role_staff')?.id ?? '') }))}
                type="radio"
              />
              Activate now
            </label>
          </span>
        </div>
        {form.activation === 'invite' ? (
          <label className={LAYOUT_STYLES.field} title="Choose 1–30 days. The default is 7 days.">
            <span className={STYLES.label}>Expires in</span>
            <input className={STYLES.field} disabled={busy || !!result} max={30} min={1} onChange={(event) => set('days', event.target.value)} type="number" value={form.days} />
          </label>
        ) : null}
      </div>

      {problem ? <p className={STYLES.error}>{problem}</p> : null}
      {result ? (
        <p className={STYLES.status} data-kr-element="create-user-result">
          {!invitation ? 'User created and active.' : invitation.emailSent ? 'User created. Invitation email sent.' : `User created. Invitation created, but email was not sent: ${invitation.reason ?? 'unknown reason'}.`}
        </p>
      ) : null}
      {invitation?.inviteUrl ? (
        <div className={LAYOUT_STYLES.link} data-kr-element="create-user-invite-link">
          <span className={STYLES.label}>Invitation link</span>
          <code className={STYLES.code}>{invitation.inviteUrl}</code>
          <KRCopyButton label="invitation link" value={invitation.inviteUrl} />
        </div>
      ) : null}

      <U6ConfirmationDialog
        busy={busy}
        busyLabel="Sending request to the database..."
        confirmLabel="Confirm Create User"
        description={`Confirm that ${form.firstName.trim()} ${form.lastName.trim()} (${form.email.trim()}) should be created in KR Homebase${form.activation === 'invite' ? ' and sent an invitation.' : ' and activated now.'}`}
        error={confirming && problem ? problem : ''}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmCreate()}
        open={confirming}
        title="Create User?"
      />
    </section>
  )
}
