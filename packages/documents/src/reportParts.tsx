// file: packages/documents/src/reportParts.tsx
/**
 * Pieces shared by every printable billing document — the outlined K&R mark,
 * the wordmark, the Stripe QR placeholder, the pay-method chips, and number
 * formatting. Layout-specific sections live in each template file so a
 * template can be read top to bottom.
 *
 * No 'use client' directive on purpose: these are pure presentational
 * components with no hooks or browser APIs, so the same code renders in the
 * browser (print view, samples) and on the server (`krInvoiceDocument.tsx`
 * renders the PDF markup with react-dom/server).
 *
 * Ported from the old `KR-Billing/Invoicing/invoiceReportShared.tsx` (Billing part 7b of `docs/API/Billing_Audit.md`).
 * The number formatters moved to `format.ts` in part 7a and are re-exported here under their old names. The
 * server render of the PDF is the API's (part 7c); the old `krInvoiceDocument.tsx` is named above as it was.
 */

export { formatHoursSuffix, formatMoney, formatMoneyOrDash, formatRateOrDash } from './format.ts'

const STYLES = {
  wordmark: 'whitespace-nowrap uppercase leading-none tracking-[0.14em] [font-family:var(--kr-print-font-display)]',
  qrFrame: 'flex items-center justify-center border border-[var(--kr-print-cream-line)] bg-white',
  qrInner: 'flex items-center justify-center bg-[var(--kr-print-navy-fill)]',
  qrLabel: 'text-center text-[6.4pt] font-semibold uppercase tracking-[0.12em] text-[var(--kr-print-cream)]',
  chip: 'px-[6pt] py-[2pt] rounded-full border border-[var(--kr-print-secondary-line)] text-[6.4pt] uppercase tracking-[0.06em] text-[var(--kr-print-chip)] whitespace-nowrap',
  payButton:
    'px-[12pt] py-[5pt] rounded-[3pt] bg-[var(--kr-print-navy-fill)] text-[7.9pt] font-semibold text-white whitespace-nowrap',
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
  chips: 'gap-x-[5pt] gap-y-[4pt] flex flex-wrap',
} as const

export interface FirmLogoMarkProps {
  /** Square size in points (template: 36.5pt). */
  sizePt?: number
  /** Outline and letter color. */
  color?: string
}

/** Outlined K&R square mark as drawn in the Template v1 letterheads (no fill). */
export function FirmLogoMark({ sizePt = 36.5, color = 'var(--kr-print-cream)' }: FirmLogoMarkProps) {
  return (
    <svg
      aria-label="Krueger & Richard mark"
      height={`${sizePt}pt`}
      role="img"
      viewBox="0 0 100 100"
      width={`${sizePt}pt`}
    >
      <rect fill="none" height="97.6" stroke={color} strokeWidth="2.4" width="97.6" x="1.2" y="1.2" />
      <text
        dominantBaseline="central"
        fill={color}
        fontFamily="'Black Mango', 'Helvetica Neue', Arial, sans-serif"
        fontSize="38"
        letterSpacing="-1"
        textAnchor="middle"
        x="50"
        y="52"
      >
        K&amp;R
      </text>
    </svg>
  )
}

export interface FirmWordmarkProps {
  /** Font size in points (Option 1 banner: 16.5; Option 2 lockup: 15). */
  sizePt: number
  /** Letter color. */
  color: string
  /** Ampersand accent color. */
  ampersandColor: string
}

/** "KRUEGER & RICHARD" in Black Mango with the accented ampersand. */
export function FirmWordmark({ sizePt, color, ampersandColor }: FirmWordmarkProps) {
  return (
    <span className={STYLES.wordmark} style={{ color, fontSize: `${sizePt}pt` }}>
      Krueger <span style={{ color: ampersandColor }}>&amp;</span> Richard
    </span>
  )
}

export interface QrPlaceholderProps {
  /** Framed size in points (template: 82pt frame, 72pt code). */
  sizePt?: number
  /** QR code image for the invoice's pay link (data: URI, SVG); omitted → the navy placeholder. */
  imageSrc?: string
}

/** Pay-link QR code (when `imageSrc` is given), or the placeholder square where it goes. */
export function QrPlaceholder({ sizePt = 82, imageSrc }: QrPlaceholderProps) {
  const inner = sizePt - 10
  if (imageSrc) {
    return (
      <div className={STYLES.qrFrame} data-kr-element="pay-online-qr" style={{ height: `${sizePt}pt`, width: `${sizePt}pt` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PDF markup, no Next image pipeline */}
        <img alt="QR code: scan to pay this invoice" src={imageSrc} style={{ display: 'block', height: `${inner}pt`, width: `${inner}pt` }} />
      </div>
    )
  }
  return (
    <div
      aria-label="QR code placeholder"
      className={STYLES.qrFrame}
      data-kr-element="pay-online-qr-placeholder"
      role="img"
      style={{ height: `${sizePt}pt`, width: `${sizePt}pt` }}
    >
      <div className={STYLES.qrInner} style={{ height: `${inner}pt`, width: `${inner}pt` }}>
        <span className={STYLES.qrLabel}>
          QR
          <br />
          Stripe
        </span>
      </div>
    </div>
  )
}

/** Navy "Pay …" button; a real link (clickable in the PDF and email) when `href` is given. */
export function PayButton({ label, href }: { label: string; href?: string }) {
  if (href) {
    return (
      <a className={STYLES.payButton} data-kr-element="pay-online-button" href={href}>
        {label}
      </a>
    )
  }
  return (
    <span className={STYLES.payButton} data-kr-element="pay-online-button">
      {label}
    </span>
  )
}

/** Payment-method chips row (default: Card, ACH bank transfer, Apple Pay, Google Pay). */
export function PayMethodChips({ methods = ['Card', 'ACH bank transfer', 'Apple Pay', 'Google Pay'] }: { methods?: readonly string[] }) {
  return (
    <div className={LAYOUT_STYLES.chips} data-kr-element="pay-online-methods">
      {methods.map((method) => (
        <span className={STYLES.chip} key={method}>
          {method}
        </span>
      ))}
    </div>
  )
}
