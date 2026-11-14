'use client'
// file: apps/web/features/publishing/components/PublishingQueueLedger.client.tsx
/**
 * Article and Answer list for Front End Publishing (plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/PublishingQueueLedger.client.tsx`: the shared ledger
 * (`KRLedgerTable`, settings key `kr_front_end_publishing_ledger_v4`) with Title (content-type disc and title), Author
 * and Published columns, the status disc leading the action rail, the pencil and double-click to open a row in
 * Article Details, and the row actions Publish (any status but published), Archive / Unpublish (published), Archive
 * (kept hidden, as before) and Delete Draft (not published; super admin only).
 *
 * Changed:
 *  - The action icons are `KRHomebaseIcons` (the old 🚀, ↩, 🗄 and 🗑 were emoji and glyphs): Send, Reply,
 *    PublicationArchived and Trash.
 *  - Delete Draft shows only when the list's `viewer.canDelete` says so (the API's answer), not from the role here.
 *  - Rows stay in the API's order (newest first, D10); the old default sort by Published date is dropped so later
 *    pages join below. A heading still sorts on click.
 *  - The rows are paged by the ledger (its footer) because "Load more" can bring more than one page of 50.
 *  - Loading shows `RainbowBusySpinner`, a failure the API's sentence with Try again, and while more items exist the
 *    API's line and "Load more articles" (D10). The old screen put these in its status line.
 *
 * The panel (`FrontEndPublishingPanel`) owns the items, the selection, the paging and the actions; this component
 * draws them only.
 */

import type { PublishingItemSummary } from '@krhomebase/contracts'
import KRLedgerTable from '@/components/tables/KRLedgerTable.client'
import type { KRLedgerColumn, KRLedgerRowAction } from '@/components/tables/ledgerTypes'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { humanizeLabel, moreItemsLine, publishedCell } from '../publishingRows'
import PublicationStatusIcon, { PublicationContentTypeIcon } from './PublicationStatusIcon.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  titleText: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  actionIcon: 'size-[12px]',
  status: 'text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  more: 'border-t border-(--kr-theme-line) bg-(--kr-theme-shell-surface) text-[10.5px] text-(color:--kr-theme-text-muted)',
  moreButton:
    'min-h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
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
  // Title cell: the content-type disc, then the title cut with an ellipsis (old .ledgerTitleCell).
  titleCell: 'pr-[10px] gap-[5px] inline-flex max-w-full min-w-0 items-center align-middle',
  state: 'p-[8px] gap-[6px] flex items-center',
  more: 'px-[6px] py-[3px] gap-[6px] flex flex-wrap items-center justify-between',
  moreButton: 'px-[8px] py-[1px] gap-[4px] inline-flex items-center',
} as const

function titleCell(item: PublishingItemSummary) {
  return (
    <span className={LAYOUT_STYLES.titleCell} title={item.title}>
      <PublicationContentTypeIcon contentType={item.contentType} size={14} />
      <span className={STYLES.titleText}>{item.title}</span>
    </span>
  )
}

const columns: Array<KRLedgerColumn<PublishingItemSummary>> = [
  { id: 'title', label: 'Title', accessor: 'title', sortable: true, width: '100%', render: titleCell, title: (item) => item.title },
  { id: 'authorDisplayName', label: 'Author', accessor: (item) => item.authorDisplayName ?? 'Krueger & Richard', sortable: true, width: '132px', title: (item) => item.authorDisplayName ?? 'Krueger & Richard' },
  { id: 'publishedAt', label: 'Published', accessor: 'publishedAt', sortable: true, width: '112px', render: publishedCell },
]

export interface PublishingQueueLedgerProps {
  items: PublishingItemSummary[]
  selectedId?: string | null
  /** The list's `viewer.canDelete` (super admin): shows Delete Draft on rows that are not published. */
  canDelete: boolean
  /** True while an action runs: the row actions are disabled. */
  busy?: boolean
  onSelect: (item: PublishingItemSummary) => void
  onEdit: (item: PublishingItemSummary) => void
  onPublish: (item: PublishingItemSummary) => void
  onUnpublish: (item: PublishingItemSummary) => void
  onArchive: (item: PublishingItemSummary) => void
  onDelete: (item: PublishingItemSummary) => void
  loading: boolean
  /** The reason the list could not be read, or "". */
  error: string
  onRetry: () => void
  /** More items exist beyond the loaded ones (D10), with the API's line. */
  hasMore: boolean
  moreNote: string | null
  loadingMore: boolean
  onLoadMore: () => void
  settingsKey?: string
}

/**
 * Renders the article and answer rows with their loading, failure, empty and "more exist" states.
 *
 * @param props - The loaded items in the API's order, the selection, the row actions and the list state.
 * @returns The `FrontEndPublishingQueueLedger` table, or the loading or failure line in its place.
 */
export default function PublishingQueueLedger({
  busy = false,
  canDelete,
  error,
  hasMore,
  items,
  loading,
  loadingMore,
  moreNote,
  onArchive,
  onDelete,
  onEdit,
  onLoadMore,
  onPublish,
  onRetry,
  onSelect,
  onUnpublish,
  selectedId,
  settingsKey = 'kr_front_end_publishing_ledger_v4',
}: PublishingQueueLedgerProps) {
  const actions: Array<KRLedgerRowAction<PublishingItemSummary>> = [
    {
      id: 'publish',
      label: 'Publish',
      icon: <KRHomebaseIcons.Send className={STYLES.actionIcon} />,
      hidden: (item) => item.status === 'published',
      disabled: () => busy,
      onClick: onPublish,
    },
    {
      id: 'unpublish',
      label: 'Archive / Unpublish',
      icon: <KRHomebaseIcons.Reply className={STYLES.actionIcon} />,
      hidden: (item) => item.status !== 'published',
      disabled: () => busy,
      onClick: onUnpublish,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: <KRHomebaseIcons.PublicationArchived className={STYLES.actionIcon} />,
      // Hidden, as on the old screen: Archive / Unpublish takes a published item down.
      hidden: () => true,
      onClick: onArchive,
    },
    {
      id: 'delete',
      label: 'Delete Draft',
      icon: <KRHomebaseIcons.Trash className={STYLES.actionIcon} />,
      hidden: (item) => !(canDelete && item.status !== 'published'),
      disabled: () => busy,
      onClick: onDelete,
    },
  ]
  const moreLine = moreItemsLine(items.length, hasMore, moreNote)

  if (loading) {
    return (
      <div className={`${LAYOUT_STYLES.state} ${STYLES.status}`} data-kr-element="publishing-ledger-loading" role="status">
        <RainbowBusySpinner busy hideWhenIdle={false} label="Loading articles..." size={16} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={LAYOUT_STYLES.state} data-kr-element="publishing-ledger-error" role="alert">
        <p className={STYLES.error}>{error}</p>
        <button className={`${LAYOUT_STYLES.moreButton} ${STYLES.moreButton}`} type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div data-kr-element="publishing-ledger">
      {/* The rows: the shared ledger with the status disc leading each action rail. */}
      <KRLedgerTable
        columns={columns}
        emptyMessage="No articles or answers are ready yet. Use Upload Article to add a package."
        getRowTitle={(item) => `${item.title}: ${humanizeLabel(item.status)} · ${item.canonicalPath}`}
        krId="FrontEndPublishingQueueLedger"
        pagination
        rowActions={actions}
        rowActionsLeadingContent={(item) => <PublicationStatusIcon status={item.status} size={20} />}
        rows={items}
        selectedRowId={selectedId}
        settingsKey={settingsKey}
        onRowDoubleClick={onEdit}
        onRowEdit={onEdit}
        onRowSelect={onSelect}
      />

      {/* D10: say when the list is not complete, and load the next page on request. */}
      {moreLine ? (
        <div className={`${LAYOUT_STYLES.more} ${STYLES.more}`} data-kr-element="publishing-ledger-more">
          <span>{moreLine}</span>
          <button className={`${LAYOUT_STYLES.moreButton} ${STYLES.moreButton}`} disabled={loadingMore} type="button" onClick={onLoadMore}>
            {loadingMore ? <RainbowBusySpinner ariaLabel="Loading more articles" busy size={12} /> : null}
            {loadingMore ? 'Loading...' : 'Load more articles'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
