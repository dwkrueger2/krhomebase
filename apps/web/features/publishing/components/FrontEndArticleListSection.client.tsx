'use client'
// file: apps/web/features/publishing/components/FrontEndArticleListSection.client.tsx
/**
 * The "Front End Article List" shell of Front End Publishing (plan 10, stage 6): the dark top bar (title, its line,
 * the busy spinner, Download articles, Upload Article and the fold caret) around the list, or the "List hidden" line
 * while folded.
 *
 * This is the old panel's `listShell` / `listTopbar` markup (`FrontEndPublishingPanel.client.tsx`), split out to keep
 * the panel file short; markers and wording unchanged. Changed: the download button is a 28px square (was a 28px
 * circle) with `KRHomebaseIcons.Download`; Upload's narrow-screen glyph is `KRHomebaseIcons.Upload` (was ⇪); the
 * caret is `KRHomebaseIcons.Chevron` (the old `CollapseButtonCaret` is not ported). Upload shows its full label from
 * 1024px, "Upload" from 768px and the icon below (the old breakpoints were 1023px and 639px).
 *
 * The panel owns every value and handler; the list itself comes in as `children`.
 */

import type { ReactNode } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  listShell: 'overflow-hidden rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  listTopbar: 'min-h-[34px] border-b border-(--kr-theme-line) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  listTitle: 'm-0 text-[13px] font-[850] leading-[1.1]',
  listNote: 'm-0 text-[11px] leading-[1.25] opacity-[0.82]',
  downloadButton:
    'size-[28px] p-0 inline-flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.34)] bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-accent) disabled:cursor-not-allowed disabled:opacity-50',
  uploadButton:
    'px-[9px] py-[3px] min-h-[26px] whitespace-nowrap rounded-[3px] border border-(--kr-theme-accent) bg-(--kr-theme-accent) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-accent-dark) disabled:cursor-not-allowed disabled:opacity-50',
  caret: 'size-[24px] p-0 inline-flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.34)] bg-transparent text-(color:--kr-theme-text-inverse) cursor-pointer',
  caretIcon: 'size-[12px] transition-transform duration-[160ms]',
  caretOpen: 'rotate-180',
  icon: 'size-[16px]',
  srOnly: 'sr-only',
  collapsed: 'm-0 text-[12px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  listTopbar: 'px-[8px] py-[5px] gap-[8px] flex flex-wrap items-center justify-between',
  listTitle: 'min-w-0 gap-[1px] grid',
  listActions: 'ml-auto gap-[6px] flex flex-none items-center',
  collapsed: 'p-[8px]',
  // The Upload button's three labels: the icon under 768px, "Upload" to 1023px, "Upload Article" from 1024px.
  uploadFull: 'hidden lg:inline',
  uploadCompact: 'hidden md:inline lg:hidden',
  uploadIcon: 'inline-flex md:hidden',
  uploadIconName: 'md:hidden',
} as const

export interface FrontEndArticleListSectionProps {
  /** The list (`PublishingQueueLedger`), drawn while not folded. */
  children: ReactNode
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Shows the spinner in the top bar: the list loads or an action runs. */
  busy: boolean
  busyLabel: string
  canDownload: boolean
  canUpload: boolean
  onDownload: () => void
  onUpload: () => void
}

/**
 * Renders the article list shell.
 *
 * @param props - The list as children, the fold state, the busy state and the Download and Upload handlers.
 * @returns The `FrontEndArticleListSection` section.
 */
export default function FrontEndArticleListSection({ busy, busyLabel, canDownload, canUpload, children, collapsed, onDownload, onToggleCollapsed, onUpload }: FrontEndArticleListSectionProps) {
  return (
    <section className={STYLES.listShell} data-kr-id="FrontEndArticleListSection">
      {/* List top bar: title, Download articles, Upload Article and the fold caret. */}
      <header className={`${LAYOUT_STYLES.listTopbar} ${STYLES.listTopbar}`}>
        <div className={LAYOUT_STYLES.listTitle}>
          <h3 className={STYLES.listTitle}>Front End Article List</h3>
          <p className={STYLES.listNote}>Upload a new Article or a new Answer Blog. Review, publish, unpublish, or remove items before visitors can see them.</p>
        </div>
        <div className={LAYOUT_STYLES.listActions} data-kr-component="FrontEndPublishingPanel" data-kr-element="create-actions" data-kr-id="FrontEndPublishingCreateActions">
          {busy ? <RainbowBusySpinner ariaLabel={busyLabel} busy hideWhenIdle={false} label="" size={13} /> : null}
          <button className={STYLES.downloadButton} data-kr-action="download-articles" disabled={!canDownload} title="Download saved Article and Answer ZIP packages" type="button" onClick={onDownload}>
            <KRHomebaseIcons.Download className={STYLES.icon} />
            <span className={STYLES.srOnly}>Download articles</span>
          </button>
          <button className={STYLES.uploadButton} data-kr-action="upload-article" disabled={!canUpload} title="Upload a new Article or a new Answer Blog" type="button" onClick={onUpload}>
            <span className={LAYOUT_STYLES.uploadFull}>Upload Article</span>
            <span className={LAYOUT_STYLES.uploadCompact}>Upload</span>
            <span aria-hidden="true" className={LAYOUT_STYLES.uploadIcon}>
              <KRHomebaseIcons.Upload className={STYLES.icon} />
            </span>
            <span className={`${LAYOUT_STYLES.uploadIconName} ${STYLES.srOnly}`}>Upload Article</span>
          </button>
          <button aria-expanded={!collapsed} aria-label={collapsed ? 'Expand Front End Article List' : 'Collapse Front End Article List'} className={STYLES.caret} title={collapsed ? 'Show article list' : 'Hide article list'} type="button" onClick={onToggleCollapsed}>
            <KRHomebaseIcons.Chevron className={`${STYLES.caretIcon} ${collapsed ? '' : STYLES.caretOpen}`} />
          </button>
        </div>
      </header>
      {collapsed ? <p className={`${LAYOUT_STYLES.collapsed} ${STYLES.collapsed}`}>List hidden. Use the caret to review existing articles and answers.</p> : children}
    </section>
  )
}
