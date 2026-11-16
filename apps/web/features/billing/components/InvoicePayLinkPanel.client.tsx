'use client'
// file: apps/web/features/billing/components/InvoicePayLinkPanel.client.tsx
/**
 * InvoicePayLinkPanel — read-only status of the selected invoice's online pay links (Billing → Payments → Open
 * Invoices, beside the invoice list). Ported from the old `KR-Billing/InvoicePayLinkPanel.client.tsx` (Billing part 7d
 * of `docs/API/Billing_Audit.md`, section 4.3).
 *
 * State ownership: none. `PaymentsTab` passes the links of the chosen invoice, newest first, from `usePayLinks`
 * (`api.client.ts`), which `BillingClientPanel` fills when the client opens (posting the paid links waiting).
 *
 * Changed from the old panel:
 *  - Colors are `--kr-theme-*` tokens: the old amber (paid) and emerald (posted) chips were hard-coded Tailwind colors;
 *    paid reads as the muted surface with the text color, posted as `--kr-theme-success`.
 *  - A paid link now "posts when Billing next opens" (the old wording said "on the next Billing load"), and a link that
 *    could not post names its error code in red, as before.
 *  - The type comes from `@krhomebase/contracts` (`BillingPayLink`); the old `types.ts` copy is gone.
 */

import type { BillingPayLink } from '../types'
import { formatAccountingAmount } from '../formatAccountingAmount'

const STYLES = {
  box: 'border-b border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text)',
  title: 'font-semibold text-(color:--kr-theme-text-muted)',
  chip: 'px-[3px] rounded-[2px] border text-[10px] font-bold uppercase',
  chipOpen: 'border-(--kr-theme-brand-primary) text-(color:--kr-theme-brand-primary)',
  chipPaid: 'border-(--kr-theme-text) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text)',
  chipPosted: 'border-(--kr-theme-success) text-(color:--kr-theme-success)',
  chipDone: 'border-(--kr-theme-line) text-(color:--kr-theme-text-muted)',
  detail: 'text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'text-[11px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  box: 'px-[8px] py-[6px] gap-[3px] grid',
  headerRow: 'gap-[6px] flex flex-wrap items-center',
  history: 'gap-[2px] grid',
} as const

/** Props for {@link InvoicePayLinkPanel}. */
export interface InvoicePayLinkPanelProps {
  /** Links for this invoice, newest first. */
  payLinks: readonly BillingPayLink[]
}

/** MM/DD/YYYY from an ISO timestamp. */
function shortDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const rVal = Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  return rVal
}

/** One-line description of a link's state. */
export function describePayLink(link: BillingPayLink): string {
  const parts = [`${link.prid} (${link.tokenHint}...)`, link.linkSource === 'print' ? 'printed' : 'emailed', link.environment === 'sandbox' ? 'sandbox' : 'live']
  if (link.sentDocumentNumber) parts.push(`sent in ${link.sentDocumentNumber}`)
  if (link.status === 'open') parts.push(`opened ${link.viewCount}×`, `expires ${shortDate(link.expiresAt)}`)
  if (link.status === 'paid') parts.push(`paid ${formatAccountingAmount(link.paidAmount ?? 0)} ${shortDate(link.paidAt)}`, 'posts when Billing next opens')
  if (link.status === 'posted') parts.push(`paid ${formatAccountingAmount(link.paidAmount ?? 0)} ${shortDate(link.paidAt)}`, `payment ${link.paymentNumber ?? ''}`)
  if (link.status === 'expired') parts.push(`expired ${shortDate(link.expiresAt)}`)
  if (link.status === 'revoked') parts.push(`revoked ${shortDate(link.revokedAt)}${link.revokeReason ? ` · ${link.revokeReason}` : ''}`)
  const rVal = parts.join(' · ')
  return rVal
}

function chipClass(status: BillingPayLink['status']): string {
  const rVal = status === 'open' ? STYLES.chipOpen : status === 'paid' ? STYLES.chipPaid : status === 'posted' ? STYLES.chipPosted : STYLES.chipDone
  return rVal
}

/**
 * Read-only status of the selected invoice's online pay links (Payments tab).
 * Links are issued automatically with every invoice email (and printed invoice); there is nothing to
 * create here. Shows the latest link, paid links that could not post (red),
 * and up to three earlier links.
 *
 * @returns The pay-link status strip.
 */
export default function InvoicePayLinkPanel({ payLinks }: InvoicePayLinkPanelProps) {
  const latest = payLinks[0] ?? null
  const needsReview = payLinks.filter((link) => link.postError && !link.paymentNumber)
  return (
    <section className={`${LAYOUT_STYLES.box} ${STYLES.box}`} data-kr-element="invoice-pay-link-panel">
      {/* Latest link: status chip and one-line detail. */}
      <div className={LAYOUT_STYLES.headerRow} data-kr-element="invoice-pay-link-latest-row">
        <span className={STYLES.title}>Online pay link</span>
        {latest ? <span className={`${STYLES.chip} ${chipClass(latest.status)}`}>{latest.status}</span> : null}
        <span className={STYLES.detail}>{latest ? describePayLink(latest) : 'Issued automatically when the invoice is emailed or printed.'}</span>
      </div>
      {/* Paid links that could not be posted. */}
      {needsReview.map((link) => (
        <span className={STYLES.error} data-kr-element="invoice-pay-link-not-posted" key={link.id}>
          Pay link {link.prid}: paid {formatAccountingAmount(link.paidAmount ?? 0)} but not posted — {link.postError}
        </span>
      ))}
      {/* Earlier links. */}
      {payLinks.length > 1 ? (
        <div className={LAYOUT_STYLES.history} data-kr-element="invoice-pay-link-history">
          {payLinks.slice(1, 4).map((link) => (
            <span className={STYLES.detail} key={link.id}>
              <span className={`${STYLES.chip} ${chipClass(link.status)}`}>{link.status}</span> {describePayLink(link)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
