'use client'
// file: apps/web/components/ui/KRHomebaseIcon.client.tsx
// Ported from the old app (hb-components/KRHomebaseIcon.client.tsx). Reorganized into one registry on Nov 15, 2026.
/**
 * KR Homebase icons: architecture
 * ===============================
 *
 * Every icon in KR Homebase's own screens is an inline SVG drawn from this file. There is no icon library and no
 * icon font. (An outside tool's own menu icon is drawn by `ToolSvgIcon.client.tsx` from the checked SVG the tool
 * serves; this file only supplies its fallback.)
 *
 * One entry point
 * ---------------
 *   import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
 *
 *   <KRHomebaseIcon name="trash" />                                     decorative (hidden from screen readers)
 *   <KRHomebaseIcon name="trash" className="size-[14px]" title="Delete" />  an image named "Delete"
 *   <KRHomebaseIcon name="warning-red" className="size-[16px]" />        a badge: always announces itself
 *
 * `name` is limited to the keys of `ICONS`, so editors autocomplete it and a typo fails the typecheck. A name that
 * slips through at runtime (untyped data) draws the KR monogram fallback (`MissingIconSvg`).
 *
 * The legacy shortcuts `KRHomebaseIcons.<Name>` (for example `<KRHomebaseIcons.Trash />`) are kept at the bottom
 * of the file so existing screens need no change. Each one only calls `KRHomebaseIcon`. Use the name form in new code.
 *
 * Where the definitions are
 * -------------------------
 * All definitions are in `ICONS`, below. Each entry is one complete icon, so a tweak touches one entry. Entries are
 * alphabetical within three sections, one for each kind of icon:
 *
 *   LINE ICONS  `kind: 'line'`   Outline icons (menu, row actions, activity types). Each entry holds its own
 *                                complete drawing (`body`: the <path>, <circle> and <rect> elements, written as an
 *                                .svg file would be) and any setting that differs from the defaults below.
 *                                Drawn by `LineSvg`.
 *   BADGES      `kind: 'badge'`  A filled triangle or circle with a mark (! or ?) in it: the status warnings and
 *                                the dark information mark. One shared drawing; each entry picks the shape, colors
 *                                and mark. Drawn by `BadgeSvg`.
 *   DISCS       `kind: 'disc'`   Front End Publishing's colored discs: a filled circle with a light glyph on a
 *                                50×50 grid. One shared drawing; each entry picks the tone and its glyph.
 *                                Drawn by `DiscSvg`.
 *
 * Line icon defaults: a 24×24 grid (`viewBox`), stroke `currentColor` at width 1.8, no fill, round caps and joins,
 * and no width or height attribute. Color a line icon with a `text-*` class and size it with `className`
 * (`size-[14px]`). `size` sets the width and height attributes for an icon that should keep a size when the caller
 * gives none.
 *
 * To add an icon: add an entry to the right section. Its key becomes a valid `name` at once. The names of the menu
 * icons are also stored data (`ToolIcon` in `packages/contracts/src/tools.ts`, a tool's fallback icon), so never
 * rename one; `KRHomebaseIcon.test.tsx` checks that every `ToolIcon` name has an entry.
 * To tweak one: change only its entry. The shape of every badge or every disc is changed once, in `BadgeSvg` or
 * `DiscSvg`.
 */

import type {ReactNode} from 'react'

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

/** An outline icon: its own drawing, plus any setting that differs from the line defaults (see the file comment). */
interface LineIconDef {
    kind: 'line'
    /** The drawing: the SVG elements inside `<svg>`, written as JSX. A per-element setting (a thicker stroke) goes here. */
    body: ReactNode
    /** Grid of the drawing. Default `0 0 24 24`. */
    viewBox?: string
    /** Width and height attributes, in pixels. Default: none (the caller sizes it with `className`). */
    size?: number
    /** Stroke color. Default `currentColor`. `none` for an icon drawn only with fills. */
    stroke?: string
    /** Stroke width on the 24×24 grid. Default 1.8. */
    strokeWidth?: number
    /** Fill color. Default `none`. */
    fill?: string
}

/** A filled shape with a mark in it. `BadgeSvg` draws it; the entry only picks the options. */
interface BadgeIconDef {
    kind: 'badge'
    /** The filled shape (see `BADGE_SHAPES`). */
    shape: keyof typeof BADGE_SHAPES
    /** The shape's color: a theme token with its fallback. */
    color: string
    /** The mark's color, chosen for contrast on `color`. */
    markColor: string
    /** The mark drawn in the shape. */
    mark: '!' | '?'
    /** Accessible name when the caller gives no `title`. A badge always announces itself. */
    label: string
}

/** A Front End Publishing disc. `DiscSvg` draws it; the entry picks the tone and the glyph. */
interface DiscIconDef {
    kind: 'disc'
    /** The disc's color (see `DISC_STYLES`). */
    tone: Exclude<keyof typeof DISC_STYLES, 'glyph'>
    /** The light glyph on the disc, on the 50×50 grid. Stroke width 2.5 unless an element sets its own. */
    glyph: ReactNode
}

type IconDef = LineIconDef | BadgeIconDef | DiscIconDef

/** What every drawing receives from `KRHomebaseIcon`. */
interface SvgProps {
    className?: string
    title?: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared drawings: one function for each kind of icon
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Accessibility attributes shared by line icons and discs: with a `title` the icon is an image with that name;
 * without one it is decoration and hidden from screen readers.
 */
function namedOrHidden(title: string | undefined) {
    return {
        'aria-hidden': title ? undefined : true,
        'aria-label': title,
        role: title ? 'img' : undefined,
    } as const
}

/** Draws a line icon: the defaults from the file comment, overridden by the entry's own settings. */
function LineSvg({def, className, title}: SvgProps & { def: LineIconDef }) {
    return (
        <svg
            {...namedOrHidden(title)}
            className={className}
            fill={def.fill ?? 'none'}
            focusable="false"
            height={def.size}
            stroke={def.stroke ?? 'currentColor'}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={def.strokeWidth ?? 1.8}
            viewBox={def.viewBox ?? '0 0 24 24'}
            width={def.size}
        >
            {title && <title>{title}</title>}
            {def.body}
        </svg>
    )
}

/**
 * The two badge shapes on the 24×24 grid, with where the mark sits in each. The mark is a bold Arial character, so
 * it inherits the caller's size without a second drawing.
 */
const BADGE_SHAPES = {
    triangle: {draw: (fill: string) => <path d="M12 2 22 21H2L12 2Z" fill={fill}/>, markSize: 12, markY: 14},
    circle: {draw: (fill: string) => <circle cx="12" cy="12" fill={fill} r="10"/>, markSize: 15, markY: 12},
} as const

/** Draws a badge: the filled shape in `color`, the mark centered on it. Always an image with a name. */
function BadgeSvg({def, className, title}: SvgProps & { def: BadgeIconDef }) {
    const label = title ?? def.label
    const shape = BADGE_SHAPES[def.shape]

    return (
        <svg aria-label={label} className={className} focusable="false" role="img" viewBox="0 0 24 24">
            <title>{label}</title>
            {shape.draw(def.color)}
            <text dominantBaseline="central" fill={def.markColor} fontFamily="Arial, sans-serif"
                  fontSize={shape.markSize} fontWeight="900" textAnchor="middle" x="12" y={shape.markY}>
                {def.mark}
            </text>
        </svg>
    )
}

/**
 * Disc colors, ported from the old `front-end-publishing/components/PublicationStatusIcon.tsx`. The old fixed colors
 * became theme tokens: published `--kr-theme-success` (was #2e7d32), archived `--kr-theme-brand-primary-active`
 * (was #1f6feb), draft `--kr-theme-text-muted` (was #9aa0a6), article `--kr-theme-teal` (was #0fb5ae) and answer
 * `--kr-theme-accent` (was #a8521c). `glyph` is the light outline drawn on every disc.
 */
const DISC_STYLES = {
    published: 'fill-(--kr-theme-success)',
    archived: 'fill-(--kr-theme-brand-primary-active)',
    draft: 'fill-(--kr-theme-text-muted)',
    article: 'fill-(--kr-theme-teal)',
    answer: 'fill-(--kr-theme-accent)',
    glyph: 'fill-none stroke-(--kr-theme-text-inverse)',
} as const

/**
 * Draws a disc (plan 10, stage 6): a filled circle (radius 22) on the old 50×50 grid in the entry's tone, and the
 * entry's glyph over it in a light 2.5 outline. 20px unless the caller sizes it with `className` (`size-[20px]`).
 */
function DiscSvg({def, className, title}: SvgProps & { def: DiscIconDef }) {
    return (
        <svg {...namedOrHidden(title)} className={className} focusable="false" height={20} strokeLinecap="round"
             strokeLinejoin="round" viewBox="0 0 50 50" width={20}>
            {title && <title>{title}</title>}
            <circle className={DISC_STYLES[def.tone]} cx="25" cy="25" r="22"/>
            <g className={DISC_STYLES.glyph} strokeWidth="2.5">
                {def.glyph}
            </g>
        </svg>
    )
}

/** The fallback for a name that is not in `ICONS` (untyped runtime data): the KR monogram, named after the missing icon. */
function MissingIconSvg({name, className}: { name: string; className?: string }) {
    const label = `icon file '${name}' not found`

    return (
        <svg aria-label={label} className={className} focusable="false" role="img" viewBox="0 0 24 24">
            <title>{label}</title>
            <rect fill="var(--theme-kr, var(--kr-theme-brand-primary, #00305b))" height="20" rx="4" width="20" x="2"
                  y="2"/>
            <text dominantBaseline="central" fill="#ffffff" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="900"
                  textAnchor="middle" x="12" y="12">
                {'KR'}
            </text>
        </svg>
    )
}

// ---------------------------------------------------------------------------------------------------------------------
// ICONS: every definition, alphabetical within each section
// ---------------------------------------------------------------------------------------------------------------------

const ICONS = {
    // ===== LINE ICONS (kind: 'line', drawn by LineSvg) =================================================================

    /** A ruled bank front: the Accounts menu item. */
    accounts: {
        kind: 'line',
        body: (
            <>
                <path d="M3 10h18"/>
                <path d="M5 10v9"/>
                <path d="M9 10v9"/>
                <path d="M15 10v9"/>
                <path d="M19 10v9"/>
                <path d="M4 21h16"/>
                <path d="M12 3 4 8h16l-8-5Z"/>
            </>
        ),
    },

    /** Plus glyph for compact add actions. */
    add: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M12 5v14"/>
                <path d="M5 12h14"/>
            </>
        ),
    },

    /** A clock with turning arrows: the Attendance menu item. */
    attendance: {
        kind: 'line',
        body: (
            <>
                <path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z"/>
                <path d="M12 7v5l3 2"/>
                <path d="M3 7v4h4"/>
                <path d="M21 17v-4h-4"/>
            </>
        ),
    },

    /** A receipt with a torn foot: the Billing menu item. */
    billing: {
        kind: 'line',
        body: (
            <>
                <path d="M7 3h10v18l-2-1.2L13 21l-2-1.2L9 21l-2-1.2L5 21V5a2 2 0 0 1 2-2Z"/>
                <path d="M9 8h6"/>
                <path d="M9 12h6"/>
                <path d="M9 16h4"/>
            </>
        ),
    },

    /** Camera glyph for taking a screenshot (Homebase Feedback, plan 12 stage F3). */
    camera: {
        kind: 'line',
        size: 14,
        body: (
            <>
                <path d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>
                <circle cx="12" cy="13" r="3.5"/>
            </>
        ),
    },

    /** A tick in the menu stroke (1.8). */
    check: {
        kind: 'line',
        body: <path d="M5 12.5 9.5 17 19 7"/>,
    },

    /** A heavier tick (2.2): the Task activity type (Communications; replaces the old `✓` text glyph). Legacy `KRHomebaseIcons.Check`. */
    'check-bold': {
        kind: 'line',
        size: 12,
        strokeWidth: 2.2,
        body: <path d="M5 12.5 9.5 17 19 7"/>,
    },

    /**
     * Disclosure chevron (added Nov 12, 2026): points down while a ledger, group or card is folded. The caller turns it
     * over when open with `rotate-180` and a 160ms transform transition, so the change reads as one movement.
     */
    chevron: {
        kind: 'line',
        size: 12,
        strokeWidth: 2.4,
        body: <path d="M6 9l6 6 6-6"/>,
    },

    /** A thin ×: close a dialog (GPT Model Gateway's Edit Model Connection dialog; replaces the old `×` text glyph). */
    close: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M6 6l12 12"/>
                <path d="M18 6L6 18"/>
            </>
        ),
    },

    /** A speech bubble with lines: the Communications menu item. */
    communications: {
        kind: 'line',
        body: (
            <>
                <path d="M4 5h16v10H8l-4 4V5Z"/>
                <path d="M8 9h8"/>
                <path d="M8 12h5"/>
            </>
        ),
    },

    /** A card index with tabs: the Contacts menu item. */
    contacts: {
        kind: 'line',
        body: (
            <>
                <path d="M7 5h10a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>
                <path d="M9 9h6"/>
                <path d="M9 13h6"/>
                <path d="M9 17h4"/>
                <path d="M4 8h2M4 12h2M4 16h2"/>
            </>
        ),
    },

    /** Copy glyph for compact copy-to-clipboard actions. */
    copy: {
        kind: 'line',
        size: 12,
        body: (
            <>
                <rect x="9" y="9" width="11" height="11" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </>
        ),
    },

    /** A house: the Dashboard menu item. */
    dashboard: {
        kind: 'line',
        body: (
            <>
                <path d="M3 10.5 12 3l9 7.5"/>
                <path d="M5 10v10h5v-6h4v6h5V10"/>
            </>
        ),
    },

    /** A folder: the Documents menu item. */
    documents: {
        kind: 'line',
        body: (
            <>
                <path d="M4 6h6l2 2h8v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/>
                <path d="M4 10h16"/>
            </>
        ),
    },

    /** Arrow down onto a tray, in the menu stroke (1.8). */
    download: {
        kind: 'line',
        body: (
            <>
                <path d="M12 3v11"/>
                <path d="M7 10l5 5 5-5"/>
                <path d="M5 20h14"/>
            </>
        ),
    },

    /** Arrow down onto a tray, heavier (2): the Received files activity type (Communications; replaces the old `⇩` text glyph). Legacy `KRHomebaseIcons.Download`. */
    'download-bold': {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M12 3v11"/>
                <path d="M7 10l5 5 5-5"/>
                <path d="M5 20h14"/>
            </>
        ),
    },

    /** An arrow out of a box: open a linked document in a new window (Communications; replaces the old `↗` text glyph). */
    'external-link': {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M14 4h6v6"/>
                <path d="M20 4 11 13"/>
                <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>
            </>
        ),
    },

    /** An eye: hold to show a hidden value (GPT Model Gateway's API key field; the old inline `HoldToRevealIcon`). */
    eye: {
        kind: 'line',
        size: 12,
        body: (
            <>
                <path d="M2.2 12s3.5-5.2 9.8-5.2S21.8 12 21.8 12 18.3 17.2 12 17.2 2.2 12 2.2 12Z"/>
                <circle cx="12" cy="12" r="2.6"/>
            </>
        ),
    },

    /** A speech bubble with an exclamation mark: send Homebase Feedback (the top bar's Feedback button, plan 12). */
    feedback: {
        kind: 'line',
        size: 12,
        body: (
            <>
                <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>
                <path d="M12 7.5v4"/>
                <path d="M12 14.2v.1"/>
            </>
        ),
    },

    /** A circled question mark. The mark is drawn heavier (2.6) than the circle. */
    info: {
        kind: 'line',
        body: (
            <>
                <path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z"/>
                <path d="M9.75 9a2.25 2.25 0 1 1 3.85 1.59c-.84.84-1.6 1.34-1.6 2.91" strokeWidth={2.6}/>
                <path d="M12 17h.01" strokeWidth={2.6}/>
            </>
        ),
    },

    /** A lower-case i (dot and stem), drawn inside a round help badge (GPT Model Gateway's tooltips; replaces the old `i` text). */
    'info-letter': {
        kind: 'line',
        size: 12,
        strokeWidth: 3,
        body: (
            <>
                <path d="M12 5.5v.01"/>
                <path d="M12 10.5v8"/>
            </>
        ),
    },

    /**
     * Rounded-square "i": inline help and detail tooltips (e.g. the refund ARN on Posted Payments). A filled glyph on a
     * 16×16 grid with no stroke; color it with `text-*` (currentColor).
     */
    'info-square': {
        kind: 'line',
        viewBox: '0 0 16 16',
        size: 14,
        stroke: 'none',
        fill: 'currentColor',
        body: (
            <>
                <path
                    clipRule="evenodd"
                    d="M11 2.5H5A2.5 2.5 0 0 0 2.5 5v6A2.5 2.5 0 0 0 5 13.5h6a2.5 2.5 0 0 0 2.5-2.5V5A2.5 2.5 0 0 0 11 2.5ZM5 1a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V5a4 4 0 0 0-4-4H5Z"
                    fillRule="evenodd"
                />
                <path clipRule="evenodd"
                      d="M6.25 8A.75.75 0 0 1 7 7.25h1.25A.75.75 0 0 1 9 8v3.5a.75.75 0 0 1-1.5 0V8.75H7A.75.75 0 0 1 6.25 8Z"
                      fillRule="evenodd"/>
                <path d="M6.75 5a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z"/>
            </>
        ),
    },

    /** A clipboard with a corner tag: the Leads menu item. */
    leads: {
        kind: 'line',
        body: (
            <>
                <path d="M7 4h10a2 2 0 0 1 2 2v14l-4-3H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>
                <path d="M9 9h6"/>
                <path d="M9 13h4"/>
                <path d="M7 20l2-3"/>
            </>
        ),
    },

    /** Closed padlock: lock application writes (Firm Settings → Data Import; replaces the old `[lock]` text marker). */
    lock: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <rect height="10" rx="1.5" width="14" x="5" y="11"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            </>
        ),
    },

    /** Envelope glyph for contact and communication metadata. */
    mail: {
        kind: 'line',
        size: 14,
        strokeWidth: 1.7,
        body: (
            <>
                <rect x="3" y="5" width="18" height="14" rx="2"/>
                <path d="M3 7l9 6 9-6"/>
            </>
        ),
    },

    /** Map-pin glyph for address metadata. */
    'map-pin': {
        kind: 'line',
        size: 14,
        strokeWidth: 1.7,
        body: (
            <>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
            </>
        ),
    },

    /** A briefcase: the Matters menu item. */
    matters: {
        kind: 'line',
        body: (
            <>
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"/>
                <path d="M4 13h16"/>
            </>
        ),
    },

    /** A page with lines: the Note activity type (Communications; replaces the old `▤` text glyph). */
    note: {
        kind: 'line',
        size: 12,
        body: (
            <>
                <rect height="18" rx="2" width="16" x="4" y="3"/>
                <path d="M8 8h8"/>
                <path d="M8 12h8"/>
                <path d="M8 16h5"/>
            </>
        ),
    },

    /** A square of corner marks around a dot: outline an element on the page (Homebase Feedback marker chips, plan 12). */
    'outline-target': {
        kind: 'line',
        size: 12,
        body: (
            <>
                <path d="M4 9V4h5"/>
                <path d="M15 4h5v5"/>
                <path d="M20 15v5h-5"/>
                <path d="M9 20H4v-5"/>
                <circle cx="12" cy="12" r="2"/>
            </>
        ),
    },

    /** Pencil glyph for row-level edit actions. */
    pencil: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </>
        ),
    },

    /** Telephone handset: the Phone Call activity type (Communications; replaces the old `☎` text glyph). */
    phone: {
        kind: 'line',
        size: 12,
        body: (
            <path
                d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>
        ),
    },

    /** Eye glyph for preview/open-document actions. */
    preview: {
        kind: 'line',
        size: 14,
        body: (
            <>
                <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"/>
                <circle cx="12" cy="12" r="2.25"/>
            </>
        ),
    },

    /** Printer glyph for row-level "print this record" actions. */
    print: {
        kind: 'line',
        size: 14,
        body: (
            <>
                <path d="M6 9V4h12v5"/>
                <rect x="3" y="9" width="18" height="8" rx="2"/>
                <path d="M6 14h12v6H6z"/>
            </>
        ),
    },

    /** A dashed circle: the Work in progress activity type (Communications; replaces the old `◌` text glyph). */
    progress: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: <circle cx="12" cy="12" r="8" strokeDasharray="3 3"/>,
    },

    /** A turning arrow: reply to a communication entry (Communications; replaces the old `↩` text glyph). */
    reply: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M9 14 4 9l5-5"/>
                <path d="M4 9h10a6 6 0 0 1 6 6v5"/>
            </>
        ),
    },

    /** A bar chart: the Reports menu item. */
    reports: {
        kind: 'line',
        body: (
            <>
                <path d="M5 19V9"/>
                <path d="M12 19V5"/>
                <path d="M19 19v-7"/>
                <path d="M4 19h16"/>
            </>
        ),
    },

    /** Two heavy lines meeting in a point: a compact "send" mark in the menu set. */
    send: {
        kind: 'line',
        strokeWidth: 2.6,
        body: (
            <>
                <path d="M7 8.5l10 3.5"/>
                <path d="M7 15.5l10-3.5"/>
            </>
        ),
    },

    /** Paper-plane glyph for row-level "send this record" actions. Legacy `KRHomebaseIcons.Send`. */
    'send-plane': {
        kind: 'line',
        size: 14,
        body: (
            <>
                <path d="M22 2 11 13"/>
                <path d="M22 2 15 22l-4-9-9-4 20-7z"/>
            </>
        ),
    },

    /** A sun-like gear (a circle with eight spokes): the Settings menu item. */
    settings: {
        kind: 'line',
        body: (
            <>
                <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>
                <path d="M12 2v3"/>
                <path d="M12 19v3"/>
                <path d="M4.93 4.93l2.12 2.12"/>
                <path d="M16.95 16.95l2.12 2.12"/>
                <path d="M2 12h3"/>
                <path d="M19 12h3"/>
                <path d="M4.93 19.07l2.12-2.12"/>
                <path d="M16.95 7.05l2.12-2.12"/>
            </>
        ),
    },

    /** A checklist: the Tasks menu item. */
    tasks: {
        kind: 'line',
        body: (
            <>
                <path d="M8 6h12"/>
                <path d="M8 12h12"/>
                <path d="M8 18h12"/>
                <path d="M4 6l1 1 2-2"/>
                <path d="M4 12l1 1 2-2"/>
                <path d="M4 18l1 1 2-2"/>
            </>
        ),
    },

    /**
     * The default icon of an outside tool that serves none of its own (docs/05_Outside_Tools.md): an orange diamond
     * (a rounded square turned 45 degrees) with a white T, on a 64×64 grid, filled only, no stroke. Signal Orange
     * (--kr-theme-orange) makes outside tools stand apart in the menu (the requester, Nov 14, 2026; the T added
     * Nov 15, 2026).
     */
    tool: {
        kind: 'line',
        viewBox: '0 0 64 64',
        stroke: 'none',
        body: (
            <>
                <rect x="10" y="10" width="44" height="44" rx="4" transform="rotate(45 32 32)" fill="var(--kr-theme-orange, #e45e25)"/>
                <path d="M16 18h32v9H36v22h-8V27H16z" fill="#ffffff"/>
            </>
        ),
    },

    /** Wastebasket: delete / void a record. */
    trash: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M3 6h18"/>
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
            </>
        ),
    },

    /** Curved arrow back: undo the last step (the Homebase Feedback annotation editor, plan 12 stage F3). */
    undo: {
        kind: 'line',
        size: 14,
        body: (
            <>
                <path d="M9 14 4 9l5-5"/>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
            </>
        ),
    },

    /** Open padlock: unlock application writes (Firm Settings → Data Import; replaces the old `[unlock]` text marker). */
    unlock: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <rect height="10" rx="1.5" width="14" x="5" y="11"/>
                <path d="M8 11V7a4 4 0 0 1 7.75-1.4"/>
            </>
        ),
    },

    /** Arrow up from a tray: the Sent files activity type (Communications; replaces the old `⇧` text glyph). */
    upload: {
        kind: 'line',
        size: 12,
        strokeWidth: 2,
        body: (
            <>
                <path d="M12 15V4"/>
                <path d="M7 8l5-5 5 5"/>
                <path d="M5 20h14"/>
            </>
        ),
    },

    /** An outlined triangle with an exclamation mark, in the caller's color. The filled versions are badges below. */
    warning: {
        kind: 'line',
        body: (
            <>
                <path d="M12 3 2.75 20h18.5L12 3Z"/>
                <path d="M12 9v5"/>
                <path d="M12 17h.01"/>
            </>
        ),
    },

    // ===== BADGES (kind: 'badge', drawn by BadgeSvg) ===================================================================

    /** A brand-blue disc with a white question mark: dark information. */
    'info-dark': {
        kind: 'badge',
        shape: 'circle',
        color: 'var(--theme-kr, var(--kr-theme-brand-primary, #00305b))',
        markColor: '#ffffff',
        mark: '?',
        label: 'Dark information',
    },

    /** Orange warning triangle with a white !. */
    'warning-orange': {
        kind: 'badge',
        shape: 'triangle',
        color: 'var(--kr-theme-warning, var(--theme-kr-warning, #e45e25))',
        markColor: '#ffffff',
        mark: '!',
        label: 'Orange warning',
    },

    /** Red warning triangle with a white !. */
    'warning-red': {
        kind: 'badge',
        shape: 'triangle',
        color: 'var(--kr-theme-danger, var(--theme-kr-danger, #b42318))',
        markColor: '#ffffff',
        mark: '!',
        label: 'Red warning',
    },

    /** Yellow warning triangle with a dark ! (white does not read on yellow). */
    'warning-yellow': {
        kind: 'badge',
        shape: 'triangle',
        color: 'var(--kr-theme-warning-yellow, var(--theme-kr-warning-yellow, #eab308))',
        markColor: '#243142',
        mark: '!',
        label: 'Yellow warning',
    },

    // ===== DISCS (kind: 'disc', drawn by DiscSvg) ======================================================================

    /** Answer: a speech bubble with a tick on the camel disc. */
    'content-answer': {
        kind: 'disc',
        tone: 'answer',
        glyph: (
            <>
                <path d="M14 16 L36 16 L36 31 L26 31 L20 36.5 L20 31 L14 31 Z"/>
                <path d="M20 23.5 L24 27.5 L31 19.5"/>
            </>
        ),
    },

    /** Article: a page with lines on the teal disc. */
    'content-article': {
        kind: 'disc',
        tone: 'article',
        glyph: (
            <>
                <path d="M17 14 L29 14 L34 19 L34 36 L17 36 Z"/>
                <path d="M29 14 L29 19 L34 19"/>
                <line x1="21" y1="24" x2="30" y2="24" strokeWidth="2.2"/>
                <line x1="21" y1="28.5" x2="30" y2="28.5" strokeWidth="2.2"/>
                <line x1="21" y1="33" x2="26.5" y2="33" strokeWidth="2.2"/>
            </>
        ),
    },

    /** Archived (taken down): a filing box on the blue disc. */
    'publication-archived': {
        kind: 'disc',
        tone: 'archived',
        glyph: (
            <>
                <rect x="14" y="18" width="22" height="6" rx="1.5"/>
                <path d="M16 24 L16 34 L34 34 L34 24"/>
                <line x1="21" y1="28" x2="29" y2="28"/>
            </>
        ),
    },

    /** Draft: a pencil on the gray disc. */
    'publication-draft': {
        kind: 'disc',
        tone: 'draft',
        glyph: (
            <>
                <path d="M18 32 L18 27 L29.5 15.5 L34 20 L22.5 31.5 Z"/>
                <line x1="27" y1="18" x2="31.5" y2="22.5"/>
            </>
        ),
    },

    /** Published: a tick on the success disc. */
    'publication-published': {
        kind: 'disc',
        tone: 'published',
        glyph: <path d="M16 25.5 L22 31.5 L34 18.5" strokeWidth="3.5"/>,
    },
} satisfies Record<string, IconDef>

// ---------------------------------------------------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------------------------------------------------

/** Every icon name: the keys of `ICONS`. A typo fails the typecheck. */
export type KRHomebaseIconName = keyof typeof ICONS

export interface KRHomebaseIconProps {
    /**
     * Icon to draw. Limited to `KRHomebaseIconName`, so editors autocomplete the available icons and a typo fails the
     * typecheck. A value that slips through at runtime (untyped data) still gets the KR monogram fallback.
     */
    name: KRHomebaseIconName
    /** Size and color classes (`size-[14px] text-(--kr-theme-text-muted)`). */
    className?: string
    /** Accessible name. With one the icon is an image; without one it is decoration (badges always announce themselves). */
    title?: string
}

/** Every icon name, for tests and pickers. */
export const KR_HOMEBASE_ICON_NAMES = Object.keys(ICONS) as KRHomebaseIconName[]

/**
 * Draws a KR Homebase icon by name: looks the name up in `ICONS` and hands the entry to the drawing for its kind.
 *
 * @param props - Icon name and optional class and title.
 * @returns An inline SVG element, or the KR monogram fallback for an unknown runtime name.
 */
export default function KRHomebaseIcon({name, className, title}: KRHomebaseIconProps) {
    const def = (ICONS as Partial<Record<string, IconDef>>)[name]
    if (!def) return <MissingIconSvg name={name} className={className}/>

    switch (def.kind) {
        case 'line':
            return <LineSvg def={def} className={className} title={title}/>
        case 'badge':
            return <BadgeSvg def={def} className={className} title={title}/>
        case 'disc':
            return <DiscSvg def={def} className={className} title={title}/>
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Legacy shortcuts: KRHomebaseIcons.<Name> calls KRHomebaseIcon. Kept so existing screens need no change.
// ---------------------------------------------------------------------------------------------------------------------

export interface KRHomebaseUtilityIconProps {
    className?: string
    title?: string
}

/** Makes the legacy component for one icon name. */
function legacyIcon(name: KRHomebaseIconName) {
    function LegacyIcon(props: KRHomebaseUtilityIconProps) {
        return <KRHomebaseIcon name={name} {...props} />
    }

    LegacyIcon.displayName = `KRHomebaseIcons(${name})`
    return LegacyIcon
}

/** Legacy member names (`<KRHomebaseIcons.Trash />`). Prefer `<KRHomebaseIcon name="trash" />` in new code. */
export const KRHomebaseIcons = {
    Add: legacyIcon('add'),
    Camera: legacyIcon('camera'),
    Check: legacyIcon('check-bold'),
    Chevron: legacyIcon('chevron'),
    Close: legacyIcon('close'),
    ContentAnswer: legacyIcon('content-answer'),
    ContentArticle: legacyIcon('content-article'),
    Copy: legacyIcon('copy'),
    Download: legacyIcon('download-bold'),
    ExternalLink: legacyIcon('external-link'),
    Eye: legacyIcon('eye'),
    Feedback: legacyIcon('feedback'),
    InfoLetter: legacyIcon('info-letter'),
    InfoDark: legacyIcon('info-dark'),
    InfoSquare: legacyIcon('info-square'),
    Lock: legacyIcon('lock'),
    Mail: legacyIcon('mail'),
    MapPin: legacyIcon('map-pin'),
    Note: legacyIcon('note'),
    OutlineTarget: legacyIcon('outline-target'),
    Pencil: legacyIcon('pencil'),
    Phone: legacyIcon('phone'),
    Print: legacyIcon('print'),
    Preview: legacyIcon('preview'),
    Progress: legacyIcon('progress'),
    PublicationArchived: legacyIcon('publication-archived'),
    PublicationDraft: legacyIcon('publication-draft'),
    PublicationPublished: legacyIcon('publication-published'),
    Reply: legacyIcon('reply'),
    Send: legacyIcon('send-plane'),
    Trash: legacyIcon('trash'),
    Undo: legacyIcon('undo'),
    Unlock: legacyIcon('unlock'),
    Upload: legacyIcon('upload'),
    WarningOrange: legacyIcon('warning-orange'),
    WarningRed: legacyIcon('warning-red'),
    WarningYellow: legacyIcon('warning-yellow'),
} as const
