'use client'
// file: apps/web/features/billing/components/BillingHelp.client.tsx
// Ported from the old app (hb-components/KR-Billing/BillingHelp.client.tsx); only the green dashed layout-check border was
// removed.

import type { ReactNode } from 'react'

const STYLES = {
  card: 'overflow-hidden rounded border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) shadow-sm',
  shell: 'text-[10pt] leading-tight text-[var(--kr-theme-text,#243142)]',
  stepNumber: 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-bold text-white',
  title: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  body: 'text-[9pt] leading-relaxed text-[var(--kr-theme-text-muted,#526172)]',
  definition: 'py-1.5 border-t border-[var(--kr-theme-line,#d7dee5)] text-[9pt] leading-relaxed text-[var(--kr-theme-text-muted,#526172)]',
  definitionsHeader: 'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  pageTitle: 'text-[13pt] font-bold text-[var(--kr-theme-text,#243142)]',
  pageIntro: 'mt-1 text-[10pt] text-[var(--kr-theme-text-muted,#526172)]',
} as const

const LAYOUT_STYLES = {
  root: 'p-2 grid gap-3',
  workflowGrid: 'gap-2 grid md:grid-cols-2 xl:grid-cols-5',
  cardHeader: 'p-2 flex items-start gap-2',
  cardBody: 'px-2 pb-2',
  graphic: 'mb-1 flex h-20 items-center justify-center rounded bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  definitions: 'grid gap-0 md:grid-cols-2',
  definitionItem: 'px-2',
  definitionsHeader: 'px-2 py-1',
} as const

interface WorkflowStepProps { children: ReactNode; color: string; description: string; number: number; title: string }

function WorkflowStep({ children, color, description, number, title }: WorkflowStepProps) {
  return <article className={STYLES.card} data-kr-element={`billing-workflow-step-${number}`}><div className={`${LAYOUT_STYLES.cardHeader} ${color}`}><span className={STYLES.stepNumber}>{number}</span><h2 className={STYLES.title}>{title}</h2></div><div className={LAYOUT_STYLES.cardBody}><div className={LAYOUT_STYLES.graphic}>{children}</div><p className={STYLES.body}>{description}</p></div></article>
}

function TimeFeeGraphic() { return <svg aria-label="Time and fee entry illustration" height="82" viewBox="0 0 180 82" width="180"><rect fill="#dcecf1" height="82" rx="8" width="180" /><rect fill="#fff" height="48" rx="4" stroke="#21394f" width="124" x="28" y="17" /><rect fill="#8a715c" height="8" rx="2" width="40" x="38" y="28" /><rect fill="#c4ccd4" height="6" rx="2" width="92" x="38" y="45" /><circle cx="137" cy="28" fill="#e6f1e8" r="12" stroke="#31563a" /><path d="m132 28 4 4 7-8" fill="none" stroke="#31563a" strokeWidth="3" /></svg> }
function InvoiceSelectionGraphic() { return <svg aria-label="Invoice selection illustration" height="82" viewBox="0 0 180 82" width="180"><rect fill="#fff7cf" height="82" rx="8" width="180" /><rect fill="#fff" height="48" rx="4" stroke="#21394f" width="124" x="28" y="17" /><path d="M42 31h8v8h-8zM42 47h8v8h-8z" fill="none" stroke="#21394f" strokeWidth="2" /><path d="M56 35h78M56 51h64" stroke="#8a715c" strokeWidth="4" /><path d="m138 50 8 8 15-18" fill="none" stroke="#31563a" strokeWidth="4" /></svg> }
function SendInvoiceGraphic() { return <svg aria-label="Send invoice illustration" height="82" viewBox="0 0 180 82" width="180"><rect fill="#e8e2f2" height="82" rx="8" width="180" /><rect fill="#fff" height="40" rx="4" stroke="#21394f" width="80" x="20" y="21" /><path d="m25 27 35 23 35-23" fill="none" stroke="#8a715c" strokeWidth="3" /><path d="M112 41h42M143 27l15 14-15 14" fill="none" stroke="#31563a" strokeWidth="5" /></svg> }
function PaymentGraphic() { return <svg aria-label="Receive payment illustration" height="82" viewBox="0 0 180 82" width="180"><rect fill="#e6f1e8" height="82" rx="8" width="180" /><rect fill="#fff" height="34" rx="17" stroke="#31563a" width="86" x="45" y="24" /><path d="M61 41h54" stroke="#31563a" strokeWidth="4" /><path d="m92 15 14 14-14 14" fill="none" stroke="#8a715c" strokeWidth="4" /><circle cx="61" cy="41" fill="#fff7cf" r="8" stroke="#8a715c" strokeWidth="2" /></svg> }
function StatementGraphic() { return <svg aria-label="Statement of account illustration" height="82" viewBox="0 0 180 82" width="180"><rect fill="#f2e9de" height="82" rx="8" width="180" /><rect fill="#fff" height="52" rx="4" stroke="#21394f" width="104" x="38" y="15" /><path d="M48 28h84M48 39h84M48 50h55" stroke="#b8c3cd" strokeWidth="3" /><path d="m126 53 5 5 10-12" fill="none" stroke="#31563a" strokeWidth="3" /></svg> }

/** Production copy of the P33 billing help visual and wording. */
export default function BillingHelp() {
  return <section className={`${LAYOUT_STYLES.root} ${STYLES.shell}`} data-kr-id="p33-billing-help" data-kr-component="P33BillingHelp">
    <header><h2 className={STYLES.pageTitle}>How Client Billing Works</h2><p className={STYLES.pageIntro}>Move work from time entry to a paid statement of account in five reviewable steps.</p></header>
    <div className={LAYOUT_STYLES.workflowGrid} data-kr-element="billing-workflow-graphics">
      <WorkflowStep color="bg-[#dcecf1]" description="Record billable time or a flat-fee service against the correct Client 120 matter." number={1} title="Enter Time & Fees"><TimeFeeGraphic /></WorkflowStep>
      <WorkflowStep color="bg-[#fff7cf]" description="Review unbilled entries, select the work to include, and create an invoice." number={2} title="Build an Invoice"><InvoiceSelectionGraphic /></WorkflowStep>
      <WorkflowStep color="bg-[#e8e2f2]" description="Confirm the invoice, then send it to the client through the approved delivery channel." number={3} title="Send Invoice"><SendInvoiceGraphic /></WorkflowStep>
      <WorkflowStep color="bg-[#e6f1e8]" description="Post the received payment, choose its payment type, and record any approved write-off." number={4} title="Receive Payment"><PaymentGraphic /></WorkflowStep>
      <WorkflowStep color="bg-[#f2e9de]" description="Review the client’s posted activity, payments, write-offs, and ending balance." number={5} title="Review Statement"><StatementGraphic /></WorkflowStep>
    </div>
    <section className={STYLES.card} data-kr-element="billing-activity-definitions"><header className={`${LAYOUT_STYLES.definitionsHeader} ${STYLES.definitionsHeader}`}><h2 className="text-[11pt] font-bold text-[var(--kr-theme-text,#243142)]">Billing activity definitions</h2></header><div className={LAYOUT_STYLES.definitions}><div className={LAYOUT_STYLES.definitionItem}><p className={STYLES.definition}><strong>Time entry:</strong> Work recorded by a staff member with a date, description, activity category, duration, rate, and billing status.</p><p className={STYLES.definition}><strong>Fee entry:</strong> A flat-fee service or other non-hourly charge recorded to a client matter.</p><p className={STYLES.definition}><strong>Invoice:</strong> A client-facing request for payment that groups selected billable entries and can become locked after approval or delivery.</p><p className={STYLES.definition}><strong>Payment:</strong> Money received from the client and posted against an invoice or as an other-account payment.</p></div><div className={LAYOUT_STYLES.definitionItem}><p className={STYLES.definition}><strong>Write-off:</strong> An approved negative adjustment that reduces an invoice or client-account balance without representing a payment.</p><p className={STYLES.definition}><strong>Statement of account:</strong> The Billing Overview history showing invoices, payments, write-offs, trust transfers, and the running balance.</p><p className={STYLES.definition}><strong>Trust request:</strong> A request or expected funding event that changes the trust view’s requested balance but does not post received or dispersed funds.</p><p className={STYLES.definition}><strong>Disbursement:</strong> Trust funds paid to a vendor, the client, or toward an invoice.</p></div></div></section>
  </section>
}

