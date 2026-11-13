// file: apps/web/features/communications/communicationActivityTypeTriggers.ts
/**
 * Natural-language and slash-command triggers that select the composer's activity type buttons.
 *
 * Ported unchanged from the old `hb-components/KR-Communications/CommunicationActivityTypeTriggers.ts` (rules, order,
 * patterns and hints). Only the import path of the activity type changed (`communicationTypes.ts`).
 */

import type { WorkstreamCommunicationActivityType } from './communicationTypes'

/** Describes one natural-language trigger for selecting a composer activity type. */
export interface CommunicationActivityTypeTriggerRule {
  id: string
  activityType: WorkstreamCommunicationActivityType
  triggerWords: readonly string[]
  pattern: RegExp
}

/** Escapes a readable trigger word before it becomes part of a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a case-insensitive boundary-aware pattern from readable trigger words.
 * Multi-word phrases accept flexible whitespace, so "phone   call" also matches.
 */
export function buildCommunicationActivityTriggerPattern(triggerWords: readonly string[]): RegExp {
  const alternatives = [...new Set(triggerWords.map((word) => word.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map((word) => word.split(/\s+/).map(escapeRegExp).join('\\s+'))
  if (!alternatives.length) return /$^/
  return new RegExp(`(?:^|[^A-Za-z0-9_])(?:${alternatives.join('|')})(?![A-Za-z0-9_])`, 'i')
}

/**
 * Builds a natural-language prefix pattern that only matches when the typed
 * word is followed by whitespace. This keeps short prefixes such as WIP from
 * selecting an activity before the user has finished the word.
 */
export function buildCommunicationActivityWhitespacePrefixPattern(triggerWords: readonly string[]): RegExp {
  const alternatives = [...new Set(triggerWords.map((word) => word.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
  if (!alternatives.length) return /$^/
  return new RegExp(`(?:^|[^A-Za-z0-9_])(?:${alternatives.join('|')})(?=\\s)`, 'i')
}

/** Builds a command pattern for explicit slash shortcuts such as /pc. */
export function buildCommunicationActivityCommandPattern(triggerWords: readonly string[]): RegExp {
  const alternatives = [...new Set(triggerWords.map((word) => word.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
  if (!alternatives.length) return /$^/
  return new RegExp(`(?:^|\\s)\\/(?:${alternatives.join('|')})(?![A-Za-z0-9_])`, 'i')
}

/** Creates a trigger rule while keeping its editable definition human-readable. */
function createCommunicationActivityTypeTrigger(
  definition: Omit<CommunicationActivityTypeTriggerRule, 'pattern'>,
  patternBuilder: (triggerWords: readonly string[]) => RegExp = buildCommunicationActivityTriggerPattern,
): CommunicationActivityTypeTriggerRule {
  return {
    ...definition,
    pattern: patternBuilder(definition.triggerWords),
  }
}

/** Natural-language terms and explicit shortcuts that select the activity buttons. */
export const COMMUNICATION_ACTIVITY_TYPE_TRIGGER_RULES: readonly CommunicationActivityTypeTriggerRule[] = [
  createCommunicationActivityTypeTrigger({
    id: 'phone-call-command',
    activityType: 'PhoneCalls',
    triggerWords: ['pc', 'phonecall'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'phone-call-words',
    activityType: 'PhoneCalls',
    triggerWords: ['phone call', 'phonecall', 'phone', 'call', 'phoned'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'email-command',
    activityType: 'Emails',
    triggerWords: ['email'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'email-word',
    activityType: 'Emails',
    triggerWords: ['email'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'note-command',
    activityType: 'Notes',
    triggerWords: ['n', 'note'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'note-words',
    activityType: 'Notes',
    triggerWords: ['note in file'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'task-command',
    activityType: 'Tasks',
    triggerWords: ['t', 'task'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'task-words',
    activityType: 'Tasks',
    triggerWords: ['task', 'todo'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'received-files-command',
    activityType: 'ReceivedFiles',
    triggerWords: ['received'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'received-files-words',
    activityType: 'ReceivedFiles',
    triggerWords: ['received documents', 'received docs', 'received doc', 'scanned doc'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'sent-files-command',
    activityType: 'SentFiles',
    triggerWords: ['sent'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'sent-files-words',
    activityType: 'SentFiles',
    triggerWords: ['sent documents', 'sent docs', 'sent doc', 'sent files', 'sent file'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'wip-command',
    activityType: 'WIP',
    triggerWords: ['wip'],
  }, buildCommunicationActivityCommandPattern),
  createCommunicationActivityTypeTrigger({
    id: 'wip-words',
    activityType: 'WIP',
    triggerWords: ['wip note', 'status update', 'status:'],
  }),
  createCommunicationActivityTypeTrigger({
    id: 'wip-whitespace-prefix',
    activityType: 'WIP',
    triggerWords: ['wip'],
  }, buildCommunicationActivityWhitespacePrefixPattern),
]

/** Hover guidance for the explicit slash code associated with each Log as button. */
export const COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS: Record<WorkstreamCommunicationActivityType, string> = {
  PhoneCalls: 'Phone Call · /pc or /phonecall',
  Emails: 'Email · /email',
  Notes: 'Note · /n or /note; natural phrase: note in file',
  Tasks: 'Task · /t or /task; natural words: task or todo',
  ReceivedFiles: 'Received files · /received; natural phrases: received doc or scanned doc',
  SentFiles: 'Sent files · /sent; natural phrases: sent doc or sent file',
  WIP: 'Work in progress · /wip; natural phrases: WIP, status update, or status:',
}

/** Finds the first configured activity trigger in a communication draft. */
export function detectCommunicationActivityTypeTrigger(text: string): CommunicationActivityTypeTriggerRule | null {
  return COMMUNICATION_ACTIVITY_TYPE_TRIGGER_RULES.find((rule) => rule.pattern.test(text)) ?? null
}
