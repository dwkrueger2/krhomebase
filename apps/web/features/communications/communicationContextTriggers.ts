// file: apps/web/features/communications/communicationContextTriggers.ts
/**
 * Context cues in a draft ("Client:", "Lead -", "Phone Call From", `/c306`) that open a record lookup.
 *
 * Ported unchanged from the old `hb-components/KR-Communications/CommunicationContextTriggers.ts`.
 */

/** The context entity implied by a quick-entry cue in a draft. */
export type CommunicationContextCueKind = 'client' | 'lead' | 'phone-call-from'

/** A recognized context cue; the original draft remains unchanged until lookup is accepted. */
export interface CommunicationContextCueMatch {
  kind: CommunicationContextCueKind
  label: string
  prefix: string
  query: string
  referenceNumber: string | null
}

interface CommunicationContextCueDefinition {
  kind: CommunicationContextCueKind
  label: string
  pattern: RegExp
}

const CONTEXT_CUE_DEFINITIONS: readonly CommunicationContextCueDefinition[] = [
  { kind: 'client', label: 'Client', pattern: /(?:^|\s)client\s*[:\-]\s*([^\n]*)$/i },
  { kind: 'lead', label: 'Lead', pattern: /(?:^|\s)lead\s*[:\-]\s*([^\n]*)$/i },
  { kind: 'phone-call-from', label: 'Phone Call From', pattern: /(?:^|\s)phone\s+call\s+from\s*[:\-]?\s*([^\n]*)$/i },
]

/**
 * Recognizes explicit client shortcuts and human-readable context prefixes.
 * This is deliberately a detector only: it never rewrites the user's draft.
 */
export function detectCommunicationContextCue(text: string): CommunicationContextCueMatch | null {
  const possibleMatches: Array<{ index: number; cue: CommunicationContextCueMatch }> = []
  // Keep a numeric client tag active only while it is the current trailing token.
  // Once a space is followed by another character, the user has resumed normal
  // drafting and a later cue (if any) should become the active lookup target.
  const clientReferencePattern = /(?:^|\s)\/c(\d+)\b(?=\s*$)/gi
  for (const clientReference of text.matchAll(clientReferencePattern)) {
    possibleMatches.push({
      index: clientReference.index ?? 0,
      cue: {
        kind: 'client',
        label: 'Client',
        prefix: clientReference[0].trim(),
        query: clientReference[1]!,
        referenceNumber: clientReference[1]!,
      },
    })
  }

  for (const definition of CONTEXT_CUE_DEFINITIONS) {
    const match = text.match(definition.pattern)
    if (!match) continue
    const prefix = match[0].slice(0, match[0].length - match[1]!.length).trimEnd()
    possibleMatches.push({
      index: match.index ?? 0,
      cue: {
        kind: definition.kind,
        label: definition.label,
        prefix,
        query: match[1]!.trim(),
        referenceNumber: null,
      },
    })
  }

  return possibleMatches.sort((left, right) => right.index - left.index)[0]?.cue ?? null
}
