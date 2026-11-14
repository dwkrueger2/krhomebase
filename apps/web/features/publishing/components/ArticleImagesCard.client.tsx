'use client'
// file: apps/web/features/publishing/components/ArticleImagesCard.client.tsx
/**
 * Editor-facing article image review card for uploaded Article/Answer packages ("Article images"; plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/ArticleImagesCard.client.tsx`. Kept: the card title and note,
 * one row per image with its name and usage, R2 Path, API Path and Alt, the thumbnail button on the right, and the
 * 300px image viewer with its dark details bar.
 *
 * Changed:
 *  - The images come from the item's `assets` (the API's `content_asset` rows), not from a manifest string; their
 *    addresses are the API's draft asset route (`draftAssetUrl`), so the thumbnails load through the API.
 *  - D25: each image has license fields (License kind, Source (required), Reference, Credit) and shows who recorded
 *    the license and when. "Save licenses" sends only the changed ones by image path in
 *    `PATCH /api/v1/publishing/items/{itemId}` (the panel does it); a cleared license is sent as null. This works
 *    while the item is published too: licenses are the one thing a published item may change. An image the API names
 *    in `PUBLISH_REQUIRES_IMAGE_LICENSE:<path>` is marked "License needed before Publish".
 *  - `<img>` replaces `next/image` (draft addresses are private and not optimized). The close buttons are 24px squares
 *    with `KRHomebaseIcons.Close` (the old ones were round × glyphs), and the old CSS module became the maps below.
 *
 * State: the license drafts live here and start again from the item whenever the panel gives a new item (the panel
 * keys this card by the item's id and last change). The panel owns saving.
 */

import { IMAGE_LICENSE_KIND_LABELS, type ContentAsset, type PublishingImageInput, type PublishingItem } from '@krhomebase/contracts'
import { useState } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import {
  apiPathLabel,
  formatShortDate,
  imageNameFromR2Key,
  LICENSE_KIND_CHOICES,
  licenseChanged,
  licenseDraftsFromItem,
  licenseImagesBody,
  licenseProblem,
  r2PathLabel,
  unlicensedImagePaths,
  type LicenseDraft,
} from '../publishingRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  imageCard: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  imageCardNeedsLicense: 'rounded-[3px] border border-(--kr-theme-danger) bg-(--kr-theme-muted-surface)',
  imageName: 'm-0 text-[12px] font-[850] leading-[1.2] text-(color:--kr-theme-text) [overflow-wrap:anywhere]',
  metaLabel: 'm-0 text-[10px] font-[850] uppercase leading-[1.25] text-(color:--kr-theme-text-muted)',
  metaValue: 'm-0 font-mono text-[10px] leading-[1.25] text-(color:--kr-theme-text) [overflow-wrap:anywhere]',
  needsLicense: 'm-0 text-[11px] font-[800] text-(color:--kr-theme-danger)',
  recorded: 'm-0 text-[10px] leading-[1.25] text-(color:--kr-theme-text-muted)',
  field:
    'px-[5px] py-[1px] min-h-[22px] w-full min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:opacity-60',
  problem: 'm-0 text-[11px] font-[600] text-(color:--kr-theme-danger)',
  thumbButton: 'overflow-hidden rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) cursor-zoom-in hover:border-(--kr-theme-accent) focus-visible:border-(--kr-theme-accent)',
  thumbImage: 'block h-full max-h-[112px] w-full object-contain',
  thumbEmpty: 'text-[11px] text-(color:--kr-theme-text-muted)',
  empty: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  saveButton:
    'px-[10px] py-[3px] min-h-[24px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background) disabled:cursor-not-allowed disabled:opacity-50',
  viewerBackdrop: 'bg-[rgba(9,20,31,0.62)]',
  viewer: 'overflow-hidden rounded-[4px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  viewerClose:
    'size-[24px] p-0 inline-flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.32)] bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse) cursor-pointer',
  viewerFrame: 'bg-(--kr-theme-muted-surface)',
  viewerImage: 'block max-h-[300px] max-w-[300px] object-contain',
  viewerBar: 'bg-(--kr-theme-brand-primary) text-[11px] leading-[1.25] text-(color:--kr-theme-text-inverse) [overflow-wrap:anywhere]',
  viewerBarMuted: 'opacity-[0.84]',
  icon: 'size-[12px]',
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
  list: 'm-0 p-0 gap-[8px] grid list-none',
  // One image: the details on the left, the thumbnail on the right (one column below 768px).
  imageCard: 'p-[7px] gap-[8px] grid md:grid-cols-[minmax(0,4fr)_minmax(86px,1fr)]',
  details: 'gap-[4px] grid min-w-0',
  meta: 'm-0 gap-[3px] grid',
  // A label beside its value, the old 58px label column; the license fields use the same rows.
  metaRow: 'gap-x-[3px] grid grid-cols-[58px_minmax(0,1fr)] items-center',
  thumbButton: 'p-0 flex min-h-[94px] min-w-0 items-center justify-center',
  thumbEmpty: 'p-[8px]',
  headerActions: 'gap-[6px] flex items-center',
  viewerBackdrop: 'p-[10px] fixed inset-0 z-[1100] flex items-center justify-center',
  viewer: 'relative grid w-[302px] max-w-[calc(100vw-20px)]',
  viewerClose: 'top-[7px] right-[7px] absolute z-[2]',
  viewerFrame: 'flex h-[300px] w-full items-center justify-center',
  viewerBar: 'px-[8px] py-[6px] gap-[2px] grid',
} as const

export interface ArticleImagesCardProps {
  /** The selected item, or null (the card then says no images are attached). */
  item: PublishingItem | null
  /** False while the panel saves or acts. */
  mayEdit: boolean
  /** True while the licenses are being saved. */
  saving?: boolean
  /** Saves the changed licenses; a thrown error is shown by the panel. */
  onSaveLicenses: (images: PublishingImageInput[]) => void
}

/** One image's row: name and usage, paths, alt text, license fields, and the thumbnail. */
function ImageRow({ asset, draft, editable, needsLicense, onChange, onOpen }: { asset: ContentAsset; draft: LicenseDraft; editable: boolean; needsLicense: boolean; onChange: (draft: LicenseDraft) => void; onOpen: () => void }) {
  const name = imageNameFromR2Key(asset.key)
  const problem = licenseChanged(asset, draft) ? licenseProblem(draft) : ''
  const fieldId = (part: string) => `publishing-license-${asset.id}-${part}`
  return (
    <li className={`${LAYOUT_STYLES.imageCard} ${needsLicense ? STYLES.imageCardNeedsLicense : STYLES.imageCard}`} data-kr-element="article-image-row" data-kr-image-path={asset.originalPath}>
      <div className={LAYOUT_STYLES.details}>
        <p className={STYLES.imageName}>{name} · {asset.usage}</p>
        {/* Where the image is stored and served, and its alt text. */}
        <dl className={LAYOUT_STYLES.meta}>
          <div className={LAYOUT_STYLES.metaRow}>
            <dt className={STYLES.metaLabel}>R2 Path</dt>
            <dd className={STYLES.metaValue}>{r2PathLabel(asset.key)}</dd>
          </div>
          <div className={LAYOUT_STYLES.metaRow}>
            <dt className={STYLES.metaLabel}>API Path</dt>
            <dd className={STYLES.metaValue}>{apiPathLabel(asset.url)}</dd>
          </div>
          <div className={LAYOUT_STYLES.metaRow}>
            <dt className={STYLES.metaLabel}>Alt</dt>
            <dd className={STYLES.metaValue}>{asset.altText || '—'}</dd>
          </div>
        </dl>
        {/* License (D25): kind, source, reference and credit, label beside field. */}
        <div className={LAYOUT_STYLES.meta} data-kr-element="article-image-license">
          {needsLicense ? <p className={STYLES.needsLicense}>License needed before Publish.</p> : null}
          <div className={LAYOUT_STYLES.metaRow} data-kr-element="license-kind-row">
            <label className={STYLES.metaLabel} htmlFor={fieldId('kind')}>License</label>
            <select className={STYLES.field} disabled={!editable} id={fieldId('kind')} value={draft.kind} onChange={(event) => onChange({ ...draft, kind: event.target.value as LicenseDraft['kind'] })}>
              <option value="">Choose...</option>
              {LICENSE_KIND_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          </div>
          <div className={LAYOUT_STYLES.metaRow} data-kr-element="license-source-row">
            <label className={STYLES.metaLabel} htmlFor={fieldId('source')}>Source</label>
            <input className={STYLES.field} disabled={!editable} id={fieldId('source')} placeholder="Who owns it or where it came from (required)" value={draft.source} onChange={(event) => onChange({ ...draft, source: event.target.value })} />
          </div>
          <div className={LAYOUT_STYLES.metaRow} data-kr-element="license-reference-row">
            <label className={STYLES.metaLabel} htmlFor={fieldId('reference')}>Reference</label>
            <input className={STYLES.field} disabled={!editable} id={fieldId('reference')} placeholder="License or order number, or terms address" value={draft.reference} onChange={(event) => onChange({ ...draft, reference: event.target.value })} />
          </div>
          <div className={LAYOUT_STYLES.metaRow} data-kr-element="license-attribution-row">
            <label className={STYLES.metaLabel} htmlFor={fieldId('attribution')}>Credit</label>
            <input className={STYLES.field} disabled={!editable} id={fieldId('attribution')} placeholder="Credit line the license requires, if any" value={draft.attribution} onChange={(event) => onChange({ ...draft, attribution: event.target.value })} />
          </div>
          {problem ? <p className={STYLES.problem} role="alert">{problem}</p> : null}
          {asset.license ? (
            <p className={STYLES.recorded}>
              {IMAGE_LICENSE_KIND_LABELS[asset.license.kind]} recorded {formatShortDate(asset.license.recordedAt)}
              {asset.license.recordedByName ? ` by ${asset.license.recordedByName}` : ''}
            </p>
          ) : null}
        </div>
      </div>
      <button aria-label={`Open image preview for ${name}`} className={`${LAYOUT_STYLES.thumbButton} ${STYLES.thumbButton}`} type="button" onClick={onOpen}>
        {asset.url ? <img alt={asset.altText || name} className={STYLES.thumbImage} height={asset.height ?? 112} src={asset.url} width={asset.width ?? 160} /> : <span className={`${LAYOUT_STYLES.thumbEmpty} ${STYLES.thumbEmpty}`}>No image route</span>}
      </button>
    </li>
  )
}

/**
 * Renders the Article images card: every image of the selected item with its license fields, Save licenses, and the
 * image viewer.
 *
 * @param props - The item, whether editing is allowed, whether a save runs, and the save handler.
 * @returns The `ArticleImagesCard` module card.
 */
export default function ArticleImagesCard({ item, mayEdit, onSaveLicenses, saving = false }: ArticleImagesCardProps) {
  const [drafts, setDrafts] = useState<Record<string, LicenseDraft>>(() => (item ? licenseDraftsFromItem(item) : {}))
  const [selectedAsset, setSelectedAsset] = useState<ContentAsset | null>(null)
  const assets = item?.assets ?? []
  const needing = unlicensedImagePaths(item?.publishProblems ?? [])
  const changed = assets.filter((asset) => drafts[asset.originalPath] && licenseChanged(asset, drafts[asset.originalPath]!))
  const hasProblem = changed.some((asset) => licenseProblem(drafts[asset.originalPath]!))
  const editable = mayEdit && !saving

  function save(): void {
    if (!item || !changed.length || hasProblem) return
    onSaveLicenses(licenseImagesBody(assets, drafts))
  }

  return (
    <KRModuleCard
      actions={
        item && assets.length ? (
          <span className={LAYOUT_STYLES.headerActions}>
            {saving ? <RainbowBusySpinner ariaLabel="Saving licenses" busy size={14} /> : null}
            <button className={STYLES.saveButton} data-kr-action="save-image-licenses" disabled={!editable || !changed.length || hasProblem} type="button" onClick={save}>
              Save licenses
            </button>
          </span>
        ) : null
      }
      component="ArticleImagesCard"
      krId="ArticleImagesCard"
      note="Images attached to this Article or Answer package. Draft previews use the protected KR Homebase image route; public pages use the published-image worker after approval. Every image needs a license before Publish."
      title="Article images"
    >
      {assets.length ? (
        <ul aria-label="Article image list" className={LAYOUT_STYLES.list}>
          {assets.map((asset) => (
            <ImageRow
              asset={asset}
              draft={drafts[asset.originalPath] ?? { kind: '', source: '', reference: '', attribution: '' }}
              editable={editable}
              key={asset.id}
              needsLicense={needing.has(asset.originalPath)}
              onChange={(draft) => setDrafts((current) => ({ ...current, [asset.originalPath]: draft }))}
              onOpen={() => setSelectedAsset(asset)}
            />
          ))}
        </ul>
      ) : (
        <p className={STYLES.empty}>No article images are attached to the selected item.</p>
      )}

      {/* Image viewer: the image at up to 300px with its name, type, size and address. */}
      {selectedAsset ? (
        <div className={`${LAYOUT_STYLES.viewerBackdrop} ${STYLES.viewerBackdrop}`} data-kr-theme-scope="krhomebase" role="presentation" onMouseDown={() => setSelectedAsset(null)}>
          <section
            aria-label={`Image preview for ${imageNameFromR2Key(selectedAsset.key)}`}
            aria-modal="true"
            className={`${LAYOUT_STYLES.viewer} ${STYLES.viewer}`}
            data-kr-id="ArticleImageViewerDialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button aria-label="Close image preview" className={`${LAYOUT_STYLES.viewerClose} ${STYLES.viewerClose}`} type="button" onClick={() => setSelectedAsset(null)}>
              <KRHomebaseIcons.Close className={STYLES.icon} />
            </button>
            <div className={`${LAYOUT_STYLES.viewerFrame} ${STYLES.viewerFrame}`}>
              <img alt={selectedAsset.altText || imageNameFromR2Key(selectedAsset.key)} className={STYLES.viewerImage} height={selectedAsset.height ?? 300} src={selectedAsset.url} width={selectedAsset.width ?? 300} />
            </div>
            <div className={`${LAYOUT_STYLES.viewerBar} ${STYLES.viewerBar}`}>
              <strong>{imageNameFromR2Key(selectedAsset.key)}</strong>
              <span className={STYLES.viewerBarMuted}>{selectedAsset.mimeType} · {selectedAsset.width ?? '—'}×{selectedAsset.height ?? '—'}</span>
              <span className={STYLES.viewerBarMuted}>{apiPathLabel(selectedAsset.url)}</span>
            </div>
          </section>
        </div>
      ) : null}
    </KRModuleCard>
  )
}
