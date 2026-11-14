'use client'
// file: apps/web/features/publishing/components/FrontEndPublishingPanel.client.tsx
/**
 * KR Homebase Front End Publishing workspace for live Article and Answer publication management (menu id
 * `front-end-publishing`; plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 6; the requester's decision D11:
 * "copy Publishing as it is"). It replaces the "Module [TBD]" placeholder. `app/page.tsx` places it in the workspace
 * and the pop-out window and passes the signed-in `viewer`.
 *
 * Ported from the old `front-end-publishing/FrontEndPublishingPanel.client.tsx`. What it draws, as before:
 *  - The module header ("Front End Publishing", "Article and Answer publication management", the role line) with the
 *    List items, Published, Draft, Archived and Can publish counts, and the open-preview button while the preview is
 *    hidden (it pulses for about two seconds after hiding).
 *  - The left column: the "Front End Article List" (`FrontEndArticleListSection`: the dark top bar with Download
 *    articles, Upload Article and the fold caret, around `PublishingQueueLedger`), then Article Details
 *    (`ArticleEditCard`), then the status line.
 *  - The right column (hideable): `PublicationPreviewPanel` and `ArticleImagesCard`.
 *  - `ArticleDownloadDialog`, `PackageUploadDialog`, and Delete Draft (`PublishingDeleteDialog`).
 *
 * Calls (`../api.client.ts`): the list (`GET /v1/publishing/items`, 50 a page, "Load more"; D10), one item when a row
 * is chosen (its text, images, licenses and publish problems), the package check and the draft save (D22), the
 * change (fields, text, licenses; D25), publish, unpublish and delete. Who: super admin and front-end author, as the
 * API decides; anyone else sees the API's refusal. Delete is shown only when the list's `viewer.canDelete` says so.
 *
 * Changed from the old screen: no sample data or prototype mode; the API sends one checked shape, so the old row
 * normalizer is gone; the draft is made from the stored package by the API, not from the browser's text and keys; a
 * reply replaces the row it changed instead of reloading the whole list; Delete asks for the typed confirmation in
 * `U6ConfirmationDialog` (the old `window.confirm`); a refused publish lists the API's reasons under the status line;
 * migration 031 missing shows a notice (`PUBLISHING_MIGRATION_NOTICE`). The old CSS module became Tailwind maps on the
 * Density Contract; each child file says what it changed.
 *
 * State: this panel owns the list, the paging, the selected item and its draft, the preview pass, the dialogs and the
 * status line. Its children take values and handlers only.
 */

import type { ArticlePackageCheckData, ContentType, PublishingImageInput, PublishingItem, PublishingItemsData, PublishingItemSummary } from '@krhomebase/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleHero } from '@/components/ui/KRModuleHero.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { CommunicationsViewer } from '@/features/communications/communicationTypes'
import { L } from '@/lib/KRUtilities'
import {
  createPublishingItem,
  deletePublishingItem,
  fetchPublishingItem,
  fetchPublishingItems,
  PUBLISHING_MIGRATION_NOTICE,
  PublishingApiError,
  runPublishingAction,
  updatePublishingItem,
  type PublishingAction,
} from '../api.client'
import { appendItems, draftFromItem, formatShortDate, humanizeLabel, itemUpdateBody, statusCounts, upsertItem, type PublishingDraft } from '../publishingRows'
import { sanitizeArticleHtml, type SanitizedHtmlResult } from '../sanitizeArticleHtml.client'
import ArticleDownloadDialog from './ArticleDownloadDialog.client'
import ArticleEditCard from './ArticleEditCard.client'
import ArticleImagesCard from './ArticleImagesCard.client'
import PackageUploadDialog from './PackageUploadDialog.client'
import PublicationPreviewPanel from './PublicationPreviewPanel.client'
import PublishingDeleteDialog from './PublishingDeleteDialog.client'
import FrontEndArticleListSection from './FrontEndArticleListSection.client'
import PublishingQueueLedger from './PublishingQueueLedger.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  notice: 'm-0 rounded-[2px] border border-(--kr-theme-danger) bg-(--kr-theme-card-surface) text-[12px] font-[700] text-(color:--kr-theme-danger)',
  detailLoading: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  statusLine: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  problems: 'm-0 list-none rounded-[2px] border border-(--kr-theme-danger) font-mono text-[11px] leading-[1.3] text-(color:--kr-theme-danger)',
  openPreview:
    'size-[24px] p-0 inline-flex items-center justify-center rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-brand-primary) cursor-pointer hover:border-(--kr-theme-accent)',
  openPreviewIcon: 'size-[14px] -rotate-90',
  // The open-preview button pulses for about two seconds after the preview is hidden (old previewOpenPulse).
  openPreviewBlink: 'animate-pulse',
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
  panel: 'gap-[8px] grid min-w-0',
  notice: 'px-[8px] py-[4px]',
  // Two columns from 1024px (the list and details, then the preview); one column when the preview is hidden or narrower.
  workspace: 'gap-[10px] grid min-w-0 items-start lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]',
  workspacePreviewHidden: 'gap-[10px] grid min-w-0 items-start',
  stack: 'gap-[10px] grid min-w-0',
  detailLoading: 'p-[8px] flex',
  problems: 'p-[6px] gap-[1px] grid',
} as const

export interface FrontEndPublishingPanelProps {
  /** The signed-in person (`app/page.tsx`), for the role line. Optional so the module-level panel list type-checks. */
  viewer?: CommunicationsViewer | null
  /** A first page given instead of loading one (tests draw the screen without the API). */
  initialData?: PublishingItemsData
  /** A selected item given instead of loading it (tests). */
  initialItem?: PublishingItem
  /** A list failure given instead of loading (tests): the API's code and sentence. */
  initialError?: { code: string; message: string }
}

const EMPTY_SANITIZER: SanitizedHtmlResult = { html: '', removed: [], imageSources: [] }
const EMPTY_DRAFT: PublishingDraft = { title: '', summary: '', seoTitle: '', seoDescription: '', thumbnailAlt: '', category: '', categoryLabel: '', pillar: '', topicSlug: '', readingTimeMinutes: '', authorDisplayName: '', html: '' }
const ACTION_LABELS: Record<PublishingAction, string> = { publish: 'Publish', unpublish: 'Unpublish', archive: 'Archive' }

const sentenceOf = (error: unknown, fallback: string) => (error instanceof PublishingApiError ? error.message : fallback)

/**
 * Renders the Front End Publishing screen.
 *
 * @param props - The signed-in `viewer` and, for tests, a first page, a selected item or a list failure.
 */
export default function FrontEndPublishingPanel({ initialData, initialError, initialItem, viewer = null }: FrontEndPublishingPanelProps) {
  const [items, setItems] = useState<PublishingItemSummary[]>(initialData?.items ?? [])
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? false)
  const [moreNote, setMoreNote] = useState<string | null>(initialData?.moreNote ?? null)
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null)
  const [canDelete, setCanDelete] = useState(initialData?.viewer.canDelete ?? false)
  const [loading, setLoading] = useState(!initialData && !initialError)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listError, setListError] = useState<{ code: string; message: string } | null>(initialError ?? null)
  const [reloadKey, setReloadKey] = useState(0)
  const [item, setItem] = useState<PublishingItem | null>(initialItem ?? null)
  const [itemLoading, setItemLoading] = useState(false)
  const [draft, setDraft] = useState<PublishingDraft>(initialItem ? draftFromItem(initialItem) : EMPTY_DRAFT)
  const [sanitizerResult, setSanitizerResult] = useState<SanitizedHtmlResult>(initialItem ? sanitizeArticleHtml(initialItem.html) : EMPTY_SANITIZER)
  const [status, setStatus] = useState(initialData ? 'Select a row to view Article Details.' : 'Loading article list...')
  const [problems, setProblems] = useState<readonly string[]>([])
  const [queueCollapsed, setQueueCollapsed] = useState(false)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [previewOpenBlink, setPreviewOpenBlink] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PublishingItemSummary | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [savingAction, setSavingAction] = useState(false)
  const [savingLicenses, setSavingLicenses] = useState(false)
  const listRequest = useRef(0)
  const itemRequest = useRef(0)
  const skipFirstLoad = useRef(Boolean(initialData || initialError))

  const counts = statusCounts(items)
  const migrationRequired = listError?.code === 'PUBLISHING_MIGRATION_REQUIRED'
  const mayPublish = !loading && !listError
  const busy = savingAction || savingLicenses

  /** Shows an item in Article Details, the preview and the images card. */
  const showItem = useCallback((next: PublishingItem | null) => {
    setItem(next)
    setDraft(next ? draftFromItem(next) : EMPTY_DRAFT)
    setSanitizerResult(next ? sanitizeArticleHtml(next.html) : EMPTY_SANITIZER)
  }, [])

  // The first page, again when Try again is pressed (a later reply wins over an older one).
  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false
      return
    }
    const request = ++listRequest.current
    setLoading(true)
    setListError(null)
    fetchPublishingItems()
      .then((data) => {
        if (request !== listRequest.current) return
        setItems(data.items)
        setHasMore(data.hasMore)
        setMoreNote(data.moreNote)
        setNextCursor(data.nextCursor)
        setCanDelete(data.viewer.canDelete)
        setStatus(data.items.length ? 'Article list refreshed. Select a row to view Article Details.' : 'No articles or answers are ready yet. Use Upload Article to add a package.')
      })
      .catch((error: unknown) => {
        if (request !== listRequest.current) return
        const code = error instanceof PublishingApiError ? error.code : 'UNEXPECTED_REPLY'
        L(`[FRONT_END_PUBLISHING:167] list failed code=${code}`)
        setItems([])
        setListError({ code, message: sentenceOf(error, 'Article list unavailable.') })
        setStatus(sentenceOf(error, 'Article list unavailable.'))
      })
      .finally(() => {
        if (request === listRequest.current) setLoading(false)
      })
  }, [reloadKey])

  // The open-preview button pulses for about two seconds after the preview is hidden.
  useEffect(() => {
    if (!previewCollapsed) {
      setPreviewOpenBlink(false)
      return
    }
    setPreviewOpenBlink(true)
    const timer = window.setTimeout(() => setPreviewOpenBlink(false), 2100)
    return () => window.clearTimeout(timer)
  }, [previewCollapsed])

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPublishingItems({ cursor: nextCursor })
      setItems((current) => appendItems(current, data.items))
      setHasMore(data.hasMore)
      setMoreNote(data.moreNote)
      setNextCursor(data.nextCursor)
    } catch (error) {
      setStatus(sentenceOf(error, 'More articles could not be loaded.'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function selectRow(row: PublishingItemSummary): Promise<void> {
    const request = ++itemRequest.current
    setProblems([])
    setItemLoading(true)
    setStatus(`${row.title} selected for publication management.`)
    try {
      const loaded = await fetchPublishingItem(row.id)
      if (request !== itemRequest.current) return
      showItem(loaded)
      setItems((current) => upsertItem(current, loaded))
    } catch (error) {
      if (request !== itemRequest.current) return
      showItem(null)
      setStatus(sentenceOf(error, 'The article could not be opened.'))
    } finally {
      if (request === itemRequest.current) setItemLoading(false)
    }
  }

  /** Puts a saved or changed item into the list and the detail cards. */
  function applySaved(saved: PublishingItem): void {
    itemRequest.current += 1
    setItemLoading(false)
    setItems((current) => upsertItem(current, saved))
    showItem(saved)
  }

  async function savePackageAsDraft(contentType: ContentType, result: ArticlePackageCheckData): Promise<void> {
    setSavingAction(true)
    setProblems([])
    try {
      const saved = await createPublishingItem({ packageKey: result.packageKey })
      applySaved(saved)
      setStatus(`Package saved as a ${contentType} draft. Add a license for each image before publishing.`)
    } catch (error) {
      setStatus(sentenceOf(error, 'Package save failed.'))
      throw error
    } finally {
      setSavingAction(false)
    }
  }

  async function requestAction(row: PublishingItemSummary, action: PublishingAction): Promise<void> {
    setSavingAction(true)
    setProblems([])
    setStatus(`${ACTION_LABELS[action]} request for ${row.title}...`)
    try {
      applySaved(await runPublishingAction(action, row.id, row.contentType))
      setStatus(`${ACTION_LABELS[action]} completed. The article list was refreshed.`)
    } catch (error) {
      setStatus(sentenceOf(error, 'Publishing request failed.'))
      if (error instanceof PublishingApiError) setProblems(error.problems)
    } finally {
      setSavingAction(false)
    }
  }

  async function confirmDelete(confirmation: string): Promise<void> {
    if (!deleteTarget) return
    setSavingAction(true)
    setDeleteError('')
    try {
      const deleted = await deletePublishingItem(deleteTarget.id, confirmation)
      setItems((current) => current.filter((candidate) => candidate.id !== deleted.id))
      if (item?.id === deleted.id) showItem(null)
      setDeleteTarget(null)
      setStatus(deleted.filesNotRemoved.length ? `Delete completed. ${deleted.filesNotRemoved.length} stored file(s) could not be removed and were logged.` : 'Delete completed. The article list was refreshed.')
    } catch (error) {
      setDeleteError(sentenceOf(error, 'The item was not deleted.'))
    } finally {
      setSavingAction(false)
    }
  }

  async function saveDraft(): Promise<void> {
    if (!item) return
    const body = itemUpdateBody(item, draft)
    if (!Object.keys(body).length) return
    setSavingAction(true)
    setProblems([])
    try {
      applySaved(await updatePublishingItem(item.id, body))
      setStatus('Changes saved. Review the page and card previews before publishing.')
    } catch (error) {
      setStatus(sentenceOf(error, 'Draft save failed.'))
      if (error instanceof PublishingApiError) setProblems(error.problems)
    } finally {
      setSavingAction(false)
    }
  }

  async function saveLicenses(images: PublishingImageInput[]): Promise<void> {
    if (!item || !images.length) return
    setSavingLicenses(true)
    setProblems([])
    try {
      applySaved(await updatePublishingItem(item.id, { images }))
      setStatus(`Licenses saved for ${images.length} image${images.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatus(sentenceOf(error, 'The licenses were not saved.'))
      if (error instanceof PublishingApiError) setProblems(error.problems)
    } finally {
      setSavingLicenses(false)
    }
  }

  function sanitizeCurrentHtml(): void {
    const next = sanitizeArticleHtml(draft.html)
    setSanitizerResult(next)
    setDraft((current) => ({ ...current, html: next.html }))
    setStatus(`Sanitized preview HTML. Removed ${next.removed.length} unsafe item${next.removed.length === 1 ? '' : 's'}.`)
  }

  function closeDetails(): void {
    itemRequest.current += 1
    setItemLoading(false)
    showItem(null)
    setProblems([])
    setStatus('Article Details closed. Select a row to continue.')
  }

  return (
    <section aria-label="Front End Publishing" className={LAYOUT_STYLES.panel} data-kr-component="FrontEndPublishingPanel" data-kr-element="front-end-publishing-panel" data-kr-id="FrontEndPublishingPanel">
      {/* Module header: purpose, role and the counts; the open-preview button while the preview is hidden. */}
      <KRModuleHero
        data_kr_id="FrontEndPublishingHero"
        description={`Role: ${humanizeLabel(viewer?.role)}. Use this screen to upload, preview, and publish Articles and Answers. Visitors only see approved published items.`}
        eyebrow="Front End Publishing"
        stats={[
          { label: 'List items', value: items.length },
          { label: 'Published', value: counts.published },
          { label: 'Draft', value: counts.draft },
          { label: 'Archived', value: counts.archived },
          { label: 'Can publish', value: loading ? '—' : mayPublish ? 'Yes' : 'No' },
          ...(previewCollapsed
            ? [
                {
                  label: ' ',
                  value: (
                    <button aria-label="Open preview panel" className={`${STYLES.openPreview} ${previewOpenBlink ? STYLES.openPreviewBlink : ''}`} data-kr-action="open-preview-panel" data-kr-element="preview-panel-open-button" title="Open the preview panel" type="button" onClick={() => setPreviewCollapsed(false)}>
                      <KRHomebaseIcons.Chevron className={STYLES.openPreviewIcon} />
                    </button>
                  ),
                },
              ]
            : []),
        ]}
        title="Article and Answer publication management"
      />

      {/* Migration 031 missing: nothing can be listed or saved until the requester applies it. */}
      {migrationRequired ? (
        <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-element="publishing-migration-notice" role="alert">{PUBLISHING_MIGRATION_NOTICE}</p>
      ) : null}

      <div className={previewCollapsed ? LAYOUT_STYLES.workspacePreviewHidden : LAYOUT_STYLES.workspace} data-kr-element="publishing-workspace">
        {/* Left column: the article list, Article Details and the status line. */}
        <div className={LAYOUT_STYLES.stack} data-kr-element="publishing-editor-stack">
          {/* The article list: top bar with Download and Upload, then the rows (or the folded line). */}
          <FrontEndArticleListSection
            busy={loading || busy}
            busyLabel={loading ? 'Refreshing...' : 'Saving...'}
            canDownload={items.length > 0 && !busy}
            canUpload={mayPublish && !busy}
            collapsed={queueCollapsed}
            onDownload={() => setDownloadOpen(true)}
            onToggleCollapsed={() => setQueueCollapsed((value) => !value)}
            onUpload={() => setUploadOpen(true)}
          >
            <PublishingQueueLedger
              busy={busy}
              canDelete={canDelete}
              error={listError?.message ?? ''}
              hasMore={hasMore}
              items={items}
              loading={loading}
              loadingMore={loadingMore}
              moreNote={moreNote}
              selectedId={item?.id ?? null}
              onArchive={(row) => void requestAction(row, 'archive')}
              onDelete={(row) => {
                setDeleteError('')
                setDeleteTarget(row)
              }}
              onEdit={(row) => void selectRow(row)}
              onLoadMore={() => void loadMore()}
              onPublish={(row) => void requestAction(row, 'publish')}
              onRetry={() => setReloadKey((key) => key + 1)}
              onSelect={(row) => void selectRow(row)}
              onUnpublish={(row) => void requestAction(row, 'unpublish')}
            />
          </FrontEndArticleListSection>

          {/* Article Details for the chosen row (a spinner while it loads). */}
          {itemLoading ? (
            <div className={`${LAYOUT_STYLES.detailLoading} ${STYLES.detailLoading}`} data-kr-element="article-details-loading" role="status">
              <RainbowBusySpinner busy hideWhenIdle={false} label="Opening article..." size={16} />
            </div>
          ) : (
            <ArticleEditCard draft={draft} item={item} mayEdit={!busy} sanitizerResult={sanitizerResult} onClose={closeDetails} onDraftChange={setDraft} onSanitizeHtml={sanitizeCurrentHtml} onSaveDraft={() => void saveDraft()} />
          )}

          {/* Status line, and the API's reasons when a publish or save was refused. */}
          <p className={STYLES.statusLine} data-kr-element="publishing-status-line" role="status">
            Selected: {item ? `${item.title} · ${formatShortDate(item.publishedAt)}` : 'none'} · {status}
          </p>
          {problems.length ? (
            <ul aria-label="Reasons" className={`${LAYOUT_STYLES.problems} ${STYLES.problems}`} data-kr-element="publishing-action-problems">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          ) : null}
        </div>

        {/* Right column: the preview and the images with their licenses (hideable). */}
        {previewCollapsed ? null : (
          <div className={LAYOUT_STYLES.stack} data-kr-element="publishing-preview-stack">
            <PublicationPreviewPanel collapsible draft={draft} item={item} sanitizerResult={sanitizerResult} onToggleCollapsed={() => setPreviewCollapsed(true)} />
            <ArticleImagesCard item={item} key={`${item?.id ?? 'none'}:${item?.updatedAt ?? ''}`} mayEdit={!busy} saving={savingLicenses} onSaveLicenses={(images) => void saveLicenses(images)} />
          </div>
        )}
      </div>

      {/* Dialogs: download packages, upload a package, delete a draft. */}
      {downloadOpen ? <ArticleDownloadDialog items={items} selectedId={item?.id ?? null} onClose={() => setDownloadOpen(false)} /> : null}
      <PackageUploadDialog contentType="article" mayEdit={mayPublish && !busy} open={uploadOpen} onClose={() => setUploadOpen(false)} onPackageAccepted={savePackageAsDraft} />
      <PublishingDeleteDialog busy={savingAction} error={deleteError} item={deleteTarget} key={deleteTarget?.id ?? 'none'} onCancel={() => setDeleteTarget(null)} onConfirm={(confirmation) => void confirmDelete(confirmation)} />
    </section>
  )
}
