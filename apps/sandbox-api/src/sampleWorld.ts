// file: apps/sandbox-api/src/sampleWorld.ts
/**
 * The sandbox's sample data: one small, made-up firm ("Sandbox Law Firm") whose records point at each other, so a
 * tool can list contacts, open one, follow it to its client account, matters, billing, tasks and WorkStream, and get
 * the same ids back each time.
 *
 * Rules for this file:
 *  - **Nothing real.** Every name is invented, every email ends in `example.com`, every phone is a 555-01xx number,
 *    every SSN starts with 000 and every EIN with 00. `isolation.test.ts` checks the emails and the numbers.
 *  - **Fixed dates.** The sample firm's "today" is `SAMPLE_TODAY`; nothing moves with the clock, so a tool's tests
 *    give the same answer every day.
 *  - **The shapes are the API's.** Each value is typed with its contract from `@krhomebase/contracts`, and
 *    `compliance.test.ts` checks every reply against `apps/api/openapi/openapi.json`. When the API changes a shape,
 *    that test fails until this file is changed to match.
 */

import type {
  AttendanceEmployeesData,
  BillingPayLinksData,
  BillingRecord,
  ClientMattersData,
  ContactDetailData,
  ContactListData,
  HomebaseFeedbackDetail,
  HomebaseFeedbackSummary,
  Lead,
  Matter,
  Task,
  TaskNote,
  TeamStatusData,
  TimeCardData,
  WorkstreamActivity,
} from '@krhomebase/contracts'

export type SampleContact = ContactListData['contacts'][number]
export type SampleContactDetail = ContactDetailData['contacts'][number]

/** The sample firm's fixed "today" and "now". */
export const SAMPLE_TODAY = '2026-11-20'
export const SAMPLE_NOW = '2026-11-20T16:00:00.000Z'
const CREATED = '2026-10-01T15:00:00.000Z'
const UPDATED = '2026-11-18T19:30:00.000Z'

export const SAMPLE_FIRM_NAME = 'Sandbox Law Firm (sample data)'

/** The person a frame call acts as (the sandbox has no sign-in). */
export const SAMPLE_FRAME_PERSON = { displayName: 'Sam Sandbox', role: 'staff', firmName: SAMPLE_FIRM_NAME } as const

/* ------------------------------------------------------------------------------------------------------------------
 * Staff
 * ---------------------------------------------------------------------------------------------------------------- */

export const STAFF = [
  { userId: 'usr_sbx_jordan', label: 'Jordan Sample', staffCode: 'JS', employeeId: 'emp_sbx_jordan', employeeNumber: 'E-901' },
  { userId: 'usr_sbx_riley', label: 'Riley Example', staffCode: 'RE', employeeId: 'emp_sbx_riley', employeeNumber: 'E-902' },
] as const

const JORDAN = STAFF[0]
const RILEY = STAFF[1]

/* ------------------------------------------------------------------------------------------------------------------
 * Contacts and client accounts
 * ---------------------------------------------------------------------------------------------------------------- */

/** Fields every contact row shares, with empty values. */
function contactBase(): Omit<SampleContact, 'id' | 'kind' | 'typeLabel' | 'displayName'> {
  return {
    relatedContacts: [],
    titlePrefix: null,
    firstName: null,
    middleName: null,
    lastName: null,
    suffix: null,
    preferredName: null,
    ssnLast4: null,
    isMinor: false,
    isAttorney: false,
    email: null,
    phone: null,
    phoneSecondary: null,
    fax: null,
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    status: 'active',
    notes: null,
    isClient: false,
    clientId: null,
    clientNumber: null,
    clientDisplayName: null,
    clientType: null,
    clientStatus: null,
    linkedUserId: null,
    isCurrentUser: false,
    canEditLoginEmail: false,
    createdAt: CREATED,
    updatedAt: UPDATED,
  }
}

export const CONTACTS: SampleContact[] = [
  {
    ...contactBase(),
    id: 'ind_sbx_casey',
    kind: 'individual',
    icid: 'IC9001',
    typeLabel: 'Individual',
    displayName: 'Casey Testperson',
    firstName: 'Casey',
    lastName: 'Testperson',
    ssnLast4: '0001',
    email: 'casey.testperson@example.com',
    phone: '(555) 010-0101',
    addressLine1: '100 Example Street',
    city: 'Springfield',
    state: 'TX',
    postalCode: '75001',
    notes: 'Sample client. Every value here is made up.',
    isClient: true,
    clientId: 'cl_sbx_901',
    clientNumber: '901',
    clientDisplayName: 'Casey Testperson',
    clientType: 'individual',
    clientStatus: 'active',
    relatedContacts: [{ id: 'ent_sbx_holdings', displayName: 'Example Holdings LLC', icid: null, relationship: 'Owner' }],
  },
  {
    ...contactBase(),
    id: 'ent_sbx_holdings',
    kind: 'entity',
    ecid: 'EC9002',
    typeLabel: 'Limited Liability Company',
    displayName: 'Example Holdings LLC',
    entitySubtype: 'llc',
    einLast4: '0002',
    stateOfFormation: 'TX',
    formationDate: '2020-01-15',
    entityStatus: 'active',
    pointOfContactName: 'Casey Testperson',
    pointOfContact: { id: 'ind_sbx_casey', displayName: 'Casey Testperson', icid: 'IC9001', relationship: 'Owner' },
    email: 'office@holdings.example.com',
    phone: '(555) 010-0102',
    addressLine1: '200 Sample Avenue',
    addressLine2: 'Suite 5',
    city: 'Springfield',
    state: 'TX',
    postalCode: '75002',
    isClient: true,
    clientId: 'cl_sbx_902',
    clientNumber: '902',
    clientDisplayName: 'Example Holdings LLC',
    clientType: 'entity',
    clientStatus: 'active',
  },
  {
    ...contactBase(),
    id: 'ind_sbx_morgan',
    kind: 'individual',
    icid: 'IC9003',
    typeLabel: 'Individual',
    displayName: 'Morgan Prospect',
    firstName: 'Morgan',
    lastName: 'Prospect',
    email: 'morgan.prospect@example.com',
    phone: '(555) 010-0103',
    city: 'Springfield',
    state: 'TX',
    postalCode: '75003',
    status: 'active',
  },
]

/** The full SSN and date of birth, read only by `GET /v1/contacts/{contactId}`. Invalid numbers on purpose (000). */
const PROTECTED: Record<string, { dob: string | null; ssn: string | null; ein?: string }> = {
  ind_sbx_casey: { dob: '1980-01-01', ssn: '000-00-0001' },
  ent_sbx_holdings: { dob: null, ssn: null, ein: '00-0000002' },
  ind_sbx_morgan: { dob: '1990-06-15', ssn: '000-00-0003' },
}

/** One contact with its full SSN and date of birth, or null. */
export function contactDetail(contactId: string): SampleContactDetail | null {
  const contact = CONTACTS.find((row) => row.id === contactId)
  if (!contact) return null
  const extra = PROTECTED[contact.id] ?? { dob: null, ssn: null }
  return { ...contact, ...(extra.ein ? { ein: extra.ein } : {}), dob: extra.dob, ssn: extra.ssn }
}

export const CLIENTS = [
  { id: 'cl_sbx_901', clientNumber: '901', clientType: 'individual', individualId: 'ind_sbx_casey', entityId: null, displayName: 'Casey Testperson', prospectStatus: 'client', status: 'active', updatedAt: UPDATED },
  { id: 'cl_sbx_902', clientNumber: '902', clientType: 'entity', individualId: null, entityId: 'ent_sbx_holdings', displayName: 'Example Holdings LLC', prospectStatus: 'client', status: 'active', updatedAt: UPDATED },
]

/** A client account by id or number (leading zeros ignored). */
export function findClient(idOrNumber: string) {
  const number = idOrNumber.replace(/^0+(?=\d)/, '')
  return CLIENTS.find((client) => client.id === idOrNumber || client.clientNumber === number) ?? null
}

/* ------------------------------------------------------------------------------------------------------------------
 * Matters
 * ---------------------------------------------------------------------------------------------------------------- */

export const MATTER_STATUSES = [
  { id: 'lk_sbx_matter_open', label: 'Open' },
  { id: 'lk_sbx_matter_closed', label: 'Closed' },
]
export const PRACTICE_AREAS = [
  { id: 'lk_sbx_area_general', label: 'General' },
  { id: 'lk_sbx_area_estate', label: 'Estate Planning' },
  { id: 'lk_sbx_area_business', label: 'Business Formation' },
]

function matter(id: string, matterNumber: string, title: string, area: string, isGeneralMatter: boolean, description: string | null): Matter {
  return {
    id,
    matterNumber,
    title,
    description,
    isGeneralMatter,
    practiceAreaLookupId: area,
    practiceAreaLabel: PRACTICE_AREAS.find((row) => row.id === area)?.label ?? null,
    statusLookupId: 'lk_sbx_matter_open',
    statusLabel: 'Open',
    openedDate: '2026-10-01',
    closedDate: null,
    primaryAttorneyUserId: JORDAN.userId,
    createdAt: CREATED,
    updatedAt: UPDATED,
    notes: [],
  }
}

/** Each client's matters, in number order. */
export const MATTERS: Record<string, Matter[]> = {
  cl_sbx_901: [
    matter('mat_sbx_901_0', '901.0', 'Client General Matters', 'lk_sbx_area_general', true, null),
    matter('mat_sbx_901_1', '901.1', 'Estate Plan', 'lk_sbx_area_estate', false, 'Will and revocable trust (sample).'),
  ],
  cl_sbx_902: [
    matter('mat_sbx_902_0', '902.0', 'Client General Matters', 'lk_sbx_area_general', true, null),
    matter('mat_sbx_902_1', '902.1', 'Company Formation', 'lk_sbx_area_business', false, 'Operating agreement (sample).'),
  ],
}

/** A matter with its client id, or null. */
export function findMatter(matterId: string): { clientId: string; matter: Matter } | null {
  for (const [clientId, list] of Object.entries(MATTERS)) {
    const found = list.find((row) => row.id === matterId)
    if (found) return { clientId, matter: found }
  }
  return null
}

export function clientMatters(clientId: string): ClientMattersData | null {
  const client = findClient(clientId)
  if (!client) return null
  return { clientId: client.id, clientNumber: client.clientNumber, matters: MATTERS[client.id] ?? [], statuses: MATTER_STATUSES, practiceAreas: PRACTICE_AREAS, viewer: { canWrite: true, canDelete: false } }
}

/* ------------------------------------------------------------------------------------------------------------------
 * Leads
 * ---------------------------------------------------------------------------------------------------------------- */

export const LEADS: Lead[] = [
  {
    id: 'lead_sbx_morgan',
    lcid: 'L901',
    individualId: 'ind_sbx_morgan',
    displayName: 'Morgan Prospect',
    firstName: 'Morgan',
    lastName: 'Prospect',
    icid: 'IC9003',
    email: 'morgan.prospect@example.com',
    phone: '(555) 010-0103',
    source: 'website',
    status: 'contacted',
    urgency: 'normal',
    summary: 'Asked about a simple will (sample lead).',
    practiceArea: 'Estate Planning',
    assignedToUserId: RILEY.userId,
    assignedToLabel: RILEY.label,
    publicInquiryId: null,
    receivedAt: '2026-11-10T14:00:00.000Z',
    lastActionAt: '2026-11-12T16:00:00.000Z',
    convertedClientId: null,
    convertedClientNumber: null,
    createdAt: '2026-11-10T14:00:00.000Z',
    updatedAt: '2026-11-12T16:00:00.000Z',
  },
]

export const findLead = (idOrLcid: string): Lead | null => LEADS.find((lead) => lead.id === idOrLcid || lead.lcid === idOrLcid) ?? null

/* ------------------------------------------------------------------------------------------------------------------
 * Tasks
 * ---------------------------------------------------------------------------------------------------------------- */

export const TASKS: Task[] = [
  {
    id: 'TSBX901',
    title: 'Draft the will (sample)',
    description: 'From WorkStream entry WS #WSBX902.',
    typeLabel: 'Drafting',
    status: 'in_progress',
    priority: 'normal',
    clientId: 'cl_sbx_901',
    clientNumber: '901',
    clientDisplayName: 'Casey Testperson',
    matterId: 'mat_sbx_901_1',
    matterNumber: '901.1',
    matterTitle: 'Estate Plan',
    assignees: [{ userId: JORDAN.userId, label: JORDAN.label, staffCode: JORDAN.staffCode }],
    assignedByUserId: RILEY.userId,
    supervisorUserId: null,
    supervisorLabel: null,
    billingValue: 750,
    billingStatus: 'not_ready',
    billingDescription: null,
    dueDate: '2026-11-25',
    completedAt: null,
    createdByUserId: RILEY.userId,
    createdByLabel: RILEY.label,
    createdAt: '2026-11-12T16:10:00.000Z',
    updatedAt: UPDATED,
  },
  {
    id: 'TSBX902',
    title: 'Send the formation checklist (sample)',
    description: null,
    typeLabel: null,
    status: 'open',
    priority: 'high',
    clientId: 'cl_sbx_902',
    clientNumber: '902',
    clientDisplayName: 'Example Holdings LLC',
    matterId: 'mat_sbx_902_1',
    matterNumber: '902.1',
    matterTitle: 'Company Formation',
    assignees: [{ userId: RILEY.userId, label: RILEY.label, staffCode: RILEY.staffCode }],
    assignedByUserId: JORDAN.userId,
    supervisorUserId: JORDAN.userId,
    supervisorLabel: JORDAN.label,
    billingValue: null,
    billingStatus: 'not_billable',
    billingDescription: null,
    dueDate: null,
    completedAt: null,
    createdByUserId: JORDAN.userId,
    createdByLabel: JORDAN.label,
    createdAt: '2026-11-15T15:00:00.000Z',
    updatedAt: null,
  },
]

export const findTask = (taskId: string): Task | null => TASKS.find((task) => task.id === taskId) ?? null

export const TASK_NOTES: Record<string, TaskNote[]> = {
  TSBX901: [{ id: 'tno_sbx_1', text: 'First draft started (sample note).', authorUserId: JORDAN.userId, authorLabel: JORDAN.label, createdAt: '2026-11-18T19:30:00.000Z' }],
  TSBX902: [],
}

/* ------------------------------------------------------------------------------------------------------------------
 * WorkStream
 * ---------------------------------------------------------------------------------------------------------------- */

function activity(over: Partial<WorkstreamActivity> & Pick<WorkstreamActivity, 'id' | 'wsid' | 'subgroup' | 'title' | 'note' | 'activityAt'>): WorkstreamActivity {
  return {
    subgroups: [over.subgroup],
    clientId: null,
    clientNumber: null,
    clientDisplayName: null,
    leadId: null,
    lcid: null,
    matterId: null,
    matterNumber: null,
    matterTitle: null,
    noteHtml: null,
    nextSteps: [],
    documentRecordId: null,
    documentUrl: null,
    documentLabel: null,
    taskId: null,
    assigneeUserId: null,
    assigneeUserIds: [],
    assigneeContactId: null,
    assigneeLabel: null,
    performedByUserId: JORDAN.userId,
    performedByLabel: JORDAN.label,
    createdAt: over.activityAt,
    updatedAt: null,
    ...over,
  }
}

/** Newest first, as the API lists them. */
export const ACTIVITIES: WorkstreamActivity[] = [
  activity({
    id: 'wsa_sbx_903', wsid: 'WSBX903', subgroup: 'PhoneCalls', title: 'Call about the formation (sample)', note: 'Discussed the operating agreement.',
    activityAt: '2026-11-16T17:00:00.000Z', clientId: 'cl_sbx_902', clientNumber: '902', clientDisplayName: 'Example Holdings LLC',
    matterId: 'mat_sbx_902_1', matterNumber: '902.1', matterTitle: 'Company Formation', nextSteps: ['Send the checklist'],
  }),
  activity({
    id: 'wsa_sbx_902', wsid: 'WSBX902', subgroup: 'Notes', subgroups: ['Notes', 'Tasks'], title: 'Estate plan intake (sample)', note: 'Client wants a will and a revocable trust.',
    noteHtml: '<p>Client wants a will and a revocable trust.</p>', activityAt: '2026-11-12T16:00:00.000Z', clientId: 'cl_sbx_901', clientNumber: '901',
    clientDisplayName: 'Casey Testperson', matterId: 'mat_sbx_901_1', matterNumber: '901.1', matterTitle: 'Estate Plan', taskId: 'TSBX901',
    assigneeUserId: JORDAN.userId, assigneeUserIds: [JORDAN.userId], assigneeLabel: JORDAN.label,
  }),
  activity({
    id: 'wsa_sbx_901', wsid: 'WSBX901', subgroup: 'Emails', title: 'Website inquiry (sample)', note: 'Morgan asked about a simple will.',
    activityAt: '2026-11-10T14:05:00.000Z', leadId: 'lead_sbx_morgan', lcid: 'L901', performedByUserId: RILEY.userId, performedByLabel: RILEY.label,
  }),
]

export const findActivity = (wsid: string): WorkstreamActivity | null => ACTIVITIES.find((row) => row.wsid === wsid) ?? null

/* ------------------------------------------------------------------------------------------------------------------
 * Billing (client 901 only; client 902 has an empty record)
 * ---------------------------------------------------------------------------------------------------------------- */

export function billingRecord(clientId: string): BillingRecord | null {
  const client = findClient(clientId)
  if (!client) return null
  const matters = (MATTERS[client.id] ?? []).map((row) => ({ id: row.id, matterNumber: row.matterNumber, title: row.title }))
  const empty: BillingRecord = {
    client: { id: client.id, clientNumber: client.clientNumber, displayName: client.displayName },
    matters,
    timeEntries: [],
    invoices: [],
    payments: [],
    ledgerEntries: [],
    trustEntries: [],
    staffOptions: STAFF.map((row) => ({ id: row.userId, label: row.label, staffCode: row.staffCode, defaultRateClassId: 'attorney' })),
    rateClasses: [
      { id: 'attorney', label: 'Attorney', rate: 300, active: true, builtIn: true },
      { id: 'paralegal', label: 'Paralegal', rate: 125, active: true, builtIn: true },
    ],
    accountTotals: { openInvoiceBalance: 0, openInvoiceCount: 0, receivableDebits: 0, receivableCredits: 0, trustCredits: 0, trustDebits: 0, trustBalance: 0, unappliedPayments: 0 },
    viewer: { canWrite: false, canAdminister: false },
  }
  if (client.id !== 'cl_sbx_901') return empty
  return {
    ...empty,
    timeEntries: [
      {
        id: 'te_sbx_1', matterId: 'mat_sbx_901_1', date: '2026-11-12', matterNumber: '901.1', description: 'Intake meeting (sample)', activityCategory: 'Meeting',
        kind: 'Time', hours: 1.5, rate: 300, amount: 450, billingStatus: 'Billed', staffId: JORDAN.userId, staff: JORDAN.label, staffCode: JORDAN.staffCode,
        internalTimeTracked: false, invoiceId: 'inv_sbx_1', bcid: 'BCSBX01',
      },
      {
        id: 'te_sbx_2', matterId: 'mat_sbx_901_1', date: '2026-11-18', matterNumber: '901.1', description: 'Draft the will (sample)', activityCategory: 'Drafting',
        kind: 'Time', hours: 2, rate: 300, amount: 600, billingStatus: 'Bill Next Invoice', staffId: JORDAN.userId, staff: JORDAN.label, staffCode: JORDAN.staffCode,
        internalTimeTracked: false, invoiceId: null, bcid: 'BCSBX02',
      },
    ],
    invoices: [
      {
        id: 'inv_sbx_1', matterId: 'mat_sbx_901_1', matterNumber: '901.1', invoiceNumber: '9001', dateInvoiced: '2026-11-13', dueDate: '2026-12-13',
        clientLabel: 'Casey Testperson', amountDue: 450, writeOff: 0, taxAmount: 0, ivid: 'IVSBX01', locked: true, status: 'Partially paid', entryIds: ['te_sbx_1'],
      },
    ],
    payments: [
      {
        id: 'pay_sbx_1', paymentNumber: 'P9001', invoiceId: 'inv_sbx_1', invoiceNumber: '9001', invoiceIvid: 'IVSBX01', matterId: 'mat_sbx_901_1', matterNumber: '901.1',
        receivedDate: '2026-11-15', amount: 200, paymentType: 'Check', referenceNumber: '1001', memo: 'Sample payment', writeOff: 0, sourceSystem: null,
        voided: false, voidedAt: null, voidReason: null, refund: null, unappliedAmount: 0,
      },
      {
        id: 'pay_sbx_2', paymentNumber: 'P9002', invoiceId: 'inv_sbx_1', invoiceNumber: '9001', invoiceIvid: 'IVSBX01', matterId: 'mat_sbx_901_1', matterNumber: '901.1',
        receivedDate: '2026-11-16', amount: 50, paymentType: 'Credit card', referenceNumber: 'pi_sample', memo: 'Stripe sandbox · Visa •••• 4242', writeOff: 0,
        sourceSystem: 'stripe_sandbox', voided: true, voidedAt: '2026-11-17T15:00:00.000Z', voidReason: 'Sample refund',
        refund: { id: 're_sample', status: 'succeeded', amount: 50, reference: '00000000000000000000001', referenceType: 'acquirer_reference_number', referenceStatus: 'available', refundedAt: '2026-11-17T15:00:00.000Z' },
        unappliedAmount: 0,
      },
    ],
    ledgerEntries: [
      { id: 'le_sbx_1', invoiceId: 'inv_sbx_1', date: '2026-11-13', reference: 'Invoice 9001', description: 'Invoice 9001', charges: 450, balance: 450, matterBalance: 450, matterNumber: '901.1', matterId: 'mat_sbx_901_1' },
      { id: 'le_sbx_2', paymentId: 'pay_sbx_1', date: '2026-11-15', reference: 'P9001', description: 'Payment, check 1001', payments: 200, balance: 250, matterBalance: 250, matterNumber: '901.1', matterId: 'mat_sbx_901_1' },
    ],
    trustEntries: [
      { id: 'tr_sbx_1', date: '2026-11-05', reference: 'T9001', description: 'Retainer deposit (sample)', fundsReceived: 1000, fundsDispersed: 0, balance: 1000, matterNumber: '901.1', matterId: 'mat_sbx_901_1' },
    ],
    accountTotals: { openInvoiceBalance: 250, openInvoiceCount: 1, receivableDebits: 450, receivableCredits: 200, trustCredits: 1000, trustDebits: 0, trustBalance: 1000, unappliedPayments: 0 },
  }
}

export function payLinks(clientId: string): BillingPayLinksData | null {
  const client = findClient(clientId)
  if (!client) return null
  if (client.id !== 'cl_sbx_901') return { payLinks: [], posted: 0, failed: 0 }
  return {
    payLinks: [
      {
        id: 'prq_sbx_1', prid: 'PRSBX01', invoiceId: 'inv_sbx_1', invoiceIvid: 'IVSBX01', invoiceNumber: '9001', environment: 'sandbox', status: 'open', tokenHint: 'abcd',
        expiresAt: '2027-01-12T06:00:00.000Z', createdAt: '2026-11-13T16:00:00.000Z', viewCount: 1, lastViewedAt: '2026-11-14T02:00:00.000Z', intentAttempts: 0,
        paidAmount: null, paidAt: null, payerEmail: null, paymentNumber: null, postedAt: null, postError: null, revokedAt: null, revokeReason: null,
        sentDocumentNumber: 'DSBX001', linkSource: 'email',
      },
    ],
    posted: 0,
    failed: 0,
  }
}

/** The sent copies shown by every billing email route (one sample invoice email). */
export function sentCopies(clientId: string) {
  return [
    {
      documentId: 'doc_sbx_1', documentNumber: 'DSBX001', sentAt: '2026-11-13T16:00:00.000Z', subject: '[KR 901.1] Invoice 9001 (sample)',
      to: ['casey.testperson@example.com'], cc: [], sentBy: JORDAN.label, hasPdf: true, hasHtml: true,
      url: `/v1/billing/clients/${clientId}/documents/DSBX001/file`,
    },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------
 * Attendance
 * ---------------------------------------------------------------------------------------------------------------- */

export const PERIOD = { id: 'pp_2026-11-16', start: '2026-11-16', end: '2026-11-30', number: 22, status: 'open', payDate: '2026-12-05' }

export const EMPLOYEES: AttendanceEmployeesData['employees'] = STAFF.map((row) => ({
  id: row.employeeId, userId: row.userId, name: row.label, employeeNumber: row.employeeNumber, employmentStatus: 'active', is1099Vendor: false,
}))

export const findEmployee = (employeeId: string) => EMPLOYEES.find((row) => row.id === employeeId) ?? null

export const TEAM_STATUS: TeamStatusData = {
  rows: [
    { employeeId: JORDAN.employeeId, name: JORDAN.label, isClockedIn: true, needsClockReview: false, clockedInAt: '2026-11-20T14:58:00.000Z', statusNote: 'In the office (sample)', location: 'Springfield', canUpdate: false },
    { employeeId: RILEY.employeeId, name: RILEY.label, isClockedIn: false, needsClockReview: false, clockedInAt: null, statusNote: null, location: null, canUpdate: false },
  ],
}

/** One employee's time card for the sample period. */
export function timeCard(employeeId: string): TimeCardData | null {
  const employee = findEmployee(employeeId)
  if (!employee) return null
  const card = `tc_sbx_${employee.id}`
  return {
    today: SAMPLE_TODAY,
    period: PERIOD,
    employee,
    card: {
      id: card, status: 'open', isLocked: false, lockedAt: null, employeeApprovedAt: null, employeeApprovedByUserId: null, managerApprovedAt: null,
      managerApprovedByUserId: null, reopenedAt: null, reopenedByUserId: null, notes: null,
    },
    punches: [
      { id: `tp_sbx_${employee.id}_1`, punchType: 'clock_in', occurredAt: '2026-11-19T15:00:00.000Z', localDate: '2026-11-19', source: 'web', correctionReason: null, supersedesPunchId: null, voidedAt: null, createdByUserId: employee.userId },
      { id: `tp_sbx_${employee.id}_2`, punchType: 'clock_out', occurredAt: '2026-11-19T23:00:00.000Z', localDate: '2026-11-19', source: 'web', correctionReason: null, supersedesPunchId: null, voidedAt: null, createdByUserId: employee.userId },
    ],
    intervals: [
      { startPunchId: `tp_sbx_${employee.id}_1`, endPunchId: `tp_sbx_${employee.id}_2`, startAt: '2026-11-19T15:00:00.000Z', endAt: '2026-11-19T23:00:00.000Z', workDate: '2026-11-19', hours: 8, isAssumedMidnightClose: false, exception: null },
    ],
    events: [{ id: `te_sbx_${employee.id}_pto`, workDate: '2026-11-17', timeType: 'pto', hours: 4, status: 'draft', notes: 'Sample PTO' }],
    totals: { regularHours: 8, overtimeHours: 0, ptoHours: 4, holidayHours: 0, sickHours: 0, unpaidHours: 0, otherHours: 0 },
    exceptions: [],
    isCardEditWindowExpired: false,
    policy: { timezone: 'America/Chicago', incrementMinutes: 6, employeeEditWindowDays: 3, managerEditWindowDays: 14 },
    viewer: { scope: 'all', canUpdate: true, canEditPunches: true, canApprove: true, isSuperAdmin: false, editWindowDays: 14 },
    approval: { kind: 'employee', allowed: false, blockedReason: 'Approve on a Friday of the period or after it ends (sample).', canReopen: false },
  }
}

/* ------------------------------------------------------------------------------------------------------------------
 * Homebase Feedback (requests about KR Homebase itself)
 * ---------------------------------------------------------------------------------------------------------------- */

export const FEEDBACK: HomebaseFeedbackSummary[] = [
  {
    number: 9001, code: 'FB-9001', kind: 'usability', title: 'Sample request: the save button is hard to find', status: 'triaged', priority: 'normal',
    submittedByUserId: RILEY.userId, submittedByLabel: RILEY.label, submittedByDeveloper: false, sectionId: 'tasks', markerCount: 1, noteCount: 1,
    createdAt: '2026-11-14T15:00:00.000Z', updatedAt: '2026-11-15T15:00:00.000Z',
  },
]

export function feedbackDetail(number: number): HomebaseFeedbackDetail | null {
  const summary = FEEDBACK.find((row) => row.number === number)
  if (!summary) return null
  return {
    ...summary,
    body: 'Submitter: Riley Example\nProblem Statement: sample text.\nRecommended Solution Details: sample text.',
    submitterRole: 'staff',
    context: {
      pageAddress: '/?section=tasks', sectionId: 'tasks', openItem: null, pageTitle: 'Tasks', webVersion: '1.1.5', deploymentId: null, deploymentTime: null,
      windowWidth: 1280, windowHeight: 720, theme: 'light',
    },
    markers: [{ attribute: 'data-kr-id', value: 'tasks-ledger', pattern: 'data-kr-id="tasks-ledger"', foundAtCapture: true, box: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 } }],
    images: [],
    notes: [{ id: 'hfn_sbx_1', noteType: 'status_change', text: null, fromValue: 'new', toValue: 'triaged', authorUserId: JORDAN.userId, authorLabel: JORDAN.label, createdAt: '2026-11-15T15:00:00.000Z' }],
  }
}
