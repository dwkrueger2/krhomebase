// file: apps/web/components/ui/KRHomebaseLogo.tsx
// Ported from the old app (hb-components/KRHomebaseLogo.tsx).
/**
 * KRHomebaseLogo — the KR Homebase brand mark (arch, cross, K R) as a React
 * element, replacing the loose `/brand/logos/krhomebase-logo-*.svg` <img>.
 *
 * Variants:
 *   dark  — light strokes for a navy surface; preferred background #001e3a (default)
 *   light — navy strokes for a white surface; preferred background #ffffff
 * `withBackground` paints the preferred background behind the mark (rounded
 * tile), for places that do not already sit on it.
 *
 * Not ported yet: `renderKRHomebaseLogoSvg` (the same drawing as a plain SVG string for emails, OG
 * images and PDFs) and the email PNG. Port them from the old file when email work begins.
 */

export type KRHomebaseLogoVariant = 'dark' | 'light'

interface LogoPalette {
  background: string
  arch: string
  cross: string
  letters: string
}

const PALETTES: Record<KRHomebaseLogoVariant, LogoPalette> = {
  dark: { background: '#001e3a', arch: '#d7dee5', cross: '#f8fbff', letters: '#b8c7d4' },
  light: { background: '#ffffff', arch: '#0a4f9c', cross: '#00305b', letters: '#001e3a' },
}

/** Geometry (128 × 128 viewBox). */
const GEOMETRY = {
  arch: 'M29.6 120A52 52 0 1 1 98.4 120',
  cross: 'M58 8H70V42H102V54H70V120H58V54H26V42H58Z',
  k: ['M20 66V112', 'M22 87L44 67', 'M22 91L43 111'],
  r: ['M84 112V66H98A11 11 0 0 1 98 88H84', 'M97.5 92L110 112'],
} as const

export interface KRHomebaseLogoProps {
  /** Palette; `dark` (for navy surfaces) is the default. */
  variant?: KRHomebaseLogoVariant
  /** Rendered width and height in px; the mark is square. A width or height class on `className` overrides it. */
  size?: number
  /** Paints the variant's preferred background as a rounded tile behind the mark. */
  withBackground?: boolean
  className?: string
  /** Accessible name; omitted → decorative (aria-hidden). */
  title?: string
}

/** Renders the KR Homebase mark. */
export default function KRHomebaseLogo({ variant = 'dark', size = 42, withBackground = false, className, title }: KRHomebaseLogoProps) {
  const palette = PALETTES[variant]
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      data-kr-component="KRHomebaseLogo"
      data-kr-variant={variant}
      height={size}
      role={title ? 'img' : undefined}
      viewBox="0 0 128 128"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {withBackground ? <rect fill={palette.background} height="128" rx="18" width="128" /> : null}
      <defs>
        <clipPath id={`kr-logo-clip-${variant}`}>
          <rect height="118" width="128" x="0" y="0" />
        </clipPath>
      </defs>
      {/* Arch */}
      <path clipPath={`url(#kr-logo-clip-${variant})`} d={GEOMETRY.arch} fill="none" stroke={palette.arch} strokeWidth="3.5" />
      {/* Cross */}
      <path d={GEOMETRY.cross} fill={palette.cross} />
      {/* K and R */}
      <g fill="none" stroke={palette.letters} strokeLinecap="square" strokeWidth="8">
        {GEOMETRY.k.map((d) => <path d={d} key={d} />)}
        {GEOMETRY.r.map((d) => <path d={d} key={d} />)}
      </g>
    </svg>
  )
}
