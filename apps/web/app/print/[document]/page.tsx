// file: apps/web/app/print/[document]/page.tsx
/**
 * KR Homebase print-view route: `/print/invoice`, `/print/statement` and `/print/receipt`.
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
 */

import { notFound, redirect } from 'next/navigation'
import { PRINT_VIEW_DOCUMENT_KINDS, type PrintViewDocumentKind } from '@/components/printing/printViewDocuments'
import { fetchSession } from '@/features/auth/session.server'
import BillingPrintView from '@/features/billing/components/BillingPrintView.client'
import { fetchFirmProfileForPrint } from '@/features/firm/firmProfile.server'
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
 * Renders the protected print view for one billing document kind.
 *
 * @returns The client print view after the session check; 404 for unknown documents.
 */
export default async function PrintViewPage({ params, searchParams }: PrintViewPageProps) {
  const { document } = await params
  if (!PRINT_VIEW_DOCUMENT_KINDS.includes(document as PrintViewDocumentKind)) notFound()

  const state = await fetchSession()
  if (!state.signedIn) {
    L(`[KR_PRINT_VIEW:48] Redirecting to login reason=${state.reason}`)
    redirect(`/login?auth_error=${encodeURIComponent(state.reason)}`)
  }

  const query = (await searchParams) ?? {}
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
