'use client'
// file: apps/web/features/publishing/components/PublicationStatusIcon.client.tsx
/**
 * Large publication status and content-type icons used by Front End Publishing (plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/PublicationStatusIcon.tsx`. Same names, statuses and glyphs;
 * the SVG drawings moved to `KRHomebaseIcons` (`PublicationPublished`, `PublicationArchived`, `PublicationDraft`,
 * `ContentArticle`, `ContentAnswer` in `components/ui/KRHomebaseIcon.client.tsx`), the one place for icons, and their
 * fixed colors became theme tokens there. This file only picks the icon and sizes it. The old `style` prop is gone
 * (no inline styles): pass a size and, when needed, a `className`.
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'

export type PublicationStatusIconVariant = 'archived' | 'draft' | 'published'
export type PublicationContentTypeIconVariant = 'article' | 'answer'

/** The sizes the screens use; each is a fixed class so Tailwind finds it. */
const SIZE_STYLES = {
  14: 'size-[14px] shrink-0',
  20: 'size-[20px] shrink-0',
  28: 'size-[28px] shrink-0',
} as const

export type PublicationIconSize = keyof typeof SIZE_STYLES

export interface PublicationStatusIconProps {
  status: PublicationStatusIconVariant | string | null | undefined
  size?: PublicationIconSize
  className?: string
}

export interface PublicationContentTypeIconProps {
  contentType: PublicationContentTypeIconVariant | string | null | undefined
  size?: PublicationIconSize
  className?: string
}

function normalizeStatus(status: PublicationStatusIconProps['status']): PublicationStatusIconVariant {
  if (status === 'published') return 'published'
  if (status === 'archived') return 'archived'
  return 'draft'
}

function titleForStatus(status: PublicationStatusIconVariant): string {
  if (status === 'published') return 'Published'
  if (status === 'archived') return 'Archived'
  return 'Draft'
}

/**
 * Draws the status disc: a tick (published), a filing box (archived) or a pencil (draft, also for `review`).
 *
 * @param props - The status, the size (20px by default) and an optional class.
 * @returns The icon, named for screen readers by its status.
 */
export default function PublicationStatusIcon({ className, size = 20, status }: PublicationStatusIconProps) {
  const normalized = normalizeStatus(status)
  const classes = [SIZE_STYLES[size], className].filter(Boolean).join(' ')
  const title = titleForStatus(normalized)
  if (normalized === 'published') return <KRHomebaseIcons.PublicationPublished className={classes} title={title} />
  if (normalized === 'archived') return <KRHomebaseIcons.PublicationArchived className={classes} title={title} />
  return <KRHomebaseIcons.PublicationDraft className={classes} title={title} />
}

/** Draws the content-type disc: a page (article) or a speech bubble (answer). */
export function PublicationContentTypeIcon({ className, contentType, size = 14 }: PublicationContentTypeIconProps) {
  const classes = [SIZE_STYLES[size], className].filter(Boolean).join(' ')
  return contentType === 'answer' ? <KRHomebaseIcons.ContentAnswer className={classes} title="Answer" /> : <KRHomebaseIcons.ContentArticle className={classes} title="Article" />
}
