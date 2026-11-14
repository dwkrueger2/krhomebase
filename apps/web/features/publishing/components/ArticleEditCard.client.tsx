'use client'
// file: apps/web/features/publishing/components/ArticleEditCard.client.tsx
/**
 * Editor-facing article/answer detail panel for Front End Publishing ("Article Details"; plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/ArticleEditCard.client.tsx`. Kept: the dark header ("Article
 * Details", "Article publication metadata" or "Answer Blog publication metadata", Save Changes, close); the Public
 * Page line; the title shown large with a pencil that turns it into a field; the dark details table with Content No.,
 * Content Type, Status, Author Display, Article Category, Read Time (minutes) and Category Label for an article or
 * Answer Pillar for an answer, Teaser / Summary, Thumbnail alt text, SEO Title and SEO Alt Text (the SEO description);
 * the "Preview check" line; and the folded "Advanced routing and storage details" with Re-check HTML.
 *
 * Changed:
 *  - Save Changes sends only the changed fields to `PATCH /api/v1/publishing/items/{itemId}` (the panel does it); the
 *    API cleans the text again (D22).
 *  - Status is shown, not chosen: the old select saved any status through `saveDraft`; publish, unpublish and archive
 *    are the API's own actions with their checks, run from the list's row actions.
 *  - While the item is published only image licenses may change (409 `PUBLISHING_ITEM_PUBLISHED`): every field here is
 *    read-only, with a short note, and Save Changes is off.
 *  - "Publish check" lists the item's `publishProblems` in the old wording, so the person sees why Publish is refused.
 *  - Advanced: slug, canonical path, thumbnail key and address are read-only (the API makes them; it has no author id
 *    any more); the topic slug (answers) and the text stay editable.
 *  - Public Page links to the public website (`buildPublicSiteHref`): KR Homebase now has its own host.
 *  - The old CSS module's rules became the maps below, on the Density Contract: 12px text in the table (was 11px),
 *    3px cell padding (was 5px), labels at least 10px (were 8px and 9px), the title at 14px (was 16px), and square
 *    3px buttons where the old close was a round 24px button. The pencil and close are `KRHomebaseIcons`.
 *
 * State: the panel owns the item, the draft and saving; this card edits the draft through `onDraftChange`.
 */

import type { PublishingItem } from '@krhomebase/contracts'
import { useState, type ReactNode } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { buildPublicSiteHref } from '@/features/auth/publicSiteLinks'
import { canonicalPathForDraft, contentCode, contentTypeLabel, draftIsDirty, draftProblem, humanizeLabel, slugify, type PublishingDraft } from '../publishingRows'
import type { SanitizedHtmlResult } from '../sanitizeArticleHtml.client'
import PublicationStatusIcon from './PublicationStatusIcon.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  panel: 'overflow-hidden rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  header: 'min-h-[34px] bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  headerTitle: 'm-0 text-[13px] font-[900] leading-[1.1]',
  headerNote: 'm-0 text-[10px] leading-[1.2] opacity-[0.82]',
  saveButton:
    'px-[10px] py-[3px] min-h-[24px] rounded-[3px] border border-[rgba(255,255,255,0.3)] bg-(--kr-theme-accent) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  closeButton:
    'size-[24px] p-0 inline-flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.08)] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-[rgba(255,255,255,0.18)]',
  closeIcon: 'size-[12px]',
  note: 'm-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] font-[600] leading-[1.3] text-(color:--kr-theme-text)',
  problem: 'm-0 text-[11px] font-[600] text-(color:--kr-theme-danger)',
  pageLabel: 'shrink-0 text-[10px] font-[900] uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  pageLink: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-(color:--kr-theme-brand-primary-active)',
  tinyLabel: 'text-[10px] font-[900] uppercase leading-none tracking-[0.09em] text-(color:--kr-theme-text-muted)',
  titleButton: 'min-w-0 cursor-pointer border-0 bg-transparent text-left text-(color:--kr-theme-text) disabled:cursor-default',
  titleText: 'block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-[900] leading-[1.15]',
  pencil: 'size-[13px] shrink-0 text-(color:--kr-theme-accent)',
  titleInput:
    'px-[6px] py-[2px] min-h-[24px] w-full rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[14px] font-[850] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  table: 'border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] leading-[1.25] text-(color:--kr-theme-text-inverse)',
  rowRule: 'border-t border-[rgba(255,255,255,0.14)] first:border-t-0',
  rowLabel: 'max-w-[132px] overflow-hidden text-ellipsis whitespace-nowrap bg-[rgba(0,0,0,0.14)] font-[900]',
  rowValue: 'min-w-0',
  field:
    'w-full min-w-0 border-0 border-l border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.08)] text-inherit outline-none focus:bg-[rgba(255,255,255,0.14)] focus:outline-2 focus:-outline-offset-2 focus:outline-(--kr-theme-accent) read-only:opacity-[0.78]',
  textarea: 'min-h-[48px] resize-y whitespace-pre-wrap',
  statusValue: 'capitalize whitespace-nowrap',
  line: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  checkList: 'm-0 list-none text-[11px] leading-[1.3]',
  checkProblem: 'font-mono text-(color:--kr-theme-danger)',
  checkOk: 'text-(color:--kr-theme-success)',
  advanced: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  advancedSummary: 'cursor-pointer text-[12px] font-[850] text-(color:--kr-theme-text)',
  fieldLabel: 'text-[11px] font-[700] text-(color:--kr-theme-text-muted)',
  input:
    'px-[6px] py-[2px] min-h-[24px] w-full min-w-0 rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) read-only:bg-(--kr-theme-muted-surface) read-only:text-(color:--kr-theme-text-muted)',
  htmlBox:
    'px-[6px] py-[3px] min-h-[150px] w-full min-w-0 resize-y rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-mono text-[11px] leading-[1.35] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) read-only:bg-(--kr-theme-muted-surface)',
  secondaryButton:
    'px-[10px] py-[3px] min-h-[24px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[800] text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
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
  panel: 'pb-[8px] gap-[6px] grid',
  header: 'px-[8px] py-[5px] gap-[8px] flex items-center justify-between',
  headerCopy: 'min-w-0 gap-[1px] grid',
  headerActions: 'gap-[6px] flex flex-none items-center',
  inset: 'mx-[8px]',
  note: 'px-[6px] py-[3px]',
  pageLine: 'gap-[6px] flex min-w-0 items-baseline',
  titleBlock: 'gap-[2px] grid',
  titleButton: 'p-0 gap-[6px] flex min-w-0 items-center justify-between',
  // The details table: a narrow label column and a wide value column; each row spans both (subgrid).
  table: 'grid grid-cols-[auto_minmax(0,1fr)]',
  row: 'col-span-2 grid grid-cols-subgrid',
  rowLabel: 'px-[6px] py-[3px]',
  rowValue: 'px-[6px] py-[3px]',
  rowField: 'px-[6px] py-[3px]',
  statusValue: 'gap-[6px] inline-flex items-center',
  checkList: 'p-0 gap-[1px] grid',
  advanced: 'p-[6px] gap-[6px] grid',
  advancedGrid: 'mt-[6px] gap-x-[6px] gap-y-[4px] grid md:grid-cols-2',
  advancedField: 'gap-[2px] grid min-w-0',
  advancedFieldFull: 'gap-[2px] grid min-w-0 md:col-span-2',
  buttonRow: 'mt-[4px] gap-[6px] flex',
} as const

export interface ArticleEditCardProps {
  item: PublishingItem | null
  draft: PublishingDraft
  sanitizerResult: SanitizedHtmlResult
  /** False while the panel saves or acts: the fields and Save Changes are off. */
  mayEdit: boolean
  onClose?: () => void
  onDraftChange: (draft: PublishingDraft) => void
  onSanitizeHtml: () => void
  onSaveDraft: () => void
}

/** One row of the dark details table: the label cell and the value or field cell. */
function DetailsRow({ children, element, label }: { children: ReactNode; element: string; label: string }) {
  return (
    <label className={`${LAYOUT_STYLES.row} ${STYLES.rowRule}`} data-kr-element={`${element}-row`} role="row">
      <span className={`${LAYOUT_STYLES.rowLabel} ${STYLES.rowLabel}`} role="rowheader">{label}</span>
      <span className={`${LAYOUT_STYLES.rowValue} ${STYLES.rowValue}`} role="cell">{children}</span>
    </label>
  )
}

/**
 * Renders Article Details for the selected item: the header with Save Changes, the public page, the title, the details
 * table, the preview and publish checks, and the advanced fields.
 *
 * @param props - The item, the draft and its change handler, the preview check result, and the save and close handlers.
 * @returns The `PublicationMetadataEditor` section, or nothing while no item is selected.
 */
export default function ArticleEditCard({ draft, item, mayEdit, onClose, onDraftChange, onSanitizeHtml, onSaveDraft, sanitizerResult }: ArticleEditCardProps) {
  const [editingTitle, setEditingTitle] = useState(false)

  if (!item) return null

  const isArticle = item.contentType === 'article'
  const isPublished = item.status === 'published'
  const canEdit = mayEdit && !isPublished
  const isDirty = draftIsDirty(item, draft)
  const problem = isDirty ? draftProblem(item, draft) : ''
  const canonicalPath = isDirty ? canonicalPathForDraft(item, draft) : item.canonicalPath
  const fieldClass = `${LAYOUT_STYLES.rowField} ${STYLES.field}`

  function update(next: Partial<PublishingDraft>): void {
    const merged = { ...draft, ...next }
    if (next.pillar && !isArticle) merged.pillar = slugify(next.pillar)
    onDraftChange(merged)
  }

  function save(): void {
    if (!canEdit || !isDirty || problem) return
    onSaveDraft()
    setEditingTitle(false)
  }

  return (
    <section aria-label="Article Details" className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`} data-kr-component="PublicationMetadataEditor" data-kr-element="article-details-panel" data-kr-id="PublicationMetadataEditor">
      {/* Header: what is shown, Save Changes and close. */}
      <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element="article-details-header">
        <div className={LAYOUT_STYLES.headerCopy}>
          <h3 className={STYLES.headerTitle}>Article Details</h3>
          <p className={STYLES.headerNote}>{item.contentType === 'answer' ? 'Answer Blog' : 'Article'} publication metadata</p>
        </div>
        <div className={LAYOUT_STYLES.headerActions}>
          <button className={STYLES.saveButton} data-kr-action="save-article-details" disabled={!canEdit || !isDirty || Boolean(problem)} type="button" onClick={save}>Save Changes</button>
          <button aria-label="Close Article Details" className={STYLES.closeButton} title="Close Article Details" type="button" onClick={onClose}>
            <KRHomebaseIcons.Close className={STYLES.closeIcon} />
          </button>
        </div>
      </header>

      {/* Published: only licenses may change (the API's rule). */}
      {isPublished ? (
        <p className={`${LAYOUT_STYLES.inset} ${LAYOUT_STYLES.note} ${STYLES.note}`} data-kr-element="article-details-published-note">
          This item is published. Only its image licenses may change; unpublish it to change anything else.
        </p>
      ) : null}
      {problem ? <p className={`${LAYOUT_STYLES.inset} ${STYLES.problem}`} role="alert">{problem}</p> : null}

      {/* Public Page: where the item is (or will be) on the public website. */}
      <div className={`${LAYOUT_STYLES.inset} ${LAYOUT_STYLES.pageLine}`} data-kr-element="article-details-public-page">
        <span className={STYLES.pageLabel}>Public Page</span>
        <a className={STYLES.pageLink} href={buildPublicSiteHref(canonicalPath)} rel="noreferrer" target="_blank" title={canonicalPath}>{canonicalPath}</a>
      </div>

      {/* Title: shown large; the pencil turns it into a field. */}
      <div className={`${LAYOUT_STYLES.inset} ${LAYOUT_STYLES.titleBlock}`} data-kr-element="article-details-title">
        <span className={STYLES.tinyLabel}>Title</span>
        {editingTitle && canEdit ? (
          <input
            aria-label="Title"
            autoFocus
            className={STYLES.titleInput}
            value={draft.title}
            onBlur={() => setEditingTitle(false)}
            onChange={(event) => update({ title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') setEditingTitle(false)
            }}
          />
        ) : (
          <button className={`${LAYOUT_STYLES.titleButton} ${STYLES.titleButton}`} disabled={!canEdit} title={draft.title || 'Edit title'} type="button" onClick={() => setEditingTitle(true)}>
            <span className={STYLES.titleText}>{draft.title || 'Untitled'}</span>
            {canEdit ? <KRHomebaseIcons.Pencil className={STYLES.pencil} /> : null}
          </button>
        )}
      </div>

      {/* Details table: the item's publication fields, label beside value. */}
      <div aria-label="Article details fields" className={`${LAYOUT_STYLES.inset} ${LAYOUT_STYLES.table} ${STYLES.table}`} data-kr-element="article-details-table" role="table">
        <DetailsRow element="content-number" label="Content No.">{contentCode(item)}</DetailsRow>
        <DetailsRow element="content-type" label="Content Type">{contentTypeLabel(item.contentType)}</DetailsRow>
        <DetailsRow element="status" label="Status">
          <span className={`${LAYOUT_STYLES.statusValue} ${STYLES.statusValue}`}>
            <PublicationStatusIcon size={20} status={item.status} />
            {humanizeLabel(item.status)}
          </span>
        </DetailsRow>
        <DetailsRow element="author" label="Author Display">
          <input className={fieldClass} readOnly={!canEdit} value={draft.authorDisplayName} onChange={(event) => update({ authorDisplayName: event.target.value })} />
        </DetailsRow>
        {isArticle ? (
          <>
            <DetailsRow element="category" label="Article Category">
              <input className={fieldClass} readOnly={!canEdit} value={draft.category} onChange={(event) => update({ category: event.target.value })} />
            </DetailsRow>
            <DetailsRow element="reading-time" label="Read Time (minutes)">
              <input className={fieldClass} inputMode="numeric" readOnly={!canEdit} value={draft.readingTimeMinutes} onChange={(event) => update({ readingTimeMinutes: event.target.value })} />
            </DetailsRow>
            <DetailsRow element="category-label" label="Category Label">
              <input className={fieldClass} readOnly={!canEdit} value={draft.categoryLabel} onChange={(event) => update({ categoryLabel: event.target.value })} />
            </DetailsRow>
          </>
        ) : (
          <DetailsRow element="pillar" label="Answer Pillar">
            <input className={fieldClass} readOnly={!canEdit} value={draft.pillar} onChange={(event) => update({ pillar: event.target.value })} />
          </DetailsRow>
        )}
        <DetailsRow element="summary" label="Teaser / Summary">
          <textarea className={`${fieldClass} ${STYLES.textarea}`} readOnly={!canEdit} rows={4} value={draft.summary} onChange={(event) => update({ summary: event.target.value })} />
        </DetailsRow>
        <DetailsRow element="thumbnail-alt" label="Thumbnail alt text">
          <textarea className={`${fieldClass} ${STYLES.textarea}`} readOnly={!canEdit} rows={3} value={draft.thumbnailAlt} onChange={(event) => update({ thumbnailAlt: event.target.value })} />
        </DetailsRow>
        <DetailsRow element="seo-title" label="SEO Title">
          <input className={fieldClass} readOnly={!canEdit} value={draft.seoTitle} onChange={(event) => update({ seoTitle: event.target.value })} />
        </DetailsRow>
        <DetailsRow element="seo-description" label="SEO Alt Text">
          <textarea className={`${fieldClass} ${STYLES.textarea}`} readOnly={!canEdit} rows={4} value={draft.seoDescription} onChange={(event) => update({ seoDescription: event.target.value })} />
        </DetailsRow>
      </div>

      {/* Checks: the browser's preview check, then the API's reasons Publish would be refused. */}
      <p className={`${LAYOUT_STYLES.inset} ${STYLES.line}`}>
        Preview check: {sanitizerResult.removed.length ? sanitizerResult.removed.join(', ') : 'no unsafe preview items detected'} · Images in body: {sanitizerResult.imageSources.length}
      </p>
      <div className={LAYOUT_STYLES.inset} data-kr-element="article-details-publish-check">
        <span className={STYLES.line}>Publish check: </span>
        {item.publishProblems.length ? (
          <ul aria-label="Why Publish is refused" className={`${LAYOUT_STYLES.checkList} ${STYLES.checkList}`}>
            {item.publishProblems.map((code) => (
              <li className={STYLES.checkProblem} key={code}>{code}</li>
            ))}
          </ul>
        ) : (
          <span className={`${STYLES.line} ${STYLES.checkOk}`}>ready to publish</span>
        )}
      </div>

      {/* Advanced: routing and storage values the API controls, the topic slug and the text. */}
      <details className={`${LAYOUT_STYLES.inset} ${LAYOUT_STYLES.advanced} ${STYLES.advanced}`} data-kr-id="PublicationAdvancedFields">
        <summary className={STYLES.advancedSummary}>Advanced routing and storage details</summary>
        <p className={STYLES.line}>The slug, path and storage keys are set by upload validation and the API. The topic slug and the text may be corrected here; the API cleans the text again on save.</p>
        <div className={LAYOUT_STYLES.advancedGrid}>
          <label className={LAYOUT_STYLES.advancedField}>
            <span className={STYLES.fieldLabel}>Slug</span>
            <input className={STYLES.input} readOnly value={item.slug} />
          </label>
          {isArticle ? null : (
            <label className={LAYOUT_STYLES.advancedField}>
              <span className={STYLES.fieldLabel}>Topic slug</span>
              <input className={STYLES.input} readOnly={!canEdit} value={draft.topicSlug} onChange={(event) => update({ topicSlug: event.target.value })} />
            </label>
          )}
          <label className={LAYOUT_STYLES.advancedFieldFull}>
            <span className={STYLES.fieldLabel}>Canonical path</span>
            <input className={STYLES.input} readOnly value={canonicalPath} />
          </label>
          <label className={LAYOUT_STYLES.advancedField}>
            <span className={STYLES.fieldLabel}>Thumbnail R2 key</span>
            <input className={STYLES.input} readOnly value={item.thumbnailKey ?? ''} />
          </label>
          <label className={LAYOUT_STYLES.advancedFieldFull}>
            <span className={STYLES.fieldLabel}>Thumbnail draft address</span>
            <input className={STYLES.input} readOnly value={item.thumbnailUrl ?? ''} />
          </label>
          <label className={LAYOUT_STYLES.advancedFieldFull}>
            <span className={STYLES.fieldLabel}>Sanitized HTML body</span>
            <textarea className={STYLES.htmlBox} readOnly={!canEdit} value={draft.html} onChange={(event) => update({ html: event.target.value })} />
          </label>
        </div>
        <div className={LAYOUT_STYLES.buttonRow}>
          <button className={STYLES.secondaryButton} disabled={!canEdit} type="button" onClick={onSanitizeHtml}>Re-check HTML</button>
        </div>
      </details>
    </section>
  )
}
