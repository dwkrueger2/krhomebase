'use client'
// file: apps/web/features/matters/components/ClientMattersCard.client.tsx
/**
 * The Projects & Matters tab of an open client: the matter selector beside the summary and the selected matter's
 * card, plus the Add/Edit/Delete dialog. Ported from the old `hb-components/KR-EditMatter/ClientMattersCard.tsx`;
 * `data-kr-id="ClientMattersCard-<client number>"` kept (the requester, Nov 13, 2026).
 *
 * State: the Contact Detail workspace owns the client's matters (`useClientMatters`), because the Detail tab's
 * ASSOCIATED MATTERS box shows the same list; this card owns the selection and the dialog. A save or delete is put
 * into the shared list at once (`upsert`, `remove`), as the old `onMattersChange` did.
 *
 * Changed from the old file: the grid is one column under 1024px and `minmax(200px,0.72fr) minmax(0,2.28fr)` from
 * `lg:` (the three designed widths; the old break was 760px); loading and load failures are shown (the old card fell
 * back silently to the contact's own list); Add and Edit show only when the API says the viewer may write.
 */

import type { Matter } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { ClientMattersState } from '../useClientMatters.client'
import MatterEditCard from './MatterEditCard.client'
import MatterSelector from './MatterSelector.client'
import MattersSummaryCard from './MattersSummaryCard.client'
import SelectedMatterDetailsCard from './SelectedMatterDetailsCard.client'

const STYLES = {
  notice: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  retryButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  matterWorkspace: 'gap-[8px] grid min-w-0 items-start grid-cols-1 lg:grid-cols-[minmax(200px,0.72fr)_minmax(0,2.28fr)]',
  cardStack: 'gap-[8px] grid min-w-0',
  notice: 'p-[8px] gap-[6px] flex items-center',
} as const

/** Props for the client-facing matters workspace. */
export interface ClientMattersCardProps {
  clientId: string
  clientNumber: string | null
  displayName: string
  /** The shared matters list (owned by the Contact Detail workspace). */
  state: ClientMattersState
  /** A matter chosen elsewhere (the Detail tab's ASSOCIATED MATTERS box). */
  requestedMatterId?: string | null
}

/**
 * Renders the client matter selector, summary, selected detail card, and the dialog used to create, edit, or
 * guarded-delete a matter.
 */
export default function ClientMattersCard({ clientId, clientNumber, displayName, requestedMatterId = null, state }: ClientMattersCardProps) {
  const matters = state.data?.matters ?? []
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(requestedMatterId ?? matters[0]?.id ?? null)
  const [editingMatter, setEditingMatter] = useState<Matter | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Keep the selection valid: the requested matter when it exists, else the current one, else the first.
  useEffect(() => {
    setSelectedMatterId((current) =>
      requestedMatterId && matters.some((matter) => matter.id === requestedMatterId)
        ? requestedMatterId
        : matters.some((matter) => matter.id === current)
          ? current
          : (matters[0]?.id ?? null),
    )
  }, [matters, requestedMatterId])

  const canWrite = Boolean(state.data?.viewer.canWrite)
  const canDelete = Boolean(state.data?.viewer.canDelete)
  const selectedMatter = matters.find((matter) => matter.id === selectedMatterId) ?? null
  const krId = `ClientMattersCard-${clientNumber ?? clientId}`

  if (!state.data) {
    return (
      <section className={LAYOUT_STYLES.notice} data-kr-component="ClientMattersCard" data-kr-id={krId}>
        {/* Loading or failed load: the spinner, or the plain sentence with Try again. */}
        {state.loading ? <RainbowBusySpinner busy hideWhenIdle={false} label="Loading matters..." size={18} /> : null}
        {state.error ? (
          <>
            <p className={STYLES.error} role="alert">{state.error}</p>
            <button className={STYLES.retryButton} type="button" onClick={state.reload}>Try again</button>
          </>
        ) : null}
        {!state.loading && !state.error ? <p className={STYLES.notice}>No matters are available for this client.</p> : null}
      </section>
    )
  }

  return (
    <>
      <section className={LAYOUT_STYLES.matterWorkspace} data-kr-component="ClientMattersCard" data-kr-element="matter-workspace" data-kr-id={krId}>
        {/* Client matters grid: keeps the narrow selector beside the summary and detail cards. */}
        <MatterSelector
          clientNumber={clientNumber}
          displayName={displayName}
          matters={matters}
          selectedMatterId={selectedMatterId}
          onAddMatter={canWrite ? () => { setEditingMatter(null); setDialogOpen(true) } : undefined}
          onSelectMatter={setSelectedMatterId}
        />
        <div className={LAYOUT_STYLES.cardStack}>
          <MattersSummaryCard matters={matters} />
          <SelectedMatterDetailsCard matter={selectedMatter} onEditMatter={canWrite ? (matter) => { setEditingMatter(matter); setDialogOpen(true) } : undefined} />
        </div>
      </section>
      <MatterEditCard
        canDelete={canDelete}
        clientId={clientId}
        clientNumber={clientNumber}
        matter={editingMatter}
        open={dialogOpen}
        statuses={state.data.statuses}
        onClose={() => setDialogOpen(false)}
        onDeleted={(matterId) => {
          state.remove(matterId)
          setSelectedMatterId(null)
          setDialogOpen(false)
        }}
        onSaved={(matter) => {
          state.upsert(matter)
          setSelectedMatterId(matter.id)
          setDialogOpen(false)
        }}
      />
    </>
  )
}
