// file: apps/web/components/dev-view/devViewRemote.test.ts
/**
 * The channel between Dev View and a remote Dev View button in another window (Nov 13, 2026): a command sent to a
 * window reaches a listener there, a state announcement reaches a remote button, and malformed events read as null.
 * Node's own `EventTarget` and `CustomEvent` stand in for the browser window.
 *
 * Run: pnpm --dir apps/web exec vitest run components/dev-view/devViewRemote.test.ts
 */

import { describe, expect, it } from 'vitest'
import { announceDevViewState, DEV_VIEW_COMMAND_EVENT, DEV_VIEW_STATE_EVENT, readDevViewCommand, readDevViewState, sendDevViewCommand } from './devViewRemote'

/** A stand-in window: an event target that also carries `CustomEvent`, as a browser window does. */
const fakeWindow = () => Object.assign(new EventTarget(), { CustomEvent }) as unknown as Window

describe('devViewRemote', () => {
  it('delivers a command to the controlled window', () => {
    const target = fakeWindow()
    const heard: unknown[] = []
    target.addEventListener(DEV_VIEW_COMMAND_EVENT, (event) => heard.push(readDevViewCommand(event)))
    sendDevViewCommand(target, { action: 'toggle' })
    sendDevViewCommand(target, { action: 'report' })
    expect(heard).toEqual([{ action: 'toggle' }, { action: 'report' }])
  })

  it('delivers the state to a remote button', () => {
    const target = fakeWindow()
    const heard: unknown[] = []
    target.addEventListener(DEV_VIEW_STATE_EVENT, (event) => heard.push(readDevViewState(event)))
    announceDevViewState(target, { enabled: true })
    expect(heard).toEqual([{ enabled: true }])
  })

  it('reads malformed events as null', () => {
    expect(readDevViewCommand(new CustomEvent(DEV_VIEW_COMMAND_EVENT, { detail: { action: 'explode' } }))).toBeNull()
    expect(readDevViewCommand(new Event(DEV_VIEW_COMMAND_EVENT))).toBeNull()
    expect(readDevViewState(new CustomEvent(DEV_VIEW_STATE_EVENT, { detail: { enabled: 'yes' } }))).toBeNull()
  })
})
