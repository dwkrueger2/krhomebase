'use client'
// file: apps/web/features/leads/components/LeadsPanel.client.tsx
/**
 * Leads directory and selected-Lead workspace (menu id `leads`; plan `docs/10_WorkStream_Leads_Publishing_Plan.md`,
 * stage 3). It replaces the "Module [TBD]" placeholder.
 *
 * Ported from the old `hb-components/KR-Leads/LeadsPanel.client.tsx`. Unchanged: the hero ("Lead directory", the
 * Individuals and Leads filter cards, "Lead review and follow-up: [L007] Name" while a lead is open), the five-result
 * search above the full-width ledger, a lead row opens the lead, an individual row asks "Add Individual ... to the
 * Lead List?" and then opens Create Lead for that person (not for clients, and not for people who may not create
 * leads), Add Lead opens Create Lead for a new person, leads whose person is a client are left out, the status
 * region's sentences, and the `data-kr-*` markers.
 *
 * Changed:
 *  - Calls go through `../api.client.ts` (`fetchLeads`, `updateLead`, `convertLead`; the create dialog calls
 *    `createLead`); the old screen used `fetchKRModuleApi` against `/krhomebase/api/kr-api-v1/leads`. What the viewer
 *    may do comes from the list's `viewer` (`canWrite`, `canCreate`), not from the role in the browser.
 *  - The list is newest first, 100 at a time, with "Load more leads" and a line while older leads exist (D10; the old
 *    screen read one page of 100 and stopped). "Show converted" asks the API for converted leads too
 *    (`includeConverted`); they are marked with their client number.
 *  - One lead per person: a create that finds the person's lead says "This person already has lead L007." and opens
 *    it. An individual who already has a loaded lead opens that lead instead of the "Add ... to the Lead List?" prompt.
 *  - Lead notes are Workstream `Notes` entries (the requester's decision of Nov 13, 2026): the Detail tab's Lead notes
 *    card adds and lists them, and the WorkStream tab shows the lead's whole Workstream (`CommunicationsPanel` with
 *    the lead as owner and the `viewer` from `app/page.tsx`).
 *  - Convert to client is new: it asks first (`LeadConvertDialog`, an optional client number), then says "Lead L007 is
 *    now client 501 (501.0); N Workstream entries moved.", takes the lead off the list (or marks it, when converted
 *    leads are shown), refreshes the data store and offers "Open client".
 *  - The Detail tab is `LeadDetailCard` (its own file); the edit dialog saves status, urgency, summary, practice area
 *    and the new assignee.
 *  - "Lead directory" (a button above the open lead) goes back to the list; the old screen had the shell's
 *    `selectedLeadId` and `onLeadSelectionChange` props, which this frame does not use.
 *  - Loading and saving show `RainbowBusySpinner`; diagnostics use `L` with `[LEADS_PANEL:line]`.
 *
 * State: this panel owns the loaded leads, the paging cursor, the open lead, the edit draft, the dialogs and the
 * status line. Its children take values and handlers only (the notes card loads its own notes).
 */

import { useEffect, useMemo, useState } from 'react'
import type { Lead, LeadsData } from '@krhomebase/contracts'
import { useShellNavigation } from '@/components/shell/shellNavigation'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleHero } from '@/components/ui/KRModuleHero.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import { openContact } from '@/features/contacts/openContact'
import type { KRContactRecord } from '@/features/contacts/types'
import { useContactCapabilities } from '@/features/contacts/useContactCapabilities.client'
import { L } from '@/lib/KRUtilities'
import { convertLead, fetchLeads, updateLead } from '../api.client'
import { appendLeads, conversionMessage, createdLeadMessage, directoryRows, draftFromLead, leadNumber, moreLeadsLine, upsertLead, type KRLeadContact, type KRLeadDraft } from '../leadRows'
import LeadConvertDialog from './LeadConvertDialog.client'
import LeadCreateDialog from './LeadCreateDialog.client'
import LeadDetailCard from './LeadDetailCard.client'
import LeadDetailWorkspace, { type LeadsViewer } from './LeadDetailWorkspace.client'
import LeadEditCard from './LeadEditCard.client'
import LeadIndividualConfirmDialog from './LeadIndividualConfirmDialog.client'
import LeadLedger from './LeadLedger.client'
import LeadSearch from './LeadSearch.client'

type LeadFilter = 'individuals' | 'leads'

/** Leads asked for at a time (the old screen's one page). */
const LEADS_PAGE = 100
const NO_RIGHTS: LeadsData['viewer'] = { canWrite: false, canCreate: false }
const NO_CONTACTS: readonly KRContactRecord[] = []

const LAYOUT_STYLES = {
  panel: 'p-[8px] gap-[8px] grid min-w-0',
  directory: 'gap-[6px] grid min-w-0',
  searchRow: 'gap-[6px] grid min-w-0 grid-cols-1 items-center md:grid-cols-[minmax(0,1fr)_auto]',
  converted: 'gap-[3px] inline-flex items-center',
  moreRow: 'gap-[6px] flex flex-wrap items-center',
  activeWorkspace: 'gap-[6px] grid min-w-0',
  backRow: 'flex items-center',
  statusRegion: 'gap-[3px] grid min-w-0',
  statusLine: 'gap-[6px] flex flex-wrap items-center',
  text: 'm-0',
} as const

const STYLES = {
  status: 'text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  error: 'text-[11px] leading-[1.3] text-(color:--kr-theme-danger)',
  checkLabel: 'text-[12px] text-(color:--kr-theme-text) cursor-pointer',
  button: 'px-[10px] py-[3px] gap-[4px] min-h-[26px] inline-flex items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[11px] font-extrabold text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  backIcon: 'size-[12px] rotate-90',
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

/** Props for the production Leads directory. */
export interface LeadsPanelProps {
  /** The signed-in person (from the session in `app/page.tsx`), for the WorkStream tab. Optional so the module-level panel list type-checks. */
  viewer?: LeadsViewer
  /** A first page given instead of loading one (tests draw the screen without the API). */
  initialData?: LeadsData
}

/** Renders the Leads directory, deduplicates client-converted Leads, and owns Lead selection/dialog state. */
export default function LeadsPanel({ initialData, viewer }: LeadsPanelProps) {
  const dataStore = useOptionalDataStore()
  const navigation = useShellNavigation()
  const capabilities = useContactCapabilities()
  const contacts = dataStore?.contacts ?? NO_CONTACTS
  const [leads, setLeads] = useState<Lead[]>(initialData?.leads ?? [])
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null)
  const [rights, setRights] = useState<LeadsData['viewer']>(initialData?.viewer ?? NO_RIGHTS)
  const [includeConverted, setIncludeConverted] = useState(false)
  const [loading, setLoading] = useState(!initialData)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<LeadFilter>('leads')
  const [draft, setDraft] = useState<KRLeadDraft | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [createContact, setCreateContact] = useState<KRContactRecord | null>(null)
  const [createLeadOpen, setCreateLeadOpen] = useState(false)
  const [createPromptContact, setCreatePromptContact] = useState<KRContactRecord | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [convertedPerson, setConvertedPerson] = useState<{ individualId: string; clientId: string; clientNumber: string; message: string } | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { leadRows, individualRows } = useMemo(() => directoryRows(leads, contacts, includeConverted), [contacts, includeConverted, leads])
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts])
  const visibleRows = activeFilter === 'leads' ? leadRows : individualRows
  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) ?? null, [leads, selectedLeadId])
  const selectedContact = selectedLead ? contactById.get(selectedLead.individualId) ?? null : null
  const activeLead = Boolean(selectedLead)

  // The first page of leads; again when "Show converted" changes.
  useEffect(() => {
    if (initialData) return
    let cancelled = false
    async function loadLeads(): Promise<void> {
      setLoading(true)
      setError('')
      try {
        L(`[LEADS_PANEL:132] load start includeConverted=${includeConverted}`)
        const response = await fetchLeads({ includeConverted, limit: LEADS_PAGE })
        if (cancelled) return
        setLeads(response.leads)
        setNextCursor(response.nextCursor)
        setRights(response.viewer)
        setStatus(response.leads.length ? `Loaded ${response.leads.length} operational Lead${response.leads.length === 1 ? '' : 's'}.` : 'No operational Leads are available.')
      } catch (caughtError) {
        L(`[LEADS_PANEL:140] load failed error=${caughtError instanceof Error ? caughtError.message : 'unknown'}`)
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'Could not load Leads.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadLeads()
    return () => { cancelled = true }
  }, [includeConverted, initialData])

  // The edit draft follows the open lead.
  useEffect(() => {
    setDraft(selectedLead ? draftFromLead(selectedLead) : null)
  }, [selectedLead])

  /** The next page of older leads (D10). */
  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const response = await fetchLeads({ includeConverted, limit: LEADS_PAGE, cursor: nextCursor })
      setLeads((current) => appendLeads(current, response.leads))
      setNextCursor(response.nextCursor)
      L(`[LEADS_PANEL:163] load more added=${response.leads.length} more=${Boolean(response.nextCursor)}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load more Leads.')
    } finally {
      setLoadingMore(false)
    }
  }

  function selectDirectoryRow(row: KRLeadContact): void {
    setError('')
    if (row.lead) {
      setSelectedLeadId(row.lead.id)
      return
    }
    if (!row.contact) return
    setSelectedLeadId(null)
    if (!rights.canCreate) {
      setStatus('Your role can view Individuals but cannot create Leads.')
      return
    }
    if (row.contact.isClient) {
      setStatus(`${row.contact.displayName} is already a Client and is not available as a Lead.`)
      return
    }
    setCreatePromptContact(row.contact)
  }

  /** Opens the lightweight Create Lead dialog for a new Individual. */
  function openCreateLead(): void {
    setError('')
    setStatus('Create a Lead for an Individual, or select an existing Individual from the directory.')
    setActiveFilter('individuals')
    setCreateContact(null)
    setCreateLeadOpen(true)
  }

  async function handleLeadCreated(saved: { lead: Lead; created: boolean }): Promise<void> {
    setLeads((current) => upsertLead(current, saved.lead))
    setSelectedLeadId(saved.lead.id)
    setActiveFilter('leads')
    setStatus(createdLeadMessage(saved))
    // A new person was added to the contacts: the data store learns of it.
    if (saved.created) void dataStore?.refresh()
  }

  async function saveLead(): Promise<void> {
    if (!selectedLead || !draft) return
    setSaving(true)
    setError('')
    try {
      const saved = await updateLead(selectedLead.id, { status: draft.status, urgency: draft.urgency, summary: draft.summary.trim() || null, practiceArea: draft.matterType.trim() || null, assignedToUserId: draft.assignedToUserId || null })
      setLeads((current) => upsertLead(current, saved.lead))
      setStatus(`Saved ${leadNumber(saved.lead)}.`)
      setEditOpen(false)
    } catch (caughtError) {
      L(`[LEADS_PANEL:220] save failed leadId=${selectedLead.id} error=${caughtError instanceof Error ? caughtError.message : 'unknown'}`)
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save the Lead.')
    } finally {
      setSaving(false)
    }
  }

  async function convertSelectedLead(clientNumber: string): Promise<void> {
    if (!selectedLead) return
    setConverting(true)
    setConvertError('')
    try {
      L(`[LEADS_PANEL:232] convert start leadId=${selectedLead.id} numberGiven=${Boolean(clientNumber)}`)
      const data = await convertLead(selectedLead.id, clientNumber ? { clientNumber } : {})
      L(`[LEADS_PANEL:234] convert done leadId=${selectedLead.id} client=${data.clientNumber} moved=${data.movedWorkstreamEntries}`)
      if (includeConverted) setLeads((current) => upsertLead(current, data.lead))
      else {
        setLeads((current) => current.filter((lead) => lead.id !== data.lead.id))
        setSelectedLeadId(null)
      }
      const message = conversionMessage(data)
      setConvertedPerson({ individualId: data.lead.individualId, clientId: data.clientId, clientNumber: data.clientNumber, message })
      setConvertOpen(false)
      setError('')
      setStatus(message)
      void dataStore?.refresh()
    } catch (caughtError) {
      setConvertError(caughtError instanceof Error ? caughtError.message : 'The lead could not be converted.')
    } finally {
      setConverting(false)
    }
  }

  /** Opens a person in Clients & Contacts, as a client when it just became one (the store may not know yet). */
  function openPerson(individualId: string, client?: { clientId: string; clientNumber: string }): void {
    const contact = contactById.get(individualId)
    if (!contact) {
      setError('That person is not in the contact list yet. Wait for the contacts to update, then try again.')
      return
    }
    openContact(navigation, client ? { ...contact, isClient: true, clientId: client.clientId, clientNumber: client.clientNumber } : contact)
  }

  const detail = selectedLead ? (
    <LeadDetailCard
      canCreate={rights.canCreate}
      canWrite={rights.canWrite}
      lead={selectedLead}
      onConvert={() => { setConvertError(''); setConvertOpen(true) }}
      onEdit={() => setEditOpen(true)}
      onNoteSaved={setStatus}
      onOpenContact={selectedContact ? () => openPerson(selectedLead.individualId, selectedLead.convertedClientId && selectedLead.convertedClientNumber ? { clientId: selectedLead.convertedClientId, clientNumber: selectedLead.convertedClientNumber } : undefined) : undefined}
    />
  ) : null

  return (
    <section aria-label="Leads" className={LAYOUT_STYLES.panel} data-kr-id="LeadsPanel">
      {/* Leads heading: the title and filters remain stable while the body swaps between directory and active Lead states. */}
      <KRModuleHero
        data_kr_id="LeadsPanel-hero"
        description={activeLead ? 'Selected Lead follow-up workspace.' : 'Search Individuals and existing Leads. Entities are excluded because a Lead must belong to an Individual.'}
        eyebrow="Leads"
        stats={activeLead ? [] : [
          { id: 'individuals', label: 'Individuals', value: individualRows.length, active: activeFilter === 'individuals', ariaLabel: 'Show Individuals', onClick: () => setActiveFilter('individuals') },
          { id: 'leads', label: 'Leads', value: leadRows.length, active: activeFilter === 'leads', ariaLabel: 'Show Leads', onClick: () => setActiveFilter('leads') },
        ]}
        title={selectedLead ? `Lead review and follow-up: [${leadNumber(selectedLead)}] ${selectedLead.displayName}` : 'Lead directory'}
      />

      {selectedLead && detail ? (
        /* Active Lead workspace: hide directory search and show only the selected Lead follow-up menu. */
        <div className={LAYOUT_STYLES.activeWorkspace} data-kr-element="active-lead-workspace">
          <div className={LAYOUT_STYLES.backRow}>
            <button className={STYLES.button} data-kr-action="back-to-lead-directory" onClick={() => setSelectedLeadId(null)} type="button"><KRHomebaseIcons.Chevron className={STYLES.backIcon} />Lead directory</button>
          </div>
          <LeadDetailWorkspace
            canMaintain={capabilities.canMaintain}
            contact={selectedContact}
            detail={detail}
            lead={selectedLead}
            viewer={viewer}
            onResolved={() => { setSelectedLeadId(null); void dataStore?.refresh() }}
          />
        </div>
      ) : (
        /* Lead directory workspace: full-width table and five-result search are the only working surface. */
        <div className={LAYOUT_STYLES.directory} data-kr-element="lead-directory-workspace">
          <div className={LAYOUT_STYLES.searchRow} data-kr-element="lead-directory-search-row">
            <LeadSearch onSelect={selectDirectoryRow} rows={visibleRows} />
            <label className={`${LAYOUT_STYLES.converted} ${STYLES.checkLabel}`} title="Also list leads that became clients.">
              <input checked={includeConverted} disabled={loading} onChange={(event) => setIncludeConverted(event.target.checked)} type="checkbox" />
              Show converted
            </label>
          </div>
          {loading ? <RainbowBusySpinner busy label="Loading leads..." size={16} /> : null}
          <LeadLedger canAddLead={rights.canCreate} filter={activeFilter} key={activeFilter} onAddLead={openCreateLead} onSelectRow={selectDirectoryRow} rows={visibleRows} selectedRowId={selectedLeadId} />
          {/* Paging (D10): older leads are loaded on request, with a line while more exist. */}
          {nextCursor ? (
            <div className={LAYOUT_STYLES.moreRow} data-kr-element="lead-directory-more">
              <button className={STYLES.button} disabled={loadingMore} onClick={() => void loadMore()} type="button">Load more leads</button>
              <span className={STYLES.status}>{moreLeadsLine(leads.length, true)}</span>
              {loadingMore ? <RainbowBusySpinner busy size={14} /> : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Leads status region: feedback remains outside the mutually exclusive workspaces. */}
      {status || error ? <div className={LAYOUT_STYLES.statusRegion} data-kr-element="leads-status-region">
        {status ? (
          <div className={LAYOUT_STYLES.statusLine}>
            <p className={`${LAYOUT_STYLES.text} ${STYLES.status}`} role="status">{status}</p>
            {/* Open client: offered only beside the conversion sentence. */}
            {convertedPerson && convertedPerson.message === status ? <button className={STYLES.button} onClick={() => openPerson(convertedPerson.individualId, convertedPerson)} type="button"><KRHomebaseIcons.ExternalLink className={STYLES.icon} />Open client</button> : null}
          </div>
        ) : null}
        {error ? <p className={`${LAYOUT_STYLES.text} ${STYLES.error}`} role="alert">{error}</p> : null}
      </div> : null}
      <LeadCreateDialog
        contact={createContact}
        onClose={() => { setCreateContact(null); setCreateLeadOpen(false) }}
        onCreated={handleLeadCreated}
        onSelectExistingLead={(lead) => { setCreateContact(null); setCreateLeadOpen(false); setSelectedLeadId(lead.id) }}
        open={createLeadOpen}
        potentialLeads={leadRows}
      />
      {draft && selectedLead && editOpen ? <LeadEditCard draft={draft} error={error} lead={selectedLead} onClose={() => setEditOpen(false)} onDraftChange={setDraft} onSave={() => void saveLead()} saving={saving} /> : null}
      <LeadIndividualConfirmDialog
        contact={createPromptContact}
        onCancel={() => setCreatePromptContact(null)}
        onConfirm={() => {
          if (!createPromptContact) return
          setCreateContact(createPromptContact)
          setCreateLeadOpen(true)
          setCreatePromptContact(null)
        }}
        open={Boolean(createPromptContact)}
      />
      <LeadConvertDialog busy={converting} error={convertError} lead={selectedLead} open={convertOpen && Boolean(selectedLead)} onCancel={() => setConvertOpen(false)} onConfirm={(clientNumber) => void convertSelectedLead(clientNumber)} />
    </section>
  )
}
