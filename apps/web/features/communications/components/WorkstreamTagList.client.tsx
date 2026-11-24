'use client'
// file: apps/web/features/communications/components/WorkstreamTagList.client.tsx
/**
 * The list under the WorkStream editor while a tag is being typed (FB-0027, web patch 590): a one-line heading that
 * says what is being listed and how to pick, then at most six records. A click or Tab / Enter picks one
 * (`useWorkstreamTagging` owns the keys); nothing found says so. Drawn in the Communication Colors, like the context
 * suggestions beside it in `WorkStreamRTE`.
 */

import { WORKSTREAM_TAG_KIND_LABELS, type WorkstreamTagCandidate, type WorkstreamTagKind } from '../workstreamTags'

interface WorkstreamTagListProps {
  kind: WorkstreamTagKind
  prefix: string
  query: string
  candidates: readonly WorkstreamTagCandidate[]
  highlighted: number
  onHighlight: (index: number) => void
  onPick: (candidate: WorkstreamTagCandidate) => void
}

const STYLES = {
  list: 'rounded-[3px] border border-(--kr-theme-communication-accent-strong) bg-(--kr-theme-communication-surface-raised)',
  heading: 'text-[10.5px] leading-tight text-(color:--kr-theme-communication-text-subtle)',
  headingStrong: 'font-bold text-(color:--kr-theme-communication-accent)',
  option: 'px-[4px] min-h-[20px] cursor-pointer border-0 bg-transparent text-left text-[11px] leading-tight text-(color:--kr-theme-communication-text) hover:bg-(--kr-theme-communication-reaction-surface) aria-selected:bg-(--kr-theme-communication-reaction-surface)',
  primary: 'min-w-0 truncate font-bold text-(color:--kr-theme-communication-text)',
  meta: 'shrink-0 text-[10px] leading-tight text-(color:--kr-theme-communication-text-subtle)',
  empty: 'px-[4px] text-[11px] text-(color:--kr-theme-communication-text-muted)',
} as const

const LAYOUT_STYLES = {
  list: 'mt-[3px] p-[2px] gap-[1px] grid',
  heading: 'px-[4px] py-[1px]',
  options: 'gap-[1px] grid',
  option: 'gap-[4px] flex min-w-0 items-center',
} as const

/** The sentence for an empty list. */
function emptySentence(kind: WorkstreamTagKind, query: string): string {
  if (kind === 'matter') return query ? `No matter number starts with "${query}".` : 'Type a matter number, for example 077.1.'
  return query ? `No ${WORKSTREAM_TAG_KIND_LABELS[kind].toLowerCase()} match "${query}".` : 'Type part of a name or code.'
}

/** See the file comment. */
export default function WorkstreamTagList({ candidates, highlighted, kind, onHighlight, onPick, prefix, query }: WorkstreamTagListProps) {
  return (
    <div className={`${LAYOUT_STYLES.list} ${STYLES.list}`} data-kr-element="workstream-tag-list" data-kr-tag-kind={kind}>
      <div className={`${LAYOUT_STYLES.heading} ${STYLES.heading}`}>
        <strong className={STYLES.headingStrong}>{prefix} {WORKSTREAM_TAG_KIND_LABELS[kind]}</strong>
        {candidates.length ? ' · Tab or Enter picks, Esc closes' : ''}
      </div>
      {candidates.length ? (
        <div aria-label={`Tag ${WORKSTREAM_TAG_KIND_LABELS[kind]}`} className={LAYOUT_STYLES.options} role="listbox">
          {candidates.map((candidate, index) => (
            <button
              aria-selected={index === highlighted}
              className={`${LAYOUT_STYLES.option} ${STYLES.option}`}
              data-kr-element="workstream-tag-option"
              key={candidate.key}
              onClick={() => onPick(candidate)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
              role="option"
              type="button"
            >
              <span className={STYLES.primary}>{candidate.label}</span>
              <span className={STYLES.meta}>{candidate.meta}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={STYLES.empty} role="status">{emptySentence(kind, query)}</div>
      )}
    </div>
  )
}
