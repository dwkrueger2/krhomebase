// file: apps/web/components/dev-view/devViewRemote.ts
/**
 * The channel between Dev View and a remote button in another window (the requester, Nov 13, 2026: "I'd rather have
 * that Dev View button pop up the overlays on the source window").
 *
 * A pop-out drawn by the main window (the Feedback pop-out) can show a Dev View button that drives the **main**
 * window's Dev View instead of inspecting itself (`DevViewRemote.client.tsx`, placed through `DevViewLoader` with
 * `controlWindow`). The button and Dev View talk through two DOM events on the controlled window:
 *
 *   kr-dev-view:command   { action: 'toggle' }   the remote asks Dev View to do what its own button does
 *                         { action: 'report' }   the remote asks Dev View to say whether it is on
 *   kr-dev-view:state     { enabled }            Dev View says whether it is on (after every change and on 'report')
 *
 * Events, not imports, so the remote button and Dev View share no state and either can be absent: with no Dev View in
 * the controlled window the command is simply not heard. Both sides load only in development (`DevViewLoader`).
 */

/** The remote asks Dev View to act. */
export const DEV_VIEW_COMMAND_EVENT = 'kr-dev-view:command'
/** Dev View says whether it is on. */
export const DEV_VIEW_STATE_EVENT = 'kr-dev-view:state'

export interface DevViewCommand {
  action: 'toggle' | 'report'
}

export interface DevViewState {
  enabled: boolean
}

/** Sends a command to the Dev View of `target`. */
export function sendDevViewCommand(target: Window, command: DevViewCommand): void {
  target.dispatchEvent(new (target as Window & typeof globalThis).CustomEvent<DevViewCommand>(DEV_VIEW_COMMAND_EVENT, { detail: command }))
}

/** Announces this Dev View's state on its own window. */
export function announceDevViewState(target: Window, state: DevViewState): void {
  target.dispatchEvent(new (target as Window & typeof globalThis).CustomEvent<DevViewState>(DEV_VIEW_STATE_EVENT, { detail: state }))
}

/** Reads a command event; anything malformed reads as null. */
export function readDevViewCommand(event: Event): DevViewCommand | null {
  const detail = (event as CustomEvent<unknown>).detail as Partial<DevViewCommand> | null | undefined
  return detail && (detail.action === 'toggle' || detail.action === 'report') ? { action: detail.action } : null
}

/** Reads a state event; anything malformed reads as null. */
export function readDevViewState(event: Event): DevViewState | null {
  const detail = (event as CustomEvent<unknown>).detail as Partial<DevViewState> | null | undefined
  return detail && typeof detail.enabled === 'boolean' ? { enabled: detail.enabled } : null
}
