'use client'
// file: apps/web/features/publishing/components/PublicationPreviewPanel.client.tsx
/**
 * Full-content and thumbnail/card preview panel for Articles and Answers (plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/PublicationPreviewPanel.client.tsx`. Kept: the "Preview" card
 * and its note, the hide caret, the two tabs ("Rendered page preview", "Article card preview") with the status disc
 * on the right, the Canonical / SEO title / Sanitizer removed boxes, the full page in a sandboxed frame
 * (`ArticleHtmlPreviewFrame`), and the article and answer card previews with their wording.
 *
 * Changed:
 *  - The page loads the article stylesheet and images through the API's draft asset route (`stylesheetUrl` and the
 *    image addresses the API put in the text); the old frame had no stylesheet (point 1 of the as-is record).
 *  - The article card preview used the public site's global `fe-article-card` classes, which this app does not load;
 *    it is drawn here with the old CSS module's card rules (`articleCardPreview`, `thumbnailBox`, `cardPreviewMeta`,
 *    `cardPreviewTitle`) as Tailwind classes. Its type sizes copy the public card, not the Density Contract.
 *  - The status disc is 28px (was 50px) so the tab row stays within the contract's 28px button height. The caret is
 *    `KRHomebaseIcons.Chevron` (the old `CollapseButtonCaret` is not ported).
 *
 * State: only the tab. The panel owns the item, the draft and the preview text.
 */

import type { PublishingItem } from '@krhomebase/contracts'
import { useState } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { formatShortDate, type PublishingDraft } from '../publishingRows'
import type { SanitizedHtmlResult } from '../sanitizeArticleHtml.client'
import ArticleHtmlPreviewFrame from './ArticleHtmlPreviewFrame.client'
import PublicationStatusIcon from './PublicationStatusIcon.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  caret: 'size-[24px] p-0 inline-flex items-center justify-center rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-brand-primary) cursor-pointer hover:border-(--kr-theme-accent)',
  caretIcon: 'size-[12px] rotate-180 transition-transform duration-[160ms]',
  tab: 'px-[9px] py-[3px] min-h-[26px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-[12px] font-[850] text-(color:--kr-theme-text) cursor-pointer',
  tabActive: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  metaBox: 'border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] text-(color:--kr-theme-text-muted)',
  metaLabel: 'text-[10px] uppercase tracking-[0.04em] text-(color:--kr-theme-text)',
  metaValue: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  line: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  cardFrame: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  thumb: 'overflow-hidden border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] text-(color:--kr-theme-text-muted)',
  thumbImage: 'block h-full w-full object-cover',
  cardMeta: 'm-0 text-[10px] font-[900] uppercase leading-[1.2] tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  cardTitle: 'm-0 font-(family-name:--kr-theme-font-display) text-[22px] leading-[1.05] text-(color:--kr-theme-text)',
  cardSummary: 'm-0 text-[13px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  answerDot: 'size-[12px] rounded-full bg-(--kr-theme-brand-primary)',
  answerTitle: 'm-0 text-[18px] font-[850] leading-[1.15] text-(color:--kr-theme-text)',
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
  tabs: 'gap-[6px] flex flex-wrap items-center',
  statusIcon: 'ml-auto',
  metaGrid: 'gap-[5px] grid md:grid-cols-3',
  metaBox: 'px-[6px] py-[3px] gap-[2px] grid min-w-0',
  cardFrame: 'p-[8px] gap-[8px] grid',
  card: 'p-[10px] gap-[7px] grid max-w-[420px]',
  thumb: 'flex aspect-video items-center justify-center',
  answerCard: 'p-[10px] gap-[7px] grid max-w-[420px] grid-cols-[auto_minmax(0,1fr)] items-start',
  answerDot: 'mt-[4px]',
  answerBody: 'gap-[4px] grid',
} as const

export interface PublicationPreviewPanelProps {
  item: PublishingItem | null
  draft: PublishingDraft
  sanitizerResult: SanitizedHtmlResult
  /** Shows the caret that hides the preview column. */
  collapsible?: boolean
  onToggleCollapsed?: () => void
}

/** The public article card as the website draws it: thumbnail, category and reading time, title, teaser, date. */
function ArticleCardPreview({ draft, item }: { draft: PublishingDraft; item: PublishingItem | null }) {
  const publishedAt = item?.publishedAt || item?.updatedAt
  const readingMinutes = draft.readingTimeMinutes || (item?.readingTimeMinutes ? String(item.readingTimeMinutes) : '')
  return (
    <article className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-id="ArticleThumbnailCardPreview">
      <div className={`${LAYOUT_STYLES.thumb} ${STYLES.thumb}`}>
        {item?.thumbnailUrl ? <img alt={draft.thumbnailAlt || 'Article thumbnail preview'} className={STYLES.thumbImage} height={360} src={item.thumbnailUrl} width={640} /> : 'Article thumbnail'}
      </div>
      <p className={STYLES.cardMeta}>{draft.categoryLabel || draft.category || 'Article'}{readingMinutes ? ` · ${readingMinutes} min read` : ''}</p>
      <h2 className={STYLES.cardTitle}>{draft.title || 'Untitled article'}</h2>
      <p className={STYLES.cardSummary}>{draft.summary || 'Add a manually edited teaser before publication.'}</p>
      <p className={STYLES.cardMeta}>{formatShortDate(publishedAt)}</p>
    </article>
  )
}

/** The public answer card: a dot, the title, the teaser and "Explore this pillar". */
function AnswerCardPreview({ draft }: { draft: PublishingDraft }) {
  return (
    <article className={`${LAYOUT_STYLES.answerCard} ${STYLES.card}`} data-kr-id="AnswerThumbnailCardPreview">
      <span aria-hidden="true" className={`${LAYOUT_STYLES.answerDot} ${STYLES.answerDot}`} />
      <div className={LAYOUT_STYLES.answerBody}>
        <h3 className={STYLES.answerTitle}>{draft.title || draft.pillar || 'Answer topic'}</h3>
        <p className={STYLES.cardSummary}>{draft.summary || 'Add a manually edited answer teaser before publication.'}</p>
        <p className={STYLES.cardMeta}>Explore this pillar →</p>
      </div>
    </article>
  )
}

/**
 * Renders the Preview card for the selected item (or an empty preview while none is selected).
 *
 * @param props - The item, the draft, the browser's preview pass, and the hide handler.
 * @returns The `PublicationPreviewPanel` module card.
 */
export default function PublicationPreviewPanel({ collapsible = false, draft, item, onToggleCollapsed, sanitizerResult }: PublicationPreviewPanelProps) {
  const [mode, setMode] = useState<'full' | 'card'>('full')
  const contentType = item?.contentType ?? 'article'

  return (
    <KRModuleCard
      actions={
        collapsible && onToggleCollapsed ? (
          <button aria-label="Hide preview panel" className={STYLES.caret} data-kr-action="hide-preview-panel" title="Hide preview panel" type="button" onClick={onToggleCollapsed}>
            <KRHomebaseIcons.Chevron className={STYLES.caretIcon} />
          </button>
        ) : null
      }
      component="PublicationPreviewPanel"
      krId="PublicationPreviewPanel"
      note="Check the full page and the public card before publishing. The card shape is controlled by the website, not by the uploaded HTML."
      title="Preview"
    >
      {/* Tabs: the whole page or the public card, and the item's status. */}
      <div aria-label="Publication preview modes" className={LAYOUT_STYLES.tabs} role="tablist">
        <button aria-selected={mode === 'full'} className={`${STYLES.tab} ${mode === 'full' ? STYLES.tabActive : ''}`} role="tab" type="button" onClick={() => setMode('full')}>Rendered page preview</button>
        <button aria-selected={mode === 'card'} className={`${STYLES.tab} ${mode === 'card' ? STYLES.tabActive : ''}`} role="tab" type="button" onClick={() => setMode('card')}>Article card preview</button>
        <PublicationStatusIcon className={LAYOUT_STYLES.statusIcon} size={28} status={item?.status ?? 'draft'} />
      </div>

      {/* Routing facts: the public path, the SEO title and what the preview pass removed. */}
      <div className={LAYOUT_STYLES.metaGrid} data-kr-element="preview-meta">
        <span className={`${LAYOUT_STYLES.metaBox} ${STYLES.metaBox}`}><strong className={STYLES.metaLabel}>Canonical</strong><span className={STYLES.metaValue}>{item?.canonicalPath || '—'}</span></span>
        <span className={`${LAYOUT_STYLES.metaBox} ${STYLES.metaBox}`}><strong className={STYLES.metaLabel}>SEO title</strong><span className={STYLES.metaValue}>{draft.seoTitle || item?.seoTitle || '—'}</span></span>
        <span className={`${LAYOUT_STYLES.metaBox} ${STYLES.metaBox}`}><strong className={STYLES.metaLabel}>Sanitizer removed</strong><span className={STYLES.metaValue}>{sanitizerResult.removed.length}</span></span>
      </div>

      {mode === 'full' ? (
        <>
          <p className={STYLES.line}>Front-end {contentType} preview · static sanitized HTML</p>
          <ArticleHtmlPreviewFrame bodyHtml={sanitizerResult.html} contentLabel={contentType === 'answer' ? 'Answer' : 'Article'} stylesheetUrl={item?.stylesheetUrl ?? null} title={draft.title || item?.title || 'Publication preview'} />
        </>
      ) : (
        <div className={`${LAYOUT_STYLES.cardFrame} ${STYLES.cardFrame}`} data-kr-element="card-preview-frame">
          <p className={STYLES.line}>This copies the public card used on /articles. Editors choose the image and text; developers control the card shape.</p>
          {contentType === 'answer' ? <AnswerCardPreview draft={draft} /> : <ArticleCardPreview draft={draft} item={item} />}
        </div>
      )}
    </KRModuleCard>
  )
}
