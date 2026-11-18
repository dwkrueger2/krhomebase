'use client'
// file: apps/web/features/communications/components/WorkstreamContextLine.client.tsx
/**
 * The line under a WorkStream entry's title (the card and its dialog): "Client 090 · Matter 090.0 · <types> · WSID
 * SHZ7GWE". Since web patch 571 (the requester, Nov 18, 2026) the owner is a code link ("Client 090" opens the client,
 * "Lead L007" the lead; `KRCodeLink`, "Following a code"), the types are colored chips (`WorkstreamTypeTags`) and a
 * task made for the entry follows as "Task #<id>". The plain-text form stays `ledgerContextLine` (tests, copies).
 */

import KRCodeLink from '@/components/ui/KRCodeLink.client'
import { clientLinkTitle } from '../communicationTypes'
import type { LedgerActivityRow } from '../workstreamLedgerRows'
import { WorkstreamTypeTags } from './WorkstreamTypeTags.client'

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  line: 'gap-x-[4px] gap-y-[2px] flex flex-wrap items-center',
} as const

export interface WorkstreamContextLineProps {
  row: LedgerActivityRow
  /** The line's text style (the card's or the dialog's). */
  className: string
  /** `dark` in the dialog (Communication Colors). */
  tone?: 'light' | 'dark'
  /** Runs before a link is followed (the dialog closes itself first). */
  onBeforeOpen?: () => void
}

/** Draws the context line with its links and colored types. */
export default function WorkstreamContextLine({ className, onBeforeOpen, row, tone = 'light' }: WorkstreamContextLineProps) {
  const { activity } = row
  const ownerLabel = activity.clientNumber ? `Client ${activity.clientNumber}` : (activity.clientDisplayName ?? 'Client')
  return (
    <p className={`${LAYOUT_STYLES.line} ${className}`} data-kr-element="workstream-context-line">
      {activity.clientId ? (
        <KRCodeLink code={activity.clientId} kind="client" title={clientLinkTitle(activity)} tone={tone} onBeforeOpen={onBeforeOpen}>
          {ownerLabel}
        </KRCodeLink>
      ) : activity.leadId ? (
        <KRCodeLink code={activity.lcid ?? activity.leadId} kind="lead" tone={tone} onBeforeOpen={onBeforeOpen}>
          {`Lead ${activity.lcid ?? activity.leadId}`}
        </KRCodeLink>
      ) : (
        <span>{ownerLabel}</span>
      )}
      <span aria-hidden="true">·</span>
      <span>Matter {row.matterNumber}</span>
      <span aria-hidden="true">·</span>
      <WorkstreamTypeTags types={row.subgroups} />
      <span aria-hidden="true">·</span>
      <span>WSID {row.id}</span>
      {activity.taskId ? (
        <>
          <span aria-hidden="true">·</span>
          <KRCodeLink code={activity.taskId} kind="task" tone={tone} onBeforeOpen={onBeforeOpen}>
            {`Task #${activity.taskId}`}
          </KRCodeLink>
        </>
      ) : null}
    </p>
  )
}
