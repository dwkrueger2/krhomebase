'use client'
// file: apps/web/features/employee-documents/components/EmployeeDocumentsCard.client.tsx
/**
 * Employee Documents (Settings plan, stage 5; moved from Application Settings). Ported from the old
 * `application-settings/EmployeeDocumentsPanel.client.tsx`. Drawn in three places (the requester, Nov 12, 2026, D7):
 *
 * - Firm Settings → Employee Documents (`mode="choose"`): the employee chooser, then that employee's documents.
 * - Firm Settings → Users → Edit Employee (`mode="employee"`): one employee's documents, inside Employment details;
 *   no chooser. The id is `employeeId`, else the one in `PersonSlotContext` (`components/ui/editTarget.client.ts`).
 * - User Settings → Employee File (`mode="mine"`): the signed-in person's own documents.
 *
 * Kept: Upload Document, the fields (Category, default `other`; Title (optional), "Uses the file name when blank";
 * Private file), the columns (Document, Category, Status, Received, File with an Open link), "No documents for this
 * employee.", "Select an employee and a document file." and "Employee document uploaded to private storage."
 *
 * Changed from the old panel:
 * - The employee list comes from the documents call and holds only the people the viewer may see (the old panel read
 *   the Teams list, which only a super admin could load). Upload is offered only where the viewer may add files, and
 *   a disabled Upload says why.
 * - Categories read as words (I-9, W-4, Offer letter …); the stored values are the old ones. Status reads Active,
 *   Superseded or Draft.
 * - A Received date field (the old API took one; the old panel had no field for it), and the file's size (its heading
 *   centered over the numbers, D4).
 * - Loading shows the rainbow spinner (D5); choosing another employee shows it again, and a reply that arrives after a
 *   newer choice is ignored, so a quick second choice cannot show the first person's documents (D9).
 * - The note no longer reads like a to-do (D10): hard delete is off, and that is all it says.
 *
 * @returns The card (`data-kr-id="employee-documents-KRModuleCard"`, or `employee-file-KRModuleCard` in mine mode).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPLOYEE_DOCUMENT_CATEGORIES, type EmployeeDocumentsData } from '@krhomebase/contracts'
import { usePersonSlot } from '@/components/ui/editTarget.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { fetchEmployeeDocuments, uploadEmployeeDocument } from '@/features/employee-documents/api.client'

const LAYOUT_STYLES = {
  body: 'gap-[6px] grid',
  form: 'gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  field: 'gap-x-[3px] inline-flex items-center',
  scroller: 'overflow-x-auto',
} as const

const STYLES = {
  label: 'whitespace-nowrap text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:bg-(--kr-theme-muted-surface)',
  employee: 'w-[220px] max-w-full',
  title: 'w-[220px] max-w-full',
  file: 'max-w-[260px] text-[12px] text-(color:--kr-theme-text)',
  table: 'w-full min-w-[640px] border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  thNumber: 'text-center',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0 whitespace-nowrap',
  tdNumber: 'text-right tabular-nums',
  tdWide: 'p-[1px] border-r border-(--kr-theme-line) max-w-[320px] truncate',
  muted: 'text-(color:--kr-theme-text-muted)',
  link: 'font-bold text-(color:--kr-theme-brand-primary) underline',
  empty: 'p-[3px] text-[11px] text-(color:--kr-theme-text-muted)',
  primaryButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  saved: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-success)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** How each stored category reads. */
export const CATEGORY_LABELS: Record<(typeof EMPLOYEE_DOCUMENT_CATEGORIES)[number], string> = {
  i9: 'I-9',
  w4: 'W-4',
  w9: 'W-9',
  'offer-letter': 'Offer letter',
  'handbook-acknowledgment': 'Handbook acknowledgment',
  'performance-review': 'Performance review',
  'new-hire': 'New hire',
  termination: 'Termination',
  'payroll-support': 'Payroll support',
  other: 'Other',
}

const STATUS_LABELS: Record<string, string> = { active: 'Active', superseded: 'Superseded', draft: 'Draft' }

/** `1.2 MB`, `340 KB` or `—`. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export type EmployeeDocumentsMode = 'choose' | 'employee' | 'mine'

export interface EmployeeDocumentsCardProps {
  /** `choose` (default): the employee chooser; `employee`: one employee (`employeeId`); `mine`: the viewer's own file. */
  mode?: EmployeeDocumentsMode
  /** With `mode="employee"`: whose documents. */
  employeeId?: string
  /** For the first draw in tests; the card reads the list itself when left out. */
  initialData?: EmployeeDocumentsData
}

export default function EmployeeDocumentsCard({ mode = 'choose', employeeId: employeeIdProp, initialData }: EmployeeDocumentsCardProps) {
  const slot = usePersonSlot()
  const employeeId = employeeIdProp ?? slot?.employeeId ?? undefined
  const [data, setData] = useState<EmployeeDocumentsData | null>(initialData ?? null)
  const [category, setCategory] = useState<string>('other')
  const [title, setTitle] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(!initialData)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'saved' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  /** Counts loads; a reply for an older load is ignored (D9). */
  const loadNumber = useRef(0)
  const shownId = mode === 'mine' ? (data?.employees.find((row) => row.isOwn)?.id ?? null) : (data?.employeeId ?? null)
  const employee = data?.employees.find((row) => row.id === shownId) ?? null

  const load = useCallback(
    async (wantedId?: string) => {
      const number = ++loadNumber.current
      setLoading(true)
      try {
        let next = await fetchEmployeeDocuments(wantedId)
        // My own file: the first reply names whom I may see; read my own record's documents when it was not first.
        if (mode === 'mine' && !wantedId) {
          const own = next.employees.find((row) => row.isOwn)
          if (own && next.employeeId !== own.id) next = await fetchEmployeeDocuments(own.id)
        }
        if (number !== loadNumber.current) return
        setData(next)
        setStatus(null)
      } catch (error) {
        if (number === loadNumber.current) setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Employee documents could not be loaded.' })
      } finally {
        if (number === loadNumber.current) setLoading(false)
      }
    },
    [mode],
  )

  // Read the list once, unless the first draw was given it.
  useEffect(() => {
    if (!initialData) void load(mode === 'employee' ? employeeId : undefined)
  }, [employeeId, initialData, load, mode])

  async function upload() {
    if (!shownId || !file) {
      setStatus({ tone: 'error', text: 'Select an employee and a document file.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await uploadEmployeeDocument({ employeeId: shownId, category, title, receivedDate, file })
      setTitle('')
      setReceivedDate('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      await load(shownId)
      setStatus({ tone: 'saved', text: 'Employee document uploaded to private storage.' })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'The document was not uploaded.' })
    } finally {
      setBusy(false)
    }
  }

  const canUpload = Boolean(employee?.canCreate)
  const actions = canUpload ? (
    <button
      className={STYLES.primaryButton}
      data-kr-action="upload-employee-document"
      disabled={busy || !file}
      onClick={() => void upload()}
      title={file ? undefined : 'Choose a private file below first.'}
      type="button"
    >
      {busy ? 'Uploading...' : 'Upload Document'}
    </button>
  ) : null
  const documents = data && shownId === data.employeeId ? data.documents : []
  const emptySentence = !data?.employees.length
    ? 'You do not have access to any employee documents.'
    : mode === 'mine' && !shownId
      ? 'There is no employee record for your account, or you do not have access to it.'
      : 'No documents for this employee.'

  return (
    <KRModuleCard
      actions={actions}
      component="EmployeeDocumentsCard"
      krId={mode === 'mine' ? 'employee-file' : 'employee-documents'}
      note={mode === 'mine' ? 'Your own employee documents, stored privately.' : 'Private HR files, kept apart from Employee Records. Documents cannot be deleted here.'}
      title={mode === 'mine' ? 'Employee File' : 'Employee Documents'}
    >
      <div aria-label="Employee documents" aria-busy={loading} className={LAYOUT_STYLES.body} data-kr-element="employee-documents-panel">
        {/* Whose documents, and the upload fields */}
        <div className={LAYOUT_STYLES.form} data-kr-element="employee-documents-fields">
          {mode === 'choose' && data ? (
            <label className={LAYOUT_STYLES.field}>
              <span className={STYLES.label}>Employee</span>
              <select className={`${STYLES.field} ${STYLES.employee}`} disabled={busy || !data.employees.length} onChange={(event) => void load(event.target.value)} value={shownId ?? ''}>
                {data.employees.length ? null : <option value="">Select employee</option>}
                {data.employees.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.employeeNumber ? ` · ${row.employeeNumber}` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canUpload ? (
            <>
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.label}>Category</span>
                <select className={STYLES.field} disabled={busy} onChange={(event) => setCategory(event.target.value)} value={category}>
                  {EMPLOYEE_DOCUMENT_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.label}>Title (optional)</span>
                <input className={`${STYLES.field} ${STYLES.title}`} disabled={busy} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Uses the file name when blank" value={title} />
              </label>
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.label}>Received</span>
                <input className={STYLES.field} disabled={busy} onChange={(event) => setReceivedDate(event.target.value)} type="date" value={receivedDate} />
              </label>
              <label className={LAYOUT_STYLES.field} htmlFor={`employee-document-file-${mode}`}>
                <span className={STYLES.label}>Private file</span>
                <input className={STYLES.file} disabled={busy} id={`employee-document-file-${mode}`} onChange={(event) => setFile(event.target.files?.[0] ?? null)} ref={fileInput} type="file" />
              </label>
            </>
          ) : null}
          {loading ? <RainbowBusySpinner busy hideWhenIdle={false} label="Loading documents..." size={16} /> : null}
        </div>

        {/* The documents */}
        {data ? (
          <div className={LAYOUT_STYLES.scroller}>
            <table className={STYLES.table} data-kr-element="employee-documents-ledger">
              <thead>
                <tr>
                  <th className={STYLES.th}>Document</th>
                  <th className={STYLES.th}>Category</th>
                  <th className={STYLES.th}>Status</th>
                  <th className={STYLES.th}>Received</th>
                  <th className={`${STYLES.th} ${STYLES.thNumber}`}>Size</th>
                  <th className={STYLES.th}>File</th>
                </tr>
              </thead>
              <tbody data-kr-element="rows-container">
                {documents.map((doc) => (
                  <tr className={STYLES.row} data-kr-record-id={doc.id} key={doc.id}>
                    <td className={STYLES.tdWide} title={doc.title}>
                      {doc.title}
                    </td>
                    <td className={STYLES.td}>{CATEGORY_LABELS[doc.category as keyof typeof CATEGORY_LABELS] ?? doc.category}</td>
                    <td className={`${STYLES.td} ${STYLES.muted}`}>{STATUS_LABELS[doc.storageStatus] ?? doc.storageStatus}</td>
                    <td className={`${STYLES.td} ${STYLES.muted}`}>{doc.receivedDate ?? '—'}</td>
                    <td className={`${STYLES.td} ${STYLES.tdNumber} ${STYLES.muted}`}>{formatBytes(doc.byteSize)}</td>
                    <td className={STYLES.td}>
                      {doc.fileUrl ? (
                        <a className={STYLES.link} href={doc.fileUrl} rel="noopener noreferrer" target="_blank">
                          Open
                        </a>
                      ) : (
                        <span className={STYLES.muted}>Missing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!documents.length && !loading ? <p className={STYLES.empty}>{emptySentence}</p> : null}
          </div>
        ) : null}
        {status ? (
          <p className={STYLES[status.tone]} role="status">
            {status.text}
          </p>
        ) : null}
      </div>
    </KRModuleCard>
  )
}
