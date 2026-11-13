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
 * The small utility icons (trash, pencil, copy, mail, map pin, print, preview, send, add, info square) are
 * `KRHomebaseIcons.<Name>` components, ported with Billing (plan stage 2).
 */

import type { ReactNode } from 'react'

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

export interface KRHomebaseUtilityIconProps {
  className?: string
  title?: string
}

interface UtilitySvgProps extends KRHomebaseUtilityIconProps {
  children: ReactNode
  height?: number
  strokeWidth?: number
  width?: number
}

function UtilitySvg({
  className,
  children,
  height = 12,
  strokeWidth = 1.8,
  title,
  width = 12,
}: UtilitySvgProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      focusable="false"
      height={height}
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={width}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

/** Wastebasket: delete / void a record. */
function TrashIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </UtilitySvg>
  )
}

/** Pencil glyph for row-level edit actions. */
function PencilIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </UtilitySvg>
  )
}

/** Copy glyph for compact copy-to-clipboard actions. */
function CopyIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </UtilitySvg>
  )
}

/** Envelope glyph for contact and communication metadata. */
function MailIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} height={14} strokeWidth={1.7} width={14}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </UtilitySvg>
  )
}

/** Map-pin glyph for address metadata. */
function MapPinIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} height={14} strokeWidth={1.7} width={14}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </UtilitySvg>
  )
}

/** Printer glyph for row-level "print this record" actions. */
function PrintIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} height={14} strokeWidth={1.8} width={14}>
      <path d="M6 9V4h12v5" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v6H6z" />
    </UtilitySvg>
  )
}

/** Eye glyph for preview/open-document actions. */
function PreviewIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} height={14} strokeWidth={1.8} width={14}>
      <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
      <circle cx="12" cy="12" r="2.25" />
    </UtilitySvg>
  )
}

/** Paper-plane glyph for row-level "send this record" actions. */
function SendIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} height={14} strokeWidth={1.8} width={14}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </UtilitySvg>
  )
}

/**
 * Rounded-square "i": inline help and detail tooltips (e.g. the refund ARN on
 * Posted Payments). Filled glyph on a 16×16 grid; size it with `className`
 * (defaults to 14px) and color it with `text-*` (currentColor).
 */
function InfoSquareIcon({ className, title }: KRHomebaseUtilityIconProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="currentColor"
      focusable="false"
      height={14}
      role={title ? 'img' : undefined}
      viewBox="0 0 16 16"
      width={14}
    >
      {title && <title>{title}</title>}
      <path
        clipRule="evenodd"
        d="M11 2.5H5A2.5 2.5 0 0 0 2.5 5v6A2.5 2.5 0 0 0 5 13.5h6a2.5 2.5 0 0 0 2.5-2.5V5A2.5 2.5 0 0 0 11 2.5ZM5 1a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V5a4 4 0 0 0-4-4H5Z"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M6.25 8A.75.75 0 0 1 7 7.25h1.25A.75.75 0 0 1 9 8v3.5a.75.75 0 0 1-1.5 0V8.75H7A.75.75 0 0 1 6.25 8Z"
        fillRule="evenodd"
      />
      <path d="M6.75 5a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" />
    </svg>
  )
}

/**
 * Disclosure chevron (added Nov 12, 2026): points down while a ledger, group or card is folded. The caller turns it over
 * when open with `rotate-180` and a 160ms transform transition, so the change reads as one movement.
 */
function ChevronIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2.4}>
      <path d="M6 9l6 6 6-6" />
    </UtilitySvg>
  )
}

/** Plus glyph for compact add actions. */
function AddIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </UtilitySvg>
  )
}

/** Closed padlock: lock application writes (Firm Settings → Data Import; replaces the old `[lock]` text marker). */
function LockIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <rect height="10" rx="1.5" width="14" x="5" y="11" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </UtilitySvg>
  )
}

/** Open padlock: unlock application writes (Firm Settings → Data Import; replaces the old `[unlock]` text marker). */
function UnlockIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <rect height="10" rx="1.5" width="14" x="5" y="11" />
      <path d="M8 11V7a4 4 0 0 1 7.75-1.4" />
    </UtilitySvg>
  )
}

/** A thin ×: close a dialog (GPT Model Gateway's Edit Model Connection dialog; replaces the old `×` text glyph). */
function CloseIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </UtilitySvg>
  )
}

/** An eye: hold to show a hidden value (GPT Model Gateway's API key field; the old inline `HoldToRevealIcon`). */
function EyeIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props}>
      <path d="M2.2 12s3.5-5.2 9.8-5.2S21.8 12 21.8 12 18.3 17.2 12 17.2 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </UtilitySvg>
  )
}

/** A lower-case i (dot and stem), drawn inside a round help badge (GPT Model Gateway's tooltips; replaces the old `i` text). */
function InfoLetterIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={3}>
      <path d="M12 5.5v.01" />
      <path d="M12 10.5v8" />
    </UtilitySvg>
  )
}

/** Telephone handset: the Phone Call activity type (Communications; replaces the old `☎` text glyph). */
function PhoneIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
    </UtilitySvg>
  )
}

/** A page with lines: the Note activity type (Communications; replaces the old `▤` text glyph). */
function NoteIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props}>
      <rect height="18" rx="2" width="16" x="4" y="3" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </UtilitySvg>
  )
}

/** A tick: the Task activity type (Communications; replaces the old `✓` text glyph). */
function CheckIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2.2}>
      <path d="M5 12.5 9.5 17 19 7" />
    </UtilitySvg>
  )
}

/** Arrow down onto a tray: the Received files activity type (Communications; replaces the old `⇩` text glyph). */
function DownloadIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M12 3v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </UtilitySvg>
  )
}

/** Arrow up from a tray: the Sent files activity type (Communications; replaces the old `⇧` text glyph). */
function UploadIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M12 15V4" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 20h14" />
    </UtilitySvg>
  )
}

/** A dashed circle: the Work in progress activity type (Communications; replaces the old `◌` text glyph). */
function ProgressIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
    </UtilitySvg>
  )
}

/** A turning arrow: reply to a communication entry (Communications; replaces the old `↩` text glyph). */
function ReplyIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v5" />
    </UtilitySvg>
  )
}

/** An arrow out of a box: open a linked document in a new window (Communications; replaces the old `↗` text glyph). */
function ExternalLinkIcon(props: KRHomebaseUtilityIconProps) {
  return (
    <UtilitySvg {...props} strokeWidth={2}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </UtilitySvg>
  )
}

/** Named utility components for JSX member notation alongside the name-based API. */
export const KRHomebaseIcons = {
  Add: AddIcon,
  Check: CheckIcon,
  Chevron: ChevronIcon,
  Close: CloseIcon,
  Copy: CopyIcon,
  Download: DownloadIcon,
  ExternalLink: ExternalLinkIcon,
  Eye: EyeIcon,
  InfoLetter: InfoLetterIcon,
  InfoDark: (props: KRHomebaseUtilityIconProps) => <KRHomebaseIcon name="info-dark" {...props} />,
  InfoSquare: InfoSquareIcon,
  Lock: LockIcon,
  Mail: MailIcon,
  MapPin: MapPinIcon,
  Note: NoteIcon,
  Pencil: PencilIcon,
  Phone: PhoneIcon,
  Print: PrintIcon,
  Preview: PreviewIcon,
  Progress: ProgressIcon,
  Reply: ReplyIcon,
  Send: SendIcon,
  Trash: TrashIcon,
  Unlock: UnlockIcon,
  Upload: UploadIcon,
  WarningOrange: (props: KRHomebaseUtilityIconProps) => (
    <KRHomebaseIcon name="warning-orange" {...props} />
  ),
  WarningRed: (props: KRHomebaseUtilityIconProps) => (
    <KRHomebaseIcon name="warning-red" {...props} />
  ),
  WarningYellow: (props: KRHomebaseUtilityIconProps) => (
    <KRHomebaseIcon name="warning-yellow" {...props} />
  ),
} as const
