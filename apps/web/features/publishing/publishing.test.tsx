// file: apps/web/features/publishing/publishing.test.tsx
/**
 * Front End Publishing screens (plan 10, stage 6): the pure helpers in `publishingRows.ts` (labels, paging joins, the
 * change body and the license body checked against the contract, the delete confirmation, the upload dialog's text,
 * the preview document), the API client's error class and file-name reader, and first draws rendered to text with
 * `react-dom/server` of the ledger (rows, empty, loading, failure, the "more exist" line, Delete only with
 * `canDelete`), the upload dialog drawn `inline` with a refused package, Article Details (draft and published), the
 * images card with its license fields, and the panel with the migration-required notice. Every save goes to the live
 * database and bucket, so nothing here calls the API. Made-up items only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/publishing
 */

import { PublishingImageInput, PublishingItemUpdateBody, type ArticlePackageCheckData, type ContentAsset, type PublishingItem, type PublishingItemSummary } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseFileName, PUBLISHING_ERROR_SENTENCES, PUBLISHING_MIGRATION_NOTICE, PublishingApiError } from '@/features/publishing/api.client'
import ArticleEditCard from '@/features/publishing/components/ArticleEditCard.client'
import ArticleImagesCard from '@/features/publishing/components/ArticleImagesCard.client'
import FrontEndPublishingPanel from '@/features/publishing/components/FrontEndPublishingPanel.client'
import PackageUploadDialog from '@/features/publishing/components/PackageUploadDialog.client'
import PublishingQueueLedger, { type PublishingQueueLedgerProps } from '@/features/publishing/components/PublishingQueueLedger.client'
import {
  apiPathLabel,
  appendItems,
  canonicalPathForDraft,
  contentCode,
  deleteConfirmationText,
  draftFromItem,
  draftIsDirty,
  draftProblem,
  formatIssues,
  formatShortDate,
  itemUpdateBody,
  licenseDraftsFromItem,
  licenseImagesBody,
  licenseProblem,
  moreItemsLine,
  publishedCell,
  slugify,
  srcDocFor,
  statusCounts,
  unlicensedImagePaths,
  upsertItem,
  validationSuccessText,
} from '@/features/publishing/publishingRows'
import { sanitizeArticleHtml } from '@/features/publishing/sanitizeArticleHtml.client'

const summary = (id: string, title: string, extra: Partial<PublishingItemSummary> = {}): PublishingItemSummary => ({
  id,
  displayCode: null,
  contentType: 'article',
  slug: id.replace(/^article_/, ''),
  topicSlug: null,
  canonicalPath: `/articles/${id.replace(/^article_/, '')}`,
  title,
  summary: 'A short teaser.',
  status: 'draft',
  category: 'estate-planning',
  categoryLabel: 'Estate planning',
  pillar: null,
  authorDisplayName: 'Ann Example',
  thumbnailUrl: null,
  thumbnailAlt: '',
  imageCount: 0,
  unlicensedImageCount: 0,
  publishedAt: null,
  unpublishedAt: null,
  archivedAt: null,
  createdAt: '2026-11-10T15:00:00.000Z',
  updatedAt: null,
  createdByUserId: 'u1',
  createdByName: 'Dan Example',
  updatedByUserId: null,
  updatedByName: null,
  ...extra,
})

const ITEMS = [
  summary('article_wills-101', 'Wills 101', { displayCode: 'Article 001', status: 'published', publishedAt: '2026-11-11T15:00:00.000Z' }),
  summary('article_trusts', 'Trusts explained', { displayCode: 'Article 002' }),
  summary('answer_probate-steps', 'Probate steps', { contentType: 'answer', status: 'archived', pillar: 'Estate Planning', topicSlug: 'probate-steps', canonicalPath: '/answers/estate-planning/probate-steps', category: null, categoryLabel: 'Answers' }),
]

const asset = (path: string, extra: Partial<ContentAsset> = {}): ContentAsset => ({
  id: `asset_${path.replace(/\W/g, '')}`,
  originalPath: path,
  key: `images/article/trusts/abcdef123456-${path.split('/').pop()}`,
  url: `/api/v1/publishing/assets/${encodeURIComponent(`images/article/trusts/abcdef123456-${path.split('/').pop()}`)}`,
  mimeType: 'image/jpeg',
  fileSize: 1024,
  width: 800,
  height: 450,
  usage: 'body',
  altText: 'A family at a table',
  license: null,
  ...extra,
})

const fullItem = (extra: Partial<PublishingItem> = {}): PublishingItem => ({
  ...summary('article_trusts', 'Trusts explained', { displayCode: 'Article 002', imageCount: 2, unlicensedImageCount: 1 }),
  seoTitle: 'Trusts explained | Example',
  seoDescription: null,
  readingTimeMinutes: 5,
  thumbnailKey: 'images/article/trusts/abcdef123456-hero.jpg',
  html: '<h1>Trusts explained</h1><p>Text.</p><img src="/api/v1/publishing/assets/images%2Farticle%2Ftrusts%2Fabcdef123456-hero.jpg" alt="A family at a table">',
  stylesheetUrl: '/api/v1/publishing/assets/stylesheets%2Farticle%2Ftrusts%2Fabcdef123456-article.css',
  hasSourcePackage: true,
  lastPublicationKey: null,
  assets: [
    asset('images/hero.jpg', { usage: 'both' }),
    asset('images/chart.png', {
      mimeType: 'image/png',
      license: { kind: 'firm_owned', source: 'The firm', reference: null, attribution: null, recordedAt: '2026-11-12T15:00:00.000Z', recordedByUserId: 'u1', recordedByName: 'Dan Example' },
    }),
  ],
  publishProblems: ['PUBLISH_REQUIRES_IMAGE_LICENSE:images/hero.jpg'],
  ...extra,
})

const ledger = (props: Partial<PublishingQueueLedgerProps> = {}) =>
  renderToStaticMarkup(
    <PublishingQueueLedger
      canDelete={false}
      error=""
      hasMore={false}
      items={ITEMS}
      loading={false}
      loadingMore={false}
      moreNote={null}
      onArchive={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onLoadMore={() => {}}
      onPublish={() => {}}
      onRetry={() => {}}
      onSelect={() => {}}
      onUnpublish={() => {}}
      {...props}
    />,
  )

describe('labels', () => {
  it('reads the old labels', () => {
    expect(formatShortDate(null)).toBe('—')
    expect(contentCode(ITEMS[0]!)).toBe('Article 001')
    expect(contentCode({ displayCode: null, contentType: 'answer' })).toBe('Answer pending')
    expect(publishedCell(ITEMS[1]!)).toBe('Un Published')
    expect(slugify(' Estate Planning! ')).toBe('estate-planning')
    expect(statusCounts(ITEMS)).toEqual({ published: 1, draft: 1, archived: 1 })
    expect(apiPathLabel('/api/v1/publishing/assets/x')).toBe('[DOMAIN]/api/v1/publishing/assets/x')
  })

  it('writes the typed delete confirmation the API expects', () => {
    expect(deleteConfirmationText(ITEMS[1]!)).toBe('Delete Article 002')
    expect(deleteConfirmationText({ displayCode: null, id: 'answer_x' })).toBe('Delete answer_x')
  })
})

describe('paging (D10)', () => {
  it('joins pages without repeating an item and puts a saved item in place', () => {
    const joined = appendItems(ITEMS.slice(0, 2), ITEMS.slice(1))
    expect(joined.map((item) => item.id)).toEqual(['article_wills-101', 'article_trusts', 'answer_probate-steps'])
    const renamed = { ...ITEMS[1]!, title: 'Trusts, explained' }
    expect(upsertItem(ITEMS, renamed)[1]!.title).toBe('Trusts, explained')
    expect(upsertItem(ITEMS, summary('article_new', 'New'))[0]!.id).toBe('article_new')
  })

  it('says when more items exist, with the API line first', () => {
    expect(moreItemsLine(50, false, null)).toBe('')
    expect(moreItemsLine(50, true, 'More items exist. Load more.')).toBe('More items exist. Load more.')
    expect(moreItemsLine(50, true, null)).toContain('newest 50')
  })
})

describe('the change body', () => {
  it('sends only the changed fields, with empty optional text as null', () => {
    const item = fullItem()
    const draft = { ...draftFromItem(item), title: ' Trusts, explained ', seoTitle: '', readingTimeMinutes: '7', pillar: 'ignored for an article' }
    const body = itemUpdateBody(item, draft)
    expect(body).toEqual({ title: 'Trusts, explained', seoTitle: null, readingTimeMinutes: 7 })
    expect(PublishingItemUpdateBody.parse(body)).toEqual(body)
    expect(draftIsDirty(item, draftFromItem(item))).toBe(false)
    expect(itemUpdateBody(item, draftFromItem(item))).toEqual({})
  })

  it('names a problem before sending', () => {
    const item = fullItem()
    expect(draftProblem(item, { ...draftFromItem(item), title: ' ' })).toBe('A title is required.')
    expect(draftProblem(item, { ...draftFromItem(item), readingTimeMinutes: 'five' })).toContain('whole number')
  })

  it('works out the public path the old way', () => {
    const answer = { contentType: 'answer' as const, slug: 'probate-steps' }
    expect(canonicalPathForDraft(answer, { pillar: 'Estate Planning', topicSlug: '', title: '' })).toBe('/answers/estate-planning/probate-steps')
    expect(canonicalPathForDraft({ contentType: 'article', slug: 'trusts' }, { pillar: '', topicSlug: '', title: '' })).toBe('/articles/trusts')
  })
})

describe('image licenses (D25)', () => {
  it('sends only changed licenses by image path, and a cleared one as null', () => {
    const item = fullItem()
    const drafts = licenseDraftsFromItem(item)
    drafts['images/hero.jpg'] = { kind: 'stock', source: ' Example Stock ', reference: 'ORD-1', attribution: '' }
    drafts['images/chart.png'] = { kind: '', source: '', reference: '', attribution: '' }
    const images = licenseImagesBody(item.assets, drafts)
    expect(images).toEqual([
      { originalPath: 'images/hero.jpg', license: { kind: 'stock', source: 'Example Stock', reference: 'ORD-1', attribution: null } },
      { originalPath: 'images/chart.png', license: null },
    ])
    for (const image of images) expect(PublishingImageInput.parse(image)).toEqual(image)
  })

  it('requires a kind and a source, and leaves an unfinished license out', () => {
    expect(licenseProblem({ kind: '', source: 'x', reference: '', attribution: '' })).toBe('Choose the kind of license.')
    expect(licenseProblem({ kind: 'stock', source: ' ', reference: '', attribution: '' })).toContain('who owns')
    const item = fullItem()
    expect(licenseImagesBody(item.assets, { 'images/hero.jpg': { kind: 'stock', source: '', reference: '', attribution: '' } })).toEqual([])
  })

  it('reads the unlicensed images from the publish problems', () => {
    expect([...unlicensedImagePaths(['PUBLISH_REQUIRES_SUMMARY', 'PUBLISH_REQUIRES_IMAGE_LICENSE:images/a.jpg'])]).toEqual(['images/a.jpg'])
  })
})

describe('upload text, preview and the API client', () => {
  it('formats a refusal and an accepted package in the old wording', () => {
    const refused = formatIssues('The package was refused. See the list of problems.', ['PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_0_found_total_0'], ['THUMBNAIL_TIP_x'])
    expect(refused).toContain('Validation errors:\n- PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE')
    expect(refused).toContain('Warnings and image tips:\n- THUMBNAIL_TIP_x')
    const accepted = validationSuccessText('trusts.zip', 'answer', { htmlFileName: 'article.html', images: [{} as ArticlePackageCheckData['images'][number]], warnings: [], existingStatus: null })
    expect(accepted).toContain('Zip File "trusts.zip" validated.')
    expect(accepted).toContain('Located 1 html file, 1 image file.')
    expect(accepted).toContain('Click SAVE ANSWER BLOG')
    expect(accepted).toContain('needs a license before Publish')
  })

  it('builds the preview document with the stylesheet and escapes the title', () => {
    const doc = srcDocFor('A <b> title', '<p>Body</p>', '/api/v1/publishing/assets/stylesheets%2Fa.css')
    expect(doc).toContain('<title>A &lt;b&gt; title</title>')
    expect(doc).toContain('<link rel="stylesheet" href="/api/v1/publishing/assets/stylesheets%2Fa.css" />')
    expect(srcDocFor('', '', null)).toContain('No HTML body selected.')
    // Outside a browser the preview pass returns the text unchanged with its images.
    expect(sanitizeArticleHtml(fullItem().html).imageSources).toHaveLength(1)
  })

  it('carries the problem lists and has the migration sentence', () => {
    const error = new PublishingApiError('PUBLISHING_PUBLISH_REFUSED', 'Not yet.', 422, 'req-1', { problems: ['PUBLISH_REQUIRES_SUMMARY'] })
    expect(error.problems).toEqual(['PUBLISH_REQUIRES_SUMMARY'])
    expect(error.warnings).toEqual([])
    expect(PUBLISHING_ERROR_SENTENCES.PUBLISHING_MIGRATION_REQUIRED).toBe('Image licenses need database migration 031 before articles can be listed or saved.')
    expect(parseFileName('attachment; filename="Article 002-trusts.zip"', 'x.zip')).toBe('Article 002-trusts.zip')
    expect(parseFileName("attachment; filename*=UTF-8''Article%20002.zip", 'x.zip')).toBe('Article 002.zip')
    expect(parseFileName(null, 'x.zip')).toBe('x.zip')
  })
})

describe('the ledger', () => {
  it('draws one row per item with its title, author and published date', () => {
    const html = ledger()
    expect(html).toContain('data-kr-id="FrontEndPublishingQueueLedger"')
    expect(html).toContain('Wills 101')
    expect(html).toContain('Trusts explained')
    expect(html).toContain('Un Published')
    expect(html).toContain('aria-label="Publish"')
    expect(html).toContain('aria-label="Archive / Unpublish"')
  })

  it('shows Delete Draft only with canDelete, and never on a published row', () => {
    expect(ledger()).not.toContain('Delete Draft')
    const html = ledger({ canDelete: true })
    expect(html.match(/aria-label="Delete Draft"/g)).toHaveLength(2)
  })

  it('says when the list is empty, loading or failed', () => {
    expect(ledger({ items: [] })).toContain('No articles or answers are ready yet.')
    expect(ledger({ loading: true })).toContain('data-kr-element="publishing-ledger-loading"')
    const failed = ledger({ error: 'Front End Publishing cannot be reached right now.' })
    expect(failed).toContain('Front End Publishing cannot be reached right now.')
    expect(failed).toContain('Try again')
  })

  it('draws the more line while more items exist', () => {
    const html = ledger({ hasMore: true, moreNote: 'More items exist. Load the next page.' })
    expect(html).toContain('More items exist. Load the next page.')
    expect(html).toContain('Load more articles')
    expect(ledger()).not.toContain('Load more articles')
  })
})

describe('the upload dialog', () => {
  it('lists a refused package with its problems and warnings', () => {
    const refusal = new PublishingApiError('PUBLISHING_PACKAGE_REFUSED', 'The package was refused. See the list of problems.', 422, 'req-2', {
      problems: ['PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_0_found_total_0', 'IMAGE_ALT_TEXT_REQUIRED:images/a.jpg'],
      warnings: ['IMAGE_FILENAME_TIP_images/IMG_0001.jpg'],
    })
    const html = renderToStaticMarkup(<PackageUploadDialog initialCheck={{ fileName: 'bad.zip', refusal }} inline mayEdit open onClose={() => {}} onPackageAccepted={async () => {}} />)
    expect(html).toContain('data-kr-id="PackageUploadDialog"')
    expect(html).toContain('data-kr-theme-scope="krhomebase"')
    expect(html).toContain('Upload Article ZIP Package')
    expect(html).toContain('bad.zip')
    expect(html).toContain('Package rejected. Copy the validation text and correct the ZIP package.')
    expect(html).toContain('- PACKAGE_REQUIRES_EXACTLY_ONE_ROOT_HTML_FILE:found_root_0_found_total_0')
    expect(html).toContain('- IMAGE_ALT_TEXT_REQUIRED:images/a.jpg')
    expect(html).toContain('- IMAGE_FILENAME_TIP_images/IMG_0001.jpg')
    expect(html).not.toContain('Click <strong')
  })

  it('draws nothing while closed', () => {
    expect(renderToStaticMarkup(<PackageUploadDialog inline mayEdit open={false} onClose={() => {}} onPackageAccepted={async () => {}} />)).toBe('')
  })
})

describe('Article Details', () => {
  it('draws the fields of a draft and the publish check', () => {
    const html = renderToStaticMarkup(<ArticleEditCard draft={draftFromItem(fullItem())} item={fullItem()} mayEdit sanitizerResult={{ html: '', removed: [], imageSources: [] }} onDraftChange={() => {}} onSanitizeHtml={() => {}} onSaveDraft={() => {}} />)
    expect(html).toContain('data-kr-id="PublicationMetadataEditor"')
    expect(html).toContain('Article 002')
    expect(html).toContain('Read Time (minutes)')
    expect(html).toContain('SEO Alt Text')
    expect(html).toContain('PUBLISH_REQUIRES_IMAGE_LICENSE:images/hero.jpg')
    expect(html).toContain('https://krueger-richard.com/articles/trusts')
    expect(html).not.toContain('This item is published.')
  })

  it('shows a published item read-only with a note', () => {
    const item = fullItem({ status: 'published', publishProblems: [] })
    const html = renderToStaticMarkup(<ArticleEditCard draft={draftFromItem(item)} item={item} mayEdit sanitizerResult={{ html: '', removed: [], imageSources: [] }} onDraftChange={() => {}} onSanitizeHtml={() => {}} onSaveDraft={() => {}} />)
    expect(html).toContain('This item is published. Only its image licenses may change')
    expect(html).toContain('readOnly=""')
    expect(html).toContain('ready to publish')
  })
})

describe('the images card', () => {
  it('draws license fields for every image and marks the unlicensed one', () => {
    const html = renderToStaticMarkup(<ArticleImagesCard item={fullItem()} mayEdit onSaveLicenses={() => {}} />)
    expect(html).toContain('data-kr-id="ArticleImagesCard-KRModuleCard"')
    expect(html.match(/data-kr-element="article-image-row"/g)).toHaveLength(2)
    expect(html.match(/License needed before Publish\./g)).toHaveLength(1)
    expect(html).toContain('Stock license')
    expect(html).toContain('value="The firm"')
    expect(html).toContain('Owned by the firm recorded')
    expect(html).toContain('by Dan Example')
    expect(html).toContain('Save licenses')
    expect(html).toContain('src="/api/v1/publishing/assets/images%2Farticle%2Ftrusts%2Fabcdef123456-hero.jpg"')
  })

  it('says when no images are attached', () => {
    expect(renderToStaticMarkup(<ArticleImagesCard item={null} mayEdit onSaveLicenses={() => {}} />)).toContain('No article images are attached to the selected item.')
  })
})

describe('the panel', () => {
  it('shows the migration notice when migration 031 is missing', () => {
    const html = renderToStaticMarkup(<FrontEndPublishingPanel initialError={{ code: 'PUBLISHING_MIGRATION_REQUIRED', message: PUBLISHING_MIGRATION_NOTICE }} />)
    expect(html).toContain('data-kr-element="publishing-migration-notice"')
    expect(html).toContain(PUBLISHING_MIGRATION_NOTICE)
  })

  it('draws a first page with the counts and Delete only for a super admin', () => {
    const page = { items: ITEMS, hasMore: false, moreNote: null, nextCursor: null }
    const viewer = { userId: 'u1', displayName: 'Dan Example', email: 'dan@example.com', role: 'front_end_author' }
    const author = renderToStaticMarkup(<FrontEndPublishingPanel initialData={{ ...page, viewer: { canDelete: false } }} viewer={viewer} />)
    expect(author).toContain('Role: Front End Author.')
    expect(author).toContain('Front End Article List')
    expect(author).not.toContain('Delete Draft')
    const admin = renderToStaticMarkup(<FrontEndPublishingPanel initialData={{ ...page, viewer: { canDelete: true } }} initialItem={fullItem()} viewer={{ ...viewer, role: 'super_admin' }} />)
    expect(admin).toContain('Delete Draft')
    expect(admin).toContain('data-kr-id="PublicationPreviewPanel-KRModuleCard"')
    expect(admin).toContain('Preparing preview...')
  })
})
