'use client'
// file: apps/web/features/code-links/CodeLinkHost.client.tsx
/**
 * The one listener for followed codes (web patch 571, "Following a code"; `components/ui/codeLinks.ts`). Drawn once
 * inside the frame (`ApplicationShell`'s `overlays`, from `app/page.tsx`), so every `KRCodeLink`, in the workspace or a
 * pop-out, opens its target the same way:
 *
 *  - `workstream` (a WSID): the entry's dialog over the screen (`WorkstreamEntryLoader`).
 *  - `task` (a task id): the task's card in a dialog, with Edit (`TaskCodeDialog`).
 *  - `client` (a client account id or client number): the client's contact in Clients & Contacts.
 *  - `matter` (a matter id, with its client): that contact at Projects & Matters with the matter selected.
 *  - `lead` (an LCID or lead id): Leads, with that lead open (`?lead=`).
 *  - `contact` (an ICID for an individual, an ECID for an entity, or a contact id): the contact in Clients & Contacts.
 *
 * Contacts, clients and matters are found in the browser's data store (the contact list every screen shares), by id or
 * by their short code in any case; leads, tasks and entries are read from the API by their code. A code that finds
 * nothing says so in a small dialog. A web-only area: it owns no API routes and no contract of its own.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShellNavigation } from '@/components/shell/shellNavigation'
import { onKRCodeOpen, type KRCodeTarget } from '@/components/ui/codeLinks'
import WorkstreamEntryLoader from '@/features/communications/components/WorkstreamEntryLoader.client'
import type { CommunicationsViewer } from '@/features/communications/communicationTypes'
import { requestContactView } from '@/features/contacts/contactViewRequests'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import { openContact } from '@/features/contacts/openContact'
import type { KRContactRecord } from '@/features/contacts/types'
import TaskCodeDialog from '@/features/tasks/components/TaskCodeDialog.client'
import { L } from '@/lib/KRUtilities'

/** Roles that may not change tasks (the API refuses them too). */
const READ_ONLY_ROLES = ['client', 'external_cpa']

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-[rgba(15,30,48,0.48)]',
  notice: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_12px_36px_rgba(0,0,0,0.35)]',
  text: 'm-0 text-[12px] leading-[1.35]',
  close: 'min-h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[800] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active)',
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
  backdrop: 'p-[10px] fixed inset-0 z-[1100] grid place-items-center',
  notice: 'p-[10px] gap-[8px] grid w-[min(360px,100%)]',
  actions: 'flex justify-end',
  close: 'px-[8px] py-[2px]',
} as const

const NO_CONTACTS: readonly KRContactRecord[] = []

/** The contact a client account id or client number names (its own contact first). */
export function contactForClientCode(contacts: readonly KRContactRecord[], code: string): KRContactRecord | null {
  const wanted = code.trim().toUpperCase()
  const matches = contacts.filter((contact) => (contact.clientId ?? '').toUpperCase() === wanted || (contact.isClient && (contact.clientNumber ?? '').toUpperCase() === wanted))
  return matches.find((contact) => contact.isClient) ?? matches[0] ?? null
}

/** The contact an ICID (individual), an ECID (entity) or a contact id names, in any case. */
export function contactForContactCode(contacts: readonly KRContactRecord[], code: string): KRContactRecord | null {
  const wanted = code.trim().toUpperCase()
  return contacts.find((contact) => contact.id.toUpperCase() === wanted || (contact.icid ?? '').toUpperCase() === wanted || (contact.ecid ?? '').toUpperCase() === wanted) ?? null
}

/** Listens for followed codes and opens each one's target. */
export default function CodeLinkHost({ viewer = null }: { viewer?: CommunicationsViewer | null }) {
  const navigation = useShellNavigation()
  const contacts = useOptionalDataStore()?.contacts ?? NO_CONTACTS
  const [dialog, setDialog] = useState<KRCodeTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(
    () =>
      onKRCodeOpen((target) => {
        L(`[CODE_LINKS:82] open kind=${target.kind} code=${target.code}`)
        setNotice(null)
        if (target.kind === 'workstream' || target.kind === 'task') {
          setDialog(target)
          return
        }
        if (target.kind === 'lead') {
          if (!navigation.openSection('leads', target.code)) setNotice(`Lead ${target.code} could not be opened here.`)
          return
        }
        const contact = target.kind === 'contact' ? contactForContactCode(contacts, target.code) : contactForClientCode(contacts, target.kind === 'matter' ? (target.clientId ?? '') : target.code)
        if (!contact) {
          setNotice(contacts.length ? `No contact with the code ${target.kind === 'matter' ? (target.clientId ?? target.code) : target.code} is in the contact list.` : 'The contact list is still loading. Try again in a moment.')
          return
        }
        if (target.kind === 'matter') requestContactView({ contactId: contact.id, tab: 'projects-matters', matterId: target.code })
        openContact(navigation, contact)
      }),
    [contacts, navigation],
  )

  return (
    <>
      {dialog?.kind === 'workstream' ? (
        <WorkstreamEntryLoader
          key={dialog.code}
          viewerRole={viewer?.role ?? null}
          wsid={dialog.code}
          onClose={() => setDialog(null)}
          onFailed={(message) => {
            setDialog(null)
            setNotice(message)
          }}
        />
      ) : null}
      {dialog?.kind === 'task' ? (
        <TaskCodeDialog
          key={dialog.code}
          canWrite={!READ_ONLY_ROLES.includes(viewer?.role ?? '')}
          taskId={dialog.code}
          onClose={() => setDialog(null)}
          onFailed={(message) => {
            setDialog(null)
            setNotice(message)
          }}
        />
      ) : null}
      {/* A code that found nothing: said in a small dialog with Close. */}
      {notice && typeof document !== 'undefined'
        ? createPortal(
            <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" onMouseDown={(event) => event.target === event.currentTarget && setNotice(null)}>
              <section aria-label="Code not found" aria-modal="true" className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-element="code-link-notice" role="alertdialog">
                <p className={STYLES.text}>{notice}</p>
                <div className={LAYOUT_STYLES.actions}>
                  <button autoFocus className={`${LAYOUT_STYLES.close} ${STYLES.close}`} type="button" onClick={() => setNotice(null)}>
                    Close
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
