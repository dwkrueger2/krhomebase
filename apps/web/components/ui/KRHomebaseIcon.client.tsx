'use client'
// file: apps/web/components/ui/KRHomebaseIcon.client.tsx
// Ported from the old app (hb-components/KRHomebaseIcon.client.tsx).
/**
 * Inline SVG icon set for the KR Homebase shell and compact status marks.
 *
 * Navigation icons use currentColor so the left panel and mobile navigation
 * can color them through ordinary Tailwind text classes. Status variants use
 * theme-aware fills and text glyphs without importing an icon library or
 * relying on Font Awesome availability.
 *
 * Not ported yet: the small utility icons (trash, pencil, copy, mail, map pin, print, preview,
 * send, add, info square). Port each one from the old file when the first screen needs it.
 */

/** Every icon name this file can draw. A typo fails the typecheck. */
export type KRHomebaseIconName =
  | 'dashboard'
  | 'leads'
  | 'contacts'
  | 'matters'
  | 'billing'
  | 'tasks'
  | 'accounts'
  | 'documents'
  | 'communications'
  | 'send'
  | 'download'
  | 'check'
  | 'info'
  | 'info-dark'
  | 'warning'
  | 'warning-red'
  | 'warning-orange'
  | 'warning-yellow'
  | 'reports'
  | 'settings'
  | 'attendance'

export interface KRHomebaseIconProps {
  /**
   * Icon to draw. Limited to `KRHomebaseIconName`, so editors autocomplete the available icons
   * and a typo fails the typecheck. A value that slips through at runtime (untyped data) still
   * gets the KR monogram fallback.
   */
  name: KRHomebaseIconName
  className?: string
  title?: string
}

/** Icons drawn by `renderStatusIcon` (filled glyphs) rather than stroke paths. */
type KRHomebaseStatusIconName = 'info-dark' | 'warning-red' | 'warning-orange' | 'warning-yellow'

/** Stroke paths for every non-status icon; a name added to `KRHomebaseIconName` without paths fails the typecheck. */
const iconPaths: Record<Exclude<KRHomebaseIconName, KRHomebaseStatusIconName>, string[]> = {
  dashboard: ['M3 10.5 12 3l9 7.5', 'M5 10v10h5v-6h4v6h5V10'],
  leads: ['M7 4h10a2 2 0 0 1 2 2v14l-4-3H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M9 9h6', 'M9 13h4', 'M7 20l2-3'],
  contacts: ['M7 5h10a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M9 9h6', 'M9 13h6', 'M9 17h4', 'M4 8h2M4 12h2M4 16h2'],
  matters: ['M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z', 'M4 13h16'],
  billing: ['M7 3h10v18l-2-1.2L13 21l-2-1.2L9 21l-2-1.2L5 21V5a2 2 0 0 1 2-2Z', 'M9 8h6', 'M9 12h6', 'M9 16h4'],
  tasks: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6l1 1 2-2', 'M4 12l1 1 2-2', 'M4 18l1 1 2-2'],
  accounts: ['M3 10h18', 'M5 10v9', 'M9 10v9', 'M15 10v9', 'M19 10v9', 'M4 21h16', 'M12 3 4 8h16l-8-5Z'],
  documents: ['M4 6h6l2 2h8v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z', 'M4 10h16'],
  communications: ['M4 5h16v10H8l-4 4V5Z', 'M8 9h8', 'M8 12h5'],
  send: ['M7 8.5l10 3.5', 'M7 15.5l10-3.5'],
  download: ['M12 3v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  check: ['M5 12.5 9.5 17 19 7'],
  info: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M9.75 9a2.25 2.25 0 1 1 3.85 1.59c-.84.84-1.6 1.34-1.6 2.91', 'M12 17h.01'],
  warning: ['M12 3 2.75 20h18.5L12 3Z', 'M12 9v5', 'M12 17h.01'],
  reports: ['M5 19V9', 'M12 19V5', 'M19 19v-7', 'M4 19h16'],
  settings: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    'M12 2v3',
    'M12 19v3',
    'M4.93 4.93l2.12 2.12',
    'M16.95 16.95l2.12 2.12',
    'M2 12h3',
    'M19 12h3',
    'M4.93 19.07l2.12-2.12',
    'M16.95 7.05l2.12-2.12',
  ],
  attendance: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M12 7v5l3 2', 'M3 7v4h4', 'M21 17v-4h-4'],
}

const warningIconNames = new Set<string>(['warning-red', 'warning-orange', 'warning-yellow'])

const warningIconColors: Record<string, { background: string; foreground: string }> = {
  'warning-red': {
    background: 'var(--kr-theme-danger, var(--theme-kr-danger, #b42318))',
    foreground: '#ffffff',
  },
  'warning-orange': {
    background: 'var(--kr-theme-warning, var(--theme-kr-warning, #d97706))',
    foreground: '#ffffff',
  },
  'warning-yellow': {
    background: 'var(--kr-theme-warning-yellow, var(--theme-kr-warning-yellow, #eab308))',
    foreground: '#243142',
  },
}

/** Render theme-colored status variants that are not part of the path registry. */
function renderStatusIcon(name: string, className?: string, title?: string) {
  const warningColor = warningIconColors[name]
  const label = title ?? (warningColor ? `${name.replace('-', ' ')} warning` : 'Dark information')
  const background = warningColor?.background ?? 'var(--theme-kr, var(--kr-theme-brand-primary, #00305b))'
  const foreground = warningColor?.foreground ?? '#ffffff'

  return (
    <svg aria-label={label} className={className} focusable="false" role="img" viewBox="0 0 24 24">
      <title>{label}</title>
      {warningColor ? (
        <>
          <path d="M12 2 22 21H2L12 2Z" fill={background} />
          <text dominantBaseline="central" fill={foreground} fontFamily="Arial, sans-serif" fontSize="12" fontWeight="900" textAnchor="middle" x="12" y="14">
            {'!'}
          </text>
        </>
      ) : (
        <>
          <circle cx="12" cy="12" fill={background} r="10" />
          <text dominantBaseline="central" fill={foreground} fontFamily="Arial, sans-serif" fontSize="15" fontWeight="900" textAnchor="middle" x="12" y="12">
            {'?'}
          </text>
        </>
      )}
    </svg>
  )
}

/** Render an accessible fallback for an unsafe runtime icon name. */
function renderMissingIcon(name: string, className?: string) {
  const label = `icon file '${name}' not found`

  return (
    <svg aria-label={label} className={className} focusable="false" role="img" viewBox="0 0 24 24">
      <title>{label}</title>
      <rect fill="var(--theme-kr, var(--kr-theme-brand-primary, #00305b))" height="20" rx="4" width="20" x="2" y="2" />
      <text dominantBaseline="central" fill="#ffffff" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="900" textAnchor="middle" x="12" y="12">
        {'KR'}
      </text>
    </svg>
  )
}

/**
 * Renders a KR Homebase navigation or status icon.
 *
 * Known status icons use small inline SVG text glyphs so they inherit the
 * caller's sizing. Unknown runtime names return the KR monogram fallback and
 * expose the missing icon name through the accessible title.
 *
 * @param props - Icon name and optional class/title metadata.
 * @returns Inline SVG element using currentColor or the requested status treatment.
 */
export default function KRHomebaseIcon({ name, className, title }: KRHomebaseIconProps) {
  if (name === 'info-dark' || warningIconNames.has(name)) {
    return renderStatusIcon(name, className, title)
  }

  const paths = (iconPaths as Partial<Record<string, string[]>>)[name]
  if (!paths) return renderMissingIcon(name, className)

  const strokeWidth = name === 'send' ? 2.6 : 1.8

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title ? title : name ? 'icon-' + name : 'icon'}
      className={className}
      fill="none"
      focusable="false"
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
    >
      {title && <title>{title}</title>}
      {paths.map((d, index) => (
        <path d={d} key={d} strokeWidth={name === 'info' && index > 0 ? 2.6 : strokeWidth} />
      ))}
    </svg>
  )
}
