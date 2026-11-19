// file: apps/web/app/print/[document]/page.tsx
/**
 * KR Homebase print-view route: `/print/invoice`, `/print/statement`, `/print/receipt` and `/print/it-report`.
 *
 * This server component checks the session exactly like the home route (`app/page.tsx`: `fetchSession`, and a
 * redirect to `/login` with the reason when nobody is signed in), reads the firm profile for the letterhead, then
 * renders the billing feature's client print view, which paginates the requested document onto Letter pages and
 * offers Print / Close.
 * Sample documents are described by the query string (`src=sample&office=<location id>&option=option-1`);
 * a real document arrives through a localStorage handoff key (`src=handoff&key=…`).
 *
 * Ported from the old `app/krhomebase/print/[document]/page.tsx` (Billing part 7b of `docs/API/Billing_Audit.md`).
 * Changed: the address is `/print/...` (the old app lived under `/krhomebase`); the letterhead office is a firm
 * location id (`office`) instead of `state=TX|KS`, and the firm profile is read here so the print view can build the
 * letterhead (decision B5).
 *
 * Web patch 574 (the requester, Nov 18, 2026): `/print/it-report` prints the IT Report (`features/it`) through the
 * same print tool. It is for a super admin only: anyone else gets the not-found page here, and the API refuses the
 * report's data (`GET /v1/it/overview`) either way. It has no letterhead, so the firm profile is not read for it.
 */

import { notFound, redirect } from 'next/navigation'
import { PRINT_VIEW_DOCUMENT_KINDS, PRINT_VIEW_REPORT_KINDS, type PrintViewDocumentKind, type PrintViewReportKind } from '@/components/printing/printViewDocuments'
import { fetchSession } from '@/features/auth/session.server'
import BillingPrintView from '@/features/billing/components/BillingPrintView.client'
import { fetchFirmProfileForPrint } from '@/features/firm/firmProfile.server'
import ItReportPrintView from '@/features/it/components/ItReportPrintView.client'
import { readWebBuild } from '@/features/it/webBuild.server'
import { L } from '@/lib/KRUtilities'

export const dynamic = 'force-dynamic'

interface PrintViewPageProps {
  params: Promise<{ document: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/** Reads a single-valued query parameter. */
function single(value: string | string[] | undefined): string | undefined {
  const rVal = Array.isArray(value) ? value[0] : value
  return rVal
}

/**
 * Renders the protected print view for one billing document kind, or for the IT Report.
 *
 * @returns The client print view after the session check; 404 for unknown documents, and for the IT Report when the
 *   signed-in person is not a super admin.
 */
export default async function PrintViewPage({ params, searchParams }: PrintViewPageProps) {
  const { document } = await params
  const isReport = PRINT_VIEW_REPORT_KINDS.includes(document as PrintViewReportKind)
  if (!isReport && !PRINT_VIEW_DOCUMENT_KINDS.includes(document as PrintViewDocumentKind)) notFound()

  const state = await fetchSession()
  if (!state.signedIn) {
    L(`[KR_PRINT_VIEW:48] Redirecting to login reason=${state.reason}`)
    redirect(`/login?auth_error=${encodeURIComponent(state.reason)}`)
  }

  const query = (await searchParams) ?? {}

  // The IT Report: super admin only; it carries no letterhead.
  if (isReport) {
    if (state.session.role !== 'super_admin') {
      L(`[KR_PRINT_VIEW:63] IT Report refused userId=${state.session.userId} role=${state.session.role}`)
      notFound()
    }
    L(`[KR_PRINT_VIEW:66] Rendering print view document=${document} src=${single(query.src) ?? 'read'} userId=${state.session.userId}`)
    return <ItReportPrintView handoffKey={single(query.src) === 'handoff' ? single(query.key) : undefined} printedBy={state.session.displayName} web={readWebBuild()} />
  }

  const firm = await fetchFirmProfileForPrint()
  L(`[KR_PRINT_VIEW:54] Rendering print view document=${document} src=${single(query.src) ?? 'sample'} userId=${state.session.userId} firmProfile=${firm.loaded ? 'read' : 'built-in'}`)

  return (
    <BillingPrintView
      documentKind={document as PrintViewDocumentKind}
      firmProfile={firm.profile}
      firmProfileLoaded={firm.loaded}
      handoffKey={single(query.key)}
      initialOffice={single(query.office) ?? null}
      initialOption={single(query.option) === 'option-2' ? 'option-2' : 'option-1'}
      source={single(query.src) === 'handoff' ? 'handoff' : 'sample'}
    />
  )
}
