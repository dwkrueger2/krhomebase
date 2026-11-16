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
 *                         { action: 'pick' }     the remote asks for one element (stage F4, Pick into the text): Dev
 *                                                View turns on Pick (the overlays stay as they are); the next pick is
 *                                                sent back as 'picked'
 *                         { action: 'off' }      the remote closed (the Feedback pop-out): switch everything off
 *                         { action: 'toggle', panelWindow }   as toggle, with the panel window the remote already
 *                                                opened in its own click (the main window's click would be blocked)
 *   kr-dev-view:state     { enabled }            Dev View says whether it is on (after every change and on 'report')
 *   kr-dev-view:picked    { label }              Dev View says which marker was picked for the remote
 *                                                (`data-kr-element="related-contacts-list"`)
 *
 * Events, not imports, so the remote button and Dev View share no state and either can be absent: with no Dev View in
 * the controlled window the command is simply not heard. Both sides load only where Dev View is allowed
 * (`DevViewLoader`, `devViewAccess.ts`: development, or an Internal Developer in the deployed app).
 */

/** The remote asks Dev View to act. */
export const DEV_VIEW_COMMAND_EVENT = 'kr-dev-view:command'
/** Dev View says whether it is on. */
export const DEV_VIEW_STATE_EVENT = 'kr-dev-view:state'
/** Dev View says which marker was picked for the remote (stage F4). */
export const DEV_VIEW_PICKED_EVENT = 'kr-dev-view:picked'

export interface DevViewCommand {
  action: 'toggle' | 'report' | 'pick' | 'off'
  /** With 'toggle' from a remote: the panel window it opened in its own click, or null when the browser blocked it. */
  panelWindow?: Window | null
}

export interface DevViewPicked {
  /** The picked element's first marker, written as in the page: `data-kr-element="related-contacts-list"`. */
  label: string
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
  if (!detail || !(detail.action === 'toggle' || detail.action === 'report' || detail.action === 'pick' || detail.action === 'off')) return null
  const panelWindow = detail.panelWindow && typeof detail.panelWindow === 'object' && 'document' in detail.panelWindow ? detail.panelWindow : null
  return detail.action === 'toggle' && 'panelWindow' in detail ? { action: 'toggle', panelWindow } : { action: detail.action }
}

/** Reads a state event; anything malformed reads as null. */
export function readDevViewState(event: Event): DevViewState | null {
  const detail = (event as CustomEvent<unknown>).detail as Partial<DevViewState> | null | undefined
  return detail && typeof detail.enabled === 'boolean' ? { enabled: detail.enabled } : null
}

/** Sends the picked marker back to the remote, on the controlled window. */
export function announceDevViewPicked(target: Window, picked: DevViewPicked): void {
  target.dispatchEvent(new (target as Window & typeof globalThis).CustomEvent<DevViewPicked>(DEV_VIEW_PICKED_EVENT, { detail: picked }))
}

/** Reads a picked event; anything malformed (or not a marker label) reads as null. */
export function readDevViewPicked(event: Event): DevViewPicked | null {
  const detail = (event as CustomEvent<unknown>).detail as Partial<DevViewPicked> | null | undefined
  return detail && typeof detail.label === 'string' && /^data-kr-[a-z0-9-]+="[^"]+"$/.test(detail.label) ? { label: detail.label } : null
}
