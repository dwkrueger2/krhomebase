'use client'
// file: apps/web/features/payment-providers/components/StripePaymentConfigurationPage.client.tsx
/**
 * Settings → Firm Settings → Stripe Payment Configuration (page id `stripe-payment-configuration`; super admin only).
 * Ported from the old `firm-settings/stripe-payment-configuration/StripePaymentConfigurationWorkspace.client.tsx`
 * (Settings plan, stage 6: "keep its entire style, layout, structure and functionality"); markup, classes and markers
 * unchanged.
 *
 * Changed from the old file: the component is exported as `StripePaymentConfigurationPage` (the Firm Settings page
 * placed by `app/page.tsx`); its root keeps `data-kr-id="StripePaymentConfigurationWorkspace"`. The browser does no
 * role check, as before; `app/page.tsx` places it for a super admin only and every route refuses anyone else.
 */

import { useState } from 'react'
import type { PaymentProviderConfig } from '@krhomebase/contracts'
import PaymentProviderConfigPanel from '@/features/payment-providers/components/PaymentProviderConfigPanel.client'
import StripeDevTestsWorkspace from '@/features/payment-providers/components/StripeDevTestsWorkspace.client'

const STYLES = {
  divider: 'border-t border-[var(--kr-theme-line,#d7dee5)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Layout: configuration cards first, sandbox tests below a divider. */
const LAYOUT_STYLES = {
  workspace: 'gap-3 grid',
  tests: 'pt-2',
} as const

/**
 * Settings → Firm Settings → **Stripe Payment Configuration** (Super Admin only).
 *
 * Row 1 — `PaymentProviderConfigPanel`: Live Configuration (left) and Sandbox
 * Configuration (right), stored in the `payment_provider` table. Secrets are
 * write-only; only their prefix and SHA-256 hash come back to the browser.
 *
 * Row 2 — `StripeDevTestsWorkspace`: card and ACH sandbox tests plus the
 * lookup/search boxes. They are enabled once the Sandbox configuration is
 * saved, enabled, and has keys.
 *
 * The page owns only the active sandbox profile, which the panel reports through `onSandboxChange`.
 *
 * @returns The Stripe Payment Configuration workspace.
 */
export function StripePaymentConfigurationPage() {
  const [sandbox, setSandbox] = useState<PaymentProviderConfig | null>(null)

  return (
    <div className={LAYOUT_STYLES.workspace} data-kr-id="StripePaymentConfigurationWorkspace" data-kr-component="StripePaymentConfigurationWorkspace" data-kr-element="stripe-payment-configuration-workspace">
      {/* Configuration row: Live left, Sandbox right. */}
      <PaymentProviderConfigPanel onSandboxChange={setSandbox} />

      {/* Sandbox tests row: card / ACH tests and queries against the Sandbox configuration. */}
      <div className={`${LAYOUT_STYLES.tests} ${STYLES.divider}`} data-kr-element="stripe-payment-configuration-tests-row">
        <StripeDevTestsWorkspace sandboxConfigured={Boolean(sandbox?.configured)} sandboxPublishableKey={sandbox?.publishableKey || null} />
      </div>
    </div>
  )
}

export default StripePaymentConfigurationPage
