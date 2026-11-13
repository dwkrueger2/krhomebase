'use client'
// file: apps/web/features/communications/components/CommunicationActivityIcon.client.tsx
/**
 * The activity type's icon and its color treatment, shared by the thread filters (`CommunicationActivityFilters`),
 * the composer's "Log as" buttons (`WorkStreamEntrySelector`) and the parser pills (`CommunicationComposer`).
 *
 * New in this repository. The old components each repeated the same seven color pairs as literal hex classes and drew
 * the type as a text glyph (☎ ✉ ▤ ✓ ⇩ ⇧ ◌). The colors now come from the panel's custom properties
 * (`Communications.module.css`) and the glyphs are `KRHomebaseIcons` SVGs (apps/web/AGENTS.md, "Icons live in one
 * place"). One shared map is clearer than three copies (AGENTS_05, "Component style maps", rule 9).
 */

import type { ReactElement } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import type { CommunicationActivityIconName, WorkstreamCommunicationActivityType } from '../communicationTypes'

/**
 * Color treatment per activity type: `idle` (outlined, the type's color on the dark surface) and `active` (filled).
 * "all" is the All activity filter.
 */
export const ACTIVITY_TYPE_STYLES: Record<'all' | WorkstreamCommunicationActivityType, { idle: string; active: string }> = {
  all: {
    idle: 'border-(--kr-theme-communication-line) bg-transparent text-(color:--kr-theme-communication-text-muted) hover:border-(--CommunicationAllLine) hover:bg-(--CommunicationAllFill)',
    active: 'border-(--CommunicationAllLine) bg-(--CommunicationAllFill) text-(color:--CommunicationAllText)',
  },
  PhoneCalls: {
    idle: 'border-(--CommunicationPhoneCallsLine) bg-transparent text-(color:--CommunicationPhoneCallsText) hover:bg-(--CommunicationPhoneCallsFill)',
    active: 'border-(--CommunicationPhoneCallsLine) bg-(--CommunicationPhoneCallsFill) text-(color:--CommunicationPhoneCallsText)',
  },
  Emails: {
    idle: 'border-(--CommunicationEmailsLine) bg-transparent text-(color:--CommunicationEmailsText) hover:bg-(--CommunicationEmailsFill)',
    active: 'border-(--CommunicationEmailsLine) bg-(--CommunicationEmailsFill) text-(color:--CommunicationEmailsText)',
  },
  Notes: {
    idle: 'border-(--CommunicationNotesLine) bg-transparent text-(color:--CommunicationNotesText) hover:bg-(--CommunicationNotesFill)',
    active: 'border-(--CommunicationNotesLine) bg-(--CommunicationNotesFill) text-(color:--CommunicationNotesText)',
  },
  Tasks: {
    idle: 'border-(--CommunicationTasksLine) bg-transparent text-(color:--CommunicationTasksText) hover:bg-(--CommunicationTasksFill)',
    active: 'border-(--CommunicationTasksLine) bg-(--CommunicationTasksFill) text-(color:--CommunicationTasksText)',
  },
  ReceivedFiles: {
    idle: 'border-(--CommunicationReceivedFilesLine) bg-transparent text-(color:--CommunicationReceivedFilesText) hover:bg-(--CommunicationReceivedFilesFill)',
    active: 'border-(--CommunicationReceivedFilesLine) bg-(--CommunicationReceivedFilesFill) text-(color:--CommunicationReceivedFilesText)',
  },
  SentFiles: {
    idle: 'border-(--CommunicationSentFilesLine) bg-transparent text-(color:--CommunicationSentFilesText) hover:bg-(--CommunicationSentFilesFill)',
    active: 'border-(--CommunicationSentFilesLine) bg-(--CommunicationSentFilesFill) text-(color:--CommunicationSentFilesText)',
  },
  WIP: {
    idle: 'border-(--CommunicationWipLine) bg-transparent text-(color:--CommunicationWipText) hover:bg-(--CommunicationWipFill)',
    active: 'border-(--CommunicationWipLine) bg-(--CommunicationWipFill) text-(color:--CommunicationWipText)',
  },
}

const ICONS: Record<CommunicationActivityIconName, (props: { className?: string }) => ReactElement> = {
  phone: KRHomebaseIcons.Phone,
  mail: KRHomebaseIcons.Mail,
  note: KRHomebaseIcons.Note,
  check: KRHomebaseIcons.Check,
  download: KRHomebaseIcons.Download,
  upload: KRHomebaseIcons.Upload,
  progress: KRHomebaseIcons.Progress,
}

const STYLES = {
  icon: 'inline-block h-[12px] w-[12px] shrink-0 align-[-2px]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Draws one activity type's icon at 12px in the current text color. Decorative: the button beside it carries the label.
 *
 * @param props.name - The option's icon name from `WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS`.
 * @param props.className - Extra classes (spacing) from the caller.
 */
export default function CommunicationActivityIcon({ className = '', name }: { name: CommunicationActivityIconName; className?: string }) {
  const Icon = ICONS[name]
  return <Icon className={`${className} ${STYLES.icon}`} />
}
