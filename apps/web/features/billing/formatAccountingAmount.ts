// file: apps/web/features/billing/formatAccountingAmount.ts
/** Formats accounting amounts with a dollar sign, commas, and two decimals (old `KR-Billing/formatAccountingAmount.ts`). */
export function formatAccountingAmount(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
