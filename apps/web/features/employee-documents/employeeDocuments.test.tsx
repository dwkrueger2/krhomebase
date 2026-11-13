// file: apps/web/features/employee-documents/employeeDocuments.test.tsx
/**
 * Employee Documents (Settings plan, stage 5): the size words, the category labels for every stored category, and
 * first draws rendered to text (upload fields only where the viewer may add files; the empty sentences).
 *
 * Run: pnpm --dir apps/web exec vitest run features/employee-documents/employeeDocuments.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EMPLOYEE_DOCUMENT_CATEGORIES } from '@krhomebase/contracts'
import EmployeeDocumentsCard, { CATEGORY_LABELS, formatBytes } from '@/features/employee-documents/components/EmployeeDocumentsCard.client'

describe('employee document helpers', () => {
  it('labels every category and sizes files', () => {
    expect(EMPLOYEE_DOCUMENT_CATEGORIES.every((value) => Boolean(CATEGORY_LABELS[value]))).toBe(true)
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(200)).toBe('1 KB')
    expect(formatBytes(null)).toBe('—')
  })
})

describe('EmployeeDocumentsCard', () => {
  const employees = [
    { id: 'emp-sam', name: 'Sam Staffer', employeeNumber: '007', canCreate: true, isOwn: true },
    { id: 'emp-ada', name: 'Ada Admin', employeeNumber: '001', canCreate: false, isOwn: false },
  ]

  it('offers the upload fields where the viewer may add files and lists the documents', () => {
    const html = renderToStaticMarkup(
      <EmployeeDocumentsCard
        initialData={{
          employees,
          employeeId: 'emp-sam',
          documents: [{ id: 'doc-1', employeeId: 'emp-sam', title: 'Offer letter.pdf', category: 'offer-letter', storageStatus: 'active', receivedDate: '2026-11-01', notes: null, createdAt: '2026-11-02T00:00:00.000Z', fileName: 'Offer letter.pdf', contentType: 'application/pdf', byteSize: 2048, fileUrl: '/api/v1/employee-documents/doc-1/file' }],
        }}
      />,
    )
    expect(html).toContain('data-kr-id="employee-documents-KRModuleCard"')
    expect(html).toContain('Upload Document')
    expect(html).toContain('Uses the file name when blank')
    expect(html).toContain('href="/api/v1/employee-documents/doc-1/file"')
  })

  it('hides the upload for someone who may only read, and explains an empty list', () => {
    const readOnly = renderToStaticMarkup(<EmployeeDocumentsCard initialData={{ employees, employeeId: 'emp-ada', documents: [] }} />)
    expect(readOnly).not.toContain('Upload Document')
    expect(readOnly).toContain('No documents for this employee.')
    const nobody = renderToStaticMarkup(<EmployeeDocumentsCard initialData={{ employees: [], employeeId: null, documents: [] }} />)
    expect(nobody).toContain('You do not have access to any employee documents.')
  })
})
